use super::crossrefs::load_book_lookup;
use rusqlite::{params, Connection};
use std::collections::HashMap;
use std::path::Path;

/// The Hebrew Old Testament's words, from STEPBible's TAHOT: the Leningrad
/// Codex in English chapter and verse numbering, with Hebrew lemmas and the
/// OSHB parsing codes (see `editions::read_tahot`). It replaced the OSHB XML
/// this table was first built from, whose Hebrew numbering put every word of
/// a titled psalm, Malachi 4 and Joel 3 a verse or a chapter away from the
/// KJV beside it.
fn import_hebrew(conn: &mut Connection, dir: &Path) -> anyhow::Result<usize> {
    let tahot = super::editions::read_tahot(dir)?;
    let tx = conn.transaction()?;
    {
        let mut insert = tx.prepare(
            "INSERT INTO morphology_words (book_id, chapter, verse, sort_order, original_word, lemma, morph_code, strongs_id)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        )?;
        for w in &tahot.words {
            insert.execute(params![w.book_id, w.chapter, w.verse, w.sort_order, w.original_word, w.lemma, w.morph_code, w.strongs_id])?;
        }
    }
    tx.commit()?;
    println!("morphology (hebrew): {} words from TAHOT", tahot.words.len());
    Ok(tahot.words.len())
}

pub(crate) const GREEK_BOOK_ALIASES: &[(&str, &str)] = &[
    ("Mat", "Matt"), ("Mrk", "Mark"), ("Luk", "Luke"), ("Jhn", "John"), ("Act", "Acts"),
    ("Rom", "Rom"), ("1Co", "1Cor"), ("2Co", "2Cor"), ("Gal", "Gal"), ("Eph", "Eph"),
    ("Php", "Phil"), ("Col", "Col"), ("1Th", "1Thess"), ("2Th", "2Thess"), ("1Ti", "1Tim"),
    ("2Ti", "2Tim"), ("Tit", "Titus"), ("Phm", "Phlm"), ("Heb", "Heb"), ("Jas", "Jas"),
    ("1Pe", "1Pet"), ("2Pe", "2Pet"), ("1Jn", "1John"), ("2Jn", "2John"), ("3Jn", "3John"),
    ("Jud", "Jude"), ("Rev", "Rev"),
];

/// Which amalgamated edition's wordstream we reproduce. TAGNT carries every
/// word of NA27/28, TR, SBLGNT, WH, Tregelles and Byz side by side, tagging
/// each row with the editions that contain it; picking one keeps the text a
/// real edition rather than a conflation of all of them.
///
/// The Textus Receptus is the one this app wants: Strong numbered the TR, and
/// the KJV phrases and Strong's numbers printed directly above this row in the
/// interlinear are tagged to it, so the Greek here is now the Greek those
/// phrases actually translate. It also carries the passages a KJV reader
/// expects -- the longer ending of Mark among them, which TAGNT does not
/// credit to SBLGNT at all.
const EDITION: &str = "TR";

/// TAGNT writes Strong's numbers zero-padded to four digits, sometimes with a
/// trailing letter that distinguishes senses STEPBible separates but Strong
/// did not ("G2424G", "G1492H"). `strongs_entries.id` is unpadded and carries
/// no suffix, so "G0976" -> "G976" and "G2424G" -> "G2424".
pub(crate) fn normalize_tagnt_strongs(raw: &str) -> Option<String> {
    let raw = raw.trim();
    let (prefix, rest) = raw.split_at(raw.char_indices().nth(1)?.0);
    if prefix != "H" && prefix != "G" {
        return None;
    }
    let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
    let n: u32 = digits.parse().ok()?;
    Some(format!("{prefix}{n}"))
}

/// TAGNT numbers words Strong never did -- ones absent from the Textus
/// Receptus he indexed -- in an extended range above G5624. Most are simply a
/// form or spelling of a word that does have a Strong's number, and TBESG says
/// so in its own second and third columns ("G6063 = a Form of G1492H"), so we
/// read that relation rather than guessing at it. The rest (proper nouns and
/// hapax legomena with no classic equivalent) map to nothing and are left
/// untagged rather than pointed at a lexicon entry that isn't about them.
fn load_extended_strongs_aliases(path: &Path) -> anyhow::Result<HashMap<String, String>> {
    Ok(parse_extended_strongs_aliases(&std::fs::read_to_string(path)?))
}

fn parse_extended_strongs_aliases(text: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for line in text.lines() {
        let mut cols = line.split('\t');
        let (Some(from), Some(_relation), Some(to)) = (cols.next(), cols.next(), cols.next()) else {
            continue;
        };
        let (Some(from), Some(to)) = (normalize_tagnt_strongs(from), normalize_tagnt_strongs(to)) else {
            continue;
        };
        if from != to {
            map.insert(from, to);
        }
    }
    map
}

/// Splits a TAGNT reference cell ("Mat.1.1#01=NKO") into its book, chapter and
/// verse. The word index after `#` is deliberately ignored: it counts every
/// word of the amalgamated text, so once we filter to one edition it has gaps,
/// and `sort_order` is renumbered per verse from what we actually keep.
pub(crate) fn parse_tagnt_ref(cell: &str) -> Option<(&str, i64, i64)> {
    let cell = cell.split(['#', '=']).next()?;
    let mut parts = cell.split('.');
    let book = parts.next()?;
    let chapter = parts.next()?.parse().ok()?;
    let verse = parts.next()?.parse().ok()?;
    if parts.next().is_some() || book.is_empty() {
        return None;
    }
    Some((book, chapter, verse))
}

/// TAGNT prints the Greek with its transliteration in parentheses after it
/// ("Βίβλος (Biblos)"); we display the Greek alone. The pilcrow and line-break
/// markers it appends to a word ending a paragraph ("ὠρχήσασθε,¶¬") are
/// typesetting, not text, so they come off too -- unlike the doubled brackets
/// around passages of disputed authenticity ("[[Πάντα ... ἀμήν.]]", the longer
/// ending of Mark and the pericope adulterae), which the edition means and we
/// keep, and unlike ordinary punctuation, which this pane has always shown.
pub(crate) fn greek_word(cell: &str) -> String {
    let cell = match cell.rfind(" (") {
        Some(i) => &cell[..i],
        None => cell,
    };
    // Stripped wherever they fall, not just at the end: a paragraph can break
    // inside the closing bracket of a disputed passage ("ἀμήν.¶]]").
    cell.replace(['¶', '¬'], "").trim().to_string()
}

/// An edition name in a variant's list can carry a word-order marker saying
/// where that edition puts the word relative to the printed order ("TR«3" =
/// three places earlier, "Byz»1" = one place later). The edition is still the
/// TR; we keep TAGNT's printed word order and read the marker only as part of
/// the name.
pub(crate) fn edition_name(token: &str) -> &str {
    let token = token.trim();
    match token.find(['«', '»']) {
        Some(i) => token[..i].trim_end(),
        None => token,
    }
}

/// True when `list` ("NA28+NA27+Tyn+SBL+WH+Treg+TR+Byz") names `edition`.
/// Compared whole so that "TR" does not match "Treg".
pub(crate) fn lists_edition(list: &str, edition: &str) -> bool {
    list.split('+').any(|e| edition_name(e) == edition)
}

/// One reading of a word: the Greek as printed, its Strong's number and its
/// parsing code.
pub(crate) struct Reading<'a> {
    pub word: &'a str,
    pub d_strongs: &'a str,
    pub morph_code: &'a str,
}

