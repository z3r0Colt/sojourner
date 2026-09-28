//! The two tables the word study and morphology search read, both derived
//! from data already imported: `morph_codes` from the parsing codes in
//! `morphology_words`, and `lemma_glosses` from the KJV words the
//! interlinear tags with each Strong's number. See CONTENT_MIGRATION_0021.
//!
//! Both are rebuilt on every build, `--update` included, because both are
//! code's reading of data, and code changes where the data does not.
//! `morph_codes` is `crate::morph`'s reading of the codes: when the decoder
//! learns something -- OSHB's "both" read as the common gender it is, the
//! jussive and cohortative as imperfects with a mood of their own, a proper
//! noun's letter as the kind of name it is -- a table decoded by the old one
//! goes on offering the search form the old values, and answering a search
//! for the new ones with nothing, until it is decoded again.
//! `lemma_glosses` is `normalize_gloss`'s reading of the interlinear's
//! English, and the word study applies `normalize_gloss` again when a reader
//! chooses a rendering from its list (`occurrences` keeps the verses whose
//! English, normalized now, is the rendering stored then), so a table
//! counted by an older `normalize_gloss` would offer renderings that find no
//! verse. The two are built apart only because they read different tables.
//! Four thousand codes and a third of a million English words: a few
//! seconds, against a stale table no `--update` would ever notice.

use crate::morph::{affix_phrase, MorphInfo};
use rusqlite::{params, Connection};

/// Decodes every parsing code in `morphology_words` into `morph_codes`,
/// replacing whatever an earlier build decoded, each described with its
/// Hebrew prefixes and suffixes (see `description_with_affixes`). Returns
/// how many codes.
pub fn import_morph_codes(conn: &mut Connection) -> anyhow::Result<usize> {
    let codes: Vec<String> = conn
        .prepare("SELECT DISTINCT morph_code FROM morphology_words WHERE morph_code IS NOT NULL AND morph_code <> ''")?
        .query_map([], |r| r.get(0))?
        .collect::<Result<_, _>>()?;
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM morph_codes", [])?;
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
                description_with_affixes(&m)
            ])?;
        }
    }
    tx.commit()?;
    println!("word study: {} parsing codes decoded", codes.len());
    Ok(codes.len())
}

/// The description `morph_codes` keeps for a code, which is the parsing the
/// grammar search prints beside each word it finds and the word study beside
/// each form and occurrence: `crate::morph`'s, with the first word's own
/// prefixes and suffixes named after its part.
///
/// The decoder leaves a Hebrew or Aramaic word's affixes out of its
/// description, because the interlinear shows them apart, as chips beside
/// the parsing. Nothing shows them apart here. Without them בְּצַלְמֵנוּ, "in
/// our image" (Gen 1:26, "HR/Ncmsc/Sp1bp"), would read "noun, masculine
/// singular construct": a construct with nothing after it, and no "in" or
/// "our". Nearly half the Old Testament's words carry an affix, and one in
/// seven a pronominal suffix. So they are named the way the decoder names
/// a later word's in a code that writes two words as one ("... +
/// preposition, with pronominal suffix, 1st person common singular"), and
/// put where they belong: after the first word's part, before any other
/// word's. A Greek code has no affixes and is left as it is.
pub(crate) fn description_with_affixes(m: &MorphInfo) -> String {
    if m.affixes.is_empty() {
        return m.description.clone();
    }
    let affixes = m.affixes.iter().map(affix_phrase).collect::<Vec<_>>().join(" and ");
    // The decoder joins a code's words with " + ", the first word's part
    // first, and leaves out a part that says nothing -- as the first word's
    // does if it has no field at all, when its affixes are all there is to
    // say of it.
    let first_word_says_something = [
        &m.part_of_speech, &m.kind, &m.stem, &m.tense, &m.voice, &m.mood, &m.person, &m.case, &m.gender, &m.number, &m.state,
    ]
    .iter()
    .any(|field| field.is_some());
    if !first_word_says_something {
        return if m.description.is_empty() { affixes } else { format!("{affixes} + {}", m.description) };
    }
    match m.description.split_once(" + ") {
        Some((first, others)) => format!("{first}, with {affixes} + {others}"),
        None => format!("{}, with {affixes}", m.description),
    }
}

