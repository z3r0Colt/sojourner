use crate::crash_log;
use crate::db::queries::{reading_log, stats};
use crate::db::DbState;
use crate::error::AppResult;
use crate::AppDataDir;
use tauri::State;

/// The system accent color as "#rrggbb", or None when it cannot be read
/// (no accent on this desktop, or the value is missing). On Windows DWM
/// stores it as a DWORD laid out 0xAABBGGRR (F3.8).
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

/// On Linux: KDE's accent (`AccentColor=r,g,b` in kdeglobals), else
/// GNOME's (47 and later: a named color in `accent-color`, mapped to
/// libadwaita's own values). Desktops with neither have no accent to follow.
#[cfg(target_os = "linux")]
fn read_system_accent() -> Option<String> {
    kde_accent().or_else(gnome_accent)
}

#[cfg(target_os = "linux")]
fn kde_accent() -> Option<String> {
    let config = std::env::var_os("XDG_CONFIG_HOME")
        .map(std::path::PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| std::path::PathBuf::from(h).join(".config")))?;
    let text = std::fs::read_to_string(config.join("kdeglobals")).ok()?;
    kde_accent_from(&text)
}

/// The `AccentColor` of kdeglobals' `[General]` group.
#[allow(dead_code)]
fn kde_accent_from(text: &str) -> Option<String> {
    let mut in_general = false;
    for line in text.lines().map(str::trim) {
        if line.starts_with('[') {
            in_general = line == "[General]";
        } else if let Some(value) = line.strip_prefix("AccentColor=").filter(|_| in_general) {
            let rgb: Vec<u8> = value.split(',').map(|p| p.trim().parse().ok()).collect::<Option<_>>()?;
            if let [r, g, b] = rgb[..] {
                return Some(format!("#{r:02x}{g:02x}{b:02x}"));
            }
        }
    }
    None
}

#[cfg(target_os = "linux")]
fn gnome_accent() -> Option<String> {
    // The AppImage points GSETTINGS_SCHEMA_DIR at the schemas it carries,
    // which are the build machine's and older than the key; the desktop's
    // own are the ones that know it.
    let out = std::process::Command::new("gsettings")
        .args(["get", "org.gnome.desktop.interface", "accent-color"])
        .env_remove("GSETTINGS_SCHEMA_DIR")
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    gnome_accent_hex(String::from_utf8_lossy(&out.stdout).trim().trim_matches('\'')).map(str::to_string)
}

/// libadwaita's accent colors, by the names GNOME stores.
#[allow(dead_code)]
fn gnome_accent_hex(name: &str) -> Option<&'static str> {
    Some(match name {
        "blue" => "#3584e4",
        "teal" => "#2190a4",
        "green" => "#3a944a",
        "yellow" => "#c88800",
        "orange" => "#ed5b00",
        "red" => "#e62d42",
        "pink" => "#d56199",
        "purple" => "#9141ac",
        "slate" => "#6f8396",
        _ => return None,
    })
}

#[cfg(not(any(windows, target_os = "linux")))]
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

    #[test]
    fn kde_accent_is_read_from_the_general_group_only() {
        let text = "[Colors:View]
AccentColor=1,2,3

[General]
ColorScheme=BreezeDark
AccentColor=61,174,233
";
        assert_eq!(super::kde_accent_from(text).as_deref(), Some("#3daee9"));
        assert_eq!(super::kde_accent_from("[General]
ColorScheme=Breeze
"), None);
        assert_eq!(super::kde_accent_from("[General]
AccentColor=bad
"), None);
    }

    #[test]
    fn gnome_accent_names_map_to_libadwaita_colors() {
        assert_eq!(super::gnome_accent_hex("blue"), Some("#3584e4"));
        assert_eq!(super::gnome_accent_hex("chartreuse"), None);
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
