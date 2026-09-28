//! The word study (one Strong's number, studied) and the morphology search
//! (every word with a given parsing).
//!
//! Occurrences are counted in the tagged Greek and Hebrew
//! (`morphology_words`: TAGNT's Textus Receptus and the Westminster
//! Leningrad Codex), not in any English translation: a word study is about
//! the word the writer used, however a translator happened to render it.
//! How the KJV rendered it comes from the interlinear, through
//! `lemma_glosses`.

use crate::import::reference::word_study::description_with_affixes;
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
    /// The code read as the Strong's card and the interlinear read it
    /// (`crate::morph::decode_word`), for the page to show in plain words
    /// with the glossary's explanation of each term; None for a word with
    /// no code. The occurrences list finds each occurrence's parsing here by
    /// its code rather than carrying its own: within one Strong's number a
    /// code always reads the same, and the article's twenty thousand
    /// occurrences would otherwise each carry the same few dozen parsings.
    pub parsing: Option<crate::morph::MorphInfo>,
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

/// A word as the list of forms shows it: the punctuation the tagged texts
/// print after it removed -- a Greek comma or stop, a Hebrew sof pasuq, and
/// the maqaf that joins a Hebrew word to the next (אֶת־ is the form אֶת,
/// joined to its neighbour in one verse and not in another, as θεόν, is
/// θεόν) -- and a Hebrew word's cantillation (its accents, meteg/silluq and
/// paseq), which belong to the word's place in its verse rather than to the
/// form: one form's hundred occurrences carry a dozen different accents. The
/// letters and every vowel point, dagesh, shin and sin dot are kept exactly
/// as the text has them, and so is the Greek elision mark: δ᾽ and ἀλλ᾽ are
/// those words cut short, not δ and ἀλλ.
fn bare_form(word: &str) -> String {
    let own = |c: char| {
        (c.is_alphabetic() || is_mark_char(c) || matches!(c, '\u{1fbd}' | '\u{2019}')) && !matches!(c, '\u{5be}' | '\u{5c0}' | '\u{5c3}')
    };
    word.trim_matches(|c: char| !own(c))
        .chars()
        .filter(|c| !matches!(*c as u32, 0x0591..=0x05AF | 0x05BD | 0x05C0 | 0x05C3) && *c != '/')
        .collect()
}

fn is_mark_char(c: char) -> bool {
    matches!(c as u32, 0x0300..=0x036F | 0x0591..=0x05C7)
}

/// What forms are grouped by. A Hebrew form is its vowelled letters
/// (`bare_form`): two vowellings are two forms, a pausal אָרֶץ beside אֶרֶץ,
/// and neither is shown under the other's points. A Greek form is its bare
/// letters (`plain`), its accents being its place too -- θεόν and θεὸν,
/// before a pause and within a clause, are one form -- and it is shown as
/// most of its occurrences spell it.
fn form_key(form: &str) -> String {
    if form.chars().any(|c| ('א'..='ת').contains(&c)) {
        form.to_string()
    } else {
        crate::plain::plain(form)
    }
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

    // Each group's spellings with their counts, for the one most of its
    // occurrences have.
    let mut spellings: BTreeMap<(String, String), BTreeMap<String, i64>> = BTreeMap::new();
    {
        let mut stmt = conn.prepare("SELECT original_word, COALESCE(morph_code, '') FROM morphology_words WHERE strongs_id = ?1")?;
        let mut rows = stmt.query(params![strongs_id])?;
        while let Some(r) = rows.next()? {
            let word: String = r.get(0)?;
            let code: String = r.get(1)?;
            let form = bare_form(&word);
            *spellings.entry((form_key(&form), code)).or_default().entry(form).or_insert(0) += 1;
        }
    }
    let forms: BTreeMap<(String, String), (String, i64)> = spellings
        .into_iter()
        .map(|(key, spelt)| {
            let total = spelt.values().sum();
            // The most common spelling; of two as common, the first in order.
            let form = spelt.iter().max_by(|a, b| a.1.cmp(b.1).then(b.0.cmp(a.0))).map(|(f, _)| f.clone()).unwrap_or_default();
            (key, (form, total))
        })
        .collect();
    let descriptions: HashMap<String, String> = conn
        .prepare("SELECT code, description FROM morph_codes")?
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<Result<_, _>>()?;
    let mut forms: Vec<WordForm> = forms
        .into_iter()
        .map(|((_, code), (form, count))| WordForm {
            description: word_description(descriptions.get(&code).cloned(), &code, Some(strongs_id)).unwrap_or_default(),
            parsing: form_parsing(&code, strongs_id),
            form,
            morph_code: code,
            count,
        })
        .collect();
    forms.sort_by(|a, b| b.count.cmp(&a.count).then(a.form.cmp(&b.form)));

    let related = related_words(conn, &entry)?;
    Ok(Some(WordStudy { entry, occurrences, verses, renderings, by_book, forms, related }))
}

