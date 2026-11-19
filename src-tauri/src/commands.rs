use crate::db::AppState;
use crate::favicon;
use crate::page_title;
use chrono::{SecondsFormat, Utc};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
use uuid::Uuid;

fn now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn new_id() -> String {
    Uuid::new_v4().to_string()
}

// ---------- Input types (match the JSON the frontend already sends) ----------

#[derive(Deserialize)]
pub struct BookmarkInput {
    title: String,
    url: String,
    #[serde(default)]
    favicon: Option<String>,
    #[serde(default)]
    kind: Option<String>,
    #[serde(default)]
    is_pinned: bool,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    memo: Option<String>,
    #[serde(default)]
    shortcut: Option<String>,
    /// Create only: when the bookmark was first added, for imports that carry
    /// the browser's own date. Ignored unless it is a valid RFC 3339 time.
    #[serde(default)]
    created_at: Option<String>,
}

/// `raw` re-formatted like `now()`, or `None` if it is not an RFC 3339 time.
/// Stored timestamps are compared as strings, so a foreign format must never
/// reach the table.
fn normalize_timestamp(raw: Option<&str>) -> Option<String> {
    let parsed = chrono::DateTime::parse_from_rfc3339(raw?.trim()).ok()?;
    Some(
        parsed
            .with_timezone(&Utc)
            .to_rfc3339_opts(SecondsFormat::Millis, true),
    )
}

#[derive(Deserialize)]
pub struct OrderItem {
    id: String,
    custom_order: i64,
}

#[derive(Deserialize)]
pub struct TagOrderItem {
    id: String,
    sort_order: i64,
}

#[derive(Deserialize)]
pub struct SettingsInput {
    list_columns: i64,
    sort_option: String,
    sort_order: String,
    summon_shortcut: String,
    // Optional so that callers which predate the shortcut folder — the
    // extension's settings write, an older frontend bundle — leave the stored
    // values alone instead of resetting them.
    #[serde(default)]
    shortcut_dir_enabled: Option<bool>,
    #[serde(default)]
    shortcut_dir_path: Option<String>,
    #[serde(default)]
    folder_search_enabled: Option<bool>,
}

#[derive(Deserialize)]
pub struct TagRuleInput {
    match_type: String,
    pattern: String,
    tag_id: String,
    target_field: String,
}

/// Every bookmark with its tag names under `tags` — what the app window and
/// the JSON backup both use.
fn bookmarks_with_tags(conn: &rusqlite::Connection) -> Result<Vec<Value>, String> {
    Ok(crate::repo::list_bookmarks(conn)?
        .into_iter()
        .map(|(mut obj, tags)| {
            obj["tags"] = Value::Array(tags.into_iter().map(Value::String).collect());
            obj
        })
        .collect())
}

// ---------- Bookmark commands ----------

// `async`: a plain command runs on the main thread, and this one — called each
// time the window comes back — carries every bookmark with its icon, enough to
// stall the window while it is built. Same pattern as `search_in_folders`.
#[tauri::command(async)]
pub fn list_bookmarks(state: State<'_, AppState>) -> Result<Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    Ok(Value::Array(bookmarks_with_tags(&conn)?))
}

#[tauri::command]
pub fn create_bookmark(
    app: AppHandle,
    data: BookmarkInput,
    state: State<AppState>,
) -> Result<Value, String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    let created_at = normalize_timestamp(data.created_at.as_deref());
    let bookmark = crate::repo::NewBookmark {
        kind: data.kind,
        title: data.title,
        url: data.url,
        favicon: data.favicon,
        is_pinned: data.is_pinned,
        memo: data.memo,
        shortcut: data.shortcut,
        tags: data.tags,
    };
    let id = crate::repo::insert_bookmark(&mut conn, &bookmark, created_at.as_deref(), &now())?;

    drop(conn);
    crate::shortcutdir::request_sync(&app);

    Ok(json!({ "id": id }))
}

#[tauri::command]
pub fn update_bookmark(
    app: AppHandle,
    id: String,
    data: BookmarkInput,
    state: State<AppState>,
) -> Result<Value, String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    let ts = now();

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Update core fields. kind and favicon are left unchanged when the request
    // omits them (COALESCE keeps the stored value): the edit form carries
    // neither, and renaming a bookmark must not throw away the icon fetched for
    // it. Nothing in the app clears a favicon through this path — the icon
    // fetch writes the column directly.
    tx.execute(
        "UPDATE bookmarks SET kind = COALESCE(?1, kind), title = ?2, url = ?3, \
         favicon = COALESCE(?4, favicon), is_pinned = ?5, memo = ?6, shortcut = ?7, \
         updated_at = ?8 WHERE id = ?9",
        rusqlite::params![
            data.kind,
            data.title,
            data.url,
            data.favicon,
            data.is_pinned as i64,
            data.memo,
            data.shortcut,
            ts,
            id
        ],
    )
    .map_err(|e| e.to_string())?;

    // Replace tag links.
    tx.execute("DELETE FROM bookmarks_tags WHERE bookmark_id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    crate::repo::link_tags(&tx, &id, &data.tags, &ts)?;

    tx.commit().map_err(|e| e.to_string())?;

    drop(conn);
    crate::shortcutdir::request_sync(&app);

    Ok(json!({ "ok": true }))
}

