//! Sojourner's backend in the browser: the desktop app's commands, compiled
//! to WebAssembly and run in a Web Worker (`src/web/worker.ts`), over one
//! SQLite connection as on the desktop -- user.db in the browser's private
//! files (OPFS), content.db read in pieces over HTTP.
//!
//! The page's `invoke(cmd, args)` arrives at [`dispatch`]. Most commands are
//! the desktop's own, copied in by `build.rs` (see [`commands`]); the rest
//! have a web version or a plain "unavailable" in [`stand_ins`].

// The core crate's modules under the names the desktop's command files use
// (`crate::db::...`), as the desktop app's own lib.rs does.
pub use sojourner_core::{citations, color_text, db, error, import, library, models, morph, paths, plain, refparse, text};

pub mod reply;
pub mod shim;
pub mod stand_ins;

/// The desktop's command files, filtered and with a dispatcher, written by
/// `build.rs` into `$OUT_DIR/commands.rs`.
pub mod commands {
    include!(concat!(env!("OUT_DIR"), "/commands.rs"));
}

#[cfg(target_arch = "wasm32")]
mod httpvfs;
#[cfg(target_arch = "wasm32")]
mod wasm;

use db::DbState;
use reply::Reply;
use serde_json::Value;

/// Runs one command for the page: the desktop's own body if there is one,
/// else its web stand-in, else an "unavailable" error.
pub fn dispatch(db: &DbState, cmd: &str, args: Value) -> Reply {
    match commands::dispatch(db, cmd, args) {
        Ok(reply) => reply,
        Err(args) => stand_ins::dispatch(db, cmd, args).unwrap_or_else(|| Err(reply::unavailable(cmd))),
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use serde_json::json;
    use std::path::{Path, PathBuf};

    pub fn temp_db_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("sojourner-web-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// A fresh user.db with an empty, fully migrated content.db attached:
    /// the desktop's own `db::open`, so the dispatcher is tested against the
    /// schema the commands were written for.
    pub fn open(dir: &Path) -> DbState {
        let content = dir.join("content.db");
        drop(db::open_content_db(&content).unwrap());
        DbState(std::sync::Mutex::new(db::open(dir, &content).unwrap()))
    }

    #[test]
    fn arguments_arrive_by_their_camel_case_names_as_from_tauri() {
        let dir = temp_db_dir("args");
        let db = open(&dir);
        // `verse` is an Option: left out, it is None, as Tauri reads it.
        let set = dispatch(&db, "set_reading_position", json!({ "translationId": 1, "bookId": 43, "chapter": 3 }));
        assert_eq!(set, Ok(Value::Null));
        let got = dispatch(&db, "get_reading_position", json!({})).unwrap();
        assert_eq!(got["book_id"], json!(43), "{got}");
        assert_eq!(got["chapter"], json!(3), "{got}");
        assert_eq!(got["verse"], Value::Null, "{got}");
    }

    #[test]
    fn a_command_without_arguments_takes_null_or_an_empty_object() {
        let dir = temp_db_dir("noargs");
        let db = open(&dir);
        // The 66 books come with the content schema.
        for args in [Value::Null, json!({})] {
            let books = dispatch(&db, "list_books", args).unwrap();
            assert_eq!(books.as_array().map(Vec::len), Some(66));
        }
    }

    #[test]
    fn errors_come_back_as_the_desktop_sends_them() {
        let dir = temp_db_dir("errors");
        let db = open(&dir);
        // Snake case is not what the page sends; Tauri would refuse it too.
        let Err(Value::String(e)) = dispatch(&db, "get_chapter", json!({ "translation_id": 1, "bookId": 1, "chapter": 1 }))
        else {
            panic!("expected an error")
        };
        assert!(e.contains("invalid args for command `get_chapter`") && e.contains("translationId"), "{e}");
        // An `AppResult` error is its message, a string.
        assert_eq!(dispatch(&db, "duplicate_sermon", json!({ "sermonId": 999 })), Err(json!("sermon 999 not found")));
        assert_eq!(
            dispatch(&db, "install_pack", json!({ "token": "x" })),
            Err(json!("Not available in Sojourner on the web: install_pack"))
        );
        assert_eq!(dispatch(&db, "no_such_command", json!({})), Err(json!("Not available in Sojourner on the web: no_such_command")));
    }

    /// The search command reaches the web through its `_blocking` twin.
    #[test]
    fn search_runs_through_its_blocking_twin() {
        let dir = temp_db_dir("search");
        let db = open(&dir);
        let r = dispatch(
            &db,
            "search",
            json!({ "query": "grace", "translationIds": [], "commentarySourceIds": [], "limit": 25 }),
        )
        .unwrap();
        assert_eq!(r["verse_total"], json!(0), "{r}");
        assert!(commands::GENERATED.contains(&"morph_search"));
        assert!(commands::GENERATED.contains(&"search_facets"));
    }

    /// A write through the `html_text()` triggers: the function is on the
    /// connection, as `prepare_user_db` puts it there.
    #[test]
    fn a_note_is_saved_through_the_search_triggers() {
        let dir = temp_db_dir("note");
        let db = open(&dir);
        let note = dispatch(
            &db,
            "create_note",
            json!({ "bookId": 43, "chapter": 3, "verseStart": 16, "verseEnd": 16, "body": "<p>So <b>loved</b></p>" }),
        );
        assert!(note.is_ok(), "{note:?}");
    }
}
