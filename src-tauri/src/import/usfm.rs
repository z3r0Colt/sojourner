//! USFM translations: one folder per translation, one `.usfm` file per book,
//! and a `source.json` beside them naming the translation and its licence.
//!
//! `tools/fetch-translations.mjs` fills `bibles/usfm/` this way from each
//! publisher's own download. The reader here keeps what the app can show --
//! verse text and footnotes -- and drops what it has no place for: section
//! headings, parallel-passage lines, psalm titles, book titles, and
//! cross-reference notes. Poetry and paragraph markers become a single
//! space, since a verse is stored as one line of text like every other
//! translation's, so search, copy, highlights and read-aloud all work on it
//! unchanged.
//!
//! Footnotes go into the same `footnotes` table the ASV and KJV notes use,
//! anchored where the `\f` stood in the verse. `char_offset` is counted in
//! UTF-16 code units, because that is what the reading pane slices the verse
//! with (`verseTokens.ts`), and these translations are full of curly quotes
//! and dashes that a byte count would put in the wrong place.

use super::{checksum, ImportOutcome, ImportStatus};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Deserialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// The 66 books, by USFM id, in the order of `books.id`.
pub const USFM_BOOKS: &[&str] = &[
    "GEN", "EXO", "LEV", "NUM", "DEU", "JOS", "JDG", "RUT", "1SA", "2SA", "1KI", "2KI", "1CH", "2CH",
    "EZR", "NEH", "EST", "JOB", "PSA", "PRO", "ECC", "SNG", "ISA", "JER", "LAM", "EZK", "DAN", "HOS",
    "JOL", "AMO", "OBA", "JON", "MIC", "NAM", "HAB", "ZEP", "HAG", "ZEC", "MAL", "MAT", "MRK", "LUK",
    "JHN", "ACT", "ROM", "1CO", "2CO", "GAL", "EPH", "PHP", "COL", "1TH", "2TH", "1TI", "2TI", "TIT",
    "PHM", "HEB", "JAS", "1PE", "2PE", "1JN", "2JN", "3JN", "JUD", "REV",
];

pub fn book_id_for_usfm(id: &str) -> Option<i64> {
    let id = id.to_ascii_uppercase();
    USFM_BOOKS.iter().position(|b| *b == id).map(|i| i as i64 + 1)
}

/// `source.json`, as `tools/fetch-translations.mjs` writes it.
#[derive(Debug, Deserialize)]
pub struct SourceMeta {
    pub code: String,
    pub name: String,
    #[serde(default)]
    pub language: Option<String>,
    #[serde(default)]
    pub license: Option<String>,
    #[serde(default)]
    pub credit: Option<String>,
    #[serde(default)]
    pub scope: Option<String>,
    #[serde(default)]
    pub script: Option<String>,
    #[serde(default)]
    pub direction: Option<String>,
    /// False to leave the source's footnotes out (the Vulgate's carry the
    /// whole Glossa Ordinaria).
    #[serde(default)]
    pub footnotes: Option<bool>,
    /// Characters removed from the verse text (editorial brackets).
    #[serde(default)]
    pub strip: Option<String>,
    /// "lxx": the Psalms are numbered as the Septuagint and Vulgate number
    /// them, and are laid out in English numbering on import (see
    /// `remap_lxx_psalms`).
    #[serde(default)]
    pub psalms_numbering: Option<String>,
    /// Passages this edition numbers differently from English Bibles, and
    /// what to do with them.
    #[serde(default)]
    pub adjust: Vec<Adjust>,
}

