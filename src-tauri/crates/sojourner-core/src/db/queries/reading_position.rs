use crate::models::ReadingPosition;
use rusqlite::{params, Connection, OptionalExtension};

pub fn get(conn: &Connection) -> anyhow::Result<Option<ReadingPosition>> {
    let row = conn
        .query_row(
            "SELECT translation_id, book_id, chapter, verse FROM reading_position WHERE id = 1",
            [],
            |r| {
                Ok(ReadingPosition {
                    translation_id: r.get(0)?,
                    book_id: r.get(1)?,
                    chapter: r.get(2)?,
                    verse: r.get(3)?,
                })
            },
        )
        .optional()?;
    Ok(row)
}

pub fn set(
    conn: &Connection,
    translation_id: i64,
    book_id: i64,
    chapter: i64,
    verse: Option<i64>,
) -> anyhow::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO reading_position (id, translation_id, book_id, chapter, verse, updated_at)
         VALUES (1, ?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(id) DO UPDATE SET translation_id=?1, book_id=?2, chapter=?3, verse=?4, updated_at=?5",
        params![translation_id, book_id, chapter, verse, now],
    )?;
    Ok(())
}
