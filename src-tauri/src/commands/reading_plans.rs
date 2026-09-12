use crate::db::queries::reading_plans as queries;
use crate::db::DbState;
use crate::error::AppResult;
use crate::models::{PlanReadingInput, ReadingPlan, ReadingPlanDay, ReadingPlanProgress, ScheduleEntry};
use tauri::State;

// Custom plans (F4.2). `days[i]` holds day i + 1's readings.

#[tauri::command]
pub fn create_user_reading_plan(
    db: State<DbState>,
    title: String,
    description: Option<String>,
    weekdays: Option<Vec<i64>>,
    days: Vec<Vec<PlanReadingInput>>,
) -> AppResult<ReadingPlan> {
    let conn = db.0.lock().unwrap();
    Ok(queries::create_user_plan(&conn, &title, description.as_deref(), &weekdays, &days)?)
}

#[tauri::command]
pub fn update_user_reading_plan(
    db: State<DbState>,
    plan_code: String,
    title: String,
    description: Option<String>,
    weekdays: Option<Vec<i64>>,
    days: Vec<Vec<PlanReadingInput>>,
) -> AppResult<ReadingPlan> {
    let conn = db.0.lock().unwrap();
    Ok(queries::update_user_plan(&conn, &plan_code, &title, description.as_deref(), &weekdays, &days)?)
}

/// Removes a custom plan and everything keyed to it (progress,
/// completions, schedule).
#[tauri::command]
pub fn delete_user_reading_plan(db: State<DbState>, plan_code: String) -> AppResult<bool> {
    let conn = db.0.lock().unwrap();
    Ok(queries::delete_user_plan(&conn, &plan_code)?)
}

/// Catch-up (F4.2): "Shift my schedule" for any plan -- `day_number` lands
/// on `date` (or the next reading day), start_date follows.
#[tauri::command]
pub fn reanchor_reading_plan(db: State<DbState>, plan_code: String, day_number: i64, date: String) -> AppResult<ReadingPlanProgress> {
    let conn = db.0.lock().unwrap();
    Ok(queries::reanchor(&conn, &plan_code, day_number, &date)?)
}

/// Catch-up (F4.2): "Spread over seven days". `today` is the reader's local
/// date so the frontend's calendar and this agree.
#[tauri::command]
pub fn spread_reading_plan(db: State<DbState>, plan_code: String, today: String, window: Option<i64>) -> AppResult<ReadingPlanProgress> {
    let conn = db.0.lock().unwrap();
    Ok(queries::spread(&conn, &plan_code, &today, window.unwrap_or(7))?)
}

/// Replaces a plan's schedule rows outright (the undo of a spread).
#[tauri::command]
pub fn set_reading_plan_schedule(db: State<DbState>, plan_code: String, entries: Vec<ScheduleEntry>) -> AppResult<ReadingPlanProgress> {
    let conn = db.0.lock().unwrap();
    queries::set_schedule(&conn, &plan_code, &entries)?;
    Ok(queries::get_progress(&conn, &plan_code)?.ok_or_else(|| anyhow::anyhow!("no progress for plan {plan_code}"))?)
}

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

/// Catch-up (F3.3): move the start date forward by `days`.
#[tauri::command]
pub fn shift_reading_plan_start(db: State<DbState>, plan_code: String, days: i64) -> AppResult<ReadingPlanProgress> {
    let conn = db.0.lock().unwrap();
    Ok(queries::shift_start(&conn, &plan_code, days)?)
}

/// Catch-up (F3.3): mark or unmark several days at once.
#[tauri::command]
pub fn set_reading_plan_days(db: State<DbState>, plan_code: String, day_numbers: Vec<i64>, done: bool) -> AppResult<ReadingPlanProgress> {
    let conn = db.0.lock().unwrap();
    Ok(queries::set_days(&conn, &plan_code, &day_numbers, done)?)
}
