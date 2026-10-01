use rusqlite::{params, Connection};
use serde::Deserialize;
use std::path::Path;

/// One entry from a pre-extracted commentary JSON file. `section` is present
/// when the source text cleanly splits per WCF section (Shaw); absent when a
/// source is stored as one whole-chapter (or, for Vincent, one WSC question)
/// block -- Hodge, whose source PDF mixes several inconsistent
/// section-marking conventions across chapters, too fragile to split
/// reliably; and Vincent, whose 107 questions have no sub-section structure
/// of their own to split on. Any other fields present in the JSON (e.g.
/// Hodge's "heading") are simply ignored.
///
/// An entry may instead name several (`chapters`), when its author takes
/// them together -- Ridgley on Larger Catechism 14 and 15, Beattie's chapter
/// on WSC 21-22 -- and is filed under each of them.
#[derive(Deserialize)]
struct RawEntry {
    #[serde(default)]
    chapter: Option<i64>,
    #[serde(default)]
    chapters: Vec<i64>,
    #[serde(default)]
    section: Option<i64>,
    text: String,
}

impl RawEntry {
    fn numbers(&self) -> Vec<i64> {
        if self.chapters.is_empty() {
            self.chapter.into_iter().collect()
        } else {
            self.chapters.clone()
        }
    }
}

/// A confession/catechism exposition source, as declared in
/// `manifest.json` alongside the entry files themselves -- adding a new
/// exposition (once its entries file exists, in the same shape as
/// hodge.json/shaw.json/vincent.json) is a manifest edit, not a code
/// change. This is deliberately the same JSON-array-of-entries shape those
/// three already use, so a work like Watson's Body of Divinity (which
/// follows the WSC's own question order) drops in as `document_code:
/// "wsc"` the same way Vincent does; a source keyed to individual verses
/// rather than WCF chapters or WSC questions belongs in the ordinary
/// commentary_sources/commentary_entries pipeline instead (see
/// import::thml), not here.
#[derive(Deserialize)]
struct SourceSpec {
    code: String,
    title: String,
    author: String,
    file: String,
    /// Which Westminster document's own numbering `chapter` matches --
    /// "wcf" chapters or "wsc"/"wlc" questions. See CONTENT_MIGRATION_0005.
    document_code: String,
}

pub fn import(conn: &mut Connection, dir: &Path) -> anyhow::Result<usize> {
    let manifest_path = dir.join("manifest.json");
    if !manifest_path.exists() {
        return Ok(0);
    }
    let manifest_raw = std::fs::read_to_string(&manifest_path)?;
    let sources: Vec<SourceSpec> = serde_json::from_str(&manifest_raw)
        .map_err(|e| anyhow::anyhow!("parsing {}: {e}", manifest_path.display()))?;

    let tx = conn.transaction()?;
    let mut total = 0usize;

    for spec in &sources {
        let path = dir.join(&spec.file);
        if !path.exists() {
            continue;
        }
        let raw = std::fs::read_to_string(&path)?;
        let entries: Vec<RawEntry> = serde_json::from_str(&raw)
            .map_err(|e| anyhow::anyhow!("parsing {}: {e}", path.display()))?;

        tx.execute(
            "INSERT INTO westminster_commentary_sources (code, title, author, document_code) VALUES (?1,?2,?3,?4)
             ON CONFLICT(code) DO UPDATE SET title = excluded.title, author = excluded.author, document_code = excluded.document_code",
            params![spec.code, spec.title, spec.author, spec.document_code],
        )?;
        let source_id: i64 =
            tx.query_row("SELECT id FROM westminster_commentary_sources WHERE code = ?1", params![spec.code], |r| r.get(0))?;
        tx.execute("DELETE FROM westminster_commentary_entries WHERE source_id = ?1", params![source_id])?;

        {
            let mut insert = tx.prepare(
                "INSERT INTO westminster_commentary_entries (source_id, chapter, section, sort_order, body) VALUES (?1,?2,?3,?4,?5)",
            )?;
            for (i, e) in entries.iter().enumerate() {
                let numbers = e.numbers();
                if numbers.is_empty() {
                    anyhow::bail!("{}: entry {i} names no chapter or question", path.display());
                }
                for n in numbers {
                    insert.execute(params![source_id, n, e.section, i as i64, e.text])?;
                    total += 1;
                }
            }
        }
    }

    tx.commit()?;
    Ok(total)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_entry_on_several_questions_is_filed_under_each() {
        let one: RawEntry = serde_json::from_str(r#"{"chapter": 11, "section": 2, "text": "x"}"#).unwrap();
        assert_eq!(one.numbers(), vec![11]);
        let many: RawEntry = serde_json::from_str(r#"{"chapters": [14, 15], "text": "x"}"#).unwrap();
        assert_eq!(many.numbers(), vec![14, 15]);
        let none: RawEntry = serde_json::from_str(r#"{"text": "x"}"#).unwrap();
        assert!(none.numbers().is_empty());
    }
}
