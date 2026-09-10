use crate::db::queries::sermon_notes as queries;
use crate::db::DbState;
use crate::error::AppResult;
use crate::models::{SermonNote, SermonNoteConfessionLink, SermonNotePassageLink, SermonNoteWordStudy};
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
    series: Option<String>,
    preacher: Option<String>,
    title: Option<String>,
    passage_text: Option<String>,
    outline: Option<String>,
    application: Option<String>,
) -> AppResult<SermonNote> {
    let conn = db.0.lock().unwrap();
    Ok(queries::create(&conn, date, series, preacher, title, passage_text, outline, application)?)
}

#[tauri::command]
pub fn update_sermon_note(
    db: State<DbState>,
    id: i64,
    date: String,
    series: Option<String>,
    preacher: Option<String>,
    title: Option<String>,
    passage_text: Option<String>,
    outline: Option<String>,
    application: Option<String>,
) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(queries::update(&conn, id, date, series, preacher, title, passage_text, outline, application)?)
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

#[tauri::command]
pub fn add_sermon_note_tag(db: State<DbState>, sermon_note_id: i64, tag: String) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(queries::add_tag(&conn, sermon_note_id, tag)?)
}

#[tauri::command]
pub fn remove_sermon_note_tag(db: State<DbState>, sermon_note_id: i64, tag: String) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(queries::remove_tag(&conn, sermon_note_id, tag)?)
}

#[tauri::command]
pub fn list_sermon_note_tags(db: State<DbState>) -> AppResult<Vec<String>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::list_all_tags(&conn)?)
}

#[tauri::command]
pub fn list_sermon_note_series(db: State<DbState>) -> AppResult<Vec<String>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::list_all_series(&conn)?)
}

#[tauri::command]
pub fn sermon_notes_by_tag(db: State<DbState>, tag: String) -> AppResult<Vec<SermonNote>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::list_by_tag(&conn, &tag)?)
}

#[tauri::command]
pub fn add_sermon_note_confession_link(
    db: State<DbState>,
    sermon_note_id: i64,
    westminster_section_id: i64,
) -> AppResult<SermonNoteConfessionLink> {
    let conn = db.0.lock().unwrap();
    Ok(queries::add_confession_link(&conn, sermon_note_id, westminster_section_id)?)
}

#[tauri::command]
pub fn delete_sermon_note_confession_link(db: State<DbState>, id: i64) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(queries::delete_confession_link(&conn, id)?)
}

#[tauri::command]
pub fn add_sermon_note_word_study(
    db: State<DbState>,
    sermon_note_id: i64,
    strongs_id: String,
    note: Option<String>,
) -> AppResult<SermonNoteWordStudy> {
    let conn = db.0.lock().unwrap();
    Ok(queries::add_word_study(&conn, sermon_note_id, strongs_id, note)?)
}

#[tauri::command]
pub fn delete_sermon_note_word_study(db: State<DbState>, id: i64) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(queries::delete_word_study(&conn, id)?)
}
