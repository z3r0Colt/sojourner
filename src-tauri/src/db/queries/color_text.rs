//! Color text for a chapter of any translation, and the verses a colored
//! word appears in -- see `crate::color_text`.
use crate::color_text::{self as ct, Lexicon, Span};
use crate::db::queries::verses;
use crate::models::{ColorSpan, ColorTermVerse};
use rusqlite::{params, Connection};
use std::collections::HashMap;

/// Every word list, for `chapter_colors`. Read once and kept: content.db's
/// lists never change while the app runs.
pub fn load_lexicon(conn: &Connection) -> anyhow::Result<Lexicon> {
    let mut lexicon = Lexicon::default();
    let mut stmt = conn.prepare("SELECT lang, form, code, term FROM color_lexicon")?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?)))?;
    for row in rows {
        let (lang, form, code, term) = row?;
        lexicon.insert(&lang, &form, &code, &term);
    }
    Ok(lexicon)
}

/// The KJV's spans for the given canonical chapters, by (chapter, verse).
fn kjv_tags(conn: &Connection, book_id: i64, chapters: &[i64]) -> anyhow::Result<HashMap<(i64, i64), Vec<Span>>> {
    let mut out: HashMap<(i64, i64), Vec<Span>> = HashMap::new();
    let mut stmt = conn.prepare(
        "SELECT chapter, verse, char_start, char_end, code, term FROM color_tags
         WHERE book_id = ?1 AND chapter = ?2 ORDER BY verse, char_start",
    )?;
    for &c in chapters {
        let rows = stmt.query_map(params![book_id, c], |r| {
            Ok((
                (r.get::<_, i64>(0)?, r.get::<_, i64>(1)?),
                Span { start: r.get::<_, i64>(2)? as usize, end: r.get::<_, i64>(3)? as usize, code: r.get(4)?, term: r.get(5)? },
            ))
        })?;
        for row in rows {
            let (key, span) = row?;
            out.entry(key).or_default().push(span);
        }
    }
    Ok(out)
}

/// The Strong's-numbered phrases and the original words of one canonical
/// verse, in order.
fn strongs_data(conn: &Connection, book_id: i64, chapter: i64, verse: i64) -> anyhow::Result<(Vec<(String, String)>, Vec<(String, String)>)> {
    let mut stmt = conn.prepare_cached(
        "SELECT text, strongs_id FROM interlinear_words
         WHERE book_id = ?1 AND chapter = ?2 AND verse = ?3 AND strongs_id IS NOT NULL ORDER BY sort_order",
    )?;
    let phrases = stmt.query_map(params![book_id, chapter, verse], |r| Ok((r.get(0)?, r.get(1)?)))?.collect::<Result<Vec<_>, _>>()?;
    let mut stmt = conn.prepare_cached(
        "SELECT original_word, strongs_id FROM morphology_words
         WHERE book_id = ?1 AND chapter = ?2 AND verse = ?3 AND strongs_id IS NOT NULL ORDER BY sort_order",
    )?;
    let morph = stmt.query_map(params![book_id, chapter, verse], |r| Ok((r.get(0)?, r.get(1)?)))?.collect::<Result<Vec<_>, _>>()?;
    Ok((phrases, morph))
}

/// A byte offset in `text` as a count of UTF-16 units, which is how the
/// page's JavaScript indexes the same string.
fn utf16_at(text: &str, byte: usize) -> i64 {
    text[..byte].encode_utf16().count() as i64
}

/// A chapter of some translation beside the KJV: its verses, the canonical
/// (KJV) verse each stands for (through `versification_map`), and the KJV
/// text of those verses.
struct Beside {
    is_kjv: bool,
    lang: &'static str,
    /// (own verse number, text, canonical (chapter, verse))
    verses: Vec<(i64, String, (i64, i64))>,
    chapters: Vec<i64>,
    kjv: HashMap<(i64, i64), String>,
}

fn beside_kjv(conn: &Connection, translation_id: i64, book_id: i64, chapter: i64) -> anyhow::Result<Option<Beside>> {
    let Ok(kjv_id) = conn.query_row("SELECT id FROM translations WHERE code = 'KJV'", [], |r| r.get::<_, i64>(0)) else {
        return Ok(None);
    };
    let language: Option<String> = conn.query_row("SELECT language FROM translations WHERE id = ?1", [translation_id], |r| r.get(0))?;
    let chapter_verses = verses::get_chapter(conn, translation_id, book_id, chapter)?;
    let mut canonical: HashMap<i64, (i64, i64)> = HashMap::new();
    if translation_id != kjv_id {
        let mut stmt = conn.prepare(
            "SELECT verse, canonical_chapter, canonical_verse FROM versification_map
             WHERE translation_id = ?1 AND book_id = ?2 AND chapter = ?3",
        )?;
        for row in stmt.query_map(params![translation_id, book_id, chapter], |r| Ok((r.get(0)?, (r.get(1)?, r.get(2)?))))? {
            let (v, c) = row?;
            canonical.insert(v, c);
        }
    }
    let verses: Vec<(i64, String, (i64, i64))> = chapter_verses
        .into_iter()
        .map(|v| {
            let at = canonical.get(&v.verse).copied().unwrap_or((chapter, v.verse));
            (v.verse, v.text, at)
        })
        .collect();
    let mut chapters: Vec<i64> = verses.iter().map(|v| v.2 .0).collect();
    chapters.sort();
    chapters.dedup();
    let mut kjv: HashMap<(i64, i64), String> = HashMap::new();
    for &c in &chapters {
        for v in verses::get_chapter(conn, kjv_id, book_id, c)? {
            kjv.insert((c, v.verse), v.text);
        }
    }
    let sample = verses.first().map(|v| v.1.as_str()).unwrap_or("");
    let lang = ct::language_of(language.as_deref(), sample);
    Ok(Some(Beside { is_kjv: translation_id == kjv_id, lang, verses, chapters, kjv }))
}

