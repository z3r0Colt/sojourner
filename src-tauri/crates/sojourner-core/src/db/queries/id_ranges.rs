//! Each translation's verse ids and each commentary's entry ids as runs:
//! first..last, every id between them that translation's (or commentary's)
//! and in one book (`verse_id_ranges`, `commentary_id_ranges`; see
//! CONTENT_MIGRATION_0034). A translation is usually one run per book; a
//! commentary that weaves books together (Calvin's Harmony of the Gospels)
//! takes a few more.
//!
//! The full-text indexes are keyed by those ids, so with the runs at hand a
//! search can keep to one translation, commentary, or book with
//! `rowid BETWEEN` on the index itself, and say which book or translation a
//! hit is in without reading its row. On the desktop that is a little
//! faster; on the web, where every row read may be a request over the
//! network, it is the difference between kilobytes and hundreds of
//! megabytes for a common word.
//!
//! The runs are read off the rows themselves, so they are exact, and the
//! triggers in the migration drop a translation's runs as soon as one of its
//! verses is added, removed or moved. So a run that exists can be trusted,
//! and where there is none the caller searches the old way.

use crate::db::queries::query_lang::Filters;
use rusqlite::{params, Connection};
use std::collections::BTreeSet;

/// One run: these ids are exactly `owner`'s rows in `book_id`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct IdRange {
    pub owner: i64,
    pub book_id: i64,
    pub first: i64,
    pub last: i64,
}

/// More runs than this and a translation or commentary is left without: its
/// ids are too scattered for a condition on them to be worth writing.
const MAX_RUNS: usize = 2000;

/// Writes the runs for every translation and commentary that has none yet.
/// Cheap when nothing is missing; run at the end of the content build and
/// after a reader's import.
pub fn stamp(conn: &Connection) -> anyhow::Result<()> {
    let tx = conn.unchecked_transaction()?;
    let owners = |sql: &str| -> anyhow::Result<Vec<i64>> {
        Ok(tx.prepare(sql)?.query_map([], |r| r.get(0))?.collect::<Result<_, _>>()?)
    };
    let translations = owners(
        "SELECT t.id FROM translations t
         WHERE NOT EXISTS (SELECT 1 FROM verse_id_ranges r WHERE r.translation_id = t.id)",
    )?;
    let sources = owners(
        "SELECT s.id FROM commentary_sources s
         WHERE NOT EXISTS (SELECT 1 FROM commentary_id_ranges r WHERE r.source_id = s.id)",
    )?;
    for id in translations {
        let found = runs(&tx, "SELECT id, book_id FROM verses WHERE translation_id = ?1 ORDER BY id", id)?;
        let mut insert = tx.prepare("INSERT INTO verse_id_ranges (translation_id, first_id, last_id, book_id) VALUES (?1, ?2, ?3, ?4)")?;
        for (first, last, book) in found {
            insert.execute(params![id, first, last, book])?;
        }
    }
    for id in sources {
        let found = runs(
            &tx,
            "SELECT ce.id, ce.book_id FROM commentary_entries ce JOIN commentary_sections s ON s.id = ce.section_id
             WHERE s.commentary_source_id = ?1 ORDER BY ce.id",
            id,
        )?;
        let mut insert = tx.prepare("INSERT INTO commentary_id_ranges (source_id, first_id, last_id, book_id) VALUES (?1, ?2, ?3, ?4)")?;
        for (first, last, book) in found {
            insert.execute(params![id, first, last, book])?;
        }
    }
    tx.commit()?;
    Ok(())
}

/// One owner's rows, `(id, book)` in id order, cut into (first, last, book)
/// wherever the id skips or the book changes. Empty when there are none, or
/// too many to be useful.
fn runs(conn: &Connection, sql: &str, owner: i64) -> anyhow::Result<Vec<(i64, i64, i64)>> {
    let mut out: Vec<(i64, i64, i64)> = Vec::new();
    let mut stmt = conn.prepare(sql)?;
    let mut rows = stmt.query([owner])?;
    while let Some(row) = rows.next()? {
        let (id, book): (i64, i64) = (row.get(0)?, row.get(1)?);
        match out.last_mut() {
            Some(run) if run.1 + 1 == id && run.2 == book => run.1 = id,
            _ => {
                if out.len() == MAX_RUNS {
                    return Ok(vec![]);
                }
                out.push((id, id, book));
            }
        }
    }
    Ok(out)
}

