// The web build's copy of content.db: the same content, laid out to be read
// a page at a time over HTTP (see docs/pwa-plan.md, phase 0's notes).
//
// From the finished content.db (`npm run build:content`) it writes, into
// content/web/:
//   content.db.000 ...  the database in 48 MiB pieces: brought up to date, id
//                  runs stamped (search needs them on the web), out of WAL
//                  mode, every full-text index merged to one segment, 32 KB
//                  pages, vacuumed. Pieces, because Cloudflare doesn't cache
//                  a file over 512 MB, and so a download can resume.
//   skeleton.bin   every interior b-tree page and the schema, in page order:
//                  fetched in one request when the app starts, after which a
//                  lookup costs only its leaf pages
//   manifest.json  what the app reads first: the content version (a hash of
//                  the database), schema, sizes, each piece's SHA-256, the
//                  skeleton's pages, and the hot segments (below)
//
// Upload them with `npm run upload:content:web` (tools/upload-web-content.mjs)
// to data.gentleking.org/content/<version>/.
//
// Usage (from the repo root): npm run build:content:web [-- <content.db> <out dir>]
//
// `--shelf <pack.sjpack> [<out base>]` lays a library shelf out the same way
// (docs/pwa-plan.md, phase 7): the pack's library.db as pieces + skeleton +
// manifest (with the shelf's name and its books' sizes and checksums), and its
// books as plain files, into <out base>/<shelf id>/<version>/ (default
// content/web-shelves/). `npm run upload:web-shelves` puts them on R2.

use rusqlite::Connection;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use tauri_app_lib::db;

/// Measured in phase 0 against 16 and 64 KB: 16 KB takes ~40% more
/// requests; 64 KB fetches twice the bytes for the same lookups.
const PAGE_SIZE: i64 = 32768;

/// 48 MiB, a whole number of pages, so no page straddles two pieces.
const CHUNK_SIZE: u64 = 48 << 20;

/// Tables a screen reads all or most of when it opens (the phase 2 harness
/// flagged each), or that search reads a row of per hit (the FTS `docsize`
/// tables, for bm25). A page of one of these, read over HTTP, brings its
/// whole segment along. Matched against each b-tree's table with LIKE.
const HOT_TABLES: &[&str] = &[
    "%\\_docsize",
    "timeline\\_%",
    "atlas\\_place%",
    "harmony\\_%",
    "doctrine\\_topic%",
    "lexicon\\_sources",
    "factbook\\_%",
];

/// Any b-tree this small is hot too: one request instead of up to this many.
const SMALL_BTREE_PAGES: i64 = 8;

/// A hot segment is at most this many pages (1 MB): a search in one
/// translation then fetches its part of the docsize table, not all 5 MB.
const SEGMENT_PAGES: i64 = 32;

/// Hot pages of one table this close together are fetched as one run: a
/// page or two too many costs less than another round trip.
const SEGMENT_GAP: i64 = 2;

fn main() -> anyhow::Result<()> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let repo_root = manifest_dir.parent().expect("src-tauri has a parent directory").to_path_buf();
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.first().map(String::as_str) == Some("--shelf") {
        let pack = args.get(1).map(PathBuf::from).ok_or_else(|| anyhow::anyhow!("--shelf needs a .sjpack"))?;
        let base = args.get(2).map(PathBuf::from).unwrap_or_else(|| repo_root.join("content").join("web-shelves"));
        return shelf(&pack, &base);
    }
    let source = args.first().map(PathBuf::from).unwrap_or_else(|| repo_root.join("content").join("content.db"));
    let out_dir = args.get(1).map(PathBuf::from).unwrap_or_else(|| repo_root.join("content").join("web"));
    anyhow::ensure!(db::is_populated_content_db(&source), "no content at {} (run `npm run build:content` first)", source.display());

    std::fs::create_dir_all(&out_dir)?;
    // Everything this tool writes, and nothing else.
    for entry in std::fs::read_dir(&out_dir)? {
        let name = entry?.file_name().to_string_lossy().to_string();
        if name.starts_with("content.db") || name.starts_with("skeleton.") || name == "manifest.json" {
            std::fs::remove_file(out_dir.join(&name))?;
        }
    }
    let out = out_dir.join("content.db");
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

    let manifest = lay_out(conn, &out, &out_dir, HOT_TABLES)?;
    summarize(&out_dir, &manifest);
    Ok(())
}

