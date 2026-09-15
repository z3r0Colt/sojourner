use crate::commands::file_picker::{take_path, PickedPaths};
use crate::db::queries::{notes, prayer_journal, verses};
use crate::db::DbState;
use crate::error::AppResult;
use crate::export;
use std::collections::HashMap;
use tauri::{AppHandle, Manager};

fn book_names(conn: &rusqlite::Connection) -> anyhow::Result<HashMap<i64, String>> {
    Ok(verses::list_books(conn)?.into_iter().map(|b| (b.id, b.name)).collect())
}

/// Writes the file the user chose in `pick_save_path`. The page holds only
/// that dialog's token, never the path -- a Rust command isn't subject to
/// the webview fs plugin's scope restrictions the way a frontend-side file
/// write would be, so the path must not be the caller's to name.
///
/// Every export here runs off the main thread. The destination is wherever
/// the reader pointed the dialog -- a synced folder, a network share -- and
/// a write there is not bounded by anything this app controls. See the note
/// at the top of `commands::backup` for why these take an `AppHandle`
/// rather than the state they need.
#[tauri::command]
pub async fn export_note(app: AppHandle, note_id: i64, token: String) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || -> AppResult<()> {
        let picked = app.state::<PickedPaths>();
        let dest_path = take_path(&picked, &token)?;
        let db = app.state::<DbState>();
        let conn = db.conn();
        let note = notes::get(&conn, note_id)?.ok_or_else(|| anyhow::anyhow!("note not found"))?;
        let names = book_names(&conn)?;
        let text = export::format_note(&note, &names);
        std::fs::write(&dest_path, text)?;
        Ok(())
    })
    .await
    .map_err(|e| anyhow::anyhow!("the note export did not finish: {e}"))?
}

#[tauri::command]
pub async fn export_chapter_note(app: AppHandle, chapter_note_id: i64, token: String) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || -> AppResult<()> {
        let picked = app.state::<PickedPaths>();
        let dest_path = take_path(&picked, &token)?;
        let db = app.state::<DbState>();
        let conn = db.conn();
        let note =
            notes::get_chapter_note(&conn, chapter_note_id)?.ok_or_else(|| anyhow::anyhow!("chapter note not found"))?;
        let names = book_names(&conn)?;
        let text = export::format_chapter_note(&note, &names);
        std::fs::write(&dest_path, text)?;
        Ok(())
    })
    .await
    .map_err(|e| anyhow::anyhow!("the chapter note export did not finish: {e}"))?
}

#[tauri::command]
pub async fn export_prayer_entry(app: AppHandle, prayer_entry_id: i64, token: String) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || -> AppResult<()> {
        let picked = app.state::<PickedPaths>();
        let dest_path = take_path(&picked, &token)?;
        let db = app.state::<DbState>();
        let conn = db.conn();
        let entry =
            prayer_journal::get(&conn, prayer_entry_id)?.ok_or_else(|| anyhow::anyhow!("prayer entry not found"))?;
        let names = book_names(&conn)?;
        let text = export::format_prayer_entry(&entry, &names);
        std::fs::write(&dest_path, text)?;
        Ok(())
    })
    .await
    .map_err(|e| anyhow::anyhow!("the prayer entry export did not finish: {e}"))?
}
