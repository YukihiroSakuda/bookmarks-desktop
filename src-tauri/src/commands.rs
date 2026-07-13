use crate::db::AppState;
use chrono::{SecondsFormat, Utc};
use rusqlite::OptionalExtension;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
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
}

#[derive(Deserialize)]
pub struct OrderItem {
    id: String,
    custom_order: i64,
}

#[derive(Deserialize)]
pub struct SettingsInput {
    list_columns: i64,
    sort_option: String,
    sort_order: String,
    summon_shortcut: String,
}

#[derive(Deserialize)]
pub struct TagRuleInput {
    match_type: String,
    pattern: String,
    tag_id: String,
    target_field: String,
}

// ---------- Helpers ----------

/// Insert tags (creating them if missing) and link them to a bookmark.
fn link_tags(
    conn: &rusqlite::Connection,
    bookmark_id: &str,
    tags: &[String],
    ts: &str,
) -> Result<(), String> {
    for tag_name in tags {
        let existing: Option<String> = conn
            .query_row(
                "SELECT id FROM tags WHERE name = ?1",
                [tag_name],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;

        let tag_id = match existing {
            Some(id) => id,
            None => {
                let id = new_id();
                conn.execute(
                    "INSERT INTO tags (id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
                    rusqlite::params![id, tag_name, ts, ts],
                )
                .map_err(|e| e.to_string())?;
                id
            }
        };

        conn.execute(
            "INSERT INTO bookmarks_tags (bookmark_id, tag_id, created_at) VALUES (?1, ?2, ?3) \
             ON CONFLICT(bookmark_id, tag_id) DO NOTHING",
            rusqlite::params![bookmark_id, tag_id, ts],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ---------- Bookmark commands ----------

#[tauri::command]
pub fn list_bookmarks(state: State<AppState>) -> Result<Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    // Map bookmark_id -> [tag names]
    let mut tag_map: HashMap<String, Vec<String>> = HashMap::new();
    {
        let mut stmt = conn
            .prepare(
                "SELECT bt.bookmark_id, t.name FROM bookmarks_tags bt \
                 JOIN tags t ON t.id = bt.tag_id",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (bid, name) = row.map_err(|e| e.to_string())?;
            tag_map.entry(bid).or_default().push(name);
        }
    }

    let mut stmt = conn
        .prepare(
            "SELECT id, kind, title, url, favicon, is_pinned, access_count, custom_order, \
             memo, created_at, updated_at, last_accessed_at, shortcut \
             FROM bookmarks ORDER BY custom_order ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |r| {
            Ok(json!({
                "id": r.get::<_, String>(0)?,
                "kind": r.get::<_, String>(1)?,
                "title": r.get::<_, String>(2)?,
                "url": r.get::<_, String>(3)?,
                "favicon": r.get::<_, Option<String>>(4)?,
                "is_pinned": r.get::<_, i64>(5)? != 0,
                "access_count": r.get::<_, i64>(6)?,
                "custom_order": r.get::<_, i64>(7)?,
                "memo": r.get::<_, Option<String>>(8)?,
                "created_at": r.get::<_, String>(9)?,
                "updated_at": r.get::<_, String>(10)?,
                "last_accessed_at": r.get::<_, Option<String>>(11)?,
                "shortcut": r.get::<_, Option<String>>(12)?,
            }))
        })
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for row in rows {
        let mut obj = row.map_err(|e| e.to_string())?;
        let id = obj["id"].as_str().unwrap_or_default().to_string();
        let tags = tag_map.remove(&id).unwrap_or_default();
        obj["tags"] = Value::Array(tags.into_iter().map(Value::String).collect());
        out.push(obj);
    }
    Ok(Value::Array(out))
}

#[tauri::command]
pub fn create_bookmark(data: BookmarkInput, state: State<AppState>) -> Result<Value, String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    let ts = now();
    let id = new_id();
    let kind = data.kind.unwrap_or_else(|| "url".to_string());

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let next_order: i64 = tx
        .query_row("SELECT COALESCE(MAX(custom_order), 0) + 1 FROM bookmarks", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;

    tx.execute(
        "INSERT INTO bookmarks (id, kind, title, url, favicon, is_pinned, access_count, custom_order, memo, shortcut, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7, ?8, ?9, ?10, ?11)",
        rusqlite::params![
            id,
            kind,
            data.title,
            data.url,
            data.favicon,
            data.is_pinned as i64,
            next_order,
            data.memo,
            data.shortcut,
            ts,
            ts
        ],
    )
    .map_err(|e| e.to_string())?;

    link_tags(&tx, &id, &data.tags, &ts)?;
    tx.commit().map_err(|e| e.to_string())?;

    Ok(json!({ "id": id }))
}

#[tauri::command]
pub fn update_bookmark(
    id: String,
    data: BookmarkInput,
    state: State<AppState>,
) -> Result<Value, String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    let ts = now();

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Update core fields. kind is left unchanged when not provided.
    match data.kind {
        Some(kind) => {
            tx.execute(
                "UPDATE bookmarks SET kind = ?1, title = ?2, url = ?3, favicon = ?4, \
                 is_pinned = ?5, memo = ?6, shortcut = ?7, updated_at = ?8 WHERE id = ?9",
                rusqlite::params![
                    kind,
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
        }
        None => tx.execute(
            "UPDATE bookmarks SET title = ?1, url = ?2, favicon = ?3, \
             is_pinned = ?4, memo = ?5, shortcut = ?6, updated_at = ?7 WHERE id = ?8",
            rusqlite::params![
                data.title,
                data.url,
                data.favicon,
                data.is_pinned as i64,
                data.memo,
                data.shortcut,
                ts,
                id
            ],
        ),
    }
    .map_err(|e| e.to_string())?;

    // Replace tag links.
    tx.execute("DELETE FROM bookmarks_tags WHERE bookmark_id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    link_tags(&tx, &id, &data.tags, &ts)?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true }))
}

#[tauri::command]
pub fn delete_bookmark(id: String, state: State<AppState>) -> Result<Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM bookmarks WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true }))
}

