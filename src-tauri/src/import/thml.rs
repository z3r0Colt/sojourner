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
        "mhc" => Some("Matthew Henry's Concise Commentary"),
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
fn ancestor_chapter_verse(p: roxmltree::Node, book_id: i64, book_map: &HashMap<String, i64>) -> Option<(i64, Option<i64>, Option<i64>)> {
    let mut node = p.parent();
    while let Some(n) = node {
        if n.is_element() {
            let tag = n.tag_name().name();
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

/// Inserts one commentary_entries row per non-empty paragraph found anywhere
/// under `container`. Each paragraph's verse is resolved by: its own scripRef
/// citations THAT CITE THIS SECTION'S OWN BOOK (a paragraph commenting on
/// Genesis frequently cites Isaiah or elsewhere in passing -- those must not
/// be mistaken for the paragraph's own verse), then an enclosing div's
/// title-derived verse (Barnes-style per-verse div3 wrappers), then
/// `default_verse` (the section's own title-derived verse span, when known).
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
    let mut entry_sort = 0i64;
    for p in container.descendants().filter(|n| n.is_element() && n.tag_name().name() == "p") {
        let mut html = String::new();
        let mut plain = String::new();
        render_node(p, &mut html, &mut plain);
        let plain_trimmed = plain.trim();
        if plain_trimmed.is_empty() {
            continue;
        }

        let refs: Vec<(i64, i64, i64)> = collect_verse_refs(p)
            .into_iter()
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
        let (entry_chapter, verse_start, verse_end) = if !in_chapter_refs.is_empty() {
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
        } else if let Some((ch, vs, ve)) = ancestor_chapter_verse(p, book_id, book_map) {
            (Some(ch), vs, ve)
        } else {
            // A known section chapter exists but nothing in `refs` lands in
            // it (only cross-references elsewhere) -- trust the section's own
            // chapter/default verse rather than mislabeling this paragraph
            // with an unrelated cross-reference's verse.
            (chapter, default_verse.0, default_verse.1)
        };

        tx.execute(
            "INSERT INTO commentary_entries (section_id, sort_order, book_id, chapter, verse_start, verse_end, html, plain_text)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            params![section_id, entry_sort, book_id, entry_chapter, verse_start, verse_end, html, plain_trimmed],
        )?;
        entry_sort += 1;
        *entries_inserted += 1;
    }
    Ok(())
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
fn render_node(node: roxmltree::Node, html: &mut String, plain: &mut String) {
    for child in node.children() {
        if child.is_text() {
            let t = child.text().unwrap_or("");
            html.push_str(&escape_html(t));
            plain.push_str(t);
        } else if child.is_element() {
            let tag = child.tag_name().name();
            match tag {
                "scripRef" => {
                    let osis = child.attribute("osisRef").unwrap_or("");
                    html.push_str(&format!(
                        "<a class=\"scripref\" data-osis=\"{}\">",
                        escape_html(osis)
                    ));
                    render_node(child, html, plain);
                    html.push_str("</a>");
                }
                "i" | "b" | "sup" | "sub" | "em" | "strong" => {
                    html.push_str(&format!("<{tag}>"));
                    render_node(child, html, plain);
                    html.push_str(&format!("</{tag}>"));
                }
                "br" => {
                    html.push_str("<br/>");
                    plain.push(' ');
                }
                "p" | "div" if plain.len() > 0 => {
                    // nested block inside a paragraph (rare) - keep content, add a separator
                    plain.push(' ');
                    render_node(child, html, plain);
                }
                _ => render_node(child, html, plain),
            }
        }
    }
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
