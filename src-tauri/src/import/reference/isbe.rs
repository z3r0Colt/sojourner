//! The International Standard Bible Encyclopedia (1915), from the letter
//! files `tools/extract-isbe.mjs` writes into `reference/isbe/`.
//!
//! The bodies arrive as HTML rather than plain text. ISBE tags every
//! scripture citation and every cross-reference to another article, and the
//! extractor turns those into `<a class="scripref" data-osis="...">` and
//! `<a class="isbe-link" data-isbe="...">` -- the same shapes the commentary
//! reader already decorates -- so nothing here or on the frontend has to
//! hunt for a reference in prose that had already marked it.

use rusqlite::{params, Connection};
use serde::Deserialize;
use std::collections::HashMap;
use std::path::Path;

/// A range wider than this is a whole-chapter gesture ("1Ch 2:1-55"), not a
/// citation of each verse in it; expanding those in full would treble the
/// index to say something it does not mean.
const MAX_RANGE: i64 = 40;

/// Every verse an article cites, weighted.
///
/// The citations are already tagged in the body as `data-osis`, so this
/// reads them back out rather than re-finding references in prose. Each
/// citation is worth 1000, shared among the verses it spans (see the
/// `isbe_refs` schema for why).
///
/// A caveat inherited from the source: ISBE tags a handful of 3 John
/// references as the Gospel -- the Gaius article cites "Joh 1:1" meaning
/// 3 John 1:1 -- so those land on John 1. That is the edition's own error,
/// and guessing at which "John" was meant would break the correct ones.
fn collect_refs(body: &str, books: &HashMap<String, i64>, into: &mut HashMap<(i64, i64, i64), i64>) -> usize {
    let mut total = 0;
    for chunk in body.split("data-osis=\"").skip(1) {
        let Some(raw) = chunk.split('"').next() else { continue };
        total += 1;
        let Some((osis, chapter, first, last)) = super::crossrefs::parse_ref_range(raw) else { continue };
        let Some(&book_id) = books.get(osis) else { continue };
        let span = if last >= first { last - first + 1 } else { 1 };
        let each = (1000 / span).max(1);
        let last = first + span.min(MAX_RANGE) - 1;
        for verse in first..=last {
            *into.entry((book_id, chapter, verse)).or_insert(0) += each;
        }
    }
    total
}

/// ISBE opens nearly every article with the 1915 edition's pronunciation
/// respelling -- "me-fib'-o-sheth" -- ahead of the Hebrew and the prose. This
/// reads that opening back out, so read-aloud can say the name.
///
/// The test is deliberately strict. A respelling is syllabified and lowercase
/// throughout, and articles whose prose simply begins with a lowercase word
/// are common enough that a looser one fills the table with sentence
/// fragments.
fn parse_respelling(body: &str) -> Option<String> {
    let rest = body.strip_prefix("<p>")?;
    // The respelling ends where the article proper begins: the transliteration
    // in parentheses, the colon before the first sentence, or any markup.
    let head: String = rest
        .chars()
        .take_while(|c| !matches!(c, '(' | ':' | '<' | ';' | '"'))
        .collect();
    // Some articles offer two ("ha-bak'-uk, hab'-a-kuk:"); the first is the
    // one the edition prefers.
    let first = head.split(',').next()?.trim();
    if !first.contains('-') || first.len() > 40 {
        return None;
    }
    if first.chars().filter(|c| c.is_ascii_lowercase()).count() < 2 {
        return None;
    }
    if !first.chars().all(|c| c.is_ascii_lowercase() || matches!(c, '-' | '\'' | '`')) {
        return None;
    }
    Some(first.to_string())
}

/// The words a respelling should answer to: the headword, each headword of a
/// combined article ("Nebuchadnezzar; Nebuchadrezzar"), and any spelling
/// variant listed as an alias -- variants that differ in letters rather than
/// in sound are exactly what a reader meets in one translation or another.
///
/// Headwords of more than one word are left out. Read-aloud substitutes word
/// by word, so a phrase would never match anything.
fn pronunciation_keys(entry: &RawEntry) -> Vec<String> {
    let mut keys: Vec<String> = Vec::new();
    for raw in entry.term.split(';').chain(entry.aliases.iter().map(|s| s.as_str())) {
        let word = raw.trim();
        if word.is_empty() || word.contains(' ') {
            continue;
        }
        if !word.chars().all(|c| c.is_ascii_alphabetic() || matches!(c, '\'' | '-')) {
            continue;
        }
        let upper = word.to_uppercase();
        if !keys.contains(&upper) {
            keys.push(upper);
        }
    }
    keys
}

