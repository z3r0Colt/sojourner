//! Parsing codes, read into their parts.
//!
//! Two systems are in `morphology_words.morph_code`:
//!
//! - **Greek**, from STEPBible's TAGNT: Robinson's codes as STEPBible prints
//!   them. `V-AAM-2S` is a verb, aorist active imperative, second person
//!   singular; `N-NSF` a noun, nominative singular feminine; `P-1GS` a
//!   first-person pronoun, genitive singular; `PREP`, `CONJ`, `ADV` stand
//!   alone. A trailing `-C`, `-ATT`, `-K` or similar marks contraction,
//!   dialect or crasis and is not a parsing field.
//! - **Hebrew and Aramaic**, from the OpenScriptures Hebrew Bible: a language
//!   letter, then one segment per morpheme separated by `/` (`HR/Ncfsa` is a
//!   preposition prefixed to a common noun, feminine singular absolute;
//!   `HVqp3ms` a Qal perfect, third masculine singular). The word's own
//!   parsing is its last segment that is not a suffix.
//!
//! What comes out is a set of plain English field values -- "aorist",
//! "imperative", "genitive" -- the same words the morphology search form
//! offers, so a reader never has to know a code letter.
//!
//! Sources: Maurice Robinson's parsing scheme as documented by STEPBible
//! ("TAGNT - Robinson codes" and the TEGMC table), and the OSHB morphology
//! documentation at hb.openscriptures.org/parsing/HebrewMorphologyCodes.html.

