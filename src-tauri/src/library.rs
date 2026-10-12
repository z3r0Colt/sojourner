//! The building half of the shipped library: reading a folder of books,
//! extracting their text (which needs the PDF/EPUB readers in
//! [`crate::resources`]), and writing the manifest. Everything that only reads
//! an installed shelf lives in `sojourner_core::library` and is re-exported
//! here, so callers still say `library::sync`, `library::list`...

use crate::resources::{detect_kind, extract_text};
use rusqlite::{params, Connection};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

pub use sojourner_core::library::*;

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
