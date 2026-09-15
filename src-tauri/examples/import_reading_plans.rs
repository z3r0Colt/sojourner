// Headless reading-plan import runner, on the model of import_harmonies.
//
// By default it builds a throwaway database with nothing in it but the schema
// (which seeds `books` on its own), imports the bundled plans into it, and
// prints what landed.
//
// Usage: cargo run --example import_reading_plans [-- [<reference dir>] [--into <content.db>]]
//
// `--into` imports into an existing content.db instead of a throwaway one.
// reading_plans::import inserts by `code` and skips what is already there, so
// this is how a dev checkout's already-built 1GB content.db picks up a plan
// added after it was built, without spending twenty minutes rebuilding it.
//
// Where a built content.db is around, every reading is also checked against the
// verse numbers that actually exist. A plan's JSON is generated from a printed
// table, and a citation can be mistranscribed into a range that looks perfectly
// well-formed -- "Psalm 119:1-200", in a psalm with 176 verses -- which nothing
// but real verse data will catch.

use std::path::PathBuf;
use tauri_app_lib::{db, import};

fn main() -> anyhow::Result<()> {
    let mut reference_dir: Option<PathBuf> = None;
    let mut into: Option<PathBuf> = None;
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--into" => into = args.next().map(PathBuf::from),
            _ => reference_dir = Some(PathBuf::from(arg)),
        }
    }
    let reference_dir = reference_dir.unwrap_or_else(|| PathBuf::from("../reference"));

    let target = match &into {
        Some(path) => {
            println!("importing into {}", path.display());
            path.clone()
        }
        None => {
            let out = std::env::temp_dir().join("sojourner-reading-plan-check.db");
            for suffix in ["", "-wal", "-shm"] {
                let _ = std::fs::remove_file(format!("{}{suffix}", out.display()));
            }
            out
        }
    };

    let mut conn = db::open_content_db(&target)?;
    let readings = import::reference::reading_plans::import(&mut conn, &reference_dir.join("reading_plans"))?;
    println!("imported {readings} readings\n");

    let mut stmt = conn.prepare(
        "SELECT p.code, p.title, p.length_days,
                (SELECT COUNT(*) FROM reading_plan_readings r WHERE r.plan_id = p.id),
                (SELECT COUNT(DISTINCT r.day_number) FROM reading_plan_readings r WHERE r.plan_id = p.id)
           FROM reading_plans p ORDER BY p.id",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, i64>(2)?,
            r.get::<_, i64>(3)?,
            r.get::<_, i64>(4)?,
        ))
    })?;
    for row in rows {
        let (code, title, length_days, readings, days_with_readings) = row?;
        let gap = if days_with_readings == length_days { "" } else { "  <-- DAYS WITHOUT READINGS" };
        println!("{code}: {title}");
        println!("  {length_days} days, {readings} readings, {days_with_readings} days with readings{gap}");
    }
    drop(stmt);

    // A day out of range, or a plan whose readings stop short, would show in
    // the UI as an empty day with no explanation.
    let bad_days: i64 = conn.query_row(
        "SELECT COUNT(*) FROM reading_plan_readings r
           JOIN reading_plans p ON p.id = r.plan_id
          WHERE r.day_number < 1 OR r.day_number > p.length_days",
        [],
        |r| r.get(0),
    )?;
    let orphans: i64 = conn.query_row(
        "SELECT COUNT(*) FROM reading_plan_readings r
          WHERE NOT EXISTS (SELECT 1 FROM reading_plans p WHERE p.id = r.plan_id)",
        [],
        |r| r.get(0),
    )?;
    println!("\nreadings on a day outside the plan {bad_days}, orphan readings {orphans}");

    check_verse_ranges(&conn, into.as_deref())?;
    Ok(())
}

/// Every reading against the verse numbers a real Bible has.
fn check_verse_ranges(conn: &rusqlite::Connection, already_built: Option<&std::path::Path>) -> anyhow::Result<()> {
    // When importing straight into a content.db the verses are already here.
    let attached = if already_built.is_some() {
        None
    } else {
        let found = ["../content/content.db", "content/content.db"]
            .into_iter()
            .map(PathBuf::from)
            .find(|p| p.exists());
        let Some(path) = found else {
            println!("\nno content.db found -- skipping the verse-range check");
            return Ok(());
        };
        conn.execute("ATTACH DATABASE ?1 AS built", [format!("file:{}?mode=ro", path.display())])?;
        Some(path)
    };
    let scope = if attached.is_some() { "built." } else { "main." };

    let sql = format!(
        "SELECT p.code, r.day_number, r.label
           FROM reading_plan_readings r
           JOIN reading_plans p ON p.id = r.plan_id
          WHERE NOT EXISTS (SELECT 1 FROM {scope}verses v
                             WHERE v.translation_id = 1 AND v.book_id = r.book_id
                               AND v.chapter = r.chapter_start
                               AND v.verse = COALESCE(r.verse_start, 1))
             OR NOT EXISTS (SELECT 1 FROM {scope}verses v
                             WHERE v.translation_id = 1 AND v.book_id = r.book_id
                               AND v.chapter = r.chapter_end
                               AND v.verse = COALESCE(r.verse_end,
                                     (SELECT MAX(v2.verse) FROM {scope}verses v2
                                       WHERE v2.translation_id = 1 AND v2.book_id = r.book_id
                                         AND v2.chapter = r.chapter_end)))
          ORDER BY p.id, r.day_number"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?, r.get::<_, String>(2)?))
    })?;
    let bad = rows.collect::<Result<Vec<_>, _>>()?;
    println!(
        "\nverse-range check against {}: {} reading(s) citing verses that do not exist",
        attached.map(|p| p.display().to_string()).unwrap_or_else(|| "the target database".into()),
        bad.len()
    );
    for (code, day, label) in bad.iter().take(40) {
        println!("  {code} day {day}: {label}");
    }
    Ok(())
}
