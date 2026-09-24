//! The Factbook: one entry per person, place and named thing, from
//! STEPBible's TIPNR (see `reference/factbook/SOURCES.md`).
//!
//! TIPNR resolves every proper name in the Bible to an individual: which
//! Zechariah a verse means, who his father was, and every verse that names
//! him. A record is a header line, one line per form of the name, and a
//! total line:
//!
//! ```text
//! Zechariah@2Ch.24.20-Luk=H2148w <TAB> Priest living at ... <TAB> Jehoiada@... + Jehosheba@... <TAB> siblings <TAB> partners <TAB> offspring <TAB> tribe <TAB> #summary <TAB> Male
//! – Named <TAB> Zechariah@2Ch.24.20-Luk <TAB> H2148w«H2148a=זְכַרְיָהוּ <TAB> Zechariah <TAB> 2Ch.24.20
//! – Greek <TAB> Zechariah@2Ch.24.20-Luk <TAB> G2197G«G2197=Ζαχαρίας <TAB> Zechariah =ESV,NIV; Zacharias =KJV <TAB> Mat.23.35; Luk.11.51
//! – Total <TAB> ...
//! @Briefest= ... @Brief= ... @Short= ... @Article= ...
//! ```
//!
//! A place's header has, in place of family, its OpenBible name, founder,
//! inhabitants, map links and region. The `@` descriptions TIPNR marks as
//! adapted from an AI model's output, and they are not read.

use rusqlite::{params, Connection};
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::path::Path;

#[derive(Debug, Default)]
struct Entity {
    id: String,
    kind: String,
    name: String,
    description: String,
    summary: String,
    entity_type: String,
    tribe: Option<String>,
    region: Option<String>,
    openbible: Option<String>,
    lat: Option<f64>,
    lon: Option<f64>,
    forms: Vec<Form>,
    relations: Vec<(String, String, Option<String>)>, // (kind, target unique name, qualifier)
    refs: Vec<(i64, i64, i64)>,
}

#[derive(Debug)]
struct Form {
    significance: String,
    english: String,
    original: Option<String>,
    strongs: Option<String>,
}

/// "Zechariah@2Ch.24.20-Luk=H2148w" -> "Zechariah@2Ch.24.20-Luk". A
/// relation field may add a qualifier: "(d)" descendant, "(a)" ancestor,
/// "(f)" founder, "(?)" uncertain.
fn unique_name(raw: &str) -> Option<(String, Option<String>)> {
    let raw = raw.trim();
    if raw.is_empty() || !raw.contains('@') {
        return None;
    }
    let (name, qualifier) = match raw.rfind('(') {
        Some(i) if raw.ends_with(')') => (raw[..i].trim(), Some(raw[i + 1..raw.len() - 1].to_string())),
        _ => (raw, None),
    };
    let name = name.split('=').next().unwrap_or(name).trim();
    // "Abram|Abraham@Gen.11.26" names an alternative form of Abraham.
    let name = name.rsplit('|').next().unwrap_or(name);
    Some((name.to_string(), qualifier))
}

/// "2Ch.24.20; Mat.23.35; Jos.15.63a" -> verses. Parts that are not a full
/// reference ("LXX" prefixes, "ff") are skipped; a letter suffix only marks a
/// second occurrence in the verse.
fn parse_refs(raw: &str) -> Vec<(i64, i64, i64)> {
    let mut out = Vec::new();
    let mut book: Option<i64> = None;
    let mut chapter: Option<i64> = None;
    for part in raw.split([';', ',']) {
        let part = part.trim().trim_start_matches("LXX").trim();
        if part.is_empty() || part.ends_with("ff") {
            continue;
        }
        let pieces: Vec<&str> = part.split('.').collect();
        let num = |s: &str| s.trim_end_matches(|c: char| c.is_ascii_alphabetic()).parse::<i64>().ok();
        match pieces.as_slice() {
            [b, c, v] => {
                book = crate::import::usfm::book_id_for_usfm(b);
                chapter = num(c);
                if let (Some(b), Some(c), Some(v)) = (book, chapter, num(v)) {
                    out.push((b, c, v));
                }
            }
            [c, v] => {
                chapter = num(c);
                if let (Some(b), Some(c), Some(v)) = (book, chapter, num(v)) {
                    out.push((b, c, v));
                }
            }
            [v] => {
                if let (Some(b), Some(c), Some(v)) = (book, chapter, num(v)) {
                    out.push((b, c, v));
                }
            }
            _ => {}
        }
    }
    out
}

