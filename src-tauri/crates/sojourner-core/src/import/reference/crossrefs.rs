use rusqlite::{params, Connection};
use std::collections::HashMap;
use std::path::Path;

pub(crate) fn load_book_lookup(conn: &Connection) -> anyhow::Result<HashMap<String, i64>> {
    let mut stmt = conn.prepare("SELECT id, osis_code FROM books")?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(1)?, r.get::<_, i64>(0)?)))?;
    Ok(rows.collect::<Result<HashMap<_, _>, _>>()?)
}

/// Parses "Gen.1.1" -> (book_osis, chapter, verse).
pub(crate) fn parse_ref(s: &str) -> Option<(&str, i64, i64)> {
    let parts: Vec<&str> = s.rsplitn(3, '.').collect();
    if parts.len() != 3 {
        return None;
    }
    let verse: i64 = parts[0].parse().ok()?;
    let chapter: i64 = parts[1].parse().ok()?;
    Some((parts[2], chapter, verse))
}

/// Parses "Gen.1.1" or a range "John.1.1-John.1.3" into (book, chapter, verse_start, verse_end).
pub(crate) fn parse_ref_range(s: &str) -> Option<(&str, i64, i64, i64)> {
    match s.split_once('-') {
        Some((left, right)) => {
            let (book, chapter, verse_start) = parse_ref(left)?;
            let (_, _, verse_end) = parse_ref(right)?;
            Some((book, chapter, verse_start, verse_end))
        }
        None => {
            let (book, chapter, verse) = parse_ref(s)?;
            Some((book, chapter, verse, verse))
        }
    }
}

pub fn import(conn: &mut Connection, path: &Path) -> anyhow::Result<usize> {
    let text = std::fs::read_to_string(path)?;
    let books = load_book_lookup(conn)?;
    let mut count = 0usize;

    let tx = conn.transaction()?;
    {
        let mut stmt = tx.prepare(
            "INSERT INTO cross_references (from_book_id, from_chapter, from_verse, to_book_id, to_chapter, to_verse_start, to_verse_end, votes)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        )?;
        for line in text.lines() {
            if line.starts_with('#') || line.starts_with("From Verse") || line.trim().is_empty() {
                continue;
            }
            let cols: Vec<&str> = line.split('\t').collect();
            if cols.len() < 3 {
                continue;
            }
            let Some((from_book, from_chapter, from_verse)) = parse_ref(cols[0]) else {
                continue;
            };
            let Some((to_book, to_chapter, to_verse_start, to_verse_end)) = parse_ref_range(cols[1]) else {
                continue;
            };
            let votes: i64 = cols[2].trim().parse().unwrap_or(0);
            let (Some(&from_book_id), Some(&to_book_id)) = (books.get(from_book), books.get(to_book)) else {
                continue;
            };
            stmt.execute(params![from_book_id, from_chapter, from_verse, to_book_id, to_chapter, to_verse_start, to_verse_end, votes])?;
            count += 1;
        }
    }
    tx.commit()?;
    Ok(count)
}
