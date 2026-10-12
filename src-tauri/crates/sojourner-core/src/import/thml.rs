use super::{checksum, CommentaryImporter, ImportOutcome, ImportStatus};
use once_cell::sync::Lazy;
use regex::Regex;
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashMap;
use std::path::Path;

pub struct ThmlCommentaryImporter;

impl CommentaryImporter for ThmlCommentaryImporter {
    fn format_name(&self) -> &'static str {
        "thml"
    }

    fn detect(&self, sample: &str) -> bool {
        sample.contains("ThML") || sample.contains("<!DOCTYPE ThML")
    }

    fn import(&self, path: &Path, conn: &mut Connection) -> anyhow::Result<ImportOutcome> {
        let new_checksum = checksum::file_sha256(path)?;
        let path_str = path.display().to_string();

        let filename_stem = path
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();
        let source_code = filename_stem
            .trim_end_matches(|c: char| c.is_ascii_digit())
            .to_lowercase();
        let source_code = if source_code.is_empty() { filename_stem.to_lowercase() } else { source_code };

        // Load or create the commentary_sources row for this code.
        let existing_source: Option<(i64, String)> = conn
            .query_row(
                "SELECT id, source_files FROM commentary_sources WHERE code = ?1",
                params![source_code],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?;

        let raw = std::fs::read(path)?;
        let text = String::from_utf8(raw.clone()).unwrap_or_else(|_| String::from_utf8_lossy(&raw).to_string());
        let sanitized = sanitize_thml_xml(&text);

        let doc = roxmltree::Document::parse(&sanitized)
            .map_err(|e| anyhow::anyhow!("XML parse error in {}: {e}", path.display()))?;

        let mut file_checksums: HashMap<String, String> = existing_source
            .as_ref()
            .and_then(|(_, files_json)| serde_json::from_str(files_json).ok())
            .unwrap_or_default();

        if file_checksums.get(&path_str) == Some(&new_checksum) {
            return Ok(ImportOutcome {
                status: ImportStatus::Skipped,
                detail: Some("unchanged since last import".into()),
            });
        }

        let now = chrono::Utc::now().to_rfc3339();
        let tx = conn.transaction()?;

        // A multi-volume work's per-file title is per-VOLUME, not per-SERIES
        // (e.g. calcom01.xml's own title is "Commentary on Genesis - Volume
        // 1", not "Calvin's Commentaries") -- so the series title is only set
        // once, at first creation, and never overwritten by a later volume's
        // file-level title. Known curated sources get a clean display name;
        // anything else falls back to the file's own ThML/DC metadata title.
        let source_id: i64 = if let Some((id, _)) = existing_source {
            tx.execute("UPDATE commentary_sources SET imported_at = ?1 WHERE id = ?2", params![now, id])?;
            if let Some(title) = curated_source_title(&source_code) {
                tx.execute("UPDATE commentary_sources SET title = ?1 WHERE id = ?2", params![title, id])?;
            }
            id
        } else {
            let title = curated_source_title(&source_code)
                .map(|s| s.to_string())
                .or_else(|| find_title(&doc))
                .unwrap_or_else(|| format!("Commentary ({source_code})"));
            tx.execute(
                "INSERT INTO commentary_sources (code, title, author, source_format, source_files, imported_at)
                 VALUES (?1, ?2, NULL, 'thml', '{}', ?3)",
                params![source_code, title, now],
            )?;
            tx.last_insert_rowid()
        };

        // Build normalized-title -> book_id lookup once, plus the reverse
        // book_id -> exact OSIS code lookup used to filter cross-book scripRefs.
        let book_map = load_book_lookup(&tx)?;
        let book_osis_codes = load_book_osis_codes(&tx)?;
        let osis_for = |book_id: i64| book_osis_codes.get(&book_id).cloned().unwrap_or_default();

        // CCEL's `id` attributes are only unique WITHIN a single file, not
        // across the many files that get merged into one multi-volume source
        // (e.g. Calvin's 45 files) -- a coincidental id reused in a later
        // file's index/appendix would otherwise silently overwrite an earlier
        // file's real section via insert_section's delete-by-div2_id upsert.
        // Namespacing every section key by filename makes them collision-proof.
        let ns = |id: &str| format!("{filename_stem}:{id}");

        let mut books_matched = 0usize;
        let mut books_skipped: Vec<String> = Vec::new();
        let mut entries_inserted = 0usize;

        // Per-book div2 section-sort counters, shared across every div1 (and
        // every file, for multi-volume works like Calvin's 45-file commentary)
        // that touches a given book, so chapters keep a stable relative order
        // no matter which file or div1 they were found under.
        let mut section_sort: HashMap<i64, i64> = HashMap::new();
        let mut books_seen: std::collections::HashSet<i64> = std::collections::HashSet::new();

        for div1 in doc
            .descendants()
            .filter(|n| n.is_element() && n.tag_name().name() == "div1")
        {
            let raw_title = div1.attribute("title").unwrap_or("").to_string();
            let div1_id = div1.attribute("id").unwrap_or(&raw_title).to_string();

            if let Some((book_id, chapter, vs, ve)) = chapter_heading_match(&raw_title, &book_map) {
                // A div1 that is itself directly a "Book Chapter[:verse]"
                // heading (CCEL/Calvin-Psalms-style: div1 title="Psalm 2",
                // possibly containing nested div2 verse-subrange headings like
                // "Psalm 2:4-6" that insert_entries_for_section's per-paragraph
                // ancestor lookup will pick up). Checked BEFORE book_only_match:
                // its fuzzy fallback only tests for a book *root word* being
                // present, so it would otherwise also match "Psalm 2" as a
                // whole-book heading and swallow the chapter number.
                ensure_book(&tx, source_id, book_id, &div1_id)?;
                if books_seen.insert(book_id) {
                    books_matched += 1;
                }
                let sort = section_sort.entry(book_id).or_insert(0);
                let this_sort = *sort;
                *sort += 1;
                let title = div1.attribute("title").map(|s| s.to_string());
                let section_id = insert_section(&tx, source_id, book_id, Some(chapter), &ns(&div1_id), title, this_sort)?;
                insert_entries_for_section(&tx, section_id, book_id, &osis_for(book_id), Some(chapter), (vs, ve), div1, &book_map, &mut entries_inserted)?;
            } else if let Some(book_id) = book_only_match(&raw_title, &book_map) {
                // "Book div1" convention (Matthew Henry: div1 title is the bare
                // book name; Barnes/JFB-style: div1 title is the traditional
                // prose heading, e.g. "THE GOSPEL ACCORDING TO MATTHEW"). Every
                // div2 child is one chapter.
                ensure_book(&tx, source_id, book_id, &div1_id)?;
                if books_seen.insert(book_id) {
                    books_matched += 1;
                }
                process_book_chapters(
                    &tx, source_id, book_id, &div1_id, div1, "div2", &book_map, &book_osis_codes,
                    &filename_stem, &mut section_sort, &mut entries_inserted,
                )?;
            } else {
                // Not a book heading itself (front matter, or a bare wrapper --
                // Calvin's "Chapter N" wrappers, or CCEL/JFB's "The Old
                // Testament"/"The New Testament" top-level divs, which nest an
                // entire extra div level: div1 "The Old Testament" > div2
                // "Genesis" (a book) > div3 "Chapter 1"). Check both: whether
                // any direct div2 child independently names a "Book
                // Chapter[:verse]" span (Calvin-style), or whether it's itself a
                // bare book name with div3 chapter children (JFB-style).
                let mut any_matched = false;
                for div2 in div1.children().filter(|n| n.is_element() && n.tag_name().name() == "div2") {
                    let section_title = div2.attribute("title").unwrap_or("").to_string();
                    if let Some((book_id, chapter, vs, ve)) = chapter_heading_match(&section_title, &book_map) {
                        any_matched = true;
                        ensure_book(&tx, source_id, book_id, &div1_id)?;
                        if books_seen.insert(book_id) {
                            books_matched += 1;
                        }
                        let div2_id = div2.attribute("id").map(|s| s.to_string()).unwrap_or_else(|| format!("{div1_id}.{section_title}"));
                        let sort = section_sort.entry(book_id).or_insert(0);
                        let this_sort = *sort;
                        *sort += 1;

                        let section_id = insert_section(&tx, source_id, book_id, Some(chapter), &ns(&div2_id), Some(section_title), this_sort)?;
                        insert_entries_for_section(&tx, section_id, book_id, &osis_for(book_id), Some(chapter), (vs, ve), div2, &book_map, &mut entries_inserted)?;
                    } else if let Some(book_id) = book_only_match(&section_title, &book_map) {
                        any_matched = true;
                        let div2_id = div2.attribute("id").unwrap_or(&section_title).to_string();
                        ensure_book(&tx, source_id, book_id, &div2_id)?;
                        if books_seen.insert(book_id) {
                            books_matched += 1;
                        }
                        process_book_chapters(
                            &tx, source_id, book_id, &div2_id, div2, "div3", &book_map, &book_osis_codes,
                            &filename_stem, &mut section_sort, &mut entries_inserted,
                        )?;
                    }
                }
                if !any_matched && !raw_title.is_empty() {
                    books_skipped.push(raw_title);
                }
            }
        }

        file_checksums.insert(path_str.clone(), new_checksum);
        let files_json = serde_json::to_string(&file_checksums)?;
        tx.execute(
            "UPDATE commentary_sources SET source_files = ?1 WHERE id = ?2",
            params![files_json, source_id],
        )?;

        tx.commit()?;

        let mut detail = format!(
            "{entries_inserted} paragraphs across {books_matched} book(s) imported from '{source_code}'"
        );
        if !books_skipped.is_empty() {
            detail.push_str(&format!(
                "; skipped non-book sections: {}",
                books_skipped.join(", ")
            ));
        }

        Ok(ImportOutcome {
            status: ImportStatus::Added,
            detail: Some(detail),
        })
    }
}

/// Display names for commentary sources this app deliberately curates, keyed
/// by the source_code derived from their filenames (see `import()` --
/// trailing digits stripped, e.g. "calcom01.xml" -> "calcom"). A multi-volume
/// work's own per-file title/DC.Title is per-VOLUME ("Commentary on Genesis -
/// Volume 1"), not a usable series name, so those are overridden here rather
/// than trusted. Anything not listed falls back to the file's own metadata --
/// a drop-in commentary the user adds later still gets a reasonable name.
fn curated_source_title(source_code: &str) -> Option<&'static str> {
    match source_code {
        // CCEL's mhc1-6 are the complete Commentary on the Whole Bible (Romans
        // to Revelation finished by his fellow ministers after his death), not
        // the one-volume Concise abridgment.
        "mhc" => Some("Matthew Henry's Commentary on the Whole Bible"),
        "calcom" => Some("Calvin's Commentaries"),
        "ntnotes" => Some("Barnes' Notes on the New Testament"),
        "jfb" => Some("Jamieson, Fausset & Brown Commentary"),
        _ => None,
    }
}

/// Prefers the ThML head's Dublin Core `<DC.Title>` (the work's cataloged
/// title; `sub="Main"` preferred over e.g. `sub="Alternative"`), falling back
/// to the first plain `<title>` element found anywhere in the document.
fn find_title(doc: &roxmltree::Document) -> Option<String> {
    let dc_titles: Vec<_> = doc
        .descendants()
        .filter(|n| n.is_element() && n.tag_name().name() == "DC.Title")
        .collect();
    let dc_title = dc_titles
        .iter()
        .find(|n| n.attribute("sub").is_none_or(|s| s.eq_ignore_ascii_case("main")))
        .or_else(|| dc_titles.first())
        .and_then(|n| n.text())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    dc_title.or_else(|| {
        doc.descendants()
            .find(|n| n.is_element() && n.tag_name().name() == "title")
            .and_then(|n| n.text())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
    })
}

