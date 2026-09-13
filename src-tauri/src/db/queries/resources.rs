use crate::models::{Resource, ResourceLink, ResourcePassageLink, ResourceSearchResult};
use rusqlite::{params, Connection, OptionalExtension};

fn map_resource(r: &rusqlite::Row) -> rusqlite::Result<Resource> {
    let text: Option<String> = r.get(4)?;
    let library_key: Option<String> = r.get(7)?;
    Ok(Resource {
        id: r.get(0)?,
        kind: r.get(1)?,
        title: r.get(2)?,
        author: r.get(3)?,
        // A shipped book carries no text in user.db -- content.db holds it for
        // every install -- but it is every bit as searchable.
        has_text: text.is_some() || library_key.is_some(),
        file_path: r.get(5)?,
        added_at: r.get(6)?,
        bundled: library_key.is_some(),
    })
}
const RESOURCE_COLS: &str = "id, kind, title, author, extracted_text, file_path, added_at, library_key";

pub fn list_all(conn: &Connection) -> anyhow::Result<Vec<Resource>> {
    let mut stmt = conn.prepare(&format!("SELECT {RESOURCE_COLS} FROM resources ORDER BY title COLLATE NOCASE"))?;
    let rows = stmt.query_map([], map_resource)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn get(conn: &Connection, id: i64) -> anyhow::Result<Option<Resource>> {
    Ok(conn
        .query_row(&format!("SELECT {RESOURCE_COLS} FROM resources WHERE id = ?1"), params![id], map_resource)
        .optional()?)
}

/// The words of a resource. A shipped book's text is in content.db rather
/// than in the reader's own file, so the lookup follows `library_key` there.
pub fn get_extracted_text(conn: &Connection, id: i64) -> anyhow::Result<Option<String>> {
    let row: Option<(Option<String>, Option<String>)> = conn
        .query_row(
            "SELECT extracted_text, library_key FROM resources WHERE id = ?1",
            params![id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    match row {
        Some((text, None)) => Ok(text),
        Some((_, Some(key))) => crate::library::extracted_text(conn, &key),
        None => Ok(None),
    }
}

pub fn create(conn: &Connection, kind: &str, title: &str, author: Option<&str>, file_path: &str, extracted_text: Option<&str>) -> anyhow::Result<Resource> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO resources (kind, title, author, file_path, extracted_text, added_at) VALUES (?1,?2,?3,?4,?5,?6)",
        params![kind, title, author, file_path, extracted_text, now],
    )?;
    let id = conn.last_insert_rowid();
    Ok(conn.query_row(&format!("SELECT {RESOURCE_COLS} FROM resources WHERE id = ?1"), params![id], map_resource)?)
}

pub fn delete(conn: &Connection, id: i64) -> anyhow::Result<()> {
    conn.execute("DELETE FROM resources WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn search(conn: &Connection, query: &str, limit: i64) -> anyhow::Result<Vec<ResourceSearchResult>> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    let match_expr = query
        .split_whitespace()
        .map(|t| format!("\"{}\"*", t.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(" ");
    // Two indexes hold the library now: the reader's own books in user.db,
    // and the shipped ones in content.db (their text is the same on every
    // install, so it is not copied into anybody's own file). Each is asked
    // separately -- fts5's snippet() and bm25() want their table in the FROM
    // of the query they are called in -- and the two are merged by rank.
    let mut hits = Vec::new();
    // A shipped book is excluded here even though user.db still indexes its
    // title: its text lives in content.db, so the second query is the one
    // that can quote it, and without this the same book comes back twice --
    // once with nothing to show for itself.
    let mut own = conn.prepare(
        "SELECT res.id, res.title, res.kind, snippet(resources_fts, 2, '[', ']', '…', 12), bm25(resources_fts)
         FROM resources_fts JOIN resources res ON res.id = resources_fts.rowid
         WHERE resources_fts MATCH ?1 AND res.library_key IS NULL
         ORDER BY bm25(resources_fts) LIMIT ?2",
    )?;
    // Only where the attached content.db is new enough to have one: an older
    // one has no such table, and a reader's own books must still be findable.
    let mut shipped = crate::library::is_available(conn)
        .then(|| {
            conn.prepare(
                "SELECT res.id, res.title, res.kind, snippet(library_fts, 2, '[', ']', '…', 12), bm25(library_fts)
                 FROM library_fts
                 JOIN library_resources lib ON lib.id = library_fts.rowid
                 JOIN resources res ON res.library_key = lib.file_name
                 WHERE library_fts MATCH ?1 ORDER BY bm25(library_fts) LIMIT ?2",
            )
        })
        .transpose()?;
    for stmt in [Some(&mut own), shipped.as_mut()].into_iter().flatten() {
        let rows = stmt.query_map(params![match_expr, limit], |r| {
            Ok((
                ResourceSearchResult {
                    resource_id: r.get(0)?,
                    title: r.get(1)?,
                    kind: r.get(2)?,
                    // The snippet is written into the page as HTML, so a book
                    // with an angle bracket in it must not arrive as markup.
                    // It can be null outright -- a match on a title in a row
                    // whose text column is empty -- which is not an error.
                    snippet: crate::db::queries::search::escape_snippet(
                        &r.get::<_, Option<String>>(3)?.unwrap_or_default(),
                    ),
                },
                r.get::<_, f64>(4)?,
            ))
        })?;
        for row in rows {
            hits.push(row?);
        }
    }
    // bm25 is negative, most relevant first.
    hits.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
    hits.truncate(limit as usize);
    Ok(hits.into_iter().map(|(hit, _)| hit).collect())
}

fn map_passage_link(r: &rusqlite::Row) -> rusqlite::Result<ResourcePassageLink> {
    Ok(ResourcePassageLink {
        id: r.get(0)?,
        resource_id: r.get(1)?,
        book_id: r.get(2)?,
        chapter: r.get(3)?,
        verse_start: r.get(4)?,
        verse_end: r.get(5)?,
        location: r.get(6)?,
        label: r.get(7)?,
        created_at: r.get(8)?,
    })
}
const LINK_COLS: &str = "id, resource_id, book_id, chapter, verse_start, verse_end, location, label, created_at";

pub fn list_passage_links_for_chapter(conn: &Connection, book_id: i64, chapter: i64) -> anyhow::Result<Vec<ResourcePassageLink>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {LINK_COLS} FROM resource_passage_links WHERE book_id = ?1 AND chapter = ?2 ORDER BY created_at"
    ))?;
    let rows = stmt.query_map(params![book_id, chapter], map_passage_link)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn list_passage_links_for_resource(conn: &Connection, resource_id: i64) -> anyhow::Result<Vec<ResourcePassageLink>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {LINK_COLS} FROM resource_passage_links WHERE resource_id = ?1 ORDER BY created_at"
    ))?;
    let rows = stmt.query_map(params![resource_id], map_passage_link)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

