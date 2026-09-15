use crate::backup;
use crate::commands::file_picker::{take_path, PickedPaths};
use crate::db::DbState;
use crate::error::AppResult;
use crate::AppDataDir;
use serde::Serialize;
use std::path::{Component, Path, PathBuf};
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

/// Writes a copy of user.db to the file chosen in `pick_save_path`; `token`
/// is that dialog's, and the page never sees the path.
#[tauri::command]
pub fn export_database(db: State<DbState>, picked: State<PickedPaths>, token: String) -> AppResult<()> {
    let dest_path = take_path(&picked, &token)?;
    let conn = db.0.lock().unwrap();
    Ok(backup::export_database(&conn, &dest_path)?)
}

/// Stages the file chosen in `pick_open_path` to replace user.db on next
/// launch; the caller must tell the user to restart the app for it to take
/// effect.
#[tauri::command]
pub fn stage_import(app_data_dir: State<AppDataDir>, picked: State<PickedPaths>, token: String) -> AppResult<()> {
    let source_path = take_path(&picked, &token)?;
    Ok(backup::stage_import(&app_data_dir.0, &source_path)?)
}

/// Resolves one of `list_backups`' file names to a real file inside the
/// backups folder. `file_name` arrives from the webview, so it is not
/// trusted: it must name a single path component (no separators, no `..`, no
/// drive letter or root), and the path it resolves to must still be inside
/// `<app_data_dir>/backups` once symlinks and any remaining `..` are
/// collapsed. Without this, a `file_name` of `..\..\x` reads -- and stages as
/// the next launch's user.db -- any file on the disk.
fn resolve_backup_path(app_data_dir: &Path, file_name: &str) -> AppResult<PathBuf> {
    let mut components = Path::new(file_name).components();
    let name = match (components.next(), components.next()) {
        (Some(Component::Normal(name)), None) => name.to_os_string(),
        _ => return Err(anyhow::anyhow!("not a backup file name: {file_name}").into()),
    };

    let dir = app_data_dir
        .join("backups")
        .canonicalize()
        .map_err(|e| anyhow::anyhow!("no backups folder: {e}"))?;
    let path = dir
        .join(name)
        .canonicalize()
        .map_err(|e| anyhow::anyhow!("no such backup: {file_name} ({e})"))?;
    if !path.starts_with(&dir) {
        return Err(anyhow::anyhow!("not a backup file name: {file_name}").into());
    }
    Ok(path)
}

/// Stages a backup by file name (one of `list_backups`' results) to replace
/// user.db on next launch.
#[tauri::command]
pub fn stage_restore(app_data_dir: State<AppDataDir>, file_name: String) -> AppResult<()> {
    let backup_path = resolve_backup_path(&app_data_dir.0, &file_name)?;
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

/// Points automatic backups at a second folder, or clears the setting when
/// `token` is None. The folder comes from `pick_folder`, like every other
/// path this app takes from the user: the stored value is then read back by
/// `get_backup_sync_folder` for display, which is the only reason a path
/// ever travels the other way.
#[tauri::command]
pub fn set_backup_sync_folder(
    db: State<DbState>,
    picked: State<PickedPaths>,
    token: Option<String>,
) -> AppResult<()> {
    let folder = match token {
        Some(token) => Some(take_path(&picked, &token)?.display().to_string()),
        None => None,
    };
    let conn = db.0.lock().unwrap();
    Ok(backup::set_backup_sync_folder(&conn, folder)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// An app-data dir holding `backups/user-1.db`, with a `secret.db` beside
    /// it (outside the backups folder) standing in for anything on the disk a
    /// traversal might reach.
    fn fixture(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("sojourner-restore-test-{label}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("backups")).unwrap();
        std::fs::write(dir.join("backups").join("user-1.db"), b"backup").unwrap();
        std::fs::write(dir.join("secret.db"), b"secret").unwrap();
        dir
    }

    #[test]
    fn resolve_backup_path_accepts_a_plain_file_name() {
        let dir = fixture("ok");
        let path = resolve_backup_path(&dir, "user-1.db").unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"backup");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn resolve_backup_path_rejects_traversal_out_of_the_backups_folder() {
        let dir = fixture("traversal");
        for attempt in [
            "../secret.db",
            r"..\secret.db",
            r"..\..\secret.db",
            "sub/user-1.db",
            r"sub\user-1.db",
            "./user-1.db",
            "",
        ] {
            assert!(
                resolve_backup_path(&dir, attempt).is_err(),
                "expected {attempt:?} to be rejected"
            );
        }
        // An absolute path is rejected too, rather than being joined away.
        let absolute = dir.join("secret.db").display().to_string();
        assert!(resolve_backup_path(&dir, &absolute).is_err(), "expected {absolute:?} to be rejected");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
