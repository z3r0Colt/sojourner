//! The timeline: eras and events for the view, and where a chapter falls.
//!
//! The whole timeline is a few hundred events, so the view takes all of it in
//! one call and lays it out itself; only an event's full verse list and a
//! chapter's place on the line are asked for separately.

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize)]
pub struct TimelineEra {
    pub slug: String,
    pub name: String,
    pub start_year: f64,
    pub end_year: f64,
    /// The atlas journeys of this era, by their `era`.
    pub journey_era: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TimelineEntity {
    pub id: String,
    pub name: String,
    pub role: String,
    /// The atlas place, for a place the atlas has.
    pub atlas_slug: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TimelineEvent {
    pub id: i64,
    pub title: String,
    /// Astronomical years, fractional (588 BC is -587).
    pub start_year: f64,
    pub end_year: f64,
    pub precision: String,
    pub parent_id: Option<i64>,
    /// "judah" or "israel" for a reign in the divided kingdom.
    pub lane: Option<String>,
    pub note: Option<String>,
    /// "theographic", or "added" for one the app added (dated by the source's
    /// year for its verse).
    pub source: String,
    pub book_id: Option<i64>,
    pub chapter: Option<i64>,
    pub verse: Option<i64>,
    pub entities: Vec<TimelineEntity>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Timeline {
    pub eras: Vec<TimelineEra>,
    pub events: Vec<TimelineEvent>,
}

pub fn is_available(conn: &Connection) -> bool {
    conn.query_row("SELECT 1 FROM timeline_events LIMIT 1", [], |_| Ok(())).is_ok()
}

pub fn all(conn: &Connection) -> anyhow::Result<Timeline> {
    if !is_available(conn) {
        return Ok(Timeline { eras: Vec::new(), events: Vec::new() });
    }
    let eras = conn
        .prepare("SELECT slug, name, start_year, end_year, journey_era FROM timeline_eras ORDER BY sort_order")?
        .query_map([], |r| {
            Ok(TimelineEra { slug: r.get(0)?, name: r.get(1)?, start_year: r.get(2)?, end_year: r.get(3)?, journey_era: r.get(4)? })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut entities: HashMap<i64, Vec<TimelineEntity>> = HashMap::new();
    let mut stmt = conn.prepare(
        "SELECT x.event_id, e.id, e.name, x.role,
                (SELECT l.slug FROM factbook_links l WHERE l.entity_id = e.id AND l.kind = 'atlas' LIMIT 1)
         FROM timeline_event_entities x JOIN factbook_entities e ON e.id = x.entity_id
         ORDER BY x.event_id, x.role DESC, e.name",
    )?;
    for row in stmt.query_map([], |r| {
        Ok((r.get::<_, i64>(0)?, TimelineEntity { id: r.get(1)?, name: r.get(2)?, role: r.get(3)?, atlas_slug: r.get(4)? }))
    })? {
        let (event, entity) = row?;
        entities.entry(event).or_default().push(entity);
    }

    let keys: HashMap<String, i64> = conn
        .prepare("SELECT key, id FROM timeline_events")?
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<Result<_, _>>()?;
    let events = conn
        .prepare(
            "SELECT id, title, start_year, end_year, precision, parent_key, lane, note, source, book_id, chapter, verse
             FROM timeline_events ORDER BY start_year, id",
        )?
        .query_map([], |r| {
            let parent: Option<String> = r.get(5)?;
            Ok(TimelineEvent {
                id: r.get(0)?,
                title: r.get(1)?,
                start_year: r.get(2)?,
                end_year: r.get(3)?,
                precision: r.get(4)?,
                parent_id: parent.and_then(|k| keys.get(&k).copied()),
                lane: r.get(6)?,
                note: r.get(7)?,
                source: r.get(8)?,
                book_id: r.get(9)?,
                chapter: r.get(10)?,
                verse: r.get(11)?,
                entities: Vec::new(),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .map(|mut e| {
            e.entities = entities.remove(&e.id).unwrap_or_default();
            e
        })
        .collect();
    Ok(Timeline { eras, events })
}

/// Every verse that records an event, in order.
pub fn event_verses(conn: &Connection, event_id: i64) -> anyhow::Result<Vec<(i64, i64, i64)>> {
    Ok(conn
        .prepare("SELECT book_id, chapter, verse FROM timeline_event_verses WHERE event_id = ?1 ORDER BY book_id, chapter, verse")?
        .query_map(params![event_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
        .collect::<Result<Vec<_>, _>>()?)
}

#[derive(Debug, Clone, Serialize)]
pub struct PassageTimeline {
    /// The years of the chapter's first and last dated verse, if it has any.
    pub start_year: Option<f64>,
    pub end_year: Option<f64>,
    /// Events a verse of this chapter records.
    pub event_ids: Vec<i64>,
}

/// Where a chapter falls on the line, and the events it records.
pub fn for_passage(conn: &Connection, book_id: i64, chapter: i64) -> anyhow::Result<PassageTimeline> {
    if !is_available(conn) {
        return Ok(PassageTimeline { start_year: None, end_year: None, event_ids: Vec::new() });
    }
    let years: Option<(f64, f64)> = conn
        .query_row(
            "SELECT start_year, end_year FROM timeline_chapter_years WHERE book_id = ?1 AND chapter = ?2",
            params![book_id, chapter],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    let event_ids = conn
        .prepare("SELECT DISTINCT event_id FROM timeline_event_verses WHERE book_id = ?1 AND chapter = ?2")?
        .query_map(params![book_id, chapter], |r| r.get(0))?
        .collect::<Result<Vec<i64>, _>>()?;
    Ok(PassageTimeline { start_year: years.map(|y| y.0), end_year: years.map(|y| y.1), event_ids })
}