#[tauri::command]
pub fn delete_bookmark(
    app: AppHandle,
    id: String,
    state: State<AppState>,
) -> Result<Value, String> {
    {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM bookmarks WHERE id = ?1", [&id])
            .map_err(|e| e.to_string())?;
    }
    crate::shortcutdir::request_sync(&app);
    Ok(json!({ "ok": true }))
}

// `async`: writes the safety backup to disk first, off the main thread.
#[tauri::command(async)]
pub fn delete_all_bookmarks(app: AppHandle, state: State<'_, AppState>) -> Result<Value, String> {
    {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        // Nothing is erased unless it could be saved first.
        crate::backup::snapshot(
            &conn,
            &crate::backup::backup_dir(&app)?,
            crate::backup::Reason::BeforeDeleteAll,
        )
        .map_err(|e| format!("Could not save a safety backup, so nothing was deleted: {e}"))?;
        conn.execute("DELETE FROM bookmarks", [])
            .map_err(|e| e.to_string())?;
    }
    crate::shortcutdir::request_sync(&app);
    Ok(json!({ "ok": true }))
}

#[tauri::command]
pub fn toggle_pin(id: String, state: State<AppState>) -> Result<Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let ts = now();
    conn.execute(
        "UPDATE bookmarks SET is_pinned = CASE WHEN is_pinned = 0 THEN 1 ELSE 0 END, updated_at = ?1 WHERE id = ?2",
        rusqlite::params![ts, id],
    )
    .map_err(|e| e.to_string())?;
    let is_pinned: i64 = conn
        .query_row("SELECT is_pinned FROM bookmarks WHERE id = ?1", [&id], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    Ok(json!({ "is_pinned": is_pinned != 0 }))
}

#[tauri::command]
pub fn increment_access(
    app: AppHandle,
    id: String,
    state: State<AppState>,
) -> Result<Value, String> {
    {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        let ts = now();
        conn.execute(
            "UPDATE bookmarks SET access_count = access_count + 1, last_accessed_at = ?1 WHERE id = ?2",
            rusqlite::params![ts, id],
        )
        .map_err(|e| e.to_string())?;
    }

    // Only the shortcut's timestamp can have moved, so this skips the full
    // reconcile that every other mutation asks for.
    crate::shortcutdir::touch(&app, &id);

    Ok(json!({ "ok": true }))
}

#[tauri::command]
pub fn reorder_bookmarks(order: Vec<OrderItem>, state: State<AppState>) -> Result<Value, String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for item in &order {
        tx.execute(
            "UPDATE bookmarks SET custom_order = ?1 WHERE id = ?2",
            rusqlite::params![item.custom_order, item.id],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true }))
}

// ---------- Global shortcut commands ----------

/// Invoked by the global-shortcut plugin's handler on key *press*. The only
/// combo registered globally is the "summon" hotkey; when it fires we bring the
/// window to the front and tell the frontend to focus the search field. Per-
/// bookmark shortcuts are handled in-app (only while focused), not here.
pub fn on_shortcut_pressed(app: &AppHandle, shortcut: &Shortcut) {
    let state = app.state::<AppState>();
    let is_summon = {
        let summon = state.summon_shortcut.lock().unwrap();
        summon.as_deref() == Some(&shortcut.to_string())
    };
    if is_summon {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
        let _ = app.emit("summon", ());
    }
}

/// Register (or re-register) the single global "summon" hotkey from settings:
/// clears any current registration, then registers the stored combo. Returns
/// `failed` carrying the combo when the OS/another app already owns it
/// (Windows `RegisterHotKey` fails) or it fails to parse, so the caller can warn
/// without leaving a stale registration behind.
pub fn sync_summon_inner(app: &AppHandle) -> Result<Value, String> {
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();

    let state = app.state::<AppState>();
    let raw: String = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT summon_shortcut FROM user_settings WHERE id = 1",
            [],
            |r| r.get::<_, String>(0),
        )
        .map_err(|e| e.to_string())?
    };

    let mut failed: Vec<String> = Vec::new();
    let mut active: Option<String> = None;

    if !raw.is_empty() {
        match raw.parse::<Shortcut>() {
            Ok(shortcut) => {
                let canonical = shortcut.to_string();
                if gs.register(shortcut).is_ok() {
                    active = Some(canonical);
                } else {
                    failed.push(raw);
                }
            }
            Err(_) => failed.push(raw),
        }
    }

    *state.summon_shortcut.lock().map_err(|e| e.to_string())? = active;
    Ok(json!({ "ok": true, "failed": failed }))
}

/// Pre-check used by the settings UI before saving the summon hotkey: reports
/// whether the accelerator is free from this app's perspective. Note this only
/// reflects registrations this app holds; a combo owned by another app still
/// appears "available" here and is caught only when `sync_summon_inner` tries
/// to register it.
#[tauri::command]
pub fn is_shortcut_available(app: AppHandle, accelerator: String) -> Result<bool, String> {
    let shortcut: Shortcut = accelerator
        .parse()
        .map_err(|_| format!("invalid accelerator: {accelerator}"))?;
    Ok(!app.global_shortcut().is_registered(shortcut))
}

// ---------- Tag commands ----------

