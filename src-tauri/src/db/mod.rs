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
        // USER_MIGRATION_0013: the reading log exists and is usable at once.
        assert!(queries::reading_log::list_recent(&conn, 5).unwrap().len() <= 5);
        queries::reading_position::set(&conn, 1, 1, 1, None).unwrap();
        queries::reading_log::record(&conn, &queries::reading_log::today(), 1, 1, 1).unwrap();
        assert_eq!(queries::reading_log::list_recent(&conn, 5).unwrap().first().map(|e| (e.book_id, e.chapter)), Some((1, 1)));

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

        let note = notes::create(&conn, 43, 3, 16, 16, "God so loved the world".into(), None, None).unwrap();
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
        let stale = notes::create(&conn, 1, 1, 1, 1, "old".into(), None, None).unwrap();
        let fresh = notes::create(&conn, 1, 1, 2, 2, "new".into(), None, None).unwrap();
        conn.execute("UPDATE notes SET deleted_at = '2000-01-01T00:00:00+00:00' WHERE id = ?1", [stale.id]).unwrap();
        notes::delete(&conn, fresh.id).unwrap();
        assert_eq!(trash::sweep_expired(&conn).unwrap(), 1);
        assert!(notes::get(&conn, stale.id).unwrap().is_none());
        assert!(notes::get(&conn, fresh.id).unwrap().is_some());

        drop(conn);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Reading log (USER_MIGRATION_0013): a chapter counts once per day no
    /// matter how often the position is saved, the newest chapter comes
    /// first, and a chapter read again moves to the top with its last day.
    #[test]
    fn reading_log_keeps_one_row_per_chapter_per_day() {
        use queries::reading_log;

        let dir = std::env::temp_dir().join(format!("sojourner-reading-log-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let content_db_path = dir.join("content.db");
        open_content_db(&content_db_path).unwrap();
        let conn = open(&dir, &content_db_path).unwrap();

        assert!(reading_log::list_recent(&conn, 10).unwrap().is_empty());
        for _ in 0..3 {
            reading_log::record(&conn, "2026-09-10", 1, 1, 1).unwrap();
        }
        reading_log::record(&conn, "2026-09-10", 45, 8, 1).unwrap();
        reading_log::record(&conn, "2026-09-11", 43, 3, 2).unwrap();
        // Genesis 1 again on the 11th, in another translation.
        reading_log::record(&conn, "2026-09-11", 1, 1, 2).unwrap();

        let rows: i64 = conn.query_row("SELECT COUNT(*) FROM reading_log", [], |r| r.get(0)).unwrap();
        assert_eq!(rows, 4, "one row per chapter per day");

        let recent = reading_log::list_recent(&conn, 10).unwrap();
        let chapters: Vec<(i64, i64)> = recent.iter().map(|e| (e.book_id, e.chapter)).collect();
        assert_eq!(chapters, vec![(1, 1), (43, 3), (45, 8)]);
        assert_eq!(recent[0].date, "2026-09-11");
        assert_eq!(recent[0].translation_id, Some(2));
        assert_eq!(reading_log::list_recent(&conn, 2).unwrap().len(), 2);

        drop(conn);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Reading plan catch-up (F3.3): shifting moves the start date by whole
    /// days and touches no completions; skipping marks a run of days in one
    /// go and its undo removes exactly those.
    #[test]
    fn reading_plan_catch_up_shifts_and_marks() {
        use queries::reading_plans as plans;

        let dir = std::env::temp_dir().join(format!("sojourner-catchup-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let content_db_path = dir.join("content.db");
        open_content_db(&content_db_path).unwrap();
        let conn = open(&dir, &content_db_path).unwrap();

        let p = plans::start_plan(&conn, "test-plan", "2026-09-01".into()).unwrap();
        assert_eq!(p.current_day, 1);
        plans::mark_day(&conn, "test-plan", 1).unwrap();

        let shifted = plans::shift_start(&conn, "test-plan", 5).unwrap();
        assert_eq!(shifted.start_date, "2026-09-06");
        assert_eq!(shifted.completed_days, vec![1]);
        let back = plans::shift_start(&conn, "test-plan", -2).unwrap();
        assert_eq!(back.start_date, "2026-09-04");

        let skipped = plans::set_days(&conn, "test-plan", &[2, 3, 4], true).unwrap();
        assert_eq!(skipped.completed_days, vec![1, 2, 3, 4]);
        assert_eq!(skipped.current_day, 5);
        let undone = plans::set_days(&conn, "test-plan", &[2, 3, 4], false).unwrap();
        assert_eq!(undone.completed_days, vec![1]);
        assert_eq!(undone.current_day, 2);

        assert!(plans::shift_start(&conn, "no-such-plan", 1).is_err());

        drop(conn);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Backlinks (USER_MIGRATION_0012): a note's references are replaced on
    /// each save, a chapter lists the notes elsewhere that mention it (not
    /// its own notes), Trash hides them, and a purge cascades the rows away.
    #[test]
    fn backlinks_follow_note_refs_and_soft_delete() {
        use crate::models::{NoteKind, NoteRefInput, TrashKind};
        use queries::{notes, trash};

        let dir = std::env::temp_dir().join(format!("sojourner-backlinks-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let content_db_path = dir.join("content.db");
        open_content_db(&content_db_path).unwrap();
        let conn = open(&dir, &content_db_path).unwrap();

        let r = |chapter: i64, vs: Option<i64>, ve: Option<i64>| NoteRefInput { book_id: 45, chapter, verse_start: vs, verse_end: ve };
        // A note on Genesis 1 mentioning Romans 8:28 and Romans 8 as a whole.
        let note = notes::create(&conn, 1, 1, 1, 1, "see Romans 8:28".into(), None, Some(vec![r(8, Some(28), None), r(8, None, None)])).unwrap();
        // A chapter note on Romans 8 itself mentioning 8:1 -- same chapter, so never a backlink.
        notes::create_chapter_note(&conn, 45, 8, "own chapter".into(), Some(vec![r(8, Some(1), Some(1))])).unwrap();
        // A chapter note on John 1 mentioning Romans 8:1-4.
        let cn = notes::create_chapter_note(&conn, 43, 1, "cf. Rom 8:1-4".into(), Some(vec![r(8, Some(1), Some(4))])).unwrap();

        let links = notes::list_backlinks(&conn, 45, 8).unwrap();
        assert_eq!(links.len(), 3, "{links:?}");
        assert!(links.iter().all(|l| !(l.book_id == 45 && l.chapter == 8)));
        let single = links.iter().find(|l| l.kind == NoteKind::Note && l.ref_verse_start == Some(28)).unwrap();
        assert_eq!(single.ref_verse_end, Some(28), "a missing end means a single verse");
        assert!(links.iter().any(|l| l.kind == NoteKind::Note && l.ref_verse_start.is_none()), "chapter-only mention");
        assert!(links.iter().any(|l| l.kind == NoteKind::ChapterNote && l.id == cn.id && l.ref_verse_end == Some(4)));

        // Saving again replaces the rows; None leaves them alone.
        notes::update(&conn, note.id, "now about Genesis".into(), Some(vec![])).unwrap();
        assert_eq!(notes::list_backlinks(&conn, 45, 8).unwrap().len(), 1);
        notes::set_refs(&conn, NoteKind::Note, note.id, &[r(8, Some(2), Some(3))]).unwrap();
        notes::update(&conn, note.id, "unchanged refs".into(), None).unwrap();
        assert_eq!(notes::list_backlinks(&conn, 45, 8).unwrap().len(), 2);

        // Trash hides, restore shows, purge cascades.
        notes::delete_chapter_note(&conn, cn.id).unwrap();
        assert_eq!(notes::list_backlinks(&conn, 45, 8).unwrap().len(), 1);
        assert!(trash::restore(&conn, TrashKind::ChapterNote, cn.id).unwrap());
        assert_eq!(notes::list_backlinks(&conn, 45, 8).unwrap().len(), 2);
        notes::delete_chapter_note(&conn, cn.id).unwrap();
        assert!(trash::purge(&conn, TrashKind::ChapterNote, cn.id).unwrap());
        let rows: i64 = conn.query_row("SELECT COUNT(*) FROM note_refs WHERE chapter_note_id = ?1", [cn.id], |r| r.get(0)).unwrap();
        assert_eq!(rows, 0, "purge cascades note_refs");

        drop(conn);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
