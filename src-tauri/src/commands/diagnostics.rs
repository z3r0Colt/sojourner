use crate::crash_log;
use crate::db::queries::{reading_log, stats};
use crate::db::DbState;
use crate::error::AppResult;
use crate::AppDataDir;
use tauri::State;

/// Every count the Stats block shows, in one call (F3.5).
#[tauri::command]
pub fn get_stats(db: State<DbState>) -> AppResult<stats::Stats> {
    let conn = db.0.lock().unwrap();
    Ok(stats::get_stats(&conn, &reading_log::today())?)
}

#[tauri::command]
pub fn log_frontend_error(app_data_dir: State<AppDataDir>, message: String, stack: Option<String>) -> AppResult<()> {
    crash_log::log_frontend_error(&app_data_dir.0, &message, stack.as_deref());
    Ok(())
}

#[tauri::command]
pub fn get_logs_dir(app_data_dir: State<AppDataDir>) -> AppResult<String> {
    Ok(app_data_dir.0.join("logs").to_string_lossy().to_string())
}
