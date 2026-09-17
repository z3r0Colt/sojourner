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
//   cargo run --release --bin build_library_pack [-- <out_path>]
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
    let out_path = std::env::args()
        .nth(1)
        .map(PathBuf::from)
        .unwrap_or_else(|| repo_root.join(PACKS_DIR).join(format!("Sojourner-Library-{version}.sjpack")));

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
        let n = library::import(&conn, &library_dir)?;
        // FTS5 keeps its index in shadow tables that grow segment by segment
        // as rows arrive. One merge at the end leaves a smaller file and a
        // faster search than several hundred incremental ones.
        conn.execute("INSERT INTO library_fts(library_fts) VALUES('optimize')", [])?;
        conn.execute_batch("VACUUM")?;
        n
    };
    anyhow::ensure!(book_count > 0, "no books were imported -- is library/manifest.json empty?");
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
            id: "library".into(),
            name: "Sojourner Library".into(),
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
