use super::query_lang::{self, ParseOptions, ParsedQuery};
use super::NOT_DELETED;
use crate::models::SearchResult;
use rusqlite::Connection;
use serde::Serialize;

// Both FTS5 tables here are already external-content tables (`content=`, no
// duplicated verse/commentary text in the index itself). Results are ranked
// by bm25() relevance rather than passage order. Scripture and commentary
// are returned as two separate result sets (see `commands::search::search`)
// rather than one merged, cross-scope ranking, and the UI always surfaces
// the Scripture tab first -- so "Scripture outranks commentary" holds at the
// tab level today. If a future unified/merged search view (Phase 6) needs a
// single ranked feed, blend the two bm25 scores with a Scripture-favoring
// weight there rather than trying to compare raw bm25 values across schemas.

/// Where a match begins and ends inside a snippet: control characters, so a
/// translation that prints its own square brackets (the LSV's "[is]") is not
/// mistaken for a match. The page turns them into `<mark>`.
pub const MARK_START: char = '\u{2}';
pub const MARK_END: char = '\u{3}';

/// Turns free text into a safe FTS5 match expression, prefixes on. The
/// search language is described in `query_lang`; this is its FTS5 half, and
/// every search box in the app goes through it, so an operator works the
/// same on every tab.
pub(crate) fn build_match_expr(query: &str) -> String {
    build_match_expr_with(query, true)
}

/// `build_match_expr` with the prefix expansion under the caller's control.
/// With `prefix` false a bare word is matched whole: `son` finds "son" (and,
/// through the stemmer, "sons") but no longer "song" or "Sondern". Quoted
/// phrases were always exact and are unaffected.
pub(crate) fn build_match_expr_with(query: &str, prefix: bool) -> String {
    query_lang::parse(query, ParseOptions { prefix, older_spellings: false }).fts
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
/// `book_id` to one book, or `testament` to "OT"/"NT", from the dropdowns
/// under the box. Filters typed in the box (`in:psalms`) narrow further.
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
    /// Widen bare words to their older spellings (see `query_lang`).
    pub older_spellings: bool,
}

impl SearchOptions {
    pub fn parse(&self, query: &str) -> ParsedQuery {
        query_lang::parse(query, ParseOptions { prefix: !self.whole_words, older_spellings: self.older_spellings })
    }
}

/// One tab's worth of results, with the number of rows the query matched in
/// all. `total` is only counted when the page came back full: a page shorter
/// than `limit` is already the whole answer, and the count costs a second
/// pass over the index.
pub struct SearchPage {
    pub results: Vec<SearchResult>,
    pub total: i64,
}

/// The most rows a check made in Rust (an exact form, a regular expression)
/// will look through for one search. Enough for "every verse with LORD in
/// it" in one translation several times over; a search wider than this is
/// cut off and says so through its total.
const POST_FILTER_CAP: usize = 60_000;

/// Hits per book and per translation (or commentary), for the facet list
/// down the side of the results.
#[derive(Debug, Clone, Default, Serialize)]
pub struct Facets {
    pub by_book: Vec<(i64, i64)>,
    pub by_source: Vec<(i64, i64)>,
}

