//! Parsing codes, read into their parts.
//!
//! Two systems are in `morphology_words.morph_code`:
//!
//! - **Greek**, from STEPBible's TAGNT: Robinson's codes as STEPBible prints
//!   them. `V-AAM-2S` is a verb, aorist active imperative, second person
//!   singular; `N-NSF` a noun, nominative singular feminine; `P-1GS` a
//!   first-person pronoun, genitive singular; `PREP`, `CONJ`, `ADV` stand
//!   alone. STEPBible adds tags after the parsing proper: what kind of name a
//!   noun is (`N-GSM-P` a person, `-L` a place, `-T` a title such as Christ,
//!   `-LG`/`-PG` a gentilic), degree (`A-NSN-C` comparative, `-S`
//!   superlative), `-N` negative and `-I` interrogative (`PRT-N`, `ADV-I`),
//!   and `-HEB`/`-ARAM` for a word carried over from those languages. Tags
//!   that only record spelling -- `-ATT` Attic, `-ABB` abbreviated, `-C` on a
//!   noun (contracted) -- are not parsing fields. A word Strong numbered as
//!   two, merged by crasis (κἀγώ, "and I": `P-1NS + G2532=CONJ`), lists each
//!   part after " + "; the first is the word the row's Strong's number names.
//! - **Hebrew and Aramaic**, from the OpenScriptures Hebrew Bible as STEPBible
//!   adapted it for TAHOT: a language letter, then one segment per morpheme
//!   separated by `/` (`HR/Ncfsa` is a preposition prefixed to a common noun,
//!   feminine singular absolute; `HVqp3ms` a Qal perfect, third masculine
//!   singular; `HNcmpc/Sp3ms` a construct plural noun with a pronominal
//!   suffix). The prefixed and suffixed morphemes come back as `affixes`.
//!
//! What comes out is a set of plain English field values -- "aorist",
//! "imperative", "genitive" -- the same words the morphology search form
//! offers, so a reader never has to know a code letter. Every value is lower
//! case, and each "<field>:<value>" pair is a key into the reader's glossary,
//! `src/features/lexicon/parsingGlossary.json`; the ignored test at the foot
//! of this file checks that every pair the shipped data can produce has one.
//!
//! Sources: Maurice Robinson's parsing scheme as documented by STEPBible
//! ("TAGNT - Robinson codes" and TEGMC, "Translators Expansion of Greek
//! Morphology Codes"); the OSHB morphology documentation at
//! hb.openscriptures.org/parsing/HebrewMorphologyCodes.html; and STEPBible's
//! TEHMC, "Translators Expansion of Hebrew Morphology Codes", which documents
//! the adaptations TAHOT makes to OSHB's codes: a lower-case `c` for the
//! consecutive vav, `u` for an imperfect after a plain conjunction, `c` with a
//! person for the cohortative, `Ta` for the Aramaic article, and `b` ("either
//! gender") where OSHB writes `c` for common gender. TEGMC and TEHMC are in
//! github.com/STEPBible/STEPBible-Data under "Morphology codes" (CC BY 4.0).

use serde::Serialize;

/// A morpheme written onto a Hebrew or Aramaic word that is not the word
/// itself: a prefixed preposition, conjunction or article, or a pronominal,
/// directional or paragogic suffix.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct MorphAffix {
    /// "prefix" or "suffix".
    pub role: String,
    /// In plain English: "preposition", "pronominal suffix, 3rd person
    /// masculine singular". Like the field values, a key into the glossary
    /// (as "affix:<description>").
    pub description: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct MorphInfo {
    /// "greek", "hebrew" or "aramaic".
    pub language: String,
    pub part_of_speech: Option<String>,
    /// Greek tense, or the Hebrew verb's conjugation ("perfect", "sequential
    /// imperfect").
    pub tense: Option<String>,
    pub voice: Option<String>,
    pub mood: Option<String>,
    pub person: Option<String>,
    pub number: Option<String>,
    pub gender: Option<String>,
    pub case: Option<String>,
    /// Hebrew and Aramaic: "absolute", "construct", "determined".
    pub state: Option<String>,
    /// Hebrew and Aramaic verb stem ("qal", "piel", "peal").
    pub stem: Option<String>,
    /// A pronoun's, particle's or name's kind ("personal", "negative",
    /// "place name", "comparative").
    pub kind: Option<String>,
    /// A Greek possessive's possessor: "singular" for ἐμός ("my") and σός
    /// ("your", one person), "plural" for ἡμέτερος ("our") and ὑμέτερος.
    /// The code gives it apart from the possessive's own case, number and
    /// gender, which agree with the thing possessed: `S-1SAPF` is "my" with
    /// a plural noun. Its `person` is the possessor's person and its
    /// `number` the thing's, so without this a reader shown "1st person" and
    /// "plural" took John 14:15's τὰς ἐντολὰς τὰς ἐμὰς, "my commandments",
    /// for "our", and 1 John 1:3's ἡ κοινωνία ἡ ἡμετέρα, "our fellowship",
    /// for "my". None on every other word, and left out of the JSON there.
    /// The glossary's "possessive" entry says what the possessor is; the
    /// value itself is a plain number.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub possessor_number: Option<String>,
    /// The whole parsing in words: "verb, aorist active imperative, 2nd
    /// person singular". A word written as two joins each part's with " + ",
    /// and a Hebrew part after the first names its own prefixes and suffixes
    /// ("preposition, with pronominal suffix, 1st person common singular").
    pub description: String,
    /// The Hebrew or Aramaic word's prefixes and suffixes, in written order;
    /// where a code writes several words as one, the first word's, as the
    /// other fields are. Always empty for Greek.
    pub affixes: Vec<MorphAffix>,
    /// What the code alone calls a word that `decode_word` reads otherwise
    /// (see `RETAGGED`): "a cardinal number" for מְאֹד, "very", coded
    /// `HAcmsa`; "a conditional particle" for כִּי, coded `HTc`. The code is
    /// shown beside the parsing, and without this a reader who knew the
    /// letters saw "Adverb" beside a number's code with nothing to say why.
    /// None on every word read as its code says, and left out of the JSON
    /// there.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub coded_as: Option<String>,
}

fn s(v: &str) -> Option<String> {
    Some(v.to_string())
}

fn greek_case(c: char) -> Option<String> {
    match c {
        'N' => s("nominative"),
        'G' => s("genitive"),
        'D' => s("dative"),
        'A' => s("accusative"),
        'V' => s("vocative"),
        _ => None,
    }
}
fn number(c: char) -> Option<String> {
    match c {
        'S' | 's' => s("singular"),
        'P' | 'p' => s("plural"),
        'd' => s("dual"),
        _ => None,
    }
}
fn greek_gender(c: char) -> Option<String> {
    match c {
        'M' => s("masculine"),
        'F' => s("feminine"),
        'N' => s("neuter"),
        _ => None,
    }
}
fn person(c: char) -> Option<String> {
    match c {
        '1' => s("1st"),
        '2' => s("2nd"),
        '3' => s("3rd"),
        _ => None,
    }
}

/// Case, number, gender from three letters ("NSF").
fn cng(info: &mut MorphInfo, letters: &str) {
    let mut chars = letters.chars();
    if let Some(c) = chars.next() {
        info.case = greek_case(c);
    }
    if let Some(c) = chars.next() {
        info.number = number(c);
    }
    if let Some(c) = chars.next() {
        info.gender = greek_gender(c);
    }
}

const GREEK_PRONOUNS: &[&str] = &["P", "R", "C", "D", "K", "I", "X", "Q", "F", "S"];

/// What one of STEPBible's trailing tags says about a word with this head,
/// as its `kind`. The same letter means different things on different parts
/// of speech -- `-C` is comparative on an adjective or adverb but only a
/// contracted spelling on a noun, and Robinson's verb tags (`-M`, `-C`, `-T`)
/// are not these at all -- so each is read only where TEGMC gives it that
/// sense. Tags that record spelling alone come back None.
fn greek_tag(head: &str, tag: &str) -> Option<&'static str> {
    let nominal = matches!(head, "N" | "A");
    let has_degree = matches!(head, "A" | "ADV");
    match tag {
        "HEB" => Some("transliterated from hebrew"),
        "ARAM" => Some("transliterated from aramaic"),
        "N" if head != "V" => Some("negative"),
        "I" if head != "V" => Some("interrogative"),
        "C" if has_degree => Some("comparative"),
        "S" if has_degree => Some("superlative"),
        "P" if nominal => Some("personal name"),
        "L" if nominal => Some("place name"),
        "T" if nominal => Some("title"),
        "G" | "LG" | "PG" if nominal => Some("gentilic"),
        "LI" if nominal => Some("letter"),
        _ => None,
    }
}

