// Build-time content.db generator.
//
// Produces the finished, read-mostly content.db (translations, commentaries,
// lexicon, cross-references, Westminster, dictionary) from the Zefania/ThML/
// reference source files checked into the repo, so the app can ship the
// finished database instead of running the import pipeline on first launch.
//
// Usage (from src-tauri/): cargo run --release --features tools --bin build_content_db
// Or via npm (from repo root): npm run build:content
//
// This is wired into `beforeBuildCommand` in tauri.conf.json, so `npm run
// tauri build` always produces a fresh content.db before bundling it as a
// resource. It's safe to re-run any time: it always builds into a fresh file.

use std::path::PathBuf;
use tauri_app_lib::{db, import};

fn main() -> anyhow::Result<()> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let repo_root = manifest_dir.parent().expect("src-tauri has a parent directory").to_path_buf();

    // `--update` builds onto the existing file instead of starting fresh:
    // migrations run, and every importer that finds its tables already
    // filled (or its source unchanged) skips itself, so only what is new is
    // imported. A development convenience -- a release always builds clean.
    let args: Vec<String> = std::env::args().skip(1).collect();
    let update = args.iter().any(|a| a == "--update");
    let out_path = args
        .iter()
        .find(|a| !a.starts_with("--"))
        .map(PathBuf::from)
        .unwrap_or_else(|| repo_root.join("content").join("content.db"));

    if out_path.exists() && !update {
        std::fs::remove_file(&out_path)?;
        let wal = out_path.with_extension("db-wal");
        let shm = out_path.with_extension("db-shm");
        let _ = std::fs::remove_file(wal);
        let _ = std::fs::remove_file(shm);
    }

    println!("building content.db at {}", out_path.display());
    let mut conn = db::open_content_db(&out_path)?;

    let bibles_dir = repo_root.join("bibles");
    let commentaries_dir = repo_root.join("commentaries");
    let reference_dir = repo_root.join("reference");

    let results = import::populate_content_db(&mut conn, &bibles_dir, &commentaries_dir, &reference_dir)?;

    let mut failed = 0;
    for r in &results {
        println!("  [{}] {} ({}): {}", r.status, r.path, r.format, r.detail.as_deref().unwrap_or(""));
        if r.status == "Failed" || r.status == "Unrecognized" {
            failed += 1;
        }
    }

    // The shipped books are not here any more. They are built separately, by
    // `build_library_pack`, into a resource pack the reader installs -- which
    // is what takes a third of a gigabyte back out of this file. See
    // `crate::pack`.

    let translation_count: i64 = conn.query_row("SELECT COUNT(*) FROM translations", [], |r| r.get(0))?;
    let commentary_count: i64 = conn.query_row("SELECT COUNT(*) FROM commentary_sources", [], |r| r.get(0))?;
    let strongs_count: i64 = conn.query_row("SELECT COUNT(*) FROM strongs_entries", [], |r| r.get(0))?;
    // `reference::import_all`'s own report is discarded by populate_content_db,
    // so the counts are read back here: a reference importer that quietly did
    // nothing would otherwise leave no trace in this log.
    let isbe_count: i64 = conn.query_row("SELECT COUNT(*) FROM isbe_entries", [], |r| r.get(0))?;
    let place_count: i64 = conn.query_row("SELECT COUNT(*) FROM atlas_places", [], |r| r.get(0))?;
    let journey_count: i64 = conn.query_row("SELECT COUNT(*) FROM atlas_journeys", [], |r| r.get(0))?;
    let pronunciation_count: i64 = conn.query_row("SELECT COUNT(*) FROM pronunciations", [], |r| r.get(0))?;
    println!(
        "done: {translation_count} translation(s), {commentary_count} commentary source(s), {strongs_count} strongs entries, {failed} failure(s)"
    );
    println!("  encyclopedia: {isbe_count} article(s); atlas: {place_count} place(s), {journey_count} journey(s)");
    println!("  pronunciations: {pronunciation_count} word(s)");

    if failed > 0 {
        anyhow::bail!("{failed} source file(s) failed to import -- see log above");
    }

    Ok(())
}