/// A word's parsing in words: what `morph_codes` keeps for its code, or,
/// for a word `crate::morph` reads otherwise than its code says (TAHOT
/// codes מְאֹד, "very", and בֵּין, "between", as numbers: see `RETAGGED`
/// there), that word's own reading, which no table keyed by the code can
/// hold.
fn word_description(stored: Option<String>, code: &str, strongs_id: Option<&str>) -> Option<String> {
    match strongs_id {
        Some(id) if crate::morph::may_be_retagged(id) && !code.trim().is_empty() => {
            Some(description_with_affixes(&crate::morph::decode_word(code, Some(id))))
        }
        _ => stored,
    }
}

/// A form's parsing, decoded as `get_morphology_for_chapter` decodes a
/// verse's words: with the Strong's number, which tells מְאֹד, "very", from
/// the number TAHOT codes it as. A form with no code (TAHOT's few empty
/// rows) has nothing to parse.
fn form_parsing(code: &str, strongs_id: &str) -> Option<crate::morph::MorphInfo> {
    (!code.trim().is_empty()).then(|| crate::morph::decode_word(code, Some(strongs_id)))
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
        let morph_code: Option<String> = r.get(4)?;
        Ok(Occurrence {
            book_id: r.get(0)?,
            chapter: r.get(1)?,
            verse: r.get(2)?,
            original_word: r.get(3)?,
            description: word_description(r.get(5)?, morph_code.as_deref().unwrap_or(""), Some(strongs_id)),
            morph_code,
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
    /// Field name -> value, from `morph_field_values` (or a value an older
    /// decoder gave, which `asked_fields` reads as this one would).
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

/// The parsing fields the search form offers, as column names in
/// `morph_codes`, in the order `crate::morph` describes a word, so that a
/// search is described as a parsing reads: "qal perfect", not "perfect qal".
pub const MORPH_FIELDS: &[(&str, &str)] = &[
    ("part_of_speech", "part_of_speech"),
    ("kind", "kind"),
    ("stem", "stem"),
    ("tense", "tense"),
    ("voice", "voice"),
    ("mood", "mood"),
    ("person", "person"),
    ("case", "gram_case"),
    ("gender", "gender"),
    ("number", "number"),
    ("state", "state"),
];

/// Values an older `crate::morph` gave that the decoder no longer does, and
/// what each is now: (field, older value, [(field, value now)]). A search
/// holding one -- asked by an older build's form, or kept wherever a search
/// is kept -- finds the words it always found rather than nothing. Several
/// values now for one field mean any of them.
///
/// Only names that went away are here, never one the decoder still gives. A
/// value whose meaning narrowed under the same name is left alone, because a
/// search for it cannot say which meaning it wants: Greek "middle",
/// "passive" and "middle or passive" no longer take in the deponents, which
/// have values of their own, and a search for "middle" now finds the middle.
/// So is a Hebrew "proper name". The older decoder called every proper noun
/// that; the decoder now calls it the person, place or title (יְהוָה) it
/// names, and keeps "proper name" for one whose code says none of them. That
/// is a value it gives, and the form offers it wherever a word has it, so a
/// search for it asks for that word and not every name in the Bible. (No
/// word in TAHOT is one today, and no grammar search is kept anywhere that
/// could hold the older meaning.)
const OLDER_VALUES: &[(&str, &str, &[(&str, &str)])] = &[
    // OSHB's `b`, a noun found as either gender, was "both" beside `c`'s
    // "common"; they are one gender, the common.
    ("gender", "both", &[("gender", "common")]),
    // The jussive and cohortative were conjugations of their own. They are
    // the imperfect used to wish or resolve, and say so in the mood.
    ("tense", "jussive", &[("tense", "imperfect"), ("mood", "jussive")]),
    ("tense", "cohortative", &[("tense", "imperfect"), ("mood", "cohortative")]),
    // STEPBible's bare `HEB` and `ARAM` were given the kind "Hebrew" and
    // "Aramaic"; the kind now also reaches the words tagged `-HEB` and
    // `-ARAM`, ἀμήν among them.
    ("kind", "hebrew", &[("kind", "transliterated from hebrew")]),
    ("kind", "aramaic", &[("kind", "transliterated from aramaic")]),
];

/// What each field of a search asks for, as (field, column, values), any of
/// the values to do, in `MORPH_FIELDS` order: the fields the search names,
/// empty ones left out, with an older value read as `OLDER_VALUES` says. An
/// older value can ask something of another field too -- "tense: jussive"
/// is the imperfect with the jussive mood -- and that is asked alongside
/// whatever the search names for that field, as the older tense was: a
/// jussive the search also wanted indicative found nothing then, and does
/// now.
fn asked_fields(fields: &HashMap<String, String>) -> Vec<(&'static str, &'static str, Vec<String>)> {
    let column = |field: &str| MORPH_FIELDS.iter().find(|(name, _)| *name == field).copied();
    let mut asked: Vec<(&'static str, &'static str, Vec<String>)> = Vec::new();
    for (name, col) in MORPH_FIELDS {
        let Some(value) = fields.get(*name).map(|v| v.trim()).filter(|v| !v.is_empty()) else {
            continue;
        };
        let older = OLDER_VALUES.iter().find(|(field, old, _)| field == name && old.eq_ignore_ascii_case(value));
        let Some((_, _, now)) = older else {
            asked.push((*name, *col, vec![value.to_string()]));
            continue;
        };
        let start = asked.len();
        for (field, v) in now.iter() {
            let Some((field, col)) = column(field) else { continue };
            match asked[start..].iter_mut().find(|(f, _, _)| *f == field) {
                Some((_, _, values)) => values.push(v.to_string()),
                None => asked.push((field, col, vec![v.to_string()])),
            }
        }
    }
    let position = |field: &str| MORPH_FIELDS.iter().position(|(name, _)| *name == field);
    asked.sort_by_key(|(field, _, _)| position(field));
    asked.dedup();
    asked
}

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
    // And what the words the codes misname are read as: יֵשׁ, "there is", is
    // the only particle of existence, and no code says so.
    for word in retagged_words(conn, language)? {
        for (name, _) in MORPH_FIELDS {
            if let Some(value) = field_value(&word.as_read, name) {
                let values = out.entry(name.to_string()).or_default();
                if !values.iter().any(|v| v == value) {
                    values.push(value.to_string());
                    values.sort();
                }
            }
        }
    }
    Ok(out)
}

/// One field of a parsing, by the name `MORPH_FIELDS` gives it.
fn field_value<'a>(info: &'a crate::morph::MorphInfo, field: &str) -> Option<&'a str> {
    match field {
        "part_of_speech" => info.part_of_speech.as_deref(),
        "kind" => info.kind.as_deref(),
        "stem" => info.stem.as_deref(),
        "tense" => info.tense.as_deref(),
        "voice" => info.voice.as_deref(),
        "mood" => info.mood.as_deref(),
        "person" => info.person.as_deref(),
        "case" => info.case.as_deref(),
        "gender" => info.gender.as_deref(),
        "number" => info.number.as_deref(),
        "state" => info.state.as_deref(),
        _ => None,
    }
}