/// One Greek word's code, without any " + " parts.
fn decode_greek_word(code: &str) -> MorphInfo {
    let mut info = MorphInfo { language: "greek".into(), ..Default::default() };
    let parts: Vec<&str> = code.trim().split('-').collect();
    let head = parts.first().copied().unwrap_or("");
    // How many of the dash-separated parts are the parsing proper; any after
    // them are STEPBible's tags.
    let mut parsed = 1;
    match head {
        "V" => {
            info.part_of_speech = s("verb");
            let tvm = parts.get(1).copied().unwrap_or("");
            // A leading 2 marks a second (strong) tense form: the same tense
            // built on a different stem, which changes nothing in its meaning.
            let tvm = tvm.strip_prefix('2').unwrap_or(tvm);
            let mut chars = tvm.chars();
            info.tense = match chars.next() {
                Some('P') => s("present"),
                Some('I') => s("imperfect"),
                Some('F') => s("future"),
                Some('A') => s("aorist"),
                Some('R') => s("perfect"),
                Some('L') => s("pluperfect"),
                _ => None,
            };
            // Deponents are kept apart from true middles and passives: the
            // form is middle or passive but the sense is usually active, and
            // a reader told only "passive" would read ἔρχεται as something
            // done to him rather than "he comes".
            info.voice = match chars.next() {
                Some('A') | Some('Q') => s("active"),
                Some('M') => s("middle"),
                Some('P') => s("passive"),
                Some('E') => s("middle or passive"),
                Some('D') => s("middle deponent"),
                Some('O') => s("passive deponent"),
                Some('N') => s("middle or passive deponent"),
                _ => None,
            };
            info.mood = match chars.next() {
                Some('I') => s("indicative"),
                Some('S') => s("subjunctive"),
                Some('O') => s("optative"),
                Some('M') => s("imperative"),
                Some('N') => s("infinitive"),
                Some('P') => s("participle"),
                Some('R') => s("imperative"),
                _ => None,
            };
            parsed = 2;
            // An infinitive has nothing after its tense, voice and mood.
            if info.mood.as_deref() != Some("infinitive") {
                if let Some(rest) = parts.get(2) {
                    parsed = 3;
                    if info.mood.as_deref() == Some("participle") {
                        cng(&mut info, rest);
                    } else {
                        let mut c = rest.chars();
                        if let Some(p) = c.next() {
                            info.person = person(p);
                        }
                        if let Some(n) = c.next() {
                            info.number = number(n);
                        }
                    }
                }
            }
        }
        "N" | "A" | "T" => {
            info.part_of_speech = s(match head {
                "N" => "noun",
                "A" => "adjective",
                _ => "article",
            });
            parsed = 2;
            match parts.get(1).copied() {
                Some("PRI") => info.kind = s("proper name, indeclinable"),
                Some("NUI") => info.kind = s("numeral, indeclinable"),
                Some("LI") => info.kind = s("letter"),
                Some("OI") => info.kind = s("indeclinable"),
                Some(rest) => cng(&mut info, rest),
                None => {}
            }
        }
        _ if GREEK_PRONOUNS.contains(&head) => {
            info.part_of_speech = s("pronoun");
            info.kind = s(match head {
                "P" => "personal",
                "R" => "relative",
                "C" => "reciprocal",
                "D" => "demonstrative",
                "K" => "correlative",
                "I" => "interrogative",
                "X" => "indefinite",
                "Q" => "correlative or interrogative",
                "F" => "reflexive",
                _ => "possessive",
            });
            parsed = 2;
            if let Some(rest) = parts.get(1) {
                // Personal, reflexive and possessive pronouns lead with a
                // person digit; possessives then give the possessor's number
                // before their own case, number and gender ("S-1SAPF").
                let rest = match rest.chars().next().and_then(person) {
                    Some(p) => {
                        info.person = Some(p);
                        &rest[1..]
                    }
                    None => rest,
                };
                let rest = if head == "S" && rest.len() > 3 {
                    info.possessor_number = rest.chars().next().and_then(number);
                    &rest[1..]
                } else {
                    rest
                };
                cng(&mut info, rest);
            }
        }
        "ADV" => info.part_of_speech = s("adverb"),
        "CONJ" => info.part_of_speech = s("conjunction"),
        "COND" => {
            info.part_of_speech = s("conjunction");
            info.kind = s("conditional");
        }
        "PREP" => info.part_of_speech = s("preposition"),
        "PRT" => info.part_of_speech = s("particle"),
        "INJ" => info.part_of_speech = s("interjection"),
        "ARAM" | "HEB" => {
            info.part_of_speech = s("foreign word");
            info.kind = s(if head == "ARAM" { "transliterated from aramaic" } else { "transliterated from hebrew" });
        }
        _ => {
            if head.starts_with("ADV") {
                info.part_of_speech = s("adverb");
            } else if head.starts_with("PRT") {
                info.part_of_speech = s("particle");
            } else if head.starts_with("CONJ") {
                info.part_of_speech = s("conjunction");
            }
        }
    }
    for tag in parts.iter().skip(parsed) {
        if info.kind.is_none() {
            info.kind = greek_tag(head, tag).map(str::to_string);
        }
    }
    info.description = describe(&info);
    info
}

pub fn decode_greek(code: &str) -> MorphInfo {
    // "P-1NS + G2532=CONJ": the row's own word first, then each word merged
    // with it, as "<Strong's>=<code>" ("G0846|G3165=P-1GS" where STEPBible
    // offers alternative numbers). The fields describe the first; the
    // description names every part.
    let mut parts = code.trim().split(" + ");
    let mut info = decode_greek_word(parts.next().unwrap_or(""));
    let joined: Vec<String> = parts
        .map(|part| decode_greek_word(part.rsplit('=').next().unwrap_or(part)).description)
        .filter(|d| !d.is_empty())
        .collect();
    if !joined.is_empty() {
        info.description = std::iter::once(info.description).chain(joined).collect::<Vec<_>>().join(" + ");
    }
    info
}

const HEBREW_STEMS: &[(char, &str)] = &[
    ('q', "qal"),
    ('N', "niphal"),
    ('p', "piel"),
    ('P', "pual"),
    ('h', "hiphil"),
    ('H', "hophal"),
    ('t', "hithpael"),
    ('o', "polel"),
    ('O', "polal"),
    ('r', "hithpolel"),
    ('m', "poel"),
    ('M', "poal"),
    ('k', "palel"),
    ('K', "pulal"),
    ('Q', "qal passive"),
    ('l', "pilpel"),
    ('L', "polpal"),
    ('f', "hithpalpel"),
    ('D', "nithpael"),
    ('j', "pealal"),
    ('i', "pilel"),
    ('u', "hothpaal"),
    ('c', "tiphil"),
    ('v', "hishtaphel"),
    ('w', "nithpalel"),
    ('y', "nithpoel"),
    ('z', "hithpoel"),
];

/// OSHB's Aramaic stems. TEHMC names three of these differently (`P`
/// "pual", `u` "hitpael", `i` "hitpeel"), but the words TAHOT tags so are
/// t-stems -- אֶשְׁתַּנִּי (Dan 3:19) is `P`, תִּתְעַבְדוּן (Dan 2:5) is `u` --
/// which is what OSHB's names say.
const ARAMAIC_STEMS: &[(char, &str)] = &[
    ('q', "peal"),
    ('Q', "peil"),
    ('u', "hithpeel"),
    ('p', "pael"),
    ('P', "ithpaal"),
    ('M', "hithpaal"),
    ('a', "aphel"),
    ('h', "haphel"),
    ('s', "saphel"),
    ('e', "shaphel"),
    ('H', "hophal"),
    ('i', "ithpeel"),
    ('t', "hishtaphel"),
    ('v', "ishtaphel"),
    ('w', "hithaphel"),
    ('o', "polel"),
    ('z', "ithpoel"),
    ('r', "hithpolel"),
    ('f', "hithpalpel"),
    ('b', "hephal"),
    ('c', "tiphel"),
    ('m', "poel"),
    ('l', "palpel"),
    ('L', "ithpalpel"),
    ('O', "ithpolel"),
    ('G', "ittaphal"),
];

/// OSHB writes `c` (common) for a form either gender uses and `b` (both) for
/// a noun found as either; TAHOT writes `b` for its pronominal suffixes too
/// ("Sp1bs", my), which TEHMC glosses "either gender". Both are what
/// grammars call common gender, and a reader shown "common" beside one word
/// and "both" beside the next would look for a difference that is not there.
fn hebrew_gender(c: char) -> Option<String> {
    match c {
        'm' => s("masculine"),
        'f' => s("feminine"),
        'c' | 'b' => s("common"),
        _ => None,
    }
}
fn hebrew_state(c: char) -> Option<String> {
    match c {
        'a' => s("absolute"),
        'c' => s("construct"),
        'd' => s("determined"),
        _ => None,
    }
}

/// Gender, number, state from what follows ("fsa").
fn gns(info: &mut MorphInfo, rest: &[char]) {
    if let Some(&g) = rest.first() {
        info.gender = hebrew_gender(g);
    }
    if let Some(&n) = rest.get(1) {
        info.number = number(n);
    }
    if let Some(&st) = rest.get(2) {
        info.state = hebrew_state(st);
    }
}

/// The morphemes that can be written onto the front of another word: the
/// prepositions ב כ ל מ (`R`, and `Rd` where the article's vowel has merged
/// into them), the conjunction ו (`C`, and TAHOT's `c` for the consecutive
/// vav), the article ה (`Td`), the interrogative ה (`Ti`) and the relative
/// שֶׁ (`Tr`). Each can also be a whole word -- עַל is `R`, אֲשֶׁר `Tr` -- and
/// is read as one when nothing else in its word is.
fn may_be_prefix(segment: &str) -> bool {
    matches!(segment, "R" | "Rd" | "C" | "c" | "Td" | "Ti" | "Tr")
}

/// One word inside a Hebrew or Aramaic code. Almost every code is one; about
/// forty are two or three written as one, mostly where the scribes' reading
/// (the Qere) runs together words the written text divides ("HVqp3ms//Ncmsa",
/// Gen 30:11) or a name joins them (הַלְלוּ־יָהּ, "HVpv2mp/Npm").
#[derive(Default)]
struct HebrewWord<'a> {
    prefixes: Vec<&'a str>,
    root: Option<&'a str>,
    suffixes: Vec<&'a str>,
}

impl HebrewWord<'_> {
    /// A word with nothing but prefix-shaped morphemes is the last of them,
    /// prefixed by the rest: "HC/R/Sp3ms" is the preposition לְ with "and"
    /// before it and "him" after.
    fn settle(&mut self) {
        if self.root.is_none() {
            self.root = self.prefixes.pop();
        }
    }
    fn is_empty(&self) -> bool {
        self.prefixes.is_empty() && self.root.is_none() && self.suffixes.is_empty()
    }
}