/// The runs of `owners` (translations, or commentaries with `commentary`),
/// limited to `books` when given, sorted by first id; None when any of the
/// owners has none (then the caller searches the old way).
pub fn lookup(conn: &Connection, commentary: bool, owners: &[i64], books: Option<&BTreeSet<i64>>) -> anyhow::Result<Option<Vec<IdRange>>> {
    if owners.is_empty() {
        return Ok(Some(vec![]));
    }
    let (table, owner_col) = if commentary { ("commentary_id_ranges", "source_id") } else { ("verse_id_ranges", "translation_id") };
    let ph = vec!["?"; owners.len()].join(",");
    let sql = format!("SELECT {owner_col}, book_id, first_id, last_id FROM {table} WHERE {owner_col} IN ({ph})");
    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        // A content.db from before CONTENT_MIGRATION_0034.
        Err(_) => return Ok(None),
    };
    let all: Vec<IdRange> = stmt
        .query_map(rusqlite::params_from_iter(owners), |r| {
            Ok(IdRange { owner: r.get(0)?, book_id: r.get(1)?, first: r.get(2)?, last: r.get(3)? })
        })?
        .collect::<Result<_, _>>()?;
    let covered: BTreeSet<i64> = all.iter().map(|r| r.owner).collect();
    if owners.iter().any(|o| !covered.contains(o)) {
        return Ok(None);
    }
    let mut ranges: Vec<IdRange> = all.into_iter().filter(|r| books.is_none_or(|b| b.contains(&r.book_id))).collect();
    ranges.sort_by_key(|r| r.first);
    Ok(Some(ranges))
}

/// `col BETWEEN a AND b OR ...` over `ranges`, neighbours merged; `0` (no
/// rows) when there are none. The bounds are integers from the database,
/// written in rather than bound, so the condition can sit anywhere.
pub fn condition(col: &str, ranges: &[IdRange]) -> String {
    let mut merged: Vec<(i64, i64)> = Vec::new();
    for r in ranges {
        match merged.last_mut() {
            Some(last) if r.first == last.1 + 1 => last.1 = r.last,
            _ => merged.push((r.first, r.last)),
        }
    }
    if merged.is_empty() {
        return "0".to_string();
    }
    let parts: Vec<String> = merged.iter().map(|(a, b)| format!("{col} BETWEEN {a} AND {b}")).collect();
    format!("({})", parts.join(" OR "))
}

/// The run holding `id`, if any (`ranges` sorted by first id).
pub fn find(ranges: &[IdRange], id: i64) -> Option<&IdRange> {
    let i = ranges.partition_point(|r| r.first <= id);
    ranges[..i].last().filter(|r| id <= r.last)
}

/// Hits per book and per owner, from the hits' ids alone.
pub fn tally(ranges: &[IdRange], ids: impl Iterator<Item = i64>) -> (Vec<(i64, i64)>, Vec<(i64, i64)>) {
    let mut by_book = std::collections::BTreeMap::<i64, i64>::new();
    let mut by_owner = std::collections::BTreeMap::<i64, i64>::new();
    for id in ids {
        if let Some(r) = find(ranges, id) {
            *by_book.entry(r.book_id).or_default() += 1;
            *by_owner.entry(r.owner).or_default() += 1;
        }
    }
    (by_book.into_iter().collect(), by_owner.into_iter().collect())
}

