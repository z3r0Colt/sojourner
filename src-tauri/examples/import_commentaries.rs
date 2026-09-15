// Headless commentary import runner, for iterating on ThML import logic without
// going through the Tauri GUI. Scans a given directory for XML files and
// imports them into the real app-data database.
//
// Usage: cargo run --example import_commentaries -- <dir> [<dir> ...]

use std::path::PathBuf;
use tauri_app_lib::{db, import};

fn main() -> anyhow::Result<()> {
    let dirs: Vec<PathBuf> = std::env::args().skip(1).map(PathBuf::from).collect();
    let dirs = if dirs.is_empty() {
        vec![PathBuf::from("../commentaries")]
    } else {
        dirs
    };

    let app_data_dir = PathBuf::from(std::env::var("APPDATA").unwrap()).join("com.sojourner.study");
    let content_db_path = app_data_dir.join("content.db");
    if !content_db_path.exists() {
        db::open_content_db(&content_db_path)?;
    }
    let mut conn = db::open(&app_data_dir, &content_db_path)?;

    let files = import::discover_candidate_files(&dirs);
    println!("found {} candidate file(s)", files.len());
    let results = import::scan_files(&mut conn, &files);
    for r in &results {
        println!("{} [{}] {}: {}", r.path, r.format, r.status, r.detail.as_deref().unwrap_or(""));
    }
    Ok(())
}