/// Splits a code's morphemes into words: prefixes, then the word itself,
/// then its suffixes. A suffix is `S...`, or in Aramaic the article `Ta`,
/// which that language writes after its noun (מַלְכָּא, "the king", is
/// "ANcmsd/Ta"). Anything after a word's own morpheme or suffixes that is
/// not a suffix begins the next word, and so does the empty morpheme "//"
/// gives the space between two words.
fn hebrew_words(body: &str, aramaic: bool) -> Vec<HebrewWord<'_>> {
    let mut words = Vec::new();
    let mut word = HebrewWord::default();
    for segment in body.split('/') {
        // "//" is a word break even where nothing else shows one: in 2 Sam
        // 18:20's Qere עַל־כֵּן, "HR//D", the preposition עַל is a word of its
        // own -- the one TAHOT's Strong's number (H5921) names -- and not a
        // prefix on the adverb after it.
        if segment.is_empty() {
            word.settle();
            if !word.is_empty() {
                words.push(std::mem::take(&mut word));
            }
            continue;
        }
        let is_suffix = segment.starts_with('S') || (aramaic && segment == "Ta" && word.root.is_some());
        if is_suffix {
            word.settle();
            word.suffixes.push(segment);
            continue;
        }
        if word.root.is_some() || !word.suffixes.is_empty() {
            words.push(std::mem::take(&mut word));
        }
        if may_be_prefix(segment) {
            word.prefixes.push(segment);
        } else {
            word.root = Some(segment);
        }
    }
    word.settle();
    if !word.is_empty() {
        words.push(word);
    }
    words
}

fn affix(role: &str, description: impl Into<String>) -> MorphAffix {
    MorphAffix { role: role.to_string(), description: description.into() }
}

/// A prefix in words. `Rd` is two morphemes -- the preposition, and the
/// article whose ה it has swallowed (לַמֶּלֶךְ, "to the king") -- and comes
/// back as both.
fn hebrew_prefix(segment: &str) -> Vec<MorphAffix> {
    let descriptions: &[&str] = match segment {
        "R" => &["preposition"],
        "Rd" => &["preposition", "article"],
        "C" => &["conjunction"],
        "c" => &["sequential conjunction"],
        "Td" => &["article"],
        "Ti" => &["interrogative particle"],
        "Tr" => &["relative particle"],
        _ => &[],
    };
    descriptions.iter().map(|d| affix("prefix", *d)).collect()
}

/// A suffix in words: "pronominal suffix, 3rd person masculine singular".
/// The pronominal suffix is the object of a verb, the possessor of a noun
/// and the object of a preposition alike; the code does not say which, and
/// the word it hangs on does.
fn hebrew_suffix(segment: &str) -> Option<MorphAffix> {
    let c: Vec<char> = segment.chars().collect();
    let description = match (c.first(), c.get(1)) {
        (Some('S'), Some('p')) => {
            let mut parts = vec!["pronominal suffix".to_string()];
            let mut pgn: Vec<String> = Vec::new();
            if let Some(p) = c.get(2).and_then(|&p| person(p)) {
                pgn.push(format!("{p} person"));
            }
            pgn.extend(c.get(3).and_then(|&g| hebrew_gender(g)));
            pgn.extend(c.get(4).and_then(|&n| number(n)));
            if !pgn.is_empty() {
                parts.push(pgn.join(" "));
            }
            parts.join(", ")
        }
        (Some('S'), Some('d')) => "directional suffix".into(),
        (Some('S'), Some('h')) => "paragogic he".into(),
        (Some('S'), Some('n')) => "paragogic nun".into(),
        (Some('T'), Some('a')) => "article".into(),
        _ => return None,
    };
    Some(affix("suffix", description))
}

/// One word's prefixes and suffixes, in written order.
fn hebrew_affixes(word: &HebrewWord) -> Vec<MorphAffix> {
    word.prefixes
        .iter()
        .flat_map(|p| hebrew_prefix(p))
        .chain(word.suffixes.iter().filter_map(|x| hebrew_suffix(x)))
        .collect()
}

/// An affix as a description names it: "prefixed conjunction", "pronominal
/// suffix, 1st person common singular", "suffixed article". The suffixes
/// other than the Aramaic article already say what they are. The word study
/// import names a first word's affixes with it too, in the description
/// `morph_codes` keeps (`description_with_affixes`).
pub(crate) fn affix_phrase(a: &MorphAffix) -> String {
    let says_its_role = a.role == "suffix" && (a.description.contains("suffix") || a.description.starts_with("paragogic"));
    if says_its_role {
        a.description.clone()
    } else {
        format!("{}ed {}", a.role, a.description)
    }
}

/// The fields of one morpheme that is a word in its own right ("Ncfsa",
/// "Vqp3ms"), without its description.
fn decode_hebrew_morpheme(segment: &str, aramaic: bool) -> MorphInfo {
    let mut info = MorphInfo { language: if aramaic { "aramaic" } else { "hebrew" }.into(), ..Default::default() };
    let c: Vec<char> = segment.chars().collect();
    match c.first() {
        Some('V') => {
            info.part_of_speech = s("verb");
            let stems = if aramaic { ARAMAIC_STEMS } else { HEBREW_STEMS };
            info.stem = c.get(1).and_then(|st| stems.iter().find(|(k, _)| k == st)).map(|(_, v)| v.to_string());
            let conj = c.get(2).copied();
            let rest = &c[3.min(c.len())..];
            // TAHOT writes the cohortative as `c` followed by a person
            // ("Vqc1cs", "let me go"); `c` alone is the infinitive construct.
            let cohortative = conj == Some('h') || (conj == Some('c') && rest.first().is_some_and(char::is_ascii_digit));
            // The jussive and cohortative are the imperfect (the prefix
            // conjugation) used to wish or resolve; TEHMC parses them so, as
            // "Imperfect" with a mood of their own.
            let (tense, mood) = match conj {
                _ if cohortative => ("imperfect", "cohortative"),
                Some('p') => ("perfect", "indicative"),
                Some('q') => ("sequential perfect", "indicative"),
                Some('i') => ("imperfect", "indicative"),
                // TEHMC's `n`, an imperfect it reads as indicative only where
                // `i` leaves room for a jussive ("HVqn1cp"). TAHOT does not
                // use it today; it is read so that a future edition's does
                // not come back without a tense.
                Some('n') => ("imperfect", "indicative"),
                Some('w') => ("sequential imperfect", "indicative"),
                // TAHOT's "Conjunction+Imperfect": an imperfect after a plain
                // "and", which keeps its own sense rather than taking the
                // sequential's.
                Some('u') => ("conjunctive imperfect", "indicative"),
                Some('j') => ("imperfect", "jussive"),
                Some('v') => ("imperative", "imperative"),
                Some('r') => ("participle", "participle"),
                Some('s') => ("passive participle", "participle"),
                Some('a') => ("infinitive absolute", "infinitive"),
                Some('c') => ("infinitive construct", "infinitive"),
                _ => ("", ""),
            };
            info.tense = (!tense.is_empty()).then(|| tense.to_string());
            info.mood = (!mood.is_empty()).then(|| mood.to_string());
            match conj {
                Some('r') | Some('s') => gns(&mut info, rest),
                Some('a') => {}
                Some('c') if !cohortative => {}
                _ => {
                    if let Some(&p) = rest.first() {
                        info.person = person(p);
                    }
                    if let Some(&g) = rest.get(1) {
                        info.gender = hebrew_gender(g);
                    }
                    if let Some(&n) = rest.get(2) {
                        info.number = number(n);
                    }
                }
            }
        }
        Some('N') => {
            info.part_of_speech = s("noun");
            match c.get(1) {
                Some('p') => {
                    // A proper noun's third letter is not a gender but what it
                    // names (TEHMC): `m`/`f` a man or woman, `l` a place, `t`
                    // anything else -- a deity, a rank, a month. יְהוָה is `t`.
                    info.kind = s(match c.get(2) {
                        Some('m') | Some('f') => "personal name",
                        Some('l') => "place name",
                        Some('t') => "title",
                        _ => "proper name",
                    });
                    if let Some(&g @ ('m' | 'f')) = c.get(2) {
                        info.gender = hebrew_gender(g);
                    }
                }
                other => {
                    info.kind = match other {
                        Some('c') => s("common"),
                        Some('g') => s("gentilic"),
                        Some('t') => s("title"),
                        _ => None,
                    };
                    gns(&mut info, &c[2.min(c.len())..]);
                }
            }
        }
        Some('A') => {
            info.part_of_speech = s("adjective");
            info.kind = match c.get(1) {
                Some('c') => s("cardinal number"),
                Some('o') => s("ordinal number"),
                Some('g') => s("gentilic"),
                _ => None,
            };
            gns(&mut info, &c[2.min(c.len())..]);
        }
        Some('P') => {
            info.part_of_speech = s("pronoun");
            info.kind = match c.get(1) {
                Some('d') => s("demonstrative"),
                Some('f') => s("indefinite"),
                Some('i') => s("interrogative"),
                Some('p') => s("personal"),
                Some('r') => s("relative"),
                _ => None,
            };
            if let Some(&p) = c.get(2) {
                info.person = person(p);
            }
            if let Some(&g) = c.get(3) {
                info.gender = hebrew_gender(g);
            }
            if let Some(&n) = c.get(4) {
                info.number = number(n);
            }
        }
        Some('R') => info.part_of_speech = s("preposition"),
        Some('C') | Some('c') => info.part_of_speech = s("conjunction"),
        Some('D') => info.part_of_speech = s("adverb"),
        Some('T') => {
            info.part_of_speech = s("particle");
            info.kind = match c.get(1) {
                // OSHB's `Ta` is an affirmation; TAHOT uses it only for the
                // Aramaic article, which is read as a suffix before it
                // gets here.
                Some('a') if aramaic => s("definite article"),
                Some('a') => s("affirmation"),
                Some('c') => s("conditional"),
                Some('d') => s("definite article"),
                Some('e') => s("exhortation"),
                Some('i') => s("interrogative"),
                Some('j') => s("interjection"),
                Some('m') => s("demonstrative"),
                Some('n') => s("negative"),
                Some('o') => s("direct object marker"),
                Some('r') => s("relative"),
                _ => None,
            };
        }
        _ => {}
    }
    info
}

