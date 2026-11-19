//! Reads and writes of the app's own tables, shared by the two ways in: the
//! Tauri commands the app window calls (commands.rs) and the local HTTP API
//! the browser extension calls (server.rs).
//!
//! Each used to carry its own copy of these queries, and the copies drifted —
//! a bookmark added from the extension, for instance, never reached the
//! shortcut folder until the next restart. Keep the SQL here; the callers only
//! decide what shape their response takes.
//!
//! The MCP server (mcp.rs) is not a caller: it runs in its own process on a
//! read-only connection, with its own read model.

use rusqlite::{Connection, OptionalExtension};
use serde_json::{json, Value};
use std::collections::HashMap;

/// `rusqlite` error as the `String` every command returns.
fn err(e: rusqlite::Error) -> String {
    e.to_string()
}

/// Order value for a newly created tag: the end of the manual order used by
/// Tag Manager. Tags created before the manual order existed keep 0 and are
/// listed first, alphabetically.
fn next_tag_order(conn: &Connection) -> Result<i64, String> {
    conn.query_row("SELECT COALESCE(MAX(sort_order), 0) + 1 FROM tags", [], |r| r.get(0))
        .map_err(err)
}

/// The id of the tag called `name`, creating it (at the end of the manual
/// order) when there is none.
pub fn find_or_create_tag(
    conn: &Connection,
    name: &str,
    color: Option<&str>,
    ts: &str,
) -> Result<String, String> {
    if let Some(id) = conn
        .query_row("SELECT id FROM tags WHERE name = ?1", [name], |r| r.get::<_, String>(0))
        .optional()
        .map_err(err)?
    {
        return Ok(id);
    }
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO tags (id, name, color, sort_order, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![id, name, color, next_tag_order(conn)?, ts, ts],
    )
    .map_err(err)?;
    Ok(id)
}

/// Link `tags` (by name, creating any that are missing) to a bookmark.
pub fn link_tags(conn: &Connection, bookmark_id: &str, tags: &[String], ts: &str) -> Result<(), String> {
    for tag_name in tags {
        let tag_id = find_or_create_tag(conn, tag_name, None, ts)?;
        conn.execute(
            "INSERT INTO bookmarks_tags (bookmark_id, tag_id, created_at) VALUES (?1, ?2, ?3) \
             ON CONFLICT(bookmark_id, tag_id) DO NOTHING",
            rusqlite::params![bookmark_id, tag_id, ts],
        )
        .map_err(err)?;
    }
    Ok(())
}

/// Every bookmark, in the manual order, as the JSON object both APIs send —
/// paired with the names of its tags, which each caller attaches in its own
/// shape.
pub fn list_bookmarks(conn: &Connection) -> Result<Vec<(Value, Vec<String>)>, String> {
    let mut tag_map: HashMap<String, Vec<String>> = HashMap::new();
    {
        let mut stmt = conn
            .prepare(
                "SELECT bt.bookmark_id, t.name FROM bookmarks_tags bt \
                 JOIN tags t ON t.id = bt.tag_id",
            )
            .map_err(err)?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(err)?;
        for row in rows {
            let (bookmark_id, name) = row.map_err(err)?;
            tag_map.entry(bookmark_id).or_default().push(name);
        }
    }

    let mut stmt = conn
        .prepare(
            "SELECT id, kind, title, url, favicon, is_pinned, access_count, custom_order, \
             memo, created_at, updated_at, last_accessed_at, shortcut \
             FROM bookmarks ORDER BY custom_order ASC",
        )
        .map_err(err)?;
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
        .map_err(err)?;

    let mut out = Vec::new();
    for row in rows {
        let obj = row.map_err(err)?;
        let tags = obj["id"]
            .as_str()
            .and_then(|id| tag_map.remove(id))
            .unwrap_or_default();
        out.push((obj, tags));
    }
    Ok(out)
}

pub fn list_tags(conn: &Connection) -> Result<Vec<Value>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, color, sort_order, created_at, updated_at \
             FROM tags ORDER BY sort_order ASC, name ASC",
        )
        .map_err(err)?;
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
        .map_err(err)?;
    rows.collect::<Result<_, _>>().map_err(err)
}

