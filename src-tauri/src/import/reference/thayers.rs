use crate::import::thml::{load_book_lookup, load_book_osis_codes, normalize_book_title};
use once_cell::sync::Lazy;
use regex::Regex;
use rusqlite::{params, Connection};
use std::collections::{HashMap, HashSet};
use std::path::Path;

/// Thayer's Greek-English Lexicon of the New Testament (Joseph Henry Thayer,
/// 1889, public domain) is optional bundled content -- this importer is a
/// no-op until `reference/thayers/thayers.xml` is present.
///
/// That file is produced by a one-off conversion of a clean theWord Bible
/// software module (a straightforward transcription of the 1889 public
/// domain text, no added copyrightable scholarly commentary), NOT by hand:
/// see the conversion script referenced in the project history. Its shape is
/// `<entries><entry strongs="G1"><definition>...marked-up prose...</definition></entry>...</entries>`,
/// `strongs` bare (no leading zeros) with the `G` prefix, `definition`
/// containing a small fixed tag vocabulary (`p`, `grk`, `heb`, `blu`, `b`,
/// `u`, `red`, `span`, `ref`) plus real Unicode Greek/Hebrew text -- already
/// fully entity-decoded and well-formed XML by the time it reaches this
/// importer. Missing file => Ok(0), not an error, so builds keep working
/// without the data.
pub fn import(conn: &mut Connection, path: &Path) -> anyhow::Result<usize> {
    if !path.exists() {
        return Ok(0);
    }

    let text = std::fs::read_to_string(path)?;
    let doc = roxmltree::Document::parse(&text)?;

    let book_map = load_book_lookup(conn)?;
    let book_osis = load_book_osis_codes(conn)?;

    // Strong's Greek headwords by their bare letters, for an entry the file
    // labels with a number another entry already has (see below).
    let headwords: HashMap<String, String> = conn
        .prepare("SELECT headword_plain, id FROM strongs_entries WHERE language = 'greek' AND headword_plain <> ''")?
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
        .collect::<Result<_, _>>()?;

    let mut rows: Vec<(String, String, String)> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    for entry in doc
        .descendants()
        .filter(|n| n.is_element() && n.tag_name().name() == "entry")
    {
        let Some(raw_id) = entry.attribute("strongs") else {
            continue;
        };
        let num = raw_id.trim_start_matches(['G', 'g']).trim_start_matches('0');
        if num.is_empty() {
            continue;
        }
        let mut strongs_id = format!("G{num}");
        // The file labels a copy of its article on ἅπτω (G681's, line 682)
        // "G68" as well as ἀγρός's, and the second replaced the first: every
        // "field" showed "ἅπτω; 1 aorist participle ἅψας...". A number met a
        // second time is taken to be the entry's own headword's, where
        // Strong's has that word under a number no entry here has claimed;
        // otherwise -- ἅπτω's is claimed -- the entry is left out rather than
        // put over the first.
        if !seen.insert(strongs_id.clone()) {
            match entry_headword(entry).and_then(|h| headwords.get(&crate::plain::plain(&h))) {
                Some(id) if !seen.contains(id) => {
                    strongs_id = id.clone();
                    seen.insert(id.clone());
                }
                _ => continue,
            }
        }

        let Some(definition) = entry
            .children()
            .find(|n| n.is_element() && n.tag_name().name() == "definition")
        else {
            continue;
        };

        let mut html = String::new();
        let mut plain = String::new();
        for child in definition.children() {
            render_node(child, &mut html, &mut plain, &book_map, &book_osis);
        }
        let plain_trimmed = plain.trim().to_string();
        if plain_trimmed.is_empty() {
            continue;
        }
        rows.push((strongs_id, html, plain_trimmed));
    }

    let count = rows.len();
    let tx = conn.transaction()?;
    {
        let mut stmt = tx.prepare(
            "INSERT INTO thayers_entries (strongs_id, html, plain_text) VALUES (?1, ?2, ?3)
             ON CONFLICT(strongs_id) DO NOTHING",
        )?;
        for (id, html, plain) in &rows {
            stmt.execute(params![id, html, plain])?;
        }
    }
    tx.commit()?;
    Ok(count)
}

