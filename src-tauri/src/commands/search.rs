use crate::db::queries::search as search_queries;
use crate::db::DbState;
use crate::error::AppResult;
use crate::models::SearchResults;
use tauri::State;

#[tauri::command]
pub fn search(
    db: State<DbState>,
    query: String,
    translation_ids: Vec<i64>,
    commentary_source_ids: Vec<i64>,
    limit: i64,
) -> AppResult<SearchResults> {
    let conn = db.0.lock().unwrap();
    let verses = search_queries::search_verses(&conn, &query, &translation_ids, limit)?;
    let commentary = search_queries::search_commentary(&conn, &query, &commentary_source_ids, limit)?;
    Ok(SearchResults { verses, commentary })
}