/// The conditions a verse row `v` must meet beyond the words: the dropdown
/// scope and every filter typed in the box. Returns the SQL (each fragment
/// starting " AND"), its parameters in order, and whether it needs `books b`.
fn verse_conditions(q: &ParsedQuery, scope: &VerseSearchScope) -> (String, Vec<Box<dyn rusqlite::ToSql>>, bool) {
    let f = &q.filters;
    let mut sql = String::new();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    let mut needs_books = false;
    if let Some(book_id) = scope.book_id {
        sql.push_str(" AND v.book_id = ?");
        params.push(Box::new(book_id));
    }
    if let Some(testament) = scope.testament.clone().or_else(|| f.testament.clone()) {
        sql.push_str(" AND b.testament = ?");
        params.push(Box::new(testament));
        needs_books = true;
    }
    if !f.books.is_empty() {
        sql.push_str(&format!(" AND v.book_id IN ({})", f.books.iter().map(|b| b.to_string()).collect::<Vec<_>>().join(",")));
    }
    if let Some(chapter) = f.chapter {
        sql.push_str(" AND v.chapter = ?");
        params.push(Box::new(chapter));
    }
    if !f.strongs.is_empty() {
        let ph = f.strongs.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        // Row-value IN, so the Strong's index leads: a few hundred verses
        // looked up by number, not thirty thousand each asked in turn.
        sql.push_str(&format!(
            " AND (v.book_id, v.chapter, v.verse) IN
                  (SELECT m.book_id, m.chapter, m.verse FROM morphology_words m WHERE m.strongs_id IN ({ph}))"
        ));
        for s in &f.strongs {
            params.push(Box::new(s.clone()));
        }
    }
    for lemma in &f.lemmas {
        sql.push_str(
            " AND EXISTS (SELECT 1 FROM morphology_words m WHERE m.book_id = v.book_id AND m.chapter = v.chapter
                          AND m.verse = v.verse
                          AND (m.lemma = ? OR m.strongs_id IN (SELECT id FROM strongs_entries WHERE original_word = ?)))",
        );
        params.push(Box::new(lemma.clone()));
        params.push(Box::new(lemma.clone()));
    }
    if f.red {
        sql.push_str(
            " AND EXISTS (SELECT 1 FROM red_letter_ranges r WHERE r.book_id = v.book_id AND r.chapter = v.chapter
                          AND v.verse BETWEEN r.verse_start AND r.verse_end)",
        );
    }
    if f.has_note {
        sql.push_str(&format!(
            " AND EXISTS (SELECT 1 FROM notes n WHERE n.book_id = v.book_id AND n.chapter = v.chapter
                          AND v.verse BETWEEN n.verse_start AND n.verse_end AND n.{NOT_DELETED})"
        ));
    }
    if f.has_highlight || f.color.is_some() {
        sql.push_str(
            " AND EXISTS (SELECT 1 FROM highlights h WHERE h.book_id = v.book_id AND h.chapter = v.chapter
                          AND v.verse BETWEEN h.verse_start AND h.verse_end",
        );
        if let Some(color) = &f.color {
            sql.push_str(" AND h.color = ?");
            params.push(Box::new(color.clone()));
        }
        sql.push(')');
    }
    (sql, params, needs_books)
}

/// The translations to search: those typed in the box (`t:kjv,geneva`) when
/// there are any, else the ones chosen under it.
fn resolve_translations(conn: &Connection, q: &ParsedQuery, chosen: &[i64]) -> anyhow::Result<Vec<i64>> {
    if q.filters.all_translations {
        let mut stmt = conn.prepare("SELECT id FROM translations ORDER BY id")?;
        return Ok(stmt.query_map([], |r| r.get::<_, i64>(0))?.collect::<Result<Vec<_>, _>>()?);
    }
    if q.filters.translations.is_empty() {
        return Ok(chosen.to_vec());
    }
    let ph = q.filters.translations.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let mut stmt = conn.prepare(&format!("SELECT id FROM translations WHERE upper(code) IN ({ph}) ORDER BY id"))?;
    let params: Vec<&dyn rusqlite::ToSql> = q.filters.translations.iter().map(|c| c as &dyn rusqlite::ToSql).collect();
    let ids = stmt.query_map(params.as_slice(), |r| r.get::<_, i64>(0))?.collect::<Result<Vec<_>, _>>()?;
    Ok(ids)
}

/// A verse query's FROM and WHERE, shared by the search, the count, and the
/// facets. Parameters come back in the order the SQL uses them.
struct VerseQuery {
    from: String,
    params: Vec<Box<dyn rusqlite::ToSql>>,
    /// The FTS table drives (there are words to match).
    indexed: bool,
}

