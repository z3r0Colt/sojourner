use crate::models::{HarmonyReading, HarmonySection};
use rusqlite::Connection;
use std::collections::HashMap;

/// The full harmony, sections in order, each with its readings -- ~280 rows
/// total, cheap enough to load whole rather than paging.
pub fn list_sections(conn: &Connection) -> anyhow::Result<Vec<HarmonySection>> {
    let mut section_stmt = conn.prepare("SELECT id, sort_order, title FROM harmony_sections ORDER BY sort_order")?;
    let rows = section_stmt.query_map([], |r| {
        Ok(HarmonySection {
            id: r.get(0)?,
            sort_order: r.get(1)?,
            title: r.get(2)?,
            readings: Vec::new(),
        })
    })?;
    let mut sections = rows.collect::<Result<Vec<_>, _>>()?;
    let index_by_id: HashMap<i64, usize> = sections.iter().enumerate().map(|(i, s)| (s.id, i)).collect();

    let mut reading_stmt = conn.prepare(
        "SELECT section_id, book_id, chapter_start, verse_start, chapter_end, verse_end, label
         FROM harmony_readings ORDER BY section_id, sort_order",
    )?;
    let rows = reading_stmt.query_map([], |r| {
        Ok((
            r.get::<_, i64>(0)?,
            HarmonyReading {
                book_id: r.get(1)?,
                chapter_start: r.get(2)?,
                verse_start: r.get(3)?,
                chapter_end: r.get(4)?,
                verse_end: r.get(5)?,
                label: r.get(6)?,
            },
        ))
    })?;
    for row in rows {
        let (section_id, reading) = row?;
        if let Some(&i) = index_by_id.get(&section_id) {
            sections[i].readings.push(reading);
        }
    }

    Ok(sections)
}
