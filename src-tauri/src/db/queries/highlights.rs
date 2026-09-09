use crate::models::Highlight;
use rusqlite::{params, Connection};

pub fn list_for_chapter(conn: &Connection, book_id: i64, chapter: i64) -> anyhow::Result<Vec<Highlight>> {
    let mut stmt = conn.prepare(
        "SELECT id, book_id, chapter, verse_start, verse_end, char_start, char_end, color, style,
                translation_id, created_at, updated_at
         FROM highlights WHERE book_id = ?1 AND chapter = ?2 ORDER BY verse_start",
    )?;
    let rows = stmt.query_map(params![book_id, chapter], map_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn map_row(r: &rusqlite::Row) -> rusqlite::Result<Highlight> {
    Ok(Highlight {
        id: r.get(0)?,
        book_id: r.get(1)?,
        chapter: r.get(2)?,
        verse_start: r.get(3)?,
        verse_end: r.get(4)?,
        char_start: r.get(5)?,
        char_end: r.get(6)?,
        color: r.get(7)?,
        style: r.get(8)?,
        translation_id: r.get(9)?,
        created_at: r.get(10)?,
        updated_at: r.get(11)?,
    })
}

pub struct NewHighlight {
    pub book_id: i64,
    pub chapter: i64,
    pub verse_start: i64,
    pub verse_end: i64,
    pub char_start: Option<i64>,
    pub char_end: Option<i64>,
    pub color: String,
    pub style: String,
    pub translation_id: Option<i64>,
}

pub fn create(conn: &Connection, h: NewHighlight) -> anyhow::Result<Highlight> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO highlights (book_id, chapter, verse_start, verse_end, char_start, char_end, color, style, translation_id, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10)",
        params![h.book_id, h.chapter, h.verse_start, h.verse_end, h.char_start, h.char_end, h.color, h.style, h.translation_id, now],
    )?;
    let id = conn.last_insert_rowid();
    Ok(conn.query_row(
        "SELECT id, book_id, chapter, verse_start, verse_end, char_start, char_end, color, style, translation_id, created_at, updated_at FROM highlights WHERE id = ?1",
        params![id],
        map_row,
    )?)
}

pub fn delete(conn: &Connection, id: i64) -> anyhow::Result<()> {
    conn.execute("DELETE FROM highlights WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn update_color(conn: &Connection, id: i64, color: String, style: String) -> anyhow::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE highlights SET color = ?1, style = ?2, updated_at = ?3 WHERE id = ?4",
        params![color, style, now, id],
    )?;
    Ok(())
}