pub(crate) fn load_book_lookup(conn: &Connection) -> anyhow::Result<HashMap<String, i64>> {
    let mut stmt = conn.prepare("SELECT id, name, short_name, osis_code FROM books")?;
    let rows = stmt.query_map([], |r| {
        Ok((
            r.get::<_, i64>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, String>(2)?,
            r.get::<_, String>(3)?,
        ))
    })?;
    let mut map = HashMap::new();
    for row in rows {
        let (id, name, short_name, osis_code) = row?;
        map.insert(normalize_book_title(&name), id);
        map.insert(normalize_book_title(&short_name), id);
        map.insert(normalize_book_title(&osis_code), id);
    }
    // A few CCEL-specific aliases beyond the ordinal-prefix normalization below.
    let aliases: &[(&str, &str)] = &[
        ("canticles", "song of solomon"),
        ("song of songs", "song of solomon"),
        ("apocalypse", "revelation"),
        ("psalm", "psalms"),
        ("qoheleth", "ecclesiastes"),
        ("acts of the apostles", "acts"),
    ];
    let by_name: HashMap<String, i64> = map.clone();
    for (alias, target) in aliases {
        if let Some(&id) = by_name.get(&normalize_book_title(target)) {
            map.insert(normalize_book_title(alias), id);
        }
    }
    Ok(map)
}

/// book_id -> the book's exact (case-sensitive) OSIS code, as used verbatim in
/// scripRef's `parsed`/`osisRef` attributes -- e.g. "Gen", "1Cor". Used to
/// filter out cross-references to OTHER books that happen to appear in a
/// paragraph (see `collect_verse_refs`).
pub(crate) fn load_book_osis_codes(conn: &Connection) -> anyhow::Result<HashMap<i64, String>> {
    let mut stmt = conn.prepare("SELECT id, osis_code FROM books")?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))?;
    let mut map = HashMap::new();
    for row in rows {
        let (id, osis_code) = row?;
        map.insert(id, osis_code);
    }
    Ok(map)
}

pub(crate) fn normalize_book_title(s: &str) -> String {
    let lower = s.trim().to_lowercase();
    let lower = if let Some(rest) = lower.strip_prefix("first ") {
        format!("1 {rest}")
    } else if let Some(rest) = lower.strip_prefix("second ") {
        format!("2 {rest}")
    } else if let Some(rest) = lower.strip_prefix("third ") {
        format!("3 {rest}")
    } else if let Some(rest) = lower.strip_prefix("iii ") {
        format!("3 {rest}")
    } else if let Some(rest) = lower.strip_prefix("ii ") {
        format!("2 {rest}")
    } else if let Some(rest) = lower.strip_prefix("i ") {
        format!("1 {rest}")
    } else {
        lower
    };
    let cleaned: String = lower
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect();
    cleaned.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Resolves a div's title to a book_id when the title is (a) an exact book
/// name (Matthew Henry: div1 title="Genesis") or (b) a traditional prose
/// heading naming the book (Barnes/JFB-style div1 title="THE GOSPEL ACCORDING
/// TO MATTHEW"). Does not consider chapter/verse suffixes -- see
/// `chapter_heading_match` for that.
fn book_only_match(title: &str, book_map: &HashMap<String, i64>) -> Option<i64> {
    let title = title.trim();
    if title.is_empty() {
        return None;
    }
    book_map
        .get(&normalize_book_title(title))
        .copied()
        .or_else(|| traditional_heading_book(title, book_map))
}

/// Last-resort match for traditional KJV-style book headings that don't
/// reduce to a plain book name (e.g. "THE FIRST EPISTLE OF PAUL THE APOSTLE
/// TO THE CORINTHIANS", "REVELATION OF ST. JOHN THE DIVINE"). Looks for a
/// recognizable book "root" word, disambiguating multi-book roots (Samuel,
/// Kings, Chronicles, Corinthians, Thessalonians, Timothy, Peter, John) via
/// an ordinal word (first/second/third) found anywhere in the title.
fn traditional_heading_book(raw_title: &str, book_map: &HashMap<String, i64>) -> Option<i64> {
    let norm = normalize_book_title(raw_title);
    let words: std::collections::HashSet<&str> = norm.split_whitespace().collect();

    // Single-candidate roots -- safe to match unconditionally. Checked before
    // "john" so "REVELATION OF ST. JOHN THE DIVINE" resolves to Revelation.
    const UNAMBIGUOUS: &[(&str, &str)] = &[
        ("genesis", "genesis"), ("exodus", "exodus"), ("leviticus", "leviticus"),
        ("numbers", "numbers"), ("deuteronomy", "deuteronomy"), ("joshua", "joshua"),
        ("judges", "judges"), ("ruth", "ruth"), ("ezra", "ezra"), ("nehemiah", "nehemiah"),
        ("esther", "esther"), ("job", "job"), ("psalms", "psalms"), ("psalm", "psalms"),
        ("proverbs", "proverbs"), ("ecclesiastes", "ecclesiastes"), ("preacher", "ecclesiastes"),
        ("canticles", "song of solomon"), ("isaiah", "isaiah"), ("jeremiah", "jeremiah"),
        ("lamentations", "lamentations"), ("ezekiel", "ezekiel"), ("daniel", "daniel"),
        ("hosea", "hosea"), ("joel", "joel"), ("amos", "amos"), ("obadiah", "obadiah"),
        ("jonah", "jonah"), ("micah", "micah"), ("nahum", "nahum"), ("habakkuk", "habakkuk"),
        ("zephaniah", "zephaniah"), ("haggai", "haggai"), ("zechariah", "zechariah"),
        ("malachi", "malachi"), ("matthew", "matthew"), ("mark", "mark"), ("luke", "luke"),
        ("romans", "romans"), ("galatians", "galatians"), ("ephesians", "ephesians"),
        ("philippians", "philippians"), ("colossians", "colossians"), ("titus", "titus"),
        ("philemon", "philemon"), ("hebrews", "hebrews"), ("james", "james"), ("jude", "jude"),
        ("revelation", "revelation"), ("apocalypse", "revelation"), ("acts", "acts"),
    ];
    for (root, canonical) in UNAMBIGUOUS {
        if words.contains(root) {
            if let Some(&id) = book_map.get(&normalize_book_title(canonical)) {
                return Some(id);
            }
        }
    }

    // Check both the spelled-out word and the bare digit: normalize_book_title
    // already rewrites a LEADING "first/second/third " into "1/2/3 " (for its
    // own exact-match use case), which silently eats the word before it ever
    // reaches this word-set when the ordinal starts the title (e.g. Barnes'
    // "SECOND EPISTLE OF JOHN", which has no leading "THE" to protect it).
    let ordinal = if words.contains("first") || words.contains("1") {
        Some("1")
    } else if words.contains("second") || words.contains("2") {
        Some("2")
    } else if words.contains("third") || words.contains("3") {
        Some("3")
    } else {
        None
    };
    if let Some(ord) = ordinal {
        const ORDINAL_ROOTS: &[&str] = &["samuel", "kings", "chronicles", "corinthians", "thessalonians", "timothy", "peter", "john"];
        for root in ORDINAL_ROOTS {
            if words.contains(root) {
                let canonical = format!("{ord} {root}");
                if let Some(&id) = book_map.get(&normalize_book_title(&canonical)) {
                    return Some(id);
                }
            }
        }
    }

    // Bare "john" with no ordinal and no Revelation match above is the Gospel.
    if words.contains("john") {
        if let Some(&id) = book_map.get(&normalize_book_title("john")) {
            return Some(id);
        }
    }

    None
}

static CHAPTER_VERSE_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)^(.+?)\s+(\d{1,3})(?::\s*(\d{1,3})(?:\s*-\s*(\d{1,3}))?)?\s*$").unwrap());

/// Matches a title of the form "Book Chapter[:VerseStart[-VerseEnd]]" (e.g.
/// CCEL/Calvin's div2 title "Genesis 1:1-31", or CCEL/Barnes' div2 title
/// "Matthew 1"), requiring the prefix to be an exact book name match (no
/// fuzzy heading matching here, to avoid false positives on ordinary text
/// that happens to end in a number).
fn chapter_heading_match(title: &str, book_map: &HashMap<String, i64>) -> Option<(i64, i64, Option<i64>, Option<i64>)> {
    let caps = CHAPTER_VERSE_RE.captures(title.trim())?;
    let prefix = caps.get(1)?.as_str();
    let book_id = *book_map.get(&normalize_book_title(prefix))?;
    let chapter: i64 = caps.get(2)?.as_str().parse().ok()?;
    let verse_start: Option<i64> = caps.get(3).and_then(|m| m.as_str().parse().ok());
    let verse_end = caps.get(4).and_then(|m| m.as_str().parse().ok()).or(verse_start);
    Some((book_id, chapter, verse_start, verse_end))
}

/// Processes every `chapter_tag` child of `book_div` (a div already known to
/// represent one whole book) as one chapter -- shared by the two places a
/// book can appear: directly as a div1 (Matthew Henry, Barnes-style), or one
/// level deeper as a div2 nested inside a bare "The Old Testament"/"The New
/// Testament" div1 wrapper (JFB-style, where chapters are then div3s).
#[allow(clippy::too_many_arguments)]
fn process_book_chapters(
    tx: &Connection,
    source_id: i64,
    book_id: i64,
    book_div_id: &str,
    book_div: roxmltree::Node,
    chapter_tag: &str,
    book_map: &HashMap<String, i64>,
    book_osis_codes: &HashMap<i64, String>,
    filename_stem: &str,
    section_sort: &mut HashMap<i64, i64>,
    entries_inserted: &mut usize,
) -> anyhow::Result<()> {
    let book_osis = book_osis_codes.get(&book_id).cloned().unwrap_or_default();
    let mut chapter_counter = 0i64;
    for chapter_div in book_div.children().filter(|n| n.is_element() && n.tag_name().name() == chapter_tag) {
        let section_title = chapter_div.attribute("title").map(|s| s.to_string());
        let (chapter, default_vs, default_ve) = match section_title.as_deref().and_then(|t| chapter_heading_match(t, book_map)) {
            Some((_, ch, vs, ve)) => (Some(ch), vs, ve),
            None => {
                let is_intro = section_title.as_deref().map(|t| t.to_lowercase().contains("introduction")).unwrap_or(false);
                if is_intro {
                    (None, None, None)
                } else {
                    chapter_counter += 1;
                    (Some(chapter_counter), None, None)
                }
            }
        };
        let chapter_div_id = chapter_div.attribute("id").map(|s| s.to_string()).unwrap_or_else(|| {
            let n = section_sort.entry(book_id).or_insert(0);
            format!("{book_div_id}.{n}")
        });
        let sort = section_sort.entry(book_id).or_insert(0);
        let this_sort = *sort;
        *sort += 1;

        let ns_id = format!("{filename_stem}:{chapter_div_id}");
        let section_id = insert_section(tx, source_id, book_id, chapter, &ns_id, section_title, this_sort)?;
        insert_entries_for_section(tx, section_id, book_id, &book_osis, chapter, (default_vs, default_ve), chapter_div, book_map, entries_inserted)?;
    }
    Ok(())
}

fn ensure_book(tx: &Connection, source_id: i64, book_id: i64, div1_id: &str) -> anyhow::Result<()> {
    tx.execute(
        "INSERT INTO commentary_books (commentary_source_id, book_id, div1_id) VALUES (?1,?2,?3)
         ON CONFLICT(commentary_source_id, book_id) DO UPDATE SET div1_id = excluded.div1_id",
        params![source_id, book_id, div1_id],
    )?;
    Ok(())
}

