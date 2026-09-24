//! The books that ship with the app.
//!
//! A reader's own resources are copied into the app-data folder and
//! catalogued in user.db, text and all (see `commands::resources`). The
//! shipped library works the other way round: the files arrive in a resource
//! pack and are read where they lie, their text is extracted once at build
//! time into the pack's `library.db`, and user.db keeps only a stub row per
//! book so that tags, passage links and reading positions -- all of which
//! reference `resources(id)` -- work for a shipped book exactly as they do
//! for one of the reader's own.
//!
//! These books used to ship inside the installer, their text in content.db
//! and their files beside the executable. They now ship separately (see
//! `crate::pack`), which is why [`sync`] matters more than it did: the
//! library can arrive, and leave, while a reader's notes about it stay put.
//!
//! Four moving parts:
//!
//! * [`collect`] tops up the repo's `library/` folder from a reader's own
//!   library, carrying over the titles and authors already curated there,
//!   and writes `library/manifest.json`. Run before a release build.
//! * [`import`] reads that folder into a `library.db`. `build_library_pack`
//!   calls it, so a built pack always has the books' text in it.
//! * [`sync`] runs at every launch and after every install: it makes user.db's
//!   stub rows agree with what the pack holds, and repoints them at wherever
//!   the files are on this machine -- an app-data folder, or a USB stick.
//! * [`retire_all`] is the other half of that, for when no pack is installed.

use crate::resources::{detect_kind, extract_text};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

/// The folder, under the repo root or beside the executable, that holds the
/// shipped books.
pub const LIBRARY_DIR: &str = "library";
const MANIFEST: &str = "manifest.json";

/// One book, as the manifest records it. The title and author are kept here
/// rather than re-derived from the file name at import, so the curation a
/// reader did in the app survives into the shipped build.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryEntry {
    pub file_name: String,
    pub kind: String,
    pub title: String,
    pub author: Option<String>,
    /// What the book is ("Sermons", "Theology"), for grouping in Resources.
    /// Kept through `collect`'s rewrite of the manifest; read into content.db
    /// by `import::library_catalog`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subject: Option<String>,
}

/// A shipped book as the app reads it back out of the installed pack.
#[derive(Debug, Clone)]
pub struct LibraryBook {
    pub file_name: String,
    pub kind: String,
    pub title: String,
    pub author: Option<String>,
}

fn manifest_path(library_dir: &Path) -> PathBuf {
    library_dir.join(MANIFEST)
}

pub fn read_manifest(library_dir: &Path) -> anyhow::Result<Vec<LibraryEntry>> {
    let path = manifest_path(library_dir);
    if !path.is_file() {
        return Ok(Vec::new());
    }
    Ok(serde_json::from_str(&std::fs::read_to_string(path)?)?)
}

fn write_manifest(library_dir: &Path, entries: &[LibraryEntry]) -> anyhow::Result<()> {
    std::fs::write(manifest_path(library_dir), serde_json::to_string_pretty(entries)?)?;
    Ok(())
}

/// What one run of [`collect`] did.
pub struct CollectOutcome {
    pub added: Vec<String>,
    pub already_there: usize,
    pub total: usize,
}

