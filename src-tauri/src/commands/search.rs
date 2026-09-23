use crate::commands::clamp_limit;
use crate::db::queries::search as search_queries;
use crate::db::queries::search::{SearchOptions, VerseSearchScope};
use crate::db::DbState;
use crate::error::AppResult;
use crate::models::SearchResults;
use tauri::{AppHandle, Manager, State};

/// Off the main thread: four FTS queries in a row, over indexes that cover
/// every verse of every installed translation and the whole of any imported
/// commentary. See the note at the top of `commands::backup` for why this
/// takes an `AppHandle` rather than the state it needs.
///
/// `translation_ids` and `commentary_source_ids` are whatever the reader
/// chose to look in -- one translation, or all of them; `book_id` and
/// `testament` narrow both Scripture and commentary; `whole_words` and
/// `passage_order` are explained on `SearchOptions`.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn search(
    app: AppHandle,
    query: String,
    translation_ids: Vec<i64>,
    commentary_source_ids: Vec<i64>,
    book_id: Option<i64>,
    testament: Option<String>,
    whole_words: Option<bool>,
    passage_order: Option<bool>,
    limit: i64,
) -> AppResult<SearchResults> {
    tauri::async_runtime::spawn_blocking(move || -> AppResult<SearchResults> {
        let db = app.state::<DbState>();
        let conn = db.conn();
        // Clamped once, for all four: each of these goes into its own
        // `LIMIT ?`, so an unbounded one here is four unbounded queries.
        let limit = clamp_limit(limit);
        let scope = VerseSearchScope { book_id, testament };
        let options = SearchOptions {
            whole_words: whole_words.unwrap_or(false),
            passage_order: passage_order.unwrap_or(false),
        };
        let verses = search_queries::search_verses(&conn, &query, &translation_ids, &scope, options, limit)?;
        let commentary =
            search_queries::search_commentary(&conn, &query, &commentary_source_ids, &scope, options, limit)?;
        let notes = search_queries::search_notes(&conn, &query, options, limit)?;
        let prayers = search_queries::search_prayer_entries(&conn, &query, options, limit)?;
        Ok(SearchResults {
            verses: verses.results,
            verse_total: verses.total,
            commentary: commentary.results,
            commentary_total: commentary.total,
            notes,
            prayers,
        })
    })
    .await
    .map_err(|e| anyhow::anyhow!("the search did not finish: {e}"))?
}

/// Called explicitly when the user commits to a search (Enter, or re-running
/// a recent/saved one) rather than on every debounced keystroke fetch --
/// otherwise history would fill with incomplete fragments typed on the way
/// to the query the user actually meant.
#[tauri::command]
pub fn record_search_query(db: State<DbState>, query: String) -> AppResult<()> {
    let conn = db.conn();
    Ok(search_queries::record_search(&conn, &query)?)
}

#[tauri::command]
pub fn list_recent_searches(db: State<DbState>, limit: i64) -> AppResult<Vec<String>> {
    let conn = db.conn();
    Ok(search_queries::list_recent_searches(&conn, clamp_limit(limit))?)
}

#[tauri::command]
pub fn list_saved_searches(db: State<DbState>) -> AppResult<Vec<String>> {
    let conn = db.conn();
    Ok(search_queries::list_saved_searches(&conn)?)
}

#[tauri::command]
pub fn set_search_saved(db: State<DbState>, query: String, saved: bool) -> AppResult<()> {
    let conn = db.conn();
    Ok(search_queries::set_search_saved(&conn, &query, saved)?)
}

#[tauri::command]
pub fn delete_search_history(db: State<DbState>, query: String) -> AppResult<()> {
    let conn = db.conn();
    Ok(search_queries::delete_search_history(&conn, &query)?)
}