/// The books a Scripture search may keep to through runs alone:
/// `Some(None)` for all of them, `Some(Some(books))` for some, and `None`
/// when a filter needs each verse's own row (a chapter, a Strong's number, a
/// highlight...), which the runs cannot answer.
pub fn verse_book_scope(
    conn: &Connection,
    filters: &Filters,
    scope_book: Option<i64>,
    scope_testament: Option<&str>,
) -> anyhow::Result<Option<Option<BTreeSet<i64>>>> {
    // Every field named, so that a new filter has to be thought about here.
    let Filters {
        books,
        chapter,
        testament,
        translations: _,
        all_translations: _,
        commentaries: _,
        strongs,
        lemmas,
        red,
        tags,
        speakers,
        has_note,
        has_highlight,
        color,
        since: _,
        series: _,
    } = filters;
    if chapter.is_some()
        || !strongs.is_empty()
        || !lemmas.is_empty()
        || *red
        || !tags.is_empty()
        || !speakers.is_empty()
        || *has_note
        || *has_highlight
        || color.is_some()
    {
        return Ok(None);
    }
    Ok(Some(books_within(conn, books, scope_book, scope_testament.or(testament.as_deref()))?))
}

/// The same for a commentary search, which applies only the book, the
/// testament and the chapter (see `search::commentary_query`).
pub fn commentary_book_scope(
    conn: &Connection,
    filters: &Filters,
    scope_book: Option<i64>,
    scope_testament: Option<&str>,
) -> anyhow::Result<Option<Option<BTreeSet<i64>>>> {
    if filters.chapter.is_some() {
        return Ok(None);
    }
    Ok(Some(books_within(conn, &filters.books, scope_book, scope_testament.or(filters.testament.as_deref()))?))
}