/// Tops up `library_dir` from `source_dir`, taking the title and author for
/// each file from `catalogue` (a reader's own user.db) where it knows them.
///
/// Files already in the library are left alone -- the shipped set is
/// deliberate, so a book removed from the reader's own library stays shipped
/// until it is removed from this folder by hand.
pub fn collect(source_dir: &Path, library_dir: &Path, catalogue: Option<&Connection>) -> anyhow::Result<CollectOutcome> {
    std::fs::create_dir_all(library_dir)?;
    let mut entries = read_manifest(library_dir)?;
    let known: HashSet<String> = entries.iter().map(|e| e.file_name.clone()).collect();

    // What the reader called each file, by file name.
    let mut titles: HashMap<String, (String, Option<String>)> = HashMap::new();
    if let Some(conn) = catalogue {
        let mut stmt = conn.prepare("SELECT file_path, title, author FROM resources")?;
        let rows = stmt.query_map([], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, Option<String>>(2)?))
        })?;
        for row in rows {
            let (path, title, author) = row?;
            if let Some(name) = Path::new(&path).file_name().and_then(|n| n.to_str()) {
                titles.insert(name.to_string(), (title, author));
            }
        }
    }

    let mut added = Vec::new();
    let mut already_there = 0;
    let mut files: Vec<PathBuf> = std::fs::read_dir(source_dir)?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.is_file())
        .collect();
    files.sort();

    for path in files {
        let Some(kind) = detect_kind(&path) else { continue };
        let Some(file_name) = path.file_name().and_then(|n| n.to_str()).map(str::to_string) else { continue };
        if known.contains(&file_name) {
            already_there += 1;
            continue;
        }
        std::fs::copy(&path, library_dir.join(&file_name))?;
        let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or(&file_name).to_string();
        let (title, author) = titles.get(&file_name).cloned().unwrap_or((stem, None));
        entries.push(LibraryEntry { file_name: file_name.clone(), kind: kind.to_string(), title, author, subject: None });
        added.push(file_name);
    }

    entries.sort_by(|a, b| a.file_name.cmp(&b.file_name));
    write_manifest(library_dir, &entries)?;
    Ok(CollectOutcome { added, already_there, total: entries.len() })
}

/// Reads `library_dir` into a `library.db`, extracting each book's text.
/// Called by `build_library_pack`, which builds that file from scratch every
/// time.
pub fn import(conn: &Connection, library_dir: &Path) -> anyhow::Result<usize> {
    let entries = read_manifest(library_dir)?;
    import_entries(conn, library_dir, &entries)
}

/// [`import`] for a given list of books -- one shelf's (see `Shelf`) -- and
/// every Scripture reference in each, into `library_citations`.
pub fn import_entries(conn: &Connection, library_dir: &Path, entries: &[LibraryEntry]) -> anyhow::Result<usize> {
    if entries.is_empty() {
        return Ok(0);
    }
    let tx = conn.unchecked_transaction()?;
    tx.execute("DELETE FROM library_resources", [])?;
    let has_citations = tx
        .query_row("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'library_citations'", [], |_| Ok(()))
        .is_ok();
    let mut imported = 0;
    let mut cited = 0usize;
    for entry in entries {
        let path = library_dir.join(&entry.file_name);
        if !path.is_file() {
            eprintln!("  [library] missing file, skipped: {}", entry.file_name);
            continue;
        }
        let text = extract_text(&path, &entry.kind);
        tx.execute(
            "INSERT INTO library_resources (file_name, kind, title, author, extracted_text)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![entry.file_name, entry.kind, entry.title, entry.author, text],
        )?;
        let resource_id = tx.last_insert_rowid();
        if has_citations {
            if let Some(text) = text.as_deref() {
                let mut insert = tx.prepare_cached(
                    "INSERT INTO library_citations (resource_id, char_offset, label, occurrence, context, book_id, chapter, verse_start, verse_end)
                     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                )?;
                for c in crate::citations::extract(text) {
                    insert.execute(params![resource_id, c.offset as i64, c.label, c.occurrence, c.context, c.book_id, c.chapter, c.verse_start, c.verse_end])?;
                    cited += 1;
                }
            }
        }
        imported += 1;
    }
    tx.commit()?;
    if has_citations {
        println!("  {cited} Scripture citations indexed");
    }
    Ok(imported)
}

/// One shelf of the library: its own pack, built from its own list.
///
/// `library/shelves/<id>.json` names the books a shelf holds (all of them in
/// the one flat `library/` folder) and where each came from. The Puritan and
/// Reformed shelf is `library/manifest.json` itself, as it always was, and
/// keeps the pack id `library` so a reader's installed pack upgrades in place.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Shelf {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub books: Vec<ShelfBook>,
}

