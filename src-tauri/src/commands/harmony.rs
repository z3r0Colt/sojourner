use crate::db::queries::harmony as queries;
use crate::db::DbState;
use crate::error::AppResult;
use crate::models::HarmonySection;
use tauri::State;

#[tauri::command]
pub fn list_harmony_sections(db: State<DbState>) -> AppResult<Vec<HarmonySection>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::list_sections(&conn)?)
}
