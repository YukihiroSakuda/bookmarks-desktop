//! Favicon fetching.
//!
//! Icons are downloaded from the bookmarked site itself — never from a
//! third-party icon service — and stored in `bookmarks.favicon` as a `data:`
//! URI, so displaying a card never touches the network. A site is contacted at
//! most once per bookmark: when it is added, or when the user presses "Fetch
//! missing icons" in Settings.

use base64::Engine;

/// Give up on a slow site quickly: this runs while the user waits for a
/// bookmark to appear, and in bulk over hundreds of (often dead) links.
const TIMEOUT: std::time::Duration = std::time::Duration::from_secs(5);

/// Icons are tiny; anything bigger is a mis-served page, not an icon.
const MAX_ICON_BYTES: usize = 100 * 1024;

const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/// Download the favicon for `url` and return it as a `data:` URI.
///
/// Returns `None` for anything that is not a reachable http(s) page with a
/// usable icon — the caller leaves the bookmark without an icon and the card
/// falls back to the generic globe.
pub fn fetch_favicon_blocking(url: &str) -> Option<String> {
    let parsed = reqwest::Url::parse(url).ok()?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return None;
    }

    let client = reqwest::blocking::Client::builder()
        .timeout(TIMEOUT)
        .build()
        .ok()?;

    // Candidates in order of preference: whatever the page declares, then the
    // conventional /favicon.ico.
    let mut candidates: Vec<reqwest::Url> = Vec::new();
    if let Ok(resp) = client.get(parsed.clone()).header("User-Agent", USER_AGENT).send() {
        let is_html = resp
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .map(|ct| ct.contains("text/html") || ct.contains("xhtml"))
            .unwrap_or(false);
        // Resolve against the *final* URL so redirects to another host work.
        let base = resp.url().clone();
        if is_html {
            if let Ok(body) = resp.text() {
                for href in extract_icon_hrefs(&body) {
                    if let Ok(resolved) = base.join(&href) {
                        candidates.push(resolved);
                    }
                }
            }
        }
    }
    if let Ok(default_icon) = parsed.join("/favicon.ico") {
        candidates.push(default_icon);
    }

    candidates.dedup();
    for candidate in candidates.into_iter().take(3) {
        if let Some(data_uri) = download_icon(&client, candidate) {
            return Some(data_uri);
        }
    }
    None
}

fn download_icon(client: &reqwest::blocking::Client, url: reqwest::Url) -> Option<String> {
    let mime = mime_from_extension(url.path());
    let resp = client.get(url).header("User-Agent", USER_AGENT).send().ok()?;
    if !resp.status().is_success() {
        return None;
    }

    let mime = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|ct| ct.split(';').next().unwrap_or(ct).trim().to_string())
        .filter(|ct| ct.starts_with("image/"))
        .or(mime)?;

    // Skip an oversized icon before reading it when the server announces the size.
    if resp.content_length().is_some_and(|len| len as usize > MAX_ICON_BYTES) {
        return None;
    }

    let bytes = resp.bytes().ok()?;
    if bytes.is_empty() || bytes.len() > MAX_ICON_BYTES {
        return None;
    }

    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Some(format!("data:{mime};base64,{encoded}"))
}

fn mime_from_extension(path: &str) -> Option<String> {
    let lower = path.to_lowercase();
    let mime = if lower.ends_with(".ico") {
        "image/x-icon"
    } else if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".svg") {
        "image/svg+xml"
    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "image/jpeg"
    } else if lower.ends_with(".gif") {
        "image/gif"
    } else if lower.ends_with(".webp") {
        "image/webp"
    } else {
        return None;
    };
    Some(mime.to_string())
}

/// Collect the `href`s of every `<link rel="...icon...">` in the document.
///
/// Hand-rolled like `extract_title`, to keep the app free of an HTML parser
/// dependency. Malformed markup simply yields no candidates, and the
/// `/favicon.ico` fallback still applies.
fn extract_icon_hrefs(html: &str) -> Vec<String> {
    let lower = html.to_lowercase();
    let mut hrefs = Vec::new();
    let mut cursor = 0;

    while let Some(offset) = lower[cursor..].find("<link") {
        let start = cursor + offset;
        let Some(end_offset) = lower[start..].find('>') else { break };
        let end = start + end_offset;
        let tag = &html[start..end];
        cursor = end + 1;

        let rel = attribute_value(tag, "rel").unwrap_or_default().to_lowercase();
        if !rel.split_whitespace().any(|token| token == "icon" || token.ends_with("-icon")) {
            continue;
        }
        if let Some(href) = attribute_value(tag, "href") {
            if !href.trim().is_empty() {
                hrefs.push(href);
            }
        }
    }

    hrefs
}

/// Value of `name="..."` (or `name='...'`) inside a single tag.
fn attribute_value(tag: &str, name: &str) -> Option<String> {
    let lower = tag.to_lowercase();
    let mut cursor = 0;

    while let Some(offset) = lower[cursor..].find(name) {
        let start = cursor + offset;
        cursor = start + name.len();

        // Must be a standalone attribute name: preceded by whitespace and
        // followed by `=`, so `rel` does not match inside `data-rel`.
        let preceded_by_space = start == 0
            || lower[..start]
                .chars()
                .next_back()
                .is_some_and(|c| c.is_whitespace());
        if !preceded_by_space {
            continue;
        }
        let rest = lower[cursor..].trim_start();
        if !rest.starts_with('=') {
            continue;
        }

        let eq = cursor + lower[cursor..].find('=')? + 1;
        let value = tag[eq..].trim_start();
        let quote = value.chars().next()?;
        return if quote == '"' || quote == '\'' {
            value[1..].find(quote).map(|len| value[1..1 + len].to_string())
        } else {
            let end = value.find(char::is_whitespace).unwrap_or(value.len());
            Some(value[..end].to_string())
        };
    }

    None
}
