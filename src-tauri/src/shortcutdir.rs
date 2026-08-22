//! Mirror the bookmarked files and folders into one flat Windows folder of
//! `.lnk` shortcuts, so they can be reached from **other applications' file
//! dialogs**.
//!
//! This exists for exactly one moment the app cannot otherwise help with: the
//! user is inside someone else's Open/Attach dialog (Outlook attach, Slack
//! upload, Photoshop place). Clicking a bookmark there is useless — it opens
//! the file in its own app rather than handing the path to the dialog. Windows
//! Quick Access can only pin *folders*, never a set of files scattered across
//! the disk, so there is no built-in way to keep "the files I actually use"
//! one click away. A folder of shortcuts pinned to Quick Access is.
//!
//! Deliberately **flat**: one bookmark, one shortcut, no per-tag subfolders.
//! Tag subfolders would need name sanitizing, rename cascades and whole-folder
//! deletes — the expensive and dangerous parts — to produce a shelf where the
//! same file shows up once per tag.
//!
//! Only `kind = 'path'` bookmarks are mirrored. A `.url` file cannot be picked
//! in a file dialog, so URLs would be pure noise in the one place this folder
//! is meant to be useful.
//!
//! # Deleting safely
//!
//! This module removes files from a directory the user chose, so it never
//! decides what to delete by looking at the directory. It deletes **only** the
//! files recorded in its own manifest ([`MANIFEST_NAME`]), and only when they
//! still sit directly in the managed directory and still carry the `.lnk`
//! extension. A directory with no manifest therefore has nothing to delete —
//! pointing the setting at an existing folder full of documents can add
//! shortcuts to it, but can never take anything away.
//!
//! Reading targets back out of the `.lnk` files instead would be both slower
//! (a COM round trip per file) and unsafe: a shortcut the user put there by
//! hand is indistinguishable from one this app wrote.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::SystemTime;
use tauri::{AppHandle, Manager};

use crate::db::AppState;

/// Records which files in the managed directory belong to this app. See the
/// module docs — this is the whole of the delete safety story.
const MANIFEST_NAME: &str = ".bookmarks-shortcuts.json";
const MANIFEST_VERSION: u32 = 1;

/// `MAX_PATH` minus the terminating NUL. Shortcut creation is skipped rather
/// than attempted beyond this: the shell writes the file through the ANSI-era
/// path limit regardless of the long-path opt-in, and a half-written `.lnk`
/// is worse than a missing one.
const MAX_LINK_PATH_CHARS: usize = 259;

/// Characters Windows forbids in a file name. Both halves of a generated name
/// come from real filesystem entries, so this only guards the disambiguation
/// suffix against oddities like a bookmark whose parent is a drive root.
const INVALID_NAME_CHARS: &[char] = &['\\', '/', ':', '*', '?', '"', '<', '>', '|'];

// ---------- Manifest ----------

#[derive(Serialize, Deserialize)]
struct Manifest {
    version: u32,
    /// bookmark id → file name (including the `.lnk` extension) in the
    /// managed directory.
    entries: HashMap<String, String>,
}

impl Default for Manifest {
    fn default() -> Self {
        Self {
            version: MANIFEST_VERSION,
            entries: HashMap::new(),
        }
    }
}

impl Manifest {
    /// A missing or unreadable manifest yields an empty one, which makes the
    /// next reconcile purely additive. That is the intended failure mode: the
    /// app would rather leave orphans behind than delete a file it cannot
    /// prove it created.
    fn load(dir: &Path) -> Self {
        let path = dir.join(MANIFEST_NAME);
        let Ok(text) = std::fs::read_to_string(&path) else {
            return Self::default();
        };
        match serde_json::from_str::<Manifest>(&text) {
            Ok(m) if m.version == MANIFEST_VERSION => m,
            Ok(_) => {
                log::warn!("shortcut manifest has an unknown version; starting fresh");
                Self::default()
            }
            Err(e) => {
                log::warn!("shortcut manifest is unreadable ({e}); starting fresh");
                Self::default()
            }
        }
    }

    fn save(&self, dir: &Path) -> Result<(), String> {
        let path = dir.join(MANIFEST_NAME);
        let text = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        std::fs::write(&path, text).map_err(|e| format!("failed to write manifest: {e}"))
    }
}

// ---------- Targets ----------

/// One bookmark that should have a shortcut.
pub struct Target {
    id: String,
    title: String,
    path: PathBuf,
    /// When the bookmark was last opened, stamped onto the shortcut as its
    /// modified time. Sorting a file dialog by "Date modified" then puts the
    /// recently used files on top, which is the only ordering the shelf can
    /// offer once it is flat.
    accessed: Option<SystemTime>,
}

/// Bookmark timestamps are RFC 3339 strings; a shortcut's modified time is a
/// `SystemTime`. A row with neither timestamp keeps whatever the filesystem
/// gave the file.
fn parse_time(raw: Option<String>) -> Option<SystemTime> {
    let raw = raw?;
    let parsed = chrono::DateTime::parse_from_rfc3339(&raw).ok()?;
    Some(SystemTime::from(parsed.with_timezone(&chrono::Utc)))
}