pub fn decode_hebrew(code: &str) -> MorphInfo {
    let code = code.trim();
    let mut chars = code.chars();
    let aramaic = chars.next() == Some('A');
    let body = chars.as_str();
    let words = hebrew_words(body, aramaic);
    // The word's parsing is its first word's: the one TAHOT's Strong's number
    // and lemma describe, even where that is only a preposition ("HR//D").
    // A prefix-shaped morpheme is a word's own only when a suffix, a "//" or
    // the end of the code leaves it nothing else to be, so a first word that
    // is one is a word in its own right.
    let Some((main, others)) = words.split_first() else {
        return MorphInfo { language: if aramaic { "aramaic" } else { "hebrew" }.into(), ..Default::default() };
    };
    let mut info = decode_hebrew_morpheme(main.root.unwrap_or(""), aramaic);
    info.affixes = hebrew_affixes(main);
    // The fields and `affixes` are the first word's, so any other word
    // written with it carries its own prefixes and suffixes in its part of
    // the description, or the reader would lose Ruth 3:5's "to me" entirely:
    // "... + preposition, with pronominal suffix, 1st person common singular".
    let other_parts = others.iter().map(|w| {
        let part = describe(&decode_hebrew_morpheme(w.root.unwrap_or(""), aramaic));
        let affixes: Vec<String> = hebrew_affixes(w).iter().map(affix_phrase).collect();
        if affixes.is_empty() || part.is_empty() {
            part
        } else {
            format!("{part}, with {}", affixes.join(" and "))
        }
    });
    info.description = std::iter::once(describe(&info)).chain(other_parts).filter(|d| !d.is_empty()).collect::<Vec<_>>().join(" + ");
    info
}

/// Decodes a code of either system: Hebrew and Aramaic codes begin with
/// their language letter followed by a lower- or upper-case part of speech
/// that Robinson's never produces in that position.
pub fn decode(code: &str) -> MorphInfo {
    let t = code.trim();
    let bytes = t.as_bytes();
    // Robinson's codes that begin with H or A are "A-...", "ADV...", "ARAM"
    // and "HEB"; every other code beginning so is OSHB's.
    let hebrew = bytes.len() >= 2
        && (bytes[0] == b'H' || bytes[0] == b'A')
        && bytes[1] != b'-'
        && !t.starts_with("ADV")
        && t != "ARAM"
        && t != "HEB";
    if hebrew {
        decode_hebrew(t)
    } else {
        decode_greek(t)
    }
}

/// What a word is, where TAHOT's code for it says something else (see
/// `RETAGGED`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Reading {
    Adverb,
    Preposition,
    /// An adverb standing alone, a preposition bound to the word after it:
    /// אַחַר is "afterward" in Genesis 18:5 ("HAcmsa") and "after" in 22:1
    /// ("HAcmsc"); מִנֶּגֶד is "a good way off" in 21:16, כְּנֶגְדּוֹ "for him"
    /// in 2:18.
    AdverbOrPreposition,
    Conjunction,
    /// לְמַעַן: a preposition with a pronoun suffix, "for my sake" (Isa
    /// 43:25), as the tagged text itself codes it once (Job 18:4's
    /// הַלְמַעַנְךָ, "HTi/R/Sp2ms") and as STEPBible's lexicon classes it
    /// ("H:Prep / H:Conj"). Otherwise the particle its code calls it, without
    /// "conditional". Standing alone it is "for the sake of" before a noun
    /// ("for his name's sake", Ps 23:3) and "so that" before a verb (Gen
    /// 12:13), and neither the code nor the Strong's number says which: read
    /// as a conjunction throughout, it was one before "his name's sake" too,
    /// which contradicted the code for no gain.
    SakeOf,
    /// יֵשׁ, "there is", and the Aramaic אִיתַי.
    Existence,
    /// An ordinary adjective: כָּתִית, "beaten" (oil).
    Adjective,
    /// מְאֹד: "very" standing alone, and the noun "might" with a suffix,
    /// "with all your might" (Deut 6:5, "HAcmsc/Sp2ms").
    VeryOrMight,
}

/// A code TAHOT misnames words with, by the part of speech and kind it
/// decodes to, and what it calls the word in the reader's words (for
/// `MorphInfo::coded_as`).
#[derive(Debug, Clone, Copy)]
struct Coded {
    pos: &'static str,
    kind: &'static str,
    called: &'static str,
}

/// The code TAHOT gives the words below: an adjective that is a number
/// ("Ac", "Numerical" in TEHMC), and a conditional particle ("Tc").
const AS_NUMBER: Coded = Coded { pos: "adjective", kind: "cardinal number", called: "a cardinal number" };
const AS_CONDITIONAL: Coded = Coded { pos: "particle", kind: "conditional", called: "a conditional particle" };

/// Words whose code in TAHOT misnames them, by Strong's number (Hebrew and
/// Aramaic), with the code they are given and what they are.
///
/// TAHOT codes some twenty everyday words as numbers, about 2,600 words in
/// all: מְאֹד "very", עוֹד "still", אַחַר "after", בֵּין "between", יֵשׁ "there
/// is" and the rest below. Read from the code alone, Genesis 1:31's "very
/// good" was "good" and a cardinal number, and a reader was told what a
/// counting number is directly above a lexicon line calling בֵּין a
/// preposition. It codes כִּי ("for, that, because, when") as a conditional
/// particle, which is right for אִם, "if", and wrong for 4,483 words of its
/// own, with פֶּן ("lest") and לְמַעַן ("for the sake of, so that") beside it.
/// The code cannot tell these from the numbers and conditionals that share
/// it, so the word is read by its Strong's number: as the lexicons class it,
/// and only where its code is the one below. The numbers themselves --
/// אֶחָד, שְׁנַיִם, מֵאָה, and the rest -- keep their code's reading. Where a
/// word is read otherwise, `coded_as` says what its code calls it, so the
/// code shown beside the parsing does not stand there unexplained.
const RETAGGED: &[(u32, Coded, Reading)] = &[
    (310, AS_NUMBER, Reading::AdverbOrPreposition),  // אַחַר, after, afterward
    (383, AS_NUMBER, Reading::Existence),            // Aramaic אִיתַי, there is
    (996, AS_NUMBER, Reading::Preposition),          // בֵּין, between
    (1004, AS_NUMBER, Reading::Preposition),         // בֵּית as "between, among" (Job 8:17, Prov 8:2, Ezek 41:9)
    (1107, AS_NUMBER, Reading::Preposition),         // בִּלְעֲדֵי, apart from, without
    (1157, AS_NUMBER, Reading::Preposition),         // בְּעַד, behind, through, on behalf of
    (2270, AS_NUMBER, Reading::Adjective),           // חָבֵר, joined (Judg 20:11)
    (2962, AS_NUMBER, Reading::Adverb),              // טֶרֶם, before, not yet
    (3426, AS_NUMBER, Reading::Existence),           // יֵשׁ, there is
    (3520, AS_NUMBER, Reading::Adjective),           // כְּבוּדָּה, glorious (Ps 45:13)
    (3795, AS_NUMBER, Reading::Adjective),           // כָּתִית, beaten
    (3966, AS_NUMBER, Reading::VeryOrMight),         // מְאֹד, very; might
    (4295, AS_NUMBER, Reading::AdverbOrPreposition), // מַטָּה, downward, beneath
    (4605, AS_NUMBER, Reading::AdverbOrPreposition), // מַעַל, above, upward
    (5048, AS_NUMBER, Reading::AdverbOrPreposition), // נֶגֶד, before, in front of
    (5227, AS_NUMBER, Reading::AdverbOrPreposition), // נֹכַח, in front of, straight ahead
    (5750, AS_NUMBER, Reading::Adverb),              // עוֹד, still, again
    (6941, AS_NUMBER, Reading::Adverb),              // קְדֹרַנִּית, mournfully (Mal 3:14)
    (7317, AS_NUMBER, Reading::Adverb),              // רוֹמָה, haughtily (Mic 2:3)
    (7946, AS_NUMBER, Reading::Adjective),           // שַׁלְאֲנָן, at ease (Job 21:23)
    (8602, AS_NUMBER, Reading::Adjective),           // תָּפֵל, tasteless, untempered
    (3588, AS_CONDITIONAL, Reading::Conjunction),    // כִּי, for, that, because, when
    (4616, AS_CONDITIONAL, Reading::SakeOf),         // לְמַעַן, for the sake of, so that
    (6435, AS_CONDITIONAL, Reading::Conjunction),    // פֶּן, lest
];

/// A Hebrew Strong's number as `RETAGGED` keys it: "H3966", TAHOT's
/// "H0996G" and "{H3966}" alike.
fn hebrew_strongs_number(strongs_id: &str) -> Option<u32> {
    let rest = strongs_id.trim().trim_start_matches('{').strip_prefix('H')?;
    let digits: String = rest.chars().take_while(char::is_ascii_digit).collect();
    digits.parse().ok()
}

/// Whether `RETAGGED` may read a word with this Strong's number otherwise
/// than its code: true for every word of those numbers, whatever its code.
pub fn may_be_retagged(strongs_id: &str) -> bool {
    hebrew_strongs_number(strongs_id).is_some_and(|n| RETAGGED.iter().any(|(id, _, _)| *id == n))
}

/// The Strong's numbers `RETAGGED` names, as the imported text writes
/// them ("H3966").
pub fn retagged_strongs_ids() -> Vec<String> {
    RETAGGED.iter().map(|(n, _, _)| format!("H{n}")).collect()
}

/// Decodes the code of one word of the text, knowing which word it is: as
/// `decode`, but with a word `RETAGGED` names read as what it is where its
/// code is the one TAHOT misnames it with.
pub fn decode_word(code: &str, strongs_id: Option<&str>) -> MorphInfo {
    let mut info = decode(code);
    if info.language == "greek" {
        return info;
    }
    let Some(n) = strongs_id.and_then(hebrew_strongs_number) else {
        return info;
    };
    let Some(&(_, coded, reading)) = RETAGGED.iter().find(|(id, _, _)| *id == n) else {
        return info;
    };
    if info.part_of_speech.as_deref() == Some(coded.pos) && info.kind.as_deref() == Some(coded.kind) {
        retag(&mut info, reading);
        info.coded_as = Some(coded.called.to_string());
    }
    info
}

