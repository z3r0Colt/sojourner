use rusqlite::{params, Connection};
use std::path::Path;

struct Entry {
    id: String,
    language: &'static str,
    original_word: String,
    transliteration: Option<String>,
    pronunciation: Option<String>,
    short_definition: Option<String>,
    definition: String,
    derivation: Option<String>,
    kjv_usage: Option<String>,
}

/// Concatenates text content, resolving empty `<strongsref>`/`<see>` elements
/// (which carry no text of their own, just language+strongs attributes) into a
/// readable "H123"/"G123" reference instead of leaving a silent gap.
fn text_content(node: roxmltree::Node) -> String {
    fn walk(node: roxmltree::Node, out: &mut String) {
        for child in node.children() {
            if child.is_text() {
                out.push_str(child.text().unwrap_or(""));
            } else if child.is_element() {
                let tag = child.tag_name().name();
                if tag == "strongsref" || tag == "see" {
                    let prefix = match child.attribute("language") {
                        Some(l) if l.eq_ignore_ascii_case("hebrew") => "H",
                        _ => "G",
                    };
                    if let Some(num) = child.attribute("strongs") {
                        out.push_str(prefix);
                        out.push_str(num.trim_start_matches('0'));
                    }
                } else if tag == "w" && child.attribute("src").is_some() {
                    // The Hebrew dictionary names a root as an empty element,
                    // `<w src="2616" lemma="חָסַד" xlit="châçad"/>`, whose
                    // number is Hebrew; without this "from H2616 (châçad)"
                    // read "from ;".
                    let num = child.attribute("src").unwrap_or("").trim_start_matches('0');
                    out.push('H');
                    out.push_str(num);
                    if let Some(x) = child.attribute("xlit") {
                        out.push_str(&format!(" ({x})"));
                    }
                } else {
                    walk(child, out);
                }
            }
        }
    }
    let mut out = String::new();
    walk(node, &mut out);
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Hebrew dictionary is OSIS-XML: <div type="glossary"><div type="entry"><w ID="H1" lemma=".." xlit=".."/>
/// <list><item>numbered senses</item></list><note type="exegesis|explanation|translation">...</note></div>
fn parse_hebrew(path: &Path) -> anyhow::Result<Vec<Entry>> {
    let text = std::fs::read_to_string(path)?;
    let doc = roxmltree::Document::parse(&text)?;
    let mut entries = Vec::new();

    for entry_div in doc
        .descendants()
        .filter(|n| n.is_element() && n.tag_name().name() == "div" && n.attribute("type") == Some("entry"))
    {
        let Some(w) = entry_div
            .children()
            .find(|n| n.is_element() && n.tag_name().name() == "w")
        else {
            continue;
        };
        let Some(id) = w.attribute("ID") else { continue };
        let original_word = w.text().unwrap_or("").to_string();
        let transliteration = w.attribute("xlit").map(|s| s.to_string());

        let senses: Vec<String> = entry_div
            .children()
            .find(|n| n.is_element() && n.tag_name().name() == "list")
            .map(|list| {
                list.children()
                    .filter(|n| n.is_element() && n.tag_name().name() == "item")
                    .map(text_content)
                    .collect()
            })
            .unwrap_or_default();

        let mut derivation = None;
        let mut short_definition = None;
        let mut kjv_usage = None;
        for note in entry_div
            .children()
            .filter(|n| n.is_element() && n.tag_name().name() == "note")
        {
            let content = text_content(note);
            match note.attribute("type") {
                Some("exegesis") => derivation = Some(content),
                Some("explanation") => short_definition = Some(content),
                Some("translation") => kjv_usage = Some(content),
                _ => {}
            }
        }

        let definition = if !senses.is_empty() {
            senses.join("; ")
        } else {
            short_definition.clone().unwrap_or_default()
        };

        entries.push(Entry {
            id: id.to_string(),
            language: "hebrew",
            original_word,
            transliteration,
            pronunciation: None,
            short_definition,
            definition,
            derivation,
            kjv_usage,
        });
    }

    Ok(entries)
}

/// Greek dictionary uses a small custom DTD: <entry strongs="00001"><strongs>1</strongs>
/// <greek unicode=".." translit=".."/><pronunciation strongs=".."/><strongs_derivation>..</strongs_derivation>
/// <strongs_def>..</strongs_def><kjv_def>..</kjv_def></entry>
fn parse_greek(path: &Path) -> anyhow::Result<Vec<Entry>> {
    let text = std::fs::read_to_string(path)?;
    let sanitized = crate::import::thml::sanitize_thml_xml(&text);
    let doc = roxmltree::Document::parse(&sanitized)?;
    let mut entries = Vec::new();

    for entry in doc
        .descendants()
        .filter(|n| n.is_element() && n.tag_name().name() == "entry")
    {
        let Some(num_text) = entry
            .children()
            .find(|n| n.is_element() && n.tag_name().name() == "strongs")
            .and_then(|n| n.text())
        else {
            continue;
        };
        let Ok(num) = num_text.trim().parse::<u32>() else {
            continue;
        };
        let id = format!("G{num}");

        let greek = entry
            .children()
            .find(|n| n.is_element() && n.tag_name().name() == "greek");
        let original_word = greek.and_then(|g| g.attribute("unicode")).unwrap_or("").to_string();
        let transliteration = greek.and_then(|g| g.attribute("translit")).map(|s| s.to_string());

        let pronunciation = entry
            .children()
            .find(|n| n.is_element() && n.tag_name().name() == "pronunciation")
            .and_then(|n| n.attribute("strongs"))
            .map(|s| s.to_string());

        let derivation = entry
            .children()
            .find(|n| n.is_element() && n.tag_name().name() == "strongs_derivation")
            .map(text_content);
        let definition = entry
            .children()
            .find(|n| n.is_element() && n.tag_name().name() == "strongs_def")
            .map(text_content)
            .unwrap_or_default();
        let kjv_usage = entry
            .children()
            .find(|n| n.is_element() && n.tag_name().name() == "kjv_def")
            .map(text_content);

        entries.push(Entry {
            id,
            language: "greek",
            original_word,
            transliteration,
            pronunciation,
            short_definition: None,
            definition,
            derivation,
            kjv_usage,
        });
    }

    Ok(entries)
}

pub fn import(conn: &mut Connection, hebrew_path: &Path, greek_path: &Path) -> anyhow::Result<usize> {
    let mut all = parse_hebrew(hebrew_path)?;
    all.extend(parse_greek(greek_path)?);
    let count = all.len();

    let tx = conn.transaction()?;
    {
        let mut stmt = tx.prepare(
            "INSERT INTO strongs_entries (id, language, original_word, transliteration, pronunciation, short_definition, definition, derivation, kjv_usage)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
             ON CONFLICT(id) DO NOTHING",
        )?;
        for e in &all {
            stmt.execute(params![
                e.id,
                e.language,
                e.original_word,
                e.transliteration,
                e.pronunciation,
                e.short_definition,
                e.definition,
                e.derivation,
                e.kjv_usage,
            ])?;
        }
    }
    tx.commit()?;
    Ok(count)
}
