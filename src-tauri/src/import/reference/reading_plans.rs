// Imports bundled reading plans from pre-generated JSON files into
// reading_plans/reading_plan_readings.
//
// mcheyne.json is Robert Murray M'Cheyne's classic 1842 calendar (public
// domain), extracted from the day-by-day JSON data embedded in
// bibleplan.org's plan page (https://bibleplan.org/plans/mcheyne, itself
// reproducing the calendar as commonly published) and verified: 365 days,
// exactly 4 readings/day, ending on 2 Chronicles 36 / Revelation 22 /
// Malachi 4 / John 21 as the calendar is known to. One entry ("Jeremiah
// 36&45") names two disjoint chapters rather than a range and is split into
// two separate reading rows for that day.
//
// canonical.json and ninety_day.json are generated, not sourced: every
// chapter of every book, in canonical order, divided as evenly as possible
// by chapter count (not word count) across 365 or 90 days respectively. See
// the generation script's own output for the day-by-day breakdown -- there's
// no external plan being reproduced here, just an even split of the canon.
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

pub fn import(conn: &mut Connection, dir: &Path) -> anyhow::Result<usize> {
    let book_lookup = load_book_lookup(conn)?;

    let mut plans = Vec::new();
    for file in ["mcheyne.json", "canonical.json", "ninety_day.json"] {
        let text = std::fs::read_to_string(dir.join(file))?;
        plans.push(serde_json::from_str::<Plan>(&text)?);
    }

    let tx = conn.transaction()?;
    let mut total = 0usize;
    for plan in plans {
        total += import_plan(&tx, &book_lookup, plan)?;
    }
    tx.commit()?;
    Ok(total)
}
