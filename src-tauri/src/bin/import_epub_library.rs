// One-off tool: bulk-imports a personal epub library (organized as
// Category/Author/Book.epub) into this app's live user.db as Resources.
// Not part of the shipped app -- it's the same `resources::import_folder`
// the in-app "Import Folder..." button uses, just invoked directly against
// a specific machine's real app-data directory instead of through a running
// Tauri window, and with a curated exclude list for content this library
// duplicates elsewhere in the app or that turned out to be unusable.
//
// Run with: cargo run --release --bin import_epub_library -- <app_data_dir> <content_db_path> <source_folder>
use std::path::PathBuf;
use tauri_app_lib::{backup, db, resources};

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 4 {
        eprintln!("usage: import_epub_library <app_data_dir> <content_db_path> <source_folder>");
        std::process::exit(1);
    }
    let app_data_dir = PathBuf::from(&args[1]);
    let content_db_path = PathBuf::from(&args[2]);
    let source_folder = PathBuf::from(&args[3]);

    backup::apply_pending_import(&app_data_dir)?;
    let conn = db::open(&app_data_dir, &content_db_path)?;
    let resources_dir = app_data_dir.join("resources");
    std::fs::create_dir_all(&resources_dir)?;

    // Static exclusions: whole subtrees or specific files that duplicate
    // content already in the app through a proper, structured path, or that
    // turned out (on inspection) to be raw, largely-illegible Internet
    // Archive OCR scans rather than a clean transcription.
    let mut excludes: Vec<String> = vec![
        // Alternate Bible translations -- this app already has these (and
        // more) as first-class translations in the Reading view; adding
        // them again as generic epub Resources would just be confusing
        // clutter alongside the real thing.
        "bibles".to_string(),
        // The Westminster Standards themselves (already imported as
        // structured, cross-referenced documents) and their commentaries
        // (Hodge/Shaw/Vincent -- deep-integrated into the Confessions view
        // directly, not as standalone Resources).
        "westminster standards/westminster confession of faith.epub".to_string(),
        "westminster standards/westminster larger catechism.epub".to_string(),
        "westminster standards/westminster shorter catechism.epub".to_string(),
        "westminster standards/commentaries".to_string(),
        // Duplicates an already-bundled commentary (ThML source).
        "puritan-adjacent/matthew henry".to_string(),
        // Raw, largely-illegible Internet Archive OCR scans (each epub
        // carries IA's own "estimated to be only N% accurate" notice) --
        // not worth adding in a state that's barely readable.
        "puritans/john bradford".to_string(),
        "reformed heritage/thomas chalmers".to_string(),
        "reformed heritage/william cowper/complete poetical works.epub".to_string(),
    ];

    // Calvin's own Bible commentaries and Harmony of the Law duplicate the
    // already-bundled ThML commentary set -- everything else in his folder
    // (Institutes, sermons, etc.) is fine to import. Computed rather than
    // hand-listed since there are 40+ of them.
    let calvin_dir = source_folder.join("Reformers").join("John Calvin");
    if let Ok(entries) = std::fs::read_dir(&calvin_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_lowercase();
            if name.starts_with("commentary on") || name.starts_with("harmony of the law") {
                excludes.push(format!("reformers/john calvin/{name}"));
            }
        }
    }

    let exclude_refs: Vec<&str> = excludes.iter().map(String::as_str).collect();
    let outcome = resources::import_folder(&conn, &resources_dir, &source_folder, &exclude_refs)?;

    println!("Imported: {}", outcome.imported.len());
    println!("Skipped (already in library): {}", outcome.skipped_duplicate.len());
    println!("Skipped (excluded): {}", outcome.skipped_excluded.len());
    println!("Skipped (unrecognized file type): {}", outcome.skipped_unrecognized.len());
    println!("Errors: {}", outcome.errors.len());
    for e in &outcome.errors {
        println!("  ERROR: {e}");
    }
    for f in &outcome.skipped_unrecognized {
        println!("  unrecognized: {f}");
    }

    Ok(())
}