#[tauri::command]
pub fn list_tags(state: State<AppState>) -> Result<Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    Ok(Value::Array(crate::repo::list_tags(&conn)?))
}

#[tauri::command]
pub fn create_tag(
    name: String,
    color: Option<String>,
    state: State<AppState>,
) -> Result<Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let id = crate::repo::find_or_create_tag(&conn, &name, color.as_deref(), &now())?;
    Ok(json!({ "id": id }))
}

#[tauri::command]
pub fn update_tag(id: String, name: String, state: State<AppState>) -> Result<Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let ts = now();
    conn.execute(
        "UPDATE tags SET name = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![name, ts, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true }))
}

/// Set (or clear, with `None`) the accent color of a tag. The value is a
/// palette key such as `"red"`, resolved to concrete classes in the frontend,
/// so the stored data stays theme-independent.
#[tauri::command]
pub fn set_tag_color(
    id: String,
    color: Option<String>,
    state: State<AppState>,
) -> Result<Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let ts = now();
    conn.execute(
        "UPDATE tags SET color = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![color, ts, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true }))
}

/// Persist the manual tag order produced by drag and drop in Tag Manager.
/// Every tag is renumbered from 1, so tags created before this feature (which
/// default to 0 and therefore fall back to alphabetical order) become explicit
/// on the first reorder.
#[tauri::command]
pub fn reorder_tags(order: Vec<TagOrderItem>, state: State<AppState>) -> Result<Value, String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for item in &order {
        tx.execute(
            "UPDATE tags SET sort_order = ?1 WHERE id = ?2",
            rusqlite::params![item.sort_order, item.id],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true }))
}

/// Add `tag_id` to, or remove it from, each listed bookmark. Used to apply a tag
/// rule to the bookmarks that already exist (and to undo that when the rule is
/// deleted). Only the bookmark-tag links change: going through
/// `update_bookmark` instead would rewrite every column, wiping any field the
/// caller did not resend (it once cleared the bookmarks' keyboard shortcuts).
fn set_tag_on_bookmarks_inner(
    conn: &mut rusqlite::Connection,
    tag_id: &str,
    bookmark_ids: &[String],
    add: bool,
) -> Result<usize, String> {
    let ts = now();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut changed = 0;
    for bookmark_id in bookmark_ids {
        let n = if add {
            tx.execute(
                "INSERT INTO bookmarks_tags (bookmark_id, tag_id, created_at) \
                 SELECT ?1, ?2, ?3 WHERE EXISTS (SELECT 1 FROM bookmarks WHERE id = ?1) \
                 ON CONFLICT(bookmark_id, tag_id) DO NOTHING",
                rusqlite::params![bookmark_id, tag_id, ts],
            )
        } else {
            tx.execute(
                "DELETE FROM bookmarks_tags WHERE bookmark_id = ?1 AND tag_id = ?2",
                rusqlite::params![bookmark_id, tag_id],
            )
        }
        .map_err(|e| e.to_string())?;
        if n > 0 {
            tx.execute(
                "UPDATE bookmarks SET updated_at = ?1 WHERE id = ?2",
                rusqlite::params![ts, bookmark_id],
            )
            .map_err(|e| e.to_string())?;
            changed += 1;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(changed)
}

#[tauri::command]
pub fn set_tag_on_bookmarks(
    tag_id: String,
    bookmark_ids: Vec<String>,
    add: bool,
    state: State<AppState>,
) -> Result<Value, String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    let changed = set_tag_on_bookmarks_inner(&mut conn, &tag_id, &bookmark_ids, add)?;
    Ok(json!({ "changed": changed }))
}

#[tauri::command]
pub fn delete_tag(id: String, state: State<AppState>) -> Result<Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM tags WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true }))
}

#[tauri::command]
pub fn delete_all_tags(state: State<AppState>) -> Result<Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM tags", [])
        .map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true }))
}

// ---------- Tag rule commands ----------

#[tauri::command]
pub fn list_tag_rules(state: State<AppState>) -> Result<Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    Ok(Value::Array(crate::repo::list_tag_rules(&conn)?))
}

#[tauri::command]
pub fn create_tag_rule(data: TagRuleInput, state: State<AppState>) -> Result<Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let ts = now();
    let id = new_id();
    conn.execute(
        "INSERT INTO tag_rules (id, match_type, pattern, tag_id, target_field, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![id, data.match_type, data.pattern, data.tag_id, data.target_field, ts, ts],
    )
    .map_err(|e| e.to_string())?;
    Ok(json!({ "id": id }))
}

#[tauri::command]
pub fn delete_tag_rule(id: String, state: State<AppState>) -> Result<Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM tag_rules WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true }))
}

// ---------- Settings commands ----------

#[tauri::command]
pub fn get_settings(state: State<AppState>) -> Result<Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let value = conn
        .query_row(
            "SELECT list_columns, sort_option, sort_order, summon_shortcut, \
             shortcut_dir_enabled, shortcut_dir_path, folder_search_enabled \
             FROM user_settings WHERE id = 1",
            [],
            |r| {
                Ok(json!({
                    "list_columns": r.get::<_, i64>(0)?,
                    "sort_option": r.get::<_, String>(1)?,
                    "sort_order": r.get::<_, String>(2)?,
                    "summon_shortcut": r.get::<_, String>(3)?,
                    "shortcut_dir_enabled": r.get::<_, i64>(4)? != 0,
                    "shortcut_dir_path": r.get::<_, Option<String>>(5)?,
                    "folder_search_enabled": r.get::<_, i64>(6)? != 0,
                }))
            },
        )
        .map_err(|e| e.to_string())?;
    Ok(value)
}

