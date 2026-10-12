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

/// An edition name in a list can carry a word-order marker saying
/// where that edition puts the word relative to the printed order ("TR«3" =
/// three places earlier, "Byz»1" = one place later). The edition is still the
/// TR; see `edition_offset` for the marker.
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

/// Where `list` puts `edition`'s word against the printed order, in places:
/// "TR»2" is 2 (two places later), "TR«3" is -3, a bare "TR" 0. None when
/// the list does not name the edition.
pub(crate) fn edition_offset(list: &str, edition: &str) -> Option<i64> {
    list.split('+').find(|e| edition_name(e) == edition).map(|token| {
        let token = token.trim();
        let places = |i: usize| token[i..].chars().skip(1).collect::<String>().trim().parse::<i64>().unwrap_or(0);
        match (token.find('»'), token.find('«')) {
            (Some(i), _) => places(i),
            (_, Some(i)) => -places(i),
            _ => 0,
        }
    })
}

/// An edition's own spelling of the word the row prints in another's, from
/// TAGNT's spelling-variants column: "TR: ἀνελήφθη ; " (Acts 1:2, which the
/// row prints ἀνελήμφθη), "Tyn+WH: Δαυεὶδ ; +TR: Δαβὶδ ; ". The TR was read
/// in the printed (Nestle-Aland) spelling in 1,168 places -- λήμψεσθε for
/// λήψεσθε, Δαυίδ for Δαβίδ -- under Scrivener's name.
pub(crate) fn spelling_variant<'a>(column: &'a str, edition: &str) -> Option<&'a str> {
    column.split(';').find_map(|part| {
        let (editions, word) = part.split_once(':')?;
        let word = word.trim();
        (!word.is_empty() && lists_edition(editions.trim().trim_start_matches('+'), edition)).then_some(word)
    })
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
pub(crate) fn variant_reading<'a>(column: &'a str, edition: &str) -> Option<(Reading<'a>, i64)> {
    column.split('¦').find_map(|entry| {
        let (reading, editions) = entry.rsplit_once(" in: ")?;
        let offset = edition_offset(editions.trim(), edition)?;
        // The gloss sits between the transliteration and the tagging, and may
        // itself contain " - ", so split from the right.
        let (word_and_gloss, tagging) = reading.rsplit_once(" - ")?;
        let (d_strongs, morph_code) = tagging.trim().split_once('=')?;
        Some((Reading { word: word_and_gloss.trim(), d_strongs, morph_code }, offset))
    })
}

/// One word of an edition's text, read from a TAGNT row.
#[derive(Debug, Clone)]
pub(crate) struct EditionWord {
    /// As the table shows it: the Greek with its punctuation.
    pub word: String,
    /// The word's Strong's number as TAGNT tags it ("G3165"), and its parsing
    /// code; a word merged from two (κἀγώ) has the second's after " + ".
    pub d_strongs: String,
    pub morph_code: String,
    /// Read from the variants column, not the row's printed word.
    pub substituted: bool,
    /// TAGNT's dictionary form(s) of the printed word ("ἐγώ"), and the classic
    /// Strong's numbers it gives beside its own ("G2257"): for the printed
    /// word only.
    pub lexical_forms: Vec<String>,
    pub alt_strongs: Vec<String>,
    /// One written word tagged as several (κἀγώ, οὐκέτι).
    pub merged: bool,
    /// The edition's word-order marker for the row (see `edition_offset`).
    offset: i64,
    /// The edition writes the row's word otherwise than TAGNT prints it: a
    /// spelling of its own, or a reading from the variants column.
    own_form: bool,
    /// The TR's numeral written as letters (χ̅ξ̅ς᾽, 666).
    abbreviated: bool,
}

/// Spelling variants that are slips of TAGNT's, not spellings: Matthew 17:4
/// gives the TR's Μωϋσεῖ as "μίαν", the word after it (Scrivener: "καὶ Μωσῇ
/// μίαν"). The printed word is kept.
const SPELLING_SLIPS: &[&str] = &["Mat.17.4#23="];

