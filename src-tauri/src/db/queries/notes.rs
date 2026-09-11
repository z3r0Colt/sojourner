use super::NOT_DELETED;
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
        deleted_at: r.get(9)?,
    })
}

pub(super) const SELECT_COLS: &str =
    "id, book_id, chapter, verse_start, verse_end, body, created_at, updated_at, highlight_id, deleted_at";

pub(super) fn map_note_row(r: &rusqlite::Row) -> rusqlite::Result<Note> {
    map_row(r)
}

pub fn list_for_chapter(conn: &Connection, book_id: i64, chapter: i64) -> anyhow::Result<Vec<Note>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {SELECT_COLS} FROM notes WHERE book_id = ?1 AND chapter = ?2 AND {NOT_DELETED} ORDER BY verse_start"
    ))?;
    let rows = stmt.query_map(params![book_id, chapter], map_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn list_all(conn: &Connection) -> anyhow::Result<Vec<Note>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {SELECT_COLS} FROM notes WHERE {NOT_DELETED} ORDER BY updated_at DESC"
    ))?;
    let rows = stmt.query_map([], map_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// By id, deleted or not -- export and the Trash both need to reach a row
/// the list queries hide.
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

/// Soft delete: the row moves to the Trash (see `queries::trash`) rather
/// than disappearing, so a slip can be undone for thirty days.
pub fn delete(conn: &Connection, id: i64) -> anyhow::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute("UPDATE notes SET deleted_at = ?1 WHERE id = ?2 AND deleted_at IS NULL", params![now, id])?;
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
        deleted_at: r.get(6)?,
    })
}
pub(super) const CHAPTER_COLS: &str = "id, book_id, chapter, body, created_at, updated_at, deleted_at";

pub(super) fn map_chapter_note_row(r: &rusqlite::Row) -> rusqlite::Result<ChapterNote> {
    map_chapter_row(r)
}

pub fn list_chapter_notes(conn: &Connection, book_id: i64, chapter: i64) -> anyhow::Result<Vec<ChapterNote>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {CHAPTER_COLS} FROM chapter_notes WHERE book_id = ?1 AND chapter = ?2 AND {NOT_DELETED} ORDER BY created_at"
    ))?;
    let rows = stmt.query_map(params![book_id, chapter], map_chapter_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn list_all_chapter_notes(conn: &Connection) -> anyhow::Result<Vec<ChapterNote>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {CHAPTER_COLS} FROM chapter_notes WHERE {NOT_DELETED} ORDER BY updated_at DESC"
    ))?;
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

/// Soft delete -- see `delete`.
pub fn delete_chapter_note(conn: &Connection, id: i64) -> anyhow::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE chapter_notes SET deleted_at = ?1 WHERE id = ?2 AND deleted_at IS NULL",
        params![now, id],
    )?;
    Ok(())
}

// Doctrine/use tagging (conviction, comfort, duty, or a doctrine name) for
// both note kinds -- kept as sibling tables rather than embedded on
// Note/ChapterNote (see USER_MIGRATION_0009's schema comment), same
// add/remove/list-all/list-by-tag shape as sermon_note_tags. The "all tags"
// listings join the parent so a tag that only lives on a deleted note drops
// out of the filter bar with it (and comes back on restore).

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
    let mut stmt = conn.prepare(&format!(
        "SELECT DISTINCT nt.tag FROM note_tags nt JOIN notes n ON n.id = nt.note_id WHERE n.{NOT_DELETED} ORDER BY nt.tag"
    ))?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// Every note's tags in one round trip, as (note_id, tag) pairs -- for a
/// list view that needs every row's tags without an N+1 query per note.
pub fn list_all_tags_by_note(conn: &Connection) -> anyhow::Result<Vec<(i64, String)>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT nt.note_id, nt.tag FROM note_tags nt JOIN notes n ON n.id = nt.note_id WHERE n.{NOT_DELETED} ORDER BY nt.note_id, nt.tag"
    ))?;
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
    let mut stmt = conn.prepare(&format!(
        "SELECT DISTINCT t.tag FROM chapter_note_tags t JOIN chapter_notes cn ON cn.id = t.chapter_note_id WHERE cn.{NOT_DELETED} ORDER BY t.tag"
    ))?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn list_all_chapter_note_tags_by_note(conn: &Connection) -> anyhow::Result<Vec<(i64, String)>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT t.chapter_note_id, t.tag FROM chapter_note_tags t JOIN chapter_notes cn ON cn.id = t.chapter_note_id WHERE cn.{NOT_DELETED} ORDER BY t.chapter_note_id, t.tag"
    ))?;
    let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}
