// Imports the 1650 Scottish Metrical Psalter from a pre-extracted JSON file
// into `metrical_psalms`. Source: "The Psalms of David in Metre", John Brown
// of Haddington's edition (archive.org item "scotishpsalter", file
// "1650_brown_psalms-in-meter_djvu.txt") -- OCR text, cleaned up and verified
// against this app's own KJV verse counts for every one of the 150 psalms
// before being committed here (see the extraction script's history for the
// specific OCR defects found and fixed: several corrupted psalm-heading
// digits that stranded a psalm's opening verse(s) in the previous psalm's
// block, a systematic "fi" ligature misread, and Psalm 119's 22
// Hebrew-acrostic section headers needing to be recognized and skipped
// rather than glued onto adjacent verse text). The JSON itself is already
// clean structured data (not raw OCR), so this importer just loads it.
use rusqlite::{params, Connection};
use serde::Deserialize;
use std::path::Path;

#[derive(Deserialize)]
struct PsalmVersion {
    label: Option<String>,
    verses: Vec<(i64, String)>,
}

#[derive(Deserialize)]
struct Psalm {
    number: i64,
    versions: Vec<PsalmVersion>,
}

pub fn import(conn: &mut Connection, dir: &Path) -> anyhow::Result<usize> {
    let text = std::fs::read_to_string(dir.join("scottish_metrical_1650.json"))?;
    let psalms: Vec<Psalm> = serde_json::from_str(&text)?;

    let tx = conn.transaction()?;
    let mut count = 0usize;
    {
        let mut stmt = tx.prepare(
            "INSERT INTO metrical_psalms (psalm, version_label, verse, text) VALUES (?1,?2,?3,?4)",
        )?;
        for psalm in &psalms {
            for version in &psalm.versions {
                for (verse, verse_text) in &version.verses {
                    stmt.execute(params![psalm.number, version.label, verse, verse_text])?;
                    count += 1;
                }
            }
        }
    }
    tx.commit()?;
    Ok(count)
}