#[tauri::command]
pub fn update_settings(
    app: AppHandle,
    data: SettingsInput,
    state: State<AppState>,
) -> Result<Value, String> {
    {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE user_settings SET list_columns = ?1, sort_option = ?2, sort_order = ?3, \
             summon_shortcut = ?4, \
             shortcut_dir_enabled = COALESCE(?5, shortcut_dir_enabled), \
             shortcut_dir_path = COALESCE(?6, shortcut_dir_path), \
             folder_search_enabled = COALESCE(?7, folder_search_enabled) WHERE id = 1",
            rusqlite::params![
                data.list_columns,
                data.sort_option,
                data.sort_order,
                data.summon_shortcut,
                data.shortcut_dir_enabled.map(|v| v as i64),
                data.shortcut_dir_path,
                data.folder_search_enabled.map(|v| v as i64),
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    // Switching the shortcut folder on, or pointing it somewhere else, should
    // take effect without waiting for the next bookmark edit.
    crate::shortcutdir::request_sync(&app);

    // Re-register the summon hotkey so changes take effect immediately. Returns
    // `failed` if the new combo is already taken, letting the caller warn.
    sync_summon_inner(&app)
}

// ---------- JSON backup / restore ----------

#[derive(Deserialize)]
struct ImportBookmark {
    id: String,
    #[serde(default)]
    kind: Option<String>,
    title: String,
    url: String,
    #[serde(default)]
    favicon: Option<String>,
    #[serde(default)]
    is_pinned: bool,
    #[serde(default)]
    access_count: i64,
    #[serde(default)]
    custom_order: i64,
    #[serde(default)]
    memo: Option<String>,
    #[serde(default)]
    shortcut: Option<String>,
    created_at: String,
    updated_at: String,
    #[serde(default)]
    last_accessed_at: Option<String>,
    #[serde(default)]
    tags: Vec<String>,
}

#[derive(Deserialize)]
struct ImportTag {
    id: String,
    name: String,
    #[serde(default)]
    color: Option<String>,
    #[serde(default)]
    sort_order: i64,
    created_at: String,
    updated_at: String,
}

#[derive(Deserialize)]
struct ImportTagRule {
    id: String,
    match_type: String,
    pattern: String,
    tag_id: String,
    target_field: String,
    created_at: String,
    updated_at: String,
}

#[derive(Deserialize)]
struct ImportSettings {
    list_columns: i64,
    sort_option: String,
    sort_order: String,
    summon_shortcut: String,
}

#[derive(Deserialize)]
struct ImportData {
    #[serde(default)]
    bookmarks: Vec<ImportBookmark>,
    #[serde(default)]
    tags: Vec<ImportTag>,
    #[serde(default)]
    tag_rules: Vec<ImportTagRule>,
    #[serde(default)]
    settings: Option<ImportSettings>,
}

/// Build a complete, versioned JSON snapshot of all app data (bookmarks with
/// their tags/memo/shortcut, tags, tag rules, settings). Also what the
/// automatic backups in backup.rs write.
pub(crate) fn build_export_snapshot(conn: &rusqlite::Connection) -> Result<Value, String> {
    let bookmarks = bookmarks_with_tags(conn)?;
    let tags = crate::repo::list_tags(conn)?;
    let tag_rules = crate::repo::list_tag_rules(conn)?;

    let settings = conn
        .query_row(
            "SELECT list_columns, sort_option, sort_order, summon_shortcut \
             FROM user_settings WHERE id = 1",
            [],
            |r| {
                Ok(json!({
                    "list_columns": r.get::<_, i64>(0)?,
                    "sort_option": r.get::<_, String>(1)?,
                    "sort_order": r.get::<_, String>(2)?,
                    "summon_shortcut": r.get::<_, String>(3)?,
                }))
            },
        )
        .map_err(|e| e.to_string())?;

    Ok(json!({
        "version": 1,
        "exported_at": now(),
        "bookmarks": bookmarks,
        "tags": tags,
        "tag_rules": tag_rules,
        "settings": settings,
    }))
}

/// Wipe all existing data and re-insert from a parsed backup, inside a single
/// transaction so a malformed file leaves the database untouched.
fn apply_import(conn: &mut rusqlite::Connection, data: &ImportData) -> Result<Value, String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    tx.execute("DELETE FROM bookmarks_tags", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM tag_rules", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM bookmarks", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM tags", []).map_err(|e| e.to_string())?;

    for t in &data.tags {
        tx.execute(
            "INSERT INTO tags (id, name, color, sort_order, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![t.id, t.name, t.color, t.sort_order, t.created_at, t.updated_at],
        )
        .map_err(|e| e.to_string())?;
    }

    for b in &data.bookmarks {
        let kind = b.kind.clone().unwrap_or_else(|| "url".to_string());
        tx.execute(
            "INSERT INTO bookmarks (id, kind, title, url, favicon, is_pinned, access_count, \
             custom_order, memo, shortcut, created_at, updated_at, last_accessed_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            rusqlite::params![
                b.id,
                kind,
                b.title,
                b.url,
                b.favicon,
                b.is_pinned as i64,
                b.access_count,
                b.custom_order,
                b.memo,
                b.shortcut,
                b.created_at,
                b.updated_at,
                b.last_accessed_at,
            ],
        )
        .map_err(|e| e.to_string())?;
        // Re-link tags by name (tags inserted above are found, not duplicated).
        crate::repo::link_tags(&tx, &b.id, &b.tags, &b.updated_at)?;
    }

    for r in &data.tag_rules {
        tx.execute(
            "INSERT INTO tag_rules (id, match_type, pattern, tag_id, target_field, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                r.id,
                r.match_type,
                r.pattern,
                r.tag_id,
                r.target_field,
                r.created_at,
                r.updated_at
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    if let Some(s) = &data.settings {
        tx.execute(
            "UPDATE user_settings SET list_columns = ?1, sort_option = ?2, sort_order = ?3, \
             summon_shortcut = ?4 WHERE id = 1",
            rusqlite::params![s.list_columns, s.sort_option, s.sort_order, s.summon_shortcut],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(json!({
        "ok": true,
        "bookmarks": data.bookmarks.len(),
        "tags": data.tags.len(),
        "tag_rules": data.tag_rules.len(),
    }))
}

#[tauri::command]
pub async fn export_data(app: AppHandle, state: State<'_, AppState>) -> Result<Value, String> {
    use tauri_plugin_dialog::DialogExt;

    // Build the snapshot string up front so the DB lock is never held across the
    // (blocking) save dialog.
    let json_string = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        let snapshot = build_export_snapshot(&conn)?;
        serde_json::to_string_pretty(&snapshot).map_err(|e| e.to_string())?
    };

    let dest = tauri::async_runtime::spawn_blocking({
        let app = app.clone();
        move || {
            app.dialog()
                .file()
                .set_file_name("bookmarks-backup.json")
                .add_filter("JSON", &["json"])
                .blocking_save_file()
        }
    })
    .await
    .map_err(|e| e.to_string())?;

    match dest {
        None => Ok(json!({ "cancelled": true })),
        Some(file_path) => {
            let tauri_plugin_dialog::FilePath::Path(path) = file_path else {
                return Err("expected a file path".to_string());
            };
            std::fs::write(&path, json_string).map_err(|e| e.to_string())?;
            Ok(json!({ "ok": true }))
        }
    }
}

#[tauri::command]
pub async fn import_data(app: AppHandle, state: State<'_, AppState>) -> Result<Value, String> {
    use tauri_plugin_dialog::DialogExt;

    let src = tauri::async_runtime::spawn_blocking({
        let app = app.clone();
        move || {
            app.dialog()
                .file()
                .add_filter("JSON", &["json"])
                .blocking_pick_file()
        }
    })
    .await
    .map_err(|e| e.to_string())?;

    let path = match src {
        None => return Ok(json!({ "cancelled": true })),
        Some(file_path) => {
            let tauri_plugin_dialog::FilePath::Path(path) = file_path else {
                return Err("expected a file path".to_string());
            };
            path
        }
    };

    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let data: ImportData =
        serde_json::from_str(&content).map_err(|e| format!("Invalid backup file: {e}"))?;

    let summary = {
        let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
        // Restore replaces everything, so keep what is there now first. The
        // lock is held throughout, so the snapshot is exactly what gets replaced.
        crate::backup::snapshot(
            &conn,
            &crate::backup::backup_dir(&app)?,
            crate::backup::Reason::BeforeRestore,
        )
        .map_err(|e| format!("Could not save a safety backup, so nothing was restored: {e}"))?;
        apply_import(&mut conn, &data)?
    };

    // Settings (incl. the summon hotkey) may have changed — re-register it.
    sync_summon_inner(&app)?;

    // The whole bookmark set was replaced, so the shortcut folder has to be
    // rebuilt from scratch.
    crate::shortcutdir::request_sync(&app);

    Ok(summary)
}

/// Show the automatic backups (backup.rs) in Explorer, creating the folder if
/// none has been written yet so the button never fails on a fresh install.
#[tauri::command]
pub fn open_backup_dir(app: AppHandle) -> Result<Value, String> {
    let dir = crate::backup::backup_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    tauri_plugin_opener::open_path(&dir, None::<&str>).map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true }))
}

// ---------- Title fetch ----------

#[tauri::command]
pub async fn fetch_title(url: String) -> Result<Value, String> {
    let title = tauri::async_runtime::spawn_blocking(move || page_title::fetch_title_blocking(&url))
        .await
        .map_err(|e| e.to_string())?;
    Ok(json!({ "title": title }))
}

// ---------- Favicon fetch ----------

/// How many sites the bulk fetch talks to at once. Small enough to stay polite
/// on a shared/corporate network, large enough that dead links (which each cost
/// a full timeout) do not dominate the run.
const FAVICON_BATCH: usize = 6;

/// Fetch the icon for one bookmark and store it. Called right after a bookmark
/// is added, so the icon is already local by the time the card is drawn again.
#[tauri::command]
pub async fn fetch_favicon(
    id: String,
    url: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let icon = tauri::async_runtime::spawn_blocking(move || favicon::fetch_favicon_blocking(&url))
        .await
        .map_err(|e| e.to_string())?;

    if let Some(icon) = &icon {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE bookmarks SET favicon = ?1 WHERE id = ?2",
            rusqlite::params![icon, id],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(json!({ "favicon": icon }))
}

/// Web bookmarks still without an icon — the count behind the Settings button.
#[tauri::command]
pub fn count_missing_favicons(state: State<AppState>) -> Result<Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM bookmarks \
             WHERE kind = 'url' AND (favicon IS NULL OR favicon = '')",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(json!({ "count": count }))
}

/// Fetch every missing icon, a batch at a time, emitting `favicon-progress`
/// after each batch. This is the only place the app contacts many sites at
/// once, so it never runs on its own — the user presses the button — and it
/// stops at the next batch boundary when `cancel_fetch_favicons` is called.
#[tauri::command]
pub async fn fetch_missing_favicons(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let targets: Vec<(String, String)> = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, url FROM bookmarks \
                 WHERE kind = 'url' AND (favicon IS NULL OR favicon = '') \
                 ORDER BY custom_order ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row.map_err(|e| e.to_string())?);
        }
        out
    };

    let total = targets.len();
    state.favicon_cancel.store(false, Ordering::Relaxed);
    let _ = app.emit("favicon-progress", json!({ "done": 0, "total": total, "updated": 0 }));

    let mut done = 0usize;
    let mut updated = 0usize;
    let mut cancelled = false;

    for batch in targets.chunks(FAVICON_BATCH) {
        if state.favicon_cancel.load(Ordering::Relaxed) {
            cancelled = true;
            break;
        }

        // Spawn the whole batch first so the requests overlap, then collect.
        let handles: Vec<_> = batch
            .iter()
            .map(|(id, url)| {
                let id = id.clone();
                let url = url.clone();
                tauri::async_runtime::spawn_blocking(move || {
                    (id, favicon::fetch_favicon_blocking(&url))
                })
            })
            .collect();

        let mut fetched = Vec::new();
        for handle in handles {
            done += 1;
            if let Ok((id, Some(icon))) = handle.await {
                fetched.push((id, icon));
            }
        }

        if !fetched.is_empty() {
            let conn = state.conn.lock().map_err(|e| e.to_string())?;
            for (id, icon) in &fetched {
                conn.execute(
                    "UPDATE bookmarks SET favicon = ?1 WHERE id = ?2",
                    rusqlite::params![icon, id],
                )
                .map_err(|e| e.to_string())?;
            }
            updated += fetched.len();
        }

        let _ = app.emit(
            "favicon-progress",
            json!({ "done": done, "total": total, "updated": updated }),
        );
    }

    Ok(json!({ "total": total, "updated": updated, "cancelled": cancelled }))
}