#[tauri::command]
pub fn delete_all_bookmarks(state: State<AppState>) -> Result<Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM bookmarks", [])
        .map_err(|e| e.to_string())?;
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
pub fn increment_access(id: String, state: State<AppState>) -> Result<Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let ts = now();
    conn.execute(
        "UPDATE bookmarks SET access_count = access_count + 1, last_accessed_at = ?1 WHERE id = ?2",
        rusqlite::params![ts, id],
    )
    .map_err(|e| e.to_string())?;
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
    let mut stmt = conn
        .prepare("SELECT id, name, created_at, updated_at FROM tags ORDER BY name ASC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(json!({
                "id": r.get::<_, String>(0)?,
                "name": r.get::<_, String>(1)?,
                "created_at": r.get::<_, String>(2)?,
                "updated_at": r.get::<_, String>(3)?,
            }))
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(Value::Array(out))
}

#[tauri::command]
pub fn create_tag(name: String, state: State<AppState>) -> Result<Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let ts = now();

    if let Some(id) = conn
        .query_row("SELECT id FROM tags WHERE name = ?1", [&name], |r| r.get::<_, String>(0))
        .optional()
        .map_err(|e| e.to_string())?
    {
        return Ok(json!({ "id": id }));
    }

    let id = new_id();
    conn.execute(
        "INSERT INTO tags (id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![id, name, ts, ts],
    )
    .map_err(|e| e.to_string())?;
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
    let mut stmt = conn
        .prepare(
            "SELECT id, match_type, pattern, tag_id, target_field, created_at, updated_at \
             FROM tag_rules ORDER BY created_at ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(json!({
                "id": r.get::<_, String>(0)?,
                "match_type": r.get::<_, String>(1)?,
                "pattern": r.get::<_, String>(2)?,
                "tag_id": r.get::<_, String>(3)?,
                "target_field": r.get::<_, String>(4)?,
                "created_at": r.get::<_, String>(5)?,
                "updated_at": r.get::<_, String>(6)?,
            }))
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(Value::Array(out))
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
             summon_shortcut = ?4 WHERE id = 1",
            rusqlite::params![
                data.list_columns,
                data.sort_option,
                data.sort_order,
                data.summon_shortcut
            ],
        )
        .map_err(|e| e.to_string())?;
    }
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
/// their tags/memo/shortcut, tags, tag rules, settings).
fn build_export_snapshot(conn: &rusqlite::Connection) -> Result<Value, String> {
    // Map bookmark_id -> [tag names]
    let mut tag_map: HashMap<String, Vec<String>> = HashMap::new();
    {
        let mut stmt = conn
            .prepare(
                "SELECT bt.bookmark_id, t.name FROM bookmarks_tags bt \
                 JOIN tags t ON t.id = bt.tag_id",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (bid, name) = row.map_err(|e| e.to_string())?;
            tag_map.entry(bid).or_default().push(name);
        }
    }

    let mut bookmarks = Vec::new();
    {
        let mut stmt = conn
            .prepare(
                "SELECT id, kind, title, url, favicon, is_pinned, access_count, custom_order, \
                 memo, shortcut, created_at, updated_at, last_accessed_at \
                 FROM bookmarks ORDER BY custom_order ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok(json!({
                    "id": r.get::<_, String>(0)?,
                    "kind": r.get::<_, String>(1)?,
                    "title": r.get::<_, String>(2)?,
                    "url": r.get::<_, String>(3)?,
                    "favicon": r.get::<_, Option<String>>(4)?,
                    "is_pinned": r.get::<_, i64>(5)? != 0,
                    "access_count": r.get::<_, i64>(6)?,
                    "custom_order": r.get::<_, i64>(7)?,
                    "memo": r.get::<_, Option<String>>(8)?,
                    "shortcut": r.get::<_, Option<String>>(9)?,
                    "created_at": r.get::<_, String>(10)?,
                    "updated_at": r.get::<_, String>(11)?,
                    "last_accessed_at": r.get::<_, Option<String>>(12)?,
                }))
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            let mut obj = row.map_err(|e| e.to_string())?;
            let id = obj["id"].as_str().unwrap_or_default().to_string();
            let tags = tag_map.remove(&id).unwrap_or_default();
            obj["tags"] = Value::Array(tags.into_iter().map(Value::String).collect());
            bookmarks.push(obj);
        }
    }

    let mut tags = Vec::new();
    {
        let mut stmt = conn
            .prepare("SELECT id, name, created_at, updated_at FROM tags ORDER BY name ASC")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok(json!({
                    "id": r.get::<_, String>(0)?,
                    "name": r.get::<_, String>(1)?,
                    "created_at": r.get::<_, String>(2)?,
                    "updated_at": r.get::<_, String>(3)?,
                }))
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            tags.push(row.map_err(|e| e.to_string())?);
        }
    }

    let mut tag_rules = Vec::new();
    {
        let mut stmt = conn
            .prepare(
                "SELECT id, match_type, pattern, tag_id, target_field, created_at, updated_at \
                 FROM tag_rules ORDER BY created_at ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok(json!({
                    "id": r.get::<_, String>(0)?,
                    "match_type": r.get::<_, String>(1)?,
                    "pattern": r.get::<_, String>(2)?,
                    "tag_id": r.get::<_, String>(3)?,
                    "target_field": r.get::<_, String>(4)?,
                    "created_at": r.get::<_, String>(5)?,
                    "updated_at": r.get::<_, String>(6)?,
                }))
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            tag_rules.push(row.map_err(|e| e.to_string())?);
        }
    }

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
            "INSERT INTO tags (id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![t.id, t.name, t.created_at, t.updated_at],
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
        link_tags(&tx, &b.id, &b.tags, &b.updated_at)?;
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
        apply_import(&mut conn, &data)?
    };

    // Settings (incl. the summon hotkey) may have changed — re-register it.
    sync_summon_inner(&app)?;

    Ok(summary)
}