/// The punctuation around a printed word, to give an edition's own spelling
/// or reading of it: "ἀνελήμφθη." -> ("", "."), "[[Πάντα" -> ("[[", "").
/// TAGNT prints one punctuation, the Nestle-Aland's, for every edition. An
/// elision mark (δ᾽) is part of the word, not punctuation.
fn punctuation(word: &str) -> (&str, &str) {
    let is_letter = |c: char| c.is_alphabetic() || unicode_normalization::char::is_combining_mark(c) || matches!(c, '\u{1fbd}' | '\u{2019}' | '\u{02bc}');
    let start = word.find(is_letter).unwrap_or(word.len());
    let end = word.rfind(is_letter).map_or(start, |i| i + word[i..].chars().next().map_or(0, char::len_utf8));
    (&word[..start], &word[end.max(start)..])
}

/// The words `edition` has at this TAGNT row, in its own spelling: the
/// printed word when the editions column names the edition (in the
/// edition's spelling where the spelling-variants column gives one), else
/// the edition's reading from the variants column, or nothing.
///
/// A reading in the variants column can be several words where the printed
/// text has one -- "ὁμοιώσω αὐτὸν" (Matthew 7:24, the TR's "I will liken
/// him" for "he will be like"), "ἐν τοῖς οὐρανοῖς" -- tagged "G0846=P-ASM +
/// G3666=V-FAI-1S". Each is a word of its own with its own number and
/// parsing; read as one, the verb had the pronoun's number and a parsing
/// spliced from the two, and "I will liken" found no Greek. TAGNT does not
/// always list the tags in the words' order (ὁμοιώσω αὐτὸν above), so each
/// word takes the tag whose Strong's headword `headword` shares most of its
/// first letters with it, the listed order where that says nothing. A
/// reading of one word tagged as several (κἀκεῖθεν, "G2532=CONJ +
/// G1564=ADV") is one word, like the printed κἀγώ.
pub(crate) fn edition_row(cols: &[&str], edition: &str, headword: &dyn Fn(&str) -> Option<String>) -> Vec<EditionWord> {
    let printed = greek_word(cols[1]);
    let (lead, trail) = punctuation(&printed);
    if let Some(offset) = edition_offset(cols[5], edition) {
        let (d_strongs, morph_code) = cols[3].split_once('=').unwrap_or((cols[3], ""));
        let respelled = cols
            .get(7)
            .and_then(|c| spelling_variant(c, edition))
            .filter(|_| !SPELLING_SLIPS.iter().any(|slip| cols[0].starts_with(slip)));
        let word = match respelled {
            Some(w) => format!("{lead}{}{trail}", w.trim()),
            None => printed.clone(),
        };
        let lexical_forms = cols
            .get(4)
            .and_then(|c| c.split_once('=').map(|(f, _)| f))
            .map(|f| f.split(',').map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).collect())
            .unwrap_or_default();
        let alt_strongs = cols
            .get(12)
            .map(|c| c.split(',').map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).collect())
            .unwrap_or_default();
        return vec![EditionWord {
            word,
            d_strongs: d_strongs.trim().to_string(),
            morph_code: morph_code.trim().to_string(),
            substituted: false,
            lexical_forms,
            alt_strongs,
            merged: morph_code.contains(" + "),
            offset,
            own_form: respelled.is_some(),
            abbreviated: morph_code.trim().ends_with("-ABB"),
        }];
    }
    let Some((reading, offset)) = cols.get(6).and_then(|c| variant_reading(c, edition)) else {
        return Vec::new();
    };
    // "ὁμοιώσω αὐτὸν (T=homoiōsō auton) I will liken him": the Greek is
    // everything before the transliteration.
    let greek = reading.word.split(" (").next().unwrap_or("").replace(['¶', '¬'], "");
    let words: Vec<&str> = greek.split_whitespace().collect();
    let tags: Vec<(&str, &str)> = std::iter::once(reading.d_strongs)
        .zip(std::iter::once(reading.morph_code))
        .flat_map(|(d, m)| {
            // "G0846=P-ASM + G3666=V-FAI-1S" arrives split at the first "=".
            let mut out = vec![];
            let mut parts = m.split(" + ");
            out.push((d, parts.next().unwrap_or("")));
            for p in parts {
                let (d2, m2) = p.split_once('=').unwrap_or((p, ""));
                out.push((d2, m2));
            }
            out
        })
        .collect();
    let base = |w: &str, tag: (&str, &str), merged: bool, morph: String| EditionWord {
        word: w.to_string(),
        d_strongs: last_alternative(tag.0).to_string(),
        morph_code: morph,
        substituted: true,
        lexical_forms: Vec::new(),
        alt_strongs: Vec::new(),
        merged,
        offset,
        own_form: true,
        abbreviated: tag.1.trim().ends_with("-ABB"),
    };
    let mut out: Vec<EditionWord> = if words.len() == tags.len() && words.len() > 1 {
        let order = pair_words_with_tags(&words, &tags, headword);
        words.iter().zip(order).map(|(w, t)| base(w, tags[t], false, tags[t].1.trim().to_string())).collect()
    } else if words.is_empty() {
        Vec::new()
    } else {
        // One word (or a count that does not match): the row's tagging whole.
        vec![base(&words.join(" "), tags[0], tags.len() > 1, reading.morph_code.trim().to_string())]
    };
    // The printed word's punctuation, around the reading.
    if let Some(first) = out.first_mut() {
        if punctuation(&first.word).0.is_empty() {
            first.word.insert_str(0, lead);
        }
    }
    if let Some(last) = out.last_mut() {
        if punctuation(&last.word).1.is_empty() {
            last.word.push_str(trail);
        }
    }
    out
}