/// Everything after the database's own content is in place: one segment per
/// full-text index, out of WAL, 32 KB pages, the skeleton and hot segments,
/// and the pieces. Writes the pieces and skeleton.bin to `out_dir` (and
/// removes `out`), and returns the manifest, not yet written.
fn lay_out(conn: Connection, out: &Path, out_dir: &Path, hot_tables: &[&str]) -> anyhow::Result<serde_json::Value> {
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
    let schema: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;

    let skeleton = skeleton_pages(&conn)?;
    let hot = hot_segments(&conn, &skeleton, hot_tables)?;
    drop(conn);

    let mut file = std::fs::File::open(out)?;
    let size = file.metadata()?.len();
    let mut page = vec![0u8; PAGE_SIZE as usize];
    let mut skeleton_bin = Vec::with_capacity(skeleton.len() * PAGE_SIZE as usize);
    for &p in &skeleton {
        file.seek(SeekFrom::Start((p as u64 - 1) * PAGE_SIZE as u64))?;
        file.read_exact(&mut page)?;
        skeleton_bin.extend_from_slice(&page);
    }
    std::fs::write(out_dir.join("skeleton.bin"), &skeleton_bin)?;
    drop(file);

    println!("cutting into pieces");
    let (chunks, version) = write_chunks(out, out_dir)?;
    std::fs::remove_file(out)?;

    let manifest = json!({
        "format": 1,
        "version": version,
        "schema": schema,
        "size": size,
        "pageSize": PAGE_SIZE,
        "chunkSize": CHUNK_SIZE,
        "chunks": chunks,
        "skeleton": { "file": "skeleton.bin", "sha256": hex(&Sha256::digest(&skeleton_bin)), "pages": skeleton },
        "hot": hot,
    });
    Ok(manifest)
}

fn summarize(out_dir: &Path, manifest: &serde_json::Value) {
    std::fs::write(out_dir.join("manifest.json"), serde_json::to_string(manifest).unwrap()).unwrap();
    let hot = manifest["hot"].as_array().map_or(&[][..], |h| &h[..]);
    let hot_bytes: i64 = hot.iter().map(|r| (r[1].as_i64().unwrap() - r[0].as_i64().unwrap() + 1) * PAGE_SIZE).sum();
    println!(
        "wrote {}: version {}, schema {}, {:.0} MB in {} pieces; skeleton {} pages; {} hot segments ({:.1} MB)",
        out_dir.display(),
        manifest["version"].as_str().unwrap_or(""),
        manifest["schema"],
        manifest["size"].as_u64().unwrap_or(0) as f64 / 1e6,
        manifest["chunks"].as_array().map_or(0, |c| c.len()),
        manifest["skeleton"]["pages"].as_array().map_or(0, |p| p.len()),
        hot.len(),
        hot_bytes as f64 / 1e6
    );
}

/// Tables of a shelf's library.db that a screen reads a good part of at once:
/// the FTS `docsize` table, for bm25 on every hit.
const SHELF_HOT_TABLES: &[&str] = &["%\\_docsize"];

/// What a shelf's database needs, beyond the desktop's, to be read cheaply
/// over HTTP (the page map of the Puritan shelf: a chapter's citations were
/// 733 requests):
///   * `library_index`, the book names apart from their text (see
///     `db::shelf_names_table`): the catalogue, and the join every search
///     and citation makes to get a book's file name, read one small page
///     rather than a page of book text per book;
///   * `library_citations` rewritten in passage order, so the rows for one
///     chapter are neighbours in the file (they were in book order: a
///     chapter's 600 citations were on 400 different pages).
fn prepare_shelf(conn: &Connection) -> anyhow::Result<()> {
    println!("indexing book names and ordering citations by passage");
    conn.execute_batch(
        "CREATE TABLE library_index (
           id INTEGER PRIMARY KEY, file_name TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, author TEXT
         ) WITHOUT ROWID;
         INSERT INTO library_index SELECT id, file_name, kind, title, author FROM library_resources;

         CREATE TABLE library_citations_ordered (
           id           INTEGER PRIMARY KEY,
           resource_id  INTEGER NOT NULL REFERENCES library_resources(id) ON DELETE CASCADE,
           char_offset  INTEGER NOT NULL,
           label        TEXT NOT NULL,
           occurrence   INTEGER NOT NULL,
           context      TEXT NOT NULL,
           book_id      INTEGER NOT NULL,
           chapter      INTEGER NOT NULL,
           verse_start  INTEGER NOT NULL,
           verse_end    INTEGER NOT NULL
         );
         INSERT INTO library_citations_ordered (resource_id, char_offset, label, occurrence, context, book_id, chapter, verse_start, verse_end)
           SELECT resource_id, char_offset, label, occurrence, context, book_id, chapter, verse_start, verse_end
           FROM library_citations ORDER BY book_id, chapter, verse_start, resource_id, char_offset;
         DROP TABLE library_citations;
         ALTER TABLE library_citations_ordered RENAME TO library_citations;
         CREATE INDEX idx_library_citations_passage ON library_citations(book_id, chapter, verse_start);
         CREATE INDEX idx_library_citations_resource ON library_citations(resource_id);",
    )?;
    let books: i64 = conn.query_row("SELECT COUNT(*) FROM library_index", [], |r| r.get(0))?;
    let cites: i64 = conn.query_row("SELECT COUNT(*) FROM library_citations", [], |r| r.get(0))?;
    println!("  {books} books, {cites} citations");
    Ok(())
}