/// Reads the word as `reading` says, keeping its prefixes and suffixes and
/// any other word its code writes with it. An adverb, preposition,
/// conjunction or particle has no gender, number or state, as its own code
/// in OSHB has none.
fn retag(info: &mut MorphInfo, reading: Reading) {
    let construct = info.state.as_deref() == Some("construct");
    let pronoun_suffix = info.affixes.iter().any(|a| a.role == "suffix" && a.description.starts_with("pronominal suffix"));
    let (pos, kind, keeps_endings) = match reading {
        Reading::Adverb => ("adverb", None, false),
        Reading::Preposition => ("preposition", None, false),
        Reading::AdverbOrPreposition if construct => ("preposition", None, false),
        Reading::AdverbOrPreposition => ("adverb", None, false),
        Reading::Conjunction => ("conjunction", None, false),
        Reading::SakeOf if pronoun_suffix => ("preposition", None, false),
        Reading::SakeOf => ("particle", None, false),
        Reading::Existence => ("particle", Some("existence"), false),
        Reading::Adjective => ("adjective", None, true),
        Reading::VeryOrMight if construct => ("noun", Some("common"), true),
        Reading::VeryOrMight => ("adverb", None, false),
    };
    info.part_of_speech = s(pos);
    info.kind = kind.map(str::to_string);
    if !keeps_endings {
        info.gender = None;
        info.number = None;
        info.state = None;
    }
    // The description's first part is this word's; any after " + " are the
    // other words' its code writes with it.
    let others = info.description.split_once(" + ").map(|(_, rest)| rest.to_string());
    let own = describe(info);
    info.description = match others {
        Some(rest) => format!("{own} + {rest}"),
        None => own,
    };
}

fn describe(i: &MorphInfo) -> String {
    let mut out = Vec::new();
    if let Some(pos) = &i.part_of_speech {
        out.push(pos.clone());
    }
    // The kind stands apart from the verb's stem, tense, voice and mood, or
    // Mark 5:41's κουμ ("V-AAM-2S-ARAM") would read "transliterated from
    // aramaic aorist active imperative". A Hebrew noun's "common" goes
    // unsaid: it is what a noun is unless it is a name or a gentilic, and
    // beside the common gender of אֶרֶץ ("HNcbsa") it would read "noun,
    // common, common singular absolute", one word for two things. The field
    // keeps it.
    if let Some(kind) = &i.kind {
        let goes_without_saying = i.language != "greek" && i.part_of_speech.as_deref() == Some("noun") && kind == "common";
        if !goes_without_saying {
            out.push(kind.clone());
        }
    }
    let mut middle: Vec<String> = Vec::new();
    for v in [&i.stem, &i.tense, &i.voice].into_iter().flatten() {
        middle.push(v.clone());
    }
    if let Some(m) = &i.mood {
        // Not "participle participle" or "infinitive construct infinitive",
        // and not the Hebrew indicative, which is every finite verb that is
        // not a command or a wish.
        let already_said = i.tense.as_deref().is_some_and(|t| t.contains(m.as_str()));
        if !already_said && !(i.language != "greek" && m == "indicative") {
            middle.push(m.clone());
        }
    }
    if !middle.is_empty() {
        out.push(middle.join(" "));
    }
    let mut tail: Vec<String> = Vec::new();
    if let Some(p) = &i.person {
        match &i.possessor_number {
            // A possessive's person and number are its possessor's, and stand
            // apart from the case, gender and number it shares with the thing
            // possessed: "1st person singular possessor, accusative feminine
            // plural" is "my" with a plural noun, where "1st person accusative
            // feminine plural" read as "our".
            Some(n) => out.push(format!("{p} person {n} possessor")),
            None => tail.push(format!("{p} person")),
        }
    }
    if let Some(c) = &i.case {
        tail.push(c.clone());
    }
    if let Some(g) = &i.gender {
        // After a person, "1st person common singular" is the grammars'
        // phrase and cannot be misread. With nothing before it, "noun,
        // common singular absolute" reads as a common noun.
        if g == "common" && i.person.is_none() {
            tail.push(format!("{g} gender"));
        } else {
            tail.push(g.clone());
        }
    }
    for v in [&i.number, &i.state].into_iter().flatten() {
        tail.push(v.clone());
    }
    if !tail.is_empty() {
        out.push(tail.join(" "));
    }
    out.join(", ")
}

