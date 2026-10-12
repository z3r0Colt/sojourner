//! The timeline: `reference/timeline/events.json` (written by
//! `tools/extract-timeline.mjs` from the Theographic Bible Metadata) into the
//! `timeline_*` tables, each person and place resolved to its Factbook entry.
//!
//! A name is resolved the way a reader would: among the Factbook's entries of
//! that name (or with that name among their forms), the one named in the same
//! verses. "Zedekiah" in 2 Kings 25 is the king, not the false prophet of
//! 1 Kings 22. A name that cannot be resolved fails the build, as the atlas
//! journeys do, unless `overrides.json` maps it by hand -- to an entry, or to
//! null for one the Factbook does not carry (God, a group). So the list of
//! the unresolved never grows silently.

use rusqlite::{params, Connection};
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::path::Path;

#[derive(Deserialize)]
struct File {
    eras: Vec<Era>,
    events: Vec<Event>,
}

#[derive(Deserialize)]
struct Era {
    slug: String,
    name: String,
    start: f64,
    end: f64,
    journey_era: Option<String>,
}

#[derive(Deserialize)]
struct Event {
    id: String,
    title: String,
    start: f64,
    end: f64,
    precision: String,
    parent: Option<String>,
    lane: Option<String>,
    verses: Vec<(i64, i64, i64)>,
    people: Vec<Named>,
    places: Vec<Named>,
    note: Option<String>,
    source: String,
}

#[derive(Deserialize)]
struct Named {
    /// Theographic's own key ("zedekiah_1"), or none for an addition's name.
    key: Option<String>,
    name: String,
    verses: Vec<(i64, i64, i64)>,
}

#[derive(Deserialize, Default)]
struct Overrides {
    #[serde(default)]
    people: HashMap<String, Option<String>>,
    #[serde(default)]
    places: HashMap<String, Option<String>>,
}

/// Lower-case letters only: "Nebuzar-adan" and "Nebuzaradan" are one name.
fn norm(s: &str) -> String {
    s.chars().filter(|c| c.is_alphabetic()).flat_map(char::to_lowercase).collect()
}

