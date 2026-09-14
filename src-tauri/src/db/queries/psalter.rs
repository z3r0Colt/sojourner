use crate::models::{
    MetricalPsalmLine, MetricalPsalmMark, MetricalPsalmStanza, MetricalPsalmVerse, MetricalPsalmVersion, PsalmTune,
};
use rusqlite::{params, Connection, Row};
use std::collections::BTreeMap;

const TUNE_COLUMNS: &str = "id, name, metre, pattern, composer, tune_key, tempo, notes";

fn tune(row: &Row) -> rusqlite::Result<PsalmTune> {
    Ok(PsalmTune {
        id: row.get(0)?,
        name: row.get(1)?,
        metre: row.get(2)?,
        pattern: pattern(&row.get::<_, String>(3)?),
        composer: row.get(4)?,
        key: row.get(5)?,
        tempo: row.get(6)?,
        lines: serde_json::from_str(&row.get::<_, String>(7)?).unwrap_or_default(),
    })
}

fn pattern(text: &str) -> Vec<i64> {
    text.split(',').filter_map(|n| n.trim().parse().ok()).collect()
}

/// Every metrical setting of a given Psalm number -- usually one, occasionally
/// two where the book prints a second version in another metre.
pub fn get_metrical_psalm(conn: &Connection, psalm: i64) -> anyhow::Result<Vec<MetricalPsalmVersion>> {
    let mut settings = conn.prepare(
        "SELECT id, label, metre, pattern FROM metrical_psalm_settings WHERE psalm = ?1 ORDER BY label IS NOT NULL, label",
    )?;
    let rows = settings.query_map(params![psalm], |r| {
        Ok((
            r.get::<_, i64>(0)?,
            r.get::<_, Option<String>>(1)?,
            r.get::<_, String>(2)?,
            r.get::<_, String>(3)?,
        ))
    })?;

    let mut out = Vec::new();
    for row in rows {
        let (id, label, metre, pattern_text) = row?;

        let mut verse_stmt = conn.prepare(
            "SELECT verse, text FROM metrical_psalms
             WHERE psalm = ?1 AND version_label IS ?2 ORDER BY verse",
        )?;
        let verses = verse_stmt
            .query_map(params![psalm, label], |r| {
                Ok(MetricalPsalmVerse { verse: r.get(0)?, text: r.get(1)? })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        let mut line_stmt = conn.prepare(
            "SELECT stanza, text, marks, syllables FROM metrical_psalm_lines WHERE setting_id = ?1 ORDER BY stanza, line",
        )?;
        let mut by_stanza: BTreeMap<i64, Vec<MetricalPsalmLine>> = BTreeMap::new();
        let lines = line_stmt.query_map(params![id], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
            ))
        })?;
        for line in lines {
            let (stanza, text, marks, syllables) = line?;
            by_stanza.entry(stanza).or_default().push(MetricalPsalmLine {
                text,
                marks: serde_json::from_str::<Vec<MetricalPsalmMark>>(&marks).unwrap_or_default(),
                syllables: serde_json::from_str::<Vec<String>>(&syllables).unwrap_or_default(),
            });
        }

        out.push(MetricalPsalmVersion {
            label,
            metre,
            pattern: pattern(&pattern_text),
            verses,
            stanzas: by_stanza
                .into_iter()
                .map(|(number, lines)| MetricalPsalmStanza { number, lines })
                .collect(),
        });
    }
    Ok(out)
}

/// The tunes that fit a metre. A psalm is sung to any tune in its own metre,
/// which is what naming metres is for, so this is the whole choice offered
/// for a given psalm.
pub fn list_tunes_for_metre(conn: &Connection, metre: &str) -> anyhow::Result<Vec<PsalmTune>> {
    let sql = format!("SELECT {TUNE_COLUMNS} FROM psalm_tunes WHERE metre = ?1 ORDER BY name");
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![metre], tune)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// Every tune the app carries, for a browsable index of the psalter's tunes.
pub fn list_tunes(conn: &Connection) -> anyhow::Result<Vec<PsalmTune>> {
    let sql = format!("SELECT {TUNE_COLUMNS} FROM psalm_tunes ORDER BY metre, name");
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], tune)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}