/// Renders one node of a `<definition>` into a small sanitized HTML
/// allow-list plus a plain-text rendition, mirroring the convention
/// established in `import::thml::render_node` for commentary sources.
fn render_node(
    node: roxmltree::Node,
    html: &mut String,
    plain: &mut String,
    book_map: &HashMap<String, i64>,
    book_osis: &HashMap<i64, String>,
) {
    if node.is_text() {
        push_text(node.text().unwrap_or(""), html, plain, false);
        return;
    }
    if !node.is_element() {
        return;
    }

    match node.tag_name().name() {
        "p" => {
            html.push_str("<p>");
            for child in node.children() {
                render_node(child, html, plain, book_map, book_osis);
            }
            html.push_str("</p>");
            plain.push_str("\n\n");
        }
        "blu" | "b" => {
            html.push_str("<b>");
            for child in node.children() {
                render_node(child, html, plain, book_map, book_osis);
            }
            html.push_str("</b>");
        }
        "u" => {
            html.push_str("<u>");
            for child in node.children() {
                render_node(child, html, plain, book_map, book_osis);
            }
            html.push_str("</u>");
        }
        "red" => {
            // Original book's inline sense-letter/number markers, e.g. "{a}".
            html.push_str("<sup>");
            for child in node.children() {
                render_node(child, html, plain, book_map, book_osis);
            }
            html.push_str("</sup>");
        }
        "grk" | "heb" => {
            // No semantic value of their own beyond marking a language run --
            // unwrap, keep the content.
            for child in node.children() {
                render_node(child, html, plain, book_map, book_osis);
            }
        }
        "span" => {
            // A bare <span> is where the module's own Hebrew font was used:
            // its Hebrew is Windows-1255 bytes read as Latin-1 ("àÅì" for
            // אֵל), which `push_text` reads back into Hebrew. It was dropped
            // as meaningless, and 3,640 Hebrew words went with it ("the
            // Sept. for ,  and ; a god", G2316) -- with 176 spans of English
            // and Greek that are not Hebrew at all (G12's "both as the common
            // receptacle of the dead, and especially as the abode of
            // demons"). Its content is read like any other text, and a run
            // of the font's bytes in it is Hebrew even where it starts with a
            // point (G4460's "ִ־י", the suffix it discusses).
            let hebrew_font = node.attributes().next().is_none();
            for child in node.children() {
                if child.is_text() {
                    push_text(child.text().unwrap_or(""), html, plain, hebrew_font);
                } else {
                    render_node(child, html, plain, book_map, book_osis);
                }
            }
        }
        "ref" => {
            let ref_text: String = node.descendants().filter(|n| n.is_text()).filter_map(|n| n.text()).collect();
            let ref_text = ref_text.trim();
            if let Some(osis_target) = resolve_ref(ref_text, book_map, book_osis) {
                html.push_str(&format!(
                    "<a class=\"scripref\" data-osis=\"{}\">",
                    escape_html(osis_target.as_str())
                ));
                html.push_str(&escape_html(ref_text));
                html.push_str("</a>");
            } else {
                html.push_str(&escape_html(ref_text));
            }
            plain.push_str(ref_text);
        }
        _ => {
            for child in node.children() {
                render_node(child, html, plain, book_map, book_osis);
            }
        }
    }
}

static REF_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^([1-3]?\s?[A-Za-z]+)\.?\s+(\d+)(?::(\d+)(?:-(\d+))?)?$").unwrap());

/// Resolves a theWord-style scripture citation ("Rom 5:8", "Son 2:4-5",
/// "1Co 13:1-4") to a `Book.Chapter.Verse` OSIS target matching the regex
/// `CommentaryHtml` parses on the frontend (see
/// `src/features/commentary/CommentaryPanel.tsx`). Returns None for
/// unparseable refs, refs with no verse number (nothing to jump to), and
/// refs to books this app doesn't carry (Apocrypha -- Wis, Sir, Bar, Tob,
/// Jdt, 1-3Ma, 1-2Es all appear in the source data but aren't in `books`).
fn resolve_ref(text: &str, book_map: &HashMap<String, i64>, book_osis: &HashMap<i64, String>) -> Option<String> {
    let caps = REF_RE.captures(text.trim())?;
    let abbr = caps.get(1)?.as_str().replace(' ', "");
    let chapter = caps.get(2)?.as_str();
    let verse = caps.get(3)?.as_str(); // no verse number -> nothing to link to

    let canonical_name = THAYERS_BOOK_ABBR.iter().find(|(a, _)| *a == abbr).map(|(_, n)| *n)?;
    let book_id = *book_map.get(&normalize_book_title(canonical_name))?;
    let osis = book_osis.get(&book_id)?;
    Some(format!("{osis}.{chapter}.{verse}"))
}

