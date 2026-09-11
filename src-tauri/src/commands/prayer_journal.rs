use crate::db::queries::prayer_journal as queries;
use crate::db::DbState;
use crate::error::AppResult;
use crate::models::PrayerEntry;
use tauri::State;

#[tauri::command]
pub fn list_prayer_entries(db: State<DbState>) -> AppResult<Vec<PrayerEntry>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::list_all(&conn)?)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn create_prayer_entry(
    db: State<DbState>,
    entry_date: String,
    mode: String,
    adoration: Option<String>,
    confession: Option<String>,
    thanksgiving: Option<String>,
    supplication: Option<String>,
    free_text: Option<String>,
    book_id: Option<i64>,
    chapter: Option<i64>,
    verse_start: Option<i64>,
    verse_end: Option<i64>,
) -> AppResult<PrayerEntry> {
    let conn = db.0.lock().unwrap();
    Ok(queries::create(
        &conn, entry_date, mode, adoration, confession, thanksgiving, supplication, free_text, book_id, chapter,
        verse_start, verse_end,
    )?)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn update_prayer_entry(
    db: State<DbState>,
    id: i64,
    entry_date: String,
    mode: String,
    adoration: Option<String>,
    confession: Option<String>,
    thanksgiving: Option<String>,
    supplication: Option<String>,
    free_text: Option<String>,
    book_id: Option<i64>,
    chapter: Option<i64>,
    verse_start: Option<i64>,
    verse_end: Option<i64>,
) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(queries::update(
        &conn, id, entry_date, mode, adoration, confession, thanksgiving, supplication, free_text, book_id, chapter,
        verse_start, verse_end,
    )?)
}

#[tauri::command]
pub fn delete_prayer_entry(db: State<DbState>, id: i64) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(queries::delete(&conn, id)?)
}

#[tauri::command]
pub fn search_prayer_entries(db: State<DbState>, query: String, limit: i64) -> AppResult<Vec<PrayerEntry>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::search(&conn, &query, limit)?)
}

#[tauri::command]
pub fn add_prayer_entry_tag(db: State<DbState>, prayer_entry_id: i64, tag: String) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(queries::add_tag(&conn, prayer_entry_id, tag)?)
}

#[tauri::command]
pub fn remove_prayer_entry_tag(db: State<DbState>, prayer_entry_id: i64, tag: String) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(queries::remove_tag(&conn, prayer_entry_id, tag)?)
}

#[tauri::command]
pub fn list_all_prayer_entry_tags(db: State<DbState>) -> AppResult<Vec<String>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::list_all_tags(&conn)?)
}

#[tauri::command]
pub fn list_all_prayer_entry_tags_by_entry(db: State<DbState>) -> AppResult<Vec<(i64, String)>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::list_all_tags_by_entry(&conn)?)
}
