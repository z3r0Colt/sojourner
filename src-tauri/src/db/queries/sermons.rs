// The Sermon Builder's store (USER_MIGRATION_0015). A sermon is one tiptap
// document plus the tables derived from it: the passages it holds, the
// sources it cites, its tags, and the timed runs of it. Everything derived
// is replaced wholesale on save, so the tables can never drift from the
// document -- see `update`.
use super::NOT_DELETED;
use crate::models::{
    Sermon, SermonEvent, SermonFilter, SermonForChapter, SermonInput, SermonPassage,
    SermonPassageInput, SermonSeries, SermonSource, SermonSourceInput, SpeakingRate,
};
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashMap;

pub(super) const SELECT_COLS: &str = "id, title, big_idea, body, status, stage, preach_date, series_id, series_order, venue, preacher, translation_id, target_minutes, reflection, created_at, updated_at, deleted_at";

pub(super) fn map_row(r: &rusqlite::Row) -> rusqlite::Result<Sermon> {
    Ok(Sermon {
        id: r.get(0)?,
        title: r.get(1)?,
        big_idea: r.get(2)?,
        body: r.get(3)?,
        status: r.get(4)?,
        stage: r.get(5)?,
        preach_date: r.get(6)?,
        series_id: r.get(7)?,
        series_order: r.get(8)?,
        venue: r.get(9)?,
        preacher: r.get(10)?,
        translation_id: r.get(11)?,
        target_minutes: r.get(12)?,
        reflection: r.get(13)?,
        created_at: r.get(14)?,
        updated_at: r.get(15)?,
        deleted_at: r.get(16)?,
        passages: Vec::new(),
        sources: Vec::new(),
        tags: Vec::new(),
        events: Vec::new(),
        series_title: None,
    })
}

fn map_passage(r: &rusqlite::Row) -> rusqlite::Result<SermonPassage> {
    Ok(SermonPassage {
        id: r.get(0)?,
        sermon_id: r.get(1)?,
        role: r.get(2)?,
        book_id: r.get(3)?,
        chapter: r.get(4)?,
        verse_start: r.get(5)?,
        verse_end: r.get(6)?,
        sort_order: r.get(7)?,
    })
}

fn map_source(r: &rusqlite::Row) -> rusqlite::Result<SermonSource> {
    Ok(SermonSource {
        id: r.get(0)?,
        sermon_id: r.get(1)?,
        kind: r.get(2)?,
        ref_id: r.get(3)?,
        label: r.get(4)?,
        excerpt: r.get(5)?,
        sort_order: r.get(6)?,
        created_at: r.get(7)?,
    })
}

fn map_event(r: &rusqlite::Row) -> rusqlite::Result<SermonEvent> {
    Ok(SermonEvent {
        id: r.get(0)?,
        sermon_id: r.get(1)?,
        kind: r.get(2)?,
        date: r.get(3)?,
        venue: r.get(4)?,
        duration_seconds: r.get(5)?,
        word_count: r.get(6)?,
        notes: r.get(7)?,
        created_at: r.get(8)?,
    })
}

/// The same column list qualified with a table alias, for the queries that
/// join (SQLite rejects a bare `id` once two tables are in scope).
fn prefixed(cols: &str, alias: &str) -> String {
    cols.split(", ").map(|c| format!("{alias}.{c}")).collect::<Vec<_>>().join(", ")
}

const PASSAGE_COLS: &str = "id, sermon_id, role, book_id, chapter, verse_start, verse_end, sort_order";
const SOURCE_COLS: &str = "id, sermon_id, kind, ref_id, label, excerpt, sort_order, created_at";
const EVENT_COLS: &str = "id, sermon_id, kind, date, venue, duration_seconds, word_count, notes, created_at";

