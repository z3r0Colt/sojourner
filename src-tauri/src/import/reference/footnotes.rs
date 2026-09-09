use super::crossrefs::load_book_lookup;
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashMap;
use std::path::Path;

const USX_BOOK_ALIASES: &[(&str, &str)] = &[
    ("GEN", "Gen"), ("EXO", "Exod"), ("LEV", "Lev"), ("NUM", "Num"), ("DEU", "Deut"),
    ("JOS", "Josh"), ("JDG", "Judg"), ("RUT", "Ruth"), ("1SA", "1Sam"), ("2SA", "2Sam"),
    ("1KI", "1Kgs"), ("2KI", "2Kgs"), ("1CH", "1Chr"), ("2CH", "2Chr"), ("EZR", "Ezra"),
    ("NEH", "Neh"), ("EST", "Esth"), ("JOB", "Job"), ("PSA", "Ps"), ("PRO", "Prov"),
    ("ECC", "Eccl"), ("SNG", "Song"), ("ISA", "Isa"), ("JER", "Jer"), ("LAM", "Lam"),
    ("EZK", "Ezek"), ("DAN", "Dan"), ("HOS", "Hos"), ("JOL", "Joel"), ("AMO", "Amos"),
    ("OBA", "Obad"), ("JON", "Jonah"), ("MIC", "Mic"), ("NAM", "Nah"), ("HAB", "Hab"),
    ("ZEP", "Zeph"), ("HAG", "Hag"), ("ZEC", "Zech"), ("MAL", "Mal"), ("MAT", "Matt"),
    ("MRK", "Mark"), ("LUK", "Luke"), ("JHN", "John"), ("ACT", "Acts"), ("ROM", "Rom"),
    ("1CO", "1Cor"), ("2CO", "2Cor"), ("GAL", "Gal"), ("EPH", "Eph"), ("PHP", "Phil"),
    ("COL", "Col"), ("1TH", "1Thess"), ("2TH", "2Thess"), ("1TI", "1Tim"), ("2TI", "2Tim"),
    ("TIT", "Titus"), ("PHM", "Phlm"), ("HEB", "Heb"), ("JAS", "Jas"), ("1PE", "1Pet"),
    ("2PE", "2Pet"), ("1JN", "1John"), ("2JN", "2John"), ("3JN", "3John"), ("JUD", "Jude"),
    ("REV", "Rev"),
];

fn leading_digits(s: &str) -> Option<i64> {
    let digits: String = s.chars().take_while(|c| c.is_ascii_digit()).collect();
    digits.parse().ok()
}

