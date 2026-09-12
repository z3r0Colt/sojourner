// Study statistics for Settings → Data & backups (F3.5): a handful of
// counts gathered in one call so the Stats block renders from a single
// round trip. Everything here is read-only over user.db; the heatmap
// reads `reading_log` (one row per chapter per local day, see F3.1).
use super::NOT_DELETED;
use rusqlite::{params, Connection};
use serde::Serialize;

/// The heatmap covers this many days ending today: 53 weeks, so a
/// 53-by-7 grid always has a full column for the current week.
pub const HEATMAP_DAYS: i64 = 371;

#[derive(Debug, Clone, Serialize)]
pub struct BookStat {
    pub book_id: i64,
    /// Passage notes plus chapter notes on the book (deleted ones excluded).
    pub notes: i64,
    pub highlights: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReadingDay {
    /// Local calendar date, YYYY-MM-DD.
    pub date: String,
    /// Distinct chapters opened that day.
    pub chapters: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Stats {
    pub books: Vec<BookStat>,
    pub notes_total: i64,
    pub highlights_total: i64,
    /// Days in the heatmap window with at least one chapter read.
    pub reading_days: Vec<ReadingDay>,
    /// Every day ever logged, not only the heatmap window.
    pub reading_days_total: i64,
    /// Distinct chapters ever opened.
    pub chapters_read_total: i64,
    /// Prayer journal entries (deleted ones excluded).
    pub prayer_entries: i64,
    /// People on the prayer list, active or answered.
    pub prayer_people: i64,
    pub memory_verses_total: i64,
    /// Memory verses whose spaced-repetition interval has reached three
    /// weeks: recalled correctly often enough to count as learned.
    pub memory_verses_learned: i64,
    pub catechism_total: i64,
    pub catechism_learned: i64,
    pub bookmarks: i64,
    /// Preachings logged this calendar year, and ever (SB5.6). A sermon
    /// preached twice counts twice: both times were real Sundays.
    pub sermons_preached_year: i64,
    pub sermons_preached_total: i64,
    /// Sermons written, and the words in them -- the body's markup stripped
    /// here rather than in the frontend, so the tile costs one query.
    pub sermons_total: i64,
    pub sermon_words_total: i64,
}

/// A card counts as learned once its interval is this long (days).
const LEARNED_INTERVAL_DAYS: i64 = 21;

fn count(conn: &Connection, sql: &str) -> anyhow::Result<i64> {
    Ok(conn.query_row(sql, [], |r| r.get(0))?)
}

pub fn get_stats(conn: &Connection, today: &str) -> anyhow::Result<Stats> {
    // Notes and highlights per book, in one pass each; books with nothing
    // are left out so the frontend's bar list stays short.
    let mut per_book: std::collections::BTreeMap<i64, BookStat> = Default::default();
    {
        let mut stmt = conn.prepare(&format!(
            "SELECT book_id, COUNT(*) FROM (
                SELECT book_id FROM notes WHERE {NOT_DELETED}
                UNION ALL
                SELECT book_id FROM chapter_notes WHERE {NOT_DELETED}
             ) GROUP BY book_id"
        ))?;
        let rows = stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?)))?;
        for row in rows {
            let (book_id, n) = row?;
            per_book.entry(book_id).or_insert(BookStat { book_id, notes: 0, highlights: 0 }).notes = n;
        }
    }
    {
        let mut stmt = conn.prepare("SELECT book_id, COUNT(*) FROM highlights GROUP BY book_id")?;
        let rows = stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?)))?;
        for row in rows {
            let (book_id, n) = row?;
            per_book.entry(book_id).or_insert(BookStat { book_id, notes: 0, highlights: 0 }).highlights = n;
        }
    }
    let books: Vec<BookStat> = per_book.into_values().collect();
    let notes_total = books.iter().map(|b| b.notes).sum();
    let highlights_total = books.iter().map(|b| b.highlights).sum();

    let reading_days = {
        let mut stmt = conn.prepare(
            "SELECT date, COUNT(*) FROM reading_log
             WHERE date > date(?1, ?2) AND date <= ?1
             GROUP BY date ORDER BY date",
        )?;
        let offset = format!("-{HEATMAP_DAYS} days");
        let rows = stmt.query_map(params![today, offset], |r| Ok(ReadingDay { date: r.get(0)?, chapters: r.get(1)? }))?;
        rows.collect::<Result<Vec<_>, _>>()?
    };

    Ok(Stats {
        books,
        notes_total,
        highlights_total,
        reading_days,
        reading_days_total: count(conn, "SELECT COUNT(DISTINCT date) FROM reading_log")?,
        chapters_read_total: count(conn, "SELECT COUNT(*) FROM (SELECT DISTINCT book_id, chapter FROM reading_log)")?,
        prayer_entries: count(conn, &format!("SELECT COUNT(*) FROM prayer_entries WHERE {NOT_DELETED}"))?,
        prayer_people: count(conn, "SELECT COUNT(*) FROM prayer_list_people")?,
        memory_verses_total: count(conn, "SELECT COUNT(*) FROM memory_verses")?,
        memory_verses_learned: count(conn, &format!("SELECT COUNT(*) FROM memory_verses WHERE interval_days >= {LEARNED_INTERVAL_DAYS}"))?,
        catechism_total: count(conn, "SELECT COUNT(*) FROM catechism_memory")?,
        catechism_learned: count(conn, &format!("SELECT COUNT(*) FROM catechism_memory WHERE interval_days >= {LEARNED_INTERVAL_DAYS}"))?,
        bookmarks: count(conn, "SELECT COUNT(*) FROM bookmarks")?,
        sermons_preached_year: count(
            conn,
            &format!(
                "SELECT COUNT(*) FROM sermon_events e JOIN sermons s ON s.id = e.sermon_id
                 WHERE e.kind = 'preaching' AND substr(e.date, 1, 4) = '{}' AND s.{NOT_DELETED}",
                &today[..4.min(today.len())]
            ),
        )?,
        sermons_preached_total: count(
            conn,
            &format!(
                "SELECT COUNT(*) FROM sermon_events e JOIN sermons s ON s.id = e.sermon_id
                 WHERE e.kind = 'preaching' AND s.{NOT_DELETED}"
            ),
        )?,
        sermons_total: count(conn, &format!("SELECT COUNT(*) FROM sermons WHERE {NOT_DELETED}"))?,
        sermon_words_total: sermon_words(conn)?,
    })
}

