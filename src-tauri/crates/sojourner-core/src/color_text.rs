//! Color text: every person, place, time and number in a verse, colored by
//! what it is (see reference/color_text and tools/build-color-text.py).
//!
//! The tagging exists for the KJV only, as character spans in its verses
//! (`color_tags`). Every other translation is colored from the KJV verse it
//! stands beside, one verse at a time, when a chapter is opened -- so a
//! translation a reader adds later is colored the same way as the bundled
//! ones. How depends on the translation's script:
//!
//! * **English and other Latin-script texts** ([`project_words`]): the two
//!   verses are lined up word by word (longest common subsequence over
//!   word keys that fold old forms into new, "thee" into "you", "LORD" and
//!   "Jehovah" into "Yahweh"). A word lined up with a colored KJV word takes
//!   its color; a short run of unmatched words between two lined-up ones
//!   takes the colors of the same-length run opposite it ("an husbandman" /
//!   "a farmer"). What is left can still be colored by the same word
//!   elsewhere in the KJV verse, by a name spelled close to a colored KJV
//!   name (Douay's "Josue" for "Joshua"), or by the word list.
//! * **Greek and Hebrew** ([`project_strongs`]): a colored KJV phrase has a
//!   Strong's number in `interlinear_words`, and the Greek or Hebrew word
//!   with that number in `morphology_words` takes the phrase's color.
//! * **Anything else** (the Vulgate, the Septuagint, which no Strong's data
//!   covers) gets only the word lists and the close-spelled names.
//!
//! Word lists ([`Lexicon`]) are built when content.db is: a KJV word, or a
//! Greek or Hebrew form, that takes one color nearly every time it appears.
//! A word list only colors a word when the KJV verse has that color
//! somewhere, which keeps "spiritus" (wind or spirit) from coloring as the
//! Holy Spirit in a verse about the wind.
//!
//! Offsets are byte offsets into the verse text throughout; the command that
//! returns spans to the page converts them to UTF-16 units.

use crate::plain::plain_word;
use std::collections::{HashMap, HashSet};

/// A colored stretch of a verse: byte offsets into its text, the category
/// code ("GF", "PN", ...) and the KJV term it stands for, lower-cased, which
/// is what "every verse with this word in this color" looks up.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Span {
    pub start: usize,
    pub end: usize,
    pub code: String,
    pub term: String,
}

/// One word of a verse: its byte range and the key it's compared by.
#[derive(Debug, Clone)]
struct Word {
    start: usize,
    end: usize,
    key: String,
    capitalized: bool,
}

/// Codes a name can carry, for the close-spelling match.
const NAME_CODES: &[&str] = &["GF", "GS", "HS", "AN", "DE", "PN", "PG", "PP"];

/// Old English forms folded into the forms modern translations use, and
/// names of God folded together, so the two line up as the same word.
fn fold(key: &str) -> &str {
    match key {
        "thou" | "thee" | "ye" => "you",
        "thy" | "thine" | "yours" => "your",
        "lord" | "jehovah" | "yahweh" | "jah" => "yahweh",
        "ghost" => "spirit",
        "unto" => "to",
        "an" => "a",
        "saith" => "says",
        "spake" => "spoke",
        "hath" => "has",
        "doth" => "does",
        "shew" | "shewed" => "show",
        _ => key,
    }
}

/// The words of a Latin-script verse. Letters and digits make a word
/// (accents dropped, so "Israël" is "israel"); a hyphen inside a word keeps
/// it whole ("Beth-el" is "bethel"); an apostrophe splits it, so "God" in
/// "God's" is its own word; a number keeps its thousands commas ("603,550").
fn latin_words(text: &str) -> Vec<Word> {
    let mut out = Vec::new();
    let chars: Vec<(usize, char)> = text.char_indices().collect();
    let mut i = 0;
    while i < chars.len() {
        let (start, c) = chars[i];
        if !c.is_alphanumeric() {
            i += 1;
            continue;
        }
        let mut j = i + 1;
        while j < chars.len() {
            let (_, d) = chars[j];
            let joins = |k: usize| k + 1 < chars.len() && chars[k + 1].1.is_alphanumeric();
            if d.is_alphanumeric() || unicode_normalization::char::is_combining_mark(d) {
                j += 1;
            } else if matches!(d, '-' | '\u{2010}' | '\u{2011}') && joins(j) {
                j += 1;
            } else if d == ',' && c.is_ascii_digit() && chars[j - 1].1.is_ascii_digit() && joins(j) && chars[j + 1].1.is_ascii_digit() {
                j += 1;
            } else if d == ',' && c.is_ascii_digit() && chars[j - 1].1.is_ascii_digit() && thousands_after_space(&chars, j) {
                // "6, 720", as some editions print 6,720.
                j += 2;
            } else {
                break;
            }
        }
        let end = if j < chars.len() { chars[j].0 } else { text.len() };
        let raw = &text[start..end];
        let key: String = plain_word(raw);
        out.push(Word { start, end, capitalized: c.is_uppercase(), key: fold(&key).to_string() });
        i = j;
    }
    out
}

/// Whether the comma at `j` is followed by a space and exactly three digits.
fn thousands_after_space(chars: &[(usize, char)], j: usize) -> bool {
    let digit = |k: usize| chars.get(k).is_some_and(|c| c.1.is_ascii_digit());
    chars.get(j + 1).is_some_and(|c| c.1 == ' ') && digit(j + 2) && digit(j + 3) && digit(j + 4) && !digit(j + 5)
}

