// Trust/data-safety: automatic backups, portable export/import, and an
// integrity check -- all built on SQLite's own primitives rather than a
// bespoke serialization format, so there's no risk of a hand-rolled export
// silently dropping a field some future table adds.
//
// Backups and exports both use `VACUUM INTO`, SQLite's blessed way to take a
// consistent snapshot of a live database without disturbing the connection
// that's using it (unlike a raw file copy, which can race a concurrent
// writer). Import and restore-from-backup are different: they replace the
// live file out from under an open connection, which SQLite (and Windows'
// file locking) don't support while a `Connection` holds it open. Both are
// staged instead -- the chosen file is copied to a `user.db.pending-import`
// marker, swapped in the next time the app starts (before anything opens
// user.db) -- and the caller is told a restart is required.
use rusqlite::Connection;
use std::path::{Path, PathBuf};

const MAX_BACKUPS: usize = 10;
const PENDING_IMPORT_MARKER: &str = "user.db.pending-import";

fn backups_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("backups")
}

pub struct BackupInfo {
    pub path: PathBuf,
    pub file_name: String,
    pub created_at: String,
    pub size_bytes: u64,
}

/// Snapshots the live user.db (main schema only -- not the attached,
/// separately-shipped content.db) to `backups/user-<timestamp>.db`, then
/// prunes down to the `MAX_BACKUPS` most recent.
pub fn create_backup(conn: &Connection, app_data_dir: &Path) -> anyhow::Result<PathBuf> {
    let dir = backups_dir(app_data_dir);
    std::fs::create_dir_all(&dir)?;
    let timestamp = chrono::Utc::now().format("%Y%m%dT%H%M%SZ");
    let path = dir.join(format!("user-{timestamp}.db"));
    conn.execute("VACUUM main INTO ?1", [path.to_string_lossy().to_string()])?;
    prune_backups(app_data_dir, MAX_BACKUPS)?;

    if let Some(sync_dir) = get_setting(conn, "backup_sync_folder")? {
        let sync_dir = PathBuf::from(sync_dir);
        if sync_dir.is_dir() {
            let dest = sync_dir.join(path.file_name().expect("just built with a file name"));
            // Best-effort: a sync folder can be temporarily unavailable (an
            // unmounted external drive, a cloud-sync client not running)
            // without that being a reason to fail the backup itself.
            //
            // It can also be slow. `is_dir()` above answers true for a mapped
            // network drive that has since stopped responding, and the copy
            // then blocks until the SMB timeout -- minutes, not seconds, on a
            // file this size. That is survivable only because every caller of
            // this function is now off the main thread (see the note at the
            // top of `commands::backup`); it must not be called from a
            // synchronous command.
            let _ = std::fs::copy(&path, dest);
        }
    }

    Ok(path)
}

pub fn list_backups(app_data_dir: &Path) -> anyhow::Result<Vec<BackupInfo>> {
    let dir = backups_dir(app_data_dir);
    if !dir.is_dir() {
        return Ok(vec![]);
    }
    let mut backups = Vec::new();
    for entry in std::fs::read_dir(&dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("db") {
            continue;
        }
        let metadata = entry.metadata()?;
        let created_at = metadata
            .modified()
            .ok()
            .map(chrono::DateTime::<chrono::Utc>::from)
            .map(|dt| dt.to_rfc3339())
            .unwrap_or_default();
        backups.push(BackupInfo {
            file_name: path.file_name().unwrap().to_string_lossy().to_string(),
            path,
            created_at,
            size_bytes: metadata.len(),
        });
    }
    backups.sort_by(|a, b| b.file_name.cmp(&a.file_name));
    Ok(backups)
}

fn prune_backups(app_data_dir: &Path, keep: usize) -> anyhow::Result<()> {
    let backups = list_backups(app_data_dir)?;
    for old in backups.into_iter().skip(keep) {
        let _ = std::fs::remove_file(&old.path);
    }
    Ok(())
}

