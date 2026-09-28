//! Church history on the timeline: `reference/timeline/church_history.json`
//! into the same `timeline_*` tables as the Bible's events, with
//! `source = 'church'` and eras on the 'church' track.
//!
//! The file is written by hand, and its whole claim is that every date in it
//! can be checked: each event names the work, volume and place that give its
//! date and quotes the source's own words for it (see SOURCES.md beside it).
//! So this importer is strict about the shape of that claim. An event without
//! a source or a quote, a kind or precision the view does not know, a `date`
//! that disagrees with the year it is filed under, a confession the app does
//! not ship, a book the library does not carry, a key used twice, an era slug
//! that could be mistaken for a Bible era's -- any of these fails the build,
//! and every one found is reported together, so a bad edit is fixed in one
//! pass rather than one complaint at a time.
//!
//! Years are AD, so astronomical and historical years are the same number. A
//! month or day the source prints is folded into `start_year` as a fraction
//! of the year, the way `tools/extract-timeline.mjs` dates the Bible's events
//! (1 July is half a year in), so an event of 13 November sits to the right of
//! one of that March; `date` keeps the text for the reader.
//!
//! Each event carries a permanent `id` in the file, and its row is numbered
//! from it (`ID_BASE` + id) rather than by the order it was inserted in. A
//! reader's saved timeline pane names the event it had open by row id, and
//! the file is kept in order of year, so an event added in the fourth
//! century would otherwise renumber every one after it -- and a pane saved on
//! Calvin would open, next release, on whoever now had his number, with
//! nothing to say it had changed. With the ids written down, a new event takes
//! the next unused number wherever it falls, and every build gives every event
//! the row it had before.
//!
//! The import is a replace: it clears church history's own rows (its
//! citations, events and eras, and nothing of the Bible's) and writes the
//! file again, on every build. The file is edited by hand and checked on
//! import, so an edit to it reaches the next `--update` build rather than
//! waiting for a clean one, and because the ids come from the file the rows
//! come back under the same numbers.

use chrono::Datelike;
use rusqlite::{params, Connection};
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::path::Path;

/// The file name within `reference/timeline`.
pub const FILE_NAME: &str = "church_history.json";

/// A church event's row id is this plus its `id` in the file. The Bible's
/// events are numbered from 1 as they are imported, some four hundred and
/// sixty of them, so church history starts well clear of them and neither
/// can grow into the other's numbers; `import` refuses to run if the Bible's
/// ever did.
pub const ID_BASE: i64 = 100_000;

/// SOURCES.md promises every quotation is at most this long: long enough for
/// the sentence that gives the date, short enough to be a citation of a
/// source rather than a copy of it, and to sit whole in the event's detail.
const MAX_QUOTE_CHARS: usize = 300;

/// Every church era's slug begins with this, so none can collide with a
/// Bible era's in `timeline_eras` ("apostolic" is both an age of the Bible's
/// story and of the church's).
pub const ERA_PREFIX: &str = "church-";

/// Stored keys are namespaced the way the Bible's are ("theo:412",
/// "add:jair"), so a church event's key can never be mistaken for one.
const KEY_PREFIX: &str = "church:";