/// Read the path bookmarks. Sorted by id so that the disambiguation suffixes
/// picked in [`resolve_names`] stay the same between runs — otherwise two
/// colliding names could swap which one gets the parenthesized parent, and
/// every reconcile would churn both files.
pub fn collect_targets(conn: &rusqlite::Connection) -> Result<Vec<Target>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, title, url, last_accessed_at, created_at \
             FROM bookmarks WHERE kind = 'path' ORDER BY id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            // A bookmark that has never been opened falls back to when it was
            // added, so the shelf still sorts sensibly on day one.
            let accessed = parse_time(r.get::<_, Option<String>>(3)?)
                .or_else(|| parse_time(r.get::<_, Option<String>>(4).ok()?));
            Ok(Target {
                id: r.get::<_, String>(0)?,
                title: r.get::<_, String>(1)?,
                path: PathBuf::from(r.get::<_, String>(2)?),
                accessed,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

/// Where shortcuts go when the user has not chosen a location.
pub fn default_dir() -> Result<PathBuf, String> {
    let home = std::env::var("USERPROFILE")
        .map_err(|_| "USERPROFILE is not set".to_string())?;
    Ok(PathBuf::from(home).join("Bookmarks"))
}

pub struct Config {
    pub enabled: bool,
    pub dir: PathBuf,
}

/// A blank stored path is treated the same as no path at all, which is what
/// lets the settings screen offer "reset to default" without a separate flag.
pub fn load_config(conn: &rusqlite::Connection) -> Result<Config, String> {
    let (enabled, path) = conn
        .query_row(
            "SELECT shortcut_dir_enabled, shortcut_dir_path FROM user_settings WHERE id = 1",
            [],
            |r| Ok((r.get::<_, i64>(0)?, r.get::<_, Option<String>>(1)?)),
        )
        .map_err(|e| e.to_string())?;

    let dir = match path.filter(|p| !p.trim().is_empty()) {
        Some(p) => PathBuf::from(p),
        None => default_dir()?,
    };
    Ok(Config {
        enabled: enabled != 0,
        dir,
    })
}

// ---------- Naming ----------

/// Decide the file name for every target, resolving collisions.
///
/// The name is the **real file name including its extension**, not the
/// bookmark title: the folder is a shelf to be read inside a file dialog,
/// where the extension carries both the filter match and most of the
/// recognizability. Explorer hides the trailing `.lnk`, so `仕様書.docx.lnk`
/// reads as `仕様書.docx`.
fn resolve_names(targets: &[Target]) -> HashMap<String, String> {
    let mut used: HashSet<String> = HashSet::new();
    let mut names = HashMap::new();

    for t in targets {
        let base = base_name(t);
        // Windows file names are case-insensitive, so collisions must be too.
        let mut candidate = format!("{base}.lnk");
        if used.contains(&candidate.to_lowercase()) {
            // Same file name in two different places: tell them apart by the
            // folder they live in, which is what the user would say out loud.
            if let Some(parent) = parent_label(&t.path) {
                candidate = format!("{}.lnk", insert_suffix(&base, &parent));
            }
        }
        if used.contains(&candidate.to_lowercase()) {
            // Same name *and* same parent name. Rare enough that legibility
            // stops mattering; correctness does not.
            let short = t.id.chars().take(6).collect::<String>();
            candidate = format!("{}.lnk", insert_suffix(&base, &short));
        }
        used.insert(candidate.to_lowercase());
        names.insert(t.id.clone(), candidate);
    }

    names
}

/// The target's own file or folder name, falling back to the bookmark title
/// and then the id. A path can legitimately have no final component (`D:\`).
fn base_name(t: &Target) -> String {
    let from_path = t
        .path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .filter(|n| !n.trim().is_empty());

    let raw = from_path
        .or_else(|| {
            let title = t.title.trim();
            (!title.is_empty()).then(|| title.to_string())
        })
        .unwrap_or_else(|| t.id.clone());

    sanitize(&raw)
}

/// The name of the folder the target sits in, used to disambiguate.
fn parent_label(path: &Path) -> Option<String> {
    let name = path.parent()?.file_name()?.to_string_lossy().to_string();
    let clean = sanitize(&name);
    (!clean.trim().is_empty()).then_some(clean)
}

/// `見積書.xlsx` + `案件A` → `見積書 (案件A).xlsx`. Extensionless names (most
/// folders) simply get the suffix appended.
fn insert_suffix(base: &str, suffix: &str) -> String {
    match base.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() => format!("{stem} ({suffix}).{ext}"),
        _ => format!("{base} ({suffix})"),
    }
}

fn sanitize(name: &str) -> String {
    name.replace(INVALID_NAME_CHARS, "_")
        .trim_end_matches([' ', '.'])
        .to_string()
}

// ---------- Reconcile ----------

#[derive(Serialize, Default)]
pub struct Report {
    dir: String,
    created: usize,
    removed: usize,
    /// Bookmarks that could not get a shortcut, with the reason. One bad path
    /// never stops the rest of the run.
    skipped: Vec<String>,
}

/// Bring the managed directory in line with `targets`: create what is missing,
/// remove what this app previously created and no longer needs, leave
/// everything else alone.
pub fn reconcile(dir: PathBuf, targets: Vec<Target>) -> Result<Report, String> {
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("failed to create {}: {e}", dir.display()))?;

    let mut manifest = Manifest::load(&dir);
    let desired = resolve_names(&targets);
    let mut report = Report {
        dir: dir.to_string_lossy().to_string(),
        ..Default::default()
    };

    let _com = ComGuard::new()?;

    for t in &targets {
        let Some(name) = desired.get(&t.id) else {
            continue;
        };
        let link = dir.join(name);

        // Already correct and still on disk: only the timestamp can have moved
        // on. The `exists` check matters because the user is free to delete
        // shortcuts by hand, and the next sync should quietly put them back.
        let recorded = manifest.entries.get(&t.id);
        if recorded == Some(name) && link.exists() {
            stamp_time(&link, t.accessed);
            continue;
        }

        // The bookmark was renamed or its path changed: drop the old file
        // before writing the new one, or the directory accumulates both.
        if let Some(old) = recorded.filter(|old| *old != name).cloned() {
            if remove_managed(&dir, &old) {
                manifest.entries.remove(&t.id);
            }
        }

        if link.to_string_lossy().chars().count() > MAX_LINK_PATH_CHARS {
            report
                .skipped
                .push(format!("{}: shortcut path exceeds MAX_PATH", t.title));
            continue;
        }

        match write_shortcut(&t.path, &link, &t.title) {
            Ok(()) => {
                stamp_time(&link, t.accessed);
                manifest.entries.insert(t.id.clone(), name.clone());
                report.created += 1;
            }
            Err(e) => {
                log::warn!("shortcut for {} failed: {e}", t.path.display());
                report.skipped.push(format!("{}: {e}", t.title));
            }
        }
    }

    // Anything this app created for a bookmark that is gone.
    let live: HashSet<&String> = targets.iter().map(|t| &t.id).collect();
    let stale: Vec<String> = manifest
        .entries
        .keys()
        .filter(|id| !live.contains(id))
        .cloned()
        .collect();
    for id in stale {
        if let Some(name) = manifest.entries.get(&id).cloned() {
            if remove_managed(&dir, &name) {
                report.removed += 1;
            }
            manifest.entries.remove(&id);
        }
    }

    manifest.save(&dir)?;
    Ok(report)
}

