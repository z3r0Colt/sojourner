use super::{checksum, BibleImporter, ImportOutcome, ImportStatus};
use once_cell::sync::Lazy;
use quick_xml::events::Event;
use quick_xml::reader::Reader;
use regex::Regex;
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashMap;
use std::io::BufReader;
use std::path::Path;

/// Some digitizations (so far: Webster's Bible) embed a leading `\C:V\`
/// marker in verse text at exactly the points where that edition's own
/// chapter/verse division diverges from the traditional/KJV reference --
/// e.g. a Psalm superscription counted as its own verse, or Joel's Hebrew
/// 4-chapter division vs. the traditional 3-chapter one. It's ground-truth
/// versification correspondence data the source itself provides; we strip it
/// from the displayed text and record it in `versification_map` instead of
/// leaving it to leak into what readers see.
static VERSIFICATION_MARKER: Lazy<Regex> = Lazy::new(|| Regex::new(r"^\\(\d+):(\d+)\\").unwrap());

pub struct ZefaniaImporter;

impl BibleImporter for ZefaniaImporter {
    fn format_name(&self) -> &'static str {
        "zefania"
    }

    fn detect(&self, sample: &str) -> bool {
        sample.contains("<XMLBIBLE")
    }

    fn import(&self, path: &Path, conn: &mut Connection) -> anyhow::Result<ImportOutcome> {
        let new_checksum = checksum::file_sha256(path)?;
        let existing: Option<(i64, String)> = conn
            .query_row(
                "SELECT id, checksum FROM translations WHERE source_path = ?1",
                params![path.display().to_string()],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?;

        if let Some((_, old_checksum)) = &existing {
            if old_checksum == &new_checksum {
                return Ok(ImportOutcome {
                    status: ImportStatus::Skipped,
                    detail: Some("unchanged since last import".into()),
                });
            }
        }

        let parsed = parse_zefania_file(path)?;
        if parsed.verses.is_empty() {
            return Ok(ImportOutcome {
                status: ImportStatus::Failed,
                detail: Some("no verses found in file".into()),
            });
        }

        let is_update = existing.is_some();
        let tx = conn.transaction()?;
        let now = chrono::Utc::now().to_rfc3339();

        let translation_id: i64 = if let Some((id, _)) = existing {
            tx.execute(
                "UPDATE translations SET code=?1, name=?2, language=?3, source_format='zefania', imported_at=?4, checksum=?5 WHERE id=?6",
                params![parsed.code, parsed.name, parsed.language, now, new_checksum, id],
            )?;
            tx.execute("DELETE FROM verses WHERE translation_id = ?1", params![id])?;
            id
        } else {
            let id = super::new_translation_id(&tx, &parsed.code)?;
            tx.execute(
                "INSERT INTO translations (id, code, name, language, source_path, source_format, imported_at, checksum)
                 VALUES (?7,?1,?2,?3,?4,'zefania',?5,?6)",
                params![parsed.code, parsed.name, parsed.language, path.display().to_string(), now, new_checksum, id],
            )?;
            id
        };

        let mut skipped_unknown_book = 0usize;
        let mut skipped_apocryphal_chapter = 0usize;
        let mut skipped_duplicate = 0usize;
        {
            let mut chapter_counts: HashMap<i64, i64> = HashMap::new();
            let mut canonical_names: HashMap<i64, (String, String)> = HashMap::new();
            {
                let mut stmt = tx.prepare("SELECT id, chapter_count, name, short_name FROM books")?;
                let rows = stmt.query_map([], |r| {
                    Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?))
                })?;
                for row in rows {
                    let (id, count, name, short_name) = row?;
                    chapter_counts.insert(id, count);
                    canonical_names.insert(id, (name, short_name));
                }
            }

            tx.execute("DELETE FROM versification_map WHERE translation_id = ?1", params![translation_id])?;
            tx.execute("DELETE FROM book_aliases WHERE translation_id = ?1", params![translation_id])?;

            // OR IGNORE: some public-domain digitizations (esp. older ones like
            // Tyndale/Wycliffe, retrofitted with modern verse numbers well after
            // the fact) have a rare duplicate verse tag -- don't let one bad tag
            // fail the whole translation, just keep the first occurrence.
            let mut stmt = tx.prepare(
                "INSERT OR IGNORE INTO verses (translation_id, book_id, chapter, verse, text) VALUES (?1,?2,?3,?4,?5)",
            )?;
            for v in &parsed.verses {
                // Some editions (Geneva, Douay-Rheims, Wycliffe) number Apocryphal/
                // Deuterocanonical books beyond the 66-book canon this app supports --
                // skip those verses rather than failing the whole import on the FK.
                let Some(&chapter_count) = chapter_counts.get(&v.book_id) else {
                    skipped_unknown_book += 1;
                    continue;
                };
                // Several Vulgate-based editions (Douay-Rheims, Wycliffe) append
                // deuterocanonical/Apocryphal material as extra chapters past a
                // canonical book's real end (e.g. Daniel 13-14 for Susanna and Bel
                // and the Dragon, an extra 2 Chronicles chapter for the Prayer of
                // Manasseh, or extra Esther chapters for its Greek additions) --
                // skip those the same way whole out-of-canon books are skipped,
                // rather than letting them silently collide with real chapters.
                if v.chapter > chapter_count {
                    skipped_apocryphal_chapter += 1;
                    continue;
                }
                let changed = stmt.execute(params![translation_id, v.book_id, v.chapter, v.verse, v.text])?;
                if changed == 0 {
                    skipped_duplicate += 1;
                }
            }

            let mut vmap_stmt = tx.prepare(
                "INSERT OR IGNORE INTO versification_map (translation_id, book_id, chapter, verse, canonical_chapter, canonical_verse)
                 VALUES (?1,?2,?3,?4,?5,?6)",
            )?;
            for m in &parsed.versification {
                if chapter_counts.get(&m.book_id).is_some_and(|&c| m.chapter <= c) {
                    vmap_stmt.execute(params![
                        translation_id,
                        m.book_id,
                        m.chapter,
                        m.verse,
                        m.canonical_chapter,
                        m.canonical_verse
                    ])?;
                }
            }

            let mut alias_stmt = tx.prepare(
                "INSERT OR IGNORE INTO book_aliases (translation_id, book_id, name, short_name) VALUES (?1,?2,?3,?4)",
            )?;
            for a in &parsed.book_aliases {
                // Only worth recording when the source's own full name actually differs
                // from the canonical one (e.g. a hypothetical Vulgate-named edition's
                // "Josue" for Joshua) -- every BIBLEBOOK tag has a bname/bsname, so
                // without this check we'd insert a row for every book of every
                // translation. Abbreviation-only differences (short_name) aren't checked
                // here: they're just each source's own formatting convention (e.g. "1Sam"
                // vs. our "1Sa"), not a name a reader would ever type or recognize as an
                // "alias" -- the app always displays its own canonical short_name anyway.
                let differs = canonical_names
                    .get(&a.book_id)
                    .is_some_and(|(name, _short_name)| !a.name.eq_ignore_ascii_case(name));
                if differs {
                    alias_stmt.execute(params![translation_id, a.book_id, a.name, a.short_name])?;
                }
            }
        }

        tx.commit()?;

        let mut detail = format!(
            "{} verses imported as '{}'",
            parsed.verses.len() - skipped_unknown_book - skipped_apocryphal_chapter - skipped_duplicate,
            parsed.name
        );
        if skipped_unknown_book > 0 {
            detail.push_str(&format!("; {skipped_unknown_book} verse(s) skipped (outside the 66-book canon, e.g. Apocrypha)"));
        }
        if skipped_apocryphal_chapter > 0 {
            detail.push_str(&format!("; {skipped_apocryphal_chapter} verse(s) skipped (Apocryphal chapters appended past a canonical book's end)"));
        }
        if skipped_duplicate > 0 {
            detail.push_str(&format!("; {skipped_duplicate} duplicate verse tag(s) skipped"));
        }
        if parsed.placeholder_skipped > 0 {
            detail.push_str(&format!(
                "; {} verse(s) skipped (placeholder/corrupted text in the source digitization)",
                parsed.placeholder_skipped
            ));
        }

        Ok(ImportOutcome {
            status: if is_update { ImportStatus::Updated } else { ImportStatus::Added },
            detail: Some(detail),
        })
    }
}