/// Fills the passages, sources, tags, events, and series title of every
/// sermon in `list` -- five queries no matter how many sermons, since the
/// Sermons page would otherwise issue five per card.
fn hydrate(conn: &Connection, list: &mut [Sermon]) -> anyhow::Result<()> {
    if list.is_empty() {
        return Ok(());
    }
    let index: HashMap<i64, usize> = list.iter().enumerate().map(|(i, s)| (s.id, i)).collect();
    let ids: Vec<String> = list.iter().map(|s| s.id.to_string()).collect();
    let in_list = ids.join(",");

    let mut stmt = conn.prepare(&format!(
        "SELECT {PASSAGE_COLS} FROM sermon_passages WHERE sermon_id IN ({in_list}) ORDER BY sermon_id, sort_order, id"
    ))?;
    for row in stmt.query_map([], map_passage)? {
        let row = row?;
        if let Some(&i) = index.get(&row.sermon_id) {
            list[i].passages.push(row);
        }
    }

    let mut stmt = conn.prepare(&format!(
        "SELECT {SOURCE_COLS} FROM sermon_sources WHERE sermon_id IN ({in_list}) ORDER BY sermon_id, sort_order, id"
    ))?;
    for row in stmt.query_map([], map_source)? {
        let row = row?;
        if let Some(&i) = index.get(&row.sermon_id) {
            list[i].sources.push(row);
        }
    }

    let mut stmt = conn.prepare(&format!(
        "SELECT {EVENT_COLS} FROM sermon_events WHERE sermon_id IN ({in_list}) ORDER BY sermon_id, date, id"
    ))?;
    for row in stmt.query_map([], map_event)? {
        let row = row?;
        if let Some(&i) = index.get(&row.sermon_id) {
            list[i].events.push(row);
        }
    }

    let mut stmt = conn.prepare(&format!(
        "SELECT sermon_id, tag FROM sermon_tags WHERE sermon_id IN ({in_list}) ORDER BY sermon_id, tag"
    ))?;
    for row in stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))? {
        let (sermon_id, tag) = row?;
        if let Some(&i) = index.get(&sermon_id) {
            list[i].tags.push(tag);
        }
    }

    let mut stmt = conn.prepare(&format!(
        "SELECT s.id, se.title FROM sermons s JOIN sermon_series se ON se.id = s.series_id WHERE s.id IN ({in_list})"
    ))?;
    for row in stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))? {
        let (sermon_id, title) = row?;
        if let Some(&i) = index.get(&sermon_id) {
            list[i].series_title = Some(title);
        }
    }
    Ok(())
}

/// Every live sermon the filter allows, hydrated. A `query` runs through
/// `sermons_fts`; `book_id` matches any passage role, so a sermon that only
/// mentions the book still lists.
pub fn list(conn: &Connection, filter: &SermonFilter) -> anyhow::Result<Vec<Sermon>> {
    let mut wheres = vec![format!("s.{NOT_DELETED}")];
    let mut args: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(status) = &filter.status {
        wheres.push(format!("s.status = ?{}", args.len() + 1));
        args.push(Box::new(status.clone()));
    }
    if let Some(stage) = &filter.stage {
        wheres.push(format!("s.stage = ?{}", args.len() + 1));
        args.push(Box::new(stage.clone()));
    }
    if let Some(series_id) = filter.series_id {
        wheres.push(format!("s.series_id = ?{}", args.len() + 1));
        args.push(Box::new(series_id));
    }
    if let Some(book_id) = filter.book_id {
        wheres.push(format!(
            "EXISTS (SELECT 1 FROM sermon_passages p WHERE p.sermon_id = s.id AND p.book_id = ?{})",
            args.len() + 1
        ));
        args.push(Box::new(book_id));
    }
    if let Some(tag) = &filter.tag {
        wheres.push(format!(
            "EXISTS (SELECT 1 FROM sermon_tags t WHERE t.sermon_id = s.id AND t.tag = ?{})",
            args.len() + 1
        ));
        args.push(Box::new(tag.clone()));
    }
    if let Some(year) = filter.year {
        wheres.push(format!("substr(s.preach_date, 1, 4) = ?{}", args.len() + 1));
        args.push(Box::new(year.to_string()));
    }
    if let Some(query) = filter.query.as_deref().map(str::trim).filter(|q| !q.is_empty()) {
        wheres.push(format!(
            "s.id IN (SELECT rowid FROM sermons_fts WHERE sermons_fts MATCH ?{})",
            args.len() + 1
        ));
        args.push(Box::new(fts_query(query)));
    }

    let order = match filter.sort.as_deref() {
        Some("title") => "s.title COLLATE NOCASE ASC",
        Some("updated") => "s.updated_at DESC",
        // Undated sermons (still being planned) sit above the calendar.
        _ => "s.preach_date IS NULL DESC, s.preach_date DESC, s.updated_at DESC",
    };
    let limit = filter.limit.map(|n| format!(" LIMIT {n}")).unwrap_or_default();
    let sql = format!(
        "SELECT {SELECT_COLS} FROM sermons s WHERE {} ORDER BY {order}{limit}",
        wheres.join(" AND ")
    );

    let mut stmt = conn.prepare(&sql)?;
    let refs: Vec<&dyn rusqlite::ToSql> = args.iter().map(|a| a.as_ref()).collect();
    let mut list: Vec<Sermon> = stmt
        .query_map(refs.as_slice(), |r| map_row(r))?
        .collect::<Result<Vec<_>, _>>()?;
    hydrate(conn, &mut list)?;
    Ok(list)
}

