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
    // Before the migrations: USER_MIGRATION_0016 builds the search indexes
    // with `html_text()`, and every write to a note, a sermon, or an
    // illustration goes through a trigger that calls it from then on.
    register_functions(&conn)?;
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

/// Puts `html_text(x)` on the connection: the words of a rich-text body,
/// with its markup left out (see `crate::text`).
///
/// The search triggers on notes, chapter notes, sermons, and illustrations
/// call it, so a connection to `user.db` without it cannot write to those
/// tables at all -- which is why this is done here, in the one place the app
/// opens that file, and why the failure is loud rather than an index that
/// quietly drifts out of step with the text.
pub fn register_functions(conn: &Connection) -> rusqlite::Result<()> {
    use rusqlite::functions::FunctionFlags;
    conn.create_scalar_function(
        "html_text",
        1,
        FunctionFlags::SQLITE_UTF8 | FunctionFlags::SQLITE_DETERMINISTIC | FunctionFlags::SQLITE_INNOCUOUS,
        |ctx| {
            let html: Option<String> = ctx.get(0)?;
            Ok(html.map(|h| crate::text::html_to_text(&h)))
        },
    )
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
            // sermon_sources is here because USER_MIGRATION_0018 rebuilds that
            // table wholesale to widen its `kind` constraint; a citation lost
            // in the copy is a citation that would be lost for real.
            ["notes", "highlights", "chapter_notes", "prayer_entries", "bookmarks", "memory_verses", "settings", "reading_plan_progress", "reading_plan_completions", "sermon_sources"]
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
        // It has to be *in* the log, not at the top of it: a real database may
        // already hold chapters read today, and re-recording one keeps the row
        // it already had, so the newest id is not necessarily this one.
        let recent = queries::reading_log::list_recent(&conn, 50).unwrap();
        assert!(
            recent.iter().any(|e| (e.book_id, e.chapter) == (1, 1)),
            "the chapter just recorded should be in the recent list",
        );
        // USER_MIGRATION_0014: custom plans and the schedule map exist and are
        // empty, and progress on bundled plans still lists after migrating.
        for t in ["user_reading_plans", "user_reading_plan_readings", "reading_plan_schedule"] {
            let n: i64 = conn.query_row(&format!("SELECT COUNT(*) FROM {t}"), [], |r| r.get(0)).unwrap();
            assert_eq!(n, 0, "{t} should start empty");
        }
        let progress = queries::reading_plans::list_progress(&conn).unwrap();
        let progress_rows = before.iter().find(|(t, _)| *t == "reading_plan_progress").map(|(_, n)| *n).unwrap_or(0);
        assert_eq!(progress.len() as i64, progress_rows, "every plan in progress still lists");

        // USER_MIGRATION_0015: every sermon table exists and is queryable, and
        // a sermon written by hand is found through sermons_fts. What they
        // hold is the reader's own business -- this runs against a real
        // database, which by now may have sermons in it.
        for t in [
            "sermons", "sermon_series", "sermon_passages", "sermon_sources", "sermon_tags",
            "sermon_events", "illustrations", "illustration_tags", "illustration_uses",
        ] {
            conn.query_row::<i64, _, _>(&format!("SELECT COUNT(*) FROM {t}"), [], |r| r.get(0))
                .unwrap_or_else(|e| panic!("{t} should exist and be queryable: {e}"));
        }
        // The old Sermon Notes tables were dropped in USER_MIGRATION_0010, so
        // the new names can never collide with a table still holding data.
        for t in ["sermon_notes", "sermon_outlines", "sermon_note_tags"] {
            let n: i64 = conn
                .query_row("SELECT COUNT(*) FROM sqlite_master WHERE name = ?1", [t], |r| r.get(0))
                .unwrap();
            assert_eq!(n, 0, "{t} was dropped in 0010 and must not come back");
        }
        conn.execute(
            "INSERT INTO sermons (title, big_idea, body, created_at, updated_at)
             VALUES ('Test', 'A big idea', '<h2>The <em>steadfastness</em> of God</h2>', '2026-01-01', '2026-01-01')",
            [],
        )
        .unwrap();
        let id = conn.last_insert_rowid();
        let hit: i64 = conn
            .query_row("SELECT COUNT(*) FROM sermons_fts WHERE sermons_fts MATCH 'steadfastness'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(hit, 1, "sermons_fts indexes the body");
        // USER_MIGRATION_0016: it indexes the words, not the markup they came in.
        let by_tag: i64 = conn
            .query_row("SELECT COUNT(*) FROM sermons_fts WHERE sermons_fts MATCH 'em'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(by_tag, 0, "a tag name is not a word of the sermon");
        conn.execute("DELETE FROM sermons WHERE id = ?1", [id]).unwrap();

        // USER_MIGRATION_0018: the rebuilt sermon_sources takes the two new
        // kinds, still refuses a nonsense one, and kept the index that went
        // with the table it replaced -- a dropped index here is silent, and
        // every sermon's bibliography reads through it.
        let index: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_sermon_sources_sermon'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(index, 1, "idx_sermon_sources_sermon must survive the table rebuild");

        conn.execute(
            "INSERT INTO sermons (title, body, created_at, updated_at) VALUES ('Sources', '', '2026-01-01', '2026-01-01')",
            [],
        )
        .unwrap();
        let sermon_id = conn.last_insert_rowid();
        for kind in ["encyclopedia", "atlas"] {
            conn.execute(
                "INSERT INTO sermon_sources (sermon_id, kind, ref_id, label, created_at)
                 VALUES (?1, ?2, 'x', 'A label', '2026-01-01')",
                rusqlite::params![sermon_id, kind],
            )
            .unwrap_or_else(|e| panic!("{kind} should be an allowed source kind: {e}"));
        }
        assert!(
            conn.execute(
                "INSERT INTO sermon_sources (sermon_id, kind, ref_id, label, created_at)
                 VALUES (?1, 'nonsense', 'x', 'A label', '2026-01-01')",
                rusqlite::params![sermon_id],
            )
            .is_err(),
            "the widened CHECK still has to reject a kind the app cannot open",
        );
        conn.execute("DELETE FROM sermons WHERE id = ?1", [sermon_id]).unwrap();

        drop(conn);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// The upgrade path for a database that already holds writing:
    /// USER_MIGRATION_0016 rebuilds four search indexes, and what was in them
    /// has to come back as words. Built at version 15 from the schema itself,
    /// seeded the way the app of that version would have, then opened.
    #[test]
    fn migrating_an_older_database_rebuilds_its_search_indexes_from_the_text() {
        use queries::{illustrations, search, sermons};
        use crate::models::IllustrationFilter;

        let dir = std::env::temp_dir().join(format!("sojourner-fts-migrate-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let content_db_path = dir.join("content.db");
        open_content_db(&content_db_path).unwrap();

        // A user.db as it stood before this migration.
        {
            let mut conn = Connection::open(dir.join("user.db")).unwrap();
            conn.execute_batch(PERFORMANCE_PRAGMAS).unwrap();
            run_migrations(&mut conn, "main", &schema::USER_MIGRATIONS[..15]).unwrap();
            let now = "2026-09-12T12:00:00+00:00";
            conn.execute(
                "INSERT INTO notes (book_id, chapter, verse_start, verse_end, body, created_at, updated_at)
                 VALUES (58, 6, 13, 20, '<p>The <strong>oath</strong> of God is <em>sworn</em>, and <a href=\"#\">bound</a>.</p>', ?1, ?1)",
                [now],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO notes (book_id, chapter, verse_start, verse_end, body, created_at, updated_at)
                 VALUES (45, 3, 21, 21, '<p>a righteousness <em>with</em>out the law</p>', ?1, ?1)",
                [now],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO chapter_notes (book_id, chapter, body, created_at, updated_at)
                 VALUES (43, 3, '<p>Nicodemus came <strong>by night</strong>.</p>', ?1, ?1)",
                [now],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO sermons (title, big_idea, body, created_at, updated_at)
                 VALUES ('The oath of God', 'God swore by himself.', '<h2>Bound</h2><p>by two <strong>unchangeable</strong> things.</p>', ?1, ?1)",
                [now],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO illustrations (title, body, source_label, created_at, updated_at)
                 VALUES ('The keeper', '<p>A <strong>lighthouse</strong> keeper who never slept.</p>', 'Told by a friend', ?1, ?1)",
                [now],
            )
            .unwrap();

            // The old index held the markup. That is what is being migrated away from.
            let by_tag: i64 = conn
                .query_row("SELECT COUNT(*) FROM notes_fts WHERE notes_fts MATCH 'strong'", [], |r| r.get(0))
                .unwrap();
            assert_eq!(by_tag, 1, "before: a tag name matched");
            let split: i64 = conn
                .query_row("SELECT COUNT(*) FROM notes_fts WHERE notes_fts MATCH 'without'", [], |r| r.get(0))
                .unwrap();
            assert_eq!(split, 0, "before: a word broken by formatting did not");
        }

        let conn = open(&dir, &content_db_path).unwrap();
        let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(version as usize, schema::USER_MIGRATIONS.len());

        // Every row is still there.
        for (table, expected) in [("notes", 2), ("chapter_notes", 1), ("sermons", 1), ("illustrations", 1)] {
            let n: i64 = conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0)).unwrap();
            assert_eq!(n, expected, "{table} survived the migration");
        }

        // And each index now answers for the words rather than the markup.
        assert_eq!(search::search_notes(&conn, "oath", 10).unwrap().len(), 1);
        assert_eq!(search::search_notes(&conn, "without", 10).unwrap().len(), 1, "a word formatting had split");
        assert_eq!(search::search_notes(&conn, "Nicodemus", 10).unwrap().len(), 1, "chapter notes too");
        assert!(search::search_notes(&conn, "strong", 10).unwrap().is_empty(), "no longer by a tag name");
        assert!(search::search_notes(&conn, "href", 10).unwrap().is_empty(), "nor by an attribute");
        let hit = &search::search_notes(&conn, "sworn", 10).unwrap()[0];
        assert!(!hit.snippet.contains('<'), "the snippet reads as prose: {}", hit.snippet);

        assert_eq!(sermons::search(&conn, "unchangeable", 10).unwrap().len(), 1);
        assert!(sermons::search(&conn, "strong", 10).unwrap().is_empty());
        let found = illustrations::list(
            &conn,
            &IllustrationFilter { query: Some("lighthouse".into()), ..Default::default() },
        )
        .unwrap();
        assert_eq!(found.len(), 1);
        let by_tag = illustrations::list(
            &conn,
            &IllustrationFilter { query: Some("strong".into()), ..Default::default() },
        )
        .unwrap();
        assert!(by_tag.is_empty());

        drop(conn);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// USER_MIGRATION_0016: the search indexes hold what was written, not the
    /// markup it was written in. A note is found by its words -- including a
    /// word formatting had broken in half -- and never by the name of a tag;
    /// its snippet comes back as prose; and an update still reindexes it.
    #[test]
    fn search_indexes_hold_the_words_and_not_the_markup() {
        use queries::{notes, search, sermons};
        use crate::models::SermonInput;

        let dir = std::env::temp_dir().join(format!("sojourner-fts-text-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let content_db_path = dir.join("content.db");
        open_content_db(&content_db_path).unwrap();
        let conn = open(&dir, &content_db_path).unwrap();

        let note = notes::create(
            &conn,
            58,
            6,
            13,
            20,
            "<p>The <strong>oath</strong> of God is <em>sworn</em>, and <a href=\"#\">bound</a> by two things.</p>".into(),
            None,
            None,
        )
        .unwrap();

        assert_eq!(search::search_notes(&conn, "oath", 10).unwrap().len(), 1, "found by its words");
        assert!(search::search_notes(&conn, "strong", 10).unwrap().is_empty(), "not by a tag name");
        assert!(search::search_notes(&conn, "href", 10).unwrap().is_empty(), "not by an attribute");
        let hit = &search::search_notes(&conn, "sworn", 10).unwrap()[0];
        assert!(!hit.snippet.contains('<'), "the snippet is prose, not markup: {}", hit.snippet);
        assert!(hit.snippet.contains("[sworn]"), "the match is still marked: {}", hit.snippet);

        // A word split by formatting is one word.
        notes::update(&conn, note.id, "<p>a righteousness <em>with</em>out the law</p>".into(), None).unwrap();
        assert_eq!(search::search_notes(&conn, "without", 10).unwrap().len(), 1, "reindexed, and the word is whole");
        assert!(search::search_notes(&conn, "oath", 10).unwrap().is_empty(), "the old text is gone");

        // The same holds for a manuscript, whose title is plain text already.
        let sermon = sermons::create(
            &conn,
            &SermonInput {
                title: Some("The oath of God".into()),
                body: Some("<h2>Bound</h2><p>by two <strong>unchangeable</strong> things.</p>".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(sermons::search(&conn, "unchangeable", 10).unwrap().len(), 1);
        assert_eq!(sermons::search(&conn, "oath", 10).unwrap().len(), 1, "the title is indexed too");
        assert!(sermons::search(&conn, "strong", 10).unwrap().is_empty(), "not by a tag name");
        sermons::delete(&conn, sermon.id).unwrap();
        assert!(sermons::search(&conn, "unchangeable", 10).unwrap().is_empty(), "the Trash is filtered out");

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

        // Going back to a chapter later the same day puts it at the top
        // again: "Recent chapters" is what was read last, not what was read
        // first, and the row count still holds.
        reading_log::record(&conn, "2026-09-11", 43, 3, 2).unwrap();
        let chapters: Vec<(i64, i64)> = reading_log::list_recent(&conn, 10).unwrap().iter().map(|e| (e.book_id, e.chapter)).collect();
        assert_eq!(chapters, vec![(43, 3), (1, 1), (45, 8)]);
        let rows: i64 = conn.query_row("SELECT COUNT(*) FROM reading_log", [], |r| r.get(0)).unwrap();
        assert_eq!(rows, 4, "still one row per chapter per day");
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
