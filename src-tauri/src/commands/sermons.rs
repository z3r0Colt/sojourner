use crate::commands::clamp_limit;
use crate::commands::file_picker::{take_path, PickedPaths};
use crate::db::queries::{illustrations, sermon_ideas, sermons, verses};
use crate::db::DbState;
use crate::error::AppResult;
use crate::export;
use crate::models::{
    Illustration, IllustrationFilter, IllustrationInput, IllustrationUse, PassageRef, Sermon,
    SermonEvent, SermonFilter, SermonForChapter, SermonIdea, SermonIdeaInput, SermonInput, SermonSeries,
    SpeakingRate,
};
use std::collections::HashMap;
use tauri::{AppHandle, Manager, State};

// Sermons -------------------------------------------------------------------

#[tauri::command]
pub fn list_sermons(db: State<DbState>, filter: Option<SermonFilter>) -> AppResult<Vec<Sermon>> {
    let conn = db.conn();
    Ok(sermons::list(&conn, &filter.unwrap_or_default())?)
}

#[tauri::command]
pub fn get_sermon(db: State<DbState>, sermon_id: i64) -> AppResult<Option<Sermon>> {
    let conn = db.conn();
    Ok(sermons::get(&conn, sermon_id)?)
}

#[tauri::command]
pub fn create_sermon(db: State<DbState>, input: SermonInput) -> AppResult<Sermon> {
    let conn = db.conn();
    Ok(sermons::create(&conn, &input)?)
}

/// One save for the whole sermon: the fields, the passages, and the sources,
/// in a single transaction so the derived tables never lag the document.
#[tauri::command]
pub fn update_sermon(db: State<DbState>, sermon_id: i64, input: SermonInput) -> AppResult<Sermon> {
    let conn = db.conn();
    Ok(sermons::update(&conn, sermon_id, &input)?)
}

#[tauri::command]
pub fn set_sermon_stage(db: State<DbState>, sermon_id: i64, stage: String) -> AppResult<()> {
    let conn = db.conn();
    Ok(sermons::set_stage(&conn, sermon_id, &stage)?)
}

/// Soft delete -- the sermon goes to the Trash and can be restored.
#[tauri::command]
pub fn delete_sermon(db: State<DbState>, sermon_id: i64) -> AppResult<()> {
    let conn = db.conn();
    Ok(sermons::delete(&conn, sermon_id)?)
}

#[tauri::command]
pub fn duplicate_sermon(db: State<DbState>, sermon_id: i64) -> AppResult<Sermon> {
    let conn = db.conn();
    Ok(sermons::duplicate(&conn, sermon_id)?)
}

#[tauri::command]
pub fn list_all_sermon_tags(db: State<DbState>) -> AppResult<Vec<String>> {
    let conn = db.conn();
    Ok(sermons::list_all_tags(&conn)?)
}

#[tauri::command]
pub fn search_sermons(db: State<DbState>, query: String, limit: Option<i64>) -> AppResult<Vec<Sermon>> {
    let conn = db.conn();
    Ok(sermons::search(&conn, &query, clamp_limit(limit.unwrap_or(30)))?)
}

#[tauri::command]
pub fn list_sermons_for_chapter(db: State<DbState>, book_id: i64, chapter: i64) -> AppResult<Vec<SermonForChapter>> {
    let conn = db.conn();
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
    let conn = db.conn();
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
    let conn = db.conn();
    Ok(sermons::delete_event(&conn, event_id)?)
}

#[tauri::command]
pub fn list_sermon_events(db: State<DbState>, sermon_id: i64) -> AppResult<Vec<SermonEvent>> {
    let conn = db.conn();
    Ok(sermons::list_events(&conn, sermon_id)?)
}

/// Null until two timed runs exist, after which every "about 31 minutes" in
/// the app is measured rather than assumed.
#[tauri::command]
pub fn get_speaking_rate(db: State<DbState>) -> AppResult<Option<SpeakingRate>> {
    let conn = db.conn();
    Ok(sermons::speaking_rate(&conn)?)
}

// Series --------------------------------------------------------------------

#[tauri::command]
pub fn list_sermon_series(db: State<DbState>) -> AppResult<Vec<SermonSeries>> {
    let conn = db.conn();
    Ok(sermons::list_series(&conn)?)
}

#[tauri::command]
pub fn create_sermon_series(db: State<DbState>, title: String, description: Option<String>) -> AppResult<SermonSeries> {
    let conn = db.conn();
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
    let conn = db.conn();
    Ok(sermons::update_series(&conn, series_id, &title, description.as_deref(), plan_code.as_deref())?)
}

/// The series goes; its sermons stay, with `series_id` cleared.
#[tauri::command]
pub fn delete_sermon_series(db: State<DbState>, series_id: i64) -> AppResult<bool> {
    let conn = db.conn();
    Ok(sermons::delete_series(&conn, series_id)?)
}

// Sermon ideas --------------------------------------------------------------

#[tauri::command]
pub fn list_sermon_ideas(db: State<DbState>) -> AppResult<Vec<SermonIdea>> {
    let conn = db.conn();
    Ok(sermon_ideas::list(&conn)?)
}

#[tauri::command]
pub fn create_sermon_idea(db: State<DbState>, input: SermonIdeaInput) -> AppResult<SermonIdea> {
    let conn = db.conn();
    Ok(sermon_ideas::create(&conn, &input)?)
}