/// Exports a snapshot of user.db to an arbitrary user-chosen path (the
/// frontend gets this path via a save dialog) -- the same safe primitive as
/// a backup, just not confined to the backups folder or subject to pruning.
pub fn export_database(conn: &Connection, dest_path: &Path) -> anyhow::Result<()> {
    conn.execute("VACUUM main INTO ?1", [dest_path.to_string_lossy().to_string()])?;
    Ok(())
}

/// Validates that `path` at least looks like one of this app's user
/// databases (opens as SQLite, has the `settings` table every schema
/// version has had since the first migration) before staging it -- so a
/// wrong file is rejected immediately with a clear error rather than
/// silently bricking the app on next launch.
///
/// The schema version is checked here as well as in `run_migrations`,
/// because by the time that runs the file has already replaced user.db: the
/// swap happens at startup, before anything opens the database, so a
/// refusal there is an app that will not start. Refusing at import time is a
/// message in the Settings pane with the reader's own database still in
/// place.
fn validate_candidate_db(path: &Path) -> anyhow::Result<()> {
    let conn = Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    conn.query_row("SELECT 1 FROM settings LIMIT 1", [], |_| Ok(()))
        .or_else(|_| conn.query_row("SELECT COUNT(*) FROM settings", [], |_| Ok(())))?;

    let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    let known = crate::db::schema::USER_MIGRATIONS.len();
    anyhow::ensure!(
        version as usize <= known,
        "this database was written by a newer version of the app \
         (schema {version}, this build knows {known}) -- update the app and try again",
    );
    Ok(())
}

fn stage_pending_import(app_data_dir: &Path, source_path: &Path) -> anyhow::Result<()> {
    validate_candidate_db(source_path)?;
    std::fs::copy(source_path, app_data_dir.join(PENDING_IMPORT_MARKER))?;
    Ok(())
}

/// Stages `source_path` (a user-picked file) to replace user.db on next
/// launch.
pub fn stage_import(app_data_dir: &Path, source_path: &Path) -> anyhow::Result<()> {
    stage_pending_import(app_data_dir, source_path)
}

/// Stages a previously-taken backup to replace user.db on next launch.
pub fn stage_restore(app_data_dir: &Path, backup_path: &Path) -> anyhow::Result<()> {
    stage_pending_import(app_data_dir, backup_path)
}

/// Called once at startup, before user.db is ever opened. If a
/// stage_import/stage_restore left a pending file, the *current* user.db is
/// snapshotted into `backups/` first -- write-ahead log and all -- and the
/// pending file then takes its place.
pub fn apply_pending_import(app_data_dir: &Path) -> anyhow::Result<()> {
    let pending = app_data_dir.join(PENDING_IMPORT_MARKER);
    if !pending.is_file() {
        return Ok(());
    }
    let user_db = app_data_dir.join("user.db");
    if user_db.is_file() {
        let dir = backups_dir(app_data_dir);
        std::fs::create_dir_all(&dir)?;
        let timestamp = chrono::Utc::now().format("%Y%m%dT%H%M%SZ");
        let dest = dir.join(format!("user-pre-import-{timestamp}.db"));

        // This is the reader's only way back, and the UI promises it ("Your
        // current data is backed up first"), so it must hold everything --
        // including whatever is still sitting in user.db-wal, which a raw
        // file copy would miss and the lines below would then delete. That
        // is not a corner case: the WAL survives exactly when the app did
        // not close cleanly, which is when someone reaches for a restore.
        // Opening the database lets SQLite recover the WAL first; the
        // snapshot is then taken the same way `create_backup` takes one.
        // Nothing has opened user.db yet this run, so this is safe here and
        // nowhere else.
        let snapshot = Connection::open(&user_db).and_then(|conn| {
            conn.execute("VACUUM main INTO ?1", [dest.to_string_lossy().to_string()])?;
            Ok(())
        });
        if let Err(e) = snapshot {
            // A database too damaged to snapshot is also the one most likely
            // to be the reason for the import. Keep what can be kept rather
            // than refusing to start.
            eprintln!("[import] could not snapshot user.db ({e}); falling back to a plain copy");
            let _ = std::fs::remove_file(&dest);
            std::fs::copy(&user_db, &dest)?;
        }
    }
    std::fs::rename(&pending, &user_db)?;
    // A stale WAL/SHM from the previous database would otherwise be replayed
    // against the newly-swapped-in file, corrupting it.
    let _ = std::fs::remove_file(app_data_dir.join("user.db-wal"));
    let _ = std::fs::remove_file(app_data_dir.join("user.db-shm"));
    Ok(())
}