/// theWord's standard 3-4 char book abbreviations (as actually used in this
/// dataset's `<ref>` tags -- verified against the full corpus, not guessed)
/// mapped to this app's canonical English book names, which `normalize_book_title`
/// + `load_book_lookup`'s name/short_name/osis_code matching then resolves to
/// a `books.id`. Protestant 66-book canon only -- Apocrypha refs (Wis, Sir,
/// Bar, Tob, Jdt, 1Ma/2Ma/3Ma, 1Es/2Es) intentionally have no entry here and
/// fall back to plain unlinked text in `resolve_ref`.
const THAYERS_BOOK_ABBR: &[(&str, &str)] = &[
    ("Gen", "Genesis"), ("Exo", "Exodus"), ("Lev", "Leviticus"), ("Num", "Numbers"),
    ("Deu", "Deuteronomy"), ("Jos", "Joshua"), ("Jdg", "Judges"), ("Rth", "Ruth"),
    ("1Sa", "1 Samuel"), ("2Sa", "2 Samuel"), ("1Ki", "1 Kings"), ("2Ki", "2 Kings"),
    ("1Ch", "1 Chronicles"), ("2Ch", "2 Chronicles"), ("Ezr", "Ezra"), ("Neh", "Nehemiah"),
    ("Est", "Esther"), ("Job", "Job"), ("Psa", "Psalms"), ("Pro", "Proverbs"),
    ("Ecc", "Ecclesiastes"), ("Son", "Song of Solomon"), ("Isa", "Isaiah"), ("Jer", "Jeremiah"),
    ("Lam", "Lamentations"), ("Eze", "Ezekiel"), ("Dan", "Daniel"), ("Hos", "Hosea"),
    ("Joe", "Joel"), ("Amo", "Amos"), ("Oba", "Obadiah"), ("Jon", "Jonah"),
    ("Mic", "Micah"), ("Nah", "Nahum"), ("Hab", "Habakkuk"), ("Zep", "Zephaniah"),
    ("Hag", "Haggai"), ("Zec", "Zechariah"), ("Mal", "Malachi"),
    ("Mat", "Matthew"), ("Mar", "Mark"), ("Luk", "Luke"), ("Joh", "John"), ("Act", "Acts"),
    ("Rom", "Romans"), ("1Co", "1 Corinthians"), ("2Co", "2 Corinthians"), ("Gal", "Galatians"),
    ("Eph", "Ephesians"), ("Php", "Philippians"), ("Col", "Colossians"),
    ("1Th", "1 Thessalonians"), ("2Th", "2 Thessalonians"), ("1Ti", "1 Timothy"), ("2Ti", "2 Timothy"),
    ("Tit", "Titus"), ("Phm", "Philemon"), ("Heb", "Hebrews"), ("Jas", "James"),
    ("1Pe", "1 Peter"), ("2Pe", "2 Peter"), ("1Jn", "1 John"), ("2Jn", "2 John"), ("3Jn", "3 John"),
    ("Jud", "Jude"), ("Rev", "Revelation"),
];

/// The first word the entry prints in bold: its headword ("ἅπτω").
fn entry_headword(entry: roxmltree::Node) -> Option<String> {
    let bold = entry.descendants().find(|n| n.is_element() && n.tag_name().name() == "blu")?;
    let text: String = bold.descendants().filter(|n| n.is_text()).filter_map(|n| n.text()).collect();
    let word = text.split([',', ';', ' ']).find(|w| !w.trim().is_empty())?.trim().to_string();
    Some(word)
}