struct ParsedVerse {
    book_id: i64,
    chapter: i64,
    verse: i64,
    text: String,
}

/// A verse's own (chapter, verse) numbering maps to `canonical_chapter`:
/// `canonical_verse` in the traditional/KJV reference scheme -- see
/// `VERSIFICATION_MARKER`.
struct VersificationMarker {
    book_id: i64,
    chapter: i64,
    verse: i64,
    canonical_chapter: i64,
    canonical_verse: i64,
}

/// A book's own name/short-name as this source labels it (e.g. Douay-Rheims'
/// "Josue" for Joshua, "1 Kings" for our "1 Samuel"), captured whenever it
/// differs from the canonical name in `books` -- see `book_aliases`.
struct BookAlias {
    book_id: i64,
    name: String,
    short_name: String,
}

struct ParsedBible {
    code: String,
    name: String,
    language: Option<String>,
    verses: Vec<ParsedVerse>,
    versification: Vec<VersificationMarker>,
    book_aliases: Vec<BookAlias>,
    placeholder_skipped: usize,
}

fn derive_code_and_name(biblename_attr: &str, info_title: Option<&str>, filename_stem: &str) -> (String, String) {
    let hay = info_title.unwrap_or(biblename_attr).to_lowercase();
    let filename_hay = filename_stem.to_lowercase();
    let combined = format!("{hay} {filename_hay}");

    let code = if combined.contains("new american standard") {
        "NASB"
    } else if combined.contains("new king james") {
        "NKJV"
    } else if combined.contains("king james") {
        "KJV"
    } else if combined.contains("american standard") {
        "ASV"
    } else if combined.contains("english standard") {
        "ESV"
    } else if combined.contains("new international") {
        "NIV"
    } else if combined.contains("new living") {
        "NLT"
    } else if combined.contains("young") && combined.contains("literal") {
        "YLT"
    } else if combined.contains("darby") {
        "DBY"
    } else if combined.contains("webster") {
        "WBS"
    } else if combined.contains("world english") {
        "WEB"
    } else if combined.contains("douay") || combined.contains("rheims") {
        "DRA"
    } else if combined.contains("geneva") {
        "GNV"
    } else if combined.contains("tyndale") {
        "TYN"
    } else if combined.contains("wycliffe") || combined.contains("wyclif") {
        "WYC"
    } else {
        ""
    };

    // A title that is only an abbreviation or a single word ("YLT",
    // "Webster") names the translation less well than a file called "Young's
    // Literal Translation (1898)": the file's name, then, when it has more
    // to say.
    let title = info_title.unwrap_or("").trim();
    let bare_title = !title.contains(' ') && filename_stem.trim().contains(' ');
    let name = if !title.is_empty() && !bare_title {
        title.to_string()
    } else if !filename_stem.is_empty() {
        filename_stem.to_string()
    } else {
        biblename_attr.to_string()
    };

    // A slip in a bundled file's own title ("Willam Tyndale Bible").
    let name = name.replace("Willam ", "William ");

    let code = if !code.is_empty() {
        code.to_string()
    } else {
        // fallback: initials of capitalized words in the filename
        let initials: String = filename_stem
            .split(|c: char| !c.is_alphanumeric())
            .filter(|w| !w.is_empty())
            .filter_map(|w| w.chars().next())
            .filter(|c| c.is_alphabetic())
            .collect::<String>()
            .to_uppercase();
        if initials.is_empty() {
            biblename_attr.to_string()
        } else {
            initials
        }
    };

    (code, name)
}

