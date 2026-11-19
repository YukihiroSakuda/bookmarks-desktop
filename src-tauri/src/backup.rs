//! Automatic snapshots of the database, so a mistaken Restore or Delete all —
//! the two operations that replace or erase everything — can be undone.
//!
//! Snapshots use the same JSON as Settings → Backup (`build_export_snapshot`),
//! so any of them can be brought back with the ordinary Restore button. They
//! live in `<app data>/backups/`, one file each, named
//! `auto-<reason>-YYYYMMDD-HHMMSS.json`. Each reason keeps its own number of
//! generations; only files matching that exact pattern are ever pruned, so
//! anything else the user puts in the folder is left alone.

use chrono::Local;
use rusqlite::Connection;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Manager};

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Reason {
    /// Taken at most once a day while the app is running.
    Daily,
    BeforeRestore,
    BeforeDeleteAll,
}

impl Reason {
    fn prefix(self) -> &'static str {
        match self {
            Reason::Daily => "auto-daily",
            Reason::BeforeRestore => "auto-before-restore",
            Reason::BeforeDeleteAll => "auto-before-delete-all",
        }
    }

    /// Generations kept.
    fn keep(self) -> usize {
        match self {
            Reason::Daily => 7,
            Reason::BeforeRestore | Reason::BeforeDeleteAll => 5,
        }
    }
}

/// A daily snapshot is due once the newest is older than this. A little under
/// a day, so a machine switched on at about the same time every morning still
/// gets one each day.
const DAILY_INTERVAL: Duration = Duration::from_secs(20 * 60 * 60);

/// How often the running app checks whether a daily snapshot is due. It lives
/// in the tray for days at a time, so checking only at launch would not do.
const DAILY_CHECK_EVERY: Duration = Duration::from_secs(60 * 60);

pub fn backup_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {e}"))?
        .join("backups"))
}

/// Write a snapshot of the whole database into `dir`. `Ok(None)` when there
/// is nothing to keep (no bookmarks and no tags): an empty snapshot would only
/// push a useful one out of the rotation.
pub fn snapshot(conn: &Connection, dir: &Path, reason: Reason) -> Result<Option<PathBuf>, String> {
    let rows: i64 = conn
        .query_row(
            "SELECT (SELECT COUNT(*) FROM bookmarks) + (SELECT COUNT(*) FROM tags)",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if rows == 0 {
        return Ok(None);
    }

    let json = serde_json::to_string_pretty(&crate::commands::build_export_snapshot(conn)?)
        .map_err(|e| e.to_string())?;

    std::fs::create_dir_all(dir).map_err(|e| format!("failed to create {}: {e}", dir.display()))?;
    let path = dir.join(format!(
        "{}-{}.json",
        reason.prefix(),
        Local::now().format("%Y%m%d-%H%M%S")
    ));
    // Write beside it and rename, so a crash mid-write never leaves a
    // truncated file that looks like a valid snapshot.
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json).map_err(|e| format!("failed to write {}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("failed to write {}: {e}", path.display()))?;

    if let Err(e) = prune(dir, reason) {
        log::warn!("pruning old {} backups failed: {e}", reason.prefix());
    }
    Ok(Some(path))
}

/// Whether `name` is a snapshot this module wrote for `reason`:
/// `<prefix>-YYYYMMDD-HHMMSS.json`, nothing more and nothing less.
fn is_snapshot_name(name: &str, reason: Reason) -> bool {
    let Some(rest) = name
        .strip_prefix(reason.prefix())
        .and_then(|r| r.strip_prefix('-'))
        .and_then(|r| r.strip_suffix(".json"))
    else {
        return false;
    };
    let bytes = rest.as_bytes();
    bytes.len() == 15
        && bytes[8] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(i, b)| i == 8 || b.is_ascii_digit())
}

/// The snapshots for `reason` in `dir`, newest first. The timestamp in the
/// name sorts chronologically as text.
fn snapshots(dir: &Path, reason: Reason) -> Result<Vec<PathBuf>, String> {
    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(e.to_string()),
    };
    let mut names: Vec<String> = entries
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.file_type().map(|t| t.is_file()).unwrap_or(false))
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter(|name| is_snapshot_name(name, reason))
        .collect();
    names.sort_unstable_by(|a, b| b.cmp(a));
    Ok(names.into_iter().map(|name| dir.join(name)).collect())
}

fn prune(dir: &Path, reason: Reason) -> Result<(), String> {
    for old in snapshots(dir, reason)?.into_iter().skip(reason.keep()) {
        std::fs::remove_file(&old).map_err(|e| format!("{}: {e}", old.display()))?;
    }
    Ok(())
}

fn daily_due(dir: &Path) -> bool {
    let newest = snapshots(dir, Reason::Daily).ok().and_then(|s| s.into_iter().next());
    let Some(newest) = newest else { return true };
    std::fs::metadata(&newest)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|modified| modified.elapsed().ok())
        // A modification time in the future (clock moved back) also counts
        // as due, rather than blocking snapshots until the clock catches up.
        .map_or(true, |age| age >= DAILY_INTERVAL)
}