/// Lays one shelf's pack out for the web: see the header.
fn shelf(pack: &Path, base: &Path) -> anyhow::Result<()> {
    use tauri_app_lib::pack::PackManifest;

    let mut archive = zip::ZipArchive::new(std::fs::File::open(pack)?)?;
    let manifest: PackManifest = serde_json::from_reader(archive.by_name("pack.json")?)?;
    anyhow::ensure!(manifest.kind == "library", "{} is not a book shelf", pack.display());
    let building = base.join(&manifest.id).join("_building");
    let _ = std::fs::remove_dir_all(&building);
    std::fs::create_dir_all(building.join("books"))?;

    // Every member, checked against the pack's own checksums as it is written.
    let mut books = Vec::new();
    for member in &manifest.files {
        let dest = if member.path == "library.db" {
            building.join("library.db")
        } else if let Some(name) = member.path.strip_prefix("books/") {
            anyhow::ensure!(!name.contains(['/', '\\']) && name != "..", "unsafe book name {name}");
            building.join("books").join(name)
        } else {
            anyhow::bail!("unexpected member {} in {}", member.path, pack.display());
        };
        let mut entry = archive.by_name(&member.path)?;
        let mut out = std::fs::File::create(&dest)?;
        let mut hasher = Sha256::new();
        let mut buf = vec![0u8; 1 << 20];
        loop {
            let n = entry.read(&mut buf)?;
            if n == 0 {
                break;
            }
            hasher.update(&buf[..n]);
            out.write_all(&buf[..n])?;
        }
        anyhow::ensure!(hex(&hasher.finalize()) == member.sha256, "{} did not match its checksum", member.path);
        if let Some(name) = member.path.strip_prefix("books/") {
            books.push(json!({ "file": name, "bytes": member.bytes, "sha256": member.sha256 }));
        }
    }
    println!("{} {}: {} books unpacked", manifest.name, manifest.version, books.len());

    let db_path = building.join("library.db");
    let conn = db::open_library_db(&db_path)?;
    prepare_shelf(&conn)?;
    let mut web = lay_out(conn, &db_path, &building, SHELF_HOT_TABLES)?;

    // The folder's name is a version of the shelf as a whole: the database's
    // and every book's checksum, so a corrected book makes a new folder.
    let mut whole = Sha256::new();
    whole.update(web["version"].as_str().unwrap_or_default());
    for b in &books {
        whole.update(b["file"].as_str().unwrap_or_default());
        whole.update(b["sha256"].as_str().unwrap_or_default());
    }
    let version = hex(&whole.finalize())[..16].to_string();
    web["version"] = json!(version);
    web["shelf"] = json!({
        "id": manifest.id,
        // The first pack is "Sojourner Library"; on a shelf it is the Puritan and Reformed one.
        "name": if manifest.id == "library" { "Puritan and Reformed" } else { manifest.name.as_str() },
        "packVersion": manifest.version,
        "builtAt": manifest.built_at,
        "bookCount": manifest.book_count,
        "bookBytes": books.iter().map(|b| b["bytes"].as_u64().unwrap_or(0)).sum::<u64>(),
    });
    web["books"] = json!(books);

    let dest = base.join(&manifest.id).join(&version);
    let _ = std::fs::remove_dir_all(&dest);
    // File by file: Windows refuses to rename a folder that OneDrive or a
    // virus scanner has just looked at, but moves the files in it.
    std::fs::create_dir_all(dest.join("books"))?;
    for entry in std::fs::read_dir(&building)? {
        let entry = entry?;
        if entry.file_type()?.is_dir() {
            for book in std::fs::read_dir(entry.path())? {
                let book = book?;
                std::fs::rename(book.path(), dest.join("books").join(book.file_name()))?;
            }
        } else {
            std::fs::rename(entry.path(), dest.join(entry.file_name()))?;
        }
    }
    let _ = std::fs::remove_dir_all(&building);
    summarize(&dest, &web);
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

/// The hot tables' leaf and overflow pages (and those of every small
/// b-tree), as runs of pages `[first, last]` of at most [`SEGMENT_PAGES`],
/// grouped by table: reading any page of a run over HTTP fetches the run.
/// Skeleton pages are left out (they're always there) but don't break a run.
fn hot_segments(conn: &Connection, skeleton: &[i64], hot_tables: &[&str]) -> anyhow::Result<Vec<(i64, i64)>> {
    let like = hot_tables.iter().map(|_| "s.tbl_name LIKE ? ESCAPE '\\'").collect::<Vec<_>>().join(" OR ");
    let sql = format!(
        "WITH sizes AS (SELECT name, count(*) AS pages FROM dbstat GROUP BY name)
         SELECT s.tbl_name, d.pageno
         FROM dbstat d JOIN sqlite_schema s ON s.name = d.name JOIN sizes z ON z.name = d.name
         WHERE d.pagetype != 'internal' AND ({like} OR z.pages <= {SMALL_BTREE_PAGES})
         ORDER BY s.tbl_name, d.pageno"
    );
    let mut by_table: BTreeMap<String, Vec<i64>> = BTreeMap::new();
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(hot_tables), |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))?;
    for row in rows {
        let (table, page) = row?;
        by_table.entry(table).or_default().push(page);
    }
    let in_skeleton = |p: i64| skeleton.binary_search(&p).is_ok();
    let mut runs = Vec::new();
    for pages in by_table.into_values() {
        let mut run: Option<(i64, i64)> = None;
        for p in pages {
            run = match run {
                Some((a, b))
                    if p - a < SEGMENT_PAGES
                        && (p - b - 1 <= SEGMENT_GAP || (b + 1..p).all(in_skeleton)) =>
                {
                    Some((a, p))
                }
                Some(done) => {
                    runs.push(done);
                    Some((p, p))
                }
                None => Some((p, p)),
            };
        }
        runs.extend(run);
    }
    runs.sort_unstable();
    // Two tables' runs may touch or interleave; a page belongs to one run.
    let mut merged: Vec<(i64, i64)> = Vec::with_capacity(runs.len());
    for (a, b) in runs {
        match merged.last_mut() {
            Some(last) if a <= last.1 => last.1 = last.1.max(b),
            _ => merged.push((a, b)),
        }
    }
    Ok(merged)
}