#[allow(clippy::too_many_arguments)]
pub fn create_passage_link(
    conn: &Connection,
    resource_id: i64,
    book_id: i64,
    chapter: i64,
    verse_start: Option<i64>,
    verse_end: Option<i64>,
    location: Option<&str>,
    label: Option<&str>,
) -> anyhow::Result<ResourcePassageLink> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO resource_passage_links (resource_id, book_id, chapter, verse_start, verse_end, location, label, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        params![resource_id, book_id, chapter, verse_start, verse_end, location, label, now],
    )?;
    let id = conn.last_insert_rowid();
    Ok(conn.query_row(&format!("SELECT {LINK_COLS} FROM resource_passage_links WHERE id = ?1"), params![id], map_passage_link)?)
}

pub fn delete_passage_link(conn: &Connection, id: i64) -> anyhow::Result<()> {
    conn.execute("DELETE FROM resource_passage_links WHERE id = ?1", params![id])?;
    Ok(())
}

fn map_resource_link(r: &rusqlite::Row) -> rusqlite::Result<ResourceLink> {
    Ok(ResourceLink {
        id: r.get(0)?,
        from_resource_id: r.get(1)?,
        to_resource_id: r.get(2)?,
        from_location: r.get(3)?,
        label: r.get(4)?,
        created_at: r.get(5)?,
    })
}
const RLINK_COLS: &str = "id, from_resource_id, to_resource_id, from_location, label, created_at";

pub fn list_resource_links(conn: &Connection, resource_id: i64) -> anyhow::Result<Vec<ResourceLink>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {RLINK_COLS} FROM resource_links WHERE from_resource_id = ?1 ORDER BY created_at"
    ))?;
    let rows = stmt.query_map(params![resource_id], map_resource_link)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn create_resource_link(
    conn: &Connection,
    from_resource_id: i64,
    to_resource_id: i64,
    from_location: Option<&str>,
    label: Option<&str>,
) -> anyhow::Result<ResourceLink> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO resource_links (from_resource_id, to_resource_id, from_location, label, created_at) VALUES (?1,?2,?3,?4,?5)",
        params![from_resource_id, to_resource_id, from_location, label, now],
    )?;
    let id = conn.last_insert_rowid();
    Ok(conn.query_row(&format!("SELECT {RLINK_COLS} FROM resource_links WHERE id = ?1"), params![id], map_resource_link)?)
}

pub fn delete_resource_link(conn: &Connection, id: i64) -> anyhow::Result<()> {
    conn.execute("DELETE FROM resource_links WHERE id = ?1", params![id])?;
    Ok(())
}

// Topic tagging (justification, sanctification, the covenants, the
// Sabbath, the means of grace, ...), same shape as sermon_note_tags/
// note_tags, so a resource can be filtered/browsed by doctrine the way
// sermon notes already are.

pub fn add_tag(conn: &Connection, resource_id: i64, tag: String) -> anyhow::Result<()> {
    conn.execute("INSERT OR IGNORE INTO resource_tags (resource_id, tag) VALUES (?1, ?2)", params![resource_id, tag.trim()])?;
    Ok(())
}

