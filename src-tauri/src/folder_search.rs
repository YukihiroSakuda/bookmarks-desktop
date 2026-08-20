//! Search inside the folders the user has bookmarked (`kind = 'path'`).
//!
//! Deliberately keeps **no index and no cache**. Each query walks the bookmarked
//! directories, keeps only the entries that match, and throws the rest away.
//! Windows already caches directory metadata, so a self-made cache would be a
//! worse re-implementation of the OS's job — and it would have to answer "when
//! does it go stale?", which walking on demand never has to.
//!
//! Everything expensive is bounded: depth, entries per bookmark, excluded
//! directory names, and no traversal through reparse points.

use serde_json::{json, Value};
use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::State;

use crate::db::AppState;

/// The bounds a walk runs under. Held in a struct rather than as bare constants
/// because the settings screen overrides them, and because the tests need to
/// reach the caps without creating twenty thousand files.
#[derive(Clone, Copy)]
pub struct Limits {
    /// Directory levels below the bookmarked root that are walked. The root's
    /// own children are depth 1.
    pub max_depth: usize,
    /// Entries visited per bookmarked folder before the walk is cut short.
    /// Reaching it is reported to the UI rather than silently dropping results.
    pub max_entries: usize,
    /// Matches kept per bookmarked folder. Generous on purpose: the walk costs
    /// the same either way, so the only price is JSON size, and keeping a wide
    /// margin means the UI can expand a group without a second round trip.
    /// The true count is still reported when even this is exceeded.
    pub max_matches_per_group: usize,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            max_depth: 3,
            max_entries: 20_000,
            max_matches_per_group: 200,
        }
    }
}
/// Shorter queries match too much to be useful and would make every keystroke walk.
const MIN_QUERY_CHARS: usize = 2;
/// How often the walk checks whether a newer query has superseded it.
const CANCEL_CHECK_INTERVAL: usize = 512;

/// Directory names never descended into. `node_modules` alone can hold 30k-100k
/// files, which would burn the whole entry budget on noise that never matches
/// what the user is looking for.
const EXCLUDED_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    ".svn",
    ".hg",
    "target",
    "venv",
    ".venv",
    "__pycache__",
    "dist",
    "build",
    "obj",
    "bin",
    ".next",
    ".cache",
    ".gradle",
    "vendor",
];

/// Bumped by every incoming query. A walk that notices the counter has moved
/// past its own ticket stops early, so holding a key down does not stack up
/// walks whose results nobody will read.
static SEARCH_GENERATION: AtomicU64 = AtomicU64::new(0);

/// Why a bookmarked folder was not searched, surfaced so the UI can say so
/// instead of quietly returning fewer results.
struct Skipped {
    title: String,
    reason: &'static str,
}

struct Group {
    bookmark_id: String,
    title: String,
    root: String,
    matches: Vec<Value>,
    match_count: usize,
    truncated: bool,
}

/// A bookmarked folder to walk.
struct Target {
    id: String,
    title: String,
    path: String,
}

// `(async)` matters: a plain sync command runs on the main thread in Tauri v2,
// so a multi-second walk would freeze the window. This keeps it off the main
// thread while the body itself stays blocking.
#[tauri::command(async)]
pub fn search_in_folders(query: String, state: State<'_, AppState>) -> Result<Value, String> {
    let needle = query.trim().to_lowercase();
    if needle.chars().count() < MIN_QUERY_CHARS {
        return Ok(empty_result(&query, false));
    }

    let ticket = SEARCH_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;

    // Read the targets and release the DB lock immediately — the walk below can
    // take seconds and must never hold the connection other commands need.
    let targets = collect_targets(&state)?;
    let limits = Limits::default();

    // Run the walk on a dedicated thread so its I/O priority can be lowered
    // without touching any other thread in the process.
    let handle = std::thread::Builder::new()
        .name("folder-search".into())
        .spawn(move || {
            enter_background_priority();
            let result = walk_targets(&targets, &needle, ticket, limits);
            leave_background_priority();
            result
        })
        .map_err(|e| format!("failed to start search thread: {e}"))?;

    let (groups, skipped) = handle
        .join()
        .map_err(|_| "search thread panicked".to_string())?;

    if is_superseded(ticket) {
        // A newer query is already in flight; returning these results would let
        // them race it in the UI.
        return Ok(empty_result(&query, true));
    }

    let total: usize = groups.iter().map(|g| g.match_count).sum();
    let groups: Vec<Value> = groups
        .into_iter()
        .map(|g| {
            json!({
                "bookmarkId": g.bookmark_id,
                "title": g.title,
                "root": g.root,
                "matches": g.matches,
                "matchCount": g.match_count,
                "truncated": g.truncated,
            })
        })
        .collect();

    Ok(json!({
        "query": query,
        "groups": groups,
        "totalMatches": total,
        "skipped": skipped
            .into_iter()
            .map(|s| json!({ "title": s.title, "reason": s.reason }))
            .collect::<Vec<_>>(),
        "superseded": false,
    }))
}

