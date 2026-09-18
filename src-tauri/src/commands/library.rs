use crate::commands::file_picker::{take_path, PickedPaths};
use crate::db::queries::{commentary, verses, versification};
use crate::db::DbState;
use crate::error::AppResult;
use crate::import;
use crate::models::{Book, BookAlias, BookCoverage, CommentarySource, ImportReportItem, Translation};
use crate::paths::default_import_roots;
use std::path::Path;
use tauri::{AppHandle, Manager, State};

/// The setting that remembers which content.db the imports were last
/// reconciled against (its size and modification time).
const CONTENT_DB_STAMP: &str = "content_db_stamp";

/// Brings a reader's own imports back after an upgrade.
///
/// "Add file" copies a Bible or commentary into `imports/` under the app
/// data dir and imports it into content.db -- but content.db is a bundled
/// resource, and an upgrade replaces it wholesale, so every imported
/// translation vanished until someone found the scan button in Settings.
/// The source files never went anywhere, so this re-imports them.
///
/// Runs at every launch, off the main thread, but does real work only when
/// content.db is not the file it was last time: its size and modification
/// time are kept in user.db, and an unchanged stamp means nothing to do.
/// The importers themselves skip a file whose checksum they already hold,
/// so even a rescan is cheap when nothing is missing.
pub fn rescan_imports_after_upgrade(app: &AppHandle, content_db_path: &Path) {
    let stamp = match std::fs::metadata(content_db_path) {
        Ok(m) => format!("{}:{:?}", m.len(), m.modified().ok()),
        Err(_) => return,
    };
    let db = app.state::<DbState>();
    let last = {
        let conn = db.conn();
        crate::db::queries::settings::get(&conn, CONTENT_DB_STAMP).ok().flatten()
    };
    if last.as_deref() == Some(stamp.as_str()) {
        return;
    }

    // Only the reader's own folder: the bundled resource copies are what
    // content.db was built from and need no reconciling.
    let roots: Vec<_> = default_import_roots(app)
        .into_iter()
        .filter(|p| p.components().any(|c| c.as_os_str() == "imports"))
        .collect();
    let files = import::discover_candidate_files(&roots);
    if !files.is_empty() {
        let mut conn = db.conn();
        for r in import::scan_files(&mut conn, &files) {
            if r.status != "Skipped" {
                println!("[imports] {} ({}): {} {}", r.path, r.format, r.status, r.detail.unwrap_or_default());
            }
        }
    }

    let conn = db.conn();
    if let Err(e) = crate::db::queries::settings::set(&conn, CONTENT_DB_STAMP, &stamp) {
        eprintln!("[imports] could not record the content.db stamp: {e:#}");
    }
}

#[tauri::command]
pub fn list_books(db: State<DbState>) -> AppResult<Vec<Book>> {
    let conn = db.conn();
    Ok(verses::list_books(&conn)?)
}

#[tauri::command]
pub fn list_book_aliases(db: State<DbState>) -> AppResult<Vec<BookAlias>> {
    let conn = db.conn();
    Ok(versification::list_book_aliases(&conn)?)
}

#[tauri::command]
pub fn list_translations(db: State<DbState>) -> AppResult<Vec<Translation>> {
    let conn = db.conn();
    Ok(verses::list_translations(&conn)?)
}

#[tauri::command]
pub fn get_translation_coverage(db: State<DbState>, translation_id: i64) -> AppResult<Vec<BookCoverage>> {
    let conn = db.conn();
    Ok(verses::get_translation_coverage(&conn, translation_id)?)
}

#[tauri::command]
pub fn list_commentary_sources(db: State<DbState>) -> AppResult<Vec<CommentarySource>> {
    let conn = db.conn();
    Ok(commentary::list_commentary_sources(&conn)?)
}

#[tauri::command]
pub fn remove_translation(db: State<DbState>, translation_id: i64) -> AppResult<()> {
    let conn = db.conn();
    Ok(verses::remove_translation(&conn, translation_id)?)
}

#[tauri::command]
pub fn remove_commentary_source(db: State<DbState>, source_id: i64) -> AppResult<()> {
    let conn = db.conn();
    Ok(commentary::remove_commentary_source(&conn, source_id)?)
}

/// Off the main thread: this walks the import folders and parses every
/// Bible/commentary XML file it has not seen before, which for a full first
/// scan is the longest single piece of work the app does. See the note at
/// the top of `commands::backup` for why it takes only an `AppHandle`.
#[tauri::command]
pub async fn scan_library(app: AppHandle) -> AppResult<Vec<ImportReportItem>> {
    tauri::async_runtime::spawn_blocking(move || -> AppResult<Vec<ImportReportItem>> {
        let roots = default_import_roots(&app);
        let files = import::discover_candidate_files(&roots);
        let db = app.state::<DbState>();
        let mut conn = db.conn();
        let results = import::scan_files(&mut conn, &files);
        Ok(results
            .into_iter()
            .map(|r| ImportReportItem {
                file: r.path,
                format: r.format,
                status: r.status,
                detail: r.detail,
            })
            .collect())
    })
    .await
    .map_err(|e| anyhow::anyhow!("the library scan did not finish: {e}"))?
}

/// Copies the file `pick_open_path` chose into the app's writable imports
/// folder (bibles/ or commentaries/ depending on detection) and imports it
/// immediately. This is the "Add File..." flow -- the mechanism by which the
/// user seamlessly adds more Bible/commentary XML files after first install.
/// `token` is that dialog's.
///
/// Off the main thread, like `scan_library`: it reads the whole file to
/// decide where it belongs, copies it, and then parses it.
#[tauri::command]
pub async fn add_file(app: AppHandle, token: String) -> AppResult<ImportReportItem> {
    tauri::async_runtime::spawn_blocking(move || -> AppResult<ImportReportItem> {
        let picked = app.state::<PickedPaths>();
        let src = take_path(&picked, &token)?;
        let file_name = src
            .file_name()
            .ok_or_else(|| anyhow::anyhow!("invalid file path"))?;

        let data_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| anyhow::anyhow!("could not resolve app data dir: {e}"))?;

        // Peek the file to decide which imports subfolder it belongs in, purely for
        // organization -- scan_library treats both subfolders identically.
        let sample = std::fs::read_to_string(&src).unwrap_or_default();
        let subfolder = if sample.contains("<XMLBIBLE") {
            "bibles"
        } else {
            "commentaries"
        };
        let dest_dir = data_dir.join("imports").join(subfolder);
        std::fs::create_dir_all(&dest_dir)?;
        let dest_path = dest_dir.join(file_name);
        std::fs::copy(&src, &dest_path)?;

        let db = app.state::<DbState>();
        let mut conn = db.conn();
        let mut results = import::scan_files(&mut conn, &[dest_path.clone()]);
        let result = results.pop().ok_or_else(|| anyhow::anyhow!("import produced no result"))?;
        Ok(ImportReportItem {
            file: result.path,
            format: result.format,
            status: result.status,
            detail: result.detail,
        })
    })
    .await
    .map_err(|e| anyhow::anyhow!("the file import did not finish: {e}"))?
}