fn verse_query(q: &ParsedQuery, translation_ids: &[i64], scope: &VerseSearchScope) -> VerseQuery {
    let (cond_sql, cond_params, needs_books) = verse_conditions(q, scope);
    let placeholders = translation_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let books_join = if needs_books { "JOIN books b ON b.id = v.book_id" } else { "" };
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    let indexed = !q.fts.is_empty();
    // Greek and Hebrew are matched by their bare letters (see verses_plain).
    let fts_table = if q.original_script { "verses_plain" } else { "verses_fts" };
    let from = if indexed {
        params.push(Box::new(q.fts.clone()));
        // CROSS JOIN, deliberately: it tells SQLite to keep this join order,
        // so the full-text index always drives. Left to itself the planner,
        // given a single translation to filter on, walked that translation's
        // verses and probed the index once per row -- fourteen seconds for a
        // word like "love", against eighteen milliseconds when the index leads.
        format!(
            "FROM {fts_table}
             CROSS JOIN verses v ON v.id = {fts_table}.rowid
             JOIN translations t ON t.id = v.translation_id
             {books_join}
             WHERE {fts_table} MATCH ? AND v.translation_id IN ({placeholders}){cond_sql}"
        )
    } else {
        format!(
            "FROM verses v
             JOIN translations t ON t.id = v.translation_id
             {books_join}
             WHERE v.translation_id IN ({placeholders}){cond_sql}"
        )
    };
    for id in translation_ids {
        params.push(Box::new(*id));
    }
    params.extend(cond_params);
    VerseQuery { from, params, indexed }
}

pub fn search_verses(
    conn: &Connection,
    q: &ParsedQuery,
    translation_ids: &[i64],
    scope: &VerseSearchScope,
    options: SearchOptions,
    limit: i64,
) -> anyhow::Result<SearchPage> {
    let empty = Ok(SearchPage { results: vec![], total: 0 });
    let translation_ids = resolve_translations(conn, q, translation_ids)?;
    if q.is_empty() || translation_ids.is_empty() {
        return empty;
    }
    if q.regex.is_some() && translation_ids.len() > 1 {
        anyhow::bail!("a regular expression searches one translation at a time -- choose one under the box, or add t:kjv");
    }
    let regex = q.regex.as_deref().map(query_lang::compile_regex).transpose()?;
    let vq = verse_query(q, &translation_ids, scope);
    let order = if options.passage_order || !vq.indexed || q.original_script {
        "v.book_id, v.chapter, v.verse, t.id"
    } else {
        "bm25(verses_fts)"
    };
    // The whole verse, its matches marked: verses are short enough to show
    // entire, and the concordance view lines hits up on the first mark. A
    // Greek or Hebrew search matched the bare letters, so its marks are put
    // on the pointed text by hand.
    let text_col = if vq.indexed && !q.original_script { "highlight(verses_fts, 0, char(2), char(3))" } else { "v.text" };
    let params: Vec<&dyn rusqlite::ToSql> = vq.params.iter().map(|b| b.as_ref()).collect();

    let map = |r: &rusqlite::Row| -> rusqlite::Result<(SearchResult, String)> {
        let marked: String = r.get(5)?;
        Ok((
            SearchResult {
                kind: "verse".to_string(),
                entry_id: r.get(0)?,
                book_id: Some(r.get(1)?),
                chapter: r.get::<_, i64>(2)?.into(),
                verse: r.get::<_, i64>(3)?.into(),
                source_label: r.get(4)?,
                snippet: marked,
                source_id: Some(r.get(6)?),
            },
            r.get(7)?,
        ))
    };

    if q.needs_post_filter() {
        // Every candidate is checked here, so the page and the total both
        // come from one walk.
        let sql = format!(
            "SELECT v.id, v.book_id, v.chapter, v.verse, t.code, {text_col}, t.id, v.text {} ORDER BY {order}",
            vq.from
        );
        let mut stmt = conn.prepare(&sql)?;
        let mut rows = stmt.query(params.as_slice())?;
        let mut results = Vec::new();
        let mut total = 0i64;
        let mut seen = 0usize;
        while let Some(row) = rows.next()? {
            seen += 1;
            if seen > POST_FILTER_CAP {
                break;
            }
            let (mut result, text) = map(row)?;
            if !query_lang::passes(&text, q, regex.as_ref()) {
                continue;
            }
            total += 1;
            if (results.len() as i64) < limit {
                result.snippet = mark_post_filtered(&text, q, regex.as_ref());
                results.push(result);
            }
        }
        for r in &mut results {
            r.snippet = escape_snippet(&r.snippet);
        }
        return Ok(SearchPage { results, total });
    }

    let sql = format!(
        "SELECT v.id, v.book_id, v.chapter, v.verse, t.code, {text_col}, t.id, v.text {} ORDER BY {order} LIMIT {limit}",
        vq.from
    );
    let mut stmt = conn.prepare(&sql)?;
    let mut results = stmt
        .query_map(params.as_slice(), map)?
        .map(|r| r.map(|(res, _)| res))
        .collect::<Result<Vec<_>, _>>()?;
    for r in &mut results {
        if q.original_script {
            r.snippet = mark_original(&r.snippet, &q.mark_words);
        }
        r.snippet = escape_snippet(&r.snippet);
    }
    let total = if results.len() as i64 >= limit {
        count_matches(conn, &format!("SELECT COUNT(*) {}", vq.from), &params)?
    } else {
        results.len() as i64
    };
    Ok(SearchPage { results, total })
}