#[tauri::command]
pub fn cancel_fetch_favicons(state: State<AppState>) -> Result<Value, String> {
    state.favicon_cancel.store(true, Ordering::Relaxed);
    Ok(json!({ "ok": true }))
}

// ---------- Extension download ----------

static EXTENSION_ZIP: &[u8] = include_bytes!("../../public/extension.zip");

#[tauri::command]
pub async fn save_extension_zip(app: tauri::AppHandle) -> Result<Value, String> {
    use tauri_plugin_dialog::DialogExt;

    let dest = tauri::async_runtime::spawn_blocking({
        let app = app.clone();
        move || {
            app.dialog()
                .file()
                .set_file_name("bookmarks-extension.zip")
                .add_filter("ZIP Archive", &["zip"])
                .blocking_save_file()
        }
    })
    .await
    .map_err(|e| e.to_string())?;

    match dest {
        None => Ok(json!({ "cancelled": true })),
        Some(file_path) => {
            let tauri_plugin_dialog::FilePath::Path(path) = file_path else {
                return Err("expected a file path".to_string());
            };
            std::fs::write(&path, EXTENSION_ZIP).map_err(|e| e.to_string())?;
            Ok(json!({ "ok": true }))
        }
    }
}

// ---------- Explorer import helpers ----------