/// Deletes any existing section with this div2_id (cascading to its entries)
/// and inserts it fresh, so re-importing the same file is idempotent without
/// needing to wipe an entire book's sections up front -- important for works
/// like Calvin's commentaries where a single book is split across many files.
fn insert_section(
    tx: &Connection,
    source_id: i64,
    book_id: i64,
    chapter: Option<i64>,
    div2_id: &str,
    title: Option<String>,
    sort_order: i64,
) -> anyhow::Result<i64> {
    tx.execute(
        "DELETE FROM commentary_sections WHERE commentary_source_id = ?1 AND book_id = ?2 AND div2_id = ?3",
        params![source_id, book_id, div2_id],
    )?;
    tx.execute(
        "INSERT INTO commentary_sections (commentary_source_id, book_id, chapter, div2_id, title, sort_order)
         VALUES (?1,?2,?3,?4,?5,?6)",
        params![source_id, book_id, chapter, div2_id, title, sort_order],
    )?;
    Ok(tx.last_insert_rowid())
}

/// Walks up from a paragraph looking for an enclosing `div2`/`div3` whose
/// title itself names a "Book Chapter[:Verse]" span for THIS SAME book
/// (CCEL/Barnes-style: a `div3 title="Matthew 1:1"` wraps each verse's
/// commentary as a paragraph group, with no per-paragraph scripRef at all).
/// Requires an exact book match (not just any parseable heading) because
/// Calvin's "Harmony" volumes nest parallel-passage sub-sections from OTHER
/// books (e.g. a div3 "Deuteronomy 1:9-18" quoted inside an "Exodus 18"
/// section) -- trusting those blindly would relabel Exodus paragraphs with
/// Deuteronomy's chapter/verse while leaving them filed under Exodus's
/// book_id. Stops at the nearest div1 so a match never crosses book div1
/// boundaries either.
fn ancestor_chapter_verse(p: roxmltree::Node, book_id: i64, book_osis: &str, book_map: &HashMap<String, i64>) -> Option<(i64, Option<i64>, Option<i64>)> {
    let mut node = p.parent();
    while let Some(n) = node {
        if n.is_element() {
            let tag = n.tag_name().name();
            // Matthew Henry (and Calvin) wrap each passage's exposition in
            // `<div class="Commentary" id="Bible:Rom.8.29-Rom.8.30">`, so a
            // paragraph that cites no verse of its own ("1. The character of
            // the saints...") still belongs to the passage it expounds.
            if tag == "div" {
                if let Some(id) = n.attribute("id").filter(|id| id.starts_with("Bible:")) {
                    if let Some((_, ch, vs, ve)) = parse_osis_ref(id).into_iter().find(|r| r.0 == book_osis) {
                        // A range running into the next chapter ends past
                        // this one; keep it to this chapter's opening verse.
                        return Some((ch, Some(vs), Some(ve.max(vs))));
                    }
                }
            }
            if matches!(tag, "div2" | "div3") {
                if let Some(title) = n.attribute("title") {
                    if let Some((ref_book_id, chapter, vs, ve)) = chapter_heading_match(title, book_map) {
                        if ref_book_id == book_id {
                            return Some((chapter, vs, ve));
                        }
                    }
                }
            }
            if tag == "div1" {
                break;
            }
        }
        node = n.parent();
    }
    None
}

/// One entry's worth of source text: nearly always a single `<p>`, but Barnes
/// sets indented matter -- a quoted hymn, a long citation, the lettered heads
/// of a chapter's introduction -- as one `<p class="t8">` per printed LINE.
/// Kept apart, each line became an entry of its own ("Ro 8:31-33.", "is
/// shown, and assurance is given to the believer of his final"), so the lines
/// of one such block are gathered back into one entry (see [`Block::stored`]
/// for how they are joined).
struct Block<'a, 'input> {
    paras: Vec<roxmltree::Node<'a, 'input>>,
    /// Each printed line's HTML and plain text.
    lines: Vec<(String, String)>,
    /// The lines' text, one to a line: what the verse walk reads.
    plain: String,
}

impl Block<'_, '_> {
    /// The entry's HTML and plain text as stored. A hymn keeps its lines, a
    /// break apiece. Prose that was only set line by line -- a long quotation,
    /// the heads of an introduction -- flows again as one paragraph: kept as
    /// printed it stood as a ragged column a third of the pane wide, breaking
    /// mid-sentence ("... is in itself so strong<br/>that nothing can
    /// separate him"). What tells them apart is how the lines begin. A verse
    /// of a hymn starts every line with a capital; wrapped prose carries on
    /// in lower case somewhere ("that nothing", "these considerations").
    fn stored(&self) -> (String, String) {
        // A reference set on a line of its own ("(b) Christ, in dying ...
        // for Christians," / "Ro 8:34.") ends a sentence of prose too.
        static REFERENCE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^(?:[1-3]\s?)?[A-Z][a-z]{0,4}\.?\s\d{1,3}:\d").unwrap());
        let prose = self.lines.iter().skip(1).any(|(_, plain)| {
            let head = plain.trim_start_matches(|c: char| !c.is_alphanumeric());
            head.starts_with(|c: char| c.is_lowercase()) || REFERENCE.is_match(head)
        });
        let mut html = String::new();
        let mut plain = String::new();
        for (i, (line_html, line_plain)) in self.lines.iter().enumerate() {
            if i > 0 {
                // A word the printer split at the line's end ("re-" /
                // "versed") closes up after its hyphen; any other line runs on
                // after a space.
                let split_word = plain.ends_with('-') && plain[..plain.len() - 1].ends_with(|c: char| c.is_alphabetic());
                if !prose {
                    html.push_str("<br/>");
                    plain.push('\n');
                } else if !split_word {
                    html.push(' ');
                    plain.push(' ');
                }
            }
            // (The first line's HTML as rendered, as it always was stored.)
            html.push_str(if i == 0 { line_html } else { line_html.trim() });
            plain.push_str(line_plain.trim());
        }
        (html, plain)
    }

    /// Carries `next` on at the end of this block's last line, after a space.
    fn run_on(&mut self, next: Block<'_, '_>) {
        let mut rest = next.lines.into_iter();
        if let (Some(last), Some((html, plain))) = (self.lines.last_mut(), rest.next()) {
            last.0 = format!("{} {}", last.0.trim_end(), html.trim_start());
            last.1 = format!("{} {}", last.1.trim_end(), plain.trim_start());
        }
        self.lines.extend(rest);
        self.plain = self.lines.iter().map(|(_, p)| p.as_str()).collect::<Vec<_>>().join("\n");
    }
}

/// The paragraphs under `container` as entries: empty ones and heading stubs
/// dropped, the printed lines of one block joined (see [`Block`]), and two
/// kinds of paragraph that only finish the one before carried on into it:
///
/// * Barnes' footnotes print a key and the verse's words on one line and,
///   often, the references on the next: `{z} "hate you",` then `Joh 17:14`.
///   Apart, the references were a card of their own that said nothing.
/// * A note's opening set on a line of its own -- "Verses 2-9." -- with the
///   note in the next paragraph ("See Barnes on "Mt 10:26"."), in the same
///   verse's div.
fn collect_blocks<'a, 'input>(container: roxmltree::Node<'a, 'input>, book_map: &HashMap<String, i64>) -> Vec<Block<'a, 'input>> {
    let mut blocks: Vec<Block> = Vec::new();
    // The last paragraph, while it is a printed line the next may carry on.
    let mut open_line: Option<roxmltree::Node> = None;
    for p in container
        .descendants()
        .filter(|n| n.is_element() && n.tag_name().name() == "p" && !inside_note(*n))
    {
        let mut html = String::new();
        let mut plain = String::new();
        let mut notes = Vec::new();
        render_node(p, &mut html, &mut plain, &mut notes);
        let text = plain.trim();
        if text.is_empty() || is_rule(text) {
            // A blank paragraph is how the source separates one block of
            // lines from the next; a line of "=====" or dashes, drawn above
            // and below a heading, separates as well and says nothing.
            open_line = None;
            continue;
        }
        append_editor_notes(&mut html, &notes);
        let line = (html, text.to_string());
        let continues = open_line.is_some_and(|prev| is_printed_line(p) && follows_directly(prev, p));
        match blocks.last_mut() {
            Some(block) if continues => {
                block.paras.push(p);
                block.lines.push(line);
                block.plain.push('\n');
                block.plain.push_str(text);
            }
            _ => blocks.push(Block { paras: vec![p], lines: vec![line], plain: text.to_string() }),
        }
        open_line = is_printed_line(p).then_some(p);
    }
    blocks.retain(|b| !is_heading_stub(&b.plain, book_map));

    let mut joined: Vec<Block> = Vec::with_capacity(blocks.len());
    for block in blocks {
        let carries_on = joined.last().is_some_and(|prev| {
            let footnote_refs = prev.plain.lines().last().is_some_and(is_footnote_key) && is_references_only(&block);
            let opening_alone = is_bare_verse_marker(&prev.plain) && verse_div(prev.paras[0]) == verse_div(block.paras[0]);
            footnote_refs || opening_alone
        });
        match joined.last_mut() {
            Some(prev) if carries_on => {
                prev.paras.extend(block.paras.iter().copied());
                prev.run_on(block);
            }
            _ => joined.push(block),
        }
    }
    joined
}

/// `{z} "hate you",`, `{1} "vanished"`, `{*} "meat"`: a line of Barnes'
/// footnotes, keyed by a letter, number or star in braces.
fn is_footnote_key(line: &str) -> bool {
    static KEY: Lazy<Regex> = Lazy::new(|| Regex::new(r"^\{[^}\s]{1,3}\}").unwrap());
    KEY.is_match(line.trim_start())
}

/// A paragraph that is nothing but Scripture references: "Joh 17:14",
/// "Mt 3:10; Joh 15:2,6", "1 Jo 5:14,15." -- scripRefs with only punctuation
/// and verse numbers between them.
fn is_references_only(block: &Block) -> bool {
    let mut refs = 0;
    let only_refs = block.paras.iter().all(|p| {
        p.children().all(|n| {
            if n.is_element() && n.tag_name().name() == "scripRef" {
                refs += 1;
                true
            } else if n.is_text() {
                n.text().unwrap_or("").chars().all(|c| c.is_whitespace() || c.is_ascii_digit() || ";,.:-\"'".contains(c))
            } else {
                false
            }
        })
    });
    only_refs && refs > 0
}

/// "Verses 2-9.", "Verse 2." -- a note's opening and nothing else.
fn is_bare_verse_marker(text: &str) -> bool {
    static BARE: Lazy<Regex> = Lazy::new(|| {
        Regex::new(r"(?i)^(?:verses?|ver)\.?\s+\d{1,3}(?:\s*(?:-|\u{2013}|\u{2014}|,|and|to)\s*\d{1,3})?\s*[.:]?$").unwrap()
    });
    BARE.is_match(text.trim())
}

/// The div3 a paragraph sits in, if any.
fn verse_div(p: roxmltree::Node) -> Option<roxmltree::NodeId> {
    p.ancestors().find(|a| a.is_element() && a.tag_name().name() == "div3").map(|d| d.id())
}

/// A line drawn with "=", "-" or dashes and nothing else.
fn is_rule(text: &str) -> bool {
    text.chars().count() >= 3 && text.chars().all(|c| matches!(c, '=' | '-' | '_' | '\u{2013}' | '\u{2014}') || c.is_whitespace())
}

/// Barnes' `class="t2"`..`"t8"`: a line of indented, fixed-width matter.
fn is_printed_line(p: roxmltree::Node) -> bool {
    p.attribute("class").is_some_and(|c| c.len() >= 2 && c.starts_with('t') && c[1..].bytes().all(|b| b.is_ascii_digit()))
}

/// True when `p` comes straight after `prev`, nothing but whitespace between.
fn follows_directly(prev: roxmltree::Node, p: roxmltree::Node) -> bool {
    let mut node = p.prev_sibling();
    while let Some(n) = node {
        if n == prev {
            return true;
        }
        if n.is_element() || (n.is_text() && n.text().is_some_and(|t| !t.trim().is_empty())) {
            return false;
        }
        node = n.prev_sibling();
    }
    false
}

