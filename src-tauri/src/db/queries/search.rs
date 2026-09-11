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

/// Turns free text into a safe FTS5 match expression.
///
/// Supports: quoted phrases (`"in the beginning"`, matched exactly, no
/// prefix expansion), `OR` and `AND` as explicit boolean operators (matching
/// FTS5's own keywords), `NOT word` or a bare `-word` to exclude a term, and
/// otherwise treats each word as a prefix match (`love` -> `"love"*`) with
/// implicit AND between adjacent terms -- the same default FTS5 already
/// applies, so this is a superset of the plain free-text search that existed
/// before rather than a behavior change for the common case.
///
/// The three keywords only act as operators in exact uppercase (`AND`/`OR`/
/// `NOT`), matching SQLite FTS5's own documented convention -- lowercase
/// "not"/"and"/"or" are ordinary search terms. This matters a lot for this
/// app specifically: "not" is one of the commonest words in English Bible
/// text ("Fear not", "Judge not"), so treating it as an operator regardless
/// of case broke plain-language search on some of the most common queries a
/// user would type.
///
/// FTS5's NOT is a binary operator (`a NOT b`), not a unary prefix, so a
/// negated term with nothing positive before it (e.g. a query that's just
/// `-word`) has no left-hand side to attach to and is simply dropped rather
/// than emitted as invalid syntax.
fn build_match_expr(query: &str) -> String {
    let mut out: Vec<String> = Vec::new();
    let mut chars = query.chars().peekable();
    let mut negate_next = false;

    let push_term = |out: &mut Vec<String>, term: String, negate: bool| {
        if negate && out.is_empty() {
            return;
        }
        out.push(if negate { format!("NOT {term}") } else { term });
    };

    loop {
        while matches!(chars.peek(), Some(c) if c.is_whitespace()) {
            chars.next();
        }
        let Some(&c) = chars.peek() else { break };

        if c == '"' {
            chars.next();
            let mut phrase = String::new();
            for ch in chars.by_ref() {
                if ch == '"' {
                    break;
                }
                phrase.push(ch);
            }
            if !phrase.trim().is_empty() {
                let escaped = phrase.replace('"', "\"\"");
                push_term(&mut out, format!("\"{escaped}\""), negate_next);
            }
            negate_next = false;
            continue;
        }

        let mut word = String::new();
        while matches!(chars.peek(), Some(c) if !c.is_whitespace()) {
            word.push(chars.next().unwrap());
        }
        if word.is_empty() {
            continue;
        }

        match word.as_str() {
            "AND" => continue, // FTS5's default between adjacent terms; nothing to emit.
            "OR" => {
                // Also a binary operator -- dropped if there's no left-hand term yet.
                if !out.is_empty() {
                    out.push("OR".to_string());
                }
                negate_next = false;
            }
            "NOT" => negate_next = true,
            _ => {
                let (word, negate) = match word.strip_prefix('-') {
                    Some(rest) => (rest, true),
                    None => (word.as_str(), negate_next),
                };
                if !word.is_empty() {
                    let escaped = word.replace('"', "\"\"");
                    push_term(&mut out, format!("\"{escaped}\"*"), negate);
                }
                negate_next = false;
            }
        }
    }

    if out.last().map(String::as_str) == Some("OR") {
        out.pop();
    }
    out.join(" ")
}

#[cfg(test)]
mod tests {
    use super::build_match_expr;

    #[test]
    fn plain_words_become_anded_prefix_terms() {
        assert_eq!(build_match_expr("love joy"), "\"love\"* \"joy\"*");
    }

    #[test]
    fn quoted_phrase_is_kept_exact_without_prefix() {
        assert_eq!(build_match_expr("\"in the beginning\""), "\"in the beginning\"");
    }

    #[test]
    fn or_between_two_terms() {
        assert_eq!(build_match_expr("faith OR hope"), "\"faith\"* OR \"hope\"*");
    }

    #[test]
    fn explicit_and_is_a_no_op_since_fts5_defaults_to_it() {
        assert_eq!(build_match_expr("faith AND hope"), "\"faith\"* \"hope\"*");
    }

    #[test]
    fn dash_prefix_negates_a_term() {
        assert_eq!(build_match_expr("love -hate"), "\"love\"* NOT \"hate\"*");
    }

    #[test]
    fn not_keyword_negates_the_next_term() {
        assert_eq!(build_match_expr("love NOT hate"), "\"love\"* NOT \"hate\"*");
    }