struct Resolver {
    /// Normalised name -> entity ids of that kind.
    by_name: HashMap<(String, &'static str), Vec<String>>,
    verses: HashMap<String, HashSet<(i64, i64, i64)>>,
}

impl Resolver {
    fn load(conn: &Connection) -> anyhow::Result<Self> {
        let mut by_name: HashMap<(String, &'static str), Vec<String>> = HashMap::new();
        let mut add = |name: &str, kind: &str, id: String| {
            let kind: &'static str = if kind == "place" { "place" } else { "person" };
            let list = by_name.entry((norm(name), kind)).or_default();
            if !list.contains(&id) {
                list.push(id);
            }
        };
        for row in conn
            .prepare("SELECT id, kind, name FROM factbook_entities WHERE kind IN ('person','place')")?
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?)))?
        {
            let (id, kind, name) = row?;
            add(&name, &kind, id);
        }
        for row in conn
            .prepare("SELECT n.entity_id, e.kind, n.english FROM factbook_names n JOIN factbook_entities e ON e.id = n.entity_id WHERE e.kind IN ('person','place')")?
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?)))?
        {
            let (id, kind, name) = row?;
            add(&name, &kind, id);
        }
        let mut verses: HashMap<String, HashSet<(i64, i64, i64)>> = HashMap::new();
        for row in conn
            .prepare("SELECT entity_id, book_id, chapter, verse FROM factbook_verses")?
            .query_map([], |r| Ok((r.get::<_, String>(0)?, (r.get(1)?, r.get(2)?, r.get(3)?))))?
        {
            let (id, v) = row?;
            verses.entry(id).or_default().insert(v);
        }
        Ok(Self { by_name, verses })
    }

    /// The entry of this name named in the most of these verses; with no
    /// verse in common, the only entry of that name, if there is only one.
    /// With no entry of that name at all, the entry named in the most of these
    /// verses whose name is the same word spelled another way ("Mahalaleel"
    /// and "Mahalalel", "Pharez" and "Perez", "Melita" and "Malta").
    fn resolve(&self, named: &Named, kind: &'static str) -> Option<String> {
        // "Antioch (Syria)": the name is the part before the parenthesis.
        let name = named.name.split(" (").next().unwrap_or(&named.name);
        let Some(candidates) = self.by_name.get(&(norm(name), kind)) else {
            return self.resolve_by_spelling(name, &named.verses, kind);
        };
        let scored: Vec<(usize, &String)> = candidates
            .iter()
            .map(|id| (named.verses.iter().filter(|v| self.verses.get(id).is_some_and(|s| s.contains(v))).count(), id))
            .collect();
        let best = scored.iter().map(|(n, _)| *n).max().unwrap_or(0);
        if best > 0 {
            let top: Vec<&String> = scored.iter().filter(|(n, _)| *n == best).map(|(_, id)| *id).collect();
            return (top.len() == 1).then(|| top[0].clone());
        }
        (candidates.len() == 1).then(|| candidates[0].clone())
    }

    fn resolve_by_spelling(&self, name: &str, verses: &[(i64, i64, i64)], kind: &'static str) -> Option<String> {
        let want = norm(name);
        let mut best: Option<(usize, &String)> = None;
        let mut tied = false;
        for ((candidate, k), ids) in &self.by_name {
            if *k != kind || !same_word(&want, candidate) {
                continue;
            }
            for id in ids {
                let n = verses.iter().filter(|v| self.verses.get(id).is_some_and(|s| s.contains(v))).count();
                if n == 0 {
                    continue;
                }
                match best {
                    Some((b, bid)) if n < b || (n == b && bid == id) => {}
                    Some((b, _)) if n == b => tied = true,
                    _ => {
                        best = Some((n, id));
                        tied = false;
                    }
                }
            }
        }
        match best {
            Some((_, id)) if !tied => Some(id.clone()),
            _ => None,
        }
    }
}

/// Two spellings of one name: the same first letter, and at most a third of
/// the letters different.
fn same_word(a: &str, b: &str) -> bool {
    if a.is_empty() || b.is_empty() || a.chars().next() != b.chars().next() {
        return false;
    }
    let (a, b): (Vec<char>, Vec<char>) = (a.chars().collect(), b.chars().collect());
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    for i in 1..=a.len() {
        let mut cur = vec![i; b.len() + 1];
        for j in 1..=b.len() {
            cur[j] = (prev[j] + 1).min(cur[j - 1] + 1).min(prev[j - 1] + usize::from(a[i - 1] != b[j - 1]));
        }
        prev = cur;
    }
    prev[b.len()] * 3 <= a.len().max(b.len())
}

