use crate::db::queries::resources as queries;
use crate::db::DbState;
use crate::error::AppResult;
use crate::models::{Resource, ResourceLink, ResourcePassageLink, ResourceSearchResult};
use crate::resources::BulkImportOutcome;
use crate::{paths, resources};
use std::path::PathBuf;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn list_resources(db: State<DbState>) -> AppResult<Vec<Resource>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::list_all(&conn)?)
}

#[tauri::command]
pub fn get_resource(db: State<DbState>, id: i64) -> AppResult<Option<Resource>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::get(&conn, id)?)
}

#[tauri::command]
pub fn get_resource_text(db: State<DbState>, id: i64) -> AppResult<Option<String>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::get_extracted_text(&conn, id)?)
}

/// Copies a user-picked file into the app's resources folder, detects its kind
/// from the extension, best-effort extracts text for deep search, and records it.
#[tauri::command]
pub fn add_resource(
    app: AppHandle,
    db: State<DbState>,
    source_path: String,
    title: String,
    author: Option<String>,
) -> AppResult<Resource> {
    let src = PathBuf::from(&source_path);
    let kind = resources::detect_kind(&src)
        .ok_or_else(|| anyhow::anyhow!("unrecognized file type: {}", src.display()))?;

    let dest_dir = paths::resources_dir(&app).ok_or_else(|| anyhow::anyhow!("could not resolve resources directory"))?;
    let file_name = src.file_name().ok_or_else(|| anyhow::anyhow!("invalid file path"))?;
    let mut dest_path = dest_dir.join(file_name);
    let mut counter = 1;
    while dest_path.exists() {
        let stem = src.file_stem().and_then(|s| s.to_str()).unwrap_or("resource");
        let ext = src.extension().and_then(|s| s.to_str()).unwrap_or("");
        dest_path = dest_dir.join(format!("{stem}-{counter}.{ext}"));
        counter += 1;
    }
    std::fs::copy(&src, &dest_path)?;

    let extracted = resources::extract_text(&dest_path, kind);

    let conn = db.0.lock().unwrap();
    Ok(queries::create(
        &conn,
        kind,
        &title,
        author.as_deref(),
        &dest_path.display().to_string(),
        extracted.as_deref(),
    )?)
}

/// Recursively imports every epub/pdf/mobi/video/audio file under a
/// user-chosen folder as a Resource (title from file name, author from its
/// immediate parent folder) -- for a personal library organized as
/// `Author/Book.epub`, adding it all at once rather than one file at a time.
#[tauri::command]
pub fn bulk_import_resources(app: AppHandle, db: State<DbState>, folder_path: String) -> AppResult<BulkImportOutcome> {
    let dest_dir = paths::resources_dir(&app).ok_or_else(|| anyhow::anyhow!("could not resolve resources directory"))?;
    let conn = db.0.lock().unwrap();
    Ok(resources::import_folder(&conn, &dest_dir, &PathBuf::from(folder_path), &[])?)
}

#[tauri::command]
pub fn delete_resource(db: State<DbState>, id: i64) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    if let Some(res) = queries::get(&conn, id)? {
        // A book that ships with the app is not the reader's to delete: the
        // file belongs to the installation, and the next launch would put the
        // row back anyway. The library UI hides the button; this is the
        // backstop.
        if res.bundled {
            return Err(anyhow::anyhow!("“{}” ships with the app and cannot be removed", res.title).into());
        }
        let _ = std::fs::remove_file(&res.file_path);
    }
    Ok(queries::delete(&conn, id)?)
}

#[tauri::command]
pub fn search_resources(db: State<DbState>, query: String, limit: i64) -> AppResult<Vec<ResourceSearchResult>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::search(&conn, &query, limit)?)
}

#[tauri::command]
pub fn list_resource_passage_links_for_chapter(db: State<DbState>, book_id: i64, chapter: i64) -> AppResult<Vec<ResourcePassageLink>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::list_passage_links_for_chapter(&conn, book_id, chapter)?)
}

#[tauri::command]
pub fn list_resource_passage_links_for_resource(db: State<DbState>, resource_id: i64) -> AppResult<Vec<ResourcePassageLink>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::list_passage_links_for_resource(&conn, resource_id)?)
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn create_resource_passage_link(
    db: State<DbState>,
    resource_id: i64,
    book_id: i64,
    chapter: i64,
    verse_start: Option<i64>,
    verse_end: Option<i64>,
    location: Option<String>,
    label: Option<String>,
) -> AppResult<ResourcePassageLink> {
    let conn = db.0.lock().unwrap();
    Ok(queries::create_passage_link(
        &conn, resource_id, book_id, chapter, verse_start, verse_end, location.as_deref(), label.as_deref(),
    )?)
}

#[tauri::command]
pub fn delete_resource_passage_link(db: State<DbState>, id: i64) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(queries::delete_passage_link(&conn, id)?)
}

#[tauri::command]
pub fn list_resource_links(db: State<DbState>, resource_id: i64) -> AppResult<Vec<ResourceLink>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::list_resource_links(&conn, resource_id)?)
}

#[tauri::command]
pub fn create_resource_link(
    db: State<DbState>,
    from_resource_id: i64,
    to_resource_id: i64,
    from_location: Option<String>,
    label: Option<String>,
) -> AppResult<ResourceLink> {
    let conn = db.0.lock().unwrap();
    Ok(queries::create_resource_link(&conn, from_resource_id, to_resource_id, from_location.as_deref(), label.as_deref())?)
}

#[tauri::command]
pub fn delete_resource_link(db: State<DbState>, id: i64) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(queries::delete_resource_link(&conn, id)?)
}

#[tauri::command]
pub fn add_resource_tag(db: State<DbState>, resource_id: i64, tag: String) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(queries::add_tag(&conn, resource_id, tag)?)
}

#[tauri::command]
pub fn remove_resource_tag(db: State<DbState>, resource_id: i64, tag: String) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(queries::remove_tag(&conn, resource_id, tag)?)
}

#[tauri::command]
pub fn list_all_resource_tags(db: State<DbState>) -> AppResult<Vec<String>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::list_all_tags(&conn)?)
}

#[tauri::command]
pub fn list_all_resource_tags_by_resource(db: State<DbState>) -> AppResult<Vec<(i64, String)>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::list_all_tags_by_resource(&conn)?)
}

#[tauri::command]
pub fn list_resources_by_tag(db: State<DbState>, tag: String) -> AppResult<Vec<Resource>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::list_by_tag(&conn, &tag)?)
}

#[tauri::command]
pub fn suggest_resources_for_passage(db: State<DbState>, book_id: i64, chapter: i64) -> AppResult<Vec<Resource>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::suggest_for_passage(&conn, book_id, chapter)?)
}

#[tauri::command]
pub fn suggest_resources_for_topic(db: State<DbState>, topic_id: i64) -> AppResult<Vec<Resource>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::suggest_for_topic(&conn, topic_id)?)
}