/// Inserts one commentary_entries row per non-empty paragraph (or block of
/// printed lines, see [`Block`]) found anywhere under `container`.
///
/// A chapter laid out as Barnes lays his out -- every verse's notes in a div3
/// of their own -- takes its verses from that layout alone: see
/// [`walk_verse_notes`]. Otherwise each paragraph's verse is resolved by: its
/// own scripRef citations THAT CITE THIS SECTION'S OWN BOOK (a paragraph
/// commenting on Genesis frequently cites Isaiah or elsewhere in passing --
/// those must not be mistaken for the paragraph's own verse), then an
/// enclosing div's title-derived verse, then `default_verse` (the section's
/// own title-derived verse span, when known).
#[allow(clippy::too_many_arguments)]
fn insert_entries_for_section(
    tx: &Connection,
    section_id: i64,
    book_id: i64,
    book_osis: &str,
    chapter: Option<i64>,
    default_verse: (Option<i64>, Option<i64>),
    container: roxmltree::Node,
    book_map: &HashMap<String, i64>,
    entries_inserted: &mut usize,
) -> anyhow::Result<()> {
    let blocks = collect_blocks(container, book_map);
    // Each block's per-verse div3, as (the div's node index, its verse).
    let wrappers: Vec<Option<(usize, i64)>> = match chapter {
        Some(ch) => blocks
            .iter()
            .map(|b| verse_note_wrapper(b.paras[0], container, book_id, ch, book_map).map(|(div, v)| (div.id().get() as usize, v)))
            .collect(),
        None => vec![None; blocks.len()],
    };
    let note_verses = is_verse_note_layout(container, &blocks, &wrappers, book_id, chapter, book_map).then(|| {
        let notes: Vec<NoteBlock> = blocks.iter().zip(&wrappers).map(|(b, w)| NoteBlock { wrapper: *w, text: &b.plain }).collect();
        walk_verse_notes(&notes)
    });
    // The order the entries are stored in, less the copies of a note the
    // source repeats: see `chapter_order` and `repeated_notes`.
    let order: Vec<usize> = match &note_verses {
        Some(verses) => {
            let texts: Vec<&str> = blocks.iter().map(|b| b.plain.as_str()).collect();
            let repeated = repeated_notes(verses, &texts);
            chapter_order(verses, &texts).into_iter().filter(|i| !repeated[*i]).collect()
        }
        None => (0..blocks.len()).collect(),
    };

    for (entry_sort, index) in order.into_iter().enumerate() {
        let block = &blocks[index];
        let (entry_chapter, verse_start, verse_end) = match &note_verses {
            Some(verses) => (chapter, verses[index].map(|v| v.0), verses[index].map(|v| v.1)),
            None => resolve_verse_by_refs(block, book_id, book_osis, chapter, default_verse, book_map),
        };
        let (html, plain) = block.stored();

        tx.execute(
            "INSERT INTO commentary_entries (section_id, sort_order, book_id, chapter, verse_start, verse_end, html, plain_text)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            params![section_id, entry_sort as i64, book_id, entry_chapter, verse_start, verse_end, html, plain],
        )?;
        *entries_inserted += 1;
    }
    Ok(())
}

/// A paragraph's chapter and verses from the Scripture it cites, for sources
/// with no per-verse layout to go by (see `insert_entries_for_section`).
fn resolve_verse_by_refs(
    block: &Block,
    book_id: i64,
    book_osis: &str,
    chapter: Option<i64>,
    default_verse: (Option<i64>, Option<i64>),
    book_map: &HashMap<String, i64>,
) -> (Option<i64>, Option<i64>, Option<i64>) {
    let p = block.paras[0];
    let refs: Vec<(i64, i64, i64)> = block
        .paras
        .iter()
        .flat_map(|line| collect_verse_refs(*line))
        .filter(|(book, ..)| book == book_osis)
        .map(|(_, ch, vs, ve)| (ch, vs, ve))
        .collect();
    // Prefer refs that land in THIS section's own chapter -- a paragraph
    // commenting on Gen 32 will often cite Gen 27 in passing ("as noted
    // above..."), and blindly trusting whichever ref appears first would
    // mislabel the paragraph as being about the cross-reference instead of
    // the passage it actually expounds.
    let in_chapter_refs: Vec<_> = match chapter {
        Some(c) => refs.iter().filter(|r| r.0 == c).collect(),
        None => Vec::new(),
    };
    if !in_chapter_refs.is_empty() {
        let vs = in_chapter_refs.iter().map(|r| r.1).min();
        let ve = in_chapter_refs.iter().map(|r| r.2).max();
        (chapter, vs, ve)
    } else if chapter.is_none() && !refs.is_empty() {
        // No known section chapter to anchor to -- the paragraph's own
        // first citation is the best guess available.
        let first_chapter = refs[0].0;
        let same_chapter_refs: Vec<_> = refs.iter().filter(|r| r.0 == first_chapter).collect();
        let vs = same_chapter_refs.iter().map(|r| r.1).min();
        let ve = same_chapter_refs.iter().map(|r| r.2).max();
        (Some(first_chapter), vs, ve)
    } else if let Some((ch, vs, ve)) = ancestor_chapter_verse(p, book_id, book_osis, book_map) {
        (Some(ch), vs, ve)
    } else {
        // A known section chapter exists but nothing in `refs` lands in
        // it (only cross-references elsewhere) -- trust the section's own
        // chapter/default verse rather than mislabeling this paragraph
        // with an unrelated cross-reference's verse.
        (chapter, default_verse.0, default_verse.1)
    }
}

/// The "- Chapter 2 - Verse 1" ending of the per-verse div3 titles in Barnes'
/// Thessalonians, Timothy and Titus ("THE FIRST EPISTLE OF PAUL TO TIMOTHY -
/// Chapter 2 - Verse 1"), where every other book has "1 Timothy 2:1".
static PRINTED_CHAPTER_VERSE_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)-\s*chapter\s+(\d{1,3})\s*-\s*verse\s+(\d{1,3})\s*$").unwrap());

/// The verse a div3 is on when the chapter is laid out verse by verse, as
/// Barnes lays out his: `div3 title="Romans 8:28"` (or the printed form
/// above) around every verse's notes. Only a single verse of this book and
/// chapter counts -- a div3 naming a span (Calvin's "Exodus 1:8-11") is a
/// passage heading, not this layout.
fn single_verse_div(div: roxmltree::Node, book_id: i64, chapter: i64, book_map: &HashMap<String, i64>) -> Option<i64> {
    let title = div.attribute("title")?;
    let (ch, verse) = match chapter_heading_match(title, book_map) {
        Some((b, ch, Some(vs), Some(ve))) if b == book_id && vs == ve => (ch, vs),
        Some(_) => return None,
        None => {
            let caps = PRINTED_CHAPTER_VERSE_RE.captures(title)?;
            (caps[1].parse().ok()?, caps[2].parse().ok()?)
        }
    };
    (ch == chapter).then_some(verse)
}

/// The per-verse div3 a paragraph sits in (the nearest div3 below the
/// chapter's own div), with its verse -- see [`single_verse_div`].
fn verse_note_wrapper<'a, 'input>(
    p: roxmltree::Node<'a, 'input>,
    container: roxmltree::Node,
    book_id: i64,
    chapter: i64,
    book_map: &HashMap<String, i64>,
) -> Option<(roxmltree::Node<'a, 'input>, i64)> {
    let div3 = p
        .ancestors()
        .skip(1)
        .take_while(|a| *a != container)
        .find(|a| a.is_element() && a.tag_name().name() == "div3")?;
    single_verse_div(div3, book_id, chapter, book_map).map(|verse| (div3, verse))
}

/// Whether a chapter is laid out as Barnes lays his out: every div3 in it a
/// single verse's notes, and the notes opening with their verse ("Verse
/// 28."). Calvin's Amos has div3s on single verses too, among its passages
/// ("Amos 1:3-5"), and no such openings -- its paragraphs keep going by what
/// they cite.
fn is_verse_note_layout(
    container: roxmltree::Node,
    blocks: &[Block],
    wrappers: &[Option<(usize, i64)>],
    book_id: i64,
    chapter: Option<i64>,
    book_map: &HashMap<String, i64>,
) -> bool {
    let Some(chapter) = chapter else {
        return false;
    };
    let mut div3s = container.children().filter(|n| n.is_element() && n.tag_name().name() == "div3").peekable();
    div3s.peek().is_some()
        && div3s.all(|div| single_verse_div(div, book_id, chapter, book_map).is_some())
        && blocks.iter().zip(wrappers).any(|(b, w)| w.is_some() && verse_marker(&b.plain).is_some())
}

/// One entry as [`walk_verse_notes`] sees it: the per-verse div3 it sits in
/// (an id that changes when the div does, and that div's verse) and its text.
struct NoteBlock<'t> {
    wrapper: Option<(usize, i64)>,
    text: &'t str,
}

/// The verses of a chapter laid out verse by verse (Barnes), one per entry --
/// `None` for an entry on the chapter rather than on any verse of it.
///
/// Barnes' div3s are not a clean one-verse-per-div layout. The first verse's
/// div opens with the chapter's introduction ("ROMANS CHAPTER 8",
/// "INTRODUCTION", then its numbered heads "(1.) ... Ro 8:1-13" to "(6.)"),
/// a book's own introduction can run on into verse 2's div, and a verse
/// crowded out of its div has its notes in the next ("Verse 1. Paul, an
/// apostle" inside Ephesians 1:2's div). What does mark each verse's notes is
/// how they begin: "Verse 28. And we know", "Verses 8-12.", "Ver 23.". So:
///
/// * Everything before the chapter's first such marker is its introduction,
///   on no verse. The Scripture it cites -- "(5.) ... Ro 8:28-30" -- is a
///   reference, never the verse the entry is on.
/// * A marker names the verses from there on. One for a span that covers its
///   div's verse ("Verses 8-12." in Luke 10:9's div) is taken as it stands.
///   One for an earlier verse is believed only before any verse has been
///   marked, or inside a span that covers it (a verse crowded into the next
///   div); anywhere else it is a misprint ("Verse 21. The hour is come" in
///   John 12:23's div), and the div's own verse stands.
/// * A new div starts on its own verse, unless it opens by saying it is the
///   "Continuation of" what came before.
/// * A heading in capitals before a div's first marker ("INTRODUCTION.",
///   "ANALYSIS OF CHAPTER XXII. 6-20"), "REMARKS on Chapter 5" anywhere, and
///   a heading after the last verse's notes ("SUMMARY OF CHAPTER 8") begin
///   matter on the chapter as a whole, until the next marker or div.
///
/// Where a div has no "Verse" marker at all, its opening may use the bare
/// number instead ("1. The book of the generation"). That is only looked for
/// to end an introduction, only where no "Verse" marker names that verse
/// anywhere in the chapter, and only the div's last such paragraph -- an
/// introduction's own list numbers its items "1.", "2." too.
fn walk_verse_notes(blocks: &[NoteBlock]) -> Vec<Option<(i64, i64)>> {
    let mut has_marker: std::collections::HashSet<usize> = std::collections::HashSet::new();
    let mut marked_verses: std::collections::HashSet<i64> = std::collections::HashSet::new();
    let mut last_bare: HashMap<usize, usize> = HashMap::new();
    for (i, b) in blocks.iter().enumerate() {
        if let Some((a, _)) = verse_marker(b.text) {
            marked_verses.insert(a);
        }
        if let Some((div, verse)) = b.wrapper {
            if verse_marker(b.text).is_some() {
                has_marker.insert(div);
            }
            if bare_verse_number(b.text) == Some(verse) {
                last_bare.insert(div, i);
            }
        }
    }
    // A bare "1." is a verse's opening only where no "Verse 1." opens it
    // elsewhere: Galatians' introduction lists its points "1. The first
    // object ..." in verse 1's div, and verse 1's notes open "Verse 1." in
    // the next.
    last_bare.retain(|div, i| blocks[*i].wrapper.is_some_and(|(d, v)| d == *div && !marked_verses.contains(&v)));

    // The chapter's last verse's div, where matter on the chapter as a whole
    // follows its notes under a heading of its own (`is_closing_heading`).
    let last_div = blocks.iter().rev().find_map(|b| b.wrapper.map(|w| w.0));

    let mut out = Vec::with_capacity(blocks.len());
    let mut current: Option<(i64, i64)> = None;
    // Whether any verse has been marked yet: before that, the introduction.
    let mut started = false;
    let mut div: Option<usize> = None;
    let mut marked_in_div = false;
    for (i, b) in blocks.iter().enumerate() {
        let this_div = b.wrapper.map(|w| w.0);
        if this_div != div {
            div = this_div;
            marked_in_div = false;
            if started && !is_continuation(b.text) {
                current = b.wrapper.map(|(_, v)| (v, v));
            }
        }
        let own_verse = b.wrapper.map(|w| w.1);
        let marker = verse_marker(b.text).or_else(|| match b.wrapper {
            Some((d, v)) if !started && !has_marker.contains(&d) && last_bare.get(&d) == Some(&i) => Some((v, v)),
            _ => None,
        });
        if let Some((a, z)) = marker {
            current = Some(match own_verse {
                None => (a, z),
                Some(w) if a <= w && w <= z => (a, z),
                Some(w) if a < w && (!started || current.is_some_and(|(s, e)| s <= a && a <= e)) => (a, z),
                Some(w) => (w, w),
            });
            started = true;
            marked_in_div = true;
        } else if is_remarks_heading(b.text)
            || (!marked_in_div && is_capitals_heading(b.text))
            || (this_div.is_some() && this_div == last_div && is_closing_heading(b.text))
        {
            current = None;
        }
        out.push(current);
    }
    out
}

