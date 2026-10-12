// The web build's copy of content.db: the same content, laid out to be read
// a page at a time over HTTP (see docs/pwa-plan.md, phase 0's notes).
//
// From the finished content.db (`npm run build:content`) it writes, into
// content/web/:
//   content.db     brought up to date, id runs stamped (search needs them on
//                  the web), out of WAL mode, every full-text index merged to
//                  one segment, 32 KB pages, vacuumed
//   skeleton.bin   every interior b-tree page and the schema, in page order:
//                  fetched in one request when the app starts, after which a
//                  lookup costs only its leaf pages
//   skeleton.json  the page numbers in skeleton.bin
//
// Usage (from the repo root): npm run build:content:web [-- <content.db> <out dir>]

use rusqlite::Connection;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::PathBuf;
use tauri_app_lib::db;

/// Measured in phase 0 against 16 and 64 KB: 16 KB takes ~40% more
/// requests; 64 KB fetches twice the bytes for the same lookups.
const PAGE_SIZE: i64 = 32768;

fn main() -> anyhow::Result<()> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let repo_root = manifest_dir.parent().expect("src-tauri has a parent directory").to_path_buf();
    let args: Vec<String> = std::env::args().skip(1).collect();
    let source = args.first().map(PathBuf::from).unwrap_or_else(|| repo_root.join("content").join("content.db"));
    let out_dir = args.get(1).map(PathBuf::from).unwrap_or_else(|| repo_root.join("content").join("web"));
    anyhow::ensure!(db::is_populated_content_db(&source), "no content at {} (run `npm run build:content` first)", source.display());

    std::fs::create_dir_all(&out_dir)?;
    let out = out_dir.join("content.db");
    for f in ["content.db", "content.db-wal", "content.db-shm", "content.db-journal", "skeleton.bin", "skeleton.json"] {
        let _ = std::fs::remove_file(out_dir.join(f));
    }
    // Through SQLite rather than a file copy: content.db may be in WAL mode
    // with pages still in its -wal file, which a copy would leave behind.
    println!("copying {}", source.display());
    Connection::open_with_flags(&source, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)?
        .execute("VACUUM INTO ?1", [out.to_string_lossy().to_string()])?;

    // Migrations first, as `db::open_content_db` runs them for the build.
    let conn = db::open_content_db(&out)?;
    db::queries::id_ranges::stamp(&conn)?;
    let unranged: Vec<String> = conn
        .prepare(
            "SELECT 'translation ' || code FROM translations t WHERE NOT EXISTS (SELECT 1 FROM verse_id_ranges r WHERE r.translation_id = t.id)
             UNION ALL
             SELECT 'commentary ' || code FROM commentary_sources s WHERE NOT EXISTS (SELECT 1 FROM commentary_id_ranges r WHERE r.source_id = s.id)",
        )?
        .query_map([], |r| r.get(0))?
        .collect::<Result<_, _>>()?;
    anyhow::ensure!(unranged.is_empty(), "no id runs for {} -- its search would read every hit's row", unranged.join(", "));

    // One segment per index: a term's doclist is then one run of pages
    // rather than one per segment.
    let fts: Vec<String> = conn
        .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND sql LIKE 'CREATE VIRTUAL TABLE%USING fts5%'")?
        .query_map([], |r| r.get(0))?
        .collect::<Result<_, _>>()?;
    for table in &fts {
        println!("optimizing {table}");
        conn.execute(&format!("INSERT INTO {table}({table}) VALUES('optimize')"), [])?;
    }

    // Out of WAL mode, which the HTTP reader cannot follow (it would need
    // the -wal and -shm files), then the new page size, which only VACUUM
    // applies.
    conn.pragma_update(None, "journal_mode", "DELETE")?;
    conn.pragma_update(None, "page_size", PAGE_SIZE)?;
    println!("vacuuming");
    conn.execute_batch("VACUUM")?;
    let page_size: i64 = conn.query_row("PRAGMA page_size", [], |r| r.get(0))?;
    anyhow::ensure!(page_size == PAGE_SIZE, "page size is {page_size}, not {PAGE_SIZE}");
    let mode: String = conn.query_row("PRAGMA journal_mode", [], |r| r.get(0))?;
    anyhow::ensure!(mode == "delete", "journal mode is {mode}");

    let pages = skeleton_pages(&conn)?;
    drop(conn);

    let mut file = std::fs::File::open(&out)?;
    let mut skeleton = std::fs::File::create(out_dir.join("skeleton.bin"))?;
    let mut page = vec![0u8; PAGE_SIZE as usize];
    for &p in &pages {
        file.seek(SeekFrom::Start((p as u64 - 1) * PAGE_SIZE as u64))?;
        file.read_exact(&mut page)?;
        skeleton.write_all(&page)?;
    }
    std::fs::write(out_dir.join("skeleton.json"), serde_json::to_string(&pages)?)?;

    let size = std::fs::metadata(&out)?.len();
    println!(
        "wrote {}: {:.0} MB in {} pages; skeleton {} pages, {:.1} MB",
        out_dir.display(),
        size as f64 / 1e6,
        size / PAGE_SIZE as u64,
        pages.len(),
        (pages.len() as i64 * PAGE_SIZE) as f64 / 1e6
    );
    Ok(())
}

/// Every interior b-tree page and every page of the schema, in order.
fn skeleton_pages(conn: &Connection) -> anyhow::Result<Vec<i64>> {
    Ok(conn
        .prepare(
            "SELECT DISTINCT pageno FROM dbstat
             WHERE pagetype = 'internal' OR name IN ('sqlite_schema', 'sqlite_master')
             ORDER BY pageno",
        )?
        .query_map([], |r| r.get(0))?
        .collect::<Result<_, _>>()?)
}