/// Stamp a shortcut with the time its bookmark was last opened. Best effort:
/// the shelf is still usable when a timestamp will not take, so a failure is
/// logged rather than surfaced as a skipped bookmark.
fn stamp_time(link: &Path, accessed: Option<SystemTime>) {
    let Some(accessed) = accessed else {
        return;
    };
    // Setting times needs write access to the handle, not just the path.
    let file = match std::fs::File::options().write(true).open(link) {
        Ok(file) => file,
        Err(e) => {
            log::warn!("could not open {} to stamp its time: {e}", link.display());
            return;
        }
    };
    if let Err(e) = file.set_times(std::fs::FileTimes::new().set_modified(accessed)) {
        log::warn!("could not stamp {}: {e}", link.display());
    }
}

/// Delete one file the manifest claims. Every condition here is a guard
/// against deleting something this app did not create: the name must be a
/// bare file name (no traversal), must be a `.lnk`, and must resolve to a file
/// sitting directly in the managed directory.
fn remove_managed(dir: &Path, name: &str) -> bool {
    if name.contains(['\\', '/']) || Path::new(name).extension() != Some("lnk".as_ref()) {
        log::warn!("refusing to delete an unexpected manifest entry: {name}");
        return false;
    }
    let path = dir.join(name);
    if path.parent() != Some(dir) {
        log::warn!("refusing to delete outside the managed directory: {name}");
        return false;
    }
    match std::fs::remove_file(&path) {
        Ok(()) => true,
        // Already gone (the user deleted it) counts as done.
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => true,
        Err(e) => {
            log::warn!("failed to delete {}: {e}", path.display());
            false
        }
    }
}

// ---------- Shortcut writing (COM) ----------

/// COM has to be initialized on the thread that talks to the shell, and
/// uninitialized on the same thread. Reconcile runs on a dedicated blocking
/// thread, so the guard's lifetime is the run.
#[cfg(target_os = "windows")]
struct ComGuard;

#[cfg(target_os = "windows")]
impl ComGuard {
    fn new() -> Result<Self, String> {
        use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};
        unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) }
            .ok()
            .map_err(|e| format!("COM init failed: {e}"))?;
        Ok(Self)
    }
}

#[cfg(target_os = "windows")]
impl Drop for ComGuard {
    fn drop(&mut self) {
        use windows::Win32::System::Com::CoUninitialize;
        unsafe { CoUninitialize() };
    }
}

#[cfg(target_os = "windows")]
fn write_shortcut(target: &Path, link: &Path, description: &str) -> Result<(), String> {
    use windows::core::{Interface, HSTRING};
    use windows::Win32::System::Com::{
        CoCreateInstance, IPersistFile, CLSCTX_INPROC_SERVER,
    };
    use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};

    if !target.exists() {
        return Err("target no longer exists".to_string());
    }

    unsafe {
        let shell_link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)
            .map_err(|e| format!("CoCreateInstance failed: {e}"))?;

        shell_link
            .SetPath(&HSTRING::from(target.as_os_str()))
            .map_err(|e| format!("SetPath failed: {e}"))?;

        // Gives the shortcut the same working directory the file would have
        // been opened from, which some applications rely on.
        if let Some(parent) = target.parent() {
            let _ = shell_link.SetWorkingDirectory(&HSTRING::from(parent.as_os_str()));
        }

        // The file name carries the identity; the bookmark title becomes the
        // tooltip, so a custom label is not lost.
        let _ = shell_link.SetDescription(&HSTRING::from(description));

        let persist: IPersistFile = shell_link
            .cast()
            .map_err(|e| format!("IPersistFile cast failed: {e}"))?;
        persist
            .Save(&HSTRING::from(link.as_os_str()), true)
            .map_err(|e| format!("saving the shortcut failed: {e}"))?;
    }

    Ok(())
}

// ---------- Quick Access ----------

/// The verb behind Explorer's own "Pin to Quick access" menu item. Windows 11
/// shows it as "Pin to Home"; the verb name did not change with the label.
#[cfg(target_os = "windows")]
const PIN_VERB: &str = "pintohome";

/// Its counterpart, used when the feature is switched off.
#[cfg(target_os = "windows")]
const UNPIN_VERB: &str = "unpinfromhome";

/// Quick Access has no filesystem path, so it is addressed by its CLSID.
#[cfg(target_os = "windows")]
const QUICK_ACCESS: &str = "shell:::{679F85CB-0220-4080-B29B-5540CC05AAB6}";

/// Pinning is a shell action, so it is asked for rather than performed: the
/// verb is posted to Explorer and can complete after the call returns.
#[cfg(target_os = "windows")]
const PIN_CONFIRM_ATTEMPTS: usize = 15;
#[cfg(target_os = "windows")]
const PIN_CONFIRM_INTERVAL: std::time::Duration = std::time::Duration::from_millis(100);

/// Put the shortcut folder in Explorer's Quick Access, which is what makes it
/// reachable from the left pane of every file dialog. Returns whether the
/// folder is pinned once the call is done.
///
/// `InvokeVerb` reports success even for a verb that does not exist, so its
/// result is not trusted — the pinned list is read back instead. That is also
/// the only way to tell "already pinned" from "just pinned".
#[cfg(target_os = "windows")]
fn pin_to_quick_access(dir: &Path) -> Result<bool, String> {
    use windows::core::Interface;
    use windows::Win32::System::Variant::VARIANT;
    use windows::Win32::UI::Shell::Folder2;

    let path = dir.to_string_lossy().to_string();

    with_shell(|shell| unsafe {
        if is_pinned(shell, dir) {
            return Ok(true);
        }

        let folder = shell
            .NameSpace(&VARIANT::from(path.as_str()))
            .map_err(|e| format!("could not open {path}: {e}"))?;
        let item = folder
            .cast::<Folder2>()
            .map_err(|e| format!("the shell did not describe {path}: {e}"))?
            .Self_()
            .map_err(|e| format!("the shell did not describe {path}: {e}"))?;

        if let Err(e) = item.InvokeVerb(&VARIANT::from(PIN_VERB)) {
            log::warn!("pintohome was refused: {e}");
        }

        for _ in 0..PIN_CONFIRM_ATTEMPTS {
            if is_pinned(shell, dir) {
                return Ok(true);
            }
            std::thread::sleep(PIN_CONFIRM_INTERVAL);
        }
        Ok(false)
    })?
}

