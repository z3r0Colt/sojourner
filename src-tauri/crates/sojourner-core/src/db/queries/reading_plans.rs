use crate::models::{PlanReadingInput, ReadingPlan, ReadingPlanDay, ReadingPlanProgress, ReadingPlanReading, ScheduleEntry};
use chrono::{Datelike, Duration, NaiveDate};
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::BTreeMap;

/// Custom plans (F4.2) are keyed by this prefix everywhere the app sees a
/// plan code, so progress and completions address them like bundled ones.
pub const USER_PREFIX: &str = "user:";

pub fn is_user_code(code: &str) -> bool {
    code.starts_with(USER_PREFIX)
}

fn parse_weekdays(raw: Option<String>) -> Option<Vec<i64>> {
    let raw = raw?;
    let days: Vec<i64> = raw.split(',').filter_map(|s| s.trim().parse::<i64>().ok()).filter(|d| (1..=7).contains(d)).collect();
    if days.is_empty() || days.len() >= 7 {
        None
    } else {
        Some(days)
    }
}

fn weekdays_to_text(weekdays: &Option<Vec<i64>>) -> Option<String> {
    let mut days: Vec<i64> = weekdays.as_ref()?.iter().copied().filter(|d| (1..=7).contains(d)).collect();
    days.sort_unstable();
    days.dedup();
    if days.is_empty() || days.len() >= 7 {
        return None;
    }
    Some(days.iter().map(|d| d.to_string()).collect::<Vec<_>>().join(","))
}

/// Bundled plans first (content.db order), then the reader's own.
pub fn list_plans(conn: &Connection) -> anyhow::Result<Vec<ReadingPlan>> {
    let mut out = Vec::new();
    {
        let mut stmt = conn.prepare("SELECT id, code, title, description, length_days FROM reading_plans ORDER BY id")?;
        let rows = stmt.query_map([], |r| {
            Ok(ReadingPlan {
                id: r.get(0)?,
                code: r.get(1)?,
                title: r.get(2)?,
                description: r.get(3)?,
                length_days: r.get(4)?,
                custom: false,
                weekdays: None,
            })
        })?;
        for row in rows {
            out.push(row?);
        }
    }
    {
        let mut stmt = conn.prepare("SELECT id, code, title, description, length_days, reading_weekdays FROM user_reading_plans ORDER BY created_at, id")?;
        let rows = stmt.query_map([], |r| {
            Ok(ReadingPlan {
                id: r.get(0)?,
                code: r.get(1)?,
                title: r.get(2)?,
                description: r.get(3)?,
                length_days: r.get(4)?,
                custom: true,
                weekdays: parse_weekdays(r.get(5)?),
            })
        })?;
        for row in rows {
            out.push(row?);
        }
    }
    Ok(out)
}

pub fn get_plan(conn: &Connection, plan_code: &str) -> anyhow::Result<Option<ReadingPlan>> {
    Ok(list_plans(conn)?.into_iter().find(|p| p.code == plan_code))
}

