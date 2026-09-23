//! The two tables the word study and morphology search read, both derived
//! from data already imported: `morph_codes` from the parsing codes in
//! `morphology_words`, and `lemma_glosses` from the KJV words the
//! interlinear tags with each Strong's number. See CONTENT_MIGRATION_0021.

use rusqlite::{params, Connection};

pub fn import(conn: &mut Connection) -> anyhow::Result<(usize, usize)> {
    let codes: Vec<String> = conn
        .prepare("SELECT DISTINCT morph_code FROM morphology_words WHERE morph_code IS NOT NULL AND morph_code <> ''")?
        .query_map([], |r| r.get(0))?
        .collect::<Result<_, _>>()?;
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM morph_codes", [])?;
    tx.execute("DELETE FROM lemma_glosses", [])?;
    {
        let mut insert = tx.prepare(
            "INSERT INTO morph_codes (code, language, part_of_speech, tense, voice, mood, person, number, gender,
                                      gram_case, state, stem, kind, description)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
        )?;
        for code in &codes {
            let m = crate::morph::decode(code);
            insert.execute(params![
                code,
                m.language,
                m.part_of_speech,
                m.tense,
                m.voice,
                m.mood,
                m.person,
                m.number,
                m.gender,
                m.case,
                m.state,
                m.stem,
                m.kind,
                m.description
            ])?;
        }
    }
    let mut counts: std::collections::HashMap<(String, String), i64> = std::collections::HashMap::new();
    {
        let mut stmt = tx.prepare("SELECT strongs_id, text FROM interlinear_words WHERE strongs_id IS NOT NULL")?;
        let mut rows = stmt.query([])?;
        while let Some(r) = rows.next()? {
            let id: String = r.get(0)?;
            let text: String = r.get(1)?;
            let g = normalize_gloss(&text);
            if !g.is_empty() {
                *counts.entry((id, g)).or_default() += 1;
            }
        }
    }
    {
        let mut insert = tx.prepare("INSERT INTO lemma_glosses (strongs_id, gloss, count) VALUES (?1, ?2, ?3)")?;
        for ((id, g), n) in &counts {
            insert.execute(params![id, g, n])?;
        }
    }
    let glosses = counts.len();
    tx.commit()?;
    println!("word study: {} parsing codes decoded, {glosses} KJV renderings counted", codes.len());
    Ok((codes.len(), glosses))
}

/// Words the KJV's phrase for a Greek or Hebrew word often carries that are
/// not the translators' choice of word: "the word", "in the beginning". They
/// come off the front so that "the word" and "word" count together.
const LEADING: &[&str] = &["the", "a", "an", "of", "in", "into", "unto", "to", "by", "for", "at", "as", "with", "and", "that", "this", "these", "those", "which"];

/// A KJV rendering as the word study counts it: lower-cased, punctuation
/// and leading function words removed. A rendering that is nothing but
/// function words ("the") is kept as it is.
pub fn normalize_gloss(text: &str) -> String {
    let cleaned: String = text
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '\'' || c == '-' || c == ' ' { c } else { ' ' })
        .collect();
    let words: Vec<&str> = cleaned.split_whitespace().collect();
    let start = words.iter().position(|w| !LEADING.contains(w)).unwrap_or(0);
    words[start..].join(" ")
}

#[cfg(test)]
mod tests {
    use super::normalize_gloss;

    #[test]
    fn articles_and_prepositions_come_off_the_front() {
        assert_eq!(normalize_gloss("the Word,"), "word");
        assert_eq!(normalize_gloss("in the beginning"), "beginning");
        assert_eq!(normalize_gloss("his speech"), "his speech");
        assert_eq!(normalize_gloss("the"), "the");
    }
}