pub fn import(conn: &mut Connection, dir: &Path) -> anyhow::Result<usize> {
    let file: File = serde_json::from_str(&std::fs::read_to_string(dir.join("events.json"))?)?;
    let overrides: Overrides = match std::fs::read_to_string(dir.join("overrides.json")) {
        Ok(t) => serde_json::from_str(&t)?,
        Err(_) => Overrides::default(),
    };
    let chapter_years: Vec<(i64, i64, f64, f64)> = serde_json::from_str(&std::fs::read_to_string(dir.join("chapter_years.json"))?)?;
    let resolver = Resolver::load(conn)?;
    let known: HashSet<String> = conn
        .prepare("SELECT id FROM factbook_entities")?
        .query_map([], |r| r.get(0))?
        .collect::<Result<_, _>>()?;

    // Resolve everything first, so one pass reports every name that fails.
    let mut unresolved: Vec<String> = Vec::new();
    let mut resolved: Vec<Vec<(String, &'static str)>> = Vec::new();
    for e in &file.events {
        let mut ids: Vec<(String, &'static str)> = Vec::new();
        for (list, kind, table) in [(&e.people, "person", &overrides.people), (&e.places, "place", &overrides.places)] {
            for named in list {
                let key = named.key.clone().unwrap_or_else(|| named.name.clone());
                let id = match table.get(&key) {
                    Some(Some(id)) => {
                        anyhow::ensure!(known.contains(id), "overrides.json maps {key} to {id}, which is not in the Factbook");
                        Some(id.clone())
                    }
                    Some(None) => None,
                    None => match resolver.resolve(named, kind) {
                        Some(id) => Some(id),
                        None => {
                            unresolved.push(format!("{kind} {key} ({}) in \"{}\"", named.name, e.title));
                            None
                        }
                    },
                };
                if let Some(id) = id {
                    if !ids.iter().any(|(x, _)| *x == id) {
                        ids.push((id, kind));
                    }
                }
            }
        }
        resolved.push(ids);
    }
    if !unresolved.is_empty() {
        unresolved.sort();
        unresolved.dedup();
        anyhow::bail!(
            "{} timeline names are not in the Factbook; map each in reference/timeline/overrides.json (to an entry id, or null):\n  {}",
            unresolved.len(),
            unresolved.join("\n  ")
        );
    }

    let tx = conn.transaction()?;
    {
        let mut era = tx.prepare("INSERT INTO timeline_eras (slug, name, start_year, end_year, journey_era, sort_order) VALUES (?1,?2,?3,?4,?5,?6)")?;
        for (i, e) in file.eras.iter().enumerate() {
            era.execute(params![e.slug, e.name, e.start, e.end, e.journey_era, i as i64])?;
        }
        let mut event = tx.prepare(
            "INSERT INTO timeline_events (key, title, start_year, end_year, precision, parent_key, lane, note, source, book_id, chapter, verse)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
        )?;
        let mut verse = tx.prepare("INSERT OR IGNORE INTO timeline_event_verses (event_id, book_id, chapter, verse) VALUES (?1,?2,?3,?4)")?;
        let mut entity = tx.prepare("INSERT OR IGNORE INTO timeline_event_entities (event_id, entity_id, role) VALUES (?1,?2,?3)")?;
        for (e, ids) in file.events.iter().zip(&resolved) {
            let first = e.verses.first();
            event.execute(params![
                e.id,
                e.title,
                e.start,
                e.end,
                e.precision,
                e.parent,
                e.lane,
                e.note,
                e.source,
                first.map(|v| v.0),
                first.map(|v| v.1),
                first.map(|v| v.2)
            ])?;
            let row = tx.last_insert_rowid();
            for (b, c, v) in &e.verses {
                verse.execute(params![row, b, c, v])?;
            }
            for (id, role) in ids {
                entity.execute(params![row, id, role])?;
            }
        }
        let mut years = tx.prepare("INSERT INTO timeline_chapter_years (book_id, chapter, start_year, end_year) VALUES (?1,?2,?3,?4)")?;
        for (b, c, s, e) in &chapter_years {
            years.execute(params![b, c, s, e])?;
        }
    }
    tx.commit()?;
    println!("  timeline: {} events, {} eras, {} chapters dated", file.events.len(), file.eras.len(), chapter_years.len());
    Ok(file.events.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_compare_by_letters_alone() {
        assert_eq!(norm("Nebuzar-adan"), norm("Nebuzaradan"));
        assert_eq!(norm("Pharaoh-nechoh"), "pharaohnechoh");
    }

    #[test]
    fn another_spelling_of_the_same_name() {
        for (a, b) in [("Mahalaleel", "Mahalalel"), ("Pharez", "Perez"), ("Salah", "Shelah"), ("Portius", "Porcius"), ("Melita", "Malta"), ("Zacharias", "Zechariah")] {
            assert!(same_word(&norm(a), &norm(b)), "{a} / {b}");
        }
        assert!(!same_word("saul", "paul"));
        assert!(!same_word("abram", "ahab"));
    }
}
