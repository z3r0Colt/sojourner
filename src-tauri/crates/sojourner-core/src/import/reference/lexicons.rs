//! The lexicon shelf beside Strong's: Brown–Driver–Briggs, Abbott-Smith,
//! Liddell–Scott–Jones, and STEPBible's brief lexicons for Greek and Hebrew.
//! See `reference/lexicons/SOURCES.md` for where each file came from.
//!
//! Every entry is stored with the HTML the reader sees -- built here from an
//! allowlist of elements, never passed through -- its plain text for search,
//! its headword by its bare letters (`crate::plain`), and the Strong's
//! number it is about, so the Strong's popup can offer every lexicon that
//! has the word.
//!
//! Scripture references become `<a class="scripref" data-osis="...">`, the
//! form the commentary and Thayer's already use, so the same renderer makes
//! them clickable and previewable.

use rusqlite::{params, Connection};
use std::collections::HashMap;
use std::path::Path;

struct Source {
    code: &'static str,
    name: &'static str,
    language: &'static str,
    license: &'static str,
    credit: &'static str,
    sort_order: i64,
}

const SOURCES: &[Source] = &[
    Source {
        code: "BDB",
        name: "Brown–Driver–Briggs",
        language: "hebrew",
        license: "Public domain; markup CC BY 4.0",
        credit: "F. Brown, S. R. Driver and C. A. Briggs, A Hebrew and English Lexicon of the Old Testament (1906). Digitised and marked up by Open Scriptures (openscriptures.org), CC BY 4.0; some entries are given in full and others in outline, as the digitisation stands.",
        sort_order: 1,
    },
    Source {
        code: "TBESH",
        name: "Brief lexicon (Hebrew)",
        language: "hebrew",
        license: "CC BY 4.0",
        credit: "Translators Brief lexicon of Extended Strongs for Hebrew, © Tyndale House Cambridge (STEPBible.org), CC BY 4.0.",
        sort_order: 2,
    },
    Source {
        code: "AS",
        name: "Abbott-Smith",
        language: "greek",
        license: "Public domain",
        credit: "G. Abbott-Smith, A Manual Greek Lexicon of the New Testament (1922). Public domain; TEI markup by the Translatable Exegetical Tools project.",
        sort_order: 3,
    },
    Source {
        code: "LSJ",
        name: "Liddell–Scott–Jones",
        language: "greek",
        license: "CC BY 4.0; digitisation CC BY-SA",
        credit: "H. G. Liddell, R. Scott and H. S. Jones, A Greek-English Lexicon (1940), in the entries for the words of the Greek Bible: Translators Formatted full LSJ Bible lexicon, © Tyndale House Cambridge (STEPBible.org), CC BY 4.0, from the Perseus Digital Library's digitisation, CC BY-SA.",
        sort_order: 4,
    },
    Source {
        code: "TBESG",
        name: "Brief lexicon (Greek)",
        language: "greek",
        license: "CC BY 4.0",
        credit: "Translators Brief lexicon of Extended Strongs for Greek, © Tyndale House Cambridge (STEPBible.org), CC BY 4.0.",
        sort_order: 5,
    },
];

struct Entry {
    headword: String,
    strongs_id: Option<String>,
    html: String,
}

/// "H2617A" / "G0026" / "H2617a" -> "H2617".
fn strongs(raw: &str) -> Option<String> {
    let raw = raw.trim();
    let mut chars = raw.chars();
    let letter = chars.next()?.to_ascii_uppercase();
    if letter != 'G' && letter != 'H' {
        return None;
    }
    let digits: String = chars.take_while(|c| c.is_ascii_digit()).collect();
    let n: u32 = digits.parse().ok()?;
    (n > 0).then(|| format!("{letter}{n}"))
}

fn escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}

