use crate::backup;
use crate::db::DbState;
use crate::error::AppResult;
use crate::AppDataDir;
use serde::Serialize;
use std::path::PathBuf;
use tauri::State;

#[derive(Serialize)]
pub struct BackupInfoDto {
    pub file_name: String,
    pub created_at: String,
    pub size_bytes: u64,
}

#[tauri::command]
pub fn create_backup(db: State<DbState>, app_data_dir: State<AppDataDir>) -> AppResult<String> {
    let conn = db.0.lock().unwrap();
    let path = backup::create_backup(&conn, &app_data_dir.0)?;
    Ok(path.file_name().unwrap().to_string_lossy().to_string())
}

#[tauri::command]
pub fn list_backups(app_data_dir: State<AppDataDir>) -> AppResult<Vec<BackupInfoDto>> {
    let backups = backup::list_backups(&app_data_dir.0)?;
    Ok(backups
        .into_iter()
        .map(|b| BackupInfoDto { file_name: b.file_name, created_at: b.created_at, size_bytes: b.size_bytes })
        .collect())
}

#[tauri::command]
pub fn export_database(db: State<DbState>, dest_path: String) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(backup::export_database(&conn, &PathBuf::from(dest_path))?)
}

/// Stages `source_path` to replace user.db on next launch; the caller must
/// tell the user to restart the app for it to take effect.
#[tauri::command]
pub fn stage_import(app_data_dir: State<AppDataDir>, source_path: String) -> AppResult<()> {
    Ok(backup::stage_import(&app_data_dir.0, &PathBuf::from(source_path))?)
}

/// Stages a backup by file name (one of `list_backups`' results) to replace
/// user.db on next launch.
#[tauri::command]
pub fn stage_restore(app_data_dir: State<AppDataDir>, file_name: String) -> AppResult<()> {
    let backup_path = app_data_dir.0.join("backups").join(file_name);
    Ok(backup::stage_restore(&app_data_dir.0, &backup_path)?)
}

#[tauri::command]
pub fn quick_check(db: State<DbState>) -> AppResult<Vec<String>> {
    let conn = db.0.lock().unwrap();
    Ok(backup::quick_check(&conn)?)
}

#[tauri::command]
pub fn get_backup_sync_folder(db: State<DbState>) -> AppResult<Option<String>> {
    let conn = db.0.lock().unwrap();
    Ok(backup::get_backup_sync_folder(&conn)?)
}

#[tauri::command]
pub fn set_backup_sync_folder(db: State<DbState>, folder: Option<String>) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(backup::set_backup_sync_folder(&conn, folder)?)
}
