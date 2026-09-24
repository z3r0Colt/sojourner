//! The lexicon shelf (see CONTENT_MIGRATION_0022).

use rusqlite::{params, Connection};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct LexiconSource {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub language: String,
    pub license: String,
    pub credit: String,
    pub entry_count: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct LexiconEntry {
    pub id: i64,
    pub source_code: String,
    pub source_name: String,
    pub headword: String,
    pub strongs_id: Option<String>,
    pub html: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct LexiconHit {
    pub id: i64,
    pub source_code: String,
    pub source_name: String,
    pub headword: String,
    pub strongs_id: Option<String>,
    pub snippet: String,
}

fn has_lexicons(conn: &Connection) -> bool {
    conn.query_row("SELECT 1 FROM lexicon_sources LIMIT 1", [], |_| Ok(())).is_ok()
}

pub fn list_sources(conn: &Connection) -> anyhow::Result<Vec<LexiconSource>> {
    if !has_lexicons(conn) {
        return Ok(vec![]);
    }
    let mut stmt = conn.prepare(
        "SELECT s.id, s.code, s.name, s.language, s.license, s.credit,
                (SELECT COUNT(*) FROM lexicon_entries e WHERE e.source_id = s.id)
         FROM lexicon_sources s ORDER BY s.sort_order",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(LexiconSource {
            id: r.get(0)?,
            code: r.get(1)?,
            name: r.get(2)?,
            language: r.get(3)?,
            license: r.get(4)?,
            credit: r.get(5)?,
            entry_count: r.get(6)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

const ENTRY_COLS: &str = "e.id, s.code, s.name, e.headword, e.strongs_id, e.html";

fn map_entry(r: &rusqlite::Row) -> rusqlite::Result<LexiconEntry> {
    Ok(LexiconEntry {
        id: r.get(0)?,
        source_code: r.get(1)?,
        source_name: r.get(2)?,
        headword: r.get(3)?,
        strongs_id: r.get(4)?,
        html: r.get(5)?,
    })
}

/// Every lexicon's entries for a Strong's number, in shelf order.
pub fn entries_for_strongs(conn: &Connection, strongs_id: &str) -> anyhow::Result<Vec<LexiconEntry>> {
    if !has_lexicons(conn) {
        return Ok(vec![]);
    }
    let mut stmt = conn.prepare(&format!(
        "SELECT {ENTRY_COLS} FROM lexicon_entries e JOIN lexicon_sources s ON s.id = e.source_id
         WHERE e.strongs_id = ?1 ORDER BY s.sort_order, e.id"
    ))?;
    let rows = stmt.query_map(params![strongs_id], map_entry)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn get_entry(conn: &Connection, id: i64) -> anyhow::Result<Option<LexiconEntry>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {ENTRY_COLS} FROM lexicon_entries e JOIN lexicon_sources s ON s.id = e.source_id WHERE e.id = ?1"
    ))?;
    let entry = stmt.query_map(params![id], map_entry)?.next().transpose()?;
    Ok(entry)
}

fn is_original_script(s: &str) -> bool {
    s.chars().any(|c| matches!(c as u32, 0x0370..=0x03FF | 0x1F00..=0x1FFF | 0x0590..=0x05FF))
}

/// One search over every lexicon (or those named by code): English words
/// through the index, Greek and Hebrew by their bare letters, so λογος finds
/// λόγος.
pub fn search(conn: &Connection, query: &str, sources: &[String], limit: i64) -> anyhow::Result<Vec<LexiconHit>> {
    if query.trim().is_empty() || !has_lexicons(conn) {
        return Ok(vec![]);
    }
    let codes: Vec<String> = sources
        .iter()
        .map(|c| c.chars().filter(|ch| ch.is_ascii_alphanumeric()).collect::<String>())
        .filter(|c| !c.is_empty())
        .collect();
    let source_filter = if codes.is_empty() {
        String::new()
    } else {
        format!(" AND s.code IN ({})", codes.iter().map(|c| format!("'{c}'")).collect::<Vec<_>>().join(","))
    };
    let map = |r: &rusqlite::Row| -> rusqlite::Result<LexiconHit> {
        Ok(LexiconHit {
            id: r.get(0)?,
            source_code: r.get(1)?,
            source_name: r.get(2)?,
            headword: r.get(3)?,
            strongs_id: r.get(4)?,
            snippet: super::search::escape_snippet(&r.get::<_, String>(5)?),
        })
    };
    if is_original_script(query) {
        // Headwords: exact bare letters first, then those beginning so --
        // a Greek or Hebrew word typed is almost always a lookup.
        let plain = crate::plain::plain_word(query);
        let mut stmt = conn.prepare(&format!(
            "SELECT e.id, s.code, s.name, e.headword, e.strongs_id, substr(e.plain_text, 1, 180)
             FROM lexicon_entries e JOIN lexicon_sources s ON s.id = e.source_id
             WHERE (e.headword_plain = ?1 OR e.headword_plain LIKE ?1 || '%'){source_filter}
             ORDER BY e.headword_plain <> ?1, length(e.headword_plain), s.sort_order LIMIT ?2"
        ))?;
        let rows = stmt.query_map(params![plain, limit], map)?;
        return Ok(rows.collect::<Result<Vec<_>, _>>()?);
    }
    let match_expr = super::search::build_match_expr(query);
    if match_expr.is_empty() {
        return Ok(vec![]);
    }
    let mut stmt = conn.prepare(&format!(
        "SELECT e.id, s.code, s.name, e.headword, e.strongs_id, snippet(lexicon_fts, 2, char(2), char(3), '…', 14)
         FROM lexicon_fts CROSS JOIN lexicon_entries e ON e.id = lexicon_fts.rowid
         JOIN lexicon_sources s ON s.id = e.source_id
         WHERE lexicon_fts MATCH ?1{source_filter}
         ORDER BY bm25(lexicon_fts) LIMIT ?2"
    ))?;
    let rows = stmt.query_map(params![match_expr, limit], map)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// (code, name, first entry id) for each lexicon with an entry for the
/// number -- the popup's row of buttons, without loading every article.
pub fn sources_for_strongs(conn: &Connection, strongs_id: &str) -> anyhow::Result<Vec<(String, String, i64)>> {
    if !has_lexicons(conn) {
        return Ok(vec![]);
    }
    let mut stmt = conn.prepare(
        "SELECT s.code, s.name, MIN(e.id) FROM lexicon_entries e JOIN lexicon_sources s ON s.id = e.source_id
         WHERE e.strongs_id = ?1 GROUP BY s.id ORDER BY s.sort_order",
    )?;
    let rows = stmt.query_map(params![strongs_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}
