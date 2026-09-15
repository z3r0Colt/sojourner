use crate::db::queries::catechism_memory as queries;
use crate::db::DbState;
use crate::error::AppResult;
use crate::models::CatechismMemory;
use tauri::State;

#[tauri::command]
pub fn list_catechism_memory(db: State<DbState>) -> AppResult<Vec<CatechismMemory>> {
    let conn = db.conn();
    Ok(queries::list_all(&conn)?)
}

#[tauri::command]
pub fn list_due_catechism_memory(db: State<DbState>) -> AppResult<Vec<CatechismMemory>> {
    let conn = db.conn();
    Ok(queries::list_due(&conn)?)
}

#[tauri::command]
pub fn create_catechism_memory(db: State<DbState>, westminster_section_id: i64, mode: String) -> AppResult<CatechismMemory> {
    let conn = db.conn();
    Ok(queries::create(&conn, westminster_section_id, mode)?)
}

#[tauri::command]
pub fn set_catechism_memory_mode(db: State<DbState>, id: i64, mode: String) -> AppResult<()> {
    let conn = db.conn();
    Ok(queries::set_mode(&conn, id, mode)?)
}

#[tauri::command]
pub fn delete_catechism_memory(db: State<DbState>, id: i64) -> AppResult<()> {
    let conn = db.conn();
    Ok(queries::delete(&conn, id)?)
}

#[tauri::command]
pub fn review_catechism_memory(db: State<DbState>, id: i64, quality: i64) -> AppResult<CatechismMemory> {
    let conn = db.conn();
    Ok(queries::review(&conn, id, quality)?)
}