const KINDS: &[&str] = &["council", "life", "writing", "mission", "event"];
const PRECISIONS: &[&str] = &["year", "month", "day"];

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct File {
    #[allow(dead_code)]
    note: String,
    eras: Vec<RawEra>,
    events: Vec<RawEvent>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RawEra {
    slug: String,
    name: String,
    start: i64,
    end: i64,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RawEvent {
    /// Permanent: never renumbered or reused (see the module comment).
    id: i64,
    key: String,
    title: String,
    kind: String,
    start: i64,
    end: i64,
    precision: String,
    #[serde(default)]
    date: Option<String>,
    #[serde(default)]
    circa: bool,
    note: String,
    era: String,
    source: RawSource,
    #[serde(default)]
    second_source: Option<RawSource>,
    #[serde(default)]
    confession: Option<String>,
    #[serde(default)]
    resource: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RawSource {
    work: String,
    #[serde(default)]
    volume: Option<String>,
    #[serde(default)]
    locator: Option<String>,
    /// Where the quote was read: a page on the web, or the extracted text of
    /// a library EPUB (build-time provenance, not something the app can open).
    file: String,
    quote: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ChurchEra {
    pub slug: String,
    pub name: String,
    pub start_year: f64,
    pub end_year: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Citation {
    pub work: String,
    pub volume: Option<String>,
    pub locator: Option<String>,
    pub quote: String,
    /// The source's `file`, when that is a page on the web a reader can open.
    pub url: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ChurchEvent {
    /// The row id: `ID_BASE` plus the file's permanent `id`.
    pub id: i64,
    /// As stored: "church:council-of-nicaea".
    pub key: String,
    pub title: String,
    pub kind: String,
    pub start_year: f64,
    pub end_year: f64,
    pub precision: String,
    pub circa: bool,
    pub date: Option<String>,
    pub note: String,
    /// The slug of the era the file files it under ("church-reformation").
    /// Kept rather than worked out again from the years, because the two do
    /// not agree and the file is right: a life is filed with the age its work
    /// belongs to (Luther, born in 1483, is the Reformation's), and an event
    /// on a boundary year with the age it closes (the Peace of Westphalia,
    /// 1648, ends the Reformation rather than opening the Puritans' age).
    pub era: String,
    pub confession: Option<String>,
    pub resource: Option<String>,
    /// The date's source first, then the second where there is one.
    pub citations: Vec<Citation>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ChurchHistory {
    pub eras: Vec<ChurchEra>,
    pub events: Vec<ChurchEvent>,
}

/// A month or day as a fraction of its year, as the Bible's events are
/// dated: `year + (month - 1) / 12 + (day - 1) / 365.25`, to three places.
/// "0451-10-08" is 451.769; a year alone is itself.
pub fn fractional_year(year: i64, date: Option<&str>) -> f64 {
    let (month, day) = date.and_then(|d| parse_date(d).ok()).map(|(_, m, d)| (m, d)).unwrap_or((None, None));
    let at = year as f64 + month.map_or(0.0, |m| (m - 1) as f64 / 12.0) + day.map_or(0.0, |d| (d - 1) as f64 / 365.25);
    (at * 1000.0).round() / 1000.0
}

/// Whether February has a 29th in `year`, in the calendar the file's dates
/// are reckoned in. Through 1752 that is the Julian rule, every fourth year:
/// the sources are Old Style before the Gregorian reform of 1582, and Britain
/// and its colonies kept Old Style until September 1752 (Sweden changed early
/// in 1753), so 29 February 1700 was a day in London and Boston though not in
/// Rome. From 1753 a date is New Style, and a century year has no leap day
/// unless it divides by 400 -- there was no 29 February 1800 or 1900.
fn has_leap_day(year: i64) -> bool {
    let julian = year % 4 == 0;
    if year <= 1752 {
        julian
    } else {
        julian && (year % 100 != 0 || year % 400 == 0)
    }
}

/// "YYYY-MM" or "YYYY-MM-DD" into its parts, refusing anything that is not a
/// day of the calendar (see `has_leap_day` for which calendar).
fn parse_date(date: &str) -> Result<(i64, Option<u32>, Option<u32>), String> {
    let parts: Vec<&str> = date.split('-').collect();
    let well_formed = matches!(parts.len(), 2 | 3)
        && parts[0].len() == 4
        && parts[1..].iter().all(|p| p.len() == 2)
        && parts.iter().all(|p| p.bytes().all(|b| b.is_ascii_digit()));
    if !well_formed {
        return Err(format!("date \"{date}\" is not YYYY-MM or YYYY-MM-DD"));
    }
    let year: i64 = parts[0].parse().map_err(|_| format!("date \"{date}\" has no year"))?;
    let month: u32 = parts[1].parse().map_err(|_| format!("date \"{date}\" has no month"))?;
    if !(1..=12).contains(&month) {
        return Err(format!("date \"{date}\" has no month {month}"));
    }
    let Some(day) = parts.get(2) else {
        return Ok((year, Some(month), None));
    };
    let day: u32 = day.parse().map_err(|_| format!("date \"{date}\" has no day"))?;
    let days_in_month = match month {
        2 if has_leap_day(year) => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    };
    if !(1..=days_in_month).contains(&day) {
        return Err(format!("date \"{date}\" is not a day of the calendar"));
    }
    Ok((year, Some(month), Some(day)))
}

fn is_url(file: &str) -> bool {
    file.starts_with("https://") || file.starts_with("http://")
}

fn citation(raw: &RawSource, which: &str, key: &str, problems: &mut Vec<String>) -> Citation {
    for (field, value) in [("work", &raw.work), ("file", &raw.file), ("quote", &raw.quote)] {
        if value.trim().is_empty() {
            problems.push(format!("{key}: {which}.{field} is empty"));
        }
    }
    for (field, value) in [("volume", &raw.volume), ("locator", &raw.locator)] {
        if value.as_deref().is_some_and(|v| v.trim().is_empty()) {
            problems.push(format!("{key}: {which}.{field} is empty (leave it out instead)"));
        }
    }
    let quote_chars = raw.quote.chars().count();
    if quote_chars > MAX_QUOTE_CHARS {
        problems.push(format!("{key}: {which}.quote is {quote_chars} characters; a quote is at most {MAX_QUOTE_CHARS}"));
    }
    Citation {
        work: raw.work.clone(),
        volume: raw.volume.clone(),
        locator: raw.locator.clone(),
        quote: raw.quote.clone(),
        url: is_url(&raw.file).then(|| raw.file.clone()),
    }
}

/// Reads and checks the file. `confessions` are the codes of the documents
/// the content database carries (`westminster_documents.code`); `resources`
/// the file names of the shipped books (`library_catalog.file_name`);
/// `present_year` the year of the build, which nothing in the file may end
/// after.
pub fn parse(text: &str, confessions: &HashSet<String>, resources: &HashSet<String>, present_year: i64) -> anyhow::Result<ChurchHistory> {
    let file: File = serde_json::from_str(text).map_err(|e| anyhow::anyhow!("{FILE_NAME} is not in the expected shape: {e}"))?;
    let mut problems: Vec<String> = Vec::new();

    let mut era_slugs: HashSet<&str> = HashSet::new();
    for era in &file.eras {
        if era.end > present_year {
            problems.push(format!("era \"{}\" ends in {}, after the present ({present_year})", era.slug, era.end));
        }
        if !era.slug.starts_with(ERA_PREFIX) || era.slug.len() == ERA_PREFIX.len() {
            problems.push(format!("era \"{}\": a church era's slug begins \"{ERA_PREFIX}\"", era.slug));
        }
        if !era_slugs.insert(&era.slug) {
            problems.push(format!("era \"{}\" is defined twice", era.slug));
        }
        if era.name.trim().is_empty() {
            problems.push(format!("era \"{}\" has no name", era.slug));
        }
        if era.start > era.end {
            problems.push(format!("era \"{}\" ends ({}) before it starts ({})", era.slug, era.end, era.start));
        }
    }

    let mut keys: HashSet<&str> = HashSet::new();
    let mut ids: HashMap<i64, &str> = HashMap::new();
    let mut events: Vec<ChurchEvent> = Vec::with_capacity(file.events.len());
    for e in &file.events {
        let key = e.key.as_str();
        if key.is_empty() || !key.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-') {
            problems.push(format!("key \"{key}\": keys are lower-case letters, digits and hyphens"));
        }
        if !keys.insert(key) {
            problems.push(format!("{key}: the key is used twice"));
        }
        if !(1..ID_BASE).contains(&e.id) {
            problems.push(format!("{key}: id {} is not between 1 and {}", e.id, ID_BASE - 1));
        }
        if let Some(other) = ids.insert(e.id, key) {
            problems.push(format!("{key}: id {} is {other}'s already (a new event takes the next unused number)", e.id));
        }
        if e.title.trim().is_empty() {
            problems.push(format!("{key}: no title"));
        }
        if e.note.trim().is_empty() {
            problems.push(format!("{key}: no note"));
        }
        if !KINDS.contains(&e.kind.as_str()) {
            problems.push(format!("{key}: kind \"{}\" is not one of {}", e.kind, KINDS.join(", ")));
        }
        if !PRECISIONS.contains(&e.precision.as_str()) {
            problems.push(format!("{key}: precision \"{}\" is not one of {}", e.precision, PRECISIONS.join(", ")));
        }
        if e.start < 1 {
            problems.push(format!("{key}: starts in {}, before AD 1", e.start));
        }
        if e.start > e.end {
            problems.push(format!("{key}: ends ({}) before it starts ({})", e.end, e.start));
        }
        if e.end > present_year {
            problems.push(format!("{key}: ends in {}, after the present ({present_year})", e.end));
        }

        // `date` carries exactly what `precision` says the source gives.
        match (e.precision.as_str(), e.date.as_deref()) {
            ("year", Some(date)) => problems.push(format!("{key}: precision is year, but it has a date ({date})")),
            ("month" | "day", None) => problems.push(format!("{key}: precision is {}, but it has no date", e.precision)),
            (precision @ ("month" | "day"), Some(date)) => match parse_date(date) {
                Err(problem) => problems.push(format!("{key}: {problem}")),
                Ok((year, _, day)) => {
                    if day.is_some() != (precision == "day") {
                        problems.push(format!("{key}: precision is {precision}, but the date is {date}"));
                    }
                    if year != e.start {
                        problems.push(format!("{key}: dated {date}, but starts in {}", e.start));
                    }
                }
            },
            _ => {}
        }

        // Which era an event is filed under is the file's judgement (see
        // `ChurchEvent::era`), but it is held to what that judgement allows.
        // A life goes with the age of its work, so it may begin before that
        // age (Luther was born in 1483), but the person must have been alive
        // in it. Anything else goes with the age it happens in, or on a
        // boundary year the age it closes, so it begins within its era's
        // years, first and last included. It may run on past them: the
        // Westminster Assembly sat from 1643 into 1649, a year into the
        // Puritans' age, and is still the Reformation's.
        match file.eras.iter().find(|era| era.slug == e.era) {
            None => problems.push(format!("{key}: era \"{}\" is not defined", e.era)),
            Some(era) if e.kind == "life" && (e.end < era.start || e.start > era.end) => problems.push(format!(
                "{key}: a life of {}-{} is filed under \"{}\" ({}-{}), none of which it lived through",
                e.start, e.end, era.slug, era.start, era.end
            )),
            Some(era) if e.kind != "life" && (e.start < era.start || e.start > era.end) => problems.push(format!(
                "{key}: begins in {}, outside its era \"{}\" ({}-{})",
                e.start, era.slug, era.start, era.end
            )),
            Some(_) => {}
        }
        if let Some(code) = &e.confession {
            if !confessions.contains(code) {
                problems.push(format!("{key}: confession \"{code}\" is not a document the app ships"));
            }
        }
        if let Some(name) = &e.resource {
            if !resources.contains(name) {
                problems.push(format!("{key}: resource \"{name}\" is not a book in the shipped library"));
            }
        }

        let mut citations = vec![citation(&e.source, "source", key, &mut problems)];
        if let Some(second) = &e.second_source {
            citations.push(citation(second, "second_source", key, &mut problems));
        }

        let start_year = fractional_year(e.start, e.date.as_deref());
        events.push(ChurchEvent {
            id: ID_BASE + e.id,
            key: format!("{KEY_PREFIX}{key}"),
            title: e.title.clone(),
            kind: e.kind.clone(),
            start_year,
            // A span ends in its last year; an event within one year ends
            // where it starts, on its day if it has one.
            end_year: if e.end == e.start { start_year } else { e.end as f64 },
            precision: e.precision.clone(),
            circa: e.circa,
            date: e.date.clone(),
            note: e.note.clone(),
            era: e.era.clone(),
            confession: e.confession.clone(),
            resource: e.resource.clone(),
            citations,
        });
    }

    if !problems.is_empty() {
        anyhow::bail!("{FILE_NAME} has {} problem(s):\n  {}", problems.len(), problems.join("\n  "));
    }
    let eras = file
        .eras
        .iter()
        .map(|e| ChurchEra { slug: e.slug.clone(), name: e.name.clone(), start_year: e.start as f64, end_year: e.end as f64 })
        .collect();
    Ok(ChurchHistory { eras, events })
}

fn column_set(conn: &Connection, sql: &str) -> anyhow::Result<HashSet<String>> {
    Ok(conn.prepare(sql)?.query_map([], |r| r.get(0))?.collect::<Result<_, _>>()?)
}

/// Imports the file in `dir` (`reference/timeline`), replacing whatever
/// church history is already there. Runs after the Bible's timeline, whose
/// events are numbered as they are inserted and so must be in before
/// anything that numbers itself, and after the confessions and the library
/// catalog, which its links are checked against.
pub fn import(conn: &mut Connection, dir: &Path) -> anyhow::Result<usize> {
    let text = std::fs::read_to_string(dir.join(FILE_NAME))?;
    let confessions = column_set(conn, "SELECT code FROM westminster_documents")?;
    let resources = column_set(conn, "SELECT file_name FROM library_catalog")?;
    let history = parse(&text, &confessions, &resources, i64::from(chrono::Local::now().year()))?;

    let bible_last_id: Option<i64> = conn.query_row("SELECT MAX(id) FROM timeline_events WHERE source <> 'church'", [], |r| r.get(0))?;
    if let Some(last) = bible_last_id.filter(|&last| last >= ID_BASE) {
        anyhow::bail!("the Bible's timeline has reached id {last}, but its ids must stay below {ID_BASE}, where church history's begin; raise ID_BASE");
    }

    let tx = conn.transaction()?;
    {
        // Church history's own rows only, children first: the citations
        // answer to the events, and nothing of the Bible's is touched. Church
        // events have no verses or people to clear.
        tx.execute_batch(
            "DELETE FROM timeline_event_citations WHERE event_id IN (SELECT id FROM timeline_events WHERE source = 'church');
             DELETE FROM timeline_events WHERE source = 'church';
             DELETE FROM timeline_eras WHERE track = 'church';",
        )?;
        let mut era = tx.prepare(
            "INSERT INTO timeline_eras (slug, name, start_year, end_year, journey_era, sort_order, track) VALUES (?1,?2,?3,?4,NULL,?5,'church')",
        )?;
        for (i, e) in history.eras.iter().enumerate() {
            era.execute(params![e.slug, e.name, e.start_year, e.end_year, i as i64])?;
        }
        let mut event = tx.prepare(
            "INSERT INTO timeline_events (id, key, title, start_year, end_year, precision, note, source, kind, circa, date, confession, resource, era)
             VALUES (?1,?2,?3,?4,?5,?6,?7,'church',?8,?9,?10,?11,?12,?13)",
        )?;
        let mut cite = tx.prepare(
            "INSERT INTO timeline_event_citations (event_id, position, work, volume, locator, quote, url) VALUES (?1,?2,?3,?4,?5,?6,?7)",
        )?;
        for e in &history.events {
            event.execute(params![
                e.id,
                e.key,
                e.title,
                e.start_year,
                e.end_year,
                e.precision,
                e.note,
                e.kind,
                e.circa,
                e.date,
                e.confession,
                e.resource,
                e.era
            ])?;
            for (position, c) in e.citations.iter().enumerate() {
                cite.execute(params![e.id, position as i64, c.work, c.volume, c.locator, c.quote, c.url])?;
            }
        }
    }
    tx.commit()?;
    println!("  church history: {} events, {} eras", history.events.len(), history.eras.len());
    Ok(history.events.len())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    /// The year the tests are built in, as far as `parse` is concerned.
    const PRESENT: i64 = 2026;

    fn set(items: &[&str]) -> HashSet<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    fn confessions() -> HashSet<String> {
        set(&["wcf", "wlc", "wsc", "apostles", "nicene", "athanasian", "chalcedon", "belgic", "heidelberg", "dort"])
    }

    /// One era and the events given, as the file writes them.
    fn file_with(events: &[serde_json::Value]) -> String {
        serde_json::json!({
            "note": "test",
            "eras": [{ "slug": "church-nicene", "name": "The Nicene church", "start": 311, "end": 590 }],
            "events": events,
        })
        .to_string()
    }

    fn nicaea() -> serde_json::Value {
        serde_json::json!({
            "id": 1,
            "key": "council-of-nicaea",
            "title": "First Council of Nicaea",
            "kind": "council",
            "start": 325,
            "end": 325,
            "precision": "year",
            "note": "The first ecumenical council.",
            "era": "church-nicene",
            "source": {
                "work": "Schaff, History of the Christian Church",
                "volume": "III",
                "locator": "\u{a7} 120. The Council of Nicaea, 325.",
                "file": "schaff-hcc-3.txt",
                "quote": "Hither, in the year 325, the twentieth of his reign"
            },
            "second_source": {
                "work": "The New Schaff-Herzog Encyclopedia of Religious Knowledge",
                "volume": "VIII",
                "locator": "Nicaea, Councils of",
                "file": "https://ccel.org/ccel/schaff/encyc08/encyc08/Page_144.html",
                "quote": "the council met in 325"
            },
            "confession": "nicene",
            "resource": "NPNF2 14 The Seven Ecumenical Councils.epub"
        })
    }

    fn resources() -> HashSet<String> {
        set(&["NPNF2 14 The Seven Ecumenical Councils.epub"])
    }

    fn problems_of(events: &[serde_json::Value]) -> String {
        format!("{:#}", parse(&file_with(events), &confessions(), &resources(), PRESENT).unwrap_err())
    }

    #[test]
    fn a_good_record_becomes_an_event_with_its_citations() {
        let history = parse(&file_with(&[nicaea()]), &confessions(), &resources(), PRESENT).unwrap();
        assert_eq!(history.eras, vec![ChurchEra { slug: "church-nicene".into(), name: "The Nicene church".into(), start_year: 311.0, end_year: 590.0 }]);
        let e = &history.events[0];
        assert_eq!(e.id, ID_BASE + 1, "numbered from the file's id, not from where it was inserted");
        assert_eq!(e.key, "church:council-of-nicaea");
        assert_eq!(e.era, "church-nicene");
        assert_eq!((e.start_year, e.end_year), (325.0, 325.0));
        assert_eq!((e.kind.as_str(), e.precision.as_str(), e.circa, e.date.as_deref()), ("council", "year", false, None));
        assert_eq!(e.confession.as_deref(), Some("nicene"));
        assert_eq!(e.citations.len(), 2, "the date's source first, then the second");
        // A corpus text file is where the quote was read at build time, not
        // something a reader can open; a web page is.
        assert_eq!(e.citations[0].url, None);
        assert_eq!(e.citations[0].volume.as_deref(), Some("III"));
        assert_eq!(e.citations[1].url.as_deref(), Some("https://ccel.org/ccel/schaff/encyc08/encyc08/Page_144.html"));
    }

    #[test]
    fn a_day_is_a_fraction_of_its_year_as_the_bibles_events_are() {
        assert_eq!(fractional_year(451, Some("0451-10-08")), 451.769);
        assert_eq!(fractional_year(313, Some("0313-01")), 313.0);
        assert_eq!(fractional_year(64, Some("0064-07")), 64.5);
        assert_eq!(fractional_year(325, None), 325.0);

        let mut chalcedon = nicaea();
        chalcedon["id"] = 2.into();
        chalcedon["key"] = "council-of-chalcedon".into();
        chalcedon["start"] = 451.into();
        chalcedon["end"] = 451.into();
        chalcedon["precision"] = "day".into();
        chalcedon["date"] = "0451-10-08".into();
        let mut augustine = nicaea();
        augustine["id"] = 3.into();
        augustine["key"] = "augustine-of-hippo".into();
        augustine["kind"] = "life".into();
        augustine["start"] = 354.into();
        augustine["end"] = 430.into();
        augustine["precision"] = "day".into();
        augustine["date"] = "0354-11-13".into();
        let history = parse(&file_with(&[chalcedon, augustine]), &confessions(), &resources(), PRESENT).unwrap();
        // Within its year, an event ends on the day it starts ...
        assert_eq!((history.events[0].start_year, history.events[0].end_year), (451.769, 451.769));
        // ... and a span ends in its last year.
        assert_eq!((history.events[1].start_year, history.events[1].end_year), (354.866, 430.0));
    }

    #[test]
    fn a_kind_the_view_does_not_know_fails() {
        let mut e = nicaea();
        e["kind"] = "synod".into();
        assert!(problems_of(&[e]).contains("council-of-nicaea: kind \"synod\" is not one of"));
    }

    #[test]
    fn a_confession_the_app_does_not_ship_fails() {
        let mut e = nicaea();
        e["confession"] = "augsburg".into();
        assert!(problems_of(&[e]).contains("confession \"augsburg\" is not a document the app ships"));
    }

    #[test]
    fn a_book_the_library_does_not_carry_fails() {
        let mut e = nicaea();
        e["resource"] = "Nicaea.epub".into();
        assert!(problems_of(&[e]).contains("resource \"Nicaea.epub\" is not a book in the shipped library"));
    }

    #[test]
    fn a_key_used_twice_fails() {
        assert!(problems_of(&[nicaea(), nicaea()]).contains("council-of-nicaea: the key is used twice"));
    }

    /// An id is what a saved pane remembers an event by, so two events may
    /// not share one, and it must leave the Bible's numbers alone.
    #[test]
    fn an_id_used_twice_or_out_of_range_fails() {
        let mut chalcedon = nicaea();
        chalcedon["key"] = "council-of-chalcedon".into();
        let problems = problems_of(&[nicaea(), chalcedon]);
        assert!(problems.contains("council-of-chalcedon: id 1 is council-of-nicaea's already"), "{problems}");

        for id in [0, -3, ID_BASE] {
            let mut e = nicaea();
            e["id"] = id.into();
            let problems = problems_of(&[e]);
            assert!(problems.contains(&format!("council-of-nicaea: id {id} is not between 1 and 99999")), "{problems}");
        }

        let mut no_id = nicaea();
        no_id.as_object_mut().unwrap().remove("id");
        assert!(problems_of(&[no_id]).contains("missing field `id`"));
    }

    #[test]
    fn an_era_slug_without_the_church_prefix_fails() {
        let text = serde_json::json!({
            "note": "test",
            "eras": [{ "slug": "nicene", "name": "The Nicene church", "start": 311, "end": 590 }],
            "events": [],
        })
        .to_string();
        let problem = format!("{:#}", parse(&text, &confessions(), &resources(), PRESENT).unwrap_err());
        assert!(problem.contains("era \"nicene\": a church era's slug begins \"church-\""), "{problem}");
        // And an event filed under an era that is not there.
        let mut e = nicaea();
        e["era"] = "nicene".into();
        assert!(problems_of(&[e]).contains("era \"nicene\" is not defined"));
    }

    #[test]
    fn a_date_must_agree_with_its_precision_and_year() {
        let mut no_date = nicaea();
        no_date["precision"] = "day".into();
        assert!(problems_of(&[no_date]).contains("precision is day, but it has no date"));

        let mut wrong_year = nicaea();
        wrong_year["precision"] = "day".into();
        wrong_year["date"] = "0326-06-19".into();
        assert!(problems_of(&[wrong_year]).contains("dated 0326-06-19, but starts in 325"));

        let mut month_as_day = nicaea();
        month_as_day["precision"] = "day".into();
        month_as_day["date"] = "0325-06".into();
        assert!(problems_of(&[month_as_day]).contains("precision is day, but the date is 0325-06"));

        let mut not_a_day = nicaea();
        not_a_day["precision"] = "day".into();
        not_a_day["date"] = "0325-02-30".into();
        assert!(problems_of(&[not_a_day]).contains("is not a day of the calendar"));
    }

    /// Old Style through 1752, as Britain reckoned it; New Style after.
    #[test]
    fn a_leap_day_is_one_the_calendar_of_its_year_had() {
        for day in ["0300-02-29", "1500-02-29", "1600-02-29", "1700-02-29", "1752-02-29", "1756-02-29", "2000-02-29"] {
            assert!(parse_date(day).is_ok(), "{day} was a day");
        }
        for day in ["0325-02-29", "1800-02-29", "1900-02-29", "1901-02-29"] {
            assert!(parse_date(day).is_err(), "{day} was not a day");
        }

        let mut e = nicaea();
        e["precision"] = "day".into();
        e["start"] = 1900.into();
        e["end"] = 1900.into();
        e["date"] = "1900-02-29".into();
        e["era"] = "church-missions".into();
        let text = serde_json::json!({
            "note": "test",
            "eras": [{ "slug": "church-missions", "name": "The century of missions", "start": 1792, "end": 1914 }],
            "events": [e],
        })
        .to_string();
        let problem = format!("{:#}", parse(&text, &confessions(), &resources(), PRESENT).unwrap_err());
        assert!(problem.contains("date \"1900-02-29\" is not a day of the calendar"), "{problem}");
    }

    /// The era an event is filed under is the file's choice, within limits.
    #[test]
    fn an_event_begins_in_its_era_and_a_life_touches_it() {
        // A life may begin before its era, as Luther's did before the
        // Reformation's ...
        let mut anthony = nicaea();
        anthony["key"] = "anthony-of-egypt".into();
        anthony["kind"] = "life".into();
        anthony["start"] = 251.into();
        anthony["end"] = 356.into();
        // ... and anything may run on past its era, as the Westminster
        // Assembly did past 1648, or happen in the year that closes it.
        let mut columba = nicaea();
        columba["id"] = 2.into();
        columba["key"] = "columba-iona".into();
        columba["kind"] = "mission".into();
        columba["start"] = 563.into();
        columba["end"] = 597.into();
        let mut closing = nicaea();
        closing["id"] = 3.into();
        closing["key"] = "closing".into();
        closing["start"] = 590.into();
        closing["end"] = 590.into();
        parse(&file_with(&[anthony, columba, closing]), &confessions(), &resources(), PRESENT).expect("all three are filed rightly");

        // But a life must have been lived partly in its era ...
        let mut too_early = nicaea();
        too_early["kind"] = "life".into();
        too_early["start"] = 250.into();
        too_early["end"] = 310.into();
        let problems = problems_of(&[too_early]);
        assert!(problems.contains("a life of 250-310 is filed under \"church-nicene\" (311-590), none of which it lived through"), "{problems}");
        // ... and anything else must begin in it.
        let mut before = nicaea();
        before["start"] = 300.into();
        before["end"] = 330.into();
        let problems = problems_of(&[before]);
        assert!(problems.contains("council-of-nicaea: begins in 300, outside its era \"church-nicene\" (311-590)"), "{problems}");
        let mut after = nicaea();
        after["start"] = 591.into();
        after["end"] = 591.into();
        assert!(problems_of(&[after]).contains("begins in 591, outside its era"));
    }

    #[test]
    fn nothing_ends_after_the_present() {
        let mut e = nicaea();
        e["end"] = 2099.into();
        let problems = problems_of(&[e]);
        assert!(problems.contains("council-of-nicaea: ends in 2099, after the present (2026)"), "{problems}");

        let text = serde_json::json!({
            "note": "test",
            "eras": [{ "slug": "church-twentieth", "name": "The twentieth century and after", "start": 1914, "end": 2099 }],
            "events": [],
        })
        .to_string();
        let problem = format!("{:#}", parse(&text, &confessions(), &resources(), PRESENT).unwrap_err());
        assert!(problem.contains("era \"church-twentieth\" ends in 2099, after the present (2026)"), "{problem}");
    }

    /// Counted in characters, not bytes: Schaff's section sign counts once.
    #[test]
    fn a_quote_is_at_most_three_hundred_characters() {
        let mut e = nicaea();
        e["source"]["quote"] = "\u{a7}".repeat(MAX_QUOTE_CHARS).into();
        parse(&file_with(&[e.clone()]), &confessions(), &resources(), PRESENT).expect("300 is allowed");
        e["second_source"]["quote"] = "a".repeat(MAX_QUOTE_CHARS + 1).into();
        let problems = problems_of(&[e]);
        assert!(problems.contains("council-of-nicaea: second_source.quote is 301 characters; a quote is at most 300"), "{problems}");
    }

    #[test]
    fn an_event_that_ends_before_it_starts_fails_and_every_problem_is_reported() {
        let mut backwards = nicaea();
        backwards["end"] = 324.into();
        let mut no_quote = nicaea();
        no_quote["id"] = 2.into();
        no_quote["key"] = "no-quote".into();
        no_quote["source"]["quote"] = "".into();
        let problems = problems_of(&[backwards, no_quote]);
        assert!(problems.contains("council-of-nicaea: ends (324) before it starts (325)"), "{problems}");
        assert!(problems.contains("no-quote: source.quote is empty"), "{problems}");
    }

    #[test]
    fn an_unknown_field_fails_rather_than_being_dropped() {
        let mut e = nicaea();
        e["confesion"] = "wcf".into();
        assert!(problems_of(&[e]).contains("unknown field `confesion`"));
    }

    /// The shipped file, whole, into a fresh content database: every event and
    /// era, and every citation, against the real library catalog. Then again,
    /// as every `--update` build runs it: a replace that gives each event the
    /// row it had and leaves the Bible's rows alone.
    #[test]
    fn the_shipped_file_imports_whole() {
        let dir = std::env::temp_dir().join(format!("sojourner-church-history-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let mut conn = db::open_content_db(&dir.join("content.db")).unwrap();
        let repo = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        for code in confessions() {
            conn.execute("INSERT INTO westminster_documents (code, title) VALUES (?1, ?1)", [&code]).unwrap();
        }
        super::super::library_catalog::import(&mut conn, &repo.join("library")).unwrap();
        // One of the Bible's, as the timeline import would have left it.
        conn.execute_batch(
            "INSERT INTO timeline_eras (slug, name, start_year, end_year, sort_order) VALUES ('creation', 'Creation', -4004, -2349, 0);
             INSERT INTO timeline_events (id, key, title, start_year, end_year, precision, source) VALUES (1, 'theo:1', 'Creation', -4003, -4003, 'year', 'theographic');",
        )
        .unwrap();

        let timeline_dir = repo.join("reference").join("timeline");
        let n = import(&mut conn, &timeline_dir).unwrap();
        assert_eq!(n, 296);
        let rows = |conn: &Connection| -> Vec<(i64, String, Option<String>)> {
            conn.prepare("SELECT id, key, era FROM timeline_events ORDER BY id")
                .unwrap()
                .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
                .unwrap()
                .collect::<Result<_, _>>()
                .unwrap()
        };
        let first = rows(&conn);
        import(&mut conn, &timeline_dir).expect("a second import replaces the first");
        assert_eq!(rows(&conn), first, "every event back under the same id");

        let count = |sql: &str| -> i64 { conn.query_row(sql, [], |r| r.get(0)).unwrap() };
        assert_eq!(count("SELECT COUNT(*) FROM timeline_events WHERE source = 'church'"), 296);
        assert_eq!(count("SELECT COUNT(*) FROM timeline_eras WHERE track = 'church' AND slug LIKE 'church-%'"), 10);
        assert_eq!(count("SELECT MIN(id) FROM timeline_events WHERE source = 'church'"), ID_BASE + 1);
        // The fourteen left out before 0.3.4 (Billy Graham, Moody, Barth and
        // the rest; see SOURCES.md) keep their numbers out of use: a reader's
        // pane saved on one of them finds nothing and opens unselected, and
        // must never open on some later event given the same number.
        for retired in [264, 274, 282, 285, 287, 290, 296, 297, 299, 300, 302, 306, 307, 309] {
            assert_eq!(count(&format!("SELECT COUNT(*) FROM timeline_events WHERE id = {}", ID_BASE + retired)), 0, "id {retired} is retired");
        }
        assert_eq!(count("SELECT MAX(id) FROM timeline_events WHERE source = 'church'"), ID_BASE + 310, "the ids after them are where they were");
        assert_eq!(count("SELECT COUNT(*) FROM timeline_events WHERE source = 'church' AND era IS NULL"), 0, "every event keeps its era");
        assert_eq!(count("SELECT COUNT(*) FROM timeline_events WHERE key = 'theo:1'"), 1, "the Bible's rows are not the church's to clear");
        assert_eq!(count("SELECT COUNT(*) FROM timeline_eras WHERE track = 'bible'"), 1);
        // Every event has the source of its date, and no citation was left
        // behind by the first import.
        assert_eq!(count("SELECT COUNT(*) FROM timeline_events e WHERE e.source = 'church' AND NOT EXISTS (SELECT 1 FROM timeline_event_citations c WHERE c.event_id = e.id AND c.position = 0)"), 0);
        assert_eq!(count("SELECT COUNT(*) FROM pragma_foreign_key_check"), 0);

        let timeline = crate::db::queries::timeline::all(&conn).unwrap();
        let chalcedon = timeline.events.iter().find(|e| e.title == "Council of Chalcedon").expect("Chalcedon is on the line");
        assert_eq!(chalcedon.source, "church");
        assert_eq!(chalcedon.kind.as_deref(), Some("council"));
        assert_eq!(chalcedon.date.as_deref(), Some("0451-10-08"));
        assert!(!chalcedon.citations.is_empty());
        assert!(chalcedon.lane.is_none() && chalcedon.book_id.is_none() && chalcedon.entities.is_empty());
        // Filed as the file files them, not by their years: Luther, born in
        // 1483, under the Reformation, and the Peace of Westphalia under the
        // age it closes.
        let luther = timeline.events.iter().find(|e| e.title == "Martin Luther").expect("Luther is on the line");
        assert_eq!(luther.era.as_deref(), Some("church-reformation"));
        assert_eq!(luther.id, ID_BASE + 171, "Luther's id in the file is 171");
        let westphalia = timeline.events.iter().find(|e| e.title == "Peace of Westphalia").unwrap();
        assert_eq!(westphalia.era.as_deref(), Some("church-reformation"));
        let creation = timeline.events.iter().find(|e| e.id == 1).unwrap();
        assert_eq!(creation.era, None, "a Bible event's era is worked out from its year");
        assert_eq!(timeline.eras.iter().filter(|e| e.track == "church").count(), 10);
        assert!(timeline.events.windows(2).all(|w| w[0].start_year <= w[1].start_year), "in order of year");

        drop(conn);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