    #[test]
    fn leading_negation_with_no_left_operand_is_dropped() {
        assert_eq!(build_match_expr("-hate"), "");
        assert_eq!(build_match_expr("NOT hate"), "");
    }

    #[test]
    fn dangling_or_with_no_right_operand_is_dropped() {
        assert_eq!(build_match_expr("love OR"), "\"love\"*");
        assert_eq!(build_match_expr("OR love"), "\"love\"*");
    }

    #[test]
    fn embedded_quote_in_a_word_is_escaped() {
        assert_eq!(build_match_expr("o\"brien"), "\"o\"\"brien\"*");
    }

    #[test]
    fn lowercase_not_is_an_ordinary_term_not_an_operator() {
        // "not" is extremely common in English Bible text (Fear not, Judge
        // not) -- it must never be silently reinterpreted as negation.
        assert_eq!(
            build_match_expr("let not your heart be troubled"),
            "\"let\"* \"not\"* \"your\"* \"heart\"* \"be\"* \"troubled\"*"
        );
    }

    #[test]
    fn bare_lowercase_and_or_not_are_ordinary_terms() {
        assert_eq!(build_match_expr("not"), "\"not\"*");
        assert_eq!(build_match_expr("and"), "\"and\"*");
        assert_eq!(build_match_expr("or"), "\"or\"*");
    }
}

/// Optional narrowing applied on top of the translation-scoped FTS match --
/// `book_id` to one book, or `testament` to "OT"/"NT". Both `None` means the
/// whole Bible, matching the search's pre-Phase-6 behavior.
#[derive(Default)]
pub struct VerseSearchScope {
    pub book_id: Option<i64>,
    pub testament: Option<String>,
}