/// One adjustment: `drop` the verses (or chapters) named, or renumber them
/// -- `shift` their verse numbers, `chapter_shift` their chapters, or move
/// them `to_book` another book (the Septuagint joins Nehemiah to Ezra).
#[derive(Debug, Deserialize)]
pub struct Adjust {
    /// USFM book id.
    pub book: String,
    #[serde(default)]
    pub chapter: Option<i64>,
    #[serde(default)]
    pub chapters: Option<[i64; 2]>,
    #[serde(default)]
    pub verses: Option<[i64; 2]>,
    #[serde(default)]
    pub action: Option<String>,
    #[serde(default)]
    pub shift: Option<i64>,
    #[serde(default)]
    pub chapter_shift: Option<i64>,
    #[serde(default)]
    pub to_book: Option<String>,
}

impl Adjust {
    fn applies(&self, book: &str, v: &ParsedVerse) -> bool {
        self.book.eq_ignore_ascii_case(book)
            && self.chapter.is_none_or(|c| c == v.chapter)
            && self.chapters.is_none_or(|[a, b]| v.chapter >= a && v.chapter <= b)
            && self.verses.is_none_or(|[a, b]| v.verse >= a && v.verse <= b)
    }
}

/// Applies an edition's adjustments to one book. Verses moved to another
/// book come back separately, with that book's USFM id.
fn apply_adjustments(book_id_usfm: &str, verses: Vec<ParsedVerse>, adjust: &[Adjust]) -> (Vec<ParsedVerse>, Vec<(String, ParsedVerse)>) {
    let mut kept = Vec::new();
    let mut moved = Vec::new();
    'verses: for mut v in verses {
        let applicable: Vec<&Adjust> = adjust.iter().filter(|a| a.applies(book_id_usfm, &v)).collect();
        let mut to_book = None;
        for a in applicable {
            if a.action.as_deref() == Some("drop") {
                continue 'verses;
            }
            if let Some(d) = a.shift {
                v.verse += d;
                v.verse_end += d;
            }
            if let Some(d) = a.chapter_shift {
                v.chapter += d;
            }
            if let Some(b) = &a.to_book {
                to_book = Some(b.clone());
            }
        }
        match to_book {
            Some(b) => moved.push((b, v)),
            None => kept.push(v),
        }
    }
    (kept, moved)
}

/// Where each Septuagint (and Vulgate) psalm falls in English numbering:
/// (English psalm, how many of its verses this segment takes, the English
/// verse it starts after, how many English verses it covers). Psalm 9 is
/// English 9 and 10; 113 is 114 and 115; 114 and 115 together are 116;
/// 146 and 147 together are 147. Between them the numbers run one behind.
fn lxx_psalm_segments(c: i64) -> Vec<(i64, Option<usize>, i64, Option<i64>)> {
    match c {
        1..=8 | 148..=150 => vec![(c, None, 0, None)],
        9 => vec![(9, Some(21), 0, None), (10, None, 0, None)],
        10..=112 | 116..=145 => vec![(c + 1, None, 0, None)],
        113 => vec![(114, Some(8), 0, None), (115, None, 0, None)],
        114 => vec![(116, None, 0, Some(9))],
        115 => vec![(116, None, 9, None)],
        146 => vec![(147, None, 0, Some(11))],
        147 => vec![(147, None, 11, None)],
        _ => vec![],
    }
}

