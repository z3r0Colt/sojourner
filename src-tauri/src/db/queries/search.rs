use super::NOT_DELETED;
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
pub(crate) fn build_match_expr(query: &str) -> String {
    build_match_expr_with(query, true)
}

/// `build_match_expr` with the prefix expansion under the caller's control.
/// With `prefix` false a bare word is matched whole: `son` finds "son" (and,
/// through the stemmer, "sons") but no longer "song" or "Sondern". Quoted
/// phrases were always exact and are unaffected.
pub(crate) fn build_match_expr_with(query: &str, prefix: bool) -> String {
    let star = if prefix { "*" } else { "" };
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
                    push_term(&mut out, format!("\"{escaped}\"{star}"), negate);
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
    use super::{build_match_expr, build_match_expr_with, escape_snippet};

    #[test]
    fn whole_words_drop_the_prefix_star_but_keep_phrases_and_operators() {
        assert_eq!(build_match_expr_with("son", false), "\"son\"");
        assert_eq!(build_match_expr_with("love -hate", false), "\"love\" NOT \"hate\"");
        assert_eq!(build_match_expr_with("\"in the beginning\" light", false), "\"in the beginning\" \"light\"");
    }

    /// A snippet is written into the page as HTML, so whatever someone typed
    /// has to arrive escaped -- while the match markers, which the page turns
    /// into the highlight, are left exactly as they are.
    #[test]
    fn a_snippet_is_escaped_but_keeps_its_match_markers() {
        assert_eq!(escape_snippet("the [oath] of God"), "the [oath] of God");
        assert_eq!(escape_snippet("a <div> in [prose]"), "a &lt;div&gt; in [prose]");
        assert_eq!(escape_snippet("Law & [Gospel]"), "Law &amp; [Gospel]");
        assert_eq!(escape_snippet("<script>alert(1)</script>"), "&lt;script&gt;alert(1)&lt;/script&gt;");
    }

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

/// How the Scripture and commentary searches match and order.
#[derive(Default, Clone, Copy)]
pub struct SearchOptions {
    /// Match each bare word whole rather than as a prefix (see
    /// `build_match_expr_with`).
    pub whole_words: bool,
    /// Return hits in Bible order (book, chapter, verse) rather than by
    /// bm25 relevance -- what a concordance reader expects when the list is
    /// long and every hit is as good as the next.
    pub passage_order: bool,
}

/// One tab's worth of results, with the number of rows the query matched in
/// all. `total` is only counted when the page came back full: a page shorter
/// than `limit` is already the whole answer, and the count costs a second
/// pass over the index.
pub struct SearchPage {
    pub results: Vec<SearchResult>,
    pub total: i64,
}

/// The `WHERE` fragment that narrows a Scripture or commentary search by
/// book or testament, and the values to bind for it, in order. Both
/// searches carry a `book_id` on the row and reach the testament through
/// `books`, so the same fragment serves both once the alias is supplied.
fn scope_sql(scope: &VerseSearchScope, alias: &str) -> (String, Vec<Box<dyn rusqlite::ToSql>>) {
    let mut sql = String::new();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    if let Some(book_id) = scope.book_id {
        sql.push_str(&format!(" AND {alias}.book_id = ?"));
        params.push(Box::new(book_id));
    }
    if let Some(testament) = scope.testament.clone() {
        sql.push_str(" AND b.testament = ?");
        params.push(Box::new(testament));
    }
    (sql, params)
}

fn count_matches(conn: &Connection, sql: &str, params: &[&dyn rusqlite::ToSql]) -> anyhow::Result<i64> {
    Ok(conn.query_row(sql, params, |r| r.get::<_, i64>(0))?)
}

pub fn search_verses(
    conn: &Connection,
    query: &str,
    translation_ids: &[i64],
    scope: &VerseSearchScope,
    options: SearchOptions,
    limit: i64,
) -> anyhow::Result<SearchPage> {
    if query.trim().is_empty() || translation_ids.is_empty() {
        return Ok(SearchPage { results: vec![], total: 0 });
    }
    let match_expr = build_match_expr_with(query, !options.whole_words);
    if match_expr.is_empty() {
        return Ok(SearchPage { results: vec![], total: 0 });
    }
    let placeholders = translation_ids
        .iter()
        .map(|_| "?")
        .collect::<Vec<_>>()
        .join(",");
    let (scope_sql, scope_params) = scope_sql(scope, "v");
    // CROSS JOIN, deliberately: it tells SQLite to keep this join order, so
    // the full-text index always drives. Left to itself the planner, given a
    // single translation to filter on, walked that translation's verses and
    // probed the index once per row -- fourteen seconds for a word like
    // "love", against eighteen milliseconds when the index leads.
    let from = format!(
        "FROM verses_fts
         CROSS JOIN verses v ON v.id = verses_fts.rowid
         JOIN translations t ON t.id = v.translation_id
         {}
         WHERE verses_fts MATCH ?1 AND v.translation_id IN ({placeholders}){scope_sql}",
        if scope.testament.is_some() { "JOIN books b ON b.id = v.book_id" } else { "" },
    );
    let order = if options.passage_order {
        "v.book_id, v.chapter, v.verse, t.id"
    } else {
        "bm25(verses_fts)"
    };
    let sql = format!(
        "SELECT v.id, v.book_id, v.chapter, v.verse, t.code,
                snippet(verses_fts, 0, '[', ']', '…', 10)
         {from}
         ORDER BY {order}
         LIMIT ?{}",
        translation_ids.len() + 2 + scope_params.len()
    );
    let mut bind_params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(match_expr)];
    for id in translation_ids {
        bind_params.push(Box::new(*id));
    }
    bind_params.extend(scope_params);
    let filter_refs: Vec<&dyn rusqlite::ToSql> = bind_params.iter().map(|b| b.as_ref()).collect();
    let mut param_refs = filter_refs.clone();
    param_refs.push(&limit);

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(param_refs.as_slice(), |r| {
        Ok(SearchResult {
            kind: "verse".to_string(),
            entry_id: r.get(0)?,
            book_id: Some(r.get(1)?),
            chapter: r.get::<_, i64>(2)?.into(),
            verse: r.get::<_, i64>(3)?.into(),
            source_label: r.get(4)?,
            snippet: escape_snippet(&r.get::<_, String>(5)?),
        })
    })?;
    let results = rows.collect::<Result<Vec<_>, _>>()?;
    let total = if results.len() as i64 >= limit {
        count_matches(conn, &format!("SELECT COUNT(*) {from}"), &filter_refs)?
    } else {
        results.len() as i64
    };
    Ok(SearchPage { results, total })
}

