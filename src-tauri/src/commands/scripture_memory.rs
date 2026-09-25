use crate::db::queries::scripture_memory as queries;
use crate::db::DbState;
use crate::error::AppResult;
use crate::models::{MemoryPassage, MemoryVerse};
use tauri::State;

#[tauri::command]
pub fn list_memory_verses(db: State<DbState>) -> AppResult<Vec<MemoryVerse>> {
    let conn = db.conn();
    Ok(queries::list_all(&conn)?)
}

#[tauri::command]
pub fn list_due_memory_verses(db: State<DbState>) -> AppResult<Vec<MemoryVerse>> {
    let conn = db.conn();
    Ok(queries::list_due(&conn)?)
}

#[tauri::command]
pub fn create_memory_verse(
    db: State<DbState>,
    book_id: i64,
    chapter: i64,
    verse_start: i64,
    verse_end: i64,
    translation_id: Option<i64>,
    mode: String,
    set_name: Option<String>,
    ask_reference: Option<bool>,
) -> AppResult<MemoryVerse> {
    let conn = db.conn();
    let card = queries::NewCard {
        book_id,
        chapter,
        verse_start,
        verse_end,
        translation_id,
        mode,
        set_name,
        ask_reference: ask_reference.unwrap_or(false),
    };
    match queries::create(&conn, &card) {
        Err(e) if e.to_string().contains("UNIQUE") => Err(anyhow::anyhow!("that passage is already in your deck in that translation").into()),
        other => Ok(other?),
    }
}

#[tauri::command]
pub fn set_memory_verse_ask_reference(db: State<DbState>, id: i64, ask_reference: bool) -> AppResult<()> {
    let conn = db.conn();
    Ok(queries::set_ask_reference(&conn, id, ask_reference)?)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn create_memory_passage(
    db: State<DbState>,
    book_id: i64,
    chapter: i64,
    verse_start: i64,
    verse_end: i64,
    translation_id: Option<i64>,
    chunk_size: i64,
    mode: String,
    set_name: Option<String>,
) -> AppResult<MemoryPassage> {
    let conn = db.conn();
    let passage = queries::NewPassage { book_id, chapter, verse_start, verse_end, translation_id, chunk_size, mode, set_name };
    Ok(queries::create_passage(&conn, &passage)?)
}

#[tauri::command]
pub fn list_memory_passages(db: State<DbState>) -> AppResult<Vec<MemoryPassage>> {
    let conn = db.conn();
    Ok(queries::list_passages(&conn)?)
}

/// Returns whether there was a part left to add.
#[tauri::command]
pub fn add_next_memory_passage_part(db: State<DbState>, id: i64) -> AppResult<bool> {
    let conn = db.conn();
    Ok(queries::add_next_part(&conn, id)?)
}

#[tauri::command]
pub fn delete_memory_passage(db: State<DbState>, id: i64) -> AppResult<()> {
    let conn = db.conn();
    Ok(queries::delete_passage(&conn, id)?)
}

/// When each review of either deck since `since` happened (RFC 3339).
#[tauri::command]
pub fn list_memory_review_times(db: State<DbState>, since: String) -> AppResult<Vec<String>> {
    let conn = db.conn();
    Ok(queries::review_times_since(&conn, &since)?)
}

#[tauri::command]
pub fn set_memory_verse_mode(db: State<DbState>, id: i64, mode: String) -> AppResult<()> {
    let conn = db.conn();
    Ok(queries::set_mode(&conn, id, mode)?)
}

/// Pins a card to a translation, or (with None) lets it follow the reader's.
/// The deck allows one card per passage per translation, so moving a card
/// onto a translation that already has that passage is refused with a
/// message rather than a constraint error.
#[tauri::command]
pub fn set_memory_verse_translation(db: State<DbState>, id: i64, translation_id: Option<i64>) -> AppResult<()> {
    let conn = db.conn();
    match queries::set_translation(&conn, id, translation_id) {
        Err(e) if e.to_string().contains("UNIQUE") => {
            Err(anyhow::anyhow!("that passage is already in your deck in that translation").into())
        }
        other => Ok(other?),
    }
}

#[tauri::command]
pub fn set_memory_verse_doctrinal_link(
    db: State<DbState>,
    id: i64,
    westminster_section_id: Option<i64>,
    doctrinal_note: Option<String>,
) -> AppResult<()> {
    let conn = db.conn();
    Ok(queries::set_doctrinal_link(&conn, id, westminster_section_id, doctrinal_note)?)
}

#[tauri::command]
pub fn delete_memory_verse(db: State<DbState>, id: i64) -> AppResult<()> {
    let conn = db.conn();
    Ok(queries::delete(&conn, id)?)
}

#[tauri::command]
pub fn review_memory_verse(db: State<DbState>, id: i64, quality: i64) -> AppResult<MemoryVerse> {
    let conn = db.conn();
    Ok(queries::review(&conn, id, quality)?)
}