/// Lays Septuagint-numbered Psalms out in English numbering. Within a psalm
/// the extra verses these editions have are its title, numbered as a verse
/// of its own; they open the first English verse rather than pushing every
/// verse after them one place on.
fn remap_lxx_psalms(verses: Vec<ParsedVerse>, english_counts: &HashMap<i64, i64>) -> Vec<ParsedVerse> {
    let mut by_chapter: std::collections::BTreeMap<i64, Vec<ParsedVerse>> = std::collections::BTreeMap::new();
    for v in verses {
        by_chapter.entry(v.chapter).or_default().push(v);
    }
    let mut out: Vec<ParsedVerse> = Vec::new();
    for (c, mut vs) in by_chapter {
        vs.sort_by_key(|v| v.verse);
        let mut rest = vs.as_slice();
        for (eng, take, base, span) in lxx_psalm_segments(c) {
            let n = take.unwrap_or(rest.len()).min(rest.len());
            let (seg, after) = rest.split_at(n);
            rest = after;
            let m = span.unwrap_or_else(|| english_counts.get(&eng).copied().unwrap_or(n as i64) - base);
            let offset = (n as i64 - m).max(0);
            for (i, v) in seg.iter().enumerate() {
                let target = base + ((i as i64 + 1) - offset).max(1);
                match out.last_mut().filter(|last| last.chapter == eng && last.verse == target) {
                    Some(last) => {
                        let shift = utf16_len(&last.text) + 1;
                        last.text = format!("{} {}", last.text, v.text);
                        for f in &v.footnotes {
                            last.footnotes.push(ParsedFootnote { text: f.text.clone(), offset: f.offset + shift });
                        }
                    }
                    None => out.push(ParsedVerse { chapter: eng, verse: target, verse_end: target, text: v.text.clone(), footnotes: v.footnotes.clone() }),
                }
            }
        }
    }
    out
}