fn note_text(node: roxmltree::Node) -> String {
    let mut out = String::new();
    for text in node.descendants().filter(|n| n.is_text()) {
        out.push_str(text.text().unwrap_or(""));
        out.push(' ');
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn marker_for(index: usize) -> String {
    let letters = "abcdefghijklmnopqrstuvwxyz";
    let bytes = letters.as_bytes();
    let ch = bytes[index % 26] as char;
    if index < 26 {
        ch.to_string()
    } else {
        format!("{ch}{}", index / 26 + 1)
    }
}

/// Byte offset of the start of the (word_index + 1)-th word in `text` --
/// i.e. "right after `word_index` words have gone by". Used to place a
/// footnote marker after the word it actually annotates, rather than always
/// at the end of the verse.
fn char_offset_after_words(text: &str, word_index: usize) -> usize {
    if word_index == 0 {
        return 0;
    }
    let mut count = 0usize;
    let mut in_word = false;
    for (i, c) in text.char_indices() {
        if c.is_whitespace() {
            in_word = false;
        } else if !in_word {
            in_word = true;
            count += 1;
            if count == word_index + 1 {
                return i;
            }
        }
    }
    text.len()
}

struct RawFootnote {
    chapter: i64,
    verse: i64,
    word_index: usize,
    text: String,
}

/// Walks the USX tree tracking chapter/verse milestones and the plain text
/// accumulated so far *within the current verse* (skipping note contents),
/// so each footnote can be recorded with the word position it followed.
fn walk(node: roxmltree::Node, chapter: &mut i64, verse: &mut i64, verse_text: &mut String, out: &mut Vec<RawFootnote>) {
    for child in node.children() {
        if child.is_text() {
            if let Some(t) = child.text() {
                verse_text.push_str(t);
            }
        } else if child.is_element() {
            match child.tag_name().name() {
                "chapter" => {
                    if let Some(n) = child.attribute("number").and_then(leading_digits) {
                        *chapter = n;
                    }
                    *verse = 0;
                    verse_text.clear();
                }
                "verse" => {
                    if let Some(n) = child.attribute("number").and_then(leading_digits) {
                        *verse = n;
                    }
                    verse_text.clear();
                }
                "note" if child.attribute("style") == Some("f") => {
                    let word_index = verse_text.split_whitespace().count();
                    let body = note_text(child);
                    if !body.trim().is_empty() && *chapter > 0 && *verse > 0 {
                        out.push(RawFootnote { chapter: *chapter, verse: *verse, word_index, text: body });
                    }
                    // Deliberately don't recurse -- note content isn't part of the verse's running text.
                }
                "para" => {
                    if !verse_text.is_empty() {
                        verse_text.push(' ');
                    }
                    walk(child, chapter, verse, verse_text, out);
                }
                _ => walk(child, chapter, verse, verse_text, out),
            }
        }
    }
}

fn import_book(
    path: &Path,
    translation_id: i64,
    book_id: i64,
    insert: &mut rusqlite::Statement,
    verse_text_stmt: &mut rusqlite::Statement,
) -> anyhow::Result<usize> {
    let text = std::fs::read_to_string(path)?;
    let doc = roxmltree::Document::parse(&text)?;

    let mut chapter = 0i64;
    let mut verse = 0i64;
    let mut verse_text = String::new();
    let mut raw = Vec::new();
    walk(doc.root(), &mut chapter, &mut verse, &mut verse_text, &mut raw);

    let mut marker_index: HashMap<(i64, i64), usize> = HashMap::new();
    let mut count = 0usize;
    for note in raw {
        let displayed_text: Option<String> = verse_text_stmt
            .query_row(params![translation_id, book_id, note.chapter, note.verse], |r| r.get(0))
            .optional()?;
        let char_offset = displayed_text
            .as_deref()
            .map(|t| char_offset_after_words(t, note.word_index) as i64);

        let key = (note.chapter, note.verse);
        let idx = marker_index.entry(key).or_insert(0);
        let marker = marker_for(*idx);
        *idx += 1;

        insert.execute(params![translation_id, book_id, note.chapter, note.verse, *idx as i64, marker, note.text, char_offset])?;
        count += 1;
    }
    Ok(count)
}

struct RawOsisFootnote {
    book: String,
    chapter: i64,
    verse: i64,
    /// The phrase this note annotates, quoted from the verse text (CrossWire's
    /// `<catchWord>`). Notes in this OSIS source are all serialized at the very
    /// end of the verse regardless of which word they apply to, so this is the
    /// only way to recover the intended position -- `catchword` gets located
    /// inside the verse's own displayed text at import time.
    catchword: String,
    text: String,
}

/// Splits a CrossWire OSIS `<note type="study">` into its `<catchWord>` (the
/// annotated phrase, quoted from the verse) and the rest (the actual note body:
/// "Heb. ...", "or, ...", etc).
fn extract_note_parts(node: roxmltree::Node) -> (String, String) {
    let mut catchword = String::new();
    let mut body = String::new();
    for child in node.children() {
        if child.is_text() {
            body.push_str(child.text().unwrap_or(""));
            body.push(' ');
        } else if child.is_element() {
            let target = if child.tag_name().name() == "catchWord" { &mut catchword } else { &mut body };
            for t in child.descendants().filter(|n| n.is_text()) {
                target.push_str(t.text().unwrap_or(""));
                target.push(' ');
            }
        }
    }
    let catchword = catchword.split_whitespace().collect::<Vec<_>>().join(" ");
    let body = body.split_whitespace().collect::<Vec<_>>().join(" ");
    (catchword, body)
}

fn parse_osis_id(id: &str) -> Option<(&str, i64, i64)> {
    let mut parts = id.rsplitn(3, '.');
    let verse = parts.next()?.parse().ok()?;
    let chapter = parts.next()?.parse().ok()?;
    let book = parts.next()?;
    Some((book, chapter, verse))
}

/// Walks a CrossWire-style OSIS document (milestone `<verse sID="Book.C.V"
/// osisID="Book.C.V"/> ... <verse eID="Book.C.V"/>` pairs, not nested
/// containers), collecting each `<note type="study">` in document order along
/// with the book/chapter/verse it falls within.
fn walk_osis(node: roxmltree::Node, book: &mut String, chapter: &mut i64, verse: &mut i64, out: &mut Vec<RawOsisFootnote>) {
    for child in node.children() {
        if child.is_element() {
            match child.tag_name().name() {
                "verse" => {
                    if let Some(id) = child.attribute("sID").or_else(|| child.attribute("osisID")) {
                        if let Some((b, c, v)) = parse_osis_id(id) {
                            *book = b.to_string();
                            *chapter = c;
                            *verse = v;
                        }
                    }
                    // Empty milestone element -- no children to recurse into.
                }
                "note" if child.attribute("type") == Some("study") => {
                    let (catchword, body) = extract_note_parts(child);
                    if !body.trim().is_empty() && *chapter > 0 && *verse > 0 {
                        out.push(RawOsisFootnote { book: book.clone(), chapter: *chapter, verse: *verse, catchword, text: body });
                    }
                }
                _ => walk_osis(child, book, chapter, verse, out),
            }
        }
    }
}

/// Strips the trailing ellipsis CrossWire uses to mark a truncated quoted
/// phrase (and any trailing punctuation) off a `<catchWord>` value.
fn strip_catchword(raw: &str) -> &str {
    raw.trim().trim_end_matches('\u{2026}').trim_end_matches([' ', ',', ';', ':', '.'])
}

/// Finds `catchword` inside `haystack_lower` (already-lowercased verse text),
/// preferring the first match at or after `cursor` so that multiple notes on
/// the same verse resolve left-to-right in the order CrossWire lists them.
/// Returns the byte offset just past the end of the match.
fn locate_catchword(haystack_lower: &str, catchword: &str, cursor: usize) -> Option<usize> {
    let needle = strip_catchword(catchword).to_lowercase();
    if needle.is_empty() {
        return None;
    }
    if let Some(rel) = haystack_lower.get(cursor..).and_then(|s| s.find(&needle)) {
        return Some(cursor + rel + needle.len());
    }
    haystack_lower.find(&needle).map(|idx| idx + needle.len())
}

/// Imports footnotes from a CrossWire OSIS Bible module source (e.g. the KJV,
/// whose OT translators' marginal notes are marked up as `<note type="study">`
/// elements inline in the text). CrossWire grants a general public license to
/// use this text for any purpose (DistributionLicense=GPL).
pub fn import_osis(conn: &mut Connection, path: &Path, translation_code: &str) -> anyhow::Result<usize> {
    let translation_id: Option<i64> = conn
        .query_row(
            "SELECT id FROM translations WHERE code = ?1 ORDER BY id LIMIT 1",
            params![translation_code],
            |r| r.get(0),
        )
        .ok();
    let Some(translation_id) = translation_id else {
        return Ok(0);
    };
    if !path.exists() {
        return Ok(0);
    }

    let book_lookup = load_book_lookup(conn)?;

    let text = std::fs::read_to_string(path)?;
    let doc = roxmltree::Document::parse(&text)?;

    let mut book = String::new();
    let mut chapter = 0i64;
    let mut verse = 0i64;
    let mut raw = Vec::new();
    walk_osis(doc.root(), &mut book, &mut chapter, &mut verse, &mut raw);

    let tx = conn.transaction()?;
    let mut total = 0usize;
    {
        let mut insert = tx.prepare(
            "INSERT INTO footnotes (translation_id, book_id, chapter, verse, sort_order, marker, text, char_offset) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        )?;
        let mut verse_text_stmt = tx.prepare(
            "SELECT text FROM verses WHERE translation_id = ?1 AND book_id = ?2 AND chapter = ?3 AND verse = ?4",
        )?;
        let mut marker_index: HashMap<(i64, i64, i64), usize> = HashMap::new();

        // Notes for the same verse are always consecutive in document order, so a
        // simple "current verse" cache plus a forward-moving cursor is enough to
        // resolve them left-to-right without re-querying per note.
        let mut current_key: Option<(i64, i64, i64)> = None;
        let mut current_text: Option<String> = None;
        let mut current_text_lower = String::new();
        let mut cursor = 0usize;

        for note in raw {
            let Some(&book_id) = book_lookup.get(note.book.as_str()) else { continue };
            let key = (book_id, note.chapter, note.verse);
            if current_key != Some(key) {
                current_text = verse_text_stmt
                    .query_row(params![translation_id, book_id, note.chapter, note.verse], |r| r.get(0))
                    .optional()?;
                current_text_lower = current_text.as_deref().map(|t| t.to_lowercase()).unwrap_or_default();
                cursor = 0;
                current_key = Some(key);
            }

            let char_offset = current_text.as_ref().map(|t| {
                let offset = locate_catchword(&current_text_lower, &note.catchword, cursor).unwrap_or(t.len());
                cursor = cursor.max(offset);
                offset as i64
            });

            let idx = marker_index.entry(key).or_insert(0);
            let marker = marker_for(*idx);
            *idx += 1;

            insert.execute(params![translation_id, book_id, note.chapter, note.verse, *idx as i64, marker, note.text, char_offset])?;
            total += 1;
        }
    }
    tx.commit()?;
    Ok(total)
}

pub fn import(conn: &mut Connection, dir: &Path, translation_code: &str) -> anyhow::Result<usize> {
    let translation_id: Option<i64> = conn
        .query_row(
            "SELECT id FROM translations WHERE code = ?1 ORDER BY id LIMIT 1",
            params![translation_code],
            |r| r.get(0),
        )
        .ok();
    let Some(translation_id) = translation_id else {
        return Ok(0);
    };

    let book_lookup = load_book_lookup(conn)?;
    let alias_map: HashMap<&str, &str> = USX_BOOK_ALIASES.iter().copied().collect();

    let tx = conn.transaction()?;
    let mut total = 0usize;
    {
        let mut insert = tx.prepare(
            "INSERT INTO footnotes (translation_id, book_id, chapter, verse, sort_order, marker, text, char_offset) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        )?;
        let mut verse_text_stmt = tx.prepare(
            "SELECT text FROM verses WHERE translation_id = ?1 AND book_id = ?2 AND chapter = ?3 AND verse = ?4",
        )?;
        let entries = std::fs::read_dir(dir)?;
        for entry in entries.flatten() {
            let path = entry.path();
            let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else { continue };
            let Some(code) = stem.split('-').nth(1) else { continue };
            let Some(&osis) = alias_map.get(code) else { continue };
            let Some(&book_id) = book_lookup.get(osis) else { continue };
            total += import_book(&path, translation_id, book_id, &mut insert, &mut verse_text_stmt)?;
        }
    }
    tx.commit()?;
    Ok(total)
}
