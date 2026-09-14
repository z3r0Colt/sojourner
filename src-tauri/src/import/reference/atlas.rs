//! The atlas gazetteer and its journeys, from `reference/atlas/`.
//!
//! `places.json` is written by `tools/extract-atlas.mjs` from OpenBible.info's
//! Bible Geocoding data (CC BY 4.0 -- the credit in Settings -> About is a
//! condition of the licence, not decoration). `journeys.json` is written by
//! hand: no open dataset traces the routes, so they are set down here from
//! the text, as ordered lists of place names and the verse that records each
//! leg.

use rusqlite::{params, Connection};
use serde::Deserialize;
use std::collections::HashMap;
use std::path::Path;

#[derive(Deserialize)]
struct RawPlace {
    id: String,
    slug: String,
    name: String,
    article: Option<String>,
    kinds: Vec<String>,
    category: String,
    lon: Option<f64>,
    lat: Option<f64>,
    approximate: bool,
    confidence: String,
    modern_name: Option<String>,
    modern_alternatives: i64,
    verses: Vec<RawVerse>,
}

#[derive(Deserialize)]
struct RawVerse {
    osis: String,
}

#[derive(Deserialize)]
struct RawJourney {
    slug: String,
    title: String,
    summary: String,
    era: String,
    reference: String,
    legs: Vec<RawLeg>,
}

#[derive(Deserialize)]
struct RawLeg {
    name: String,
    #[serde(rename = "ref")]
    reference: String,
    note: Option<String>,
    /// Set only where name and verse together cannot settle which place is
    /// meant; nothing currently needs it, but authoring a new route might.
    #[serde(default)]
    slug: Option<String>,
}

/// "Bethel 1" and "Bethel 2" are one name to a reader writing a route.
fn base_name(name: &str) -> String {
    let trimmed = name.trim_end_matches(|c: char| c.is_ascii_digit()).trim_end();
    if trimmed.is_empty() { name.to_lowercase() } else { trimmed.to_lowercase() }
}

pub fn import(conn: &mut Connection, dir: &Path) -> anyhow::Result<(usize, usize)> {
    let books = super::crossrefs::load_book_lookup(conn)?;
    let places: Vec<RawPlace> = serde_json::from_str(&std::fs::read_to_string(dir.join("places.json"))?)?;

    // Indexes the journey importer needs, built while inserting.
    let mut by_base: HashMap<String, Vec<usize>> = HashMap::new();
    let mut by_verse: HashMap<(i64, i64, i64), Vec<usize>> = HashMap::new();

    let tx = conn.transaction()?;
    {
        let mut place_stmt = tx.prepare(
            "INSERT INTO atlas_places
               (id, slug, name, article, kinds, category, lon, lat, approximate,
                confidence, modern_name, modern_alternatives, verse_count)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)
             ON CONFLICT(id) DO UPDATE SET
               slug=excluded.slug, name=excluded.name, lon=excluded.lon, lat=excluded.lat,
               confidence=excluded.confidence, modern_name=excluded.modern_name,
               verse_count=excluded.verse_count",
        )?;
        let mut verse_stmt =
            tx.prepare("INSERT INTO atlas_place_verses (place_id, book_id, chapter, verse) VALUES (?1,?2,?3,?4)")?;

        for (index, place) in places.iter().enumerate() {
            // Resolve the references before writing anything: the verse rows
            // point at the place row, so the place has to exist first, and
            // its stored count has to match what actually gets written.
            let resolved: Vec<(i64, i64, i64)> = place
                .verses
                .iter()
                .filter_map(|verse| {
                    let (osis, chapter, number) = super::crossrefs::parse_ref(&verse.osis)?;
                    // A few references fall in books outside the Protestant
                    // canon this app carries; those are skipped, not an error.
                    let book_id = *books.get(osis)?;
                    Some((book_id, chapter, number))
                })
                .collect();

            place_stmt.execute(params![
                place.id,
                place.slug,
                place.name,
                place.article,
                serde_json::to_string(&place.kinds)?,
                place.category,
                place.lon,
                place.lat,
                place.approximate as i64,
                place.confidence,
                place.modern_name,
                place.modern_alternatives,
                resolved.len() as i64,
            ])?;

            for &(book_id, chapter, number) in &resolved {
                verse_stmt.execute(params![place.id, book_id, chapter, number])?;
                by_verse.entry((book_id, chapter, number)).or_default().push(index);
            }
            by_base.entry(base_name(&place.name)).or_default().push(index);
        }
    }
    tx.commit()?;

    let journeys = import_journeys(conn, dir, &places, &books, &by_base, &by_verse)?;
    Ok((places.len(), journeys))
}

