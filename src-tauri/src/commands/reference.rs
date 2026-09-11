use crate::db::queries::{concordance, reference as queries};
use crate::db::DbState;
use crate::error::AppResult;
use crate::models::{ConcordanceEntry, DictionaryEntry, DictionaryEntrySummary, Footnote, InterlinearWord, MorphologyWord, StrongsEntry};
use std::collections::HashMap;
use tauri::State;

#[tauri::command]
pub fn get_strongs_entry(db: State<DbState>, id: String) -> AppResult<Option<StrongsEntry>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::get_strongs_entry(&conn, &id)?)
}

#[tauri::command]
pub fn get_concordance(db: State<DbState>, strongs_id: String) -> AppResult<Vec<ConcordanceEntry>> {
    let conn = db.0.lock().unwrap();
    Ok(concordance::get_concordance(&conn, &strongs_id)?)
}

#[tauri::command]
pub fn get_strongs_entries(db: State<DbState>, ids: Vec<String>) -> AppResult<Vec<StrongsEntry>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::get_strongs_entries(&conn, &ids)?)
}

#[tauri::command]
pub fn search_strongs(db: State<DbState>, query: String, language: Option<String>, limit: i64) -> AppResult<Vec<StrongsEntry>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::search_strongs(&conn, &query, language.as_deref(), limit)?)
}

#[tauri::command]
pub fn list_dictionary_index(db: State<DbState>) -> AppResult<Vec<DictionaryEntrySummary>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::list_dictionary_index(&conn)?)
}

#[tauri::command]
pub fn get_dictionary_entry(db: State<DbState>, slug: String) -> AppResult<Option<DictionaryEntry>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::get_dictionary_entry(&conn, &slug)?)
}

#[tauri::command]
pub fn find_dictionary_entry_by_term(db: State<DbState>, term: String) -> AppResult<Option<DictionaryEntrySummary>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::find_dictionary_entry_by_term(&conn, &term)?)
}

#[tauri::command]
pub fn search_dictionary(db: State<DbState>, query: String, limit: i64) -> AppResult<Vec<DictionaryEntrySummary>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::search_dictionary(&conn, &query, limit)?)
}

#[tauri::command]
pub fn get_interlinear_for_chapter(
    db: State<DbState>,
    book_id: i64,
    chapter: i64,
) -> AppResult<HashMap<i64, Vec<InterlinearWord>>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::get_interlinear_for_chapter(&conn, book_id, chapter)?)
}

#[tauri::command]
pub fn get_morphology_for_chapter(
    db: State<DbState>,
    book_id: i64,
    chapter: i64,
) -> AppResult<HashMap<i64, Vec<MorphologyWord>>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::get_morphology_for_chapter(&conn, book_id, chapter)?)
}

#[tauri::command]
pub fn get_footnotes_for_chapter(
    db: State<DbState>,
    translation_id: i64,
    book_id: i64,
    chapter: i64,
) -> AppResult<HashMap<i64, Vec<Footnote>>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::get_footnotes_for_chapter(&conn, translation_id, book_id, chapter)?)
}