#[derive(Debug, Clone, PartialEq)]
pub struct ParsedFootnote {
    pub text: String,
    /// UTF-16 offset into the verse's final text.
    pub offset: usize,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ParsedVerse {
    pub chapter: i64,
    pub verse: i64,
    /// The last verse of a combined range (`\v 1-2`), equal to `verse` otherwise.
    pub verse_end: i64,
    pub text: String,
    pub footnotes: Vec<ParsedFootnote>,
}

#[derive(Debug, Default)]
pub struct ParsedBook {
    pub id: String,
    pub verses: Vec<ParsedVerse>,
}

/// Markers whose whole line is apparatus the app does not show: identification,
/// titles, headings, psalm superscriptions, parallel references, acrostic
/// letters, introductions.
fn is_line_dropped(marker: &str) -> bool {
    let base = marker.trim_end_matches(|c: char| c.is_ascii_digit());
    matches!(
        base,
        "id" | "ide" | "usfm" | "h" | "toc" | "toca" | "mt" | "mte" | "imt" | "imte" | "is" | "ip" | "ipi" | "im"
            | "imi" | "ipq" | "imq" | "ipr" | "iq" | "ib" | "ili" | "iot" | "io" | "iex" | "ie" | "s" | "ms" | "mr"
            | "sr" | "r" | "d" | "sp" | "qa" | "cl" | "cp" | "ca" | "periph" | "rem" | "sts" | "restore" | "lit"
            | "sd"
    )
}

/// Character spans dropped with everything inside them.
fn is_span_dropped(marker: &str) -> bool {
    matches!(marker, "x" | "fig" | "ef" | "ex" | "rq" | "va" | "vp" | "ca" | "fv" | "fdc" | "fm")
}

enum Tok<'a> {
    Text(&'a str),
    /// A marker's name, without the backslash, the `+` nesting prefix or the
    /// closing `*`; `closing` is true for `\name*`.
    Marker { name: &'a str, closing: bool },
}

fn tokenize(src: &str) -> Vec<Tok<'_>> {
    let bytes = src.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    let mut text_start = 0;
    while i < bytes.len() {
        if bytes[i] == b'\\' {
            if text_start < i {
                out.push(Tok::Text(&src[text_start..i]));
            }
            let mut j = i + 1;
            if j < bytes.len() && bytes[j] == b'+' {
                j += 1;
            }
            let name_start = j;
            while j < bytes.len() && (bytes[j].is_ascii_alphanumeric() || bytes[j] == b'-') {
                j += 1;
            }
            let name = &src[name_start..j];
            let closing = j < bytes.len() && bytes[j] == b'*';
            if closing {
                j += 1;
            } else if j < bytes.len() && bytes[j] == b' ' {
                // The one space that ends an opening marker belongs to it.
                j += 1;
            }
            out.push(Tok::Marker { name, closing });
            i = j;
            text_start = j;
        } else {
            i += 1;
        }
    }
    if text_start < bytes.len() {
        out.push(Tok::Text(&src[text_start..]));
    }
    out
}

/// Collapses runs of whitespace to one space and trims the start.
fn collapse(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut space = false;
    for c in s.chars() {
        if c.is_whitespace() {
            space = !out.is_empty();
        } else {
            if space {
                out.push(' ');
                space = false;
            }
            out.push(c);
        }
    }
    out
}

fn utf16_len(s: &str) -> usize {
    s.encode_utf16().count()
}

/// Leading number of `\v 12`, `\v 12a`, `\v 12-13`, returning (start, end).
fn parse_verse_number(s: &str) -> Option<(i64, i64)> {
    let s = s.trim();
    let start: String = s.chars().take_while(|c| c.is_ascii_digit()).collect();
    let start: i64 = start.parse().ok()?;
    let rest = &s[s.find(|c: char| !c.is_ascii_digit()).unwrap_or(s.len())..];
    let rest = rest.trim_start_matches(|c: char| c.is_ascii_alphabetic());
    let end = rest
        .strip_prefix('-')
        .and_then(|r| r.chars().take_while(|c| c.is_ascii_digit()).collect::<String>().parse().ok())
        .filter(|&e: &i64| e >= start)
        .unwrap_or(start);
    Some((start, end))
}

struct VerseBuilder {
    chapter: i64,
    verse: i64,
    verse_end: i64,
    raw: String,
    footnotes: Vec<(String, String)>, // (raw text before the note, note text)
}

impl VerseBuilder {
    fn finish(self) -> Option<ParsedVerse> {
        let text = collapse(&self.raw).trim_end().to_string();
        if text.is_empty() {
            return None;
        }
        let len = utf16_len(&text);
        let footnotes = self
            .footnotes
            .into_iter()
            .filter(|(_, note)| !note.is_empty())
            .map(|(prefix, note)| ParsedFootnote {
                text: note,
                offset: utf16_len(collapse(&prefix).trim_end()).min(len),
            })
            .collect();
        Some(ParsedVerse { chapter: self.chapter, verse: self.verse, verse_end: self.verse_end, text, footnotes })
    }
}

/// Parses one book's USFM.
pub fn parse_book(src: &str) -> ParsedBook {
    let src = src.trim_start_matches('\u{feff}');
    let mut book = ParsedBook::default();
    let toks = tokenize(src);

    let mut chapter: i64 = 0;
    let mut current: Option<VerseBuilder> = None;
    // Text up to the next newline is being dropped (a heading line).
    let mut dropping_line = false;
    // Waiting for the number after `\c` or `\v`.
    let mut awaiting: Option<&str> = None;
    // Inside `\f ... \f*`: the note's text so far, and whether the caller
    // character (`+`, `-`, `*`) is still to be skipped.
    let mut footnote: Option<(String, bool)> = None;
    // Inside `\fr` (the note's own reference), which is dropped.
    let mut in_footnote_ref = false;
    // Depth of a dropped span (`\x ... \x*`).
    let mut dropped_span: Option<&str> = None;
    // Inside `\nd` (the divine name), which is printed in capitals.
    let mut nd_depth = 0;

    for tok in toks {
        match tok {
            Tok::Text(t) => {
                let mut t = t;
                if let Some(kind) = awaiting.take() {
                    let trimmed = t.trim_start();
                    let end = trimmed.find(char::is_whitespace).unwrap_or(trimmed.len());
                    let number = &trimmed[..end];
                    t = &trimmed[end..];
                    match kind {
                        "c" => {
                            if let Some(v) = current.take().and_then(VerseBuilder::finish) {
                                book.verses.push(v);
                            }
                            chapter = number.parse().unwrap_or(chapter);
                        }
                        _ => {
                            if let Some(v) = current.take().and_then(VerseBuilder::finish) {
                                book.verses.push(v);
                            }
                            if let Some((start, end)) = parse_verse_number(number) {
                                current = Some(VerseBuilder {
                                    chapter,
                                    verse: start,
                                    verse_end: end,
                                    raw: String::new(),
                                    footnotes: Vec::new(),
                                });
                            }
                        }
                    }
                }
                if dropping_line {
                    match t.find('\n') {
                        Some(nl) => {
                            dropping_line = false;
                            t = &t[nl + 1..];
                        }
                        None => continue,
                    }
                }
                if dropped_span.is_some() {
                    continue;
                }
                if let Some((note, skip_caller)) = footnote.as_mut() {
                    if in_footnote_ref {
                        continue;
                    }
                    let mut s = t;
                    if *skip_caller {
                        let trimmed = s.trim_start();
                        let mut chars = trimmed.chars();
                        if chars.next().is_some() {
                            s = chars.as_str();
                            *skip_caller = false;
                        }
                    }
                    note.push_str(s);
                    continue;
                }
                if let Some(v) = current.as_mut() {
                    if nd_depth > 0 {
                        v.raw.push_str(&t.to_uppercase());
                    } else {
                        v.raw.push_str(t);
                    }
                }
            }
            Tok::Marker { name, closing } => {
                if closing {
                    if dropped_span == Some(name) {
                        dropped_span = None;
                    } else if name == "f" || name == "fe" {
                        if let Some((note, _)) = footnote.take() {
                            if let Some(v) = current.as_mut() {
                                v.footnotes.push((v.raw.clone(), collapse(&note).trim_end().to_string()));
                            }
                        }
                        in_footnote_ref = false;
                    } else if name == "nd" {
                        nd_depth = (nd_depth - 1).max(0);
                    } else if name == "fr" {
                        in_footnote_ref = false;
                    }
                    continue;
                }
                if dropped_span.is_some() {
                    continue;
                }
                if footnote.is_some() {
                    // Inside a note every marker but `\fr` just changes style.
                    in_footnote_ref = name == "fr" || name == "fv";
                    if !in_footnote_ref {
                        if let Some((note, _)) = footnote.as_mut() {
                            note.push(' ');
                        }
                    }
                    continue;
                }
                match name {
                    "c" => {
                        dropping_line = false;
                        awaiting = Some("c");
                    }
                    "v" => {
                        dropping_line = false;
                        awaiting = Some("v");
                    }
                    "f" | "fe" => footnote = Some((String::new(), true)),
                    "nd" => nd_depth += 1,
                    n if is_span_dropped(n) => dropped_span = Some(n),
                    n if is_line_dropped(n) => {
                        // A heading between verses: the verse before it is
                        // over, so nothing after it on the line belongs to it.
                        dropping_line = true;
                    }
                    _ => {
                        // Paragraph, poetry and character-style markers all
                        // stand for at most a space.
                        if let Some(v) = current.as_mut() {
                            v.raw.push(' ');
                        }
                    }
                }
            }
        }
    }
    if let Some(v) = current.take().and_then(VerseBuilder::finish) {
        book.verses.push(v);
    }
    book.id = src
        .lines()
        .find_map(|l| l.strip_prefix("\\id "))
        .and_then(|rest| rest.split_whitespace().next())
        .unwrap_or("")
        .to_ascii_uppercase();
    book
}

fn marker_for(index: usize) -> String {
    let letters = b"abcdefghijklmnopqrstuvwxyz";
    let ch = letters[index % 26] as char;
    if index < 26 {
        ch.to_string()
    } else {
        format!("{ch}{}", index / 26 + 1)
    }
}

/// Every USFM translation folder under `root` (a folder holding a `source.json`).
pub fn discover(root: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(root) else {
        return out;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() && path.join("source.json").is_file() {
            out.push(path);
        }
    }
    out.sort();
    out
}

fn usfm_files(dir: &Path) -> anyhow::Result<Vec<PathBuf>> {
    let mut files: Vec<PathBuf> = std::fs::read_dir(dir)?
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|e| e.eq_ignore_ascii_case("usfm") || e.eq_ignore_ascii_case("sfm")))
        .collect();
    files.sort();
    Ok(files)
}

