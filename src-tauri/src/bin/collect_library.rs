// Takes whatever is in a reader's own resource library and adds it to the
// set of books that ship with the app.
//
// The workflow it serves: add books through the app as usual ("Add
// resource…", or "Import folder…"), then run this before a release build.
// Everything new is copied into the repo's `library/` folder and recorded in
// `library/manifest.json` with the title and author the app already knows for
// it; `build_content_db` then extracts the text of each one into content.db,
// and the bundler ships both.
//
// Books already in library/ are left alone: the shipped set is deliberate, so
// removing one means deleting its file and its manifest entry by hand.
//
// Usage (from src-tauri/):
//   cargo run --release --bin collect_library [-- <source_dir> <user_db>]
// Or via npm (from the repo root):
//   npm run library:collect
//
// With no arguments it reads this machine's own library:
//   %APPDATA%\com.shadesinc.biblestudy\{resources,user.db}

use rusqlite::Connection;
use std::path::PathBuf;
use tauri_app_lib::library;

fn app_data_dir() -> Option<PathBuf> {
    std::env::var_os("APPDATA").map(|d| PathBuf::from(d).join("com.shadesinc.biblestudy"))
}

fn main() -> anyhow::Result<()> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let repo_root = manifest_dir.parent().expect("src-tauri has a parent directory").to_path_buf();
    let library_dir = repo_root.join(library::LIBRARY_DIR);

    let mut args = std::env::args().skip(1);
    let source_dir = args
        .next()
        .map(PathBuf::from)
        .or_else(|| app_data_dir().map(|d| d.join("resources")))
        .ok_or_else(|| anyhow::anyhow!("no source folder given and APPDATA is not set"))?;
    let user_db = args
        .next()
        .map(PathBuf::from)
        .or_else(|| app_data_dir().map(|d| d.join("user.db")));

    if !source_dir.is_dir() {
        anyhow::bail!("{} is not a folder", source_dir.display());
    }

    // The reader's own catalogue, for the titles and authors already curated
    // there. Opened read-only: this tool never writes to a live database, and
    // the app may well be running.
    let catalogue = match user_db.as_deref().filter(|p| p.is_file()) {
        Some(path) => {
            match Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY) {
                Ok(conn) => Some(conn),
                Err(e) => {
                    eprintln!("[library] could not read {}: {e} -- titles will come from file names", path.display());
                    None
                }
            }
        }
        None => None,
    };

    println!("collecting from {}", source_dir.display());
    println!("          into {}", library_dir.display());
    let outcome = library::collect(&source_dir, &library_dir, catalogue.as_ref())?;

    for name in &outcome.added {
        println!("  + {name}");
    }
    println!(
        "collected: {} added, {} already there, {} book(s) in the shipped library",
        outcome.added.len(),
        outcome.already_there,
        outcome.total
    );

    // Extract into the content.db that is already built, rather than making
    // anyone rebuild the Bibles and commentaries to add a book. A package
    // build gets there its own way: `build_content_db` runs the same import
    // against the file it builds from scratch.
    let content_db = repo_root.join("content").join("content.db");
    if content_db.is_file() {
        println!("extracting text into {} ...", content_db.display());
        let conn = tauri_app_lib::db::open_content_db(&content_db)?;
        let imported = library::import(&conn, &library_dir)?;
        println!("done: {imported} book(s) searchable in content.db");
    } else {
        println!("no content.db yet -- `npm run build:content` will extract them");
    }
    Ok(())
}