/// Whether a parsing has everything a search asks, as the SQL asks it of
/// `morph_codes`.
fn answers(info: &crate::morph::MorphInfo, asked: &[(&'static str, &'static str, Vec<String>)]) -> bool {
    asked.iter().all(|(field, _, values)| field_value(info, field).is_some_and(|v| values.iter().any(|asked| asked == v)))
}

/// A word `crate::morph::decode_word` reads otherwise than its code, with
/// both readings: TAHOT codes מְאֹד, "very", as a number, and כִּי, "for,
/// that", as a conditional (see `RETAGGED` there).
struct Retagged {
    code: String,
    strongs_id: String,
    as_coded: crate::morph::MorphInfo,
    as_read: crate::morph::MorphInfo,
}

/// Every (code, Strong's number) in one language's text that is read
/// otherwise than its code: a few hundred, found through the Strong's index.
fn retagged_words(conn: &Connection, language: &str) -> anyhow::Result<Vec<Retagged>> {
    let langs = languages_for(language);
    let ids = crate::morph::retagged_strongs_ids();
    let sql = format!(
        "SELECT DISTINCT morph_code, strongs_id FROM morphology_words WHERE strongs_id IN ({}) AND morph_code IS NOT NULL",
        ids.iter().map(|_| "?").collect::<Vec<_>>().join(",")
    );
    let pairs: Vec<(String, String)> =
        conn.prepare(&sql)?.query_map(rusqlite::params_from_iter(ids.iter()), |r| Ok((r.get(0)?, r.get(1)?)))?.collect::<Result<_, _>>()?;
    Ok(pairs
        .into_iter()
        .filter_map(|(code, strongs_id)| {
            let as_coded = crate::morph::decode(&code);
            let as_read = crate::morph::decode_word(&code, Some(&strongs_id));
            (langs.contains(&as_coded.language.as_str()) && as_read != as_coded).then_some(Retagged { code, strongs_id, as_coded, as_read })
        })
        .collect())
}

/// Kinds that are no word on their own, as a search names them, with the
/// part of speech that phrase already says: "common" alone read as the
/// gender, and "existence in Genesis" as a subject of the book.
const KIND_PHRASES: &[(&str, &str, &str)] = &[("common", "common noun", "noun"), ("existence", "particle of existence", "particle")];