#[tauri::command]
pub fn update_sermon_idea(db: State<DbState>, idea_id: i64, input: SermonIdeaInput) -> AppResult<SermonIdea> {
    let conn = db.conn();
    Ok(sermon_ideas::update(&conn, idea_id, &input)?)
}

/// Files an idea into a sermon, or with no sermon puts it back in the inbox.
#[tauri::command]
pub fn file_sermon_idea(db: State<DbState>, idea_id: i64, sermon_id: Option<i64>) -> AppResult<SermonIdea> {
    let conn = db.conn();
    Ok(sermon_ideas::file(&conn, idea_id, sermon_id)?)
}

#[tauri::command]
pub fn delete_sermon_idea(db: State<DbState>, idea_id: i64) -> AppResult<()> {
    let conn = db.conn();
    Ok(sermon_ideas::delete(&conn, idea_id)?)
}

// Illustrations -------------------------------------------------------------

#[tauri::command]
pub fn list_illustrations(db: State<DbState>, filter: Option<IllustrationFilter>) -> AppResult<Vec<Illustration>> {
    let conn = db.conn();
    Ok(illustrations::list(&conn, &filter.unwrap_or_default())?)
}

#[tauri::command]
pub fn get_illustration(db: State<DbState>, illustration_id: i64) -> AppResult<Option<Illustration>> {
    let conn = db.conn();
    Ok(illustrations::get(&conn, illustration_id)?)
}

#[tauri::command]
pub fn create_illustration(db: State<DbState>, input: IllustrationInput) -> AppResult<Illustration> {
    let conn = db.conn();
    Ok(illustrations::create(&conn, &input)?)
}

#[tauri::command]
pub fn update_illustration(db: State<DbState>, illustration_id: i64, input: IllustrationInput) -> AppResult<Illustration> {
    let conn = db.conn();
    Ok(illustrations::update(&conn, illustration_id, &input)?)
}

#[tauri::command]
pub fn delete_illustration(db: State<DbState>, illustration_id: i64) -> AppResult<()> {
    let conn = db.conn();
    Ok(illustrations::delete(&conn, illustration_id)?)
}

#[tauri::command]
pub fn list_all_illustration_tags(db: State<DbState>) -> AppResult<Vec<String>> {
    let conn = db.conn();
    Ok(illustrations::list_all_tags(&conn)?)
}

#[tauri::command]
pub fn record_illustration_use(db: State<DbState>, illustration_id: i64, sermon_id: i64) -> AppResult<()> {
    let conn = db.conn();
    Ok(illustrations::record_use(&conn, illustration_id, sermon_id)?)
}

#[tauri::command]
pub fn list_illustration_uses(db: State<DbState>, illustration_id: Option<i64>) -> AppResult<Vec<IllustrationUse>> {
    let conn = db.conn();
    Ok(illustrations::list_uses(&conn, illustration_id)?)
}

// Export --------------------------------------------------------------------

/// Writes a generated .pptx to the file `pick_save_path` chose; `token` is
/// that dialog's, redeemed here for the path.
///
/// The deck is built by pptxgenjs, which only runs in the webview, so
/// unlike every other export the bytes come *from* the frontend rather than
/// being rendered here. The write still goes through a command because the
/// fs plugin's scope deliberately allows no arbitrary path (see
/// capabilities/default.json), which is the same reason export_note exists
/// -- and arbitrary bytes are only safe to write when the destination is
/// one the user picked in a dialog this side of the boundary ran.
///
/// Off the main thread: the destination is wherever the reader pointed the
/// save dialog, which is routinely a synced or network folder, and a write
/// there is not bounded by anything this app controls.
#[tauri::command]
pub async fn export_sermon_slides(app: AppHandle, token: String, data: Vec<u8>) -> AppResult<()> {
    write_picked(app, token, data, "slide").await
}

/// Writes the podium file -- the manuscript as one self-contained web page
/// for a phone or tablet -- to the file `pick_save_path` chose. Built in the
/// webview for the same reason as the deck: it is the manuscript view's own
/// markup, already rendered there.
///
/// The page comes over as a string: sent as bytes it would cross the bridge
/// as a JSON array of numbers several times its size.
#[tauri::command]
pub async fn export_sermon_podium(app: AppHandle, token: String, html: String) -> AppResult<()> {
    write_picked(app, token, html.into_bytes(), "podium").await
}

/// The bytes-from-the-webview write both exports above share.
async fn write_picked(app: AppHandle, token: String, data: Vec<u8>, what: &'static str) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || -> AppResult<()> {
        let picked = app.state::<PickedPaths>();
        let dest_path = take_path(&picked, &token)?;
        std::fs::write(&dest_path, data)?;
        Ok(())
    })
    .await
    .map_err(|e| anyhow::anyhow!("the {what} export did not finish: {e}"))?
}

/// Writes the manuscript as Markdown to the file `pick_save_path` chose.
/// The passage blocks are rendered here, at export time, so the file holds
/// the words rather than a pointer to them.
///
/// Off the main thread, for the same reason as `export_sermon_slides`, and
/// because every passage block in the manuscript is fetched on the way.
#[tauri::command]
pub async fn export_sermon(app: AppHandle, sermon_id: i64, token: String) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || -> AppResult<()> {
        let picked = app.state::<PickedPaths>();
        let dest_path = take_path(&picked, &token)?;
        let db = app.state::<DbState>();
        let conn = db.conn();
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
    })
    .await
    .map_err(|e| anyhow::anyhow!("the sermon export did not finish: {e}"))?
}
