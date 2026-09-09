use crate::models::MemoryVerse;
use rusqlite::{params, Connection};

const SELECT_COLS: &str = "id, book_id, chapter, verse_start, verse_end, translation_id, mode, ease_factor, interval_days, repetitions, due_at, last_reviewed_at, created_at";

fn map_row(r: &rusqlite::Row) -> rusqlite::Result<MemoryVerse> {
    Ok(MemoryVerse {
        id: r.get(0)?,
        book_id: r.get(1)?,
        chapter: r.get(2)?,
        verse_start: r.get(3)?,
        verse_end: r.get(4)?,
        translation_id: r.get(5)?,
        mode: r.get(6)?,
        ease_factor: r.get(7)?,
        interval_days: r.get(8)?,
        repetitions: r.get(9)?,
        due_at: r.get(10)?,
        last_reviewed_at: r.get(11)?,
        created_at: r.get(12)?,
    })
}

pub fn list_all(conn: &Connection) -> anyhow::Result<Vec<MemoryVerse>> {
    let mut stmt = conn.prepare(&format!("SELECT {SELECT_COLS} FROM memory_verses ORDER BY due_at"))?;
    let rows = stmt.query_map([], map_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn list_due(conn: &Connection) -> anyhow::Result<Vec<MemoryVerse>> {
    let now = chrono::Utc::now().to_rfc3339();
    let mut stmt = conn.prepare(&format!("SELECT {SELECT_COLS} FROM memory_verses WHERE due_at <= ?1 ORDER BY due_at"))?;
    let rows = stmt.query_map(params![now], map_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn create(
    conn: &Connection,
    book_id: i64,
    chapter: i64,
    verse_start: i64,
    verse_end: i64,
    translation_id: Option<i64>,
    mode: String,
) -> anyhow::Result<MemoryVerse> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO memory_verses (book_id, chapter, verse_start, verse_end, translation_id, mode, due_at, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?7)",
        params![book_id, chapter, verse_start, verse_end, translation_id, mode, now],
    )?;
    let id = conn.last_insert_rowid();
    Ok(conn.query_row(&format!("SELECT {SELECT_COLS} FROM memory_verses WHERE id = ?1"), params![id], map_row)?)
}

pub fn set_mode(conn: &Connection, id: i64, mode: String) -> anyhow::Result<()> {
    conn.execute("UPDATE memory_verses SET mode = ?1 WHERE id = ?2", params![mode, id])?;
    Ok(())
}

pub fn delete(conn: &Connection, id: i64) -> anyhow::Result<()> {
    conn.execute("DELETE FROM memory_verses WHERE id = ?1", params![id])?;
    Ok(())
}

/// Records a review using the SM-2 spaced-repetition algorithm. `quality` is
/// 0-5 (Anki/SuperMemo convention: below 3 means "failed to recall" and
/// resets the interval; 3+ means a successful recall, with 5 being
/// effortless). Ease factor is clamped to a minimum of 1.3 as SM-2
/// prescribes, so a run of poor recalls can't shrink intervals to nothing.
pub fn review(conn: &Connection, id: i64, quality: i64) -> anyhow::Result<MemoryVerse> {
    let (ease_factor, interval_days, repetitions): (f64, i64, i64) = conn.query_row(
        "SELECT ease_factor, interval_days, repetitions FROM memory_verses WHERE id = ?1",
        params![id],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    )?;

    let (new_repetitions, new_interval) = if quality < 3 {
        (0, 1)
    } else {
        let reps = repetitions + 1;
        let interval = match reps {
            1 => 1,
            2 => 6,
            _ => (interval_days as f64 * ease_factor).round() as i64,
        };
        (reps, interval)
    };
    let q = quality as f64;
    let new_ease = (ease_factor + (0.1 - (5.0 - q) * (0.08 + (5.0 - q) * 0.02))).max(1.3);

    let now = chrono::Utc::now();
    let due_at = (now + chrono::Duration::days(new_interval)).to_rfc3339();
    conn.execute(
        "UPDATE memory_verses SET ease_factor=?1, interval_days=?2, repetitions=?3, due_at=?4, last_reviewed_at=?5 WHERE id=?6",
        params![new_ease, new_interval, new_repetitions, due_at, now.to_rfc3339(), id],
    )?;
    Ok(conn.query_row(&format!("SELECT {SELECT_COLS} FROM memory_verses WHERE id = ?1"), params![id], map_row)?)
}