/// The verses a note opens with: "Verse 28.", "Verses 8-12.", "Verses 27,28.",
/// "Verses 1 and 2", "Ver 23.", "VERSE 1.", "Verse. 12." -- at the head of the
/// paragraph, or of a later line when all that comes before it is a short
/// rule or label ("END OF Introductory Notes:" and a line of dashes).
fn verse_marker(text: &str) -> Option<(i64, i64)> {
    static AT_HEAD: Lazy<Regex> =
        Lazy::new(|| Regex::new(r"(?i)^(?:verses?|ver)\.?\s+(\d{1,3})(?:\s*(?:-|\u{2013}|\u{2014}|,|and|to)\s*(\d{1,3}))?").unwrap());
    static WITH_STOP: Lazy<Regex> =
        Lazy::new(|| Regex::new(r"(?i)^(?:verses?|ver)\.?\s+(\d{1,3})(?:\s*(?:-|\u{2013}|\u{2014}|,|and|to)\s*(\d{1,3}))?\s*[.:]").unwrap());
    let span = |caps: regex::Captures| -> Option<(i64, i64)> {
        let a: i64 = caps[1].parse().ok()?;
        let z: i64 = caps.get(2).and_then(|m| m.as_str().parse().ok()).unwrap_or(a);
        (a >= 1).then_some((a, z.max(a)))
    };
    if let Some(caps) = AT_HEAD.captures(text) {
        return span(caps);
    }
    let mut lines = text.lines().map(str::trim);
    if lines.next().is_some_and(|first| first.chars().count() <= 40) {
        for line in lines {
            if let Some(caps) = WITH_STOP.captures(line) {
                return span(caps);
            }
            if line.chars().count() > 40 {
                break;
            }
        }
    }
    None
}

/// "1." in "1. The book of the generation." -- a verse number with no "Verse".
fn bare_verse_number(text: &str) -> Option<i64> {
    static BARE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^(\d{1,3})\.\s+[A-Z]").unwrap());
    BARE.captures(text).and_then(|c| c[1].parse().ok())
}

/// "Continuation of Barnes Notes on Revelation 9:11": a div that carries on
/// the one before it.
fn is_continuation(text: &str) -> bool {
    text.get(..16).is_some_and(|head| head.eq_ignore_ascii_case("continuation of "))
}

/// "REMARKS on Chapter 5", "Remarks on 2nd Corinthians Chapter 4": the
/// reflections Barnes closes a chapter with, which are on the chapter, not on
/// its last verse. (The rules of "=" his typists drew around the heading come
/// with it, as lines of the same block.)
fn is_remarks_heading(text: &str) -> bool {
    let head = text.trim_start_matches(|c: char| !c.is_alphanumeric());
    text.chars().count() <= 100
        && head.get(..7).is_some_and(|w| w.eq_ignore_ascii_case("remarks"))
        && (head.to_lowercase().contains("chapter") || is_capitals_heading(head))
}

/// A short line mostly in capitals: "INTRODUCTION.", "The EPISTLE TO THE
/// ROMANS", "ANALYSIS OF CHAPTER XXII. 6-20".
fn is_capitals_heading(text: &str) -> bool {
    let letters: Vec<char> = text.chars().filter(|c| c.is_alphabetic()).collect();
    let capitals = letters.iter().filter(|c| c.is_uppercase()).count();
    text.chars().count() <= 80 && letters.len() >= 4 && capitals * 4 >= letters.len() * 3
}

/// A heading that opens matter appended after a chapter's last verse: "SUMMARY
/// OF CHAPTER 8" (Romans 8), "PRACTICAL REMARKS ON THE EPISTLE." (3 John),
/// "HARMONY OF THE ACCOUNTS OF THE RESURRECTION" (Matthew 28), "BRIEF
/// ANALYSIS OF THE ACTS OF THE APOSTLES". A heading in capitals of two words
/// or more -- not the "HEBREW" that labels a quotation, nor the spaced-out
/// letters of a table ("D A T E I N O S", Revelation 13:18).
fn is_closing_heading(text: &str) -> bool {
    is_capitals_heading(text) && text.split(|c: char| !c.is_alphabetic()).filter(|w| w.chars().count() >= 3).count() >= 2
}

/// The order a chapter's entries are stored in: the source's, except for
/// chapter-level matter the source files among the verse notes.
///
/// * A book's introduction that the source runs on into verse 2's div --
///   Matthew 1's 45 paragraphs of "INTRODUCTION." to the Gospels, Romans 1's
///   "The EPISTLE TO THE ROMANS" -- came between the notes on verses 1 and 2.
///   A run of chapter-level entries between verse notes that opens with a
///   heading in capitals goes before the first verse note instead, after
///   whatever already stands there.
/// * "REMARKS ON CHAPTER VI." came before the notes on the last verses of
///   Matthew 6 (and 9). Remarks on the whole chapter go to its end. Remarks
///   on a passage -- "REMARKS ON CHAP. XXI., XXII. 1-5", after Revelation
///   22:5 -- stay where they are.
fn chapter_order(verses: &[Option<(i64, i64)>], texts: &[&str]) -> Vec<usize> {
    static PASSAGE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\d\s*[-\u{2013}\u{2014}\u{fffd}]\s*\d").unwrap());
    let first_verse = verses.iter().position(Option::is_some);
    let last_verse = verses.iter().rposition(Option::is_some);
    let (Some(first), Some(last)) = (first_verse, last_verse) else {
        return (0..verses.len()).collect();
    };
    let mut intros = Vec::new();
    let mut middle = Vec::new();
    let mut remarks = Vec::new();
    let mut i = first;
    while i <= last {
        if verses[i].is_some() {
            middle.push(i);
            i += 1;
            continue;
        }
        let end = (i..=last).find(|j| verses[*j].is_some()).unwrap_or(last + 1);
        let head = texts[i];
        let run = i..end;
        if is_remarks_heading(head) && !PASSAGE.is_match(head) {
            remarks.extend(run);
        } else if !is_remarks_heading(head) && is_capitals_heading(head) {
            intros.extend(run);
        } else {
            middle.extend(run);
        }
        i = end;
    }
    (0..first).chain(intros).chain(middle).chain(remarks).chain(last + 1..verses.len()).collect()
}

/// Which entries only repeat a note the chapter already has (`true`), where
/// the rule for which copy to keep is clear. Barnes' typists repeated a note
/// under the next verse, or a passage's notes under each of its verses:
///
/// * The same note on the same verses again (or, before any verse, again on
///   the chapter): the later copy goes.
/// * A long note (40 characters or more) again on a neighbouring or
///   overlapping verse:
///   - if it opens by naming its verse ("Verse 42. And when the Jews") the
///     copy on that verse stays and the other goes (Acts 13:42's notes, all
///     repeated under 43; Mark 15's "Verse 39. No notes ..." under 38);
///   - else, on overlapping verses, the later copy goes (Luke 6:24's notes
///     again under 24-26);
///   - else, when the copy is one of a run of repeated paragraphs, the later
///     run goes (Luke 3:19's references to Matthew 14, again under 20).
///
/// A single footnote repeated on the next verse stays: the source puts a
/// verse's footnotes at the end of its div or the start of the next, and
/// which verse "same" or "vanished" is from can't be told from the notes.
/// So does a short pointer ("See Barnes on "Mt 1:3"") given under each verse
/// of a passage, and a note that is simply true of two verses far apart
/// ("Possessed with devils", Matthew 8:16 and 28).
fn repeated_notes(verses: &[Option<(i64, i64)>], texts: &[&str]) -> Vec<bool> {
    // A copy may have its opening on a line of its own in one place and run
    // on from it in the other ("Verse 24." + "Who are rich." under 24, "Who
    // are rich." again under 24-26), so copies are matched on what follows
    // the opening.
    static OPENING: Lazy<Regex> = Lazy::new(|| {
        Regex::new(r"(?i)^(?:verses?|ver)\.?\s+\d{1,3}(?:\s*(?:-|\u{2013}|\u{2014}|,|and|to)\s*\d{1,3})?\s*[.:]?\s*").unwrap()
    });
    // Whether an entry opens by naming the very verses it is filed on.
    let on_own_verse = |i: usize| verse_marker(texts[i]).is_some_and(|own| verses[i] == Some(own));
    let n = texts.len();
    let mut repeated = vec![false; n];
    // The copies of each note kept so far.
    let mut kept: HashMap<String, Vec<usize>> = HashMap::new();
    for q in 0..n {
        let copies = kept.entry(OPENING.replace(texts[q], "").into_owned()).or_default();
        let text = texts[q];
        if copies.iter().any(|&p| texts[p] == text && verses[p] == verses[q]) {
            repeated[q] = true;
            continue;
        }
        // The latest copy kept on a neighbouring or overlapping verse.
        let near = copies.iter().rposition(|&p| match (verses[p], verses[q]) {
            (Some((ps, pe)), Some((qs, qe))) => ps <= qe + 1 && qs <= pe + 1,
            _ => false,
        });
        let Some(slot) = near.filter(|_| text.chars().count() >= 40) else {
            copies.push(q);
            continue;
        };
        let p = copies[slot];
        let overlap = match (verses[p], verses[q]) {
            (Some((ps, pe)), Some((qs, qe))) => ps <= qe && qs <= pe,
            _ => false,
        };
        let in_run = |d: isize| {
            let (a, b) = (p as isize + d, q as isize + d);
            a >= 0 && b >= 0 && (b as usize) < n && a != q as isize && b != p as isize && texts[a as usize] == texts[b as usize]
        };
        match (on_own_verse(p), on_own_verse(q)) {
            // Two notes that only say the same of different verses ("Verse
            // 5. No specific Barnes text on this verse.", "Verse 6. ...").
            (true, true) => copies.push(q),
            (false, true) => {
                repeated[p] = true;
                copies[slot] = q;
            }
            (true, false) => repeated[q] = true,
            // Both open on a verse neither is filed on: leave them be.
            _ if verse_marker(text).is_some() && texts[p] != text => copies.push(q),
            _ if overlap => repeated[q] = true,
            _ if !is_footnote_key(text) && (in_run(-1) || in_run(1)) => repeated[q] = true,
            _ => copies.push(q),
        }
    }
    repeated
}

