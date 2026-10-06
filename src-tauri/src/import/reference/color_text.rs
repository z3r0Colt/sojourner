// Imports color text (see crate::color_text): the KJV's colored spans from
// reference/color_text/kjv_color.json, built by tools/build-color-text.py,
// and then the word lists the other translations are colored with.
//
// Runs after the KJV, the interlinear phrases and the morphology words are
// in: a span is checked against the KJV text as this database has it, and
// the Greek and Hebrew lists are counted through Strong's numbers.
use crate::color_text::{kjv_word_tags, strongs_colors, Span, LATIN_WORDS};
use crate::plain::plain_word;
use rusqlite::{params, Connection};
use serde::Deserialize;
use std::collections::HashMap;
use std::path::Path;

#[derive(Deserialize)]
struct ColorFile {
    /// "Genesis 1:1" -> [[start, end, code], ...]
    verses: HashMap<String, Vec<(usize, usize, String)>>,
    /// "Genesis 1:3" -> [[start, end, voice], ...]: who is speaking.
    #[serde(default)]
    voices: HashMap<String, Vec<(usize, usize, String)>>,
}

/// A word goes on a list when it has been seen at least this often, takes
/// one color at least this share of the times it is seen at all, and that
/// color at least this share of the times it is colored.
const MIN_SEEN: usize = 3;
const MIN_SHARE: f64 = 0.9;
const MIN_COLOR_SHARE: f64 = 0.97;

/// Per word: how often it was seen uncolored, and per (code, term) colored.
#[derive(Default)]
struct Counts {
    plain: usize,
    colored: HashMap<(String, String), usize>,
}

fn split_ref(r: &str) -> Option<(&str, i64, i64)> {
    let (book, cv) = r.rsplit_once(' ')?;
    let (c, v) = cv.split_once(':')?;
    Some((book, c.parse().ok()?, v.parse().ok()?))
}