pub fn remove_tag(conn: &Connection, resource_id: i64, tag: String) -> anyhow::Result<()> {
    conn.execute("DELETE FROM resource_tags WHERE resource_id = ?1 AND tag = ?2", params![resource_id, tag])?;
    Ok(())
}

pub fn list_tags(conn: &Connection, resource_id: i64) -> anyhow::Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT tag FROM resource_tags WHERE resource_id = ?1 ORDER BY tag")?;
    let rows = stmt.query_map(params![resource_id], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn list_all_tags(conn: &Connection) -> anyhow::Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT DISTINCT tag FROM resource_tags ORDER BY tag")?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn list_all_tags_by_resource(conn: &Connection) -> anyhow::Result<Vec<(i64, String)>> {
    let mut stmt = conn.prepare("SELECT resource_id, tag FROM resource_tags ORDER BY resource_id, tag")?;
    let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// Resources whose topic tags plausibly bear on a given doctrine topic --
/// the topic's own name (with its "Of "/"Of the " prefix stripped, same as
/// `suggest_for_passage`'s per-chapter keyword) matched against
/// `resource_tags` by substring. Used inside the Confession/Catechism view
/// so opening a topic surfaces related library material without a
/// separate topic-browsing page.
pub fn suggest_for_topic(conn: &Connection, topic_id: i64) -> anyhow::Result<Vec<Resource>> {
    let name: Option<String> =
        conn.query_row("SELECT name FROM doctrine_topics WHERE id = ?1", params![topic_id], |r| r.get(0)).optional()?;
    let Some(name) = name else { return Ok(vec![]) };
    let keyword = name.strip_prefix("Of the ").or_else(|| name.strip_prefix("Of ")).unwrap_or(&name);

    let cols_r = RESOURCE_COLS.split(", ").map(|c| format!("r.{c}")).collect::<Vec<_>>().join(", ");
    let mut stmt = conn.prepare(&format!(
        "SELECT DISTINCT {cols_r} FROM resources r JOIN resource_tags t ON t.resource_id = r.id
         WHERE t.tag LIKE '%' || ?1 || '%' ORDER BY r.title COLLATE NOCASE"
    ))?;
    let rows = stmt.query_map(params![keyword], map_resource)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// Resources whose topic tags plausibly bear on a passage: WCF chapters the
/// passage's proof texts cite (see `westminster::list_wcf_chapters_cited`)
/// mapped to their doctrine_topics keyword (e.g. WCF 11 -> "Justification"),
/// matched against `resource_tags` by substring -- a resource tagged
/// "justification by faith" still matches the "Justification" keyword. This
/// is a suggestion, not a citation: it surfaces resources that MIGHT bear on
/// the text, same spirit as the manual resource_passage_links a user sets
/// themselves, just automatic instead of hand-linked.
pub fn suggest_for_passage(conn: &Connection, book_id: i64, chapter: i64) -> anyhow::Result<Vec<Resource>> {
    let wcf_chapters = super::westminster::list_wcf_chapters_cited(conn, book_id, chapter)?;
    if wcf_chapters.is_empty() {
        return Ok(vec![]);
    }
    let placeholders = wcf_chapters.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let mut stmt = conn.prepare(&format!("SELECT name FROM doctrine_topics WHERE wcf_chapter IN ({placeholders})"))?;
    let topic_names: Vec<String> = stmt
        .query_map(rusqlite::params_from_iter(wcf_chapters.iter()), |r| r.get(0))?
        .collect::<Result<_, _>>()?;
    if topic_names.is_empty() {
        return Ok(vec![]);
    }

    let cols_r = RESOURCE_COLS.split(", ").map(|c| format!("r.{c}")).collect::<Vec<_>>().join(", ");
    let mut resources = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for name in &topic_names {
        let keyword = name.strip_prefix("Of the ").or_else(|| name.strip_prefix("Of ")).unwrap_or(name);
        let mut stmt = conn.prepare(&format!(
            "SELECT DISTINCT {cols_r} FROM resources r JOIN resource_tags t ON t.resource_id = r.id
             WHERE t.tag LIKE '%' || ?1 || '%' ORDER BY r.title COLLATE NOCASE"
        ))?;
        let rows = stmt.query_map(params![keyword], map_resource)?;
        for row in rows {
            let r = row?;
            if seen.insert(r.id) {
                resources.push(r);
            }
        }
    }
    Ok(resources)
}

pub fn list_by_tag(conn: &Connection, tag: &str) -> anyhow::Result<Vec<Resource>> {
    let cols_r = RESOURCE_COLS.split(", ").map(|c| format!("r.{c}")).collect::<Vec<_>>().join(", ");
    let mut stmt = conn.prepare(&format!(
        "SELECT {cols_r} FROM resources r JOIN resource_tags t ON t.resource_id = r.id
         WHERE t.tag = ?1 ORDER BY r.title COLLATE NOCASE"
    ))?;
    let rows = stmt.query_map(params![tag], map_resource)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}
