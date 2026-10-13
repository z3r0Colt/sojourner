//! Library shelves on the web.
//!
//! On the desktop a shelf is a resource pack the reader installs: its
//! `library.db` is attached and its books are files beside it. Here a shelf is
//! on R2 (docs/pwa-plan.md, phase 7): `library.db` cut into pieces and read
//! over HTTP like content.db, the books plain `.epub` files the reader fetches
//! when it opens one. The reader *adds* a shelf, which attaches its database
//! and gives each of its books a row in user.db, exactly as an install does
//! (`library::sync_all`); removing it detaches the database and retires those
//! rows, keeping what the reader wrote on them.
//!
//! A book's `file_path` is `web-shelf:<id>/<file name>`; the page turns that
//! into the book's address (`src/web/shelves.ts`).
//!
//! This file is the bookkeeping, which needs no browser; attaching the
//! database over HTTP is `wasm::shelf_attach`.

use crate::db::{self};
use crate::library;
use rusqlite::Connection;
use serde::Deserialize;
use serde_json::{json, Value};
use std::cell::RefCell;
use std::path::PathBuf;

/// What a shelf's `manifest.json` says about the shelf itself
/// (`build_web_content --shelf`).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShelfMeta {
    pub id: String,
    pub name: String,
    pub pack_version: String,
    #[serde(default)]
    pub built_at: Option<String>,
    pub book_count: usize,
    pub book_bytes: u64,
}

/// The parts of the manifest this file reads; the rest is the HTTP VFS's.
#[derive(Debug, Deserialize)]
pub struct ShelfManifest {
    pub shelf: ShelfMeta,
    pub size: u64,
}

#[derive(Debug, Clone)]
struct Attached {
    meta: ShelfMeta,
    db_bytes: u64,
}

thread_local! {
    /// The shelves attached to this connection, the Puritan one first (the
    /// order `db::attached_library_schemas` gives).
    static ATTACHED: RefCell<Vec<Attached>> = const { RefCell::new(Vec::new()) };
}

/// Where a shelf's books are, as the prefix of each book's `file_path`.
pub fn books_dir(id: &str) -> PathBuf {
    PathBuf::from(format!("web-shelf:{id}"))
}

/// The VFS name a shelf's database is opened under.
pub fn vfs_name(id: &str) -> String {
    format!("shelf-{id}.db")
}

/// Notes that shelf `meta` has been attached.
pub fn record(manifest: ShelfManifest) {
    ATTACHED.with(|a| {
        let mut a = a.borrow_mut();
        a.retain(|s| s.meta.id != manifest.shelf.id);
        a.push(Attached { meta: manifest.shelf, db_bytes: manifest.size });
        a.sort_by_key(|s| (s.meta.id != "library", s.meta.id.clone()));
    });
}

pub fn is_attached(id: &str) -> bool {
    ATTACHED.with(|a| a.borrow().iter().any(|s| s.meta.id == id))
}

/// `(schema, name)` for each attached shelf, for the citations query.
pub fn names() -> Vec<(String, String)> {
    ATTACHED.with(|a| a.borrow().iter().map(|s| (db::pack_schema(&s.meta.id), s.meta.name.clone())).collect())
}

/// The attached shelves as the desktop's `pack_statuses` gives its packs
/// (`PackStatus`). `bytes_on_disk` is what the shelf weighs on R2: nothing
/// is stored here.
pub fn statuses() -> Vec<Value> {
    ATTACHED.with(|a| {
        a.borrow()
            .iter()
            .map(|s| {
                json!({
                    "id": s.meta.id,
                    "kind": "library",
                    "map": null,
                    "installed": true,
                    "name": s.meta.name,
                    "version": s.meta.pack_version,
                    "built_at": s.meta.built_at,
                    "book_count": s.meta.book_count,
                    "bytes_on_disk": s.db_bytes + s.meta.book_bytes,
                })
            })
            .collect()
    })
}

/// Makes user.db agree with every attached shelf (after one is added, or at
/// start). All of them together: syncing one alone would take the others'
/// books for books no longer shipped.
pub fn sync(conn: &Connection) -> anyhow::Result<library::SyncOutcome> {
    let packs: Vec<(String, PathBuf)> = ATTACHED
        .with(|a| a.borrow().iter().map(|s| (db::pack_schema(&s.meta.id), books_dir(&s.meta.id))).collect());
    library::sync_all(conn, &packs)
}

