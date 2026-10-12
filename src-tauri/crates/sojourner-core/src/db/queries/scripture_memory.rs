use crate::models::{MemoryPassage, MemoryVerse};
use rusqlite::{params, Connection, OptionalExtension};

const SELECT_COLS: &str = "id, book_id, chapter, verse_start, verse_end, translation_id, mode, ease_factor, interval_days, repetitions, due_at, last_reviewed_at, created_at, westminster_section_id, doctrinal_note, passage_id, set_name, ask_reference";

/// A passage part counts as learned once it has been recalled twice running
/// (SM-2's second success, the one that spaces it out to six days): then
/// the next part is added.
pub const LEARNED_REPETITIONS: i64 = 2;

fn map_row(r: &rusqlite::Row) -> rusqlite::Result<MemoryVerse> {
    Ok(MemoryVerse {
        id: r.get(0)?,
        book_id: r.get(1)?,
        chapter: r.get(2)?,
        verse_start: r.get(3)?,
        verse_end: r.get(4)?,
        translation_id: r.get(5)?,
        mode: r.get(6)?,
        ease_factor: r.get(7)?,
        interval_days: r.get(8)?,
        repetitions: r.get(9)?,
        due_at: r.get(10)?,
        last_reviewed_at: r.get(11)?,
        created_at: r.get(12)?,
        westminster_section_id: r.get(13)?,
        doctrinal_note: r.get(14)?,
        passage_id: r.get(15)?,
        set_name: r.get(16)?,
        ask_reference: r.get::<_, i64>(17)? != 0,
    })
}

fn get(conn: &Connection, id: i64) -> anyhow::Result<MemoryVerse> {
    Ok(conn.query_row(&format!("SELECT {SELECT_COLS} FROM memory_verses WHERE id = ?1"), params![id], map_row)?)
}