/// Collects (book_osis_code, chapter, verse_start, verse_end) citations from
/// all scripRef descendants of a paragraph. The book code is essential, not
/// decorative: verse-by-verse commentaries routinely cite OTHER books as
/// supporting cross-references mid-paragraph (e.g. Calvin citing Isaiah while
/// expounding Genesis) -- callers must filter to the book they actually care
/// about rather than trusting the first ref blindly.
fn collect_verse_refs(p: roxmltree::Node) -> Vec<(String, i64, i64, i64)> {
    let mut refs = Vec::new();
    for node in p
        .descendants()
        .filter(|n| n.is_element() && n.tag_name().name() == "scripRef")
    {
        if let Some(parsed) = node.attribute("parsed") {
            for seg in parsed.split(';') {
                let seg = seg.trim().trim_start_matches('|');
                let parts: Vec<&str> = seg.split('|').collect();
                if parts.len() >= 5 {
                    if let (Ok(cs), Ok(vs), Ok(mut ce), Ok(mut ve)) = (
                        parts[1].parse::<i64>(),
                        parts[2].parse::<i64>(),
                        parts[3].parse::<i64>(),
                        parts[4].parse::<i64>(),
                    ) {
                        if ce == 0 {
                            ce = cs;
                        }
                        if ve == 0 {
                            ve = vs;
                        }
                        let _ = ce; // chapter-end is unused: commentary_entries stores a single chapter
                        refs.push((parts[0].to_string(), cs, vs, ve));
                        continue;
                    }
                }
            }
        } else if let Some(osis) = node.attribute("osisRef") {
            refs.extend(parse_osis_ref(osis));
        }
    }
    refs
}

fn parse_osis_ref(osis: &str) -> Vec<(String, i64, i64, i64)> {
    let mut out = Vec::new();
    for part in osis.split_whitespace() {
        let part = part.trim_start_matches("Bible:");
        let mut sides = part.splitn(2, '-');
        let left = sides.next().unwrap_or("");
        let right = sides.next();
        let left_parts: Vec<&str> = left.split('.').collect();
        if left_parts.len() < 3 {
            continue;
        }
        let book = left_parts[0].to_string();
        let (Ok(chap), Ok(vs)) = (left_parts[1].parse::<i64>(), left_parts[2].parse::<i64>()) else {
            continue;
        };
        let ve = if let Some(r) = right {
            let right_parts: Vec<&str> = r.split('.').collect();
            right_parts
                .last()
                .and_then(|s| s.parse::<i64>().ok())
                .unwrap_or(vs)
        } else {
            vs
        };
        out.push((book, chap, vs, ve));
    }
    out
}

/// Renders a mixed-content node into a small sanitized HTML allow-list plus a
/// plain-text-only rendition for FTS indexing. Unknown tags are unwrapped
/// (their text/children are kept, the tag itself is dropped) rather than
/// rejected, so unexpected markup never breaks an import.
fn render_node(node: roxmltree::Node, html: &mut String, plain: &mut String, notes: &mut Vec<EditorNote>) {
    for child in node.children() {
        if child.is_text() {
            let t = child.text().unwrap_or("");
            html.push_str(&escape_html(t));
            plain.push_str(t);
        } else if child.is_element() {
            let tag = child.tag_name().name();
            match tag {
                "note" => {
                    // A footnote (Calvin's: the Calvin Translation Society's
                    // editors, quoting Stuart, Hammond, Turretin...). It is not
                    // the author's text, so it stays out of the paragraph's
                    // prose and its plain text -- search, read-aloud and the
                    // sermon excerpt all take the author's words only -- and is
                    // shown after the paragraph, labelled as the editor's.
                    let n = child.attribute("n").map(|s| s.to_string()).unwrap_or_else(|| (notes.len() + 1).to_string());
                    html.push_str(&format!("<sup class=\"ed-fn\">{}</sup>", escape_html(&n)));
                    let mut note_html = String::new();
                    let mut note_plain = String::new();
                    let mut nested = Vec::new();
                    render_node(child, &mut note_html, &mut note_plain, &mut nested);
                    if !note_plain.trim().is_empty() {
                        notes.push(EditorNote { n, html: note_html.trim().to_string() });
                    }
                }
                "scripRef" => {
                    let osis = child.attribute("osisRef").unwrap_or("");
                    html.push_str(&format!(
                        "<a class=\"scripref\" data-osis=\"{}\">",
                        escape_html(osis)
                    ));
                    render_node(child, html, plain, notes);
                    html.push_str("</a>");
                }
                "i" | "b" | "sup" | "sub" | "em" | "strong" => {
                    html.push_str(&format!("<{tag}>"));
                    render_node(child, html, plain, notes);
                    html.push_str(&format!("</{tag}>"));
                }
                "br" => {
                    html.push_str("<br/>");
                    plain.push(' ');
                }
                "p" | "div" if !plain.is_empty() => {
                    // nested block inside a paragraph (a footnote's second
                    // paragraph, say) - keep content, add a separator
                    html.push_str("<br/>");
                    plain.push(' ');
                    render_node(child, html, plain, notes);
                }
                _ => render_node(child, html, plain, notes),
            }
        }
    }
}

/// A footnote lifted out of a paragraph by `render_node`: its printed number
/// and its rendered HTML.
struct EditorNote {
    n: String,
    html: String,
}

/// Appends a paragraph's footnotes after it, each marked as the editor's so
/// that nobody reads (or preaches) an 1840s translator's note as the
/// commentator's own words.
fn append_editor_notes(html: &mut String, notes: &[EditorNote]) {
    for note in notes {
        html.push_str(&format!(
            "<div class=\"ed-note\"><span class=\"ed-note-label\">Editor's note {}</span> {}</div>",
            escape_html(&note.n),
            note.html
        ));
    }
}

/// True for a paragraph inside a `<note>`: `render_node` has already placed
/// it with the paragraph that cites it, so it is not an entry of its own.
fn inside_note(p: roxmltree::Node) -> bool {
    p.ancestors().skip(1).any(|a| a.is_element() && a.tag_name().name() == "note")
}

/// A paragraph that only repeats its section's heading -- Calvin's volumes
/// open each chapter with a list of "Romans 8:1-4", "Romans 8:5-8"... and
/// start every section with its own reference again, and some chapters with a
/// bare "CHAPTER 8". Kept as entries they fill the pane with headings and
/// become the first thing a verse lands on, ahead of the comment itself.
/// Barnes names the book as well, in every style his typists had: "ROMANS
/// CHAPTER 8", "MATTHEW CHAPTER V", "ROMANS Chapter One", "1st Corinthians
/// CHAPTER 3", "I Timothy Chapter 2", "THE EPISTLE TO THE PHILIPPIANS.
/// CHAPTER I." -- but never "REMARKS ON MATTHEW CHAPTER 8" or "ANALYSIS OF
/// CHAPTER I", which head matter of their own.
fn is_heading_stub(text: &str, book_map: &HashMap<String, i64>) -> bool {
    static CHAPTER_ONLY: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)^(chapter|psalm)\s+[0-9ivxlc]+\.?$").unwrap());
    static BOOK_CHAPTER: Lazy<Regex> = Lazy::new(|| {
        Regex::new(r"(?i)^(.+?)[\s.,]+chapters?\s+(?:\d{1,3}|[ivxlc]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\.?$").unwrap()
    });
    static ORDINAL: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)^([123])(?:st|nd|rd)\b").unwrap());
    // "Matthew Verses 2-16": a passage heading, set in Matthew 1:3's div.
    static BOOK_VERSES: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)^(.+?)\s+verses?\s+\d{1,3}(?:\s*-\s*\d{1,3})?\.?$").unwrap());
    if text.len() <= 40 && (chapter_heading_match(text, book_map).is_some() || CHAPTER_ONLY.is_match(text)) {
        return true;
    }
    if let Some(caps) = BOOK_VERSES.captures(text).filter(|_| text.len() <= 40) {
        if book_only_match(caps[1].trim(), book_map).is_some() {
            return true;
        }
    }
    let Some(caps) = BOOK_CHAPTER.captures(text).filter(|_| text.chars().count() <= 60) else {
        return false;
    };
    let prefix = ORDINAL.replace(caps[1].trim(), "$1");
    let lower = prefix.to_lowercase();
    if ["remark", "analys", "introduc", "summary", "notes"].iter().any(|w| lower.contains(w)) {
        return false;
    }
    // A title, not a sentence that happens to end on a chapter ("See what
    // Mark says in chapter 4."): every word capitalized but the small ones.
    let title_like = prefix.split_whitespace().all(|w| {
        w.starts_with(|c: char| c.is_uppercase() || c.is_ascii_digit()) || matches!(w, "of" | "to" | "the")
    });
    title_like && book_only_match(&prefix, book_map).is_some()
}

fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// Strips the DOCTYPE declaration (bracket-aware, so an internal subset with
/// custom entity declarations doesn't confuse the scan) and replaces any named
/// HTML entities the DTD might have defined with literal characters, so
/// roxmltree (which only knows the 5 predefined XML entities) never chokes on
/// legacy CCEL/ThML markup.
pub(crate) fn sanitize_thml_xml(input: &str) -> String {
    let without_doctype = strip_doctype(input);
    replace_named_entities(&without_doctype)
}

fn strip_doctype(s: &str) -> String {
    let Some(start) = s.find("<!DOCTYPE") else {
        return s.to_string();
    };
    let bytes = s.as_bytes();
    let mut i = start;
    let mut depth = 0i32;
    let mut end = None;
    while i < bytes.len() {
        match bytes[i] {
            b'[' => depth += 1,
            b']' => depth -= 1,
            b'>' if depth <= 0 => {
                end = Some(i);
                break;
            }
            _ => {}
        }
        i += 1;
    }
    match end {
        Some(e) => format!("{}{}", &s[..start], &s[e + 1..]),
        None => s.to_string(),
    }
}

fn replace_named_entities(s: &str) -> String {
    let map = html_entity_map();
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(pos) = rest.find('&') {
        out.push_str(&rest[..pos]);
        let after = &rest[pos + 1..];
        let mut end_idx = None;
        for (i, c) in after.char_indices() {
            if c == ';' {
                end_idx = Some(i);
                break;
            }
            if !(c.is_ascii_alphanumeric() || c == '#') || i > 12 {
                break;
            }
        }
        if let Some(semi) = end_idx {
            let name = &after[..semi];
            if name.starts_with('#') || matches!(name, "amp" | "lt" | "gt" | "quot" | "apos") {
                out.push('&');
                out.push_str(name);
                out.push(';');
            } else if let Some(ch) = map.get(name) {
                out.push(*ch);
            } else {
                out.push_str(name);
            }
            rest = &after[semi + 1..];
        } else {
            out.push_str("&amp;");
            rest = after;
        }
    }
    out.push_str(rest);
    out
}

