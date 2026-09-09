use crate::models::BookAlias;
use rusqlite::Connection;

/// Every book-name alias any bundled translation's own source uses that
/// differs from the canonical name (e.g. a Vulgate-named edition's "Josue"
/// for Joshua) -- deduplicated by (book_id, name), since the Go To palette
/// and book picker just need the set of names to resolve, not which
/// translation(s) use each one.
pub fn list_book_aliases(conn: &Connection) -> anyhow::Result<Vec<BookAlias>> {
    let mut stmt = conn.prepare(
        "SELECT book_id, name, short_name FROM book_aliases GROUP BY book_id, name ORDER BY book_id",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(BookAlias {
            book_id: r.get(0)?,
            name: r.get(1)?,
            short_name: r.get(2)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}