pub fn search_commentary(
    conn: &Connection,
    query: &str,
    source_ids: &[i64],
    scope: &VerseSearchScope,
    options: SearchOptions,
    limit: i64,
) -> anyhow::Result<SearchPage> {
    if query.trim().is_empty() || source_ids.is_empty() {
        return Ok(SearchPage { results: vec![], total: 0 });
    }
    let match_expr = build_match_expr_with(query, !options.whole_words);
    if match_expr.is_empty() {
        return Ok(SearchPage { results: vec![], total: 0 });
    }
    let placeholders = source_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let (scope_sql, scope_params) = scope_sql(scope, "ce");
    // CROSS JOIN for the same reason as in `search_verses`: one commentary
    // chosen must not turn into a walk of that commentary's every entry.
    let from = format!(
        "FROM commentary_fts
         CROSS JOIN commentary_entries ce ON ce.id = commentary_fts.rowid
         JOIN commentary_sections sec ON sec.id = ce.section_id
         JOIN commentary_sources cs2 ON cs2.id = sec.commentary_source_id
         {}
         WHERE commentary_fts MATCH ?1 AND sec.commentary_source_id IN ({placeholders}){scope_sql}",
        if scope.testament.is_some() { "JOIN books b ON b.id = ce.book_id" } else { "" },
    );
    let order = if options.passage_order {
        "ce.book_id, ce.chapter, ce.verse_start, cs2.id"
    } else {
        "bm25(commentary_fts)"
    };
    let sql = format!(
        "SELECT ce.id, ce.book_id, ce.chapter, ce.verse_start, cs2.title,
                snippet(commentary_fts, 0, '[', ']', '…', 12)
         {from}
         ORDER BY {order}
         LIMIT ?{}",
        source_ids.len() + 2 + scope_params.len()
    );
    let mut bind_params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(match_expr)];
    for id in source_ids {
        bind_params.push(Box::new(*id));
    }
    bind_params.extend(scope_params);
    let filter_refs: Vec<&dyn rusqlite::ToSql> = bind_params.iter().map(|b| b.as_ref()).collect();
    let mut param_refs = filter_refs.clone();
    param_refs.push(&limit);

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(param_refs.as_slice(), |r| {
        Ok(SearchResult {
            kind: "commentary".to_string(),
            entry_id: r.get(0)?,
            book_id: Some(r.get(1)?),
            chapter: r.get(2)?,
            verse: r.get(3)?,
            source_label: r.get(4)?,
            snippet: escape_snippet(&r.get::<_, String>(5)?),
        })
    })?;
    let results = rows.collect::<Result<Vec<_>, _>>()?;
    let total = if results.len() as i64 >= limit {
        count_matches(conn, &format!("SELECT COUNT(*) {from}"), &filter_refs)?
    } else {
        results.len() as i64
    };
    Ok(SearchPage { results, total })
}