/// Marks, in pointed Greek or Hebrew, the words whose bare letters are one
/// of `words` (themselves bare letters) -- whole words, or a prefix where the
/// search word was typed as one.
fn mark_original(text: &str, words: &[String]) -> String {
    let mut spans = Vec::new();
    let mut start: Option<usize> = None;
    let push = |s: usize, e: usize, spans: &mut Vec<(usize, usize)>| {
        let bare = crate::plain::plain_word(&text[s..e]);
        if !bare.is_empty() && words.iter().any(|w| !w.is_empty() && (bare == *w || bare.starts_with(w.as_str()))) {
            spans.push((s, e));
        }
    };
    for (i, c) in text.char_indices() {
        let in_word = c.is_alphanumeric() || query_lang::is_original_script(c) && !c.is_whitespace() && c != '׃' && c != '־' && c != '׀';
        match (in_word, start) {
            (true, None) => start = Some(i),
            (false, Some(s)) => {
                push(s, i, &mut spans);
                start = None;
            }
            _ => {}
        }
    }
    if let Some(s) = start {
        push(s, text.len(), &mut spans);
    }
    query_lang::mark_spans(text, spans)
}

/// A verse the index did not mark (or marked by stem, not by form): the
/// exact words and regex matches marked by hand.
fn mark_post_filtered(text: &str, q: &ParsedQuery, regex: Option<&regex::Regex>) -> String {
    if let Some(re) = regex {
        let spans: Vec<(usize, usize)> = re.find_iter(text).map(|m| (m.start(), m.end())).filter(|(s, e)| e > s).collect();
        if !spans.is_empty() {
            return query_lang::mark_spans(text, spans);
        }
    }
    query_lang::mark_exact(text, &q.exact, if q.exact.is_empty() { &q.mark_words } else { &[] })
}

/// Hits per book and per translation for a Scripture search.
pub fn verse_facets(conn: &Connection, q: &ParsedQuery, translation_ids: &[i64], scope: &VerseSearchScope) -> anyhow::Result<Facets> {
    let translation_ids = resolve_translations(conn, q, translation_ids)?;
    if q.is_empty() || translation_ids.is_empty() || (q.regex.is_some() && translation_ids.len() > 1) {
        return Ok(Facets::default());
    }
    let vq = verse_query(q, &translation_ids, scope);
    let params: Vec<&dyn rusqlite::ToSql> = vq.params.iter().map(|b| b.as_ref()).collect();
    if q.needs_post_filter() {
        let regex = q.regex.as_deref().map(query_lang::compile_regex).transpose()?;
        let mut stmt = conn.prepare(&format!("SELECT v.book_id, t.id, v.text {}", vq.from))?;
        let mut rows = stmt.query(params.as_slice())?;
        let mut by_book = std::collections::BTreeMap::<i64, i64>::new();
        let mut by_source = std::collections::BTreeMap::<i64, i64>::new();
        let mut seen = 0usize;
        while let Some(r) = rows.next()? {
            seen += 1;
            if seen > POST_FILTER_CAP {
                break;
            }
            let text: String = r.get(2)?;
            if query_lang::passes(&text, q, regex.as_ref()) {
                *by_book.entry(r.get(0)?).or_default() += 1;
                *by_source.entry(r.get(1)?).or_default() += 1;
            }
        }
        return Ok(Facets { by_book: by_book.into_iter().collect(), by_source: by_source.into_iter().collect() });
    }
    let group = |col: &str| -> anyhow::Result<Vec<(i64, i64)>> {
        let mut stmt = conn.prepare(&format!("SELECT {col}, COUNT(*) {} GROUP BY {col} ORDER BY {col}", vq.from))?;
        let rows = stmt.query_map(params.as_slice(), |r| Ok((r.get(0)?, r.get(1)?)))?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    };
    Ok(Facets { by_book: group("v.book_id")?, by_source: group("t.id")? })
}