/// Cuts `db` into `<name>.000`, `.001` ... of [`CHUNK_SIZE`] in `out_dir`.
/// Returns each piece's entry for the manifest, and the content version:
/// the first 16 hex digits of the whole file's SHA-256.
fn write_chunks(db: &Path, out_dir: &Path) -> anyhow::Result<(Vec<serde_json::Value>, String)> {
    let name = db.file_name().unwrap().to_string_lossy().to_string();
    let mut file = std::fs::File::open(db)?;
    let mut whole = Sha256::new();
    let mut chunks = Vec::new();
    let mut buf = vec![0u8; 1 << 20];
    for i in 0.. {
        let mut part = Sha256::new();
        let mut written = 0u64;
        let piece = format!("{name}.{i:03}");
        let mut out: Option<std::fs::File> = None;
        while written < CHUNK_SIZE {
            let want = buf.len().min((CHUNK_SIZE - written) as usize);
            let n = file.read(&mut buf[..want])?;
            if n == 0 {
                break;
            }
            let w = match &mut out {
                Some(w) => w,
                None => out.insert(std::fs::File::create(out_dir.join(&piece))?),
            };
            w.write_all(&buf[..n])?;
            part.update(&buf[..n]);
            whole.update(&buf[..n]);
            written += n as u64;
        }
        if written == 0 {
            break;
        }
        chunks.push(json!({ "file": piece, "size": written, "sha256": hex(&part.finalize()) }));
    }
    Ok((chunks, hex(&whole.finalize())[..16].to_string()))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
