pub mod queries;
pub mod schema;

use rusqlite::{Connection, OpenFlags};
use std::path::Path;
use std::sync::Mutex;

pub struct DbState(pub Mutex<Connection>);

/// Applied to every connection (both the standalone content.db builder and
/// the runtime user.db connection): WAL for concurrent-friendly reads while
/// writing, NORMAL sync since WAL already protects against corruption on a
/// crash (just not on total power loss, an acceptable tradeoff here), a
/// generous mmap window so large tables (verses, commentary_entries) are
/// read straight from the page cache, and in-memory temp storage since
/// ORDER BY/GROUP BY spill files are wasted disk I/O on a desktop app.
const PERFORMANCE_PRAGMAS: &str = r#"
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA mmap_size = 268435456;
PRAGMA temp_store = MEMORY;
"#;

/// Opens (creating if necessary) the read-mostly content database in
/// isolation -- its own `main` schema, not attached to anything -- and brings
/// it up to date against [`schema::CONTENT_MIGRATIONS`]. Used both by the
/// `build_content_db` binary (which then runs the Bible/commentary/reference
/// importers against it to produce the file that ships with the app) and, as
/// a dev-only fallback, by the running app when no prebuilt content.db
/// resource is found.
pub fn open_content_db(content_db_path: &Path) -> anyhow::Result<Connection> {
    if let Some(parent) = content_db_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut conn = Connection::open(content_db_path)?;
    conn.execute_batch(PERFORMANCE_PRAGMAS)?;
    run_migrations(&mut conn, "main", schema::CONTENT_MIGRATIONS)?;
    Ok(conn)
}

/// True if `conn` (as returned by [`open_content_db`]) has no content
/// imported yet -- i.e. it was just created fresh rather than opened from an
/// already-populated file.
pub fn content_db_is_empty(conn: &Connection) -> bool {
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM translations", [], |r| r.get(0))
        .unwrap_or(0);
    count == 0
}

/// True if `path` exists and is a content.db with at least one translation
/// imported -- i.e. a real, usable bundled content database, as opposed to
/// a missing file or the empty placeholder `build.rs` seeds so the crate
/// compiles before `build_content_db` has ever been run.
pub fn is_populated_content_db(path: &Path) -> bool {
    Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .ok()
        .map(|conn| !content_db_is_empty(&conn))
        .unwrap_or(false)
}

/// Opens the two-database setup the app runs on: a writable `user.db`
/// (notes, highlights, settings, history, reading position, resource
/// library) under `app_data_dir` as the connection's `main` schema, with the
/// prebuilt, read-mostly `content_db_path` (translations, commentaries,
/// lexicon, cross-references, Westminster, dictionary) ATTACHed as
/// `content`. Table names never collide between the two files, so every
/// existing unqualified query (`SELECT ... FROM verses JOIN books ...`)
/// keeps resolving correctly -- SQLite falls through to the attached schema
/// once it finds no match in `main`.
///
/// `content_db_path` must already exist and be fully migrated (see
/// [`open_content_db`]); this function never creates or migrates it.
pub fn open(app_data_dir: &Path, content_db_path: &Path) -> anyhow::Result<Connection> {
    std::fs::create_dir_all(app_data_dir)?;
    let user_db_path = app_data_dir.join("user.db");

    let mut conn = Connection::open(&user_db_path)?;
    conn.execute_batch(PERFORMANCE_PRAGMAS)?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    run_migrations(&mut conn, "main", schema::USER_MIGRATIONS)?;

    conn.execute(
        "ATTACH DATABASE ?1 AS content",
        [content_db_path.to_string_lossy().to_string()],
    )?;
    // Best-effort: content.db ships as a bundled resource, whose install
    // location may not always be writable (e.g. a per-machine install
    // outside the user's profile), in which case WAL/synchronous can't be
    // changed -- that's fine, it just falls back to SQLite's defaults for
    // that file.
    let _ = conn.execute_batch(
        "PRAGMA content.journal_mode = WAL;
         PRAGMA content.synchronous = NORMAL;
         PRAGMA content.mmap_size = 268435456;
         PRAGMA content.temp_store = MEMORY;",
    );

    Ok(conn)
}

