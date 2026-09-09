use crate::db::queries::reading_plans as queries;
use crate::db::DbState;
use crate::error::AppResult;
use crate::models::{ReadingPlan, ReadingPlanDay, ReadingPlanProgress};
use tauri::State;

#[tauri::command]
pub fn list_reading_plans(db: State<DbState>) -> AppResult<Vec<ReadingPlan>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::list_plans(&conn)?)
}

#[tauri::command]
pub fn get_reading_plan_days(db: State<DbState>, plan_code: String) -> AppResult<Vec<ReadingPlanDay>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::get_plan_days(&conn, &plan_code)?)
}

#[tauri::command]
pub fn list_reading_plan_progress(db: State<DbState>) -> AppResult<Vec<ReadingPlanProgress>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::list_progress(&conn)?)
}

#[tauri::command]
pub fn get_reading_plan_progress(db: State<DbState>, plan_code: String) -> AppResult<Option<ReadingPlanProgress>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::get_progress(&conn, &plan_code)?)
}

#[tauri::command]
pub fn start_reading_plan(db: State<DbState>, plan_code: String, start_date: String) -> AppResult<ReadingPlanProgress> {
    let conn = db.0.lock().unwrap();
    Ok(queries::start_plan(&conn, &plan_code, start_date)?)
}

#[tauri::command]
pub fn abandon_reading_plan(db: State<DbState>, plan_code: String) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(queries::abandon_plan(&conn, &plan_code)?)
}

#[tauri::command]
pub fn mark_reading_plan_day(db: State<DbState>, plan_code: String, day_number: i64) -> AppResult<ReadingPlanProgress> {
    let conn = db.0.lock().unwrap();
    Ok(queries::mark_day(&conn, &plan_code, day_number)?)
}

#[tauri::command]
pub fn unmark_reading_plan_day(db: State<DbState>, plan_code: String, day_number: i64) -> AppResult<ReadingPlanProgress> {
    let conn = db.0.lock().unwrap();
    Ok(queries::unmark_day(&conn, &plan_code, day_number)?)
}