fn html_entity_map() -> HashMap<&'static str, char> {
    HashMap::from([
        ("nbsp", '\u{00A0}'), ("mdash", '\u{2014}'), ("ndash", '\u{2013}'),
        ("lsquo", '\u{2018}'), ("rsquo", '\u{2019}'), ("ldquo", '\u{201C}'), ("rdquo", '\u{201D}'),
        ("hellip", '\u{2026}'), ("copy", '\u{00A9}'), ("sect", '\u{00A7}'), ("para", '\u{00B6}'),
        ("dagger", '\u{2020}'), ("Dagger", '\u{2021}'), ("trade", '\u{2122}'), ("bull", '\u{2022}'),
        ("prime", '\u{2032}'), ("Prime", '\u{2033}'), ("laquo", '\u{00AB}'), ("raquo", '\u{00BB}'),
        ("times", '\u{00D7}'), ("divide", '\u{00F7}'), ("plusmn", '\u{00B1}'),
        ("deg", '\u{00B0}'), ("micro", '\u{00B5}'), ("sup1", '\u{00B9}'), ("sup2", '\u{00B2}'), ("sup3", '\u{00B3}'),
        ("agrave", '\u{00E0}'), ("aacute", '\u{00E1}'), ("acirc", '\u{00E2}'), ("atilde", '\u{00E3}'), ("auml", '\u{00E4}'), ("aring", '\u{00E5}'), ("aelig", '\u{00E6}'),
        ("ccedil", '\u{00E7}'), ("egrave", '\u{00E8}'), ("eacute", '\u{00E9}'), ("ecirc", '\u{00EA}'), ("euml", '\u{00EB}'),
        ("igrave", '\u{00EC}'), ("iacute", '\u{00ED}'), ("icirc", '\u{00EE}'), ("iuml", '\u{00EF}'),
        ("ntilde", '\u{00F1}'), ("ograve", '\u{00F2}'), ("oacute", '\u{00F3}'), ("ocirc", '\u{00F4}'), ("otilde", '\u{00F5}'), ("ouml", '\u{00F6}'), ("oslash", '\u{00F8}'),
        ("ugrave", '\u{00F9}'), ("uacute", '\u{00FA}'), ("ucirc", '\u{00FB}'), ("uuml", '\u{00FC}'), ("yacute", '\u{00FD}'), ("yuml", '\u{00FF}'),
        ("szlig", '\u{00DF}'), ("oelig", '\u{0153}'), ("scaron", '\u{0161}'),
        ("ensp", '\u{2002}'), ("emsp", '\u{2003}'), ("thinsp", '\u{2009}'),
        ("sbquo", '\u{201A}'), ("bdquo", '\u{201E}'), ("lsaquo", '\u{2039}'), ("rsaquo", '\u{203A}'), ("euro", '\u{20AC}'),
    ])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn book_map() -> HashMap<String, i64> {
        HashMap::from([("romans".to_string(), 45), ("rom".to_string(), 45)])
    }

    #[test]
    fn a_footnote_is_lifted_out_of_the_prose_and_labelled_the_editors() {
        let xml = r#"<div><p>I take the righteousness of God to mean that which is approved;<note place="foot" n="40"><p class="Super">Stuart, Barnes and Haldane take this view.</p><p class="Super">So Hammond.</p></note> before his tribunal.</p></div>"#;
        let doc = roxmltree::Document::parse(xml).unwrap();
        let ps: Vec<_> = doc.descendants().filter(|n| n.has_tag_name("p")).collect();
        assert!(!inside_note(ps[0]));
        assert!(inside_note(ps[1]) && inside_note(ps[2]), "the note's own paragraphs are not entries");

        let (mut html, mut plain, mut notes) = (String::new(), String::new(), Vec::new());
        render_node(ps[0], &mut html, &mut plain, &mut notes);
        append_editor_notes(&mut html, &notes);
        assert!(!plain.contains("Stuart"), "the author's text carries none of the note: {plain}");
        assert!(plain.contains("approved;") && plain.contains("before his tribunal."));
        assert!(html.contains("<sup class=\"ed-fn\">40</sup>"));
        assert!(html.contains("<div class=\"ed-note\"><span class=\"ed-note-label\">Editor's note 40</span>"));
        assert!(html.contains("Stuart, Barnes and Haldane") && html.contains("So Hammond."));
    }

    #[test]
    fn a_paragraph_that_only_repeats_a_heading_is_a_stub() {
        let map = book_map();
        assert!(is_heading_stub("Romans 8:28-30", &map));
        assert!(is_heading_stub("CHAPTER 8", &map));
        assert!(!is_heading_stub("28. And we know that all things work together for good", &map));
    }

    #[test]
    fn a_paragraph_without_a_verse_takes_its_passage_wrapper() {
        let xml = r#"<div1 title="Romans"><div2 title="Chapter VIII"><div class="Commentary" id="Bible:Rom.8.29-Rom.8.30"><p>1. The character of the saints.</p></div></div2></div1>"#;
        let doc = roxmltree::Document::parse(xml).unwrap();
        let p = doc.descendants().find(|n| n.has_tag_name("p")).unwrap();
        assert_eq!(ancestor_chapter_verse(p, 45, "Rom", &book_map()), Some((8, Some(29), Some(30))));
        assert_eq!(ancestor_chapter_verse(p, 45, "Gen", &book_map()), None, "another book's wrapper is not this one's");
    }

    #[test]
    fn a_barnes_style_book_chapter_heading_is_a_stub() {
        let map = HashMap::from([
            ("romans".to_string(), 45),
            ("matthew".to_string(), 40),
            ("1 corinthians".to_string(), 46),
            ("1 timothy".to_string(), 54),
            ("philippians".to_string(), 50),
        ]);
        for heading in ["ROMANS CHAPTER 8", "MATTHEW CHAPTER V", "ROMANS Chapter One", "1st Corinthians CHAPTER 3", "I Timothy Chapter 2", "THE EPISTLE TO THE PHILIPPIANS. CHAPTER I.", "Matthew Verses 2-16"] {
            assert!(is_heading_stub(heading, &map), "{heading}");
        }
        for text in ["REMARKS ON MATTHEW CHAPTER 8.", "ANALYSIS OF CHAPTER I", "Introduction to 1st Corinthians Chapter 2", "See what Matthew says in chapter 4.", "Verses 2-16. See Barnes on Mt 1:3."] {
            assert!(!is_heading_stub(text, &map), "{text}");
        }
    }

    #[test]
    fn a_verse_note_says_which_verses_it_opens() {
        assert_eq!(verse_marker("Verse 28. And we know."), Some((28, 28)));
        assert_eq!(verse_marker("Verses 8-12. See Barnes \"Mt 10:14\"."), Some((8, 12)));
        assert_eq!(verse_marker("Verses 27,28. A certain woman."), Some((27, 28)));
        assert_eq!(verse_marker("Verses 1 and 2 of 1st John Chapter 1"), Some((1, 2)));
        assert_eq!(verse_marker("Ver 23. No specific Barnes text on this verse."), Some((23, 23)));
        assert_eq!(verse_marker("VERSE 1. Now I say."), Some((1, 1)));
        assert_eq!(verse_marker("END OF Introductory Notes:\n------------\nVerse 1. Paul, called to be an apostle."), Some((1, 1)));
        assert_eq!(verse_marker("(5.) It gives the assurance that all things shall work together, Ro 8:28-30."), None);
        assert_eq!(verse_marker("The apostle had said in the previous chapter, what\nverse 5. shows"), None, "only after a short label line");
    }

    fn walk(blocks: &[(Option<(usize, i64)>, &str)]) -> Vec<Option<(i64, i64)>> {
        let blocks: Vec<NoteBlock> = blocks.iter().map(|&(wrapper, text)| NoteBlock { wrapper, text }).collect();
        walk_verse_notes(&blocks)
    }

    #[test]
    fn a_chapter_introduction_is_on_no_verse() {
        let v = walk(&[
            (Some((1, 1)), "INTRODUCTION"),
            (Some((1, 1)), "THIS chapter is one of the most interesting and precious portions."),
            (Some((1, 1)), "(5.) It gives the assurance that all things shall work together for good, Ro 8:28-30."),
            (Some((1, 1)), "Verse 1. There is, therefore, now."),
            (Some((1, 1)), "Who walk. See Barnes \"Ro 8:4\"."),
            (Some((2, 2)), "Verse 2. For the law."),
        ]);
        assert_eq!(v, vec![None, None, None, Some((1, 1)), Some((1, 1)), Some((2, 2))]);
    }

    #[test]
    fn a_misprinted_verse_number_gives_way_to_its_div() {
        let v = walk(&[
            (Some((21, 21)), "Verse 21. And there were certain Greeks."),
            (Some((22, 22)), "Verse 22. Philip cometh and telleth Andrew."),
            (Some((23, 23)), "Verse 21. The hour is come."),
            (Some((24, 24)), "Verse 25. Except a corn of wheat."),
        ]);
        assert_eq!(v, vec![Some((21, 21)), Some((22, 22)), Some((23, 23)), Some((24, 24))]);
    }

    #[test]
    fn a_verse_crowded_into_the_next_div_keeps_its_own_number() {
        // Ephesians 1: the introduction fills verse 1's div and runs on into
        // verse 2's, where verse 1's notes finally begin.
        let v = walk(&[
            (Some((1, 1)), "INTRODUCTION to EPHESIANS"),
            (Some((2, 2)), "Continuation of Notes for Verse 1."),
            (Some((2, 2)), "(2.) The principal objection to the opinion."),
            (Some((2, 2)), "Verse 1. Paul, an apostle."),
            (Some((2, 2)), "Verse 2. Grace be to you."),
        ]);
        assert_eq!(v, vec![None, None, None, Some((1, 1)), Some((2, 2))]);
    }

    #[test]
    fn a_passage_span_and_a_continued_note_keep_their_verses() {
        let v = walk(&[
            (Some((8, 8)), "Verses 8-12. See Barnes \"Mt 10:14\"."),
            (Some((9, 9)), "Verses 8-12. See Barnes \"Mt 10:14\"."),
            (Some((11, 11)), "Verse 11. Their commission."),
            (Some((12, 12)), "Continuation of Barnes Notes on Revelation 9:11"),
            (Some((12, 12)), "(d) Their commission was expressly against those men."),
            (Some((12, 12)), "Verse 12. One woe is past."),
            (Some((12, 12)), "REMARKS on Chapter 9"),
            (Some((12, 12)), "1. We learn from this chapter."),
        ]);
        assert_eq!(
            v,
            vec![Some((8, 12)), Some((8, 12)), Some((11, 11)), Some((11, 11)), Some((11, 11)), Some((12, 12)), None, None]
        );
    }

    #[test]
    fn a_bare_number_opens_a_verse_only_where_nothing_else_does() {
        // 1 Thessalonians 2: the analysis numbers its points "1.", "2.", and
        // then "1. For yourselves, brethren" opens verse 1's notes.
        let v = walk(&[
            (Some((1, 1)), "ANALYSIS OF THE CHAPTER"),
            (Some((1, 1)), "1. That it was represented by some that the apostle sought influence."),
            (Some((1, 1)), "1. For yourselves, brethren, know our entrance in unto you."),
            (Some((2, 2)), "Verse 2. But even after that we had suffered before."),
        ]);
        assert_eq!(v, vec![None, None, Some((1, 1)), Some((2, 2))]);
        // Galatians 1: the introduction's own "1." while verse 1's notes open
        // "Verse 1." in the next div.
        let v = walk(&[
            (Some((1, 1)), "INTRODUCTION"),
            (Some((1, 1)), "1. The first object, therefore, was to show his commission."),
            (Some((2, 2)), "Verse 1. Paul, an apostle."),
        ]);
        assert_eq!(v, vec![None, None, Some((1, 1))]);
    }

    #[test]
    fn a_barnes_chapter_is_filed_by_its_verse_notes_and_its_lines_are_joined() {
        let xml = r#"<?xml version="1.0"?>
<ThML><ThML.body>
<div1 id="ix" title="THE EPISTLE TO THE ROMANS">
  <div2 id="ix.viii" title="Romans 8">
    <div3 id="ix.viii.i" title="Romans 8:1">
<p> </p>
<p class="t8"> ROMANS CHAPTER 8</p>
<p> </p>
<p class="t8"> INTRODUCTION</p>
<p>THIS chapter is one of the most interesting and precious portions.</p>
<p>(5.) It gives the assurance that all things shall work together for good, <scripRef osisRef="Bible:Rom.8.28-Rom.8.30" parsed="|Rom|8|28|8|30">Ro 8:28-30</scripRef>.</p>
<p> </p>
<p class="monospace" /><p class="t4">(a) God, in giving his Son,</p><p class="t8"><scripRef osisRef="Bible:Rom.8.31-Rom.8.33" parsed="|Rom|8|31|8|33">Ro 8:31-33</scripRef>.</p>
<p> </p>
<p>Verse 1. <i>There is, therefore, now</i>. This is connected with <scripRef osisRef="Bible:Rom.7.23-Rom.7.25" parsed="|Rom|7|23|7|25">Ro 7:23-25</scripRef>.</p>
<p><i>Who walk</i>. See Barnes <scripRef osisRef="Bible:Rom.8.4" parsed="|Rom|8|4|0|0">Ro 8:4</scripRef>.</p>
    </div3>
    <div3 id="ix.viii.ii" title="Romans 8:2">
<p>Verse 2. <i>For the law</i>. The word law here.</p>
<p>====================</p>
<p>REMARKS on Chapter 8</p>
<p>1. We learn the power of the gospel.</p>
    </div3>
  </div2>
  <div2 id="ix.ix" title="Romans 9">
    <div3 id="ix.ix.i" title="Romans 9:1">
<p>I say the truth in Christ, <scripRef osisRef="Bible:Rom.9.1" parsed="|Rom|9|1|0|0">Ro 9:1</scripRef>.</p>
    </div3>
    <div3 id="ix.ix.ii" title="Romans 9:2-3">
<p>For I could wish, <scripRef osisRef="Bible:Rom.9.3" parsed="|Rom|9|3|0|0">Ro 9:3</scripRef>.</p>
    </div3>
  </div2>
</div1>
</ThML.body></ThML>"#;
        let dir = std::env::temp_dir().join(format!("sojourner-thml-barnes-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("ntnotes.xml");
        std::fs::write(&file, xml).unwrap();
        let mut conn = crate::db::open_content_db(&dir.join("content.db")).unwrap();
        ThmlCommentaryImporter.import(&file, &mut conn).unwrap();

        type Row = (Option<i64>, Option<i64>, String, String);
        let entries = |chapter: i64| -> Vec<Row> {
            let mut stmt = conn
                .prepare("SELECT verse_start, verse_end, plain_text, html FROM commentary_entries WHERE chapter = ?1 ORDER BY section_id, sort_order")
                .unwrap();
            stmt.query_map([chapter], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))).unwrap().map(Result::unwrap).collect()
        };
        let ch8 = entries(8);
        let texts: Vec<(Option<i64>, &str)> = ch8.iter().map(|(vs, _, plain, _)| (*vs, plain.as_str())).collect();
        assert_eq!(
            texts,
            vec![
                (None, "INTRODUCTION"),
                (None, "THIS chapter is one of the most interesting and precious portions."),
                (None, "(5.) It gives the assurance that all things shall work together for good, Ro 8:28-30."),
                (None, "(a) God, in giving his Son, Ro 8:31-33."),
                (Some(1), "Verse 1. There is, therefore, now. This is connected with Ro 7:23-25."),
                (Some(1), "Who walk. See Barnes Ro 8:4."),
                (Some(2), "Verse 2. For the law. The word law here."),
                (None, "REMARKS on Chapter 8"),
                (None, "1. We learn the power of the gospel."),
            ],
            "the heading \"ROMANS CHAPTER 8\" and the rule are gone, and no entry takes its verse from what it cites"
        );
        assert!(ch8[3].3.contains("Son, <a class=\"scripref\""), "a reference on a line of its own runs on: {}", ch8[3].3);

        // Calvin's Amos has single-verse div3s among its passages, and no
        // "Verse" openings: its paragraphs still go by what they cite.
        let ch9: Vec<(Option<i64>, Option<i64>)> = entries(9).iter().map(|(vs, ve, ..)| (*vs, *ve)).collect();
        assert_eq!(ch9, vec![(Some(1), Some(1)), (Some(3), Some(3))]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_heading_after_the_last_verse_is_on_the_chapter() {
        let v = walk(&[
            (Some((38, 38)), "Verse 38. Nor height."),
            (Some((39, 39)), "Verse 39. Nor any other creature."),
            (Some((39, 39)), "HEBREW"),
            (Some((39, 39)), "SUMMARY OF CHAPTER 8"),
            (Some((39, 39)), "(1.) The superiority of the gospel."),
        ]);
        assert_eq!(v, vec![Some((38, 38)), Some((39, 39)), Some((39, 39)), None, None]);
        // Not in an earlier verse's div, where such a heading is the verse's.
        let v = walk(&[(Some((17, 17)), "Verse 17. For our light affliction."), (Some((17, 17)), "THE ONE IS,"), (Some((18, 18)), "Verse 18.")]);
        assert_eq!(v, vec![Some((17, 17)), Some((17, 17)), Some((18, 18))]);
        assert!(!is_closing_heading("D A T E I N O S\n30 1 300 5 10 50 70 200=666."));
    }

    #[test]
    fn a_book_introduction_goes_before_the_verse_notes_and_remarks_to_the_end() {
        let one = Some((1, 1));
        let two = Some((2, 2));
        let three = Some((3, 3));
        // Matthew 1: the Gospels' introduction ran on into verse 2's div.
        let texts = ["GOSPEL ACCORDING TO MATTHEW.", "1. The book of the generation.", "INTRODUCTION.", "The word gospel means good news.", "Verse 2.", "Verse 3."];
        let verses = [None, one, None, None, two, three];
        assert_eq!(chapter_order(&verses, &texts), vec![0, 2, 3, 1, 4, 5]);
        // Matthew 6: remarks on the chapter before its last verses' notes.
        let texts = ["Verse 1. Alms.", "REMARKS ON CHAPTER VI.", "1. Our alms.", "Verse 2.", "Verse 3."];
        let verses = [one, None, None, two, three];
        assert_eq!(chapter_order(&verses, &texts), vec![0, 3, 4, 1, 2]);
        // Revelation 22: remarks on a passage stay after it.
        let texts = ["Verse 1.", "REMARKS ON CHAP. XXI., XXII. 1\u{2013}5", "Verse 2."];
        assert_eq!(chapter_order(&[one, None, two], &texts), vec![0, 1, 2]);
    }

    #[test]
    fn a_note_repeated_on_the_next_verse_is_kept_once() {
        let long = "Woe unto you that are full! Not hungry. Satisfied with their";
        let other = "Ye shall hunger. Your condition will soon be reversed, and you";
        let v = |a: i64, z: i64| Some((a, z));
        // On an overlapping passage: the later copy goes.
        assert_eq!(repeated_notes(&[v(24, 24), v(25, 25), v(24, 26)], &[long, "x", long]), vec![false, false, true]);
        // Opening with its verse: the copy on that verse stays.
        let marked = "Verse 39. No notes from Barnes on this verse.";
        assert_eq!(repeated_notes(&[v(38, 38), v(39, 39)], &[marked, marked]), vec![true, false]);
        let opened = format!("Verse 24. {long}");
        assert_eq!(repeated_notes(&[v(24, 24), v(24, 26)], &[&opened, long]), vec![false, true]);
        // Two verses' notes that only say the same thing both stay.
        let five = "Verse 5. No specific Barnes text on this verse.";
        let six = "Verse 6. No specific Barnes text on this verse.";
        assert_eq!(repeated_notes(&[v(5, 5), v(6, 6)], &[five, six]), vec![false, false]);
        // A run of paragraphs again under the next verse: the later run goes.
        assert_eq!(repeated_notes(&[v(19, 19), v(19, 19), v(20, 20), v(20, 20)], &[long, other, long, other]), vec![false, false, true, true]);
        // One footnote on the next verse, a short pointer, a note on two
        // verses far apart: all stay.
        let footnote = "{a} \"same\" Ex 16:15,35; Neh 9:15,20; Ps 78:24,25";
        assert_eq!(repeated_notes(&[v(2, 2), v(3, 3)], &[footnote, footnote]), vec![false, false]);
        let pointer = "See Barnes on \"Mt 1:3\"";
        assert_eq!(repeated_notes(&[v(5, 5), v(6, 6)], &[pointer, pointer]), vec![false, false]);
        assert_eq!(repeated_notes(&[v(16, 16), v(28, 28)], &[long, long]), vec![false, false]);
        // The same entry on the same verses, however short: the copy goes.
        assert_eq!(repeated_notes(&[v(8, 12), v(8, 12)], &[pointer, pointer]), vec![false, true]);
    }

    #[test]
    fn barnes_prose_flows_a_hymn_keeps_its_lines_and_a_footnote_keeps_its_references() {
        let xml = r#"<?xml version="1.0"?>
<ThML><ThML.body>
<div1 id="ix" title="THE EPISTLE TO THE ROMANS">
  <div2 id="ix.viii" title="Romans 8">
    <div3 id="ix.viii.i" title="Romans 8:1">
<p>Verse 1. <i>There is, therefore, now</i>.</p>
<p class="t4">(c) The love of a Christian to the Saviour is in itself so strong</p><p class="t4">that nothing can separate him from it. By all</p><p class="t4">these considerations the superiority of the gospel is re-</p><p class="t4">vealed.</p>
<p> </p>
<p class="t8">Stand up, my soul, shake off thy fears,</p><p class="t8">And gird the gospel armour on;</p>
<p>{z} "hate you",</p>
<p><scripRef osisRef="Bible:John.17.14" parsed="|John|17|14|0|0">Joh 17:14</scripRef>; <scripRef osisRef="Bible:1John.3.13" parsed="|1John|3|13|0|0">1 Jo 3:13</scripRef>.</p>
    </div3>
    <div3 id="ix.viii.ii" title="Romans 8:2">
<p>Verses 2-9.</p>
<p>See Barnes on <scripRef osisRef="Bible:Matt.10.26" parsed="|Matt|10|26|0|0">Mt 10:26</scripRef>.</p>
    </div3>
  </div2>
</div1>
</ThML.body></ThML>"#;
        let dir = std::env::temp_dir().join(format!("sojourner-thml-barnes-lines-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("ntnotes.xml");
        std::fs::write(&file, xml).unwrap();
        let mut conn = crate::db::open_content_db(&dir.join("content.db")).unwrap();
        ThmlCommentaryImporter.import(&file, &mut conn).unwrap();
        let mut stmt = conn.prepare("SELECT verse_start, verse_end, plain_text, html FROM commentary_entries ORDER BY section_id, sort_order").unwrap();
        let rows: Vec<(Option<i64>, Option<i64>, String, String)> =
            stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))).unwrap().map(Result::unwrap).collect();
        let texts: Vec<(Option<i64>, Option<i64>, &str)> = rows.iter().map(|(a, z, plain, _)| (*a, *z, plain.as_str())).collect();
        assert_eq!(
            texts,
            vec![
                (Some(1), Some(1), "Verse 1. There is, therefore, now."),
                (
                    Some(1),
                    Some(1),
                    "(c) The love of a Christian to the Saviour is in itself so strong that nothing can separate him from it. By all these considerations the superiority of the gospel is re-vealed."
                ),
                (Some(1), Some(1), "Stand up, my soul, shake off thy fears,\nAnd gird the gospel armour on;"),
                (Some(1), Some(1), "{z} \"hate you\", Joh 17:14; 1 Jo 3:13."),
                (Some(2), Some(9), "Verses 2-9. See Barnes on Mt 10:26."),
            ]
        );
        assert!(!rows[1].3.contains("<br/>"), "prose flows: {}", rows[1].3);
        assert!(rows[2].3.contains("fears,<br/>And gird"), "a hymn keeps its lines: {}", rows[2].3);
        drop(stmt);
        drop(conn);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