/// Turns what the reader typed into an FTS5 MATCH expression: every word a
/// prefix term, quoted so punctuation can't be read as operator syntax.
fn fts_query(raw: &str) -> String {
    raw.split_whitespace()
        .map(|w| format!("\"{}\"*", w.replace('"', "")))
        .collect::<Vec<_>>()
        .join(" ")
}

/// By id, deleted or not -- the Trash and export both need a row the list
/// queries hide.
pub fn get(conn: &Connection, id: i64) -> anyhow::Result<Option<Sermon>> {
    let sermon = conn
        .query_row(&format!("SELECT {SELECT_COLS} FROM sermons WHERE id = ?1"), params![id], map_row)
        .optional()?;
    let Some(sermon) = sermon else { return Ok(None) };
    let mut one = [sermon];
    hydrate(conn, &mut one)?;
    let [sermon] = one;
    Ok(Some(sermon))
}

pub fn create(conn: &Connection, input: &SermonInput) -> anyhow::Result<Sermon> {
    let now = chrono::Utc::now().to_rfc3339();
    let tx = conn.unchecked_transaction()?;
    let title = input.title.clone().unwrap_or_else(|| "Untitled sermon".into());
    tx.execute(
        "INSERT INTO sermons (title, big_idea, body, status, stage, preach_date, series_id, series_order, venue, preacher, translation_id, target_minutes, reflection, created_at, updated_at)
         VALUES (?1,?2,?3,COALESCE(?4,'draft'),COALESCE(?5,'text'),?6,(SELECT id FROM sermon_series WHERE id = ?7),?8,?9,?10,?11,?12,?13,?14,?14)",
        params![
            title,
            input.big_idea,
            input.body.clone().unwrap_or_default(),
            input.status,
            input.stage,
            input.preach_date,
            input.series_id,
            input.series_order,
            input.venue,
            input.preacher,
            input.translation_id,
            input.target_minutes,
            input.reflection,
            now
        ],
    )?;
    let id = tx.last_insert_rowid();
    if let Some(passages) = &input.passages {
        set_passages(&tx, id, passages)?;
    }
    if let Some(sources) = &input.sources {
        set_sources(&tx, id, sources)?;
    }
    if let Some(tags) = &input.tags {
        set_tags(&tx, id, tags)?;
    }
    tx.commit()?;
    Ok(get(conn, id)?.expect("the sermon just inserted"))
}

/// Saves the manuscript and everything derived from it in one transaction.
/// A `None` field is written as null -- the pane holds the whole sermon and
/// sends it all back -- while a `None` collection is left alone.
pub fn update(conn: &Connection, id: i64, input: &SermonInput) -> anyhow::Result<Sermon> {
    let now = chrono::Utc::now().to_rfc3339();
    let tx = conn.unchecked_transaction()?;
    // COALESCE keeps title and body from being nulled by a caller that only
    // means to change the details row; every other column takes the value given.
    // The series is looked up rather than written straight through: a pane
    // that still remembers a series someone has since deleted would otherwise
    // fail on the foreign key and take the manuscript down with it.
    tx.execute(
        "UPDATE sermons SET
           title = COALESCE(?2, title),
           big_idea = ?3,
           body = COALESCE(?4, body),
           status = COALESCE(?5, status),
           stage = COALESCE(?6, stage),
           preach_date = ?7,
           series_id = (SELECT id FROM sermon_series WHERE id = ?8),
           series_order = ?9,
           venue = ?10,
           preacher = ?11,
           translation_id = ?12,
           target_minutes = ?13,
           reflection = ?14,
           updated_at = ?15
         WHERE id = ?1",
        params![
            id,
            input.title,
            input.big_idea,
            input.body,
            input.status,
            input.stage,
            input.preach_date,
            input.series_id,
            input.series_order,
            input.venue,
            input.preacher,
            input.translation_id,
            input.target_minutes,
            input.reflection,
            now
        ],
    )?;
    if let Some(passages) = &input.passages {
        set_passages(&tx, id, passages)?;
    }
    if let Some(sources) = &input.sources {
        set_sources(&tx, id, sources)?;
    }
    if let Some(tags) = &input.tags {
        set_tags(&tx, id, tags)?;
    }
    tx.commit()?;
    Ok(get(conn, id)?.ok_or_else(|| anyhow::anyhow!("sermon {id} not found"))?)
}

