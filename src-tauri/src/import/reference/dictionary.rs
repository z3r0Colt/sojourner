use rusqlite::{params, Connection};
use serde::Deserialize;
use std::collections::HashMap;
use std::path::Path;

#[derive(Deserialize)]
struct RawDefinition {
    source: String,
    text: String,
}

#[derive(Deserialize)]
struct RawEntry {
    name: String,
    slug: String,
    definitions: Vec<RawDefinition>,
}

const SOURCE_LABELS: &[(&str, &str)] = &[("EAS", "Easton's"), ("SMI", "Smith's")];

fn source_label(code: &str) -> &str {
    SOURCE_LABELS
        .iter()
        .find(|(c, _)| *c == code)
        .map(|(_, l)| *l)
        .unwrap_or(code)
}

/// Parses one letter file (a.json..z.json), an object keyed by term -> entry.
fn parse_file(path: &Path) -> anyhow::Result<Vec<(String, String, String)>> {
    let text = std::fs::read_to_string(path)?;
    let map: HashMap<String, RawEntry> = serde_json::from_str(&text)?;
    let mut out = Vec::new();
    for entry in map.into_values() {
        let body = entry
            .definitions
            .iter()
            .map(|d| format!("({}) {}", source_label(&d.source), d.text))
            .collect::<Vec<_>>()
            .join("\n\n");
        if body.trim().is_empty() {
            continue;
        }
        out.push((entry.name, entry.slug, body));
    }
    Ok(out)
}

pub fn import(conn: &mut Connection, dir: &Path) -> anyhow::Result<usize> {
    let mut all = Vec::new();
    if let Ok(files) = std::fs::read_dir(dir) {
        for f in files.flatten() {
            let path = f.path();
            if path.extension().map(|e| e == "json").unwrap_or(false)
                && !path.file_name().unwrap_or_default().to_string_lossy().starts_with('_')
            {
                all.extend(parse_file(&path)?);
            }
        }
    }
    let count = all.len();

    let tx = conn.transaction()?;
    {
        let mut stmt = tx.prepare(
            "INSERT INTO dictionary_entries (term, slug, body) VALUES (?1,?2,?3)
             ON CONFLICT(slug) DO UPDATE SET term=excluded.term, body=excluded.body",
        )?;
        for (term, slug, body) in &all {
            stmt.execute(params![term, slug, body])?;
        }
    }
    tx.commit()?;
    Ok(count)
}
