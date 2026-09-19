pub mod backup;
mod commands;
pub mod crash_log;
pub mod db;
mod error;
pub mod export;
pub mod import;
pub mod library;
pub mod models;
pub mod pack;
pub mod paths;
pub mod resources;
pub mod text;
pub mod tts;
pub mod update;

use db::DbState;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Emitter, Manager};

/// The resolved app-data directory, managed as Tauri state so backup/export/
/// import commands can find `user.db`, its `backups/` folder, and the
/// pending-import marker without re-deriving the path (and without needing
/// their own `AppHandle` plumbing just for that).
pub struct AppDataDir(pub PathBuf);

/// How long the window waits for the page to say it has finished saving.
///
/// The page is asked to flush and answer; this is the backstop for when it
/// cannot. A webview that has crashed or hung would otherwise leave a window
/// that refuses to close, which is a far worse failure than losing the last
/// few hundred milliseconds of typing -- so the window goes either way.
const CLOSE_FLUSH_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(2);

/// Lets the page say it has finished its last save and the window may go.
///
/// This is a command rather than a direct call on the window from the page
/// because `window.destroy()` would need a window permission granted in the
/// capability, and the capability is deliberately minimal (read its
/// `description`). A command of our own needs no new permission at all.
#[tauri::command]
fn ready_to_close(window: tauri::Window) {
    // Closing twice is not an error: the timeout below may already have
    // destroyed the window by the time this arrives.
    let _ = window.destroy();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    crate::tts::point_voice_at_lexicon();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // `tauri_plugin_dialog` stays: `commands::file_picker` uses DialogExt
        // to run the file dialogs in Rust. There is deliberately no fs plugin
        // -- see the capability's description for what `fs:default` granted
        // and why it went. Registering the plugin while granting it nothing
        // left a trap: the next person needing one file read would reach for
        // `fs:default` because the plugin was already there, and silently
        // hand the page recursive read of user.db, the backups and the logs.
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        // The manuscript autosave promises never to lose a keystroke, and on
        // the way out it could not keep that promise: its `beforeunload`
        // handler called `update.mutate`, which posts an async IPC message
        // and returns, and nothing asked the window to wait. The webview was
        // torn down while that message was still in flight -- so the last
        // debounce interval of typing was a race the reader could not see and
        // sometimes lost.
        //
        // So the close is a handshake. The window is held, the page is told
        // to flush, and it answers with `ready_to_close` when its last save
        // has actually landed. `CLOSE_FLUSH_TIMEOUT` is the backstop for a
        // page that cannot answer.
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                if window.emit("app-closing", ()).is_err() {
                    // Nothing is listening and nothing will answer, so
                    // waiting the full timeout would only delay the close.
                    let _ = window.destroy();
                    return;
                }
                // A plain thread rather than the async runtime: this is one
                // sleep and a destroy, and tokio is not a direct dependency
                // of this crate. `destroy` dispatches to the main thread
                // itself, so calling it from here is fine.
                let window = window.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(CLOSE_FLUSH_TIMEOUT);
                    let _ = window.destroy();
                });
            }
        })
        .setup(|app| {
            let handle = app.handle().clone();
            let app_data_dir = handle
                .path()
                .app_data_dir()
                .expect("could not resolve app data dir");

            // Production installs ship a prebuilt, populated content.db as a
            // bundled resource (see the `build_content_db` binary, run via
            // `npm run build:content` ahead of `tauri build`) -- first launch
            // never imports anything. The only way to reach the fallback below
            // is `cargo tauri dev` without having run that builder first, or a
            // release package that was assembled incorrectly.
            let bundled_content_db = handle.path().resource_dir().ok().map(|d| d.join("content.db"));
            let bundled_is_populated = bundled_content_db.as_deref().is_some_and(db::is_populated_content_db);

            let content_db_path = if bundled_is_populated {
                bundled_content_db.unwrap()
            } else {
                let fallback = app_data_dir.join("content.db");
                #[cfg(debug_assertions)]
                {
                    let mut content_conn =
                        db::open_content_db(&fallback).expect("failed to create content database");
                    if db::content_db_is_empty(&content_conn) {
                        // Compile-time path into this dev checkout -- never a real path once
                        // built in release mode, since this whole block is compiled out then.
                        let repo_root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                            .parent()
                            .expect("src-tauri has a parent directory");
                        println!("[dev] content.db is empty, building it from {}", repo_root.display());
                        match import::populate_content_db(
                            &mut content_conn,
                            &repo_root.join("bibles"),
                            &repo_root.join("commentaries"),
                            &repo_root.join("reference"),
                        ) {
                            Ok(results) => {
                                for r in &results {
                                    println!("[dev import] {} ({}): {}", r.path, r.format, r.status);
                                }
                            }
                            Err(e) => eprintln!("[dev import] content import failed: {e:#}"),
                        }
                    }
                }
                #[cfg(not(debug_assertions))]
                {
                    eprintln!(
                        "[warning] no populated content.db bundled with this build -- \
                         run `npm run build:content` before `tauri build`. Starting with no Bible content."
                    );
                }
                fallback
            };

            crash_log::install_panic_hook(app_data_dir.clone());
            backup::apply_pending_import(&app_data_dir).expect("failed to apply a staged import/restore");

            let conn = db::open(&app_data_dir, &content_db_path).expect("failed to open database");

            // The shipped library (see `crate::library` and `crate::pack`).
            //
            // The books no longer ship with the app: they arrive as a
            // resource pack the reader installs, which is a library.db of
            // their text and a folder of the files. When one is installed it
            // is ATTACHed here, and `library::sync` gives user.db a row per
            // book -- so each is taggable, linkable and bookmarkable like any
            // other resource -- repointed at wherever the files are on this
            // machine. When none is installed, nothing is attached and the
            // rows from a pack that was once here are retired, keeping their
            // tags against the day it comes back.
            //
            // Best-effort throughout: a library that cannot be attached or
            // synced must not stop the app opening.
            let pack_db = paths::pack_db_path(&handle).filter(|p| p.is_file());
            let library_dir = match &pack_db {
                Some(db_path) => match db::attach_library(&conn, db_path) {
                    Ok(()) => paths::pack_books_dir(&handle),
                    Err(e) => {
                        eprintln!("[library] could not attach the installed pack: {e:#}");
                        None
                    }
                },
                // Nothing installed. The repo's own `library/` folder is
                // still worth naming in a dev build, but only for an older
                // content.db that was built while the books still lived in
                // it -- `is_available` below is what decides, and against a
                // current content.db it says no. A dev checkout installs the
                // pack the same way a reader does.
                None => {
                    #[cfg(debug_assertions)]
                    {
                        let repo_root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                            .parent()
                            .expect("src-tauri has a parent directory");
                        let dir = repo_root.join(library::LIBRARY_DIR);
                        dir.is_dir().then_some(dir)
                    }
                    #[cfg(not(debug_assertions))]
                    None
                }
            };

            match library_dir.filter(|_| library::is_available(&conn)) {
                Some(dir) => match library::sync(&conn, &dir) {
                    Ok(o) if o.added + o.adopted + o.repointed + o.retired > 0 => println!(
                        "[library] {} added, {} adopted, {} repointed, {} retired",
                        o.added, o.adopted, o.repointed, o.retired
                    ),
                    Ok(_) => {}
                    Err(e) => eprintln!("[library] sync failed: {e:#}"),
                },
                // No pack, so nothing to sync against -- and deliberately
                // nothing done to the rows either.
                //
                // An earlier version retired them here, which looked tidy and
                // was wrong: clearing `library_key` is what tells the app a
                // row was ever one of the shipped books, and without it a
                // reader upgrading from a build that bundled the library sees
                // several hundred books that will not open and no reason
                // given. Left marked, the Resources view can say they are in
                // the pack and offer to install it, and `sync` repoints every
                // one of them the moment it arrives.
                //
                // Retiring stays what it always should have been: what
                // happens when the reader *asks* for the books to go.
                None => {
                    let marked = library::count_marked(&conn).unwrap_or(0);
                    if marked > 0 {
                        println!("[library] no resource pack installed; {marked} book row(s) waiting for one");
                    }
                }
            }

            // Trash retention: anything soft-deleted more than thirty days
            // ago is gone for good. Best-effort -- a failure here must not
            // stop the app from opening.
            match db::queries::trash::sweep_expired(&conn) {
                Ok(n) if n > 0 => println!("[trash] purged {n} item(s) older than {} days", db::queries::trash::RETENTION_DAYS),
                Ok(_) => {}
                Err(e) => eprintln!("[trash] sweep failed: {e:#}"),
            }
            app.manage(DbState(Mutex::new(conn)));
            app.manage(AppDataDir(app_data_dir));
            // The tokens the file dialogs hand back in place of paths, so no
            // path the page could name ever reaches a command.
            app.manage(commands::file_picker::PickedPaths::default());

            // A reader's imported Bibles live in content.db, which an
            // upgrade has just replaced if this is the first launch after
            // one. Off the main thread: it takes the database lock only
            // when there is something to bring back.
            let rescan = app.handle().clone();
            std::thread::spawn(move || {
                commands::library::rescan_imports_after_upgrade(&rescan, &content_db_path);
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ready_to_close,
            commands::file_picker::pick_save_path,
            commands::file_picker::pick_open_path,
            commands::file_picker::pick_folder,
            commands::library::list_books,
            commands::library::list_book_aliases,
            commands::library::list_translations,
            commands::library::list_commentary_sources,
            commands::library::get_translation_coverage,
            commands::library::remove_translation,
            commands::library::remove_commentary_source,
            commands::library::scan_library,
            commands::library::add_file,
            commands::pack::pack_status,
            commands::pack::install_pack,
            commands::pack::remove_pack,
            commands::reading::get_chapter,
            commands::reading::get_passages,
            commands::reading::get_parallel_chapter,
            commands::reading::compare_verse,
            commands::reading::get_commentary_for_passage,
            commands::reading::book_has_commentary,
            commands::reading::get_commentary_toc,
            commands::reading::get_section_entries,
            commands::reading::get_reading_position,
            commands::reading::set_reading_position,
            commands::reading::list_reading_log,
            commands::annotations::list_highlights,
            commands::annotations::list_all_highlights,
            commands::annotations::create_highlight,
            commands::annotations::update_highlight,
            commands::annotations::delete_highlight,
            commands::annotations::list_notes_for_chapter,
            commands::annotations::list_all_notes,
            commands::annotations::create_note,
            commands::annotations::update_note,
            commands::annotations::delete_note,
            commands::annotations::list_bookmarks,
            commands::annotations::create_bookmark,
            commands::annotations::delete_bookmark,
            commands::annotations::list_chapter_notes,
            commands::annotations::list_all_chapter_notes,
            commands::annotations::create_chapter_note,
            commands::annotations::update_chapter_note,
            commands::annotations::delete_chapter_note,
            commands::annotations::add_note_tag,
            commands::annotations::remove_note_tag,
            commands::annotations::list_all_note_tags,
            commands::annotations::list_all_note_tags_by_note,
            commands::annotations::add_chapter_note_tag,
            commands::annotations::remove_chapter_note_tag,
            commands::annotations::list_all_chapter_note_tags,
            commands::annotations::list_all_chapter_note_tags_by_note,
            commands::annotations::set_note_refs,
            commands::annotations::list_backlinks,
            commands::annotations::list_trash,
            commands::annotations::restore_trash_item,
            commands::annotations::purge_trash_item,
            commands::prayer_journal::list_prayer_entries,
            commands::prayer_journal::create_prayer_entry,
            commands::prayer_journal::update_prayer_entry,
            commands::prayer_journal::delete_prayer_entry,
            commands::prayer_journal::search_prayer_entries,
            commands::prayer_journal::add_prayer_entry_tag,
            commands::prayer_journal::remove_prayer_entry_tag,
            commands::prayer_journal::list_all_prayer_entry_tags,
            commands::prayer_journal::list_all_prayer_entry_tags_by_entry,
            commands::prayer_list::list_prayer_list_people,
            commands::prayer_list::create_prayer_list_person,
            commands::prayer_list::update_prayer_list_person,
            commands::prayer_list::set_prayer_list_person_active,
            commands::prayer_list::mark_prayer_list_person_prayed,
            commands::prayer_list::mark_prayer_list_person_answered,
            commands::prayer_list::delete_prayer_list_person,
            commands::scripture_memory::list_memory_verses,
            commands::scripture_memory::list_due_memory_verses,
            commands::scripture_memory::create_memory_verse,
            commands::scripture_memory::set_memory_verse_mode,
            commands::scripture_memory::set_memory_verse_translation,
            commands::scripture_memory::delete_memory_verse,
            commands::scripture_memory::review_memory_verse,
            commands::scripture_memory::set_memory_verse_doctrinal_link,
            commands::catechism_memory::list_catechism_memory,
            commands::catechism_memory::list_due_catechism_memory,
            commands::catechism_memory::create_catechism_memory,
            commands::catechism_memory::set_catechism_memory_mode,
            commands::catechism_memory::delete_catechism_memory,
            commands::catechism_memory::review_catechism_memory,
            commands::reading_plans::list_reading_plans,
            commands::reading_plans::get_reading_plan_days,
            commands::reading_plans::list_reading_plan_progress,
            commands::reading_plans::get_reading_plan_progress,
            commands::reading_plans::start_reading_plan,
            commands::reading_plans::abandon_reading_plan,
            commands::reading_plans::mark_reading_plan_day,
            commands::reading_plans::unmark_reading_plan_day,
            commands::reading_plans::shift_reading_plan_start,
            commands::reading_plans::set_reading_plan_days,
            commands::reading_plans::create_user_reading_plan,
            commands::reading_plans::update_user_reading_plan,
            commands::reading_plans::delete_user_reading_plan,
            commands::reading_plans::reanchor_reading_plan,
            commands::reading_plans::spread_reading_plan,
            commands::reading_plans::set_reading_plan_schedule,
            commands::harmony::list_harmonies,
            commands::harmony::get_harmony,
            commands::red_letter::get_red_letter_ranges,
            commands::search::search,
            commands::search::record_search_query,
            commands::search::list_recent_searches,
            commands::search::list_saved_searches,
            commands::search::set_search_saved,
            commands::search::delete_search_history,
            commands::study::get_cross_references,
            commands::study::get_metrical_psalm,
            commands::study::list_psalm_tunes,
            commands::study::list_westminster_documents,
            commands::study::list_westminster_sections,
            commands::study::get_westminster_section,
            commands::study::get_confession_for_passage,
            commands::study::search_westminster,
            commands::study::list_westminster_commentary_sources,
            commands::study::get_westminster_commentary,
            commands::study::list_doctrine_topics,
            commands::study::get_doctrine_topic,
            commands::reference::get_strongs_entry,
            commands::reference::get_concordance,
            commands::reference::get_strongs_entries,
            commands::reference::search_strongs,
            commands::reference::list_dictionary_index,
            commands::reference::get_dictionary_entry,
            commands::reference::find_dictionary_entry_by_term,
            commands::reference::search_dictionary,
            commands::reference::list_isbe_index,
            commands::reference::list_pronunciations,
            commands::tts::kokoro_available,
            commands::tts::kokoro_can_say,
            commands::tts::kokoro_voices,
            commands::tts::kokoro_synthesize,
            commands::reference::get_isbe_entry,
            commands::reference::find_isbe_entry_by_term,
            commands::reference::find_dictionary_entry_for_isbe,
            commands::reference::search_isbe,
            commands::reference::search_isbe_global,
            commands::reference::isbe_for_passage,
            commands::reference::list_atlas_places,
            commands::reference::get_atlas_place,
            commands::reference::get_atlas_place_verses,
            commands::reference::places_in_passage,
            commands::reference::search_atlas_places,
            commands::reference::list_atlas_journeys,
            commands::reference::get_interlinear_for_chapter,
            commands::reference::get_morphology_for_chapter,
            commands::reference::get_footnotes_for_chapter,
            commands::resources::list_resources,
            commands::resources::get_resource,
            commands::resources::get_resource_text,
            commands::resources::add_resource,
            commands::resources::bulk_import_resources,
            commands::resources::reextract_resource,
            commands::resources::update_resource,
            commands::resources::set_author_for_resources,
            commands::resources::delete_resource,
            commands::resources::search_resources,
            commands::resources::list_resource_passage_links_for_chapter,
            commands::resources::list_resource_passage_links_for_resource,
            commands::resources::create_resource_passage_link,
            commands::resources::delete_resource_passage_link,
            commands::resources::list_resource_links,
            commands::resources::create_resource_link,
            commands::resources::delete_resource_link,
            commands::resources::add_resource_tag,
            commands::resources::remove_resource_tag,
            commands::resources::list_all_resource_tags,
            commands::resources::list_all_resource_tags_by_resource,
            commands::resources::list_resources_by_tag,
            commands::resources::suggest_resources_for_passage,
            commands::resources::suggest_resources_for_topic,
            commands::backup::create_backup,
            commands::backup::list_backups,
            commands::backup::export_database,
            commands::backup::stage_import,
            commands::backup::stage_restore,
            commands::backup::quick_check,
            commands::backup::get_backup_sync_folder,
            commands::backup::set_backup_sync_folder,
            commands::settings::get_setting,
            commands::settings::set_setting,
            commands::settings::delete_setting,
            commands::settings::list_settings,
            commands::diagnostics::log_frontend_error,
            commands::diagnostics::get_logs_dir,
            commands::diagnostics::get_stats,
            commands::diagnostics::get_system_accent,
            commands::sermons::list_sermons,
            commands::sermons::get_sermon,
            commands::sermons::create_sermon,
            commands::sermons::update_sermon,
            commands::sermons::set_sermon_stage,
            commands::sermons::delete_sermon,
            commands::sermons::duplicate_sermon,
            commands::sermons::list_all_sermon_tags,
            commands::sermons::search_sermons,
            commands::sermons::list_sermons_for_chapter,
            commands::sermons::add_sermon_event,
            commands::sermons::delete_sermon_event,
            commands::sermons::list_sermon_events,
            commands::sermons::get_speaking_rate,
            commands::sermons::list_sermon_series,
            commands::sermons::create_sermon_series,
            commands::sermons::update_sermon_series,
            commands::sermons::delete_sermon_series,
            commands::sermons::list_illustrations,
            commands::sermons::get_illustration,
            commands::sermons::create_illustration,
            commands::sermons::update_illustration,
            commands::sermons::delete_illustration,
            commands::sermons::list_all_illustration_tags,
            commands::sermons::record_illustration_use,
            commands::sermons::list_illustration_uses,
            commands::sermons::export_sermon,
            commands::sermons::export_sermon_slides,
            commands::export::export_note,
            commands::export::export_chapter_note,
            commands::export::export_prayer_entry,
            commands::update::check_for_update,
            commands::update::app_version,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
