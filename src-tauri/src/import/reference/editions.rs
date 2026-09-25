//! The Greek and Hebrew texts themselves, as translations the reader can
//! open, compare and search like any other.
//!
//! Nothing here is a new download. Each edition is read out of tagged data
//! already in `reference/morphology/`:
//!
//! - **Hebrew (WLC)**: STEPBible's TAHOT, the Leningrad Codex word by word
//!   with each word's English-Bible reference beside its Hebrew one
//!   ("Psa.3.1(3.2)"). The text is laid out in English chapter and verse
//!   numbering, so Psalm 3:1 in Hebrew is Psalm 3:1 in the KJV beside it; a
//!   psalm's title, which English Bibles leave unnumbered, opens its first
//!   verse. Where the scribes' marginal reading (Qere) corrects the written
//!   text (Ketiv), the Qere is read, as the KJV and every translation since do.
//! - **Greek (TR, Byzantine, Westcott–Hort, Tregelles)**: STEPBible's TAGNT
//!   prints each word once with the editions that contain it, and each
//!   edition's different spelling of it in a variants column. An edition's
//!   text is every word it contains, in its own spelling -- the same
//!   reading `morphology::import_greek` does for the TR alone. Word order
//!   follows TAGNT's printed text where editions differ only in order.
//! - **Greek (SBLGNT)**: MorphGNT, which is the SBL Greek New Testament
//!   itself, word for word.
//!
//! See `crate::morph` and `morphology` for the parsing these share.

use super::morphology::{greek_word, lists_edition, normalize_tagnt_strongs, parse_tagnt_ref, variant_reading, Reading, GREEK_BOOK_ALIASES};
use rusqlite::{params, Connection};
use std::collections::{BTreeMap, HashMap};
use std::path::Path;

pub struct EditionMeta {
    pub code: &'static str,
    pub name: &'static str,
    pub language: &'static str,
    pub script: &'static str,
    pub direction: &'static str,
    pub license: &'static str,
    pub credit: &'static str,
    pub scope: Option<&'static str>,
}

/// TAGNT edition abbreviation -> the translation it becomes.
const GREEK_EDITIONS: &[(&str, EditionMeta)] = &[
    (
        "TR",
        EditionMeta {
            code: "TR",
            name: "Textus Receptus (Scrivener 1894)",
            language: "grc",
            script: "greek",
            direction: "ltr",
            license: "Public domain",
            credit: "F. H. A. Scrivener's Textus Receptus (1894), the Greek behind the KJV. Public domain. Text read from STEPBible's Translators Amalgamated Greek NT, © Tyndale House Cambridge, CC BY 4.0.",
            scope: Some("New Testament"),
        },
    ),
    (
        "Byz",
        EditionMeta {
            code: "BYZ",
            name: "Byzantine Text (Robinson–Pierpont)",
            language: "grc",
            script: "greek",
            direction: "ltr",
            license: "Public domain",
            credit: "The New Testament in the Original Greek: Byzantine Textform, ed. M. A. Robinson and W. G. Pierpont (2005), released to the public domain. Text read from STEPBible's Translators Amalgamated Greek NT, © Tyndale House Cambridge, CC BY 4.0; word order follows that edition's printed text where the two differ only in order.",
            scope: Some("New Testament"),
        },
    ),
    (
        "WH",
        EditionMeta {
            code: "WH",
            name: "Westcott–Hort (1881)",
            language: "grc",
            script: "greek",
            direction: "ltr",
            license: "Public domain",
            credit: "B. F. Westcott and F. J. A. Hort, The New Testament in the Original Greek (1881). Public domain. Text read from STEPBible's Translators Amalgamated Greek NT, © Tyndale House Cambridge, CC BY 4.0; word order follows that edition's printed text where the two differ only in order.",
            scope: Some("New Testament"),
        },
    ),
    (
        "Treg",
        EditionMeta {
            code: "TREG",
            name: "Tregelles (1879)",
            language: "grc",
            script: "greek",
            direction: "ltr",
            license: "Public domain; digitisation CC BY 4.0",
            credit: "S. P. Tregelles, The Greek New Testament (1857–1879), in the edition of D. Jongkind et al. (Tyndale House, 2009). Text read from STEPBible's Translators Amalgamated Greek NT, © Tyndale House Cambridge, CC BY 4.0; word order follows that edition's printed text where the two differ only in order.",
            scope: Some("New Testament"),
        },
    ),
];

