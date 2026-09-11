use super::NOT_DELETED;
use crate::models::PrayerEntry;
use rusqlite::{params, Connection};

pub(super) const SELECT_COLS: &str = "id, entry_date, mode, adoration, confession, thanksgiving, supplication, free_text, book_id, chapter, verse_start, verse_end, created_at, updated_at, deleted_at";

pub(super) fn map_row(r: &rusqlite::Row) -> rusqlite::Result<PrayerEntry> {
    Ok(PrayerEntry {
        id: r.get(0)?,
        entry_date: r.get(1)?,
        mode: r.get(2)?,
        adoration: r.get(3)?,
        confession: r.get(4)?,
        thanksgiving: r.get(5)?,
        supplication: r.get(6)?,
        free_text: r.get(7)?,
        book_id: r.get(8)?,
        chapter: r.get(9)?,
        verse_start: r.get(10)?,
        verse_end: r.get(11)?,
        created_at: r.get(12)?,
        updated_at: r.get(13)?,
        deleted_at: r.get(14)?,
    })
}

pub fn list_all(conn: &Connection) -> anyhow::Result<Vec<PrayerEntry>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {SELECT_COLS} FROM prayer_entries WHERE {NOT_DELETED} ORDER BY entry_date DESC"
    ))?;
    let rows = stmt.query_map([], map_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// By id, deleted or not -- export and the Trash both need to reach a row
/// the list queries hide.
pub fn get(conn: &Connection, id: i64) -> anyhow::Result<Option<PrayerEntry>> {
    use rusqlite::OptionalExtension;
    Ok(conn.query_row(&format!("SELECT {SELECT_COLS} FROM prayer_entries WHERE id = ?1"), params![id], map_row).optional()?)
}

#[allow(clippy::too_many_arguments)]
pub fn create(
    conn: &Connection,
    entry_date: String,
    mode: String,
    adoration: Option<String>,
    confession: Option<String>,
    thanksgiving: Option<String>,
    supplication: Option<String>,
    free_text: Option<String>,
    book_id: Option<i64>,
    chapter: Option<i64>,
    verse_start: Option<i64>,
    verse_end: Option<i64>,
) -> anyhow::Result<PrayerEntry> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO prayer_entries (entry_date, mode, adoration, confession, thanksgiving, supplication, free_text, book_id, chapter, verse_start, verse_end, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?12)",
        params![entry_date, mode, adoration, confession, thanksgiving, supplication, free_text, book_id, chapter, verse_start, verse_end, now],
    )?;
    let id = conn.last_insert_rowid();
    Ok(conn.query_row(&format!("SELECT {SELECT_COLS} FROM prayer_entries WHERE id = ?1"), params![id], map_row)?)
}

#[allow(clippy::too_many_arguments)]
pub fn update(
    conn: &Connection,
    id: i64,
    entry_date: String,
    mode: String,
    adoration: Option<String>,
    confession: Option<String>,
    thanksgiving: Option<String>,
    supplication: Option<String>,
    free_text: Option<String>,
    book_id: Option<i64>,
    chapter: Option<i64>,
    verse_start: Option<i64>,
    verse_end: Option<i64>,
) -> anyhow::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE prayer_entries SET entry_date=?1, mode=?2, adoration=?3, confession=?4, thanksgiving=?5,
         supplication=?6, free_text=?7, book_id=?8, chapter=?9, verse_start=?10, verse_end=?11, updated_at=?12 WHERE id=?13",
        params![entry_date, mode, adoration, confession, thanksgiving, supplication, free_text, book_id, chapter, verse_start, verse_end, now, id],
    )?;
    Ok(())
}

/// Soft delete: the entry moves to the Trash (see `queries::trash`) rather
/// than disappearing, so a slip can be undone for thirty days.
pub fn delete(conn: &Connection, id: i64) -> anyhow::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE prayer_entries SET deleted_at = ?1 WHERE id = ?2 AND deleted_at IS NULL",
        params![now, id],
    )?;
    Ok(())
}

pub fn search(conn: &Connection, query: &str, limit: i64) -> anyhow::Result<Vec<PrayerEntry>> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    let match_expr = query
        .split_whitespace()
        .map(|t| format!("\"{}\"*", t.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(" ");
    let cols_pe = SELECT_COLS
        .split(", ")
        .map(|c| format!("pe.{c}"))
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!(
        "SELECT {cols_pe} FROM prayer_entries_fts JOIN prayer_entries pe ON pe.id = prayer_entries_fts.rowid
         WHERE prayer_entries_fts MATCH ?1 AND pe.{NOT_DELETED} ORDER BY bm25(prayer_entries_fts) LIMIT ?2"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![match_expr, limit], map_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

// Doctrine/use tagging, same shape as sermon_note_tags/note_tags. The "all
// tags" listings join the parent so a tag that only lives on a deleted
// entry drops out of the filter bar with it.

pub fn add_tag(conn: &Connection, prayer_entry_id: i64, tag: String) -> anyhow::Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO prayer_entry_tags (prayer_entry_id, tag) VALUES (?1, ?2)",
        params![prayer_entry_id, tag.trim()],
    )?;
    Ok(())
}

pub fn remove_tag(conn: &Connection, prayer_entry_id: i64, tag: String) -> anyhow::Result<()> {
    conn.execute(
        "DELETE FROM prayer_entry_tags WHERE prayer_entry_id = ?1 AND tag = ?2",
        params![prayer_entry_id, tag],
    )?;
    Ok(())
}

pub fn list_tags(conn: &Connection, prayer_entry_id: i64) -> anyhow::Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT tag FROM prayer_entry_tags WHERE prayer_entry_id = ?1 ORDER BY tag")?;
    let rows = stmt.query_map(params![prayer_entry_id], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn list_all_tags(conn: &Connection) -> anyhow::Result<Vec<String>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT DISTINCT t.tag FROM prayer_entry_tags t JOIN prayer_entries pe ON pe.id = t.prayer_entry_id WHERE pe.{NOT_DELETED} ORDER BY t.tag"
    ))?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn list_all_tags_by_entry(conn: &Connection) -> anyhow::Result<Vec<(i64, String)>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT t.prayer_entry_id, t.tag FROM prayer_entry_tags t JOIN prayer_entries pe ON pe.id = t.prayer_entry_id WHERE pe.{NOT_DELETED} ORDER BY t.prayer_entry_id, t.tag"
    ))?;
    let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}
