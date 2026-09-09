use crate::models::{ReadingPlan, ReadingPlanDay, ReadingPlanProgress, ReadingPlanReading};
use rusqlite::{params, Connection};
use std::collections::BTreeMap;

pub fn list_plans(conn: &Connection) -> anyhow::Result<Vec<ReadingPlan>> {
    let mut stmt = conn.prepare("SELECT id, code, title, description, length_days FROM reading_plans ORDER BY id")?;
    let rows = stmt.query_map([], |r| {
        Ok(ReadingPlan {
            id: r.get(0)?,
            code: r.get(1)?,
            title: r.get(2)?,
            description: r.get(3)?,
            length_days: r.get(4)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// A plan's full day-by-day reading schedule, grouped by day. Fetched whole
/// (rather than per-day) since even the largest plan here is ~1500 rows --
/// cheap to load once and keep client-side for the checklist UI.
pub fn get_plan_days(conn: &Connection, plan_code: &str) -> anyhow::Result<Vec<ReadingPlanDay>> {
    let mut stmt = conn.prepare(
        "SELECT rpr.day_number, rpr.book_id, rpr.chapter_start, rpr.verse_start, rpr.chapter_end, rpr.verse_end, rpr.label
         FROM reading_plan_readings rpr
         JOIN reading_plans rp ON rp.id = rpr.plan_id
         WHERE rp.code = ?1
         ORDER BY rpr.day_number, rpr.sort_order",
    )?;
    let rows = stmt.query_map(params![plan_code], |r| {
        Ok((
            r.get::<_, i64>(0)?,
            ReadingPlanReading {
                book_id: r.get(1)?,
                chapter_start: r.get(2)?,
                verse_start: r.get(3)?,
                chapter_end: r.get(4)?,
                verse_end: r.get(5)?,
                label: r.get(6)?,
            },
        ))
    })?;

    let mut by_day: BTreeMap<i64, Vec<ReadingPlanReading>> = BTreeMap::new();
    for row in rows {
        let (day_number, reading) = row?;
        by_day.entry(day_number).or_default().push(reading);
    }
    Ok(by_day
        .into_iter()
        .map(|(day_number, readings)| ReadingPlanDay { day_number, readings })
        .collect())
}

fn completed_days(conn: &Connection, plan_code: &str) -> anyhow::Result<Vec<i64>> {
    let mut stmt = conn.prepare(
        "SELECT day_number FROM reading_plan_completions WHERE plan_code = ?1 ORDER BY day_number",
    )?;
    let rows = stmt.query_map(params![plan_code], |r| r.get::<_, i64>(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// A plan's streak/current-day is checklist-based, not calendar-based: the
/// "current day" is the first day_number not yet checked off, and the streak
/// is simply how many days precede it -- since by definition everything
/// before the first gap must already be checked, that's every completed day
/// counted in an unbroken run from day 1. Skipping ahead and coming back
/// still credits every day actually marked done; it just won't count toward
/// the streak until the gap is filled in.
fn build_progress(plan_code: &str, start_date: String, created_at: String, completed: Vec<i64>) -> ReadingPlanProgress {
    let mut current_day = 1i64;
    while completed.binary_search(&current_day).is_ok() {
        current_day += 1;
    }
    let streak = current_day - 1;
    ReadingPlanProgress {
        plan_code: plan_code.to_string(),
        start_date,
        current_day,
        streak,
        completed_days: completed,
        created_at,
    }
}

pub fn get_progress(conn: &Connection, plan_code: &str) -> anyhow::Result<Option<ReadingPlanProgress>> {
    let row: Option<(String, String)> = conn
        .query_row(
            "SELECT start_date, created_at FROM reading_plan_progress WHERE plan_code = ?1",
            params![plan_code],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .ok();
    let Some((start_date, created_at)) = row else {
        return Ok(None);
    };
    let completed = completed_days(conn, plan_code)?;
    Ok(Some(build_progress(plan_code, start_date, created_at, completed)))
}

pub fn list_progress(conn: &Connection) -> anyhow::Result<Vec<ReadingPlanProgress>> {
    let mut stmt = conn.prepare("SELECT plan_code, start_date, created_at FROM reading_plan_progress")?;
    let rows = stmt.query_map([], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?))
    })?;
    let mut out = Vec::new();
    for row in rows {
        let (plan_code, start_date, created_at) = row?;
        let completed = completed_days(conn, &plan_code)?;
        out.push(build_progress(&plan_code, start_date, created_at, completed));
    }
    Ok(out)
}

pub fn start_plan(conn: &Connection, plan_code: &str, start_date: String) -> anyhow::Result<ReadingPlanProgress> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO reading_plan_progress (plan_code, start_date, created_at) VALUES (?1,?2,?3)
         ON CONFLICT(plan_code) DO UPDATE SET start_date = excluded.start_date",
        params![plan_code, start_date, now],
    )?;
    Ok(get_progress(conn, plan_code)?.expect("just inserted"))
}

pub fn abandon_plan(conn: &Connection, plan_code: &str) -> anyhow::Result<()> {
    conn.execute("DELETE FROM reading_plan_completions WHERE plan_code = ?1", params![plan_code])?;
    conn.execute("DELETE FROM reading_plan_progress WHERE plan_code = ?1", params![plan_code])?;
    Ok(())
}

pub fn mark_day(conn: &Connection, plan_code: &str, day_number: i64) -> anyhow::Result<ReadingPlanProgress> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT OR IGNORE INTO reading_plan_completions (plan_code, day_number, completed_at) VALUES (?1,?2,?3)",
        params![plan_code, day_number, now],
    )?;
    Ok(get_progress(conn, plan_code)?.expect("mark_day requires an in-progress plan"))
}

pub fn unmark_day(conn: &Connection, plan_code: &str, day_number: i64) -> anyhow::Result<ReadingPlanProgress> {
    conn.execute(
        "DELETE FROM reading_plan_completions WHERE plan_code = ?1 AND day_number = ?2",
        params![plan_code, day_number],
    )?;
    Ok(get_progress(conn, plan_code)?.expect("unmark_day requires an in-progress plan"))
}
