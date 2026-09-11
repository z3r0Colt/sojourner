use crate::db::queries::{crossrefs, doctrine_topics, psalter, westminster};
use crate::db::DbState;
use crate::error::AppResult;
use crate::models::{
    CrossReference, DoctrineTopic, MetricalPsalmVersion, WestminsterCommentaryEntry, WestminsterCommentarySource,
    WestminsterDocument, WestminsterPassageMatch, WestminsterSection, WestminsterSectionSummary,
};
use serde::Serialize;
use tauri::State;

#[tauri::command]
pub fn get_cross_references(db: State<DbState>, book_id: i64, chapter: i64, verse: i64) -> AppResult<Vec<CrossReference>> {
    let conn = db.0.lock().unwrap();
    Ok(crossrefs::get_cross_references(&conn, book_id, chapter, verse)?)
}

#[tauri::command]
pub fn get_metrical_psalm(db: State<DbState>, psalm: i64) -> AppResult<Vec<MetricalPsalmVersion>> {
    let conn = db.0.lock().unwrap();
    Ok(psalter::get_metrical_psalm(&conn, psalm)?)
}

#[tauri::command]
pub fn list_westminster_documents(db: State<DbState>) -> AppResult<Vec<WestminsterDocument>> {
    let conn = db.0.lock().unwrap();
    Ok(westminster::list_documents(&conn)?)
}

#[tauri::command]
pub fn list_westminster_sections(db: State<DbState>, document_id: i64) -> AppResult<Vec<WestminsterSectionSummary>> {
    let conn = db.0.lock().unwrap();
    Ok(westminster::list_sections(&conn, document_id)?)
}

#[tauri::command]
pub fn get_westminster_section(db: State<DbState>, id: i64) -> AppResult<Option<WestminsterSection>> {
    let conn = db.0.lock().unwrap();
    Ok(westminster::get_section(&conn, id)?)
}

#[tauri::command]
pub fn get_confession_for_passage(db: State<DbState>, book_id: i64, chapter: i64, verse: i64) -> AppResult<Vec<WestminsterPassageMatch>> {
    let conn = db.0.lock().unwrap();
    Ok(westminster::get_confession_for_passage(&conn, book_id, chapter, verse)?)
}

#[tauri::command]
pub fn list_westminster_commentary_sources(db: State<DbState>) -> AppResult<Vec<WestminsterCommentarySource>> {
    let conn = db.0.lock().unwrap();
    Ok(westminster::list_commentary_sources(&conn)?)
}

#[tauri::command]
pub fn get_westminster_commentary(db: State<DbState>, source_id: i64, chapter: i64) -> AppResult<Vec<WestminsterCommentaryEntry>> {
    let conn = db.0.lock().unwrap();
    Ok(westminster::get_commentary_for_chapter(&conn, source_id, chapter)?)
}

#[tauri::command]
pub fn list_doctrine_topics(db: State<DbState>) -> AppResult<Vec<DoctrineTopic>> {
    let conn = db.0.lock().unwrap();
    Ok(doctrine_topics::list_all(&conn)?)
}

#[tauri::command]
pub fn get_doctrine_topic(db: State<DbState>, id: i64) -> AppResult<Option<DoctrineTopic>> {
    let conn = db.0.lock().unwrap();
    Ok(doctrine_topics::get(&conn, id)?)
}

#[derive(Serialize)]
pub struct WestminsterSearchResult {
    pub section_id: i64,
    pub document_id: i64,
    pub heading: String,
    pub prompt: Option<String>,
    pub snippet: String,
}

#[tauri::command]
pub fn search_westminster(db: State<DbState>, query: String, limit: i64) -> AppResult<Vec<WestminsterSearchResult>> {
    let conn = db.0.lock().unwrap();
    let rows = westminster::search(&conn, &query, limit)?;
    Ok(rows
        .into_iter()
        .map(|(section_id, document_id, heading, prompt, snippet)| WestminsterSearchResult {
            section_id,
            document_id,
            heading,
            prompt,
            snippet,
        })
        .collect())
}
