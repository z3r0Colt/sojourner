//! Choosing a file, without the page ever holding a path.
//!
//! Every export and import used to run its dialog in React and hand the
//! resulting string to a Rust command, which wrote to it. That makes the
//! path a *parameter* the caller chooses, and a command is callable from
//! page script with no dialog at all -- `export_sermon_slides(path, bytes)`
//! was arbitrary bytes to an arbitrary file. Validating the path cannot fix
//! that: there is no path a page should be able to name.
//!
//! So the dialog runs here instead. What goes back to the page is a random,
//! single-use token plus a display string to show the user; the commands
//! that write and read take the token and redeem it for the path with
//! [`take_path`]. A page that never saw a path cannot choose one, and a
//! token that has been spent cannot be spent twice.
use crate::error::AppResult;
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

/// The paths chosen so far and not yet redeemed, keyed by token.
///
/// An entry whose flow was abandoned -- a file picked, then a confirmation
/// cancelled -- is never redeemed, so the map is swept when it grows past
/// `MAX_PENDING`: one dialog can only ever be in flight at a time, and the
/// oldest entries are by then certainly dead.
#[derive(Default)]
pub struct PickedPaths(pub Mutex<HashMap<String, PathBuf>>);

impl PickedPaths {
    /// Recovered rather than re-panicked on, for the same reason as
    /// [`crate::db::DbState::conn`]: a panic elsewhere while this guard was
    /// held must not make every later file dialog fail. The map is a
    /// `HashMap<String, PathBuf>` and nothing here can leave it half-written,
    /// so what comes back is exactly the set of unredeemed choices.
    fn paths(&self) -> std::sync::MutexGuard<'_, HashMap<String, PathBuf>> {
        self.0.lock().unwrap_or_else(|e| e.into_inner())
    }
}

/// How many unredeemed choices to keep before dropping the oldest.
const MAX_PENDING: usize = 16;

/// What a picker returns. `display_path` is for showing the user which file
/// they chose -- nothing may be inferred from it or passed back.
#[derive(Serialize)]
pub struct PickedPath {
    pub token: String,
    pub display_path: String,
}

/// The dialog filters for one `kind`. The kinds live here rather than the
/// page passing extensions through, so the whole description of the dialog
/// is on this side of the boundary.
fn filters_for(kind: &str) -> AppResult<&'static [(&'static str, &'static [&'static str])]> {
    Ok(match kind {
        "markdown" => &[("Markdown", &["md"])],
        "database" => &[("Database", &["db"])],
        "pptx" => &[("PowerPoint", &["pptx"])],
        "resource" => &[(
            "Resources",
            &["epub", "pdf", "mobi", "azw", "azw3", "mp4", "mkv", "webm", "mov", "mp3", "m4a", "wav", "ogg", "flac"],
        )],
        "library_xml" => &[("XML", &["xml"])],
        "pack" => &[("Sojourner resource pack", &["sjpack"])],
        other => return Err(anyhow::anyhow!("unknown file kind: {other}").into()),
    })
}

fn remember(picked: &PickedPaths, path: PathBuf) -> PickedPath {
    let token = uuid::Uuid::new_v4().to_string();
    let display_path = path.display().to_string();
    let mut pending = picked.paths();
    if pending.len() >= MAX_PENDING {
        // Abandoned flows would otherwise accumulate for the life of the
        // process. Nothing here is recoverable once its flow has moved on,
        // so clearing is as correct as evicting one by one.
        pending.clear();
    }
    pending.insert(token.clone(), path);
    PickedPath { token, display_path }
}

/// Redeems a token for the path it stands for, removing it: a token buys
/// exactly one read or write. An unknown token is an error, not a silent
/// no-op -- most often it is a flow that ran twice.
pub fn take_path(picked: &PickedPaths, token: &str) -> AppResult<PathBuf> {
    picked
        .paths()
        .remove(token)
        .ok_or_else(|| anyhow::anyhow!("that file choice has already been used -- choose the file again").into())
}

