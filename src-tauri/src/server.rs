use axum::{
    Router,
    extract::{Json, Query, Request, State},
    http::{header, HeaderMap, HeaderValue, Method, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use chrono::{SecondsFormat, Utc};
use rusqlite::Connection;
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};
use tower_http::cors::{Any, CorsLayer};
use uuid::Uuid;

pub type SharedDb = Arc<Mutex<Connection>>;

/// Where the local API listens. The MCP server (a separate process) posts
/// bookmark suggestions here, so both sides read it from one place.
pub const LOCAL_API_ADDR: &str = "127.0.0.1:37373";

/// Allowed extension origins. Store submissions strip the `key` field from
/// extension/public/manifest.json (Edge/Chrome both reject a pinned key), so
/// each store assigns its own extension ID at publish time — these can't all
/// share one fixed ID the way unpacked dev loads can. Add each store's real
/// published ID here once known.
const EXTENSION_ORIGINS: &[&str] = &[
    // Unpacked (dev) load — stable because extension/public/manifest.json pins `key` there.
    "chrome-extension://bgmjbpabbplohlimpahhllgaddbkfofg",
    // Microsoft Edge Add-ons (published CRX ID).
    "chrome-extension://jppmhgioeccjkicfjkddfofellogpjoa",
];

#[derive(Clone)]
struct ServerState {
    db: SharedDb,
    app: tauri::AppHandle,
    token: String,
}

type ApiResult = Result<Json<Value>, (StatusCode, Json<Value>)>;

fn internal_err(msg: String) -> (StatusCode, Json<Value>) {
    (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": msg })))
}

fn now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn new_id() -> String {
    Uuid::new_v4().to_string()
}

/// Run a database job off the async runtime and turn its error into a 500.
async fn with_db<F>(db: SharedDb, job: F) -> ApiResult
where
    F: FnOnce(&mut Connection) -> Result<Value, String> + Send + 'static,
{
    tokio::task::spawn_blocking(move || {
        let mut conn = db.lock().map_err(|e| e.to_string())?;
        job(&mut conn)
    })
    .await
    .map_err(|e| internal_err(e.to_string()))
    .and_then(|r| r.map_err(internal_err))
    .map(Json)
}

// ---------- Request body types ----------

#[derive(Deserialize)]
struct CreateBookmarkBody {
    title: String,
    url: String,
    #[serde(default)]
    kind: Option<String>,
    #[serde(default)]
    favicon: Option<String>,
    #[serde(default)]
    is_pinned: bool,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    memo: Option<String>,
    #[serde(default)]
    shortcut: Option<String>,
}

#[derive(Deserialize)]
struct SuggestBody {
    url: String,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    reason: Option<String>,
    #[serde(default)]
    tags: Vec<String>,
}

#[derive(Deserialize)]
struct CreateTagBody {
    name: String,
}

#[derive(Deserialize)]
struct TitleQuery {
    url: String,
}

// ---------- Handlers ----------

async fn get_bookmarks(State(state): State<ServerState>) -> ApiResult {
    with_db(state.db, |conn| {
        // Tags go under `bookmarks_tags`, nested the way the extension has
        // always read them, rather than the app's flat `tags`: an extension
        // already installed from a store keeps working.
        let out = crate::repo::list_bookmarks(conn)?
            .into_iter()
            .map(|(mut obj, tags)| {
                obj["bookmarks_tags"] = Value::Array(
                    tags.into_iter()
                        .map(|n| json!({ "tags": { "name": n } }))
                        .collect(),
                );
                obj
            })
            .collect();
        Ok(Value::Array(out))
    })
    .await
}

async fn post_bookmark(
    State(state): State<ServerState>,
    Json(body): Json<CreateBookmarkBody>,
) -> ApiResult {
    let db = state.db;
    let app = state.app;
    let icon_target = (body.kind.as_deref().unwrap_or("url") == "url" && body.favicon.is_none())
        .then(|| body.url.clone());
    let bookmark = crate::repo::NewBookmark {
        kind: body.kind,
        title: body.title,
        url: body.url,
        favicon: body.favicon,
        is_pinned: body.is_pinned,
        memo: body.memo,
        shortcut: body.shortcut,
        tags: body.tags,
    };

    let id = with_db(Arc::clone(&db), move |conn| {
        let id = crate::repo::insert_bookmark(conn, &bookmark, None, &now())?;
        Ok(Value::String(id))
    })
    .await?
    .0;
    let id = id.as_str().unwrap_or_default().to_string();

    let _ = app.emit("bookmark-added", ());
    // A path bookmark belongs in the shortcut folder right away, the same as
    // one added in the app — not only after the next restart.
    crate::shortcutdir::request_sync(&app);

    // Fetch the icon after the bookmark is saved, so the extension's popup
    // closes immediately instead of waiting on the site.
    if let Some(url) = icon_target {
        let id = id.clone();
        std::thread::spawn(move || {
            let Some(icon) = crate::favicon::fetch_favicon_blocking(&url) else { return };
            let Ok(conn) = db.lock() else { return };
            let _ = conn.execute(
                "UPDATE bookmarks SET favicon = ?1 WHERE id = ?2",
                rusqlite::params![icon, id],
            );
            let _ = app.emit("bookmark-added", ());
        });
    }

    Ok(Json(json!({ "id": id })))
}

async fn get_tags(State(state): State<ServerState>) -> ApiResult {
    with_db(state.db, |conn| Ok(Value::Array(crate::repo::list_tags(conn)?))).await
}

async fn post_tag(State(state): State<ServerState>, Json(body): Json<CreateTagBody>) -> ApiResult {
    with_db(state.db, move |conn| {
        let id = crate::repo::find_or_create_tag(conn, &body.name, None, &now())?;
        Ok(json!({ "id": id }))
    })
    .await
}

async fn get_tag_rules(State(state): State<ServerState>) -> ApiResult {
    with_db(state.db, |conn| Ok(Value::Array(crate::repo::list_tag_rules(conn)?))).await
}

/// Queues a bookmark an AI assistant proposes. Nothing is written to the
/// database: the user has to open it in the app and save it themselves (see
/// suggestions.rs). Reached by the MCP server, which carries the pairing token.
async fn post_suggestion(
    State(state): State<ServerState>,
    Json(body): Json<SuggestBody>,
) -> ApiResult {
    use crate::suggestions::{Outcome, Probe, Proposal};

    let db = state.db;
    let app = state.app.clone();
    let outcome = tokio::task::spawn_blocking(move || -> Result<Value, (StatusCode, String)> {
        let (urls, tags) = {
            let conn = db.lock().map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
            let column = |sql: &str| -> Result<Vec<String>, String> {
                let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
                let rows = stmt.query_map([], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
                rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
            };
            let urls = column("SELECT url FROM bookmarks")
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
            let tags = column("SELECT name FROM tags")
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
            (urls, tags)
        };

        let suggestions = &app.state::<crate::db::AppState>().suggestions;
        let result = suggestions
            .add(
                Proposal { url: body.url, title: body.title, reason: body.reason, tags: body.tags },
                &urls,
                &tags,
                |path| match std::fs::metadata(path) {
                    Ok(m) if m.is_dir() => Probe::Folder,
                    Ok(_) => Probe::File,
                    Err(_) => Probe::Missing,
                },
                new_id,
            )
            .map_err(|e| (StatusCode::UNPROCESSABLE_ENTITY, e))?;

        Ok(match result {
            Outcome::Queued(s) => {
                let _ = app.emit("suggestions-changed", ());
                json!({ "status": "queued", "id": s.id })
            }
            Outcome::AlreadyPending => json!({ "status": "already_pending" }),
            Outcome::AlreadyBookmarked => json!({ "status": "already_bookmarked" }),
        })
    })
    .await
    .map_err(|e| internal_err(e.to_string()))?;

    outcome
        .map(Json)
        .map_err(|(status, msg)| (status, Json(json!({ "error": msg }))))
}

async fn get_title(Query(q): Query<TitleQuery>) -> ApiResult {
    let url = q.url;
    let title = tokio::task::spawn_blocking(move || crate::page_title::fetch_title_blocking(&url))
        .await
        .unwrap_or_default();
    Ok(Json(json!({ "title": title })))
}

/// Hands the pairing token to the extension. A web page cannot read it: the
/// CORS layer below only answers the extension's origins, and
/// `require_local_host` turns away a page that rebinds its own domain to
/// 127.0.0.1 to look same-origin. A local program can still fetch it — but a
/// program running as the user can read the database file directly anyway,
/// so the token is not what protects the data from one.
async fn pair(State(state): State<ServerState>) -> ApiResult {
    Ok(Json(json!({ "token": state.token })))
}

/// Whether a request's `Host` header names this server by a loopback name.
/// The extension calls `localhost:37373`; the MCP server calls
/// `127.0.0.1:37373` (LOCAL_API_ADDR).
fn is_local_host(host: &str) -> bool {
    let port = LOCAL_API_ADDR.rsplit(':').next().unwrap_or_default();
    match host.rsplit_once(':') {
        Some((name, p)) if p == port => {
            name.eq_ignore_ascii_case("localhost") || name == "127.0.0.1"
        }
        _ => false,
    }
}

/// Rejects any request whose `Host` is not this server's loopback address.
///
/// Against DNS rebinding: a web page can point its own domain at 127.0.0.1,
/// and the browser then treats requests to this port as same-origin — CORS
/// never applies, and the page could read `/api/pair` and then everything
/// else. The browser still sends the page's domain as `Host`, so checking it
/// closes that. Applies to every route, `/api/pair` included.
async fn require_local_host(headers: HeaderMap, request: Request, next: Next) -> Response {
    let host = headers.get(header::HOST).and_then(|v| v.to_str().ok());
    if !host.is_some_and(is_local_host) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "forbidden host" })),
        )
            .into_response();
    }
    next.run(request).await
}