const SBLGNT: EditionMeta = EditionMeta {
    code: "SBLGNT",
    name: "SBL Greek New Testament",
    language: "grc",
    script: "greek",
    direction: "ltr",
    license: "CC BY 4.0",
    credit: "The SBL Greek New Testament, ed. M. W. Holmes. © 2010 Society of Biblical Literature and Logos Bible Software, CC BY 4.0. Text from MorphGNT (morphgnt.org).",
    scope: Some("New Testament"),
};

const WLC: EditionMeta = EditionMeta {
    code: "WLC",
    name: "Westminster Leningrad Codex",
    language: "hbo",
    script: "hebrew",
    direction: "rtl",
    license: "Public domain; tagging CC BY 4.0",
    credit: "The Westminster Leningrad Codex, the Hebrew of the Leningrad Codex (1008). Public domain. Read from STEPBible's Translators Amalgamated Hebrew OT, © Tyndale House Cambridge, CC BY 4.0, in English chapter and verse numbering; the Qere is read where the scribes corrected the written text.",
    scope: Some("Old Testament"),
};

/// One word of TAHOT, as the morphology table stores it.
pub struct HebrewWord {
    pub book_id: i64,
    pub chapter: i64,
    pub verse: i64,
    pub sort_order: i64,
    pub original_word: String,
    pub lemma: Option<String>,
    pub morph_code: String,
    pub strongs_id: Option<String>,
}

/// Everything TAHOT gives: the words, and each verse's text.
pub struct Tahot {
    pub words: Vec<HebrewWord>,
    pub verses: BTreeMap<(i64, i64, i64), String>,
}

/// "Psa.3.1(3.2)#01=L" -> (book id, English chapter, English verse, type).
fn tahot_ref(cell: &str) -> Option<(i64, i64, i64, &str)> {
    let (reference, kind) = cell.split_once('=')?;
    let reference = reference.split('#').next()?;
    let english = reference.split('(').next()?;
    let mut parts = english.split('.');
    let book = crate::import::usfm::book_id_for_usfm(parts.next()?)?;
    let chapter = parts.next()?.parse().ok()?;
    let verse = parts.next()?.parse().ok()?;
    Some((book, chapter, verse, kind))
}

/// The Hebrew lemma in TAHOT's expanded-tags column: the entry in braces,
/// "{H7225G=רֵאשִׁית=: beginning»...}" -> "רֵאשִׁית".
fn tahot_lemma(expanded: &str) -> Option<String> {
    let start = expanded.find('{')?;
    let inner = &expanded[start + 1..];
    let mut fields = inner.split('=');
    let _strongs = fields.next()?;
    let lemma = fields.next()?.trim();
    (!lemma.is_empty()).then(|| lemma.to_string())
}

/// The word's main Strong's number: the one TAHOT braces among its
/// morphemes ("H9003/{H7225G}").
fn tahot_strongs(d_strongs: &str) -> Option<String> {
    let start = d_strongs.find('{')?;
    let end = d_strongs[start..].find('}')? + start;
    normalize_tagnt_strongs(&d_strongs[start + 1..end])
}

