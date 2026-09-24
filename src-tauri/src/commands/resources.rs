use crate::commands::clamp_limit;
use crate::commands::file_picker::{take_path, PickedPaths};
use crate::db::queries::resources as queries;
use crate::db::DbState;
use crate::error::AppResult;
use crate::models::{Resource, ResourceLink, ResourcePassageLink, ResourceSearchResult};
use crate::resources::BulkImportOutcome;
use crate::{paths, resources};
use tauri::{AppHandle, Manager, State};

#[tauri::command]
pub fn list_resources(db: State<DbState>) -> AppResult<Vec<Resource>> {
    let conn = db.conn();
    Ok(queries::list_all(&conn)?)
}

#[tauri::command]
pub fn get_resource(db: State<DbState>, id: i64) -> AppResult<Option<Resource>> {
    let conn = db.conn();
    Ok(queries::get(&conn, id)?)
}

#[tauri::command]
pub fn get_resource_text(db: State<DbState>, id: i64) -> AppResult<Option<String>> {
    let conn = db.conn();
    Ok(queries::get_extracted_text(&conn, id)?)
}

/// Copies the file `pick_open_path` chose into the app's resources folder,
/// detects its kind from the extension, best-effort extracts text for deep
/// search, and records it. `token` is that dialog's.
///
/// Off the main thread: copying the file and then extracting its text are
/// both open-ended (a book-length PDF is seconds of parsing), and a
/// synchronous command would spend all of it on the thread that draws. See
/// the note at the top of `commands::backup` for why this takes an
/// `AppHandle` rather than the state it needs.
#[tauri::command]
pub async fn add_resource(
    app: AppHandle,
    token: String,
    title: String,
    author: Option<String>,
) -> AppResult<Resource> {
    tauri::async_runtime::spawn_blocking(move || -> AppResult<Resource> {
        let picked = app.state::<PickedPaths>();
        let src = take_path(&picked, &token)?;
        let kind = resources::detect_kind(&src)
            .ok_or_else(|| anyhow::anyhow!("unrecognized file type: {}", src.display()))?;

        let dest_dir =
            paths::resources_dir(&app).ok_or_else(|| anyhow::anyhow!("could not resolve resources directory"))?;
        let dest_path = resources::free_destination_path(&dest_dir, &src)?;
        std::fs::copy(&src, &dest_path)?;

        // The title the caller sends is the file's name; what the file says
        // about itself is better when it says anything, and it is the only
        // place an author can come from for a single file.
        let meta = resources::read_metadata(&dest_path, kind);
        let title = meta.title.unwrap_or(title);
        let author = author.or(meta.author);
        let extracted = resources::extract_text(&dest_path, kind);

        let db = app.state::<DbState>();
        let conn = db.conn();
        Ok(queries::create(
            &conn,
            kind,
            &title,
            author.as_deref(),
            &dest_path.display().to_string(),
            extracted.as_deref(),
        )?)
    })
    .await
    .map_err(|e| anyhow::anyhow!("the import task did not finish: {e}"))?
}

/// Renames a resource and sets or clears its author. Shipped books may be
/// edited too: the library sync only fills these in when it first adopts a
/// row, so an edit survives an upgrade.
#[tauri::command]
pub fn update_resource(db: State<DbState>, id: i64, title: String, author: Option<String>) -> AppResult<Resource> {
    let title = title.trim().to_string();
    if title.is_empty() {
        return Err(anyhow::anyhow!("a resource needs a title").into());
    }
    let author = author.map(|a| a.trim().to_string()).filter(|a| !a.is_empty());
    let conn = db.conn();
    Ok(queries::update_details(&conn, id, &title, author.as_deref())?)
}

/// One author for several resources at once.
#[tauri::command]
pub fn set_author_for_resources(db: State<DbState>, ids: Vec<i64>, author: Option<String>) -> AppResult<usize> {
    let author = author.map(|a| a.trim().to_string()).filter(|a| !a.is_empty());
    let conn = db.conn();
    Ok(queries::set_author_many(&conn, &ids, author.as_deref())?)
}

