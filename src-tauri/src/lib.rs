mod commands;
pub mod db;
mod error;
pub mod import;
pub mod models;
pub mod paths;
mod resources;

use db::DbState;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
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

            let conn = db::open(&app_data_dir, &content_db_path).expect("failed to open database");
            app.manage(DbState(Mutex::new(conn)));
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
            commands::reading::get_parallel_chapter,
            commands::reading::compare_verse,
            commands::reading::get_commentary_for_passage,
            commands::reading::book_has_commentary,
            commands::reading::get_commentary_toc,
            commands::reading::get_section_entries,
            commands::reading::get_reading_position,
            commands::reading::set_reading_position,
            commands::annotations::list_highlights,
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
            commands::sermon_notes::list_sermon_notes,
            commands::sermon_notes::get_sermon_note,
            commands::sermon_notes::create_sermon_note,
            commands::sermon_notes::update_sermon_note,
            commands::sermon_notes::delete_sermon_note,
            commands::sermon_notes::add_sermon_note_passage,
            commands::sermon_notes::delete_sermon_note_passage,
            commands::sermon_notes::search_sermon_notes,
            commands::search::search,
            commands::study::get_cross_references,
            commands::study::get_metrical_psalm,
            commands::study::list_westminster_documents,
            commands::study::list_westminster_sections,
            commands::study::get_westminster_section,
            commands::study::search_westminster,
            commands::study::list_westminster_commentary_sources,
            commands::study::get_westminster_commentary,
            commands::reference::get_strongs_entry,
            commands::reference::get_concordance,
            commands::reference::get_strongs_entries,
            commands::reference::search_strongs,
            commands::reference::list_dictionary_index,
            commands::reference::get_dictionary_entry,
            commands::reference::search_dictionary,
            commands::reference::get_interlinear_for_chapter,
            commands::reference::get_morphology_for_chapter,
            commands::reference::get_footnotes_for_chapter,
            commands::resources::list_resources,
            commands::resources::get_resource,
            commands::resources::get_resource_text,
            commands::resources::add_resource,
            commands::resources::delete_resource,
            commands::resources::search_resources,
            commands::resources::list_resource_passage_links_for_chapter,
            commands::resources::list_resource_passage_links_for_resource,
            commands::resources::create_resource_passage_link,
            commands::resources::delete_resource_passage_link,
            commands::resources::list_resource_links,
            commands::resources::create_resource_link,
            commands::resources::delete_resource_link,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
