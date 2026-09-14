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
            "INSERT INTO isbe_entries (term, sort_key, slug, body, plain_text, redirect_slug)
             VALUES (?1,?2,?3,?4,?5,?6)
             ON CONFLICT(slug) DO UPDATE SET
               term=excluded.term, sort_key=excluded.sort_key, body=excluded.body,
               plain_text=excluded.plain_text, redirect_slug=excluded.redirect_slug",
        )?;
        let mut alias_stmt = tx.prepare("INSERT INTO isbe_aliases (alias, entry_id) VALUES (?1,?2)")?;
        for entry in &all {
            // The search index is built from the words, not the markup --
            // otherwise "scripref" matches every article carrying a citation.
            let plain = crate::text::html_to_text(&entry.body);
            entry_stmt.execute(params![
                entry.term,
                entry.sort_key,
                entry.slug,
                entry.body,
                plain,
                entry.redirect_slug
            ])?;
            let id = tx.last_insert_rowid();
            for alias in &entry.aliases {
                alias_stmt.execute(params![alias, id])?;
            }
        }
    }
    tx.commit()?;
    Ok(count)
}