/// Detaches a shelf and lets go of the rows of its books: the books go, what
/// the reader wrote about them stays (as `remove_pack` does on the desktop).
/// Says how many rows it retired.
pub fn remove(conn: &Connection, id: &str) -> anyhow::Result<usize> {
    let schema = db::pack_schema(id);
    let books: Vec<String> =
        library::list_in(conn, &schema).map(|b| b.into_iter().map(|b| b.file_name).collect()).unwrap_or_default();
    db::detach_pack(conn, id)?;
    ATTACHED.with(|a| a.borrow_mut().retain(|s| s.meta.id != id));
    if ATTACHED.with(|a| a.borrow().is_empty()) {
        library::retire_all(conn)
    } else {
        library::retire_books(conn, &books)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_db(dir: &std::path::Path, id: &str, title: &str) {
        let lib = db::open_library_db(&dir.join(format!("{id}.db"))).unwrap();
        lib.execute(
            "INSERT INTO library_resources (file_name, kind, title, author, extracted_text) VALUES (?1, 'epub', ?2, 'A. Writer', 'the words')",
            [format!("{title}.epub"), title.to_string()],
        )
        .unwrap();
    }

    fn manifest(id: &str) -> ShelfManifest {
        serde_json::from_value(json!({
            "size": 1000,
            "shelf": { "id": id, "name": format!("Shelf {id}"), "packVersion": "1.0.0", "bookCount": 1, "bookBytes": 500 },
        }))
        .unwrap()
    }

    /// A shelf added, then another, then one removed: rows follow the books,
    /// a note-bearing row survives as the reader's own.
    #[test]
    fn shelves_add_and_remove_keep_what_the_reader_wrote() {
        let dir = crate::tests::temp_db_dir("shelves");
        let state = crate::tests::open(&dir);
        make_db(&dir, "library", "Mortification");
        make_db(&dir, "fathers", "Confessions");
        let conn = state.conn();
        for id in ["library", "fathers"] {
            let schema = db::pack_schema(id);
            conn.execute(&format!("ATTACH DATABASE ?1 AS {schema}"), [dir.join(format!("{id}.db")).to_string_lossy().to_string()]).unwrap();
            record(manifest(id));
        }
        assert_eq!(statuses().len(), 2);
        assert_eq!(statuses()[0]["id"], "library", "the Puritan shelf first");
        let synced = sync(&conn).unwrap();
        assert_eq!(synced.added, 2);
        let path: String =
            conn.query_row("SELECT file_path FROM resources WHERE library_key = 'Confessions.epub'", [], |r| r.get(0)).unwrap();
        // (A native Windows test joins with a backslash; in the browser it is a slash.)
        assert_eq!(path.replace('\\', "/"), "web-shelf:fathers/Confessions.epub");

        let id: i64 = conn.query_row("SELECT id FROM resources WHERE library_key = 'Confessions.epub'", [], |r| r.get(0)).unwrap();
        conn.execute("INSERT INTO resource_tags (resource_id, tag) VALUES (?1, 'fathers')", [id]).unwrap();
        let retired = remove(&conn, "fathers").unwrap();
        assert_eq!(retired, 1);
        assert!(!is_attached("fathers") && is_attached("library"));
        let kept: i64 = conn.query_row("SELECT COUNT(*) FROM resources WHERE id = ?1 AND library_key IS NULL", [id], |r| r.get(0)).unwrap();
        assert_eq!(kept, 1, "the row, with its tag, stays");
        // The other shelf's book is untouched.
        let mine: i64 = conn.query_row("SELECT COUNT(*) FROM resources WHERE library_key = 'Mortification.epub'", [], |r| r.get(0)).unwrap();
        assert_eq!(mine, 1);

        // Adding it back finds the row again.
        conn.execute(&format!("ATTACH DATABASE ?1 AS {}", db::pack_schema("fathers")), [dir.join("fathers.db").to_string_lossy().to_string()]).unwrap();
        record(manifest("fathers"));
        let again = sync(&conn).unwrap();
        // The retired row is taken back by its file name, with its tag.
        assert_eq!((again.added, again.adopted), (0, 1), "{again:?}");
        let adopted: i64 = conn.query_row("SELECT COUNT(*) FROM resources WHERE id = ?1 AND library_key IS NOT NULL", [id], |r| r.get(0)).unwrap();
        assert_eq!(adopted, 1);
    }
}
