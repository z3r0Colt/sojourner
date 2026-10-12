use crate::models::{
    Harmony, HarmonyDetail, HarmonyEssay, HarmonyPart, HarmonyReading, HarmonySection,
    HarmonySectionNote,
};
use rusqlite::Connection;
use std::collections::HashMap;

/// The bundled harmonies, for the picker, each with the number of sections it
/// divides the life of Christ into -- the one figure that actually
/// distinguishes them at a glance.
pub fn list_harmonies(conn: &Connection) -> anyhow::Result<Vec<Harmony>> {
    let mut stmt = conn.prepare(
        "SELECT h.id, h.code, h.title, h.author, h.year, h.description, h.source_note,
                (SELECT COUNT(*) FROM harmony_sections s WHERE s.harmony_id = h.id)
           FROM harmonies h
          ORDER BY h.sort_order",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(Harmony {
            id: r.get(0)?,
            code: r.get(1)?,
            title: r.get(2)?,
            author: r.get(3)?,
            year: r.get(4)?,
            description: r.get(5)?,
            source_note: r.get(6)?,
            section_count: r.get(7)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// One harmony whole: its parts, its sections in order with their readings
/// and footnotes, and its essays. The largest bundled harmony is Robertson's
/// at 185 sections and 434 readings -- small enough to load in one go rather
/// than page.
///
/// `code` of None means the first harmony in picker order, which is what the
/// view asks for before the reader has chosen one.
pub fn get_harmony(conn: &Connection, code: Option<&str>) -> anyhow::Result<Option<HarmonyDetail>> {
    let harmony = match code {
        Some(code) => list_harmonies(conn)?.into_iter().find(|h| h.code == code),
        None => list_harmonies(conn)?.into_iter().next(),
    };
    let Some(harmony) = harmony else { return Ok(None) };

    let mut stmt = conn.prepare(
        "SELECT id, sort_order, label, title FROM harmony_parts WHERE harmony_id = ?1 ORDER BY sort_order",
    )?;
    let parts = stmt
        .query_map([harmony.id], |r| {
            Ok(HarmonyPart { id: r.get(0)?, sort_order: r.get(1)?, label: r.get(2)?, title: r.get(3)? })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut stmt = conn.prepare(
        "SELECT id, sort_order, number, title, headnote, part_id
           FROM harmony_sections WHERE harmony_id = ?1 ORDER BY sort_order",
    )?;
    let mut sections = stmt
        .query_map([harmony.id], |r| {
            Ok(HarmonySection {
                id: r.get(0)?,
                sort_order: r.get(1)?,
                number: r.get(2)?,
                title: r.get(3)?,
                headnote: r.get(4)?,
                part_id: r.get(5)?,
                readings: Vec::new(),
                notes: Vec::new(),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let index_by_id: HashMap<i64, usize> =
        sections.iter().enumerate().map(|(i, s)| (s.id, i)).collect();

    let mut stmt = conn.prepare(
        "SELECT r.section_id, r.book_id, r.chapter_start, r.verse_start, r.chapter_end, r.verse_end, r.label
           FROM harmony_readings r
           JOIN harmony_sections s ON s.id = r.section_id
          WHERE s.harmony_id = ?1
          ORDER BY r.section_id, r.sort_order",
    )?;
    let rows = stmt.query_map([harmony.id], |r| {
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

    let mut stmt = conn.prepare(
        "SELECT n.section_id, n.marker, n.text, n.essay_number
           FROM harmony_section_notes n
           JOIN harmony_sections s ON s.id = n.section_id
          WHERE s.harmony_id = ?1
          ORDER BY n.section_id, n.sort_order",
    )?;
    let rows = stmt.query_map([harmony.id], |r| {
        Ok((
            r.get::<_, i64>(0)?,
            HarmonySectionNote { marker: r.get(1)?, text: r.get(2)?, essay_number: r.get(3)? },
        ))
    })?;
    for row in rows {
        let (section_id, note) = row?;
        if let Some(&i) = index_by_id.get(&section_id) {
            sections[i].notes.push(note);
        }
    }

    let mut stmt = conn.prepare(
        "SELECT number, title, body FROM harmony_essays WHERE harmony_id = ?1 ORDER BY number",
    )?;
    let essays = stmt
        .query_map([harmony.id], |r| {
            Ok(HarmonyEssay { number: r.get(0)?, title: r.get(1)?, body: r.get(2)? })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(Some(HarmonyDetail { harmony, parts, sections, essays }))
}
