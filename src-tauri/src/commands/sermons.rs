use crate::db::queries::{illustrations, sermons, verses};
use crate::db::DbState;
use crate::error::AppResult;
use crate::export;
use crate::models::{
    Illustration, IllustrationFilter, IllustrationInput, IllustrationUse, PassageRef, Sermon,
    SermonEvent, SermonFilter, SermonForChapter, SermonInput, SermonSeries, SpeakingRate,
};
use std::collections::HashMap;
use tauri::State;

// Sermons -------------------------------------------------------------------

#[tauri::command]
pub fn list_sermons(db: State<DbState>, filter: Option<SermonFilter>) -> AppResult<Vec<Sermon>> {
    let conn = db.0.lock().unwrap();
    Ok(sermons::list(&conn, &filter.unwrap_or_default())?)
}

#[tauri::command]
pub fn get_sermon(db: State<DbState>, sermon_id: i64) -> AppResult<Option<Sermon>> {
    let conn = db.0.lock().unwrap();
    Ok(sermons::get(&conn, sermon_id)?)
}

#[tauri::command]
pub fn create_sermon(db: State<DbState>, input: SermonInput) -> AppResult<Sermon> {
    let conn = db.0.lock().unwrap();
    Ok(sermons::create(&conn, &input)?)
}

/// One save for the whole sermon: the fields, the passages, and the sources,
/// in a single transaction so the derived tables never lag the document.
#[tauri::command]
pub fn update_sermon(db: State<DbState>, sermon_id: i64, input: SermonInput) -> AppResult<Sermon> {
    let conn = db.0.lock().unwrap();
    Ok(sermons::update(&conn, sermon_id, &input)?)
}

#[tauri::command]
pub fn set_sermon_stage(db: State<DbState>, sermon_id: i64, stage: String) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(sermons::set_stage(&conn, sermon_id, &stage)?)
}

#[tauri::command]
pub fn set_sermon_status(db: State<DbState>, sermon_id: i64, status: String) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(sermons::set_status(&conn, sermon_id, &status)?)
}

/// Soft delete -- the sermon goes to the Trash and can be restored.
#[tauri::command]
pub fn delete_sermon(db: State<DbState>, sermon_id: i64) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(sermons::delete(&conn, sermon_id)?)
}

#[tauri::command]
pub fn duplicate_sermon(db: State<DbState>, sermon_id: i64) -> AppResult<Sermon> {
    let conn = db.0.lock().unwrap();
    Ok(sermons::duplicate(&conn, sermon_id)?)
}

#[tauri::command]
pub fn list_all_sermon_tags(db: State<DbState>) -> AppResult<Vec<String>> {
    let conn = db.0.lock().unwrap();
    Ok(sermons::list_all_tags(&conn)?)
}

#[tauri::command]
pub fn search_sermons(db: State<DbState>, query: String, limit: Option<i64>) -> AppResult<Vec<Sermon>> {
    let conn = db.0.lock().unwrap();
    Ok(sermons::search(&conn, &query, limit.unwrap_or(30))?)
}

#[tauri::command]
pub fn list_sermons_for_chapter(db: State<DbState>, book_id: i64, chapter: i64) -> AppResult<Vec<SermonForChapter>> {
    let conn = db.0.lock().unwrap();
    Ok(sermons::list_for_chapter(&conn, book_id, chapter)?)
}

// Events and the measured rate ----------------------------------------------

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn add_sermon_event(
    db: State<DbState>,
    sermon_id: i64,
    kind: String,
    date: String,
    venue: Option<String>,
    duration_seconds: Option<i64>,
    word_count: Option<i64>,
    notes: Option<String>,
) -> AppResult<SermonEvent> {
    let conn = db.0.lock().unwrap();
    Ok(sermons::add_event(
        &conn,
        sermon_id,
        &kind,
        &date,
        venue.as_deref(),
        duration_seconds,
        word_count,
        notes.as_deref(),
    )?)
}

#[tauri::command]
pub fn delete_sermon_event(db: State<DbState>, event_id: i64) -> AppResult<bool> {
    let conn = db.0.lock().unwrap();
    Ok(sermons::delete_event(&conn, event_id)?)
}

#[tauri::command]
pub fn list_sermon_events(db: State<DbState>, sermon_id: i64) -> AppResult<Vec<SermonEvent>> {
    let conn = db.0.lock().unwrap();
    Ok(sermons::list_events(&conn, sermon_id)?)
}

/// Null until two timed runs exist, after which every "about 31 minutes" in
/// the app is measured rather than assumed.
#[tauri::command]
pub fn get_speaking_rate(db: State<DbState>) -> AppResult<Option<SpeakingRate>> {
    let conn = db.0.lock().unwrap();
    Ok(sermons::speaking_rate(&conn)?)
}

// Series --------------------------------------------------------------------

#[tauri::command]
pub fn list_sermon_series(db: State<DbState>) -> AppResult<Vec<SermonSeries>> {
    let conn = db.0.lock().unwrap();
    Ok(sermons::list_series(&conn)?)
}

#[tauri::command]
pub fn create_sermon_series(db: State<DbState>, title: String, description: Option<String>) -> AppResult<SermonSeries> {
    let conn = db.0.lock().unwrap();
    Ok(sermons::create_series(&conn, &title, description.as_deref())?)
}