// ---------- Title fetch ----------

fn fetch_title_blocking(url: &str) -> String {
    let parsed = match reqwest::Url::parse(url) {
        Ok(p) => p,
        Err(_) => return String::new(),
    };
    let fallback = parsed
        .host_str()
        .map(|h| h.trim_start_matches("www.").to_string())
        .unwrap_or_default();

    let client = match reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
    {
        Ok(c) => c,
        Err(_) => return fallback,
    };

    let resp = match client
        .get(url)
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        )
        .send()
    {
        Ok(r) => r,
        Err(_) => return fallback,
    };

    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    if !content_type.contains("text/html") && !content_type.contains("xhtml") {
        return fallback;
    }

    let body = match resp.text() {
        Ok(b) => b,
        Err(_) => return fallback,
    };

    extract_title(&body).unwrap_or(fallback)
}

/// Extract and normalize the contents of the first <title> element.
fn extract_title(html: &str) -> Option<String> {
    let lower = html.to_lowercase();
    let start_tag = lower.find("<title")?;
    let gt = lower[start_tag..].find('>')? + start_tag + 1;
    let end = lower[gt..].find("</title>")? + gt;
    let raw = &html[gt..end];
    let normalized = raw.split_whitespace().collect::<Vec<_>>().join(" ");
    let trimmed = normalized.trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

#[tauri::command]
pub async fn fetch_title(url: String) -> Result<Value, String> {
    let title = tauri::async_runtime::spawn_blocking(move || fetch_title_blocking(&url))
        .await
        .map_err(|e| e.to_string())?;
    Ok(json!({ "title": title }))
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
        return Err(format!("パスが見つかりません: {path}"));
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;
        if p.is_dir() {
            Command::new("explorer")
                .raw_arg(format!("\"{path}\""))
                .spawn()
                .map_err(|e| e.to_string())?;
        } else {
            // Open the file with its default application.
            // `cmd /C start "" "path"` is the standard Windows idiom for this.
            Command::new("cmd")
                .creation_flags(0x08000000) // CREATE_NO_WINDOW
                .args(["/C", "start", "", &path])
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        return Err("open_path is only implemented on Windows".to_string());
    }

    Ok(json!({ "ok": true }))
}
