//! Reads for the atlas: the gazetteer, one place's verses, the places named
//! in a passage, and the journeys.

use crate::models::{AtlasJourney, AtlasJourneyLeg, AtlasPlace, AtlasPlaceVerse};
use rusqlite::{params, Connection, OptionalExtension};

const PLACE_COLS: &str = "p.id, p.slug, p.name, p.article, p.kinds, p.category, p.lon, p.lat,
                          p.approximate, p.confidence, p.modern_name, p.modern_alternatives, p.verse_count";

fn map_place(r: &rusqlite::Row) -> rusqlite::Result<AtlasPlace> {
    Ok(AtlasPlace {
        id: r.get(0)?,
        slug: r.get(1)?,
        name: r.get(2)?,
        article: r.get(3)?,
        // Written by the importer with serde_json; a row that somehow isn't
        // valid JSON loses its kinds rather than failing the whole read.
        kinds: serde_json::from_str(&r.get::<_, String>(4)?).unwrap_or_default(),
        category: r.get(5)?,
        lon: r.get(6)?,
        lat: r.get(7)?,
        approximate: r.get::<_, i64>(8)? != 0,
        confidence: r.get(9)?,
        modern_name: r.get(10)?,
        modern_alternatives: r.get(11)?,
        verse_count: r.get(12)?,
    })
}

/// Every place, for the sidebar list and the map. 1,342 rows -- small enough
/// to hand over whole and hold, which is what lets the map draw without a
/// round trip on every pan.
pub fn list_atlas_places(conn: &Connection) -> anyhow::Result<Vec<AtlasPlace>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {PLACE_COLS} FROM atlas_places p ORDER BY p.name COLLATE NOCASE"
    ))?;
    let rows = stmt.query_map([], map_place)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn get_atlas_place(conn: &Connection, slug: &str) -> anyhow::Result<Option<AtlasPlace>> {
    Ok(conn
        .query_row(
            &format!("SELECT {PLACE_COLS} FROM atlas_places p WHERE p.slug = ?1"),
            params![slug],
            map_place,
        )
        .optional()?)
}

pub fn get_atlas_place_verses(conn: &Connection, slug: &str) -> anyhow::Result<Vec<AtlasPlaceVerse>> {
    let mut stmt = conn.prepare(
        "SELECT v.book_id, v.chapter, v.verse
         FROM atlas_place_verses v JOIN atlas_places p ON p.id = v.place_id
         WHERE p.slug = ?1
         ORDER BY v.book_id, v.chapter, v.verse",
    )?;
    let rows = stmt.query_map(params![slug], |r| {
        Ok(AtlasPlaceVerse {
            book_id: r.get(0)?,
            chapter: r.get(1)?,
            verse: r.get(2)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// The places named in a chapter -- or in one verse of it, when `verse` is
/// given. This is what makes the map follow the reading: open Acts 17 and
/// Thessalonica, Berea and Athens are what comes back.
pub fn places_in_passage(
    conn: &Connection,
    book_id: i64,
    chapter: i64,
    verse: Option<i64>,
) -> anyhow::Result<Vec<AtlasPlace>> {
    let verse_clause = if verse.is_some() { "AND v.verse = ?3" } else { "" };
    let sql = format!(
        "SELECT DISTINCT {PLACE_COLS}
         FROM atlas_places p JOIN atlas_place_verses v ON v.place_id = p.id
         WHERE v.book_id = ?1 AND v.chapter = ?2 {verse_clause}
         ORDER BY p.verse_count DESC, p.name COLLATE NOCASE"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = match verse {
        Some(v) => stmt.query_map(params![book_id, chapter, v], map_place)?.collect::<Result<Vec<_>, _>>()?,
        None => stmt.query_map(params![book_id, chapter], map_place)?.collect::<Result<Vec<_>, _>>()?,
    };
    Ok(rows)
}

pub fn search_atlas_places(conn: &Connection, query: &str, limit: i64) -> anyhow::Result<Vec<AtlasPlace>> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    let match_expr = super::search::build_match_expr(query);
    let mut stmt = conn.prepare(&format!(
        "SELECT {PLACE_COLS} FROM atlas_fts JOIN atlas_places p ON p.rowid = atlas_fts.rowid
         WHERE atlas_fts MATCH ?1 ORDER BY bm25(atlas_fts) LIMIT ?2"
    ))?;
    let rows = stmt.query_map(params![match_expr, limit], map_place)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// Every journey with its legs. Fourteen routes of a dozen legs each, so this
/// is one read rather than a list call followed by a call per journey.
pub fn list_atlas_journeys(conn: &Connection) -> anyhow::Result<Vec<AtlasJourney>> {
    let mut stmt = conn.prepare(
        "SELECT id, slug, title, summary, era, reference FROM atlas_journeys ORDER BY sort_order",
    )?;
    let mut journeys = stmt
        .query_map([], |r| {
            Ok(AtlasJourney {
                id: r.get(0)?,
                slug: r.get(1)?,
                title: r.get(2)?,
                summary: r.get(3)?,
                era: r.get(4)?,
                reference: r.get(5)?,
                legs: Vec::new(),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut leg_stmt = conn.prepare(
        "SELECT l.journey_id, l.place_id, p.slug, l.label, l.note, p.lon, p.lat, l.book_id, l.chapter, l.verse
         FROM atlas_journey_legs l LEFT JOIN atlas_places p ON p.id = l.place_id
         ORDER BY l.journey_id, l.sort_order",
    )?;
    let legs = leg_stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                AtlasJourneyLeg {
                    place_id: r.get(1)?,
                    place_slug: r.get(2)?,
                    label: r.get(3)?,
                    note: r.get(4)?,
                    lon: r.get(5)?,
                    lat: r.get(6)?,
                    book_id: r.get(7)?,
                    chapter: r.get(8)?,
                    verse: r.get(9)?,
                },
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    for (journey_id, leg) in legs {
        if let Some(journey) = journeys.iter_mut().find(|j| j.id == journey_id) {
            journey.legs.push(leg);
        }
    }
    Ok(journeys)
}