#[tauri::command]
pub fn update_sermon_series(
    db: State<DbState>,
    series_id: i64,
    title: String,
    description: Option<String>,
    plan_code: Option<String>,
) -> AppResult<SermonSeries> {
    let conn = db.0.lock().unwrap();
    Ok(sermons::update_series(&conn, series_id, &title, description.as_deref(), plan_code.as_deref())?)
}

/// The series goes; its sermons stay, with `series_id` cleared.
#[tauri::command]
pub fn delete_sermon_series(db: State<DbState>, series_id: i64) -> AppResult<bool> {
    let conn = db.0.lock().unwrap();
    Ok(sermons::delete_series(&conn, series_id)?)
}

#[tauri::command]
pub fn set_sermon_series_order(db: State<DbState>, series_id: i64, sermon_ids: Vec<i64>) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(sermons::set_series_order(&conn, series_id, &sermon_ids)?)
}

// Illustrations -------------------------------------------------------------

#[tauri::command]
pub fn list_illustrations(db: State<DbState>, filter: Option<IllustrationFilter>) -> AppResult<Vec<Illustration>> {
    let conn = db.0.lock().unwrap();
    Ok(illustrations::list(&conn, &filter.unwrap_or_default())?)
}

#[tauri::command]
pub fn get_illustration(db: State<DbState>, illustration_id: i64) -> AppResult<Option<Illustration>> {
    let conn = db.0.lock().unwrap();
    Ok(illustrations::get(&conn, illustration_id)?)
}

#[tauri::command]
pub fn create_illustration(db: State<DbState>, input: IllustrationInput) -> AppResult<Illustration> {
    let conn = db.0.lock().unwrap();
    Ok(illustrations::create(&conn, &input)?)
}

#[tauri::command]
pub fn update_illustration(db: State<DbState>, illustration_id: i64, input: IllustrationInput) -> AppResult<Illustration> {
    let conn = db.0.lock().unwrap();
    Ok(illustrations::update(&conn, illustration_id, &input)?)
}

#[tauri::command]
pub fn delete_illustration(db: State<DbState>, illustration_id: i64) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(illustrations::delete(&conn, illustration_id)?)
}

#[tauri::command]
pub fn list_all_illustration_tags(db: State<DbState>) -> AppResult<Vec<String>> {
    let conn = db.0.lock().unwrap();
    Ok(illustrations::list_all_tags(&conn)?)
}

#[tauri::command]
pub fn record_illustration_use(db: State<DbState>, illustration_id: i64, sermon_id: i64) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    Ok(illustrations::record_use(&conn, illustration_id, sermon_id)?)
}

#[tauri::command]
pub fn list_illustration_uses(db: State<DbState>, illustration_id: Option<i64>) -> AppResult<Vec<IllustrationUse>> {
    let conn = db.0.lock().unwrap();
    Ok(illustrations::list_uses(&conn, illustration_id)?)
}

// Export --------------------------------------------------------------------

/// Writes a generated .pptx to the path the save dialog already chose.
///
/// The deck is built by pptxgenjs, which only runs in the webview, so
/// unlike every other export the bytes come *from* the frontend rather than
/// being rendered here. The write still goes through a command because the
/// fs plugin's scope deliberately allows no arbitrary path (see
/// capabilities/default.json), which is the same reason export_note exists.
#[tauri::command]
pub fn export_sermon_slides(dest_path: String, data: Vec<u8>) -> AppResult<()> {
    std::fs::write(&dest_path, data)?;
    Ok(())
}

/// Writes the manuscript as Markdown to a path the frontend's save dialog
/// already chose. The passage blocks are rendered here, at export time, so
/// the file holds the words rather than a pointer to them.
#[tauri::command]
pub fn export_sermon(db: State<DbState>, sermon_id: i64, dest_path: String) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    let sermon = sermons::get(&conn, sermon_id)?.ok_or_else(|| anyhow::anyhow!("sermon not found"))?;
    let book_names: HashMap<i64, String> =
        verses::list_books(&conn)?.into_iter().map(|b| (b.id, b.name)).collect();

    // Every passage block in one round trip, in the sermon's translation.
    let mut passage_text = HashMap::new();
    let translation_id = match sermon.translation_id {
        Some(id) => Some(id),
        None => verses::list_translations(&conn)?.first().map(|t| t.id),
    };
    if let Some(translation_id) = translation_id {
        let blocks: Vec<_> = sermon.passages.iter().filter(|p| p.role != "mentioned").collect();
        let refs: Vec<PassageRef> = blocks
            .iter()
            .map(|p| PassageRef {
                book_id: p.book_id,
                chapter: p.chapter,
                verse_start: p.verse_start.unwrap_or(1),
                verse_end: p.verse_end.unwrap_or(p.verse_start.unwrap_or(176)),
            })
            .collect();
        if !refs.is_empty() {
            for (p, passage) in blocks.iter().zip(verses::get_passages(&conn, translation_id, &refs)?) {
                passage_text.insert(
                    export::passage_key(p.book_id, p.chapter, p.verse_start, p.verse_end),
                    passage.text,
                );
            }
        }
    }

    let text = export::format_sermon(&sermon, &passage_text, &book_names);
    std::fs::write(&dest_path, text)?;
    Ok(())
}