#[tauri::command]
pub fn get_pending_path(state: State<AppState>) -> Option<String> {
    state.pending_path.lock().unwrap().take()
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub fn register_context_menu() -> Result<Value, String> {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_WRITE};
    use winreg::RegKey;

    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_str = exe.to_str().ok_or("invalid exe path")?;
    let cmd = format!("\"{}\" --path \"%1\"", exe_str);
    let icon = format!("\"{}\",0", exe_str);
    let label = "Add to Bookmarks";

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);

    for base in &[
        "Software\\Classes\\*\\shell\\AddToBookmarks",
        "Software\\Classes\\Directory\\shell\\AddToBookmarks",
    ] {
        let (parent, _) = hkcu
            .create_subkey_with_flags(base, KEY_WRITE)
            .map_err(|e| e.to_string())?;
        parent.set_value("", &label).map_err(|e| e.to_string())?;
        parent.set_value("Icon", &icon).map_err(|e| e.to_string())?;

        let (cmd_key, _) = hkcu
            .create_subkey_with_flags(format!("{}\\command", base), KEY_WRITE)
            .map_err(|e| e.to_string())?;
        cmd_key.set_value("", &cmd).map_err(|e| e.to_string())?;
    }

    Ok(json!({ "ok": true }))
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn register_context_menu() -> Result<Value, String> {
    Err("context menu registration is only supported on Windows".to_string())
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub fn unregister_context_menu() -> Result<Value, String> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let _ = hkcu.delete_subkey_all("Software\\Classes\\*\\shell\\AddToBookmarks");
    let _ = hkcu.delete_subkey_all("Software\\Classes\\Directory\\shell\\AddToBookmarks");

    Ok(json!({ "ok": true }))
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn unregister_context_menu() -> Result<Value, String> {
    Err("context menu is only supported on Windows".to_string())
}

// ---------- Launch at Windows startup ----------

/// Registers the app to launch (hidden, to the system tray) when the current
/// user logs in, via the standard per-user `Run` registry key. Idempotent —
/// safe to call on every launch.
#[cfg(target_os = "windows")]
// Only called from release builds (see `lib.rs` setup), so debug builds would
// otherwise flag it as dead code.
#[cfg_attr(debug_assertions, allow(dead_code))]
pub fn register_autostart() -> Result<(), String> {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_WRITE};
    use winreg::RegKey;

    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_str = exe.to_str().ok_or("invalid exe path")?;
    let cmd = format!("\"{}\" --hidden", exe_str);

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (run_key, _) = hkcu
        .create_subkey_with_flags("Software\\Microsoft\\Windows\\CurrentVersion\\Run", KEY_WRITE)
        .map_err(|e| e.to_string())?;
    run_key.set_value("Bookmarks", &cmd).map_err(|e| e.to_string())?;

    Ok(())
}