/// Start the background thread that keeps a daily snapshot. Runs for the life
/// of the app; each check costs one directory listing.
pub fn start_daily(app: AppHandle) {
    std::thread::spawn(move || loop {
        if let Err(e) = take_daily_if_due(&app) {
            log::warn!("daily backup failed: {e}");
        }
        std::thread::sleep(DAILY_CHECK_EVERY);
    });
}

fn take_daily_if_due(app: &AppHandle) -> Result<(), String> {
    let dir = backup_dir(app)?;
    if !daily_due(&dir) {
        return Ok(());
    }
    let state = app.state::<crate::db::AppState>();
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    if let Some(path) = snapshot(&conn, &dir, Reason::Daily)? {
        log::info!("daily backup written to {}", path.display());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A scratch directory, removed on drop.
    struct TempDir(PathBuf);

    impl TempDir {
        fn new(tag: &str) -> Self {
            let dir = std::env::temp_dir().join(format!(
                "bookmarks-backup-test-{tag}-{}",
                uuid::Uuid::new_v4().simple()
            ));
            std::fs::create_dir_all(&dir).unwrap();
            TempDir(dir)
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn db_with_one_bookmark() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::migrate(&conn).unwrap();
        conn.execute(
            "INSERT INTO bookmarks (id, kind, title, url, created_at, updated_at) \
             VALUES ('b1', 'url', 'Example', 'https://example.com', 't0', 't0')",
            [],
        )
        .unwrap();
        conn
    }

    #[test]
    fn snapshot_is_a_restorable_backup() {
        let dir = TempDir::new("restorable");
        let conn = db_with_one_bookmark();

        let path = snapshot(&conn, &dir.0, Reason::BeforeRestore).unwrap().unwrap();
        let name = path.file_name().unwrap().to_str().unwrap();
        assert!(is_snapshot_name(name, Reason::BeforeRestore), "{name}");

        // Same shape Settings → Restore reads.
        let json: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(json["version"], 1);
        assert_eq!(json["bookmarks"][0]["url"], "https://example.com");
        assert!(!path.with_extension("json.tmp").exists());
    }

    #[test]
    fn empty_database_writes_nothing() {
        let dir = TempDir::new("empty");
        let conn = Connection::open_in_memory().unwrap();
        crate::db::migrate(&conn).unwrap();
        assert_eq!(snapshot(&conn, &dir.0, Reason::Daily).unwrap(), None);
        assert!(snapshots(&dir.0, Reason::Daily).unwrap().is_empty());
    }

    #[test]
    fn prune_keeps_the_newest_and_never_touches_other_files() {
        let dir = TempDir::new("prune");
        for day in 1..=9 {
            let name = format!("auto-daily-202601{day:02}-120000.json");
            std::fs::write(dir.0.join(name), "{}").unwrap();
        }
        let other_reason = dir.0.join("auto-before-restore-20260101-120000.json");
        let users_file = dir.0.join("auto-daily-my-notes.json");
        let manual_backup = dir.0.join("bookmarks-backup.json");
        for f in [&other_reason, &users_file, &manual_backup] {
            std::fs::write(f, "{}").unwrap();
        }

        prune(&dir.0, Reason::Daily).unwrap();

        let kept: Vec<String> = snapshots(&dir.0, Reason::Daily)
            .unwrap()
            .iter()
            .map(|p| p.file_name().unwrap().to_string_lossy().into_owned())
            .collect();
        assert_eq!(kept.len(), Reason::Daily.keep());
        assert_eq!(kept[0], "auto-daily-20260109-120000.json");
        assert_eq!(kept.last().unwrap(), "auto-daily-20260103-120000.json");
        assert!(other_reason.exists() && users_file.exists() && manual_backup.exists());
    }

    #[test]
    fn snapshot_names_are_matched_exactly() {
        assert!(is_snapshot_name("auto-daily-20260102-030405.json", Reason::Daily));
        assert!(!is_snapshot_name("auto-daily-20260102-030405.json", Reason::BeforeRestore));
        assert!(!is_snapshot_name("auto-daily-2026010-030405.json", Reason::Daily));
        assert!(!is_snapshot_name("auto-daily-20260102-030405.json.tmp", Reason::Daily));
        assert!(!is_snapshot_name("auto-daily-2026010x-030405.json", Reason::Daily));
        assert!(!is_snapshot_name("auto-daily-20260102_030405.json", Reason::Daily));
    }

    #[test]
    fn daily_is_due_without_a_previous_snapshot() {
        let dir = TempDir::new("due");
        assert!(daily_due(&dir.0));
        std::fs::write(dir.0.join("auto-daily-20260102-030405.json"), "{}").unwrap();
        assert!(!daily_due(&dir.0), "just written, so not due");
    }
}
