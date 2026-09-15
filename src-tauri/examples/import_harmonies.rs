// Headless harmony import runner, for iterating on the harmony importer
// without rebuilding the whole 1GB content.db. Builds a throwaway database
// with nothing in it but the schema (which seeds `books` on its own), imports
// the bundled harmonies into it, and prints what landed.
//
// Usage: cargo run --example import_harmonies [-- <reference dir>]
//
// Where a built content.db is around, every reading is also checked against
// the verse numbers that actually exist. A harmony's JSON is generated from
// a printed book, and a citation can be mistranscribed into a range that
// looks perfectly well-formed -- "John 7:37-58", in a chapter with 53 verses
// -- which nothing but real verse data will catch.

use std::path::PathBuf;
use tauri_app_lib::{db, import};

fn main() -> anyhow::Result<()> {
    let reference_dir = std::env::args()
        .nth(1)
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("../reference"));

    let out = std::env::temp_dir().join("sojourner-harmony-check.db");
    for suffix in ["", "-wal", "-shm"] {
        let _ = std::fs::remove_file(format!("{}{suffix}", out.display()));
    }

    let mut conn = db::open_content_db(&out)?;
    let readings = import::reference::harmony::import(&mut conn, &reference_dir.join("harmony"))?;
    println!("imported {readings} readings\n");

    let mut stmt = conn.prepare(
        "SELECT h.code, h.title, h.author, h.year,
                (SELECT COUNT(*) FROM harmony_parts p WHERE p.harmony_id = h.id),
                (SELECT COUNT(*) FROM harmony_sections s WHERE s.harmony_id = h.id),
                (SELECT COUNT(*) FROM harmony_readings r
                   JOIN harmony_sections s ON s.id = r.section_id WHERE s.harmony_id = h.id),
                (SELECT COUNT(*) FROM harmony_section_notes n
                   JOIN harmony_sections s ON s.id = n.section_id WHERE s.harmony_id = h.id),
                (SELECT COUNT(*) FROM harmony_essays e WHERE e.harmony_id = h.id)
           FROM harmonies h ORDER BY h.sort_order",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, Option<String>>(2)?,
            r.get::<_, Option<i64>>(3)?,
            r.get::<_, i64>(4)?,
            r.get::<_, i64>(5)?,
            r.get::<_, i64>(6)?,
            r.get::<_, i64>(7)?,
            r.get::<_, i64>(8)?,
        ))
    })?;
    for row in rows {
        let (code, title, author, year, parts, sections, readings, notes, essays) = row?;
        println!("{code}: {title}");
        println!("  {} ({})", author.unwrap_or_else(|| "-".into()), year.map(|y| y.to_string()).unwrap_or_else(|| "-".into()));
        println!("  {parts} parts, {sections} sections, {readings} readings, {notes} notes, {essays} essays");
    }

    // Orphans would mean the importer failed to wire a section to its harmony
    // or its part -- silent in the UI, so worth failing loudly here.
    let orphan_sections: i64 =
        conn.query_row("SELECT COUNT(*) FROM harmony_sections WHERE harmony_id IS NULL", [], |r| r.get(0))?;
    let orphan_readings: i64 = conn.query_row(
        "SELECT COUNT(*) FROM harmony_readings r
          WHERE NOT EXISTS (SELECT 1 FROM harmony_sections s WHERE s.id = r.section_id)",
        [],
        |r| r.get(0),
    )?;
    let bad_parts: i64 = conn.query_row(
        "SELECT COUNT(*) FROM harmony_sections s
          WHERE s.part_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM harmony_parts p WHERE p.id = s.part_id AND p.harmony_id = s.harmony_id)",
        [],
        |r| r.get(0),
    )?;
    let dangling_essays: i64 = conn.query_row(
        "SELECT COUNT(*) FROM harmony_section_notes n
           JOIN harmony_sections s ON s.id = n.section_id
          WHERE n.essay_number IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM harmony_essays e
                             WHERE e.harmony_id = s.harmony_id AND e.number = n.essay_number)",
        [],
        |r| r.get(0),
    )?;
    println!("\norphan sections {orphan_sections}, orphan readings {orphan_readings}, sections pointing at another harmony's part {bad_parts}, notes citing a missing essay {dangling_essays}");

    check_verse_ranges(&conn)?;

    println!("\nsample -- Robertson, first section of each part:");
    let mut stmt = conn.prepare(
        "SELECT p.label, s.number, s.title, s.headnote,
                (SELECT GROUP_CONCAT(r.label, '; ') FROM harmony_readings r WHERE r.section_id = s.id)
           FROM harmony_sections s
           JOIN harmony_parts p ON p.id = s.part_id
           JOIN harmonies h ON h.id = s.harmony_id
          WHERE h.code = 'robertson'
            AND s.id = (SELECT MIN(s2.id) FROM harmony_sections s2 WHERE s2.part_id = p.id)
          ORDER BY p.sort_order",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok((
            r.get::<_, Option<String>>(0)?,
            r.get::<_, Option<String>>(1)?,
            r.get::<_, String>(2)?,
            r.get::<_, Option<String>>(3)?,
            r.get::<_, Option<String>>(4)?,
        ))
    })?;
    for row in rows {
        let (label, number, title, headnote, refs) = row?;
        println!("  {} §{}  {title}", label.unwrap_or_default(), number.unwrap_or_default());
        if let Some(h) = headnote {
            println!("      {h}");
        }
        println!("      {}", refs.unwrap_or_default());
    }

    Ok(())
}

