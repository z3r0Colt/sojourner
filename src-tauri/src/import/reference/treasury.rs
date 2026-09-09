// Imports Spurgeon's "The Treasury of David" (all 150 psalms) into the same
// commentary_sources/books/sections/entries tables Barnes/Calvin/Matthew
// Henry/JFB use, from a pre-extracted JSON file rather than parsing ThML/epub
// here directly.
//
// Source: two epub volumes (Vol 1: Psalms 1-87, Vol 2: 88-150) the user
// supplied directly, since CCEL's own ThML edition of this work turned out to
// be page-scan images with no transcribed text at all. Each epub's HTML was
// clean, properly transcribed text (not an OCR scan), so this needed far
// less cleanup than the 1650 Metrical Psalter did -- mainly recognizing
// Spurgeon's own EXPOSITION / EXPLANATORY NOTES AND QUAINT SAYINGS / HINTS TO
// THE VILLAGE PREACHER section dividers and each paragraph's own "Verse N."
// (or "Verses N, M, X-Y.") reference, and one one-off anomaly where Psalm 23
// alone duplicates its section names as a Title Case mini table-of-contents
// right after its anchor (distinguished from the real ALL-CAPS dividers and
// dropped rather than treated as a section change). Verified against this
// app's own commentary_entries counts per psalm following the extraction
// (Psalm 117, the shortest psalm in the Bible, has the fewest entries;
// Psalm 119, the longest, has by far the most -- consistent with genuine,
// proportionate content rather than truncation or duplication).
use rusqlite::{params, Connection, OptionalExtension};
use serde::Deserialize;
use std::collections::BTreeMap;
use std::path::Path;

#[derive(Deserialize)]
struct TreasuryEntry {
    section: String,
    verse_start: Option<i64>,
    verse_end: Option<i64>,
    html: String,
    text: String,
}

const PSALMS_BOOK_ID: i64 = 19;

pub fn import(conn: &mut Connection, dir: &Path) -> anyhow::Result<usize> {
    let text = std::fs::read_to_string(dir.join("treasury_of_david.json"))?;
    let raw: BTreeMap<String, Vec<TreasuryEntry>> = serde_json::from_str(&text)?;
    let mut psalms: BTreeMap<i64, Vec<TreasuryEntry>> = BTreeMap::new();
    for (k, v) in raw {
        psalms.insert(k.parse()?, v);
    }

    let now = chrono::Utc::now().to_rfc3339();
    let tx = conn.transaction()?;

    let existing_id: Option<i64> = tx
        .query_row("SELECT id FROM commentary_sources WHERE code = 'treasury'", [], |r| r.get(0))
        .optional()?;
    let source_id: i64 = if let Some(id) = existing_id {
        tx.execute("UPDATE commentary_sources SET imported_at = ?1 WHERE id = ?2", params![now, id])?;
        tx.execute("DELETE FROM commentary_sections WHERE commentary_source_id = ?1", params![id])?;
        id
    } else {
        tx.execute(
            "INSERT INTO commentary_sources (code, title, author, source_format, source_files, imported_at)
             VALUES ('treasury', 'The Treasury of David', 'C. H. Spurgeon', 'json', '{}', ?1)",
            params![now],
        )?;
        tx.last_insert_rowid()
    };
    tx.execute(
        "INSERT INTO commentary_books (commentary_source_id, book_id, div1_id) VALUES (?1,?2,'treasury')
         ON CONFLICT(commentary_source_id, book_id) DO NOTHING",
        params![source_id, PSALMS_BOOK_ID],
    )?;

    let mut entries_inserted = 0usize;
    {
        let mut section_stmt = tx.prepare(
            "INSERT INTO commentary_sections (commentary_source_id, book_id, chapter, div2_id, title, sort_order)
             VALUES (?1,?2,?3,?4,?5,?6)",
        )?;
        let mut entry_stmt = tx.prepare(
            "INSERT INTO commentary_entries (section_id, sort_order, book_id, chapter, verse_start, verse_end, html, plain_text)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        )?;

        for (psalm, psalm_entries) in &psalms {
            let div2_id = format!("treasury:{psalm}");
            let title = format!("Psalm {psalm}");
            section_stmt.execute(params![source_id, PSALMS_BOOK_ID, psalm, div2_id, title, psalm - 1])?;
            let section_id = tx.last_insert_rowid();

            let mut last_section: Option<&str> = None;
            for (i, e) in psalm_entries.iter().enumerate() {
                let html = if last_section != Some(e.section.as_str()) {
                    last_section = Some(&e.section);
                    format!(r#"<strong class="tod-section">{}</strong><br/>{}"#, escape(&e.section), e.html)
                } else {
                    e.html.clone()
                };
                entry_stmt.execute(params![
                    section_id, i as i64, PSALMS_BOOK_ID, psalm, e.verse_start, e.verse_end, html, e.text
                ])?;
                entries_inserted += 1;
            }
        }
    }

    tx.commit()?;
    Ok(entries_inserted)
}

fn escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}