/// TIPNR's summary sentence: its `<ref="2Ch.24.20">` become Scripture links,
/// its `<strong="H2148w">Zechariah</strong>` a plain word, `<br>` a break.
fn summary_html(raw: &str, osis: &HashMap<i64, String>) -> String {
    use once_cell::sync::Lazy;
    use regex::Regex;
    static REF: Lazy<Regex> = Lazy::new(|| Regex::new(r#"<ref="([^"]*)">([^<]*)</ref>\)?"#).unwrap());
    static STRONG: Lazy<Regex> = Lazy::new(|| Regex::new(r#"<strong="[^"]*">([^<]*)</strong>"#).unwrap());
    let s = raw.trim().trim_start_matches('#');
    let s = s.replace('&', "&amp;").replace("<br>", "\u{1}");
    let s = REF.replace_all(&s, |c: &regex::Captures| {
        let parts: Vec<&str> = c[1].split('.').collect();
        match (parts.first().and_then(|b| crate::import::usfm::book_id_for_usfm(b)), parts.get(1), parts.get(2)) {
            (Some(b), Some(ch), Some(v)) => match osis.get(&b) {
                Some(code) => {
                    let label = format!("{} {ch}:{v}", crate::refparse::book_name(b).unwrap_or(code));
                    format!("<a class=\"scripref\" data-osis=\"{code}.{ch}.{v}\">{label}</a>")
                }
                None => c[2].to_string(),
            },
            _ => c[2].to_string(),
        }
    });
    let s = STRONG.replace_all(&s, "<b>$1</b>");
    // Anything else that looks like a tag is TIPNR's, not ours: escape it.
    let s = s.replace('<', "&lt;").replace('>', "&gt;");
    let s = s
        .replace("&lt;a class=\"scripref\"", "<a class=\"scripref\"")
        .replace("\"&gt;", "\">")
        .replace("&lt;/a&gt;", "</a>")
        .replace("&lt;b&gt;", "<b>")
        .replace("&lt;/b&gt;", "</b>");
    s.replace('\u{1}', "<br>").replace(") <br>", "<br>")
}

/// "https://www.google.com/maps/@31.777444,35.234935,14z" -> (lat, lon).
fn map_coords(url: &str) -> Option<(f64, f64)> {
    let at = url.split('@').nth(1)?;
    let mut parts = at.split(',');
    let lat = parts.next()?.parse().ok()?;
    let lon = parts.next()?.parse().ok()?;
    Some((lat, lon))
}

fn read_tipnr(path: &Path, osis: &HashMap<i64, String>) -> anyhow::Result<Vec<Entity>> {
    let text = std::fs::read_to_string(path)?;
    let mut out: Vec<Entity> = Vec::new();
    let mut section = "";
    let mut current: Option<Entity> = None;
    for line in text.lines() {
        if line.starts_with("$==========") {
            if let Some(e) = current.take() {
                out.push(e);
            }
            section = if line.contains("PERSON") {
                "person"
            } else if line.contains("PLACE") {
                "place"
            } else {
                "other"
            };
            continue;
        }
        if section.is_empty() || line.starts_with('@') || line.trim().is_empty() {
            continue;
        }
        let cols: Vec<&str> = line.split('\t').collect();
        if let Some(sig) = cols[0].strip_prefix("– ") {
            let Some(e) = current.as_mut() else { continue };
            if sig.starts_with("Total") || cols.len() < 5 {
                continue;
            }
            // "H2148w«H2148a=זְכַרְיָהוּ"
            let (strongs, original) = match cols[2].split_once('=') {
                Some((s, o)) => (s.split('«').next().map(|x| x.trim().to_string()), Some(o.trim().to_string())),
                None => (None, None),
            };
            // "Zechariah =ESV,NIV; Zacharias =KJV": every English form, the
            // first as it is most commonly printed.
            let mut english: Vec<String> = Vec::new();
            for part in cols[3].split(';') {
                let form = part.split(" =").next().unwrap_or(part).trim().replace('_', " ");
                if !form.is_empty() && !english.contains(&form) {
                    english.push(form);
                }
            }
            let english = english.join("; ");
            e.forms.push(Form { significance: sig.trim().to_string(), english, original, strongs });
            e.refs.extend(parse_refs(cols[4]));
            continue;
        }
        // A header line: a new entity. The preamble's own examples ("* Unified
        // Name (EG Aaron@Exo.4.14-Heb)") are prose, not records.
        if cols.len() < 8 || !cols[0].chars().next().is_some_and(|c| c.is_alphanumeric()) || cols[0].contains(' ') && !cols[0].contains('|') && cols[0].split('@').next().is_some_and(|n| n.split_whitespace().count() > 4) {
            continue;
        }
        let Some((id, _)) = cols.first().and_then(|c| unique_name(c)) else { continue };
        if let Some(e) = current.take() {
            out.push(e);
        }
        let get = |i: usize| cols.get(i).map(|s| s.trim()).filter(|s| !s.is_empty() && *s != ">" && *s != "+");
        let name = id.split('@').next().unwrap_or(&id).replace('_', " ");
        let mut e = Entity {
            id: id.clone(),
            kind: section.to_string(),
            name,
            summary: get(7).map(|s| summary_html(s, osis)).unwrap_or_default(),
            entity_type: get(8).unwrap_or("").to_string(),
            ..Default::default()
        };
        match section {
            "place" => {
                e.description = "Place".into();
                e.openbible = get(1).map(|s| s.split('=').next().unwrap_or(s).trim().to_string());
                for (i, kind) in [(2, "founder"), (3, "inhabitant")] {
                    for part in get(i).unwrap_or("").split(',') {
                        if let Some((to, q)) = unique_name(part) {
                            e.relations.push((kind.into(), to, q));
                        }
                    }
                }
                if let Some((lat, lon)) = get(4).and_then(map_coords) {
                    e.lat = Some(lat);
                    e.lon = Some(lon);
                }
                e.region = get(6).map(str::to_string);
            }
            _ => {
                e.description = get(1).unwrap_or("").to_string();
                // Parents are "Father + Mother".
                if let Some(p) = get(2) {
                    let mut halves = p.split('+');
                    for kind in ["father", "mother"] {
                        if let Some((to, q)) = halves.next().and_then(unique_name) {
                            e.relations.push((kind.into(), to, q));
                        }
                    }
                }
                for (i, kind) in [(3, "sibling"), (4, "partner"), (5, "child")] {
                    for part in get(i).unwrap_or("").split(',') {
                        if let Some((to, q)) = unique_name(part) {
                            e.relations.push((kind.into(), to, q));
                        }
                    }
                }
                e.tribe = get(6).map(str::to_string);
            }
        }
        current = Some(e);
    }
    if let Some(e) = current.take() {
        out.push(e);
    }
    // A unique name that appears twice is one entity: its forms, relations
    // and verses together.
    let mut merged: Vec<Entity> = Vec::new();
    let mut index: HashMap<String, usize> = HashMap::new();
    for e in out {
        match index.get(&e.id) {
            Some(&i) => {
                let m = &mut merged[i];
                m.forms.extend(e.forms);
                m.relations.extend(e.relations);
                m.refs.extend(e.refs);
            }
            None => {
                index.insert(e.id.clone(), merged.len());
                merged.push(e);
            }
        }
    }
    for e in &mut merged {
        e.refs.sort();
        e.refs.dedup();
        e.relations.sort();
        e.relations.dedup();
    }
    Ok(merged)
}

#[derive(Debug, Default, Deserialize)]
struct Override {
    #[serde(default)]
    isbe: Option<Vec<String>>,
    #[serde(default)]
    dictionary: Option<Vec<String>>,
    #[serde(default)]
    atlas: Option<String>,
}

/// A headword without its disambiguation: "Zechariah (1)" and
/// "Melchizedek; Melchisedec" -> "zechariah", "melchizedek". An article on a
/// book of the Bible ("Zechariah, Book of") is not an article on the person,
/// and has no key.
fn head_key(term: &str) -> Option<String> {
    let lower = term.to_lowercase();
    if lower.contains("book of") || lower.contains("the book") || lower.contains("epistle") || lower.contains("gospel of") {
        return None;
    }
    let t = lower.split([';', '(', ',']).next().unwrap_or(&lower);
    Some(t.trim().to_string())
}

pub fn import(conn: &mut Connection, dir: &Path) -> anyhow::Result<usize> {
    let osis: HashMap<i64, String> = conn
        .prepare("SELECT id, osis_code FROM books")?
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<Result<_, _>>()?;
    let entities = read_tipnr(&dir.join("TIPNR - Translators Individualised Proper Names with all References - STEPBible.org CC BY.txt"), &osis)?;
    let overrides: HashMap<String, Override> = match std::fs::read_to_string(dir.join("overrides.json")) {
        Ok(t) => {
            let v: serde_json::Value = serde_json::from_str(&t)?;
            v.as_object()
                .map(|m| {
                    m.iter()
                        .filter(|(k, _)| !k.starts_with('_'))
                        .filter_map(|(k, v)| serde_json::from_value(v.clone()).ok().map(|o| (k.clone(), o)))
                        .collect()
                })
                .unwrap_or_default()
        }
        Err(_) => HashMap::new(),
    };

    // Articles by headword, for linking by name.
    let mut isbe: HashMap<String, Vec<String>> = HashMap::new();
    for row in conn.prepare("SELECT term, slug FROM isbe_entries WHERE redirect_slug IS NULL")?.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))? {
        let (term, slug) = row?;
        if let Some(k) = head_key(&term) {
            isbe.entry(k).or_default().push(slug);
        }
    }
    let mut dictionary: HashMap<String, Vec<String>> = HashMap::new();
    for row in conn.prepare("SELECT term, slug FROM dictionary_entries")?.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))? {
        let (term, slug) = row?;
        if let Some(k) = head_key(&term) {
            dictionary.entry(k).or_default().push(slug);
        }
    }
    let atlas: HashMap<String, String> = conn
        .prepare("SELECT lower(name), slug FROM atlas_places")?
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<Result<_, _>>()?;

    let known: HashSet<&str> = entities.iter().map(|e| e.id.as_str()).collect();
    let tx = conn.transaction()?;
    for t in ["factbook_links", "factbook_verses", "factbook_relations", "factbook_names", "factbook_entities"] {
        tx.execute(&format!("DELETE FROM {t}"), [])?;
    }
    let mut unlinked = 0usize;
    {
        let mut ins_e = tx.prepare(
            "INSERT INTO factbook_entities (id, kind, name, description, summary, entity_type, tribe, region, lat, lon, verse_count)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
        )?;
        let mut ins_n = tx.prepare(
            "INSERT INTO factbook_names (entity_id, significance, english, original, strongs_id, strongs_plain) VALUES (?1,?2,?3,?4,?5,?6)",
        )?;
        let mut ins_r = tx.prepare("INSERT INTO factbook_relations (from_id, to_id, kind, qualifier) VALUES (?1,?2,?3,?4)")?;
        let mut ins_v = tx.prepare("INSERT OR IGNORE INTO factbook_verses (entity_id, book_id, chapter, verse) VALUES (?1,?2,?3,?4)")?;
        let mut ins_l = tx.prepare("INSERT OR IGNORE INTO factbook_links (entity_id, kind, slug) VALUES (?1,?2,?3)")?;
        // Every entity first: a relation may name one further down the file.
        for e in &entities {
            ins_e.execute(params![
                e.id,
                e.kind,
                e.name,
                e.description,
                e.summary,
                e.entity_type,
                e.tribe,
                e.region,
                e.lat,
                e.lon,
                e.refs.len() as i64
            ])?;
        }
        for e in &entities {
            for f in &e.forms {
                let plain = f.strongs.as_deref().and_then(crate::import::reference::morphology::normalize_tagnt_strongs);
                ins_n.execute(params![e.id, f.significance, f.english, f.original, f.strongs, plain])?;
            }
            for (kind, to, q) in &e.relations {
                if known.contains(to.as_str()) {
                    ins_r.execute(params![e.id, to, kind, q])?;
                }
            }
            for (b, c, v) in &e.refs {
                ins_v.execute(params![e.id, b, c, v])?;
            }
            // Links: the override when there is one, else by name.
            let o = overrides.get(&e.id);
            let key = e.name.to_lowercase();
            let isbe_slugs = o.and_then(|o| o.isbe.clone()).unwrap_or_else(|| isbe.get(&key).cloned().unwrap_or_default());
            let dict_slugs = o.and_then(|o| o.dictionary.clone()).unwrap_or_else(|| dictionary.get(&key).cloned().unwrap_or_default());
            let atlas_slug = o.and_then(|o| o.atlas.clone()).or_else(|| {
                if e.kind == "place" {
                    e.openbible.as_ref().map(|n| n.to_lowercase()).and_then(|n| atlas.get(&n).cloned()).or_else(|| atlas.get(&key).cloned())
                } else {
                    None
                }
            });
            for s in &isbe_slugs {
                ins_l.execute(params![e.id, "isbe", s])?;
            }
            for s in &dict_slugs {
                ins_l.execute(params![e.id, "dictionary", s])?;
            }
            if let Some(s) = &atlas_slug {
                ins_l.execute(params![e.id, "atlas", s])?;
            }
            if isbe_slugs.is_empty() && dict_slugs.is_empty() && atlas_slug.is_none() && e.refs.len() > 1 {
                unlinked += 1;
            }
        }
    }
    tx.commit()?;
    let people = entities.iter().filter(|e| e.kind == "person").count();
    let places = entities.iter().filter(|e| e.kind == "place").count();
    println!(
        "factbook: {} entities ({people} people, {places} places), {unlinked} named more than once with no article, dictionary entry or map yet (see reference/factbook/overrides.json)",
        entities.len()
    );
    Ok(entities.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_refs_and_summaries() {
        assert_eq!(unique_name("Jehoiada@2Ki.11.4-Mat"), Some(("Jehoiada@2Ki.11.4-Mat".into(), None)));
        assert_eq!(unique_name(" Canaan@Gen.9.18-1Ch(d)"), Some(("Canaan@Gen.9.18-1Ch".into(), Some("d".into()))));
        assert_eq!(unique_name("Abram|Abraham@Gen.11.26-1Pe"), Some(("Abraham@Gen.11.26-1Pe".into(), None)));
        assert_eq!(unique_name(" + "), None);
        assert_eq!(parse_refs("2Ch.24.20; Mat.23.35; Luk.11.51"), vec![(14, 24, 20), (40, 23, 35), (42, 11, 51)]);
        assert_eq!(parse_refs("Ezr.2.13; 8.13; Neh.7.18"), vec![(15, 2, 13), (15, 8, 13), (16, 7, 18)]);
        assert_eq!(parse_refs("Jos.15.63a; Jos.15.63b"), vec![(6, 15, 63), (6, 15, 63)]);
        let osis: HashMap<i64, String> = [(14, "2Chr".to_string())].into_iter().collect();
        let html = summary_html(r#"#A priest, first mentioned at <ref="2Ch.24.20">2Ch.24.20</ref>) <br>referred to as <strong="H2148w">Zechariah</strong> (זְכַרְיָהוּ)"#, &osis);
        assert!(html.contains(r#"data-osis="2Chr.24.20""#), "{html}");
        assert!(html.contains("<b>Zechariah</b>"), "{html}");
        assert!(!html.contains("<strong"), "{html}");
    }
}
