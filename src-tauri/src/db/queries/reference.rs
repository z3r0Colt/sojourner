use crate::models::{
    DictionaryDefinition, DictionaryEntry, DictionaryEntrySummary, Footnote, InterlinearWord, IsbeEntry, IsbeEntrySummary,
    IsbePassageEntry, IsbeSearchResult, MorphologyWord, Pronunciation, StrongsEntry,
};
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashMap;

fn map_strongs(r: &rusqlite::Row) -> rusqlite::Result<StrongsEntry> {
    Ok(StrongsEntry {
        id: r.get(0)?,
        language: r.get(1)?,
        original_word: r.get(2)?,
        transliteration: r.get(3)?,
        pronunciation: r.get(4)?,
        short_definition: r.get(5)?,
        definition: r.get(6)?,
        derivation: r.get(7)?,
        kjv_usage: r.get(8)?,
        thayers_definition: r.get(9)?,
    })
}

const STRONGS_COLS: &str = "se.id, se.language, se.original_word, se.transliteration, se.pronunciation, se.short_definition, se.definition, se.derivation, se.kjv_usage, th.html";
const STRONGS_FROM: &str = "FROM strongs_entries se LEFT JOIN thayers_entries th ON th.strongs_id = se.id";

pub fn get_strongs_entry(conn: &Connection, id: &str) -> anyhow::Result<Option<StrongsEntry>> {
    Ok(conn
        .query_row(
            &format!("SELECT {STRONGS_COLS} {STRONGS_FROM} WHERE se.id = ?1"),
            params![id],
            map_strongs,
        )
        .optional()?)
}

pub fn get_strongs_entries(conn: &Connection, ids: &[String]) -> anyhow::Result<Vec<StrongsEntry>> {
    if ids.is_empty() {
        return Ok(vec![]);
    }
    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!("SELECT {STRONGS_COLS} {STRONGS_FROM} WHERE se.id IN ({placeholders})");
    let mut stmt = conn.prepare(&sql)?;
    let param_refs: Vec<&dyn rusqlite::ToSql> = ids.iter().map(|s| s as &dyn rusqlite::ToSql).collect();
    let rows = stmt.query_map(param_refs.as_slice(), map_strongs)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn search_strongs(conn: &Connection, query: &str, language: Option<&str>, limit: i64) -> anyhow::Result<Vec<StrongsEntry>> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    let match_expr = super::search::build_match_expr(query);
    let lang_clause = if language.is_some() { "AND se.language = ?3" } else { "" };
    let sql = format!(
        "SELECT {STRONGS_COLS}
         FROM strongs_fts JOIN strongs_entries se ON se.rowid = strongs_fts.rowid LEFT JOIN thayers_entries th ON th.strongs_id = se.id
         WHERE strongs_fts MATCH ?1 {lang_clause}
         ORDER BY bm25(strongs_fts) LIMIT ?2"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = if let Some(lang) = language {
        stmt.query_map(params![match_expr, limit, lang], map_strongs)?
            .collect::<Result<Vec<_>, _>>()?
    } else {
        stmt.query_map(params![match_expr, limit], map_strongs)?
            .collect::<Result<Vec<_>, _>>()?
    };
    Ok(rows)
}

fn map_dictionary_summary(r: &rusqlite::Row) -> rusqlite::Result<DictionaryEntrySummary> {
    let stored: String = r.get(3)?;
    // Each dictionary named once, however the column was written: this is
    // "which works have an article here", and a homonym one of them covers
    // twice is still one work.
    let mut sources: Vec<String> = Vec::new();
    for code in stored.split(',').filter(|s| !s.is_empty()) {
        if !sources.iter().any(|s| s == code) {
            sources.push(code.to_string());
        }
    }
    Ok(DictionaryEntrySummary { id: r.get(0)?, term: r.get(1)?, slug: r.get(2)?, sources })
}

const DICTIONARY_COLS: &str = "de.id, de.term, de.slug, de.sources";

pub fn list_dictionary_index(conn: &Connection) -> anyhow::Result<Vec<DictionaryEntrySummary>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {DICTIONARY_COLS} FROM dictionary_entries de ORDER BY de.term COLLATE NOCASE"
    ))?;
    let rows = stmt.query_map([], map_dictionary_summary)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// Exact (case-insensitive) match on a dictionary term -- used to link a
