//! Bookmark groups: named sets of bookmarks that open together in one click.
//!
//! A group is a work set ("everything I open to restart project A"), which is a
//! different axis from tags (classification). The two are deliberately kept
//! apart: separate tables here, and a separate view in the frontend.
//!
//! Opening lives here rather than in the frontend because the sequencing
//! matters — URLs are spaced out so the browser does not drop or reorder tabs,
//! folders go through the Explorer tab strategy in `explorertabs`, and one
//! failure must not abort the rest. Expressing that as a promise chain in a
//! hook would spread the ordering rules across the UI.

use crate::db::AppState;
use crate::explorertabs;
use chrono::{SecondsFormat, Utc};
use rusqlite::{Connection, OptionalExtension};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use tauri::State;
use uuid::Uuid;

fn now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn new_id() -> String {
    Uuid::new_v4().to_string()
}

fn next_group_order(conn: &Connection) -> Result<i64, String> {
    conn.query_row(
        "SELECT COALESCE(MAX(sort_order), 0) + 1 FROM bookmark_groups",
        [],
        |r| r.get(0),
    )
    .map_err(|e| e.to_string())
}

fn next_position(conn: &Connection, group_id: &str) -> Result<i64, String> {
    conn.query_row(
        "SELECT COALESCE(MAX(position), 0) + 1 FROM bookmark_group_items WHERE group_id = ?1",
        [group_id],
        |r| r.get(0),
    )
    .map_err(|e| e.to_string())
}

#[derive(Deserialize)]
pub struct GroupInput {
    pub name: String,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub shortcut: Option<String>,
}

#[derive(Deserialize)]
pub struct GroupOrderItem {
    id: String,
    sort_order: i64,
}

// ---------- Read ----------

/// Every group with its member bookmark ids in open order. The frontend joins
/// these against the bookmarks it already holds, so this stays a cheap call
/// that does not duplicate bookmark rows per group.
#[tauri::command]
pub fn list_groups(state: State<AppState>) -> Result<Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let mut member_map: HashMap<String, Vec<String>> = HashMap::new();
    {
        let mut stmt = conn
            .prepare(
                "SELECT group_id, bookmark_id FROM bookmark_group_items \
                 ORDER BY group_id ASC, position ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (gid, bid) = row.map_err(|e| e.to_string())?;
            member_map.entry(gid).or_default().push(bid);
        }
    }

    let mut stmt = conn
        .prepare(
            "SELECT id, name, color, sort_order, shortcut, open_count, last_opened_at, \
             created_at, updated_at \
             FROM bookmark_groups ORDER BY sort_order ASC, name ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(json!({
                "id": r.get::<_, String>(0)?,
                "name": r.get::<_, String>(1)?,
                "color": r.get::<_, Option<String>>(2)?,
                "sort_order": r.get::<_, i64>(3)?,
                "shortcut": r.get::<_, Option<String>>(4)?,
                "open_count": r.get::<_, i64>(5)?,
                "last_opened_at": r.get::<_, Option<String>>(6)?,
                "created_at": r.get::<_, String>(7)?,
                "updated_at": r.get::<_, String>(8)?,
            }))
        })
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for row in rows {
        let mut obj = row.map_err(|e| e.to_string())?;
        let id = obj["id"].as_str().unwrap_or_default().to_string();
        let members = member_map.remove(&id).unwrap_or_default();
        obj["bookmark_ids"] = Value::Array(members.into_iter().map(Value::String).collect());
        out.push(obj);
    }
    Ok(Value::Array(out))
}

// ---------- Write ----------