/// The words of a Greek or Hebrew verse: split at spaces, the maqaf and
/// punctuation; compared by their bare letters (`plain_word`).
fn original_words(text: &str) -> Vec<Word> {
    let is_letter = |c: char| c.is_alphabetic() || unicode_normalization::char::is_combining_mark(c) || matches!(c, '\u{1fbd}' | '\u{2019}' | '\u{02bc}');
    let mut out = Vec::new();
    let mut start: Option<usize> = None;
    for (i, c) in text.char_indices().chain(std::iter::once((text.len(), ' '))) {
        if is_letter(c) && c != '\u{05be}' {
            start.get_or_insert(i);
        } else if let Some(s) = start.take() {
            let raw = &text[s..i];
            out.push(Word { start: s, end: i, key: plain_word(raw), capitalized: false });
        }
    }
    out
}

/// What the KJV verse says about each of its words: the index of the tag
/// covering it, if any.
fn tag_of_words(words: &[Word], tags: &[Span]) -> Vec<Option<usize>> {
    words
        .iter()
        .map(|w| tags.iter().position(|t| t.start <= w.start && w.end <= t.end))
        .collect()
}

/// Each word of a KJV verse by its key, with the tag covering it: what the
/// English word list is counted from.
pub fn kjv_word_tags(kjv_text: &str, tags: &[Span]) -> Vec<(String, Option<usize>)> {
    let words = latin_words(kjv_text);
    let t = tag_of_words(&words, tags);
    words.into_iter().map(|w| w.key).zip(t).collect()
}

/// Longest common subsequence of two key lists, as index pairs in order.
fn lcs(a: &[&str], b: &[&str]) -> Vec<(usize, usize)> {
    let (n, m) = (a.len(), b.len());
    let mut dp = vec![0u16; (n + 1) * (m + 1)];
    let at = |i: usize, j: usize| i * (m + 1) + j;
    for i in (0..n).rev() {
        for j in (0..m).rev() {
            dp[at(i, j)] = if a[i] == b[j] { dp[at(i + 1, j + 1)] + 1 } else { dp[at(i + 1, j)].max(dp[at(i, j + 1)]) };
        }
    }
    let (mut i, mut j) = (0, 0);
    let mut out = Vec::new();
    while i < n && j < m {
        if a[i] == b[j] {
            out.push((i, j));
            i += 1;
            j += 1;
        } else if dp[at(i + 1, j)] >= dp[at(i, j + 1)] {
            i += 1;
        } else {
            j += 1;
        }
    }
    out
}

/// How alike two names are, 0 to 1, after folding the spellings that differ
/// most between traditions (j/i, v/u, y/i, ph/f, a silent h, doubled letters).
fn name_likeness(a: &str, b: &str) -> f64 {
    fn norm(s: &str) -> Vec<char> {
        let s = s.replace("ph", "f").replace('h', "");
        let mut out: Vec<char> = Vec::new();
        for c in s.chars() {
            let c = match c {
                'j' | 'y' => 'i',
                'v' => 'u',
                'k' => 'c',
                'z' => 's',
                c => c,
            };
            if out.last() != Some(&c) {
                out.push(c);
            }
        }
        out
    }
    let (a, b) = (norm(a), norm(b));
    if a.is_empty() || b.is_empty() || a[0] != b[0] {
        return 0.0;
    }
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    for (i, ca) in a.iter().enumerate() {
        let mut cur = vec![i + 1; b.len() + 1];
        for (j, cb) in b.iter().enumerate() {
            cur[j + 1] = (prev[j] + usize::from(ca != cb)).min(prev[j + 1] + 1).min(cur[j] + 1);
        }
        prev = cur;
    }
    1.0 - prev[b.len()] as f64 / a.len().max(b.len()) as f64
}

/// Words that always or nearly always take one color, by language:
/// "en" from the KJV, "grc" and "hbo" from the Greek and Hebrew words the
/// KJV's colors reach through Strong's, "la" a short hand-made list.
#[derive(Default)]
pub struct Lexicon {
    words: HashMap<(String, String), (String, String)>,
}

impl Lexicon {
    pub fn insert(&mut self, lang: &str, form: &str, code: &str, term: &str) {
        self.words.insert((lang.to_string(), form.to_string()), (code.to_string(), term.to_string()));
    }

    fn get(&self, lang: &str, form: &str) -> Option<&(String, String)> {
        self.words.get(&(lang.to_string(), form.to_string()))
    }
}

/// A word's color from the word list. The KJV verse decides whether it
/// applies: a KJV tag with the same term gives its color ("filius" is the Son
/// where the KJV's "son" is), otherwise the verse must have the list's color
/// somewhere.
fn from_lexicon(lexicon: &Lexicon, lang: &str, w: &Word, tags: &[Span]) -> Option<Span> {
    let (code, term) = lexicon.get(lang, &w.key)?;
    let code = match tags.iter().find(|t| &t.term == term) {
        Some(t) => t.code.clone(),
        None if tags.iter().any(|t| &t.code == code) => code.clone(),
        None => return None,
    };
    Some(Span { start: w.start, end: w.end, code, term: term.clone() })
}