/// Every "<field>:<value>" pair a decoded code carries, the way the glossary
/// keys them: one per filled field, and one "affix:<description>" per affix.
#[cfg(test)]
pub(crate) fn glossary_keys(info: &MorphInfo) -> Vec<String> {
    let fields = [
        ("part_of_speech", &info.part_of_speech),
        ("tense", &info.tense),
        ("voice", &info.voice),
        ("mood", &info.mood),
        ("person", &info.person),
        ("number", &info.number),
        ("gender", &info.gender),
        ("case", &info.case),
        ("state", &info.state),
        ("stem", &info.stem),
        ("kind", &info.kind),
    ];
    fields
        .iter()
        .filter_map(|(name, value)| value.as_ref().map(|v| format!("{name}:{v}")))
        .chain(info.affixes.iter().map(|a| format!("affix:{}", a.description)))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn prefix(d: &str) -> MorphAffix {
        affix("prefix", d)
    }
    fn suffix(d: &str) -> MorphAffix {
        affix("suffix", d)
    }

    #[test]
    fn greek_verbs() {
        let v = decode("V-AAM-2S");
        assert_eq!(v.tense.as_deref(), Some("aorist"));
        assert_eq!(v.voice.as_deref(), Some("active"));
        assert_eq!(v.mood.as_deref(), Some("imperative"));
        assert_eq!(v.person.as_deref(), Some("2nd"));
        assert_eq!(v.number.as_deref(), Some("singular"));
        assert_eq!(v.description, "verb, aorist active imperative, 2nd person singular");
        assert!(v.affixes.is_empty());
        let p = decode("V-PAP-NSM");
        assert_eq!(p.mood.as_deref(), Some("participle"));
        assert_eq!(p.case.as_deref(), Some("nominative"));
        assert_eq!(p.gender.as_deref(), Some("masculine"));
        assert_eq!(decode("V-2AAI-3S").tense.as_deref(), Some("aorist"));
        assert_eq!(decode("V-PAN").mood.as_deref(), Some("infinitive"));
    }

    #[test]
    fn greek_deponents_are_not_read_as_true_passives() {
        // ἔρχεται, "he comes" (Matt 3:11 and throughout).
        let d = decode("V-PNI-3S");
        assert_eq!(d.voice.as_deref(), Some("middle or passive deponent"));
        assert_eq!(d.description, "verb, present middle or passive deponent indicative, 3rd person singular");
        assert_eq!(decode("V-FDI-3S").voice.as_deref(), Some("middle deponent"));
        assert_eq!(decode("V-AOI-3S").voice.as_deref(), Some("passive deponent"));
        assert_eq!(decode("V-API-3S").voice.as_deref(), Some("passive"));
        assert_eq!(decode("V-PEI-3S").voice.as_deref(), Some("middle or passive"));
    }

    #[test]
    fn greek_nominals_and_particles() {
        let n = decode("N-NSF");
        assert_eq!((n.part_of_speech.as_deref(), n.case.as_deref(), n.number.as_deref(), n.gender.as_deref()), (Some("noun"), Some("nominative"), Some("singular"), Some("feminine")));
        let p = decode("P-1GS");
        assert_eq!((p.kind.as_deref(), p.person.as_deref(), p.case.as_deref()), (Some("personal"), Some("1st"), Some("genitive")));
        assert_eq!(decode("PREP").part_of_speech.as_deref(), Some("preposition"));
        assert_eq!(decode("N-PRI").kind.as_deref(), Some("proper name, indeclinable"));
        assert_eq!(decode("T-NSM").part_of_speech.as_deref(), Some("article"));
        let s = decode("S-1PASF");
        assert_eq!((s.kind.as_deref(), s.person.as_deref(), s.case.as_deref(), s.number.as_deref()), (Some("possessive"), Some("1st"), Some("accusative"), Some("singular")));
        assert_eq!(s.possessor_number.as_deref(), Some("plural"));
        assert!(decode("P-1GS").possessor_number.is_none());
    }

    #[test]
    fn a_greek_possessive_keeps_its_possessors_number_apart_from_its_own() {
        // John 14:15, τὰς ἐντολὰς τὰς ἐμὰς: "my" commandments, one
        // possessor and many things possessed.
        let my = decode("S-1SAPF");
        assert_eq!((my.person.as_deref(), my.possessor_number.as_deref(), my.number.as_deref()), (Some("1st"), Some("singular"), Some("plural")));
        assert_eq!(my.description, "pronoun, possessive, 1st person singular possessor, accusative feminine plural");
        // 1 John 1:3, ἡ κοινωνία ἡ ἡμετέρα: "our" fellowship.
        let our = decode("S-1PNSF");
        assert_eq!((our.possessor_number.as_deref(), our.number.as_deref()), (Some("plural"), Some("singular")));
        assert_eq!(our.description, "pronoun, possessive, 1st person plural possessor, nominative feminine singular");
        // Only the possessive has one to give; the JSON leaves it out elsewhere.
        assert_eq!(decode("P-1GS").description, "pronoun, personal, 1st person genitive singular");
        let json = serde_json::to_value(decode("P-1GS")).unwrap();
        assert!(json.get("possessor_number").is_none());
        assert_eq!(serde_json::to_value(&my).unwrap()["possessor_number"], "singular");
    }

    #[test]
    fn greek_tags_name_the_kind_of_word() {
        // Matthew 1:1: Ἰησοῦ Χριστοῦ ... Δαυὶδ.
        let jesus = decode("N-GSM-P");
        assert_eq!((jesus.kind.as_deref(), jesus.case.as_deref()), (Some("personal name"), Some("genitive")));
        assert_eq!(jesus.description, "noun, personal name, genitive masculine singular");
        assert_eq!(decode("N-GSM-T").kind.as_deref(), Some("title"));
        assert_eq!(decode("N-DSF-L").kind.as_deref(), Some("place name"));
        assert_eq!(decode("N-NSM-LG").kind.as_deref(), Some("gentilic"));
        assert_eq!(decode("A-NPM-PG").kind.as_deref(), Some("gentilic"));
        assert_eq!(decode("A-NSM-C").kind.as_deref(), Some("comparative"));
        assert_eq!(decode("A-NSN-S").kind.as_deref(), Some("superlative"));
        assert_eq!(decode("ADV-C").kind.as_deref(), Some("comparative"));
        assert_eq!(decode("A-ASM-N").kind.as_deref(), Some("negative"));
        let not = decode("PRT-N");
        assert_eq!((not.part_of_speech.as_deref(), not.kind.as_deref()), (Some("particle"), Some("negative")));
        assert_eq!(decode("CONJ-N").kind.as_deref(), Some("negative"));
        assert_eq!(decode("ADV-I").kind.as_deref(), Some("interrogative"));
        assert_eq!(decode("N-NSN-LI").kind.as_deref(), Some("letter"));
        assert_eq!(decode("INJ-HEB").kind.as_deref(), Some("transliterated from hebrew"));
        let abba = decode("N-VSM-ARAM");
        assert_eq!((abba.kind.as_deref(), abba.case.as_deref()), (Some("transliterated from aramaic"), Some("vocative")));
        assert_eq!(abba.description, "noun, transliterated from aramaic, vocative masculine singular");
        // Mark 5:41 κουμ: the kind is its own part of the description, not
        // run into the tense.
        let koum = decode("V-AAM-2S-ARAM");
        assert_eq!((koum.kind.as_deref(), koum.tense.as_deref(), koum.person.as_deref()), (Some("transliterated from aramaic"), Some("aorist"), Some("2nd")));
        assert_eq!(koum.description, "verb, transliterated from aramaic, aorist active imperative, 2nd person singular");
        // A contracted noun is only a spelling, and Attic verbs parse as any other.
        assert_eq!(decode("N-NPM-C").kind, None);
        let attic = decode("V-2AAI-3P-ATT");
        assert_eq!((attic.kind, attic.person.as_deref(), attic.number.as_deref()), (None, Some("3rd"), Some("plural")));
    }

    #[test]
    fn greek_words_merged_by_crasis_keep_the_first_parsing() {
        // κἀγώ, "and I".
        let k = decode("P-1NS + G2532=CONJ");
        assert_eq!((k.part_of_speech.as_deref(), k.person.as_deref(), k.case.as_deref(), k.number.as_deref(), k.gender.as_deref()), (Some("pronoun"), Some("1st"), Some("nominative"), Some("singular"), None));
        assert_eq!(k.description, "pronoun, personal, 1st person nominative singular + conjunction");
        // οὐκέτι; and a "+" part that offers alternative Strong's numbers.
        assert_eq!(decode("PRT-N + G2089=ADV").description, "particle, negative + adverb");
        let p = decode("PREP + G0746=N-GSF");
        assert_eq!((p.part_of_speech.as_deref(), p.case), (Some("preposition"), None));
        assert_eq!(p.description, "preposition + noun, genitive feminine singular");
        assert_eq!(decode("N-DPM + G0846|G3165=P-1GS").description, "noun, dative masculine plural + pronoun, personal, 1st person genitive singular");
    }

    #[test]
    fn hebrew_codes() {
        let v = decode("HVqp3ms");
        assert_eq!(v.language, "hebrew");
        assert_eq!((v.stem.as_deref(), v.tense.as_deref(), v.person.as_deref(), v.gender.as_deref(), v.number.as_deref()), (Some("qal"), Some("perfect"), Some("3rd"), Some("masculine"), Some("singular")));
        assert!(v.affixes.is_empty());
        let n = decode("HR/Ncfsa");
        assert_eq!((n.part_of_speech.as_deref(), n.gender.as_deref(), n.state.as_deref()), (Some("noun"), Some("feminine"), Some("absolute")));
        assert_eq!(n.description, "noun, feminine singular absolute");
        // אֶרֶץ: the noun's kind stays in the field for the glossary, but the
        // description does not say "common" for both kind and gender.
        let land = decode("HNcbsc");
        assert_eq!((land.kind.as_deref(), land.gender.as_deref()), (Some("common"), Some("common")));
        // Nor does its gender, with no person before it, read as a common noun.
        assert_eq!(land.description, "noun, common gender singular construct");
        assert_eq!(decode("HNgmsa").description, "noun, gentilic, masculine singular absolute");
        let w = decode("HC/Vqw3ms");
        assert_eq!(w.tense.as_deref(), Some("sequential imperfect"));
        let s = decode("HNcmpc/Sp3ms");
        assert_eq!(s.state.as_deref(), Some("construct"));
        let a = decode("AVqp3ms");
        assert_eq!((a.language.as_str(), a.stem.as_deref()), ("aramaic", Some("peal")));
        assert_eq!(decode("HTo").kind.as_deref(), Some("direct object marker"));
        let imv = decode("HVqv2ms");
        assert_eq!(imv.mood.as_deref(), Some("imperative"));
    }

    #[test]
    fn hebrew_prefixes_and_suffixes() {
        // וּבָאָרֶץ-shaped: "and in the land".
        let n = decode("HC/Rd/Ncbsa");
        assert_eq!(n.affixes, vec![prefix("conjunction"), prefix("preposition"), prefix("article")]);
        assert_eq!(n.gender.as_deref(), Some("common"));
        // דְּבָרָיו, "his words".
        let s = decode("HNcmpc/Sp3ms");
        assert_eq!(s.affixes, vec![suffix("pronominal suffix, 3rd person masculine singular")]);
        // TAHOT's "b" (either gender) on a suffix is common gender: "my".
        assert_eq!(decode("HNcmsc/Sp1bs").affixes, vec![suffix("pronominal suffix, 1st person common singular")]);
        assert_eq!(decode("HTd/Ncmsa").affixes, vec![prefix("article")]);
        assert_eq!(decode("HTi/Tn").affixes, vec![prefix("interrogative particle")]);
        assert_eq!(decode("HR/Tr").affixes, vec![prefix("preposition")]);
        assert_eq!(decode("HR/Tr").kind.as_deref(), Some("relative"));
        assert_eq!(decode("HNpl/Sd").affixes, vec![suffix("directional suffix")]);
        assert_eq!(decode("HVqi3mp/Sn").affixes, vec![suffix("paragogic nun")]);
        assert_eq!(decode("HVqh1cs/Sh").affixes, vec![suffix("paragogic he")]);
        // Greek never has any.
        assert!(decode("P-1NS + G2532=CONJ").affixes.is_empty());
    }

    #[test]
    fn a_hebrew_preposition_with_a_suffix_is_the_word_itself() {
        // לוֹ, "to him": the preposition, not a prefix to nothing.
        let lo = decode("HRd/Sp3ms");
        assert_eq!(lo.part_of_speech.as_deref(), Some("preposition"));
        assert_eq!(lo.affixes, vec![suffix("pronominal suffix, 3rd person masculine singular")]);
        // וְלוֹ, "and to him".
        let velo = decode("HC/R/Sp3ms");
        assert_eq!(velo.part_of_speech.as_deref(), Some("preposition"));
        assert_eq!(velo.affixes, vec![prefix("conjunction"), suffix("pronominal suffix, 3rd person masculine singular")]);
        // A bare conjunction or preposition.
        assert_eq!(decode("HC").part_of_speech.as_deref(), Some("conjunction"));
        let al = decode("HR");
        assert_eq!((al.part_of_speech.as_deref(), al.affixes.len()), (Some("preposition"), 0));
    }

    #[test]
    fn the_consecutive_vav_and_tahots_other_verb_forms() {
        // וַיֹּאמֶר, "and he said" (Gen 1:3).
        let said = decode("Hc/Vqw3ms");
        assert_eq!(said.affixes, vec![prefix("sequential conjunction")]);
        assert_eq!(said.description, "verb, qal sequential imperfect, 3rd person masculine singular");
        // Cohortative: אֵלְכָה, "let me go"; not an infinitive construct.
        let go = decode("HVqc1cs");
        assert_eq!((go.tense.as_deref(), go.mood.as_deref(), go.person.as_deref(), go.gender.as_deref()), (Some("imperfect"), Some("cohortative"), Some("1st"), Some("common")));
        assert_eq!(go.description, "verb, qal imperfect cohortative, 1st person common singular");
        let inf = decode("HR/Vqcc");
        assert_eq!((inf.tense.as_deref(), inf.mood.as_deref(), inf.person), (Some("infinitive construct"), Some("infinitive"), None));
        assert_eq!(inf.description, "verb, qal infinitive construct");
        let jussive = decode("HVqj3ms");
        assert_eq!((jussive.tense.as_deref(), jussive.mood.as_deref()), (Some("imperfect"), Some("jussive")));
        let weyiqtol = decode("HC/Vqu3mp");
        assert_eq!(weyiqtol.tense.as_deref(), Some("conjunctive imperfect"));
        assert_eq!(decode("HVqsmsa").description, "verb, qal passive participle, masculine singular absolute");
        // TEHMC's indicative-only imperfect, which TAHOT does not yet use.
        let n = decode("HVhn1cp");
        assert_eq!((n.stem.as_deref(), n.tense.as_deref(), n.mood.as_deref(), n.person.as_deref(), n.number.as_deref()), (Some("hiphil"), Some("imperfect"), Some("indicative"), Some("1st"), Some("plural")));
        assert_eq!(n.description, "verb, hiphil imperfect, 1st person common plural");
    }

    #[test]
    fn hebrew_names_say_what_they_name() {
        let joseph = decode("HNpm");
        assert_eq!((joseph.kind.as_deref(), joseph.gender.as_deref()), (Some("personal name"), Some("masculine")));
        let jerusalem = decode("HC/Npl");
        assert_eq!((jerusalem.kind.as_deref(), jerusalem.gender), (Some("place name"), None));
        assert_eq!(decode("HNpt").kind.as_deref(), Some("title"));
        assert_eq!(decode("HTc").kind.as_deref(), Some("conditional"));
    }

    /// (part of speech, kind, gender, number, state, description) of a word.
    fn read_as(code: &str, strongs_id: &str) -> (Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, String) {
        let i = decode_word(code, Some(strongs_id));
        (i.part_of_speech, i.kind, i.gender, i.number, i.state, i.description)
    }

    fn owned(v: &str) -> Option<String> {
        Some(v.to_string())
    }

    #[test]
    fn words_tahot_codes_as_numbers_are_read_as_what_they_are() {
        // Gen 1:31, "very good": מְאֹד is "HAcmsa", a number by its code.
        assert_eq!(decode("HAcmsa").kind.as_deref(), Some("cardinal number"));
        assert_eq!(read_as("HAcmsa", "H3966"), (owned("adverb"), None, None, None, None, "adverb".to_string()));
        // Deut 6:5, "with all your might": the same word as a noun.
        let might = decode_word("HAcmsc/Sp2ms", Some("H3966"));
        assert_eq!((might.part_of_speech.as_deref(), might.kind.as_deref(), might.state.as_deref()), (Some("noun"), Some("common"), Some("construct")));
        assert_eq!(might.affixes, vec![suffix("pronominal suffix, 2nd person masculine singular")]);
        assert_eq!(might.description, "noun, masculine singular construct");
        // Gen 1:4, "between the light and the darkness": בֵּין, and וּבֵין with
        // its "and".
        assert_eq!(read_as("HAcmsc", "H996").0, owned("preposition"));
        let and_between = decode_word("HC/Acmsc", Some("H996"));
        assert_eq!((and_between.part_of_speech.as_deref(), and_between.affixes.clone()), (Some("preposition"), vec![prefix("conjunction")]));
        assert_eq!(and_between.description, "preposition");
        // אַחַר: "afterward" alone (Gen 18:5), "after" before its noun (22:1).
        assert_eq!(read_as("HAcmsa", "H310").0, owned("adverb"));
        assert_eq!(read_as("HAcmsc", "H310").0, owned("preposition"));
        // Gen 2:5's טֶרֶם, "not yet", and 18:24's יֵשׁ, "there is".
        assert_eq!(read_as("HAcbsa", "H2962").0, owned("adverb"));
        assert_eq!(read_as("HAcbsa", "H3426"), (owned("particle"), owned("existence"), None, None, None, "particle, existence".to_string()));
        // A plain adjective keeps its endings: כָּתִית, "beaten" (oil).
        assert_eq!(read_as("HAcmsa", "H3795"), (owned("adjective"), None, owned("masculine"), owned("singular"), owned("absolute"), "adjective, masculine singular absolute".to_string()));
        // TAHOT's own spelling of the number reads the same.
        assert_eq!(read_as("HAcmsc", "H0996G").0, owned("preposition"));
        assert_eq!(read_as("HAcmsc", "{H0996G}").0, owned("preposition"));
    }

    #[test]
    fn only_the_misnamed_code_is_read_otherwise() {
        // The numbers keep their code's reading: אֶחָד, "one" (Gen 1:5).
        assert_eq!(decode_word("HAcmsa", Some("H259")), decode("HAcmsa"));
        // Any other code on a word the table names is TAHOT's: עוֹד where it
        // is coded an adverb stays one, and a noun stays a noun.
        assert_eq!(decode_word("HD", Some("H5750")), decode("HD"));
        assert_eq!(decode_word("HNcmsa", Some("H3966")), decode("HNcmsa"));
        // Without a Strong's number, or in Greek, the code is all there is.
        assert_eq!(decode_word("HAcmsa", None), decode("HAcmsa"));
        assert_eq!(decode_word("A-NSM", Some("H3966")), decode("A-NSM"));
        assert!(may_be_retagged("H3966") && may_be_retagged("H0310A") && !may_be_retagged("H259") && !may_be_retagged("G3966"));
        assert!(retagged_strongs_ids().contains(&"H3588".to_string()));
    }

    #[test]
    fn ki_and_its_kin_are_not_conditional() {
        // Gen 1:4, "God saw the light, that it was good".
        assert_eq!(read_as("HTc", "H3588"), (owned("conjunction"), None, None, None, None, "conjunction".to_string()));
        // פֶּן, "lest".
        assert_eq!(read_as("HC/Tc", "H6435").0, owned("conjunction"));
    }

    #[test]
    fn lemaan_is_a_preposition_with_its_suffix_and_otherwise_the_particle_its_code_says() {
        // Isa 43:25, "for mine own sake": a preposition, as Job 18:4's
        // הַלְמַעַנְךָ is coded one ("HTi/R/Sp2ms") and read as its code says.
        assert_eq!(read_as("HTc/Sp1bs", "H4616").0, owned("preposition"));
        assert_eq!(decode_word("HTi/R/Sp2ms", Some("H4616")), decode("HTi/R/Sp2ms"));
        assert_eq!(decode("HTi/R/Sp2ms").part_of_speech.as_deref(), Some("preposition"));
        // Ps 23:3, "for his name's sake", and Gen 12:13, "that it may be well
        // with me": one code, and the particle it calls the word -- not a
        // conjunction before a noun, and not "if".
        assert_eq!(read_as("HTc", "H4616"), (owned("particle"), None, None, None, None, "particle".to_string()));
        let and_so_that = decode_word("HC/Tc", Some("H4616"));
        assert_eq!((and_so_that.part_of_speech.as_deref(), and_so_that.kind.as_deref()), (Some("particle"), None));
        assert_eq!(and_so_that.affixes, vec![prefix("conjunction")]);
        // אִם, "if", is conditional.
        assert_eq!(decode_word("HTc", Some("H518")).kind.as_deref(), Some("conditional"));
    }

    #[test]
    fn a_word_read_otherwise_says_what_its_code_calls_it() {
        // The code stays beside the parsing, so the parsing says why "HAcmsa"
        // stands beside "adverb".
        assert_eq!(decode_word("HAcmsa", Some("H3966")).coded_as.as_deref(), Some("a cardinal number"));
        assert_eq!(decode_word("HTc", Some("H3588")).coded_as.as_deref(), Some("a conditional particle"));
        assert_eq!(decode_word("HTc", Some("H4616")).coded_as.as_deref(), Some("a conditional particle"));
        // A word read as its code says has nothing to explain, and the JSON
        // leaves the field out.
        assert_eq!(decode_word("HAcmsa", Some("H259")).coded_as, None);
        assert_eq!(decode_word("HNcmsa", Some("H3966")).coded_as, None);
        let json = serde_json::to_value(decode_word("HAcmsa", Some("H259"))).unwrap();
        assert!(json.get("coded_as").is_none());
        let json = serde_json::to_value(decode_word("HAcmsa", Some("H3966"))).unwrap();
        assert_eq!(json["coded_as"], "a cardinal number");
    }

    #[test]
    fn a_retagged_word_keeps_the_other_words_written_with_it() {
        let two = decode_word("HAcmsa//Tr", Some("H3966"));
        assert_eq!(two.description, "adverb + particle, relative");
    }

    #[test]
    fn every_retagged_reading_has_its_glossary_entries() {
        let glossary: serde_json::Value = serde_json::from_str(include_str!("../../src/features/lexicon/parsingGlossary.json")).unwrap();
        let terms = glossary["terms"].as_object().unwrap();
        let samples = ["HAcmsa", "HAcmsc", "HAcbsc/Sp2ms", "HR/Acmsa", "HTc", "HTc/Sp2mp", "AAcbsc/Sp2ms"];
        for (n, coded, _) in RETAGGED {
            let id = format!("H{n}");
            let mut read_otherwise = false;
            for code in samples {
                let as_coded = decode(code);
                if as_coded.part_of_speech.as_deref() != Some(coded.pos) || as_coded.kind.as_deref() != Some(coded.kind) {
                    continue;
                }
                let read = decode_word(code, Some(&id));
                read_otherwise |= read.part_of_speech != as_coded.part_of_speech || read.kind != as_coded.kind;
                for key in glossary_keys(&read) {
                    let found = terms.contains_key(&key) || key.split_once(',').is_some_and(|(k, _)| terms.contains_key(k));
                    assert!(found, "{id} {code}: parsingGlossary.json has no {key}");
                }
            }
            assert!(read_otherwise, "{id} is read as its code says");
        }
    }

    #[test]
    fn the_aramaic_article_is_a_suffix() {
        // אַרְקָא, "the earth" (Jer 10:11).
        let earth = decode("AC/Ncbsd/Ta");
        assert_eq!(earth.language, "aramaic");
        assert_eq!((earth.part_of_speech.as_deref(), earth.state.as_deref()), (Some("noun"), Some("determined")));
        assert_eq!(earth.affixes, vec![prefix("conjunction"), suffix("article")]);
    }

    #[test]
    fn words_written_as_one_parse_as_the_first() {
        // Gen 30:11 Qere בָּגָד, "fortune has come": the verb is the word
        // TAHOT's Strong's number names.
        let came = decode("HVqp3ms//Ncmsa");
        assert_eq!(came.part_of_speech.as_deref(), Some("verb"));
        assert_eq!(came.description, "verb, qal perfect, 3rd person masculine singular + noun, masculine singular absolute");
        // Ruth 3:5 Qere: "you say / to me". The affixes are the verb's, which
        // has none; the "me" is the second word's, and its part of the
        // description says so.
        let say = decode("HVqi2fs//Rd/Sp1bs");
        assert_eq!((say.tense.as_deref(), say.affixes.len()), (Some("imperfect"), 0));
        assert_eq!(say.description, "verb, qal imperfect, 2nd person feminine singular + preposition, with pronominal suffix, 1st person common singular");
        // 2 Kgs 19:37 Qere: "and Sharezer / his sons".
        let sons = decode("HC/Npm//Ncmpc/Sp3ms");
        assert_eq!((sons.kind.as_deref(), sons.affixes.clone()), (Some("personal name"), vec![prefix("conjunction")]));
        assert_eq!(sons.description, "noun, personal name, masculine + noun, masculine plural construct, with pronominal suffix, 3rd person masculine singular");
        // 2 Sam 18:20 Qere עַל־כֵּן, "since": the "//" ends the preposition's
        // word, so עַל -- the word TAHOT's H5921 names -- is not a prefix on
        // the adverb.
        let since = decode("HR//D");
        assert_eq!((since.part_of_speech.as_deref(), since.affixes.len()), (Some("preposition"), 0));
        assert_eq!(since.description, "preposition + adverb");
        // Ezek 9:11 Qere: "according to all / that": the relative after "//"
        // is a word, not a prefix to nothing.
        assert_eq!(decode("HR/Ncbsa//Tr").description, "noun, common gender singular absolute + particle, relative");
        // 2 Chr 30:3 לְמַדַּי: "to / what / sufficiency".
        let what = decode("HR/Pi/Ncmsa");
        assert_eq!((what.part_of_speech.as_deref(), what.kind.as_deref()), (Some("pronoun"), Some("interrogative")));
        assert_eq!(what.affixes, vec![prefix("preposition")]);
    }

    /// What a code's shape says its decoding must have filled in and did
    /// not, as field names; empty when it is all there. A verb has its stem
    /// (Hebrew and Aramaic) or voice (Greek), tense and mood; a finite verb
    /// its person and number, and in Hebrew and Aramaic its gender; a
    /// participle its gender and number, and in Greek its case. A Hebrew or
    /// Aramaic noun or adjective that is not a proper name has gender, number
    /// and state, as a personal pronoun has person, gender and number; a
    /// Greek noun, adjective, article or pronoun that declines has case and
    /// number. A code that writes several words as one describes each of
    /// them. The exhaustive test runs every shipped code through this, so a
    /// code letter decode() does not know shows up as the gap it leaves
    /// rather than passing because something else was filled.
    fn gaps_in(code: &str, info: &MorphInfo) -> Vec<&'static str> {
        let mut gaps = Vec::new();
        let mut need = |present: bool, field: &'static str| {
            if !present {
                gaps.push(field);
            }
        };
        let greek = info.language == "greek";
        let kind = info.kind.as_deref().unwrap_or("");
        match info.part_of_speech.as_deref() {
            None => need(false, "part_of_speech"),
            Some("verb") => {
                if greek {
                    need(info.voice.is_some(), "voice");
                } else {
                    need(info.stem.is_some(), "stem");
                }
                need(info.tense.is_some(), "tense");
                need(info.mood.is_some(), "mood");
                match info.mood.as_deref() {
                    None | Some("infinitive") => {}
                    Some("participle") => {
                        need(info.gender.is_some(), "gender");
                        need(info.number.is_some(), "number");
                        if greek {
                            need(info.case.is_some(), "case");
                        }
                    }
                    Some(_) => {
                        need(info.person.is_some(), "person");
                        need(info.number.is_some(), "number");
                        if !greek {
                            need(info.gender.is_some(), "gender");
                        }
                    }
                }
            }
            Some("noun" | "adjective") if !greek => {
                // A proper name is `Np` and carries at most its gender; a
                // title that is not a name (`Nt`) declines like any noun.
                let body = code.trim().get(1..).unwrap_or("");
                let proper = hebrew_words(body, info.language == "aramaic").first().and_then(|w| w.root).is_some_and(|r| r.starts_with("Np"));
                if !proper {
                    need(info.gender.is_some(), "gender");
                    need(info.number.is_some(), "number");
                    need(info.state.is_some(), "state");
                }
            }
            Some("pronoun") if !greek && kind == "personal" => {
                need(info.person.is_some(), "person");
                need(info.gender.is_some(), "gender");
                need(info.number.is_some(), "number");
            }
            Some("noun" | "adjective" | "article" | "pronoun") if greek => {
                let indeclinable = kind.contains("indeclinable") || kind == "letter";
                // The interrogative and indefinite pronouns τίς and τις
                // (`I-`, `X-`) decline too, so only a code with nothing after
                // its head is excused.
                if !indeclinable && code.contains('-') {
                    need(info.case.is_some(), "case");
                    need(info.number.is_some(), "number");
                }
            }
            Some(_) => {}
        }
        let words_written = if greek { code.split(" + ").count() } else { code.split("//").count() };
        need(info.description.split(" + ").count() >= words_written, "a description of each word");
        gaps
    }

    #[test]
    fn a_code_is_checked_for_what_its_shape_requires() {
        assert!(gaps_in("V-AAM-2S", &decode("V-AAM-2S")).is_empty());
        assert!(gaps_in("HVqp3ms", &decode("HVqp3ms")).is_empty());
        assert!(gaps_in("HC/Ntmpc/Sp3mp", &decode("HC/Ntmpc/Sp3mp")).is_empty());
        assert!(gaps_in("HC/Npl", &decode("HC/Npl")).is_empty());
        assert!(gaps_in("HR//D", &decode("HR//D")).is_empty());
        // A conjugation letter decode() does not know leaves the verb with
        // no tense, which the shape check catches though the code still has
        // a part of speech and a description.
        assert_eq!(gaps_in("HVqx3ms", &decode("HVqx3ms")), vec!["tense", "mood"]);
        // A Greek finite verb cut short, and a noun with no case.
        assert_eq!(gaps_in("V-AAM", &decode("V-AAM")), vec!["person", "number"]);
        assert_eq!(gaps_in("N-", &decode("N-")), vec!["case", "number"]);
        // Two words described as one.
        let as_one = MorphInfo { description: "adverb".into(), ..decode("HR//D") };
        assert_eq!(gaps_in("HR//D", &as_one), vec!["a description of each word"]);
    }

    /// Every code in the TAHOT and TAGNT files the morphology is imported
    /// from, every edition's reading included, decoded: no field may come
    /// back holding something that is not a value, every code must fill in
    /// what its shape requires (see `gaps_in`), and every "<field>:<value>"
    /// pair must have its glossary entry. Reads 100 MB of text:
    /// `cargo test --lib morph::tests::every_code -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn every_code_in_the_reference_files_decodes_and_has_its_glossary_entries() {
        use std::collections::{BTreeMap, BTreeSet};
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join("reference").join("morphology");
        let mut codes: BTreeSet<String> = BTreeSet::new();
        for dir in ["hebrew-tahot", "greek-tagnt"] {
            for entry in std::fs::read_dir(root.join(dir)).unwrap().flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                let text = std::fs::read_to_string(entry.path()).unwrap();
                for line in text.lines() {
                    let cols: Vec<&str> = line.split('\t').collect();
                    // Word rows begin with their reference ("Gen.1.1#01=L",
                    // "Mat.1.1#01=NKO"); the summary rows begin with "#".
                    if cols.len() < 6 || !cols[0].contains('#') || cols[0].starts_with('#') {
                        continue;
                    }
                    if name.starts_with("TAHOT ") {
                        codes.insert(cols[5].trim().to_string());
                    } else if name.starts_with("TAGNT ") {
                        if let Some((_, code)) = cols[3].split_once('=') {
                            codes.insert(code.trim().to_string());
                        }
                        // Other editions' readings: "γέννησις (t=gennēsis)
                        // birth - G1083=N-NSF in: TR+Byz ¦ ...".
                        for reading in cols.get(6).copied().unwrap_or("").split('¦') {
                            let tagging = reading.rsplit_once(" in: ").and_then(|(r, _)| r.rsplit_once(" - ")).map(|(_, t)| t);
                            if let Some((_, code)) = tagging.and_then(|t| t.trim().split_once('=')) {
                                codes.insert(code.trim().to_string());
                            }
                        }
                    }
                }
            }
        }
        codes.remove("");
        assert!(codes.len() > 4000, "only {} distinct codes read from {}", codes.len(), root.display());

        let glossary: serde_json::Value = serde_json::from_str(include_str!("../../src/features/lexicon/parsingGlossary.json")).unwrap();
        let terms = glossary["terms"].as_object().expect("parsingGlossary.json has a \"terms\" object");
        let semitic_terms = glossary["hebrew_and_aramaic"].as_object();
        // As parsingGlossary.ts looks a value up: a Hebrew or Aramaic word
        // may find its entry in the `hebrew_and_aramaic` block, and an affix
        // under its whole description or, failing that, under the kind of
        // morpheme before the comma ("affix:pronominal suffix").
        let has_entry = |key: &str, language: &str| {
            let mut candidates = vec![key.to_string()];
            if let Some(("affix", value)) = key.split_once(':') {
                if let Some((kind, _)) = value.split_once(',') {
                    candidates.push(format!("affix:{}", kind.trim()));
                }
            }
            candidates.iter().any(|k| {
                terms.contains_key(k.as_str()) || (language != "greek" && semitic_terms.is_some_and(|h| h.contains_key(k.as_str())))
            })
        };

        let mut pairs: BTreeMap<String, (usize, String)> = BTreeMap::new();
        let mut bad: Vec<String> = Vec::new();
        let mut missing: BTreeSet<String> = BTreeSet::new();
        for code in &codes {
            let info = decode(code);
            if info.description.is_empty() {
                bad.push(format!("{code}: no description ({info:?})"));
            }
            let gaps = gaps_in(code, &info);
            if !gaps.is_empty() {
                bad.push(format!("{code}: no {} ({info:?})", gaps.join(", no ")));
            }
            for key in glossary_keys(&info) {
                let value = key.split_once(':').unwrap().1;
                if value.is_empty() || value != value.to_lowercase() || value.contains(['-', '=', '/']) {
                    bad.push(format!("{code}: odd value {key}"));
                }
                if !has_entry(&key, &info.language) {
                    missing.insert(key.clone());
                }
                let entry = pairs.entry(key).or_insert((0, code.clone()));
                entry.0 += 1;
            }
        }
        println!("{} distinct codes, {} distinct field values:", codes.len(), pairs.len());
        for (key, (n, example)) in &pairs {
            println!("  {key}  ({n} codes, e.g. {example})");
        }
        assert!(bad.is_empty(), "codes that do not decode cleanly:\n{}", bad.join("\n"));
        assert!(missing.is_empty(), "parsingGlossary.json has no entry for:\n{}", missing.into_iter().collect::<Vec<_>>().join("\n"));
    }
}
