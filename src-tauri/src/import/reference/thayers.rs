use crate::import::thml::{load_book_lookup, load_book_osis_codes, normalize_book_title};
use once_cell::sync::Lazy;
use regex::Regex;
use rusqlite::{params, Connection};
use std::collections::HashMap;
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

    let mut rows: Vec<(String, String, String)> = Vec::new();
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
        let strongs_id = format!("G{num}");

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
             ON CONFLICT(strongs_id) DO UPDATE SET html = excluded.html, plain_text = excluded.plain_text",
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
        let t = node.text().unwrap_or("");
        html.push_str(&escape_html(t));
        plain.push_str(t);
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
            // A bare <span> (no attributes) in this dataset holds legacy
            // 8-bit Hebrew-font glyphs stored as ordinary accented-Latin
            // entities -- meaningless without that exact font, confirmed to
            // contain zero real Hebrew Unicode. Drop its content outright
            // rather than show garbage. A <span> WITH attributes (lang=,
            // color styling) is legitimate real content -- unwrap it.
            let has_attrs = node.attributes().next().is_some();
            if has_attrs {
                for child in node.children() {
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

fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}
