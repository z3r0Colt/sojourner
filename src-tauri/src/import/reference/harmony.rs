// Imports the Harmony of the Gospels from a pre-generated JSON file into
// harmony_sections/harmony_readings.
//
// Source: the chronological table of contents of Robert M. Sutherland's "A
// Four-Column Parallel and Chronological Harmony of the Gospels" (2020,
// https://ebible.org/eng-web/helps/ParallelGospels.docx), which the author's
// own stated terms permit reproducing with attribution. Only the event
// breakdown and its Scripture references are used here -- 136 sections,
// extracted from the document's own table of contents and cross-checked
// chapter-by-chapter against each Gospel's chapter count -- not the book's
// narrative commentary, Greek text, or the WEB verse text it quotes (this
// app already has verse text for every bundled translation).
use rusqlite::{params, Connection};
use serde::Deserialize;
use std::collections::HashMap;
use std::path::Path;

#[derive(Deserialize)]
struct HarmonyReading {
    book: String,
    chapter_start: i64,
    verse_start: Option<i64>,
    chapter_end: i64,
    verse_end: Option<i64>,
    label: String,
}

#[derive(Deserialize)]
struct HarmonySection {
    order: i64,
    title: String,
    readings: Vec<HarmonyReading>,
}

#[derive(Deserialize)]
struct Harmony {
    sections: Vec<HarmonySection>,
}

fn load_book_lookup(conn: &Connection) -> anyhow::Result<HashMap<String, i64>> {
    let mut stmt = conn.prepare("SELECT id, name FROM books")?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(1)?, r.get::<_, i64>(0)?)))?;
    Ok(rows.collect::<Result<HashMap<_, _>, _>>()?)
}

pub fn import(conn: &mut Connection, dir: &Path) -> anyhow::Result<usize> {
    let book_lookup = load_book_lookup(conn)?;
    let text = std::fs::read_to_string(dir.join("harmony_of_the_gospels.json"))?;
    let harmony: Harmony = serde_json::from_str(&text)?;

    let tx = conn.transaction()?;
    let mut count = 0usize;
    {
        let mut insert_section = tx.prepare("INSERT INTO harmony_sections (sort_order, title) VALUES (?1,?2)")?;
        let mut insert_reading = tx.prepare(
            "INSERT INTO harmony_readings
               (section_id, sort_order, book_id, chapter_start, verse_start, chapter_end, verse_end, label)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        )?;
        for section in &harmony.sections {
            insert_section.execute(params![section.order, section.title])?;
            let section_id = tx.last_insert_rowid();
            for (sort_order, reading) in section.readings.iter().enumerate() {
                let book_id = *book_lookup
                    .get(&reading.book)
                    .ok_or_else(|| anyhow::anyhow!("harmony: unknown book {:?}", reading.book))?;
                insert_reading.execute(params![
                    section_id,
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
    }
    tx.commit()?;
    Ok(count)
}