/// Small words that carry a color only as part of a longer KJV term ("the
/// Prince of Peace"), never by themselves in another translation.
const FILLER: &[&str] = &["the", "a", "of", "and", "to", "in", "that", "which", "for", "with", "by", "from", "on", "at", "into", "as"];

/// Number words, as one word or run together ("thirtyfive" from "thirty-five").
fn is_number_word(key: &str) -> bool {
    const ROOTS: &[&str] = &[
        "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
        "sixteen", "seventeen", "eighteen", "nineteen", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety", "hundred",
        "thousand", "score",
    ];
    fn rest(s: &str) -> bool {
        s.is_empty() || ROOTS.iter().any(|r| s.strip_prefix(r).is_some_and(rest))
    }
    key.starts_with(|c: char| c.is_ascii_digit()) || (!key.is_empty() && rest(key))
}

/// Colors for a Latin-script verse from the KJV verse it stands beside.
/// `lang` picks the word list: "en" for English, "la" for Latin. Only English
/// is lined up word by word; a Latin text shares too few words with the KJV
/// for that to mean anything.
pub fn project_words(kjv_text: &str, tags: &[Span], text: &str, lang: &str, lexicon: &Lexicon) -> Vec<Span> {
    let kjv = latin_words(kjv_text);
    let kjv_tag = tag_of_words(&kjv, tags);
    let target = latin_words(text);
    // The KJV tag each target word takes, and the KJV word it came through
    // with whether the two are the same word (lined up) or only opposite
    // each other.
    let mut from_tag: Vec<Option<usize>> = vec![None; target.len()];
    let mut source: Vec<Option<(usize, bool)>> = vec![None; target.len()];

    if lang == "en" {
        let a: Vec<&str> = kjv.iter().map(|w| w.key.as_str()).collect();
        let b: Vec<&str> = target.iter().map(|w| w.key.as_str()).collect();
        let pairs = lcs(&a, &b);
        // Anchors with sentinels at both ends, so the gaps before the first
        // and after the last lined-up word are handled the same way.
        let mut anchors = vec![(usize::MAX, usize::MAX)];
        anchors.extend(pairs.iter().copied());
        anchors.push((kjv.len(), target.len()));
        for win in anchors.windows(2) {
            let (pi, pj) = win[0];
            let (ni, nj) = win[1];
            if pi != usize::MAX {
                from_tag[pj] = kjv_tag[pi];
                source[pj] = Some((pi, true));
            }
            let (gi, gj) = (pi.wrapping_add(1), pj.wrapping_add(1));
            let (kl, tl) = (ni - gi, nj - gj);
            let groups: HashSet<usize> = (gi..ni).filter_map(|i| kjv_tag[i]).collect();
            if groups.len() == 1 && tags[*groups.iter().next().unwrap()].code == "NU" {
                // A number written another way: "four hundred thirty and
                // five" / "435" / "four hundred thirty-five".
                let g = *groups.iter().next().unwrap();
                for k in gj..nj {
                    if is_number_word(&target[k].key) {
                        from_tag[k] = Some(g);
                    }
                }
            } else if kl == tl && kl > 0 && kl <= 3 {
                for k in 0..kl {
                    let (i, j) = (gi + k, gj + k);
                    // A numeral is never the pronoun or the noun opposite it.
                    // Nor is a small word ("the asses" / "their asses").
                    let numeral = target[j].key.starts_with(|c: char| c.is_ascii_digit());
                    if FILLER.contains(&target[j].key.as_str()) {
                        continue;
                    }
                    if !numeral || kjv_tag[i].is_some_and(|g| tags[g].code == "NU") {
                        from_tag[j] = kjv_tag[i];
                        source[j] = Some((i, false));
                    }
                }
            }
        }
        // The same word colored by itself elsewhere in the KJV verse, and
        // never left plain there.
        for (k, w) in target.iter().enumerate() {
            if from_tag[k].is_some() || FILLER.contains(&w.key.as_str()) {
                continue;
            }
            let same: Vec<(&Word, Option<usize>)> = kjv.iter().zip(kjv_tag.iter().copied()).filter(|(kw, _)| kw.key == w.key).collect();
            let whole = |kw: &Word, t: Option<usize>| t.is_some_and(|g| tags[g].start == kw.start && tags[g].end == kw.end);
            if same.is_empty() || !same.iter().all(|(kw, t)| whole(kw, *t)) {
                continue;
            }
            let codes: HashSet<&str> = same.iter().map(|(_, t)| tags[t.unwrap()].code.as_str()).collect();
            if codes.len() == 1 {
                from_tag[k] = same[0].1;
            }
        }
        // A small word keeps a color only inside the longer term it belongs
        // to: lined up with that same word in the KJV, followed by more of
        // the term, and either preceded by more of it or opening it.
        let keep: Vec<bool> = (0..target.len())
            .map(|k| {
                let Some(g) = from_tag[k] else { return true };
                if !FILLER.contains(&target[k].key.as_str()) || !tags[g].term.contains(' ') {
                    return true;
                }
                let Some((i, true)) = source[k] else { return false };
                let next = k + 1 < target.len() && from_tag[k + 1] == Some(g);
                let prev = k > 0 && from_tag[k - 1] == Some(g);
                next && (prev || kjv[i].start == tags[g].start)
            })
            .collect();
        for (k, keep) in keep.into_iter().enumerate() {
            if !keep {
                from_tag[k] = None;
            }
        }
        // A number left over takes the KJV verse's next number nothing has
        // taken, in order.
        let used: HashSet<usize> = from_tag.iter().flatten().copied().collect();
        let mut spare = (0..tags.len()).filter(|g| tags[*g].code == "NU" && !used.contains(g));
        let mut k = 0;
        while k < target.len() {
            if from_tag[k].is_none() && is_number_word(&target[k].key) {
                // The rest of a number already begun ("four hundred" /
                // "thirty-five"), else the next number free.
                let before = k.checked_sub(1).and_then(|p| from_tag[p]).filter(|&g| tags[g].code == "NU");
                let joined = before.filter(|_| text[target[k - 1].end..target[k].start].trim().is_empty());
                let Some(g) = joined.or_else(|| spare.next()) else { break };
                while k < target.len() && from_tag[k].is_none() && is_number_word(&target[k].key) {
                    from_tag[k] = Some(g);
                    k += 1;
                }
            } else {
                k += 1;
            }
        }
    }

    // A name spelled close to a colored KJV name that nothing has taken yet.
    let used: HashSet<usize> = from_tag.iter().flatten().copied().collect();
    let names: Vec<(usize, &Word)> = kjv
        .iter()
        .zip(&kjv_tag)
        .filter_map(|(w, t)| t.map(|g| (g, w)))
        // A name standing alone: "God" in "The mighty God" is no name to match.
        .filter(|(g, w)| tags[*g].start == w.start && tags[*g].end == w.end)
        .filter(|(g, w)| w.capitalized && !used.contains(g) && NAME_CODES.contains(&tags[*g].code.as_str()))
        .collect();
    for (k, w) in target.iter().enumerate() {
        if from_tag[k].is_some() || !w.capitalized || w.key.chars().count() < 3 {
            continue;
        }
        let best = names
            .iter()
            .map(|(g, kw)| (*g, name_likeness(&kw.key, &w.key)))
            .filter(|(_, s)| *s >= 0.6)
            .max_by(|a, b| a.1.total_cmp(&b.1));
        if let Some((g, _)) = best {
            from_tag[k] = Some(g);
        }
    }

    let other: Vec<Option<Span>> = target
        .iter()
        .zip(&from_tag)
        .map(|(w, t)| if t.is_none() { from_lexicon(lexicon, lang, w, tags) } else { None })
        .collect();
    spans_from_words(text, &target, &from_tag, other, tags)
}

