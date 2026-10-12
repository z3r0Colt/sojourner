// Imports red-letter (words of Jesus) verse ranges from a pre-generated
// JSON file into red_letter_ranges.
//
// Source: the World English Bible's USFM edition
// (ebible.org/Scriptures/eng-web_usfm.zip, public domain), which marks
// Christ's spoken words with USFM's standard \wj...\wj* markers. A verse is
// included in a range if any part of it falls inside a \wj span; markup
// wasn't limited to the Gospels in the source -- it also covers Acts
// (Christ's words to Paul/Ananias), a couple of Pauline verses quoting a
// saying of Jesus, and Revelation (Christ's words to John) -- so this
// importer takes whatever books the data actually names rather than
// assuming only the four Gospels.
use rusqlite::{params, Connection};
use serde::Deserialize;
use std::collections::HashMap;
use std::path::Path;

#[derive(Deserialize)]
struct RedLetterRange {
    book: String,
    chapter: i64,
    verse_start: i64,
    verse_end: i64,
}

#[derive(Deserialize)]
struct RedLetterFile {
    ranges: Vec<RedLetterRange>,
}

fn load_book_lookup(conn: &Connection) -> anyhow::Result<HashMap<String, i64>> {
    let mut stmt = conn.prepare("SELECT id, name FROM books")?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(1)?, r.get::<_, i64>(0)?)))?;
    Ok(rows.collect::<Result<HashMap<_, _>, _>>()?)
}

pub fn import(conn: &mut Connection, dir: &Path) -> anyhow::Result<usize> {
    let book_lookup = load_book_lookup(conn)?;
    let text = std::fs::read_to_string(dir.join("red_letter.json"))?;
    let file: RedLetterFile = serde_json::from_str(&text)?;

    let tx = conn.transaction()?;
    let mut count = 0usize;
    {
        let mut stmt = tx.prepare(
            "INSERT INTO red_letter_ranges (book_id, chapter, verse_start, verse_end) VALUES (?1,?2,?3,?4)",
        )?;
        for r in &file.ranges {
            let book_id = *book_lookup
                .get(&r.book)
                .ok_or_else(|| anyhow::anyhow!("red letter: unknown book {:?}", r.book))?;
            stmt.execute(params![book_id, r.chapter, r.verse_start, r.verse_end])?;
            count += 1;
        }
    }
    tx.commit()?;
    Ok(count)
}