// ---------- Open a folder/file path in the OS file explorer ----------

#[tauri::command]
pub fn open_path(path: String) -> Result<Value, String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err(format!("Path not found: {path}"));
    }

    // Hands the path to the shell, which opens a folder in Explorer and a file
    // in its default application. The opener plugin enables the `open` crate's
    // `shellexecute-on-windows` feature, so this goes through ShellExecuteW
    // rather than spawning `cmd /C start` — the Windows App Certification Kit
    // reports launching cmd.exe as a blocked executable reference.
    tauri_plugin_opener::open_path(&path, None::<&str>).map_err(|e| e.to_string())?;

    Ok(json!({ "ok": true }))
}

// ---------- MCP server launch command ----------

/// What an AI assistant should run to start the MCP server (see mcp.rs). Shown
/// in Settings so it can be copied into the assistant's configuration.
#[tauri::command]
pub fn mcp_launch_command() -> Result<Value, String> {
    Ok(json!({ "command": mcp_executable()?, "args": ["--mcp"] }))
}

// ---------- AI bookmark suggestions ----------

/// Bookmarks an assistant has proposed through the MCP `suggest_bookmark` tool
/// and the user has not yet saved or dismissed (see suggestions.rs).
#[tauri::command]
pub fn list_suggestions(state: State<'_, AppState>) -> Value {
    json!(state.suggestions.list())
}

/// Drops a suggestion: the user dismissed it, or saved it as a bookmark.
#[tauri::command]
pub fn dismiss_suggestion(id: String, app: AppHandle, state: State<'_, AppState>) {
    if state.suggestions.remove(&id) {
        let _ = app.emit("suggestions-changed", ());
    }
}