/// A plan's full day-by-day reading schedule, grouped by day. Fetched whole
/// (rather than per-day) since even the largest plan here is ~1500 rows --
/// cheap to load once and keep client-side for the checklist UI. Custom
/// plans read from user.db, bundled ones from content.db; the shape is the
/// same.
pub fn get_plan_days(conn: &Connection, plan_code: &str) -> anyhow::Result<Vec<ReadingPlanDay>> {
    let sql = if is_user_code(plan_code) {
        "SELECT rpr.day_number, rpr.book_id, rpr.chapter_start, rpr.verse_start, rpr.chapter_end, rpr.verse_end, rpr.label
         FROM user_reading_plan_readings rpr
         JOIN user_reading_plans rp ON rp.id = rpr.plan_id
         WHERE rp.code = ?1
         ORDER BY rpr.day_number, rpr.sort_order"
    } else {
        "SELECT rpr.day_number, rpr.book_id, rpr.chapter_start, rpr.verse_start, rpr.chapter_end, rpr.verse_end, rpr.label
         FROM reading_plan_readings rpr
         JOIN reading_plans rp ON rp.id = rpr.plan_id
         WHERE rp.code = ?1
         ORDER BY rpr.day_number, rpr.sort_order"
    };
    let mut stmt = conn.prepare(sql)?;
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

// ---------------------------------------------------------------------------
// Custom plans (F4.2)

fn write_readings(conn: &Connection, plan_id: i64, days: &[Vec<PlanReadingInput>]) -> anyhow::Result<()> {
    conn.execute("DELETE FROM user_reading_plan_readings WHERE plan_id = ?1", params![plan_id])?;
    let mut stmt = conn.prepare(
        "INSERT INTO user_reading_plan_readings (plan_id, day_number, sort_order, book_id, chapter_start, verse_start, chapter_end, verse_end, label)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
    )?;
    for (i, readings) in days.iter().enumerate() {
        let day_number = i as i64 + 1;
        for (j, r) in readings.iter().enumerate() {
            stmt.execute(params![plan_id, day_number, j as i64, r.book_id, r.chapter_start, r.verse_start, r.chapter_end, r.verse_end, r.label])?;
        }
    }
    Ok(())
}

fn validate_days(days: &[Vec<PlanReadingInput>]) -> anyhow::Result<()> {
    if days.is_empty() {
        anyhow::bail!("a plan needs at least one day");
    }
    if days.iter().any(|d| d.is_empty()) {
        anyhow::bail!("every day needs at least one reading");
    }
    Ok(())
}

/// Creates a custom plan; `days[i]` holds day `i + 1`'s readings.
pub fn create_user_plan(
    conn: &Connection,
    title: &str,
    description: Option<&str>,
    weekdays: &Option<Vec<i64>>,
    days: &[Vec<PlanReadingInput>],
) -> anyhow::Result<ReadingPlan> {
    let title = title.trim();
    if title.is_empty() {
        anyhow::bail!("a plan needs a title");
    }
    validate_days(days)?;
    let now = chrono::Utc::now();
    let code = format!("{USER_PREFIX}{}", now.timestamp_millis());
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "INSERT INTO user_reading_plans (code, title, description, length_days, reading_weekdays, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?6)",
        params![code, title, description.map(str::trim).filter(|d| !d.is_empty()), days.len() as i64, weekdays_to_text(weekdays), now.to_rfc3339()],
    )?;
    let plan_id = tx.last_insert_rowid();
    write_readings(&tx, plan_id, days)?;
    tx.commit()?;
    Ok(get_plan(conn, &code)?.expect("just inserted"))
}

/// Replaces a custom plan's title, description, weekdays, and readings.
/// Progress is kept; completions past the new length are dropped and the
/// schedule is rebuilt from the same start date.
pub fn update_user_plan(
    conn: &Connection,
    plan_code: &str,
    title: &str,
    description: Option<&str>,
    weekdays: &Option<Vec<i64>>,
    days: &[Vec<PlanReadingInput>],
) -> anyhow::Result<ReadingPlan> {
    let title = title.trim();
    if title.is_empty() {
        anyhow::bail!("a plan needs a title");
    }
    validate_days(days)?;
    let plan_id: i64 = conn
        .query_row("SELECT id FROM user_reading_plans WHERE code = ?1", params![plan_code], |r| r.get(0))
        .optional()?
        .ok_or_else(|| anyhow::anyhow!("no custom plan {plan_code}"))?;
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "UPDATE user_reading_plans SET title = ?2, description = ?3, length_days = ?4, reading_weekdays = ?5, updated_at = ?6 WHERE id = ?1",
        params![plan_id, title, description.map(str::trim).filter(|d| !d.is_empty()), days.len() as i64, weekdays_to_text(weekdays), chrono::Utc::now().to_rfc3339()],
    )?;
    write_readings(&tx, plan_id, days)?;
    tx.execute("DELETE FROM reading_plan_completions WHERE plan_code = ?1 AND day_number > ?2", params![plan_code, days.len() as i64])?;
    tx.commit()?;
    if let Some(start) = progress_start(conn, plan_code)? {
        rebuild_schedule(conn, plan_code, &start)?;
    }
    Ok(get_plan(conn, plan_code)?.expect("just updated"))
}

