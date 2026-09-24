//! The shipped books' shelves and subjects, from the committed shelf lists
//! into `library_catalog`, for grouping them in Resources.
//!
//! `library/manifest.json` is the Puritan and Reformed shelf; each
//! `library/shelves/<id>.json` is another. A book with no subject is a build
//! failure: every shipped book is meant to land somewhere a reader can find it.

use rusqlite::{params, Connection};
use std::path::Path;

/// The shelves in the order Resources lists them.
const SHELF_ORDER: &[(&str, &str)] = &[
    ("library", "Puritan and Reformed"),
    ("fathers", "Church Fathers"),
    ("ancient", "Ancient literature"),
    ("nineteenth", "Nineteenth century"),
];

pub fn import(conn: &mut Connection, library_dir: &Path) -> anyhow::Result<usize> {
    let mut shelves: Vec<(String, String, Vec<crate::library::LibraryEntry>)> = Vec::new();
    if library_dir.join("manifest.json").is_file() {
        shelves.push(("library".into(), "Puritan and Reformed".into(), crate::library::read_manifest(library_dir)?));
    }
    if let Ok(dir) = std::fs::read_dir(library_dir.join("shelves")) {
        let mut ids: Vec<String> = dir
            .flatten()
            .filter_map(|e| e.file_name().to_string_lossy().strip_suffix(".json").map(str::to_string))
            .collect();
        ids.sort();
        for id in ids {
            let shelf = crate::library::read_shelf(library_dir, &id)?;
            shelves.push((shelf.id.clone(), shelf.name.clone(), shelf.books.iter().map(|b| b.entry()).collect()));
        }
    }
    let missing: Vec<String> = shelves
        .iter()
        .flat_map(|(id, _, books)| books.iter().filter(|b| b.subject.is_none()).map(move |b| format!("{id}: {}", b.title)))
        .collect();
    anyhow::ensure!(missing.is_empty(), "shipped books with no subject:
  {}", missing.join("
  "));

    let tx = conn.transaction()?;
    let mut n = 0;
    {
        let mut insert = tx.prepare("INSERT OR REPLACE INTO library_catalog (file_name, shelf_id, shelf_name, shelf_order, subject) VALUES (?1,?2,?3,?4,?5)")?;
        for (id, name, books) in &shelves {
            let order = SHELF_ORDER.iter().position(|(s, _)| s == id).unwrap_or(SHELF_ORDER.len()) as i64;
            let name = SHELF_ORDER.iter().find(|(s, _)| s == id).map(|(_, n)| n.to_string()).unwrap_or_else(|| name.clone());
            for b in books {
                insert.execute(params![b.file_name, id, name, order, b.subject])?;
                n += 1;
            }
        }
    }
    tx.commit()?;
    println!("  library catalog: {n} books on {} shelves", shelves.len());
    Ok(n)
}