/// Colors for a Greek or Hebrew verse: `strongs` gives each Strong's number
/// the KJV verse colors (see [`strongs_colors`]), `morph` the verse's words
/// with their numbers. Words no number reaches fall back to the word list.
pub fn project_strongs(
    tags: &[Span],
    strongs: &HashMap<String, usize>,
    morph: &[(String, String)],
    text: &str,
    lang: &str,
    lexicon: &Lexicon,
) -> Vec<Span> {
    // Each bare form in the verse, and the tag its Strong's number has.
    let mut by_form: HashMap<String, Option<usize>> = HashMap::new();
    for (word, sid) in morph {
        let Some(&g) = strongs.get(sid) else { continue };
        let form = plain_word(word);
        match by_form.get(&form) {
            None => {
                by_form.insert(form, Some(g));
            }
            Some(Some(prev)) if tags[*prev].code != tags[g].code => {
                by_form.insert(form, None);
            }
            _ => {}
        }
    }
    let target = original_words(text);
    let from_tag: Vec<Option<usize>> = target.iter().map(|w| by_form.get(&w.key).copied().flatten()).collect();
    let other: Vec<Option<Span>> = target
        .iter()
        .zip(&from_tag)
        .map(|(w, t)| if t.is_none() { from_lexicon(lexicon, lang, w, tags) } else { None })
        .collect();
    spans_from_words(text, &target, &from_tag, other, tags)
}

/// Colors for a verse no projection reaches: the word list alone.
pub fn project_lexicon(tags: &[Span], text: &str, lang: &str, lexicon: &Lexicon) -> Vec<Span> {
    let target = if lang == "grc" || lang == "hbo" { original_words(text) } else { latin_words(text) };
    let from_tag = vec![None; target.len()];
    let other = target.iter().map(|w| from_lexicon(lexicon, lang, w, tags)).collect();
    spans_from_words(text, &target, &from_tag, other, tags)
}

/// Words that say nothing about which word of a KJV phrase carries its
/// Strong's number ("the beginning", "unto him"): left out when checking
/// that a phrase is all one color.
const PHRASE_FILLER: &[&str] = &[
    "the", "a", "an", "of", "to", "unto", "in", "and", "that", "which", "for", "with", "by", "from", "upon", "on", "at", "into", "as", "be", "is",
    "was", "were", "are", "it", "shall", "will", "even", "o",
];

