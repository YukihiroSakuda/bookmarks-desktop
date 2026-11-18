//! Bookmarks an AI assistant has *proposed*, waiting for the user's yes or no.
//!
//! The MCP server (`mcp.rs`) is read-only on purpose. The one thing an
//! assistant may do beyond reading is `suggest_bookmark`, and what that does is
//! put an entry here — in memory, never in the database. Nothing is saved until
//! the user opens the suggestion in the app and presses Save in the ordinary add
//! form, so a page that talks an assistant into suggesting something can waste a
//! click but cannot add, change or delete a bookmark.
//!
//! Held in memory deliberately: a suggestion is a prompt to act now, not data.
//! Restarting the app drops the queue, which is the safe direction.
//!
//! What may be suggested is a web page (plain http/https, no embedded
//! credentials) or a file or folder on a local drive. A path bookmark is opened
//! with its default program when clicked, so a path must be an absolute local
//! path that exists now, and files of a kind that runs code (programs, scripts,
//! installers, shortcuts…) are refused. Everything is text from an AI that may
//! have read hostile pages, so it is bounded, stripped of control characters and
//! rendered by the UI as text only.

use serde::Serialize;
use std::sync::Mutex;

/// Pending suggestions kept at once. A flood is refused rather than queued, so
/// the queue stays something a person can read through.
pub const MAX_PENDING: usize = 20;

const MAX_URL_CHARS: usize = 2048;
const MAX_TITLE_CHARS: usize = 200;
const MAX_REASON_CHARS: usize = 500;
const MAX_TAGS: usize = 5;

/// File types that run code or change what the system does when opened. Not a
/// complete list — the user's confirmation is the real gate — but it keeps the
/// obvious ones from being one careless click away from running.
const LAUNCHABLE_EXTENSIONS: &[&str] = &[
    "exe", "com", "scr", "pif", "msi", "msp", "msix", "appx", "appxbundle", "bat", "cmd", "ps1",
    "psm1", "psd1", "vbs", "vbe", "js", "jse", "wsf", "wsh", "hta", "cpl", "reg", "lnk", "url",
    "scf", "inf", "dll", "sys", "jar", "gadget", "application", "appref-ms", "msc", "chm",
];

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct Suggestion {
    pub id: String,
    /// `"url"` for a web page, `"path"` for a local file or folder — the same
    /// values a bookmark's `kind` takes.
    pub kind: &'static str,
    /// The address, or the local path.
    pub url: String,
    pub title: String,
    pub reason: String,
    pub tags: Vec<String>,
}

/// What a `suggest_bookmark` call amounted to, reported back to the assistant.
#[derive(Debug, PartialEq)]
pub enum Outcome {
    Queued(Suggestion),
    /// The same address is already waiting; nothing was added.
    AlreadyPending,
    /// The user already has this bookmarked; nothing was added.
    AlreadyBookmarked,
}

/// What the local disk says about a suggested path.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Probe {
    Missing,
    File,
    Folder,
}

#[derive(Default)]
pub struct Suggestions {
    pending: Mutex<Vec<Suggestion>>,
}

/// Raw, untrusted fields as received.
pub struct Proposal {
    pub url: String,
    pub title: Option<String>,
    pub reason: Option<String>,
    pub tags: Vec<String>,
}

impl Suggestions {
    /// Validates and queues `proposal`. `existing` are the user's current
    /// bookmark addresses (web and path) and `known_tags` their tag names; tags
    /// the user does not already have are dropped so an assistant cannot invent
    /// categories. `probe` looks a local path up on disk.
    pub fn add(
        &self,
        proposal: Proposal,
        existing: &[String],
        known_tags: &[String],
        probe: impl Fn(&str) -> Probe,
        new_id: impl FnOnce() -> String,
    ) -> Result<Outcome, String> {
        let (kind, location) = normalize_target(&proposal.url, probe)?;
        let key = key_of(&location);

        if existing.iter().any(|u| key_of(u) == key) {
            return Ok(Outcome::AlreadyBookmarked);
        }

        let mut pending = self.pending.lock().map_err(|e| e.to_string())?;
        if pending.iter().any(|s| key_of(&s.url) == key) {
            return Ok(Outcome::AlreadyPending);
        }
        if pending.len() >= MAX_PENDING {
            return Err(format!(
                "There are already {MAX_PENDING} suggestions waiting for the user. \
                 Do not suggest more until they have reviewed them."
            ));
        }

        let suggestion = Suggestion {
            id: new_id(),
            kind,
            url: location,
            title: clean(proposal.title.as_deref().unwrap_or(""), MAX_TITLE_CHARS),
            reason: clean(proposal.reason.as_deref().unwrap_or(""), MAX_REASON_CHARS),
            tags: pick_tags(&proposal.tags, known_tags),
        };
        pending.push(suggestion.clone());
        Ok(Outcome::Queued(suggestion))
    }

