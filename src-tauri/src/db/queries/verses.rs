use crate::models::{Book, Translation, Verse};
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
                (SELECT COUNT(*) FROM verses v WHERE v.translation_id = t.id) as verse_count
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
