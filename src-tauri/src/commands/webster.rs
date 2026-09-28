//! Webster's 1828 dictionary: the word popup's lookup, and the Dictionary
//! page's search, browse and entry (see `db::queries::webster`).

use crate::commands::clamp_limit;
use crate::db::queries::webster::{self, WebsterEntry, WebsterHit, WebsterLookup};
use crate::db::DbState;
use crate::error::AppResult;
use tauri::State;

/// What Webster says of a word as the text prints it: *prevented* finds
/// PREVENT, *maketh* MAKE, *spake* SPEAK. `None` when nothing is found.
#[tauri::command]
pub fn webster_lookup(db: State<DbState>, word: String) -> AppResult<Option<WebsterLookup>> {
    let conn = db.conn();
    Ok(webster::lookup(&conn, &word)?)
}

/// Headwords first, then the entries whose text matches.
#[tauri::command]
pub fn webster_search(db: State<DbState>, query: String, limit: u32) -> AppResult<Vec<WebsterHit>> {
    let conn = db.conn();
    Ok(webster::search(&conn, &query, clamp_limit(limit as i64))?)
}

/// The dictionary in order from `prefix` on.
#[tauri::command]
pub fn webster_browse(db: State<DbState>, prefix: String, limit: u32) -> AppResult<Vec<WebsterHit>> {
    let conn = db.conn();
    Ok(webster::browse(&conn, &prefix, clamp_limit(limit as i64))?)
}

#[tauri::command]
pub fn webster_entry(db: State<DbState>, id: i64) -> AppResult<Option<WebsterEntry>> {
    let conn = db.conn();
    Ok(webster::get_entry(&conn, id)?)
}
