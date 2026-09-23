use crate::commands::clamp_limit;
use crate::db::queries::search as search_queries;
use crate::db::queries::search::{Facets, SearchOptions, VerseSearchScope};
use crate::db::DbState;
use crate::error::AppResult;
use crate::models::{ParsedSummary, SearchResults};
use tauri::{AppHandle, Manager, State};

/// Off the main thread: four FTS queries in a row, over indexes that cover
/// every verse of every installed translation and the whole of any imported
/// commentary. See the note at the top of `commands::backup` for why this
/// takes an `AppHandle` rather than the state it needs.
///
/// `translation_ids` and `commentary_source_ids` are whatever the reader
/// chose to look in -- one translation, or all of them; `book_id` and
/// `testament` narrow both Scripture and commentary; `whole_words`,
/// `passage_order` and `older_spellings` are explained on `SearchOptions`.
/// Filters typed in the box (`in:psalms`, `t:kjv`) are read out of `query`
/// itself, and what was understood comes back as `parsed`.
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
    older_spellings: Option<bool>,
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
            older_spellings: older_spellings.unwrap_or(false),
        };
        let parsed = options.parse(&query);
        // The other tabs take no older spellings: they are the reader's own
        // modern prose and the commentators', not the translations'.
        let plain = SearchOptions { older_spellings: false, ..options }.parse(&query);
        // A search that fails on one tab (a bad regular expression) says so
        // there, and every other tab still answers.
        let (verses, verse_error) = match search_queries::search_verses(&conn, &parsed, &translation_ids, &scope, options, limit) {
            Ok(page) => (page, None),
            Err(e) => (search_queries::SearchPage { results: vec![], total: 0 }, Some(format!("{e:#}"))),
        };
        let commentary =
            search_queries::search_commentary(&conn, &plain, &commentary_source_ids, &scope, options, limit)?;
        let notes = search_queries::search_notes(&conn, &plain, limit)?;
        let prayers = search_queries::search_prayer_entries(&conn, &plain, limit)?;
        Ok(SearchResults {
            verses: verses.results,
            verse_total: verses.total,
            verse_error,
            commentary: commentary.results,
            commentary_total: commentary.total,
            notes,
            prayers,
            parsed: ParsedSummary { chips: parsed.chips, unknown: parsed.unknown, mark_words: parsed.mark_words },
        })
    })
    .await
    .map_err(|e| anyhow::anyhow!("the search did not finish: {e}"))?
}

/// Hits per book and per translation (Scripture) or commentary, for the
/// facet list. A second pass over the same index, asked for separately so
/// the results are not held up by it.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn search_facets(
    app: AppHandle,
    query: String,
    kind: String,
    translation_ids: Vec<i64>,
    commentary_source_ids: Vec<i64>,
    book_id: Option<i64>,
    testament: Option<String>,
    whole_words: Option<bool>,
    older_spellings: Option<bool>,
) -> AppResult<Facets> {
    tauri::async_runtime::spawn_blocking(move || -> AppResult<Facets> {
        let db = app.state::<DbState>();
        let conn = db.conn();
        let scope = VerseSearchScope { book_id, testament };
        let options = SearchOptions {
            whole_words: whole_words.unwrap_or(false),
            passage_order: false,
            older_spellings: older_spellings.unwrap_or(false) && kind == "verses",
        };
        let parsed = options.parse(&query);
        Ok(if kind == "commentary" {
            search_queries::commentary_facets(&conn, &parsed, &commentary_source_ids, &scope)?
        } else {
            search_queries::verse_facets(&conn, &parsed, &translation_ids, &scope).unwrap_or_default()
        })
    })
    .await
    .map_err(|e| anyhow::anyhow!("the facets did not finish: {e}"))?
}

/// Words from the translations' own vocabulary that begin with `prefix`,
/// commonest first, with how often each occurs -- the suggestions under the
/// box while typing.
#[tauri::command]
pub fn suggest_search_words(db: State<DbState>, prefix: String, limit: i64) -> AppResult<Vec<(String, i64)>> {
    let conn = db.conn();
    Ok(search_queries::suggest_words(&conn, &prefix, clamp_limit(limit).min(20))?)
}

/// For a word that matched nothing: the nearest words the translations do
/// use, within two edits, commonest first.
#[tauri::command]
pub fn did_you_mean(db: State<DbState>, word: String) -> AppResult<Vec<String>> {
    let conn = db.conn();
    Ok(search_queries::did_you_mean(&conn, &word, 3)?)
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