fn run_migrations(conn: &mut Connection, schema_name: &str, migrations: &[&str]) -> anyhow::Result<()> {
    let db_name = if schema_name == "main" {
        rusqlite::DatabaseName::Main
    } else {
        rusqlite::DatabaseName::Attached(schema_name)
    };
    let current: i64 = conn.query_row(&format!("PRAGMA {schema_name}.user_version"), [], |r| r.get(0))?;
    let current = current as usize;
    let tx = conn.transaction()?;
    for (i, migration) in migrations.iter().enumerate() {
        if i < current {
            continue;
        }
        tx.execute_batch(migration)?;
        tx.pragma_update(Some(db_name), "user_version", (i + 1) as i64)?;
    }
    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Exercises the real split: a freshly-migrated content.db (its own file,
    /// own `main` schema) ATTACHed onto a freshly-migrated user.db, then a
    /// query that joins a content table (`books`) with a user table
    /// (`highlights`) using unqualified names -- the thing this whole split
    /// depends on continuing to work without touching any query in
    /// `db/queries/*`.
    #[test]
    fn attach_lets_unqualified_queries_join_across_both_databases() {
        let dir = std::env::temp_dir().join(format!("sojourner-db-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let content_db_path = dir.join("content.db");

        {
            let content_conn = open_content_db(&content_db_path).unwrap();
            assert!(content_db_is_empty(&content_conn));
            let book_count: i64 = content_conn.query_row("SELECT COUNT(*) FROM books", [], |r| r.get(0)).unwrap();
            assert_eq!(book_count, 66);
        }
        assert!(is_populated_content_db(&content_db_path) == false, "no translations imported yet");

        let conn = open(&dir, &content_db_path).unwrap();

        // `books` only exists in content.db; `highlights` only exists in user.db.
        // An unqualified JOIN across both proves ATTACH + name-resolution fallthrough
        // works, which is what every existing db/queries/*.rs call relies on.
        conn.execute(
            "INSERT INTO highlights (book_id, chapter, verse_start, verse_end, color, created_at, updated_at)
             VALUES (1, 1, 1, 1, 'yellow', '2026-01-01', '2026-01-01')",
            [],
        )
        .unwrap();
        let name: String = conn
            .query_row(
                "SELECT b.name FROM highlights h JOIN books b ON b.id = h.book_id WHERE h.book_id = 1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(name, "Genesis");

        drop(conn);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Migration check against a real database: set `SOJOURNER_USER_DB_COPY`
    /// to a *copy* of a live user.db and run with `cargo test -- --ignored
    /// migrates_real_user_db_copy`. Opens the copy in a scratch app-data
    /// dir (which migrates it in place) and asserts every note, highlight,
    /// chapter note, and prayer entry counted before the migration is
    /// still there after. Never point it at the live file.
    #[test]
    #[ignore]
    fn migrates_real_user_db_copy() {
        let Ok(src) = std::env::var("SOJOURNER_USER_DB_COPY") else {
            eprintln!("SOJOURNER_USER_DB_COPY not set; skipping");
            return;
        };
        let src = std::path::PathBuf::from(src);
        assert!(src.is_file(), "{} is not a file", src.display());

        let dir = std::env::temp_dir().join(format!("sojourner-migrate-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::copy(&src, dir.join("user.db")).unwrap();
        // A WAL sibling holds the newest writes; without it the copy is stale.
        let wal = std::path::PathBuf::from(format!("{}-wal", src.display()));
        if wal.is_file() {
            std::fs::copy(&wal, dir.join("user.db-wal")).unwrap();
        }

        fn counts(conn: &Connection) -> Vec<(&'static str, i64)> {
            ["notes", "highlights", "chapter_notes", "prayer_entries", "bookmarks", "memory_verses", "settings"]
                .into_iter()
                .map(|t| (t, conn.query_row(&format!("SELECT COUNT(*) FROM {t}"), [], |r| r.get(0)).unwrap_or(-1)))
                .collect()
        }
        let before = {
            let raw = Connection::open(dir.join("user.db")).unwrap();
            let version: i64 = raw.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
            eprintln!("before: user_version={version}");
            counts(&raw)
        };

        let content_db_path = dir.join("content.db");
        open_content_db(&content_db_path).unwrap();
        let conn = open(&dir, &content_db_path).unwrap();
        let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(version as usize, schema::USER_MIGRATIONS.len());
        let after = counts(&conn);
        eprintln!("after: user_version={version}\n{before:?}\n{after:?}");
        assert_eq!(before, after, "row counts changed across migration");

        // The new column exists and every surviving row is live.
        for t in ["notes", "chapter_notes", "prayer_entries"] {
            let deleted: i64 = conn.query_row(&format!("SELECT COUNT(*) FROM {t} WHERE deleted_at IS NOT NULL"), [], |r| r.get(0)).unwrap();
            assert_eq!(deleted, 0, "{t} should have no deleted rows right after migrating");
        }
        assert!(!queries::notes::list_all(&conn).unwrap().is_empty() || before[0].1 == 0);

        drop(conn);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Soft delete (USER_MIGRATION_0011): a deleted note must vanish from
    /// every list, search, count, and tag listing, show up in the Trash,
    /// come back whole on restore, and be gone for good on purge. Any query
    /// that forgets the NOT_DELETED filter would fail the first assertions.
    #[test]
    fn soft_deleted_note_is_hidden_everywhere_until_restored() {
        use queries::{notes, search, trash};
        use crate::models::TrashKind;

        let dir = std::env::temp_dir().join(format!("sojourner-trash-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let content_db_path = dir.join("content.db");
        open_content_db(&content_db_path).unwrap();
        let conn = open(&dir, &content_db_path).unwrap();

        let note = notes::create(&conn, 43, 3, 16, 16, "God so loved the world".into(), None).unwrap();
        notes::add_tag(&conn, note.id, "gospel".into()).unwrap();
        assert_eq!(notes::list_for_chapter(&conn, 43, 3).unwrap().len(), 1);
        assert_eq!(search::search_notes(&conn, "loved", 10).unwrap().len(), 1);

        notes::delete(&conn, note.id).unwrap();

        assert!(notes::list_for_chapter(&conn, 43, 3).unwrap().is_empty(), "list_for_chapter");
        assert!(notes::list_all(&conn).unwrap().is_empty(), "list_all (count)");
        assert!(search::search_notes(&conn, "loved", 10).unwrap().is_empty(), "search");
        assert!(notes::list_all_tags(&conn).unwrap().is_empty(), "tags of a deleted note");
        assert!(notes::list_all_tags_by_note(&conn).unwrap().is_empty(), "tags by note");

        let contents = trash::list(&conn).unwrap();
        assert_eq!(contents.notes.len(), 1);
        assert!(contents.notes[0].deleted_at.is_some());

        assert!(trash::restore(&conn, TrashKind::Note, note.id).unwrap());
        let restored = notes::list_all(&conn).unwrap();
        assert_eq!(restored.len(), 1);
        assert_eq!(restored[0].body, "God so loved the world");
        assert!(restored[0].deleted_at.is_none());
        assert_eq!(notes::list_all_tags(&conn).unwrap(), vec!["gospel".to_string()]);
        assert!(trash::list(&conn).unwrap().notes.is_empty());

        // Purge only touches rows already in the Trash.
        assert!(!trash::purge(&conn, TrashKind::Note, note.id).unwrap(), "live note must not be purged");
        notes::delete(&conn, note.id).unwrap();
        assert!(trash::purge(&conn, TrashKind::Note, note.id).unwrap());
        assert!(notes::get(&conn, note.id).unwrap().is_none());

        // The sweep leaves fresh deletions alone and removes stale ones.
        let stale = notes::create(&conn, 1, 1, 1, 1, "old".into(), None).unwrap();
        let fresh = notes::create(&conn, 1, 1, 2, 2, "new".into(), None).unwrap();
        conn.execute("UPDATE notes SET deleted_at = '2000-01-01T00:00:00+00:00' WHERE id = ?1", [stale.id]).unwrap();
        notes::delete(&conn, fresh.id).unwrap();
        assert_eq!(trash::sweep_expired(&conn).unwrap(), 1);
        assert!(notes::get(&conn, stale.id).unwrap().is_none());
        assert!(notes::get(&conn, fresh.id).unwrap().is_some());

        drop(conn);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