/// Where an edition differs from the reading TAGNT prints in the row, the row
/// keeps the majority text and describes the other reading in its meaning-
/// variants column:
///
/// ```text
/// γέννησις (t=gennēsis) birth - G1083=N-NSF in: TR+Byz
/// ```
///
/// where a column holding several of them separates each with a broken bar:
///
/// ```text
/// ἦλθεν (t=ēlthen) it came - G2064=V-2AAI-3S in: TR+Byz ¦ ἦλθον (o=ēlthon) they came - G2064=V-2AAI-3P in: Treg
/// ```
///
/// Returns the first reading whose edition list names `edition`. Without this,
/// a word would vanish from the text wherever our edition simply spells it
/// differently -- 3,134 words of the TR, including every "Ἀμών" for "Ἀμώς" in
/// Matthew's genealogy.
pub(crate) fn variant_reading<'a>(column: &'a str, edition: &str) -> Option<Reading<'a>> {
    column.split('¦').find_map(|entry| {
        let (reading, editions) = entry.rsplit_once(" in: ")?;
        if !lists_edition(editions.trim(), edition) {
            return None;
        }
        // The gloss sits between the transliteration and the tagging, and may
        // itself contain " - ", so split from the right.
        let (word_and_gloss, tagging) = reading.rsplit_once(" - ")?;
        let (d_strongs, morph_code) = tagging.trim().split_once('=')?;
        Some(Reading { word: word_and_gloss, d_strongs, morph_code })
    })
}