fn mcp_executable() -> Result<String, String> {
    // The Store build's app.exe sits under WindowsApps, in a folder renamed on
    // every update, and launching it directly drops package identity. The
    // execution alias declared in msix/AppxManifest.xml is stable and keeps it.
    #[cfg(target_os = "windows")]
    if crate::winpkg::is_packaged() {
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            return Ok(std::path::PathBuf::from(local)
                .join("Microsoft")
                .join("WindowsApps")
                .join("bookmarks-tags.exe")
                .to_string_lossy()
                .into_owned());
        }
    }
    std::env::current_exe()
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn scratch_db() -> Connection {
        let conn = Connection::open_in_memory().expect("open memory db");
        crate::db::migrate(&conn).expect("migrate");
        conn
    }

    fn insert_bookmark(conn: &Connection, id: &str, shortcut: Option<&str>) {
        conn.execute(
            "INSERT INTO bookmarks (id, kind, title, url, memo, shortcut, created_at, updated_at) \
             VALUES (?1, 'url', 'Title', 'https://example.com', 'memo', ?2, 't0', 't0')",
            rusqlite::params![id, shortcut],
        )
        .unwrap();
    }

    fn insert_tag(conn: &Connection, id: &str, name: &str) {
        conn.execute(
            "INSERT INTO tags (id, name, created_at, updated_at) VALUES (?1, ?2, 't0', 't0')",
            rusqlite::params![id, name],
        )
        .unwrap();
    }

    fn tag_ids_of(conn: &Connection, bookmark_id: &str) -> Vec<String> {
        let mut stmt = conn
            .prepare("SELECT tag_id FROM bookmarks_tags WHERE bookmark_id = ?1 ORDER BY tag_id")
            .unwrap();
        let rows = stmt.query_map([bookmark_id], |r| r.get(0)).unwrap();
        rows.collect::<Result<_, _>>().unwrap()
    }

    #[test]
    fn applying_a_tag_rule_keeps_every_other_field() {
        let mut conn = scratch_db();
        insert_bookmark(&conn, "b1", Some("CmdOrCtrl+Shift+K"));
        insert_tag(&conn, "t1", "docs");

        let changed =
            set_tag_on_bookmarks_inner(&mut conn, "t1", &["b1".to_string()], true).unwrap();
        assert_eq!(changed, 1);
        assert_eq!(tag_ids_of(&conn, "b1"), vec!["t1"]);

        let (shortcut, memo, updated_at): (Option<String>, Option<String>, String) = conn
            .query_row(
                "SELECT shortcut, memo, updated_at FROM bookmarks WHERE id = 'b1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();
        assert_eq!(shortcut.as_deref(), Some("CmdOrCtrl+Shift+K"));
        assert_eq!(memo.as_deref(), Some("memo"));
        assert_ne!(updated_at, "t0", "a bookmark whose tags changed counts as updated");
    }

    #[test]
    fn tag_rule_application_is_idempotent_and_reversible() {
        let mut conn = scratch_db();
        insert_bookmark(&conn, "b1", None);
        insert_bookmark(&conn, "b2", None);
        insert_tag(&conn, "t1", "docs");
        let ids = vec!["b1".to_string(), "b2".to_string()];

        assert_eq!(set_tag_on_bookmarks_inner(&mut conn, "t1", &ids, true).unwrap(), 2);
        // Already tagged: nothing to do, and no error from the primary key.
        assert_eq!(set_tag_on_bookmarks_inner(&mut conn, "t1", &ids, true).unwrap(), 0);

        assert_eq!(set_tag_on_bookmarks_inner(&mut conn, "t1", &ids, false).unwrap(), 2);
        assert!(tag_ids_of(&conn, "b1").is_empty());
        assert!(tag_ids_of(&conn, "b2").is_empty());
    }

    #[test]
    fn tagging_skips_bookmarks_that_no_longer_exist() {
        let mut conn = scratch_db();
        insert_tag(&conn, "t1", "docs");
        // Deleted between the frontend's list and this call.
        let changed =
            set_tag_on_bookmarks_inner(&mut conn, "t1", &["gone".to_string()], true).unwrap();
        assert_eq!(changed, 0);
    }

    #[test]
    fn backup_round_trip_restores_everything() {
        let mut conn = scratch_db();
        insert_bookmark(&conn, "b1", Some("Alt+KeyK"));
        insert_bookmark(&conn, "b2", None);
        insert_tag(&conn, "t1", "docs");
        conn.execute("UPDATE tags SET color = 'red', sort_order = 3 WHERE id = 't1'", [])
            .unwrap();
        conn.execute(
            "INSERT INTO bookmarks_tags (bookmark_id, tag_id, created_at) VALUES ('b1', 't1', 't0')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO tag_rules (id, match_type, pattern, tag_id, target_field, created_at, updated_at) \
             VALUES ('r1', 'contains', 'example', 't1', 'url', 't0', 't0')",
            [],
        )
        .unwrap();

        let mut before = build_export_snapshot(&conn).unwrap();
        let data: ImportData = serde_json::from_value(before.clone()).unwrap();

        // Restore over a database that has since changed completely.
        conn.execute("DELETE FROM bookmarks", []).unwrap();
        conn.execute("DELETE FROM tags", []).unwrap();
        insert_bookmark(&conn, "other", None);

        apply_import(&mut conn, &data).unwrap();
        let mut after = build_export_snapshot(&conn).unwrap();

        before["exported_at"] = Value::Null;
        after["exported_at"] = Value::Null;
        assert_eq!(before, after);
    }

    #[test]
    fn a_malformed_backup_leaves_the_database_untouched() {
        let mut conn = scratch_db();
        insert_bookmark(&conn, "b1", None);
        // Two bookmarks with the same id violate the primary key part-way.
        let data: ImportData = serde_json::from_value(json!({
            "bookmarks": [
                { "id": "x", "title": "A", "url": "https://a", "created_at": "t", "updated_at": "t" },
                { "id": "x", "title": "B", "url": "https://b", "created_at": "t", "updated_at": "t" }
            ]
        }))
        .unwrap();

        assert!(apply_import(&mut conn, &data).is_err());
        let ids: Vec<String> = conn
            .prepare("SELECT id FROM bookmarks")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(ids, vec!["b1"]);
    }

    #[test]
    fn normalize_timestamp_accepts_rfc3339_only() {
        assert_eq!(
            normalize_timestamp(Some("2019-03-04T05:06:07Z")).as_deref(),
            Some("2019-03-04T05:06:07.000Z")
        );
        // Offsets are folded to UTC so stored values stay comparable as strings.
        assert_eq!(
            normalize_timestamp(Some("2019-03-04T14:06:07+09:00")).as_deref(),
            Some("2019-03-04T05:06:07.000Z")
        );
        assert_eq!(normalize_timestamp(Some("1551675967")), None);
        assert_eq!(normalize_timestamp(Some("")), None);
        assert_eq!(normalize_timestamp(None), None);
    }
}