/// Book id -> OSIS code, from content.db's own `books`, for the links.
fn osis_codes(conn: &Connection) -> anyhow::Result<HashMap<i64, String>> {
    let mut stmt = conn.prepare("SELECT id, osis_code FROM books")?;
    let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// "Rom.5.8", "Jhn.4.51", "NT.Jude.12" -> the canonical OSIS reference, or
/// None for a book outside the 66 (the LXX's Wisdom, Sirach...).
fn osis_ref(raw: &str, osis: &HashMap<i64, String>) -> Option<String> {
    let raw = raw.trim().trim_start_matches("NT.").trim_start_matches("LXX.").trim_start_matches("OT.");
    let mut parts = raw.split('.');
    let book = parts.next()?;
    let book_id = crate::refparse::lookup_book(book)?;
    let a: i64 = parts.next()?.trim().parse().ok()?;
    let b: Option<i64> = parts.next().and_then(|p| p.trim().split(['-', ' ']).next()?.parse().ok());
    let code = osis.get(&book_id)?;
    // One-chapter books are cited by verse alone ("Jude.12").
    let one_chapter = crate::refparse::CHAPTER_COUNTS[(book_id - 1) as usize] == 1;
    Some(match (b, one_chapter) {
        (Some(v), _) => format!("{code}.{a}.{v}"),
        (None, true) => format!("{code}.1.{a}"),
        (None, false) => format!("{code}.{a}.1"),
    })
}

fn link(osis_ref: &str, label: &str) -> String {
    format!("<a class=\"scripref\" data-osis=\"{osis_ref}\">{}</a>", escape(label))
}

// ------------------------------------------------------------------ XML --

/// What one element becomes in the HTML.
enum Out {
    /// Wrap the children in this opening and closing tag.
    Wrap(&'static str, &'static str),
    /// Keep the children, drop the element.
    Unwrap,
    /// Drop the element and everything in it.
    Drop,
}

fn walk(node: roxmltree::Node, rule: &dyn Fn(roxmltree::Node) -> Out, osis: &HashMap<i64, String>, out: &mut String) {
    for child in node.children() {
        if child.is_text() {
            out.push_str(&escape(child.text().unwrap_or("")));
            continue;
        }
        if !child.is_element() {
            continue;
        }
        let tag = child.tag_name().name();
        // Scripture references, in either lexicon's attribute.
        if tag == "ref" {
            let target = child.attribute("r").or_else(|| child.attribute("osisRef"));
            let mut label = String::new();
            walk(child, rule, osis, &mut label);
            match target.and_then(|t| osis_ref(t.split('-').next().unwrap_or(t), osis)) {
                Some(r) => out.push_str(&format!("<a class=\"scripref\" data-osis=\"{r}\">{label}</a>")),
                None => out.push_str(&label),
            }
            continue;
        }
        if tag == "sense" {
            out.push_str("<div class=\"lex-sense\">");
            if let Some(n) = child.attribute("n") {
                out.push_str(&format!("<b class=\"lex-n\">{}</b> ", escape(n)));
            }
            walk(child, rule, osis, out);
            out.push_str("</div>");
            continue;
        }
        match rule(child) {
            Out::Wrap(open, close) => {
                out.push_str(open);
                walk(child, rule, osis, out);
                out.push_str(close);
            }
            Out::Unwrap => walk(child, rule, osis, out),
            Out::Drop => {}
        }
    }
}

fn text_of(node: roxmltree::Node) -> String {
    node.descendants().filter(|n| n.is_text()).map(|n| n.text().unwrap_or("")).collect::<String>()
}

fn bdb_rule(n: roxmltree::Node) -> Out {
    match n.tag_name().name() {
        "w" => Out::Wrap("<span class=\"lex-hebrew\">", "</span>"),
        "def" => Out::Wrap("<b>", "</b>"),
        "pos" | "em" | "asp" => Out::Wrap("<i>", "</i>"),
        "stem" => Out::Wrap("<b class=\"lex-stem\">", "</b>"),
        "foreign" => Out::Wrap("<i>", "</i>"),
        "status" | "page" => Out::Drop,
        _ => Out::Unwrap,
    }
}

fn abbott_rule(n: roxmltree::Node) -> Out {
    match n.tag_name().name() {
        "orth" => Out::Wrap("<b class=\"lex-greek\">", "</b>"),
        "foreign" => {
            if n.attribute((roxmltree::NS_XML_URI, "lang")) == Some("heb") {
                Out::Wrap("<span class=\"lex-hebrew\">", "</span>")
            } else {
                Out::Wrap("<span class=\"lex-greek\">", "</span>")
            }
        }
        "gloss" => Out::Wrap("<b>", "</b>"),
        "emph" | "hi" | "pos" | "tns" | "mood" | "gram" | "usg" => Out::Wrap("<i>", "</i>"),
        "p" => Out::Wrap("<p>", "</p>"),
        "re" => Out::Wrap("<p class=\"lex-re\">", "</p>"),
        "row" => Out::Wrap("<div>", "</div>"),
        "cell" => Out::Wrap("<span class=\"lex-cell\">", "</span> "),
        "pb" => Out::Drop,
        "note" if n.attribute("type") == Some("occurrencesNT") => Out::Drop,
        _ => Out::Unwrap,
    }
}

fn read_bdb(dir: &Path, osis: &HashMap<i64, String>) -> anyhow::Result<Vec<Entry>> {
    // LexicalIndex: which Strong's number each BDB entry is.
    let index_text = std::fs::read_to_string(dir.join("LexicalIndex.xml"))?;
    let index = roxmltree::Document::parse(index_text.trim_start_matches('\u{feff}'))?;
    let mut strong_of: HashMap<String, String> = HashMap::new();
    for x in index.descendants().filter(|n| n.tag_name().name() == "xref") {
        if let (Some(bdb), Some(s)) = (x.attribute("bdb"), x.attribute("strong")) {
            strong_of.entry(bdb.to_string()).or_insert_with(|| format!("H{}", s.trim_start_matches('0')));
        }
    }
    let text = std::fs::read_to_string(dir.join("BrownDriverBriggs.xml"))?;
    let doc = roxmltree::Document::parse(text.trim_start_matches('\u{feff}'))?;
    let mut out = Vec::new();
    for e in doc.descendants().filter(|n| n.is_element() && n.tag_name().name() == "entry") {
        let Some(id) = e.attribute("id") else { continue };
        let headword = e
            .children()
            .find(|c| c.is_element() && c.tag_name().name() == "w")
            .map(text_of)
            .unwrap_or_default();
        if headword.trim().is_empty() {
            continue;
        }
        let mut html = String::new();
        walk(e, &bdb_rule, osis, &mut html);
        let html = html.split_whitespace().collect::<Vec<_>>().join(" ");
        // A cross-reference entry ("v. II. אבה") is kept only when it names a
        // Strong's number; otherwise it is an index card, not an article.
        let strongs_id = strong_of.get(id).cloned();
        if strongs_id.is_none() && html.chars().count() < 60 {
            continue;
        }
        out.push(Entry { headword: headword.trim().to_string(), strongs_id, html });
    }
    Ok(out)
}

fn read_abbott_smith(path: &Path, osis: &HashMap<i64, String>) -> anyhow::Result<Vec<Entry>> {
    let text = std::fs::read_to_string(path)?;
    let doc = roxmltree::Document::parse(text.trim_start_matches('\u{feff}'))?;
    let mut out = Vec::new();
    for e in doc.descendants().filter(|n| n.is_element() && n.tag_name().name() == "entry") {
        // n="ἀγάπη|G26"; a few entries carry no Strong's number.
        let n = e.attribute("n").unwrap_or("");
        let (headword, strongs_id) = match n.split_once('|') {
            Some((h, s)) => (h.to_string(), strongs(s)),
            None => (n.to_string(), None),
        };
        let headword = if headword.trim().is_empty() {
            e.descendants().find(|c| c.tag_name().name() == "orth").map(text_of).unwrap_or_default()
        } else {
            headword
        };
        if headword.trim().is_empty() {
            continue;
        }
        let mut html = String::new();
        walk(e, &abbott_rule, osis, &mut html);
        out.push(Entry {
            headword: headword.trim().to_string(),
            strongs_id,
            html: html.split_whitespace().collect::<Vec<_>>().join(" "),
        });
    }
    Ok(out)
}

// ----------------------------------------------------------- STEPBible --

/// STEPBible's HTML, reduced to what the app displays: bold, italic, line
/// breaks, its `<ref='Jhn.4.51'>` links, and LSJ's citation popups turned
/// into the Bible references among them.
fn step_html(raw: &str, osis: &HashMap<i64, String>) -> String {
    use once_cell::sync::Lazy;
    use regex::Regex;
    static CITE: Lazy<Regex> = Lazy::new(|| Regex::new(r#"<a href="javascript:void\(0\)" title="([^"]*)">([^<]*)</a>"#).unwrap());
    static REF: Lazy<Regex> = Lazy::new(|| Regex::new(r#"<ref='([^']*)'>([^<]*)</ref>"#).unwrap());
    static BIBLE_ITEM: Lazy<Regex> = Lazy::new(|| Regex::new(r"\b(?:NT|LXX)\.[1-3]?[A-Z][A-Za-z]+\.\d+(?:\.\d+)?").unwrap());
    static TAG: Lazy<Regex> = Lazy::new(|| Regex::new(r"</?([A-Za-z][A-Za-z0-9]*)[^>]*>").unwrap());

    let s = CITE.replace_all(raw, |c: &regex::Captures| {
        let refs: Vec<String> = BIBLE_ITEM
            .find_iter(&c[1])
            .filter_map(|m| {
                let r = osis_ref(m.as_str(), osis)?;
                let label = r.replacen('.', " ", 1).replacen('.', ":", 1);
                Some(link(&r, &label))
            })
            .take(6)
            .collect();
        // The source brackets each citation itself: "[<a ...>NT</a>]".
        if refs.is_empty() {
            format!("<span class=\"lex-cite\">{}</span>", escape(c[2].trim()))
        } else {
            format!("<span class=\"lex-cite\">{}</span>", refs.join(", "))
        }
    });
    let s = REF.replace_all(&s, |c: &regex::Captures| match osis_ref(&c[1], osis) {
        Some(r) => link(&r, &c[2]),
        None => escape(&c[2]),
    });
    // The sense markers STEPBible writes as "__2", "__II".
    let s = s.replace("__", "");
    // Every other tag: keep b, i, br (normalised); unwrap the rest.
    TAG.replace_all(&s, |c: &regex::Captures| {
        let name = c[1].to_ascii_lowercase();
        let closing = c[0].starts_with("</");
        match name.as_str() {
            "br" => "<br>".to_string(),
            "b" | "i" | "a" | "span" => c[0].to_string(),
            _ => {
                if closing || !matches!(name.as_str(), "level2" | "level3" | "level4") {
                    String::new()
                } else {
                    " ".to_string()
                }
            }
        }
    })
    .trim()
    .to_string()
}

fn read_step(path: &Path, osis: &HashMap<i64, String>) -> anyhow::Result<Vec<Entry>> {
    let text = std::fs::read_to_string(path)?;
    let mut out = Vec::new();
    for line in text.lines() {
        let cols: Vec<&str> = line.split('\t').collect();
        if cols.len() < 8 {
            continue;
        }
        let Some(id) = strongs(cols[0]) else { continue };
        if !cols[0].chars().nth(1).is_some_and(|c| c.is_ascii_digit()) {
            continue;
        }
        let headword = cols[3].trim().to_string();
        if headword.is_empty() {
            continue;
        }
        let gloss = cols[6].trim();
        let body = step_html(cols[7], osis);
        let html = if gloss.is_empty() { body } else { format!("<p><b>{}</b></p>{body}", escape(gloss)) };
        out.push(Entry { headword, strongs_id: Some(id), html });
    }
    Ok(out)
}

pub fn import(conn: &mut Connection, reference_dir: &Path) -> anyhow::Result<usize> {
    let osis = osis_codes(conn)?;
    let lex = reference_dir.join("lexicons");
    let step = lex.join("stepbible");
    let tbesg = reference_dir
        .join("morphology")
        .join("greek-tagnt")
        .join("TBESG - Translators Brief lexicon of Extended Strongs for Greek - STEPBible.org CC BY.txt");

    let mut by_source: Vec<(&Source, Vec<Entry>)> = Vec::new();
    for source in SOURCES {
        let entries = match source.code {
            "BDB" => read_bdb(&lex.join("bdb"), &osis)?,
            "AS" => read_abbott_smith(&lex.join("abbott-smith").join("abbott-smith.tei.xml"), &osis)?,
            "TBESH" => read_step(&step.join("TBESH - Translators Brief lexicon of Extended Strongs for Hebrew - STEPBible.org CC BY.txt"), &osis)?,
            "TBESG" => read_step(&tbesg, &osis)?,
            "LSJ" => {
                let mut v = read_step(&step.join("TFLSJ  0-5624 - Translators Formatted full LSJ Bible lexicon - STEPBible.org CC BY.txt"), &osis)?;
                v.extend(read_step(&step.join("TFLSJ extra - Translators Formatted full LSJ Bible lexicon - STEPBible.org CC BY.txt"), &osis)?);
                v
            }
            _ => vec![],
        };
        by_source.push((source, entries));
    }

    let tx = conn.transaction()?;
    let mut total = 0usize;
    {
        let mut insert_source = tx.prepare(
            "INSERT INTO lexicon_sources (code, name, language, license, credit, sort_order) VALUES (?1,?2,?3,?4,?5,?6)",
        )?;
        let mut insert = tx.prepare(
            "INSERT INTO lexicon_entries (source_id, headword, headword_plain, strongs_id, html, plain_text)
             VALUES (?1,?2,?3,?4,?5,?6)",
        )?;
        for (source, entries) in &by_source {
            insert_source.execute(params![source.code, source.name, source.language, source.license, source.credit, source.sort_order])?;
            let source_id = tx.last_insert_rowid();
            for e in entries {
                let plain_text = crate::text::html_to_text(&e.html);
                insert.execute(params![
                    source_id,
                    e.headword,
                    crate::plain::plain_word(&e.headword),
                    e.strongs_id,
                    e.html,
                    plain_text
                ])?;
            }
            println!("lexicon {}: {} entries", source.code, entries.len());
            total += entries.len();
        }
    }
    tx.commit()?;
    Ok(total)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn osis() -> HashMap<i64, String> {
        [(43, "John"), (45, "Rom"), (65, "Jude"), (24, "Jer")].into_iter().map(|(k, v)| (k, v.to_string())).collect()
    }

    #[test]
    fn stepbible_html_keeps_bible_references_as_links() {
        let html = step_html(
            r#"<b> ἀγάπ-η</b>, ἡ, <br /> <b>love,</b> [<a href="javascript:void(0)" title=" LXX.Jer.2.2, +others; cf. NT.Rom.5.8, NT.Jude.12">LXX+NT</a>]<br /><Level2><b>__II</b></Level2> x <ref='Jhn.4.51'>Jhn.4:51</ref>"#,
            &osis(),
        );
        assert!(html.contains(r#"data-osis="Jer.2.2""#), "{html}");
        assert!(html.contains(r#"data-osis="Rom.5.8""#), "{html}");
        assert!(html.contains(r#"data-osis="Jude.1.12""#), "{html}");
        assert!(html.contains(r#"data-osis="John.4.51""#), "{html}");
        assert!(!html.contains("Level2") && !html.contains("__"), "{html}");
        assert!(!html.contains("javascript"), "{html}");
    }

    #[test]
    fn strongs_numbers_lose_padding_and_sense_letters() {
        assert_eq!(strongs("H2617A").as_deref(), Some("H2617"));
        assert_eq!(strongs("G0026").as_deref(), Some("G26"));
        assert_eq!(strongs("x"), None);
    }
}
