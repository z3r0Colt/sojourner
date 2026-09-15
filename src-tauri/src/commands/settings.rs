use crate::db::queries::settings;
use crate::db::DbState;
use crate::error::AppResult;
use tauri::State;

#[tauri::command]
pub fn get_setting(db: State<DbState>, key: String) -> AppResult<Option<String>> {
    let conn = db.conn();
    Ok(settings::get(&conn, &key)?)
}

#[tauri::command]
pub fn set_setting(db: State<DbState>, key: String, value: String) -> AppResult<()> {
    let conn = db.conn();
    Ok(settings::set(&conn, &key, &value)?)
}

#[tauri::command]
pub fn delete_setting(db: State<DbState>, key: String) -> AppResult<()> {
    let conn = db.conn();
    Ok(settings::delete(&conn, &key)?)
}

#[tauri::command]
pub fn list_settings(db: State<DbState>, prefix: String) -> AppResult<Vec<(String, String)>> {
    let conn = db.conn();
    Ok(settings::list_with_prefix(&conn, &prefix)?)
}
