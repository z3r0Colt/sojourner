use crate::db::queries::sermon_notes as queries;
use crate::db::DbState;
use crate::error::AppResult;
use crate::models::{SermonNote, SermonNotePassageLink};
use tauri::State;

#[tauri::command]
pub fn list_sermon_notes(db: State<DbState>) -> AppResult<Vec<SermonNote>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::list_all(&conn)?)
}

#[tauri::command]
pub fn get_sermon_note(db: State<DbState>, id: i64) -> AppResult<Option<SermonNote>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::get(&conn, id)?)
}

#[tauri::command]
pub fn create_sermon_note(
    db: State<DbState>,
    date: String,
    preacher: Option<String>,
    title: Option<String>,
    passage_text: Option<String>,
    outline: Option<String>,
    application: Option<String>,
) -> AppResult<SermonNote> {
    let conn = db.0.lock().unwrap();
    Ok(queries::create(&conn, date, preacher, title, passage_text, outline, application)?)
}

#[tauri::command]
pub fn update_sermon_note(
    db: State<DbState>,
    id: i64,
    date: String,
    preacher: Option<String>,
    title: Option<String>,
    passage_text: Option<String>,
    outline: Option<String>,
    application: Option<String>,
) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(queries::update(&conn, id, date, preacher, title, passage_text, outline, application)?)
}

#[tauri::command]
pub fn delete_sermon_note(db: State<DbState>, id: i64) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(queries::delete(&conn, id)?)
}

#[tauri::command]
pub fn add_sermon_note_passage(
    db: State<DbState>,
    sermon_note_id: i64,
    book_id: i64,
    chapter: i64,
    verse_start: Option<i64>,
    verse_end: Option<i64>,
) -> AppResult<SermonNotePassageLink> {
    let conn = db.0.lock().unwrap();
    Ok(queries::add_passage_link(&conn, sermon_note_id, book_id, chapter, verse_start, verse_end)?)
}

#[tauri::command]
pub fn delete_sermon_note_passage(db: State<DbState>, id: i64) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(queries::delete_passage_link(&conn, id)?)
}

#[tauri::command]
pub fn search_sermon_notes(db: State<DbState>, query: String, limit: i64) -> AppResult<Vec<SermonNote>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::search(&conn, &query, limit)?)
}