pub fn set_passages(conn: &Connection, sermon_id: i64, passages: &[SermonPassageInput]) -> anyhow::Result<()> {
    conn.execute("DELETE FROM sermon_passages WHERE sermon_id = ?1", params![sermon_id])?;
    let mut stmt = conn.prepare(
        "INSERT INTO sermon_passages (sermon_id, role, book_id, chapter, verse_start, verse_end, sort_order)
         VALUES (?1,?2,?3,?4,?5,?6,?7)",
    )?;
    for (i, p) in passages.iter().enumerate() {
        // A start without an end means one verse, the way note refs read.
        let end = match (p.verse_start, p.verse_end) {
            (Some(s), e) => Some(e.unwrap_or(s).max(s)),
            (None, _) => None,
        };
        stmt.execute(params![sermon_id, p.role, p.book_id, p.chapter, p.verse_start, end, i as i64])?;
    }
    Ok(())
}

pub fn set_sources(conn: &Connection, sermon_id: i64, sources: &[SermonSourceInput]) -> anyhow::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute("DELETE FROM sermon_sources WHERE sermon_id = ?1", params![sermon_id])?;
    let mut stmt = conn.prepare(
        "INSERT INTO sermon_sources (sermon_id, kind, ref_id, label, excerpt, sort_order, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7)",
    )?;
    for (i, s) in sources.iter().enumerate() {
        stmt.execute(params![sermon_id, s.kind, s.ref_id, s.label, s.excerpt, i as i64, now])?;
    }
    Ok(())
}

pub fn set_tags(conn: &Connection, sermon_id: i64, tags: &[String]) -> anyhow::Result<()> {
    conn.execute("DELETE FROM sermon_tags WHERE sermon_id = ?1", params![sermon_id])?;
    let mut stmt = conn.prepare("INSERT OR IGNORE INTO sermon_tags (sermon_id, tag) VALUES (?1, ?2)")?;
    for tag in tags {
        let tag = tag.trim();
        if !tag.is_empty() {
            stmt.execute(params![sermon_id, tag])?;
        }
    }
    Ok(())
}

pub fn set_stage(conn: &Connection, id: i64, stage: &str) -> anyhow::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute("UPDATE sermons SET stage = ?2, updated_at = ?3 WHERE id = ?1", params![id, stage, now])?;
    Ok(())
}

/// Soft delete: the sermon moves to the Trash rather than disappearing.
pub fn delete(conn: &Connection, id: i64) -> anyhow::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE sermons SET deleted_at = ?1 WHERE id = ?2 AND deleted_at IS NULL",
        params![now, id],
    )?;
    Ok(())
}

/// A copy with the same body, passages, sources, and tags, back at draft --
/// "the same sermon for another congregation" and "last year's outline,
/// rewritten" are both this.
pub fn duplicate(conn: &Connection, id: i64) -> anyhow::Result<Sermon> {
    let original = get(conn, id)?.ok_or_else(|| anyhow::anyhow!("sermon {id} not found"))?;
    let input = SermonInput {
        title: Some(format!("{} (copy)", original.title)),
        big_idea: original.big_idea.clone(),
        body: Some(original.body.clone()),
        status: Some("draft".into()),
        stage: Some("text".into()),
        preach_date: None,
        series_id: original.series_id,
        series_order: None,
        venue: original.venue.clone(),
        preacher: original.preacher.clone(),
        translation_id: original.translation_id,
        target_minutes: original.target_minutes,
        reflection: None,
        passages: Some(
            original
                .passages
                .iter()
                .map(|p| SermonPassageInput {
                    role: p.role.clone(),
                    book_id: p.book_id,
                    chapter: p.chapter,
                    verse_start: p.verse_start,
                    verse_end: p.verse_end,
                })
                .collect(),
        ),
        sources: Some(
            original
                .sources
                .iter()
                .map(|s| SermonSourceInput {
                    kind: s.kind.clone(),
                    ref_id: s.ref_id.clone(),
                    label: s.label.clone(),
                    excerpt: s.excerpt.clone(),
                })
                .collect(),
        ),
        tags: Some(original.tags.clone()),
    };
    create(conn, &input)
}

