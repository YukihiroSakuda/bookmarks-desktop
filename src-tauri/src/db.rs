use rusqlite::Connection;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};

pub struct AppState {
    pub conn: Arc<Mutex<Connection>>,
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
    Ok(conn)
}
