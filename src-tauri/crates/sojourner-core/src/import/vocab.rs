//! `search_vocab`: every word the English translations use, and how often.
//!
//! Read from the verse text after every translation is in, so a translation
//! added later adds its words the next time content.db is built. Only
//! Latin-script translations count -- the suggestions are for what a reader
//! types into an English search box -- and a word is letters and
//! apostrophes, lower-cased, at least two characters.

use rusqlite::{params, Connection};
use std::collections::HashMap;

pub fn build(conn: &mut Connection) -> anyhow::Result<usize> {
    let mut counts: HashMap<String, i64> = HashMap::new();
    {
        let mut stmt = conn.prepare(
            "SELECT v.text FROM verses v JOIN translations t ON t.id = v.translation_id WHERE t.script = 'latin'",
        )?;
        let mut rows = stmt.query([])?;
        let mut word = String::new();
        while let Some(r) = rows.next()? {
            let text: String = r.get(0)?;
            for c in text.chars().chain(std::iter::once(' ')) {
                if c.is_alphabetic() || (c == '\'' && !word.is_empty()) {
                    word.extend(c.to_lowercase());
                } else {
                    let w = word.trim_end_matches('\'');
                    if w.chars().count() >= 2 {
                        *counts.entry(w.to_string()).or_default() += 1;
                    }
                    word.clear();
                }
            }
        }
    }
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM search_vocab", [])?;
    {
        let mut insert = tx.prepare("INSERT INTO search_vocab (word, count) VALUES (?1, ?2)")?;
        for (w, c) in &counts {
            insert.execute(params![w, c])?;
        }
    }
    tx.commit()?;
    Ok(counts.len())
}
