use crate::crash_log;
use crate::db::queries::{reading_log, stats};
use crate::db::DbState;
use crate::error::AppResult;
use crate::AppDataDir;
use tauri::State;

/// The Windows accent color as "#rrggbb", or None when it cannot be read
/// (not Windows, or the value is missing). DWM stores it as a DWORD laid
/// out 0xAABBGGRR (F3.8).
#[tauri::command]
pub fn get_system_accent() -> AppResult<Option<String>> {
    Ok(read_system_accent())
}

#[cfg(windows)]
fn read_system_accent() -> Option<String> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;
    let dwm = RegKey::predef(HKEY_CURRENT_USER).open_subkey("Software\\Microsoft\\Windows\\DWM").ok()?;
    let abgr: u32 = dwm.get_value("AccentColor").ok()?;
    Some(accent_hex(abgr))
}

#[cfg(not(windows))]
fn read_system_accent() -> Option<String> {
    None
}

/// 0xAABBGGRR to "#rrggbb".
#[allow(dead_code)]
fn accent_hex(abgr: u32) -> String {
    let r = abgr & 0xff;
    let g = (abgr >> 8) & 0xff;
    let b = (abgr >> 16) & 0xff;
    format!("#{r:02x}{g:02x}{b:02x}")
}

#[cfg(test)]
mod tests {
    #[test]
    fn accent_dword_is_abgr() {
        // Windows' default blue (#0078d4) is stored as 0xFFD47800.
        assert_eq!(super::accent_hex(0xFFD4_7800), "#0078d4");
    }
}

/// Every count the Stats block shows, in one call (F3.5).
#[tauri::command]
pub fn get_stats(db: State<DbState>) -> AppResult<stats::Stats> {
    let conn = db.conn();
    Ok(stats::get_stats(&conn, &reading_log::today())?)
}

#[tauri::command]
pub fn log_frontend_error(app_data_dir: State<AppDataDir>, message: String, stack: Option<String>) -> AppResult<()> {
    crash_log::log_frontend_error(&app_data_dir.0, &message, stack.as_deref());
    Ok(())
}

#[tauri::command]
pub fn get_logs_dir(app_data_dir: State<AppDataDir>) -> AppResult<String> {
    let dir = app_data_dir.0.join("logs");
    // The folder only comes into being when something is logged, and opening
    // a path that isn't there fails; on a healthy install that is every
    // launch, so make it before handing the path out.
    let _ = std::fs::create_dir_all(&dir);
    Ok(dir.to_string_lossy().to_string())
}