/// Take the shortcut folder back out of Quick Access.
///
/// Called when the feature is switched off, because [`cleanup`] deletes the
/// folder the pin points at — leaving it would put a dead entry in the user's
/// Explorer sidebar that they never asked for and have to remove by hand.
///
/// Best effort throughout: an unpin that does not happen is untidy, not
/// harmful, and must never stop the rest of the cleanup. Returns whether the
/// folder is gone from Quick Access afterwards.
#[cfg(target_os = "windows")]
fn unpin_from_quick_access(dir: &Path) -> bool {
    use windows::Win32::System::Variant::VARIANT;

    let result = with_shell(|shell| unsafe {
        for item in pinned_items_matching(shell, |path| same_path(path, dir)) {
            if let Err(e) = item.InvokeVerb(&VARIANT::from(UNPIN_VERB)) {
                log::warn!("unpinfromhome was refused: {e}");
            }
        }
        // Like pinning, the removal can land after the call returns.
        for _ in 0..PIN_CONFIRM_ATTEMPTS {
            if !is_pinned(shell, dir) {
                return true;
            }
            std::thread::sleep(PIN_CONFIRM_INTERVAL);
        }
        false
    });

    match result {
        Ok(done) => done,
        Err(e) => {
            log::warn!("could not reach Quick Access to unpin: {e}");
            false
        }
    }
}

/// Whether the folder currently sits in Quick Access, asked from scratch.
/// Used by the settings screen to decide which way its toggle points.
#[cfg(target_os = "windows")]
fn quick_access_contains(dir: &Path) -> bool {
    with_shell(|shell| unsafe { is_pinned(shell, dir) }).unwrap_or(false)
}

/// Run `f` with a live shell automation object, with COM set up around it.
#[cfg(target_os = "windows")]
fn with_shell<T>(
    f: impl FnOnce(&windows::Win32::UI::Shell::IShellDispatch) -> T,
) -> Result<T, String> {
    use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL};
    use windows::Win32::UI::Shell::{IShellDispatch, Shell};

    let _com = ComGuard::new()?;
    let shell: IShellDispatch = unsafe { CoCreateInstance(&Shell, None, CLSCTX_ALL) }
        .map_err(|e| format!("could not reach the Windows shell: {e}"))?;
    Ok(f(&shell))
}

/// The Quick Access entries whose path satisfies `matches`.
///
/// Collected before anything is done to them: invoking a verb changes the
/// collection, so acting while iterating would skip entries.
#[cfg(target_os = "windows")]
unsafe fn pinned_items_matching(
    shell: &windows::Win32::UI::Shell::IShellDispatch,
    matches: impl Fn(&str) -> bool,
) -> Vec<windows::Win32::UI::Shell::FolderItem> {
    use windows::Win32::System::Variant::VARIANT;

    let mut found = Vec::new();
    unsafe {
        let Ok(folder) = shell.NameSpace(&VARIANT::from(QUICK_ACCESS)) else {
            return found;
        };
        let Ok(items) = folder.Items() else {
            return found;
        };
        for index in 0..items.Count().unwrap_or(0) {
            // The shell's collections index on VT_I4. A VT_I8 variant — what
            // `i64` produces — is refused, and every lookup comes back empty.
            let Ok(item) = items.Item(&VARIANT::from(index)) else {
                continue;
            };
            let Ok(path) = item.Path() else { continue };
            if matches(&path.to_string()) {
                found.push(item);
            }
        }
    }
    found
}

/// Whether `dir` is among the folders pinned to Quick Access. Anything that
/// goes wrong reading the list is reported as "not pinned", which at worst
/// asks the shell to pin something that is already there.
#[cfg(target_os = "windows")]
unsafe fn is_pinned(shell: &windows::Win32::UI::Shell::IShellDispatch, dir: &Path) -> bool {
    unsafe { !pinned_items_matching(shell, |path| same_path(path, dir)).is_empty() }
}

/// Windows paths are case-insensitive, and the shell is inconsistent about
/// the trailing separator.
#[cfg(target_os = "windows")]
fn same_path(a: &str, b: &Path) -> bool {
    let normalize = |s: &str| s.trim_end_matches(['\\', '/']).to_lowercase();
    normalize(a) == normalize(&b.to_string_lossy())
}

// Shortcuts are a Windows shell concept. The rest of the module still compiles
// elsewhere so `cargo check` on another host stays useful.
#[cfg(not(target_os = "windows"))]
struct ComGuard;

#[cfg(not(target_os = "windows"))]
impl ComGuard {
    fn new() -> Result<Self, String> {
        Ok(Self)
    }
}

#[cfg(not(target_os = "windows"))]
fn write_shortcut(_target: &Path, _link: &Path, _description: &str) -> Result<(), String> {
    Err("shortcuts are only supported on Windows".to_string())
}

#[cfg(not(target_os = "windows"))]
fn pin_to_quick_access(_dir: &Path) -> Result<bool, String> {
    Err("Quick Access is only available on Windows".to_string())
}

#[cfg(not(target_os = "windows"))]
fn unpin_from_quick_access(_dir: &Path) -> bool {
    false
}

#[cfg(not(target_os = "windows"))]
fn quick_access_contains(_dir: &Path) -> bool {
    false
}

// ---------- Sync scheduling ----------

/// How long a sync request waits for a quieter moment. Bulk operations — an
/// import, "delete all" — fire one request per row; without this the folder
/// would be rebuilt hundreds of times for one user action.
const DEBOUNCE: std::time::Duration = std::time::Duration::from_millis(300);