pub fn read_tahot(dir: &Path) -> anyhow::Result<Tahot> {
    let mut paths: Vec<_> = std::fs::read_dir(dir)?
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.file_name().and_then(|n| n.to_str()).is_some_and(|n| n.starts_with("TAHOT ")))
        .collect();
    paths.sort_by_key(|p| {
        // Canonical order, whatever the file names sort as.
        let n = p.file_name().unwrap().to_string_lossy().to_string();
        ["Gen-Deu", "Jos-Est", "Job-Sng", "Isa-Mal"].iter().position(|k| n.contains(k)).unwrap_or(9)
    });
    anyhow::ensure!(!paths.is_empty(), "no TAHOT files in {}", dir.display());

    let mut words = Vec::new();
    let mut verses: BTreeMap<(i64, i64, i64), String> = BTreeMap::new();
    let mut last: Option<(i64, i64, i64)> = None;
    let mut sort_order = 0i64;
    for path in paths {
        let text = std::fs::read_to_string(&path)?;
        for line in text.lines() {
            let cols: Vec<&str> = line.split('\t').collect();
            if cols.len() < 12 {
                continue;
            }
            let Some((book_id, chapter, verse, kind)) = tahot_ref(cols[0]) else { continue };
            // L: the Leningrad text; Q: the scribes' correction read in place
            // of the written word. X (restored from the Greek) and R are
            // apparatus, not the codex.
            if !(kind.starts_with('L') || kind.starts_with('Q')) {
                continue;
            }
            // A psalm title is verse 0 in English numbering; it opens verse 1.
            let verse = verse.max(1);
            let key = (book_id, chapter, verse);
            if last != Some(key) {
                sort_order = 0;
                last = Some(key);
            }
            // "מָֽה\־": the word, then attached punctuation after "\".
            // Morpheme boundaries ("/") are not printed.
            let raw = cols[1].trim().replace('/', "");
            let (word, attached) = match raw.split_once('\\') {
                Some((w, p)) => (w.to_string(), p.to_string()),
                None => (raw.clone(), String::new()),
            };
            let v = verses.entry(key).or_default();
            if !v.is_empty() && !v.ends_with('־') {
                v.push(' ');
            }
            v.push_str(&word);
            v.push_str(&attached.replace('\\', ""));

            words.push(HebrewWord {
                book_id,
                chapter,
                verse,
                sort_order,
                original_word: word,
                lemma: tahot_lemma(cols[11]),
                morph_code: cols[5].trim().to_string(),
                strongs_id: tahot_strongs(cols[4]),
            });
            sort_order += 1;
        }
    }
    Ok(Tahot { words, verses })
}

/// Each TAGNT edition's verses, by (edition index, book, chapter, verse).
fn read_tagnt_editions(dir: &Path, book_lookup: &HashMap<String, i64>) -> anyhow::Result<Vec<BTreeMap<(i64, i64, i64), Vec<String>>>> {
    let alias: HashMap<&str, &str> = GREEK_BOOK_ALIASES.iter().copied().collect();
    let mut out: Vec<BTreeMap<(i64, i64, i64), Vec<String>>> = GREEK_EDITIONS.iter().map(|_| BTreeMap::new()).collect();
    let mut paths: Vec<_> = std::fs::read_dir(dir)?
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.file_name().and_then(|n| n.to_str()).is_some_and(|n| n.starts_with("TAGNT ")))
        .collect();
    paths.sort();
    for path in paths {
        let text = std::fs::read_to_string(&path)?;
        for line in text.lines() {
            let cols: Vec<&str> = line.split('\t').collect();
            if cols.len() < 6 {
                continue;
            }
            let Some((book, chapter, verse)) = parse_tagnt_ref(cols[0]) else { continue };
            let Some(&osis) = alias.get(book) else { continue };
            let Some(&book_id) = book_lookup.get(osis) else { continue };
            for (i, (edition, _)) in GREEK_EDITIONS.iter().enumerate() {
                let reading: Option<Reading> = if lists_edition(cols[5], edition) {
                    Some(Reading { word: cols[1], d_strongs: "", morph_code: "" })
                } else {
                    cols.get(6).and_then(|c| variant_reading(c, edition))
                };
                if let Some(r) = reading {
                    let w = greek_word(r.word);
                    if !w.is_empty() {
                        out[i].entry((book_id, chapter, verse)).or_default().push(w);
                    }
                }
            }
        }
    }
    Ok(out)
}

/// SBLGNT from MorphGNT: "040101 N- ----NSM- λόγος, λόγος λόγος λόγος".
fn read_morphgnt(dir: &Path) -> anyhow::Result<BTreeMap<(i64, i64, i64), Vec<String>>> {
    let mut out: BTreeMap<(i64, i64, i64), Vec<String>> = BTreeMap::new();
    let mut paths: Vec<_> = std::fs::read_dir(dir)?
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.to_string_lossy().ends_with("-morphgnt.txt"))
        .collect();
    paths.sort();
    for path in paths {
        for line in std::fs::read_to_string(&path)?.lines() {
            let cols: Vec<&str> = line.split(' ').collect();
            if cols.len() < 4 || cols[0].len() != 6 {
                continue;
            }
            let (Ok(b), Ok(c), Ok(v)) = (cols[0][0..2].parse::<i64>(), cols[0][2..4].parse::<i64>(), cols[0][4..6].parse::<i64>()) else {
                continue;
            };
            out.entry((39 + b, c, v)).or_default().push(cols[3].to_string());
        }
    }
    Ok(out)
}

