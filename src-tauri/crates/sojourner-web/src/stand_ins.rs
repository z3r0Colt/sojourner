//! The web's answers for the desktop commands `build.rs` cannot copy
//! (`commands::NOT_GENERATED`, the ones that need Tauri's `AppHandle`, a
//! window, or a desktop-only module). Each is either answered here, the way
//! that makes sense in a browser, or listed in [`UNAVAILABLE`]; the tests
//! below fail for a desktop command that is neither.
//!
//! An answer here is what the screens already cope with: an empty list where
//! there is nothing (no backups folder, no installed packs, no neural
//! voice), `None` where the desktop may have nothing to say either.

use crate::db::DbState;
use crate::reply::{self, Reply};
use serde::Deserialize;
use serde_json::{json, Value};

/// The web app's version, as the page knows it (package.json's, the number
/// a release bumps), given at start.
pub static APP_VERSION: std::sync::OnceLock<String> = std::sync::OnceLock::new();

/// The commands [`dispatch`] answers.
pub const STAND_INS: &[&str] = &[
    "ready_to_close",
    "app_version",
    "data_version",
    "quick_check",
    "log_frontend_error",
    "get_system_accent",
    "list_backups",
    "get_backup_sync_folder",
    "scan_library",
    "pack_status",
    "pack_statuses",
    "citations_for_passage",
    "kokoro_available",
    "kokoro_voices",
    "kokoro_can_say",
    "media_base_url",
];

/// Desktop commands the web build does not have. Each fails with
/// [`reply::unavailable`]; the screens that call them are hidden or given
/// a browser version in web mode.
pub const UNAVAILABLE: &[&str] = &[
    // File dialogs, and what writes to or reads from the file they chose.
    "pick_save_path",
    "pick_open_path",
    "pick_folder",
    "add_file",
    "add_resource",
    "bulk_import_resources",
    "reextract_resource",
    "export_note",
    "export_chapter_note",
    "export_prayer_entry",
    "export_sermon",
    "export_sermon_slides",
    "export_sermon_podium",
    // Backups to a folder, and restoring from one.
    "create_backup",
    "export_database",
    "stage_import",
    "stage_restore",
    "set_backup_sync_folder",
    "get_logs_dir",
    // Packs installed from a file.
    "install_pack",
    "remove_pack",
    // The neural voice: the browser's own speech stands in.
    "kokoro_synthesize",
    // The service worker updates the web app itself.
    "check_for_update",
    // Settings → Other devices: the web app is already on every device.
    "remote_status",
    "remote_set_enabled",
    "remote_new_key",
];

pub fn dispatch(db: &DbState, cmd: &str, args: Value) -> Option<Reply> {
    Some(match cmd {
        "ready_to_close" | "log_frontend_error" | "get_system_accent" | "get_backup_sync_folder" | "media_base_url" => {
            Ok(Value::Null)
        }
        "app_version" => Ok(json!(APP_VERSION.get().map(String::as_str).unwrap_or(env!("CARGO_PKG_VERSION")))),
        "data_version" => {
            let conn = db.conn();
            reply::result(conn.query_row("PRAGMA data_version", [], |r| r.get::<_, i64>(0)).map_err(|e| e.to_string()))
        }
        // user.db only. The desktop checks content.db as well, which here
        // would mean downloading all of it.
        "quick_check" => {
            let conn = db.conn();
            reply::result(quick_check_main(&conn).map_err(|e| e.to_string()))
        }
        "list_backups" | "scan_library" | "pack_statuses" | "kokoro_voices" => Ok(json!([])),
        "kokoro_available" | "kokoro_can_say" => Ok(json!(false)),
        // `PackStatus::none()` on the desktop.
        "pack_status" => Ok(json!({
            "id": null, "kind": null, "map": null, "installed": false, "name": null,
            "version": null, "built_at": null, "book_count": null, "bytes_on_disk": null,
        })),
        // The desktop names each shelf from its installed manifest; here a
        // shelf is known only by its schema.
        "citations_for_passage" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                book_id: i64,
                chapter: i64,
                verse: Option<i64>,
            }
            let a: Args = match reply::args(cmd, args) {
                Ok(a) => a,
                Err(e) => return Some(Err(e)),
            };
            let conn = db.conn();
            let shelves: Vec<(String, String)> =
                crate::db::attached_library_schemas(&conn).into_iter().map(|s| (s.clone(), s)).collect();
            reply::result(
                crate::db::queries::citations::for_passage(&conn, a.book_id, a.chapter, a.verse, &shelves, 400)
                    .map_err(|e| format!("{e:#}")),
            )
        }
        _ => return None,
    })
}

fn quick_check_main(conn: &rusqlite::Connection) -> rusqlite::Result<Vec<String>> {
    let mut stmt = conn.prepare("PRAGMA main.quick_check")?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
    let mut issues = Vec::new();
    for row in rows {
        let row = row?;
        if row != "ok" {
            issues.push(format!("main: {row}"));
        }
    }
    Ok(issues)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::{DESKTOP_COMMANDS, GENERATED, NOT_GENERATED};
    use std::collections::BTreeSet;

    /// A new desktop command that `build.rs` cannot copy fails here until it
    /// has a web answer or is listed as unavailable.
    #[test]
    fn every_desktop_command_has_a_web_answer() {
        let answered: BTreeSet<&str> = STAND_INS.iter().chain(UNAVAILABLE).copied().collect();
        let missing: Vec<&&str> = NOT_GENERATED.iter().filter(|c| !answered.contains(**c)).collect();
        assert!(missing.is_empty(), "no web answer for {missing:?}: add each to STAND_INS or UNAVAILABLE");
    }

    /// And one the generator has since learned to copy should come out of
    /// these lists, or its hand-written answer would never be reached.
    #[test]
    fn nothing_here_shadows_a_generated_command_or_a_retired_one() {
        let generated: BTreeSet<&str> = GENERATED.iter().copied().collect();
        let desktop: BTreeSet<&str> = DESKTOP_COMMANDS.iter().copied().collect();
        for c in STAND_INS.iter().chain(UNAVAILABLE) {
            assert!(!generated.contains(c), "{c} is generated now: take it out of stand_ins.rs");
            assert!(desktop.contains(c), "{c} is no longer a desktop command");
        }
        let both: Vec<&&str> = STAND_INS.iter().filter(|c| UNAVAILABLE.contains(c)).collect();
        assert!(both.is_empty(), "{both:?} both answered and unavailable");
    }

    #[test]
    fn every_stand_in_is_answered() {
        let dir = crate::tests::temp_db_dir("stand-ins");
        let db = crate::tests::open(&dir);
        for c in STAND_INS {
            let args = json!({ "bookId": 43, "chapter": 3 });
            assert!(dispatch(&db, c, args).is_some(), "{c} is listed but not answered");
        }
        assert!(dispatch(&db, "install_pack", json!({})).is_none());
    }
}
