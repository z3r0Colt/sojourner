use crate::models::{Book, BookCoverage, Translation, Verse};
use rusqlite::{params, Connection};

pub fn list_books(conn: &Connection) -> anyhow::Result<Vec<Book>> {
    let mut stmt = conn.prepare(
        "SELECT id, osis_code, name, short_name, testament, chapter_count FROM books ORDER BY id",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(Book {
            id: r.get(0)?,
            osis_code: r.get(1)?,
            name: r.get(2)?,
            short_name: r.get(3)?,
            testament: r.get(4)?,
            chapter_count: r.get(5)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn list_translations(conn: &Connection) -> anyhow::Result<Vec<Translation>> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.code, t.name, t.language, t.source_path, t.imported_at,
                (SELECT COUNT(*) FROM verses v WHERE v.translation_id = t.id) as verse_count,
                t.license_status
         FROM translations t ORDER BY t.name",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(Translation {
            id: r.get(0)?,
            code: r.get(1)?,
            name: r.get(2)?,
            language: r.get(3)?,
            source_path: r.get(4)?,
            imported_at: r.get(5)?,
            verse_count: r.get(6)?,
            license_status: r.get(7)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn get_chapter(
    conn: &Connection,
    translation_id: i64,
    book_id: i64,
    chapter: i64,
) -> anyhow::Result<Vec<Verse>> {
    let mut stmt = conn.prepare(
        "SELECT id, translation_id, book_id, chapter, verse, text FROM verses
         WHERE translation_id = ?1 AND book_id = ?2 AND chapter = ?3 ORDER BY verse",
    )?;
    let rows = stmt.query_map(params![translation_id, book_id, chapter], |r| {
        Ok(Verse {
            id: r.get(0)?,
            translation_id: r.get(1)?,
            book_id: r.get(2)?,
            chapter: r.get(3)?,
            verse: r.get(4)?,
            text: r.get(5)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// Like `get_chapter`, but resolves through `versification_map` first: given
/// a *canonical* (KJV-reference) chapter, returns this translation's own
/// verses for it, renumbered into canonical verse numbers where they differ.
/// This is what lets Parallel mode line editions up correctly even when one
/// of them has a different chapter/verse division for this book (e.g.
/// Webster's Bible following Joel's Hebrew 4-chapter split, or numbering a
/// Psalm superscription as its own verse) instead of naively assuming
/// `(book, chapter, verse)` means the same passage in every translation.
/// For the overwhelming majority of chapters, no translation has any
/// `versification_map` rows for it, so this degenerates to a plain
/// `get_chapter` lookup.
pub fn get_chapter_canonical(
    conn: &Connection,
    translation_id: i64,
    book_id: i64,
    canonical_chapter: i64,
) -> anyhow::Result<Vec<Verse>> {
    let mut stmt = conn.prepare(
        "SELECT v.id, v.translation_id, v.book_id, ?3 AS chapter, vm.canonical_verse AS verse, v.text
         FROM versification_map vm
         JOIN verses v ON v.translation_id = vm.translation_id AND v.book_id = vm.book_id
                      AND v.chapter = vm.chapter AND v.verse = vm.verse
         WHERE vm.translation_id = ?1 AND vm.book_id = ?2 AND vm.canonical_chapter = ?3
         UNION ALL
         SELECT v.id, v.translation_id, v.book_id, ?3 AS chapter, v.verse AS verse, v.text
         FROM verses v
         WHERE v.translation_id = ?1 AND v.book_id = ?2 AND v.chapter = ?3
           AND NOT EXISTS (
             SELECT 1 FROM versification_map vm2
             WHERE vm2.translation_id = v.translation_id AND vm2.book_id = v.book_id
               AND vm2.chapter = v.chapter AND vm2.verse = v.verse
           )
         ORDER BY verse",
    )?;
    let rows = stmt.query_map(params![translation_id, book_id, canonical_chapter], |r| {
        Ok(Verse {
            id: r.get(0)?,
            translation_id: r.get(1)?,
            book_id: r.get(2)?,
            chapter: r.get(3)?,
            verse: r.get(4)?,
            text: r.get(5)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// Which chapters of each book a translation has verses for -- see
/// `BookCoverage`.
pub fn get_translation_coverage(conn: &Connection, translation_id: i64) -> anyhow::Result<Vec<BookCoverage>> {
    let mut stmt = conn.prepare(
        "SELECT book_id, chapter FROM verses WHERE translation_id = ?1 GROUP BY book_id, chapter ORDER BY book_id, chapter",
    )?;
    let rows = stmt.query_map(params![translation_id], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?)))?;
    let mut by_book: Vec<BookCoverage> = Vec::new();
    for row in rows {
        let (book_id, chapter) = row?;
        match by_book.last_mut() {
            Some(b) if b.book_id == book_id => b.chapters.push(chapter),
            _ => by_book.push(BookCoverage { book_id, chapters: vec![chapter] }),
        }
    }
    Ok(by_book)
}

pub fn get_max_chapter_verse_count(
    conn: &Connection,
    translation_id: i64,
    book_id: i64,
    chapter: i64,
) -> anyhow::Result<i64> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM verses WHERE translation_id=?1 AND book_id=?2 AND chapter=?3",
        params![translation_id, book_id, chapter],
        |r| r.get(0),
    )?;
    Ok(count)
}

pub fn remove_translation(conn: &Connection, translation_id: i64) -> anyhow::Result<()> {
    conn.execute("DELETE FROM translations WHERE id = ?1", params![translation_id])?;
    Ok(())
}
