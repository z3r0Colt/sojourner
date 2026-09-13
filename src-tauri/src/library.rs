//! The books that ship with the app.
//!
//! A reader's own resources are copied into the app-data folder and
//! catalogued in user.db, text and all (see `commands::resources`). The
//! shipped library works the other way round: the files are bundled beside
//! the executable and read where they lie, their text is extracted once at
//! package time into content.db, and user.db keeps only a stub row per book
//! so that tags, passage links and reading positions -- all of which
//! reference `resources(id)` -- work for a shipped book exactly as they do
//! for one of the reader's own.
//!
//! Three moving parts:
//!
//! * [`collect`] tops up the repo's `library/` folder from a reader's own
//!   library, carrying over the titles and authors already curated there,
//!   and writes `library/manifest.json`. Run before a release build.
//! * [`import`] reads that folder into content.db. `build_content_db` calls
//!   it, so a packaged content.db always has the library in it.
//! * [`sync`] runs at every launch: it makes user.db's stub rows agree with
//!   what content.db holds, and repoints them at wherever the files are on
//!   this machine -- an install directory, or a folder on a USB stick.

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
}

/// A shipped book as the app reads it back out of content.db.
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
        entries.push(LibraryEntry { file_name: file_name.clone(), kind: kind.to_string(), title, author });
        added.push(file_name);
    }

    entries.sort_by(|a, b| a.file_name.cmp(&b.file_name));
    write_manifest(library_dir, &entries)?;
    Ok(CollectOutcome { added, already_there, total: entries.len() })
}

/// Reads `library_dir` into `content.db`, extracting each book's text. Called
/// by `build_content_db`, which builds that file from scratch every time.
pub fn import(conn: &Connection, library_dir: &Path) -> anyhow::Result<usize> {
    let entries = read_manifest(library_dir)?;
    if entries.is_empty() {
        return Ok(0);
    }
    let tx = conn.unchecked_transaction()?;
    tx.execute("DELETE FROM library_resources", [])?;
    let mut imported = 0;
    for entry in &entries {
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
        imported += 1;
    }
    tx.commit()?;
    Ok(imported)
}

/// Whether the attached content.db is new enough to carry a shipped library.
///
/// content.db is its own file with its own migrations, and an app can be
/// handed an older one -- a dev checkout built before this existed, an
/// install whose content resource was not replaced. Everything that reads the
/// library asks this first rather than failing on a missing table.
pub fn is_available(conn: &Connection) -> bool {
    // Asked of each schema in turn and tolerant of both failing: this same
    // function is called on the app's two-database connection and on a
    // standalone content.db during a build, where `content` is not attached
    // at all.
    let has_table = |sql: &str| {
        conn.query_row(sql, [], |_| Ok(()))
            .optional()
            .unwrap_or(None)
            .is_some()
    };
    has_table("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'library_resources'")
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
///   gives up the copy of the text it was carrying, which content.db now
///   holds for every install.
/// * A row whose file has moved (a reinstall, a different machine, a folder
///   on a stick) is repointed at where the files are now.
/// * A row for a book no longer shipped keeps its file if the reader has one
///   and otherwise stops claiming to be part of the library.
pub fn sync(conn: &Connection, library_dir: &Path) -> anyhow::Result<SyncOutcome> {
    let mut outcome = SyncOutcome::default();
    if !is_available(conn) {
        return Ok(outcome);
    }
    let books = list(conn)?;
    if books.is_empty() {
        return Ok(outcome);
    }
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
        let path = library_dir.join(&book.file_name).display().to_string();
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
    // standing empty -- pages SQLite keeps until it is asked not to. Worth
    // the few seconds once, since every backup from here on carries it
    // otherwise.
    if outcome.adopted > 0 {
        if let Err(e) = conn.execute_batch("VACUUM") {
            eprintln!("[library] could not reclaim the adopted text's space: {e}");
        }
    }
    Ok(outcome)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    fn scratch(name: &str) -> (PathBuf, Connection) {
        let dir = std::env::temp_dir().join(format!("sojourner-library-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let content_db_path = dir.join("content.db");
        {
            // Two books shipped with the app, as `import` would leave them.
            let content = db::open_content_db(&content_db_path).unwrap();
            for (file, title, author) in [
                ("Mortification.epub", "Of the Mortification of Sin", "John Owen"),
                ("All of Grace.epub", "All of Grace", "C. H. Spurgeon"),
            ] {
                content
                    .execute(
                        "INSERT INTO library_resources (file_name, kind, title, author, extracted_text)
                         VALUES (?1, 'epub', ?2, ?3, 'the words of the book')",
                        params![file, title, author],
                    )
                    .unwrap();
            }
        }
        let conn = db::open(&dir, &content_db_path).unwrap();
        (dir, conn)
    }

    /// The reader who imported these books by hand before they shipped must
    /// end up with one row each, not two -- keeping the id everything else
    /// hangs off, and giving up the copy of the text that content.db now
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
        assert_eq!(text, None, "the text is content.db's business now");
        assert_eq!(path, shipped_dir.join("Mortification.epub").display().to_string(), "pointed at the shipped file");
        assert_eq!(
            conn.query_row::<i64, _, _>("SELECT COUNT(*) FROM resource_tags WHERE resource_id = ?1", params![mine], |r| r.get(0)).unwrap(),
            1,
            "its tag survived"
        );

        // Its text still reads, out of content.db.
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
}

/// A shipped book's text, for the reader that wants to search inside it.
pub fn extracted_text(conn: &Connection, library_key: &str) -> anyhow::Result<Option<String>> {
    let text = conn
        .query_row(
            "SELECT extracted_text FROM library_resources WHERE file_name = ?1",
            params![library_key],
            |r| r.get::<_, Option<String>>(0),
        )
        .optional()?;
    Ok(text.flatten())
}