pub fn list_tag_rules(conn: &Connection) -> Result<Vec<Value>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, match_type, pattern, tag_id, target_field, created_at, updated_at \
             FROM tag_rules ORDER BY created_at ASC",
        )
        .map_err(err)?;
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
        .map_err(err)?;
    rows.collect::<Result<_, _>>().map_err(err)
}

/// A bookmark to create. `kind` defaults to `"url"`.
pub struct NewBookmark {
    pub kind: Option<String>,
    pub title: String,
    pub url: String,
    pub favicon: Option<String>,
    pub is_pinned: bool,
    pub memo: Option<String>,
    pub shortcut: Option<String>,
    pub tags: Vec<String>,
}

/// Insert a bookmark at the end of the manual order, with its tags, in one
/// transaction. `ts` is its update time; `created_at` defaults to it. Returns
/// the new id.
pub fn insert_bookmark(
    conn: &mut Connection,
    bookmark: &NewBookmark,
    created_at: Option<&str>,
    ts: &str,
) -> Result<String, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let kind = bookmark.kind.as_deref().unwrap_or("url");

    let tx = conn.transaction().map_err(err)?;
    let next_order: i64 = tx
        .query_row("SELECT COALESCE(MAX(custom_order), 0) + 1 FROM bookmarks", [], |r| r.get(0))
        .map_err(err)?;
    tx.execute(
        "INSERT INTO bookmarks (id, kind, title, url, favicon, is_pinned, access_count, \
         custom_order, memo, shortcut, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7, ?8, ?9, ?10, ?11)",
        rusqlite::params![
            id,
            kind,
            bookmark.title,
            bookmark.url,
            bookmark.favicon,
            bookmark.is_pinned as i64,
            next_order,
            bookmark.memo,
            bookmark.shortcut,
            created_at.unwrap_or(ts),
            ts
        ],
    )
    .map_err(err)?;
    link_tags(&tx, &id, &bookmark.tags, ts)?;
    tx.commit().map_err(err)?;
    Ok(id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::migrate(&conn).unwrap();
        conn
    }

    fn new_bookmark(url: &str, tags: &[&str]) -> NewBookmark {
        NewBookmark {
            kind: None,
            title: "Title".into(),
            url: url.into(),
            favicon: None,
            is_pinned: false,
            memo: None,
            shortcut: Some("Alt+KeyK".into()),
            tags: tags.iter().map(|t| t.to_string()).collect(),
        }
    }

    #[test]
    fn insert_then_list_round_trips_with_tags() {
        let mut conn = scratch_db();
        let first = insert_bookmark(&mut conn, &new_bookmark("https://a", &["docs", "work"]), None, "t1")
            .unwrap();
        let second = insert_bookmark(&mut conn, &new_bookmark("https://b", &["docs"]), Some("t0"), "t2")
            .unwrap();

        let listed = list_bookmarks(&conn).unwrap();
        assert_eq!(listed.len(), 2);
        let (a, a_tags) = &listed[0];
        assert_eq!(a["id"], first.as_str());
        assert_eq!(a["kind"], "url");
        assert_eq!(a["shortcut"], "Alt+KeyK");
        assert_eq!(a["created_at"], "t1");
        let mut a_tags = a_tags.clone();
        a_tags.sort();
        assert_eq!(a_tags, vec!["docs", "work"]);

        let (b, _) = &listed[1];
        assert_eq!(b["id"], second.as_str());
        assert_eq!(b["created_at"], "t0", "an import keeps its original date");
        assert_eq!(b["updated_at"], "t2");
        assert!(b["custom_order"].as_i64() > a["custom_order"].as_i64());

        // "docs" was shared, not created twice.
        assert_eq!(list_tags(&conn).unwrap().len(), 2);
    }

    #[test]
    fn find_or_create_tag_reuses_existing_tags() {
        let conn = scratch_db();
        let id = find_or_create_tag(&conn, "docs", Some("red"), "t").unwrap();
        assert_eq!(find_or_create_tag(&conn, "docs", None, "t").unwrap(), id);
        let other = find_or_create_tag(&conn, "work", None, "t").unwrap();
        assert_ne!(other, id);

        let tags = list_tags(&conn).unwrap();
        assert_eq!(tags[0]["name"], "docs");
        assert_eq!(tags[0]["color"], "red");
        assert!(tags[1]["sort_order"].as_i64() > tags[0]["sort_order"].as_i64());
    }
}