/// The Strong's numbers a KJV verse colors: each `interlinear_words` phrase
/// (in order, with its number) is found in the KJV text, and a phrase whose
/// words, apart from filler, all sit in one tag gives its number that tag.
/// A number that two different colors claim is dropped.
pub fn strongs_colors(kjv_text: &str, tags: &[Span], phrases: &[(String, String)]) -> HashMap<String, usize> {
    let kjv = latin_words(kjv_text);
    let kjv_tag = tag_of_words(&kjv, tags);
    let mut out: HashMap<String, Option<usize>> = HashMap::new();
    let mut cursor = 0;
    for (phrase, sid) in phrases {
        let Some(pos) = kjv_text[cursor..].find(phrase.as_str()).map(|p| p + cursor) else { continue };
        let end = pos + phrase.len();
        cursor = end;
        let inside: Vec<Option<usize>> = kjv
            .iter()
            .zip(&kjv_tag)
            .filter(|(w, _)| w.start >= pos && w.end <= end && !PHRASE_FILLER.contains(&w.key.as_str()))
            .map(|(_, t)| *t)
            .collect();
        // Every word colored, all one color -- or one color besides a
        // pronoun, which Hebrew and Greek often fold into the word itself
        // ("their camels" is one Hebrew word, the camels).
        if inside.is_empty() || inside.iter().any(Option::is_none) {
            continue;
        }
        let mut colors: Vec<usize> = inside.iter().flatten().copied().collect();
        if colors.iter().any(|&x| tags[x].code != "PR") {
            colors.retain(|&x| tags[x].code != "PR");
        }
        let g = colors[0];
        if colors.iter().any(|&x| tags[x].code != tags[g].code) {
            continue;
        }
        match out.get(sid) {
            None => {
                out.insert(sid.clone(), Some(g));
            }
            Some(Some(prev)) if tags[*prev].code != tags[g].code => {
                out.insert(sid.clone(), None);
            }
            _ => {}
        }
    }
    out.into_iter().filter_map(|(k, v)| v.map(|g| (k, g))).collect()
}

/// Spans from per-word colors. Neighbouring words that took the same KJV tag
/// are one span ("Holy Spirit" from "Holy Ghost"), taking in what lies
/// between them.
fn spans_from_words(text: &str, words: &[Word], from_tag: &[Option<usize>], other: Vec<Option<Span>>, tags: &[Span]) -> Vec<Span> {
    let mut out: Vec<Span> = Vec::new();
    let mut last_tag: Option<usize> = None;
    for (k, w) in words.iter().enumerate() {
        if let Some(g) = from_tag[k] {
            let gap_is_space = out.last().is_some_and(|s| text[s.end..w.start].trim().is_empty());
            if last_tag == Some(g) && gap_is_space {
                out.last_mut().unwrap().end = w.end;
            } else {
                out.push(Span { start: w.start, end: w.end, code: tags[g].code.clone(), term: tags[g].term.clone() });
            }
            last_tag = Some(g);
        } else {
            last_tag = None;
            if let Some(s) = &other[k] {
                out.push(s.clone());
            }
        }
    }
    out
}

/// Who is speaking in a verse of another translation, from the KJV verse's
/// voice runs (`voices`, with the voice in `code`). Unlike a color, a voice
/// covers every word, so every word needs one: in English each word lined up
/// with a KJV word takes its voice, and the words between two lined-up ones
/// take theirs when the two agree, else the nearer one's. Other languages
/// take the voice of the KJV word at the same relative place in the verse,
/// which is rough, but voices come in long runs.
pub fn project_voices(kjv_text: &str, voices: &[Span], text: &str, lang: &str) -> Vec<Span> {
    let kjv = latin_words(kjv_text);
    let kjv_voice: Vec<Option<usize>> = tag_of_words(&kjv, voices);
    let target = if lang == "grc" || lang == "hbo" { original_words(text) } else { latin_words(text) };
    if kjv.is_empty() || target.is_empty() {
        return Vec::new();
    }
    let mut voice: Vec<Option<Option<usize>>> = vec![None; target.len()];
    if lang == "en" {
        let a: Vec<&str> = kjv.iter().map(|w| w.key.as_str()).collect();
        let b: Vec<&str> = target.iter().map(|w| w.key.as_str()).collect();
        let pairs = lcs(&a, &b);
        for &(i, j) in &pairs {
            voice[j] = Some(kjv_voice[i]);
        }
        let anchors: Vec<usize> = pairs.iter().map(|&(_, j)| j).collect();
        for j in 0..target.len() {
            if voice[j].is_some() {
                continue;
            }
            let left = anchors.iter().rev().find(|&&a| a < j).copied();
            let right = anchors.iter().find(|&&a| a > j).copied();
            voice[j] = Some(match (left, right) {
                (Some(l), Some(r)) if voice[l] == voice[r] || j - l <= r - j => voice[l].unwrap(),
                (_, Some(r)) => voice[r].unwrap(),
                (Some(l), None) => voice[l].unwrap(),
                (None, None) => None,
            });
        }
    } else {
        let (m, n) = (kjv.len(), target.len());
        for j in 0..n {
            voice[j] = Some(kjv_voice[(j * m / n).min(m - 1)]);
        }
    }
    // Runs of the same voice, as spans over the target text.
    let mut out: Vec<Span> = Vec::new();
    let mut last: Option<usize> = None;
    for (j, w) in target.iter().enumerate() {
        let g = voice[j].flatten();
        match g {
            Some(g) if last == Some(g) => out.last_mut().unwrap().end = w.end,
            Some(g) => out.push(Span { start: w.start, end: w.end, code: voices[g].code.clone(), term: String::new() }),
            None => {}
        }
        last = g;
    }
    // Two runs of one voice with only another run's absence between them are
    // the same speech (a word the alignment missed): join them.
    out.dedup_by(|b, a| {
        let joined = a.code == b.code && text[a.end..b.start].chars().all(|c| !c.is_alphanumeric());
        if joined {
            a.end = b.end;
        }
        joined
    });
    out
}

