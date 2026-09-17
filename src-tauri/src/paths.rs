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

/// Where an installed resource pack lives: `library.db` beside a `books/`
/// folder of epubs.
///
/// Under the app data dir rather than beside the executable, because that is
/// the one place a reader can certainly write -- the pack is installed after
/// the app is, and an install directory may well be read-only. It is also
/// what keeps the books through an app upgrade, which replaces the install
/// directory wholesale.
///
/// Not created here: whether this folder exists is exactly the question
/// "is a pack installed", and a path lookup must not answer it by making it
/// true. `crate::pack` creates it, once, at the end of an install.
pub fn pack_dir(app: &AppHandle) -> Option<PathBuf> {
    Some(app.path().app_data_dir().ok()?.join("library"))
}

/// The books themselves, inside [`pack_dir`]. Matches the assetProtocol scope
/// in tauri.conf.json, which is what lets the epub reader load one.
pub fn pack_books_dir(app: &AppHandle) -> Option<PathBuf> {
    Some(pack_dir(app)?.join(crate::pack::BOOKS_DIR))
}

/// The pack's database, inside [`pack_dir`].
pub fn pack_db_path(app: &AppHandle) -> Option<PathBuf> {
    Some(pack_dir(app)?.join(crate::pack::LIBRARY_DB))
}
