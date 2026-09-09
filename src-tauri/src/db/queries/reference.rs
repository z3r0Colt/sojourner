use crate::models::{DictionaryEntry, DictionaryEntrySummary, Footnote, InterlinearWord, MorphologyWord, StrongsEntry};
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
    })
}

const STRONGS_COLS: &str =
    "id, language, original_word, transliteration, pronunciation, short_definition, definition, derivation, kjv_usage";

pub fn get_strongs_entry(conn: &Connection, id: &str) -> anyhow::Result<Option<StrongsEntry>> {
    Ok(conn
        .query_row(
            &format!("SELECT {STRONGS_COLS} FROM strongs_entries WHERE id = ?1"),
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
    let sql = format!("SELECT {STRONGS_COLS} FROM strongs_entries WHERE id IN ({placeholders})");
    let mut stmt = conn.prepare(&sql)?;
    let param_refs: Vec<&dyn rusqlite::ToSql> = ids.iter().map(|s| s as &dyn rusqlite::ToSql).collect();
    let rows = stmt.query_map(param_refs.as_slice(), map_strongs)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn search_strongs(conn: &Connection, query: &str, language: Option<&str>, limit: i64) -> anyhow::Result<Vec<StrongsEntry>> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    let match_expr = query
        .split_whitespace()
        .map(|t| format!("\"{}\"*", t.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(" ");
    let lang_clause = if language.is_some() { "AND se.language = ?3" } else { "" };
    let sql = format!(
        "SELECT se.id, se.language, se.original_word, se.transliteration, se.pronunciation, se.short_definition, se.definition, se.derivation, se.kjv_usage
         FROM strongs_fts f JOIN strongs_entries se ON se.rowid = f.rowid
         WHERE f MATCH ?1 {lang_clause}
         ORDER BY se.id LIMIT ?2"
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

pub fn list_dictionary_index(conn: &Connection) -> anyhow::Result<Vec<DictionaryEntrySummary>> {
    let mut stmt = conn.prepare("SELECT id, term, slug FROM dictionary_entries ORDER BY term COLLATE NOCASE")?;
    let rows = stmt.query_map([], |r| {
        Ok(DictionaryEntrySummary {
            id: r.get(0)?,
            term: r.get(1)?,
            slug: r.get(2)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn get_dictionary_entry(conn: &Connection, slug: &str) -> anyhow::Result<Option<DictionaryEntry>> {
    Ok(conn
        .query_row(
            "SELECT id, term, slug, body FROM dictionary_entries WHERE slug = ?1",
            params![slug],
            |r| {
                Ok(DictionaryEntry {
                    id: r.get(0)?,
                    term: r.get(1)?,
                    slug: r.get(2)?,
                    body: r.get(3)?,
                })
            },
        )
        .optional()?)
}

pub fn search_dictionary(conn: &Connection, query: &str, limit: i64) -> anyhow::Result<Vec<DictionaryEntrySummary>> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    let match_expr = query
        .split_whitespace()
        .map(|t| format!("\"{}\"*", t.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(" ");
    let mut stmt = conn.prepare(
        "SELECT de.id, de.term, de.slug FROM dictionary_fts f JOIN dictionary_entries de ON de.id = f.rowid
         WHERE f MATCH ?1 ORDER BY de.term LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![match_expr, limit], |r| {
        Ok(DictionaryEntrySummary {
            id: r.get(0)?,
            term: r.get(1)?,
            slug: r.get(2)?,
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
