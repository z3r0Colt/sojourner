use crate::models::CrossReference;
use rusqlite::{params, Connection};

pub fn get_cross_references(conn: &Connection, book_id: i64, chapter: i64, verse: i64) -> anyhow::Result<Vec<CrossReference>> {
    let mut stmt = conn.prepare(
        "SELECT to_book_id, to_chapter, to_verse_start, to_verse_end, votes FROM cross_references
         WHERE from_book_id = ?1 AND from_chapter = ?2 AND from_verse = ?3
         ORDER BY votes DESC",
    )?;
    let rows = stmt.query_map(params![book_id, chapter, verse], |r| {
        Ok(CrossReference {
            to_book_id: r.get(0)?,
            to_chapter: r.get(1)?,
            to_verse_start: r.get(2)?,
            to_verse_end: r.get(3)?,
            votes: r.get(4)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}
