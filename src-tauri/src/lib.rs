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
            let mut conn = db::open(&app_data_dir).expect("failed to open database");

            let translation_count: i64 = conn
                .query_row("SELECT COUNT(*) FROM translations", [], |r| r.get(0))
                .unwrap_or(0);
            let commentary_count: i64 = conn
                .query_row("SELECT COUNT(*) FROM commentary_sources", [], |r| r.get(0))
                .unwrap_or(0);

            if translation_count == 0 || commentary_count == 0 {
                let roots = paths::default_import_roots(&handle);
                let files = import::discover_candidate_files(&roots);
                let results = import::scan_files(&mut conn, &files);
                for r in &results {
                    println!("[first-run import] {} ({}): {}", r.path, r.format, r.status);
                    if let Some(d) = &r.detail {
                        println!("    {d}");
                    }
                }
            }

            let reference_tables = [
                "strongs_entries",
                "dictionary_entries",
                "interlinear_words",
                "cross_references",
                "westminster_sections",
                "morphology_words",
                "footnotes",
                "westminster_commentary_entries",
            ];
            let needs_reference_import = reference_tables.iter().any(|t| {
                conn.query_row(&format!("SELECT COUNT(*) FROM {t}"), [], |r| r.get::<_, i64>(0))
                    .unwrap_or(0)
                    == 0
            });
            if needs_reference_import {
                if let Some(reference_dir) = paths::reference_dir(&handle) {
                    match import::reference::import_all(&mut conn, &reference_dir) {
                        Ok(report) => println!(
                            "[first-run import] reference data: {} strongs, {} dictionary, {} interlinear words, {} cross-refs, {} westminster sections, {} morphology words, {} footnotes, {} westminster commentary entries",
                            report.strongs_entries, report.dictionary_entries, report.interlinear_words,
                            report.cross_references, report.westminster_sections, report.morphology_words, report.footnotes,
                            report.westminster_commentary_entries
                        ),
                        Err(e) => eprintln!("[first-run import] reference data import failed: {e:#}"),
                    }
                }
            }

            app.manage(DbState(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::library::list_books,
            commands::library::list_translations,
            commands::library::list_commentary_sources,
            commands::library::remove_translation,
            commands::library::remove_commentary_source,
            commands::library::scan_library,
            commands::library::add_file,
            commands::reading::get_chapter,
            commands::reading::get_parallel_chapter,
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
            commands::search::search,
            commands::study::get_cross_references,
            commands::study::list_westminster_documents,
            commands::study::list_westminster_sections,
            commands::study::get_westminster_section,
            commands::study::search_westminster,
            commands::study::list_westminster_commentary_sources,
            commands::study::get_westminster_commentary,
            commands::reference::get_strongs_entry,
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