/// Runs SQLite's own integrity check against every database this connection
/// holds open: user.db, the attached content.db, and -- when a resource pack
/// is installed -- its library.db. `Ok(true)` with a single "ok" element
/// means clean; anything else is a description of the corruption found.
pub fn quick_check(conn: &Connection) -> anyhow::Result<Vec<String>> {
    let mut issues = Vec::new();
    let mut schemas: Vec<String> = vec!["main".into(), "content".into()];
    schemas.extend(crate::db::attached_library_schemas(conn));
    for schema in schemas {
        let mut stmt = conn.prepare(&format!("PRAGMA {schema}.quick_check"))?;
        let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
        for row in rows {
            let row = row?;
            if row != "ok" {
                issues.push(format!("{schema}: {row}"));
            }
        }
    }
    Ok(issues)
}

fn get_setting(conn: &Connection, key: &str) -> anyhow::Result<Option<String>> {
    crate::db::queries::settings::get(conn, key)
}

pub fn set_backup_sync_folder(conn: &Connection, folder: Option<String>) -> anyhow::Result<()> {
    match folder {
        Some(folder) => crate::db::queries::settings::set(conn, "backup_sync_folder", &folder),
        None => crate::db::queries::settings::delete(conn, "backup_sync_folder"),
    }
}

