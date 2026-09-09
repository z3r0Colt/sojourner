use crate::models::{MetricalPsalmVersion, MetricalPsalmVerse};
use rusqlite::{params, Connection};
use std::collections::BTreeMap;

/// All metrical settings of a given Psalm number (usually one, occasionally
/// two -- see `metrical_psalms`).
pub fn get_metrical_psalm(conn: &Connection, psalm: i64) -> anyhow::Result<Vec<MetricalPsalmVersion>> {
    let mut stmt = conn.prepare(
        "SELECT version_label, verse, text FROM metrical_psalms WHERE psalm = ?1 ORDER BY version_label, verse",
    )?;
    let rows = stmt.query_map(params![psalm], |r| {
        Ok((r.get::<_, Option<String>>(0)?, r.get::<_, i64>(1)?, r.get::<_, String>(2)?))
    })?;

    let mut by_label: BTreeMap<Option<String>, Vec<MetricalPsalmVerse>> = BTreeMap::new();
    for row in rows {
        let (label, verse, text) = row?;
        by_label.entry(label).or_default().push(MetricalPsalmVerse { verse, text });
    }
    Ok(by_label
        .into_iter()
        .map(|(label, verses)| MetricalPsalmVersion { label, verses })
        .collect())
}