fn count_matches(conn: &Connection, sql: &str, params: &[&dyn rusqlite::ToSql]) -> anyhow::Result<i64> {
    Ok(conn.query_row(sql, params, |r| r.get::<_, i64>(0))?)
}

/// The commentaries to search: those named in the box (`c:henry`) when
/// there are any, else the ones chosen under it.
fn resolve_commentaries(conn: &Connection, q: &ParsedQuery, chosen: &[i64]) -> anyhow::Result<Vec<i64>> {
    if q.filters.commentaries.is_empty() {
        return Ok(chosen.to_vec());
    }
    let mut stmt = conn.prepare("SELECT id, lower(title) FROM commentary_sources ORDER BY id")?;
    let all = stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))?.collect::<Result<Vec<_>, _>>()?;
    Ok(all
        .into_iter()
        .filter(|(_, title)| q.filters.commentaries.iter().any(|f| title.contains(f.as_str())))
        .map(|(id, _)| id)
        .collect())
}

fn commentary_query(q: &ParsedQuery, source_ids: &[i64], scope: &VerseSearchScope) -> (String, Vec<Box<dyn rusqlite::ToSql>>) {
    let f = &q.filters;
    let placeholders = source_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let mut cond = String::new();
    let mut cond_params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    if let Some(book_id) = scope.book_id {
        cond.push_str(" AND ce.book_id = ?");
        cond_params.push(Box::new(book_id));
    }
    let testament = scope.testament.clone().or_else(|| f.testament.clone());
    if let Some(t) = testament.clone() {
        cond.push_str(" AND b.testament = ?");
        cond_params.push(Box::new(t));
    }
    if !f.books.is_empty() {
        cond.push_str(&format!(" AND ce.book_id IN ({})", f.books.iter().map(|b| b.to_string()).collect::<Vec<_>>().join(",")));
    }
    if let Some(chapter) = f.chapter {
        cond.push_str(" AND ce.chapter = ?");
        cond_params.push(Box::new(chapter));
    }
    // CROSS JOIN for the same reason as in `search_verses`: one commentary
    // chosen must not turn into a walk of that commentary's every entry.
    let from = format!(
        "FROM commentary_fts
         CROSS JOIN commentary_entries ce ON ce.id = commentary_fts.rowid
         JOIN commentary_sections sec ON sec.id = ce.section_id
         JOIN commentary_sources cs2 ON cs2.id = sec.commentary_source_id
         {}
         WHERE commentary_fts MATCH ? AND sec.commentary_source_id IN ({placeholders}){cond}",
        if testament.is_some() { "JOIN books b ON b.id = ce.book_id" } else { "" },
    );
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(q.fts.clone())];
    for id in source_ids {
        params.push(Box::new(*id));
    }
    params.extend(cond_params);
    (from, params)
}

/// Commentary search. The words and the book filters apply; an exact form
/// or case (`+LORD`) narrows by the word but not by its case, since a
/// commentary entry is too long to check row by row, and a regular
/// expression is for Scripture only.
pub fn search_commentary(
    conn: &Connection,
    q: &ParsedQuery,
    source_ids: &[i64],
    scope: &VerseSearchScope,
    options: SearchOptions,
    limit: i64,
) -> anyhow::Result<SearchPage> {
    let source_ids = resolve_commentaries(conn, q, source_ids)?;
    if q.fts.is_empty() || source_ids.is_empty() {
        return Ok(SearchPage { results: vec![], total: 0 });
    }
    let (from, bind_params) = commentary_query(q, &source_ids, scope);
    let order = if options.passage_order {
        "ce.book_id, ce.chapter, ce.verse_start, cs2.id"
    } else {
        "bm25(commentary_fts)"
    };
    let sql = format!(
        "SELECT ce.id, ce.book_id, ce.chapter, ce.verse_start, cs2.title,
                snippet(commentary_fts, 0, char(2), char(3), '…', 12), cs2.id
         {from}
         ORDER BY {order}
         LIMIT {limit}"
    );
    let params: Vec<&dyn rusqlite::ToSql> = bind_params.iter().map(|b| b.as_ref()).collect();
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params.as_slice(), |r| {
        Ok(SearchResult {
            kind: "commentary".to_string(),
            entry_id: r.get(0)?,
            book_id: Some(r.get(1)?),
            chapter: r.get(2)?,
            verse: r.get(3)?,
            source_label: r.get(4)?,
            snippet: escape_snippet(&r.get::<_, String>(5)?),
            source_id: Some(r.get(6)?),
        })
    })?;
    let results = rows.collect::<Result<Vec<_>, _>>()?;
    let total = if results.len() as i64 >= limit {
        count_matches(conn, &format!("SELECT COUNT(*) {from}"), &params)?
    } else {
        results.len() as i64
    };
    Ok(SearchPage { results, total })
}

