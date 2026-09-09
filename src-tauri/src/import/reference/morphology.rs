use super::crossrefs::load_book_lookup;
use rusqlite::{params, Connection};
use std::collections::HashMap;
use std::path::Path;

/// Extracts a Strong's number from an OSHB lemma string, which may carry a
/// morpheme prefix ("b/7225" -> preposition + noun) and/or a homonym-disambiguating
/// letter suffix ("1254 a"). We want just the headword number: "7225", "1254".
fn strongs_from_lemma(lemma: &str) -> Option<String> {
    let last_segment = lemma.rsplit('/').next().unwrap_or(lemma);
    let digits: String = last_segment.chars().take_while(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() {
        None
    } else {
        Some(format!("H{digits}"))
    }
}

fn import_hebrew_book(
    _tx: &Connection,
    path: &Path,
    book_id: i64,
    insert: &mut rusqlite::Statement,
) -> anyhow::Result<usize> {
    let text = std::fs::read_to_string(path)?;
    let doc = roxmltree::Document::parse(&text)?;
    let mut count = 0usize;

    for verse in doc
        .descendants()
        .filter(|n| n.is_element() && n.tag_name().name() == "verse" && n.attribute("osisID").is_some())
    {
        let osis_id = verse.attribute("osisID").unwrap();
        // osisID looks like "Gen.1.1"; take the last two dot-separated numbers.
        let parts: Vec<&str> = osis_id.rsplitn(3, '.').collect();
        if parts.len() != 3 {
            continue;
        }
        let (Ok(verse_num), Ok(chapter_num)) = (parts[0].parse::<i64>(), parts[1].parse::<i64>()) else {
            continue;
        };

        let mut sort_order = 0i64;
        for w in verse
            .children()
            .filter(|n| n.is_element() && n.tag_name().name() == "w")
        {
            let original_word = w.text().unwrap_or("").replace('/', "");
            if original_word.trim().is_empty() {
                continue;
            }
            let lemma = w.attribute("lemma").map(|s| s.to_string());
            let morph = w.attribute("morph").map(|s| s.to_string());
            let strongs_id = lemma.as_deref().and_then(strongs_from_lemma);
            insert.execute(params![book_id, chapter_num, verse_num, sort_order, original_word, lemma, morph, strongs_id])?;
            sort_order += 1;
            count += 1;
        }
    }
    Ok(count)
}

fn import_hebrew(conn: &mut Connection, dir: &Path, book_lookup: &HashMap<String, i64>) -> anyhow::Result<usize> {
    let tx = conn.transaction()?;
    let mut total = 0usize;
    {
        let mut insert = tx.prepare(
            "INSERT INTO morphology_words (book_id, chapter, verse, sort_order, original_word, lemma, morph_code, strongs_id)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        )?;
        let entries = std::fs::read_dir(dir)?;
        for entry in entries.flatten() {
            let path = entry.path();
            let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else { continue };
            let Some(&book_id) = book_lookup.get(stem) else { continue };
            total += import_hebrew_book(&tx, &path, book_id, &mut insert)?;
        }
    }
    tx.commit()?;
    Ok(total)
}

const GREEK_BOOK_ALIASES: &[(&str, &str)] = &[
    ("Mt", "Matt"), ("Mk", "Mark"), ("Lk", "Luke"), ("Jn", "John"), ("Ac", "Acts"),
    ("Ro", "Rom"), ("1Co", "1Cor"), ("2Co", "2Cor"), ("Ga", "Gal"), ("Eph", "Eph"),
    ("Php", "Phil"), ("Col", "Col"), ("1Th", "1Thess"), ("2Th", "2Thess"), ("1Ti", "1Tim"),
    ("2Ti", "2Tim"), ("Tit", "Titus"), ("Phm", "Phlm"), ("Heb", "Heb"), ("Jas", "Jas"),
    ("1Pe", "1Pet"), ("2Pe", "2Pet"), ("1Jn", "1John"), ("2Jn", "2John"), ("3Jn", "3John"),
    ("Jud", "Jude"), ("Re", "Rev"),
];

fn import_greek(conn: &mut Connection, dir: &Path, book_lookup: &HashMap<String, i64>) -> anyhow::Result<usize> {
    let alias_map: HashMap<&str, &str> = GREEK_BOOK_ALIASES.iter().copied().collect();
    let tx = conn.transaction()?;
    let mut total = 0usize;
    {
        let mut insert = tx.prepare(
            "INSERT INTO morphology_words (book_id, chapter, verse, sort_order, original_word, lemma, morph_code, strongs_id)
             VALUES (?1,?2,?3,?4,?5,?6,?7,NULL)",
        )?;
        let entries = std::fs::read_dir(dir)?;
        for entry in entries.flatten() {
            let path = entry.path();
            let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else { continue };
            // filenames look like "61-Mt-morphgnt"
            let Some(abbrev) = stem.split('-').nth(1) else { continue };
            let Some(&osis) = alias_map.get(abbrev) else { continue };
            let Some(&book_id) = book_lookup.get(osis) else { continue };

            let text = std::fs::read_to_string(&path)?;
            let mut last_chapter = 0i64;
            let mut last_verse = 0i64;
            let mut sort_order = 0i64;
            for line in text.lines() {
                let cols: Vec<&str> = line.split_whitespace().collect();
                if cols.len() < 4 {
                    continue;
                }
                let bcv = cols[0];
                if bcv.len() < 6 {
                    continue;
                }
                let chapter: i64 = bcv[2..4].parse().unwrap_or(0);
                let verse: i64 = bcv[4..6].parse().unwrap_or(0);
                let morph_code = format!("{} {}", cols[1], cols[2]);
                let word = cols.get(3).unwrap_or(&"").to_string();
                let lemma = cols.get(6).map(|s| s.to_string());
                if chapter != last_chapter || verse != last_verse {
                    sort_order = 0;
                    last_chapter = chapter;
                    last_verse = verse;
                }
                insert.execute(params![book_id, chapter, verse, sort_order, word, lemma, morph_code])?;
                sort_order += 1;
                total += 1;
            }
        }
    }
    tx.commit()?;
    Ok(total)
}

pub fn import(conn: &mut Connection, dir: &Path) -> anyhow::Result<usize> {
    let book_lookup = load_book_lookup(conn)?;
    let hebrew = import_hebrew(conn, &dir.join("hebrew"), &book_lookup)?;
    let greek = import_greek(conn, &dir.join("greek"), &book_lookup)?;
    Ok(hebrew + greek)
}
