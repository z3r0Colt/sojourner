use super::NOT_DELETED;
use crate::models::{Backlink, ChapterNote, Note, NoteKind, NoteRefInput};
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

/// `refs` is what the editor found in the body (see USER_MIGRATION_0012);
/// `None` leaves the note's references untouched, which only the backfill
/// path and older callers rely on.
#[allow(clippy::too_many_arguments)]
pub fn create(
    conn: &Connection,
    book_id: i64,
    chapter: i64,
    verse_start: i64,
    verse_end: i64,
    body: String,
    highlight_id: Option<i64>,
    refs: Option<Vec<NoteRefInput>>,
) -> anyhow::Result<Note> {
    let now = chrono::Utc::now().to_rfc3339();
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "INSERT INTO notes (book_id, chapter, verse_start, verse_end, body, created_at, updated_at, highlight_id) VALUES (?1,?2,?3,?4,?5,?6,?6,?7)",
        params![book_id, chapter, verse_start, verse_end, body, now, highlight_id],
    )?;
    let id = tx.last_insert_rowid();
    if let Some(refs) = refs {
        set_refs(&tx, NoteKind::Note, id, &refs)?;
    }
    let note = tx.query_row(&format!("SELECT {SELECT_COLS} FROM notes WHERE id = ?1"), params![id], map_row)?;
    tx.commit()?;
    Ok(note)
}

pub fn update(conn: &Connection, id: i64, body: String, refs: Option<Vec<NoteRefInput>>) -> anyhow::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "UPDATE notes SET body = ?1, updated_at = ?2 WHERE id = ?3",
        params![body, now, id],
    )?;
    if let Some(refs) = refs {
        set_refs(&tx, NoteKind::Note, id, &refs)?;
    }
    tx.commit()?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Backlinks (USER_MIGRATION_0012)

/// Replaces every reference row of one note with `refs`. Runs inside the
/// caller's transaction when there is one (the save commands) or on its own.
pub fn set_refs(conn: &Connection, kind: NoteKind, id: i64, refs: &[NoteRefInput]) -> anyhow::Result<()> {
    let (own, other) = match kind {
        NoteKind::Note => ("note_id", "chapter_note_id"),
        NoteKind::ChapterNote => ("chapter_note_id", "note_id"),
    };
    conn.execute(&format!("DELETE FROM note_refs WHERE {own} = ?1"), params![id])?;
    let mut stmt = conn.prepare(&format!(
        "INSERT INTO note_refs ({own}, {other}, book_id, chapter, verse_start, verse_end) VALUES (?1, NULL, ?2, ?3, ?4, ?5)"
    ))?;
    for r in refs {
        let (vs, ve) = match (r.verse_start, r.verse_end) {
            (Some(s), e) => (Some(s), Some(e.unwrap_or(s).max(s))),
            (None, _) => (None, None),
        };
        stmt.execute(params![id, r.book_id, r.chapter, vs, ve])?;
    }
    Ok(())
}

/// Notes and chapter notes *elsewhere* (not on this chapter) whose body
/// mentions a passage in `book_id` `chapter`, in the order of the notes'
/// own passages. Trash rows are hidden like everywhere else.
pub fn list_backlinks(conn: &Connection, book_id: i64, chapter: i64) -> anyhow::Result<Vec<Backlink>> {
    let mut out = Vec::new();
    let mut stmt = conn.prepare(&format!(
        "SELECT n.id, n.book_id, n.chapter, n.verse_start, n.verse_end, n.body, n.updated_at, r.verse_start, r.verse_end
         FROM note_refs r JOIN notes n ON n.id = r.note_id
         WHERE r.book_id = ?1 AND r.chapter = ?2 AND n.{NOT_DELETED}
           AND NOT (n.book_id = ?1 AND n.chapter = ?2)
         ORDER BY n.book_id, n.chapter, n.verse_start, r.verse_start"
    ))?;
    let rows = stmt.query_map(params![book_id, chapter], |r| {
        Ok(Backlink {
            kind: NoteKind::Note,
            id: r.get(0)?,
            book_id: r.get(1)?,
            chapter: r.get(2)?,
            verse_start: r.get(3)?,
            verse_end: r.get(4)?,
            body: r.get(5)?,
            updated_at: r.get(6)?,
            ref_verse_start: r.get(7)?,
            ref_verse_end: r.get(8)?,
        })
    })?;
    out.extend(rows.collect::<Result<Vec<_>, _>>()?);

    let mut stmt = conn.prepare(&format!(
        "SELECT cn.id, cn.book_id, cn.chapter, cn.body, cn.updated_at, r.verse_start, r.verse_end
         FROM note_refs r JOIN chapter_notes cn ON cn.id = r.chapter_note_id
         WHERE r.book_id = ?1 AND r.chapter = ?2 AND cn.{NOT_DELETED}
           AND NOT (cn.book_id = ?1 AND cn.chapter = ?2)
         ORDER BY cn.book_id, cn.chapter, r.verse_start"
    ))?;
    let rows = stmt.query_map(params![book_id, chapter], |r| {
        Ok(Backlink {
            kind: NoteKind::ChapterNote,
            id: r.get(0)?,
            book_id: r.get(1)?,
            chapter: r.get(2)?,
            verse_start: None,
            verse_end: None,
            body: r.get(3)?,
            updated_at: r.get(4)?,
            ref_verse_start: r.get(5)?,
            ref_verse_end: r.get(6)?,
        })
    })?;
    out.extend(rows.collect::<Result<Vec<_>, _>>()?);
    out.sort_by(|a, b| (a.book_id, a.chapter, a.verse_start.unwrap_or(0), a.ref_verse_start.unwrap_or(0)).cmp(&(b.book_id, b.chapter, b.verse_start.unwrap_or(0), b.ref_verse_start.unwrap_or(0))));
    Ok(out)
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

pub fn create_chapter_note(conn: &Connection, book_id: i64, chapter: i64, body: String, refs: Option<Vec<NoteRefInput>>) -> anyhow::Result<ChapterNote> {
    let now = chrono::Utc::now().to_rfc3339();
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "INSERT INTO chapter_notes (book_id, chapter, body, created_at, updated_at) VALUES (?1,?2,?3,?4,?4)",
        params![book_id, chapter, body, now],
    )?;
    let id = tx.last_insert_rowid();
    if let Some(refs) = refs {
        set_refs(&tx, NoteKind::ChapterNote, id, &refs)?;
    }
    let note = tx.query_row(&format!("SELECT {CHAPTER_COLS} FROM chapter_notes WHERE id = ?1"), params![id], map_chapter_row)?;
    tx.commit()?;
    Ok(note)
}

pub fn update_chapter_note(conn: &Connection, id: i64, body: String, refs: Option<Vec<NoteRefInput>>) -> anyhow::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    let tx = conn.unchecked_transaction()?;
    tx.execute("UPDATE chapter_notes SET body = ?1, updated_at = ?2 WHERE id = ?3", params![body, now, id])?;
    if let Some(refs) = refs {
        set_refs(&tx, NoteKind::ChapterNote, id, &refs)?;
    }
    tx.commit()?;
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