fn empty_result(query: &str, superseded: bool) -> Value {
    json!({
        "query": query,
        "groups": [],
        "totalMatches": 0,
        "skipped": [],
        "superseded": superseded,
    })
}

/// Path bookmarks, most recently used first, so the folders the user actually
/// works in are walked (and appear) before the dormant ones.
fn collect_targets(state: &State<'_, AppState>) -> Result<Vec<Target>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, title, url FROM bookmarks WHERE kind = 'path' \
             ORDER BY last_accessed_at DESC, access_count DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Target {
                id: r.get(0)?,
                title: r.get(1)?,
                path: r.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

fn is_superseded(ticket: u64) -> bool {
    SEARCH_GENERATION.load(Ordering::SeqCst) > ticket
}

fn walk_targets(
    targets: &[Target],
    needle: &str,
    ticket: u64,
    limits: Limits,
) -> (Vec<Group>, Vec<Skipped>) {
    let mut groups = Vec::new();
    let mut skipped = Vec::new();

    for target in targets {
        if is_superseded(ticket) {
            break;
        }

        let root = PathBuf::from(&target.path);
        if !root.is_dir() {
            // Bookmarks pointing at a single file have no inside to search.
            continue;
        }
        if is_drive_root(&root) {
            // A whole drive is not a place the user chose — it is the opposite
            // of the curated scope this feature exists to provide. Walking it
            // burns the entry budget on every keystroke and returns nothing
            // worth showing.
            skipped.push(Skipped {
                title: target.title.clone(),
                reason: "drive-root",
            });
            continue;
        }
        if let Some(reason) = unsearchable_volume(&root) {
            skipped.push(Skipped {
                title: target.title.clone(),
                reason,
            });
            continue;
        }

        let group = walk_one(target, &root, needle, ticket, limits);
        if group.match_count > 0 || group.truncated {
            groups.push(group);
        }
    }

    (groups, skipped)
}

fn walk_one(
    target: &Target,
    root: &Path,
    needle: &str,
    ticket: u64,
    limits: Limits,
) -> Group {
    let mut group = Group {
        bookmark_id: target.id.clone(),
        title: target.title.clone(),
        root: root.to_string_lossy().into_owned(),
        matches: Vec::new(),
        match_count: 0,
        truncated: false,
    };

    // (directory, depth) pairs still to visit, walked breadth-first.
    //
    // Breadth-first matters only when the entry budget runs out, but then it
    // matters a lot: depth-first can pour the entire budget down one deep
    // subtree and never look at its siblings, so whether a file is found comes
    // down to the order the filesystem happened to return directories in.
    // Breadth-first spends the budget on the shallowest entries first, which is
    // also where people keep the things they are looking for.
    let mut queue: VecDeque<(PathBuf, usize)> = VecDeque::from([(root.to_path_buf(), 0)]);
    let mut visited = 0usize;

    while let Some((dir, depth)) = queue.pop_front() {
        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            // Permission denied, or the folder vanished mid-walk. Skipping one
            // directory beats failing the whole search.
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            visited += 1;
            if visited > limits.max_entries {
                group.truncated = true;
                return group;
            }
            if visited % CANCEL_CHECK_INTERVAL == 0 && is_superseded(ticket) {
                return group;
            }

            let metadata = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            if is_hidden_or_system(&metadata) {
                continue;
            }

            let name = entry.file_name().to_string_lossy().into_owned();
            let is_dir = metadata.is_dir();

            if name.to_lowercase().contains(needle) {
                group.match_count += 1;
                if group.matches.len() < limits.max_matches_per_group {
                    let full = entry.path();
                    group.matches.push(json!({
                        "name": name,
                        "relPath": relative_to(root, &full),
                        "fullPath": full.to_string_lossy(),
                        "isDir": is_dir,
                        "modifiedAt": modified_at(&metadata),
                    }));
                }
            }

            // Reparse points (junctions, symlinks) are never followed — the user
            // profile is full of them and they loop back on themselves.
            if is_dir
                && depth + 1 < limits.max_depth
                && !is_reparse_point(&metadata)
                && !is_excluded_dir(&name)
            {
                queue.push_back((entry.path(), depth + 1));
            }
        }
    }

    group
}

