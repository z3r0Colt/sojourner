use rusqlite::{params, Connection, OptionalExtension};
use serde::Deserialize;
use std::collections::HashMap;
use std::path::Path;

#[derive(Deserialize)]
struct BookMeta {
    b: i64,
    n: String,
}

#[derive(Deserialize)]
struct WordEntry {
    text: String,
    number: Option<String>,
}

/// Normalizes "h120"/"g40" (or any casing/padding) into canonical "H120"/"G40"
/// matching strongs_entries.id.
fn normalize_strongs(raw: &str) -> Option<String> {
    let raw = raw.trim();
    if raw.is_empty() {
        return None;
    }
    let (prefix, rest) = raw.split_at(1);
    let prefix = prefix.to_uppercase();
    if prefix != "H" && prefix != "G" {
        return None;
    }
    let digits: String = rest.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() {
        return None;
    }
    let n: u32 = digits.parse().ok()?;
    Some(format!("{prefix}{n}"))
}

/// The source data's phrase order within a verse is actually concordance order
/// (ascending by Strong's number), not reading order -- e.g. Acts 1:8 arrives as
/// "after that the Holy"(g40), "But"(g235), "of the earth"(g1093), "power"(g1411)...
/// which is jumbled nonsense to read. We already have the authoritative KJV verse
/// text imported, so we greedily re-align each phrase to where it actually occurs
/// in that text (leftmost-remaining-match-wins, cursor advances past each match so
/// repeated words like "and"/"in" get distinct, in-order positions).
fn realign_order(verse_text: &str, words: &[WordEntry]) -> Vec<usize> {
    let haystack = verse_text.to_lowercase();
    let mut unplaced: Vec<usize> = (0..words.len()).collect();
    let mut cursor = 0usize;
    let mut order = Vec::with_capacity(words.len());

    while !unplaced.is_empty() {
        let mut best: Option<(usize, usize, usize)> = None; // (abs_pos, match_len, index into `unplaced`)
        for (up_pos, &word_idx) in unplaced.iter().enumerate() {
            let needle = words[word_idx].text.trim().to_lowercase();
            if needle.is_empty() {
                continue;
            }
            if let Some(rel_pos) = haystack.get(cursor..).and_then(|h| h.find(&needle)) {
                let abs_pos = cursor + rel_pos;
                if best.map(|(bp, _, _)| abs_pos < bp).unwrap_or(true) {
                    best = Some((abs_pos, needle.len(), up_pos));
                }
            }
        }
        match best {
            Some((pos, len, up_pos)) => {
                let word_idx = unplaced.remove(up_pos);
                cursor = pos + len.max(1);
                order.push(word_idx);
            }
            None => {
                // Nothing left matches the remaining text (data quirk) -- keep the
                // rest in their original relative order rather than dropping them.
                order.extend(unplaced.drain(..));
            }
        }
    }
    order
}

pub fn import(conn: &mut Connection, dir: &Path) -> anyhow::Result<usize> {
    let books_json = std::fs::read_to_string(dir.join("books.json"))?;
    let books: Vec<BookMeta> = serde_json::from_str(&books_json)?;
    let folder_to_book: HashMap<String, i64> = books.into_iter().map(|b| (b.n, b.b)).collect();

    let verses_dir = dir.join("verses");
    let mut total = 0usize;

    let kjv_translation_id: Option<i64> = conn
        .query_row(
            "SELECT id FROM translations WHERE code = 'KJV' ORDER BY id LIMIT 1",
            [],
            |r| r.get(0),
        )
        .optional()?;

    let tx = conn.transaction()?;
    {
        let mut insert_stmt = tx.prepare(
            "INSERT INTO interlinear_words (book_id, chapter, verse, sort_order, text, strongs_id) VALUES (?1,?2,?3,?4,?5,?6)",
        )?;
        let mut verse_text_stmt = tx.prepare(
            "SELECT text FROM verses WHERE translation_id = ?1 AND book_id = ?2 AND chapter = ?3 AND verse = ?4",
        )?;

        for (folder, book_id) in &folder_to_book {
            let book_dir = verses_dir.join(folder);
            let Ok(entries) = std::fs::read_dir(&book_dir) else {
                continue;
            };
            for entry in entries.flatten() {
                let path = entry.path();
                let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
                    continue;
                };
                let Ok(chapter) = stem.parse::<i64>() else {
                    continue;
                };
                let Ok(text) = std::fs::read_to_string(&path) else {
                    continue;
                };
                let Ok(verses) = serde_json::from_str::<HashMap<String, Vec<WordEntry>>>(&text) else {
                    continue;
                };
                for (verse_str, words) in verses {
                    let Ok(verse) = verse_str.parse::<i64>() else {
                        continue;
                    };

                    let kjv_text: Option<String> = kjv_translation_id.and_then(|tid| {
                        verse_text_stmt
                            .query_row(params![tid, book_id, chapter, verse], |r| r.get(0))
                            .optional()
                            .ok()
                            .flatten()
                    });

                    let order: Vec<usize> = match &kjv_text {
                        Some(vt) => realign_order(vt, &words),
                        None => (0..words.len()).collect(),
                    };

                    for (sort_order, &word_idx) in order.iter().enumerate() {
                        let w = &words[word_idx];
                        let strongs_id = w.number.as_deref().and_then(normalize_strongs);
                        insert_stmt.execute(params![book_id, chapter, verse, sort_order as i64, w.text, strongs_id])?;
                        total += 1;
                    }
                }
            }
        }
    }
    tx.commit()?;
    Ok(total)
}