/// Topic Search entry to its glossary definition when one exists, without
/// needing to know that entry's slug ahead of time (unlike book/place
/// names, a doctrine topic's own name doesn't reliably predict how its
/// dictionary entry -- if any -- is titled or slugged).
pub fn find_dictionary_entry_by_term(conn: &Connection, term: &str) -> anyhow::Result<Option<DictionaryEntrySummary>> {
    Ok(conn
        .query_row(
            &format!(
                "SELECT {DICTIONARY_COLS} FROM dictionary_entries de WHERE de.term = ?1 COLLATE NOCASE
                 UNION ALL
                 SELECT {DICTIONARY_COLS} FROM dictionary_aliases a JOIN dictionary_entries de ON de.id = a.entry_id
                 WHERE a.alias = ?1 COLLATE NOCASE
                 LIMIT 1"
            ),
            params![term],
            map_dictionary_summary,
        )
        .optional()?)
}

pub fn get_dictionary_entry(conn: &Connection, slug: &str) -> anyhow::Result<Option<DictionaryEntry>> {
    let entry = conn
        .query_row(
            "SELECT id, term, slug, body FROM dictionary_entries WHERE slug = ?1",
            params![slug],
            |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?)),
        )
        .optional()?;
    let Some((id, term, slug, body)) = entry else { return Ok(None) };

    let mut definition_stmt = conn.prepare(
        "SELECT source_code, source_name, body FROM dictionary_definitions
         WHERE entry_id = ?1 ORDER BY sort_order",
    )?;
    let definitions = definition_stmt
        .query_map(params![id], |r| {
            Ok(DictionaryDefinition {
                source_code: r.get(0)?,
                source_name: r.get(1)?,
                body: r.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut alias_stmt = conn.prepare("SELECT alias FROM dictionary_aliases WHERE entry_id = ?1 ORDER BY alias")?;
    let aliases = alias_stmt
        .query_map(params![id], |r| r.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(Some(DictionaryEntry { id, term, slug, body, definitions, aliases }))
}

pub fn search_dictionary(conn: &Connection, query: &str, limit: i64) -> anyhow::Result<Vec<DictionaryEntrySummary>> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    let match_expr = super::search::build_match_expr(query);
    let mut stmt = conn.prepare(&format!(
        "SELECT {DICTIONARY_COLS} FROM dictionary_fts JOIN dictionary_entries de ON de.id = dictionary_fts.rowid
         WHERE dictionary_fts MATCH ?1 ORDER BY bm25(dictionary_fts) LIMIT ?2"
    ))?;
    let rows = stmt.query_map(params![match_expr, limit], map_dictionary_summary)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

// ---------------------------------------------------------------------------
// Encyclopedia (ISBE)
// ---------------------------------------------------------------------------

fn map_isbe_summary(r: &rusqlite::Row) -> rusqlite::Result<IsbeEntrySummary> {
    Ok(IsbeEntrySummary {
        id: r.get(0)?,
        term: r.get(1)?,
        slug: r.get(2)?,
    })
}

/// The whole index, in article order. Rows are ordered by `sort_key` rather
/// than `term`, because ISBE alphabetizes "ABOMINATION, BIRDS OF" under
/// Abomination and the displayed term keeps that inversion.
pub fn list_isbe_index(conn: &Connection) -> anyhow::Result<Vec<IsbeEntrySummary>> {
    let mut stmt = conn.prepare("SELECT id, term, slug FROM isbe_entries ORDER BY sort_key COLLATE NOCASE")?;
    let rows = stmt.query_map([], map_isbe_summary)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// Every respelling, read once at startup and held in memory: read-aloud looks
/// up a word per spoken token, which is far too hot a path to go back to
/// SQLite for, and the whole table is only a few thousand short rows.
pub fn list_pronunciations(conn: &Connection) -> anyhow::Result<Vec<Pronunciation>> {
    let mut stmt = conn.prepare("SELECT word, respelling FROM pronunciations")?;
    let rows = stmt.query_map([], |r| {
        Ok(Pronunciation {
            word: r.get(0)?,
            respelling: r.get(1)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn get_isbe_entry(conn: &Connection, slug: &str) -> anyhow::Result<Option<IsbeEntry>> {
    Ok(conn
        .query_row(
            "SELECT id, term, slug, body, redirect_slug FROM isbe_entries WHERE slug = ?1",
            params![slug],
            |r| {
                Ok(IsbeEntry {
                    id: r.get(0)?,
                    term: r.get(1)?,
                    slug: r.get(2)?,
                    body: r.get(3)?,
                    redirect_slug: r.get(4)?,
                })
            },
        )
        .optional()?)
}

/// Exact (case-insensitive) match on a headword -- what links a dictionary
/// entry to the fuller article on the same subject. Alternate headwords count:
/// Smith's "Abagarus" should reach the article ISBE files under
/// "ABGAR; ABGARUS; ABAGARUS".
pub fn find_isbe_entry_by_term(conn: &Connection, term: &str) -> anyhow::Result<Option<IsbeEntrySummary>> {
    Ok(conn
        .query_row(
            "SELECT e.id, e.term, e.slug FROM isbe_entries e
             WHERE e.term = ?1 COLLATE NOCASE
             UNION ALL
             SELECT e.id, e.term, e.slug FROM isbe_aliases a JOIN isbe_entries e ON e.id = a.entry_id
             WHERE a.alias = ?1 COLLATE NOCASE
             LIMIT 1",
            params![term],
            map_isbe_summary,
        )
        .optional()?)
}

/// The dictionary entry covering the same subject as an ISBE article.
///
/// The mirror of `find_isbe_entry_by_term`, and it has to go through the
/// aliases for the same reason: ISBE files several headwords under one title,
/// so the article a reader is looking at may be called "Melchizedek;
/// Melchisedec" while Easton's calls the same man "Melchizedek". Matching the
/// titles alone would silently hide the link on exactly the entries that
/// carry the most names.
pub fn find_dictionary_entry_for_isbe(conn: &Connection, slug: &str) -> anyhow::Result<Option<DictionaryEntrySummary>> {
    Ok(conn
        .query_row(
            "WITH names(n) AS (
               SELECT term FROM isbe_entries WHERE slug = ?1
               UNION
               SELECT a.alias FROM isbe_aliases a JOIN isbe_entries e ON e.id = a.entry_id WHERE e.slug = ?1
             )
             SELECT de.id, de.term, de.slug, de.sources FROM dictionary_entries de
             JOIN names ON de.term = names.n COLLATE NOCASE
             LIMIT 1",
            params![slug],
            map_dictionary_summary,
        )
        .optional()?)
}

pub fn search_isbe(conn: &Connection, query: &str, limit: i64) -> anyhow::Result<Vec<IsbeEntrySummary>> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    let match_expr = super::search::build_match_expr(query);
    let mut stmt = conn.prepare(
        "SELECT e.id, e.term, e.slug FROM isbe_fts JOIN isbe_entries e ON e.id = isbe_fts.rowid
         WHERE isbe_fts MATCH ?1 ORDER BY bm25(isbe_fts) LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![match_expr, limit], map_isbe_summary)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// The encyclopedia articles that discuss a passage, most relevant first.
///
/// Ranked by weight squared over the article's total reach: how much of this
/// chapter the article cites, against how much else it talks about. Weight
/// alone puts the sweeping articles on top -- "Archaeology" cites Genesis 14
/// whole and would bury "Melchizedek" -- and focus alone hands the list to
/// one-line stubs that happen to cite nothing else. Together they give
/// Genesis 14 its kings, Exodus 20 the Ten Commandments, and Ruth 1 Naomi,
/// Orpah and Elimelech.
///
/// The +3000 is three citations' worth of smoothing, so an article with a
/// single reference cannot reach perfect focus and win on it.
pub fn isbe_for_passage(
    conn: &Connection,
    book_id: i64,
    chapter: i64,
    verse: Option<i64>,
    limit: i64,
) -> anyhow::Result<Vec<IsbePassageEntry>> {
    let verse_clause = if verse.is_some() { "AND r.verse = ?3" } else { "" };
    let sql = format!(
        "SELECT e.id, e.term, e.slug, GROUP_CONCAT(DISTINCT r.verse), e.ref_count,
                SUM(r.weight) * SUM(r.weight) / (e.ref_count * 1000 + 3000) AS score
         FROM isbe_refs r JOIN isbe_entries e ON e.id = r.entry_id
         WHERE r.book_id = ?1 AND r.chapter = ?2 {verse_clause}
         GROUP BY e.id
         ORDER BY score DESC, e.ref_count ASC, e.term COLLATE NOCASE
         LIMIT {}",
        if verse.is_some() { "?4" } else { "?3" }
    );
    let mut stmt = conn.prepare(&sql)?;
    let map = |r: &rusqlite::Row| -> rusqlite::Result<IsbePassageEntry> {
        let verses: String = r.get(3)?;
        let mut verses: Vec<i64> = verses.split(',').filter_map(|v| v.parse().ok()).collect();
        verses.sort_unstable();
        Ok(IsbePassageEntry {
            id: r.get(0)?,
            term: r.get(1)?,
            slug: r.get(2)?,
            verses,
            ref_count: r.get(4)?,
        })
    };
    let rows = match verse {
        Some(v) => stmt.query_map(params![book_id, chapter, v, limit], map)?.collect::<Result<Vec<_>, _>>()?,
        None => stmt.query_map(params![book_id, chapter, limit], map)?.collect::<Result<Vec<_>, _>>()?,
    };
    Ok(rows)
}

/// The encyclopedia as a corpus for the global search overlay.
///
/// Separate from the pane's own `search_isbe` on two counts: it takes the full
/// search-query language rather than bare prefixes, and it returns a snippet
/// of the article body, so a result is worth reading before it is opened.
pub fn search_isbe_global(conn: &Connection, query: &str, limit: i64) -> anyhow::Result<Vec<IsbeSearchResult>> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    let match_expr = super::search::build_match_expr(query);
    let mut stmt = conn.prepare(
        "SELECT e.id, e.term, e.slug, snippet(isbe_fts, 1, char(2), char(3), '…', 14)
         FROM isbe_fts JOIN isbe_entries e ON e.id = isbe_fts.rowid
         WHERE isbe_fts MATCH ?1 ORDER BY bm25(isbe_fts) LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![match_expr, limit], |r| {
        Ok(IsbeSearchResult {
            id: r.get(0)?,
            term: r.get(1)?,
            slug: r.get(2)?,
            snippet: super::search::escape_snippet(&r.get::<_, String>(3)?),
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn get_interlinear_for_chapter(
    conn: &Connection,
    book_id: i64,
    chapter: i64,
) -> anyhow::Result<HashMap<i64, Vec<InterlinearWord>>> {
    let mut stmt = conn.prepare(
        "SELECT id, verse, sort_order, text, strongs_id FROM interlinear_words
         WHERE book_id = ?1 AND chapter = ?2 ORDER BY verse, sort_order",
    )?;
    let rows = stmt.query_map(params![book_id, chapter], |r| {
        Ok((
            r.get::<_, i64>(1)?,
            InterlinearWord {
                id: r.get(0)?,
                sort_order: r.get(2)?,
                text: r.get(3)?,
                strongs_id: r.get(4)?,
            },
        ))
    })?;
    let mut map: HashMap<i64, Vec<InterlinearWord>> = HashMap::new();
    for row in rows {
        let (verse, word) = row?;
        map.entry(verse).or_default().push(word);
    }
    Ok(map)
}

pub fn get_morphology_for_chapter(
    conn: &Connection,
    book_id: i64,
    chapter: i64,
) -> anyhow::Result<HashMap<i64, Vec<MorphologyWord>>> {
    let mut stmt = conn.prepare(
        "SELECT id, verse, sort_order, original_word, lemma, morph_code, strongs_id FROM morphology_words
         WHERE book_id = ?1 AND chapter = ?2 ORDER BY verse, sort_order",
    )?;
    let rows = stmt.query_map(params![book_id, chapter], |r| {
        Ok((
            r.get::<_, i64>(1)?,
            MorphologyWord {
                id: r.get(0)?,
                sort_order: r.get(2)?,
                original_word: r.get(3)?,
                lemma: r.get(4)?,
                morph_code: r.get(5)?,
                strongs_id: r.get(6)?,
            },
        ))
    })?;
    let mut map: HashMap<i64, Vec<MorphologyWord>> = HashMap::new();
    for row in rows {
        let (verse, word) = row?;
        map.entry(verse).or_default().push(word);
    }
    Ok(map)
}

/// Footnotes for a chapter, keyed by verse. Currently only available for
/// translations with a sourced footnote edition (ASV); other translations
/// return an empty map, not an error.
pub fn get_footnotes_for_chapter(
    conn: &Connection,
    translation_id: i64,
    book_id: i64,
    chapter: i64,
) -> anyhow::Result<HashMap<i64, Vec<Footnote>>> {
    let mut stmt = conn.prepare(
        "SELECT id, verse, sort_order, marker, text, char_offset FROM footnotes
         WHERE translation_id = ?1 AND book_id = ?2 AND chapter = ?3 ORDER BY verse, sort_order",
    )?;
    let rows = stmt.query_map(params![translation_id, book_id, chapter], |r| {
        Ok((
            r.get::<_, i64>(1)?,
            Footnote {
                id: r.get(0)?,
                verse: r.get(1)?,
                sort_order: r.get(2)?,
                marker: r.get(3)?,
                text: r.get(4)?,
                char_offset: r.get(5)?,
            },
        ))
    })?;
    let mut map: HashMap<i64, Vec<Footnote>> = HashMap::new();
    for row in rows {
        let (verse, note) = row?;
        map.entry(verse).or_default().push(note);
    }
    Ok(map)
}