/// Hits per book and per commentary.
pub fn commentary_facets(conn: &Connection, q: &ParsedQuery, source_ids: &[i64], scope: &VerseSearchScope) -> anyhow::Result<Facets> {
    let source_ids = resolve_commentaries(conn, q, source_ids)?;
    if q.fts.is_empty() || source_ids.is_empty() {
        return Ok(Facets::default());
    }
    let (from, bind_params) = commentary_query(q, &source_ids, scope);
    let params: Vec<&dyn rusqlite::ToSql> = bind_params.iter().map(|b| b.as_ref()).collect();
    let group = |col: &str| -> anyhow::Result<Vec<(i64, i64)>> {
        let mut stmt = conn.prepare(&format!("SELECT {col}, COUNT(*) {from} GROUP BY {col} ORDER BY {col}"))?;
        let rows = stmt.query_map(params.as_slice(), |r| Ok((r.get(0)?, r.get(1)?)))?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    };
    Ok(Facets { by_book: group("ce.book_id")?, by_source: group("cs2.id")? })
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

/// A `since:` value, reduced to the digits and dashes it was checked to be
/// made of (see `query_lang`), so it can sit in SQL as a literal.
pub(crate) fn sql_date(d: &str) -> String {
    d.chars().filter(|c| c.is_ascii_digit() || *c == '-').collect()
}

/// The `in:` and `since:` filters as SQL for passage notes (`n`) and
/// chapter notes (`cn`).
fn note_filters(q: &ParsedQuery) -> (String, String) {
    let mut n = String::new();
    let mut cn = String::new();
    let f = &q.filters;
    if !f.books.is_empty() {
        let list = f.books.iter().map(|b| b.to_string()).collect::<Vec<_>>().join(",");
        n.push_str(&format!(" AND n.book_id IN ({list})"));
        cn.push_str(&format!(" AND cn.book_id IN ({list})"));
    }
    if let Some(chapter) = f.chapter {
        n.push_str(&format!(" AND n.chapter = {chapter}"));
        cn.push_str(&format!(" AND cn.chapter = {chapter}"));
    }
    if let Some(since) = f.since.as_deref() {
        let d = sql_date(since);
        n.push_str(&format!(" AND n.updated_at >= '{d}'"));
        cn.push_str(&format!(" AND cn.updated_at >= '{d}'"));
    }
    (n, cn)
}

/// Searches the user's own study notes: passage notes (verse-range) and
/// chapter notes (whole-chapter), unioned into one result set so both show
/// up together in the "Notes" search tab. The FTS tables still index
/// soft-deleted rows (external content, unchanged triggers), so each branch
/// joins its base table and filters on `deleted_at` there.
pub fn search_notes(conn: &Connection, q: &ParsedQuery, limit: i64) -> anyhow::Result<Vec<SearchResult>> {
    let match_expr = q.fts.clone();
    if match_expr.is_empty() {
        return Ok(vec![]);
    }
    // `in:` narrows by book, `since:` by when the note was last written.
    let (note_filter, chapter_note_filter) = note_filters(q);

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
        "SELECT n.id, n.book_id, n.chapter, n.verse_start, snippet(notes_fts, 0, char(2), char(3), '…', 12),
                bm25(notes_fts)
         FROM notes_fts JOIN notes n ON n.id = notes_fts.rowid
         WHERE notes_fts MATCH ?1 AND n.{NOT_DELETED}{note_filter}
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
                    source_id: None,
                },
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut stmt = conn.prepare(&format!(
        "SELECT cn.id, cn.book_id, cn.chapter, snippet(chapter_notes_fts, 0, char(2), char(3), '…', 12),
                bm25(chapter_notes_fts)
         FROM chapter_notes_fts JOIN chapter_notes cn ON cn.id = chapter_notes_fts.rowid
         WHERE chapter_notes_fts MATCH ?1 AND cn.{NOT_DELETED}{chapter_note_filter}
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
                    source_id: None,
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
pub fn search_prayer_entries(conn: &Connection, q: &ParsedQuery, limit: i64) -> anyhow::Result<Vec<SearchResult>> {
    let match_expr = q.fts.clone();
    if match_expr.is_empty() {
        return Ok(vec![]);
    }
    let since = q
        .filters
        .since
        .as_deref()
        .map(|d| format!(" AND pe.entry_date >= '{}'", sql_date(d)))
        .unwrap_or_default();
    let mut stmt = conn.prepare(&format!(
        "SELECT pe.id, pe.entry_date, pe.book_id, pe.chapter, pe.verse_start,
                snippet(prayer_entries_fts, -1, char(2), char(3), '…', 12)
         FROM prayer_entries_fts JOIN prayer_entries pe ON pe.id = prayer_entries_fts.rowid
         WHERE prayer_entries_fts MATCH ?1 AND pe.{NOT_DELETED}{since}
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
            source_id: None,
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

/// Words beginning with `prefix`, commonest first (see `search_vocab`).
pub fn suggest_words(conn: &Connection, prefix: &str, limit: i64) -> anyhow::Result<Vec<(String, i64)>> {
    let prefix = prefix.trim().to_lowercase();
    if prefix.chars().count() < 2 || !has_vocab(conn) {
        return Ok(vec![]);
    }
    let mut stmt = conn.prepare(
        "SELECT word, count FROM search_vocab WHERE word >= ?1 AND word < ?1 || char(1114111)
         ORDER BY count DESC LIMIT ?2",
    )?;
    let rows = stmt.query_map(rusqlite::params![prefix, limit], |r| Ok((r.get(0)?, r.get(1)?)))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn has_vocab(conn: &Connection) -> bool {
    conn.query_row("SELECT 1 FROM search_vocab LIMIT 1", [], |_| Ok(())).is_ok()
}

/// The translations' vocabulary, held once per run for "did you mean": fifty
/// thousand short words, a megabyte or so.
static VOCAB: once_cell::sync::OnceCell<Vec<(String, i64)>> = once_cell::sync::OnceCell::new();

/// The nearest words to one that matched nothing: within one edit for a
/// short word and two for a longer one, nearest first and then commonest.
pub fn did_you_mean(conn: &Connection, word: &str, limit: usize) -> anyhow::Result<Vec<String>> {
    let word = word.trim().to_lowercase();
    if word.chars().count() < 3 || !has_vocab(conn) {
        return Ok(vec![]);
    }
    let vocab = VOCAB.get_or_try_init(|| -> anyhow::Result<Vec<(String, i64)>> {
        let mut stmt = conn.prepare("SELECT word, count FROM search_vocab")?;
        let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    })?;
    if vocab.iter().any(|(w, _)| *w == word) {
        return Ok(vec![]);
    }
    let max = if word.chars().count() <= 4 { 1 } else { 2 };
    let target: Vec<char> = word.chars().collect();
    let mut found: Vec<(usize, i64, &str)> = vocab
        .iter()
        .filter(|(w, _)| (w.chars().count() as isize - target.len() as isize).unsigned_abs() <= max)
        .filter_map(|(w, c)| {
            let d = edit_distance(&target, w, max);
            (d <= max).then_some((d, *c, w.as_str()))
        })
        .collect();
    found.sort_by(|a, b| a.0.cmp(&b.0).then(b.1.cmp(&a.1)));
    Ok(found.into_iter().take(limit).map(|(_, _, w)| w.to_string()).collect())
}

/// Levenshtein distance, giving up (returning `max + 1`) once every path
/// through a row is already past `max`.
fn edit_distance(a: &[char], b: &str, max: usize) -> usize {
    let b: Vec<char> = b.chars().collect();
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    let mut cur = vec![0; b.len() + 1];
    for i in 1..=a.len() {
        cur[0] = i;
        let mut row_min = cur[0];
        for j in 1..=b.len() {
            let cost = if a[i - 1] == b[j - 1] { 0 } else { 1 };
            cur[j] = (prev[j] + 1).min(cur[j - 1] + 1).min(prev[j - 1] + cost);
            row_min = row_min.min(cur[j]);
        }
        if row_min > max {
            return max + 1;
        }
        std::mem::swap(&mut prev, &mut cur);
    }
    prev[b.len()]
}

/// Against the real content.db (`npm run build:content` first), timed:
/// `cargo test --release --lib real_content -- --ignored --nocapture`.
#[cfg(test)]
mod real_content {
    use super::*;

    fn open() -> Connection {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        let dir = std::env::temp_dir().join(format!("sojourner-real-search-{}", std::process::id()));
        crate::db::open(&dir, &root.join("content").join("content.db")).unwrap()
    }

    fn kjv(conn: &Connection) -> i64 {
        conn.query_row("SELECT id FROM translations WHERE code = 'KJV'", [], |r| r.get(0)).unwrap()
    }

    fn run(conn: &Connection, query: &str, ids: &[i64], opts: SearchOptions) -> SearchPage {
        let t = std::time::Instant::now();
        let page = search_verses(conn, &opts.parse(query), ids, &VerseSearchScope::default(), opts, 50).unwrap();
        println!("{query:40} {:>6} hits  {:?}", page.total, t.elapsed());
        page
    }

    #[test]
    #[ignore]
    fn operators_on_the_kjv() {
        let conn = open();
        let k = kjv(&conn);
        let o = SearchOptions::default();
        assert_eq!(run(&conn, "\"in the beginning\"", &[k], o).total, 19);
        let lord = run(&conn, "in:psalms +LORD -\"LORD of hosts\"", &[k], o);
        assert!(lord.total > 500 && lord.total < 700, "{}", lord.total);
        for r in &lord.results {
            assert_eq!(r.book_id, Some(19));
        }
        let near = run(&conn, "love ~5 God", &[k], SearchOptions { whole_words: true, ..o });
        assert!(near.total > 0);
        let strongs = run(&conn, "G26", &[k], o);
        assert!(strongs.total > 100, "{}", strongs.total);
        let red = run(&conn, "red: in:john love", &[k], o);
        assert!(red.total > 0);
        let re = run(&conn, "/^and the lord said/i", &[k], o);
        assert!(re.total > 0);
        let shew = run(&conn, "show", &[k], SearchOptions { whole_words: true, older_spellings: true, ..o });
        let plain = run(&conn, "show", &[k], SearchOptions { whole_words: true, ..o });
        assert!(shew.total > plain.total * 3, "{} vs {}", shew.total, plain.total);
        let facets = verse_facets(&conn, &o.parse("in:psalms +LORD"), &[k], &VerseSearchScope::default()).unwrap();
        assert_eq!(facets.by_book.len(), 1);
        let wlc: i64 = conn.query_row("SELECT id FROM translations WHERE code = 'WLC'", [], |r| r.get(0)).unwrap();
        let heb = run(&conn, "בראשית", &[wlc], o);
        assert!(heb.results.iter().any(|r| (r.book_id, r.chapter, r.verse) == (Some(1), Some(1), Some(1))), "Genesis 1:1 by bare letters");
        assert!(heb.results[0].snippet.contains(MARK_START), "{}", heb.results[0].snippet);
        let sbl: i64 = conn.query_row("SELECT id FROM translations WHERE code = 'SBLGNT'", [], |r| r.get(0)).unwrap();
        // The nominative form; the word study counts every form.
        assert!(run(&conn, "λογος", &[sbl], o).total > 50);
        println!("did you mean 'shewbred': {:?}", did_you_mean(&conn, "shewbred", 3).unwrap());
        println!("suggest 'righ': {:?}", suggest_words(&conn, "righ", 5).unwrap());
    }
}
