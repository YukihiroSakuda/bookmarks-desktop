use rusqlite::{Connection, OptionalExtension};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

pub struct AppState {
    pub conn: Arc<Mutex<Connection>>,
    pub pending_path: Mutex<Option<String>>,
    /// Canonical accelerator string of the single global "summon" hotkey
    /// currently registered, or `None` if none is active. Lets the
    /// global-shortcut handler recognize the summon combo without re-querying
    /// the DB on each key press. Per-bookmark shortcuts are handled in-app
    /// (only while the window is focused), not via global registration.
    pub summon_shortcut: Mutex<Option<String>>,
    /// Set while the user cancels the bulk "fetch missing icons" run.
    pub favicon_cancel: AtomicBool,
    /// Bookmarks an AI assistant proposed that the user has not yet accepted or
    /// dismissed. In memory only; see suggestions.rs.
    pub suggestions: crate::suggestions::Suggestions,
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
  sort_option TEXT NOT NULL DEFAULT 'title',
  sort_order TEXT NOT NULL DEFAULT 'asc'
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
VALUES (1, 'list', 4, 'title', 'asc')
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
    // The MCP server (`app.exe --mcp`, see mcp.rs) reads this file from its own
    // process. A write that lands while it holds a read lock waits for it —
    // a few milliseconds — instead of failing outright with SQLITE_BUSY.
    conn.busy_timeout(Duration::from_secs(5))
        .map_err(|e| format!("failed to set busy timeout: {e}"))?;
    migrate(&conn)?;
    Ok(conn)
}

/// Create the schema and apply every migration. Split from `init_db` so tests
/// can build the same schema in a scratch database without an `AppHandle`.
pub(crate) fn migrate(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(SCHEMA)
        .map_err(|e| format!("failed to initialize schema: {e}"))?;

    // Idempotent migrations for columns added after the initial schema.
    add_column_if_missing(conn, "bookmarks", "shortcut", "TEXT")?;
    add_column_if_missing(
        conn,
        "user_settings",
        "summon_shortcut",
        "TEXT NOT NULL DEFAULT 'CmdOrCtrl+Alt+Space'",
    )?;
    add_column_if_missing(conn, "user_settings", "api_token", "TEXT")?;
    add_column_if_missing(conn, "tags", "color", "TEXT")?;
    add_column_if_missing(conn, "tags", "sort_order", "INTEGER NOT NULL DEFAULT 0")?;
    // Off by default: the shortcut folder writes into the user's profile, so it
    // is never created until it is asked for. A NULL path means the default
    // location (`%USERPROFILE%\Bookmarks`).
    add_column_if_missing(
        conn,
        "user_settings",
        "shortcut_dir_enabled",
        "INTEGER NOT NULL DEFAULT 0",
    )?;
    add_column_if_missing(conn, "user_settings", "shortcut_dir_path", "TEXT")?;
    // On by default: searching inside bookmarked folders is the expected
    // behavior, so existing installs pick it up without any action.
    add_column_if_missing(
        conn,
        "user_settings",
        "folder_search_enabled",
        "INTEGER NOT NULL DEFAULT 1",
    )?;
    ensure_api_token(conn)?;
    Ok(())
}

/// Generate a random pairing token for the local HTTP API (used by the
/// browser extension) on first run, so the server has something to check
/// requests against instead of trusting any local caller.
fn ensure_api_token(conn: &Connection) -> Result<(), String> {
    let existing: Option<String> = conn
        .query_row("SELECT api_token FROM user_settings WHERE id = 1", [], |r| {
            r.get::<_, Option<String>>(0)
        })
        .optional()
        .map_err(|e| e.to_string())?
        .flatten();
    if existing.is_none() {
        let token = Uuid::new_v4().simple().to_string();
        conn.execute(
            "UPDATE user_settings SET api_token = ?1 WHERE id = 1",
            [&token],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrate_is_idempotent_and_keeps_data() {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        conn.execute(
            "INSERT INTO bookmarks (id, title, url, created_at, updated_at) \
             VALUES ('b1', 'T', 'https://example.com', 't0', 't0')",
            [],
        )
        .unwrap();
        let token: String = conn
            .query_row("SELECT api_token FROM user_settings WHERE id = 1", [], |r| r.get(0))
            .unwrap();

        // Every launch runs the migrations again.
        migrate(&conn).unwrap();

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM bookmarks", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
        let token_again: String = conn
            .query_row("SELECT api_token FROM user_settings WHERE id = 1", [], |r| r.get(0))
            .unwrap();
        assert_eq!(token, token_again, "the extension's pairing must survive a restart");
    }

    #[test]
    fn migrate_upgrades_the_original_schema() {
        // The tables as the first release created them, before any of the
        // columns added since.
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE bookmarks (id TEXT PRIMARY KEY, kind TEXT NOT NULL DEFAULT 'url', \
               title TEXT NOT NULL, url TEXT NOT NULL, favicon TEXT, \
               is_pinned INTEGER NOT NULL DEFAULT 0, access_count INTEGER NOT NULL DEFAULT 0, \
               custom_order INTEGER NOT NULL DEFAULT 0, memo TEXT, created_at TEXT NOT NULL, \
               updated_at TEXT NOT NULL, last_accessed_at TEXT); \
             CREATE TABLE tags (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, \
               created_at TEXT NOT NULL, updated_at TEXT NOT NULL); \
             CREATE TABLE user_settings (id INTEGER PRIMARY KEY CHECK (id = 1), \
               display_mode TEXT NOT NULL DEFAULT 'list', list_columns INTEGER NOT NULL DEFAULT 4, \
               sort_option TEXT NOT NULL DEFAULT 'title', sort_order TEXT NOT NULL DEFAULT 'asc'); \
             INSERT INTO user_settings (id) VALUES (1);",
        )
        .unwrap();

        migrate(&conn).unwrap();

        let (summon, folder_search): (String, i64) = conn
            .query_row(
                "SELECT summon_shortcut, folder_search_enabled FROM user_settings WHERE id = 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(summon, "CmdOrCtrl+Alt+Space");
        assert_eq!(folder_search, 1);
        conn.execute("UPDATE bookmarks SET shortcut = NULL", []).unwrap();
        conn.execute("UPDATE tags SET color = NULL, sort_order = 0", []).unwrap();
    }
}