/// Deletes a custom plan with its readings, progress, completions, and
/// schedule in one transaction. Returns false when there was no such plan.
pub fn delete_user_plan(conn: &Connection, plan_code: &str) -> anyhow::Result<bool> {
    let tx = conn.unchecked_transaction()?;
    let removed = tx.execute("DELETE FROM user_reading_plans WHERE code = ?1", params![plan_code])?;
    tx.execute("DELETE FROM reading_plan_completions WHERE plan_code = ?1", params![plan_code])?;
    tx.execute("DELETE FROM reading_plan_progress WHERE plan_code = ?1", params![plan_code])?;
    tx.execute("DELETE FROM reading_plan_schedule WHERE plan_code = ?1", params![plan_code])?;
    tx.commit()?;
    Ok(removed > 0)
}

// ---------------------------------------------------------------------------
// Schedule: which calendar date each day of a plan falls on

fn parse_date(s: &str) -> anyhow::Result<NaiveDate> {
    Ok(NaiveDate::parse_from_str(s.get(..10).unwrap_or(s), "%Y-%m-%d")?)
}

fn fmt_date(d: NaiveDate) -> String {
    d.format("%Y-%m-%d").to_string()
}

fn plan_length(conn: &Connection, plan_code: &str) -> anyhow::Result<i64> {
    Ok(get_plan(conn, plan_code)?.map(|p| p.length_days).unwrap_or(0))
}

fn plan_weekdays(conn: &Connection, plan_code: &str) -> anyhow::Result<Option<Vec<i64>>> {
    Ok(get_plan(conn, plan_code)?.and_then(|p| p.weekdays))
}

fn progress_start(conn: &Connection, plan_code: &str) -> anyhow::Result<Option<String>> {
    Ok(conn
        .query_row("SELECT start_date FROM reading_plan_progress WHERE plan_code = ?1", params![plan_code], |r| r.get(0))
        .optional()?)
}

fn is_reading_day(date: NaiveDate, weekdays: &Option<Vec<i64>>) -> bool {
    match weekdays {
        None => true,
        Some(days) => days.contains(&(date.weekday().number_from_monday() as i64)),
    }
}

/// The next reading day on or after `date`.
fn next_reading_day(mut date: NaiveDate, weekdays: &Option<Vec<i64>>) -> NaiveDate {
    for _ in 0..8 {
        if is_reading_day(date, weekdays) {
            return date;
        }
        date += Duration::days(1);
    }
    date
}

