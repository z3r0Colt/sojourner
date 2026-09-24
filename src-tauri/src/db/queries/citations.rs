//! "Cited in your library": which books cite a passage, and where.
//!
//! Three places the citations live, read together: each installed shelf's
//! `library_citations` (built with its pack), and user.db's
//! `resource_citations` for the reader's own books (built when a book's text
//! is extracted). A pack from before 0.3 has no citations table; it is simply
//! skipped.

use rusqlite::{params, Connection};
use serde::Serialize;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize)]
pub struct CitationHit {
    /// user.db's `resources.id`, which is what the reader opens.
    pub resource_id: i64,
    pub title: String,
    pub author: Option<String>,
    /// The shelf it is on ("Church Fathers"), or "Your books".
    pub shelf: String,
    pub label: String,
    pub occurrence: i64,
    pub context: String,
    pub chapter: i64,
    pub verse_start: i64,
    pub verse_end: i64,
}

/// Replaces a reader's book's citations from its text.
pub fn index_resource(conn: &Connection, resource_id: i64, text: Option<&str>) -> anyhow::Result<usize> {
    conn.execute("DELETE FROM resource_citations WHERE resource_id = ?1", params![resource_id])?;
    let Some(text) = text else { return Ok(0) };
    let mut insert = conn.prepare_cached(
        "INSERT INTO resource_citations (resource_id, char_offset, label, occurrence, context, book_id, chapter, verse_start, verse_end)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
    )?;
    let mut n = 0;
    for c in crate::citations::extract(text) {
        insert.execute(params![resource_id, c.offset as i64, c.label, c.occurrence, c.context, c.book_id, c.chapter, c.verse_start, c.verse_end])?;
        n += 1;
    }
    Ok(n)
}

/// The reader's own books with text and no citations yet: one at a time, so
/// the caller can release the lock between them. Returns the ids.
pub fn resources_needing_index(conn: &Connection) -> anyhow::Result<Vec<i64>> {
    let mut stmt = conn.prepare(
        "SELECT r.id FROM resources r
         WHERE r.extracted_text IS NOT NULL AND r.library_key IS NULL
           AND NOT EXISTS (SELECT 1 FROM resource_citations c WHERE c.resource_id = r.id)",
    )?;
    let ids = stmt.query_map([], |r| r.get(0))?.collect::<Result<Vec<_>, _>>()?;
    Ok(ids)
}

fn has_citations(conn: &Connection, schema: &str) -> bool {
    conn.query_row(
        &format!("SELECT 1 FROM {schema}.sqlite_master WHERE type = 'table' AND name = 'library_citations'"),
        [],
        |_| Ok(()),
    )
    .is_ok()
}

/// Every book that cites a verse of this chapter (or, with `verse`, that
/// verse), grouped by shelf in the order given, then by book.
pub fn for_passage(conn: &Connection, book_id: i64, chapter: i64, verse: Option<i64>, shelves: &[(String, String)], limit: i64) -> anyhow::Result<Vec<CitationHit>> {
    let verse_cond = if verse.is_some() { " AND ?3 BETWEEN c.verse_start AND c.verse_end" } else { "" };
    let mut out = Vec::new();
    for (schema, shelf) in shelves {
        if !has_citations(conn, schema) {
            continue;
        }
        let sql = format!(
            "SELECT res.id, res.title, res.author, c.label, c.occurrence, c.context, c.chapter, c.verse_start, c.verse_end
             FROM {schema}.library_citations c
             JOIN {schema}.library_resources lib ON lib.id = c.resource_id
             JOIN resources res ON res.library_key = lib.file_name
             WHERE c.book_id = ?1 AND c.chapter = ?2{verse_cond}
             ORDER BY res.title, c.char_offset LIMIT {limit}"
        );
        collect(conn, &sql, book_id, chapter, verse, shelf, &mut out)?;
    }
    let sql = format!(
        "SELECT res.id, res.title, res.author, c.label, c.occurrence, c.context, c.chapter, c.verse_start, c.verse_end
         FROM resource_citations c JOIN resources res ON res.id = c.resource_id
         WHERE c.book_id = ?1 AND c.chapter = ?2{verse_cond}
         ORDER BY res.title, c.char_offset LIMIT {limit}"
    );
    collect(conn, &sql, book_id, chapter, verse, "Your books", &mut out)?;
    Ok(out)
}

fn collect(conn: &Connection, sql: &str, book_id: i64, chapter: i64, verse: Option<i64>, shelf: &str, out: &mut Vec<CitationHit>) -> anyhow::Result<()> {
    let mut stmt = conn.prepare(sql)?;
    let map = |r: &rusqlite::Row| {
        Ok(CitationHit {
            resource_id: r.get(0)?,
            title: r.get(1)?,
            author: r.get(2)?,
            shelf: shelf.to_string(),
            label: r.get(3)?,
            occurrence: r.get(4)?,
            context: r.get(5)?,
            chapter: r.get(6)?,
            verse_start: r.get(7)?,
            verse_end: r.get(8)?,
        })
    };
    let rows: Vec<CitationHit> = match verse {
        Some(v) => stmt.query_map(params![book_id, chapter, v], map)?.collect::<Result<_, _>>()?,
        None => stmt.query_map(params![book_id, chapter], map)?.collect::<Result<_, _>>()?,
    };
    out.extend(rows);
    Ok(())
}

/// How many citations each verse of a chapter has, across every shelf and
/// the reader's own books -- the count beside a verse.
pub fn counts_for_chapter(conn: &Connection, book_id: i64, chapter: i64, schemas: &[String]) -> anyhow::Result<Vec<(i64, i64)>> {
    let mut counts: HashMap<i64, i64> = HashMap::new();
    let mut add = |sql: &str| -> anyhow::Result<()> {
        let mut stmt = conn.prepare(sql)?;
        let rows = stmt.query_map(params![book_id, chapter], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?, r.get::<_, i64>(2)?)))?;
        for row in rows {
            let (from, to, n) = row?;
            for v in from..=to.min(from + 40) {
                *counts.entry(v).or_default() += n;
            }
        }
        Ok(())
    };
    for schema in schemas {
        if has_citations(conn, schema) {
            add(&format!(
                "SELECT verse_start, verse_end, COUNT(*) FROM {schema}.library_citations WHERE book_id = ?1 AND chapter = ?2 GROUP BY verse_start, verse_end"
            ))?;
        }
    }
    add("SELECT verse_start, verse_end, COUNT(*) FROM resource_citations WHERE book_id = ?1 AND chapter = ?2 GROUP BY verse_start, verse_end")?;
    let mut out: Vec<(i64, i64)> = counts.into_iter().collect();
    out.sort();
    Ok(out)
}
