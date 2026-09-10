use crate::models::{SermonNote, SermonNoteConfessionLink, SermonNotePassageLink, SermonNoteWordStudy};
use rusqlite::{params, Connection};

const SELECT_COLS: &str =
    "id, date, series, preacher, title, passage_text, outline, application, created_at, updated_at";
const SELECT_COLS_SN: &str =
    "sn.id, sn.date, sn.series, sn.preacher, sn.title, sn.passage_text, sn.outline, sn.application, sn.created_at, sn.updated_at";

fn map_row(r: &rusqlite::Row) -> rusqlite::Result<SermonNote> {
    Ok(SermonNote {
        id: r.get(0)?,
        date: r.get(1)?,
        series: r.get(2)?,
        preacher: r.get(3)?,
        title: r.get(4)?,
        passage_text: r.get(5)?,
        outline: r.get(6)?,
        application: r.get(7)?,
        created_at: r.get(8)?,
        updated_at: r.get(9)?,
        passages: Vec::new(),
        tags: Vec::new(),
        confession_links: Vec::new(),
        word_studies: Vec::new(),
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

const CONFESSION_LINK_COLS: &str =
    "cl.id, cl.sermon_note_id, cl.westminster_section_id, wd.code, wd.title, ws.heading, cl.created_at";

fn map_confession_link_row(r: &rusqlite::Row) -> rusqlite::Result<SermonNoteConfessionLink> {
    Ok(SermonNoteConfessionLink {
        id: r.get(0)?,
        sermon_note_id: r.get(1)?,
        westminster_section_id: r.get(2)?,
        document_code: r.get(3)?,
        document_title: r.get(4)?,
        heading: r.get(5)?,
        created_at: r.get(6)?,
    })
}

const WORD_STUDY_COLS: &str = "ws.id, ws.sermon_note_id, ws.strongs_id, se.original_word, se.transliteration, ws.note, ws.created_at";

fn map_word_study_row(r: &rusqlite::Row) -> rusqlite::Result<SermonNoteWordStudy> {
    Ok(SermonNoteWordStudy {
        id: r.get(0)?,
        sermon_note_id: r.get(1)?,
        strongs_id: r.get(2)?,
        original_word: r.get(3)?,
        transliteration: r.get(4)?,
        note: r.get(5)?,
        created_at: r.get(6)?,
    })
}

pub fn list_passages(conn: &Connection, sermon_note_id: i64) -> anyhow::Result<Vec<SermonNotePassageLink>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {PASSAGE_COLS} FROM sermon_note_passage_links WHERE sermon_note_id = ?1 ORDER BY created_at"
    ))?;
    let rows = stmt.query_map(params![sermon_note_id], map_passage_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn list_tags(conn: &Connection, sermon_note_id: i64) -> anyhow::Result<Vec<String>> {
    let mut stmt =
        conn.prepare("SELECT tag FROM sermon_note_tags WHERE sermon_note_id = ?1 ORDER BY tag")?;
    let rows = stmt.query_map(params![sermon_note_id], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn list_confession_links(conn: &Connection, sermon_note_id: i64) -> anyhow::Result<Vec<SermonNoteConfessionLink>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {CONFESSION_LINK_COLS} FROM sermon_note_confession_links cl
         JOIN westminster_sections ws ON ws.id = cl.westminster_section_id
         JOIN westminster_documents wd ON wd.id = ws.document_id
         WHERE cl.sermon_note_id = ?1 ORDER BY cl.created_at"
    ))?;
    let rows = stmt.query_map(params![sermon_note_id], map_confession_link_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn list_word_studies(conn: &Connection, sermon_note_id: i64) -> anyhow::Result<Vec<SermonNoteWordStudy>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {WORD_STUDY_COLS} FROM sermon_note_word_studies ws
         LEFT JOIN strongs_entries se ON se.id = ws.strongs_id
         WHERE ws.sermon_note_id = ?1 ORDER BY ws.created_at"
    ))?;
    let rows = stmt.query_map(params![sermon_note_id], map_word_study_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn with_relations(conn: &Connection, mut note: SermonNote) -> anyhow::Result<SermonNote> {
    note.passages = list_passages(conn, note.id)?;
    note.tags = list_tags(conn, note.id)?;
    note.confession_links = list_confession_links(conn, note.id)?;
    note.word_studies = list_word_studies(conn, note.id)?;
    Ok(note)
}

pub fn list_all(conn: &Connection) -> anyhow::Result<Vec<SermonNote>> {
    let mut stmt = conn.prepare(&format!("SELECT {SELECT_COLS} FROM sermon_notes ORDER BY date DESC"))?;
    let rows = stmt.query_map([], map_row)?;
    let notes = rows.collect::<Result<Vec<_>, _>>()?;
    notes.into_iter().map(|n| with_relations(conn, n)).collect()
}

pub fn get(conn: &Connection, id: i64) -> anyhow::Result<Option<SermonNote>> {
    use rusqlite::OptionalExtension;
    let note = conn
        .query_row(&format!("SELECT {SELECT_COLS} FROM sermon_notes WHERE id = ?1"), params![id], map_row)
        .optional()?;
    match note {
        Some(n) => Ok(Some(with_relations(conn, n)?)),
        None => Ok(None),
    }
}

#[allow(clippy::too_many_arguments)]
pub fn create(
    conn: &Connection,
    date: String,
    series: Option<String>,
    preacher: Option<String>,
    title: Option<String>,
    passage_text: Option<String>,
    outline: Option<String>,
    application: Option<String>,
) -> anyhow::Result<SermonNote> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO sermon_notes (date, series, preacher, title, passage_text, outline, application, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?8)",
        params![date, series, preacher, title, passage_text, outline, application, now],
    )?;
    let id = conn.last_insert_rowid();
    let note = conn.query_row(&format!("SELECT {SELECT_COLS} FROM sermon_notes WHERE id = ?1"), params![id], map_row)?;
    with_relations(conn, note)
}