pub fn import(conn: &mut Connection, dir: &Path) -> anyhow::Result<usize> {
    let file: ColorFile = serde_json::from_str(&std::fs::read_to_string(dir.join("kjv_color.json"))?)?;
    let kjv_id: i64 = conn.query_row("SELECT id FROM translations WHERE code = 'KJV'", [], |r| r.get(0))?;
    let books: HashMap<String, i64> = {
        let mut stmt = conn.prepare("SELECT id, name FROM books")?;
        let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(1)?, r.get::<_, i64>(0)?)))?;
        rows.collect::<Result<_, _>>()?
    };
    let kjv: HashMap<(i64, i64, i64), String> = {
        let mut stmt = conn.prepare("SELECT book_id, chapter, verse, text FROM verses WHERE translation_id = ?1")?;
        let rows = stmt.query_map([kjv_id], |r| Ok(((r.get(0)?, r.get(1)?, r.get(2)?), r.get(3)?)))?;
        rows.collect::<Result<_, _>>()?
    };

    // The spans, each checked against the verse it claims: inside the text,
    // on character boundaries, around at least one letter or digit.
    let mut tags: HashMap<(i64, i64, i64), Vec<Span>> = HashMap::new();
    let mut dropped = 0usize;
    for (r, spans) in &file.verses {
        let (book, c, v) = split_ref(r).ok_or_else(|| anyhow::anyhow!("color text: bad reference {r:?}"))?;
        let book_id = *books.get(book).ok_or_else(|| anyhow::anyhow!("color text: unknown book {book:?}"))?;
        let Some(text) = kjv.get(&(book_id, c, v)) else {
            dropped += spans.len();
            continue;
        };
        for (start, end, code) in spans {
            let fits = start < end && *end <= text.len() && text.is_char_boundary(*start) && text.is_char_boundary(*end);
            if !fits || !text[*start..*end].chars().any(char::is_alphanumeric) {
                dropped += 1;
                continue;
            }
            let term = text[*start..*end].split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase();
            tags.entry((book_id, c, v)).or_default().push(Span { start: *start, end: *end, code: code.clone(), term });
        }
    }
    for v in tags.values_mut() {
        v.sort_by_key(|s| s.start);
    }
    if dropped > 0 {
        eprintln!("[color text] {dropped} spans did not fit the KJV text and were left out");
    }

    let tx = conn.transaction()?;
    let mut count = 0usize;
    // The voices go in with the tags, so a rebuild of one is a rebuild of both.
    tx.execute("DELETE FROM color_voices", [])?;
    {
        let mut stmt = tx.prepare(
            "INSERT INTO color_voices (book_id, chapter, verse, char_start, char_end, voice) VALUES (?1,?2,?3,?4,?5,?6)",
        )?;
        let mut voices = 0usize;
        for (r, spans) in &file.voices {
            let Some((book, c, v)) = split_ref(r) else { continue };
            let Some(&book_id) = books.get(book) else { continue };
            let Some(text) = kjv.get(&(book_id, c, v)) else { continue };
            for (start, end, voice) in spans {
                if start < end && *end <= text.len() && text.is_char_boundary(*start) && text.is_char_boundary(*end) {
                    stmt.execute(params![book_id, c, v, *start as i64, *end as i64, voice])?;
                    voices += 1;
                }
            }
        }
        eprintln!("[color text] {voices} speaker runs");
    }
    {
        let mut stmt = tx.prepare(
            "INSERT INTO color_tags (book_id, chapter, verse, char_start, char_end, code, term) VALUES (?1,?2,?3,?4,?5,?6,?7)",
        )?;
        let mut keys: Vec<_> = tags.keys().copied().collect();
        keys.sort();
        for key in keys {
            for s in &tags[&key] {
                stmt.execute(params![key.0, key.1, key.2, s.start as i64, s.end as i64, s.code, s.term])?;
                count += 1;
            }
        }
    }

    // The word lists.
    let mut counts: HashMap<(&'static str, String), Counts> = HashMap::new();
    let mut tally = |lang: &'static str, form: String, color: Option<(&str, &str)>| {
        let c = counts.entry((lang, form)).or_default();
        match color {
            Some((code, term)) => *c.colored.entry((code.to_string(), term.to_string())).or_default() += 1,
            None => c.plain += 1,
        }
    };
    let none: Vec<Span> = Vec::new();
    for (key, text) in &kjv {
        let verse_tags = tags.get(key).unwrap_or(&none);
        for (word, t) in kjv_word_tags(text, verse_tags) {
            tally("en", word, t.map(|g| (verse_tags[g].code.as_str(), verse_tags[g].term.as_str())));
        }
    }
    {
        let mut phrases_stmt =
            tx.prepare("SELECT book_id, chapter, verse, text, strongs_id FROM interlinear_words WHERE strongs_id IS NOT NULL ORDER BY book_id, chapter, verse, sort_order")?;
        let mut phrases: HashMap<(i64, i64, i64), Vec<(String, String)>> = HashMap::new();
        for row in phrases_stmt.query_map([], |r| Ok(((r.get(0)?, r.get(1)?, r.get(2)?), r.get(3)?, r.get(4)?)))? {
            let (key, text, sid): ((i64, i64, i64), String, String) = row?;
            phrases.entry(key).or_default().push((text, sid));
        }
        let mut morph_stmt =
            tx.prepare("SELECT book_id, chapter, verse, original_word, strongs_id FROM morphology_words ORDER BY book_id, chapter, verse, sort_order")?;
        let mut morph: HashMap<(i64, i64, i64), Vec<(String, Option<String>)>> = HashMap::new();
        for row in morph_stmt.query_map([], |r| Ok(((r.get(0)?, r.get(1)?, r.get(2)?), r.get(3)?, r.get(4)?)))? {
            let (key, word, sid): ((i64, i64, i64), String, Option<String>) = row?;
            morph.entry(key).or_default().push((word, sid));
        }
        for (key, words) in &morph {
            let (Some(text), Some(ph)) = (kjv.get(key), phrases.get(key)) else { continue };
            let verse_tags = tags.get(key).unwrap_or(&none);
            let strongs = strongs_colors(text, verse_tags, ph);
            for (word, sid) in words {
                let lang = if key.0 >= 40 { "grc" } else { "hbo" };
                let color = sid.as_ref().and_then(|s| strongs.get(s)).map(|&g| (verse_tags[g].code.as_str(), verse_tags[g].term.as_str()));
                tally(lang, plain_word(word), color);
            }
        }
    }

    let mut lexicon = 0usize;
    {
        let mut stmt = tx.prepare("INSERT OR REPLACE INTO color_lexicon (lang, form, code, term) VALUES (?1,?2,?3,?4)")?;
        for ((lang, form), c) in &counts {
            if form.is_empty() {
                continue;
            }
            let mut by_code: HashMap<&str, usize> = HashMap::new();
            for ((code, _), n) in &c.colored {
                *by_code.entry(code.as_str()).or_default() += n;
            }
            let colored: usize = by_code.values().sum();
            let seen = colored + c.plain;
            let Some((&code, &n)) = by_code.iter().max_by_key(|(_, n)| **n) else { continue };
            if seen < MIN_SEEN || (n as f64) < MIN_SHARE * seen as f64 || (n as f64) < MIN_COLOR_SHARE * colored as f64 {
                continue;
            }
            let term = c.colored.iter().filter(|((k, _), _)| k == code).max_by_key(|(_, n)| **n).map(|((_, t), _)| t.as_str()).unwrap_or(form);
            stmt.execute(params![lang, form, code, term])?;
            lexicon += 1;
        }
        for (form, code, term) in LATIN_WORDS {
            stmt.execute(params!["la", form, code, term])?;
            lexicon += 1;
        }
    }
    tx.commit()?;
    eprintln!("[color text] {count} KJV spans, {lexicon} word-list entries");
    Ok(count)
}