    pub fn list(&self) -> Vec<Suggestion> {
        self.pending.lock().map(|p| p.clone()).unwrap_or_default()
    }

    /// Removes one suggestion (dismissed, or saved as a bookmark). Returns
    /// whether it was there.
    pub fn remove(&self, id: &str) -> bool {
        let Ok(mut pending) = self.pending.lock() else { return false };
        let before = pending.len();
        pending.retain(|s| s.id != id);
        pending.len() != before
    }
}

fn is_web(raw: &str) -> bool {
    let lower = raw.trim_start().to_ascii_lowercase();
    lower.starts_with("http://") || lower.starts_with("https://")
}

/// Sorts a suggestion into a web page or a local path and validates it.
fn normalize_target(
    raw: &str,
    probe: impl Fn(&str) -> Probe,
) -> Result<(&'static str, String), String> {
    let raw = raw.trim();
    if raw.is_empty() {
        return Err("url is required".into());
    }
    if raw.chars().count() > MAX_URL_CHARS {
        return Err(format!("url is longer than {MAX_URL_CHARS} characters"));
    }
    if is_web(raw) {
        return normalize_url(raw).map(|u| ("url", u));
    }
    normalize_path(raw, probe).map(|p| ("path", p))
}

/// Accepts only absolute http(s) URLs with a host and no `user:pass@`, which is
/// how `https://trusted.example@evil.example` passes for the first host.
fn normalize_url(raw: &str) -> Result<String, String> {
    let parsed = reqwest::Url::parse(raw).map_err(|_| "url is not a valid absolute URL".to_string())?;
    if parsed.host_str().map_or(true, str::is_empty) {
        return Err("url has no host".into());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("urls that embed a username or password are not accepted".into());
    }
    Ok(parsed.to_string())
}

/// An absolute path on a local drive (`C:\…`) that exists, and — if it is a
/// file — is not a kind that runs code.
fn normalize_path(raw: &str, probe: impl Fn(&str) -> Probe) -> Result<String, String> {
    const HELP: &str = "only http(s) URLs and absolute local paths like C:\\Users\\me\\Documents can be suggested";

    let b = raw.as_bytes();
    let drive_path = b.len() >= 3 && b[0].is_ascii_alphabetic() && b[1] == b':' && (b[2] == b'\\' || b[2] == b'/');
    if !drive_path {
        // Relative paths, `file:` / `javascript:` / `ftp:` schemes, and network
        // (`\\server\share`) or device (`\\?\`, `\\.\`) paths all land here.
        return Err(HELP.into());
    }
    let rest = &raw[2..];
    if rest.contains(':') || rest.chars().any(|c| matches!(c, '<' | '>' | '"' | '|' | '?' | '*')) {
        return Err("the path contains characters Windows does not allow in a path".into());
    }

    let mut path = raw.replace('/', "\\");
    while path.len() > 3 && path.ends_with('\\') {
        path.pop();
    }
    // A drive root (`E:\`) has nothing after the separator to check.
    if path.len() > 3 && path[3..].split('\\').any(|part| part == ".." || part.is_empty()) {
        return Err("the path must not contain .. or empty segments".into());
    }

    match probe(&path) {
        Probe::Missing => Err("that path does not exist on the user's computer".into()),
        Probe::Folder => Ok(path),
        Probe::File => {
            if is_launchable(&path) {
                Err("files that run code (programs, scripts, installers, shortcuts) cannot be suggested".into())
            } else {
                Ok(path)
            }
        }
    }
}

fn is_launchable(path: &str) -> bool {
    let name = path.rsplit('\\').next().unwrap_or(path);
    // Windows ignores trailing dots and spaces, so `run.exe.` is `run.exe`.
    let name = name.trim_end_matches(['.', ' ']);
    match name.rsplit_once('.') {
        Some((_, ext)) => LAUNCHABLE_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()),
        None => false,
    }
}

/// Two addresses that differ only by case of scheme/host, slash direction, a
/// trailing separator or a fragment are the same place for duplicate purposes.
fn key_of(s: &str) -> String {
    if is_web(s) {
        return match reqwest::Url::parse(s.trim()) {
            Ok(mut u) => {
                u.set_fragment(None);
                u.to_string().trim_end_matches('/').to_string()
            }
            Err(_) => s.trim().trim_end_matches('/').to_lowercase(),
        };
    }
    // Windows paths are case-insensitive.
    s.trim().replace('/', "\\").trim_end_matches('\\').to_lowercase()
}

