use crate::models::PrayerEntry;
use rusqlite::{params, Connection};

const SELECT_COLS: &str =
    "id, entry_date, adoration, confession, thanksgiving, supplication, book_id, chapter, verse_start, verse_end, created_at, updated_at";

fn map_row(r: &rusqlite::Row) -> rusqlite::Result<PrayerEntry> {
    Ok(PrayerEntry {
        id: r.get(0)?,
        entry_date: r.get(1)?,
        adoration: r.get(2)?,
        confession: r.get(3)?,
        thanksgiving: r.get(4)?,
        supplication: r.get(5)?,
        book_id: r.get(6)?,
        chapter: r.get(7)?,
        verse_start: r.get(8)?,
        verse_end: r.get(9)?,
        created_at: r.get(10)?,
        updated_at: r.get(11)?,
    })
}

pub fn list_all(conn: &Connection) -> anyhow::Result<Vec<PrayerEntry>> {
    let mut stmt = conn.prepare(&format!("SELECT {SELECT_COLS} FROM prayer_entries ORDER BY entry_date DESC"))?;
    let rows = stmt.query_map([], map_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

#[allow(clippy::too_many_arguments)]
pub fn create(
    conn: &Connection,
    entry_date: String,
    adoration: Option<String>,
    confession: Option<String>,
    thanksgiving: Option<String>,
    supplication: Option<String>,
    book_id: Option<i64>,
    chapter: Option<i64>,
    verse_start: Option<i64>,
    verse_end: Option<i64>,
) -> anyhow::Result<PrayerEntry> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO prayer_entries (entry_date, adoration, confession, thanksgiving, supplication, book_id, chapter, verse_start, verse_end, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10)",
        params![entry_date, adoration, confession, thanksgiving, supplication, book_id, chapter, verse_start, verse_end, now],
    )?;
    let id = conn.last_insert_rowid();
    Ok(conn.query_row(&format!("SELECT {SELECT_COLS} FROM prayer_entries WHERE id = ?1"), params![id], map_row)?)
}

#[allow(clippy::too_many_arguments)]
pub fn update(
    conn: &Connection,
    id: i64,
    entry_date: String,
    adoration: Option<String>,
    confession: Option<String>,
    thanksgiving: Option<String>,
    supplication: Option<String>,
    book_id: Option<i64>,
    chapter: Option<i64>,
    verse_start: Option<i64>,
    verse_end: Option<i64>,
) -> anyhow::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE prayer_entries SET entry_date=?1, adoration=?2, confession=?3, thanksgiving=?4, supplication=?5,
         book_id=?6, chapter=?7, verse_start=?8, verse_end=?9, updated_at=?10 WHERE id=?11",
        params![entry_date, adoration, confession, thanksgiving, supplication, book_id, chapter, verse_start, verse_end, now, id],
    )?;
    Ok(())
}

pub fn delete(conn: &Connection, id: i64) -> anyhow::Result<()> {
    conn.execute("DELETE FROM prayer_entries WHERE id = ?1", params![id])?;
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
        "SELECT {cols_pe} FROM prayer_entries_fts f JOIN prayer_entries pe ON pe.id = f.rowid
         WHERE f MATCH ?1 ORDER BY bm25(f) LIMIT ?2"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![match_expr, limit], map_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}
