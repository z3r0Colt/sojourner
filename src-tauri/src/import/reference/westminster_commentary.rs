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
#[derive(Deserialize)]
struct RawEntry {
    chapter: i64,
    #[serde(default)]
    section: Option<i64>,
    text: String,
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
                insert.execute(params![source_id, e.chapter, e.section, i as i64, e.text])?;
                total += 1;
            }
        }
    }

    tx.commit()?;
    Ok(total)
}
