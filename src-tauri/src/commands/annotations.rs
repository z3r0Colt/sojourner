use crate::db::queries::{bookmarks, highlights, notes};
use crate::db::DbState;
use crate::error::AppResult;
use crate::models::{Bookmark, ChapterNote, Highlight, Note};
use tauri::State;

#[tauri::command]
pub fn list_highlights(db: State<DbState>, book_id: i64, chapter: i64) -> AppResult<Vec<Highlight>> {
    let conn = db.0.lock().unwrap();
    Ok(highlights::list_for_chapter(&conn, book_id, chapter)?)
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn create_highlight(
    db: State<DbState>,
    book_id: i64,
    chapter: i64,
    verse_start: i64,
    verse_end: i64,
    char_start: Option<i64>,
    char_end: Option<i64>,
    color: String,
    style: String,
    translation_id: Option<i64>,
) -> AppResult<Highlight> {
    let conn = db.0.lock().unwrap();
    Ok(highlights::create(
        &conn,
        highlights::NewHighlight {
            book_id,
            chapter,
            verse_start,
            verse_end,
            char_start,
            char_end,
            color,
            style,
            translation_id,
        },
    )?)
}

#[tauri::command]
pub fn update_highlight(db: State<DbState>, id: i64, color: String, style: String) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(highlights::update_color(&conn, id, color, style)?)
}

#[tauri::command]
pub fn delete_highlight(db: State<DbState>, id: i64) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(highlights::delete(&conn, id)?)
}

#[tauri::command]
pub fn list_notes_for_chapter(db: State<DbState>, book_id: i64, chapter: i64) -> AppResult<Vec<Note>> {
    let conn = db.0.lock().unwrap();
    Ok(notes::list_for_chapter(&conn, book_id, chapter)?)
}

#[tauri::command]
pub fn list_all_notes(db: State<DbState>) -> AppResult<Vec<Note>> {
    let conn = db.0.lock().unwrap();
    Ok(notes::list_all(&conn)?)
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn create_note(
    db: State<DbState>,
    book_id: i64,
    chapter: i64,
    verse_start: i64,
    verse_end: i64,
    body: String,
    highlight_id: Option<i64>,
) -> AppResult<Note> {
    let conn = db.0.lock().unwrap();
    Ok(notes::create(&conn, book_id, chapter, verse_start, verse_end, body, highlight_id)?)
}

#[tauri::command]
pub fn update_note(db: State<DbState>, id: i64, body: String) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(notes::update(&conn, id, body)?)
}

#[tauri::command]
pub fn delete_note(db: State<DbState>, id: i64) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(notes::delete(&conn, id)?)
}

#[tauri::command]
pub fn list_chapter_notes(db: State<DbState>, book_id: i64, chapter: i64) -> AppResult<Vec<ChapterNote>> {
    let conn = db.0.lock().unwrap();
    Ok(notes::list_chapter_notes(&conn, book_id, chapter)?)
}

#[tauri::command]
pub fn list_all_chapter_notes(db: State<DbState>) -> AppResult<Vec<ChapterNote>> {
    let conn = db.0.lock().unwrap();
    Ok(notes::list_all_chapter_notes(&conn)?)
}

#[tauri::command]
pub fn create_chapter_note(db: State<DbState>, book_id: i64, chapter: i64, body: String) -> AppResult<ChapterNote> {
    let conn = db.0.lock().unwrap();
    Ok(notes::create_chapter_note(&conn, book_id, chapter, body)?)
}

#[tauri::command]
pub fn update_chapter_note(db: State<DbState>, id: i64, body: String) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(notes::update_chapter_note(&conn, id, body)?)
}

#[tauri::command]
pub fn delete_chapter_note(db: State<DbState>, id: i64) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(notes::delete_chapter_note(&conn, id)?)
}

#[tauri::command]
pub fn list_bookmarks(db: State<DbState>) -> AppResult<Vec<Bookmark>> {
    let conn = db.0.lock().unwrap();
    Ok(bookmarks::list_all(&conn)?)
}

#[tauri::command]
pub fn create_bookmark(
    db: State<DbState>,
    book_id: i64,
    chapter: i64,
    verse: Option<i64>,
    label: Option<String>,
) -> AppResult<Bookmark> {
    let conn = db.0.lock().unwrap();
    Ok(bookmarks::create(&conn, book_id, chapter, verse, label)?)
}

#[tauri::command]
pub fn delete_bookmark(db: State<DbState>, id: i64) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(bookmarks::delete(&conn, id)?)
}