/// Recursively imports every epub/pdf/mobi/video/audio file under the folder
/// `pick_folder` chose as a Resource (title from file name, author from its
/// immediate parent folder) -- for a personal library organized as
/// `Author/Book.epub`, adding it all at once rather than one file at a time.
///
/// Off the main thread, and the most obviously so of any command here: this
/// walks a folder tree, copies every book in it, and extracts the text of
/// each. On a personal library that is minutes of work.
#[tauri::command]
pub async fn bulk_import_resources(app: AppHandle, token: String) -> AppResult<BulkImportOutcome> {
    tauri::async_runtime::spawn_blocking(move || -> AppResult<BulkImportOutcome> {
        let picked = app.state::<PickedPaths>();
        let folder_path = take_path(&picked, &token)?;
        let dest_dir =
            paths::resources_dir(&app).ok_or_else(|| anyhow::anyhow!("could not resolve resources directory"))?;
        let db = app.state::<DbState>();
        let conn = db.conn();
        Ok(resources::import_folder(&conn, &dest_dir, &folder_path, &[])?)
    })
    .await
    .map_err(|e| anyhow::anyhow!("the bulk import task did not finish: {e}"))?
}

/// Extracts a resource's text again from the file already in the resources
/// folder, and replaces what is stored for it.
///
/// Extraction otherwise happens once and only once, when the file is added, so
/// a book that failed then stays unsearchable for good -- a PDF that turned out
/// to be page images, an epub the parser choked on, a file that was over the
/// size cap. This is the way back for those, and the way an improvement to the
/// extractor reaches books a reader added long ago. (The shipped library needs
/// nothing of the kind: `library::import` rebuilds every book's text on each
/// content.db build.)
///
/// Off the main thread for the same reason `add_resource` is: parsing a
/// book-length PDF is seconds of work.
///
/// Returns the resource as it now stands. A successful return does not promise
/// text was found -- if the file is still unreadable the resource comes back
/// with `has_text` false, which is a different thing from the errors below and
/// is left to the caller to report.
#[tauri::command]
pub async fn reextract_resource(app: AppHandle, id: i64) -> AppResult<Resource> {
    tauri::async_runtime::spawn_blocking(move || -> AppResult<Resource> {
        let db = app.state::<DbState>();
        let conn = db.conn();
        let resource =
            queries::get(&conn, id)?.ok_or_else(|| anyhow::anyhow!("that resource is no longer in the library"))?;

        // A shipped book's text lives in content.db, not in the reader's file,
        // and is rebuilt with that database. There is nothing here to redo.
        if resource.bundled {
            return Err(anyhow::anyhow!("“{}” ships with the app; its text is rebuilt with the app", resource.title).into());
        }

        let path = std::path::PathBuf::from(&resource.file_path);
        if !path.is_file() {
            return Err(anyhow::anyhow!("the file for “{}” is no longer at {}", resource.title, resource.file_path).into());
        }
        let Some(kind) = resources::detect_kind(&path) else {
            return Err(anyhow::anyhow!("“{}” is not a kind of file text can be read from", resource.title).into());
        };
        if !matches!(kind, "pdf" | "epub" | "mobi") {
            return Err(anyhow::anyhow!("there is no text to read in a {kind} file").into());
        }
        let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
        if size > resources::MAX_EXTRACT_BYTES {
            return Err(anyhow::anyhow!(
                "“{}” is too large to index ({} MB, over the {} MB limit)",
                resource.title,
                size / (1024 * 1024),
                resources::MAX_EXTRACT_BYTES / (1024 * 1024)
            )
            .into());
        }

        let extracted = resources::extract_text(&path, kind);
        Ok(queries::set_extracted_text(&conn, id, extracted.as_deref())?)
    })
    .await
    .map_err(|e| anyhow::anyhow!("the re-index task did not finish: {e}"))?
}

#[tauri::command]
pub fn delete_resource(db: State<DbState>, id: i64) -> AppResult<()> {
    let conn = db.conn();
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
    let conn = db.conn();
    Ok(queries::search(&conn, &query, clamp_limit(limit))?)
}

#[tauri::command]
pub fn list_resource_passage_links_for_chapter(db: State<DbState>, book_id: i64, chapter: i64) -> AppResult<Vec<ResourcePassageLink>> {
    let conn = db.conn();
    Ok(queries::list_passage_links_for_chapter(&conn, book_id, chapter)?)
}

#[tauri::command]
pub fn list_resource_passage_links_for_resource(db: State<DbState>, resource_id: i64) -> AppResult<Vec<ResourcePassageLink>> {
    let conn = db.conn();
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
    let conn = db.conn();
    Ok(queries::create_passage_link(
        &conn, resource_id, book_id, chapter, verse_start, verse_end, location.as_deref(), label.as_deref(),
    )?)
}

#[tauri::command]
pub fn delete_resource_passage_link(db: State<DbState>, id: i64) -> AppResult<()> {
    let conn = db.conn();
    Ok(queries::delete_passage_link(&conn, id)?)
}

#[tauri::command]
pub fn list_resource_links(db: State<DbState>, resource_id: i64) -> AppResult<Vec<ResourceLink>> {
    let conn = db.conn();
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
    let conn = db.conn();
    Ok(queries::create_resource_link(&conn, from_resource_id, to_resource_id, from_location.as_deref(), label.as_deref())?)
}