/// Counts how the KJV renders each Strong's number (see `normalize_gloss`)
/// into `lemma_glosses`, replacing what is there. Returns how many
/// renderings, each Strong's number's counted separately.
pub fn import_lemma_glosses(conn: &mut Connection) -> anyhow::Result<usize> {
    let mut counts: std::collections::HashMap<(String, String), i64> = std::collections::HashMap::new();
    {
        let mut stmt = conn.prepare("SELECT strongs_id, text FROM interlinear_words WHERE strongs_id IS NOT NULL")?;
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
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM lemma_glosses", [])?;
    {
        let mut insert = tx.prepare("INSERT INTO lemma_glosses (strongs_id, gloss, count) VALUES (?1, ?2, ?3)")?;
        for ((id, g), n) in &counts {
            insert.execute(params![id, g, n])?;
        }
    }
    tx.commit()?;
    let glosses = counts.len();
    println!("word study: {glosses} KJV renderings counted");
    Ok(glosses)
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
    use super::{description_with_affixes, import_lemma_glosses, import_morph_codes, normalize_gloss};
    use crate::morph::decode;
    use rusqlite::Connection;

    #[test]
    fn articles_and_prepositions_come_off_the_front() {
        assert_eq!(normalize_gloss("the Word,"), "word");
        assert_eq!(normalize_gloss("in the beginning"), "beginning");
        assert_eq!(normalize_gloss("his speech"), "his speech");
        assert_eq!(normalize_gloss("the"), "the");
    }

    /// The morphology words as far as `import_morph_codes` reads them, and a
    /// `morph_codes` an older decoder filled.
    fn with_codes(codes: &[&str]) -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE morphology_words (morph_code TEXT);").unwrap();
        conn.execute_batch(crate::db::schema::CONTENT_MIGRATION_0021).unwrap();
        for code in codes {
            conn.execute("INSERT INTO morphology_words (morph_code) VALUES (?1)", [code]).unwrap();
        }
        conn
    }

    #[test]
    fn decoding_again_replaces_what_an_older_decoder_wrote() {
        // אֶרֶץ, "land", as the decoder before September 2026 read it: gender
        // "both", which the search form then offered beside "common". And a
        // code no word carries any longer.
        let mut conn = with_codes(&["HNcbsa", "HVqj3ms", "HVqj3ms", ""]);
        conn.execute_batch(
            "INSERT INTO morph_codes (code, language, part_of_speech, gender, number, state, kind, description)
               VALUES ('HNcbsa', 'hebrew', 'noun', 'both', 'singular', 'absolute', 'common', 'noun, common both singular absolute');
             INSERT INTO morph_codes (code, language, description) VALUES ('HVqh1cs', 'hebrew', 'verb, qal cohortative');",
        )
        .unwrap();
        assert_eq!(import_morph_codes(&mut conn).unwrap(), 2);
        let rows: Vec<(String, Option<String>, Option<String>, Option<String>)> = conn
            .prepare("SELECT code, gender, tense, mood FROM morph_codes ORDER BY code")
            .unwrap()
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(
            rows,
            vec![
                ("HNcbsa".to_string(), Some("common".to_string()), None, None),
                // The jussive: an imperfect, with the wish in its mood.
                ("HVqj3ms".to_string(), Some("masculine".to_string()), Some("imperfect".to_string()), Some("jussive".to_string())),
            ]
        );
        // And it can run again, as every build does.
        assert_eq!(import_morph_codes(&mut conn).unwrap(), 2);
    }

    #[test]
    fn a_hebrew_words_prefixes_and_suffixes_are_in_its_description() {
        // Gen 1:26, "in our image": not a construct with nothing after it.
        assert_eq!(
            description_with_affixes(&decode("HR/Ncmsc/Sp1bp")),
            "noun, masculine singular construct, with prefixed preposition and pronominal suffix, 1st person common plural"
        );
        // Dan 2:10's "the king": the Aramaic article comes after its noun.
        assert_eq!(description_with_affixes(&decode("ANcbsd/Ta")), "noun, common gender singular determined, with suffixed article");
        // "And he said": the vav is written on the word, and says so.
        assert_eq!(
            description_with_affixes(&decode("Hc/Vqw3ms")),
            "verb, qal sequential imperfect, 3rd person masculine singular, with prefixed sequential conjunction"
        );
        // A word with none, and every Greek word, is described as it was.
        for code in ["HVqp3ms", "HNcbsa", "V-AAM-2S", "P-1NS + G2532=CONJ"] {
            assert_eq!(description_with_affixes(&decode(code)), decode(code).description, "{code}");
        }
    }

    #[test]
    fn the_first_words_affixes_go_with_the_first_word() {
        // Two words written as one: "and he ..." belongs to the verb, not the noun.
        let two = decode("HC/Vqp3ms//Ncmsa");
        assert_eq!(two.description, "verb, qal perfect, 3rd person masculine singular + noun, masculine singular absolute");
        assert_eq!(
            description_with_affixes(&two),
            "verb, qal perfect, 3rd person masculine singular, with prefixed conjunction + noun, masculine singular absolute"
        );
    }

    #[test]
    fn affixes_are_named_as_the_decoder_names_a_later_words() {
        // Each word alone, as the first word of its code, and after an
        // adverb written as one with it, where `crate::morph` names its
        // affixes itself: the two must read alike.
        for code in ["HR/Ncmsc/Sp1bp", "HC/Td/Ncmpa", "HRd/Ncmsa", "HNpl/Sd", "HVqi3mp/Sn", "HVqv2ms/Sh", "HTi/Tn"] {
            let later = decode(&format!("HD//{}", &code[1..])).description;
            let (_, later) = later.split_once(" + ").unwrap_or_else(|| panic!("{code}: {later}"));
            assert_eq!(description_with_affixes(&decode(code)), later, "{code}");
        }
        let later = decode("AD//Ncbsd/Ta").description;
        assert_eq!(description_with_affixes(&decode("ANcbsd/Ta")), later.split_once(" + ").unwrap().1);
    }

    #[test]
    fn the_import_keeps_the_description_with_its_affixes() {
        let mut conn = with_codes(&["HR/Ncmsc/Sp1bp"]);
        import_morph_codes(&mut conn).unwrap();
        let (description, number): (String, String) =
            conn.query_row("SELECT description, number FROM morph_codes", [], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
        assert!(description.ends_with("with prefixed preposition and pronominal suffix, 1st person common plural"), "{description}");
        // The fields stay the first word's own: the suffix's plural is "our",
        // not the noun's number.
        assert_eq!(number, "singular");
    }

    #[test]
    fn counting_again_replaces_what_an_older_normalize_gloss_counted() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE interlinear_words (strongs_id TEXT, text TEXT);
             INSERT INTO interlinear_words VALUES ('G3056', 'the Word,'), ('G3056', 'word'), ('G3056', 'saying'), (NULL, 'and');",
        )
        .unwrap();
        conn.execute_batch(crate::db::schema::CONTENT_MIGRATION_0021).unwrap();
        // As a normalization that kept the article counted them: a rendering
        // no verse's English, normalized now, would match.
        conn.execute_batch("INSERT INTO lemma_glosses VALUES ('G3056', 'the word', 1), ('G3056', 'word', 1);").unwrap();
        assert_eq!(import_lemma_glosses(&mut conn).unwrap(), 2);
        let rows: Vec<(String, i64)> = conn
            .prepare("SELECT gloss, count FROM lemma_glosses ORDER BY gloss")
            .unwrap()
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(rows, vec![("saying".to_string(), 1), ("word".to_string(), 2)]);
    }
}