#[allow(clippy::too_many_arguments)]
pub fn update(
    conn: &Connection,
    id: i64,
    date: String,
    series: Option<String>,
    preacher: Option<String>,
    title: Option<String>,
    passage_text: Option<String>,
    outline: Option<String>,
    application: Option<String>,
) -> anyhow::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE sermon_notes SET date=?1, series=?2, preacher=?3, title=?4, passage_text=?5, outline=?6, application=?7, updated_at=?8 WHERE id=?9",
        params![date, series, preacher, title, passage_text, outline, application, now, id],
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

pub fn add_tag(conn: &Connection, sermon_note_id: i64, tag: String) -> anyhow::Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO sermon_note_tags (sermon_note_id, tag) VALUES (?1, ?2)",
        params![sermon_note_id, tag.trim()],
    )?;
    Ok(())
}

pub fn remove_tag(conn: &Connection, sermon_note_id: i64, tag: String) -> anyhow::Result<()> {
    conn.execute(
        "DELETE FROM sermon_note_tags WHERE sermon_note_id = ?1 AND tag = ?2",
        params![sermon_note_id, tag],
    )?;
    Ok(())
}

pub fn list_all_tags(conn: &Connection) -> anyhow::Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT DISTINCT tag FROM sermon_note_tags ORDER BY tag")?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn list_all_series(conn: &Connection) -> anyhow::Result<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT DISTINCT series FROM sermon_notes WHERE series IS NOT NULL AND series != '' ORDER BY series",
    )?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn add_confession_link(conn: &Connection, sermon_note_id: i64, westminster_section_id: i64) -> anyhow::Result<SermonNoteConfessionLink> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO sermon_note_confession_links (sermon_note_id, westminster_section_id, created_at) VALUES (?1,?2,?3)",
        params![sermon_note_id, westminster_section_id, now],
    )?;
    let id = conn.last_insert_rowid();
    Ok(conn.query_row(
        &format!(
            "SELECT {CONFESSION_LINK_COLS} FROM sermon_note_confession_links cl
             JOIN westminster_sections ws ON ws.id = cl.westminster_section_id
             JOIN westminster_documents wd ON wd.id = ws.document_id
             WHERE cl.id = ?1"
        ),
        params![id],
        map_confession_link_row,
    )?)
}

pub fn delete_confession_link(conn: &Connection, id: i64) -> anyhow::Result<()> {
    conn.execute("DELETE FROM sermon_note_confession_links WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn add_word_study(conn: &Connection, sermon_note_id: i64, strongs_id: String, note: Option<String>) -> anyhow::Result<SermonNoteWordStudy> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO sermon_note_word_studies (sermon_note_id, strongs_id, note, created_at) VALUES (?1,?2,?3,?4)",
        params![sermon_note_id, strongs_id, note, now],
    )?;
    let id = conn.last_insert_rowid();
    Ok(conn.query_row(
        &format!(
            "SELECT {WORD_STUDY_COLS} FROM sermon_note_word_studies ws
             LEFT JOIN strongs_entries se ON se.id = ws.strongs_id
             WHERE ws.id = ?1"
        ),
        params![id],
        map_word_study_row,
    )?)
}

pub fn delete_word_study(conn: &Connection, id: i64) -> anyhow::Result<()> {
    conn.execute("DELETE FROM sermon_note_word_studies WHERE id = ?1", params![id])?;
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
    notes.into_iter().map(|n| with_relations(conn, n)).collect()
}

/// All sermon notes carrying a given doctrine tag, most recent first.
pub fn list_by_tag(conn: &Connection, tag: &str) -> anyhow::Result<Vec<SermonNote>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {SELECT_COLS_SN} FROM sermon_notes sn
         JOIN sermon_note_tags t ON t.sermon_note_id = sn.id
         WHERE t.tag = ?1 ORDER BY sn.date DESC"
    ))?;
    let rows = stmt.query_map(params![tag], map_row)?;
    let notes = rows.collect::<Result<Vec<_>, _>>()?;
    notes.into_iter().map(|n| with_relations(conn, n)).collect()
}