/// Which sync request is the newest. Anything older gives up when it wakes.
static SYNC_TICKET: AtomicU64 = AtomicU64::new(0);

/// Ask for the shortcut folder to be brought up to date. Returns immediately;
/// callers are database commands on the UI's critical path and must not wait
/// for the disk.
pub fn request_sync(app: &AppHandle) {
    let ticket = SYNC_TICKET.fetch_add(1, Ordering::SeqCst) + 1;
    let app = app.clone();

    // A blocking thread rather than a timer: the work that follows the sleep is
    // itself blocking (one file write per bookmark, inside a COM apartment), so
    // this needs no async timer machinery.
    tauri::async_runtime::spawn_blocking(move || {
        std::thread::sleep(DEBOUNCE);
        if SYNC_TICKET.load(Ordering::SeqCst) != ticket {
            return; // Superseded — the newer request covers this change too.
        }
        match sync_now(&app) {
            Ok(Some(report)) if !report.skipped.is_empty() => {
                log::warn!("shortcut sync skipped {} bookmark(s)", report.skipped.len());
            }
            Err(e) => log::warn!("shortcut sync failed: {e}"),
            _ => {}
        }
    });
}

/// Run a reconcile now. `Ok(None)` means there was nothing to do because the
/// feature is off and has left nothing behind — the common case, not a failure.
pub fn sync_now(app: &AppHandle) -> Result<Option<Report>, String> {
    let state = app.state::<AppState>();
    let (enabled, dir, targets) = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        let config = load_config(&conn)?;
        // Reading the bookmarks even when the feature is off costs one query
        // and keeps the lock held once instead of twice.
        (config.enabled, config.dir, collect_targets(&conn)?)
    };

    if !enabled {
        // Switched off: take back what this app created, but only if it has
        // been here before. Without the manifest there is nothing of ours to
        // remove, and creating the directory just to empty it would be absurd.
        if !dir.join(MANIFEST_NAME).exists() {
            return Ok(None);
        }
        return cleanup(&dir).map(Some);
    }

    reconcile(dir, targets).map(Some)
}

/// Re-stamp one bookmark's shortcut after it was opened, so a file dialog
/// sorted by "Date modified" keeps up.
///
/// Opening a bookmark is the app's most frequent action, so this deliberately
/// does **not** go through [`request_sync`]: a full reconcile would touch every
/// shortcut on every click. Nothing else can have changed — the file and its
/// name are the same — so one timestamp is the whole job.
pub fn touch(app: &AppHandle, id: &str) {
    let app = app.clone();
    let id = id.to_string();

    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let (dir, accessed) = {
            let Ok(conn) = state.conn.lock() else { return };
            let Ok(config) = load_config(&conn) else { return };
            if !config.enabled {
                return;
            }
            let accessed = conn
                .query_row(
                    "SELECT last_accessed_at FROM bookmarks WHERE id = ?1 AND kind = 'path'",
                    [&id],
                    |r| r.get::<_, Option<String>>(0),
                )
                .ok()
                .flatten();
            (config.dir, parse_time(accessed))
        };

        // Not in the manifest means it is a URL bookmark, or the folder has
        // never been built. Either way there is nothing to stamp.
        if let Some(name) = Manifest::load(&dir).entries.get(&id) {
            stamp_time(&dir.join(name), accessed);
        }
    });
}

/// Undo the folder: delete the shortcuts recorded in the manifest, the
/// manifest itself, and finally the directory — but only when it is empty, so
/// anything the user keeps there survives switching the feature off.
fn cleanup(dir: &Path) -> Result<Report, String> {
    let manifest = Manifest::load(dir);
    let mut report = Report {
        dir: dir.to_string_lossy().to_string(),
        ..Default::default()
    };

    for name in manifest.entries.values() {
        if remove_managed(dir, name) {
            report.removed += 1;
        }
    }

    let _ = std::fs::remove_file(dir.join(MANIFEST_NAME));
    // `remove_dir` refuses a non-empty directory, which is exactly the check
    // that needs making here.
    let _ = std::fs::remove_dir(dir);

    // The pin has to go with the folder. Left behind it becomes a dead entry
    // in the Explorer sidebar, pointing at a directory that no longer exists.
    let _ = unpin_from_quick_access(dir);

    Ok(report)
}

// ---------- Commands ----------

/// The folder the settings point at, resolved through [`load_config`].
fn configured_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let state = app.state::<AppState>();
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    Ok(load_config(&conn)?.dir)
}

/// Rebuild the shortcut folder on demand, for the settings screen's
/// "Sync now". Automatic syncs go through [`request_sync`] instead.
#[tauri::command]
pub async fn sync_shortcut_dir(app: AppHandle) -> Result<Value, String> {
    // Off the caller's thread: this touches the disk once per bookmark and
    // holds a COM apartment for the duration.
    let report = tauri::async_runtime::spawn_blocking(move || sync_now(&app))
        .await
        .map_err(|e| e.to_string())??;

    match report {
        Some(report) => Ok(json!(report)),
        None => Ok(json!({ "enabled": false })),
    }
}

/// Ask for a folder to keep the shortcuts in. Returns `cancelled` rather than
/// an error when the user backs out, matching `import_data`.
#[tauri::command]
pub async fn pick_shortcut_dir(app: AppHandle) -> Result<Value, String> {
    use tauri_plugin_dialog::DialogExt;

    let picked = tauri::async_runtime::spawn_blocking({
        let app = app.clone();
        move || app.dialog().file().blocking_pick_folder()
    })
    .await
    .map_err(|e| e.to_string())?;

    match picked {
        None => Ok(json!({ "cancelled": true })),
        Some(folder) => {
            let tauri_plugin_dialog::FilePath::Path(path) = folder else {
                return Err("expected a folder path".to_string());
            };
            Ok(json!({ "path": path.to_string_lossy() }))
        }
    }
}

