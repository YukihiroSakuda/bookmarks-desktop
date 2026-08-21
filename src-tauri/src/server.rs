use axum::{
    Router,
    extract::{Json, Query, Request, State},
    http::{HeaderMap, HeaderValue, Method, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::get,
};
use chrono::{SecondsFormat, Utc};
use rusqlite::{Connection, OptionalExtension};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::Emitter;
use tower_http::cors::{Any, CorsLayer};
use uuid::Uuid;

pub type SharedDb = Arc<Mutex<Connection>>;

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

/// Order value for a newly created tag: the end of the manual order used by
/// Tag Manager in the app.
fn next_tag_order(conn: &Connection) -> Result<i64, String> {
    conn.query_row("SELECT COALESCE(MAX(sort_order), 0) + 1 FROM tags", [], |r| r.get(0))
        .map_err(|e| e.to_string())
}

fn link_tags(conn: &Connection, bookmark_id: &str, tags: &[String], ts: &str) -> Result<(), String> {
    for tag_name in tags {
        let existing: Option<String> = conn
            .query_row("SELECT id FROM tags WHERE name = ?1", [tag_name], |r| r.get(0))
            .optional()
            .map_err(|e| e.to_string())?;
        let tag_id = match existing {
            Some(id) => id,
            None => {
                let id = new_id();
                conn.execute(
                    "INSERT INTO tags (id, name, sort_order, created_at, updated_at) \
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                    rusqlite::params![id, tag_name, next_tag_order(conn)?, ts, ts],
                )
                .map_err(|e| e.to_string())?;
                id
            }
        };
        conn.execute(
            "INSERT INTO bookmarks_tags (bookmark_id, tag_id, created_at) VALUES (?1, ?2, ?3) \
             ON CONFLICT(bookmark_id, tag_id) DO NOTHING",
            rusqlite::params![bookmark_id, tag_id, ts],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
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
struct CreateTagBody {
    name: String,
}

#[derive(Deserialize)]
struct TitleQuery {
    url: String,
}

// ---------- Handlers ----------

async fn get_bookmarks(State(state): State<ServerState>) -> ApiResult {
    let db = state.db;
    tokio::task::spawn_blocking(move || -> Result<Value, String> {
        let conn = db.lock().map_err(|e| e.to_string())?;

        let mut tag_map: HashMap<String, Vec<String>> = HashMap::new();
        {
            let mut stmt = conn
                .prepare(
                    "SELECT bt.bookmark_id, t.name FROM bookmarks_tags bt \
                     JOIN tags t ON t.id = bt.tag_id",
                )
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
                .map_err(|e| e.to_string())?;
            for row in rows {
                let (bid, name) = row.map_err(|e| e.to_string())?;
                tag_map.entry(bid).or_default().push(name);
            }
        }

        let mut stmt = conn
            .prepare(
                "SELECT id, kind, title, url, favicon, is_pinned, access_count, custom_order, \
                 memo, created_at, updated_at, last_accessed_at, shortcut \
                 FROM bookmarks ORDER BY custom_order ASC",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |r| {
                Ok(json!({
                    "id": r.get::<_, String>(0)?,
                    "kind": r.get::<_, String>(1)?,
                    "title": r.get::<_, String>(2)?,
                    "url": r.get::<_, String>(3)?,
                    "favicon": r.get::<_, Option<String>>(4)?,
                    "is_pinned": r.get::<_, i64>(5)? != 0,
                    "access_count": r.get::<_, i64>(6)?,
                    "custom_order": r.get::<_, i64>(7)?,
                    "memo": r.get::<_, Option<String>>(8)?,
                    "created_at": r.get::<_, String>(9)?,
                    "updated_at": r.get::<_, String>(10)?,
                    "last_accessed_at": r.get::<_, Option<String>>(11)?,
                    "shortcut": r.get::<_, Option<String>>(12)?,
                }))
            })
            .map_err(|e| e.to_string())?;

        let mut out = Vec::new();
        for row in rows {
            let mut obj = row.map_err(|e| e.to_string())?;
            let id = obj["id"].as_str().unwrap_or_default().to_string();
            let tags = tag_map.remove(&id).unwrap_or_default();
            obj["bookmarks_tags"] = Value::Array(
                tags.into_iter()
                    .map(|n| json!({ "tags": { "name": n } }))
                    .collect(),
            );
            out.push(obj);
        }
        Ok(Value::Array(out))
    })
    .await
    .map_err(|e| internal_err(e.to_string()))
    .and_then(|r| r.map_err(internal_err))
    .map(Json)
}

async fn post_bookmark(
    State(state): State<ServerState>,
    Json(body): Json<CreateBookmarkBody>,
) -> ApiResult {
    let db = state.db;
    let app = state.app.clone();
    let icon_app = app.clone();
    let icon_target = (body.kind.as_deref().unwrap_or("url") == "url" && body.favicon.is_none())
        .then(|| body.url.clone());
    tokio::task::spawn_blocking(move || -> Result<Value, String> {
        let mut conn = db.lock().map_err(|e| e.to_string())?;
        let ts = now();
        let id = new_id();
        let kind = body.kind.unwrap_or_else(|| "url".to_string());

        let tx = conn.transaction().map_err(|e| e.to_string())?;
        let next_order: i64 = tx
            .query_row(
                "SELECT COALESCE(MAX(custom_order), 0) + 1 FROM bookmarks",
                [],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;

        tx.execute(
            "INSERT INTO bookmarks (id, kind, title, url, favicon, is_pinned, access_count, \
             custom_order, memo, shortcut, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![
                id,
                kind,
                body.title,
                body.url,
                body.favicon,
                body.is_pinned as i64,
                next_order,
                body.memo,
                body.shortcut,
                ts,
                ts
            ],
        )
        .map_err(|e| e.to_string())?;

        link_tags(&tx, &id, &body.tags, &ts)?;
        tx.commit().map_err(|e| e.to_string())?;

        // Fetch the icon after the bookmark is saved, so the extension's popup
        // closes immediately instead of waiting on the site.
        if let Some(url) = icon_target {
            let db = Arc::clone(&db);
            let app = icon_app;
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

        Ok(json!({ "id": id }))
    })
    .await
    .map_err(|e| internal_err(e.to_string()))
    .and_then(|r| r.map_err(internal_err))
    .map(Json)
    .inspect(|_| { let _ = app.emit("bookmark-added", ()); })
}

async fn get_tags(State(state): State<ServerState>) -> ApiResult {
    let db = state.db;
    tokio::task::spawn_blocking(move || -> Result<Value, String> {
        let conn = db.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, name, color, sort_order, created_at, updated_at \
                 FROM tags ORDER BY sort_order ASC, name ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok(json!({
                    "id": r.get::<_, String>(0)?,
                    "name": r.get::<_, String>(1)?,
                    "color": r.get::<_, Option<String>>(2)?,
                    "sort_order": r.get::<_, i64>(3)?,
                    "created_at": r.get::<_, String>(4)?,
                    "updated_at": r.get::<_, String>(5)?,
                }))
            })
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row.map_err(|e| e.to_string())?);
        }
        Ok(Value::Array(out))
    })
    .await
    .map_err(|e| internal_err(e.to_string()))
    .and_then(|r| r.map_err(internal_err))
    .map(Json)
}

async fn post_tag(State(state): State<ServerState>, Json(body): Json<CreateTagBody>) -> ApiResult {
    let db = state.db;
    tokio::task::spawn_blocking(move || -> Result<Value, String> {
        let conn = db.lock().map_err(|e| e.to_string())?;
        let ts = now();

        if let Some(id) = conn
            .query_row(
                "SELECT id FROM tags WHERE name = ?1",
                [&body.name],
                |r| r.get::<_, String>(0),
            )
            .optional()
            .map_err(|e| e.to_string())?
        {
            return Ok(json!({ "id": id }));
        }

        let id = new_id();
        conn.execute(
            "INSERT INTO tags (id, name, sort_order, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![id, body.name, next_tag_order(&conn)?, ts, ts],
        )
        .map_err(|e| e.to_string())?;
        Ok(json!({ "id": id }))
    })
    .await
    .map_err(|e| internal_err(e.to_string()))
    .and_then(|r| r.map_err(internal_err))
    .map(Json)
}

async fn get_tag_rules(State(state): State<ServerState>) -> ApiResult {
    let db = state.db;
    tokio::task::spawn_blocking(move || -> Result<Value, String> {
        let conn = db.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, match_type, pattern, tag_id, target_field, created_at, updated_at \
                 FROM tag_rules ORDER BY created_at ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok(json!({
                    "id": r.get::<_, String>(0)?,
                    "match_type": r.get::<_, String>(1)?,
                    "pattern": r.get::<_, String>(2)?,
                    "tag_id": r.get::<_, String>(3)?,
                    "target_field": r.get::<_, String>(4)?,
                    "created_at": r.get::<_, String>(5)?,
                    "updated_at": r.get::<_, String>(6)?,
                }))
            })
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row.map_err(|e| e.to_string())?);
        }
        Ok(Value::Array(out))
    })
    .await
    .map_err(|e| internal_err(e.to_string()))
    .and_then(|r| r.map_err(internal_err))
    .map(Json)
}