/// Builds a dialog with this kind's filters, parented to the app window so
/// it behaves the way the webview's own dialogs did.
fn dialog(app: &AppHandle, kind: Option<&str>) -> AppResult<tauri_plugin_dialog::FileDialogBuilder<tauri::Wry>> {
    let mut builder = app.dialog().file();
    if let Some(kind) = kind {
        for (name, extensions) in filters_for(kind)? {
            builder = builder.add_filter(*name, extensions);
        }
    }
    if let Some(window) = app.get_webview_window("main") {
        builder = builder.set_parent(&window);
    }
    Ok(builder)
}

/// A "save as" dialog. `None` when the user cancels.
///
/// `async` is load-bearing: Tauri runs a *synchronous* command on the main
/// thread, and the blocking dialog API waits there for an event loop that is
/// itself waiting for the command to return -- the app freezes with no
/// dialog ever drawn (seen, before this was async). An async command runs on
/// the async runtime instead, leaving the main thread free to draw and pump
/// the dialog. This is how tauri-plugin-dialog's own commands are written.
#[tauri::command]
pub async fn pick_save_path(
    app: AppHandle,
    picked: State<'_, PickedPaths>,
    kind: String,
    default_name: Option<String>,
) -> AppResult<Option<PickedPath>> {
    let mut builder = dialog(&app, Some(&kind))?;
    if let Some(name) = default_name {
        builder = builder.set_file_name(name);
    }
    match builder.blocking_save_file() {
        Some(file) => Ok(Some(remember(&picked, file.into_path()?))),
        None => Ok(None),
    }
}

/// An "open file" dialog. `None` when the user cancels. Async for the same
/// reason as `pick_save_path`.
#[tauri::command]
pub async fn pick_open_path(app: AppHandle, picked: State<'_, PickedPaths>, kind: String) -> AppResult<Option<PickedPath>> {
    match dialog(&app, Some(&kind))?.blocking_pick_file() {
        Some(file) => Ok(Some(remember(&picked, file.into_path()?))),
        None => Ok(None),
    }
}

/// A "choose folder" dialog. `None` when the user cancels. Async for the
/// same reason as `pick_save_path`.
#[tauri::command]
pub async fn pick_folder(app: AppHandle, picked: State<'_, PickedPaths>) -> AppResult<Option<PickedPath>> {
    match dialog(&app, None)?.blocking_pick_folder() {
        Some(folder) => Ok(Some(remember(&picked, folder.into_path()?))),
        None => Ok(None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_token_is_good_for_exactly_one_use() {
        let picked = PickedPaths::default();
        let handed_out = remember(&picked, PathBuf::from("C:/tmp/export.md"));

        let path = take_path(&picked, &handed_out.token).unwrap();
        assert_eq!(path, PathBuf::from("C:/tmp/export.md"));
        assert!(take_path(&picked, &handed_out.token).is_err(), "a spent token must not work again");
    }

    #[test]
    fn an_unknown_token_is_refused() {
        let picked = PickedPaths::default();
        assert!(take_path(&picked, "not-a-token").is_err());
    }

    #[test]
    fn abandoned_choices_do_not_accumulate_without_bound() {
        let picked = PickedPaths::default();
        for i in 0..(MAX_PENDING * 3) {
            remember(&picked, PathBuf::from(format!("C:/tmp/{i}.md")));
        }
        assert!(picked.paths().len() <= MAX_PENDING);
    }

    #[test]
    fn the_newest_choice_survives_a_sweep() {
        let picked = PickedPaths::default();
        for i in 0..MAX_PENDING {
            remember(&picked, PathBuf::from(format!("C:/tmp/{i}.md")));
        }
        // The one the user just made must still be redeemable, however full
        // the map was when it arrived.
        let newest = remember(&picked, PathBuf::from("C:/tmp/newest.md"));
        assert_eq!(take_path(&picked, &newest.token).unwrap(), PathBuf::from("C:/tmp/newest.md"));
    }

    #[test]
    fn every_kind_the_frontend_asks_for_has_filters() {
        for kind in ["markdown", "database", "pptx", "resource", "library_xml"] {
            assert!(!filters_for(kind).unwrap().is_empty(), "{kind} has no filters");
        }
        assert!(filters_for("exe").is_err());
    }
}
