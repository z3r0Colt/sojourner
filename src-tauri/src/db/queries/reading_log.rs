use crate::models::ReadingLogEntry;
use rusqlite::{params, Connection};

/// Today's date in the reader's own time zone, as YYYY-MM-DD -- the log is
/// a calendar of days read, so a chapter opened at 23:30 belongs to that
/// day, not to UTC's next one.
pub fn today() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

/// Records that `book_id`/`chapter` was open on `date`. Idempotent per day:
/// re-saving the position while scrolling only updates the translation.
pub fn record(conn: &Connection, date: &str, book_id: i64, chapter: i64, translation_id: i64) -> anyhow::Result<()> {
    conn.execute(
        "INSERT INTO reading_log (date, book_id, chapter, translation_id) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(date, book_id, chapter) DO UPDATE SET translation_id = excluded.translation_id",
        params![date, book_id, chapter, translation_id],
    )?;
    Ok(())
}

/// The most recently read chapters, newest first, each chapter once (on the
/// day it was last read). Powers "Recent chapters" on the Today page.
pub fn list_recent(conn: &Connection, limit: i64) -> anyhow::Result<Vec<ReadingLogEntry>> {
    let mut stmt = conn.prepare(
        "SELECT MAX(date) AS last_date, book_id, chapter,
                (SELECT translation_id FROM reading_log r2
                  WHERE r2.book_id = r.book_id AND r2.chapter = r.chapter
                  ORDER BY r2.date DESC, r2.id DESC LIMIT 1) AS translation_id,
                MAX(id) AS last_id
         FROM reading_log r
         GROUP BY book_id, chapter
         ORDER BY last_date DESC, last_id DESC
         LIMIT ?1",
    )?;
    let rows = stmt.query_map(params![limit], |r| {
        Ok(ReadingLogEntry {
            date: r.get(0)?,
            book_id: r.get(1)?,
            chapter: r.get(2)?,
            translation_id: r.get(3)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}