/// Every tag on a live sermon, for the filter bar.
pub fn list_all_tags(conn: &Connection) -> anyhow::Result<Vec<String>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT DISTINCT t.tag FROM sermon_tags t JOIN sermons s ON s.id = t.sermon_id WHERE s.{NOT_DELETED} ORDER BY t.tag"
    ))?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// Full-text search across title, big idea, body, and reflection, newest
/// first, with the Trash filtered out at the base table.
pub fn search(conn: &Connection, query: &str, limit: i64) -> anyhow::Result<Vec<Sermon>> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let cols = prefixed(SELECT_COLS, "s");
    let mut stmt = conn.prepare(&format!(
        "SELECT {cols} FROM sermons s
         JOIN sermons_fts f ON f.rowid = s.id
         WHERE sermons_fts MATCH ?1 AND s.{NOT_DELETED}
         ORDER BY rank LIMIT ?2"
    ))?;
    let mut list: Vec<Sermon> = stmt
        .query_map(params![fts_query(query), limit], map_row)?
        .collect::<Result<Vec<_>, _>>()?;
    hydrate(conn, &mut list)?;
    Ok(list)
}

/// Sermons that touch a chapter (SB5.4), the sermon's own text first, then
/// a supporting passage, then a bare mention.
pub fn list_for_chapter(conn: &Connection, book_id: i64, chapter: i64) -> anyhow::Result<Vec<SermonForChapter>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT s.id, s.title, s.preach_date, s.stage, s.status, p.role, p.book_id, p.chapter, p.verse_start, p.verse_end
         FROM sermon_passages p JOIN sermons s ON s.id = p.sermon_id
         WHERE p.book_id = ?1 AND p.chapter = ?2 AND s.{NOT_DELETED}
         ORDER BY CASE p.role WHEN 'text' THEN 0 WHEN 'supporting' THEN 1 ELSE 2 END,
                  s.preach_date IS NULL, s.preach_date DESC, p.verse_start"
    ))?;
    let rows = stmt.query_map(params![book_id, chapter], |r| {
        Ok(SermonForChapter {
            sermon_id: r.get(0)?,
            title: r.get(1)?,
            preach_date: r.get(2)?,
            stage: r.get(3)?,
            status: r.get(4)?,
            role: r.get(5)?,
            book_id: r.get(6)?,
            chapter: r.get(7)?,
            verse_start: r.get(8)?,
            verse_end: r.get(9)?,
        })
    })?;
    // One sermon can hold the same chapter more than once; the strongest
    // role wins so a card never repeats in the Mine pane.
    let mut seen = std::collections::HashSet::new();
    Ok(rows
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .filter(|row| seen.insert(row.sermon_id))
        .collect())
}

// ---------------------------------------------------------------------------
// Events and the measured speaking rate (SB2.3, SB2.4)

pub fn add_event(
    conn: &Connection,
    sermon_id: i64,
    kind: &str,
    date: &str,
    venue: Option<&str>,
    duration_seconds: Option<i64>,
    word_count: Option<i64>,
    notes: Option<&str>,
) -> anyhow::Result<SermonEvent> {
    let now = chrono::Utc::now().to_rfc3339();
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "INSERT INTO sermon_events (sermon_id, kind, date, venue, duration_seconds, word_count, notes, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        params![sermon_id, kind, date, venue, duration_seconds, word_count, notes, now],
    )?;
    let id = tx.last_insert_rowid();
    // A preaching is the end of the road for a sermon; a rehearsal only
    // moves the track if the sermon has not been preached already.
    if kind == "preaching" {
        tx.execute(
            "UPDATE sermons SET stage = 'preached', status = 'preached', updated_at = ?2 WHERE id = ?1",
            params![sermon_id, now],
        )?;
    } else {
        tx.execute(
            "UPDATE sermons SET stage = 'rehearsed', updated_at = ?2 WHERE id = ?1 AND stage NOT IN ('rehearsed','preached')",
            params![sermon_id, now],
        )?;
    }
    let event = tx.query_row(
        &format!("SELECT {EVENT_COLS} FROM sermon_events WHERE id = ?1"),
        params![id],
        map_event,
    )?;
    tx.commit()?;
    Ok(event)
}

