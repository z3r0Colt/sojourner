//! Easton's and Smith's Bible dictionaries, from `reference/dictionary/`.
//!
//! Two works on the same subjects, and the source files treat them as one
//! list of headwords. That causes two problems this importer has to undo.
//!
//! They spell things differently. Easton's writes "Abel-meholah" and Smith's
//! "Abelmeholah"; "Lord's Supper" against "Lords Supper". 163 headwords are
//! split that way, so the index showed the subject twice and each copy held
//! only one of the two dictionaries' articles on it. Entries whose names
//! differ by nothing but punctuation are merged, and the spellings not kept
//! become aliases so a search for either still lands.
//!
//! And a definition's author matters. The body used to be one string with
//! "(Easton's)" typed in front of each part, which reads as prose and cannot
//! be filtered, cited, or told apart. Each article is stored on its own now.

use rusqlite::{params, Connection};
use serde::Deserialize;
use std::collections::HashMap;
use std::path::Path;

#[derive(Deserialize)]
struct RawDefinition {
    source: String,
    text: String,
}

#[derive(Deserialize)]
struct RawEntry {
    name: String,
    slug: String,
    definitions: Vec<RawDefinition>,
}

const SOURCE_LABELS: &[(&str, &str)] = &[("EAS", "Easton's Bible Dictionary"), ("SMI", "Smith's Bible Dictionary")];

fn source_label(code: &str) -> &str {
    SOURCE_LABELS.iter().find(|(c, _)| *c == code).map(|(_, l)| *l).unwrap_or(code)
}

/// Easton's order first, then Smith's, then anything else -- the same order
/// every entry, so the page does not reshuffle itself between headwords.
fn source_rank(code: &str) -> usize {
    SOURCE_LABELS.iter().position(|(c, _)| *c == code).unwrap_or(SOURCE_LABELS.len())
}

/// A headword reduced to its letters, which is what makes "Abel-meholah"
/// and "Abelmeholah" recognisable as the same subject.
fn fold(name: &str) -> String {
    name.chars().filter(|c| c.is_alphanumeric()).flat_map(|c| c.to_lowercase()).collect()
}

/// The best-typeset spelling of a headword.
///
/// Of "Abelmeholah" and "Abel-meholah", or "Lords Supper" and "Lord's
/// Supper", the one that kept its punctuation is the one a reader should
/// see; the other is how the other dictionary happened to file it.
///
/// Four headwords tie on punctuation, and in every one of them Easton's has
/// it right and Smith's has broken a word in half -- "Ajalon" against "Aj
/// Alon", "Nymphas" against "Nym Phas". So Easton's breaks the tie.
fn best_name(group: &[RawEntry]) -> String {
    let punctuation = |s: &str| s.chars().filter(|c| !c.is_alphanumeric() && !c.is_whitespace()).count();
    let from_eastons = |e: &RawEntry| e.definitions.iter().any(|d| d.source == "EAS");
    group
        .iter()
        .max_by_key(|e| (punctuation(&e.name), from_eastons(e), std::cmp::Reverse(e.name.clone())))
        .map(|e| e.name.clone())
        .unwrap_or_default()
}

fn parse_file(path: &Path) -> anyhow::Result<Vec<RawEntry>> {
    let text = std::fs::read_to_string(path)?;
    let map: HashMap<String, RawEntry> = serde_json::from_str(&text)?;
    Ok(map.into_values().collect())
}

struct Merged {
    term: String,
    slug: String,
    /// Every spelling that is not the one on display.
    aliases: Vec<String>,
    /// (code, name, text), in reading order.
    definitions: Vec<(String, String, String)>,
}

pub fn import(conn: &mut Connection, dir: &Path) -> anyhow::Result<usize> {
    let mut raw = Vec::new();
    if let Ok(files) = std::fs::read_dir(dir) {
        for f in files.flatten() {
            let path = f.path();
            if path.extension().map(|e| e == "json").unwrap_or(false)
                && !path.file_name().unwrap_or_default().to_string_lossy().starts_with('_')
            {
                raw.extend(parse_file(&path)?);
            }
        }
    }

    // Group the spellings of one subject together.
    let mut groups: HashMap<String, Vec<RawEntry>> = HashMap::new();
    for entry in raw {
        groups.entry(fold(&entry.name)).or_default().push(entry);
    }

    let mut merged: Vec<Merged> = Vec::new();
    for (_, mut group) in groups {
        // Stable output regardless of the order the files were read in.
        group.sort_by(|a, b| a.name.cmp(&b.name));
        let term = best_name(&group);
        let slug = group
            .iter()
            .find(|e| e.name == term)
            .map(|e| e.slug.clone())
            .unwrap_or_else(|| group[0].slug.clone());

        let mut definitions: Vec<(String, String, String)> = Vec::new();
        for entry in &group {
            for definition in &entry.definitions {
                let text = definition.text.trim();
                // A dictionary that says nothing about a word has no article
                // on it; 25 of these would otherwise be blank pages.
                if text.is_empty() {
                    continue;
                }
                // The same article can arrive under both spellings.
                if definitions.iter().any(|(code, _, body)| code == &definition.source && body == text) {
                    continue;
                }
                definitions.push((definition.source.clone(), source_label(&definition.source).to_string(), text.to_string()));
            }
        }
        if definitions.is_empty() {
            continue;
        }
        definitions.sort_by_key(|(code, _, _)| source_rank(code));

        let aliases = group.iter().map(|e| e.name.clone()).filter(|n| n != &term).collect();
        merged.push(Merged { term, slug, aliases, definitions });
    }

    merged.sort_by(|a, b| a.term.to_lowercase().cmp(&b.term.to_lowercase()));
    let count = merged.len();

    let tx = conn.transaction()?;
    {
        let mut entry_stmt = tx.prepare(
            "INSERT INTO dictionary_entries (term, slug, body, sources) VALUES (?1,?2,?3,?4)
             ON CONFLICT(slug) DO UPDATE SET term=excluded.term, body=excluded.body, sources=excluded.sources",
        )?;
        let mut definition_stmt = tx.prepare(
            "INSERT INTO dictionary_definitions (entry_id, source_code, source_name, body, sort_order)
             VALUES (?1,?2,?3,?4,?5)",
        )?;
        let mut alias_stmt = tx.prepare("INSERT INTO dictionary_aliases (alias, entry_id) VALUES (?1,?2)")?;

        for entry in &merged {
            // `body` stays the whole entry as one block of words: it is what
            // the search index is built from, and what a citation quotes.
            let body = entry
                .definitions
                .iter()
                .map(|(_, name, text)| format!("{name}\n{text}"))
                .collect::<Vec<_>>()
                .join("\n\n");
            // Which dictionaries have something here, each named once: a few
            // headwords are homonyms that one dictionary treats twice ("Hail"
            // the weather and "Hail!" the greeting are both Easton's), and
            // that is two articles from one source, not two sources.
            let mut codes: Vec<&str> = Vec::new();
            for (code, _, _) in &entry.definitions {
                if !codes.contains(&code.as_str()) {
                    codes.push(code);
                }
            }
            let codes = codes.join(",");
            entry_stmt.execute(params![entry.term, entry.slug, body, codes])?;
            let id = tx.last_insert_rowid();
            for (i, (code, name, text)) in entry.definitions.iter().enumerate() {
                definition_stmt.execute(params![id, code, name, text, i as i64])?;
            }
            for alias in &entry.aliases {
                alias_stmt.execute(params![alias, id])?;
            }
        }
    }
    tx.commit()?;
    Ok(count)
}