fn import_journeys(
    conn: &mut Connection,
    dir: &Path,
    places: &[RawPlace],
    books: &HashMap<String, i64>,
    by_base: &HashMap<String, Vec<usize>>,
    by_verse: &HashMap<(i64, i64, i64), Vec<usize>>,
) -> anyhow::Result<usize> {
    let path = dir.join("journeys.json");
    if !path.is_file() {
        return Ok(0);
    }
    let journeys: Vec<RawJourney> = serde_json::from_str(&std::fs::read_to_string(&path)?)?;

    let tx = conn.transaction()?;
    {
        let mut journey_stmt = tx.prepare(
            "INSERT INTO atlas_journeys (slug, title, summary, era, reference, sort_order)
             VALUES (?1,?2,?3,?4,?5,?6)",
        )?;
        let mut leg_stmt = tx.prepare(
            "INSERT INTO atlas_journey_legs
               (journey_id, sort_order, place_id, label, note, book_id, chapter, verse)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        )?;

        for (order, journey) in journeys.iter().enumerate() {
            journey_stmt.execute(params![
                journey.slug,
                journey.title,
                journey.summary,
                journey.era,
                journey.reference,
                order as i64
            ])?;
            let journey_id = tx.last_insert_rowid();

            for (leg_order, leg) in journey.legs.iter().enumerate() {
                let position = super::crossrefs::parse_ref(&leg.reference)
                    .and_then(|(osis, chapter, verse)| books.get(osis).map(|&b| (b, chapter, verse)));

                let place_index = resolve_leg(leg, position, places, by_base, by_verse).ok_or_else(|| {
                    anyhow::anyhow!(
                        "journey \"{}\": leg \"{}\" at {} matches no place -- \
                         fix the name, or pin it with an explicit \"slug\"",
                        journey.slug,
                        leg.name,
                        leg.reference
                    )
                })?;

                let (book_id, chapter, verse) = match position {
                    Some((b, c, v)) => (Some(b), Some(c), Some(v)),
                    None => (None, None, None),
                };
                // The route's own wording, not the gazetteer's: an itinerary
                // reads "Antioch", where the list of places has to say
                // "Antioch 1" to tell it from the one in Pisidia. The leg's
                // note carries that distinction where it matters.
                leg_stmt.execute(params![
                    journey_id,
                    leg_order as i64,
                    places[place_index].id,
                    leg.name,
                    leg.note,
                    book_id,
                    chapter,
                    verse
                ])?;
            }
        }
    }
    tx.commit()?;
    Ok(journeys.len())
}

/// Which place a leg means.
///
/// Most biblical place names are borne by several places -- there are five
/// Ramahs and four Gibeahs -- so a route written by name alone is ambiguous.
/// The verse settles it: of the places carrying that name, one is named in
/// that verse. Falling back to the name only works when it is unique, and an
/// explicit `slug` overrides everything, so a route can always be pinned.
fn resolve_leg(
    leg: &RawLeg,
    position: Option<(i64, i64, i64)>,
    places: &[RawPlace],
    by_base: &HashMap<String, Vec<usize>>,
    by_verse: &HashMap<(i64, i64, i64), Vec<usize>>,
) -> Option<usize> {
    if let Some(slug) = &leg.slug {
        return places.iter().position(|p| &p.slug == slug);
    }
    let wanted = base_name(&leg.name);
    let candidates = by_base.get(&wanted)?;

    if let Some(key) = position {
        if let Some(here) = by_verse.get(&key) {
            let mut named_here = here.iter().filter(|i| candidates.contains(i));
            if let Some(&first) = named_here.next() {
                return Some(first);
            }
        }
    }
    match candidates.as_slice() {
        [only] => Some(*only),
        _ => None,
    }
}
