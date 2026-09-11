pub mod backup;
mod commands;
pub mod crash_log;
pub mod db;
mod error;
pub mod export;
pub mod import;
pub mod models;
pub mod paths;
pub mod resources;

use db::DbState;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

/// The resolved app-data directory, managed as Tauri state so backup/export/
/// import commands can find `user.db`, its `backups/` folder, and the
/// pending-import marker without re-deriving the path (and without needing
/// their own `AppHandle` plumbing just for that).
pub struct AppDataDir(pub PathBuf);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
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
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::library::list_books,
            commands::library::list_book_aliases,
            commands::library::list_translations,
            commands::library::list_commentary_sources,
            commands::library::get_translation_coverage,
            commands::library::remove_translation,
            commands::library::remove_commentary_source,
            commands::library::scan_library,
            commands::library::add_file,
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
            commands::harmony::list_harmony_sections,
            commands::red_letter::get_red_letter_ranges,
            commands::search::search,
            commands::search::record_search_query,
            commands::search::list_recent_searches,
            commands::search::list_saved_searches,
            commands::search::set_search_saved,
            commands::search::delete_search_history,
            commands::study::get_cross_references,
            commands::study::get_metrical_psalm,
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
            commands::reference::get_interlinear_for_chapter,
            commands::reference::get_morphology_for_chapter,
            commands::reference::get_footnotes_for_chapter,
            commands::resources::list_resources,
            commands::resources::get_resource,
            commands::resources::get_resource_text,
            commands::resources::add_resource,
            commands::resources::bulk_import_resources,
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
            commands::export::export_note,
            commands::export::export_chapter_note,
            commands::export::export_prayer_entry,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