/// Rejects any request that doesn't carry the correct `X-Bookmarks-Token`
/// header, alongside the CORS origin allowlist — so a page that manages to
/// send a request (CORS limits what it can read, not what it can send) still
/// cannot add bookmarks or suggestions.
async fn require_token(
    State(state): State<ServerState>,
    headers: HeaderMap,
    request: Request,
    next: Next,
) -> Response {
    let provided = headers
        .get("x-bookmarks-token")
        .and_then(|v| v.to_str().ok());
    if provided != Some(state.token.as_str()) {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "unauthorized" })),
        )
            .into_response();
    }
    next.run(request).await
}

// ---------- Server entry point ----------

pub async fn start(db: SharedDb, app_handle: tauri::AppHandle) {
    let token: String = {
        let conn = db.lock().expect("db mutex poisoned");
        conn.query_row("SELECT api_token FROM user_settings WHERE id = 1", [], |r| r.get(0))
            .unwrap_or_default()
    };
    let state = ServerState { db, app: app_handle, token };

    let origins: Vec<HeaderValue> = EXTENSION_ORIGINS
        .iter()
        .map(|o| o.parse().expect("EXTENSION_ORIGINS entries must be valid header values"))
        .collect();
    let cors = CorsLayer::new()
        .allow_origin(origins)
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers(Any);

    let protected = Router::new()
        .route(
            "/api/bookmarks",
            get(get_bookmarks).post(post_bookmark),
        )
        .route("/api/bookmarks/title", get(get_title))
        .route("/api/tags", get(get_tags).post(post_tag))
        .route("/api/tag-rules", get(get_tag_rules))
        .route("/api/suggestions", post(post_suggestion))
        .route_layer(middleware::from_fn_with_state(state.clone(), require_token));

    let app = Router::new()
        .route("/api/pair", get(pair))
        .merge(protected)
        .layer(middleware::from_fn(require_local_host))
        .layer(cors)
        .with_state(state);

    match tokio::net::TcpListener::bind(LOCAL_API_ADDR).await {
        Ok(listener) => {
            log::info!("Local API server listening on http://127.0.0.1:37373");
            if let Err(e) = axum::serve(listener, app).await {
                log::error!("Local API server error: {e}");
            }
        }
        Err(e) => {
            log::error!("Failed to bind local API server on port 37373: {e}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::is_local_host;

    #[test]
    fn only_loopback_names_on_this_port_are_accepted() {
        assert!(is_local_host("localhost:37373"));
        assert!(is_local_host("LocalHost:37373"));
        assert!(is_local_host("127.0.0.1:37373"));

        // A rebound domain keeps its own name in Host.
        assert!(!is_local_host("evil.example:37373"));
        assert!(!is_local_host("localhost.evil.example:37373"));
        assert!(!is_local_host("127.0.0.1.nip.io:37373"));
        // Wrong or missing port.
        assert!(!is_local_host("localhost:80"));
        assert!(!is_local_host("localhost"));
        assert!(!is_local_host(""));
    }
}