/// Every reading against the verse numbers a real Bible has, using a built
/// content.db if one is lying around. Skipped with a note when it is not --
/// the throwaway database this example builds has books but no verses.
fn check_verse_ranges(conn: &rusqlite::Connection) -> anyhow::Result<()> {
    let content_db = ["../content/content.db", "content/content.db"]
        .into_iter()
        .map(PathBuf::from)
        .find(|p| p.exists());
    let Some(content_db) = content_db else {
        println!("\nno content.db found -- skipping the verse-range check");
        return Ok(());
    };

    conn.execute(
        "ATTACH DATABASE ?1 AS built",
        [format!("file:{}?mode=ro", content_db.display())],
    )?;
    // Any translation would do for chapter lengths; the ASV is the family
    // Robertson himself harmonized, so it is the natural yardstick.
    let mut stmt = conn.prepare(
        "SELECT h.code, COALESCE(s.number, CAST(s.sort_order AS TEXT)), r.label
           FROM harmony_readings r
           JOIN harmony_sections s ON s.id = r.section_id
           JOIN harmonies h ON h.id = s.harmony_id
          WHERE NOT EXISTS (SELECT 1 FROM built.verses v
                             WHERE v.translation_id = 1 AND v.book_id = r.book_id
                               AND v.chapter = r.chapter_start
                               AND v.verse = COALESCE(r.verse_start, 1))
             OR NOT EXISTS (SELECT 1 FROM built.verses v
                             WHERE v.translation_id = 1 AND v.book_id = r.book_id
                               AND v.chapter = r.chapter_end
                               AND v.verse = COALESCE(r.verse_end,
                                     (SELECT MAX(v2.verse) FROM built.verses v2
                                       WHERE v2.translation_id = 1 AND v2.book_id = r.book_id
                                         AND v2.chapter = r.chapter_end)))
          ORDER BY h.code, s.sort_order",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?))
    })?;
    let bad = rows.collect::<Result<Vec<_>, _>>()?;
    println!(
        "\nverse-range check against {}: {} reading(s) citing verses that do not exist",
        content_db.display(),
        bad.len()
    );
    for (code, number, label) in &bad {
        println!("  {code} §{number}: {label}");
    }
    Ok(())
}