struct GreekImport<'a> {
    book_lookup: &'a HashMap<String, i64>,
    alias_map: HashMap<&'a str, &'a str>,
    extended: HashMap<String, String>,
    known_strongs: HashMap<String, String>,
    untagged: usize,
    substituted: usize,
}

impl GreekImport<'_> {
    /// The Strong's id to link this word to, or None when TAGNT's number has no
    /// counterpart in the bundled Strong's dictionary (see
    /// `load_extended_strongs_aliases`) -- the word still shows, it just isn't
    /// clickable.
    fn strongs_for(&mut self, d_strongs: &str) -> Option<String> {
        let id = normalize_tagnt_strongs(d_strongs)?;
        if self.known_strongs.contains_key(&id) {
            return Some(id);
        }
        let aliased = self.extended.get(&id)?;
        if self.known_strongs.contains_key(aliased) {
            return Some(aliased.clone());
        }
        None
    }
}

fn import_greek(conn: &mut Connection, dir: &Path, book_lookup: &HashMap<String, i64>) -> anyhow::Result<usize> {
    let lexicon = dir.join(
        "TBESG - Translators Brief lexicon of Extended Strongs for Greek - STEPBible.org CC BY.txt",
    );
    let known_strongs: HashMap<String, String> = conn
        .prepare("SELECT id, original_word FROM strongs_entries")?
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
        .collect::<Result<_, _>>()?;
    let mut state = GreekImport {
        book_lookup,
        alias_map: GREEK_BOOK_ALIASES.iter().copied().collect(),
        extended: load_extended_strongs_aliases(&lexicon)?,
        known_strongs,
        untagged: 0,
        substituted: 0,
    };

    let tx = conn.transaction()?;
    let mut total = 0usize;
    {
        let mut insert = tx.prepare(
            "INSERT INTO morphology_words (book_id, chapter, verse, sort_order, original_word, lemma, morph_code, strongs_id)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        )?;
        let mut paths: Vec<_> = std::fs::read_dir(dir)?
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.file_name().and_then(|n| n.to_str()).is_some_and(|n| n.starts_with("TAGNT ")))
            .collect();
        paths.sort();

        for path in paths {
            let text = std::fs::read_to_string(&path)?;
            let mut last: Option<(i64, i64)> = None;
            let mut sort_order = 0i64;
            for line in text.lines() {
                let cols: Vec<&str> = line.split('\t').collect();
                // Word rows carry at least through the editions column; the
                // file's preamble, per-verse summary rows ("# Mat.1.1",
                // "#_Translation") and blank separators do not parse as a
                // reference and fall out here.
                if cols.len() < 6 {
                    continue;
                }
                let Some((book, chapter, verse)) = parse_tagnt_ref(cols[0]) else {
                    continue;
                };
                let Some(&osis) = state.alias_map.get(book) else { continue };
                let Some(&book_id) = state.book_lookup.get(osis) else { continue };
                // The editions column names every edition containing this word
                // ("NA28+NA27+Tyn+SBL+WH+Treg+TR+Byz"). When ours is absent the
                // word may still be in our text under a different reading, held
                // in the meaning-variants column; only if that is absent too
                // does our edition genuinely not have the word here.
                let (d_strongs, morph_code) = cols[3].split_once('=').unwrap_or((cols[3], ""));
                let mut reading = Reading { word: cols[1], d_strongs, morph_code };
                let mut substituted = false;
                if !lists_edition(cols[5], EDITION) {
                    match cols.get(6).and_then(|c| variant_reading(c, EDITION)) {
                        Some(variant) => {
                            reading = variant;
                            substituted = true;
                            state.substituted += 1;
                        }
                        None => continue,
                    }
                }

                let strongs_id = state.strongs_for(reading.d_strongs);
                if strongs_id.is_none() {
                    state.untagged += 1;
                }
                // "Dictionary form = Gloss", e.g. "βίβλος=book"; the headword can
                // itself list spellings ("Δαυείδ, Δαυίδ, Δαβίδ=David"). It
                // describes the row's own reading, so a substituted word takes
                // the headword its own Strong's entry prints instead.
                let lemma = if substituted {
                    strongs_id.as_ref().and_then(|id| state.known_strongs.get(id)).map(String::as_str)
                } else {
                    cols.get(4)
                        .and_then(|c| c.split_once('='))
                        .map(|(form, _gloss)| form.trim())
                        .filter(|f| !f.is_empty())
                };

                if last != Some((chapter, verse)) {
                    sort_order = 0;
                    last = Some((chapter, verse));
                }
                insert.execute(params![
                    book_id,
                    chapter,
                    verse,
                    sort_order,
                    greek_word(reading.word),
                    lemma,
                    reading.morph_code.trim(),
                    strongs_id,
                ])?;
                sort_order += 1;
                total += 1;
            }
        }
    }
    tx.commit()?;
    println!(
        "morphology (greek): {total} words from TAGNT's {EDITION} text \
         ({} read from its variant column, {} without a Strong's number in the bundled dictionary)",
        state.substituted, state.untagged
    );
    Ok(total)
}

