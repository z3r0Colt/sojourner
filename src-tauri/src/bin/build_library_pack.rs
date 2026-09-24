// Build-time resource pack generator.
//
// Produces the finished `Sojourner-Library-<version>.sjpack` -- the books that
// used to ship inside the installer, with their text already extracted and
// their search index already written, so installing one costs a file copy
// rather than the twenty minutes of extraction that happen here.
//
// Reads the repo's `library/` folder and its `manifest.json`, which is the
// curated list of what ships (see `collect_library` for how books get added
// to it). Everything in the manifest whose file is present goes in.
//
// Usage (from src-tauri/):
//   cargo run --release --features tools --bin build_library_pack [-- <out_path>]
// Or via npm (from the repo root):
//   npm run build:pack
//
// Writes to `packs/` by default -- deliberately not `dist/`, which `vite
// build` empties on every frontend build and would take a finished pack with
// it. The version is taken from the app's own version unless one is given, so
// a pack and the build it shipped alongside carry the same number.

use std::path::PathBuf;
use tauri_app_lib::{db, library, pack};

/// Where built packs land, under the repo root.
const PACKS_DIR: &str = "packs";

fn main() -> anyhow::Result<()> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let repo_root = manifest_dir.parent().expect("src-tauri has a parent directory").to_path_buf();
    let library_dir = repo_root.join(library::LIBRARY_DIR);

    anyhow::ensure!(
        library_dir.is_dir(),
        "no library at {} -- there is nothing to build a pack from",
        library_dir.display()
    );

    let version = std::env::var("SOJOURNER_PACK_VERSION").unwrap_or_else(|_| env!("CARGO_PKG_VERSION").to_string());
    // `--shelf <id>` builds one shelf's pack from `library/shelves/<id>.json`;
    // without it, the Puritan and Reformed shelf from `library/manifest.json`,
    // which keeps the pack id `library` so an installed pack upgrades in place.
    let args: Vec<String> = std::env::args().skip(1).collect();
    let shelf_id = args.iter().position(|a| a == "--shelf").and_then(|i| args.get(i + 1)).cloned();
    let (pack_id, pack_name, entries) = match &shelf_id {
        Some(id) => {
            let shelf = library::read_shelf(&library_dir, id)?;
            let entries: Vec<library::LibraryEntry> = shelf.books.iter().map(|b| b.entry()).collect();
            (shelf.id, shelf.name, entries)
        }
        None => ("library".to_string(), "Sojourner Library".to_string(), library::read_manifest(&library_dir)?),
    };
    check_shelves_do_not_overlap(&library_dir)?;
    let file_stem = pack_name.replace(' ', "-").replace(['(', ')', ','], "");
    let out_path = args
        .iter()
        .enumerate()
        .find(|(i, a)| !a.starts_with("--") && (*i == 0 || args[i - 1] != "--shelf"))
        .map(|(_, a)| PathBuf::from(a))
        .unwrap_or_else(|| repo_root.join(PACKS_DIR).join(format!("{file_stem}-{version}.sjpack")));

    // Built fresh every time, in a scratch folder rather than over the top of
    // a previous build: a leftover library.db would be migrated and topped up
    // rather than rebuilt, and the pack would quietly carry books that are no
    // longer in the manifest.
    let work_dir = repo_root.join(PACKS_DIR).join(".build");
    let _ = std::fs::remove_dir_all(&work_dir);
    std::fs::create_dir_all(&work_dir)?;
    let db_path = work_dir.join(pack::LIBRARY_DB);

    println!("building the library pack");
    println!("     from {}", library_dir.display());
    println!("       to {}", out_path.display());

    println!("extracting text (this is the slow part) ...");
    let book_count = {
        let conn = db::open_library_db(&db_path)?;
        let n = library::import_entries(&conn, &library_dir, &entries)?;
        // FTS5 keeps its index in shadow tables that grow segment by segment
        // as rows arrive. One merge at the end leaves a smaller file and a
        // faster search than several hundred incremental ones.
        conn.execute("INSERT INTO library_fts(library_fts) VALUES('optimize')", [])?;
        conn.execute_batch("VACUUM")?;
        n
    };
    anyhow::ensure!(book_count > 0, "no books were imported -- is the shelf's list empty?");
    println!("  {book_count} book(s), {} MB of database", std::fs::metadata(&db_path)?.len() / 1_000_000);

    // Exactly the books the database has a row for, in the order the
    // manifest lists them -- not everything that happens to be in library/.
    let book_files: Vec<PathBuf> = {
        let conn = rusqlite::Connection::open(&db_path)?;
        let mut stmt = conn.prepare("SELECT file_name FROM library_resources ORDER BY file_name")?;
        let names = stmt.query_map([], |r| r.get::<_, String>(0))?;
        names
            .collect::<Result<Vec<_>, _>>()?
            .into_iter()
            .map(|name| library_dir.join(name))
            .collect()
    };

    println!("writing the pack ...");
    let bytes = pack::write_pack(
        &out_path,
        &db_path,
        &book_files,
        pack::PackManifest {
            format: pack::PACK_FORMAT,
            id: pack_id.clone(),
            name: pack_name.clone(),
            version: version.clone(),
            built_at: chrono::Utc::now().to_rfc3339(),
            library_schema: db::schema::LIBRARY_MIGRATIONS.len(),
            book_count,
            bytes: 0,
            files: Vec::new(),
        },
    )?;

    let _ = std::fs::remove_dir_all(&work_dir);
    println!("done: {} MB at {}", bytes / 1_000_000, out_path.display());
    Ok(())
}

/// Every book file on at most one shelf. The shelves share one folder and the
/// installed library keys a book by its file name, so a book on two shelves
/// would be one row claiming two packs, and removing either would take it.
fn check_shelves_do_not_overlap(library_dir: &std::path::Path) -> anyhow::Result<()> {
    let mut owner: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    for e in library::read_manifest(library_dir)? {
        owner.insert(e.file_name, "library".into());
    }
    let shelves_dir = library_dir.join("shelves");
    if let Ok(dir) = std::fs::read_dir(&shelves_dir) {
        for f in dir.flatten() {
            let Some(id) = f.path().file_stem().and_then(|s| s.to_str()).map(str::to_string) else { continue };
            if f.path().extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            for b in library::read_shelf(library_dir, &id)?.books {
                if let Some(prev) = owner.insert(b.file_name.clone(), id.clone()) {
                    anyhow::bail!("{} is on two shelves: {prev} and {id}", b.file_name);
                }
            }
        }
    }
    Ok(())
}
