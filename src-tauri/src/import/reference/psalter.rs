// Imports the 1650 Scottish Metrical Psalter, and the tunes it is sung to.
//
// Both files are built ahead of time by Node tools in `tools/`, so this
// importer only loads already-clean structured data:
//
//   scottish_metrical_1650.json -- `npm run build:psalter` takes the
//   OCR-derived raw file and strips the page furniture the scan carried in
//   (running headers, page numbers, John Brown's prose arguments and
//   footnotes), restores the verses 10 and 11 that the scan read as the words
//   "to" and "n" and so never split off, and divides each psalm into the
//   metrical lines it is printed and sung in. Source: "The Psalms of David in
//   Metre", John Brown of Haddington's edition (archive.org item
//   "scotishpsalter"). The raw file is kept beside it as provenance.
//
//   tunes.json -- `npm run fetch:tunes` lifts the melody, the metre and the
//   attribution out of the Open Hymnal Project's public-domain ABC scores.
//
// Where the scan was too damaged for any division to fit the metre, a setting
// keeps its verses but has no lines; it reads as verses and its tune plays
// without words under it.
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Deserialize, Serialize)]
struct Mark {
    verse: i64,
    word: i64,
}

#[derive(Deserialize)]
struct Line {
    text: String,
    marks: Vec<Mark>,
    syllables: Vec<String>,
}

#[derive(Deserialize)]
struct Stanza {
    number: i64,
    lines: Vec<Line>,
}

#[derive(Deserialize)]
struct Setting {
    label: Option<String>,
    metre: String,
    pattern: Vec<i64>,
    stanzas: Option<Vec<Stanza>>,
    verses: Vec<(i64, String)>,
}

#[derive(Deserialize)]
struct Psalm {
    number: i64,
    versions: Vec<Setting>,
}

#[derive(Deserialize)]
struct Tune {
    id: String,
    name: String,
    metre: String,
    pattern: Vec<i64>,
    composer: Option<String>,
    key: Option<String>,
    tempo: i64,
    lines: serde_json::Value,
}

fn join(pattern: &[i64]) -> String {
    pattern.iter().map(|n| n.to_string()).collect::<Vec<_>>().join(",")
}

pub fn import(conn: &mut Connection, dir: &Path) -> anyhow::Result<usize> {
    let psalms: Vec<Psalm> = serde_json::from_str(&std::fs::read_to_string(dir.join("scottish_metrical_1650.json"))?)?;
    let tunes: Vec<Tune> = serde_json::from_str(&std::fs::read_to_string(dir.join("tunes.json"))?)?;

    let tx = conn.transaction()?;
    let mut count = 0usize;
    {
        let mut insert_verse =
            tx.prepare("INSERT INTO metrical_psalms (psalm, version_label, verse, text) VALUES (?1,?2,?3,?4)")?;
        let mut insert_setting =
            tx.prepare("INSERT INTO metrical_psalm_settings (psalm, label, metre, pattern) VALUES (?1,?2,?3,?4)")?;
        let mut insert_line = tx.prepare(
            "INSERT INTO metrical_psalm_lines (setting_id, stanza, line, text, marks, syllables)
             VALUES (?1,?2,?3,?4,?5,?6)",
        )?;

        for psalm in &psalms {
            for setting in &psalm.versions {
                insert_setting.execute(params![psalm.number, setting.label, setting.metre, join(&setting.pattern)])?;
                let setting_id = tx.last_insert_rowid();

                for (verse, text) in &setting.verses {
                    insert_verse.execute(params![psalm.number, setting.label, verse, text])?;
                    count += 1;
                }

                for stanza in setting.stanzas.iter().flatten() {
                    for (index, line) in stanza.lines.iter().enumerate() {
                        let marks = serde_json::to_string(&line.marks)?;
                        insert_line.execute(params![
                            setting_id,
                            stanza.number,
                            index as i64 + 1,
                            line.text,
                            marks,
                            serde_json::to_string(&line.syllables)?
                        ])?;
                    }
                }
            }
        }

        let mut insert_tune = tx.prepare(
            "INSERT INTO psalm_tunes (id, name, metre, pattern, composer, tune_key, tempo, notes)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        )?;
        for tune in &tunes {
            insert_tune.execute(params![
                tune.id,
                tune.name,
                tune.metre,
                join(&tune.pattern),
                tune.composer,
                tune.key,
                tune.tempo,
                serde_json::to_string(&tune.lines)?
            ])?;
        }
    }
    tx.commit()?;
    Ok(count)
}
