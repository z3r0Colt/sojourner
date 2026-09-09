use rusqlite::{params, Connection};
use serde::Deserialize;
use std::path::Path;

/// One entry from a pre-extracted commentary JSON file. `section` is present
/// when the source text cleanly splits per WCF section (Shaw); absent when a
/// source is stored as one whole-chapter block (Hodge, whose source PDF mixes
/// several inconsistent section-marking conventions across chapters, too
/// fragile to split reliably -- see reference/westminster_commentary/README
/// intent in the extraction scripts this JSON was produced by). Any other
/// fields present in the JSON (e.g. Hodge's "heading") are simply ignored.
#[derive(Deserialize)]
struct RawEntry {
    chapter: i64,
    #[serde(default)]
    section: Option<i64>,
    text: String,
}

struct SourceSpec {
    code: &'static str,
    title: &'static str,
    author: &'static str,
    file: &'static str,
}

const SOURCES: &[SourceSpec] = &[
    SourceSpec {
        code: "hodge",
        title: "A Commentary on the Confession of Faith",
        author: "A. A. Hodge",
        file: "hodge.json",
    },
    SourceSpec {
        code: "shaw",
        title: "An Exposition of the Confession of Faith",
        author: "Robert Shaw",
        file: "shaw.json",
    },
];

pub fn import(conn: &mut Connection, dir: &Path) -> anyhow::Result<usize> {
    let tx = conn.transaction()?;
    let mut total = 0usize;

    for spec in SOURCES {
        let path = dir.join(spec.file);
        if !path.exists() {
            continue;
        }
        let raw = std::fs::read_to_string(&path)?;
        let entries: Vec<RawEntry> = serde_json::from_str(&raw)
            .map_err(|e| anyhow::anyhow!("parsing {}: {e}", path.display()))?;

        tx.execute(
            "INSERT INTO westminster_commentary_sources (code, title, author) VALUES (?1,?2,?3)
             ON CONFLICT(code) DO UPDATE SET title = excluded.title, author = excluded.author",
            params![spec.code, spec.title, spec.author],
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
