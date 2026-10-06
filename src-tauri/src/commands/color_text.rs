use crate::color_text::Lexicon;
use crate::db::queries::color_text as queries;
use crate::db::DbState;
use crate::error::AppResult;
use crate::models::{ColorSpan, ColorTermVerse};
use once_cell::sync::OnceCell;
use tauri::State;

static LEXICON: OnceCell<Lexicon> = OnceCell::new();

/// The colored words of one chapter, for the reading view's color text.
#[tauri::command]
pub fn get_color_text(db: State<DbState>, translation_id: i64, book_id: i64, chapter: i64) -> AppResult<Vec<ColorSpan>> {
    let conn = db.conn();
    let lexicon = LEXICON.get_or_try_init(|| queries::load_lexicon(&conn))?;
    Ok(queries::chapter_colors(&conn, lexicon, translation_id, book_id, chapter)?)
}

/// Every verse where a colored word has that color, by the KJV term and code
/// a span carries.
#[tauri::command]
pub fn get_color_term_verses(db: State<DbState>, code: String, term: String) -> AppResult<Vec<ColorTermVerse>> {
    let conn = db.conn();
    Ok(queries::term_verses(&conn, &code, &term)?)
}

/// Who is speaking in one chapter: the reading view's speaker styles.
#[tauri::command]
pub fn get_color_voices(db: State<DbState>, translation_id: i64, book_id: i64, chapter: i64) -> AppResult<Vec<ColorSpan>> {
    let conn = db.conn();
    Ok(queries::chapter_voices(&conn, translation_id, book_id, chapter)?)
}
