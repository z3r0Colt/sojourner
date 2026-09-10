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

/// Lowercases and splits into words, stripping leading/trailing punctuation
/// from each (but not internal characters, so "God's" stays "god's" rather
/// than losing the apostrophe) -- used to compare a source phrase against
/// the KJV verse text at word granularity rather than as a literal
/// substring, since exact-substring matching breaks on the KJV's own
/// italicized/supplied words sitting between two words of a phrase (see
/// `realign_order`'s doc comment for a concrete example).
fn tokenize(text: &str) -> Vec<String> {
    text.split_whitespace()
        .map(|w| w.trim_matches(|c: char| !c.is_alphanumeric() && c != '\'').to_lowercase())
        .filter(|w| !w.is_empty())
        .collect()
}

/// How many extra haystack words are tolerated between two consecutive
/// words of a phrase (or before its first word) before giving up on a
/// candidate match -- enough to skip a supplied/italicized word or two
/// without being so loose it matches across an unrelated stretch of text.
const MAX_GAP: usize = 3;

/// Finds `phrase` as a subsequence of `haystack` words, trying successive
/// occurrences of its first word at or after `cursor` (unbounded -- text
/// belonging to phrases not yet placed, or already consumed, can separate
/// `cursor` from where this phrase actually begins) until one lets the rest
/// of the phrase complete within `MAX_GAP` extra haystack words between each
/// subsequent pair -- a common first word (e.g. "in") can otherwise resolve
/// to an occurrence that dead-ends a few words later, when a different,
/// still-untried occurrence would have completed the phrase cleanly.
/// Returns the index of the first matched word and the index just past the
/// last one.
fn find_phrase(haystack: &[String], cursor: usize, phrase: &[String]) -> Option<(usize, usize)> {
    let first_word = phrase.first()?;
    let mut search_from = cursor;
    loop {
        let first = (search_from..haystack.len()).find(|&i| haystack[i] == *first_word)?;
        let mut hi = first + 1;
        let mut complete = true;
        for word in &phrase[1..] {
            match (hi..=hi + MAX_GAP).find(|&i| haystack.get(i) == Some(word)) {
                Some(next) => hi = next + 1,
                None => {
                    complete = false;
                    break;
                }
            }
        }
        if complete {
            return Some((first, hi));
        }
        search_from = first + 1;
    }
}

/// The source data's phrase order within a verse is actually concordance order
/// (ascending by Strong's number), not reading order -- e.g. Acts 1:8 arrives as
/// "after that the Holy"(g40), "But"(g235), "of the earth"(g1093), "power"(g1411)...
/// which is jumbled nonsense to read. We already have the authoritative KJV verse
/// text imported, so we greedily re-align each phrase to where it actually occurs
/// in that text (leftmost-remaining-match-wins, cursor advances past each match so
/// repeated words like "and"/"in" get distinct, in-order positions). Matching is
/// done at word granularity with a small gap tolerance (`find_phrase`) rather than
/// requiring an exact contiguous substring, since the KJV's own italicized/supplied
/// words (e.g. a phrase "of the earth" against actual text "of *all* the earth")
/// otherwise break a plain substring search partway through many verses.
fn realign_order(verse_text: &str, words: &[WordEntry]) -> (Vec<usize>, bool) {
    let haystack = tokenize(verse_text);
    let phrases: Vec<Vec<String>> = words.iter().map(|w| tokenize(&w.text)).collect();
    let mut unplaced: Vec<usize> = (0..words.len()).collect();
    let mut cursor = 0usize;
    let mut order = Vec::with_capacity(words.len());
    let mut hit_fallback = false;

    while !unplaced.is_empty() {
        // Ranking key per candidate: (first_word_idx, gap_words_used, -phrase_len).
        // Smallest wins: earliest start first; among ties on start, the
        // tightest/most-contiguous match; among further ties, the longer
        // phrase (e.g. "unto me" over a lone "unto" starting at the same
        // word) -- otherwise the shorter phrase can steal an occurrence the
        // longer one needed, pushing it all the way to wherever a later,
        // unrelated occurrence of its first word happens to be.
        let mut best: Option<((usize, usize, usize), usize, usize)> = None; // (key, end, index into `unplaced`)
        for (up_pos, &word_idx) in unplaced.iter().enumerate() {
            let phrase = &phrases[word_idx];
            if phrase.is_empty() {
                continue;
            }
            if let Some((first, end)) = find_phrase(&haystack, cursor, phrase) {
                let gap = (end - first) - phrase.len();
                let key = (first, gap, usize::MAX - phrase.len());
                if best.as_ref().map(|(bk, ..)| key < *bk).unwrap_or(true) {
                    best = Some((key, end, up_pos));
                }
            }
        }
        match best {
            Some((_, end, up_pos)) => {
                let word_idx = unplaced.remove(up_pos);
                cursor = end;
                order.push(word_idx);
            }
            None => {
                // Nothing left matches the remaining text even with gap
                // tolerance (a genuine wording difference) -- keep the rest
                // in their original relative order rather than dropping them.
                hit_fallback = true;
                order.extend(unplaced.drain(..));
            }
        }
    }
    (order, hit_fallback)
}