/// Pin the shortcut folder to Quick Access, so it sits in the left pane of
/// every file dialog. `pinned: false` means the shell declined without
/// saying so, and the user has to use Explorer's own menu item.
#[tauri::command]
pub async fn pin_shortcut_dir(app: AppHandle) -> Result<Value, String> {
    let dir = configured_dir(&app)?;

    let pinned = tauri::async_runtime::spawn_blocking(move || {
        // Explorer will not pin a folder that does not exist yet.
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("failed to create {}: {e}", dir.display()))?;
        pin_to_quick_access(&dir)
    })
    .await
    .map_err(|e| e.to_string())??;

    Ok(json!({ "pinned": pinned }))
}

/// Take the shortcut folder back out of Quick Access, for the settings
/// screen's toggle. `pinned` reports the state afterwards, so the UI never has
/// to assume the action worked.
#[tauri::command]
pub async fn unpin_shortcut_dir(app: AppHandle) -> Result<Value, String> {
    let dir = configured_dir(&app)?;

    let removed = tauri::async_runtime::spawn_blocking(move || unpin_from_quick_access(&dir))
        .await
        .map_err(|e| e.to_string())?;

    Ok(json!({ "pinned": !removed }))
}

/// Whether the shortcut folder is currently pinned. Asked when the settings
/// dialog opens, because the user can pin or unpin it from Explorer at any
/// time and the toggle has to reflect what is actually there.
#[tauri::command]
pub async fn shortcut_dir_pinned(app: AppHandle) -> Result<Value, String> {
    let dir = configured_dir(&app)?;

    let pinned = tauri::async_runtime::spawn_blocking(move || quick_access_contains(&dir))
        .await
        .map_err(|e| e.to_string())?;

    Ok(json!({ "pinned": pinned }))
}