fn fetch_title_blocking(url: &str) -> String {
    let parsed = match reqwest::Url::parse(url) {
        Ok(p) => p,
        Err(_) => return String::new(),
    };
    let fallback = parsed
        .host_str()
        .map(|h| h.trim_start_matches("www.").to_string())
        .unwrap_or_default();

    let client = match reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
    {
        Ok(c) => c,
        Err(_) => return fallback,
    };

    let resp = match client
        .get(url)
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        )
        .send()
    {
        Ok(r) => r,
        Err(_) => return fallback,
    };

    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    if !content_type.contains("text/html") && !content_type.contains("xhtml") {
        return fallback;
    }

    let body = match resp.text() {
        Ok(b) => b,
        Err(_) => return fallback,
    };

    extract_title(&body).unwrap_or(fallback)
}

fn extract_title(html: &str) -> Option<String> {
    let lower = html.to_lowercase();
    let start_tag = lower.find("<title")?;
    let gt = lower[start_tag..].find('>')? + start_tag + 1;
    let end = lower[gt..].find("</title>")? + gt;
    let raw = &html[gt..end];
    let normalized = raw.split_whitespace().collect::<Vec<_>>().join(" ");
    let trimmed = normalized.trim().to_string();
    if trimmed.is_empty() { None } else { Some(trimmed) }
}

async fn get_title(Query(q): Query<TitleQuery>) -> ApiResult {
    let url = q.url;
    let title = tokio::task::spawn_blocking(move || fetch_title_blocking(&url))
        .await
        .unwrap_or_default();
    Ok(Json(json!({ "title": title })))
}

/// Hands the pairing token to the extension. Only reachable cross-origin from
/// `EXTENSION_ORIGIN` (enforced by the CORS layer below), so no other site
/// can retrieve it.
async fn pair(State(state): State<ServerState>) -> ApiResult {
    Ok(Json(json!({ "token": state.token })))
}

/// Rejects any request that doesn't carry the correct `X-Bookmarks-Token`
/// header. Defense-in-depth alongside the CORS origin allowlist: this also
/// blocks non-browser local callers that don't go through CORS at all.
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
        .route_layer(middleware::from_fn_with_state(state.clone(), require_token));

    let app = Router::new()
        .route("/api/pair", get(pair))
        .merge(protected)
        .layer(cors)
        .with_state(state);

    match tokio::net::TcpListener::bind("127.0.0.1:37373").await {
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
