use crate::db::queries::prayer_list as queries;
use crate::db::DbState;
use crate::error::AppResult;
use crate::models::PrayerListPerson;
use tauri::State;

#[tauri::command]
pub fn list_prayer_list_people(db: State<DbState>) -> AppResult<Vec<PrayerListPerson>> {
    let conn = db.conn();
    Ok(queries::list_all(&conn)?)
}

#[tauri::command]
pub fn create_prayer_list_person(
    db: State<DbState>,
    name: String,
    category: Option<String>,
    notes: Option<String>,
) -> AppResult<PrayerListPerson> {
    let conn = db.conn();
    Ok(queries::create(&conn, name, category, notes)?)
}

#[tauri::command]
pub fn update_prayer_list_person(
    db: State<DbState>,
    id: i64,
    name: String,
    category: Option<String>,
    notes: Option<String>,
) -> AppResult<()> {
    let conn = db.conn();
    Ok(queries::update(&conn, id, name, category, notes)?)
}

#[tauri::command]
pub fn set_prayer_list_person_active(db: State<DbState>, id: i64, active: bool) -> AppResult<()> {
    let conn = db.conn();
    Ok(queries::set_active(&conn, id, active)?)
}

#[tauri::command]
pub fn mark_prayer_list_person_prayed(db: State<DbState>, id: i64) -> AppResult<()> {
    let conn = db.conn();
    Ok(queries::mark_prayed(&conn, id)?)
}

#[tauri::command]
pub fn mark_prayer_list_person_answered(db: State<DbState>, id: i64, answer_note: Option<String>) -> AppResult<()> {
    let conn = db.conn();
    Ok(queries::mark_answered(&conn, id, answer_note)?)
}

#[tauri::command]
pub fn delete_prayer_list_person(db: State<DbState>, id: i64) -> AppResult<()> {
    let conn = db.conn();
    Ok(queries::delete(&conn, id)?)
}