/// "G0846|G3165«G3450" -- TAGNT's way of giving a number with the one it
/// stands for -- is the last of them, the classic number (G3450, μου).
fn last_alternative(d: &str) -> &str {
    d.rsplit(['|', '«']).next().unwrap_or(d).trim()
}

/// For each word, the index of its tag: the pairing whose headwords share
/// the most first letters with the words, the listed order on a tie.
fn pair_words_with_tags(words: &[&str], tags: &[(&str, &str)], headword: &dyn Fn(&str) -> Option<String>) -> Vec<usize> {
    let heads: Vec<String> = tags
        .iter()
        .map(|(d, _)| normalize_tagnt_strongs(last_alternative(d)).and_then(|id| headword(&id)).map(|h| crate::plain::plain_word(&h)).unwrap_or_default())
        .collect();
    let plain: Vec<String> = words.iter().map(|w| crate::plain::plain_word(w)).collect();
    let shared = |a: &str, b: &str| a.chars().zip(b.chars()).take_while(|(x, y)| x == y).count();
    let mut best: Vec<usize> = (0..words.len()).collect();
    let mut best_score = 0;
    let mut perm: Vec<usize> = (0..words.len()).collect();
    // At most three words: every order is tried.
    permutations(&mut perm, 0, &mut |p| {
        let score: usize = p.iter().enumerate().map(|(w, &t)| shared(&plain[w], &heads[t])).sum();
        if score > best_score {
            best_score = score;
            best = p.to_vec();
        }
    });
    best
}

fn permutations(p: &mut Vec<usize>, k: usize, f: &mut dyn FnMut(&[usize])) {
    if k == p.len() {
        f(p);
        return;
    }
    for i in k..p.len() {
        p.swap(k, i);
        permutations(p, k + 1, f);
        p.swap(k, i);
    }
}