/// Words written across every live sermon. The bodies are tiptap HTML, so
/// the tags are stripped and what is left is counted on whitespace -- the
/// same rule the manuscript's own footer uses, near enough for a tile.
fn sermon_words(conn: &Connection) -> anyhow::Result<i64> {
    let mut stmt = conn.prepare(&format!("SELECT body FROM sermons WHERE {NOT_DELETED}"))?;
    let bodies = stmt.query_map([], |r| r.get::<_, String>(0))?;
    let mut total = 0i64;
    for body in bodies {
        let body = body?;
        let mut text = String::with_capacity(body.len());
        let mut in_tag = false;
        for c in body.chars() {
            match c {
                '<' => in_tag = true,
                '>' => {
                    in_tag = false;
                    text.push(' ');
                }
                _ if !in_tag => text.push(c),
                _ => {}
            }
        }
        total += text.split_whitespace().filter(|w| w.chars().any(char::is_alphanumeric)).count() as i64;
    }
    Ok(total)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    #[test]
    fn stats_count_notes_highlights_and_reading_days() {
        let dir = std::env::temp_dir().join(format!("sojourner-stats-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let content_db_path = dir.join("content.db");
        db::open_content_db(&content_db_path).unwrap();
        let conn = db::open(&dir, &content_db_path).unwrap();

        let empty = get_stats(&conn, "2026-09-11").unwrap();
        assert!(empty.books.is_empty());
        assert_eq!(empty.reading_days_total, 0);

        conn.execute(
            "INSERT INTO highlights (book_id, chapter, verse_start, verse_end, color, created_at, updated_at) VALUES (45, 8, 28, 28, 'yellow', 'x', 'x')",
            [],
        )
        .unwrap();
        conn.execute("INSERT INTO notes (book_id, chapter, verse_start, verse_end, body, created_at, updated_at) VALUES (45, 8, 1, 1, 'a', 'x', 'x')", []).unwrap();
        conn.execute("INSERT INTO notes (book_id, chapter, verse_start, verse_end, body, created_at, updated_at, deleted_at) VALUES (45, 8, 2, 2, 'gone', 'x', 'x', 'x')", []).unwrap();
        conn.execute("INSERT INTO chapter_notes (book_id, chapter, body, created_at, updated_at) VALUES (1, 1, 'c', 'x', 'x')", []).unwrap();
        for (date, chapter) in [("2026-09-11", 1), ("2026-09-11", 2), ("2026-09-10", 3), ("2025-01-01", 4)] {
            conn.execute("INSERT INTO reading_log (date, book_id, chapter) VALUES (?1, 1, ?2)", params![date, chapter]).unwrap();
        }

        let s = get_stats(&conn, "2026-09-11").unwrap();
        assert_eq!(s.notes_total, 2, "the soft-deleted note must not count");
        assert_eq!(s.highlights_total, 1);
        let romans = s.books.iter().find(|b| b.book_id == 45).unwrap();
        assert_eq!((romans.notes, romans.highlights), (1, 1));
        assert_eq!(s.reading_days.len(), 2, "the year-old day is outside the heatmap window");
        assert_eq!(s.reading_days[1].chapters, 2);
        assert_eq!(s.reading_days_total, 3);
        assert_eq!(s.chapters_read_total, 4);

        // Sermons (SB5.6): words written, and preachings this year and ever.
        conn.execute(
            "INSERT INTO sermons (id, title, body, created_at, updated_at) VALUES (1, 'A sermon', '<h2>One</h2><p>three more words</p>', 'x', 'x')",
            [],
        )
        .unwrap();
        for date in ["2026-03-01", "2026-09-06", "2025-11-02"] {
            conn.execute(
                "INSERT INTO sermon_events (sermon_id, kind, date, created_at) VALUES (1, 'preaching', ?1, 'x')",
                params![date],
            )
            .unwrap();
        }
        let s = get_stats(&conn, "2026-09-11").unwrap();
        assert_eq!(s.sermons_total, 1);
        assert_eq!(s.sermon_words_total, 4, "One + three more words");
        assert_eq!(s.sermons_preached_year, 2);
        assert_eq!(s.sermons_preached_total, 3);

        drop(conn);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