/// One checksum over the folder: `source.json` and every book, in name order.
fn folder_checksum(dir: &Path) -> anyhow::Result<String> {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(checksum::file_sha256(&dir.join("source.json"))?);
    for f in usfm_files(dir)? {
        hasher.update(f.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default());
        hasher.update(checksum::file_sha256(&f)?);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

/// Imports (or re-imports, when changed) one translation folder.
pub fn import_dir(dir: &Path, conn: &mut Connection) -> anyhow::Result<ImportOutcome> {
    let meta: SourceMeta = serde_json::from_str(&std::fs::read_to_string(dir.join("source.json"))?)?;
    let source_path = dir.display().to_string();
    let new_checksum = folder_checksum(dir)?;

    let existing: Option<(i64, String)> = conn
        .query_row(
            "SELECT id, checksum FROM translations WHERE source_path = ?1 OR code = ?2",
            params![source_path, meta.code],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    if let Some((_, old)) = &existing {
        if *old == new_checksum {
            return Ok(ImportOutcome { status: ImportStatus::Skipped, detail: Some("unchanged since last import".into()) });
        }
    }

    // English verse counts per psalm, for laying out Septuagint numbering:
    // read from the KJV, which the Zefania pass has imported by now.
    let english_psalms: HashMap<i64, i64> = if meta.psalms_numbering.as_deref() == Some("lxx") {
        let mut stmt = conn.prepare(
            "SELECT v.chapter, COUNT(*) FROM verses v JOIN translations t ON t.id = v.translation_id
             WHERE t.code = 'KJV' AND v.book_id = 19 GROUP BY v.chapter",
        )?;
        let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
        rows.collect::<Result<_, _>>()?
    } else {
        HashMap::new()
    };

    let mut books: Vec<(i64, ParsedBook)> = Vec::new();
    let mut moved: Vec<(String, ParsedVerse)> = Vec::new();
    for f in usfm_files(dir)? {
        let mut parsed = parse_book(&std::fs::read_to_string(&f)?);
        let Some(book_id) = book_id_for_usfm(&parsed.id) else { continue };
        if let Some(chars) = meta.strip.as_deref().filter(|c| !c.is_empty()) {
            for v in &mut parsed.verses {
                // Offsets are recomputed only when notes are kept; with the
                // characters gone a note would sit a little late otherwise.
                v.text = v.text.chars().filter(|c| !chars.contains(*c)).collect::<String>().split_whitespace().collect::<Vec<_>>().join(" ");
            }
        }
        if meta.footnotes == Some(false) {
            for v in &mut parsed.verses {
                v.footnotes.clear();
            }
        }
        let (kept, to_move) = apply_adjustments(&parsed.id, std::mem::take(&mut parsed.verses), &meta.adjust);
        parsed.verses = kept;
        moved.extend(to_move);
        if book_id == 19 && meta.psalms_numbering.as_deref() == Some("lxx") {
            parsed.verses = remap_lxx_psalms(std::mem::take(&mut parsed.verses), &english_psalms);
        }
        books.push((book_id, parsed));
    }
    // Verses an adjustment moved into another book (Nehemiah out of the
    // Septuagint's Ezra) join that book, or become it.
    for (usfm_id, v) in moved {
        let Some(book_id) = book_id_for_usfm(&usfm_id) else { continue };
        match books.iter_mut().find(|(id, _)| *id == book_id) {
            Some((_, b)) => b.verses.push(v),
            None => books.push((book_id, ParsedBook { id: usfm_id.to_ascii_uppercase(), verses: vec![v] })),
        }
    }
    anyhow::ensure!(!books.is_empty(), "no books found in {}", dir.display());

    let is_update = existing.is_some();
    let now = chrono::Utc::now().to_rfc3339();
    let tx = conn.transaction()?;
    let translation_id = if let Some((id, _)) = existing {
        tx.execute("DELETE FROM verses WHERE translation_id = ?1", params![id])?;
        tx.execute("DELETE FROM footnotes WHERE translation_id = ?1", params![id])?;
        tx.execute(
            "UPDATE translations SET code=?1, name=?2, language=?3, source_path=?4, source_format='usfm',
                 imported_at=?5, checksum=?6, license=?7, credit=?8, scope=?9, script=?10, direction=?11
             WHERE id=?12",
            params![
                meta.code,
                meta.name,
                meta.language,
                source_path,
                now,
                new_checksum,
                meta.license,
                meta.credit,
                meta.scope,
                meta.script.as_deref().unwrap_or("latin"),
                meta.direction.as_deref().unwrap_or("ltr"),
                id
            ],
        )?;
        id
    } else {
        tx.execute(
            "INSERT INTO translations (code, name, language, source_path, source_format, imported_at, checksum,
                                       license, credit, scope, script, direction)
             VALUES (?1,?2,?3,?4,'usfm',?5,?6,?7,?8,?9,?10,?11)",
            params![
                meta.code,
                meta.name,
                meta.language,
                source_path,
                now,
                new_checksum,
                meta.license,
                meta.credit,
                meta.scope,
                meta.script.as_deref().unwrap_or("latin"),
                meta.direction.as_deref().unwrap_or("ltr"),
            ],
        )?;
        tx.last_insert_rowid()
    };

    let chapter_counts: HashMap<i64, i64> = {
        let mut stmt = tx.prepare("SELECT id, chapter_count FROM books")?;
        let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
        rows.collect::<Result<_, _>>()?
    };

    let mut verse_count = 0usize;
    let mut footnote_count = 0usize;
    let mut combined = 0usize;
    let mut skipped = 0usize;
    {
        let mut verse_stmt = tx.prepare(
            "INSERT OR IGNORE INTO verses (translation_id, book_id, chapter, verse, text) VALUES (?1,?2,?3,?4,?5)",
        )?;
        let mut note_stmt = tx.prepare(
            "INSERT INTO footnotes (translation_id, book_id, chapter, verse, sort_order, marker, text, char_offset)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        )?;
        for (book_id, book) in &books {
            let max_chapter = chapter_counts.get(book_id).copied().unwrap_or(0);
            let mut marker_index: HashMap<i64, usize> = HashMap::new();
            for v in &book.verses {
                if v.chapter < 1 || v.chapter > max_chapter || v.verse < 1 {
                    skipped += 1;
                    continue;
                }
                if verse_stmt.execute(params![translation_id, book_id, v.chapter, v.verse, v.text])? == 0 {
                    skipped += 1;
                    continue;
                }
                verse_count += 1;
                if v.verse_end > v.verse {
                    combined += 1;
                }
                for (i, f) in v.footnotes.iter().enumerate() {
                    let n = marker_index.entry(v.chapter).or_insert(0);
                    note_stmt.execute(params![
                        translation_id,
                        book_id,
                        v.chapter,
                        v.verse,
                        i as i64,
                        marker_for(*n),
                        f.text,
                        f.offset as i64
                    ])?;
                    *n += 1;
                    footnote_count += 1;
                }
            }
        }
    }
    tx.commit()?;

    let mut detail = format!(
        "{verse_count} verses and {footnote_count} footnotes imported as '{}' from {} book(s)",
        meta.name,
        books.len()
    );
    if combined > 0 {
        detail.push_str(&format!("; {combined} verse(s) carry a combined range (e.g. 1-2) under their first number"));
    }
    if skipped > 0 {
        detail.push_str(&format!("; {skipped} verse(s) skipped (outside the canon's chapters, or duplicated)"));
    }
    Ok(ImportOutcome { status: if is_update { ImportStatus::Updated } else { ImportStatus::Added }, detail: Some(detail) })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verse_text_and_footnote_offsets() {
        let src = "\\id GEN test\n\\c 1\n\\s1 The Creation\n\\r (John 1:1)\n\\m\n\\v 1 In the beginning.\n\\b\n\\pmo\n\\v 3 And God said, “Let there be light,” \\f + \\fr 1:3 \\ft Cited in 2 Corinthians 4:6\\f* and there was light.\n\\b\n\\pmo And there was evening.\\f + \\fr 1:5 \\ft Literally day one\\f*\n\\s2 The Second Day\n";
        let b = parse_book(src);
        assert_eq!(b.id, "GEN");
        assert_eq!(b.verses.len(), 2);
        assert_eq!(b.verses[0].text, "In the beginning.");
        let v = &b.verses[1];
        assert_eq!(v.text, "And God said, “Let there be light,” and there was light. And there was evening.");
        assert_eq!(v.footnotes.len(), 2);
        assert_eq!(v.footnotes[0].text, "Cited in 2 Corinthians 4:6");
        let units: Vec<u16> = v.text.encode_utf16().take(v.footnotes[0].offset).collect();
        assert!(String::from_utf16(&units).unwrap().ends_with("light,”"));
        assert_eq!(v.footnotes[1].offset, utf16_len(&v.text));
    }

    #[test]
    fn poetry_divine_name_and_psalm_titles() {
        let src = "\\id PSA x\n\\c 23\n\\d A Psalm of David.\n\\q1\n\\v 1 The \\nd Lord\\nd* is my shepherd;\n\\q2 I shall not want.\n\\q1\n\\v 2 He makes me lie down \\qs Selah\\qs*\n";
        let b = parse_book(src);
        assert_eq!(b.verses[0].text, "The LORD is my shepherd; I shall not want.");
        assert_eq!(b.verses[1].text, "He makes me lie down Selah");
    }

    #[test]
    fn septuagint_psalms_land_on_english_numbers() {
        let v = |c: i64, n: i64, t: &str| ParsedVerse { chapter: c, verse: n, verse_end: n, text: t.into(), footnotes: vec![] };
        // LXX 22 = English 23; LXX 10 (8 verses, title separate) = English 11 (7).
        let mut src = vec![v(22, 1, "Dominus regit me"), v(22, 2, "in loco")];
        for i in 1..=8 {
            src.push(v(10, i, &format!("x{i}")));
        }
        let counts: HashMap<i64, i64> = [(23, 6), (11, 7)].into_iter().collect();
        let out = remap_lxx_psalms(src, &counts);
        let ps23: Vec<_> = out.iter().filter(|p| p.chapter == 23).map(|p| (p.verse, p.text.as_str())).collect();
        assert_eq!(ps23, vec![(1, "Dominus regit me"), (2, "in loco")]);
        let ps11: Vec<_> = out.iter().filter(|p| p.chapter == 11).map(|p| (p.verse, p.text.as_str())).collect();
        assert_eq!(ps11[0], (1, "x1 x2"));
        assert_eq!(ps11.last().unwrap(), &(7, "x8"));
    }

    #[test]
    fn cross_references_dropped_and_ranges_kept() {
        let src = "\\id MAT x\n\\c 1\n\\v 1-2 Text\\x - \\xo 1:1 \\xt Gen 1:1\\x* here \\f + \\fr 1:1 \\fq word: \\fqa other\\fqa*\\f*\n";
        let b = parse_book(src);
        assert_eq!(b.verses[0].verse, 1);
        assert_eq!(b.verses[0].verse_end, 2);
        assert_eq!(b.verses[0].text, "Text here");
        assert_eq!(b.verses[0].footnotes[0].text, "word: other");
    }
}