fn to_spans(verse: i64, text: &str, spans: Vec<Span>) -> Vec<ColorSpan> {
    spans
        .into_iter()
        .map(|s| ColorSpan { verse, start: utf16_at(text, s.start), end: utf16_at(text, s.end), code: s.code, term: s.term })
        .collect()
}

/// A KJV verse with the verses either side of it, as one text with the spans
/// moved along: what a translation numbered differently (the Septuagint, the
/// Vulgate) is matched against, so that a verse a number out still finds its
/// words.
fn with_neighbours(kjv: &HashMap<(i64, i64), String>, spans: &HashMap<(i64, i64), Vec<Span>>, key: (i64, i64)) -> (String, Vec<Span>) {
    let mut text = String::new();
    let mut out = Vec::new();
    for v in [key.1 - 1, key.1, key.1 + 1] {
        let Some(t) = kjv.get(&(key.0, v)) else { continue };
        if !text.is_empty() {
            text.push(' ');
        }
        let shift = text.len();
        text.push_str(t);
        for s in spans.get(&(key.0, v)).map(Vec::as_slice).unwrap_or(&[]) {
            out.push(Span { start: s.start + shift, end: s.end + shift, ..s.clone() });
        }
    }
    (text, out)
}

/// The colored spans of one chapter of a translation, in the translation's
/// own verse numbering, with offsets in UTF-16 units. The KJV's come straight
/// from `color_tags`; every other translation's are worked out from the KJV
/// verse each of its verses stands for.
pub fn chapter_colors(conn: &Connection, lexicon: &Lexicon, translation_id: i64, book_id: i64, chapter: i64) -> anyhow::Result<Vec<ColorSpan>> {
    let Some(ch) = beside_kjv(conn, translation_id, book_id, chapter)? else { return Ok(Vec::new()) };
    let tags = kjv_tags(conn, book_id, &ch.chapters)?;
    if ch.is_kjv {
        return Ok(ch.verses.iter().flat_map(|(v, text, key)| to_spans(*v, text, tags.get(key).cloned().unwrap_or_default())).collect());
    }
    let mut out = Vec::new();
    for (v, text, key) in &ch.verses {
        let Some(kjv_text) = ch.kjv.get(key) else { continue };
        let verse_tags = tags.get(key).map(Vec::as_slice).unwrap_or(&[]);
        let spans = match ch.lang {
            "grc" | "hbo" => {
                let (phrases, morph) = strongs_data(conn, book_id, key.0, key.1)?;
                // The Septuagint is Greek beside the Hebrew words the Old
                // Testament's Strong's numbers belong to: only the word list
                // reaches it, matched against the verses around too.
                let same_language = morph.first().is_some_and(|(w, _)| ct::language_of(None, w) == ch.lang);
                if same_language {
                    let strongs = ct::strongs_colors(kjv_text, verse_tags, &phrases);
                    ct::project_strongs(verse_tags, &strongs, &morph, text, ch.lang, lexicon)
                } else {
                    let (_, near) = with_neighbours(&ch.kjv, &tags, *key);
                    ct::project_lexicon(&near, text, ch.lang, lexicon)
                }
            }
            "la" => {
                let (near_text, near) = with_neighbours(&ch.kjv, &tags, *key);
                ct::project_words(&near_text, &near, text, "la", lexicon)
            }
            _ => ct::project_words(kjv_text, verse_tags, text, ch.lang, lexicon),
        };
        out.extend(to_spans(*v, text, spans));
    }
    Ok(out)
}