pub fn import(conn: &mut Connection, dir: &Path) -> anyhow::Result<usize> {
    let book_lookup = load_book_lookup(conn)?;
    let hebrew = import_hebrew(conn, &dir.join("hebrew-tahot"))?;
    let greek = import_greek(conn, &dir.join("greek-tagnt"), &book_lookup)?;
    Ok(hebrew + greek)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_zero_padding_and_step_sense_suffixes() {
        assert_eq!(normalize_tagnt_strongs("G0976").as_deref(), Some("G976"));
        assert_eq!(normalize_tagnt_strongs("G2424G").as_deref(), Some("G2424"));
        assert_eq!(normalize_tagnt_strongs("G1492H").as_deref(), Some("G1492"));
        assert_eq!(normalize_tagnt_strongs("H1732").as_deref(), Some("H1732"));
        assert_eq!(normalize_tagnt_strongs("N-NSF"), None);
        assert_eq!(normalize_tagnt_strongs(""), None);
    }

    #[test]
    fn reads_the_reference_without_the_amalgamated_word_index() {
        assert_eq!(parse_tagnt_ref("Mat.1.1#01=NKO"), Some(("Mat", 1, 1)));
        assert_eq!(parse_tagnt_ref("1Co.13.13#07=NKO"), Some(("1Co", 13, 13)));
        // Summary rows and preamble must not look like words.
        assert_eq!(parse_tagnt_ref("# Mat.1.1"), None);
        assert_eq!(parse_tagnt_ref("#_Word=Grammar"), None);
        assert_eq!(parse_tagnt_ref("Word & Type"), None);
    }

    #[test]
    fn drops_the_transliteration_tagnt_prints_beside_the_greek() {
        assert_eq!(greek_word("Βίβλος (Biblos)"), "Βίβλος");
        assert_eq!(greek_word("ἀλλ᾽ (all᾽)"), "ἀλλ᾽");
        assert_eq!(greek_word("Βίβλος"), "Βίβλος");
        // Punctuation belongs to the word as this pane has always shown it.
        assert_eq!(greek_word("κόσμον, (kosmon)"), "κόσμον,");
        // Two words Strong's treats as one entry keep the space between them.
        assert_eq!(greek_word("μαράνα θά.¶ (marana tha)"), "μαράνα θά.");
    }

    #[test]
    fn removes_paragraph_marks_but_keeps_the_disputed_passage_brackets() {
        assert_eq!(greek_word("ὠρχήσασθε,¶¬ (ōrchēsasthe)"), "ὠρχήσασθε,");
        // The longer ending of Mark: the pilcrow falls inside the brackets.
        assert_eq!(greek_word("ἀμήν.¶]] (amēn)"), "ἀμήν.]]");
        assert_eq!(greek_word("[[Πάντα (Panta)"), "[[Πάντα");
    }

    #[test]
    fn matches_an_edition_name_whole() {
        let list = "NA28+NA27+Tyn+SBL+WH+Treg+TR+Byz";
        assert!(lists_edition(list, "TR"));
        assert!(lists_edition(list, "Treg"));
        // "TR" must not be found inside "Treg", nor "NA27" inside "NA28".
        assert!(!lists_edition("NA28+NA27+Tyn+SBL+WH+Treg", "TR"));
        assert!(!lists_edition("TR+Byz", "Treg"));
    }

    #[test]
    fn takes_our_editions_reading_from_the_variant_column() {
        // Matthew 1:18: the printed row reads γένεσις, the TR reads γέννησις.
        let column = "γέννησις (t=gennēsis) birth - G1083=N-NSF in: TR+Byz";
        let r = variant_reading(column, "TR").expect("TR reading");
        assert_eq!(greek_word(r.word), "γέννησις");
        assert_eq!(r.d_strongs, "G1083");
        assert_eq!(r.morph_code, "N-NSF");
        // An edition not named in the column has no reading here.
        assert!(variant_reading(column, "SBL").is_none());
        assert!(variant_reading("", "TR").is_none());
    }

    #[test]
    fn finds_our_reading_among_several_variants_on_one_word() {
        // Matthew 13:4 offers the TR's reading and Tregelles' side by side;
        // taking the last would silently hand us Tregelles'.
        let column = "ἦλθεν (t=ēlthen) it came - G2064=V-2AAI-3S in: TR+Byz \
                      ¦ ἦλθον (o=ēlthon) they came - G2064=V-2AAI-3P in: Treg";
        let tr = variant_reading(column, "TR").expect("TR reading");
        assert_eq!(greek_word(tr.word), "ἦλθεν");
        assert_eq!(tr.morph_code, "V-2AAI-3S");
        let treg = variant_reading(column, "Treg").expect("Treg reading");
        assert_eq!(greek_word(treg.word), "ἦλθον");
        assert_eq!(treg.morph_code, "V-2AAI-3P");
        assert!(variant_reading(column, "NA28").is_none());
    }

    #[test]
    fn an_edition_keeps_its_name_under_a_word_order_marker() {
        assert_eq!(edition_name("TR«3"), "TR");
        assert_eq!(edition_name("Byz»1"), "Byz");
        assert_eq!(edition_name("TR"), "TR");
        // Matthew 5:30: the TR has this word, three places earlier.
        let column = "βληθῇ (T=blēthē) may be cast - G0906=V-APS-3S in: TR«3+Byz«3";
        let r = variant_reading(column, "TR").expect("TR reading");
        assert_eq!(greek_word(r.word), "βληθῇ");
        assert_eq!(r.d_strongs, "G0906");
    }

    #[test]
    fn a_gloss_containing_a_dash_does_not_confuse_the_variant_split() {
        let column = "ὄχλους (t=ochlous) crowds - of people - G3793=N-APM in: Tyn+SBL+TR+Byz";
        let r = variant_reading(column, "TR").expect("TR reading");
        assert_eq!(greek_word(r.word), "ὄχλους");
        assert_eq!(r.d_strongs, "G3793");
        assert_eq!(r.morph_code, "N-APM");
    }

    #[test]
    fn reads_the_extended_to_classic_relation_tbesg_prints() {
        // Real TBESG rows: οἶδα is a form of G1492, γένημα stands alone.
        let map = parse_extended_strongs_aliases(
            "G6063\tG6063 = a Form of\tG1492H\tοἶδα\toida\tG:V\tto know\t...\n\
             G6013\tG6013 =\tG6013\tγένημα\tgenēma\tG:N-N\tproduce\t...\n",
        );
        assert_eq!(map.get("G6063").map(String::as_str), Some("G1492"));
        // An entry that is only itself is not an alias to anything.
        assert_eq!(map.get("G6013"), None);
    }
}
