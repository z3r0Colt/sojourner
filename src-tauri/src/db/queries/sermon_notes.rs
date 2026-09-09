use crate::models::{SermonNote, SermonNotePassageLink};
use rusqlite::{params, Connection};

const SELECT_COLS: &str =
    "id, date, preacher, title, passage_text, outline, application, created_at, updated_at";
const SELECT_COLS_SN: &str =
    "sn.id, sn.date, sn.preacher, sn.title, sn.passage_text, sn.outline, sn.application, sn.created_at, sn.updated_at";

fn map_row(r: &rusqlite::Row) -> rusqlite::Result<SermonNote> {
    Ok(SermonNote {
        id: r.get(0)?,
        date: r.get(1)?,
        preacher: r.get(2)?,
        title: r.get(3)?,
        passage_text: r.get(4)?,
        outline: r.get(5)?,
        application: r.get(6)?,
        created_at: r.get(7)?,
        updated_at: r.get(8)?,
        passages: Vec::new(),
    })
}

fn map_passage_row(r: &rusqlite::Row) -> rusqlite::Result<SermonNotePassageLink> {
    Ok(SermonNotePassageLink {
        id: r.get(0)?,
        sermon_note_id: r.get(1)?,
        book_id: r.get(2)?,
        chapter: r.get(3)?,
        verse_start: r.get(4)?,
        verse_end: r.get(5)?,
        created_at: r.get(6)?,
    })
}
const PASSAGE_COLS: &str = "id, sermon_note_id, book_id, chapter, verse_start, verse_end, created_at";

pub fn list_passages(conn: &Connection, sermon_note_id: i64) -> anyhow::Result<Vec<SermonNotePassageLink>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {PASSAGE_COLS} FROM sermon_note_passage_links WHERE sermon_note_id = ?1 ORDER BY created_at"
    ))?;
    let rows = stmt.query_map(params![sermon_note_id], map_passage_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn with_passages(conn: &Connection, mut note: SermonNote) -> anyhow::Result<SermonNote> {
    note.passages = list_passages(conn, note.id)?;
    Ok(note)
}

pub fn list_all(conn: &Connection) -> anyhow::Result<Vec<SermonNote>> {
    let mut stmt = conn.prepare(&format!("SELECT {SELECT_COLS} FROM sermon_notes ORDER BY date DESC"))?;
    let rows = stmt.query_map([], map_row)?;
    let notes = rows.collect::<Result<Vec<_>, _>>()?;
    notes.into_iter().map(|n| with_passages(conn, n)).collect()
}

pub fn get(conn: &Connection, id: i64) -> anyhow::Result<Option<SermonNote>> {
    use rusqlite::OptionalExtension;
    let note = conn
        .query_row(&format!("SELECT {SELECT_COLS} FROM sermon_notes WHERE id = ?1"), params![id], map_row)
        .optional()?;
    match note {
        Some(n) => Ok(Some(with_passages(conn, n)?)),
        None => Ok(None),
    }
}

#[allow(clippy::too_many_arguments)]
pub fn create(
    conn: &Connection,
    date: String,
    preacher: Option<String>,
    title: Option<String>,
    passage_text: Option<String>,
    outline: Option<String>,
    application: Option<String>,
) -> anyhow::Result<SermonNote> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO sermon_notes (date, preacher, title, passage_text, outline, application, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?7)",
        params![date, preacher, title, passage_text, outline, application, now],
    )?;
    let id = conn.last_insert_rowid();
    let note = conn.query_row(&format!("SELECT {SELECT_COLS} FROM sermon_notes WHERE id = ?1"), params![id], map_row)?;
    with_passages(conn, note)
}

#[allow(clippy::too_many_arguments)]
pub fn update(
    conn: &Connection,
    id: i64,
    date: String,
    preacher: Option<String>,
    title: Option<String>,
    passage_text: Option<String>,
    outline: Option<String>,
    application: Option<String>,
) -> anyhow::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE sermon_notes SET date=?1, preacher=?2, title=?3, passage_text=?4, outline=?5, application=?6, updated_at=?7 WHERE id=?8",
        params![date, preacher, title, passage_text, outline, application, now, id],
    )?;
    Ok(())
}

pub fn delete(conn: &Connection, id: i64) -> anyhow::Result<()> {
    conn.execute("DELETE FROM sermon_notes WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn add_passage_link(
    conn: &Connection,
    sermon_note_id: i64,
    book_id: i64,
    chapter: i64,
    verse_start: Option<i64>,
    verse_end: Option<i64>,
) -> anyhow::Result<SermonNotePassageLink> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO sermon_note_passage_links (sermon_note_id, book_id, chapter, verse_start, verse_end, created_at)
         VALUES (?1,?2,?3,?4,?5,?6)",
        params![sermon_note_id, book_id, chapter, verse_start, verse_end, now],
    )?;
    let id = conn.last_insert_rowid();
    Ok(conn.query_row(&format!("SELECT {PASSAGE_COLS} FROM sermon_note_passage_links WHERE id = ?1"), params![id], map_passage_row)?)
}

pub fn delete_passage_link(conn: &Connection, id: i64) -> anyhow::Result<()> {
    conn.execute("DELETE FROM sermon_note_passage_links WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn search(conn: &Connection, query: &str, limit: i64) -> anyhow::Result<Vec<SermonNote>> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    let match_expr = query
        .split_whitespace()
        .map(|t| format!("\"{}\"*", t.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(" ");
    let sql = format!(
        "SELECT {SELECT_COLS_SN} FROM sermon_notes_fts f JOIN sermon_notes sn ON sn.id = f.rowid
         WHERE f MATCH ?1 ORDER BY bm25(f) LIMIT ?2"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![match_expr, limit], map_row)?;
    let notes = rows.collect::<Result<Vec<_>, _>>()?;
    notes.into_iter().map(|n| with_passages(conn, n)).collect()
}
