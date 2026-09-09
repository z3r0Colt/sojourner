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
pub fn create_prayer_entry(
    db: State<DbState>,
    entry_date: String,
    adoration: Option<String>,
    confession: Option<String>,
    thanksgiving: Option<String>,
    supplication: Option<String>,
    book_id: Option<i64>,
    chapter: Option<i64>,
    verse_start: Option<i64>,
    verse_end: Option<i64>,
) -> AppResult<PrayerEntry> {
    let conn = db.0.lock().unwrap();
    Ok(queries::create(
        &conn, entry_date, adoration, confession, thanksgiving, supplication, book_id, chapter, verse_start, verse_end,
    )?)
}

#[tauri::command]
pub fn update_prayer_entry(
    db: State<DbState>,
    id: i64,
    entry_date: String,
    adoration: Option<String>,
    confession: Option<String>,
    thanksgiving: Option<String>,
    supplication: Option<String>,
    book_id: Option<i64>,
    chapter: Option<i64>,
    verse_start: Option<i64>,
    verse_end: Option<i64>,
) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(queries::update(
        &conn, id, entry_date, adoration, confession, thanksgiving, supplication, book_id, chapter, verse_start, verse_end,
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
