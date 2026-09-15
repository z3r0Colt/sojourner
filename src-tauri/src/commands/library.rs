use crate::commands::file_picker::{take_path, PickedPaths};
use crate::db::queries::{commentary, verses, versification};
use crate::db::DbState;
use crate::error::AppResult;
use crate::import;
use crate::models::{Book, BookAlias, BookCoverage, CommentarySource, ImportReportItem, Translation};
use crate::paths::default_import_roots;
use tauri::{AppHandle, Manager, State};

#[tauri::command]
pub fn list_books(db: State<DbState>) -> AppResult<Vec<Book>> {
    let conn = db.0.lock().unwrap();
    Ok(verses::list_books(&conn)?)
}

#[tauri::command]
pub fn list_book_aliases(db: State<DbState>) -> AppResult<Vec<BookAlias>> {
    let conn = db.0.lock().unwrap();
    Ok(versification::list_book_aliases(&conn)?)
}

#[tauri::command]
pub fn list_translations(db: State<DbState>) -> AppResult<Vec<Translation>> {
    let conn = db.0.lock().unwrap();
    Ok(verses::list_translations(&conn)?)
}

#[tauri::command]
pub fn get_translation_coverage(db: State<DbState>, translation_id: i64) -> AppResult<Vec<BookCoverage>> {
    let conn = db.0.lock().unwrap();
    Ok(verses::get_translation_coverage(&conn, translation_id)?)
}

#[tauri::command]
pub fn list_commentary_sources(db: State<DbState>) -> AppResult<Vec<CommentarySource>> {
    let conn = db.0.lock().unwrap();
    Ok(commentary::list_commentary_sources(&conn)?)
}

#[tauri::command]
pub fn remove_translation(db: State<DbState>, translation_id: i64) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(verses::remove_translation(&conn, translation_id)?)
}

#[tauri::command]
pub fn remove_commentary_source(db: State<DbState>, source_id: i64) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
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
        let mut conn = db.0.lock().unwrap();
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
        let mut conn = db.0.lock().unwrap();
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