/// What a search asks, in the words a parsing is read in (`describe()` in
/// `crate::morph`): what the word is, then the verb's form, then the
/// endings -- "noun, personal name", "qal perfect", "3rd person masculine
/// singular". A few values show what they are where the bare value does
/// not: the kind "common" is a common noun (`KIND_PHRASES`), and the gender
/// "common" says it is a gender unless a person comes before it ("1st
/// person common singular"), so that a search for both reads "common noun,
/// common gender" and not "common common".
fn describe_asked(asked: &[(&'static str, &'static str, Vec<String>)]) -> Option<String> {
    let values = |field: &str| asked.iter().find(|(f, _, _)| *f == field).map(|(_, _, v)| v);
    let kind_phrase = |kind: &str| KIND_PHRASES.iter().find(|(k, _, _)| *k == kind);
    let phrase = |field: &str| -> Option<String> {
        let vs = values(field)?;
        // "Noun" beside "common noun" says nothing more.
        let said_by_kind =
            |pos: &String| values("kind").is_some_and(|kinds| kinds.iter().all(|k| kind_phrase(k).is_some_and(|(_, _, p)| p == pos)));
        if field == "part_of_speech" && vs.iter().all(said_by_kind) {
            return None;
        }
        let said: Vec<String> = vs
            .iter()
            .map(|v| match (field, v.as_str()) {
                ("kind", k) => kind_phrase(k).map_or_else(|| v.clone(), |(_, phrase, _)| phrase.to_string()),
                ("gender", "common") if values("person").is_none() => format!("{v} gender"),
                ("person", _) => format!("{v} person"),
                _ => v.clone(),
            })
            .collect();
        Some(said.join(" or "))
    };
    let group = |fields: &[&str], joiner: &str| {
        let parts: Vec<String> = fields.iter().filter_map(|f| phrase(f)).collect();
        (!parts.is_empty()).then(|| parts.join(joiner))
    };
    let groups: Vec<String> = [
        group(&["part_of_speech", "kind"], ", "),
        group(&["stem", "tense", "voice", "mood"], " "),
        group(&["person", "case", "gender", "number", "state"], " "),
    ]
    .into_iter()
    .flatten()
    .collect();
    (!groups.is_empty()).then(|| groups.join(", "))
}

/// A typed word that is a Strong's number, as the text writes it: "h04616"
/// is "H4616".
fn typed_strongs_number(word: &str) -> Option<String> {
    let upper = word.trim().to_uppercase();
    let rest = upper.strip_prefix('G').or_else(|| upper.strip_prefix('H'))?;
    (!rest.is_empty() && rest.chars().all(|c| c.is_ascii_digit())).then(|| format!("{}{}", &upper[..1], rest.trim_start_matches('0')))
}

/// The word a search asks for, as its description names it: the typed word
/// and the numbers it means, "חסד (H2617)". A Strong's number typed as the
/// word is named by its headword instead, "מען (H4616)", where the typed
/// text before its own number read "H4616 (H4616)"; with no entry to name
/// it, the number stands once.
fn word_named(conn: &Connection, word: &str, ids: &[String]) -> String {
    match typed_strongs_number(word) {
        Some(id) => {
            let headword: Option<String> =
                conn.query_row("SELECT original_word FROM strongs_entries WHERE id = ?1", params![id], |r| r.get(0)).ok().filter(|h: &String| !h.trim().is_empty());
            headword.map_or_else(|| id.clone(), |h| format!("{} ({id})", h.trim()))
        }
        None => format!("{} ({})", word.trim(), ids.join(", ")),
    }
}

