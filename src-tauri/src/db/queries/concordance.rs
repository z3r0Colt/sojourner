use crate::models::ConcordanceEntry;
use rusqlite::{params, Connection};

/// Every verse where a given Strong's-tagged word occurs, with its KJV text
/// as surrounding context (a verse can use the same underlying word more
/// than once -- DISTINCT so it's listed once, not per-occurrence).
pub fn get_concordance(conn: &Connection, strongs_id: &str) -> anyhow::Result<Vec<ConcordanceEntry>> {
    let mut stmt = conn.prepare(
        "SELECT DISTINCT iw.book_id, iw.chapter, iw.verse, v.text
         FROM interlinear_words iw
         JOIN verses v ON v.book_id = iw.book_id AND v.chapter = iw.chapter AND v.verse = iw.verse
         JOIN translations t ON t.id = v.translation_id AND t.code = 'KJV'
         WHERE iw.strongs_id = ?1
         ORDER BY iw.book_id, iw.chapter, iw.verse",
    )?;
    let rows = stmt.query_map(params![strongs_id], |r| {
        Ok(ConcordanceEntry {
            book_id: r.get(0)?,
            chapter: r.get(1)?,
            verse: r.get(2)?,
            text: r.get(3)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}