pub fn search_verses(
    conn: &Connection,
    query: &str,
    translation_ids: &[i64],
    scope: &VerseSearchScope,
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
    let mut scope_sql = String::new();
    if scope.book_id.is_some() {
        scope_sql.push_str(" AND v.book_id = ?");
    }
    if scope.testament.is_some() {
        scope_sql.push_str(" AND b.testament = ?");
    }
    let needs_books_join = scope.testament.is_some();
    let sql = format!(
        "SELECT v.id, v.book_id, v.chapter, v.verse, t.code,
                snippet(verses_fts, 0, '[', ']', '…', 10)
         FROM verses_fts
         JOIN verses v ON v.id = verses_fts.rowid
         JOIN translations t ON t.id = v.translation_id
         {}
         WHERE verses_fts MATCH ?1 AND v.translation_id IN ({placeholders}){scope_sql}
         ORDER BY bm25(verses_fts)
         LIMIT ?{}",
        if needs_books_join { "JOIN books b ON b.id = v.book_id" } else { "" },
        translation_ids.len() + 2 + scope.book_id.is_some() as usize + scope.testament.is_some() as usize
    );
    let mut stmt = conn.prepare(&sql)?;
    let mut bind_params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(match_expr)];
    for id in translation_ids {
        bind_params.push(Box::new(*id));
    }
    if let Some(book_id) = scope.book_id {
        bind_params.push(Box::new(book_id));
    }
    if let Some(testament) = scope.testament.clone() {
        bind_params.push(Box::new(testament));
    }
    bind_params.push(Box::new(limit));
    let param_refs: Vec<&dyn rusqlite::ToSql> = bind_params.iter().map(|b| b.as_ref()).collect();

    let rows = stmt.query_map(param_refs.as_slice(), |r| {
        Ok(SearchResult {
            kind: "verse".to_string(),
            entry_id: r.get(0)?,
            book_id: Some(r.get(1)?),
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
            book_id: Some(r.get(1)?),
            chapter: r.get(2)?,
            verse: r.get(3)?,
            source_label: r.get(4)?,
            snippet: r.get(5)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// Searches the user's own study notes: passage notes (verse-range) and
/// chapter notes (whole-chapter), unioned into one result set so both show
/// up together in the "Notes" search tab.
pub fn search_notes(conn: &Connection, query: &str, limit: i64) -> anyhow::Result<Vec<SearchResult>> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    let match_expr = build_match_expr(query);

    let mut stmt = conn.prepare(
        "SELECT n.id, n.book_id, n.chapter, n.verse_start, snippet(notes_fts, 0, '[', ']', '…', 12)
         FROM notes_fts JOIN notes n ON n.id = notes_fts.rowid
         WHERE notes_fts MATCH ?1
         ORDER BY bm25(notes_fts) LIMIT ?2",
    )?;
    let mut results = stmt
        .query_map(rusqlite::params![match_expr, limit], |r| {
            Ok(SearchResult {
                kind: "note".to_string(),
                entry_id: r.get(0)?,
                book_id: Some(r.get(1)?),
                chapter: r.get::<_, i64>(2)?.into(),
                verse: r.get::<_, i64>(3)?.into(),
                source_label: "Note".to_string(),
                snippet: r.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut stmt = conn.prepare(
        "SELECT cn.id, cn.book_id, cn.chapter, snippet(chapter_notes_fts, 0, '[', ']', '…', 12)
         FROM chapter_notes_fts JOIN chapter_notes cn ON cn.id = chapter_notes_fts.rowid
         WHERE chapter_notes_fts MATCH ?1
         ORDER BY bm25(chapter_notes_fts) LIMIT ?2",
    )?;
    let chapter_results = stmt
        .query_map(rusqlite::params![match_expr, limit], |r| {
            Ok(SearchResult {
                kind: "note".to_string(),
                entry_id: r.get(0)?,
                book_id: Some(r.get(1)?),
                chapter: r.get::<_, i64>(2)?.into(),
                verse: None,
                source_label: "Chapter Note".to_string(),
                snippet: r.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    results.extend(chapter_results);
    results.truncate(limit as usize);
    Ok(results)
}

/// Prayer journal entries: at most one linked passage per entry (a direct
/// column, not a link table -- see USER_MIGRATION_0002's schema comment),
/// so this is a plain left-hand reference rather than a subquery.
pub fn search_prayer_entries(conn: &Connection, query: &str, limit: i64) -> anyhow::Result<Vec<SearchResult>> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    let match_expr = build_match_expr(query);
    let mut stmt = conn.prepare(
        "SELECT pe.id, pe.entry_date, pe.book_id, pe.chapter, pe.verse_start,
                snippet(prayer_entries_fts, -1, '[', ']', '…', 12)
         FROM prayer_entries_fts JOIN prayer_entries pe ON pe.id = prayer_entries_fts.rowid
         WHERE prayer_entries_fts MATCH ?1
         ORDER BY bm25(prayer_entries_fts) LIMIT ?2",
    )?;
    let rows = stmt.query_map(rusqlite::params![match_expr, limit], |r| {
        let entry_date: String = r.get(1)?;
        Ok(SearchResult {
            kind: "prayer".to_string(),
            entry_id: r.get(0)?,
            book_id: r.get(2)?,
            chapter: r.get(3)?,
            verse: r.get(4)?,
            source_label: format!("Prayer: {entry_date}"),
            snippet: r.get(5)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// Records that a search was executed: bumps `created_at` on a repeat query
/// rather than duplicating it, then prunes unsaved history down to the most
/// recent 20 -- pinned (`saved = 1`) entries are exempt from pruning.
pub fn record_search(conn: &Connection, query: &str) -> anyhow::Result<()> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(());
    }
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO search_history (query, created_at) VALUES (?1, ?2)
         ON CONFLICT(query) DO UPDATE SET created_at = excluded.created_at",
        rusqlite::params![trimmed, now],
    )?;
    conn.execute(
        "DELETE FROM search_history WHERE saved = 0 AND id NOT IN (
           SELECT id FROM search_history WHERE saved = 0 ORDER BY created_at DESC LIMIT 20
         )",
        [],
    )?;
    Ok(())
}

pub fn list_recent_searches(conn: &Connection, limit: i64) -> anyhow::Result<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT query FROM search_history WHERE saved = 0 ORDER BY created_at DESC LIMIT ?1",
    )?;
    let rows = stmt.query_map(rusqlite::params![limit], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn list_saved_searches(conn: &Connection) -> anyhow::Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT query FROM search_history WHERE saved = 1 ORDER BY created_at DESC")?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn set_search_saved(conn: &Connection, query: &str, saved: bool) -> anyhow::Result<()> {
    conn.execute(
        "UPDATE search_history SET saved = ?1 WHERE query = ?2",
        rusqlite::params![saved, query],
    )?;
    Ok(())
}

pub fn delete_search_history(conn: &Connection, query: &str) -> anyhow::Result<()> {
    conn.execute("DELETE FROM search_history WHERE query = ?1", rusqlite::params![query])?;
    Ok(())
}