#[tauri::command]
pub fn create_group(data: GroupInput, state: State<AppState>) -> Result<Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let name = data.name.trim().to_string();
    if name.is_empty() {
        return Err("グループ名を入力してください".into());
    }
    if conn
        .query_row(
            "SELECT id FROM bookmark_groups WHERE name = ?1",
            [&name],
            |r| r.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .is_some()
    {
        return Err(format!("同名のグループがすでに存在します: {name}"));
    }

    let ts = now();
    let id = new_id();
    conn.execute(
        "INSERT INTO bookmark_groups (id, name, color, sort_order, shortcut, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![id, name, data.color, next_group_order(&conn)?, data.shortcut, ts, ts],
    )
    .map_err(|e| e.to_string())?;
    Ok(json!({ "id": id }))
}

#[tauri::command]
pub fn update_group(id: String, data: GroupInput, state: State<AppState>) -> Result<Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let name = data.name.trim().to_string();
    if name.is_empty() {
        return Err("グループ名を入力してください".into());
    }
    // The uniqueness check excludes the group being edited, so saving a group
    // without renaming it does not collide with itself.
    if conn
        .query_row(
            "SELECT id FROM bookmark_groups WHERE name = ?1 AND id <> ?2",
            rusqlite::params![name, id],
            |r| r.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .is_some()
    {
        return Err(format!("同名のグループがすでに存在します: {name}"));
    }

    conn.execute(
        "UPDATE bookmark_groups SET name = ?1, color = ?2, shortcut = ?3, updated_at = ?4 \
         WHERE id = ?5",
        rusqlite::params![name, data.color, data.shortcut, now(), id],
    )
    .map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true }))
}

/// Delete a group. `ON DELETE CASCADE` clears its membership rows; the
/// bookmarks themselves are untouched.
#[tauri::command]
pub fn delete_group(id: String, state: State<AppState>) -> Result<Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM bookmark_groups WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true }))
}

#[tauri::command]
pub fn reorder_groups(
    order: Vec<GroupOrderItem>,
    state: State<AppState>,
) -> Result<Value, String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for item in &order {
        tx.execute(
            "UPDATE bookmark_groups SET sort_order = ?1 WHERE id = ?2",
            rusqlite::params![item.sort_order, item.id],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true }))
}

/// Append bookmarks to a group. Already-present ids are skipped rather than
/// erroring, so adding a selection that partially overlaps still succeeds.
#[tauri::command]
pub fn add_bookmarks_to_group(
    id: String,
    bookmark_ids: Vec<String>,
    state: State<AppState>,
) -> Result<Value, String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    let ts = now();
    let mut position = next_position(&conn, &id)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut added = 0;
    for bid in &bookmark_ids {
        let changed = tx
            .execute(
                "INSERT INTO bookmark_group_items (group_id, bookmark_id, position, created_at) \
                 VALUES (?1, ?2, ?3, ?4) ON CONFLICT(group_id, bookmark_id) DO NOTHING",
                rusqlite::params![id, bid, position, ts],
            )
            .map_err(|e| e.to_string())?;
        if changed > 0 {
            added += 1;
            position += 1;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(json!({ "added": added }))
}

#[tauri::command]
pub fn remove_bookmark_from_group(
    id: String,
    bookmark_id: String,
    state: State<AppState>,
) -> Result<Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM bookmark_group_items WHERE group_id = ?1 AND bookmark_id = ?2",
        rusqlite::params![id, bookmark_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true }))
}

/// Replace a group's membership wholesale, in the given order. Used by the
/// drag-to-reorder in the group card, where the frontend already holds the
/// full list it wants.
#[tauri::command]
pub fn set_group_members(
    id: String,
    bookmark_ids: Vec<String>,
    state: State<AppState>,
) -> Result<Value, String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    let ts = now();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "DELETE FROM bookmark_group_items WHERE group_id = ?1",
        [&id],
    )
    .map_err(|e| e.to_string())?;
    for (index, bid) in bookmark_ids.iter().enumerate() {
        tx.execute(
            "INSERT INTO bookmark_group_items (group_id, bookmark_id, position, created_at) \
             VALUES (?1, ?2, ?3, ?4) ON CONFLICT(group_id, bookmark_id) DO NOTHING",
            rusqlite::params![id, bid, index as i64 + 1, ts],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true }))
}