#[derive(Deserialize)]
struct RawEntry {
    term: String,
    slug: String,
    sort_key: String,
    #[serde(default)]
    aliases: Vec<String>,
    body: String,
    #[serde(default)]
    redirect_slug: Option<String>,
}

/// Parses one letter file (a.json..z.json), an object keyed by headword.
fn parse_file(path: &Path) -> anyhow::Result<Vec<RawEntry>> {
    let text = std::fs::read_to_string(path)?;
    let map: HashMap<String, RawEntry> = serde_json::from_str(&text)?;
    Ok(map.into_values().collect())
}

pub fn import(conn: &mut Connection, dir: &Path) -> anyhow::Result<usize> {
    let books = super::crossrefs::load_book_lookup(conn)?;
    let mut all = Vec::new();
    if let Ok(files) = std::fs::read_dir(dir) {
        for f in files.flatten() {
            let path = f.path();
            if path.extension().map(|e| e == "json").unwrap_or(false)
                && !path.file_name().unwrap_or_default().to_string_lossy().starts_with('_')
            {
                all.extend(parse_file(&path)?);
            }
        }
    }
    // Alphabetical, so ids follow the reading order and the index query can
    // lean on them rather than re-sorting 9,000 rows on every open.
    all.sort_by(|a, b| a.sort_key.to_lowercase().cmp(&b.sort_key.to_lowercase()));
    let count = all.len();

    let tx = conn.transaction()?;
    {
        let mut entry_stmt = tx.prepare(
            "INSERT INTO isbe_entries (term, sort_key, slug, body, plain_text, redirect_slug, ref_count)
             VALUES (?1,?2,?3,?4,?5,?6,?7)
             ON CONFLICT(slug) DO UPDATE SET
               term=excluded.term, sort_key=excluded.sort_key, body=excluded.body,
               plain_text=excluded.plain_text, redirect_slug=excluded.redirect_slug,
               ref_count=excluded.ref_count",
        )?;
        let mut alias_stmt = tx.prepare("INSERT INTO isbe_aliases (alias, entry_id) VALUES (?1,?2)")?;
        let mut ref_stmt =
            tx.prepare("INSERT INTO isbe_refs (entry_id, book_id, chapter, verse, weight) VALUES (?1,?2,?3,?4,?5)")?;
        // Rebuilt from scratch each import, the way the entries themselves are
        // upserted, so a re-run never leaves a respelling behind that the
        // current parse would no longer produce.
        tx.execute("DELETE FROM pronunciations WHERE source = 'isbe'", [])?;
        // Articles are inserted in alphabetical order, so where two claim the
        // same word the earlier one wins -- and wins the same way every build.
        let mut pron_stmt = tx.prepare(
            "INSERT INTO pronunciations (word, respelling, source) VALUES (?1,?2,'isbe')
             ON CONFLICT(word) DO NOTHING",
        )?;
        for entry in &all {
            // The search index is built from the words, not the markup --
            // otherwise "scripref" matches every article carrying a citation.
            let plain = crate::text::html_to_text(&entry.body);
            let mut refs: HashMap<(i64, i64, i64), i64> = HashMap::new();
            let ref_count = collect_refs(&entry.body, &books, &mut refs);
            entry_stmt.execute(params![
                entry.term,
                entry.sort_key,
                entry.slug,
                entry.body,
                plain,
                entry.redirect_slug,
                ref_count as i64
            ])?;
            let id = tx.last_insert_rowid();
            for alias in &entry.aliases {
                alias_stmt.execute(params![alias, id])?;
            }
            for ((book_id, chapter, verse), weight) in refs {
                ref_stmt.execute(params![id, book_id, chapter, verse, weight])?;
            }
            if let Some(respelling) = parse_respelling(&entry.body) {
                for word in pronunciation_keys(entry) {
                    pron_stmt.execute(params![word, respelling])?;
                }
            }
        }
    }
    tx.commit()?;
    Ok(count)
}
