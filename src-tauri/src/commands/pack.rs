//! Installing and removing the book library pack.
//!
//! The work itself is in [`crate::pack`]; this is the part that knows about
//! the window, the database lock, and the file the reader chose.

use crate::commands::file_picker::{take_path, PickedPaths};
use crate::db::DbState;
use crate::error::AppResult;
use crate::pack::{self, InstallOutcome, PackStatus};
use tauri::{AppHandle, Emitter, Manager};

/// The event the page listens on while an install runs.
const PROGRESS_EVENT: &str = "pack-install-progress";

fn pack_dir(app: &AppHandle) -> AppResult<std::path::PathBuf> {
    crate::paths::pack_dir(app).ok_or_else(|| anyhow::anyhow!("could not resolve the app data folder").into())
}

#[tauri::command]
pub fn pack_status(app: AppHandle) -> AppResult<PackStatus> {
    Ok(pack::status(&pack_dir(&app)?))
}

/// Installs the pack the reader picked.
///
/// Three phases, and the middle one is why this is `async`:
///
/// 1. stage -- hundreds of megabytes read, hashed and written, holding no
///    lock, on a blocking thread so the window keeps drawing its progress bar;
/// 2. commit -- the renames, holding the lock for exactly as long as they take;
/// 3. sync -- `library::sync` makes user.db agree with the pack that just
///    arrived, repointing rows at the new files and adopting any the reader
///    had imported by hand.
#[tauri::command]
pub async fn install_pack(app: AppHandle, token: String) -> AppResult<InstallOutcome> {
    let archive = {
        let picked = app.state::<PickedPaths>();
        take_path(&picked, &token)?
    };
    let dir = pack_dir(&app)?;

    tauri::async_runtime::spawn_blocking(move || -> AppResult<InstallOutcome> {
        let mut report = |progress: pack::PackProgress| {
            // Best-effort: a progress event that cannot be delivered (the
            // window closed mid-install) must not fail the install.
            let _ = app.emit(PROGRESS_EVENT, progress);
        };

        let staged = pack::stage(&archive, &dir, &mut report)?;

        let db = app.state::<DbState>();
        let conn = db.conn();
        let db_path = dir.join(pack::LIBRARY_DB);
        let outcome = pack::commit(
            &dir,
            staged,
            &mut report,
            &mut || crate::db::detach_library(&conn),
            &mut || crate::db::attach_library(&conn, &db_path),
        )?;

        report(pack::PackProgress {
            stage: "cataloguing",
            file: None,
            files_done: 0,
            files_total: 0,
            bytes_done: 0,
            bytes_total: 0,
        });
        let books_dir = dir.join(pack::BOOKS_DIR);
        let synced = crate::library::sync(&conn, &books_dir)?;
        println!(
            "[pack] installed {} {}: {} added, {} adopted, {} repointed, {} retired",
            outcome.name, outcome.version, synced.added, synced.adopted, synced.repointed, synced.retired
        );

        report(pack::PackProgress {
            stage: "done",
            file: None,
            files_done: 0,
            files_total: 0,
            bytes_done: outcome.bytes,
            bytes_total: outcome.bytes,
        });
        Ok(outcome)
    })
    .await
    .map_err(|e| anyhow::anyhow!("the install did not finish: {e}"))?
}

/// Removes the installed pack.
///
/// The books go; the reader's rows for them stay. `library::sync` retires
/// them -- keeping every tag, passage link and bookmark -- so installing the
/// pack again later finds all of it waiting.
#[tauri::command]
pub async fn remove_pack(app: AppHandle) -> AppResult<()> {
    let dir = pack_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || -> AppResult<()> {
        let db = app.state::<DbState>();
        let conn = db.conn();
        pack::remove(&dir, &mut || crate::db::detach_library(&conn))?;
        // Not `sync`: with nothing attached it returns before it reaches the
        // retiring step, because it has no list of shipped books to compare
        // against. `retire_all` is that case written out.
        let retired = crate::library::retire_all(&conn)?;
        println!("[pack] removed: {retired} book row(s) retired");
        Ok(())
    })
    .await
    .map_err(|e| anyhow::anyhow!("the removal did not finish: {e}"))?
}
