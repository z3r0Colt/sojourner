use crate::db::queries::harmony as queries;
use crate::db::DbState;
use crate::error::AppResult;
use crate::models::{Harmony, HarmonyDetail};
use tauri::State;

#[tauri::command]
pub fn list_harmonies(db: State<DbState>) -> AppResult<Vec<Harmony>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::list_harmonies(&conn)?)
}

/// One harmony whole. A `code` of None means the first in picker order, which
/// is what the view asks for before the reader has chosen.
#[tauri::command]
pub fn get_harmony(db: State<DbState>, code: Option<String>) -> AppResult<Option<HarmonyDetail>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::get_harmony(&conn, code.as_deref())?)
}
