//! The Westminster Standards side by side (see CONTENT_MIGRATION_0030).
//!
//! `reference/westminster/parallels.json` is hand-made: one group per Shorter
//! Catechism question, or per few questions taken together (13 and 15, the
//! fall), each naming the Larger Catechism questions and Confession
//! paragraphs that teach the same thing, and a few groups at the end for
//! Larger Catechism and Confession teaching the Shorter has no question for
//! (the church, the uses of the moral law). Beattie's *Presbyterian
//! Standards* (1896) heads each chapter with the same three-way reference
//! and was checked against, question by question; where he is only roughly
//! right (death and the middle state under Confession 33 rather than 32) the
//! table follows the text.
//!
//! A Confession member is a chapter ("11", every section of it) or one
//! paragraph ("11.3"); a catechism member is a question number.

use rusqlite::{params, Connection};
use serde::Deserialize;
use std::collections::HashMap;
use std::path::Path;

#[derive(Deserialize)]
struct Group {
    topic: String,
    #[serde(default)]
    wsc: Vec<i64>,
    #[serde(default)]
    wlc: Vec<i64>,
    #[serde(default)]
    wcf: Vec<String>,
}

/// "11" -> (11, None), "11.3" -> (11, Some(3)).
fn parse_wcf(member: &str) -> Option<(i64, Option<i64>)> {
    match member.split_once('.') {
        Some((c, s)) => Some((c.parse().ok()?, Some(s.parse().ok()?))),
        None => Some((member.parse().ok()?, None)),
    }
}

/// Section ids by document and the number in their heading: a catechism's
/// "Question N" under (N, None), a Confession paragraph's "Chapter N, M"
/// under (N, Some(M)).
fn section_index(conn: &Connection) -> anyhow::Result<HashMap<(String, i64, Option<i64>), i64>> {
    let mut stmt = conn.prepare(
        "SELECT ws.id, wd.code, ws.heading FROM westminster_sections ws
         JOIN westminster_documents wd ON wd.id = ws.document_id
         WHERE wd.code IN ('wsc', 'wlc', 'wcf')",
    )?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?)))?;
    let mut index = HashMap::new();
    for row in rows {
        let (id, code, heading) = row?;
        let key = if let Some(q) = heading.strip_prefix("Question ") {
            q.trim().parse().ok().map(|q| (q, None))
        } else if let Some(rest) = heading.strip_prefix("Chapter ") {
            rest.split_once(',').and_then(|(c, s)| Some((c.trim().parse().ok()?, Some(s.trim().parse().ok()?))))
        } else {
            None
        };
        if let Some((n, s)) = key {
            index.insert((code, n, s), id);
        }
    }
    Ok(index)
}

pub fn import(conn: &mut Connection, dir: &Path) -> anyhow::Result<usize> {
    let path = dir.join("parallels.json");
    let raw = std::fs::read_to_string(&path)?;
    let groups: Vec<Group> = serde_json::from_str(&raw).map_err(|e| anyhow::anyhow!("parsing {}: {e}", path.display()))?;
    let index = section_index(conn)?;
    let lookup = |code: &str, n: i64, s: Option<i64>| {
        index
            .get(&(code.to_string(), n, s))
            .copied()
            .ok_or_else(|| anyhow::anyhow!("{}: no {code} {n}{} in westminster_sections", path.display(), s.map(|s| format!(".{s}")).unwrap_or_default()))
    };

    let tx = conn.transaction()?;
    tx.execute("DELETE FROM westminster_parallels", [])?;
    tx.execute("DELETE FROM westminster_parallel_groups", [])?;
    let mut total = 0usize;
    {
        let mut group_stmt = tx.prepare("INSERT INTO westminster_parallel_groups (id, topic, sort_order) VALUES (?1,?2,?3)")?;
        // OR IGNORE: a paragraph named both by itself and in its whole
        // chapter is one member.
        let mut member_stmt = tx.prepare("INSERT OR IGNORE INTO westminster_parallels (group_id, section_id, label) VALUES (?1,?2,?3)")?;
        for (i, g) in groups.iter().enumerate() {
            let group_id = i as i64 + 1;
            group_stmt.execute(params![group_id, g.topic, i as i64])?;
            let mut members: Vec<(i64, String)> = Vec::new();
            for &q in &g.wsc {
                members.push((lookup("wsc", q, None)?, q.to_string()));
            }
            for &q in &g.wlc {
                members.push((lookup("wlc", q, None)?, q.to_string()));
            }
            for m in &g.wcf {
                let (chapter, section) = parse_wcf(m).ok_or_else(|| anyhow::anyhow!("{}: bad Confession reference '{m}'", path.display()))?;
                match section {
                    Some(s) => members.push((lookup("wcf", chapter, Some(s))?, m.clone())),
                    None => {
                        let mut ids: Vec<i64> = index
                            .iter()
                            .filter(|((code, c, s), _)| code == "wcf" && *c == chapter && s.is_some())
                            .map(|(_, &id)| id)
                            .collect();
                        anyhow::ensure!(!ids.is_empty(), "{}: no Confession chapter {chapter}", path.display());
                        ids.sort_unstable();
                        members.extend(ids.into_iter().map(|id| (id, m.clone())));
                    }
                }
            }
            for (section_id, label) in members {
                total += member_stmt.execute(params![group_id, section_id, label])?;
            }
        }
    }
    tx.commit()?;
    Ok(total)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_confession_member_is_a_chapter_or_a_paragraph() {
        assert_eq!(parse_wcf("11"), Some((11, None)));
        assert_eq!(parse_wcf("21.7"), Some((21, Some(7))));
        assert_eq!(parse_wcf("XI"), None);
    }

    /// The shipped table: every Shorter Catechism question in exactly one
    /// group, every Larger Catechism question in at least one, and every
    /// Confession reference a paragraph that exists.
    #[test]
    fn the_table_covers_both_catechisms() {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../reference/westminster");
        let groups: Vec<Group> = serde_json::from_str(&std::fs::read_to_string(dir.join("parallels.json")).unwrap()).unwrap();
        let mut wsc: Vec<i64> = groups.iter().flat_map(|g| g.wsc.iter().copied()).collect();
        wsc.sort_unstable();
        assert_eq!(wsc, (1..=107).collect::<Vec<_>>());
        let wlc: std::collections::HashSet<i64> = groups.iter().flat_map(|g| g.wlc.iter().copied()).collect();
        assert_eq!(wlc, (1..=196).collect());

        let confession: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(dir.join("confession.json")).unwrap()).unwrap();
        let sections_in = |chapter: i64| {
            confession["Data"]
                .as_array()
                .unwrap()
                .iter()
                .find(|c| c["Chapter"].as_str() == Some(&chapter.to_string()))
                .map(|c| c["Sections"].as_array().unwrap().len() as i64)
        };
        for m in groups.iter().flat_map(|g| g.wcf.iter()) {
            let (chapter, section) = parse_wcf(m).unwrap();
            let count = sections_in(chapter).unwrap_or_else(|| panic!("no Confession chapter {chapter}"));
            if let Some(s) = section {
                assert!((1..=count).contains(&s), "Confession {m} does not exist");
            }
        }
    }
}