pub fn import(conn: &mut Connection, dir: &Path) -> anyhow::Result<usize> {
    let books_json = std::fs::read_to_string(dir.join("books.json"))?;
    let books: Vec<BookMeta> = serde_json::from_str(&books_json)?;
    let folder_to_book: HashMap<String, i64> = books.into_iter().map(|b| (b.n, b.b)).collect();

    let verses_dir = dir.join("verses");
    let mut total = 0usize;
    let mut fallback_verses = 0usize;
    let mut aligned_verses = 0usize;

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
                        Some(vt) => {
                            let (order, hit_fallback) = realign_order(vt, &words);
                            if hit_fallback {
                                fallback_verses += 1;
                            } else {
                                aligned_verses += 1;
                            }
                            order
                        }
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
    println!(
        "interlinear: {aligned_verses} verses fully aligned to KJV word order, {fallback_verses} fell back to concordance order"
    );
    Ok(total)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn word(text: &str, number: &str) -> WordEntry {
        WordEntry { text: text.to_string(), number: Some(number.to_string()) }
    }

    #[test]
    fn realigns_acts_1_8_concordance_order_into_reading_order() {
        // Real source-data ordering for Acts 1:8 (ascending by Strong's number),
        // jumbled relative to how the KJV verse actually reads.
        let verse = "But ye shall receive power, after that the Holy Ghost is come upon you: \
            and ye shall be witnesses unto me both in Jerusalem, and in all Judaea, \
            and in Samaria, and unto the uttermost part of the earth.";
        let words = vec![
            word("after that the Holy", "g40"),
            word("But", "g235"),
            word("of the earth", "g1093"),
            word("power", "g1411"),
        ];
        let (order, hit_fallback) = realign_order(verse, &words);
        assert!(!hit_fallback);
        // Reading order: "But"(1) ... "power"(3) ... "after that the Holy"(0) ... "of the earth"(2)
        assert_eq!(order, vec![1, 3, 0, 2]);
    }

    #[test]
    fn tolerates_a_supplied_word_breaking_a_phrase_substring() {
        // "of the earth" as a phrase, but the KJV inserts the italicized/supplied
        // word "all" between "of" and "the" -- a plain substring search would
        // fail to find this at all.
        let verse = "unto the uttermost part of all the earth.";
        let words = vec![word("of the earth", "g1093")];
        let (order, hit_fallback) = realign_order(verse, &words);
        assert!(!hit_fallback);
        assert_eq!(order, vec![0]);
    }

    #[test]
    fn falls_back_to_original_order_when_nothing_matches() {
        let verse = "completely unrelated text";
        let words = vec![word("foo bar", "g1"), word("baz qux", "g2")];
        let (order, hit_fallback) = realign_order(verse, &words);
        assert!(hit_fallback);
        assert_eq!(order, vec![0, 1]);
    }

    #[test]
    fn a_longer_phrase_wins_a_tied_starting_position_over_a_shorter_one() {
        // Real Acts 1:8 case: a lone "unto"(G2193) phrase and a separate "unto
        // me"(G3427) phrase both start matching at the verse's first "unto" --
        // the longer phrase should claim it, leaving the second "unto"
        // (from "unto the uttermost part") for the shorter one.
        let verse = "and ye shall be witnesses unto me both in Jerusalem, \
            and unto the uttermost part of the earth.";
        let words = vec![word("unto", "g2193"), word("unto me", "g3427")];
        let (order, hit_fallback) = realign_order(verse, &words);
        assert!(!hit_fallback);
        assert_eq!(order, vec![1, 0]);
    }

    #[test]
    fn repeated_words_are_matched_left_to_right_in_order() {
        let verse = "and in Jerusalem, and in all Judaea, and in Samaria";
        let words = vec![word("in Samaria", "g1"), word("in Jerusalem", "g2"), word("in all Judaea", "g3")];
        let (order, hit_fallback) = realign_order(verse, &words);
        assert!(!hit_fallback);
        assert_eq!(order, vec![1, 2, 0]);
    }
}
