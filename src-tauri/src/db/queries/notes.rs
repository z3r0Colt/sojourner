use crate::models::{ChapterNote, Note};
use rusqlite::{params, Connection};

fn map_row(r: &rusqlite::Row) -> rusqlite::Result<Note> {
    Ok(Note {
        id: r.get(0)?,
        book_id: r.get(1)?,
        chapter: r.get(2)?,
        verse_start: r.get(3)?,
        verse_end: r.get(4)?,
        body: r.get(5)?,
        created_at: r.get(6)?,
        updated_at: r.get(7)?,
        highlight_id: r.get(8)?,
    })
}

const SELECT_COLS: &str =
    "id, book_id, chapter, verse_start, verse_end, body, created_at, updated_at, highlight_id";

pub fn list_for_chapter(conn: &Connection, book_id: i64, chapter: i64) -> anyhow::Result<Vec<Note>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {SELECT_COLS} FROM notes WHERE book_id = ?1 AND chapter = ?2 ORDER BY verse_start"
    ))?;
    let rows = stmt.query_map(params![book_id, chapter], map_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn list_all(conn: &Connection) -> anyhow::Result<Vec<Note>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {SELECT_COLS} FROM notes ORDER BY updated_at DESC"
    ))?;
    let rows = stmt.query_map([], map_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn create(
    conn: &Connection,
    book_id: i64,
    chapter: i64,
    verse_start: i64,
    verse_end: i64,
    body: String,
    highlight_id: Option<i64>,
) -> anyhow::Result<Note> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO notes (book_id, chapter, verse_start, verse_end, body, created_at, updated_at, highlight_id) VALUES (?1,?2,?3,?4,?5,?6,?6,?7)",
        params![book_id, chapter, verse_start, verse_end, body, now, highlight_id],
    )?;
    let id = conn.last_insert_rowid();
    Ok(conn.query_row(
        &format!("SELECT {SELECT_COLS} FROM notes WHERE id = ?1"),
        params![id],
        map_row,
    )?)
}

pub fn update(conn: &Connection, id: i64, body: String) -> anyhow::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE notes SET body = ?1, updated_at = ?2 WHERE id = ?3",
        params![body, now, id],
    )?;
    Ok(())
}

pub fn delete(conn: &Connection, id: i64) -> anyhow::Result<()> {
    conn.execute("DELETE FROM notes WHERE id = ?1", params![id])?;
    Ok(())
}

fn map_chapter_row(r: &rusqlite::Row) -> rusqlite::Result<ChapterNote> {
    Ok(ChapterNote {
        id: r.get(0)?,
        book_id: r.get(1)?,
        chapter: r.get(2)?,
        body: r.get(3)?,
        created_at: r.get(4)?,
        updated_at: r.get(5)?,
    })
}
const CHAPTER_COLS: &str = "id, book_id, chapter, body, created_at, updated_at";

pub fn list_chapter_notes(conn: &Connection, book_id: i64, chapter: i64) -> anyhow::Result<Vec<ChapterNote>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {CHAPTER_COLS} FROM chapter_notes WHERE book_id = ?1 AND chapter = ?2 ORDER BY created_at"
    ))?;
    let rows = stmt.query_map(params![book_id, chapter], map_chapter_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn list_all_chapter_notes(conn: &Connection) -> anyhow::Result<Vec<ChapterNote>> {
    let mut stmt = conn.prepare(&format!("SELECT {CHAPTER_COLS} FROM chapter_notes ORDER BY updated_at DESC"))?;
    let rows = stmt.query_map([], map_chapter_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn create_chapter_note(conn: &Connection, book_id: i64, chapter: i64, body: String) -> anyhow::Result<ChapterNote> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO chapter_notes (book_id, chapter, body, created_at, updated_at) VALUES (?1,?2,?3,?4,?4)",
        params![book_id, chapter, body, now],
    )?;
    let id = conn.last_insert_rowid();
    Ok(conn.query_row(&format!("SELECT {CHAPTER_COLS} FROM chapter_notes WHERE id = ?1"), params![id], map_chapter_row)?)
}

pub fn update_chapter_note(conn: &Connection, id: i64, body: String) -> anyhow::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute("UPDATE chapter_notes SET body = ?1, updated_at = ?2 WHERE id = ?3", params![body, now, id])?;
    Ok(())
}

pub fn delete_chapter_note(conn: &Connection, id: i64) -> anyhow::Result<()> {
    conn.execute("DELETE FROM chapter_notes WHERE id = ?1", params![id])?;
    Ok(())
}