/// A snippet, ready to be written into the page as HTML.
///
/// Every search result reaches the screen through `innerHTML` -- that is how
/// the `[`/`]` match markers become `<mark>` -- and the text it is cut from
/// is whatever someone typed: a note about a `<div>`, a prayer with an
/// ampersand in it. Those characters have to arrive escaped or the browser
/// reads them as markup. The markers themselves are left alone, since the
/// page turns them into the highlight.
pub(crate) fn escape_snippet(snippet: &str) -> String {
    let mut out = String::with_capacity(snippet.len() + 16);
    for c in snippet.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            _ => out.push(c),
        }
    }
    out
}

/// Searches the user's own study notes: passage notes (verse-range) and
/// chapter notes (whole-chapter), unioned into one result set so both show
/// up together in the "Notes" search tab. The FTS tables still index
/// soft-deleted rows (external content, unchanged triggers), so each branch
/// joins its base table and filters on `deleted_at` there.
pub fn search_notes(conn: &Connection, query: &str, options: SearchOptions, limit: i64) -> anyhow::Result<Vec<SearchResult>> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    let match_expr = build_match_expr_with(query, !options.whole_words);
    if match_expr.is_empty() {
        return Ok(vec![]);
    }

    // Each branch selects its own bm25 rank alongside the row, so the two
    // can be merged on relevance rather than concatenated.
    //
    // Concatenating and then truncating is what this used to do, and it meant
    // the chapter notes were only ever whatever fell off the end: with the
    // overlay's limit of 50, a query matching 50 passage notes returned no
    // chapter notes at all, while the Notes tab confidently showed a count of
    // 50. The reader had no way to tell a chapter note that did not match
    // from one that had been cut.
    //
    // bm25 is comparable between these two because both indexes are over the
    // same kind of text, tokenized the same way -- unlike the verse/commentary
    // pair at the top of this file, which deliberately stay separate.
    let mut stmt = conn.prepare(&format!(
        "SELECT n.id, n.book_id, n.chapter, n.verse_start, snippet(notes_fts, 0, '[', ']', '…', 12),
                bm25(notes_fts)
         FROM notes_fts JOIN notes n ON n.id = notes_fts.rowid
         WHERE notes_fts MATCH ?1 AND n.{NOT_DELETED}
         ORDER BY bm25(notes_fts) LIMIT ?2"
    ))?;
    let ranked = stmt
        .query_map(rusqlite::params![match_expr, limit], |r| {
            Ok((
                r.get::<_, f64>(5)?,
                SearchResult {
                    kind: "note".to_string(),
                    entry_id: r.get(0)?,
                    book_id: Some(r.get(1)?),
                    chapter: r.get::<_, i64>(2)?.into(),
                    verse: r.get::<_, i64>(3)?.into(),
                    source_label: "Note".to_string(),
                    snippet: escape_snippet(&r.get::<_, String>(4)?),
                },
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut stmt = conn.prepare(&format!(
        "SELECT cn.id, cn.book_id, cn.chapter, snippet(chapter_notes_fts, 0, '[', ']', '…', 12),
                bm25(chapter_notes_fts)
         FROM chapter_notes_fts JOIN chapter_notes cn ON cn.id = chapter_notes_fts.rowid
         WHERE chapter_notes_fts MATCH ?1 AND cn.{NOT_DELETED}
         ORDER BY bm25(chapter_notes_fts) LIMIT ?2"
    ))?;
    let chapter_ranked = stmt
        .query_map(rusqlite::params![match_expr, limit], |r| {
            Ok((
                r.get::<_, f64>(4)?,
                SearchResult {
                    kind: "note".to_string(),
                    entry_id: r.get(0)?,
                    book_id: Some(r.get(1)?),
                    chapter: r.get::<_, i64>(2)?.into(),
                    verse: None,
                    source_label: "Chapter Note".to_string(),
                    snippet: escape_snippet(&r.get::<_, String>(3)?),
                },
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    // Lower bm25 is the better match, so the merge sorts ascending -- but it
    // cannot sort on the rank alone, and this is the part worth explaining.
    //
    // FTS5 computes IDF per table, over that table's own documents. When a
    // term appears in every row of an index its IDF is zero, and bm25 comes
    // back as the same clamped -1e-6 for every one of them. That is not a
    // corner case: it is what a search for a word the reader uses constantly
    // looks like. Sorting on the rank alone then leaves every row tied, a
    // stable sort keeps the passage notes in front of the chapter notes
    // exactly as concatenating them did, and the truncate cuts the chapter
    // notes off again -- the same bug, now with a sort in front of it.
    //
    // So ties break on each row's position within its own result set: the
    // best chapter note is weighed against the best passage note, the second
    // against the second, and so on. Where the ranks genuinely differ the
    // rank still decides; where they tie the two kinds interleave, and a
    // chapter note that matched is visible however many passage notes did.
    let mut merged: Vec<(f64, usize, SearchResult)> = ranked
        .into_iter()
        .enumerate()
        .map(|(i, (rank, result))| (rank, i, result))
        .chain(
            chapter_ranked
                .into_iter()
                .enumerate()
                .map(|(i, (rank, result))| (rank, i, result)),
        )
        .collect();
    merged.sort_by(|a, b| {
        a.0.partial_cmp(&b.0)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(a.1.cmp(&b.1))
    });
    merged.truncate(limit as usize);
    Ok(merged.into_iter().map(|(_, _, result)| result).collect())
}

/// Prayer journal entries: at most one linked passage per entry (a direct
/// column, not a link table -- see USER_MIGRATION_0002's schema comment),
/// so this is a plain left-hand reference rather than a subquery.
pub fn search_prayer_entries(
    conn: &Connection,
    query: &str,
    options: SearchOptions,
    limit: i64,
) -> anyhow::Result<Vec<SearchResult>> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    let match_expr = build_match_expr_with(query, !options.whole_words);
    if match_expr.is_empty() {
        return Ok(vec![]);
    }
    let mut stmt = conn.prepare(&format!(
        "SELECT pe.id, pe.entry_date, pe.book_id, pe.chapter, pe.verse_start,
                snippet(prayer_entries_fts, -1, '[', ']', '…', 12)
         FROM prayer_entries_fts JOIN prayer_entries pe ON pe.id = prayer_entries_fts.rowid
         WHERE prayer_entries_fts MATCH ?1 AND pe.{NOT_DELETED}
         ORDER BY bm25(prayer_entries_fts) LIMIT ?2"
    ))?;
    let rows = stmt.query_map(rusqlite::params![match_expr, limit], |r| {
        let entry_date: String = r.get(1)?;
        Ok(SearchResult {
            kind: "prayer".to_string(),
            entry_id: r.get(0)?,
            book_id: r.get(2)?,
            chapter: r.get(3)?,
            verse: r.get(4)?,
            source_label: format!("Prayer: {entry_date}"),
            snippet: escape_snippet(&r.get::<_, String>(5)?),
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