/// Collapses whitespace, drops control characters (a terminal-escape or
/// newline smuggled into a title) and cuts to `max` characters.
fn clean(s: &str, max: usize) -> String {
    let no_control: String = s.chars().map(|c| if c.is_control() { ' ' } else { c }).collect();
    let collapsed = no_control.split_whitespace().collect::<Vec<_>>().join(" ");
    collapsed.chars().take(max).collect()
}

/// The user's own spelling of each requested tag that exists; unknown ones are
/// dropped. Order is kept and repeats removed.
fn pick_tags(requested: &[String], known: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for want in requested {
        let want = want.trim().to_lowercase();
        if let Some(found) = known.iter().find(|k| k.to_lowercase() == want) {
            if !out.contains(found) {
                out.push(found.clone());
            }
        }
        if out.len() >= MAX_TAGS {
            break;
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn proposal(url: &str) -> Proposal {
        Proposal { url: url.into(), title: None, reason: None, tags: vec![] }
    }

    /// Everything exists and is a file, unless the path ends in `\dir`.
    fn disk(p: &str) -> Probe {
        if p.to_lowercase().ends_with("\\dir") || p.len() <= 3 {
            Probe::Folder
        } else {
            Probe::File
        }
    }

    fn add(s: &Suggestions, p: Proposal) -> Result<Outcome, String> {
        s.add(p, &[], &[], disk, || "id".to_string())
    }

    fn queued(o: Result<Outcome, String>) -> Suggestion {
        match o {
            Ok(Outcome::Queued(s)) => s,
            other => panic!("not queued: {other:?}"),
        }
    }

    #[test]
    fn only_plain_web_urls_and_local_paths_are_accepted() {
        let s = Suggestions::default();
        for bad in [
            "javascript:alert(1)",
            "file:///C:/Windows/System32",
            "ftp://example.com/a",
            "data:text/html,<script>1</script>",
            "https://trusted.example@evil.example/",
            "https://user:pw@example.com/",
            "example.com",
            "",
            "   ",
        ] {
            assert!(add(&s, proposal(bad)).is_err(), "accepted {bad:?}");
        }
        assert_eq!(queued(add(&s, proposal("https://example.com/docs"))).kind, "url");
        assert_eq!(queued(add(&s, proposal(" http://example.org "))).kind, "url");
    }

    #[test]
    fn overlong_urls_are_refused() {
        let s = Suggestions::default();
        let url = format!("https://example.com/{}", "a".repeat(MAX_URL_CHARS));
        assert!(add(&s, proposal(&url)).is_err());
    }

    #[test]
    fn local_files_and_folders_are_accepted_in_a_clean_form() {
        let s = Suggestions::default();
        let file = queued(add(&s, proposal("C:/Users/me/Documents/spec.docx")));
        assert_eq!((file.kind, file.url.as_str()), ("path", "C:\\Users\\me\\Documents\\spec.docx"));
        let folder = queued(add(&s, proposal("D:\\work\\dir\\")));
        assert_eq!((folder.kind, folder.url.as_str()), ("path", "D:\\work\\dir"));
        let root = queued(add(&s, proposal("E:\\")));
        assert_eq!(root.url, "E:\\");
    }

    #[test]
    fn paths_that_are_not_plain_local_absolute_paths_are_refused() {
        let s = Suggestions::default();
        for bad in [
            "\\\\server\\share\\file.txt",
            "//server/share/file.txt",
            "\\\\?\\C:\\Windows\\notepad.txt",
            "\\\\.\\PhysicalDrive0",
            "..\\secret.txt",
            "docs\\spec.docx",
            "/etc/passwd",
            "C:relative.txt",
            "C:\\Users\\me\\..\\other\\a.txt",
            "C:\\Users\\\\me\\a.txt",
            "C:\\Users\\me\\a.txt:hidden.exe",
            "C:\\Users\\me\\*.txt",
        ] {
            assert!(add(&s, proposal(bad)).is_err(), "accepted {bad:?}");
        }
    }

    #[test]
    fn a_path_that_does_not_exist_is_refused() {
        let s = Suggestions::default();
        let gone = |_: &str| Probe::Missing;
        let r = s.add(proposal("C:\\nowhere\\a.txt"), &[], &[], gone, || "id".into());
        assert!(r.unwrap_err().contains("does not exist"));
    }

    #[test]
    fn files_that_run_code_are_refused_but_folders_and_documents_are_not() {
        let s = Suggestions::default();
        for bad in [
            "C:\\Tools\\setup.exe",
            "C:\\Tools\\SETUP.EXE",
            "C:\\Tools\\run.exe.",
            "C:\\Tools\\run.exe ",
            "C:\\Tools\\go.bat",
            "C:\\Tools\\go.ps1",
            "C:\\Tools\\go.vbs",
            "C:\\Tools\\installer.msi",
            "C:\\Users\\me\\Desktop\\app.lnk",
            "C:\\Tools\\lib.dll",
        ] {
            assert!(add(&s, proposal(bad)).is_err(), "accepted {bad:?}");
        }
        // A folder is fine even with an executable-looking name.
        let folder_named_exe = |_: &str| Probe::Folder;
        let r = s.add(proposal("C:\\Tools\\thing.exe"), &[], &[], folder_named_exe, || "id".into());
        assert!(matches!(r, Ok(Outcome::Queued(_))));
        for ok in ["C:\\Docs\\report.pdf", "C:\\Docs\\notes.txt", "C:\\Docs\\noextension"] {
            assert!(matches!(add(&s, proposal(ok)), Ok(Outcome::Queued(_))), "refused {ok:?}");
        }
    }

    #[test]
    fn text_is_cleaned_and_bounded() {
        let s = Suggestions::default();
        let outcome = add(
            &s,
            Proposal {
                url: "https://example.com".into(),
                title: Some("  Line one\n\u{1b}[31mred\t  two ".into()),
                reason: Some("x".repeat(MAX_REASON_CHARS + 50)),
                tags: vec![],
            },
        );
        let q = queued(outcome);
        assert_eq!(q.title, "Line one [31mred two");
        assert_eq!(q.reason.chars().count(), MAX_REASON_CHARS);
    }

    #[test]
    fn duplicates_of_pending_or_saved_addresses_add_nothing() {
        let s = Suggestions::default();
        queued(add(&s, proposal("https://example.com/a")));
        // Same page spelled differently.
        assert_eq!(add(&s, proposal("HTTPS://Example.com/a#top")).unwrap(), Outcome::AlreadyPending);
        queued(add(&s, proposal("C:\\Docs\\Report.pdf")));
        assert_eq!(add(&s, proposal("c:/docs/report.pdf")).unwrap(), Outcome::AlreadyPending);
        assert_eq!(s.list().len(), 2);

        let existing = vec!["https://saved.example/page/".to_string(), "D:\\Saved\\dir\\".to_string()];
        let web = s.add(proposal("https://saved.example/page"), &existing, &[], disk, || "x".into());
        assert_eq!(web.unwrap(), Outcome::AlreadyBookmarked);
        let path = s.add(proposal("d:/saved/dir"), &existing, &[], disk, || "x".into());
        assert_eq!(path.unwrap(), Outcome::AlreadyBookmarked);
        assert_eq!(s.list().len(), 2);
    }

    #[test]
    fn a_full_queue_refuses_more() {
        let s = Suggestions::default();
        for i in 0..MAX_PENDING {
            queued(add(&s, proposal(&format!("https://example.com/{i}"))));
        }
        assert!(add(&s, proposal("https://example.com/one-too-many")).is_err());
        assert_eq!(s.list().len(), MAX_PENDING);
    }

    #[test]
    fn only_the_users_existing_tags_survive_in_their_spelling() {
        let s = Suggestions::default();
        let known = vec!["Work".to_string(), "Reading".to_string()];
        let outcome = s.add(
            Proposal {
                url: "https://example.com".into(),
                title: None,
                reason: None,
                tags: vec!["work".into(), "invented".into(), "WORK".into(), "reading".into()],
            },
            &[],
            &known,
            disk,
            || "id".into(),
        );
        assert_eq!(queued(outcome).tags, vec!["Work".to_string(), "Reading".to_string()]);
    }

    #[test]
    fn remove_drops_only_that_suggestion() {
        let s = Suggestions::default();
        let a = s.add(proposal("https://a.example"), &[], &[], disk, || "a".into()).unwrap();
        s.add(proposal("https://b.example"), &[], &[], disk, || "b".into()).unwrap();
        assert!(matches!(a, Outcome::Queued(_)));
        assert!(s.remove("a"));
        assert!(!s.remove("a"));
        let left = s.list();
        assert_eq!(left.len(), 1);
        assert_eq!(left[0].id, "b");
    }
}
