use crate::models::{CommentaryEntry, CommentarySection, CommentarySource};
use rusqlite::{params, Connection};

pub fn list_commentary_sources(conn: &Connection) -> anyhow::Result<Vec<CommentarySource>> {
    let mut stmt = conn.prepare(
        "SELECT id, code, title, author, imported_at FROM commentary_sources ORDER BY title",
    )?;
    let sources = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, Option<String>>(3)?,
                r.get::<_, String>(4)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut result = Vec::new();
    for (id, code, title, author, imported_at) in sources {
        let mut bstmt = conn.prepare(
            "SELECT book_id FROM commentary_books WHERE commentary_source_id = ?1 ORDER BY book_id",
        )?;
        let covered_book_ids = bstmt
            .query_map(params![id], |r| r.get::<_, i64>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        result.push(CommentarySource {
            id,
            code,
            title,
            author,
            imported_at,
            covered_book_ids,
        });
    }
    Ok(result)
}

/// Entries relevant to a specific passage: entries tagged with this exact chapter
/// (including chapter-level preamble paragraphs with no specific verse), further
/// filtered to the given verse if provided. Book-level front matter (chapter IS
/// NULL, e.g. a book's "Introduction" section) is deliberately excluded here --
/// it belongs to the standalone "read as book" view, not every chapter's panel.
pub fn get_commentary_for_passage(
    conn: &Connection,
    source_id: i64,
    book_id: i64,
    chapter: i64,
    verse: Option<i64>,
) -> anyhow::Result<Vec<CommentaryEntry>> {
    let mut stmt = conn.prepare(
        "SELECT ce.id, ce.section_id, ce.sort_order, ce.book_id, ce.chapter, ce.verse_start, ce.verse_end,
                ce.html, ce.plain_text, cs.title
         FROM commentary_entries ce
         JOIN commentary_sections cs ON cs.id = ce.section_id
         WHERE cs.commentary_source_id = ?1 AND ce.book_id = ?2 AND ce.chapter = ?3
         ORDER BY ce.sort_order",
    )?;
    let rows = stmt
        .query_map(params![source_id, book_id, chapter], |r| {
            Ok(CommentaryEntry {
                id: r.get(0)?,
                section_id: r.get(1)?,
                sort_order: r.get(2)?,
                book_id: r.get(3)?,
                chapter: r.get(4)?,
                verse_start: r.get(5)?,
                verse_end: r.get(6)?,
                html: r.get(7)?,
                plain_text: r.get(8)?,
                section_title: r.get(9)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    if let Some(v) = verse {
        Ok(rows
            .into_iter()
            .filter(|e| match (e.verse_start, e.verse_end) {
                (Some(s), Some(end)) => v >= s && v <= end,
                (Some(s), None) => v >= s,
                _ => true, // narrative/intro entries with no verse anchor still shown for context
            })
            .collect())
    } else {
        Ok(rows)
    }
}

pub fn book_has_commentary(conn: &Connection, source_id: i64, book_id: i64) -> anyhow::Result<bool> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM commentary_books WHERE commentary_source_id = ?1 AND book_id = ?2",
        params![source_id, book_id],
        |r| r.get(0),
    )?;
    Ok(count > 0)
}

pub fn list_sections_for_book(
    conn: &Connection,
    source_id: i64,
    book_id: i64,
) -> anyhow::Result<Vec<CommentarySection>> {
    let mut stmt = conn.prepare(
        "SELECT id, book_id, chapter, title, sort_order FROM commentary_sections
         WHERE commentary_source_id = ?1 AND book_id = ?2 ORDER BY sort_order",
    )?;
    let rows = stmt.query_map(params![source_id, book_id], |r| {
        Ok(CommentarySection {
            id: r.get(0)?,
            book_id: r.get(1)?,
            chapter: r.get(2)?,
            title: r.get(3)?,
            sort_order: r.get(4)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn get_section_entries(conn: &Connection, section_id: i64) -> anyhow::Result<Vec<CommentaryEntry>> {
    let mut stmt = conn.prepare(
        "SELECT ce.id, ce.section_id, ce.sort_order, ce.book_id, ce.chapter, ce.verse_start, ce.verse_end,
                ce.html, ce.plain_text, cs.title
         FROM commentary_entries ce
         JOIN commentary_sections cs ON cs.id = ce.section_id
         WHERE ce.section_id = ?1 ORDER BY ce.sort_order",
    )?;
    let rows = stmt.query_map(params![section_id], |r| {
        Ok(CommentaryEntry {
            id: r.get(0)?,
            section_id: r.get(1)?,
            sort_order: r.get(2)?,
            book_id: r.get(3)?,
            chapter: r.get(4)?,
            verse_start: r.get(5)?,
            verse_end: r.get(6)?,
            html: r.get(7)?,
            plain_text: r.get(8)?,
            section_title: r.get(9)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn remove_commentary_source(conn: &Connection, source_id: i64) -> anyhow::Result<()> {
    conn.execute(
        "DELETE FROM commentary_sources WHERE id = ?1",
        params![source_id],
    )?;
    Ok(())
}
