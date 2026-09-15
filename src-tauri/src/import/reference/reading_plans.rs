// Imports bundled reading plans from pre-generated JSON files into
// reading_plans/reading_plan_readings.
//
// Plans whose day-by-day divisions come from a published source:
//
//   mcheyne.json    Robert Murray M'Cheyne's classic 1842 calendar (public
//       domain), extracted from the day-by-day JSON data embedded in
//       bibleplan.org's plan page (https://bibleplan.org/plans/mcheyne, itself
//       reproducing the calendar as commonly published) and verified: 365 days,
//       exactly 4 readings/day, ending on 2 Chronicles 36 / Revelation 22 /
//       Malachi 4 / John 21 as the calendar is known to. One entry ("Jeremiah
//       36&45") names two disjoint chapters rather than a range and is split
//       into two separate reading rows for that day.
// Plans this app arranges itself, reproducing no printed source:
//
//   canonical.json / ninety_day.json   Every chapter of every book, in
//       canonical order, divided as evenly as possible by chapter count (not
//       word count) across 365 or 90 days -- just an even split of the canon.
//   chronological_year.json   Townsend's chronological order, above, repaced
//       into 365 days instead of his own 857 sections. The order is entirely
//       his; only the day boundaries are arithmetic, and the builder checks
//       verse by verse that the repacking did not disturb his sequence. See
//       tools/build-chronological-year.mjs.
//   psalms_wisdom.json   A psalm a day through the Psalter with Job,
//       Proverbs, Ecclesiastes and the Song alongside, 150 days. See
//       tools/build-psalms-and-wisdom.mjs.
//
// Townsend's own Old and New Testament arrangements are not plans here. They
// run 469 days and 388 -- the same order as chronological_year at four times
// the length -- and live under reference/reading_plans/sources/ because that
// plan is built from them.
//
// Import is by `code`: a plan already in the table is left alone, and only the
// missing ones are inserted. That is what lets a new plan reach a content.db
// built before it existed, and it keeps a reader's progress -- which lives in
// user.db keyed by the same code -- pointing at the plan it was pointing at.
use rusqlite::{params, Connection};
use serde::Deserialize;
use std::collections::HashMap;
use std::path::Path;

#[derive(Deserialize)]
struct PlanReading {
    book: String,
    chapter_start: i64,
    verse_start: Option<i64>,
    chapter_end: i64,
    verse_end: Option<i64>,
    label: String,
}

#[derive(Deserialize)]
struct PlanDay {
    day: i64,
    readings: Vec<PlanReading>,
}

#[derive(Deserialize)]
struct Plan {
    code: String,
    title: String,
    description: Option<String>,
    length_days: i64,
    days: Vec<PlanDay>,
}

fn load_book_lookup(conn: &Connection) -> anyhow::Result<HashMap<String, i64>> {
    let mut stmt = conn.prepare("SELECT id, name FROM books")?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(1)?, r.get::<_, i64>(0)?)))?;
    Ok(rows.collect::<Result<HashMap<_, _>, _>>()?)
}

fn import_plan(conn: &Connection, book_lookup: &HashMap<String, i64>, plan: Plan) -> anyhow::Result<usize> {
    conn.execute(
        "INSERT INTO reading_plans (code, title, description, length_days) VALUES (?1,?2,?3,?4)",
        params![plan.code, plan.title, plan.description, plan.length_days],
    )?;
    let plan_id = conn.last_insert_rowid();

    let mut stmt = conn.prepare(
        "INSERT INTO reading_plan_readings
           (plan_id, day_number, sort_order, book_id, chapter_start, verse_start, chapter_end, verse_end, label)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
    )?;
    let mut count = 0usize;
    for day in &plan.days {
        for (sort_order, reading) in day.readings.iter().enumerate() {
            let book_id = *book_lookup
                .get(&reading.book)
                .ok_or_else(|| anyhow::anyhow!("{}: unknown book {:?}", plan.code, reading.book))?;
            stmt.execute(params![
                plan_id,
                day.day,
                sort_order as i64,
                book_id,
                reading.chapter_start,
                reading.verse_start,
                reading.chapter_end,
                reading.verse_end,
                reading.label,
            ])?;
            count += 1;
        }
    }
    Ok(count)
}

/// The bundled plans, in the order they should appear in the plan list.
const PLAN_FILES: &[&str] = &[
    "mcheyne.json",
    "chronological_year.json",
    "canonical.json",
    "ninety_day.json",
    "psalms_wisdom.json",
];

fn existing_codes(conn: &Connection) -> anyhow::Result<std::collections::HashSet<String>> {
    let mut stmt = conn.prepare("SELECT code FROM reading_plans")?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn import(conn: &mut Connection, dir: &Path) -> anyhow::Result<usize> {
    let book_lookup = load_book_lookup(conn)?;
    let have = existing_codes(conn)?;

    let mut plans = Vec::new();
    for file in PLAN_FILES {
        let text = std::fs::read_to_string(dir.join(file))?;
        let plan: Plan = serde_json::from_str(&text)
            .map_err(|e| anyhow::anyhow!("{file}: {e}"))?;
        if !have.contains(&plan.code) {
            plans.push(plan);
        }
    }
    if plans.is_empty() {
        return Ok(0);
    }

    let tx = conn.transaction()?;
    let mut total = 0usize;
    for plan in plans {
        total += import_plan(&tx, &book_lookup, plan)?;
    }
    tx.commit()?;
    Ok(total)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    fn reference_dir() -> std::path::PathBuf {
        std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("reference")
            .join("reading_plans")
    }

    /// Every bundled plan imports, and importing again is a no-op -- which is
    /// what lets a content.db built before a plan existed pick it up.
    #[test]
    fn bundled_plans_import_once_and_only_once() {
        let dir = std::env::temp_dir().join(format!("sojourner-plan-import-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let mut conn = db::open_content_db(&dir.join("content.db")).unwrap();

        let first = import(&mut conn, &reference_dir()).unwrap();
        assert!(first > 0);

        let plans: i64 = conn.query_row("SELECT COUNT(*) FROM reading_plans", [], |r| r.get(0)).unwrap();
        assert_eq!(plans as usize, PLAN_FILES.len(), "every bundled plan is imported");

        // Each plan's readings span exactly the days it claims.
        let mut stmt = conn
            .prepare(
                "SELECT p.code, p.length_days, COUNT(DISTINCT r.day_number), MIN(r.day_number), MAX(r.day_number)
                   FROM reading_plans p JOIN reading_plan_readings r ON r.plan_id = p.id
                  GROUP BY p.id",
            )
            .unwrap();
        let rows: Vec<(String, i64, i64, i64, i64)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(rows.len(), PLAN_FILES.len());
        for (code, length_days, days_with_readings, first_day, last_day) in rows {
            assert_eq!(days_with_readings, length_days, "{code}: every day has a reading");
            assert_eq!(first_day, 1, "{code}: days start at 1");
            assert_eq!(last_day, length_days, "{code}: days end at length_days");
        }
        drop(stmt);

        assert_eq!(import(&mut conn, &reference_dir()).unwrap(), 0, "a second import inserts nothing");
        let after: i64 = conn.query_row("SELECT COUNT(*) FROM reading_plans", [], |r| r.get(0)).unwrap();
        assert_eq!(after as usize, PLAN_FILES.len(), "and adds no duplicate plans");

        drop(conn);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