use serde::Serialize;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct MorphInfo {
    /// "greek", "hebrew" or "aramaic".
    pub language: String,
    pub part_of_speech: Option<String>,
    /// Greek tense, or the Hebrew verb's conjugation ("perfect", "wayyiqtol").
    pub tense: Option<String>,
    pub voice: Option<String>,
    pub mood: Option<String>,
    pub person: Option<String>,
    pub number: Option<String>,
    pub gender: Option<String>,
    pub case: Option<String>,
    /// Hebrew: "absolute", "construct", "determined".
    pub state: Option<String>,
    /// Hebrew verb stem ("qal", "piel").
    pub stem: Option<String>,
    /// A pronoun's or particle's kind ("personal", "relative", "negative").
    pub kind: Option<String>,
    /// The whole parsing in words: "verb, aorist active imperative, 2nd person singular".
    pub description: String,
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

pub fn decode_greek(code: &str) -> MorphInfo {
    let mut info = MorphInfo { language: "greek".into(), ..Default::default() };
    let parts: Vec<&str> = code.trim().split('-').collect();
    let head = parts.first().copied().unwrap_or("");
    match head {
        "V" => {
            info.part_of_speech = s("verb");
            let tvm = parts.get(1).copied().unwrap_or("");
            // A leading 2 marks a second (strong) tense form.
            let (second, tvm) = match tvm.strip_prefix('2') {
                Some(rest) => (true, rest),
                None => (false, tvm),
            };
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
            let _ = second;
            info.voice = match chars.next() {
                Some('A') | Some('Q') => s("active"),
                Some('M') | Some('D') => s("middle"),
                Some('P') | Some('O') => s("passive"),
                Some('E') | Some('N') => s("middle or passive"),
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
            if let Some(rest) = parts.get(2) {
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
        "N" | "A" | "T" => {
            info.part_of_speech = s(match head {
                "N" => "noun",
                "A" => "adjective",
                _ => "article",
            });
            match parts.get(1).copied() {
                Some("PRI") => info.kind = s("proper name, indeclinable"),
                Some("NUI") => info.kind = s("numeral, indeclinable"),
                Some("LI") => info.kind = s("letter"),
                Some("OI") => info.kind = s("indeclinable"),
                Some(rest) => cng(&mut info, rest),
                None => {}
            }
        }
        "P" | "R" | "C" | "D" | "K" | "I" | "X" | "Q" | "F" | "S" => {
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
            if let Some(rest) = parts.get(1) {
                // Personal, reflexive and possessive pronouns lead with a
                // person digit; possessives then give the possessor's number.
                let rest = match rest.chars().next().and_then(person) {
                    Some(p) => {
                        info.person = Some(p);
                        &rest[1..]
                    }
                    None => rest,
                };
                let rest = if head == "S" && rest.len() > 3 { &rest[1..] } else { rest };
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
            info.kind = s(if head == "ARAM" { "Aramaic" } else { "Hebrew" });
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
    info.description = describe(&info);
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

fn hebrew_gender(c: char) -> Option<String> {
    match c {
        'm' => s("masculine"),
        'f' => s("feminine"),
        'c' => s("common"),
        'b' => s("both"),
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

pub fn decode_hebrew(code: &str) -> MorphInfo {
    let code = code.trim();
    let mut chars = code.chars();
    let lang = chars.next();
    let aramaic = lang == Some('A');
    let mut info = MorphInfo { language: if aramaic { "aramaic" } else { "hebrew" }.into(), ..Default::default() };
    let body: String = chars.collect();
    // The word itself: the last morpheme that is not a suffix.
    let segment = body.split('/').filter(|seg| !seg.starts_with('S')).last().unwrap_or("");
    let c: Vec<char> = segment.chars().collect();
    match c.first() {
        Some('V') => {
            info.part_of_speech = s("verb");
            let stems = if aramaic { ARAMAIC_STEMS } else { HEBREW_STEMS };
            info.stem = c.get(1).and_then(|st| stems.iter().find(|(k, _)| k == st)).map(|(_, v)| v.to_string());
            let conj = c.get(2).copied();
            info.tense = match conj {
                Some('p') => s("perfect"),
                Some('q') => s("sequential perfect"),
                Some('i') => s("imperfect"),
                Some('w') => s("sequential imperfect"),
                Some('h') => s("cohortative"),
                Some('j') => s("jussive"),
                Some('v') => s("imperative"),
                Some('r') => s("participle"),
                Some('s') => s("passive participle"),
                Some('a') => s("infinitive absolute"),
                Some('c') => s("infinitive construct"),
                _ => None,
            };
            info.mood = match conj {
                Some('v') => s("imperative"),
                Some('j') => s("jussive"),
                Some('h') => s("cohortative"),
                Some('r') | Some('s') => s("participle"),
                Some('a') | Some('c') => s("infinitive"),
                Some(_) => s("indicative"),
                None => None,
            };
            let rest = &c[3.min(c.len())..];
            match conj {
                Some('r') | Some('s') => gns(&mut info, rest),
                Some('a') | Some('c') => {}
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
            info.kind = match c.get(1) {
                Some('c') => s("common"),
                Some('g') => s("gentilic"),
                Some('p') => s("proper name"),
                _ => None,
            };
            gns(&mut info, &c[2.min(c.len())..]);
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
        Some('C') => info.part_of_speech = s("conjunction"),
        Some('D') => info.part_of_speech = s("adverb"),
        Some('T') => {
            info.part_of_speech = s("particle");
            info.kind = match c.get(1) {
                Some('a') => s("affirmation"),
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
    info.description = describe(&info);
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

fn describe(i: &MorphInfo) -> String {
    let mut out = Vec::new();
    if let Some(pos) = &i.part_of_speech {
        out.push(pos.clone());
    }
    let mut middle: Vec<String> = Vec::new();
    for f in [&i.kind, &i.stem, &i.tense, &i.voice] {
        if let Some(v) = f {
            middle.push(v.clone());
        }
    }
    if let Some(m) = &i.mood {
        if i.tense.as_deref() != Some(m.as_str()) && !(i.language != "greek" && m == "indicative") {
            middle.push(m.clone());
        }
    }
    if !middle.is_empty() {
        out.push(middle.join(" "));
    }
    let mut tail: Vec<String> = Vec::new();
    if let Some(p) = &i.person {
        tail.push(format!("{p} person"));
    }
    for f in [&i.case, &i.gender, &i.number, &i.state] {
        if let Some(v) = f {
            tail.push(v.clone());
        }
    }
    if !tail.is_empty() {
        out.push(tail.join(" "));
    }
    out.join(", ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn greek_verbs() {
        let v = decode("V-AAM-2S");
        assert_eq!(v.tense.as_deref(), Some("aorist"));
        assert_eq!(v.voice.as_deref(), Some("active"));
        assert_eq!(v.mood.as_deref(), Some("imperative"));
        assert_eq!(v.person.as_deref(), Some("2nd"));
        assert_eq!(v.number.as_deref(), Some("singular"));
        assert_eq!(v.description, "verb, aorist active imperative, 2nd person singular");
        let p = decode("V-PAP-NSM");
        assert_eq!(p.mood.as_deref(), Some("participle"));
        assert_eq!(p.case.as_deref(), Some("nominative"));
        assert_eq!(p.gender.as_deref(), Some("masculine"));
        assert_eq!(decode("V-2AAI-3S").tense.as_deref(), Some("aorist"));
        assert_eq!(decode("V-PAN").mood.as_deref(), Some("infinitive"));
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
    }

    #[test]
    fn hebrew_codes() {
        let v = decode("HVqp3ms");
        assert_eq!(v.language, "hebrew");
        assert_eq!((v.stem.as_deref(), v.tense.as_deref(), v.person.as_deref(), v.gender.as_deref(), v.number.as_deref()), (Some("qal"), Some("perfect"), Some("3rd"), Some("masculine"), Some("singular")));
        let n = decode("HR/Ncfsa");
        assert_eq!((n.part_of_speech.as_deref(), n.gender.as_deref(), n.state.as_deref()), (Some("noun"), Some("feminine"), Some("absolute")));
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
}
