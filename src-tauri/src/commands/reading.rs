use crate::db::queries::{commentary, reading_log, reading_position, verses};
use crate::db::DbState;
use crate::error::AppResult;
use crate::models::{CommentaryEntry, CommentarySection, Passage, PassageRef, ReadingLogEntry, ReadingPosition, Verse};
use std::collections::HashMap;
use tauri::State;

#[tauri::command]
pub fn get_chapter(db: State<DbState>, translation_id: i64, book_id: i64, chapter: i64) -> AppResult<Vec<Verse>> {
    let conn = db.0.lock().unwrap();
    Ok(verses::get_chapter(&conn, translation_id, book_id, chapter)?)
}

/// Text for one or many verse ranges in one call -- see `verses::get_passages`.
#[tauri::command]
pub fn get_passages(db: State<DbState>, translation_id: i64, refs: Vec<PassageRef>) -> AppResult<Vec<Passage>> {
    let conn = db.0.lock().unwrap();
    Ok(verses::get_passages(&conn, translation_id, &refs)?)
}

#[tauri::command]
pub fn get_parallel_chapter(
    db: State<DbState>,
    translation_ids: Vec<i64>,
    book_id: i64,
    chapter: i64,
) -> AppResult<HashMap<i64, Vec<Verse>>> {
    let conn = db.0.lock().unwrap();
    let mut map = HashMap::new();
    for tid in translation_ids {
        // `chapter` here is treated as the canonical (KJV-reference) chapter --
        // resolves through versification_map so editions with a different
        // chapter/verse division for this book still line up correctly.
        map.insert(tid, verses::get_chapter_canonical(&conn, tid, book_id, chapter)?);
    }
    Ok(map)
}

/// A single verse's text in every installed translation that covers it --
/// the lighter-weight "Compare" view from a verse's context menu, as
/// opposed to full chapter Parallel mode. Resolves through the same
/// versification-aware lookup as Parallel mode, and simply omits any
/// translation that doesn't have this verse (e.g. Tyndale outside the NT
/// and Pentateuch) rather than erroring.
#[tauri::command]
pub fn compare_verse(db: State<DbState>, book_id: i64, chapter: i64, verse: i64) -> AppResult<Vec<Verse>> {
    let conn = db.0.lock().unwrap();
    let translations = verses::list_translations(&conn)?;
    let mut result = Vec::new();
    for t in translations {
        let chapter_verses = verses::get_chapter_canonical(&conn, t.id, book_id, chapter)?;
        if let Some(v) = chapter_verses.into_iter().find(|v| v.verse == verse) {
            result.push(v);
        }
    }
    Ok(result)
}

#[tauri::command]
pub fn get_commentary_for_passage(
    db: State<DbState>,
    source_id: i64,
    book_id: i64,
    chapter: i64,
    verse: Option<i64>,
) -> AppResult<Vec<CommentaryEntry>> {
    let conn = db.0.lock().unwrap();
    Ok(commentary::get_commentary_for_passage(&conn, source_id, book_id, chapter, verse)?)
}

#[tauri::command]
pub fn book_has_commentary(db: State<DbState>, source_id: i64, book_id: i64) -> AppResult<bool> {
    let conn = db.0.lock().unwrap();
    Ok(commentary::book_has_commentary(&conn, source_id, book_id)?)
}

#[tauri::command]
pub fn get_commentary_toc(db: State<DbState>, source_id: i64, book_id: i64) -> AppResult<Vec<CommentarySection>> {
    let conn = db.0.lock().unwrap();
    Ok(commentary::list_sections_for_book(&conn, source_id, book_id)?)
}

#[tauri::command]
pub fn get_section_entries(db: State<DbState>, section_id: i64) -> AppResult<Vec<CommentaryEntry>> {
    let conn = db.0.lock().unwrap();
    Ok(commentary::get_section_entries(&conn, section_id)?)
}

#[tauri::command]
pub fn get_reading_position(db: State<DbState>) -> AppResult<Option<ReadingPosition>> {
    let conn = db.0.lock().unwrap();
    Ok(reading_position::get(&conn)?)
}

#[tauri::command]
pub fn set_reading_position(
    db: State<DbState>,
    translation_id: i64,
    book_id: i64,
    chapter: i64,
    verse: Option<i64>,
) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    reading_position::set(&conn, translation_id, book_id, chapter, verse)?;
    // The reading log (F3.1) rides along with every position save: one row
    // per chapter per local day, so Today's "Recent chapters" survives a
    // cleared workspace and F3.5's heatmap has something to draw.
    reading_log::record(&conn, &reading_log::today(), book_id, chapter, translation_id)?;
    Ok(())
}

/// The most recently read chapters, newest first, each once (F3.1).
#[tauri::command]
pub fn list_reading_log(db: State<DbState>, limit: Option<i64>) -> AppResult<Vec<ReadingLogEntry>> {
    let conn = db.0.lock().unwrap();
    Ok(reading_log::list_recent(&conn, limit.unwrap_or(12).clamp(1, 200))?)
}