/// A verse of an edition from its rows (each row's words, in TAGNT's printed
/// order), in the edition's order.
///
/// TAGNT prints the words in the Nestle-Aland's order and marks where
/// another edition puts one ("TR»2": two places later). Kept in the printed
/// order, 1,410 words of the TR stood out of Scrivener's: Matthew 7:24 read
/// "ᾠκοδόμησεν αὐτοῦ τὴν οἰκίαν" for his "ᾠκοδόμησε τὴν οἰκίαν αὐτοῦ". Each
/// row goes where its marker puts it, among the edition's rows.
///
/// A row moved onto a word the edition writes as one with it is that word's
/// already, and has no place of its own: καί onto κἀκείνοις (Matthew 20:4),
/// μεγάλα onto μεγαλαυχεῖ (James 3:5), κατά onto καταμόνας -- the word the
/// edition writes begins with the moved one (all but its last letter), or
/// ends with it (ἀνακειμένων in συνανακειμένων) -- and a number spelled out
/// onto the numeral the TR writes in letters, "ἑξακόσιοι ἑξήκοντα" onto
/// χ̅ξ̅ς᾽ (Revelation 13:18), which printed 666 twice.
pub(crate) fn edition_verse(rows: Vec<Vec<EditionWord>>) -> Vec<EditionWord> {
    let n = rows.len();
    let merged_away = |i: usize| -> bool {
        let Some(word) = rows[i].first().filter(|_| rows[i].len() == 1) else { return false };
        if word.offset <= 0 {
            return false;
        }
        let Some(target) = rows.get(i + word.offset as usize).and_then(|r| r.first()) else { return false };
        if target.abbreviated {
            return word.morph_code.starts_with("A-NUI");
        }
        if !target.own_form {
            return false;
        }
        let moved = crate::plain::plain_word(&word.word);
        let written: String = rows[i + word.offset as usize].iter().map(|w| crate::plain::plain_word(&w.word)).collect();
        let stem: String = moved.chars().take(moved.chars().count().saturating_sub(1)).collect();
        moved.chars().count() >= 2 && written != moved && (written.starts_with(&stem) || written.ends_with(&moved))
    };
    let keep: Vec<bool> = (0..n).map(|i| !merged_away(i)).collect();
    let mut placed: Vec<(f64, usize, usize, EditionWord)> = Vec::new();
    let mut index = 0usize;
    for (i, row) in rows.into_iter().enumerate() {
        if !keep[i] || row.is_empty() {
            continue;
        }
        let offset = row[0].offset;
        let at = index as f64;
        let key = match offset {
            0 => at,
            d if d > 0 => at + d as f64 + 0.5,
            d => at + d as f64 - 0.5,
        };
        for (part, w) in row.into_iter().enumerate() {
            placed.push((key, index, part, w));
        }
        index += 1;
    }
    // Two rows moved to the same place: a marker counts the printed words a
    // row passes, the other's among them, so the one that started later
    // stands first. Luke 3:16 prints "λέγων (TR»3) πᾶσιν (the TR's ἅπασιν,
    // TR»2) ὁ Ἰωάννης"; both go after Ἰωάννης, and λέγων passed ἅπασιν:
    // "ὁ Ἰωάννης ἅπασιν λέγων".
    placed.sort_by(|a, b| a.0.total_cmp(&b.0).then(b.1.cmp(&a.1)).then(a.2.cmp(&b.2)));
    placed.into_iter().map(|(_, _, _, w)| w).collect()
}

struct GreekImport<'a> {
    book_lookup: &'a HashMap<String, i64>,
    alias_map: HashMap<&'a str, &'a str>,
    extended: HashMap<String, String>,
    known_strongs: HashMap<String, String>,
    /// Greek entries by their headword's bare letters.
    by_headword: HashMap<String, String>,
    untagged: usize,
    substituted: usize,
}