pub fn get_backup_sync_folder(conn: &Connection) -> anyhow::Result<Option<String>> {
    get_setting(conn, "backup_sync_folder")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    fn temp_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("sojourner-backup-test-{label}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn backup_and_restore_round_trip_preserves_data() {
        let dir = temp_dir("roundtrip");
        let content_db_path = dir.join("content.db");
        db::open_content_db(&content_db_path).unwrap();
        let conn = db::open(&dir, &content_db_path).unwrap();

        conn.execute(
            "INSERT INTO highlights (book_id, chapter, verse_start, verse_end, color, created_at, updated_at)
             VALUES (1, 1, 1, 1, 'yellow', '2026-01-01', '2026-01-01')",
            [],
        )
        .unwrap();

        let backup_path = create_backup(&conn, &dir).unwrap();
        assert!(backup_path.is_file());

        // The backup is a real, independently-openable SQLite file with the
        // data as of the moment VACUUM INTO ran.
        let backup_conn = Connection::open(&backup_path).unwrap();
        let color: String = backup_conn
            .query_row("SELECT color FROM highlights WHERE book_id = 1", [], |r| r.get(0))
            .unwrap();
        assert_eq!(color, "yellow");

        let backups = list_backups(&dir).unwrap();
        assert_eq!(backups.len(), 1);
        assert_eq!(backups[0].file_name, backup_path.file_name().unwrap().to_string_lossy());

        drop(conn);
        drop(backup_conn);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn quick_check_reports_ok_on_a_freshly_migrated_database() {
        let dir = temp_dir("quickcheck");
        let content_db_path = dir.join("content.db");
        db::open_content_db(&content_db_path).unwrap();
        let conn = db::open(&dir, &content_db_path).unwrap();

        let issues = quick_check(&conn).unwrap();
        assert!(issues.is_empty(), "expected no issues, got {issues:?}");

        drop(conn);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// The safety backup must hold work that is still only in the WAL.
    ///
    /// The WAL is left behind whenever the app did not close cleanly -- a
    /// crash, a force-kill, a power cut -- and that is precisely when a
    /// reader reaches for an import or a restore. A plain `fs::copy` of
    /// user.db captures none of it, and `apply_pending_import` deletes the
    /// WAL straight afterwards, so the "your current data is backed up
    /// first" promise used to quietly lose the last session's work.
    #[test]
    fn the_pre_import_backup_holds_work_still_in_the_write_ahead_log() {
        let dir = temp_dir("wal");
        let content_db_path = dir.join("content.db");
        db::open_content_db(&content_db_path).unwrap();

        let live = dir.join("live");
        std::fs::create_dir_all(&live).unwrap();
        let conn = db::open(&live, &content_db_path).unwrap();
        // Stop SQLite folding the WAL back into user.db, so the row below
        // exists *only* in user.db-wal, as after an unclean shutdown.
        conn.pragma_update(None, "wal_autocheckpoint", 0).unwrap();
        conn.execute(
            "INSERT INTO bookmarks (book_id, chapter, label, created_at) VALUES (7, 7, 'only-in-the-wal', '2026-01-01')",
            [],
        )
        .unwrap();
        assert!(live.join("user.db-wal").is_file(), "the test needs a WAL on disk");

        // A second connection keeps the database open, so copying the three
        // files captures the same on-disk state a killed process leaves.
        let keep_open = db::open(&live, &content_db_path).unwrap();
        let crashed = dir.join("crashed");
        std::fs::create_dir_all(&crashed).unwrap();
        for name in ["user.db", "user.db-wal", "user.db-shm"] {
            if live.join(name).is_file() {
                std::fs::copy(live.join(name), crashed.join(name)).unwrap();
            }
        }
        drop(keep_open);
        drop(conn);

        // Something -- anything -- to import over the top of it.
        let incoming = dir.join("incoming.db");
        {
            let other_content = dir.join("other-content.db");
            db::open_content_db(&other_content).unwrap();
            let other = db::open(&dir.join("other"), &other_content).unwrap();
            drop(other);
            std::fs::copy(dir.join("other").join("user.db"), &incoming).unwrap();
        }

        stage_import(&crashed, &incoming).unwrap();
        apply_pending_import(&crashed).unwrap();

        let backups = list_backups(&crashed).unwrap();
        let pre = backups
            .iter()
            .find(|b| b.file_name.contains("pre-import"))
            .expect("an import must leave a pre-import backup");
        let saved = Connection::open(&pre.path).unwrap();
        let label: Result<String, _> =
            saved.query_row("SELECT label FROM bookmarks WHERE book_id = 7", [], |r| r.get(0));
        assert_eq!(
            label.unwrap_or_default(),
            "only-in-the-wal",
            "the safety backup dropped work that was still in the write-ahead log"
        );

        drop(saved);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn pending_import_swaps_the_file_and_backs_up_the_original() {
        let dir = temp_dir("import");
        let content_db_path = dir.join("content.db");
        db::open_content_db(&content_db_path).unwrap();
        let conn = db::open(&dir, &content_db_path).unwrap();
        conn.execute(
            "INSERT INTO bookmarks (book_id, chapter, label, created_at) VALUES (1, 1, 'original', '2026-01-01')",
            [],
        )
        .unwrap();
        drop(conn); // nothing may hold user.db open while we stage/apply a swap

        // Build a *different* database to import, with its own distinguishing row.
        let import_source = dir.join("incoming.db");
        {
            let other_content = dir.join("other-content.db");
            db::open_content_db(&other_content).unwrap();
            let other = db::open(&dir.join("other"), &other_content).unwrap();
            other
                .execute(
                    "INSERT INTO bookmarks (book_id, chapter, label, created_at) VALUES (2, 2, 'imported', '2026-01-01')",
                    [],
                )
                .unwrap();
            drop(other);
            std::fs::copy(dir.join("other").join("user.db"), &import_source).unwrap();
        }

        stage_import(&dir, &import_source).unwrap();
        apply_pending_import(&dir).unwrap();

        let reopened = db::open(&dir, &content_db_path).unwrap();
        let label: String = reopened
            .query_row("SELECT label FROM bookmarks LIMIT 1", [], |r| r.get(0))
            .unwrap();
        assert_eq!(label, "imported");

        // The pre-import original was backed up rather than silently discarded.
        let backups = list_backups(&dir).unwrap();
        assert!(backups.iter().any(|b| b.file_name.contains("pre-import")));

        drop(reopened);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