/// The word list's language for a translation: its own language code when
/// it names one of the four this module knows, else read from the script of
/// a sample of its text.
pub fn language_of(language: Option<&str>, sample: &str) -> &'static str {
    match language.map(|l| l.to_ascii_lowercase()).as_deref() {
        Some("grc") | Some("el") | Some("gre") => return "grc",
        Some("hbo") | Some("he") | Some("heb") => return "hbo",
        Some("la") | Some("lat") => return "la",
        _ => {}
    }
    if sample.chars().any(|c| ('\u{0590}'..='\u{05ff}').contains(&c)) {
        "hbo"
    } else if sample.chars().any(|c| ('\u{0370}'..='\u{03ff}').contains(&c) || ('\u{1f00}'..='\u{1fff}').contains(&c)) {
        "grc"
    } else {
        "en"
    }
}

/// Latin names and titles of God, for the Vulgate. Each only colors a word
/// when the KJV verse has the same color, so "spiritus" is the Holy Spirit
/// only where the KJV says "Spirit" or "Ghost" in that color.
pub const LATIN_WORDS: &[(&str, &str, &str)] = &[
    ("deus", "GF", "god"),
    ("dei", "GF", "god"),
    ("deo", "GF", "god"),
    ("deum", "GF", "god"),
    ("dominus", "GF", "lord"),
    ("domini", "GF", "lord"),
    ("domino", "GF", "lord"),
    ("dominum", "GF", "lord"),
    ("domine", "GF", "lord"),
    ("pater", "GF", "father"),
    ("patris", "GF", "father"),
    ("patrem", "GF", "father"),
    ("patri", "GF", "father"),
    ("iesus", "GS", "jesus"),
    ("iesu", "GS", "jesus"),
    ("iesum", "GS", "jesus"),
    ("christus", "GS", "christ"),
    ("christi", "GS", "christ"),
    ("christo", "GS", "christ"),
    ("christum", "GS", "christ"),
    ("spiritus", "HS", "spirit"),
    ("spiritum", "HS", "spirit"),
    ("spiritui", "HS", "spirit"),
    ("spiritu", "HS", "spirit"),
    ("angelus", "AN", "angel"),
    ("angeli", "AN", "angel"),
    ("angelum", "AN", "angel"),
    ("angelo", "AN", "angel"),
    ("angelis", "AN", "angels"),
    ("angelos", "AN", "angels"),
    ("angelorum", "AN", "angels"),
    ("diabolus", "DE", "devil"),
    ("diaboli", "DE", "devil"),
    ("diabolo", "DE", "devil"),
    ("satanas", "DE", "satan"),
    ("satanae", "DE", "satan"),
    ("satanam", "DE", "satan"),
    ("daemonia", "DE", "devils"),
    ("daemonium", "DE", "devil"),
    ("dies", "T1", "day"),
    ("diem", "T1", "day"),
    ("die", "T1", "day"),
    ("diebus", "T1", "days"),
    ("dierum", "T1", "days"),
    ("annos", "T1", "years"),
    ("annis", "T1", "years"),
    ("annorum", "T1", "years"),
    ("annus", "T1", "year"),
    ("anno", "T1", "year"),
    ("nocte", "T1", "night"),
    ("noctem", "T1", "night"),
    ("terra", "L1", "earth"),
    ("terram", "L1", "earth"),
    ("terrae", "L1", "earth"),
    ("caelum", "L1", "heaven"),
    ("caeli", "L1", "heaven"),
    ("caelo", "L1", "heaven"),
    ("caelis", "L1", "heaven"),
    ("domus", "L1", "house"),
    ("domum", "L1", "house"),
    ("domo", "L1", "house"),
    ("civitas", "L1", "city"),
    ("civitatem", "L1", "city"),
    ("civitate", "L1", "city"),
    ("populus", "GP", "people"),
    ("populum", "GP", "people"),
    ("populo", "GP", "people"),
    ("populi", "GP", "people"),
    ("rex", "GP", "king"),
    ("regem", "GP", "king"),
    ("regis", "GP", "king"),
    ("filius", "GP", "son"),
    ("filii", "GP", "children"),
    ("filios", "GP", "sons"),
    ("filiorum", "GP", "children"),
    ("homo", "GP", "man"),
    ("hominem", "GP", "man"),
    ("hominis", "GP", "man"),
    ("homines", "GP", "men"),
    ("hominum", "GP", "men"),
    ("omnis", "QU", "all"),
    ("omnes", "QU", "all"),
    ("omnia", "QU", "all"),
    ("omnibus", "QU", "all"),
    ("omnium", "QU", "all"),
];

#[cfg(test)]
mod tests {
    use super::*;

    fn tag(text: &str, word: &str, code: &str) -> Span {
        let start = text.find(word).unwrap();
        Span { start, end: start + word.len(), code: code.into(), term: word.to_lowercase() }
    }

