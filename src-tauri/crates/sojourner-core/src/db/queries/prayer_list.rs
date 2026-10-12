use crate::models::PrayerListPerson;
use rusqlite::{params, Connection};

const SELECT_COLS: &str =
    "id, name, category, notes, active, last_prayed_at, created_at, updated_at, answered_at, answer_note";

fn map_row(r: &rusqlite::Row) -> rusqlite::Result<PrayerListPerson> {
    Ok(PrayerListPerson {
        id: r.get(0)?,
        name: r.get(1)?,
        category: r.get(2)?,
        notes: r.get(3)?,
        active: r.get::<_, i64>(4)? != 0,
        last_prayed_at: r.get(5)?,
        created_at: r.get(6)?,
        updated_at: r.get(7)?,
        answered_at: r.get(8)?,
        answer_note: r.get(9)?,
    })
}

/// Active people/requests first (soonest-neglected first within that group,
/// i.e. oldest `last_prayed_at`/never-prayed-for first), then archived ones
/// by when they were last touched.
pub fn list_all(conn: &Connection) -> anyhow::Result<Vec<PrayerListPerson>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {SELECT_COLS} FROM prayer_list_people
         ORDER BY active DESC, (last_prayed_at IS NOT NULL), last_prayed_at ASC, created_at ASC"
    ))?;
    let rows = stmt.query_map([], map_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn create(conn: &Connection, name: String, category: Option<String>, notes: Option<String>) -> anyhow::Result<PrayerListPerson> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO prayer_list_people (name, category, notes, active, created_at, updated_at)
         VALUES (?1, ?2, ?3, 1, ?4, ?4)",
        params![name, category, notes, now],
    )?;
    let id = conn.last_insert_rowid();
    Ok(conn.query_row(&format!("SELECT {SELECT_COLS} FROM prayer_list_people WHERE id = ?1"), params![id], map_row)?)
}

pub fn update(conn: &Connection, id: i64, name: String, category: Option<String>, notes: Option<String>) -> anyhow::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE prayer_list_people SET name=?1, category=?2, notes=?3, updated_at=?4 WHERE id=?5",
        params![name, category, notes, now, id],
    )?;
    Ok(())
}

pub fn set_active(conn: &Connection, id: i64, active: bool) -> anyhow::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE prayer_list_people SET active=?1, updated_at=?2 WHERE id=?3",
        params![active, now, id],
    )?;
    Ok(())
}

pub fn mark_prayed(conn: &Connection, id: i64) -> anyhow::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE prayer_list_people SET last_prayed_at=?1, updated_at=?1 WHERE id=?2",
        params![now, id],
    )?;
    Ok(())
}

/// Puts back when someone was last prayed for, as it stood before a
/// `mark_prayed` that is being undone (family worship's Undo). `None` means
/// they had never been prayed for. `updated_at` moves on regardless: the row
/// did change, twice.
pub fn restore_prayed(conn: &Connection, id: i64, last_prayed_at: Option<String>) -> anyhow::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE prayer_list_people SET last_prayed_at=?1, updated_at=?2 WHERE id=?3",
        params![last_prayed_at, now, id],
    )?;
    Ok(())
}

/// Marks a request answered: archives it (active=0, same as `set_active`)
/// and records when/how, for the "record answers to prayer as a means of
/// strengthening faith" use -- distinct from an ordinary archive, which
/// leaves `answered_at` null.
pub fn mark_answered(conn: &Connection, id: i64, answer_note: Option<String>) -> anyhow::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE prayer_list_people SET active=0, answered_at=?1, answer_note=?2, updated_at=?1 WHERE id=?3",
        params![now, answer_note, id],
    )?;
    Ok(())
}

pub fn delete(conn: &Connection, id: i64) -> anyhow::Result<()> {
    conn.execute("DELETE FROM prayer_list_people WHERE id = ?1", params![id])?;
    Ok(())
}