impl GreekImport<'_> {
    /// The Strong's id to link this word to, or None when TAGNT's number has no
    /// counterpart in the bundled Strong's dictionary (see
    /// `load_extended_strongs_aliases`) -- the word still shows, it just isn't
    /// clickable.
    fn strongs_for(&self, d_strongs: &str) -> Option<String> {
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

    /// The Strong's entry for a word: TAGNT's number, unless that entry is
    /// not the word's.
    ///
    /// TAGNT files every oblique and plural form of "I" under G3165, μέ,
    /// "me" -- ἡμῶν, ἡμῖν, ἡμᾶς, ἡμεῖς, μου, μοι, 1,963 words -- and a word
    /// merged from two, or a compound, under its first part: κἀγώ under
    /// ἐγώ, μήποτε under μή, σεαυτοῦ under σύ, κἀκεῖνος under καί. The card
    /// then gave ἡμῶν ("us") the headword μέ and the definition "me". Where
    /// the entry's headword is neither the word nor TAGNT's own dictionary
    /// form of it, and TAGNT's column of classic Strong's numbers has one
    /// whose headword is (G2257 ἡμῶν, G2504 κἀγώ, G3379 μήποτε), that is the
    /// word's entry -- and the number the KJV's phrase above it carries. A
    /// word merged from two with no such number takes Strong's entry spelled
    /// as it is, if there is one (κἀκεῖθεν, G2547). A word with no number
    /// in the dictionary at all takes the first classic number TAGNT gives
    /// it: κατωτέρω (Matthew 2:16), which Strong's prints under κάτω, G2736.
    fn resolve(&self, w: &EditionWord) -> Option<String> {
        let first = self.strongs_for(&w.d_strongs);
        let word = crate::plain::plain_word(&w.word);
        let forms: Vec<String> = w.lexical_forms.iter().map(|f| crate::plain::plain_word(f)).collect();
        let fits = |id: &str| {
            self.known_strongs
                .get(id)
                .map(|h| crate::plain::plain_word(h))
                .is_some_and(|h| !h.is_empty() && (h == word || forms.contains(&h)))
        };
        // A word the edition spells as a word of its own -- the καί of Acts
        // 10:26 written into its ἐγώ, κἀγώ -- is that word's, where Strong's
        // has it: TAGNT's number and forms are the printed word's.
        if w.own_form && !w.substituted {
            if let Some(id) = self.by_headword.get(&word).filter(|id| first.as_ref() != Some(*id)) {
                return Some(id.clone());
            }
        }
        if !w.merged && first.as_deref().is_some_and(fits) {
            return first;
        }
        // How many first letters an entry's headword shares with the word.
        // The classic number must be at least as near the word as TAGNT's:
        // Luke 21:5's ἀναθήμασιν is ἀνάθημα (G334), not the ἀνάθεμα (G331)
        // that TAGNT's dictionary form and classic column give it.
        let near = |id: &str| {
            let h = self.known_strongs.get(id).map(|h| crate::plain::plain_word(h)).unwrap_or_default();
            h.chars().zip(word.chars()).take_while(|(a, b)| a == b).count()
        };
        let own = first.as_deref().map_or(0, near);
        if let Some(id) = w.alt_strongs.iter().filter_map(|a| self.strongs_for(a)).find(|id| fits(id) && (w.merged || near(id) >= own)) {
            return Some(id);
        }
        if w.merged {
            if let Some(id) = self.by_headword.get(&word) {
                return Some(id.clone());
            }
        }
        first.or_else(|| w.alt_strongs.iter().find_map(|a| self.strongs_for(a)))
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
    let by_headword: HashMap<String, String> = known_strongs
        .iter()
        .filter(|(id, h)| id.starts_with('G') && !h.is_empty())
        .map(|(id, h)| (crate::plain::plain_word(h), id.clone()))
        .collect();
    let mut state = GreekImport {
        book_lookup,
        alias_map: GREEK_BOOK_ALIASES.iter().copied().collect(),
        extended: load_extended_strongs_aliases(&lexicon)?,
        known_strongs,
        by_headword,
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

        let mut insert_verse = |key: (i64, i64, i64), rows: Vec<Vec<EditionWord>>, state: &mut GreekImport| -> anyhow::Result<usize> {
            let words = edition_verse(rows);
            for (sort_order, w) in words.iter().enumerate() {
                let strongs_id = state.resolve(w);
                if strongs_id.is_none() {
                    state.untagged += 1;
                }
                if w.substituted {
                    state.substituted += 1;
                }
                // "Dictionary form = Gloss", e.g. "βίβλος=book"; the headword can
                // itself list spellings ("Δαυείδ, Δαυίδ, Δαβίδ=David"). It
                // describes the row's own reading, so a substituted word, and a
                // word given another entry than TAGNT's, takes the headword its
                // own Strong's entry prints instead.
                let tagged = state.strongs_for(&w.d_strongs);
                let lemma = if w.substituted || strongs_id != tagged && strongs_id.is_some() {
                    strongs_id.as_ref().and_then(|id| state.known_strongs.get(id)).cloned()
                } else {
                    w.lexical_forms.first().is_some().then(|| w.lexical_forms.join(", "))
                };
                insert.execute(params![key.0, key.1, key.2, sort_order as i64, w.word, lemma, w.morph_code, strongs_id])?;
            }
            Ok(words.len())
        };
        for path in paths {
            let text = std::fs::read_to_string(&path)?;
            let mut current: Option<(i64, i64, i64)> = None;
            let mut rows: Vec<Vec<EditionWord>> = Vec::new();
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
                let key = (book_id, chapter, verse);
                if current != Some(key) {
                    if let Some(done) = current.take() {
                        total += insert_verse(done, std::mem::take(&mut rows), &mut state)?;
                    }
                    current = Some(key);
                }
                // The editions column names every edition containing this word
                // ("NA28+NA27+Tyn+SBL+WH+Treg+TR+Byz"). When ours is absent the
                // word may still be in our text under a different reading, held
                // in the meaning-variants column; only if that is absent too
                // does our edition genuinely not have the word here.
                let known = &state.known_strongs;
                let words = edition_row(&cols, EDITION, &|id: &str| known.get(id).cloned());
                if !words.is_empty() {
                    rows.push(words);
                }
            }
            if let Some(done) = current.take() {
                total += insert_verse(done, std::mem::take(&mut rows), &mut state)?;
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
        let (r, _) = variant_reading(column, "TR").expect("TR reading");
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
        let (tr, _) = variant_reading(column, "TR").expect("TR reading");
        assert_eq!(greek_word(tr.word), "ἦλθεν");
        assert_eq!(tr.morph_code, "V-2AAI-3S");
        let (treg, _) = variant_reading(column, "Treg").expect("Treg reading");
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
        let (r, offset) = variant_reading(column, "TR").expect("TR reading");
        assert_eq!(offset, -3);
        assert_eq!(greek_word(r.word), "βληθῇ");
        assert_eq!(r.d_strongs, "G0906");
    }

    #[test]
    fn a_gloss_containing_a_dash_does_not_confuse_the_variant_split() {
        let column = "ὄχλους (t=ochlous) crowds - of people - G3793=N-APM in: Tyn+SBL+TR+Byz";
        let (r, _) = variant_reading(column, "TR").expect("TR reading");
        assert_eq!(greek_word(r.word), "ὄχλους");
        assert_eq!(r.d_strongs, "G3793");
        assert_eq!(r.morph_code, "N-APM");
    }

    fn row(line: &str) -> Vec<&str> {
        line.split('\t').collect()
    }

    fn texts(words: &[EditionWord]) -> Vec<&str> {
        words.iter().map(|w| w.word.as_str()).collect()
    }

    #[test]
    fn an_edition_has_its_own_spelling_with_the_printed_punctuation() {
        // Acts 1:2: TAGNT prints ἀνελήμφθη., the TR spells it ἀνελήφθη.
        let cols = row("Act.1.2#12=NKO\tἀνελήμφθη. (anelēmphthē)\tHe was taken up.\tG0353=V-API-3S\tἀναλαμβάνω=to take up\tNA28+NA27+Tyn+SBL+WH+Treg+TR+Byz\t\tTR: ἀνελήφθη ; \tfue tomado hacia arriba\tto take up\t#12\tG0353\t");
        assert_eq!(texts(&edition_row(&cols, "TR", &|_| None)), ["ἀνελήφθη."]);
        assert_eq!(texts(&edition_row(&cols, "Byz", &|_| None)), ["ἀνελήμφθη."]);
        assert_eq!(spelling_variant("Tyn+WH: Δαυεὶδ ; +TR: Δαβὶδ ; ", "TR"), Some("Δαβὶδ"));
        assert_eq!(spelling_variant("Tyn+WH: Δαυεὶδ ; +TR: Δαβὶδ ; ", "WH"), Some("Δαυεὶδ"));
        // The elision mark is the word's, not punctuation.
        assert_eq!(punctuation("ἀλλ᾽"), ("", ""));
        assert_eq!(punctuation("ἀμήν.]]"), ("", ".]]"));
        assert_eq!(punctuation("[[Πάντα"), ("[[", ""));
    }

    #[test]
    fn a_reading_of_several_words_is_several_words_each_with_its_own_tag() {
        // Matthew 7:24: the TR's "ὁμοιώσω αὐτὸν", tagged pronoun first.
        let cols = row("Mat.7.24#12=N(K)O\tὁμοιωθήσεται (homoiōthēsetai)\the will be like\tG3666=V-FPI-3S\tὁμοιόω=to liken\tNA28+NA27+Tyn+SBL+WH+Treg\tὁμοιώσω αὐτὸν (T=homoiōsō auton) I will liken him - G0846=P-ASM + G3666=V-FAI-1S in: TR+Byz\t\tserá hecho semejante\tto liken\t#12\tG3666\tG0846, G3778");
        let heads = |id: &str| match id {
            "G846" => Some("αὐτός".to_string()),
            "G3666" => Some("ὁμοιόω".to_string()),
            _ => None,
        };
        let words = edition_row(&cols, "TR", &heads);
        assert_eq!(texts(&words), ["ὁμοιώσω", "αὐτὸν"]);
        assert_eq!((words[0].d_strongs.as_str(), words[0].morph_code.as_str()), ("G3666", "V-FAI-1S"));
        assert_eq!((words[1].d_strongs.as_str(), words[1].morph_code.as_str()), ("G0846", "P-ASM"));
        assert!(words.iter().all(|w| w.substituted));
        // TAGNT's "number that stands for another" is the classic number.
        assert_eq!(last_alternative("G0846|G3165«G3450"), "G3450");
    }

    #[test]
    fn an_edition_is_in_its_own_word_order() {
        // Luke 3:16: the TR's "ἀπεκρίνατο ὁ Ἰωάννης ἅπασι λέγων".
        let lines = [
            "Luk.3.16#01=NKO\tἀπεκρίνατο (apekrinato)\tAnswered\tG0611=V-ADI-3S\tἀποκρίνω=to answer\tNA28+NA27+Tyn+SBL+WH+Treg+TR+Byz\t\t\tRespondió\tanswered\t#01\tG0611\t",
            "Luk.3.16#02=NKO\tλέγων (legōn)\tsaying\tG3004G=V-PAP-NSM\tλέγω=to speak\tNA28+NA27+Tyn+SBL+WH+Treg»3+TR»3+Byz»3\t\t\testando diciendo\tspeak\t#02\tG3004\t",
            "Luk.3.16#03=N(k)O\tπᾶσιν (pasin)\t[to] all\tG3956=A-DPM\tπᾶς=all\tNA28+NA27+Tyn+SBL+WH\tἅπασιν (t=hapasin) [to] all - G0537=A-DPM in: Treg»2+TR»2+Byz»2\t\ta todos\tall\t#03\tG3956\tG0537",
            "Luk.3.16#04=NKO\tὁ (ho)\t<the>\tG3588=T-NSM\tὁ=the/this/who\tNA28+NA27+Tyn+SBL+WH+Treg+TR+Byz\t\t\tel\tthe\t#04»05:G2491\tG3588_A\t",
            "Luk.3.16#05=NKO\tἸωάννης· (Iōannēs)\tJohn:\tG2491G=N-NSM-P\tἸωάννης=John\tNA28+NA27+Tyn+SBL+WH+Treg+TR+Byz\t\tWH: Ἰωάνης ; \tJuan\tJohn\t#05\tG2491\t",
        ];
        let verse = |edition: &str| {
            let rows: Vec<Vec<EditionWord>> = lines.iter().map(|l| edition_row(&row(l), edition, &|_| None)).filter(|r| !r.is_empty()).collect();
            edition_verse(rows).into_iter().map(|w| w.word).collect::<Vec<_>>().join(" ")
        };
        assert_eq!(verse("TR"), "ἀπεκρίνατο ὁ Ἰωάννης· ἅπασιν λέγων");
        assert_eq!(verse("WH"), "ἀπεκρίνατο λέγων πᾶσιν ὁ Ἰωάνης·");
        assert_eq!(edition_offset("NA28+Treg»3+TR»3", "TR"), Some(3));
        assert_eq!(edition_offset("TR«4+Byz«4", "Byz"), Some(-4));
        assert_eq!(edition_offset("NA28+Treg", "TR"), None);
    }

    #[test]
    fn a_word_moved_onto_the_one_the_edition_writes_it_into_is_not_written_twice() {
        let word = |w: &str, morph: &str, offset: i64, own_form: bool, abbreviated: bool| EditionWord {
            word: w.to_string(),
            d_strongs: String::new(),
            morph_code: morph.to_string(),
            substituted: false,
            lexical_forms: Vec::new(),
            alt_strongs: Vec::new(),
            merged: false,
            offset,
            own_form,
            abbreviated,
        };
        let text = |rows: Vec<Vec<EditionWord>>| edition_verse(rows).into_iter().map(|w| w.word).collect::<Vec<_>>().join(" ");
        // Matthew 20:4: καί (TR»1) onto ἐκείνοις, which the TR spells κἀκείνοις.
        assert_eq!(
            text(vec![vec![word("καὶ", "CONJ", 1, false, false)], vec![word("κἀκείνοις", "D-DPM", 0, true, false)], vec![word("εἶπεν·", "V", 0, false, false)]]),
            "κἀκείνοις εἶπεν·"
        );
        // Revelation 13:18: the numbers spelled out onto the TR's χ̅ξ̅ς᾽.
        assert_eq!(
            text(vec![
                vec![word("αὐτοῦ", "P-GSN", 0, false, false)],
                vec![word("ἑξακόσιοι", "A-NUI", 2, false, false)],
                vec![word("ἑξήκοντα", "A-NUI", 1, false, false)],
                vec![word("χ̅ξ̅ς᾽.", "A-NPM-ABB", 0, true, true)],
            ]),
            "αὐτοῦ χ̅ξ̅ς᾽."
        );
        // A move onto a word the edition only spells otherwise is a move
        // (Mark 10:4, ἐπέτρεψεν after the TR's Μωσῆς).
        assert_eq!(
            text(vec![vec![word("ἐπέτρεψεν", "V", 1, false, false)], vec![word("Μωσῆς", "N", 0, true, false)]]),
            "Μωσῆς ἐπέτρεψεν"
        );
    }

    #[test]
    fn a_word_is_given_its_own_strongs_entry_where_tagnts_number_names_another_word() {
        let known: HashMap<String, String> = [
            ("G3165", "μέ"), ("G2257", "ἡμῶν"), ("G3450", "μοῦ"), ("G1473", "ἐγώ"), ("G2504", "κἀγώ"),
            ("G2532", "καί"), ("G2547", "κἀκεῖθεν"), ("G611", "ἀποκρίνομαι"), ("G2736", "κάτω"), ("G2737", "κατώτερος"),
        ]
        .iter()
        .map(|(a, b)| (a.to_string(), b.to_string()))
        .collect();
        let lookup = HashMap::new();
        let state = GreekImport {
            book_lookup: &lookup,
            alias_map: HashMap::new(),
            extended: HashMap::new(),
            by_headword: known.iter().map(|(id, h)| (crate::plain::plain_word(h), id.clone())).collect(),
            known_strongs: known,
            untagged: 0,
            substituted: 0,
        };
        let w = |word: &str, d: &str, morph: &str, forms: &[&str], alt: &[&str], substituted: bool| EditionWord {
            word: word.to_string(),
            d_strongs: d.to_string(),
            morph_code: morph.to_string(),
            substituted,
            lexical_forms: forms.iter().map(|s| s.to_string()).collect(),
            alt_strongs: alt.iter().map(|s| s.to_string()).collect(),
            merged: morph.contains(" + "),
            offset: 0,
            own_form: false,
            abbreviated: false,
        };
        // Matthew 1:23's ἡμῶν, "us": not μέ, "me".
        assert_eq!(state.resolve(&w("ἡμῶν", "G3165", "P-1GP", &["ἐγώ"], &["G2257"], false)).as_deref(), Some("G2257"));
        assert_eq!(state.resolve(&w("μου,", "G3165", "P-1GS", &["ἐγώ"], &["G3450"], false)).as_deref(), Some("G3450"));
        // με is μέ.
        assert_eq!(state.resolve(&w("με", "G3165", "P-1AS", &["ἐγώ"], &[], false)).as_deref(), Some("G3165"));
        // κἀγώ, and I: Strong's κἀγώ, not ἐγώ.
        assert_eq!(state.resolve(&w("κἀγὼ", "G1473", "P-1NS + G2532=CONJ", &["κἀγώ"], &["G2504"], false)).as_deref(), Some("G2504"));
        // A reading merged from two with no classic number given: the entry
        // spelled as it is.
        assert_eq!(state.resolve(&w("κἀκεῖθεν", "G2532", "CONJ + G1564=ADV", &[], &[], true)).as_deref(), Some("G2547"));
        // A deponent under its active form is the same word: left alone.
        assert_eq!(state.resolve(&w("ἀποκριθεὶς", "G0611", "V-ADP-NSM", &["ἀποκρίνω"], &[], false)).as_deref(), Some("G611"));
        // Acts 10:26: the TR writes the printed ἐγώ as κἀγώ.
        let respelled = EditionWord { own_form: true, ..w("κἀγὼ", "G1473", "P-1NS", &["ἐγώ"], &[], false) };
        assert_eq!(state.resolve(&respelled).as_deref(), Some("G2504"));
        // No number in the dictionary: the first classic one TAGNT gives.
        assert_eq!(state.resolve(&w("κατωτέρω", "G6053", "ADV", &["κατωτέρω"], &["G2736", "G2737"], false)).as_deref(), Some("G2736"));
        // A classic number further from the word than TAGNT's is not taken.
        let far = GreekImport {
            known_strongs: [("G334", "ἀνάθημα"), ("G331", "ἀνάθεμα")].iter().map(|(a, b)| (a.to_string(), b.to_string())).collect(),
            by_headword: HashMap::new(),
            ..state
        };
        assert_eq!(far.resolve(&w("ἀναθήμασιν", "G0334", "N-DPN", &["ἀνάθεμα"], &["G0331"], false)).as_deref(), Some("G334"));
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
