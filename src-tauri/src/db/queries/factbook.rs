//! The Factbook (see CONTENT_MIGRATION_0024).

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct FactbookSummary {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub description: String,
    pub entity_type: String,
    pub verse_count: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct FactbookName {
    pub significance: String,
    /// Every English form, "; "-separated, the commonest first.
    pub english: String,
    pub original: Option<String>,
    pub strongs_id: Option<String>,
    pub strongs_plain: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct FactbookRelation {
    /// father, mother, sibling, partner, child; founder, inhabitant (a
    /// place's); and the reverse of each as seen from the other side --
    /// parent_of, founded, lived_in.
    pub kind: String,
    pub qualifier: Option<String>,
    pub entity: FactbookSummary,
}

#[derive(Debug, Clone, Serialize)]
pub struct FactbookLink {
    pub kind: String,
    pub slug: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct FactbookEntry {
    pub summary: FactbookSummary,
    /// TIPNR's one-line summary, HTML with Scripture links.
    pub summary_html: String,
    pub tribe: Option<String>,
    pub region: Option<String>,
    pub lat: Option<f64>,
    pub lon: Option<f64>,
    pub names: Vec<FactbookName>,
    pub relations: Vec<FactbookRelation>,
    /// Every verse naming it: (book, chapter, verse).
    pub verses: Vec<(i64, i64, i64)>,
    pub links: Vec<FactbookLink>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PassageEntity {
    pub entity: FactbookSummary,
    /// The verses of the chapter that name it.
    pub verses: Vec<i64>,
}

const SUMMARY_COLS: &str = "e.id, e.kind, e.name, e.description, e.entity_type, e.verse_count";

fn map_summary(r: &rusqlite::Row, at: usize) -> rusqlite::Result<FactbookSummary> {
    Ok(FactbookSummary {
        id: r.get(at)?,
        kind: r.get(at + 1)?,
        name: r.get(at + 2)?,
        description: r.get(at + 3)?,
        entity_type: r.get(at + 4)?,
        verse_count: r.get(at + 5)?,
    })
}

fn has_factbook(conn: &Connection) -> bool {
    conn.query_row("SELECT 1 FROM factbook_entities LIMIT 1", [], |_| Ok(())).is_ok()
}

pub fn get_entry(conn: &Connection, id: &str) -> anyhow::Result<Option<FactbookEntry>> {
    if !has_factbook(conn) {
        return Ok(None);
    }
    let head = conn
        .query_row(
            &format!("SELECT {SUMMARY_COLS}, e.summary, e.tribe, e.region, e.lat, e.lon FROM factbook_entities e WHERE e.id = ?1"),
            params![id],
            |r| Ok((map_summary(r, 0)?, r.get::<_, String>(6)?, r.get(7)?, r.get(8)?, r.get(9)?, r.get(10)?)),
        )
        .optional()?;
    let Some((summary, summary_html, tribe, region, lat, lon)) = head else {
        return Ok(None);
    };
    let names = conn
        .prepare("SELECT significance, english, original, strongs_id, strongs_plain FROM factbook_names WHERE entity_id = ?1 ORDER BY id")?
        .query_map(params![id], |r| {
            Ok(FactbookName { significance: r.get(0)?, english: r.get(1)?, original: r.get(2)?, strongs_id: r.get(3)?, strongs_plain: r.get(4)? })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    // Both directions: this entity's own fields, and every entity that names
    // it (a child's parents name the child's father, whose own record may
    // not list every child).
    let mut relations = Vec::new();
    let mut stmt = conn.prepare(&format!(
        "SELECT r.kind, r.qualifier, {SUMMARY_COLS} FROM factbook_relations r JOIN factbook_entities e ON e.id = r.to_id WHERE r.from_id = ?1 ORDER BY r.id"
    ))?;
    for row in stmt.query_map(params![id], |r| Ok(FactbookRelation { kind: r.get(0)?, qualifier: r.get(1)?, entity: map_summary(r, 2)? }))? {
        relations.push(row?);
    }
    let mut stmt = conn.prepare(&format!(
        "SELECT r.kind, r.qualifier, {SUMMARY_COLS} FROM factbook_relations r JOIN factbook_entities e ON e.id = r.from_id WHERE r.to_id = ?1 ORDER BY r.id"
    ))?;
    for row in stmt.query_map(params![id], |r| {
        let kind: String = r.get(0)?;
        let reverse = match kind.as_str() {
            "father" | "mother" => "child",
            "child" => "parent",
            "sibling" => "sibling",
            "partner" => "partner",
            "founder" => "founded",
            "inhabitant" => "lived_in",
            other => other,
        };
        Ok(FactbookRelation { kind: reverse.to_string(), qualifier: r.get(1)?, entity: map_summary(r, 2)? })
    })? {
        let rel = row?;
        if !relations.iter().any(|x: &FactbookRelation| x.entity.id == rel.entity.id && same_family(&x.kind, &rel.kind)) {
            relations.push(rel);
        }
    }
    let verses = conn
        .prepare("SELECT book_id, chapter, verse FROM factbook_verses WHERE entity_id = ?1 ORDER BY book_id, chapter, verse")?
        .query_map(params![id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
        .collect::<Result<Vec<_>, _>>()?;
    let links = conn
        .prepare(
            "SELECT l.kind, l.slug,
                    COALESCE((SELECT term FROM isbe_entries WHERE slug = l.slug AND l.kind = 'isbe'),
                             (SELECT term FROM dictionary_entries WHERE slug = l.slug AND l.kind = 'dictionary'),
                             (SELECT name FROM atlas_places WHERE slug = l.slug AND l.kind = 'atlas'), l.slug)
             FROM factbook_links l WHERE l.entity_id = ?1 ORDER BY l.kind, l.slug",
        )?
        .query_map(params![id], |r| Ok(FactbookLink { kind: r.get(0)?, slug: r.get(1)?, title: r.get(2)? }))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Some(FactbookEntry { summary, summary_html, tribe, region, lat, lon, names, relations, verses, links }))
}

/// Parent and child are one relation seen from two sides.
fn same_family(a: &str, b: &str) -> bool {
    fn norm(k: &str) -> &str {
        match k {
            "father" | "mother" | "parent" => "parent",
            other => other,
        }
    }
    norm(a) == norm(b) || a == b
}

/// Everyone and everything a chapter names, in order of first mention.
pub fn for_passage(conn: &Connection, book_id: i64, chapter: i64) -> anyhow::Result<Vec<PassageEntity>> {
    if !has_factbook(conn) {
        return Ok(vec![]);
    }
    let mut stmt = conn.prepare(&format!(
        "SELECT {SUMMARY_COLS}, group_concat(v.verse) FROM factbook_verses v JOIN factbook_entities e ON e.id = v.entity_id
         WHERE v.book_id = ?1 AND v.chapter = ?2 GROUP BY e.id ORDER BY MIN(v.verse), e.name"
    ))?;
    let rows = stmt.query_map(params![book_id, chapter], |r| {
        let verses: String = r.get(6)?;
        let mut verses: Vec<i64> = verses.split(',').filter_map(|s| s.parse().ok()).collect();
        verses.sort();
        verses.dedup();
        Ok(PassageEntity { entity: map_summary(r, 0)?, verses })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// The entity a proper name means in one verse: of those the verse names,
/// the one with a form spelled as the word (any English form, so the KJV's
/// "Zacharias" finds Zechariah), or null. A Strong's number, when the word
/// was tagged, settles it without spelling.
pub fn for_word(conn: &Connection, book_id: i64, chapter: i64, verse: i64, word: &str, strongs: Option<&str>) -> anyhow::Result<Option<FactbookSummary>> {
    if !has_factbook(conn) {
        return Ok(None);
    }
    let word = word.trim().trim_matches(|c: char| !c.is_alphanumeric()).to_lowercase();
    let mut stmt = conn.prepare(&format!(
        "SELECT {SUMMARY_COLS}, n.english, n.strongs_plain FROM factbook_verses v
         JOIN factbook_entities e ON e.id = v.entity_id
         JOIN factbook_names n ON n.entity_id = e.id
         WHERE v.book_id = ?1 AND v.chapter = ?2 AND v.verse = ?3"
    ))?;
    let rows = stmt.query_map(params![book_id, chapter, verse], |r| Ok((map_summary(r, 0)?, r.get::<_, String>(6)?, r.get::<_, Option<String>>(7)?)))?;
    let mut by_spelling = None;
    for row in rows {
        let (summary, english, strongs_plain) = row?;
        if strongs.is_some() && strongs_plain.as_deref() == strongs {
            return Ok(Some(summary));
        }
        let spelled = english.split(';').any(|f| {
            let f = f.trim().to_lowercase();
            f == word || f.split_whitespace().any(|w| w == word) || f.replace(['-', ' '], "") == word
        });
        if spelled && by_spelling.is_none() {
            by_spelling = Some(summary);
        }
    }
    Ok(by_spelling)
}

/// People, places and things by name, commonest first.
pub fn search(conn: &Connection, query: &str, limit: i64) -> anyhow::Result<Vec<FactbookSummary>> {
    let q = query.trim();
    if q.len() < 2 || !has_factbook(conn) {
        return Ok(vec![]);
    }
    let mut stmt = conn.prepare(&format!(
        "SELECT DISTINCT {SUMMARY_COLS} FROM factbook_entities e
         LEFT JOIN factbook_names n ON n.entity_id = e.id
         WHERE e.name LIKE ?1 || '%' OR n.english LIKE ?1 || '%' OR n.english LIKE '%; ' || ?1 || '%'
         ORDER BY lower(e.name) <> lower(?1), e.verse_count DESC LIMIT ?2"
    ))?;
    let rows = stmt.query_map(params![q, limit], |r| map_summary(r, 0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}
