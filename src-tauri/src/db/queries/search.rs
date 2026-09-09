use crate::models::SearchResult;
use rusqlite::Connection;

// Both FTS5 tables here are already external-content tables (`content=`, no
// duplicated verse/commentary text in the index itself). Results are ranked
// by bm25() relevance rather than passage order. Scripture and commentary
// are returned as two separate result sets (see `commands::search::search`)
// rather than one merged, cross-scope ranking, and the UI always surfaces
// the Scripture tab first -- so "Scripture outranks commentary" holds at the
// tab level today. If a future unified/merged search view (Phase 6) needs a
// single ranked feed, blend the two bm25 scores with a Scripture-favoring
// weight there rather than trying to compare raw bm25 values across schemas.

/// Turns free text into a safe FTS5 match expression: each token is quoted and
/// suffixed with * for prefix matching, tokens are implicitly AND-ed by FTS5.
fn build_match_expr(query: &str) -> String {
    query
        .split_whitespace()
        .map(|tok| {
            let escaped = tok.replace('"', "\"\"");
            format!("\"{escaped}\"*")
        })
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn search_verses(
    conn: &Connection,
    query: &str,
    translation_ids: &[i64],
    limit: i64,
) -> anyhow::Result<Vec<SearchResult>> {
    if query.trim().is_empty() || translation_ids.is_empty() {
        return Ok(vec![]);
    }
    let match_expr = build_match_expr(query);
    let placeholders = translation_ids
        .iter()
        .map(|_| "?")
        .collect::<Vec<_>>()
        .join(",");
    let sql = format!(
        "SELECT v.id, v.book_id, v.chapter, v.verse, t.code,
                snippet(verses_fts, 0, '[', ']', '…', 10)
         FROM verses_fts
         JOIN verses v ON v.id = verses_fts.rowid
         JOIN translations t ON t.id = v.translation_id
         WHERE verses_fts MATCH ?1 AND v.translation_id IN ({placeholders})
         ORDER BY bm25(verses_fts)
         LIMIT ?{}",
        translation_ids.len() + 2
    );
    let mut stmt = conn.prepare(&sql)?;
    let mut bind_params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(match_expr)];
    for id in translation_ids {
        bind_params.push(Box::new(*id));
    }
    bind_params.push(Box::new(limit));
    let param_refs: Vec<&dyn rusqlite::ToSql> = bind_params.iter().map(|b| b.as_ref()).collect();

    let rows = stmt.query_map(param_refs.as_slice(), |r| {
        Ok(SearchResult {
            kind: "verse".to_string(),
            entry_id: r.get(0)?,
            book_id: r.get(1)?,
            chapter: r.get::<_, i64>(2)?.into(),
            verse: r.get::<_, i64>(3)?.into(),
            source_label: r.get(4)?,
            snippet: r.get(5)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn search_commentary(
    conn: &Connection,
    query: &str,
    source_ids: &[i64],
    limit: i64,
) -> anyhow::Result<Vec<SearchResult>> {
    if query.trim().is_empty() || source_ids.is_empty() {
        return Ok(vec![]);
    }
    let match_expr = build_match_expr(query);
    let placeholders = source_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT ce.id, ce.book_id, ce.chapter, ce.verse_start, cs2.title,
                snippet(commentary_fts, 0, '[', ']', '…', 12)
         FROM commentary_fts
         JOIN commentary_entries ce ON ce.id = commentary_fts.rowid
         JOIN commentary_sections sec ON sec.id = ce.section_id
         JOIN commentary_sources cs2 ON cs2.id = sec.commentary_source_id
         WHERE commentary_fts MATCH ?1 AND sec.commentary_source_id IN ({placeholders})
         ORDER BY bm25(commentary_fts)
         LIMIT ?{}",
        source_ids.len() + 2
    );
    let mut stmt = conn.prepare(&sql)?;
    let mut bind_params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(match_expr)];
    for id in source_ids {
        bind_params.push(Box::new(*id));
    }
    bind_params.push(Box::new(limit));
    let param_refs: Vec<&dyn rusqlite::ToSql> = bind_params.iter().map(|b| b.as_ref()).collect();

    let rows = stmt.query_map(param_refs.as_slice(), |r| {
        Ok(SearchResult {
            kind: "commentary".to_string(),
            entry_id: r.get(0)?,
            book_id: r.get(1)?,
            chapter: r.get(2)?,
            verse: r.get(3)?,
            source_label: r.get(4)?,
            snippet: r.get(5)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}
