use rusqlite::{params, Connection};
use std::path::Path;

/// Thayer's Greek-English Lexicon of the New Testament (Joseph Henry Thayer,
/// 1889, public domain) is optional bundled content -- unlike Strong's, no
/// copy of the text ships in this repo yet, so this importer is a no-op
/// until one is dropped in.
///
/// Expected input: `reference/thayers/thayers.xml`, one `<entry>` per Strong's
/// Greek number, e.g.:
///
///   <entries>
///     <entry strongs="G26"><definition>...long-form prose...</definition></entry>
///     ...
///   </entries>
///
/// `strongs` is the bare number (no "G" prefix required, though either is
/// accepted); `definition` may contain nested markup, whose text content is
/// flattened. Missing file => Ok(0), not an error, so builds keep working
/// without the data.
pub fn import(conn: &mut Connection, path: &Path) -> anyhow::Result<usize> {
    if !path.exists() {
        return Ok(0);
    }

    let text = std::fs::read_to_string(path)?;
    let sanitized = crate::import::thml::sanitize_thml_xml(&text);
    let doc = roxmltree::Document::parse(&sanitized)?;

    let mut rows: Vec<(String, String)> = Vec::new();
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

        let definition = entry
            .children()
            .find(|n| n.is_element() && n.tag_name().name() == "definition")
            .map(|n| n.text().unwrap_or("").trim().to_string())
            .filter(|s| !s.is_empty());

        if let Some(definition) = definition {
            rows.push((strongs_id, definition));
        }
    }

    let count = rows.len();
    let tx = conn.transaction()?;
    {
        let mut stmt = tx.prepare(
            "INSERT INTO thayers_entries (strongs_id, definition) VALUES (?1, ?2)
             ON CONFLICT(strongs_id) DO NOTHING",
        )?;
        for (id, definition) in &rows {
            stmt.execute(params![id, definition])?;
        }
    }
    tx.commit()?;
    Ok(count)
}