    fn colored<'a>(text: &'a str, spans: &[Span]) -> Vec<(&'a str, String)> {
        spans.iter().map(|s| (&text[s.start..s.end], s.code.clone())).collect()
    }

    #[test]
    fn a_close_translation_takes_the_kjv_colors_word_for_word() {
        let kjv = "In the beginning God created the heaven and the earth.";
        let tags = vec![tag(kjv, "beginning", "T2"), tag(kjv, "God", "GF"), tag(kjv, "heaven", "L1"), tag(kjv, "earth", "L1")];
        let web = "In the beginning, God created the heavens and the earth.";
        let out = project_words(kjv, &tags, web, "en", &Lexicon::default());
        assert_eq!(
            colored(web, &out),
            vec![("beginning", "T2".into()), ("God", "GF".into()), ("heavens", "L1".into()), ("earth", "L1".into())]
        );
    }

    #[test]
    fn old_forms_and_names_of_god_line_up_with_new_ones() {
        let kjv = "And the LORD said unto Moses, I will send thee.";
        let tags = vec![tag(kjv, "LORD", "GF"), tag(kjv, "Moses", "PN"), tag(kjv, "I", "GF"), tag(kjv, "thee", "PR")];
        let web = "Yahweh said to Moses, \u{201c}I will send you.\u{201d}";
        let out = project_words(kjv, &tags, web, "en", &Lexicon::default());
        assert_eq!(
            colored(web, &out),
            vec![("Yahweh", "GF".into()), ("Moses", "PN".into()), ("I", "GF".into()), ("you", "PR".into())]
        );
        assert_eq!(out[0].term, "lord");
    }

    #[test]
    fn a_two_word_name_stays_one_span() {
        let kjv = "and the Holy Ghost fell on them";
        let tags = vec![tag(kjv, "Holy Ghost", "HS"), tag(kjv, "them", "PR")];
        let bsb = "and the Holy Spirit fell upon them";
        let out = project_words(kjv, &tags, bsb, "en", &Lexicon::default());
        assert_eq!(colored(bsb, &out), vec![("Holy Spirit", "HS".into()), ("them", "PR".into())]);
    }

    #[test]
    fn a_number_in_words_colors_the_same_number_in_digits() {
        let kjv = "Their camels, four hundred thirty and five; their asses";
        let tags = vec![tag(kjv, "Their", "PR"), tag(kjv, "camels", "BE"), tag(kjv, "four hundred thirty and five", "NU")];
        let bsb = "Their camels numbered 435, and their donkeys";
        let out = project_words(kjv, &tags, bsb, "en", &Lexicon::default());
        assert!(colored(bsb, &out).contains(&("435", "NU".into())), "{:?}", colored(bsb, &out));
    }

    #[test]
    fn small_words_take_a_color_only_inside_their_term() {
        let kjv = "and the government shall be upon his shoulder: and his name shall be called The everlasting Father, The Prince of Peace.";
        let tags = vec![
            tag(kjv, "government", "GP"),
            tag(kjv, "The everlasting Father", "GS"),
            tag(kjv, "The Prince of Peace", "GS"),
        ];
        let ylt = "And the princely power is on his shoulder, And He doth call his name Father of Eternity, The Prince of Peace.";
        let got = project_words(kjv, &tags, ylt, "en", &Lexicon::default());
        let got = colored(ylt, &got);
        assert!(!got.iter().any(|(w, _)| *w == "the" || *w == "of"), "{got:?}");
        assert!(got.contains(&("Father", "GS".into())), "{got:?}");
        assert!(got.contains(&("The Prince of Peace", "GS".into())), "{got:?}");
    }

    #[test]
    fn a_numeral_is_not_the_pronoun_beside_it() {
        let kjv = "Their camels, four hundred thirty and five; their asses, six thousand seven hundred and twenty.";
        let tags = vec![
            tag(kjv, "Their", "PR"),
            tag(kjv, "camels", "BE"),
            tag(kjv, "four hundred thirty and five", "NU"),
            Span { start: 45, end: 50, code: "PR".into(), term: "their".into() },
            tag(kjv, "asses", "BE"),
            tag(kjv, "six thousand seven hundred and twenty", "NU"),
        ];
        let bsb = "435 camels, and 6,720 donkeys.";
        let got = colored(bsb, &project_words(kjv, &tags, bsb, "en", &Lexicon::default()));
        assert_eq!(got, vec![("435", "NU".into()), ("camels", "BE".into()), ("6,720", "NU".into())]);
        let ult = "Their donkeys were 6, 720.";
        let got = colored(ult, &project_words(kjv, &tags, ult, "en", &Lexicon::default()));
        assert!(got.contains(&("6, 720", "NU".into())), "{got:?}");
        let dra = "Their camels four hundred thirty-five";
        let got = colored(dra, &project_words(kjv, &tags, dra, "en", &Lexicon::default()));
        assert!(got.contains(&("four hundred thirty-five", "NU".into())), "{got:?}");
    }

    #[test]
    fn a_word_inside_a_longer_term_does_not_color_the_same_word_elsewhere() {
        let kjv = "unto us a son is given: and his name shall be called The mighty God";
        let tags = vec![tag(kjv, "us", "PR"), tag(kjv, "son", "GS"), tag(kjv, "The mighty God", "GS")];
        let ust = "God will give us a special son.";
        let got = colored(ust, &project_words(kjv, &tags, ust, "en", &Lexicon::default()));
        assert!(!got.iter().any(|(w, _)| *w == "God"), "{got:?}");
    }

    #[test]
    fn a_word_list_entry_takes_the_color_the_kjv_gives_its_term() {
        let mut lex = Lexicon::default();
        lex.insert("la", "filius", "GP", "son");
        let kjv = "unto us a son is given";
        let tags = vec![tag(kjv, "us", "PR"), tag(kjv, "son", "GS")];
        let vul = "et filius datus est nobis";
        assert_eq!(colored(vul, &project_words(kjv, &tags, vul, "la", &lex)), vec![("filius", "GS".into())]);
    }

    #[test]
    fn a_name_spelled_another_way_is_still_found() {
        let kjv = "And Joshua the son of Nun sent out of Shittim two men";
        let tags = vec![tag(kjv, "Joshua", "PN"), tag(kjv, "Nun", "PN"), tag(kjv, "Shittim", "PP")];
        let dra = "And Josue the son of Nun sent from Setim two men";
        let out = project_words(kjv, &tags, dra, "en", &Lexicon::default());
        let got = colored(dra, &out);
        assert!(got.contains(&("Josue", "PN".into())), "{got:?}");
        assert!(got.contains(&("Setim", "PP".into())), "{got:?}");
    }

    #[test]
    fn the_word_list_only_colors_what_the_kjv_verse_colors() {
        let mut lex = Lexicon::default();
        for (form, code, term) in LATIN_WORDS {
            lex.insert("la", form, code, term);
        }
        let kjv = "And the Spirit of God moved upon the face of the waters.";
        let tags = vec![tag(kjv, "Spirit", "HS"), tag(kjv, "God", "GF"), tag(kjv, "waters", "L1")];
        let vul = "et spiritus Dei ferebatur super aquas.";
        assert_eq!(colored(vul, &project_words(kjv, &tags, vul, "la", &lex)), vec![("spiritus", "HS".into()), ("Dei", "GF".into())]);
        // No Holy Spirit in the KJV verse: "spiritus" is the wind.
        let tags = vec![tag(kjv, "God", "GF")];
        assert_eq!(colored(vul, &project_words(kjv, &tags, vul, "la", &lex)), vec![("Dei", "GF".into())]);
    }

    #[test]
    fn greek_takes_colors_through_strongs_numbers() {
        let kjv = "In the beginning was the Word, and the Word was with God, and the Word was God.";
        let mut tags = vec![tag(kjv, "beginning", "T2"), tag(kjv, "God", "GF")];
        for (i, _) in kjv.match_indices("Word") {
            tags.push(Span { start: i, end: i + 4, code: "GS".into(), term: "word".into() });
        }
        tags.sort_by_key(|t| t.start);
        let phrases: Vec<(String, String)> = [
            ("In", "G1722"),
            ("the beginning", "G746"),
            ("was", "G2258"),
            ("the Word", "G3056"),
            ("and", "G2532"),
            ("the Word", "G3056"),
            ("was", "G2258"),
            ("with", "G4314"),
            ("God", "G2316"),
        ]
        .iter()
        .map(|(a, b)| (a.to_string(), b.to_string()))
        .collect();
        let strongs = strongs_colors(kjv, &tags, &phrases);
        assert_eq!(tags[strongs["G3056"]].code, "GS");
        assert!(!strongs.contains_key("G2258"));
        let morph: Vec<(String, String)> = [("Ἐν", "G1722"), ("ἀρχῇ", "G746"), ("λόγος,", "G3056"), ("θεόν,", "G2316"), ("θεὸς", "G2316")]
            .iter()
            .map(|(a, b)| (a.to_string(), b.to_string()))
            .collect();
        let tr = "Ἐν ἀρχῆ ἦν ὁ λόγος, καὶ ὁ λόγος ἦν πρὸς τὸν θεόν, καὶ θεὸς ἦν ὁ λόγος.";
        let out = project_strongs(&tags, &strongs, &morph, tr, "grc", &Lexicon::default());
        let got = colored(tr, &out);
        assert_eq!(got.iter().filter(|(_, c)| c == "GS").count(), 3, "{got:?}");
        assert!(got.contains(&("ἀρχῆ", "T2".into())), "{got:?}");
        assert!(got.contains(&("θεόν", "GF".into())), "{got:?}");
    }

    #[test]
    fn who_is_speaking_carries_over_to_another_translation() {
        let kjv = "And God said, Let there be light: and there was light.";
        let voices = vec![tag(kjv, "Let there be light", "god")];
        let web = "God said, \u{201c}Let there be light,\u{201d} and there was light.";
        let got = project_voices(kjv, &voices, web, "en");
        assert_eq!(colored(web, &got), vec![("Let there be light", "god".into())]);
        // No lined-up words at all: by relative place in the verse.
        let wlc = "וַיֹּאמֶר אֱלֹהִים יְהִי אוֹר וַיְהִי־אוֹר׃";
        let got = project_voices(kjv, &voices, wlc, "hbo");
        assert_eq!(got.len(), 1, "{got:?}");
        assert!(wlc[got[0].start..got[0].end].starts_with("יְהִי"), "{:?}", &wlc[got[0].start..got[0].end]);
    }

    #[test]
    fn hebrew_words_keep_their_points() {
        let words = original_words("בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים כָּל־הָאָֽרֶץ׃");
        assert_eq!(words.len(), 5);
        assert_eq!(words[2].key, "אלהים");
    }

    #[test]
    fn language_comes_from_the_code_or_the_script() {
        assert_eq!(language_of(Some("grc"), ""), "grc");
        assert_eq!(language_of(None, "Ἐν ἀρχῇ"), "grc");
        assert_eq!(language_of(None, "בְּרֵאשִׁית"), "hbo");
        assert_eq!(language_of(Some("la"), "In principio"), "la");
        assert_eq!(language_of(Some("ENG"), "In the beginning"), "en");
    }
}
