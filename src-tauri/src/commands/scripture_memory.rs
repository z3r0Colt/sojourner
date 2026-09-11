use crate::db::queries::scripture_memory as queries;
use crate::db::DbState;
use crate::error::AppResult;
use crate::models::MemoryVerse;
use tauri::State;

#[tauri::command]
pub fn list_memory_verses(db: State<DbState>) -> AppResult<Vec<MemoryVerse>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::list_all(&conn)?)
}

#[tauri::command]
pub fn list_due_memory_verses(db: State<DbState>) -> AppResult<Vec<MemoryVerse>> {
    let conn = db.0.lock().unwrap();
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
) -> AppResult<MemoryVerse> {
    let conn = db.0.lock().unwrap();
    Ok(queries::create(&conn, book_id, chapter, verse_start, verse_end, translation_id, mode)?)
}

#[tauri::command]
pub fn set_memory_verse_mode(db: State<DbState>, id: i64, mode: String) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(queries::set_mode(&conn, id, mode)?)
}

#[tauri::command]
pub fn set_memory_verse_doctrinal_link(
    db: State<DbState>,
    id: i64,
    westminster_section_id: Option<i64>,
    doctrinal_note: Option<String>,
) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(queries::set_doctrinal_link(&conn, id, westminster_section_id, doctrinal_note)?)
}

#[tauri::command]
pub fn delete_memory_verse(db: State<DbState>, id: i64) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(queries::delete(&conn, id)?)
}

#[tauri::command]
pub fn review_memory_verse(db: State<DbState>, id: i64, quality: i64) -> AppResult<MemoryVerse> {
    let conn = db.0.lock().unwrap();
    Ok(queries::review(&conn, id, quality)?)
}
