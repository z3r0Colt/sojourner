// The Trash: soft-deleted passage notes, chapter notes, and prayer journal
// entries (see USER_MIGRATION_0011). Rows sit here with `deleted_at` set
// until they are restored, purged by hand, or swept at startup once older
// than `RETENTION_DAYS`.
use super::{notes, prayer_journal};
use crate::models::{TrashContents, TrashKind};
use rusqlite::{params, Connection};

pub const RETENTION_DAYS: i64 = 30;

fn table(kind: TrashKind) -> &'static str {
    match kind {
        TrashKind::Note => "notes",
        TrashKind::ChapterNote => "chapter_notes",
        TrashKind::PrayerEntry => "prayer_entries",
    }
}

pub fn list(conn: &Connection) -> anyhow::Result<TrashContents> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM notes WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC",
        notes::SELECT_COLS
    ))?;
    let notes_list = stmt.query_map([], notes::map_note_row)?.collect::<Result<Vec<_>, _>>()?;

    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM chapter_notes WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC",
        notes::CHAPTER_COLS
    ))?;
    let chapter_notes = stmt.query_map([], notes::map_chapter_note_row)?.collect::<Result<Vec<_>, _>>()?;

    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM prayer_entries WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC",
        prayer_journal::SELECT_COLS
    ))?;
    let prayer_entries = stmt.query_map([], prayer_journal::map_row)?.collect::<Result<Vec<_>, _>>()?;

    Ok(TrashContents { notes: notes_list, chapter_notes, prayer_entries })
}

/// Clears `deleted_at` so the row reappears everywhere. Returns whether a
/// deleted row with that id existed.
pub fn restore(conn: &Connection, kind: TrashKind, id: i64) -> anyhow::Result<bool> {
    let n = conn.execute(
        &format!("UPDATE {} SET deleted_at = NULL WHERE id = ?1 AND deleted_at IS NOT NULL", table(kind)),
        params![id],
    )?;
    Ok(n > 0)
}

/// Hard-deletes one Trash row for good. Only rows already in the Trash are
/// eligible, so a live note can never be purged by accident.
pub fn purge(conn: &Connection, kind: TrashKind, id: i64) -> anyhow::Result<bool> {
    let n = conn.execute(
        &format!("DELETE FROM {} WHERE id = ?1 AND deleted_at IS NOT NULL", table(kind)),
        params![id],
    )?;
    Ok(n > 0)
}

/// Startup sweep: hard-deletes everything that has sat in the Trash longer
/// than `RETENTION_DAYS`. `deleted_at` is RFC 3339 UTC, which sorts as text,
/// so a string comparison against the cutoff is exact. Returns rows removed.
pub fn sweep_expired(conn: &Connection) -> anyhow::Result<usize> {
    let cutoff = (chrono::Utc::now() - chrono::Duration::days(RETENTION_DAYS)).to_rfc3339();
    let mut removed = 0;
    for kind in [TrashKind::Note, TrashKind::ChapterNote, TrashKind::PrayerEntry] {
        removed += conn.execute(
            &format!("DELETE FROM {} WHERE deleted_at IS NOT NULL AND deleted_at < ?1", table(kind)),
            params![cutoff],
        )?;
    }
    Ok(removed)
}
