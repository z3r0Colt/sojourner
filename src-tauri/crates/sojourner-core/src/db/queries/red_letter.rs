use crate::models::RedLetterRange;
use rusqlite::{params, Connection};

pub fn get_ranges_for_chapter(conn: &Connection, book_id: i64, chapter: i64) -> anyhow::Result<Vec<RedLetterRange>> {
    let mut stmt = conn.prepare(
        "SELECT verse_start, verse_end FROM red_letter_ranges WHERE book_id = ?1 AND chapter = ?2 ORDER BY verse_start",
    )?;
    let rows = stmt.query_map(params![book_id, chapter], |r| {
        Ok(RedLetterRange { verse_start: r.get(0)?, verse_end: r.get(1)? })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}
