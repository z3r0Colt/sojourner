//! The word study (one Strong's number, studied) and the morphology search
//! (every word with a given parsing).
//!
//! Occurrences are counted in the tagged Greek and Hebrew
//! (`morphology_words`: TAGNT's Textus Receptus and the Westminster
//! Leningrad Codex), not in any English translation: a word study is about
//! the word the writer used, however a translator happened to render it.
//! How the KJV rendered it comes from the interlinear, through
//! `lemma_glosses`.

use crate::models::StrongsEntry;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};

#[derive(Debug, Clone, Serialize)]
pub struct Rendering {
    pub gloss: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct WordForm {
    /// The form as printed, punctuation removed.
    pub form: String,
    pub morph_code: String,
    pub description: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct RelatedWord {
    pub id: String,
    pub original_word: String,
    pub transliteration: Option<String>,
    pub short_definition: Option<String>,
    /// "root" (this word comes from it) or "derived" (it comes from this word).
    pub relation: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct WordStudy {
    pub entry: StrongsEntry,
    /// Times the word occurs in the tagged Greek or Hebrew.
    pub occurrences: i64,
    /// Verses it occurs in.
    pub verses: i64,
    pub renderings: Vec<Rendering>,
    /// (book id, occurrences), in canonical order.
    pub by_book: Vec<(i64, i64)>,
    pub forms: Vec<WordForm>,
    pub related: Vec<RelatedWord>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Occurrence {
    pub book_id: i64,
    pub chapter: i64,
    pub verse: i64,
    pub original_word: String,
    pub morph_code: Option<String>,
    pub description: Option<String>,
    /// How the KJV renders it here, from the interlinear; several when the
    /// verse uses the word more than once.
    pub renderings: Vec<String>,
    /// The verse in the translation asked for, when it has the verse.
    pub text: Option<String>,
}

/// Punctuation the tagged texts print on a word, removed for grouping forms.
fn bare_form(word: &str) -> String {
    word.trim_matches(|c: char| !c.is_alphabetic() && !is_mark_char(c))
        .chars()
        .filter(|c| !matches!(*c as u32, 0x0591..=0x05AF | 0x05BD | 0x05C0 | 0x05C3) && *c != '/')
        .collect()
}

fn is_mark_char(c: char) -> bool {
    matches!(c as u32, 0x0300..=0x036F | 0x0591..=0x05C7)
}

pub fn word_study(conn: &Connection, strongs_id: &str) -> anyhow::Result<Option<WordStudy>> {
    let Some(entry) = super::reference::get_strongs_entry(conn, strongs_id)? else {
        return Ok(None);
    };
    let (occurrences, verses): (i64, i64) = conn.query_row(
        "SELECT COUNT(*), COUNT(DISTINCT book_id * 1000000 + chapter * 1000 + verse)
         FROM morphology_words WHERE strongs_id = ?1",
        params![strongs_id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;

    let renderings = conn
        .prepare("SELECT gloss, count FROM lemma_glosses WHERE strongs_id = ?1 ORDER BY count DESC, gloss")?
        .query_map(params![strongs_id], |r| Ok(Rendering { gloss: r.get(0)?, count: r.get(1)? }))?
        .collect::<Result<Vec<_>, _>>()?;

    let by_book = conn
        .prepare("SELECT book_id, COUNT(*) FROM morphology_words WHERE strongs_id = ?1 GROUP BY book_id ORDER BY book_id")?
        .query_map(params![strongs_id], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<Result<Vec<_>, _>>()?;

    let mut forms: BTreeMap<(String, String), (String, i64)> = BTreeMap::new();
    {
        let mut stmt = conn.prepare("SELECT original_word, COALESCE(morph_code, '') FROM morphology_words WHERE strongs_id = ?1")?;
        let mut rows = stmt.query(params![strongs_id])?;
        while let Some(r) = rows.next()? {
            let word: String = r.get(0)?;
            let code: String = r.get(1)?;
            let form = bare_form(&word);
            forms.entry((crate::plain::plain(&form), code)).or_insert((form, 0)).1 += 1;
        }
    }
    let descriptions: HashMap<String, String> = conn
        .prepare("SELECT code, description FROM morph_codes")?
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<Result<_, _>>()?;
    let mut forms: Vec<WordForm> = forms
        .into_iter()
        .map(|((_, code), (form, count))| WordForm {
            description: descriptions.get(&code).cloned().unwrap_or_default(),
            form,
            morph_code: code,
            count,
        })
        .collect();
    forms.sort_by(|a, b| b.count.cmp(&a.count).then(a.form.cmp(&b.form)));

    let related = related_words(conn, &entry)?;
    Ok(Some(WordStudy { entry, occurrences, verses, renderings, by_book, forms, related }))
}

/// Words this one comes from (Strong's numbers its derivation names) and
/// words that come from it (entries whose derivation names it).
fn related_words(conn: &Connection, entry: &StrongsEntry) -> anyhow::Result<Vec<RelatedWord>> {
    let prefix = &entry.id[..1];
    let re = regex::Regex::new(r"\b([HG])(\d{1,5})\b").unwrap();
    let mut roots: Vec<String> = Vec::new();
    if let Some(d) = &entry.derivation {
        for c in re.captures_iter(d) {
            let id = format!("{}{}", &c[1], c[2].trim_start_matches('0'));
            if id != entry.id && !roots.contains(&id) {
                roots.push(id);
            }
        }
    }
    let mut out = Vec::new();
    let mut stmt = conn.prepare(
        "SELECT id, original_word, transliteration, short_definition, derivation FROM strongs_entries WHERE id = ?1",
    )?;
    for id in &roots {
        if let Some(r) = stmt
            .query_map(params![id], |r| {
                Ok(RelatedWord {
                    id: r.get(0)?,
                    original_word: r.get(1)?,
                    transliteration: r.get(2)?,
                    short_definition: r.get(3)?,
                    relation: "root".into(),
                })
            })?
            .next()
        {
            out.push(r?);
        }
    }
    let mut derived = conn.prepare(
        "SELECT id, original_word, transliteration, short_definition, derivation FROM strongs_entries
         WHERE id LIKE ?1 || '%' AND derivation LIKE '%' || ?2 || '%'",
    )?;
    let mut rows = derived.query(params![prefix, entry.id])?;
    while let Some(r) = rows.next()? {
        let derivation: String = r.get::<_, Option<String>>(4)?.unwrap_or_default();
        let names_it = re
            .captures_iter(&derivation)
            .any(|c| format!("{}{}", &c[1], c[2].trim_start_matches('0')) == entry.id);
        let id: String = r.get(0)?;
        if names_it && id != entry.id {
            out.push(RelatedWord {
                id,
                original_word: r.get(1)?,
                transliteration: r.get(2)?,
                short_definition: r.get(3)?,
                relation: "derived".into(),
            });
        }
    }
    Ok(out)
}

/// Every occurrence of a Strong's number, in canonical order, with the verse
/// in `translation_id`. `gloss` narrows to verses where the KJV renders it so.
pub fn occurrences(conn: &Connection, strongs_id: &str, translation_id: Option<i64>, gloss: Option<&str>) -> anyhow::Result<Vec<Occurrence>> {
    let sql = format!(
        "SELECT m.book_id, m.chapter, m.verse, m.original_word, m.morph_code, mc.description,
                (SELECT group_concat(iw.text, '|') FROM interlinear_words iw
                  WHERE iw.book_id = m.book_id AND iw.chapter = m.chapter AND iw.verse = m.verse AND iw.strongs_id = m.strongs_id),
                v.text
         FROM morphology_words m
         LEFT JOIN morph_codes mc ON mc.code = m.morph_code
         LEFT JOIN verses v ON v.translation_id = ?2 AND v.book_id = m.book_id AND v.chapter = m.chapter AND v.verse = m.verse
         WHERE m.strongs_id = ?1
         ORDER BY m.book_id, m.chapter, m.verse, m.sort_order"
    );
    let mut stmt = conn.prepare(&sql)?;
    let map = |r: &rusqlite::Row| -> rusqlite::Result<Occurrence> {
        let renderings: Option<String> = r.get(6)?;
        Ok(Occurrence {
            book_id: r.get(0)?,
            chapter: r.get(1)?,
            verse: r.get(2)?,
            original_word: r.get(3)?,
            morph_code: r.get(4)?,
            description: r.get(5)?,
            renderings: renderings
                .map(|s| {
                    let mut v: Vec<String> = s.split('|').map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).collect();
                    v.dedup();
                    v
                })
                .unwrap_or_default(),
            text: r.get(7)?,
        })
    };
    let rows = stmt.query_map(params![strongs_id, translation_id], map)?.collect::<Result<Vec<_>, _>>()?;
    // A rendering chosen from the word study's list: only the verses where
    // the KJV renders it so, compared as the list counted them.
    Ok(match gloss {
        Some(g) => rows
            .into_iter()
            .filter(|o| o.renderings.iter().any(|r| crate::import::reference::word_study::normalize_gloss(r) == g))
            .collect(),
        None => rows,
    })
}

/// What the morphology search asks: a language, optionally a word, and any
/// subset of parsing fields, over a range of books.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct MorphQuery {
    /// "greek" or "hebrew" (Hebrew includes the Aramaic portions).
    pub language: String,
    /// A Strong's number ("G3056") or a lemma in Greek or Hebrew letters,
    /// with or without accents and points.
    pub word: Option<String>,
    /// Field name -> value, from `morph_field_values`.
    pub fields: HashMap<String, String>,
    pub book_ids: Vec<i64>,
    pub testament: Option<String>,
    pub translation_id: Option<i64>,
    pub limit: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct MorphWordHit {
    pub sort_order: i64,
    pub original_word: String,
    pub description: String,
    pub strongs_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MorphHit {
    pub book_id: i64,
    pub chapter: i64,
    pub verse: i64,
    pub words: Vec<MorphWordHit>,
    pub text: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MorphSearchPage {
    pub hits: Vec<MorphHit>,
    /// Verses matched in all, and words.
    pub verse_total: i64,
    pub word_total: i64,
    /// What was searched for, in words ("aorist imperative, in Ephesians").
    pub description: String,
}

/// The parsing fields the search form offers, as column names in `morph_codes`.
pub const MORPH_FIELDS: &[(&str, &str)] = &[
    ("part_of_speech", "part_of_speech"),
    ("tense", "tense"),
    ("voice", "voice"),
    ("mood", "mood"),
    ("person", "person"),
    ("number", "number"),
    ("gender", "gender"),
    ("case", "gram_case"),
    ("state", "state"),
    ("stem", "stem"),
    ("kind", "kind"),
];

fn languages_for(language: &str) -> Vec<&'static str> {
    if language == "greek" {
        vec!["greek"]
    } else {
        vec!["hebrew", "aramaic"]
    }
}

/// Every value each field takes in one language, for the form's dropdowns.
pub fn morph_field_values(conn: &Connection, language: &str) -> anyhow::Result<BTreeMap<String, Vec<String>>> {
    let langs = languages_for(language);
    let ph = langs.iter().map(|l| format!("'{l}'")).collect::<Vec<_>>().join(",");
    let mut out = BTreeMap::new();
    for (name, col) in MORPH_FIELDS {
        let mut stmt = conn.prepare(&format!(
            "SELECT DISTINCT {col} FROM morph_codes WHERE language IN ({ph}) AND {col} IS NOT NULL ORDER BY {col}"
        ))?;
        let values: Vec<String> = stmt.query_map([], |r| r.get(0))?.collect::<Result<_, _>>()?;
        if !values.is_empty() {
            out.insert(name.to_string(), values);
        }
    }
    Ok(out)
}

/// The Strong's numbers a typed word means: itself if it is one, else every
/// entry and tagged lemma whose bare letters match.
fn resolve_word(conn: &Connection, word: &str, language: &str) -> anyhow::Result<Vec<String>> {
    let w = word.trim();
    let upper = w.to_uppercase();
    if let Some(rest) = upper.strip_prefix('G').or_else(|| upper.strip_prefix('H')) {
        if !rest.is_empty() && rest.chars().all(|c| c.is_ascii_digit()) {
            return Ok(vec![format!("{}{}", &upper[..1], rest.trim_start_matches('0'))]);
        }
    }
    let target = crate::plain::plain_word(w);
    let lang = if language == "greek" { "greek" } else { "hebrew" };
    let mut ids: Vec<String> = Vec::new();
    let mut stmt = conn.prepare("SELECT id, original_word FROM strongs_entries WHERE language = ?1")?;
    let mut rows = stmt.query(params![lang])?;
    while let Some(r) = rows.next()? {
        let original: String = r.get(1)?;
        if crate::plain::plain_word(&original) == target {
            ids.push(r.get(0)?);
        }
    }
    // Greek lemmas in the tagged text are sometimes spelled differently from
    // Strong's headword; match those too.
    if language == "greek" {
        let mut stmt = conn.prepare(
            "SELECT DISTINCT lemma, strongs_id FROM morphology_words WHERE book_id >= 40 AND lemma IS NOT NULL AND strongs_id IS NOT NULL",
        )?;
        let mut rows = stmt.query([])?;
        while let Some(r) = rows.next()? {
            let lemma: String = r.get(0)?;
            let first = lemma.split(',').next().unwrap_or(&lemma);
            if crate::plain::plain_word(first) == target {
                let id: String = r.get(1)?;
                if !ids.contains(&id) {
                    ids.push(id);
                }
            }
        }
    }
    Ok(ids)
}

pub fn morph_search(conn: &Connection, q: &MorphQuery) -> anyhow::Result<MorphSearchPage> {
    let langs = languages_for(&q.language);
    let mut conds: Vec<String> = vec![format!(
        "mc.language IN ({})",
        langs.iter().map(|l| format!("'{l}'")).collect::<Vec<_>>().join(",")
    )];
    let mut params_v: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    let mut described: Vec<String> = Vec::new();
    for (name, col) in MORPH_FIELDS {
        if let Some(v) = q.fields.get(*name).filter(|v| !v.is_empty()) {
            conds.push(format!("mc.{col} = ?"));
            params_v.push(Box::new(v.clone()));
            described.push(v.clone());
        }
    }
    if let Some(word) = q.word.as_deref().filter(|w| !w.trim().is_empty()) {
        let ids = resolve_word(conn, word, &q.language)?;
        if ids.is_empty() {
            return Ok(MorphSearchPage { hits: vec![], verse_total: 0, word_total: 0, description: format!("no word matches “{}”", word.trim()) });
        }
        conds.push(format!("m.strongs_id IN ({})", ids.iter().map(|_| "?").collect::<Vec<_>>().join(",")));
        for id in &ids {
            params_v.push(Box::new(id.clone()));
        }
        described.insert(0, format!("{} ({})", word.trim(), ids.join(", ")));
    }
    if described.is_empty() {
        return Ok(MorphSearchPage { hits: vec![], verse_total: 0, word_total: 0, description: String::new() });
    }
    if !q.book_ids.is_empty() {
        conds.push(format!("m.book_id IN ({})", q.book_ids.iter().map(|b| b.to_string()).collect::<Vec<_>>().join(",")));
        let names: Vec<&str> = q.book_ids.iter().filter_map(|b| crate::refparse::book_name(*b)).collect();
        if names.len() <= 3 {
            described.push(format!("in {}", names.join(", ")));
        }
    }
    if let Some(t) = &q.testament {
        conds.push(if t == "OT" { "m.book_id < 40".into() } else { "m.book_id >= 40".into() });
    }
    // With a word, its Strong's index leads (a few hundred rows); without
    // one, the parsing codes do -- a few hundred codes match the fields, and
    // each is a lookup into the words. CROSS JOIN fixes whichever order.
    let from = if q.word.as_deref().is_some_and(|w| !w.trim().is_empty()) {
        "FROM morphology_words m CROSS JOIN morph_codes mc ON mc.code = m.morph_code"
    } else {
        "FROM morph_codes mc CROSS JOIN morphology_words m ON m.morph_code = mc.code"
    };
    let sql = format!(
        "SELECT m.book_id, m.chapter, m.verse, m.sort_order, m.original_word, mc.description, m.strongs_id
         {from}
         WHERE {}
         ORDER BY m.book_id, m.chapter, m.verse, m.sort_order",
        conds.join(" AND ")
    );
    let refs: Vec<&dyn rusqlite::ToSql> = params_v.iter().map(|b| b.as_ref()).collect();
    let mut stmt = conn.prepare(&sql)?;
    let mut rows = stmt.query(refs.as_slice())?;
    let mut hits: Vec<MorphHit> = Vec::new();
    let mut verse_total = 0i64;
    let mut word_total = 0i64;
    let mut last: Option<(i64, i64, i64)> = None;
    let limit = q.limit.clamp(1, 2000) as usize;
    while let Some(r) = rows.next()? {
        let key: (i64, i64, i64) = (r.get(0)?, r.get(1)?, r.get(2)?);
        word_total += 1;
        if last != Some(key) {
            verse_total += 1;
            last = Some(key);
            if hits.len() < limit {
                hits.push(MorphHit { book_id: key.0, chapter: key.1, verse: key.2, words: vec![], text: None });
            } else {
                continue;
            }
        } else if hits.len() >= limit && hits.last().map(|h| (h.book_id, h.chapter, h.verse)) != Some(key) {
            continue;
        }
        if let Some(h) = hits.last_mut().filter(|h| (h.book_id, h.chapter, h.verse) == key) {
            h.words.push(MorphWordHit {
                sort_order: r.get(3)?,
                original_word: r.get(4)?,
                description: r.get(5)?,
                strongs_id: r.get(6)?,
            });
        }
    }
    if let Some(tid) = q.translation_id {
        let mut vstmt = conn.prepare("SELECT text FROM verses WHERE translation_id = ?1 AND book_id = ?2 AND chapter = ?3 AND verse = ?4")?;
        for h in &mut hits {
            h.text = vstmt
                .query_map(params![tid, h.book_id, h.chapter, h.verse], |r| r.get(0))?
                .next()
                .transpose()?;
        }
    }
    Ok(MorphSearchPage { hits, verse_total, word_total, description: described.join(" ") })
}

/// Against the real content.db, timed:
/// `cargo test --release --lib word_study::real -- --ignored --nocapture`.
#[cfg(test)]
mod real {
    use super::*;

    #[test]
    #[ignore]
    fn logos_and_ephesians_imperatives() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        let dir = std::env::temp_dir().join(format!("sojourner-real-ws-{}", std::process::id()));
        let conn = crate::db::open(&dir, &root.join("content").join("content.db")).unwrap();
        let t = std::time::Instant::now();
        let ws = word_study(&conn, "G3056").unwrap().unwrap();
        println!("G3056: {} occurrences in {} verses, {} renderings, {} forms, {} related, {:?}", ws.occurrences, ws.verses, ws.renderings.len(), ws.forms.len(), ws.related.len(), t.elapsed());
        println!("  renderings: {:?}", ws.renderings.iter().take(6).map(|r| (&r.gloss, r.count)).collect::<Vec<_>>());
        println!("  forms: {:?}", ws.forms.iter().take(4).map(|f| (&f.form, &f.description, f.count)).collect::<Vec<_>>());
        assert!((320..=340).contains(&ws.occurrences));
        let t = std::time::Instant::now();
        let occ = occurrences(&conn, "G3056", Some(1), None).unwrap();
        println!("occurrences: {} {:?}", occ.len(), t.elapsed());
        let mut fields = HashMap::new();
        fields.insert("tense".to_string(), "aorist".to_string());
        fields.insert("mood".to_string(), "imperative".to_string());
        let t = std::time::Instant::now();
        let page = morph_search(&conn, &MorphQuery { language: "greek".into(), fields, book_ids: vec![49], limit: 200, translation_id: Some(1), ..Default::default() }).unwrap();
        println!("aorist imperatives in Ephesians: {} verses, {} words, {:?} -- {}", page.verse_total, page.word_total, t.elapsed(), page.description);
        // 4:31; 5:14 (twice); 6:11, 13, 14, 17 -- Ephesians commands mostly in the present.
        assert_eq!((page.verse_total, page.word_total), (6, 7));
        let t = std::time::Instant::now();
        let heb = morph_search(&conn, &MorphQuery { language: "hebrew".into(), word: Some("חסד".into()), limit: 50, ..Default::default() }).unwrap();
        println!("chesed: {} verses {:?} -- {}", heb.verse_total, t.elapsed(), heb.description);
        let hws = word_study(&conn, "H2617").unwrap().unwrap();
        println!("H2617 related: {:?}", hws.related.iter().map(|r| (&r.id, &r.relation)).collect::<Vec<_>>());
    }
}