/// Show the shortcut folder in Explorer. Creating it first means the button
/// works the moment the feature is switched on, before any sync has run.
#[tauri::command]
pub fn open_shortcut_dir(app: AppHandle) -> Result<Value, String> {
    let dir = configured_dir(&app)?;

    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("failed to create {}: {e}", dir.display()))?;
    tauri_plugin_opener::open_path(&dir, None::<&str>).map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static COUNTER: AtomicUsize = AtomicUsize::new(0);

    /// Every directory this suite creates starts with this, which is also how
    /// [`UnpinOnDrop`] recognizes its own leftovers.
    const TEMP_DIR_PREFIX: &str = "bm-shortcutdir-";

    /// A throwaway directory pair: `root` holds the files being bookmarked,
    /// `managed` is the shortcut folder under test.
    struct TempDirs {
        root: PathBuf,
        managed: PathBuf,
    }

    impl TempDirs {
        fn new() -> Self {
            let n = COUNTER.fetch_add(1, Ordering::SeqCst);
            let base = std::env::temp_dir()
                .join(format!("{TEMP_DIR_PREFIX}{}-{}", std::process::id(), n));
            let _ = fs::remove_dir_all(&base);
            let root = base.join("src");
            let managed = base.join("managed");
            fs::create_dir_all(&root).expect("create root");
            Self { root, managed }
        }

        /// Create a real file to point at — `write_shortcut` refuses targets
        /// that do not exist.
        fn file(&self, rel: &str) -> PathBuf {
            let full = self.root.join(rel);
            fs::create_dir_all(full.parent().unwrap()).expect("create parent");
            fs::write(&full, b"x").expect("write file");
            full
        }

        fn dir(&self, rel: &str) -> PathBuf {
            let full = self.root.join(rel);
            fs::create_dir_all(&full).expect("create dir");
            full
        }

        fn managed_names(&self) -> Vec<String> {
            let mut out: Vec<String> = fs::read_dir(&self.managed)
                .expect("read managed dir")
                .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
                .collect();
            out.sort();
            out
        }
    }

    impl Drop for TempDirs {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(self.root.parent().unwrap());
        }
    }

    /// Read a `.lnk` back through the shell. Asserting that the file exists
    /// only proves something was written; this proves Windows can resolve it
    /// to the intended target, which is the whole point of the module.
    #[cfg(target_os = "windows")]
    fn shortcut_target(link: &Path) -> String {
        use windows::core::{Interface, HSTRING};
        use windows::Win32::Storage::FileSystem::WIN32_FIND_DATAW;
        use windows::Win32::System::Com::{
            CoCreateInstance, IPersistFile, CLSCTX_INPROC_SERVER, STGM_READ,
        };
        use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};

        let _com = ComGuard::new().expect("com init");
        unsafe {
            let shell_link: IShellLinkW =
                CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).expect("create");
            let persist: IPersistFile = shell_link.cast().expect("cast");
            persist
                .Load(&HSTRING::from(link.as_os_str()), STGM_READ)
                .expect("load shortcut");

            let mut buf = [0u16; 1024];
            let mut find = WIN32_FIND_DATAW::default();
            shell_link
                .GetPath(&mut buf, &mut find, 0)
                .expect("read target");
            String::from_utf16_lossy(&buf)
                .trim_end_matches('\0')
                .to_string()
        }
    }

    fn target(id: &str, title: &str, path: PathBuf) -> Target {
        Target {
            id: id.to_string(),
            title: title.to_string(),
            path,
            accessed: None,
        }
    }

    fn target_opened_at(id: &str, path: PathBuf, accessed: SystemTime) -> Target {
        Target {
            accessed: Some(accessed),
            ..target(id, "opened", path)
        }
    }

    fn modified_time(path: &Path) -> SystemTime {
        fs::metadata(path).expect("metadata").modified().expect("mtime")
    }

    /// The two columns `load_config` reads, without pulling in the full schema.
    fn settings_db(enabled: i64, path: Option<&str>) -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().expect("open memory db");
        conn.execute_batch(
            "CREATE TABLE user_settings (
                 id INTEGER PRIMARY KEY CHECK (id = 1),
                 shortcut_dir_enabled INTEGER NOT NULL DEFAULT 0,
                 shortcut_dir_path TEXT
             );
             INSERT INTO user_settings (id) VALUES (1);",
        )
        .expect("create settings table");
        conn.execute(
            "UPDATE user_settings SET shortcut_dir_enabled = ?1, shortcut_dir_path = ?2",
            rusqlite::params![enabled, path],
        )
        .expect("seed settings");
        conn
    }

    #[test]
    fn config_falls_back_to_the_default_directory() {
        let default = default_dir().expect("default dir");

        let unset = load_config(&settings_db(1, None)).expect("unset");
        assert_eq!(unset.dir, default);
        assert!(unset.enabled);

        // A blank path is how the settings screen says "back to default";
        // taken literally it would try to write to the drive root.
        let blank = load_config(&settings_db(1, Some("   "))).expect("blank");
        assert_eq!(blank.dir, default);

        let chosen = load_config(&settings_db(0, Some(r"D:\shelf"))).expect("chosen");
        assert_eq!(chosen.dir, PathBuf::from(r"D:\shelf"));
        assert!(!chosen.enabled);
    }

    #[test]
    fn name_is_the_real_file_name_not_the_title() {
        let t = TempDirs::new();
        let targets = vec![target(
            "a",
            "案件A の仕様",
            t.file("案件A/仕様書.docx"),
        )];
        let names = resolve_names(&targets);
        assert_eq!(names["a"], "仕様書.docx.lnk");
    }

    #[test]
    fn colliding_names_are_told_apart_by_their_folder() {
        let t = TempDirs::new();
        let targets = vec![
            target("a", "A", t.file("案件A/見積書.xlsx")),
            target("b", "B", t.file("案件B/見積書.xlsx")),
        ];
        let names = resolve_names(&targets);
        assert_eq!(names["a"], "見積書.xlsx.lnk");
        assert_eq!(names["b"], "見積書 (案件B).xlsx.lnk");
    }

    #[test]
    fn folders_have_no_extension_to_insert_before() {
        let t = TempDirs::new();
        let targets = vec![
            target("a", "A", t.dir("案件A/納品")),
            target("b", "B", t.dir("案件B/納品")),
        ];
        let names = resolve_names(&targets);
        assert_eq!(names["a"], "納品.lnk");
        assert_eq!(names["b"], "納品 (案件B).lnk");
    }

    #[test]
    fn identical_name_and_folder_falls_back_to_the_id() {
        // Three files with the same name under folders that are themselves all
        // named alike: the parent suffix disambiguates the second, but has
        // nothing left to say about the third.
        let t = TempDirs::new();
        let targets = vec![
            target("aaaaaa11", "A", t.file("x/共有/資料.txt")),
            target("bbbbbb22", "B", t.file("y/共有/資料.txt")),
            target("cccccc33", "C", t.file("z/共有/資料.txt")),
        ];
        let names = resolve_names(&targets);
        assert_eq!(names["aaaaaa11"], "資料.txt.lnk");
        assert_eq!(names["bbbbbb22"], "資料 (共有).txt.lnk");
        assert_eq!(names["cccccc33"], "資料 (cccccc).txt.lnk");
    }

    #[test]
    fn reconcile_creates_then_removes_its_own_shortcuts() {
        let t = TempDirs::new();
        let doc = t.file("案件A/仕様書.docx");
        let folder = t.dir("案件A/納品");

        let report = reconcile(
            t.managed.clone(),
            vec![
                target("a", "仕様書", doc.clone()),
                target("b", "納品データ", folder.clone()),
            ],
        )
        .expect("first reconcile");

        // The shortcuts must resolve to the real file and the real folder. The
        // shell stores a canonical path, so the separators are normalized on
        // both sides before comparing.
        #[cfg(target_os = "windows")]
        {
            let canonical = |p: &Path| p.to_string_lossy().replace('/', "\\");
            assert_eq!(
                shortcut_target(&t.managed.join("仕様書.docx.lnk")),
                canonical(&doc)
            );
            assert_eq!(
                shortcut_target(&t.managed.join("納品.lnk")),
                canonical(&folder)
            );
        }
        assert_eq!(report.created, 2, "skipped: {:?}", report.skipped);
        assert!(report.skipped.is_empty(), "skipped: {:?}", report.skipped);
        assert_eq!(
            t.managed_names(),
            vec![
                ".bookmarks-shortcuts.json".to_string(),
                "仕様書.docx.lnk".to_string(),
                "納品.lnk".to_string(),
            ]
        );

        // The bookmark for the folder is gone; its shortcut must go with it,
        // and the surviving one must be left untouched.
        let report = reconcile(
            t.managed.clone(),
            vec![target("a", "仕様書", t.root.join("案件A/仕様書.docx"))],
        )
        .expect("second reconcile");
        assert_eq!(report.created, 0, "unchanged entries must not be rewritten");
        assert_eq!(report.removed, 1);
        assert_eq!(
            t.managed_names(),
            vec![
                ".bookmarks-shortcuts.json".to_string(),
                "仕様書.docx.lnk".to_string(),
            ]
        );
    }

    #[test]
    fn a_shortcut_deleted_by_hand_comes_back() {
        let t = TempDirs::new();
        let doc = t.file("案件A/仕様書.docx");
        reconcile(t.managed.clone(), vec![target("a", "仕様書", doc.clone())])
            .expect("first reconcile");
        fs::remove_file(t.managed.join("仕様書.docx.lnk")).expect("delete by hand");

        let report = reconcile(t.managed.clone(), vec![target("a", "仕様書", doc)])
            .expect("second reconcile");
        assert_eq!(report.created, 1);
        assert!(t.managed.join("仕様書.docx.lnk").exists());
    }

    #[test]
    fn files_this_app_did_not_create_are_never_deleted() {
        let t = TempDirs::new();
        fs::create_dir_all(&t.managed).expect("create managed");
        // A document the user keeps there, and a shortcut they made by hand:
        // neither is in the manifest, so neither may be touched.
        fs::write(t.managed.join("大事な資料.docx"), b"x").expect("write");
        fs::write(t.managed.join("手作り.lnk"), b"x").expect("write");

        let report = reconcile(t.managed.clone(), vec![]).expect("reconcile");
        assert_eq!(report.removed, 0);
        assert_eq!(
            t.managed_names(),
            vec![
                ".bookmarks-shortcuts.json".to_string(),
                "大事な資料.docx".to_string(),
                "手作り.lnk".to_string(),
            ]
        );
    }

    #[test]
    fn the_shortcut_carries_the_time_the_bookmark_was_last_opened() {
        let t = TempDirs::new();
        let doc = t.file("案件A/仕様書.docx");
        // A fixed point well in the past, so it cannot be confused with the
        // time the file was actually written.
        let opened = SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(1_500_000_000);

        reconcile(
            t.managed.clone(),
            vec![target_opened_at("a", doc.clone(), opened)],
        )
        .expect("reconcile");
        let link = t.managed.join("仕様書.docx.lnk");
        assert_eq!(modified_time(&link), opened);

        // Opening the bookmark again moves the stamp forward even though the
        // shortcut itself does not need rewriting.
        let reopened = opened + std::time::Duration::from_secs(86_400);
        let report = reconcile(
            t.managed.clone(),
            vec![target_opened_at("a", doc, reopened)],
        )
        .expect("second reconcile");
        assert_eq!(report.created, 0, "the shortcut itself is unchanged");
        assert_eq!(modified_time(&link), reopened);
    }

    /// Touches the real Quick Access list, so it is opt-in:
    /// `cargo test pins_a_folder -- --ignored --nocapture`.
    #[test]
    #[ignore]
    #[cfg(target_os = "windows")]
    fn pins_a_folder_to_quick_access() {
        let t = TempDirs::new();
        let dir = t.dir("shelf");

        // The guard is created *before* pinning and unpins on drop, so a
        // panic — or a failure inside `pin_to_quick_access` — still cannot
        // leave an entry in the real Quick Access list.
        let _guard = UnpinOnDrop;

        assert_eq!(pin_to_quick_access(&dir), Ok(true), "pin");
        // Pinning twice is what the button does on a second press: it must
        // report success without adding a duplicate entry.
        assert_eq!(pin_to_quick_access(&dir), Ok(true), "pin again");
        assert_eq!(pinned_count(&dir), 1, "a second press must not duplicate");

        assert!(unpin_from_quick_access(&dir), "unpin reports success");
        assert_eq!(pinned_count(&dir), 0, "unpin");
    }

    /// How many Quick Access entries point at `dir`.
    #[cfg(target_os = "windows")]
    fn pinned_count(dir: &Path) -> usize {
        with_shell(|shell| unsafe {
            pinned_items_matching(shell, |path| same_path(path, dir)).len()
        })
        .expect("reach the shell")
    }

    /// Removes every Quick Access pin this test suite could have created.
    ///
    /// It matches on the temp-directory prefix rather than one exact path so
    /// that stragglers from an earlier run — a crash, or a bug in the unpin
    /// path itself — are swept up too. Test folders are deleted when the run
    /// ends, so a pin left behind points at nothing and is awkward to remove
    /// by hand.
    #[cfg(target_os = "windows")]
    struct UnpinOnDrop;

    #[cfg(target_os = "windows")]
    impl Drop for UnpinOnDrop {
        fn drop(&mut self) {
            use windows::Win32::System::Variant::VARIANT;

            let _ = with_shell(|shell| unsafe {
                for item in pinned_items_matching(shell, |p| p.contains(TEMP_DIR_PREFIX)) {
                    let _ = item.InvokeVerb(&VARIANT::from(UNPIN_VERB));
                }
            });
        }
    }

    #[test]
    fn timestamps_come_from_the_rfc3339_the_database_stores() {
        let parsed = parse_time(Some("2026-08-21T10:30:00.000Z".to_string())).expect("parsed");
        assert_eq!(
            parsed
                .duration_since(SystemTime::UNIX_EPOCH)
                .expect("after epoch")
                .as_secs(),
            1_787_308_200
        );
        assert!(parse_time(None).is_none());
        assert!(parse_time(Some("not a date".to_string())).is_none());
    }

    #[test]
    fn switching_off_takes_back_only_what_it_created() {
        let t = TempDirs::new();
        let doc = t.file("案件A/仕様書.docx");
        reconcile(t.managed.clone(), vec![target("a", "仕様書", doc)]).expect("reconcile");
        fs::write(t.managed.join("ユーザーのメモ.txt"), b"x").expect("write");

        let report = cleanup(&t.managed).expect("cleanup");
        assert_eq!(report.removed, 1);
        // The manifest goes too, but the user's own file keeps the directory
        // alive and untouched.
        assert_eq!(t.managed_names(), vec!["ユーザーのメモ.txt".to_string()]);
    }

    #[test]
    fn switching_off_removes_the_folder_when_nothing_is_left() {
        let t = TempDirs::new();
        let doc = t.file("案件A/仕様書.docx");
        reconcile(t.managed.clone(), vec![target("a", "仕様書", doc)]).expect("reconcile");

        cleanup(&t.managed).expect("cleanup");
        assert!(!t.managed.exists(), "an empty shelf should not be left behind");
    }

    #[test]
    fn remove_managed_refuses_anything_but_a_bare_lnk_in_the_directory() {
        let t = TempDirs::new();
        fs::create_dir_all(&t.managed).expect("create managed");
        fs::write(t.managed.join("plain.txt"), b"x").expect("write");

        assert!(!remove_managed(&t.managed, "plain.txt"), "not a .lnk");
        assert!(!remove_managed(&t.managed, r"..\escape.lnk"), "traversal");
        assert!(!remove_managed(&t.managed, "sub/nested.lnk"), "nested");
        assert!(t.managed.join("plain.txt").exists());
    }

    #[test]
    fn a_missing_target_is_skipped_without_stopping_the_run() {
        let t = TempDirs::new();
        let good = t.file("案件A/仕様書.docx");
        let gone = t.root.join("案件A/消えた.docx");

        let report = reconcile(
            t.managed.clone(),
            vec![
                target("a", "仕様書", good),
                target("b", "消えたファイル", gone),
            ],
        )
        .expect("reconcile");
        assert_eq!(report.created, 1);
        assert_eq!(report.skipped.len(), 1);
        assert!(report.skipped[0].contains("消えたファイル"));
        assert!(t.managed.join("仕様書.docx.lnk").exists());
    }
}