pub fn list_schedule(conn: &Connection, plan_code: &str) -> anyhow::Result<Vec<ScheduleEntry>> {
    let mut stmt = conn.prepare("SELECT day_number, date FROM reading_plan_schedule WHERE plan_code = ?1 ORDER BY day_number")?;
    let rows = stmt.query_map(params![plan_code], |r| Ok(ScheduleEntry { day_number: r.get(0)?, date: r.get(1)? }))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// Replaces a plan's whole schedule with `entries` (the undo of a spread
/// restores the rows it captured beforehand).
pub fn set_schedule(conn: &Connection, plan_code: &str, entries: &[ScheduleEntry]) -> anyhow::Result<()> {
    let tx = conn.unchecked_transaction()?;
    tx.execute("DELETE FROM reading_plan_schedule WHERE plan_code = ?1", params![plan_code])?;
    let mut stmt = tx.prepare("INSERT INTO reading_plan_schedule (plan_code, day_number, date) VALUES (?1,?2,?3)")?;
    for e in entries {
        stmt.execute(params![plan_code, e.day_number, e.date])?;
    }
    drop(stmt);
    tx.commit()?;
    Ok(())
}

/// The date every day of the plan falls on: the schedule row when there
/// is one, else start_date + (day - 1).
fn effective_dates(conn: &Connection, plan_code: &str, start_date: &str, length: i64) -> anyhow::Result<Vec<(i64, NaiveDate)>> {
    let start = parse_date(start_date)?;
    let pinned: BTreeMap<i64, NaiveDate> = list_schedule(conn, plan_code)?
        .into_iter()
        .filter_map(|e| parse_date(&e.date).ok().map(|d| (e.day_number, d)))
        .collect();
    Ok((1..=length)
        .map(|day| (day, pinned.get(&day).copied().unwrap_or(start + Duration::days(day - 1))))
        .collect())
}

/// Recomputes a plan's schedule from its start date: a weekday plan gets
/// every day pinned to its reading days in order; a daily plan needs no
/// rows at all. Any spread overrides are dropped.
pub fn rebuild_schedule(conn: &Connection, plan_code: &str, start_date: &str) -> anyhow::Result<()> {
    let weekdays = plan_weekdays(conn, plan_code)?;
    let Some(weekdays) = weekdays else {
        return set_schedule(conn, plan_code, &[]);
    };
    let length = plan_length(conn, plan_code)?;
    let mut date = parse_date(start_date)?;
    let mut entries = Vec::with_capacity(length as usize);
    for day in 1..=length {
        date = next_reading_day(date, &Some(weekdays.clone()));
        entries.push(ScheduleEntry { day_number: day, date: fmt_date(date) });
        date += Duration::days(1);
    }
    set_schedule(conn, plan_code, &entries)
}

/// Re-anchors a plan so that `day_number` falls on `date` (or the next
/// reading day after it), moving start_date to match and rebuilding the
/// schedule. This is "Shift my schedule" for every kind of plan: with
/// day_number = the next unread day and date = today, the reader is
/// caught up without skipping anything.
pub fn reanchor(conn: &Connection, plan_code: &str, day_number: i64, date: &str) -> anyhow::Result<ReadingPlanProgress> {
    let weekdays = plan_weekdays(conn, plan_code)?;
    let mut anchor = next_reading_day(parse_date(date)?, &weekdays);
    // Walk back (day_number - 1) reading days to find day 1's date.
    let mut remaining = (day_number - 1).max(0);
    while remaining > 0 {
        anchor -= Duration::days(1);
        if is_reading_day(anchor, &weekdays) {
            remaining -= 1;
        }
    }
    let start = fmt_date(anchor);
    conn.execute("UPDATE reading_plan_progress SET start_date = ?2 WHERE plan_code = ?1", params![plan_code, start])?;
    rebuild_schedule(conn, plan_code, &start)?;
    get_progress(conn, plan_code)?.ok_or_else(|| anyhow::anyhow!("no progress for plan {plan_code}"))
}

/// Catch-up, "Spread over seven days" (F4.2): every unread day that is
/// due by the end of `window` days from `today` (the missed days plus the
/// coming week's) is re-dated evenly across the reading days in that
/// window, so the reader is caught up at the end of it without skipping.
/// Later days keep their dates. Returns the plan's progress.
pub fn spread(conn: &Connection, plan_code: &str, today: &str, window: i64) -> anyhow::Result<ReadingPlanProgress> {
    let progress = get_progress(conn, plan_code)?.ok_or_else(|| anyhow::anyhow!("no progress for plan {plan_code}"))?;
    let length = plan_length(conn, plan_code)?;
    let weekdays = plan_weekdays(conn, plan_code)?;
    let today = parse_date(today)?;
    let window_end = today + Duration::days(window.max(1) - 1);
    let dates: Vec<NaiveDate> = (0..window.max(1)).map(|i| today + Duration::days(i)).filter(|d| is_reading_day(*d, &weekdays)).collect();
    if dates.is_empty() {
        anyhow::bail!("no reading days in the next {window} days");
    }
    let due: Vec<i64> = effective_dates(conn, plan_code, &progress.start_date, length)?
        .into_iter()
        .filter(|(day, date)| *day >= progress.current_day && *date <= window_end)
        .map(|(day, _)| day)
        .collect();
    if due.is_empty() {
        return Ok(progress);
    }
    let n = due.len();
    let m = dates.len();
    let tx = conn.unchecked_transaction()?;
    {
        let mut stmt = tx.prepare(
            "INSERT INTO reading_plan_schedule (plan_code, day_number, date) VALUES (?1,?2,?3)
             ON CONFLICT(plan_code, day_number) DO UPDATE SET date = excluded.date",
        )?;
        for (i, day) in due.iter().enumerate() {
            let date = dates[i * m / n];
            stmt.execute(params![plan_code, day, fmt_date(date)])?;
        }
    }
    tx.commit()?;
    get_progress(conn, plan_code)?.ok_or_else(|| anyhow::anyhow!("no progress for plan {plan_code}"))
}

// ---------------------------------------------------------------------------
// Progress

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
fn build_progress(plan_code: &str, start_date: String, created_at: String, completed: Vec<i64>, schedule: Vec<ScheduleEntry>) -> ReadingPlanProgress {
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
        schedule,
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
    let schedule = list_schedule(conn, plan_code)?;
    Ok(Some(build_progress(plan_code, start_date, created_at, completed, schedule)))
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
        let schedule = list_schedule(conn, &plan_code)?;
        out.push(build_progress(&plan_code, start_date, created_at, completed, schedule));
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
    rebuild_schedule(conn, plan_code, &start_date)?;
    Ok(get_progress(conn, plan_code)?.expect("just inserted"))
}

pub fn abandon_plan(conn: &Connection, plan_code: &str) -> anyhow::Result<()> {
    conn.execute("DELETE FROM reading_plan_completions WHERE plan_code = ?1", params![plan_code])?;
    conn.execute("DELETE FROM reading_plan_progress WHERE plan_code = ?1", params![plan_code])?;
    conn.execute("DELETE FROM reading_plan_schedule WHERE plan_code = ?1", params![plan_code])?;
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

/// Catch-up, "Shift my schedule" (F3.3): moves the plan's start date
/// forward by `days` so the calendar day lines up with the next unread
/// day. Nothing is marked or unmarked. A negative `days` moves it back.
/// The schedule is rebuilt from the new start, so a weekday plan keeps its
/// reading days and any spread overrides are dropped. The banner now uses
/// `reanchor`, which handles weekday plans exactly; this stays for callers
/// that think in days.
pub fn shift_start(conn: &Connection, plan_code: &str, days: i64) -> anyhow::Result<ReadingPlanProgress> {
    let modifier = format!("{days:+} days");
    conn.execute(
        "UPDATE reading_plan_progress SET start_date = date(start_date, ?2) WHERE plan_code = ?1",
        params![plan_code, modifier],
    )?;
    if let Some(start) = progress_start(conn, plan_code)? {
        rebuild_schedule(conn, plan_code, &start)?;
    }
    Ok(get_progress(conn, plan_code)?.ok_or_else(|| anyhow::anyhow!("no progress for plan {plan_code}"))?)
}

/// Catch-up, "Skip to today" (F3.3), and its undo: marks (or unmarks)
/// several days in one transaction.
pub fn set_days(conn: &Connection, plan_code: &str, day_numbers: &[i64], done: bool) -> anyhow::Result<ReadingPlanProgress> {
    let now = chrono::Utc::now().to_rfc3339();
    let tx = conn.unchecked_transaction()?;
    {
        let mut stmt = if done {
            tx.prepare("INSERT OR IGNORE INTO reading_plan_completions (plan_code, day_number, completed_at) VALUES (?1,?2,?3)")?
        } else {
            tx.prepare("DELETE FROM reading_plan_completions WHERE plan_code = ?1 AND day_number = ?2")?
        };
        for day in day_numbers {
            if done {
                stmt.execute(params![plan_code, day, now])?;
            } else {
                stmt.execute(params![plan_code, day])?;
            }
        }
    }
    tx.commit()?;
    Ok(get_progress(conn, plan_code)?.ok_or_else(|| anyhow::anyhow!("no progress for plan {plan_code}"))?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    fn open_test(label: &str) -> (Connection, std::path::PathBuf) {
        let dir = std::env::temp_dir().join(format!("sojourner-plans-test-{label}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let content_db_path = dir.join("content.db");
        db::open_content_db(&content_db_path).unwrap();
        (db::open(&dir, &content_db_path).unwrap(), dir)
    }

    fn reading(book: i64, c1: i64, c2: i64) -> PlanReadingInput {
        PlanReadingInput { book_id: book, chapter_start: c1, verse_start: None, chapter_end: c2, verse_end: None, label: format!("{c1}-{c2}") }
    }

    #[test]
    fn custom_plan_round_trip_and_delete_cascade() {
        let (conn, dir) = open_test("crud");
        let days = vec![vec![reading(19, 1, 5)], vec![reading(19, 6, 10)], vec![reading(19, 11, 15)]];
        let plan = create_user_plan(&conn, "Psalms in 3 days", Some("test"), &None, &days).unwrap();
        assert!(plan.custom && plan.code.starts_with(USER_PREFIX));
        assert_eq!(plan.length_days, 3);
        assert_eq!(list_plans(&conn).unwrap().iter().filter(|p| p.custom).count(), 1);
        let got = get_plan_days(&conn, &plan.code).unwrap();
        assert_eq!(got.len(), 3);
        assert_eq!(got[1].readings[0].chapter_start, 6);

        start_plan(&conn, &plan.code, "2026-09-01".into()).unwrap();
        mark_day(&conn, &plan.code, 1).unwrap();
        mark_day(&conn, &plan.code, 3).unwrap();
        let updated = update_user_plan(&conn, &plan.code, "Psalms in 2 days", None, &None, &days[..2]).unwrap();
        assert_eq!(updated.length_days, 2);
        let p = get_progress(&conn, &plan.code).unwrap().unwrap();
        assert_eq!(p.completed_days, vec![1], "a completion past the new length is dropped");

        assert!(delete_user_plan(&conn, &plan.code).unwrap());
        assert!(get_progress(&conn, &plan.code).unwrap().is_none());
        let readings: i64 = conn.query_row("SELECT COUNT(*) FROM user_reading_plan_readings", [], |r| r.get(0)).unwrap();
        assert_eq!(readings, 0, "readings cascade from the plan");
        assert!(get_plan_days(&conn, &plan.code).unwrap().is_empty());
        drop(conn);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn weekday_plan_schedule_skips_off_days_and_reanchors() {
        let (conn, dir) = open_test("weekdays");
        let days: Vec<Vec<PlanReadingInput>> = (1..=6).map(|i| vec![reading(1, i, i)]).collect();
        // Monday to Friday only.
        let plan = create_user_plan(&conn, "Weekdays", None, &Some(vec![1, 2, 3, 4, 5]), &days).unwrap();
        assert_eq!(plan.weekdays, Some(vec![1, 2, 3, 4, 5]));
        // 2026-09-10 is a Thursday: days 1..6 land on Thu 10, Fri 11, Mon 14, Tue 15, Wed 16, Thu 17.
        let p = start_plan(&conn, &plan.code, "2026-09-10".into()).unwrap();
        let dates: Vec<&str> = p.schedule.iter().map(|e| e.date.as_str()).collect();
        assert_eq!(dates, ["2026-09-10", "2026-09-11", "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17"]);
        // A Saturday start moves to the following Monday.
        let p = start_plan(&conn, &plan.code, "2026-09-12".into()).unwrap();
        assert_eq!(p.schedule[0].date, "2026-09-14");
        // Re-anchor day 3 onto Wednesday the 23rd: day 1 is Monday the 21st.
        let p = reanchor(&conn, &plan.code, 3, "2026-09-23").unwrap();
        assert_eq!(p.start_date, "2026-09-21");
        assert_eq!(p.schedule[2].date, "2026-09-23");
        drop(conn);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn spread_redates_missed_and_upcoming_days_across_the_week() {
        let (conn, dir) = open_test("spread");
        let days: Vec<Vec<PlanReadingInput>> = (1..=30).map(|i| vec![reading(19, i, i)]).collect();
        let plan = create_user_plan(&conn, "Psalms in 30 days", None, &None, &days).unwrap();
        // Started ten days ago, nothing ticked: days 1..10 are overdue on the 11th.
        start_plan(&conn, &plan.code, "2026-09-01".into()).unwrap();
        let p = spread(&conn, &plan.code, "2026-09-11", 7).unwrap();
        // Days 1..17 (ten missed plus the seven due this week) over seven dates.
        assert_eq!(p.schedule.len(), 17);
        assert_eq!(p.schedule[0], ScheduleEntry { day_number: 1, date: "2026-09-11".into() });
        assert_eq!(p.schedule[16].date, "2026-09-17");
        assert!(p.schedule.iter().all(|e| e.date.as_str() >= "2026-09-11" && e.date.as_str() <= "2026-09-17"));
        // Day 18 keeps its arithmetic date (start + 17 = the 18th).
        assert!(p.schedule.iter().all(|e| e.day_number <= 17));
        // Undo restores the empty schedule.
        set_schedule(&conn, &plan.code, &[]).unwrap();
        assert!(get_progress(&conn, &plan.code).unwrap().unwrap().schedule.is_empty());
        drop(conn);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