/// The Strong's numbers a typed word means: itself if it is one, else every
/// entry and tagged lemma whose bare letters match.
fn resolve_word(conn: &Connection, word: &str, language: &str) -> anyhow::Result<Vec<String>> {
    let w = word.trim();
    if let Some(id) = typed_strongs_number(w) {
        return Ok(vec![id]);
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
    let asked = asked_fields(&q.fields);
    // The words the codes misname are read by their Strong's number, which
    // `morph_codes` cannot key: every (code, number) whose reading differs.
    let retagged = retagged_words(conn, &q.language)?;
    if !asked.is_empty() {
        let fields_sql =
            asked.iter().map(|(_, col, values)| format!("mc.{col} IN ({})", values.iter().map(|_| "?").collect::<Vec<_>>().join(","))).collect::<Vec<_>>().join(" AND ");
        let field_params: Vec<String> = asked.iter().flat_map(|(_, _, values)| values.iter().cloned()).collect();
        // A word its code finds that is not what the search asks (מְאֹד, for
        // "cardinal number"), and one it asks that its code does not find
        // (מְאֹד again, for "adverb").
        let (mut dropped, mut added): (Vec<&Retagged>, Vec<&Retagged>) = (Vec::new(), Vec::new());
        for word in &retagged {
            match (answers(&word.as_coded, &asked), answers(&word.as_read, &asked)) {
                (true, false) => dropped.push(word),
                (false, true) => added.push(word),
                _ => {}
            }
        }
        let pairs = |n: usize| std::iter::repeat("(?,?)").take(n).collect::<Vec<_>>().join(",");
        let push_pairs = |params_v: &mut Vec<Box<dyn rusqlite::ToSql>>, words: &[&Retagged]| {
            for w in words {
                params_v.push(Box::new(w.code.clone()));
                params_v.push(Box::new(w.strongs_id.clone()));
            }
        };
        if dropped.is_empty() && added.is_empty() {
            conds.push(fields_sql);
            params_v.extend(field_params.into_iter().map(|v| Box::new(v) as Box<dyn rusqlite::ToSql>));
        } else {
            // The codes first, on their own, so that they can still lead the
            // search: those the fields ask for and those an added word has.
            let mut codes_sql = fields_sql.clone();
            params_v.extend(field_params.iter().cloned().map(|v| Box::new(v) as Box<dyn rusqlite::ToSql>));
            if !added.is_empty() {
                codes_sql = format!("({codes_sql}) OR mc.code IN ({})", added.iter().map(|_| "?").collect::<Vec<_>>().join(","));
                params_v.extend(added.iter().map(|w| Box::new(w.code.clone()) as Box<dyn rusqlite::ToSql>));
            }
            conds.push(format!("({codes_sql})"));
            // Then the words.
            let mut words_sql = fields_sql;
            params_v.extend(field_params.into_iter().map(|v| Box::new(v) as Box<dyn rusqlite::ToSql>));
            if !dropped.is_empty() {
                words_sql = format!("({words_sql}) AND (m.morph_code, COALESCE(m.strongs_id, '')) NOT IN (VALUES {})", pairs(dropped.len()));
                push_pairs(&mut params_v, &dropped);
            }
            if !added.is_empty() {
                words_sql = format!("({words_sql}) OR (m.morph_code, COALESCE(m.strongs_id, '')) IN (VALUES {})", pairs(added.len()));
                push_pairs(&mut params_v, &added);
            }
            conds.push(format!("({words_sql})"));
        }
        described.extend(describe_asked(&asked));
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
        described.insert(0, word_named(conn, word, &ids));
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
        "SELECT m.book_id, m.chapter, m.verse, m.sort_order, m.original_word, mc.description, m.strongs_id, m.morph_code
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
            let strongs_id: Option<String> = r.get(6)?;
            let code: String = r.get(7)?;
            let read_otherwise = retagged.iter().find(|w| w.code == code && Some(&w.strongs_id) == strongs_id.as_ref());
            h.words.push(MorphWordHit {
                sort_order: r.get(3)?,
                original_word: r.get(4)?,
                description: match read_otherwise {
                    Some(w) => description_with_affixes(&w.as_read),
                    None => r.get(5)?,
                },
                strongs_id,
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

#[cfg(test)]
mod tests {
    use super::*;

    fn fields(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
    }

    fn asked(pairs: &[(&str, &str)]) -> Vec<(&'static str, Vec<String>)> {
        asked_fields(&fields(pairs)).into_iter().map(|(field, _, values)| (field, values)).collect()
    }

    fn one(field: &'static str, value: &str) -> (&'static str, Vec<String>) {
        (field, vec![value.to_string()])
    }

    #[test]
    fn todays_values_are_asked_as_they_are_in_field_order() {
        assert_eq!(asked(&[("mood", "imperative"), ("tense", "aorist"), ("voice", "")]), vec![one("tense", "aorist"), one("mood", "imperative")]);
        // Each field's column: the case is `gram_case`.
        assert_eq!(asked_fields(&fields(&[("case", "genitive")]))[0].1, "gram_case");
        // A narrowed meaning keeps its name: "middle" is the middle now.
        assert_eq!(asked(&[("voice", "middle")]), vec![one("voice", "middle")]);
        assert_eq!(asked(&[("gender", "common")]), vec![one("gender", "common")]);
    }

    #[test]
    fn an_older_decoders_values_are_read_as_todays() {
        assert_eq!(asked(&[("gender", "both")]), vec![one("gender", "common")]);
        // The jussive was a tense; it is the imperfect, with the wish in its mood.
        assert_eq!(asked(&[("tense", "jussive"), ("stem", "qal")]), vec![one("stem", "qal"), one("tense", "imperfect"), one("mood", "jussive")]);
        assert_eq!(asked(&[("tense", "cohortative")]), vec![one("tense", "imperfect"), one("mood", "cohortative")]);
        // Asked for the mood as well, it is asked once.
        assert_eq!(asked(&[("tense", "jussive"), ("mood", "jussive")]), vec![one("tense", "imperfect"), one("mood", "jussive")]);
        // A different mood is asked too, and finds nothing, as it did.
        assert_eq!(asked(&[("tense", "jussive"), ("mood", "indicative")]), vec![one("tense", "imperfect"), one("mood", "jussive"), one("mood", "indicative")]);
        // The older kinds were capitalised.
        assert_eq!(asked(&[("kind", "Aramaic")]), vec![one("kind", "transliterated from aramaic")]);
        assert_eq!(asked(&[("kind", "Hebrew")]), vec![one("kind", "transliterated from hebrew")]);
        // A value the decoder still gives is asked as it is, even one an
        // older decoder gave a wider meaning.
        assert_eq!(asked(&[("kind", "proper name")]), vec![one("kind", "proper name")]);
    }

    #[test]
    fn every_older_value_is_read_into_fields_the_search_has() {
        for (older_field, old, now) in OLDER_VALUES {
            assert!(MORPH_FIELDS.iter().any(|(name, _)| name == older_field), "{older_field}");
            assert_eq!(old.to_lowercase(), *old, "matched without regard to case, so written in lower case");
            assert!(now.iter().any(|(field, _)| field == older_field), "{old} asks nothing of its own field");
            for (field, _) in now.iter() {
                assert!(MORPH_FIELDS.iter().any(|(name, _)| name == field), "{old}: {field}");
            }
        }
    }

    #[test]
    fn no_older_value_is_one_the_decoder_still_gives() {
        // The glossary has an entry for every value `crate::morph` can give a
        // field (morph.rs's `every_code_in_the_reference_files...` holds the
        // two together), so an older value it explains is not older at all:
        // read as something else, a search for it would find what it did
        // not ask for.
        let glossary: serde_json::Value =
            serde_json::from_str(include_str!("../../../../src/features/lexicon/parsingGlossary.json")).unwrap();
        let explained = |key: &str| {
            ["terms", "hebrew_and_aramaic"].iter().any(|block| glossary[block].as_object().is_some_and(|terms| terms.contains_key(key)))
        };
        assert!(explained("gender:common") && explained("kind:proper name"), "the glossary is read as it is keyed");
        for (field, old, _) in OLDER_VALUES {
            assert!(!explained(&format!("{field}:{old}")), "{field}: {old} is a value the decoder gives");
        }
        // Nor the value any older value is read as, in a field of its own.
        for (field, old, now) in OLDER_VALUES {
            for (now_field, value) in now.iter() {
                assert!(explained(&format!("{now_field}:{value}")), "{field}: {old} is read as {now_field}: {value}, which the decoder never gives");
            }
        }
    }

    /// Seven words of Genesis, their codes decoded as the import decodes
    /// them: two verbs and a noun; a number; two words TAHOT codes as what
    /// they are not (מְאֹד, "very", as a number, and כִּי, "that", as a
    /// conditional); and אִם, "if", which is a conditional.
    fn genesis() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE morphology_words (id INTEGER PRIMARY KEY, book_id INTEGER NOT NULL, chapter INTEGER NOT NULL,
               verse INTEGER NOT NULL, sort_order INTEGER NOT NULL, original_word TEXT NOT NULL, lemma TEXT, morph_code TEXT,
               strongs_id TEXT);
             INSERT INTO morphology_words (book_id, chapter, verse, sort_order, original_word, morph_code, strongs_id) VALUES
               (1, 1, 1, 2, 'בָּרָא', 'HVqp3ms', 'H1254'),
               (1, 1, 1, 7, 'הָאָֽרֶץ', 'HTd/Ncbsa', 'H776'),
               (1, 1, 3, 2, 'יְהִי', 'HVqj3ms', 'H1961'),
               (1, 1, 4, 5, 'כִּי', 'HTc', 'H3588'),
               (1, 1, 5, 12, 'אֶחָד', 'HAcmsa', 'H259'),
               (1, 1, 31, 9, 'מְאֹד', 'HAcmsa', 'H3966'),
               (1, 4, 7, 2, 'אִם', 'HTc', 'H518');",
        )
        .unwrap();
        conn.execute_batch(crate::db::schema::CONTENT_MIGRATION_0021).unwrap();
        crate::import::reference::word_study::import_morph_codes(&mut conn).unwrap();
        conn
    }

    fn search(conn: &Connection, pairs: &[(&str, &str)]) -> MorphSearchPage {
        morph_search(conn, &MorphQuery { language: "hebrew".into(), fields: fields(pairs), limit: 50, ..Default::default() }).unwrap()
    }

    #[test]
    fn an_older_search_finds_what_it_found() {
        let conn = genesis();
        // אֶרֶץ's gender, "both" to the older decoder.
        let land = search(&conn, &[("gender", "both")]);
        assert_eq!((land.word_total, land.description.as_str()), (1, "common gender"));
        assert_eq!(land.hits[0].words[0].original_word, "הָאָֽרֶץ");
        assert_eq!(search(&conn, &[("gender", "common")]).word_total, 1);
        // "Let there be light": a jussive, found by the tense it was and by
        // the mood it is.
        let older = search(&conn, &[("tense", "jussive")]);
        assert_eq!((older.word_total, older.hits[0].verse, older.description.as_str()), (1, 3, "imperfect jussive"));
        assert_eq!(search(&conn, &[("mood", "jussive")]).word_total, 1);
        assert_eq!(search(&conn, &[("tense", "jussive"), ("mood", "indicative")]).word_total, 0);
        let qal_perfect = search(&conn, &[("stem", "qal"), ("tense", "perfect")]);
        assert_eq!((qal_perfect.word_total, qal_perfect.description.as_str()), (1, "qal perfect"));
    }

    #[test]
    fn a_word_its_code_misnames_is_found_as_what_it_is() {
        let conn = genesis();
        // "Cardinal number" finds the one of Gen 1:5, not 1:31's "very".
        let numbers = search(&conn, &[("kind", "cardinal number")]);
        assert_eq!((numbers.word_total, numbers.hits[0].verse), (1, 5));
        // "Very" is found as the adverb it is, though no code says so, and
        // is described so.
        let adverbs = search(&conn, &[("part_of_speech", "adverb")]);
        assert_eq!((adverbs.word_total, adverbs.hits[0].verse), (1, 31));
        assert_eq!(adverbs.hits[0].words[0].description, "adverb");
        // It has no gender any more; the number is still masculine.
        let masculine = search(&conn, &[("gender", "masculine"), ("part_of_speech", "adjective")]);
        assert_eq!((masculine.word_total, masculine.hits[0].verse), (1, 5));
        // כִּי is a conjunction, and אִם, "if", the only conditional.
        let conditional = search(&conn, &[("kind", "conditional")]);
        assert_eq!((conditional.word_total, conditional.hits[0].chapter), (1, 4));
        let conjunctions = search(&conn, &[("part_of_speech", "conjunction")]);
        assert_eq!((conjunctions.word_total, conjunctions.hits[0].verse), (1, 4));
        // Asked for by the word, it is described as what it is.
        let very = morph_search(&conn, &MorphQuery { language: "hebrew".into(), word: Some("H3966".into()), limit: 50, ..Default::default() }).unwrap();
        assert_eq!((very.word_total, very.hits[0].words[0].description.as_str()), (1, "adverb"));
        // With no Strong's entry to name it, the number is said once.
        assert_eq!(very.description, "H3966");
        // The form offers what they are read as, which no code gives here.
        let values = morph_field_values(&conn, "hebrew").unwrap();
        for pos in ["adverb", "conjunction"] {
            assert!(values["part_of_speech"].contains(&pos.to_string()), "{pos}");
        }
        // And the Greek search is none of this.
        assert!(retagged_words(&conn, "greek").unwrap().is_empty());
    }

    #[test]
    fn a_strongs_number_asked_for_is_named_by_its_headword_not_repeated() {
        let conn = genesis();
        conn.execute_batch(
            "CREATE TABLE strongs_entries (id TEXT PRIMARY KEY, language TEXT, original_word TEXT);
             INSERT INTO strongs_entries VALUES ('H3966', 'hebrew', 'מאד');",
        )
        .unwrap();
        let ask = |word: &str| {
            morph_search(&conn, &MorphQuery { language: "hebrew".into(), word: Some(word.into()), limit: 50, ..Default::default() }).unwrap().description
        };
        assert_eq!(ask("H3966"), "מאד (H3966)");
        assert_eq!(ask(" h03966 "), "מאד (H3966)");
        // A word typed in letters keeps what was typed, with its numbers.
        assert_eq!(ask("מְאֹד"), "מְאֹד (H3966)");
        assert_eq!(typed_strongs_number("G0026"), Some("G26".to_string()));
        assert_eq!(typed_strongs_number("Gad"), None);
    }

    #[test]
    fn a_form_keeps_its_letters_and_points_and_is_grouped_by_them() {
        // Hebrew: the cantillation goes (tipha, silluq, sof pasuq, paseq);
        // every vowel, dagesh and shin dot stays. The maqaf after a word
        // joins it to the next and is the verse's, not the form's; a maqaf
        // inside one (Chedorlaomer) is its own.
        assert_eq!(bare_form("הַשָּׁמַ֖יִם"), "הַשָּׁמַיִם");
        assert_eq!(bare_form("הָאָֽרֶץ׃"), "הָאָרֶץ");
        assert_eq!(bare_form("עַל־"), "עַל");
        assert_eq!(bare_form("אֱלֹהִ֤ים׀"), "אֱלֹהִים");
        assert_eq!(bare_form("כְּדָרְ־לָעֹ֔מֶר"), "כְּדָרְ־לָעֹמֶר");
        // The Greek elision mark is the word's.
        assert_eq!(bare_form("δ᾽"), "δ᾽");
        assert_eq!(bare_form("ἀλλ᾽"), "ἀλλ᾽");
        // Two vowellings are two forms; two accents on one are one.
        assert_ne!(form_key(&bare_form("אֶ֫רֶץ")), form_key(&bare_form("אָ֫רֶץ")));
        assert_eq!(form_key(&bare_form("אֶ֥רֶץ")), form_key(&bare_form("אֶ֫רֶץ")));
        // Greek: its accents and breathings stay on the form shown, and an
        // acute and a grave are one form.
        assert_eq!(bare_form("θεὸν,"), "θεὸν");
        assert_eq!(bare_form("τῇ"), "τῇ");
        assert_eq!(form_key("θεὸν"), form_key("θεόν"));
    }

    #[test]
    fn a_forms_parsing_is_the_words_own_reading() {
        let created = form_parsing("HVqp3ms", "H1254").unwrap();
        assert_eq!((created.stem.as_deref(), created.tense.as_deref()), (Some("qal"), Some("perfect")));
        // מְאֹד is read as the adverb it is, not the number its code names.
        assert_eq!(form_parsing("HAcmsa", "H3966").unwrap().part_of_speech.as_deref(), Some("adverb"));
        assert_eq!(form_parsing("HAcmsa", "H259").unwrap().part_of_speech.as_deref(), Some("adjective"));
        let love = form_parsing("N-NSF", "G26").unwrap();
        assert_eq!((love.case.as_deref(), love.gender.as_deref()), (Some("nominative"), Some("feminine")));
        assert_eq!(form_parsing("", "H1254"), None);
        assert_eq!(form_parsing("  ", "H1254"), None);
    }

    #[test]
    fn a_search_is_described_as_a_parsing_reads() {
        let d = |pairs: &[(&str, &str)]| describe_asked(&asked_fields(&fields(pairs))).unwrap();
        assert_eq!(d(&[("gender", "common")]), "common gender");
        assert_eq!(d(&[("kind", "common"), ("gender", "common")]), "common noun, common gender");
        assert_eq!(d(&[("part_of_speech", "noun"), ("kind", "common")]), "common noun");
        assert_eq!(d(&[("part_of_speech", "noun"), ("kind", "personal name")]), "noun, personal name");
        assert_eq!(d(&[("mood", "imperative"), ("tense", "aorist")]), "aorist imperative");
        assert_eq!(
            d(&[("stem", "qal"), ("tense", "perfect"), ("person", "3rd"), ("gender", "common"), ("number", "plural")]),
            "qal perfect, 3rd person common plural"
        );
        assert_eq!(d(&[("case", "genitive"), ("part_of_speech", "noun")]), "noun, genitive");
        // A kind that is no word on its own.
        assert_eq!(d(&[("kind", "existence")]), "particle of existence");
        assert_eq!(d(&[("part_of_speech", "particle"), ("kind", "existence")]), "particle of existence");
        assert_eq!(d(&[("part_of_speech", "particle"), ("kind", "negative")]), "particle, negative");
        assert_eq!(describe_asked(&[]), None);
    }
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

    /// The Hebrew fields as the decoder reads them now, and an older
    /// search's values read into them: `cargo test --release --lib
    /// word_study::real::hebrew -- --ignored --nocapture`, after
    /// build_content_db has decoded the codes again.
    #[test]
    #[ignore]
    fn hebrew_fields_and_older_values() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        let dir = std::env::temp_dir().join(format!("sojourner-real-ws-heb-{}", std::process::id()));
        let conn = crate::db::open(&dir, &root.join("content").join("content.db")).unwrap();
        let values = morph_field_values(&conn, "hebrew").unwrap();
        println!("hebrew fields: {values:?}");
        assert!(!values["gender"].contains(&"both".to_string()));
        assert!(!values["tense"].iter().any(|t| t == "jussive" || t == "cohortative"));
        for mood in ["jussive", "cohortative"] {
            assert!(values["mood"].contains(&mood.to_string()), "{mood}");
        }
        for kind in ["personal name", "place name", "title"] {
            assert!(values["kind"].contains(&kind.to_string()), "{kind}");
        }
        assert!(values["tense"].contains(&"conjunctive imperfect".to_string()));
        let search = |pairs: &[(&str, &str)], book_ids: Vec<i64>| {
            let fields = pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect();
            morph_search(&conn, &MorphQuery { language: "hebrew".into(), fields, book_ids, limit: 2000, ..Default::default() }).unwrap()
        };
        // Genesis 1's qal perfects: בָּרָא (1:1), הָיְתָה (1:2) and the rest.
        let created = search(&[("stem", "qal"), ("tense", "perfect")], vec![1]);
        println!("qal perfect in Genesis: {} verses, {} words -- {}", created.verse_total, created.word_total, created.description);
        assert_eq!((created.hits[0].chapter, created.hits[0].verse), (1, 1));
        // An older search asks what it asked, in the words used now.
        let (both, common) = (search(&[("gender", "both")], vec![]), search(&[("gender", "common")], vec![]));
        assert_eq!((both.word_total, both.description.as_str()), (common.word_total, "common gender"));
        let (older, now) = (search(&[("tense", "jussive")], vec![]), search(&[("tense", "imperfect"), ("mood", "jussive")], vec![]));
        println!("jussives: {} words; common gender: {} words", now.word_total, common.word_total);
        assert!(now.word_total > 0);
        assert_eq!(older.word_total, now.word_total);
        // "Proper name" is asked as the decoder gives it: only a proper noun
        // whose code names no person, place or title, which TAHOT has none of.
        // Only numbers are found as numbers: מְאֹד, "very", עוֹד, "still",
        // בֵּין, "between" and the rest are coded as numbers, and read as what
        // they are.
        let numbers = search(&[("part_of_speech", "adjective"), ("kind", "cardinal number")], vec![]);
        let adverbs = search(&[("part_of_speech", "adverb")], vec![]);
        println!("cardinal numbers: {} words; adverbs: {} words", numbers.word_total, adverbs.word_total);
        let misnamed = ["H3966", "H5750", "H996", "H310", "H3426", "H3588"];
        assert!(numbers.hits.iter().flat_map(|h| &h.words).all(|w| !misnamed.contains(&w.strongs_id.as_deref().unwrap_or(""))));
        // 6,310 words coded as numbers, of which 3,733 are.
        assert_eq!(numbers.word_total, 3733);
        let very = search(&[("part_of_speech", "adverb")], vec![1]);
        assert!(very.hits.iter().any(|h| h.chapter == 1 && h.verse == 31 && h.words.iter().any(|w| w.description == "adverb")));
        let (names, personal) = (search(&[("kind", "proper name")], vec![]), search(&[("kind", "personal name")], vec![]));
        println!("proper names: {} words; personal names: {} words", names.word_total, personal.word_total);
        assert_eq!(names.word_total, 0);
        assert!(personal.word_total > 0);
    }
}
