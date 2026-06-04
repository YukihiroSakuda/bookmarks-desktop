use axum::{
    Router,
    extract::{Json, Query, State},
    http::StatusCode,
    routing::get,
};
use chrono::{SecondsFormat, Utc};
use rusqlite::{Connection, OptionalExtension};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::Emitter;
use tower_http::cors::CorsLayer;
use uuid::Uuid;

pub type SharedDb = Arc<Mutex<Connection>>;

#[derive(Clone)]
struct ServerState {
    db: SharedDb,
    app: tauri::AppHandle,
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
                    "INSERT INTO tags (id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
                    rusqlite::params![id, tag_name, ts, ts],
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
                 memo, created_at, updated_at, last_accessed_at \
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
             custom_order, memo, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7, ?8, ?9, ?10)",
            rusqlite::params![
                id,
                kind,
                body.title,
                body.url,
                body.favicon,
                body.is_pinned as i64,
                next_order,
                body.memo,
                ts,
                ts
            ],
        )
        .map_err(|e| e.to_string())?;

        link_tags(&tx, &id, &body.tags, &ts)?;
        tx.commit().map_err(|e| e.to_string())?;
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
            .prepare("SELECT id, name, created_at, updated_at FROM tags ORDER BY name ASC")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok(json!({
                    "id": r.get::<_, String>(0)?,
                    "name": r.get::<_, String>(1)?,
                    "created_at": r.get::<_, String>(2)?,
                    "updated_at": r.get::<_, String>(3)?,
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
            "INSERT INTO tags (id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![id, body.name, ts, ts],
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

// ---------- Server entry point ----------

pub async fn start(db: SharedDb, app_handle: tauri::AppHandle) {
    let cors = CorsLayer::permissive();
    let state = ServerState { db, app: app_handle };

    let app = Router::new()
        .route(
            "/api/bookmarks",
            get(get_bookmarks).post(post_bookmark),
        )
        .route("/api/bookmarks/title", get(get_title))
        .route("/api/tags", get(get_tags).post(post_tag))
        .route("/api/tag-rules", get(get_tag_rules))
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
