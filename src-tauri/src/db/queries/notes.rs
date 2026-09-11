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

pub fn get(conn: &Connection, id: i64) -> anyhow::Result<Option<Note>> {
    use rusqlite::OptionalExtension;
    Ok(conn.query_row(&format!("SELECT {SELECT_COLS} FROM notes WHERE id = ?1"), params![id], map_row).optional()?)
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

pub fn get_chapter_note(conn: &Connection, id: i64) -> anyhow::Result<Option<ChapterNote>> {
    use rusqlite::OptionalExtension;
    Ok(conn.query_row(&format!("SELECT {CHAPTER_COLS} FROM chapter_notes WHERE id = ?1"), params![id], map_chapter_row).optional()?)
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

// Doctrine/use tagging (conviction, comfort, duty, or a doctrine name) for
// both note kinds -- kept as sibling tables rather than embedded on
// Note/ChapterNote (see USER_MIGRATION_0009's schema comment), same
// add/remove/list-all/list-by-tag shape as sermon_note_tags.

pub fn add_tag(conn: &Connection, note_id: i64, tag: String) -> anyhow::Result<()> {
    conn.execute("INSERT OR IGNORE INTO note_tags (note_id, tag) VALUES (?1, ?2)", params![note_id, tag.trim()])?;
    Ok(())
}

pub fn remove_tag(conn: &Connection, note_id: i64, tag: String) -> anyhow::Result<()> {
    conn.execute("DELETE FROM note_tags WHERE note_id = ?1 AND tag = ?2", params![note_id, tag])?;
    Ok(())
}

pub fn list_tags(conn: &Connection, note_id: i64) -> anyhow::Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT tag FROM note_tags WHERE note_id = ?1 ORDER BY tag")?;
    let rows = stmt.query_map(params![note_id], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn list_all_tags(conn: &Connection) -> anyhow::Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT DISTINCT tag FROM note_tags ORDER BY tag")?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// Every note's tags in one round trip, as (note_id, tag) pairs -- for a
/// list view that needs every row's tags without an N+1 query per note.
pub fn list_all_tags_by_note(conn: &Connection) -> anyhow::Result<Vec<(i64, String)>> {
    let mut stmt = conn.prepare("SELECT note_id, tag FROM note_tags ORDER BY note_id, tag")?;
    let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn add_chapter_note_tag(conn: &Connection, chapter_note_id: i64, tag: String) -> anyhow::Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO chapter_note_tags (chapter_note_id, tag) VALUES (?1, ?2)",
        params![chapter_note_id, tag.trim()],
    )?;
    Ok(())
}

pub fn remove_chapter_note_tag(conn: &Connection, chapter_note_id: i64, tag: String) -> anyhow::Result<()> {
    conn.execute(
        "DELETE FROM chapter_note_tags WHERE chapter_note_id = ?1 AND tag = ?2",
        params![chapter_note_id, tag],
    )?;
    Ok(())
}

pub fn list_chapter_note_tags(conn: &Connection, chapter_note_id: i64) -> anyhow::Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT tag FROM chapter_note_tags WHERE chapter_note_id = ?1 ORDER BY tag")?;
    let rows = stmt.query_map(params![chapter_note_id], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn list_all_chapter_note_tags(conn: &Connection) -> anyhow::Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT DISTINCT tag FROM chapter_note_tags ORDER BY tag")?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn list_all_chapter_note_tags_by_note(conn: &Connection) -> anyhow::Result<Vec<(i64, String)>> {
    let mut stmt = conn.prepare("SELECT chapter_note_id, tag FROM chapter_note_tags ORDER BY chapter_note_id, tag")?;
    let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}