pub fn delete_event(conn: &Connection, id: i64) -> anyhow::Result<bool> {
    Ok(conn.execute("DELETE FROM sermon_events WHERE id = ?1", params![id])? > 0)
}

pub fn list_events(conn: &Connection, sermon_id: i64) -> anyhow::Result<Vec<SermonEvent>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {EVENT_COLS} FROM sermon_events WHERE sermon_id = ?1 ORDER BY date DESC, id DESC"
    ))?;
    let rows = stmt.query_map(params![sermon_id], map_event)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// Words a minute over the last ten timed events, preachings counted twice
/// because the pulpit is the rate that matters. A run that implies less
/// than 80 or more than 220 wpm was mis-timed (a clock left running, a
/// rehearsal abandoned) and is thrown out; fewer than two usable events
/// means there is no measured rate yet and the setting stands.
pub fn speaking_rate(conn: &Connection) -> anyhow::Result<Option<SpeakingRate>> {
    let cols = prefixed(EVENT_COLS, "e");
    let mut stmt = conn.prepare(&format!(
        "SELECT {cols} FROM sermon_events e JOIN sermons s ON s.id = e.sermon_id
         WHERE e.duration_seconds > 0 AND e.word_count > 0 AND s.{NOT_DELETED}
         ORDER BY e.date DESC, e.id DESC LIMIT 10"
    ))?;
    let events: Vec<SermonEvent> = stmt.query_map([], map_event)?.collect::<Result<Vec<_>, _>>()?;

    let mut total_weight = 0f64;
    let mut weighted_sum = 0f64;
    let mut rehearsals = 0;
    let mut preachings = 0;
    for e in &events {
        let (Some(seconds), Some(words)) = (e.duration_seconds, e.word_count) else { continue };
        let wpm = words as f64 / (seconds as f64 / 60.0);
        if !(80.0..=220.0).contains(&wpm) {
            continue;
        }
        let weight = if e.kind == "preaching" { 2.0 } else { 1.0 };
        weighted_sum += wpm * weight;
        total_weight += weight;
        if e.kind == "preaching" {
            preachings += 1;
        } else {
            rehearsals += 1;
        }
    }
    if rehearsals + preachings < 2 {
        return Ok(None);
    }
    Ok(Some(SpeakingRate {
        wpm: (weighted_sum / total_weight).round() as i64,
        rehearsals,
        preachings,
    }))
}

// ---------------------------------------------------------------------------
// Series (SB5.2)

fn map_series(r: &rusqlite::Row) -> rusqlite::Result<SermonSeries> {
    Ok(SermonSeries {
        id: r.get(0)?,
        title: r.get(1)?,
        description: r.get(2)?,
        plan_code: r.get(3)?,
        created_at: r.get(4)?,
        sermon_count: r.get(5)?,
        preached_count: r.get(6)?,
    })
}

pub fn list_series(conn: &Connection) -> anyhow::Result<Vec<SermonSeries>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT se.id, se.title, se.description, se.plan_code, se.created_at,
                COUNT(s.id), COALESCE(SUM(CASE WHEN s.status = 'preached' THEN 1 ELSE 0 END), 0)
         FROM sermon_series se
         LEFT JOIN sermons s ON s.series_id = se.id AND s.{NOT_DELETED}
         GROUP BY se.id ORDER BY se.title COLLATE NOCASE"
    ))?;
    let rows = stmt.query_map([], map_series)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn get_series(conn: &Connection, id: i64) -> anyhow::Result<Option<SermonSeries>> {
    Ok(list_series(conn)?.into_iter().find(|s| s.id == id))
}

pub fn create_series(conn: &Connection, title: &str, description: Option<&str>) -> anyhow::Result<SermonSeries> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO sermon_series (title, description, created_at) VALUES (?1,?2,?3)",
        params![title, description, now],
    )?;
    let id = conn.last_insert_rowid();
    Ok(get_series(conn, id)?.expect("the series just inserted"))
}

