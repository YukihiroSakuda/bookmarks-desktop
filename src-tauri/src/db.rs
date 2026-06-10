use rusqlite::Connection;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};

pub struct AppState {
    pub conn: Arc<Mutex<Connection>>,
    pub pending_path: Mutex<Option<String>>,
    /// Canonical accelerator string of the single global "summon" hotkey
    /// currently registered, or `None` if none is active. Lets the
    /// global-shortcut handler recognize the summon combo without re-querying
    /// the DB on each key press. Per-bookmark shortcuts are handled in-app
    /// (only while the window is focused), not via global registration.
    pub summon_shortcut: Mutex<Option<String>>,
}

const SCHEMA: &str = r#"
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS bookmarks (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'url',
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  favicon TEXT,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  access_count INTEGER NOT NULL DEFAULT 0,
  custom_order INTEGER NOT NULL DEFAULT 0,
  memo TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_accessed_at TEXT
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bookmarks_tags (
  bookmark_id TEXT NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (bookmark_id, tag_id)
);

CREATE TABLE IF NOT EXISTS user_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  display_mode TEXT NOT NULL DEFAULT 'list',
  list_columns INTEGER NOT NULL DEFAULT 4,
  sort_option TEXT NOT NULL DEFAULT 'accessCount',
  sort_order TEXT NOT NULL DEFAULT 'desc'
);

CREATE TABLE IF NOT EXISTS tag_rules (
  id TEXT PRIMARY KEY,
  match_type TEXT NOT NULL,
  pattern TEXT NOT NULL,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  target_field TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO user_settings (id, display_mode, list_columns, sort_option, sort_order)
VALUES (1, 'list', 4, 'accessCount', 'desc')
ON CONFLICT(id) DO NOTHING;
"#;

/// Open (creating if needed) the SQLite database in the app data directory and
/// ensure the schema exists.
pub fn init_db(app: &AppHandle) -> Result<Connection, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("failed to create app data dir: {e}"))?;
    let db_path = dir.join("bookmarks.db");

    let conn = Connection::open(&db_path).map_err(|e| format!("failed to open database: {e}"))?;
    conn.execute_batch(SCHEMA)
        .map_err(|e| format!("failed to initialize schema: {e}"))?;

    // Idempotent migrations for columns added after the initial schema.
    add_column_if_missing(&conn, "bookmarks", "shortcut", "TEXT")?;
    add_column_if_missing(
        &conn,
        "user_settings",
        "summon_shortcut",
        "TEXT NOT NULL DEFAULT 'CmdOrCtrl+Alt+Space'",
    )?;

    Ok(conn)
}

/// Add a column to an existing table when it is not already present. SQLite has
/// no `ADD COLUMN IF NOT EXISTS`, so existence is checked via `PRAGMA table_info`.
fn add_column_if_missing(
    conn: &Connection,
    table: &str,
    col: &str,
    ty: &str,
) -> Result<(), String> {
    let exists = {
        let mut stmt = conn
            .prepare(&format!("PRAGMA table_info({table})"))
            .map_err(|e| e.to_string())?;
        let names = stmt
            .query_map([], |r| r.get::<_, String>(1))
            .map_err(|e| e.to_string())?;
        let mut found = false;
        for name in names {
            if name.map_err(|e| e.to_string())? == col {
                found = true;
                break;
            }
        }
        found
    };

    if !exists {
        conn.execute(&format!("ALTER TABLE {table} ADD COLUMN {col} {ty}"), [])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