/// A book on a shelf: the manifest entry, and its provenance.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShelfBook {
    pub file_name: String,
    pub kind: String,
    pub title: String,
    pub author: Option<String>,
    /// Where the file was fetched from.
    #[serde(default)]
    pub source_url: Option<String>,
    /// The terms it is here on ("Public domain").
    #[serde(default)]
    pub license: Option<String>,
    #[serde(default)]
    pub subject: Option<String>,
}

impl ShelfBook {
    pub fn entry(&self) -> LibraryEntry {
        LibraryEntry {
            file_name: self.file_name.clone(),
            kind: self.kind.clone(),
            title: self.title.clone(),
            author: self.author.clone(),
            subject: self.subject.clone(),
        }
    }
}

pub fn read_shelf(library_dir: &Path, id: &str) -> anyhow::Result<Shelf> {
    let path = library_dir.join("shelves").join(format!("{id}.json"));
    let text = std::fs::read_to_string(&path).map_err(|e| anyhow::anyhow!("no shelf {id} at {}: {e}", path.display()))?;
    Ok(serde_json::from_str(&text)?)
}

/// Whether this connection can see a shipped library at all.
///
/// Three places it can live, and all three are real:
///
/// * `library` -- an installed resource pack, which is where it lives now.
/// * `content` -- a content.db built before the books moved out into a pack.
/// * `main` -- a standalone library.db, as `build_library_pack` opens it.
///
/// Everything that reads the library asks this first rather than failing on a
/// missing table, because all three of those can be absent: no pack installed
/// is the ordinary state of a fresh install, not an error.
pub fn is_available(conn: &Connection) -> bool {
    // Asked of each schema in turn and tolerant of every one failing: a query
    // against `library.sqlite_master` is an error, not an empty result, when
    // nothing is attached under that name.
    let has_table = |sql: &str| {
        conn.query_row(sql, [], |_| Ok(()))
            .optional()
            .unwrap_or(None)
            .is_some()
    };
    !crate::db::attached_library_schemas(conn).is_empty()
        || has_table("SELECT 1 FROM library.sqlite_master WHERE type = 'table' AND name = 'library_resources'")
        || has_table("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'library_resources'")
        || has_table("SELECT 1 FROM content.sqlite_master WHERE type = 'table' AND name = 'library_resources'")
}

