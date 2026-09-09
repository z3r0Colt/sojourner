use super::{checksum, BibleImporter, ImportOutcome, ImportStatus};
use quick_xml::events::Event;
use quick_xml::reader::Reader;
use rusqlite::{params, Connection, OptionalExtension};
use std::io::BufReader;
use std::path::Path;

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
            tx.execute(
                "INSERT INTO translations (code, name, language, source_path, source_format, imported_at, checksum)
                 VALUES (?1,?2,?3,?4,'zefania',?5,?6)",
                params![parsed.code, parsed.name, parsed.language, path.display().to_string(), now, new_checksum],
            )?;
            tx.last_insert_rowid()
        };

        let mut skipped_unknown_book = 0usize;
        let mut skipped_duplicate = 0usize;
        {
            let mut known_book = tx.prepare("SELECT 1 FROM books WHERE id = ?1")?;
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
                if !known_book.exists(params![v.book_id])? {
                    skipped_unknown_book += 1;
                    continue;
                }
                let changed = stmt.execute(params![translation_id, v.book_id, v.chapter, v.verse, v.text])?;
                if changed == 0 {
                    skipped_duplicate += 1;
                }
            }
        }

        tx.commit()?;

        let mut detail = format!("{} verses imported as '{}'", parsed.verses.len() - skipped_unknown_book - skipped_duplicate, parsed.name);
        if skipped_unknown_book > 0 {
            detail.push_str(&format!("; {skipped_unknown_book} verse(s) skipped (outside the 66-book canon, e.g. Apocrypha)"));
        }
        if skipped_duplicate > 0 {
            detail.push_str(&format!("; {skipped_duplicate} duplicate verse tag(s) skipped"));
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

struct ParsedBible {
    code: String,
    name: String,
    language: Option<String>,
    verses: Vec<ParsedVerse>,
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

    let name = if !info_title.unwrap_or("").is_empty() {
        info_title.unwrap().to_string()
    } else if !filename_stem.is_empty() {
        filename_stem.to_string()
    } else {
        biblename_attr.to_string()
    };

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
                            let cleaned = verse_text.split_whitespace().collect::<Vec<_>>().join(" ");
                            verses.push(ParsedVerse {
                                book_id: book,
                                chapter,
                                verse,
                                text: cleaned,
                            });
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
    })
}
