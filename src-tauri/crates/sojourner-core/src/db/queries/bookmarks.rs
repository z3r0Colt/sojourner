use crate::models::Bookmark;
use rusqlite::{params, Connection};

fn map_row(r: &rusqlite::Row) -> rusqlite::Result<Bookmark> {
    Ok(Bookmark {
        id: r.get(0)?,
        book_id: r.get(1)?,
        chapter: r.get(2)?,
        verse: r.get(3)?,
        label: r.get(4)?,
        created_at: r.get(5)?,
    })
}

pub fn list_all(conn: &Connection) -> anyhow::Result<Vec<Bookmark>> {
    let mut stmt = conn.prepare(
        "SELECT id, book_id, chapter, verse, label, created_at FROM bookmarks ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map([], map_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn create(
    conn: &Connection,
    book_id: i64,
    chapter: i64,
    verse: Option<i64>,
    label: Option<String>,
) -> anyhow::Result<Bookmark> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO bookmarks (book_id, chapter, verse, label, created_at) VALUES (?1,?2,?3,?4,?5)",
        params![book_id, chapter, verse, label, now],
    )?;
    let id = conn.last_insert_rowid();
    Ok(conn.query_row(
        "SELECT id, book_id, chapter, verse, label, created_at FROM bookmarks WHERE id = ?1",
        params![id],
        map_row,
    )?)
}

pub fn delete(conn: &Connection, id: i64) -> anyhow::Result<()> {
    conn.execute("DELETE FROM bookmarks WHERE id = ?1", params![id])?;
    Ok(())
}