/// Every shipped book content.db knows about.
pub fn list(conn: &Connection) -> anyhow::Result<Vec<LibraryBook>> {
    let mut stmt = conn.prepare("SELECT file_name, kind, title, author FROM library_resources ORDER BY title")?;
    let rows = stmt.query_map([], |r| {
        Ok(LibraryBook {
            file_name: r.get(0)?,
            kind: r.get(1)?,
            title: r.get(2)?,
            author: r.get(3)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// The books in one attached pack's schema.
pub fn list_in(conn: &Connection, schema: &str) -> anyhow::Result<Vec<LibraryBook>> {
    let mut stmt = conn.prepare(&format!("SELECT file_name, kind, title, author FROM {schema}.library_resources ORDER BY title"))?;
    let rows = stmt.query_map([], |r| {
        Ok(LibraryBook { file_name: r.get(0)?, kind: r.get(1)?, title: r.get(2)?, author: r.get(3)? })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// How many rows still claim to be one of the shipped books.
///
/// With no pack installed this is the count of books waiting for one -- what
/// the Resources view needs in order to say so rather than listing several
/// hundred books that will not open.
pub fn count_marked(conn: &Connection) -> anyhow::Result<i64> {
    Ok(conn.query_row(
        "SELECT COUNT(*) FROM resources WHERE library_key IS NOT NULL",
        [],
        |r| r.get(0),
    )?)
}

/// Lets go of every row that claims to be a shipped book, and says how many.
///
/// For when the reader *removes* the pack, and only then. It is deliberately
/// not run at launch when no pack is installed: `library_key` is the only
/// record that a row was ever one of the shipped books, and an upgrade from a
/// build that bundled them needs that record kept so the books can be
/// explained and then repointed when a pack arrives. [`sync`] cannot do this
/// itself either -- it returns early when no library is attached.
///
/// What it clears is `library_key`, and only that. The row stays, and with it
/// the title, the author, every tag, every passage link and every bookmark
/// that references it. `file_path` still points where the file used to be, so
/// a reader who keeps their own copy there loses nothing; a reader who does
/// not sees a resource with no file behind it, which is what
/// `queries::resources` reports as unavailable rather than opening to an
/// error. Installing the pack again re-adopts the row by file name and hands
/// it all back.
pub fn retire_all(conn: &Connection) -> anyhow::Result<usize> {
    let retired = conn.execute("UPDATE resources SET library_key = NULL WHERE library_key IS NOT NULL", [])?;
    Ok(retired)
}

/// What one launch's [`sync`] changed, for the log line.
#[derive(Debug, Default)]
pub struct SyncOutcome {
    pub added: usize,
    pub adopted: usize,
    pub repointed: usize,
    pub retired: usize,
}

/// Makes user.db agree with the shipped library.
///
/// * A book with no row yet gets one, pointing at the bundled file.
/// * A row the reader already has for the same file -- because this library
///   was imported by hand before it shipped -- is adopted rather than
///   duplicated: it keeps its id, and with it every tag and bookmark, and
///   gives up the copy of the text it was carrying, which the pack now
///   holds for every install.
/// * A row whose file has moved (a reinstall, a different machine, a folder
///   on a stick) is repointed at where the files are now.
/// * A row for a book no longer shipped keeps its file if the reader has one
///   and otherwise stops claiming to be part of the library.
pub fn sync(conn: &Connection, library_dir: &Path) -> anyhow::Result<SyncOutcome> {
    if !is_available(conn) {
        return Ok(SyncOutcome::default());
    }
    let books: Vec<(LibraryBook, PathBuf)> = list(conn)?.into_iter().map(|b| (b, library_dir.to_path_buf())).collect();
    sync_books(conn, books)
}

/// [`sync`] across every installed pack at once: each (schema, books folder).
///
/// It has to be all of them together. A sync of one pack alone would take
/// every other pack's books for books "no longer shipped" and retire them.
pub fn sync_all(conn: &Connection, packs: &[(String, PathBuf)]) -> anyhow::Result<SyncOutcome> {
    let mut books = Vec::new();
    for (schema, dir) in packs {
        for b in list_in(conn, schema)? {
            books.push((b, dir.clone()));
        }
    }
    if books.is_empty() {
        return Ok(SyncOutcome::default());
    }
    sync_books(conn, books)
}

/// Lets go of the rows for one pack's books, for when that pack alone is
/// removed (see [`retire_all`], which does it for every row).
pub fn retire_books(conn: &Connection, file_names: &[String]) -> anyhow::Result<usize> {
    let mut n = 0;
    for name in file_names {
        n += conn.execute("UPDATE resources SET library_key = NULL WHERE library_key = ?1", params![name])?;
    }
    Ok(n)
}

fn sync_books(conn: &Connection, books_with_dirs: Vec<(LibraryBook, PathBuf)>) -> anyhow::Result<SyncOutcome> {
    let mut outcome = SyncOutcome::default();
    if books_with_dirs.is_empty() {
        return Ok(outcome);
    }
    let dir_of: HashMap<String, PathBuf> = books_with_dirs.iter().map(|(b, d)| (b.file_name.clone(), d.clone())).collect();
    let books: Vec<LibraryBook> = books_with_dirs.into_iter().map(|(b, _)| b).collect();
    let now = chrono::Utc::now().to_rfc3339();
    let tx = conn.unchecked_transaction()?;

    // What user.db has already: by library_key, and by file name for rows the
    // reader imported themselves before these books shipped.
    let mut by_key: HashMap<String, (i64, String)> = HashMap::new();
    let mut by_file_name: HashMap<String, i64> = HashMap::new();
    {
        let mut stmt = tx.prepare("SELECT id, file_path, library_key FROM resources")?;
        let rows = stmt.query_map([], |r| {
            Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, Option<String>>(2)?))
        })?;
        for row in rows {
            let (id, file_path, key) = row?;
            match key {
                Some(key) => {
                    by_key.insert(key, (id, file_path));
                }
                None => {
                    if let Some(name) = Path::new(&file_path).file_name().and_then(|n| n.to_str()) {
                        by_file_name.insert(name.to_string(), id);
                    }
                }
            }
        }
    }

    for book in &books {
        let path = dir_of[&book.file_name].join(&book.file_name).display().to_string();
        match by_key.get(&book.file_name) {
            Some((id, current_path)) => {
                if current_path != &path {
                    tx.execute("UPDATE resources SET file_path = ?2 WHERE id = ?1", params![id, path])?;
                    outcome.repointed += 1;
                }
            }
            None => match by_file_name.get(&book.file_name) {
                // Already in the reader's own library: adopt it, and drop the
                // text it was storing -- content.db has it now, for everyone.
                Some(id) => {
                    tx.execute(
                        "UPDATE resources SET library_key = ?2, file_path = ?3, extracted_text = NULL,
                                              title = ?4, author = COALESCE(author, ?5)
                         WHERE id = ?1",
                        params![id, book.file_name, path, book.title, book.author],
                    )?;
                    outcome.adopted += 1;
                }
                None => {
                    tx.execute(
                        "INSERT INTO resources (kind, title, author, file_path, extracted_text, added_at, library_key)
                         VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?6)",
                        params![book.kind, book.title, book.author, path, now, book.file_name],
                    )?;
                    outcome.added += 1;
                }
            },
        }
    }

    // Rows still claiming to be shipped books that this build no longer ships.
    let shipped: HashSet<&str> = books.iter().map(|b| b.file_name.as_str()).collect();
    for (key, (id, _)) in &by_key {
        if !shipped.contains(key.as_str()) {
            tx.execute("UPDATE resources SET library_key = NULL WHERE id = ?1", params![id])?;
            outcome.retired += 1;
        }
    }

    tx.commit()?;

    // Adopting a book hands its text over to content.db, and on a library
    // imported by hand that is hundreds of megabytes of user.db suddenly
    // standing empty -- pages SQLite keeps until it is asked not to, and
    // which every backup would otherwise carry for good. The test is the
    // free space itself rather than what this particular run did, so a
    // database left holding it by an earlier version still gets it back.
    if worth_vacuuming(conn) {
        println!("[library] reclaiming the space the adopted text left behind");
        if let Err(e) = conn.execute_batch("VACUUM") {
            eprintln!("[library] could not reclaim it: {e}");
        }
    }
    Ok(outcome)
}

/// Whether user.db is carrying enough dead weight to be worth the seconds a
/// VACUUM costs: more than 64 MB of it, and more than a quarter of the file.
fn worth_vacuuming(conn: &Connection) -> bool {
    let pragma = |name: &str| conn.query_row(&format!("PRAGMA {name}"), [], |r| r.get::<_, i64>(0)).unwrap_or(0);
    let free = pragma("freelist_count");
    let pages = pragma("page_count");
    let page_size = pragma("page_size").max(1);
    free * page_size > 64 * 1024 * 1024 && free * 4 > pages
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    /// The three-database setup the app actually runs on: user.db as `main`,
    /// content.db attached as `content`, and an installed resource pack's
    /// library.db attached as `library` -- seeded with two books, as
    /// `build_library_pack` would leave them.
    fn scratch(name: &str) -> (PathBuf, Connection) {
        let dir = std::env::temp_dir().join(format!("sojourner-library-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let content_db_path = dir.join("content.db");
        db::open_content_db(&content_db_path).unwrap();

        let library_db_path = dir.join("library.db");
        {
            let library = db::open_library_db(&library_db_path).unwrap();
            for (file, title, author) in [
                ("Mortification.epub", "Of the Mortification of Sin", "John Owen"),
                ("All of Grace.epub", "All of Grace", "C. H. Spurgeon"),
            ] {
                library
                    .execute(
                        "INSERT INTO library_resources (file_name, kind, title, author, extracted_text)
                         VALUES (?1, 'epub', ?2, ?3, 'the words of the book')",
                        params![file, title, author],
                    )
                    .unwrap();
            }
        }
        let conn = db::open(&dir, &content_db_path).unwrap();
        db::attach_library(&conn, &library_db_path).unwrap();
        (dir, conn)
    }

    /// The reader who imported these books by hand before they shipped must
    /// end up with one row each, not two -- keeping the id everything else
    /// hangs off, and giving up the copy of the text that the pack now
    /// holds for every install.
    #[test]
    fn a_hand_imported_book_is_adopted_rather_than_duplicated() {
        let (dir, conn) = scratch("adopt");
        let old_dir = dir.join("old-resources");
        let shipped_dir = dir.join("library");

        conn.execute(
            "INSERT INTO resources (kind, title, author, file_path, extracted_text, added_at)
             VALUES ('epub', 'Mortification', 'Owen', ?1, 'a copy of the words', '2026-01-01')",
            params![old_dir.join("Mortification.epub").display().to_string()],
        )
        .unwrap();
        let mine: i64 = conn.query_row("SELECT id FROM resources", [], |r| r.get(0)).unwrap();
        conn.execute("INSERT INTO resource_tags (resource_id, tag) VALUES (?1, 'puritans')", params![mine]).unwrap();

        let outcome = sync(&conn, &shipped_dir).unwrap();
        assert_eq!((outcome.adopted, outcome.added), (1, 1), "one adopted, one new");
        assert_eq!(conn.query_row::<i64, _, _>("SELECT COUNT(*) FROM resources", [], |r| r.get(0)).unwrap(), 2);

        let (id, path, text, key): (i64, String, Option<String>, Option<String>) = conn
            .query_row(
                "SELECT id, file_path, extracted_text, library_key FROM resources WHERE library_key = 'Mortification.epub'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .unwrap();
        assert_eq!(id, mine, "the reader's own row, kept");
        assert_eq!(key.as_deref(), Some("Mortification.epub"));
        assert_eq!(text, None, "the text is the pack's business now");
        assert_eq!(path, shipped_dir.join("Mortification.epub").display().to_string(), "pointed at the shipped file");
        assert_eq!(
            conn.query_row::<i64, _, _>("SELECT COUNT(*) FROM resource_tags WHERE resource_id = ?1", params![mine], |r| r.get(0)).unwrap(),
            1,
            "its tag survived"
        );

        // Its text still reads, out of the pack.
        assert_eq!(
            crate::db::queries::resources::get_extracted_text(&conn, mine).unwrap().as_deref(),
            Some("the words of the book")
        );

        // Running again changes nothing.
        let again = sync(&conn, &shipped_dir).unwrap();
        assert_eq!((again.added, again.adopted, again.repointed), (0, 0, 0));
        assert_eq!(conn.query_row::<i64, _, _>("SELECT COUNT(*) FROM resources", [], |r| r.get(0)).unwrap(), 2);

        drop(conn);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Installed somewhere else, or run off a stick: the rows follow the
    /// files. And a book this build no longer ships stops claiming to be part
    /// of the library rather than leaving a row pointing at nothing.
    #[test]
    fn rows_follow_the_files_and_a_dropped_book_is_retired() {
        let (dir, conn) = scratch("move");
        let first = dir.join("install-one").join("library");
        sync(&conn, &first).unwrap();

        let second = dir.join("usb-stick").join("library");
        let outcome = sync(&conn, &second).unwrap();
        assert_eq!(outcome.repointed, 2, "both books repointed");
        let path: String = conn
            .query_row("SELECT file_path FROM resources WHERE library_key = 'All of Grace.epub'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(path, second.join("All of Grace.epub").display().to_string());

        conn.execute("DELETE FROM library_resources WHERE file_name = 'All of Grace.epub'", []).unwrap();
        let outcome = sync(&conn, &second).unwrap();
        assert_eq!(outcome.retired, 1);
        let (key, bundled): (Option<String>, i64) = conn
            .query_row(
                "SELECT library_key, (library_key IS NOT NULL) FROM resources WHERE title = 'All of Grace'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!((key, bundled), (None, 0), "no longer claims to ship with the app");

        drop(conn);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Removing the resource pack must cost a reader nothing but the books.
    ///
    /// This is the case `sync` cannot cover: with the pack detached there is
    /// no list of shipped books to compare against, so it returns before it
    /// reaches its retiring step and the rows would sit there pointing at
    /// files that are gone.
    #[test]
    fn removing_the_pack_retires_the_rows_and_keeps_what_the_reader_wrote() {
        let (dir, conn) = scratch("retire");
        let books = dir.join("books");
        sync(&conn, &books).unwrap();

        let id: i64 = conn
            .query_row("SELECT id FROM resources WHERE library_key = 'All of Grace.epub'", [], |r| r.get(0))
            .unwrap();
        conn.execute("INSERT INTO resource_tags (resource_id, tag) VALUES (?1, 'grace')", params![id]).unwrap();

        // The pack goes: detached, as `pack::remove` leaves it.
        db::detach_library(&conn).unwrap();
        assert!(!is_available(&conn), "nothing left to read the books out of");
        assert_eq!(sync(&conn, &books).unwrap().retired, 0, "sync cannot do this one");

        assert_eq!(retire_all(&conn).unwrap(), 2);
        assert_eq!(
            conn.query_row::<i64, _, _>("SELECT COUNT(*) FROM resources WHERE library_key IS NOT NULL", [], |r| r.get(0)).unwrap(),
            0,
            "no row still claims to be a shipped book"
        );
        assert_eq!(
            conn.query_row::<i64, _, _>("SELECT COUNT(*) FROM resources", [], |r| r.get(0)).unwrap(),
            2,
            "but the rows themselves are still there"
        );
        assert_eq!(
            conn.query_row::<i64, _, _>("SELECT COUNT(*) FROM resource_tags WHERE resource_id = ?1", params![id], |r| r.get(0)).unwrap(),
            1,
            "and so is the tag the reader put on one"
        );

        // Installing it again re-adopts the row by file name, tag and all.
        db::attach_library(&conn, &dir.join("library.db")).unwrap();
        let outcome = sync(&conn, &books).unwrap();
        assert_eq!((outcome.adopted, outcome.added), (2, 0), "both adopted back, neither duplicated");
        assert_eq!(
            conn.query_row::<i64, _, _>("SELECT COUNT(*) FROM resource_tags WHERE resource_id = ?1", params![id], |r| r.get(0)).unwrap(),
            1
        );

        drop(conn);
        let _ = std::fs::remove_dir_all(&dir);
    }
}

/// A shipped book's text, for the reader that wants to search inside it.
///
/// `None` rather than an error when no pack is installed. A row should not
/// still be claiming to be a shipped book in that case -- `retire_all` runs
/// at launch and after a removal for exactly that reason -- but "the text is
/// not here" is the honest answer either way, and it is better than the
/// alternative, which is a missing-table error reaching a reader who only
/// clicked on a book.
pub fn extracted_text(conn: &Connection, library_key: &str) -> anyhow::Result<Option<String>> {
    if !is_available(conn) {
        return Ok(None);
    }
    // Each attached pack in turn; a pack is keyed by file name alone, and a
    // file is on one shelf only (build_library_pack checks).
    for schema in crate::db::attached_library_schemas(conn) {
        let text = conn
            .query_row(
                &format!("SELECT extracted_text FROM {schema}.library_resources WHERE file_name = ?1"),
                params![library_key],
                |r| r.get::<_, Option<String>>(0),
            )
            .optional()?;
        if let Some(text) = text {
            return Ok(text);
        }
    }
    let text = conn
        .query_row(
            "SELECT extracted_text FROM library_resources WHERE file_name = ?1",
            params![library_key],
            |r| r.get::<_, Option<String>>(0),
        )
        .optional()?;
    Ok(text.flatten())
}
