use super::scripture_memory::{compute_sm2, log_review};
use crate::models::CatechismMemory;
use rusqlite::{params, Connection};

const SELECT_COLS: &str =
    "id, westminster_section_id, mode, ease_factor, interval_days, repetitions, due_at, last_reviewed_at, created_at";

fn map_row(r: &rusqlite::Row) -> rusqlite::Result<CatechismMemory> {
    Ok(CatechismMemory {
        id: r.get(0)?,
        westminster_section_id: r.get(1)?,
        mode: r.get(2)?,
        ease_factor: r.get(3)?,
        interval_days: r.get(4)?,
        repetitions: r.get(5)?,
        due_at: r.get(6)?,
        last_reviewed_at: r.get(7)?,
        created_at: r.get(8)?,
    })
}

pub fn list_all(conn: &Connection) -> anyhow::Result<Vec<CatechismMemory>> {
    let mut stmt = conn.prepare(&format!("SELECT {SELECT_COLS} FROM catechism_memory ORDER BY due_at"))?;
    let rows = stmt.query_map([], map_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn list_due(conn: &Connection) -> anyhow::Result<Vec<CatechismMemory>> {
    let now = chrono::Utc::now().to_rfc3339();
    let mut stmt = conn.prepare(&format!("SELECT {SELECT_COLS} FROM catechism_memory WHERE due_at <= ?1 ORDER BY due_at"))?;
    let rows = stmt.query_map(params![now], map_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn create(conn: &Connection, westminster_section_id: i64, mode: String) -> anyhow::Result<CatechismMemory> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO catechism_memory (westminster_section_id, mode, due_at, created_at) VALUES (?1,?2,?3,?3)",
        params![westminster_section_id, mode, now],
    )?;
    let id = conn.last_insert_rowid();
    Ok(conn.query_row(&format!("SELECT {SELECT_COLS} FROM catechism_memory WHERE id = ?1"), params![id], map_row)?)
}

pub fn set_mode(conn: &Connection, id: i64, mode: String) -> anyhow::Result<()> {
    conn.execute("UPDATE catechism_memory SET mode = ?1 WHERE id = ?2", params![mode, id])?;
    Ok(())
}

pub fn delete(conn: &Connection, id: i64) -> anyhow::Result<()> {
    conn.execute("DELETE FROM catechism_memory WHERE id = ?1", params![id])?;
    Ok(())
}

/// Records a review using the same [`compute_sm2`] math as Scripture Memory.
pub fn review(conn: &Connection, id: i64, quality: i64) -> anyhow::Result<CatechismMemory> {
    let (ease_factor, interval_days, repetitions): (f64, i64, i64) = conn.query_row(
        "SELECT ease_factor, interval_days, repetitions FROM catechism_memory WHERE id = ?1",
        params![id],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    )?;

    let (new_ease, new_interval, new_repetitions) = compute_sm2(ease_factor, interval_days, repetitions, quality);

    let now = chrono::Utc::now();
    let due_at = (now + chrono::Duration::days(new_interval)).to_rfc3339();
    conn.execute(
        "UPDATE catechism_memory SET ease_factor=?1, interval_days=?2, repetitions=?3, due_at=?4, last_reviewed_at=?5 WHERE id=?6",
        params![new_ease, new_interval, new_repetitions, due_at, now.to_rfc3339(), id],
    )?;
    log_review(conn, "catechism", id, quality, &now.to_rfc3339())?;
    Ok(conn.query_row(&format!("SELECT {SELECT_COLS} FROM catechism_memory WHERE id = ?1"), params![id], map_row)?)
}
