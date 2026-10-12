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
    let hot = hot_segments(&conn, &skeleton)?;
    drop(conn);

    let mut file = std::fs::File::open(&out)?;
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
    let (chunks, version) = write_chunks(&out, &out_dir)?;
    std::fs::remove_file(&out)?;

    let hot_bytes: i64 = hot.iter().map(|(a, b)| (b - a + 1) * PAGE_SIZE).sum();
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
    std::fs::write(out_dir.join("manifest.json"), serde_json::to_string(&manifest)?)?;

    println!(
        "wrote {}: content {version}, schema {schema}, {:.0} MB in {} pieces; skeleton {} pages ({:.1} MB); \
         {} hot segments ({:.1} MB)",
        out_dir.display(),
        size as f64 / 1e6,
        manifest["chunks"].as_array().map_or(0, |c| c.len()),
        manifest["skeleton"]["pages"].as_array().map_or(0, |p| p.len()),
        skeleton_bin.len() as f64 / 1e6,
        hot.len(),
        hot_bytes as f64 / 1e6
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

/// The hot tables' leaf and overflow pages (and those of every small
/// b-tree), as runs of pages `[first, last]` of at most [`SEGMENT_PAGES`],
/// grouped by table: reading any page of a run over HTTP fetches the run.
/// Skeleton pages are left out (they're always there) but don't break a run.
fn hot_segments(conn: &Connection, skeleton: &[i64]) -> anyhow::Result<Vec<(i64, i64)>> {
    let like = HOT_TABLES.iter().map(|_| "s.tbl_name LIKE ? ESCAPE '\\'").collect::<Vec<_>>().join(" OR ");
    let sql = format!(
        "WITH sizes AS (SELECT name, count(*) AS pages FROM dbstat GROUP BY name)
         SELECT s.tbl_name, d.pageno
         FROM dbstat d JOIN sqlite_schema s ON s.name = d.name JOIN sizes z ON z.name = d.name
         WHERE d.pagetype != 'internal' AND ({like} OR z.pages <= {SMALL_BTREE_PAGES})
         ORDER BY s.tbl_name, d.pageno"
    );
    let mut by_table: BTreeMap<String, Vec<i64>> = BTreeMap::new();
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(HOT_TABLES), |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))?;
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