/// Every condition on the book at once: None for "any book".
fn books_within(conn: &Connection, books: &[i64], book: Option<i64>, testament: Option<&str>) -> anyhow::Result<Option<BTreeSet<i64>>> {
    let mut keep: Option<BTreeSet<i64>> = None;
    let mut narrow = |set: BTreeSet<i64>| {
        keep = Some(match keep.take() {
            Some(k) => k.intersection(&set).copied().collect(),
            None => set,
        });
    };
    if let Some(b) = book {
        narrow(BTreeSet::from([b]));
    }
    if !books.is_empty() {
        narrow(books.iter().copied().collect());
    }
    if let Some(t) = testament {
        let ids: BTreeSet<i64> =
            conn.prepare("SELECT id FROM books WHERE testament = ?1")?.query_map([t], |r| r.get(0))?.collect::<Result<_, _>>()?;
        narrow(ids);
    }
    Ok(keep)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn r(owner: i64, book_id: i64, first: i64, last: i64) -> IdRange {
        IdRange { owner, book_id, first, last }
    }

    #[test]
    fn neighbouring_runs_merge_into_one_condition() {
        let ranges = [r(1, 1, 1, 10), r(1, 2, 11, 20), r(2, 1, 31, 40)];
        assert_eq!(condition("rowid", &ranges), "(rowid BETWEEN 1 AND 20 OR rowid BETWEEN 31 AND 40)");
        assert_eq!(condition("rowid", &[]), "0");
    }

    #[test]
    fn an_id_is_found_in_its_run_and_nowhere_else() {
        let ranges = [r(1, 1, 1, 10), r(1, 2, 11, 20), r(2, 1, 31, 40)];
        assert_eq!(find(&ranges, 1).map(|r| r.book_id), Some(1));
        assert_eq!(find(&ranges, 15).map(|r| r.book_id), Some(2));
        assert_eq!(find(&ranges, 40).map(|r| r.owner), Some(2));
        assert_eq!(find(&ranges, 25), None);
        assert_eq!(find(&ranges, 0), None);
        assert_eq!(find(&ranges, 41), None);
        let (by_book, by_owner) = tally(&ranges, [1, 2, 15, 33, 25].into_iter());
        assert_eq!(by_book, vec![(1, 3), (2, 1)]);
        assert_eq!(by_owner, vec![(1, 3), (2, 1)]);
    }

    fn content() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        for m in crate::db::schema::CONTENT_MIGRATIONS {
            conn.execute_batch(m).unwrap();
        }
        conn
    }

    fn add_verses(conn: &Connection, translation: i64, book: i64, chapter: i64, n: i64) {
        for v in 1..=n {
            conn.execute(
                "INSERT INTO verses (translation_id, book_id, chapter, verse, text) VALUES (?1, ?2, ?3, ?4, 'x')",
                params![translation, book, chapter, v],
            )
            .unwrap();
        }
    }

    #[test]
    fn runs_follow_the_ids_and_are_dropped_when_the_verses_change() {
        let conn = content();
        conn.execute_batch(
            "INSERT INTO translations (id, code, name, language, source_path, source_format, imported_at, checksum)
             VALUES (1, 'A', 'A', 'en', '', 'zefania', '', ''), (2, 'B', 'B', 'en', '', 'zefania', '', '')",
        )
        .unwrap();
        add_verses(&conn, 1, 1, 1, 3);
        add_verses(&conn, 1, 2, 1, 2);
        // B's verses interleave with A's: B's book 1 is split by A's book 3.
        add_verses(&conn, 2, 1, 1, 2);
        add_verses(&conn, 1, 3, 1, 2);
        add_verses(&conn, 2, 1, 2, 1);
        stamp(&conn).unwrap();
        let a = lookup(&conn, false, &[1], None).unwrap().unwrap();
        assert_eq!(a, vec![r(1, 1, 1, 3), r(1, 2, 4, 5), r(1, 3, 8, 9)]);
        // B's book 1 is in two runs, either side of A's book 3.
        let b = lookup(&conn, false, &[2], None).unwrap().unwrap();
        assert_eq!(b, vec![r(2, 1, 6, 7), r(2, 1, 10, 10)]);
        assert_eq!(condition("rowid", &b), "(rowid BETWEEN 6 AND 7 OR rowid BETWEEN 10 AND 10)");
        let both = lookup(&conn, false, &[1, 2], None).unwrap().unwrap();
        assert_eq!(both.len(), 5);
        assert_eq!(find(&both, 10).map(|r| r.owner), Some(2));
        let only_2 = lookup(&conn, false, &[1], Some(&BTreeSet::from([2]))).unwrap().unwrap();
        assert_eq!(only_2, vec![r(1, 2, 4, 5)]);

        // A new verse for A: its runs go, and come back when stamped again.
        add_verses(&conn, 1, 4, 1, 1);
        assert_eq!(lookup(&conn, false, &[1], None).unwrap(), None);
        stamp(&conn).unwrap();
        assert_eq!(lookup(&conn, false, &[1], None).unwrap().unwrap().len(), 4);
        conn.execute("DELETE FROM verses WHERE translation_id = 1 AND book_id = 4", []).unwrap();
        assert_eq!(lookup(&conn, false, &[1], None).unwrap(), None);
    }

    #[test]
    fn a_filter_the_runs_cannot_answer_is_refused() {
        let conn = content();
        let f = Filters::default();
        assert_eq!(verse_book_scope(&conn, &f, None, None).unwrap(), Some(None));
        assert_eq!(verse_book_scope(&conn, &f, Some(19), None).unwrap(), Some(Some(BTreeSet::from([19]))));
        let nt = verse_book_scope(&conn, &f, None, Some("NT")).unwrap().unwrap().unwrap();
        assert_eq!(nt.len(), 27);
        let f = Filters { books: vec![19, 45], ..Default::default() };
        assert_eq!(verse_book_scope(&conn, &f, None, Some("NT")).unwrap(), Some(Some(BTreeSet::from([45]))));
        let f = Filters { chapter: Some(3), ..Default::default() };
        assert_eq!(verse_book_scope(&conn, &f, None, None).unwrap(), None);
        let f = Filters { has_highlight: true, ..Default::default() };
        assert_eq!(verse_book_scope(&conn, &f, None, None).unwrap(), None);
        // Commentary search does not apply a highlight filter at all.
        assert_eq!(commentary_book_scope(&conn, &f, None, None).unwrap(), Some(None));
        let f = Filters { chapter: Some(3), ..Default::default() };
        assert_eq!(commentary_book_scope(&conn, &f, None, None).unwrap(), None);
    }
}
