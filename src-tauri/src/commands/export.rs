use crate::db::queries::{notes, prayer_journal, verses};
use crate::db::DbState;
use crate::error::AppResult;
use crate::export;
use std::collections::HashMap;
use tauri::State;

fn book_names(conn: &rusqlite::Connection) -> anyhow::Result<HashMap<i64, String>> {
    Ok(verses::list_books(conn)?.into_iter().map(|b| (b.id, b.name)).collect())
}

/// Writes `dest_path` -- the path comes from a save dialog the frontend
/// already ran (see BackupsSection's export flow for the same pattern),
/// since a Rust command isn't subject to the webview fs plugin's scope
/// restrictions the way a frontend-side file write would be.
#[tauri::command]
pub fn export_note(db: State<DbState>, note_id: i64, dest_path: String) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    let note = notes::get(&conn, note_id)?.ok_or_else(|| anyhow::anyhow!("note not found"))?;
    let names = book_names(&conn)?;
    let text = export::format_note(&note, &names);
    std::fs::write(&dest_path, text)?;
    Ok(())
}

#[tauri::command]
pub fn export_chapter_note(db: State<DbState>, chapter_note_id: i64, dest_path: String) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    let note = notes::get_chapter_note(&conn, chapter_note_id)?.ok_or_else(|| anyhow::anyhow!("chapter note not found"))?;
    let names = book_names(&conn)?;
    let text = export::format_chapter_note(&note, &names);
    std::fs::write(&dest_path, text)?;
    Ok(())
}

#[tauri::command]
pub fn export_prayer_entry(db: State<DbState>, prayer_entry_id: i64, dest_path: String) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    let entry = prayer_journal::get(&conn, prayer_entry_id)?.ok_or_else(|| anyhow::anyhow!("prayer entry not found"))?;
    let names = book_names(&conn)?;
    let text = export::format_prayer_entry(&entry, &names);
    std::fs::write(&dest_path, text)?;
    Ok(())
}