pub fn list_all(conn: &Connection) -> anyhow::Result<Vec<MemoryVerse>> {
    let mut stmt = conn.prepare(&format!("SELECT {SELECT_COLS} FROM memory_verses ORDER BY due_at"))?;
    let rows = stmt.query_map([], map_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn list_due(conn: &Connection) -> anyhow::Result<Vec<MemoryVerse>> {
    let now = chrono::Utc::now().to_rfc3339();
    let mut stmt = conn.prepare(&format!("SELECT {SELECT_COLS} FROM memory_verses WHERE due_at <= ?1 ORDER BY due_at"))?;
    let rows = stmt.query_map(params![now], map_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// What a new card is: where, in which translation, how it is practised,
/// and the named set it came in with, if any.
#[derive(Debug, Clone)]
pub struct NewCard {
    pub book_id: i64,
    pub chapter: i64,
    pub verse_start: i64,
    pub verse_end: i64,
    pub translation_id: Option<i64>,
    pub mode: String,
    pub set_name: Option<String>,
    pub ask_reference: bool,
}

pub fn create(conn: &Connection, card: &NewCard) -> anyhow::Result<MemoryVerse> {
    insert(conn, card, None)?;
    get(conn, conn.last_insert_rowid())
}

fn insert(conn: &Connection, card: &NewCard, passage_id: Option<i64>) -> anyhow::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO memory_verses (book_id, chapter, verse_start, verse_end, translation_id, mode, due_at, created_at, set_name, ask_reference, passage_id)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?7,?8,?9,?10)",
        params![
            card.book_id,
            card.chapter,
            card.verse_start,
            card.verse_end,
            card.translation_id,
            card.mode,
            now,
            card.set_name,
            card.ask_reference as i64,
            passage_id
        ],
    )?;
    Ok(())
}

pub fn set_mode(conn: &Connection, id: i64, mode: String) -> anyhow::Result<()> {
    conn.execute("UPDATE memory_verses SET mode = ?1 WHERE id = ?2", params![mode, id])?;
    Ok(())
}

pub fn set_translation(conn: &Connection, id: i64, translation_id: Option<i64>) -> anyhow::Result<()> {
    conn.execute("UPDATE memory_verses SET translation_id = ?1 WHERE id = ?2", params![translation_id, id])?;
    Ok(())
}

pub fn set_ask_reference(conn: &Connection, id: i64, ask_reference: bool) -> anyhow::Result<()> {
    conn.execute("UPDATE memory_verses SET ask_reference = ?1 WHERE id = ?2", params![ask_reference as i64, id])?;
    Ok(())
}

/// Attaches (or clears, by passing `None`) the catechism question or
/// confession paragraph this verse illustrates, plus an optional personal
/// note on its doctrinal sense -- see the USER_MIGRATION_0008 schema
/// comment for why this lives on memory_verses directly rather than a
/// side table.
pub fn set_doctrinal_link(
    conn: &Connection,
    id: i64,
    westminster_section_id: Option<i64>,
    doctrinal_note: Option<String>,
) -> anyhow::Result<()> {
    conn.execute(
        "UPDATE memory_verses SET westminster_section_id = ?1, doctrinal_note = ?2 WHERE id = ?3",
        params![westminster_section_id, doctrinal_note, id],
    )?;
    Ok(())
}

pub fn delete(conn: &Connection, id: i64) -> anyhow::Result<()> {
    conn.execute("DELETE FROM memory_verses WHERE id = ?1", params![id])?;
    Ok(())
}

/// The SM-2 spaced-repetition algorithm's pure math, shared by every
/// memory-card table in the app (memory_verses here, catechism_memory in
/// the sibling module) so the scheduling rule lives in exactly one place.
/// `quality` is 0-5 (Anki/SuperMemo convention: below 3 means "failed to
/// recall" and resets the interval; 3+ means a successful recall, with 5
/// being effortless). Ease factor is clamped to a minimum of 1.3 as SM-2
/// prescribes, so a run of poor recalls can't shrink intervals to nothing.
/// Returns (new_ease_factor, new_interval_days, new_repetitions).
pub fn compute_sm2(ease_factor: f64, interval_days: i64, repetitions: i64, quality: i64) -> (f64, i64, i64) {
    let (new_repetitions, new_interval) = if quality < 3 {
        (0, 1)
    } else {
        let reps = repetitions + 1;
        let interval = match reps {
            1 => 1,
            2 => 6,
            _ => (interval_days as f64 * ease_factor).round() as i64,
        };
        (reps, interval)
    };
    let q = quality as f64;
    let new_ease = (ease_factor + (0.1 - (5.0 - q) * (0.08 + (5.0 - q) * 0.02))).max(1.3);
    (new_ease, new_interval, new_repetitions)
}

/// Records a review using [`compute_sm2`], writes it to the review log, and
/// brings on the next part of any passage the card belongs to.
pub fn review(conn: &Connection, id: i64, quality: i64) -> anyhow::Result<MemoryVerse> {
    let (ease_factor, interval_days, repetitions): (f64, i64, i64) = conn.query_row(
        "SELECT ease_factor, interval_days, repetitions FROM memory_verses WHERE id = ?1",
        params![id],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    )?;

    let (new_ease, new_interval, new_repetitions) = compute_sm2(ease_factor, interval_days, repetitions, quality);

    let now = chrono::Utc::now();
    let due_at = (now + chrono::Duration::days(new_interval)).to_rfc3339();
    conn.execute(
        "UPDATE memory_verses SET ease_factor=?1, interval_days=?2, repetitions=?3, due_at=?4, last_reviewed_at=?5 WHERE id=?6",
        params![new_ease, new_interval, new_repetitions, due_at, now.to_rfc3339(), id],
    )?;
    log_review(conn, "scripture", id, quality, &now.to_rfc3339())?;
    let card = get(conn, id)?;
    advance_passages_for(conn, &card)?;
    Ok(card)
}

// ---------------------------------------------------------------------------
// Passages, a part at a time.

/// A passage's parts, `size` verses each, with a lone verse left over at
/// the end folded into the part before it: Psalm 23 in twos is 1-2, 3-4,
/// 5-6; Psalm 1 is 1-2, 3-4, 5-6 as well.
pub fn passage_parts(verse_start: i64, verse_end: i64, size: i64) -> Vec<(i64, i64)> {
    let size = size.max(1);
    let mut parts = Vec::new();
    let mut v = verse_start;
    while v <= verse_end {
        parts.push((v, (v + size - 1).min(verse_end)));
        v += size;
    }
    if size > 1 && parts.len() > 1 {
        let (s, e) = parts[parts.len() - 1];
        if s == e {
            parts.pop();
            let last = parts.len() - 1;
            parts[last].1 = e;
        }
    }
    parts
}

struct PassageRow {
    id: i64,
    book_id: i64,
    chapter: i64,
    verse_start: i64,
    verse_end: i64,
    translation_id: Option<i64>,
    chunk_size: i64,
    mode: String,
    set_name: Option<String>,
    created_at: String,
}

fn passage_row(conn: &Connection, id: i64) -> anyhow::Result<PassageRow> {
    Ok(conn.query_row(
        "SELECT id, book_id, chapter, verse_start, verse_end, translation_id, chunk_size, mode, set_name, created_at
         FROM memory_passages WHERE id = ?1",
        params![id],
        |r| {
            Ok(PassageRow {
                id: r.get(0)?,
                book_id: r.get(1)?,
                chapter: r.get(2)?,
                verse_start: r.get(3)?,
                verse_end: r.get(4)?,
                translation_id: r.get(5)?,
                chunk_size: r.get(6)?,
                mode: r.get(7)?,
                set_name: r.get(8)?,
                created_at: r.get(9)?,
            })
        },
    )?)
}

/// The card in the deck for a stretch of the passage, whoever added it: a
/// verse learned on its own before counts toward the passage. Returns its
/// id and how many times running it has been recalled.
fn card_for(conn: &Connection, p: &PassageRow, verse_start: i64, verse_end: i64) -> anyhow::Result<Option<(i64, i64)>> {
    Ok(conn
        .query_row(
            "SELECT id, repetitions FROM memory_verses
             WHERE book_id = ?1 AND chapter = ?2 AND verse_start = ?3 AND verse_end = ?4 AND translation_id IS ?5
             ORDER BY passage_id IS NOT ?6, id LIMIT 1",
            params![p.book_id, p.chapter, verse_start, verse_end, p.translation_id, p.id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?)
}

fn add_part(conn: &Connection, p: &PassageRow, verse_start: i64, verse_end: i64) -> anyhow::Result<()> {
    let card = NewCard {
        book_id: p.book_id,
        chapter: p.chapter,
        verse_start,
        verse_end,
        translation_id: p.translation_id,
        mode: p.mode.clone(),
        set_name: p.set_name.clone(),
        ask_reference: false,
    };
    insert(conn, &card, Some(p.id))
}

/// Brings a passage up to date: adds the first part not yet in the deck
/// once every part before it is learned (at once, with `force`), and the
/// whole passage, to say through, once every part is in. Returns whether it
/// added a card.
fn advance(conn: &Connection, id: i64, force: bool) -> anyhow::Result<bool> {
    let p = passage_row(conn, id)?;
    let parts = passage_parts(p.verse_start, p.verse_end, p.chunk_size);
    for &(s, e) in &parts {
        match card_for(conn, &p, s, e)? {
            None => {
                add_part(conn, &p, s, e)?;
                return Ok(true);
            }
            Some((_, reps)) if reps < LEARNED_REPETITIONS && !force => return Ok(false),
            Some(_) => {}
        }
    }
    let all_learned = parts
        .iter()
        .map(|&(s, e)| card_for(conn, &p, s, e))
        .collect::<anyhow::Result<Vec<_>>>()?
        .iter()
        .all(|c| c.is_some_and(|(_, reps)| reps >= LEARNED_REPETITIONS));
    if parts.len() > 1 && (all_learned || force) && card_for(conn, &p, p.verse_start, p.verse_end)?.is_none() {
        add_part(conn, &p, p.verse_start, p.verse_end)?;
        return Ok(true);
    }
    Ok(false)
}

pub struct NewPassage {
    pub book_id: i64,
    pub chapter: i64,
    pub verse_start: i64,
    pub verse_end: i64,
    pub translation_id: Option<i64>,
    pub chunk_size: i64,
    pub mode: String,
    pub set_name: Option<String>,
}

/// Starts a passage: the row, and its first part in the deck.
pub fn create_passage(conn: &Connection, n: &NewPassage) -> anyhow::Result<MemoryPassage> {
    anyhow::ensure!(n.verse_end >= n.verse_start, "the passage ends before it begins");
    // The same passage twice would be two passages sharing one set of parts.
    let already: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM memory_passages
         WHERE book_id = ?1 AND chapter = ?2 AND verse_start = ?3 AND verse_end = ?4 AND translation_id IS ?5)",
        params![n.book_id, n.chapter, n.verse_start, n.verse_end, n.translation_id],
        |r| r.get(0),
    )?;
    anyhow::ensure!(!already, "that passage is already in your deck in that translation");
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO memory_passages (book_id, chapter, verse_start, verse_end, translation_id, chunk_size, mode, set_name, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
        params![n.book_id, n.chapter, n.verse_start, n.verse_end, n.translation_id, n.chunk_size.clamp(1, 8), n.mode, n.set_name, now],
    )?;
    let id = conn.last_insert_rowid();
    advance(conn, id, false)?;
    get_passage(conn, id)
}

/// "Add the next part now", for a reader who already has the part they are
/// on. Returns whether there was a part left to add.
pub fn add_next_part(conn: &Connection, id: i64) -> anyhow::Result<bool> {
    advance(conn, id, true)
}

pub fn get_passage(conn: &Connection, id: i64) -> anyhow::Result<MemoryPassage> {
    let p = passage_row(conn, id)?;
    let parts = passage_parts(p.verse_start, p.verse_end, p.chunk_size);
    let mut added = 0;
    let mut learned = 0;
    for &(s, e) in &parts {
        if let Some((_, reps)) = card_for(conn, &p, s, e)? {
            added += 1;
            if reps >= LEARNED_REPETITIONS {
                learned += 1;
            }
        }
    }
    let whole_card_id = if parts.len() > 1 { card_for(conn, &p, p.verse_start, p.verse_end)?.map(|(id, _)| id) } else { None };
    Ok(MemoryPassage {
        id: p.id,
        book_id: p.book_id,
        chapter: p.chapter,
        verse_start: p.verse_start,
        verse_end: p.verse_end,
        translation_id: p.translation_id,
        chunk_size: p.chunk_size,
        mode: p.mode,
        set_name: p.set_name,
        created_at: p.created_at,
        parts: parts.len() as i64,
        added,
        learned,
        whole_card_id,
    })
}

pub fn list_passages(conn: &Connection) -> anyhow::Result<Vec<MemoryPassage>> {
    let ids: Vec<i64> = conn
        .prepare("SELECT id FROM memory_passages ORDER BY created_at")?
        .query_map([], |r| r.get(0))?
        .collect::<Result<_, _>>()?;
    ids.into_iter().map(|id| get_passage(conn, id)).collect()
}

/// A passage and the parts it added. A card that was in the deck before the
/// passage came along stays.
pub fn delete_passage(conn: &Connection, id: i64) -> anyhow::Result<()> {
    conn.execute("DELETE FROM memory_verses WHERE passage_id = ?1", params![id])?;
    conn.execute("DELETE FROM memory_passages WHERE id = ?1", params![id])?;
    Ok(())
}

/// Every passage a reviewed card could be a part of, brought up to date.
fn advance_passages_for(conn: &Connection, card: &MemoryVerse) -> anyhow::Result<()> {
    let ids: Vec<i64> = conn
        .prepare(
            "SELECT id FROM memory_passages
             WHERE book_id = ?1 AND chapter = ?2 AND verse_start <= ?3 AND verse_end >= ?4 AND translation_id IS ?5",
        )?
        .query_map(params![card.book_id, card.chapter, card.verse_start, card.verse_end, card.translation_id], |r| r.get(0))?
        .collect::<Result<_, _>>()?;
    for id in ids {
        advance(conn, id, false)?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// The review log, shared with the catechism deck.

pub fn log_review(conn: &Connection, deck: &str, card_id: i64, quality: i64, at: &str) -> anyhow::Result<()> {
    conn.execute(
        "INSERT INTO memory_reviews (deck, card_id, quality, reviewed_at) VALUES (?1,?2,?3,?4)",
        params![deck, card_id, quality, at],
    )?;
    Ok(())
}

/// When each review since `since` (RFC 3339) happened, either deck, oldest
/// first. The reader's own calendar days are the frontend's to count.
pub fn review_times_since(conn: &Connection, since: &str) -> anyhow::Result<Vec<String>> {
    Ok(conn
        .prepare("SELECT reviewed_at FROM memory_reviews WHERE reviewed_at >= ?1 ORDER BY reviewed_at")?
        .query_map(params![since], |r| r.get(0))?
        .collect::<Result<_, _>>()?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        crate::db::register_functions(&conn).unwrap();
        for m in crate::db::schema::USER_MIGRATIONS {
            conn.execute_batch(m).unwrap();
        }
        conn
    }

    fn psalm_23(conn: &Connection) -> MemoryPassage {
        create_passage(
            conn,
            &NewPassage {
                book_id: 19,
                chapter: 23,
                verse_start: 1,
                verse_end: 6,
                translation_id: Some(1),
                chunk_size: 2,
                mode: "first-letter".into(),
                set_name: Some("Psalms".into()),
            },
        )
        .unwrap()
    }

    fn card(conn: &Connection, vs: i64, ve: i64) -> Option<MemoryVerse> {
        list_all(conn).unwrap().into_iter().find(|c| c.verse_start == vs && c.verse_end == ve)
    }

    #[test]
    fn parts_fold_a_lone_last_verse_into_the_one_before() {
        assert_eq!(passage_parts(1, 6, 2), vec![(1, 2), (3, 4), (5, 6)]);
        assert_eq!(passage_parts(1, 7, 2), vec![(1, 2), (3, 4), (5, 7)]);
        assert_eq!(passage_parts(3, 3, 2), vec![(3, 3)]);
        assert_eq!(passage_parts(1, 3, 1), vec![(1, 1), (2, 2), (3, 3)]);
    }

    #[test]
    fn a_passage_is_learned_a_part_at_a_time_then_said_whole() {
        let conn = db();
        let p = psalm_23(&conn);
        assert_eq!((p.parts, p.added, p.learned), (3, 1, 0));
        let first = card(&conn, 1, 2).unwrap();
        assert_eq!(first.passage_id, Some(p.id));
        assert_eq!(first.set_name.as_deref(), Some("Psalms"));

        // One good recall is not yet learned; the second brings on 3-4.
        review(&conn, first.id, 4).unwrap();
        assert!(card(&conn, 3, 4).is_none());
        review(&conn, first.id, 4).unwrap();
        let second = card(&conn, 3, 4).expect("the next part comes once the first is learned");

        review(&conn, second.id, 5).unwrap();
        review(&conn, second.id, 5).unwrap();
        let third = card(&conn, 5, 6).unwrap();
        review(&conn, third.id, 4).unwrap();
        assert!(card(&conn, 1, 6).is_none(), "the whole waits for every part");
        review(&conn, third.id, 4).unwrap();
        assert!(card(&conn, 1, 6).is_some(), "then the whole passage, to say through");

        let p = get_passage(&conn, p.id).unwrap();
        assert_eq!((p.added, p.learned), (3, 3));
        assert!(p.whole_card_id.is_some());
    }

    #[test]
    fn the_next_part_can_be_had_at_once_and_a_verse_known_before_counts() {
        let conn = db();
        // Verses 3-4 were in the deck, learned, before the psalm was added.
        let known = create(
            &conn,
            &NewCard { book_id: 19, chapter: 23, verse_start: 3, verse_end: 4, translation_id: Some(1), mode: "type-it".into(), set_name: None, ask_reference: false },
        )
        .unwrap();
        review(&conn, known.id, 5).unwrap();
        review(&conn, known.id, 5).unwrap();

        let p = psalm_23(&conn);
        assert!(add_next_part(&conn, p.id).unwrap());
        // 3-4 was already there and learned, so "next" skipped to 5-6.
        assert!(card(&conn, 5, 6).is_some());
        assert_eq!(card(&conn, 3, 4).unwrap().passage_id, None);

        assert!(
            create_passage(
                &conn,
                &NewPassage { book_id: 19, chapter: 23, verse_start: 1, verse_end: 6, translation_id: Some(1), chunk_size: 3, mode: "type-it".into(), set_name: None },
            )
            .is_err(),
            "the same passage is not added twice"
        );

        delete_passage(&conn, p.id).unwrap();
        assert!(card(&conn, 1, 2).is_none() && card(&conn, 5, 6).is_none());
        assert!(card(&conn, 3, 4).is_some(), "a card from before the passage stays");
    }

    #[test]
    fn every_review_is_logged_for_either_deck() {
        let conn = db();
        let c = create(
            &conn,
            &NewCard { book_id: 43, chapter: 3, verse_start: 16, verse_end: 16, translation_id: None, mode: "first-letter".into(), set_name: None, ask_reference: true },
        )
        .unwrap();
        assert!(c.ask_reference);
        review(&conn, c.id, 4).unwrap();
        review(&conn, c.id, 1).unwrap();
        assert_eq!(review_times_since(&conn, "2000-01-01").unwrap().len(), 2);
    }
}
