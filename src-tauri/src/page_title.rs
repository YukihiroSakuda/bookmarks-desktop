//! Resolving a human-readable title for a bookmarked URL.
//!
//! Shared by the Tauri command the app's form calls and by the local HTTP
//! server the browser extension calls, so both name a bookmark the same way.
//!
//! The page's own `<title>` is preferred, but it is not trusted blindly: the
//! app fetches the URL without the user's session, so anything behind a
//! corporate login (SharePoint, Box, an intranet portal) answers with a sign-in
//! page. Taking that title would name every internal bookmark "Sign in to your
//! account". When the response looks like that, the title is built from the URL
//! instead, which for SharePoint-style links is usually the file name and the
//! site it lives in.

use percent_encoding::percent_decode_str;

const TIMEOUT: std::time::Duration = std::time::Duration::from_secs(8);

const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/// Titles served by identity providers instead of the page you asked for.
/// Matched at the start of the title, so a page that merely mentions login
/// ("Box | Login") keeps its own title.
const SIGN_IN_PREFIXES: &[&str] = &[
    "sign in",
    "signin",
    "sign-in",
    "log in",
    "login",
    "redirecting",
    "authentication required",
    "サインイン",
    "ログイン",
    "認証",
    "リダイレクト",
];

/// URL segments that carry no meaning for a human reading the bookmark list.
/// Mostly SharePoint plumbing: `/:x:/r/sites/...`, `/_layouts/15/Doc.aspx`.
const NOISE_SEGMENTS: &[&str] = &[
    "_layouts",
    "15",
    "forms",
    "allitems.aspx",
    "doc.aspx",
    "default.aspx",
    "sitepages",
    "shared documents",
    "documents",
    "sites",
    "teams",
    "personal",
    "r",
    ":x:",
    ":w:",
    ":p:",
    ":b:",
    ":f:",
    ":o:",
    ":u:",
];

pub fn fetch_title_blocking(url: &str) -> String {
    let Ok(parsed) = reqwest::Url::parse(url) else {
        return String::new();
    };
    let fallback = title_from_url(&parsed);

    let Ok(client) = reqwest::blocking::Client::builder().timeout(TIMEOUT).build() else {
        return fallback;
    };

    let Ok(resp) = client.get(url).header("User-Agent", USER_AGENT).send() else {
        return fallback;
    };

    // A login wall answers with an error, or redirects to the identity
    // provider and answers 200 there. Both mean "this is not the page".
    if !resp.status().is_success() {
        return fallback;
    }
    // Landing on another host, or on an auth endpoint, means the request was
    // handed to a login flow rather than answered by the page.
    let final_url = resp.url().clone();
    let sent_to_login = final_url.host_str() != parsed.host_str()
        || (looks_like_auth_url(&final_url) && !looks_like_auth_url(&parsed));

    let is_html = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|ct| ct.contains("text/html") || ct.contains("xhtml"))
        .unwrap_or(false);
    if !is_html {
        return fallback;
    }

    let Ok(body) = resp.text() else {
        return fallback;
    };

    match extract_title(&body) {
        // A sign-in title only means "login wall" when the request was sent to
        // a login flow. Bookmarking a login page on purpose keeps its title.
        Some(title) if sent_to_login && looks_like_sign_in(&title) => fallback,
        Some(title) => title,
        None => fallback,
    }
}

/// Extract and normalize the contents of the first `<title>` element.
pub fn extract_title(html: &str) -> Option<String> {
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

fn looks_like_sign_in(title: &str) -> bool {
    let lower = title.trim().to_lowercase();
    SIGN_IN_PREFIXES.iter().any(|prefix| lower.starts_with(prefix))
}

/// Whether the URL points at a sign-in flow rather than at content.
fn looks_like_auth_url(url: &reqwest::Url) -> bool {
    let path = url.path().to_lowercase();
    ["login", "signin", "sign-in", "logon", "authenticate", "/auth/", "adfs", "oauth"]
        .iter()
        .any(|marker| path.contains(marker))
}

fn host_only(parsed: &reqwest::Url) -> String {
    parsed
        .host_str()
        .map(|h| h.trim_start_matches("www.").to_string())
        .unwrap_or_default()
}

/// Build a readable name out of the URL itself.
///
/// For a SharePoint-style link this is the document name plus the site it
/// belongs to (`仕様書.xlsx — ProjectX`); for anything else it is the last
/// meaningful path segment, falling back to the host name.
pub fn title_from_url(parsed: &reqwest::Url) -> String {
    let host = host_only(parsed);

    // Office web links carry the file name in the query rather than the path:
    // /:x:/r/sites/X/_layouts/15/Doc.aspx?sourcedoc=...&file=Report.xlsx
    let mut from_query: Option<String> = None;
    for (key, value) in parsed.query_pairs() {
        match key.as_ref() {
            "file" if !value.trim().is_empty() => {
                from_query = Some(value.trim().to_string());
                break;
            }
            // Folder views put the folder path in `id`.
            "id" if value.contains('/') => {
                if from_query.is_none() {
                    from_query = last_segment(value.as_ref()).map(str::to_string);
                }
            }
            _ => {}
        }
    }

    let segments: Vec<String> = parsed
        .path_segments()
        .map(|segments| {
            segments
                .filter(|s| !s.is_empty())
                .map(|s| percent_decode_str(s).decode_utf8_lossy().to_string())
                .collect()
        })
        .unwrap_or_default();

    // `/sites/<site>/...` and `/teams/<team>/...` name the space the document
    // lives in — worth keeping as context, since file names repeat across sites.
    let site = segments
        .iter()
        .position(|s| {
            let lower = s.to_lowercase();
            lower == "sites" || lower == "teams"
        })
        .and_then(|index| segments.get(index + 1))
        .filter(|s| !s.is_empty())
        .cloned();

    let name = from_query.or_else(|| {
        segments
            .iter()
            .rev()
            .find(|s| !NOISE_SEGMENTS.contains(&s.to_lowercase().as_str()))
            .cloned()
    });

    match (name, site) {
        (Some(name), Some(site)) if name != site => format!("{name} — {site}"),
        (Some(name), _) => name,
        (None, Some(site)) => site,
        (None, None) => host,
    }
}

fn last_segment(path: &str) -> Option<&str> {
    path.trim_end_matches('/').rsplit('/').find(|s| !s.is_empty())
}