/// Text, with any Hebrew the module wrote in its legacy Hebrew font read
/// back into Hebrew: a word written wholly in the Latin-1 letters from À to
/// ú is that font's Windows-1255 bytes ("àÆøÆõ" for אֶרֶץ), in the spans that
/// mark it and in 35 places outside them. A run of them becomes Hebrew only
/// if it is at least two long and starts with a letter (E0-FA), so that a
/// Latin word's one accented letter is left alone. The Hebrew is marked for
/// the Hebrew font.
fn push_text(t: &str, html: &mut String, plain: &mut String, hebrew_font: bool) {
    let mut rest = t;
    while !rest.is_empty() {
        let Some(start) = rest.char_indices().find(|&(_, c)| is_legacy_hebrew_byte(c)).map(|(i, _)| i) else {
            html.push_str(&escape_html(rest));
            plain.push_str(rest);
            return;
        };
        let len = rest[start..]
            .char_indices()
            .find(|&(_, c)| !is_legacy_hebrew_byte(c))
            .map(|(i, _)| i)
            .unwrap_or(rest.len() - start);
        let run = &rest[start..start + len];
        html.push_str(&escape_html(&rest[..start]));
        plain.push_str(&rest[..start]);
        match decode_legacy_hebrew(run, hebrew_font) {
            Some(hebrew) => {
                html.push_str("<span class=\"lex-hebrew\">");
                html.push_str(&escape_html(&hebrew));
                html.push_str("</span>");
                plain.push_str(&hebrew);
            }
            None => {
                html.push_str(&escape_html(run));
                plain.push_str(run);
            }
        }
        rest = &rest[start + len..];
    }
}

fn is_legacy_hebrew_byte(c: char) -> bool {
    matches!(c as u32, 0xC0..=0xD8 | 0xE0..=0xFA)
}

/// Windows-1255's Hebrew: C0-D3 the points and marks (U+05B0-05C3), D4-D8
/// the Yiddish ligatures and geresh (U+05F0-05F4), E0-FA the letters
/// (U+05D0-05EA).
fn decode_legacy_hebrew(run: &str, hebrew_font: bool) -> Option<String> {
    if !hebrew_font && (run.chars().count() < 2 || !matches!(run.chars().next()? as u32, 0xE0..=0xFA)) {
        return None;
    }
    run.chars()
        .map(|c| {
            let b = c as u32;
            let h = match b {
                0xC0..=0xD3 => 0x05B0 + (b - 0xC0),
                0xD4..=0xD8 => 0x05F0 + (b - 0xD4),
                0xE0..=0xFA => 0x05D0 + (b - 0xE0),
                _ => return None,
            };
            char::from_u32(h)
        })
        .collect()
}

fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_modules_legacy_hebrew_is_read_back_into_hebrew() {
        assert_eq!(decode_legacy_hebrew("àÅì", false).as_deref(), Some("אֵל"));
        assert_eq!(decode_legacy_hebrew("àÆøÆõ", false).as_deref(), Some("אֶרֶץ"));
        // A Latin word's accented letter is not Hebrew, outside the font's spans.
        assert_eq!(decode_legacy_hebrew("é", false), None);
        assert_eq!(decode_legacy_hebrew("Àé", false), None);
        // In them, a run is Hebrew even where it starts with a point.
        assert_eq!(decode_legacy_hebrew("ÄÎé", true).as_deref(), Some("\u{5b4}\u{5be}\u{5d9}"));
        let (mut html, mut plain) = (String::new(), String::new());
        push_text("the Sept. for àÅì, and Acker", &mut html, &mut plain, false);
        assert_eq!(plain, "the Sept. for אֵל, and Acker");
        assert_eq!(html, "the Sept. for <span class=\"lex-hebrew\">אֵל</span>, and Acker");
    }

    /// The real file, through the real schema: G2316's Septuagint Hebrew is
    /// there, G12's English in a bare span is there, and ἀγρός keeps its
    /// article.
    #[test]
    fn the_real_file_keeps_its_hebrew_and_every_article_under_its_own_number() {
        let path = std::env::temp_dir().join(format!("thayers-import-test-{}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        let mut conn = crate::db::open_content_db(&path).unwrap();
        let reference = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("reference");
        crate::import::reference::strongs::import(&mut conn, &reference.join("strongs").join("hebrew.xml"), &reference.join("strongs").join("greek.xml")).unwrap();
        import(&mut conn, &reference.join("thayers").join("thayers.xml")).unwrap();
        let text = |id: &str| -> String { conn.query_row("SELECT plain_text FROM thayers_entries WHERE strongs_id = ?1", [id], |r| r.get(0)).unwrap_or_default() };
        assert!(text("G2316").contains("Sept. for אֵל, אֶלֹהִים and יְהוָה; a god"));
        assert!(text("G12").contains("especially as the abode of demons"));
        // The second "G68" is a copy of G681's article on ἅπτω.
        assert!(text("G68").starts_with("ἀγρός"));
        assert!(text("G681").starts_with("ἅπτω"));
        assert_eq!(text("G680"), "");
        drop(conn);
        let _ = std::fs::remove_file(&path);
    }
}
