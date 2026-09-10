use crate::db::queries::red_letter as queries;
use crate::db::DbState;
use crate::error::AppResult;
use crate::models::RedLetterRange;
use tauri::State;

#[tauri::command]
pub fn get_red_letter_ranges(db: State<DbState>, book_id: i64, chapter: i64) -> AppResult<Vec<RedLetterRange>> {
    let conn = db.0.lock().unwrap();
    Ok(queries::get_ranges_for_chapter(&conn, book_id, chapter)?)
}
