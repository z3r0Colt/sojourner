use crate::models::{
    WestminsterCommentaryEntry, WestminsterCommentarySource, WestminsterDocument, WestminsterPassageMatch, WestminsterProofRef,
    WestminsterSection, WestminsterSectionSummary,
};
use rusqlite::{params, Connection};

pub fn list_documents(conn: &Connection) -> anyhow::Result<Vec<WestminsterDocument>> {
    let mut stmt = conn.prepare("SELECT id, code, title FROM westminster_documents ORDER BY id")?;
    let rows = stmt.query_map([], |r| {
        Ok(WestminsterDocument {
            id: r.get(0)?,
            code: r.get(1)?,
            title: r.get(2)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn list_sections(conn: &Connection, document_id: i64) -> anyhow::Result<Vec<WestminsterSectionSummary>> {
    let mut stmt = conn.prepare(
        "SELECT id, sort_order, heading FROM westminster_sections WHERE document_id = ?1 ORDER BY sort_order",
    )?;
    let rows = stmt.query_map(params![document_id], |r| {
        Ok(WestminsterSectionSummary {
            id: r.get(0)?,
            sort_order: r.get(1)?,
            heading: r.get(2)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn get_section(conn: &Connection, id: i64) -> anyhow::Result<Option<WestminsterSection>> {
    let base = conn
        .query_row(
            "SELECT id, document_id, sort_order, heading, prompt, body, body_with_proofs FROM westminster_sections WHERE id = ?1",
            params![id],
            |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, i64>(1)?,
                    r.get::<_, i64>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, Option<String>>(4)?,
                    r.get::<_, String>(5)?,
                    r.get::<_, String>(6)?,
                ))
            },
        )
        .ok();
    let Some((id, document_id, sort_order, heading, prompt, body, body_with_proofs)) = base else {
        return Ok(None);
    };

    let mut stmt = conn.prepare(
        "SELECT marker, book_id, chapter, verse_start, verse_end FROM westminster_proofs
         WHERE section_id = ?1 ORDER BY marker, sort_order",
    )?;
    let proofs = stmt
        .query_map(params![id], |r| {
            Ok(WestminsterProofRef {
                marker: r.get(0)?,
                book_id: r.get(1)?,
                chapter: r.get(2)?,
                verse_start: r.get(3)?,
                verse_end: r.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(Some(WestminsterSection {
        id,
        document_id,
        sort_order,
        heading,
        prompt,
        body,
        body_with_proofs,
        proofs,
    }))
}

/// The reverse of a proof marker: given a single verse reference, every
/// Standards paragraph that cites it as a proof text, across all three
/// documents. Mirrors `crossrefs::get_cross_references`'s single-verse
/// signature since both are driven by the reading pane's active verse.
pub fn get_confession_for_passage(conn: &Connection, book_id: i64, chapter: i64, verse: i64) -> anyhow::Result<Vec<WestminsterPassageMatch>> {
    let mut stmt = conn.prepare(
        "SELECT DISTINCT ws.id, ws.document_id, wd.code, wd.title, ws.heading, ws.prompt, wp.marker
         FROM westminster_proofs wp
         JOIN westminster_sections ws ON ws.id = wp.section_id
         JOIN westminster_documents wd ON wd.id = ws.document_id
         WHERE wp.book_id = ?1 AND wp.chapter = ?2 AND ?3 BETWEEN wp.verse_start AND wp.verse_end
         ORDER BY wd.id, ws.sort_order, wp.marker",
    )?;
    let rows = stmt.query_map(params![book_id, chapter, verse], |r| {
        Ok(WestminsterPassageMatch {
            section_id: r.get(0)?,
            document_id: r.get(1)?,
            document_code: r.get(2)?,
            document_title: r.get(3)?,
            heading: r.get(4)?,
            prompt: r.get(5)?,
            marker: r.get(6)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// Every WCF chapter number cited anywhere in a given Bible chapter (any
/// verse, not one specific verse like `get_confession_for_passage`) -- the
/// building block for "what doctrines does this chapter touch on," used by
/// the resource auto-suggestion feature. Parses each matching section's
/// "Chapter N, M" heading (the format `westminster::import` writes) rather
/// than storing a redundant chapter-number column.
pub fn list_wcf_chapters_cited(conn: &Connection, book_id: i64, chapter: i64) -> anyhow::Result<Vec<i64>> {
    let mut stmt = conn.prepare(
        "SELECT DISTINCT ws.heading FROM westminster_proofs wp
         JOIN westminster_sections ws ON ws.id = wp.section_id
         JOIN westminster_documents wd ON wd.id = ws.document_id
         WHERE wd.code = 'wcf' AND wp.book_id = ?1 AND wp.chapter = ?2",
    )?;
    let headings: Vec<String> = stmt.query_map(params![book_id, chapter], |r| r.get(0))?.collect::<Result<_, _>>()?;
    let mut chapters: Vec<i64> = headings
        .iter()
        .filter_map(|h| h.strip_prefix("Chapter ")?.split(',').next()?.trim().parse().ok())
        .collect();
    chapters.sort_unstable();
    chapters.dedup();
    Ok(chapters)
}

pub fn list_commentary_sources(conn: &Connection) -> anyhow::Result<Vec<WestminsterCommentarySource>> {
    let mut stmt =
        conn.prepare("SELECT id, code, title, author, document_code FROM westminster_commentary_sources ORDER BY id")?;
    let rows = stmt.query_map([], |r| {
        Ok(WestminsterCommentarySource {
            id: r.get(0)?,
            code: r.get(1)?,
            title: r.get(2)?,
            author: r.get(3)?,
            document_code: r.get(4)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn get_commentary_for_chapter(conn: &Connection, source_id: i64, chapter: i64) -> anyhow::Result<Vec<WestminsterCommentaryEntry>> {
    let mut stmt = conn.prepare(
        "SELECT id, chapter, section, sort_order, body FROM westminster_commentary_entries
         WHERE source_id = ?1 AND chapter = ?2 ORDER BY sort_order",
    )?;
    let rows = stmt.query_map(params![source_id, chapter], |r| {
        Ok(WestminsterCommentaryEntry {
            id: r.get(0)?,
            chapter: r.get(1)?,
            section: r.get(2)?,
            sort_order: r.get(3)?,
            body: r.get(4)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn search(conn: &Connection, query: &str, limit: i64) -> anyhow::Result<Vec<(i64, i64, String, Option<String>, String)>> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    let match_expr = query
        .split_whitespace()
        .map(|t| format!("\"{}\"*", t.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(" ");
    let mut stmt = conn.prepare(
        "SELECT ws.id, ws.document_id, ws.heading, ws.prompt, snippet(westminster_fts, 2, '[', ']', '…', 12)
         FROM westminster_fts JOIN westminster_sections ws ON ws.id = westminster_fts.rowid
         WHERE westminster_fts MATCH ?1 ORDER BY bm25(westminster_fts) LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![match_expr, limit], |r| {
        Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}