fn unescape_xml(s: &str) -> String {
    s.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
}

fn get_attr(e: &quick_xml::events::BytesStart, name: &str) -> Option<String> {
    e.attributes()
        .flatten()
        .find(|a| a.key.as_ref() == name.as_bytes())
        .map(|a| unescape_xml(&String::from_utf8_lossy(a.value.as_ref())))
}

fn parse_zefania_file(path: &Path) -> anyhow::Result<ParsedBible> {
    let file = std::fs::File::open(path)?;
    let mut reader = Reader::from_reader(BufReader::new(file));
    reader.config_mut().trim_text(false);

    let filename_stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();

    let mut buf = Vec::new();
    let mut verses = Vec::new();
    let mut versification = Vec::new();
    let mut placeholder_skipped = 0usize;
    let mut book_aliases = Vec::new();
    let mut seen_book_aliases: std::collections::HashSet<i64> = std::collections::HashSet::new();

    let mut biblename_attr = String::new();
    let mut language: Option<String> = None;

    let mut current_book: Option<i64> = None;
    let mut current_chapter: Option<i64> = None;
    let mut current_verse: Option<i64> = None;
    let mut verse_text = String::new();

    let mut info_field: Option<String> = None; // which INFORMATION child we're inside
    let mut info_title: Option<String> = None;

    // Some editions (e.g. the Geneva Bible) embed translators' study notes
    // inline inside <VERS>, wrapped in <NOTE> (sometimes itself inside a <DIV>).
    // Depth-tracked so any text nested inside a note is excluded from the
    // verse's own reading text rather than corrupting it.
    let mut note_depth: i32 = 0;

    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Start(e) => {
                let name = e.name();
                let local = String::from_utf8_lossy(name.as_ref()).to_string();
                match local.as_str() {
                    "XMLBIBLE" => {
                        biblename_attr = get_attr(&e, "biblename").unwrap_or_default();
                    }
                    "BIBLEBOOK" => {
                        current_book = get_attr(&e, "bnumber").and_then(|s| s.parse().ok());
                        if let Some(book) = current_book {
                            if seen_book_aliases.insert(book) {
                                let name = get_attr(&e, "bname").unwrap_or_default();
                                let short_name = get_attr(&e, "bsname").unwrap_or_default();
                                if !name.is_empty() {
                                    book_aliases.push(BookAlias { book_id: book, name, short_name });
                                }
                            }
                        }
                    }
                    "CHAPTER" => {
                        current_chapter = get_attr(&e, "cnumber").and_then(|s| s.parse().ok());
                    }
                    "VERS" => {
                        current_verse = get_attr(&e, "vnumber").and_then(|s| s.parse().ok());
                        verse_text.clear();
                    }
                    "NOTE" | "note" => note_depth += 1,
                    "title" | "TITLE" => info_field = Some("title".into()),
                    "language" | "LANGUAGE" => info_field = Some("language".into()),
                    _ => {}
                }
            }
            Event::Text(e) => {
                let bytes = e.into_inner();
                let text = unescape_xml(&String::from_utf8_lossy(bytes.as_ref()));
                if note_depth > 0 {
                    // skip -- inside a translators' note, not the verse's own text
                } else if current_verse.is_some() {
                    verse_text.push_str(&text);
                } else if let Some(field) = &info_field {
                    match field.as_str() {
                        "title" => info_title.get_or_insert_with(String::new).push_str(&text),
                        "language" => language.get_or_insert_with(String::new).push_str(&text),
                        _ => {}
                    }
                }
            }
            Event::CData(e) => {
                let bytes = e.into_inner();
                let text = String::from_utf8_lossy(bytes.as_ref()).to_string();
                if note_depth > 0 {
                    // skip -- inside a translators' note
                } else if current_verse.is_some() {
                    verse_text.push_str(&text);
                }
            }
            Event::End(e) => {
                let name = e.name();
                let local = String::from_utf8_lossy(name.as_ref()).to_string();
                match local.as_str() {
                    "VERS" => {
                        if let (Some(book), Some(chapter), Some(verse)) =
                            (current_book, current_chapter, current_verse)
                        {
                            let mut cleaned = verse_text.split_whitespace().collect::<Vec<_>>().join(" ");
                            if let Some(caps) = VERSIFICATION_MARKER.captures(&cleaned) {
                                let canonical_chapter: i64 = caps[1].parse().unwrap_or(chapter);
                                let canonical_verse: i64 = caps[2].parse().unwrap_or(verse);
                                let marker_len = caps[0].len();
                                cleaned = cleaned[marker_len..].trim_start().to_string();
                                versification.push(VersificationMarker {
                                    book_id: book,
                                    chapter,
                                    verse,
                                    canonical_chapter,
                                    canonical_verse,
                                });
                            }
                            // Some digitizations (see Webster's Bible) use a bare "+" as a
                            // placeholder verse slot -- e.g. a psalm superscription this
                            // digitization has no recovered text for -- which has no
                            // corresponding verse in the traditional/KJV numbering. There's
                            // nothing to show, so drop it rather than displaying "+".
                            //
                            // The bundled Douay-Rheims (1899).xml has a more serious defect:
                            // 245 verses (mostly in Psalms 145-150, whose chapter numbering
                            // in this specific file is itself unreliable -- see the
                            // versification_map doc comment in db/schema.rs) contain the
                            // literal placeholder text "dummy verses inserted by amos" left
                            // over from whatever tool produced this digitization, instead of
                            // real verse text. A handful of the same appear in World English
                            // Bible too. Since this app has no way to recover the real text,
                            // exclude these rather than present fabricated placeholder prose
                            // as Scripture.
                            let is_placeholder = cleaned == "+" || cleaned.to_lowercase().contains("dummy verses inserted by amos");
                            if is_placeholder {
                                placeholder_skipped += 1;
                            } else {
                                verses.push(ParsedVerse {
                                    book_id: book,
                                    chapter,
                                    verse,
                                    text: cleaned,
                                });
                            }
                        }
                        current_verse = None;
                    }
                    "NOTE" | "note" => note_depth = note_depth.saturating_sub(1),
                    "title" | "TITLE" | "language" | "LANGUAGE" => info_field = None,
                    _ => {}
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    let (code, name) = derive_code_and_name(&biblename_attr, info_title.as_deref(), &filename_stem);

    Ok(ParsedBible {
        code,
        name,
        language,
        verses,
        versification,
        book_aliases,
        placeholder_skipped,
    })
}

#[cfg(test)]
mod name_tests {
    use super::derive_code_and_name;

    #[test]
    fn a_bare_title_gives_way_to_the_files_fuller_name() {
        assert_eq!(
            derive_code_and_name("YLT", Some("YLT"), "Young's Literal Translation (1898)"),
            ("YLT".to_string(), "Young's Literal Translation (1898)".to_string())
        );
        assert_eq!(derive_code_and_name("WBS", Some("Webster"), "Webster's Bible (1833)").1, "Webster's Bible (1833)");
        // A real title is kept.
        assert_eq!(derive_code_and_name("DBY", Some("Darby Bible"), "Darby Bible (1890)").1, "Darby Bible");
        assert_eq!(derive_code_and_name("TYN", Some("Willam Tyndale Bible"), "Tyndale Bible").1, "William Tyndale Bible");
    }
}