#[tauri::command]
pub fn delete_resource_link(db: State<DbState>, id: i64) -> AppResult<()> {
    let conn = db.conn();
    Ok(queries::delete_resource_link(&conn, id)?)
}

#[tauri::command]
pub fn add_resource_tag(db: State<DbState>, resource_id: i64, tag: String) -> AppResult<()> {
    let conn = db.conn();
    Ok(queries::add_tag(&conn, resource_id, tag)?)
}

#[tauri::command]
pub fn remove_resource_tag(db: State<DbState>, resource_id: i64, tag: String) -> AppResult<()> {
    let conn = db.conn();
    Ok(queries::remove_tag(&conn, resource_id, tag)?)
}

#[tauri::command]
pub fn list_all_resource_tags(db: State<DbState>) -> AppResult<Vec<String>> {
    let conn = db.conn();
    Ok(queries::list_all_tags(&conn)?)
}

#[tauri::command]
pub fn list_all_resource_tags_by_resource(db: State<DbState>) -> AppResult<Vec<(i64, String)>> {
    let conn = db.conn();
    Ok(queries::list_all_tags_by_resource(&conn)?)
}

#[tauri::command]
pub fn list_resources_by_tag(db: State<DbState>, tag: String) -> AppResult<Vec<Resource>> {
    let conn = db.conn();
    Ok(queries::list_by_tag(&conn, &tag)?)
}

#[tauri::command]
pub fn suggest_resources_for_passage(db: State<DbState>, book_id: i64, chapter: i64) -> AppResult<Vec<Resource>> {
    let conn = db.conn();
    Ok(queries::suggest_for_passage(&conn, book_id, chapter)?)
}

#[tauri::command]
pub fn suggest_resources_for_topic(db: State<DbState>, topic_id: i64) -> AppResult<Vec<Resource>> {
    let conn = db.conn();
    Ok(queries::suggest_for_topic(&conn, topic_id)?)
}

/// The shelves to read citations from: every attached pack's schema with
/// the name its manifest gives it.
fn citation_shelves(app: &tauri::AppHandle, conn: &rusqlite::Connection) -> Vec<(String, String)> {
    let attached = crate::db::attached_library_schemas(conn);
    crate::paths::installed_packs(app)
        .into_iter()
        .filter_map(|(id, dir)| {
            let schema = crate::db::pack_schema(&id);
            attached.contains(&schema).then(|| {
                let name = crate::pack::read_installed_manifest(&dir).map(|m| m.name).unwrap_or_else(|| id.clone());
                (schema, name)
            })
        })
        .collect()
}

/// Every book in the reader's library that cites this chapter, or with
/// `verse`, this verse.
#[tauri::command]
pub fn citations_for_passage(
    app: tauri::AppHandle,
    db: tauri::State<DbState>,
    book_id: i64,
    chapter: i64,
    verse: Option<i64>,
) -> AppResult<Vec<crate::db::queries::citations::CitationHit>> {
    let conn = db.conn();
    let shelves = citation_shelves(&app, &conn);
    Ok(crate::db::queries::citations::for_passage(&conn, book_id, chapter, verse, &shelves, 400)?)
}

/// (verse, citations) for a chapter.
#[tauri::command]
pub fn citation_counts_for_chapter(db: tauri::State<DbState>, book_id: i64, chapter: i64) -> AppResult<Vec<(i64, i64)>> {
    let conn = db.conn();
    let schemas = crate::db::attached_library_schemas(&conn);
    Ok(crate::db::queries::citations::counts_for_chapter(&conn, book_id, chapter, &schemas)?)
}

/// Indexes the citations in the reader's own books added before there was
/// such an index: once, in the background, a book at a time so the lock is
/// never held for long.
pub fn backfill_citations(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        use tauri::Manager;
        let ids = {
            let db = app.state::<DbState>();
            let conn = db.conn();
            crate::db::queries::citations::resources_needing_index(&conn).unwrap_or_default()
        };
        if ids.is_empty() {
            return;
        }
        let mut total = 0;
        for id in &ids {
            let db = app.state::<DbState>();
            let conn = db.conn();
            let text: Option<String> = conn
                .query_row("SELECT extracted_text FROM resources WHERE id = ?1", [id], |r| r.get(0))
                .unwrap_or(None);
            total += crate::db::queries::citations::index_resource(&conn, *id, text.as_deref()).unwrap_or(0);
        }
        println!("[citations] indexed {total} citation(s) in {} of your books", ids.len());
    });
}
