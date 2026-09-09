use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Folders scanned for importable Bible/commentary XML: the bundled resource
/// copies (first-run seed data, read-only once installed) plus a writable
/// per-user "imports" folder under the app data dir, which is where "Add
/// File..." copies new files and where a user can manually drop more XML to
/// have it picked up on the next library rescan.
pub fn default_import_roots(app: &AppHandle) -> Vec<PathBuf> {
    let mut roots = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        roots.push(resource_dir.join("bibles"));
        roots.push(resource_dir.join("commentaries"));
    }

    if let Ok(data_dir) = app.path().app_data_dir() {
        let bibles = data_dir.join("imports").join("bibles");
        let commentaries = data_dir.join("imports").join("commentaries");
        let _ = std::fs::create_dir_all(&bibles);
        let _ = std::fs::create_dir_all(&commentaries);
        roots.push(bibles);
        roots.push(commentaries);
    }

    roots
}

/// Location of the bundled Strong's/dictionary/interlinear reference data.
pub fn reference_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path().resource_dir().ok().map(|d| d.join("reference"))
}

/// Writable folder where user-added resource files (epub/pdf/mobi/video/audio)
/// are copied to. Matches the assetProtocol scope in tauri.conf.json.
pub fn resources_dir(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_data_dir().ok()?.join("resources");
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir)
}