pub fn update_series(
    conn: &Connection,
    id: i64,
    title: &str,
    description: Option<&str>,
    plan_code: Option<&str>,
) -> anyhow::Result<SermonSeries> {
    conn.execute(
        "UPDATE sermon_series SET title = ?2, description = ?3, plan_code = ?4 WHERE id = ?1",
        params![id, title, description, plan_code],
    )?;
    Ok(get_series(conn, id)?.ok_or_else(|| anyhow::anyhow!("series {id} not found"))?)
}

/// Deleting a series leaves its sermons alone -- the FK is ON DELETE SET
/// NULL, so they simply stop belonging to one.
pub fn delete_series(conn: &Connection, id: i64) -> anyhow::Result<bool> {
    Ok(conn.execute("DELETE FROM sermon_series WHERE id = ?1", params![id])? > 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{open, open_content_db};

    fn scratch(name: &str) -> (std::path::PathBuf, Connection) {
        let dir = std::env::temp_dir().join(format!("sojourner-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let content_db_path = dir.join("content.db");
        open_content_db(&content_db_path).unwrap();
        let conn = open(&dir, &content_db_path).unwrap();
        (dir, conn)
    }

    fn passage(role: &str, book_id: i64, chapter: i64, vs: Option<i64>, ve: Option<i64>) -> SermonPassageInput {
        SermonPassageInput { role: role.into(), book_id, chapter, verse_start: vs, verse_end: ve }
    }

    fn source(kind: &str, ref_id: &str, label: &str) -> SermonSourceInput {
        SermonSourceInput { kind: kind.into(), ref_id: Some(ref_id.into()), label: label.into(), excerpt: None }
    }

    /// A save replaces the derived tables outright, so the passages and
    /// sources can never lag the document; soft delete hides the sermon from
    /// every listing and search until it is restored.
    #[test]
    fn save_replaces_derived_rows_and_soft_delete_hides_everywhere() {
        let (dir, conn) = scratch("sermons-test");

        let sermon = create(
            &conn,
            &SermonInput {
                title: Some("The God who works all things".into()),
                body: Some("<h2>Predestined</h2>".into()),
                passages: Some(vec![passage("text", 45, 8, Some(28), Some(30))]),
                tags: Some(vec!["romans".into()]),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(sermon.passages.len(), 1);
        assert_eq!(sermon.passages[0].role, "text");
        assert_eq!(sermon.tags, vec!["romans".to_string()]);
        assert_eq!(list(&conn, &SermonFilter::default()).unwrap().len(), 1);

        // A second save with different passages and sources leaves exactly
        // what was sent -- no orphans from the first one.
        let saved = update(
            &conn,
            sermon.id,
            &SermonInput {
                title: Some(sermon.title.clone()),
                body: Some("<h2>Predestined</h2><h2>Called</h2>".into()),
                passages: Some(vec![passage("text", 45, 8, Some(28), Some(30)), passage("supporting", 43, 3, Some(16), None)]),
                sources: Some(vec![source("commentary", "commentary:42", "Henry on Romans 8"), source("confession", "westminster:11", "WCF 11.1")]),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(saved.passages.len(), 2);
        assert_eq!(saved.sources.len(), 2);
        // A start with no end is one verse.
        let supporting = saved.passages.iter().find(|p| p.role == "supporting").unwrap();
        assert_eq!(supporting.verse_end, Some(16));
        // Tags were not sent, so they stand.
        assert_eq!(saved.tags, vec!["romans".to_string()]);

        assert_eq!(search(&conn, "Called", 10).unwrap().len(), 1);
        assert_eq!(list_for_chapter(&conn, 43, 3).unwrap().len(), 1);
        assert_eq!(list(&conn, &SermonFilter { book_id: Some(43), ..Default::default() }).unwrap().len(), 1);

        delete(&conn, sermon.id).unwrap();
        assert!(list(&conn, &SermonFilter::default()).unwrap().is_empty(), "list");
        assert!(search(&conn, "Called", 10).unwrap().is_empty(), "search");
        assert!(list_for_chapter(&conn, 43, 3).unwrap().is_empty(), "for chapter");
        assert!(list_all_tags(&conn).unwrap().is_empty(), "tags of a deleted sermon");
        assert!(get(&conn, sermon.id).unwrap().is_some(), "still reachable by id");

        conn.execute("UPDATE sermons SET deleted_at = NULL WHERE id = ?1", params![sermon.id]).unwrap();
        assert_eq!(list(&conn, &SermonFilter::default()).unwrap().len(), 1);
        assert_eq!(list_all_tags(&conn).unwrap(), vec!["romans".to_string()]);

        drop(conn);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// An event moves the prep track and the status; deleting a series
    /// clears its sermons' link without touching the sermons themselves.
    #[test]
    fn events_advance_the_track_and_series_delete_keeps_sermons() {
        let (dir, conn) = scratch("sermon-events-test");

        let series = create_series(&conn, "Romans", Some("Through the letter")).unwrap();
        let sermon = create(
            &conn,
            &SermonInput { title: Some("Romans 8".into()), series_id: Some(series.id), ..Default::default() },
        )
        .unwrap();
        assert_eq!(sermon.series_title.as_deref(), Some("Romans"));
        assert_eq!(list_series(&conn).unwrap()[0].sermon_count, 1);

        add_event(&conn, sermon.id, "rehearsal", "2026-09-10", None, Some(1_860), Some(4_000), None).unwrap();
        assert_eq!(get(&conn, sermon.id).unwrap().unwrap().stage, "rehearsed");
        add_event(&conn, sermon.id, "preaching", "2026-09-13", Some("Grace Church"), Some(2_100), Some(4_000), None).unwrap();
        let after = get(&conn, sermon.id).unwrap().unwrap();
        assert_eq!(after.stage, "preached");
        assert_eq!(after.status, "preached");
        assert_eq!(after.events.len(), 2);
        assert_eq!(list_series(&conn).unwrap()[0].preached_count, 1);

        assert!(delete_series(&conn, series.id).unwrap());
        let orphan = get(&conn, sermon.id).unwrap().unwrap();
        assert_eq!(orphan.series_id, None, "the sermon keeps its row");
        assert_eq!(orphan.title, "Romans 8");

        // An open pane still remembers the series it was opened with. Saving
        // must not fail on the foreign key -- that would wedge the manuscript
        // until the pane was closed -- so the vanished series reads as none.
        let saved = update(
            &conn,
            sermon.id,
            &SermonInput {
                title: Some("Romans 8".into()),
                body: Some("<p>Still writing.</p>".into()),
                series_id: Some(series.id),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(saved.series_id, None, "a deleted series saves as none");
        assert_eq!(saved.body, "<p>Still writing.</p>", "the manuscript still saves");

        drop(conn);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// The rate needs two usable events, weights preachings double, and
    /// throws out a run that was obviously mis-timed.
    #[test]
    fn speaking_rate_weights_preachings_and_ignores_mistimed_runs() {
        let (dir, conn) = scratch("sermon-rate-test");
        let sermon = create(&conn, &SermonInput { title: Some("A sermon".into()), ..Default::default() }).unwrap();

        assert!(speaking_rate(&conn).unwrap().is_none(), "no events, no rate");
        // 3,000 words in 25 minutes = 120 wpm.
        add_event(&conn, sermon.id, "rehearsal", "2026-09-01", None, Some(1_500), Some(3_000), None).unwrap();
        assert!(speaking_rate(&conn).unwrap().is_none(), "one event is not a measurement");

        add_event(&conn, sermon.id, "rehearsal", "2026-09-02", None, Some(1_500), Some(3_000), None).unwrap();
        let rate = speaking_rate(&conn).unwrap().unwrap();
        assert_eq!(rate.wpm, 120);
        assert_eq!((rate.rehearsals, rate.preachings), (2, 0));

        // A preaching at 140 wpm counts twice: (120 + 120 + 140*2) / 4 = 130.
        add_event(&conn, sermon.id, "preaching", "2026-09-06", None, Some(1_500), Some(3_500), None).unwrap();
        let rate = speaking_rate(&conn).unwrap().unwrap();
        assert_eq!(rate.wpm, 130);
        assert_eq!((rate.rehearsals, rate.preachings), (2, 1));

        // A clock left running for an hour on a 3,000-word manuscript is 50
        // wpm: out of range, so it changes nothing.
        add_event(&conn, sermon.id, "rehearsal", "2026-09-07", None, Some(3_600), Some(3_000), None).unwrap();
        let rate = speaking_rate(&conn).unwrap().unwrap();
        assert_eq!(rate.wpm, 130);
        assert_eq!((rate.rehearsals, rate.preachings), (2, 1));

        drop(conn);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