/// `C:\`, `D:/`, `E:` — a drive root rather than a folder someone picked.
fn is_drive_root(path: &Path) -> bool {
    let text = path.to_string_lossy();
    let trimmed = text.trim_end_matches(['\\', '/']);
    let chars: Vec<char> = trimmed.chars().collect();
    chars.len() == 2 && chars[1] == ':'
}

fn is_excluded_dir(name: &str) -> bool {
    let lower = name.to_lowercase();
    EXCLUDED_DIRS.contains(&lower.as_str())
}

fn relative_to(root: &Path, full: &Path) -> String {
    full.strip_prefix(root)
        .unwrap_or(full)
        .to_string_lossy()
        .into_owned()
}

fn modified_at(metadata: &std::fs::Metadata) -> Option<String> {
    let time = metadata.modified().ok()?;
    Some(chrono::DateTime::<chrono::Utc>::from(time).to_rfc3339())
}

// ---------- Windows specifics ----------

const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
const FILE_ATTRIBUTE_SYSTEM: u32 = 0x4;
const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;

#[cfg(windows)]
fn file_attributes(metadata: &std::fs::Metadata) -> u32 {
    use std::os::windows::fs::MetadataExt;
    metadata.file_attributes()
}

#[cfg(not(windows))]
fn file_attributes(_metadata: &std::fs::Metadata) -> u32 {
    0
}

fn is_hidden_or_system(metadata: &std::fs::Metadata) -> bool {
    file_attributes(metadata) & (FILE_ATTRIBUTE_HIDDEN | FILE_ATTRIBUTE_SYSTEM) != 0
}

fn is_reparse_point(metadata: &std::fs::Metadata) -> bool {
    file_attributes(metadata) & FILE_ATTRIBUTE_REPARSE_POINT != 0
}

/// Network shares and removable media are excluded by default: walking them can
/// block for seconds, or hang outright when the volume goes away mid-search.
#[cfg(windows)]
fn unsearchable_volume(path: &Path) -> Option<&'static str> {
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::GetDriveTypeW;

    const DRIVE_REMOVABLE: u32 = 2;
    const DRIVE_REMOTE: u32 = 4;
    const DRIVE_CDROM: u32 = 5;

    let text = path.to_string_lossy();
    if text.starts_with("\\\\") {
        return Some("network");
    }

    // GetDriveTypeW wants a root of the form "D:\".
    let chars: Vec<char> = text.chars().take(2).collect();
    if chars.len() < 2 || chars[1] != ':' {
        return None;
    }
    let root: String = chars.into_iter().chain(std::iter::once('\\')).collect();
    let mut wide: Vec<u16> = root.encode_utf16().collect();
    wide.push(0);

    match unsafe { GetDriveTypeW(PCWSTR(wide.as_ptr())) } {
        DRIVE_REMOTE => Some("network"),
        DRIVE_REMOVABLE | DRIVE_CDROM => Some("removable"),
        _ => None,
    }
}

#[cfg(not(windows))]
fn unsearchable_volume(_path: &Path) -> Option<&'static str> {
    None
}