fn insert_edition(tx: &Connection, meta: &EditionMeta, source_path: &str, verses: impl Iterator<Item = ((i64, i64, i64), String)>) -> anyhow::Result<usize> {
    let now = chrono::Utc::now().to_rfc3339();
    // The build connection does not enforce foreign keys, so an edition
    // built before is cleared by hand.
    tx.execute("DELETE FROM verses WHERE translation_id IN (SELECT id FROM translations WHERE code = ?1)", params![meta.code])?;
    tx.execute("DELETE FROM translations WHERE code = ?1", params![meta.code])?;
    let tid = crate::import::new_translation_id(tx, &meta.code)?;
    tx.execute(
        "INSERT INTO translations (id, code, name, language, source_path, source_format, imported_at, checksum,
                                   license, credit, scope, script, direction)
         VALUES (?11,?1,?2,?3,?4,'tagged',?5,'',?6,?7,?8,?9,?10)",
        params![meta.code, meta.name, meta.language, source_path, now, meta.license, meta.credit, meta.scope, meta.script, meta.direction, tid],
    )?;
    let mut stmt = tx.prepare("INSERT OR IGNORE INTO verses (translation_id, book_id, chapter, verse, text) VALUES (?1,?2,?3,?4,?5)")?;
    let mut n = 0;
    for ((b, c, v), text) in verses {
        let text = text.split_whitespace().collect::<Vec<_>>().join(" ");
        if text.is_empty() {
            continue;
        }
        n += stmt.execute(params![tid, b, c, v, text])?;
    }
    Ok(n)
}

/// Builds the WLC from TAHOT, and the Greek editions from TAGNT and MorphGNT.
pub fn import(conn: &mut Connection, morphology_dir: &Path) -> anyhow::Result<usize> {
    let book_lookup = super::crossrefs::load_book_lookup(conn)?;
    let tahot = read_tahot(&morphology_dir.join("hebrew-tahot"))?;
    let tagnt = read_tagnt_editions(&morphology_dir.join("greek-tagnt"), &book_lookup)?;
    let sbl = read_morphgnt(&morphology_dir.join("greek"))?;

    let tx = conn.transaction()?;
    let mut total = 0;
    let n = insert_edition(&tx, &WLC, "reference/morphology/hebrew-tahot", tahot.verses.into_iter())?;
    println!("edition WLC: {n} verses");
    total += n;
    for ((_, meta), verses) in GREEK_EDITIONS.iter().zip(tagnt) {
        let n = insert_edition(&tx, meta, "reference/morphology/greek-tagnt", verses.into_iter().map(|(k, w)| (k, w.join(" "))))?;
        println!("edition {}: {n} verses", meta.code);
        total += n;
    }
    let n = insert_edition(&tx, &SBLGNT, "reference/morphology/greek", sbl.into_iter().map(|(k, w)| (k, w.join(" "))))?;
    println!("edition SBLGNT: {n} verses");
    total += n;
    tx.commit()?;
    Ok(total)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tahot_references_and_tags() {
        assert_eq!(tahot_ref("Psa.3.1(3.2)#01=L"), Some((19, 3, 1, "L")));
        assert_eq!(tahot_ref("Psa.3.0(3.1)#01=L"), Some((19, 3, 0, "L")));
        assert_eq!(tahot_ref("Gen.9.21#07=Q(K)"), Some((1, 9, 21, "Q(K)")));
        assert_eq!(tahot_lemma("H9003=ב=in/{H7225G=רֵאשִׁית=: beginning»first}").as_deref(), Some("רֵאשִׁית"));
        assert_eq!(tahot_strongs("H9003/{H7225G}").as_deref(), Some("H7225"));
    }
}
