use crate::db::queries::{commentary, reading_position, verses};
use crate::db::DbState;
use crate::error::AppResult;
use crate::models::{CommentaryEntry, CommentarySection, ReadingPosition, Verse};
use std::collections::HashMap;
use tauri::State;

#[tauri::command]
pub fn get_chapter(db: State<DbState>, translation_id: i64, book_id: i64, chapter: i64) -> AppResult<Vec<Verse>> {
    let conn = db.0.lock().unwrap();
    Ok(verses::get_chapter(&conn, translation_id, book_id, chapter)?)
}

#[tauri::command]
pub fn get_parallel_chapter(
    db: State<DbState>,
    translation_ids: Vec<i64>,
    book_id: i64,
    chapter: i64,
) -> AppResult<HashMap<i64, Vec<Verse>>> {
    let conn = db.0.lock().unwrap();
    let mut map = HashMap::new();
    for tid in translation_ids {
        map.insert(tid, verses::get_chapter(&conn, tid, book_id, chapter)?);
    }
    Ok(map)
}

#[tauri::command]
pub fn get_commentary_for_passage(
    db: State<DbState>,
    source_id: i64,
    book_id: i64,
    chapter: i64,
    verse: Option<i64>,
) -> AppResult<Vec<CommentaryEntry>> {
    let conn = db.0.lock().unwrap();
    Ok(commentary::get_commentary_for_passage(&conn, source_id, book_id, chapter, verse)?)
}

#[tauri::command]
pub fn book_has_commentary(db: State<DbState>, source_id: i64, book_id: i64) -> AppResult<bool> {
    let conn = db.0.lock().unwrap();
    Ok(commentary::book_has_commentary(&conn, source_id, book_id)?)
}

#[tauri::command]
pub fn get_commentary_toc(db: State<DbState>, source_id: i64, book_id: i64) -> AppResult<Vec<CommentarySection>> {
    let conn = db.0.lock().unwrap();
    Ok(commentary::list_sections_for_book(&conn, source_id, book_id)?)
}

#[tauri::command]
pub fn get_section_entries(db: State<DbState>, section_id: i64) -> AppResult<Vec<CommentaryEntry>> {
    let conn = db.0.lock().unwrap();
    Ok(commentary::get_section_entries(&conn, section_id)?)
}

#[tauri::command]
pub fn get_reading_position(db: State<DbState>) -> AppResult<Option<ReadingPosition>> {
    let conn = db.0.lock().unwrap();
    Ok(reading_position::get(&conn)?)
}

#[tauri::command]
pub fn set_reading_position(
    db: State<DbState>,
    translation_id: i64,
    book_id: i64,
    chapter: i64,
    verse: Option<i64>,
) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(reading_position::set(&conn, translation_id, book_id, chapter, verse)?)
}