/// The KJV's voice runs for the given canonical chapters, by (chapter, verse).
fn kjv_voices(conn: &Connection, book_id: i64, chapters: &[i64]) -> anyhow::Result<HashMap<(i64, i64), Vec<Span>>> {
    let mut out: HashMap<(i64, i64), Vec<Span>> = HashMap::new();
    let mut stmt = conn.prepare(
        "SELECT chapter, verse, char_start, char_end, voice FROM color_voices
         WHERE book_id = ?1 AND chapter = ?2 ORDER BY verse, char_start",
    )?;
    for &c in chapters {
        let rows = stmt.query_map(params![book_id, c], |r| {
            Ok((
                (r.get::<_, i64>(0)?, r.get::<_, i64>(1)?),
                Span { start: r.get::<_, i64>(2)? as usize, end: r.get::<_, i64>(3)? as usize, code: r.get(4)?, term: String::new() },
            ))
        })?;
        for row in rows {
            let (key, span) = row?;
            out.entry(key).or_default().push(span);
        }
    }
    Ok(out)
}

/// Who is speaking in one chapter of a translation: runs of text in a voice
/// other than narration ("god", "speech", "inner", "quote", "benediction"
/// in `code`), offsets in UTF-16 units.
pub fn chapter_voices(conn: &Connection, translation_id: i64, book_id: i64, chapter: i64) -> anyhow::Result<Vec<ColorSpan>> {
    let Some(ch) = beside_kjv(conn, translation_id, book_id, chapter)? else { return Ok(Vec::new()) };
    let voices = kjv_voices(conn, book_id, &ch.chapters)?;
    let mut out = Vec::new();
    for (v, text, key) in &ch.verses {
        let verse_voices = voices.get(key).cloned().unwrap_or_default();
        if verse_voices.is_empty() {
            continue;
        }
        let spans = if ch.is_kjv {
            verse_voices
        } else {
            let Some(kjv_text) = ch.kjv.get(key) else { continue };
            ct::project_voices(kjv_text, &verse_voices, text, ch.lang)
        };
        out.extend(to_spans(*v, text, spans));
    }
    Ok(out)
}

/// Every KJV verse where `term` has the color `code`, in Bible order.
pub fn term_verses(conn: &Connection, code: &str, term: &str) -> anyhow::Result<Vec<ColorTermVerse>> {
    let mut stmt = conn.prepare(
        "SELECT DISTINCT book_id, chapter, verse FROM color_tags WHERE term = ?1 AND code = ?2 ORDER BY book_id, chapter, verse",
    )?;
    let rows = stmt.query_map(params![term, code], |r| Ok(ColorTermVerse { book_id: r.get(0)?, chapter: r.get(1)?, verse: r.get(2)? }))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// Against the real content.db, how much of each translation is colored,
/// with a verse or two marked up:
/// `cargo test --release --lib color_text::real -- --ignored --nocapture`.
#[cfg(test)]
mod real {
    use super::*;

    fn marked(text: &str, spans: &[&ColorSpan]) -> String {
        let units: Vec<u16> = text.encode_utf16().collect();
        let mut out = String::new();
        let mut at = 0usize;
        for s in spans {
            out += &String::from_utf16_lossy(&units[at..s.start as usize]);
            out += &format!("[{}|{}]", String::from_utf16_lossy(&units[s.start as usize..s.end as usize]), s.code);
            at = s.end as usize;
        }
        out + &String::from_utf16_lossy(&units[at..])
    }

    #[test]
    #[ignore]
    fn every_translation_is_colored() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        let dir = std::env::temp_dir().join(format!("sojourner-real-ct-{}", std::process::id()));
        let conn = crate::db::open(&dir, &root.join("content").join("content.db")).unwrap();
        let lexicon = load_lexicon(&conn).unwrap();
        let chapters = [(1, 1), (1, 22), (15, 2), (19, 23), (23, 9), (40, 5), (43, 1), (44, 2), (45, 8), (66, 21)];
        let samples = [(1, 1, 2), (43, 1, 1), (15, 2, 67), (23, 9, 6)];
        let translations = verses::list_translations(&conn).unwrap();
        let kjv_id = translations.iter().find(|t| t.code == "KJV").unwrap().id;
        let mut kjv_total = 0usize;
        for &(b, c) in &chapters {
            kjv_total += chapter_colors(&conn, &lexicon, kjv_id, b, c).unwrap().len();
        }
        for t in &translations {
            let start = std::time::Instant::now();
            let mut total = 0usize;
            let mut texts = Vec::new();
            for &(b, c) in &chapters {
                let spans = chapter_colors(&conn, &lexicon, t.id, b, c).unwrap();
                total += spans.len();
                let vs = verses::get_chapter(&conn, t.id, b, c).unwrap();
                for &(sb, sc, sv) in &samples {
                    if (sb, sc) != (b, c) {
                        continue;
                    }
                    if let Some(v) = vs.iter().find(|v| v.verse == sv) {
                        let mine: Vec<&ColorSpan> = spans.iter().filter(|s| s.verse == sv).collect();
                        texts.push(format!("    {b} {sc}:{sv} {}", marked(&v.text, &mine)));
                    }
                }
            }
            println!("{:7} {:5.0}% of the KJV's count ({total} spans) in {:?}", t.code, 100.0 * total as f64 / kjv_total as f64, start.elapsed());
            for s in texts {
                println!("{s}");
            }
        }
    }
}
