use crate::db::queries::{atlas as atlas_queries, concordance, reference as queries};
use crate::db::DbState;
use crate::error::AppResult;
use crate::models::{
    AtlasJourney, AtlasPlace, AtlasPlaceVerse, ConcordanceEntry, DictionaryEntry, DictionaryEntrySummary, Footnote,
    InterlinearWord, IsbeEntry, IsbeEntrySummary, IsbePassageEntry, IsbeSearchResult, MorphologyWord, Pronunciation,
    StrongsEntry,
};
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
pub fn list_isbe_index(db: State<DbState>) -> AppResult<Vec<IsbeEntrySummary>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::list_isbe_index(&conn)?)
}

#[tauri::command]
pub fn list_pronunciations(db: State<DbState>) -> AppResult<Vec<Pronunciation>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::list_pronunciations(&conn)?)
}

#[tauri::command]
pub fn get_isbe_entry(db: State<DbState>, slug: String) -> AppResult<Option<IsbeEntry>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::get_isbe_entry(&conn, &slug)?)
}

#[tauri::command]
pub fn find_isbe_entry_by_term(db: State<DbState>, term: String) -> AppResult<Option<IsbeEntrySummary>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::find_isbe_entry_by_term(&conn, &term)?)
}

#[tauri::command]
pub fn find_dictionary_entry_for_isbe(db: State<DbState>, slug: String) -> AppResult<Option<DictionaryEntrySummary>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::find_dictionary_entry_for_isbe(&conn, &slug)?)
}

#[tauri::command]
pub fn search_isbe(db: State<DbState>, query: String, limit: i64) -> AppResult<Vec<IsbeEntrySummary>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::search_isbe(&conn, &query, limit)?)
}

#[tauri::command]
pub fn isbe_for_passage(
    db: State<DbState>,
    book_id: i64,
    chapter: i64,
    verse: Option<i64>,
    limit: i64,
) -> AppResult<Vec<IsbePassageEntry>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::isbe_for_passage(&conn, book_id, chapter, verse, limit)?)
}

#[tauri::command]
pub fn search_isbe_global(db: State<DbState>, query: String, limit: i64) -> AppResult<Vec<IsbeSearchResult>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::search_isbe_global(&conn, &query, limit)?)
}

#[tauri::command]
pub fn list_atlas_places(db: State<DbState>) -> AppResult<Vec<AtlasPlace>> {
    let conn = db.0.lock().unwrap();
    Ok(atlas_queries::list_atlas_places(&conn)?)
}

#[tauri::command]
pub fn get_atlas_place(db: State<DbState>, slug: String) -> AppResult<Option<AtlasPlace>> {
    let conn = db.0.lock().unwrap();
    Ok(atlas_queries::get_atlas_place(&conn, &slug)?)
}

#[tauri::command]
pub fn get_atlas_place_verses(db: State<DbState>, slug: String) -> AppResult<Vec<AtlasPlaceVerse>> {
    let conn = db.0.lock().unwrap();
    Ok(atlas_queries::get_atlas_place_verses(&conn, &slug)?)
}

#[tauri::command]
pub fn places_in_passage(
    db: State<DbState>,
    book_id: i64,
    chapter: i64,
    verse: Option<i64>,
) -> AppResult<Vec<AtlasPlace>> {
    let conn = db.0.lock().unwrap();
    Ok(atlas_queries::places_in_passage(&conn, book_id, chapter, verse)?)
}

#[tauri::command]
pub fn search_atlas_places(db: State<DbState>, query: String, limit: i64) -> AppResult<Vec<AtlasPlace>> {
    let conn = db.0.lock().unwrap();
    Ok(atlas_queries::search_atlas_places(&conn, &query, limit)?)
}

#[tauri::command]
pub fn list_atlas_journeys(db: State<DbState>) -> AppResult<Vec<AtlasJourney>> {
    let conn = db.0.lock().unwrap();
    Ok(atlas_queries::list_atlas_journeys(&conn)?)
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