// ---------- Open ----------

/// One member of a group, resolved far enough to open it.
struct Member {
    id: String,
    kind: String,
    url: String,
    title: String,
}

fn load_members(conn: &Connection, group_id: &str) -> Result<Vec<Member>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT b.id, b.kind, b.url, b.title FROM bookmark_group_items i \
             JOIN bookmarks b ON b.id = i.bookmark_id \
             WHERE i.group_id = ?1 ORDER BY i.position ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([group_id], |r| {
            Ok(Member {
                id: r.get(0)?,
                kind: r.get(1)?,
                url: r.get(2)?,
                title: r.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

/// Open every bookmark in a group.
///
/// Folders go first: the last window opened lands in front, and after a group
/// launch the browser is what the user wants to be looking at.
///
/// One failure never aborts the run — every item is attempted and the failures
/// are collected, because a group whose fifth path has gone stale should still
/// open the other four.
#[tauri::command]
pub async fn open_group(
    id: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let (members, folder_mode) = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        let members = load_members(&conn, &id)?;
        let mode: String = conn
            .query_row(
                "SELECT group_folder_open_mode FROM user_settings WHERE id = 1",
                [],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        (members, mode)
    };

    if members.is_empty() {
        return Err("このグループにはブックマークがありません".into());
    }

    let mut failures: Vec<Value> = Vec::new();
    let mut opened_ids: Vec<String> = Vec::new();

    // --- Folders ---
    let folders: Vec<&Member> = members.iter().filter(|m| m.kind == "path").collect();
    let mut folder_paths: Vec<String> = Vec::new();
    for m in &folders {
        if std::path::Path::new(&m.url).exists() {
            folder_paths.push(m.url.clone());
            opened_ids.push(m.id.clone());
        } else {
            failures.push(json!({ "title": m.title, "reason": "パスが見つかりません" }));
        }
    }

    let tab_mode_used = if folder_paths.is_empty() {
        None
    } else {
        let want_tabs = folder_mode == "tabs";
        // Blocking Win32 work with sleeps between steps — keep it off the async
        // runtime's worker threads.
        let paths = folder_paths.clone();
        let outcome = tauri::async_runtime::spawn_blocking(move || {
            explorertabs::open_folders(&paths, want_tabs)
        })
        .await
        .map_err(|e| e.to_string())?;

        match outcome {
            Ok(mode) => Some(mode),
            Err(e) => {
                // The whole folder batch failed to open; drop those ids back out
                // of the access-count update.
                opened_ids.retain(|oid| !folders.iter().any(|m| &m.id == oid));
                failures.push(json!({ "title": "フォルダ", "reason": e }));
                None
            }
        }
    };

    // --- URLs ---
    let urls: Vec<&Member> = members.iter().filter(|m| m.kind != "path").collect();
    for (index, m) in urls.iter().enumerate() {
        // Browsers drop or reorder tabs when handed a burst of URLs at once.
        if index > 0 {
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
        match tauri_plugin_opener::open_url(&m.url, None::<&str>) {
            Ok(()) => opened_ids.push(m.id.clone()),
            Err(e) => failures.push(json!({ "title": m.title, "reason": e.to_string() })),
        }
    }

    // --- Record the opens ---
    // Only what actually opened: a stale path must not climb the recency sort.
    {
        let ts = now();
        let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        for bid in &opened_ids {
            tx.execute(
                "UPDATE bookmarks SET access_count = access_count + 1, last_accessed_at = ?1 \
                 WHERE id = ?2",
                rusqlite::params![ts, bid],
            )
            .map_err(|e| e.to_string())?;
        }
        tx.execute(
            "UPDATE bookmark_groups SET open_count = open_count + 1, last_opened_at = ?1 \
             WHERE id = ?2",
            rusqlite::params![ts, id],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
    }

    Ok(json!({
        "opened": opened_ids.len(),
        "failures": failures,
        "folder_mode": tab_mode_used,
    }))
}