/// Lowers this thread's CPU *and* I/O priority so a background walk never
/// competes with whatever the user is actively doing.
#[cfg(windows)]
fn enter_background_priority() {
    use windows::Win32::System::Threading::{
        GetCurrentThread, SetThreadPriority, THREAD_MODE_BACKGROUND_BEGIN,
    };
    unsafe {
        let _ = SetThreadPriority(GetCurrentThread(), THREAD_MODE_BACKGROUND_BEGIN);
    }
}

#[cfg(windows)]
fn leave_background_priority() {
    use windows::Win32::System::Threading::{
        GetCurrentThread, SetThreadPriority, THREAD_MODE_BACKGROUND_END,
    };
    unsafe {
        let _ = SetThreadPriority(GetCurrentThread(), THREAD_MODE_BACKGROUND_END);
    }
}

#[cfg(not(windows))]
fn enter_background_priority() {}

#[cfg(not(windows))]
fn leave_background_priority() {}


#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::atomic::AtomicUsize;

    /// A ticket no live search can ever exceed, so `is_superseded` stays false
    /// and the walk runs to completion.
    const NEVER_CANCELLED: u64 = u64::MAX;

    static COUNTER: AtomicUsize = AtomicUsize::new(0);

    struct TempTree(PathBuf);

    impl TempTree {
        fn new() -> Self {
            let n = COUNTER.fetch_add(1, Ordering::SeqCst);
            let dir = std::env::temp_dir().join(format!(
                "bm-folder-search-{}-{}",
                std::process::id(),
                n
            ));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).expect("create temp tree");
            Self(dir)
        }

        fn path(&self) -> &Path {
            &self.0
        }

        fn file(&self, rel: &str) {
            let full = self.0.join(rel);
            fs::create_dir_all(full.parent().unwrap()).expect("create parent");
            fs::write(full, b"x").expect("write file");
        }
    }

    impl Drop for TempTree {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn target(root: &Path) -> Target {
        Target {
            id: "test-id".into(),
            title: "Test folder".into(),
            path: root.to_string_lossy().into_owned(),
        }
    }

    fn run(root: &Path, needle: &str, limits: Limits) -> Group {
        walk_one(&target(root), root, needle, NEVER_CANCELLED, limits)
    }

    fn names(group: &Group) -> Vec<String> {
        group
            .matches
            .iter()
            .map(|m| m["name"].as_str().unwrap_or_default().to_string())
            .collect()
    }

    #[test]
    fn finds_japanese_names_at_and_within_the_depth_limit() {
        let tree = TempTree::new();
        tree.file("見積書_最終.xlsx");
        tree.file("2026/08/見積根拠.docx");
        tree.file("2026/08/無関係.txt");

        let group = run(tree.path(), "見積", Limits::default());

        let found = names(&group);
        assert_eq!(group.match_count, 2, "found: {found:?}");
        assert!(found.contains(&"見積書_最終.xlsx".to_string()));
        assert!(found.contains(&"見積根拠.docx".to_string()));
    }

    #[test]
    fn does_not_descend_past_the_depth_limit() {
        let tree = TempTree::new();
        // Depth 4 — one level below what max_depth = 3 reaches.
        tree.file("a/b/c/見積_deep.docx");

        let group = run(tree.path(), "見積", Limits::default());

        assert_eq!(group.match_count, 0, "found: {:?}", names(&group));
    }

    #[test]
    fn skips_excluded_directories() {
        let tree = TempTree::new();
        tree.file("node_modules/見積_noise.js");
        tree.file(".git/見積_noise.txt");
        tree.file("見積_real.txt");

        let group = run(tree.path(), "見積", Limits::default());

        assert_eq!(names(&group), vec!["見積_real.txt".to_string()]);
    }

    #[test]
    fn reports_truncation_when_the_entry_budget_runs_out() {
        let tree = TempTree::new();
        for i in 0..10 {
            tree.file(&format!("file{i}.txt"));
        }

        let limits = Limits {
            max_entries: 5,
            ..Limits::default()
        };
        let group = run(tree.path(), "file", limits);

        assert!(group.truncated, "expected the walk to report truncation");
        assert!(group.match_count <= 6);
    }

    #[test]
    fn caps_kept_matches_but_still_counts_them_all() {
        let tree = TempTree::new();
        for i in 0..5 {
            tree.file(&format!("見積_{i}.txt"));
        }

        let limits = Limits {
            max_matches_per_group: 2,
            ..Limits::default()
        };
        let group = run(tree.path(), "見積", limits);

        assert_eq!(group.matches.len(), 2, "kept matches should be capped");
        assert_eq!(group.match_count, 5, "true count should still be reported");
    }

    #[test]
    fn spends_a_tight_budget_on_shallow_entries_first() {
        let tree = TempTree::new();
        // Alphabetically first, so a depth-first walk reaches it last.
        tree.file("a_target/見積.txt");
        // A deep subtree big enough to swallow the whole budget.
        for i in 0..50 {
            tree.file(&format!("z_deep/deep/filler{i}.txt"));
        }

        let limits = Limits {
            max_entries: 10,
            ..Limits::default()
        };
        let group = run(tree.path(), "見積", limits);

        // Depth-first would burn the budget inside z_deep and never open
        // a_target at all.
        assert_eq!(group.match_count, 1, "found: {:?}", names(&group));
    }

    #[test]
    fn treats_drive_roots_as_not_a_curated_scope() {
        for raw in ["C:\\", "D:/", "E:"] {
            assert!(
                is_drive_root(Path::new(raw)),
                "{raw} should be recognised as a drive root"
            );
        }
        for raw in [r"C:\work", "D:/projects/app", r"\\server\share"] {
            assert!(
                !is_drive_root(Path::new(raw)),
                "{raw} is a real folder, not a drive root"
            );
        }
    }

    #[test]
    fn matching_ignores_case() {
        let tree = TempTree::new();
        tree.file("Quarterly REPORT.pdf");

        let group = run(tree.path(), "report", Limits::default());

        assert_eq!(group.match_count, 1);
    }


    /// Not a correctness test — a stopwatch for real folders, since every timing
    /// claim in the design doc is an estimate until it is measured on real data.
    ///
    ///   set BM_SEARCH_BENCH=D:\work;C:\Users\me\Documents
    ///   cargo test --lib folder_search::tests::benchmark -- --ignored --nocapture
    #[test]
    #[ignore]
    fn benchmark() {
        let Ok(raw) = std::env::var("BM_SEARCH_BENCH") else {
            println!("set BM_SEARCH_BENCH to one or more folders, separated by ;");
            return;
        };

        for spec in raw.split(';').filter(|s| !s.is_empty()) {
            let root = PathBuf::from(spec);
            if !root.is_dir() {
                println!("{spec}: not a directory, skipped");
                continue;
            }

            for (label, limits) in [
                ("default (excludes on)", Limits::default()),
                ("depth 5", Limits { max_depth: 5, ..Limits::default() }),
            ] {
                // Run twice: the first pass warms the OS directory cache, the
                // second is what a user who has touched the folder today sees.
                let cold = std::time::Instant::now();
                let group = run(&root, "report", limits);
                let cold = cold.elapsed();

                let warm = std::time::Instant::now();
                let group2 = run(&root, "report", limits);
                let warm = warm.elapsed();

                println!(
                    "{spec} [{label}]: cold {cold:?}, warm {warm:?}, matches {} (truncated: {}) / second pass {}",
                    group.match_count, group.truncated, group2.match_count
                );
            }
        }
    }

    #[cfg(windows)]
    #[test]
    fn does_not_follow_junctions() {
        let tree = TempTree::new();
        tree.file("real/見積_target.txt");

        let link = tree.path().join("link");
        let status = std::process::Command::new("cmd")
            .args(["/c", "mklink", "/J"])
            .arg(&link)
            .arg(tree.path().join("real"))
            .status();

        // Junction creation needs no elevation, but a locked-down environment
        // can still refuse it. Skip rather than fail on an unrelated cause.
        match status {
            Ok(s) if s.success() => {}
            _ => return,
        }

        let group = run(tree.path(), "見積", Limits::default());

        // Exactly one hit: through `real`, never a second one through `link`.
        assert_eq!(group.match_count, 1, "found: {:?}", names(&group));
    }
}
