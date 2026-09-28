//! Webster's 1828 dictionary (see CONTENT_MIGRATION_0028): the lookup the
//! word popup makes, the Dictionary page's search and browse, and one entry
//! by id.
//!
//! The lookup is the part that needs thought. A reader double-clicks a word
//! as the King James text prints it -- *prevented*, *maketh*, *knowest*,
//! *spake*, *hath* -- and Webster files words under their bare form, often
//! with the inflected one beside it as a one-line entry of its own:
//! "PREVENTED, pp. Hindered from happening or taking effect." That line is
//! Webster's, but it is the sense of 1828, and the reason to open Webster
//! from the KJV at all is the older sense, which lives only under the verb:
//! PREVENT, "1. To go before; to precede. I prevented the dawning of the
//! morning" (Ps 119:147), marked obsolete. So a lookup does not stop at the
//! first key that exists. In order:
//!
//! 1. A form the King James text uses that no ending reaches, or that
//!    Webster files as an unrelated word (see [`irregular_base`]): *hath*,
//!    *spake*, *wist*, *made* (Webster's MADE is an earthworm). The verb or
//!    noun it is a form of comes first, then whatever Webster has under the
//!    word itself.
//! 2. The word as a key. Where every entry under it is a participle or
//!    preterit stub (see [`inflection`]) -- a one-paragraph restatement of
//!    the verb -- the verb comes first and the stub after it; where only
//!    some are ("SAW, pret. of see" beside the saw that cuts wood), the
//!    word's own entries come first and the verb after them.
//! 3. The word as an alias (AMONG, filed under AMONGST).
//! 4. The word's base forms (see [`base_forms`]): the King James endings
//!    (-eth, -est, -edst), the ordinary ones, Webster's American spellings
//!    of the KJV's British ones (*neighbour* is NEIGHBOR here), and
//!    compounds written with and without a hyphen. The first of them that
//!    Webster has as the kind of word the ending makes (see [`Kind`]):
//!    *severed* is SEVER, v., though SEVERE comes first. Where none is, a
//!    verb this copy lacks is shown by its participles (*soweth* by SOWED
//!    and SOWING, not by SOW, the hog), and only then by the first base
//!    form there is.
//!
//! Where this copy lacks the entry the KJV means and the lookup lands on
//! another word (EVEN, which the dump files only as a spelling of EVE), the
//! lookup carries a note saying so (see [`MISSING`]).

use once_cell::sync::Lazy;
use regex::Regex;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::collections::HashSet;

/// One entry as Webster printed it. `html` is the importer's allowlisted
/// markup (see `import::reference::webster1828`), rendered as the
/// encyclopedia's articles are.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct WebsterEntry {
    pub id: i64,
    pub word: String,
    pub key: String,
    pub pos: Option<String>,
    pub html: String,
    pub aliases: Vec<String>,
}

/// How a lookup reached the entries it returns.
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Via {
    /// The word itself is a key, and its own entries come first.
    Exact,
    /// The word is another entry's alias.
    Alias,
    /// The word is a form of another: `matched` is the base, whose entries
    /// come first.
    Base,
}

#[derive(Debug, Clone, Serialize)]
pub struct WebsterLookup {
    /// The word as it was looked up: lower case, with the punctuation around
    /// it and a possessive's 's taken off.
    pub query: String,
    /// The key whose entries come first: the word itself, or the base it
    /// was found under, or (for an alias) the key of the entry that carries it.
    pub matched: String,
    pub via: Via,
    /// The entries, the matched key's first. Others may follow: the word's
    /// own entries after its base's, or the verb after a word's own entries
    /// (see the module comment). Each carries its own key.
    pub entries: Vec<WebsterEntry>,
    /// Where this copy of the dictionary lacks the entry a reader of the KJV
    /// wants and what was found is another word (see [`MISSING`]), what is
    /// missing and what is shown instead, to say beside the entries rather
    /// than let them pass for the word's meaning. Absent otherwise.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

/// A line in a search or browse list.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct WebsterHit {
    pub id: i64,
    pub word: String,
    pub key: String,
    pub pos: Option<String>,
    /// Plain text, not HTML: the entry's first sense, or for a hit in its
    /// body, the passage around the match.
    pub snippet: String,
}

/// What a base form is expected to be, which decides which of the base's
/// entries are wanted: *maketh* means MAKE the verb, not MAKE the noun (a
/// mate); *lives* means LIFE, not a verb.
///
/// None of them is a participle or a preterit, except where the ending is
/// the second person's: an ending is not put on a form that already has one,
/// so *arts* is ART the noun and not ART, "the second person ... of the
/// substantive verb", and *hasted* is not HAST; but *lovedst* is loved's and
/// *knewest* knew's.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    /// The verb: *-eth*, *-ed*, *-ing*, *-en*, and the irregular verbs.
    Verb,
    /// The noun: an irregular plural, and *-men* (HORSEMAN).
    Noun,
    /// Anything but a noun: a second person and a superlative look the same
    /// (*knowest*, *greatest*), and no noun takes either.
    VerbOrAdjective,
    /// Either: a plural and a third person look the same (*loves*).
    Any,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BaseForm {
    pub key: String,
    pub kind: Kind,
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

/// Verb forms the King James text uses that no ending rule reaches, or whose
/// own key in Webster is another word (MADE, an earthworm; WERE, a dam; ART,
/// the arts; WILT, to wither; SATE, to satiate) or missing (*hath*, *doth*,
/// *saith*, *begat*, *forsook*). Forms that are just as often a word of their
/// own in the KJV -- *saw*, *left*, *found*, *bare*, *fell*, *lay* -- are
/// left out: Webster lists their preterit as a stub beside the other word,
/// and step 2 of the lookup brings the verb in after them.
const IRREGULAR_VERBS: &[(&str, &str)] = &[
    ("am", "be"), ("are", "be"), ("art", "be"), ("been", "be"), ("is", "be"), ("was", "be"), ("wast", "be"), ("were", "be"), ("wert", "be"),
    ("had", "have"), ("hadst", "have"), ("has", "have"), ("hast", "have"), ("hath", "have"),
    ("did", "do"), ("didst", "do"), ("does", "do"), ("doest", "do"), ("doeth", "do"), ("done", "do"), ("dost", "do"), ("doth", "do"),
    ("said", "say"), ("saidst", "say"), ("saith", "say"),
    ("spake", "speak"), ("spakest", "speak"), ("spoke", "speak"), ("spoken", "speak"),
    ("brake", "break"), ("broke", "break"), ("broken", "break"),
    ("gat", "get"), ("got", "get"), ("gotten", "get"),
    ("begat", "beget"), ("begot", "beget"), ("begotten", "beget"),
    ("wist", "wit"), ("wot", "wit"), ("wotteth", "wit"),
    ("clave", "cleave"), ("cloven", "cleave"),
    ("slain", "slay"), ("slew", "slay"), ("slewest", "slay"),
    ("made", "make"), ("madest", "make"),
    ("gone", "go"), ("went", "go"),
    ("came", "come"), ("camest", "come"),
    ("gave", "give"), ("gavest", "give"), ("given", "give"),
    ("taken", "take"), ("took", "take"), ("tookest", "take"),
    ("knew", "know"), ("knewest", "know"), ("known", "know"),
    ("sawest", "see"), ("seen", "see"),
    ("sware", "swear"), ("swore", "swear"), ("sworn", "swear"),
    ("trod", "tread"), ("trodden", "tread"), ("trode", "tread"),
    ("drave", "drive"), ("driven", "drive"),
    ("wrought", "work"),
    ("holp", "help"), ("holpen", "help"),
    ("smitten", "smite"), ("smote", "smite"), ("smotest", "smite"),
    ("arisen", "arise"), ("arose", "arise"),
    ("forsaken", "forsake"), ("forsook", "forsake"),
    ("canst", "can"), ("shalt", "shall"), ("wilt", "will"),
    ("ate", "eat"), ("eaten", "eat"),
    ("sat", "sit"), ("sate", "sit"),
    ("bade", "bid"), ("bidden", "bid"),
    ("chose", "choose"), ("chosen", "choose"),
    ("drank", "drink"),
    ("sang", "sing"), ("sung", "sing"),
    ("fed", "feed"), ("fled", "flee"), ("led", "lead"),
    ("crept", "creep"), ("kept", "keep"), ("slept", "sleep"), ("sped", "speed"), ("wept", "weep"),
    ("stood", "stand"), ("understood", "understand"), ("withstood", "withstand"),
    ("threw", "throw"), ("thrown", "throw"),
    ("borne", "bear"), ("torn", "tear"), ("worn", "wear"),
    ("sprang", "spring"), ("sprung", "spring"),
    ("builded", "build"), ("built", "build"), ("digged", "dig"),
    ("laid", "lay"), ("lain", "lie"),
    ("stricken", "strike"), ("strake", "strike"), ("struck", "strike"),
    ("strove", "strive"), ("striven", "strive"),
    ("ridden", "ride"), ("rode", "ride"),
    ("risen", "rise"),
    ("written", "write"), ("wrote", "write"),
    ("sold", "sell"), ("told", "tell"),
    ("besought", "beseech"), ("bought", "buy"), ("brought", "bring"), ("caught", "catch"), ("fought", "fight"), ("sought", "seek"), ("taught", "teach"),
    ("hid", "hide"), ("hidden", "hide"),
    ("forgot", "forget"), ("forgotten", "forget"), ("forgave", "forgive"), ("forgiven", "forgive"),
    ("beheld", "behold"), ("overcame", "overcome"),
    ("began", "begin"), ("begun", "begin"),
    ("drawn", "draw"), ("drew", "draw"), ("grew", "grow"), ("grown", "grow"), ("blew", "blow"), ("flew", "fly"),
    ("dealt", "deal"), ("dwelt", "dwell"), ("lent", "lend"), ("meant", "mean"), ("sent", "send"), ("spent", "spend"),
    ("ran", "run"), ("sank", "sink"), ("sunk", "sink"), ("shone", "shine"),
    ("fallen", "fall"), ("heard", "hear"), ("held", "hold"), ("hung", "hang"), ("lost", "lose"), ("met", "meet"), ("paid", "pay"),
    ("shod", "shoe"),
    ("rang", "ring"), ("woven", "weave"), ("swollen", "swell"),
    // "Jacob sod pottage" (Gen 25:29): Webster's SOD is turf, and to cover with it.
    ("sod", "seethe"),
];

/// Participles and preterits Webster enters under their own key without
/// naming the verb, and that no ending leads back to: "BENT, pp. Strained;
/// incurvated", "CLAD, pp. [See Clothe.] Clothed", "SHRANK, pret. or
/// shrink" (sic). Unlike [`IRREGULAR_VERBS`], these have an entry, which
/// comes first where it says more than the verb does (see [`find_verb`]).
const UNNAMED_VERBS: &[(&str, &str)] = &[("bent", "bend"), ("clad", "clothe"), ("shrank", "shrink")];

/// Preterits that are a word of their own when they stand alone (a saw, bare
/// hands, he fell a tree) and so are left out of [`IRREGULAR_VERBS`], but
/// that after a prefix can only be the verb: *foresaw*, *forbare*, *befell*.
const PREFIXED_PRETERITS: &[(&str, &str)] = &[("saw", "see"), ("bare", "bear"), ("bore", "bear"), ("fell", "fall"), ("rose", "rise")];

/// The prefixes a verb keeps through its irregular forms: *overthrew* is
/// OVERTHROW's as *threw* is THROW's, *withdrew* WITHDRAW's, *foretold*
/// FORETELL's, *forgat* FORGET's, *became* BECOME's. Longest first, so that
/// *fore-* is tried before *for-*.
const VERB_PREFIXES: &[&str] = &["under", "over", "fore", "with", "for", "mis", "out", "be", "up"];

/// Plurals that are not the singular with an ending.
const IRREGULAR_NOUNS: &[(&str, &str)] = &[
    ("brethren", "brother"), ("children", "child"), ("feet", "foot"), ("geese", "goose"), ("kine", "cow"), ("lice", "louse"),
    ("men", "man"), ("mice", "mouse"), ("oxen", "ox"), ("teeth", "tooth"), ("women", "woman"),
    ("calves", "calf"), ("halves", "half"), ("knives", "knife"), ("leaves", "leaf"), ("lives", "life"), ("loaves", "loaf"),
    ("selves", "self"), ("sheaves", "sheaf"), ("shelves", "shelf"), ("staves", "staff"), ("thieves", "thief"), ("wives", "wife"),
    ("wolves", "wolf"),
];

/// The KJV's spellings of words Webster spells another way, where no rule
/// reaches them (the endings have rules of their own, in
/// [`spelling_variants`]). Matched against the word and against each form
/// an ending came off, so *basons* is BASIN's and *carcases* CARCASS's.
const SPELLINGS: &[(&str, &str)] = &[
    ("ancle", "ankle"), ("axe", "ax"), ("bason", "basin"), ("carcase", "carcass"), ("caterpiller", "caterpillar"), ("chesnut", "chestnut"),
    ("cummin", "cumin"), ("fulness", "fullness"), ("grisled", "grizzled"), ("jubile", "jubilee"), ("menservant", "manservant"),
    ("plaister", "plaster"), ("practise", "practice"), ("ringstraked", "ring-streaked"), ("shewbread", "show-bread"), ("spue", "spew"),
    ("sycomore", "sycamore"), ("worshipper", "worshiper"),
];

/// Spellings that begin a word and every word made from it: *shew*,
/// *shewed*, *sheweth*; *intreat*, *intreated*, *intreaty*; *cieled*;
/// *pourtrayed*.
const SPELLING_STEMS: &[(&str, &str)] = &[("shew", "show"), ("intreat", "entreat"), ("ciel", "ceil"), ("pourtray", "portray")];

/// Keys a lookup can reach where this copy of the dictionary lacks the entry
/// the KJV means, and what it shows instead is another word: the note the
/// lookup carries for them (see [`WebsterLookup::note`]). EVEN is filed in
/// the dump only as a spelling of EVE (see reference/webster1828/SOURCES.md),
/// and RANK only as "the old pret. of ring". A key here is shown as found and
/// not handed on to the verb it names, since the verb is not what the KJV
/// means by it either.
const MISSING: &[(&str, &str)] = &[
    (
        "even",
        "Webster's EVEN, the adjective and adverb (level; equal; \"even so\"), is missing from this copy of the dictionary. \
         Shown is EVE, the evening, which is the KJV's even in \"at even\".",
    ),
    (
        "rank",
        "Webster's RANK, the noun and the adjective (a row or line; luxuriant, as the \"rank and good\" ears of Genesis 41:5), \
         is missing from this copy of the dictionary. The only RANK it has is an old preterit of ring.",
    ),
];

fn missing_note(key: &str) -> Option<&'static str> {
    MISSING.iter().find(|(k, _)| *k == key).map(|(_, note)| *note)
}

/// The form a word is of, where it is one the King James text uses and no
/// ending rule reaches (see [`IRREGULAR_VERBS`], [`IRREGULAR_NOUNS`]).
pub fn irregular_base(word: &str) -> Option<BaseForm> {
    let find = |table: &[(&str, &str)]| table.iter().find(|(form, _)| *form == word).map(|(_, base)| base.to_string());
    if let Some(key) = find(IRREGULAR_VERBS) {
        return Some(BaseForm { key, kind: Kind::Verb });
    }
    find(IRREGULAR_NOUNS).map(|key| BaseForm { key, kind: Kind::Noun })
}

/// The verb an irregular form with a prefix belongs to, the prefix kept:
/// *overthrew* is OVERTHROW's, *foresaw* FORESEE's, *forgat* FORGET's (see
/// [`VERB_PREFIXES`], [`PREFIXED_PRETERITS`]).
fn prefixed_irregular(word: &str) -> Option<String> {
    VERB_PREFIXES.iter().find_map(|prefix| {
        let rest = word.strip_prefix(prefix).filter(|rest| rest.len() >= 3)?;
        let verb = irregular_base(rest)
            .filter(|base| base.kind == Kind::Verb)
            .map(|base| base.key)
            .or_else(|| PREFIXED_PRETERITS.iter().find(|(form, _)| *form == rest).map(|(_, verb)| verb.to_string()))?;
        Some(format!("{prefix}{verb}"))
    })
}

/// The ordered, de-duplicated list [`base_forms`] builds.
struct Forms<'a> {
    word: &'a str,
    list: Vec<BaseForm>,
}

impl Forms<'_> {
    fn push(&mut self, key: impl Into<String>, kind: Kind) {
        let key = key.into();
        if key.len() >= 2 && key != self.word && !self.list.iter().any(|f| f.key == key) {
            self.list.push(BaseForm { key, kind });
        }
    }

    fn extend(&mut self, keys: Vec<String>, kind: Kind) {
        for key in keys {
            self.push(key, kind);
        }
    }

    /// What a second person's ending (-est, -st) came off. Where that is one
    /// of the King James irregulars, the verb it belongs to comes first, so
    /// that *knewest* reaches KNOW through *knew*, *camest* COME through
    /// *came*. Only here: -ed or -s is not put on an irregular form, and a
    /// stem that happens to be one is another word -- *hasted* is not HAST's
    /// (have), *wasteth* not WAST's (be), *arts* not ART's, *spokes* not
    /// SPOKE's (speak).
    fn push_second_person(&mut self, key: impl Into<String>) {
        let key = key.into();
        if let Some(base) = irregular_base(&key).filter(|base| base.kind == Kind::Verb) {
            self.push(base.key, Kind::Verb);
        }
        self.push(key, Kind::VerbOrAdjective);
    }
}

fn is_vowel(b: u8) -> bool {
    matches!(b, b'a' | b'e' | b'i' | b'o' | b'u')
}

fn is_consonant(b: u8) -> bool {
    b.is_ascii_lowercase() && !is_vowel(b)
}

/// Where a vowel ending (-eth, -est, -ed, -ing, -er) was taken off, the words
/// it may have come off, likeliest first.
///
/// English doubles a lone final consonant after a lone vowel before such an
/// ending -- *sit*, *sitteth*; *stop*, *stopped* -- so a doubled one was
/// probably added (*sitt* is sit), unless the word already ended in it
/// (*fall*, *kiss*, *add*, *err*). And for the same reason a single one after
/// a single vowel -- *hat(eth)*, *writ(eth)*, *mak(eth)* -- most often lost a
/// silent e: had the word been *hat*, the form would have been *hatteth*.
/// Webster has HAT and HATE, WRIT and WRITE, BIT and BITE, so the order
/// matters; where only one of the two exists, it is found either way. So,
/// too, a *th* after a vowel was most often the verb's *-the*: BREATHE,
/// CLOTHE and BATHE beside BREATH, CLOTH and BATH, the nouns.
fn restored(stem: &str) -> Vec<String> {
    let b = stem.as_bytes();
    let n = b.len();
    if n == 0 {
        return vec![];
    }
    let last = b[n - 1];
    let with_e = format!("{stem}e");
    if n >= 2 && last == b[n - 2] && is_consonant(last) {
        let single = stem[..n - 1].to_string();
        return if matches!(last, b'l' | b's' | b'f' | b'z') || n <= 3 { vec![stem.to_string(), single] } else { vec![single, stem.to_string()] };
    }
    let consonant_vowel_consonant =
        n >= 3 && is_consonant(b[n - 3]) && is_vowel(b[n - 2]) && is_consonant(last) && !matches!(last, b'w' | b'x' | b'y');
    // "us(ed)", "ag(ing)", "ow(ing)": a vowel and a consonant are use, age, owe.
    let vowel_consonant = n == 2 && is_vowel(b[0]) && is_consonant(last);
    // "breath(eth)", "cloth(est)", "bath(ed)".
    let vowel_th = n >= 3 && stem.ends_with("th") && is_vowel(b[n - 3]);
    // No English word ends in v, and few in u: "lov(eth)", "continu(eth)".
    if consonant_vowel_consonant || vowel_consonant || vowel_th || matches!(last, b'v' | b'u') {
        vec![with_e, stem.to_string()]
    } else {
        vec![stem.to_string(), with_e]
    }
}

/// Where a participle's -en was taken off, the verb, likeliest first: a
/// doubled consonant before it was the verb's single one, as often as not
/// with a silent e (*bitten*, bite; *hidden*, hide; *forbidden*, forbid),
/// unless the verb ends in it (*befallen*, befall); otherwise as
/// [`restored`] (*graven*, grave; *shaken*, shake; *holden*, hold).
fn restored_before_en(stem: &str) -> Vec<String> {
    let b = stem.as_bytes();
    let n = b.len();
    if n >= 3 && b[n - 1] == b[n - 2] && is_consonant(b[n - 1]) && !matches!(b[n - 1], b'l' | b's' | b'f' | b'z') {
        let single = &stem[..n - 1];
        return vec![format!("{single}e"), single.to_string()];
    }
    restored(stem)
}

/// Before an ending that begins with i (-ies, -ied, -ieth, -iest, -ier), the
/// i was a y (*cries*, *denied*, *holiest*) -- except after a lone consonant,
/// where it is the word's own (*dies*, *lied*, *lieth* are die and lie).
fn from_i(before: &str) -> Vec<String> {
    let y = format!("{before}y");
    let ie = format!("{before}ie");
    let lone_consonant = before.len() == 1 && is_consonant(before.as_bytes()[0]);
    if lone_consonant {
        vec![ie, y]
    } else {
        vec![y, ie]
    }
}

/// The forms a word's ending may have been added to, pushed onto `out`.
/// `depth` stops the one rule that recurses (-st, whose stem has endings of
/// its own: *lovedst* is loved, and loved is love).
fn endings(w: &str, out: &mut Forms, depth: u8) {
    let n = w.len();
    if n < 3 {
        return;
    }
    // The King James third person: maketh, goeth, crieth, seeth, sitteth.
    if let Some(stem) = w.strip_suffix("eth") {
        if let Some(before) = stem.strip_suffix('i') {
            out.extend(from_i(before), Kind::Verb);
        }
        if stem.ends_with('e') {
            out.push(&w[..n - 2], Kind::Verb);
        }
        out.extend(restored(stem), Kind::Verb);
        return;
    }
    // The second person, and the superlative, which looks the same:
    // knowest, makest, criest, seest; greatest, holiest, wisest.
    if let Some(stem) = w.strip_suffix("est") {
        if let Some(before) = stem.strip_suffix('i') {
            for key in from_i(before) {
                out.push_second_person(key);
            }
        }
        if stem.ends_with('e') {
            out.push_second_person(&w[..n - 2]);
        }
        for key in restored(stem) {
            out.push_second_person(key);
        }
        return;
    }
    // The second person's shorter form, often on a past: lovedst, wouldst, canst.
    if let Some(stem) = w.strip_suffix("st") {
        out.push_second_person(stem);
        if depth == 0 {
            endings(stem, out, depth + 1);
        }
        return;
    }
    if let Some(stem) = w.strip_suffix("ed") {
        if let Some(before) = stem.strip_suffix('i') {
            out.extend(from_i(before), Kind::Verb);
        }
        // agreed, freed: the e was the word's.
        if stem.ends_with('e') {
            out.push(&w[..n - 1], Kind::Verb);
        }
        // singed, hinged, avenged, plunged: after i, e or u, -nged is most
        // often a verb in -nge (sing's past is sang), where hanged, longed
        // and wronged, after a and o, are hang's, long's and wrong's.
        if let Some(before) = stem.strip_suffix("ng") {
            if before.ends_with(['i', 'e', 'u']) {
                out.push(format!("{stem}e"), Kind::Verb);
            }
        }
        out.extend(restored(stem), Kind::Verb);
        return;
    }
    if let Some(stem) = w.strip_suffix("ing") {
        // dying, lying, tying: die, lie, tie.
        if let Some(before) = stem.strip_suffix('y') {
            if before.len() == 1 && is_consonant(before.as_bytes()[0]) {
                out.push(format!("{before}ie"), Kind::Verb);
            }
        }
        out.extend(restored(stem), Kind::Verb);
        return;
    }
    // A compound in -man, in the plural: horsemen, husbandmen, watchmen.
    if let Some(stem) = w.strip_suffix("men") {
        if n >= 6 {
            out.push(format!("{stem}man"), Kind::Noun);
            return;
        }
    }
    // A participle in -en or -n: graven, holden, beaten, shaken, forbidden;
    // hewn, blown, sown.
    if let Some(stem) = w.strip_suffix("en") {
        if n >= 5 && !stem.ends_with('e') {
            out.extend(restored_before_en(stem), Kind::Verb);
            return;
        }
    }
    if let Some(stem) = w.strip_suffix("wn") {
        out.push(format!("{stem}w"), Kind::Verb);
        return;
    }
    if let Some(stem) = w.strip_suffix("ies") {
        out.extend(from_i(stem), Kind::Any);
        return;
    }
    if let Some(stem) = w.strip_suffix("es") {
        let sibilant = ["ss", "sh", "ch", "x", "zz"].iter().any(|s| stem.ends_with(s));
        if sibilant {
            // churches, kisses, boxes
            out.push(stem, Kind::Any);
            out.push(&w[..n - 1], Kind::Any);
        } else {
            // loves, uses, horses, toes -- and then goes, heroes
            out.push(&w[..n - 1], Kind::Any);
            out.push(stem, Kind::Any);
        }
        // calves, wolves, yourselves: the f the plural made a v.
        if let Some(before) = stem.strip_suffix('v') {
            out.push(format!("{before}f"), Kind::Any);
            out.push(format!("{before}fe"), Kind::Any);
        }
        return;
    }
    if w.ends_with('s') && !w.ends_with("ss") && !w.ends_with("us") && !w.ends_with("is") {
        out.push(&w[..n - 1], Kind::Any);
        return;
    }
    // The comparative (and an agent noun Webster does not list): greater,
    // wiser, bigger, holier.
    if let Some(stem) = w.strip_suffix("er") {
        if let Some(before) = stem.strip_suffix('i') {
            out.extend(from_i(before), Kind::Any);
        }
        out.extend(restored(stem), Kind::Any);
        return;
    }
    if let Some(stem) = w.strip_suffix("ily") {
        out.push(format!("{stem}y"), Kind::Any);
        return;
    }
    if let Some(stem) = w.strip_suffix("ly") {
        // humbly, simply, gently: humble, simple, gentle -- before "gent".
        if stem.ends_with(['b', 'p', 't', 'd', 'g', 'k']) {
            out.push(format!("{}e", &w[..n - 1]), Kind::Any);
        }
        // fully is full.
        if stem.ends_with('l') {
            out.push(&w[..n - 1], Kind::Any);
        }
        out.push(stem, Kind::Any);
    }
}

/// The word as Webster, the American, may spell it. The KJV's *-our* is his
/// *-or* (neighbour, honour, labour, saviour), its *-re* his *-er*
/// (sepulchre, sceptre, centre), its *-ence* his *-ense* (defence, offence,
/// recompence), its *-ick* his *-ic* (musick, publick, lunatick). Where the
/// KJV doubles an l he writes one before *-or*, *-ous* and *-er*
/// (counsellor, marvellous, traveller), and where it writes one he doubles
/// it at the end of a word and before *-ful* (fulfil, skilful, wilful). And a
/// few words are simply spelled otherwise (see [`SPELLINGS`] and
/// [`SPELLING_STEMS`]), *shew* above all, with every ending it takes
/// (shewed, sheweth, shewing).
fn spelling_variants(w: &str) -> Vec<String> {
    static RE_ENDING: Lazy<Regex> = Lazy::new(|| Regex::new(r"^(.*[^aeiou])re(s|d)?$").unwrap());
    // Two syllables at least before the l: not fuller, smaller, dweller.
    static DOUBLED_L: Lazy<Regex> = Lazy::new(|| Regex::new(r"^(.*[aeiou].*[aeo])ll(or|ors|ous|ously|er|ers)$").unwrap());
    static SINGLE_L: Lazy<Regex> = Lazy::new(|| Regex::new(r"^(.*[aeiou]l)(ful|fully|fulness)$").unwrap());
    let mut out: Vec<String> = Vec::new();
    for (from, to) in SPELLINGS {
        if w == *from {
            out.push(to.to_string());
        }
    }
    for (from, to) in SPELLING_STEMS {
        if let Some(rest) = w.strip_prefix(from) {
            out.push(format!("{to}{rest}"));
        }
    }
    if w.len() >= 5 {
        if let Some(i) = w.rfind("our").filter(|&i| i >= 2) {
            out.push(format!("{}or{}", &w[..i], &w[i + 3..]));
        }
        if let Some(c) = RE_ENDING.captures(w) {
            out.push(format!("{}er{}", &c[1], c.get(2).map_or("", |m| m.as_str())));
        }
        // fulfil, distil, instil
        if w.ends_with("il") && is_consonant(w.as_bytes()[w.len() - 3]) {
            out.push(format!("{w}l"));
        }
    }
    if w.len() >= 6 {
        if let Some(stem) = w.strip_suffix("ence") {
            out.push(format!("{stem}ense"));
        }
        if let Some(stem) = w.strip_suffix("ick") {
            out.push(format!("{stem}ic"));
        }
    }
    if let Some(c) = DOUBLED_L.captures(w) {
        out.push(format!("{}l{}", &c[1], &c[2]));
    }
    if let Some(c) = SINGLE_L.captures(w) {
        out.push(format!("{}l{}", &c[1], &c[2]));
    }
    out
}

/// The keys a word may be a form of, likeliest first, for a lookup that has
/// not found the word itself (see the module comment). Pure, so the rules
/// can be tried out without a database; the lookup asks for each in turn and
/// takes the first that exists and is of the kind the form wants.
///
/// First the word with its ending off (see [`endings`]), and an irregular
/// verb's form behind a prefix (*overthrew*); then Webster's spelling of the
/// word, with its ending then off (*labourer*, LABORER; *shewed*, *showed*,
/// SHOW), and of each form an ending came off (*basons*, *bason*, BASIN);
/// then each of them as a compound written the other way
/// (*stumblingblocks*, *stumblingblock*, STUMBLING-BLOCK).
pub fn base_forms(word: &str) -> Vec<BaseForm> {
    let mut forms = Forms { word, list: Vec::new() };
    endings(word, &mut forms, 0);
    if let Some(verb) = prefixed_irregular(word) {
        forms.push(verb, Kind::Verb);
    }
    // The word's own spelling first: *labourer* is LABORER, before LABOR.
    let stripped = forms.list.clone();
    for variant in spelling_variants(word) {
        forms.push(variant.clone(), Kind::Any);
        endings(&variant, &mut forms, 0);
    }
    for form in &stripped {
        for variant in spelling_variants(&form.key) {
            forms.push(variant, form.kind);
        }
    }
    // A compound the text writes one way and Webster the other.
    let mut compounds: Vec<(String, Kind)> = vec![(word.to_string(), Kind::Any)];
    compounds.extend(forms.list.iter().map(|f| (f.key.clone(), f.kind)));
    for (w, kind) in compounds {
        if w.contains(['-', ' ']) {
            forms.push(w.replace(['-', ' '], ""), kind);
            forms.push(w.replace(' ', "-"), kind);
        } else if w.len() >= 5 {
            // by-word, up-rising: the first part may be two letters.
            for i in 2..=w.len() - 3 {
                forms.push(format!("{}-{}", &w[..i], &w[i..]), kind);
            }
        }
    }
    forms.list
}

/// The word a reader clicked, as a key: lower case, with the punctuation
/// around it, a possessive's 's and any apostrophe inside taken off
/// (Webster's keys have none: *o'er* is OER). `None` for anything that is
/// not English letters, which no key could match.
pub fn normalize_word(word: &str) -> Option<String> {
    let lowered = word.trim().replace(['\u{2019}', '\u{2018}'], "'").to_lowercase();
    let trimmed = lowered.trim_matches(|c: char| !c.is_ascii_alphabetic());
    let unpossessed = trimmed.strip_suffix("'s").or_else(|| trimmed.strip_suffix("s'").map(|_| &trimmed[..trimmed.len() - 1])).unwrap_or(trimmed);
    let bare: String = unpossessed.chars().filter(|&c| c != '\'').collect();
    let collapsed = bare.split_whitespace().collect::<Vec<_>>().join(" ");
    let ok = !collapsed.is_empty() && collapsed.bytes().all(|b| b.is_ascii_lowercase() || b == b'-' || b == b' ');
    ok.then_some(collapsed)
}

// ---------------------------------------------------------------------------
// Inflections
// ---------------------------------------------------------------------------

/// What an entry's heading says it is a form of.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Inflection {
    /// The word it names, where it names one: "SPAKE, pret. of speak" is
    /// speak, "DOES, the third person of the verb do" is do.
    pub of: Option<String>,
    /// A stub: one paragraph restating the verb, and not also an adjective
    /// in its own right ("CANDIED, pp. or a. Preserved with sugar" is one).
    pub stub: bool,
}

/// The heading with its headword taken off: the leading words in capitals
/// and the comma (or stop) after each ("BEGOT, BEGOTTEN, pp. of get" is "pp.
/// of get"; "SUFFER,v.i. To feel" is "v.i. To feel").
fn after_headword(heading: &str) -> &str {
    static HEADWORDS: Lazy<Regex> = Lazy::new(|| Regex::new(r"^\s*(?:[A-Z][A-Z'\- ]*[,.]\s*)+").unwrap());
    let end = HEADWORDS.find(heading).map_or(0, |m| m.end());
    &heading[end..]
}

/// Whether an entry is a participle or preterit (or, where Webster prints
/// no part of speech, a heading that says it is one: "WAST, past tense of the
/// substantive verb", "HAST, the second person singular of have"), and if so
/// what it names and whether it is a stub. `None` for every other entry --
/// LET, v.t. says "pret. and pp. let" of itself, and is the verb.
pub fn inflection(pos: Option<&str>, text: &str) -> Option<Inflection> {
    static MARKED: Lazy<Regex> = Lazy::new(|| {
        Regex::new(r"(?i)\b(?:pret|preterit|preterite|participle|part\.|pp\.|ppr\.|past tense|(?:second|third) person)").unwrap()
    });
    static OF: Lazy<Regex> = Lazy::new(|| {
        Regex::new(
            r"(?i)\b(?:pret|preterit|preterite|participle|part\.perf|pp|ppr|tense|person|singular)\.?,?(?:\s+(?:and|or)\s+(?:pp?|pret)\.)?\s+of\s+(?:the\s+(?:obsolete\s+|old\s+|substantive\s+)?verb,?\s+(?:to\s+)?)?([a-z]+)",
        )
        .unwrap()
    });
    const NOT_A_WORD: &[&str] = &["a", "an", "in", "it", "its", "that", "the", "this", "to", "which"];
    let heading = text.lines().next().unwrap_or("");
    let rest = after_headword(heading);
    // The part of the heading that names the form: its first few words.
    let near: String = rest.chars().take(100).collect();
    let marked = match pos {
        Some("pp." | "ppr." | "pret.") => true,
        None => MARKED.is_match(&near),
        Some(_) => false,
    };
    if !marked {
        return None;
    }
    let of = OF
        .captures_iter(&near)
        .map(|c| c[1].to_lowercase())
        .find(|w| !NOT_A_WORD.contains(&w.as_str()));
    static ADJECTIVE_TOO: Lazy<Regex> = Lazy::new(|| Regex::new(r"^(?:pp|ppr|pret)\.?\s+or\s+a\.").unwrap());
    let stub = !text.contains('\n') && !ADJECTIVE_TOO.is_match(rest);
    Some(Inflection { of, stub })
}

// ---------------------------------------------------------------------------
// Snippets
// ---------------------------------------------------------------------------

/// Cuts plain text to about `max` bytes at a word boundary.
fn clip_words(s: &str, max: usize) -> String {
    let s = s.trim();
    if s.len() <= max {
        return s.to_string();
    }
    let mut cut = max;
    while !s.is_char_boundary(cut) {
        cut -= 1;
    }
    let head = &s[..cut];
    let head = head.rfind(' ').map_or(head, |i| &head[..i]);
    format!("{}…", head.trim_end_matches([',', ';', ':', ' ']))
}

const SNIPPET_CHARS: usize = 160;

/// The abbreviations that open a heading after its headword: the part of
/// speech, and any short grammar or pronunciation ("v.t.", "pret.", "sinj.").
static ABBREVIATIONS: Lazy<Regex> = Lazy::new(|| Regex::new(r"^(?:(?:[a-z]{1,6}\.){1,3}[,;]?\s*)+").unwrap());

/// An entry's first sense, as a line of a list: "PREVENT, v.t. [L. proevenio,
/// supra.]" is only its heading, and the list should say "To go before; to
/// precede." The list gives the headword and the part of speech beside it,
/// so the line never begins with them again ("Abjectness n." over "n. the
/// state of being abject").
///
/// Webster's heading runs headword, part of speech, then whatever he prints
/// before a definition (see [`heading_parts`]), and then -- often -- the
/// first sense itself ("LET, v.i. To forbear. Obs."; "PAAGE, n. [See Pay.] A
/// toll for passage"); a sense begins with a capital once they are past.
/// Where none does -- the heading ends in its etymology, or runs on into
/// grammar ("pret. and pp. made") -- the sense is the next paragraph ("1. To
/// compel; to constrain"). An entry of one paragraph has nothing else to
/// show, and is shown by what its heading has past those: a definition that
/// begins in lower case ("ABJECTNESS, n. the state of being abject"), the
/// verb a form is of ("KNEW, pret. of know" is "of know", as the word card
/// has it), or a cross-reference ("CAT-PIPE, n. [See Catcall.]").
pub fn first_sense(text: &str) -> String {
    static SENSE_NUMBER: Lazy<Regex> = Lazy::new(|| Regex::new(r"^\s*\d+\.\s*").unwrap());
    // What only continues the labels before it: "and pp. of lead", "or a.".
    static CONTINUES: Lazy<Regex> = Lazy::new(|| Regex::new(r"^(?:or|and|but)\b").unwrap());
    let mut lines = text.lines();
    let heading = lines.next().unwrap_or("");
    let next = lines.map(|l| SENSE_NUMBER.replace(l, "").into_owned()).find(|l| !l.trim().is_empty());
    let parts = heading_parts(heading);
    let rest = heading[parts.sense_at..].trim();
    // A bracket closed that the heading never opened is a note running on
    // ("[L. ante, before.] But he said, yea rather... Luke 11.]"), not a
    // definition.
    let runs_on = rest.matches(']').count() > rest.matches('[').count();
    let sense = if !parts.in_forms && !runs_on && rest.starts_with(|c: char| c.is_ascii_uppercase()) {
        rest.to_string()
    } else if let Some(next) = next {
        next
    } else if !rest.is_empty() && !CONTINUES.is_match(rest) {
        rest.to_string()
    } else {
        let labelled = &heading[parts.labels_end..];
        let shown = labelled[alternate_len(labelled)..].trim();
        let shown = if !shown.is_empty() && !CONTINUES.is_match(shown) { shown } else { after_headword(heading).trim() };
        shown.to_string()
    };
    clip_words(&sense, SNIPPET_CHARS)
}

/// Where in a heading its sense may begin (see [`heading_parts`]).
fn sense_offset(heading: &str) -> usize {
    heading_parts(heading).sense_at
}

/// A heading line read up to where a definition may begin.
struct HeadingParts {
    /// Past the headword and the part of speech with any abbreviations
    /// after it ("ABJECTNESS, n. " -- "WAS, pret. and pp." stops at "and").
    labels_end: usize,
    /// Past everything else Webster prints before a definition.
    sense_at: usize,
    /// Still among a verb's or noun's forms: "pret. and pp. let. Letted is
    /// obsolete." goes on in grammar, not a definition, until a bracket
    /// closes it ("pret. and pp. remade. [re and make.] To make anew").
    in_forms: bool,
}

/// Reads a heading past what Webster prints before a definition, in any
/// order and as often as it comes:
///
/// - the part of speech and the abbreviations after it ("v.t.", "a. superl.",
///   "sinj."), and the forms a plural label names ("n. plu. porites.");
/// - another part of speech ("pp. or a.", "v.t. or i.", "n. sing. and plu.");
/// - a pronunciation: respelt with its accent ("trib'ly.", "hed'land."), set
///   out as a rule ("s as z."), or respelt plainly before an etymology or a
///   capital ("disperj. [L.]", "britely. Splendidly");
/// - a verb's forms ("and pp. made.", "and pp. penned or pent.");
/// - and the etymology, in brackets however nested ("[L. proevenio, supra.]").
fn heading_parts(heading: &str) -> HeadingParts {
    static PLURAL_LABEL: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)(?:^|[\s.])plu\.\s*$").unwrap());
    static FORMS: Lazy<Regex> = Lazy::new(|| Regex::new(r"^[a-z][a-z'\-]*(?:(?:\s+or\s+|,\s*)[a-z][a-z'\-]*)*\.").unwrap());
    static FORMS_OF: Lazy<Regex> = Lazy::new(|| Regex::new(r"^and\s+(?:pp|ppr|pret|part)\.\s*").unwrap());
    static RESPELT: Lazy<Regex> = Lazy::new(|| Regex::new(r"^[a-z'`\-]*['`][a-z'`\-]*[.;]").unwrap());
    static RULE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^(?:[a-zA-Z] as [a-z]\b\.?|sing\.\s*and\s*plu\.)").unwrap());
    static PLAIN_RESPELLING: Lazy<Regex> = Lazy::new(|| Regex::new(r"^[a-z][a-z'\-]*\.\s+").unwrap());
    static LONE_LETTER: Lazy<Regex> = Lazy::new(|| Regex::new(r"^[a-z]\s+").unwrap());
    // How long a match of `re` at the start of `s` is, where the character
    // after it passes `then` (a word, not the first letters of a longer one).
    let lead = |re: &Regex, s: &str, then: fn(Option<char>) -> bool| {
        re.find(s).filter(|m| then(s[m.end()..].chars().next())).map_or(0, |m| m.end())
    };
    let not_a_letter: fn(Option<char>) -> bool = |c| !c.is_some_and(|c| c.is_ascii_lowercase());
    let starts_a_sense: fn(Option<char>) -> bool = |c| c.is_some_and(|c| c == '[' || c.is_ascii_uppercase());
    let spaces = |s: &str| s.len() - s.trim_start().len();

    let mut at = heading.len() - after_headword(heading).len();
    let mut labels_end = None;
    let mut in_forms = false;
    loop {
        let start = at;
        let rest = &heading[at..];
        at += rest.len() - rest.trim_start_matches([' ', ',', ';', ':', '.']).len();
        if let Some(m) = ABBREVIATIONS.find(&heading[at..]) {
            at += m.end();
            if PLURAL_LABEL.is_match(&heading[start..at]) {
                let forms = lead(&FORMS, &heading[at..], not_a_letter);
                if forms > 0 {
                    at += forms + spaces(&heading[at + forms..]);
                    in_forms = true;
                }
            }
        } else if heading[at..].starts_with("Plu.") {
            at += 4 + spaces(&heading[at + 4..]);
        }
        if labels_end.is_none() {
            labels_end = Some(at);
        }
        at += alternate_len(&heading[at..]);
        let rest = &heading[at..];
        let respelt = [
            lead(&RESPELT, rest, not_a_letter),
            lead(&RULE, rest, |_| true),
            lead(&PLAIN_RESPELLING, rest, starts_a_sense),
            lead(&LONE_LETTER, rest, |c| c.is_some_and(|c| c.is_ascii_uppercase())),
        ]
        .into_iter()
        .find(|&n| n > 0)
        .unwrap_or(0);
        at += respelt + spaces(&heading[at + respelt..]);
        if let Some(m) = FORMS_OF.find(&heading[at..]) {
            at += m.end();
            let forms = lead(&FORMS, &heading[at..], not_a_letter);
            at += forms + spaces(&heading[at + forms..]);
            in_forms = true;
        }
        if heading[at..].starts_with('[') {
            let mut depth = 0i32;
            let close = heading[at..].char_indices().find_map(|(i, c)| {
                match c {
                    '[' => depth += 1,
                    ']' => depth -= 1,
                    _ => {}
                }
                (depth == 0).then_some(i)
            });
            if let Some(close) = close {
                at += close + 1;
                in_forms = false;
            }
        }
        if at == start {
            break;
        }
    }
    HeadingParts { labels_end: labels_end.unwrap_or(at), sense_at: at, in_forms }
}

/// How long another part of speech at the start of `s` is, the one it can
/// also be read as: "or a.", "or v.t.", "and i.", "or I.", "and plu.". Not
/// "and pp.", which begins a verb's forms.
fn alternate_len(s: &str) -> usize {
    static ALTERNATE: Lazy<Regex> =
        Lazy::new(|| Regex::new(r"^(?:or\s+(?:[a-z]{1,6}\.){1,2}|(?:or|and)\s+[iI]\.|and\s+(?:[a-z]|plu)\.)\s*").unwrap());
    ALTERNATE.find(s).map_or(0, |m| m.end())
}

/// The words of a search to show a hit around: its plain terms, lower case,
/// without the operators and the negated ones.
fn search_terms(query: &str) -> Vec<String> {
    query
        .split_whitespace()
        .filter(|t| !matches!(*t, "AND" | "OR" | "NOT") && !t.starts_with('-'))
        .map(|t| t.chars().filter(|c| c.is_ascii_alphabetic()).collect::<String>().to_lowercase())
        .filter(|t| !t.is_empty())
        .collect()
}

/// The passage of an entry around the first of `terms` it holds, as a line
/// of a search list: the terms together as a phrase if they stand so, or
/// else in one paragraph, or else the first of them there is. The index
/// matches stems (*hindered* finds *hinder*), so where a term itself is not
/// in the text its first letters are looked for ("hinder" of "hindered").
///
/// The headword says nothing the list does not already give -- "Quick n." --
/// so a match in it is passed over ("QUICK, n." is no line to show for
/// *quick living*), and so, for a word searched on its own, is the headword
/// said again further down (FEARFULNESS's "is fearfulness of" for *fear*).
/// A match in the rest of the heading is shown without the headword and the
/// part of speech. `None` when none of it is anywhere else, and the list
/// shows the entry's first sense.
pub fn excerpt(text: &str, terms: &[String]) -> Option<String> {
    let lower = text.to_ascii_lowercase();
    let heading = &text[..text.find('\n').unwrap_or(text.len())];
    let headword_ends = heading.len() - after_headword(heading).len();
    let headword = lower[..headword_ends].trim_end_matches([',', '.', ' ']);
    // Past the part of speech and the abbreviations after it -- forms and
    // pronunciation, which the list line has no more use for than the
    // headword: *led* is not to be shown by LEAD's "v.t. led.", nor *wist* by
    // WIS's "v.t. pret. wist."
    let labels_end = headword_ends + ABBREVIATIONS.find(&heading[headword_ends..]).map_or(0, |m| m.end());
    let is_word_char = |b: u8| b.is_ascii_alphabetic() || b == b'-' || b == b'\'';
    let starts_word = |at: usize| at == 0 || !lower.as_bytes()[at - 1].is_ascii_alphabetic();
    let is_headword = |at: usize| {
        let end = lower[at..].bytes().position(|b| !is_word_char(b)).map_or(lower.len(), |n| at + n);
        lower[at..end].trim_end_matches(['-', '\'']) == headword
    };
    let found = |needle: &str, any_word: bool| {
        lower
            .match_indices(needle)
            .map(|(i, _)| i)
            .find(|&i| i >= labels_end && starts_word(i) && (any_word || !is_headword(i)))
    };
    // The first paragraph that has every term, at the first of them.
    let together = || {
        let mut start = 0;
        for line in lower.split('\n') {
            let end = start + line.len();
            let at: Option<Vec<usize>> = terms
                .iter()
                .map(|t| {
                    lower[start..end]
                        .match_indices(t.as_str())
                        .map(|(i, _)| start + i)
                        .find(|&i| i >= labels_end && starts_word(i))
                })
                .collect();
            if let Some(at) = at {
                return at.into_iter().min();
            }
            start = end + 1;
        }
        None
    };
    let at = (terms.len() > 1)
        .then(|| found(&terms.join(" "), true).or_else(together))
        .flatten()
        .or_else(|| terms.iter().find_map(|t| found(t, false)))
        .or_else(|| terms.iter().filter(|t| t.len() > 4).find_map(|t| found(&t[..(t.len() - 3).max(4)], false)))?;
    let mut line_start = lower[..at].rfind('\n').map_or(0, |i| i + 1);
    if line_start == 0 {
        // In the heading: from its sense where the match is in that, else
        // from past the part of speech.
        let sense_starts = sense_offset(heading);
        line_start = if sense_starts <= at { sense_starts } else { labels_end };
    }
    let line_end = lower[at..].find('\n').map_or(lower.len(), |i| at + i);
    let line = &text[line_start..line_end];
    if line.len() <= SNIPPET_CHARS {
        return Some(line.trim().to_string());
    }
    // A long paragraph: from a word boundary some way before the match.
    let mut start = at.saturating_sub(60).max(line_start);
    if start > line_start {
        start = text[start..at].find(' ').map_or(start, |i| start + i + 1);
    }
    let clipped = clip_words(&text[start..line_end], SNIPPET_CHARS);
    Some(if start > line_start { format!("…{clipped}") } else { clipped })
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/// An entry, with the plain text the lookup reads its heading from.
struct Found {
    entry: WebsterEntry,
    text: String,
}

const COLS: &str = "e.id, e.word, e.key, e.pos, e.html, e.text";

fn map_found(r: &rusqlite::Row) -> rusqlite::Result<Found> {
    Ok(Found {
        entry: WebsterEntry { id: r.get(0)?, word: r.get(1)?, key: r.get(2)?, pos: r.get(3)?, html: r.get(4)?, aliases: vec![] },
        text: r.get(5)?,
    })
}

/// False on a content.db built before Webster was added, so the page and the
/// popup show nothing rather than an error.
fn has_webster(conn: &Connection) -> bool {
    conn.query_row("SELECT 1 FROM webster_entries LIMIT 1", [], |_| Ok(())).is_ok()
}

fn by_key(conn: &Connection, key: &str) -> anyhow::Result<Vec<Found>> {
    let mut stmt = conn.prepare_cached(&format!("SELECT {COLS} FROM webster_entries e WHERE e.key = ?1 ORDER BY e.sort"))?;
    let rows = stmt.query_map(params![key], map_found)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn by_alias(conn: &Connection, alias: &str) -> anyhow::Result<Vec<Found>> {
    let mut stmt = conn.prepare_cached(&format!(
        "SELECT {COLS} FROM webster_aliases a JOIN webster_entries e ON e.id = a.entry_id WHERE a.alias = ?1 ORDER BY e.sort"
    ))?;
    let rows = stmt.query_map(params![alias], map_found)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn by_key_or_alias(conn: &Connection, key: &str) -> anyhow::Result<Vec<Found>> {
    let found = by_key(conn, key)?;
    if !found.is_empty() {
        return Ok(found);
    }
    by_alias(conn, key)
}

fn aliases_of(conn: &Connection, id: i64) -> anyhow::Result<Vec<String>> {
    let mut stmt = conn.prepare_cached("SELECT alias FROM webster_aliases WHERE entry_id = ?1 ORDER BY alias")?;
    let rows = stmt.query_map(params![id], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn is_noun(pos: Option<&str>) -> bool {
    pos.is_some_and(|p| p.starts_with("n.") || p == "plu.")
}

/// Whether an entry is a verb. Webster's part of speech says so, and where
/// the dump has none because the heading was printed or read awry --
/// "DESPISE, .v.t.", "ABSCIND, vt.", "SPIN, v.il.", "CHALLENGE, VT", "BENUM,
/// corruptly BENUMB', v.t." -- the heading still does; where it prints none
/// at all ("BEND, [L. pando ...]", "COERCE,", "SHEATHE,"), a first sense in
/// the infinitive ("1. To strain", "1. To restrain by force") does. Without
/// this DESPISED, a participle of one line, would find no verb to go with it.
pub fn reads_as_verb(pos: Option<&str>, text: &str) -> bool {
    static PRINTED: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)(?:^|[\s,.])v\.?\s?[it]l?(?:[.\s]|$)").unwrap());
    static INFINITIVE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^To [a-z]").unwrap());
    if let Some(pos) = pos {
        return pos.starts_with("v.");
    }
    let heading = text.lines().next().unwrap_or("");
    // The heading up to its etymology: the part of speech is printed before it.
    let named: String = after_headword(heading).split('[').next().unwrap_or("").chars().take(40).collect();
    PRINTED.is_match(&named) || (inflection(None, text).is_none() && INFINITIVE.is_match(&first_sense(text)))
}

/// Whether an entry is what a base form of `kind` is after (see [`Kind`]).
fn is_wanted(f: &Found, kind: Kind) -> bool {
    let pos = f.entry.pos.as_deref();
    match kind {
        Kind::Verb => reads_as_verb(pos, &f.text),
        Kind::Noun => is_noun(pos),
        Kind::VerbOrAdjective => !is_noun(pos),
        Kind::Any => inflection(pos, &f.text).is_none(),
    }
}

/// The entries of a base that the form means: a verb form means the verb
/// (MAKE, v.t. and v.i., not MAKE the mate), a plural the noun. All of them
/// where the base has none of that kind.
fn of_kind(found: Vec<Found>, kind: Kind) -> Vec<Found> {
    if found.iter().any(|f| is_wanted(f, kind)) {
        found.into_iter().filter(|f| is_wanted(f, kind)).collect()
    } else {
        found
    }
}

/// The verb a participle or preterit belongs to, and its verb entries: the
/// one its heading names, or else the one it is known to be a form of (see
/// [`UNNAMED_VERBS`], [`IRREGULAR_VERBS`]), or else the first of the word's
/// base forms that Webster has as a verb -- *singed* SINGE, where SING is a
/// verb too, since -nged after an i is singe's (see [`endings`]).
fn find_verb(conn: &Connection, key: &str, named: Option<&str>) -> anyhow::Result<Option<(String, Vec<Found>)>> {
    if let Some(named) = named.filter(|n| *n != key) {
        let found = by_key_or_alias(conn, named)?;
        if !found.is_empty() {
            let matched = found[0].entry.key.clone();
            return Ok(Some((matched, of_kind(found, Kind::Verb))));
        }
    }
    let unnamed = UNNAMED_VERBS.iter().find(|(form, _)| *form == key).map(|(_, verb)| BaseForm { key: verb.to_string(), kind: Kind::Verb });
    let candidates = unnamed.into_iter().chain(irregular_base(key)).chain(base_forms(key));
    for form in candidates {
        let verbs: Vec<Found> =
            by_key_or_alias(conn, &form.key)?.into_iter().filter(|f| reads_as_verb(f.entry.pos.as_deref(), &f.text)).collect();
        if !verbs.is_empty() {
            return Ok(Some((verbs[0].entry.key.clone(), verbs)));
        }
    }
    Ok(None)
}

/// A key's entries, with the verb brought in where they are participles or
/// preterits (step 2 of the module comment). Returns the key that comes
/// first, whether that is the verb rather than the key itself, and the
/// entries in order. A key this copy lacks the KJV's sense of (see
/// [`MISSING`]) keeps its own place: RANK is not RING's, whatever the one
/// line it has says.
fn with_verb(conn: &Connection, key: &str, found: Vec<Found>) -> anyhow::Result<(String, bool, Vec<Found>)> {
    let inflections: Vec<Option<Inflection>> = found.iter().map(|f| inflection(f.entry.pos.as_deref(), &f.text)).collect();
    if inflections.iter().all(Option::is_none) {
        return Ok((key.to_string(), false, found));
    }
    let named = inflections.iter().flatten().find_map(|i| i.of.clone());
    let Some((verb_key, verbs)) = find_verb(conn, key, named.as_deref())? else {
        return Ok((key.to_string(), false, found));
    };
    let all_stubs = inflections.iter().all(|i| i.as_ref().is_some_and(|i| i.stub));
    Ok(if all_stubs && missing_note(key).is_none() {
        (verb_key, true, verbs.into_iter().chain(found).collect())
    } else {
        (key.to_string(), false, found.into_iter().chain(verbs).collect())
    })
}

fn finish(conn: &Connection, query: String, matched: String, via: Via, found: Vec<Found>) -> anyhow::Result<Option<WebsterLookup>> {
    let mut seen: HashSet<i64> = HashSet::new();
    let mut entries = Vec::with_capacity(found.len());
    for f in found {
        if seen.insert(f.entry.id) {
            let mut entry = f.entry;
            entry.aliases = aliases_of(conn, entry.id)?;
            entries.push(entry);
        }
    }
    let note = missing_note(&query).or_else(|| missing_note(&matched)).map(str::to_string);
    Ok(Some(WebsterLookup { query, matched, via, entries, note }))
}

/// A base form's entries as the lookup returns them (step 4 of the module
/// comment), the verb brought in where they are its participles.
fn from_base(conn: &Connection, query: String, found: Vec<Found>) -> anyhow::Result<Option<WebsterLookup>> {
    let key = found[0].entry.key.clone();
    let (matched, _, found) = with_verb(conn, &key, found)?;
    finish(conn, query, matched, Via::Base, found)
}

/// The keys Webster files a verb's participles and preterit under, where it
/// has them: SOWED, SOWING and SOWN of sow; TILLED and TILLING of till;
/// STOPPED of stop.
fn participle_keys(verb: &str) -> Vec<String> {
    let b = verb.as_bytes();
    let n = b.len();
    if n < 2 {
        return vec![];
    }
    if let Some(stem) = verb.strip_suffix('e') {
        return vec![format!("{verb}d"), format!("{stem}ing")];
    }
    if let Some(stem) = verb.strip_suffix('y').filter(|stem| stem.bytes().last().is_some_and(is_consonant)) {
        return vec![format!("{stem}ied"), format!("{verb}ing")];
    }
    let mut keys = vec![format!("{verb}ed"), format!("{verb}ing")];
    if n >= 3 && is_consonant(b[n - 3]) && is_vowel(b[n - 2]) && is_consonant(b[n - 1]) && !matches!(b[n - 1], b'w' | b'x' | b'y') {
        let last = b[n - 1] as char;
        keys.push(format!("{verb}{last}ed"));
        keys.push(format!("{verb}{last}ing"));
    }
    if verb.ends_with('w') {
        keys.push(format!("{verb}n"));
    }
    keys
}

/// What Webster says of a word as the text prints it (see the module
/// comment for the order things are tried in). `None` when nothing is found,
/// or the word is not English.
pub fn lookup(conn: &Connection, word: &str) -> anyhow::Result<Option<WebsterLookup>> {
    let Some(query) = normalize_word(word) else { return Ok(None) };
    if !has_webster(conn) {
        return Ok(None);
    }
    let exact = by_key(conn, &query)?;

    if let Some(form) = irregular_base(&query) {
        let base = of_kind(by_key_or_alias(conn, &form.key)?, form.kind);
        if !base.is_empty() {
            let matched = base[0].entry.key.clone();
            return finish(conn, query, matched, Via::Base, base.into_iter().chain(exact).collect());
        }
    }

    if !exact.is_empty() {
        let (matched, promoted, found) = with_verb(conn, &query, exact)?;
        let via = if promoted { Via::Base } else { Via::Exact };
        return finish(conn, query, matched, via, found);
    }

    let aliased = by_alias(conn, &query)?;
    if !aliased.is_empty() {
        let matched = aliased[0].entry.key.clone();
        return finish(conn, query, matched, Via::Alias, aliased);
    }

    // The first base form Webster has as the kind of word its ending makes
    // (see [`Kind`]), not merely the first it has: *severed* is SEVER's, not
    // SEVERE's; *createth* CREATE's, not CREAT's ("an usher to a riding
    // master"); *arts* is ART the noun's.
    let forms = base_forms(&query);
    let mut fallback: Option<(Vec<Found>, bool)> = None;
    for form in &forms {
        let found = by_key_or_alias(conn, &form.key)?;
        if found.is_empty() {
            continue;
        }
        if found.iter().any(|f| is_wanted(f, form.kind)) {
            return from_base(conn, query, of_kind(found, form.kind));
        }
        let only_inflections = found.iter().all(|f| inflection(f.entry.pos.as_deref(), &f.text).is_some());
        if fallback.as_ref().is_none_or(|(_, inflections)| *inflections && !only_inflections) {
            fallback = Some((found, only_inflections));
        }
    }
    // None is. A verb form whose verb this copy lacks is shown by the verb's
    // own participles, where Webster has them, rather than by a noun of
    // another sense: *soweth* by SOWED, SOWING and SOWN, not by SOW, "the
    // female of the hog kind"; *tilleth* by TILLED and TILLING, not by TILL,
    // a vetch.
    for form in forms.iter().filter(|f| matches!(f.kind, Kind::Verb | Kind::VerbOrAdjective)) {
        let mut participles = Vec::new();
        for key in participle_keys(&form.key) {
            participles.extend(by_key(conn, &key)?.into_iter().filter(|f| inflection(f.entry.pos.as_deref(), &f.text).is_some()));
        }
        if !participles.is_empty() {
            let matched = participles[0].entry.key.clone();
            return finish(conn, query, matched, Via::Base, participles);
        }
    }
    // Else the first base form there is, and one that is only another word's
    // participle or preterit last of all: *hasted* is HASTE the noun's (this
    // copy has no HASTE, v.), not HAST's.
    match fallback {
        Some((found, _)) => from_base(conn, query, found),
        None => Ok(None),
    }
}

pub fn get_entry(conn: &Connection, id: i64) -> anyhow::Result<Option<WebsterEntry>> {
    if !has_webster(conn) {
        return Ok(None);
    }
    let found = conn
        .query_row(&format!("SELECT {COLS} FROM webster_entries e WHERE e.id = ?1"), params![id], map_found)
        .optional()?;
    let Some(found) = found else { return Ok(None) };
    let mut entry = found.entry;
    entry.aliases = aliases_of(conn, entry.id)?;
    Ok(Some(entry))
}

/// A list line for an entry, its snippet the first sense.
fn hit(id: i64, word: String, key: String, pos: Option<String>, snippet: String) -> WebsterHit {
    WebsterHit { id, word, key, pos, snippet }
}

/// The dictionary from a place in the alphabet on, a page at a time: the
/// entries whose key is `prefix` or comes after it, in dictionary order, so
/// the words beginning with it come first and the list then runs on as the
/// printed page would. An empty prefix is the beginning of A.
pub fn browse(conn: &Connection, prefix: &str, limit: i64) -> anyhow::Result<Vec<WebsterHit>> {
    if !has_webster(conn) {
        return Ok(vec![]);
    }
    let from = normalize_word(prefix).unwrap_or_default();
    let mut stmt =
        conn.prepare_cached("SELECT id, word, key, pos, text FROM webster_entries WHERE key >= ?1 ORDER BY key, sort LIMIT ?2")?;
    let rows = stmt.query_map(params![from, limit], |r| {
        Ok(hit(r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, first_sense(&r.get::<_, String>(4)?)))
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// A search typed as a word (or words) rather than with the search
/// language's operators: what the headword tier compares keys against, and
/// the phrase tier searches for. Any word of it that is an operator -- a
/// negation (*fear -god*), an exact form (*+LORD*), a prefix, a nearness --
/// makes it the search language's, which only the match expression reads:
/// taken as plain words, "fear -god" would be the phrase "fear god", and
/// rank first the very entries it asks to leave out.
fn headword_query(query: &str) -> Option<String> {
    let q = query.trim();
    let plain = q.chars().all(|c| c.is_alphabetic() || matches!(c, ' ' | '-' | '\'' | '\u{2019}'))
        && !q.split_whitespace().any(|t| t.starts_with(['-', '+', '*', '~']) || matches!(t, "AND" | "OR" | "NOT"));
    plain.then(|| normalize_word(q)).flatten()
}

/// The match expression with an AND written in beside each bracketed group.
/// FTS5 takes two terms side by side as both required, but not a term and a
/// group, or a group and what follows it: `"love"* ("joy"* OR "peace"*)` is
/// a syntax error, and `"love"* AND ("joy"* OR "peace"*)` is what the search
/// language means by it. `query_lang` writes the first, and every search box
/// shares it; here the AND is put in, so a bracket typed into the Webster
/// search finds what it asks for rather than failing the whole search. A
/// NEAR group is a term, and a term beside it needs no AND.
pub fn and_beside_groups(expr: &str) -> String {
    #[derive(Clone, Copy, PartialEq)]
    enum Last {
        Nothing,
        Operator,
        Term,
        Group,
    }
    let mut out = String::with_capacity(expr.len() + 8);
    let mut last = Last::Nothing;
    let mut in_near = false;
    let mut rest = expr;
    while let Some(c) = rest.chars().next() {
        if c == '"' {
            // A phrase to its closing quote ("" inside it is a quote), and any star.
            let mut end = 1;
            loop {
                match rest[end..].find('"') {
                    None => {
                        end = rest.len();
                        break;
                    }
                    Some(i) => {
                        end += i + 1;
                        if rest[end..].starts_with('"') {
                            end += 1;
                        } else {
                            break;
                        }
                    }
                }
            }
            end += rest[end..].len() - rest[end..].trim_start_matches('*').len();
            if !in_near && last == Last::Group {
                out.push_str("AND ");
            }
            out.push_str(&rest[..end]);
            rest = &rest[end..];
            if !in_near {
                last = Last::Term;
            }
            continue;
        }
        if rest.starts_with("NEAR(") {
            if last == Last::Group {
                out.push_str("AND ");
            }
            out.push_str("NEAR(");
            rest = &rest["NEAR(".len()..];
            in_near = true;
            continue;
        }
        match c {
            '(' => {
                if matches!(last, Last::Term | Last::Group) {
                    out.push_str("AND ");
                }
                out.push('(');
                last = Last::Nothing;
            }
            ')' if in_near => {
                out.push(')');
                in_near = false;
                last = Last::Term;
            }
            ')' => {
                out.push(')');
                last = Last::Group;
            }
            c if c.is_whitespace() => out.push(c),
            _ => {
                // An operator (AND, OR, NOT), or a NEAR's comma and distance.
                let end = rest.find(|ch: char| ch.is_whitespace() || matches!(ch, '(' | ')' | '"')).unwrap_or(rest.len()).max(c.len_utf8());
                out.push_str(&rest[..end]);
                rest = &rest[end..];
                if !in_near {
                    last = Last::Operator;
                }
                continue;
            }
        }
        rest = &rest[c.len_utf8()..];
    }
    out
}

/// Whether an error is FTS5 refusing a match expression, which a search
/// should survive with the hits it already has, rather than any other.
fn is_match_syntax_error(e: &rusqlite::Error) -> bool {
    e.to_string().starts_with("fts5:")
}

/// Search, headwords first: the entries under the word typed (and those it
/// is an alias of), then the headwords that begin with it in dictionary
/// order, then everything else whose text matches, by relevance, a match in
/// the headword weighing more than one in the body. The index is stemmed and
/// the search language's prefixes are on, so *prevent* finds PREVENTION and
/// the entries that say *prevented*.
pub fn search(conn: &Connection, query: &str, limit: i64) -> anyhow::Result<Vec<WebsterHit>> {
    if query.trim().is_empty() || !has_webster(conn) {
        return Ok(vec![]);
    }
    let limit_usize = limit.max(0) as usize;
    let mut hits: Vec<WebsterHit> = Vec::new();
    let mut seen: HashSet<i64> = HashSet::new();

    if let Some(word) = headword_query(query) {
        let mut stmt = conn.prepare_cached(
            "SELECT id, word, key, pos, text FROM (
               SELECT e.id, e.word, e.key, e.pos, e.text, 0 AS tier, e.sort FROM webster_entries e WHERE e.key = ?1
               UNION
               SELECT e.id, e.word, e.key, e.pos, e.text, 0, e.sort FROM webster_aliases a JOIN webster_entries e ON e.id = a.entry_id
                 WHERE a.alias = ?1
               UNION
               SELECT id, word, key, pos, text, 1, sort FROM (
                 SELECT e.id, e.word, e.key, e.pos, e.text, e.sort FROM webster_entries e
                 WHERE e.key > ?1 AND e.key < ?1 || '{' ORDER BY e.key, e.sort LIMIT ?2
               )
             ) ORDER BY tier, sort LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![word, limit], |r| {
            Ok(hit(r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, first_sense(&r.get::<_, String>(4)?)))
        })?;
        for row in rows {
            let row = row?;
            if seen.insert(row.id) {
                hits.push(row);
            }
        }
    }

    // Several plain words: the entries that have them as a phrase before
    // those that have them apart. "go before" is then a reverse dictionary --
    // FOREWEND, PRECEDE, PREVENT -- rather than every entry with "gown" and
    // "before" in it somewhere.
    let terms = search_terms(query);
    let phrase = headword_query(query).filter(|w| w.contains(' ')).map(|w| format!("\"{w}\""));
    let match_expr = and_beside_groups(&super::search::build_match_expr(query));
    for expr in phrase.into_iter().chain(Some(match_expr).filter(|e| !e.is_empty())) {
        if hits.len() >= limit_usize {
            break;
        }
        let mut stmt = conn.prepare_cached(
            "SELECT e.id, e.word, e.key, e.pos, e.text
             FROM (SELECT rowid AS id, bm25(webster_fts, 5.0, 1.0) AS score FROM webster_fts
                   WHERE webster_fts MATCH ?1 ORDER BY score LIMIT ?2) h
             JOIN webster_entries e ON e.id = h.id
             ORDER BY h.score, e.sort",
        )?;
        let wanted = (limit_usize + seen.len()) as i64;
        let rows = stmt
            .query_map(params![expr, wanted], |r| {
                Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, Option<String>>(3)?, r.get::<_, String>(4)?))
            })
            .and_then(|rows| rows.collect::<Result<Vec<_>, _>>());
        // Whatever FTS5 still refuses, the headwords already found stand.
        let rows = match rows {
            Err(e) if is_match_syntax_error(&e) => break,
            rows => rows?,
        };
        for (id, word, key, pos, text) in rows {
            if hits.len() >= limit_usize {
                break;
            }
            if seen.insert(id) {
                let snippet = excerpt(&text, &terms).unwrap_or_else(|| first_sense(&text));
                hits.push(hit(id, word, key, pos, snippet));
            }
        }
    }
    hits.truncate(limit_usize);
    Ok(hits)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn keys(word: &str) -> Vec<String> {
        base_forms(word).into_iter().map(|f| f.key).collect()
    }

    /// The first base form the lookup would find, given the keys that exist.
    fn first_found(word: &str, existing: &[&str]) -> Option<String> {
        base_forms(word).into_iter().map(|f| f.key).find(|k| existing.contains(&k.as_str()))
    }

    #[test]
    fn king_james_endings_come_off() {
        // Where the likelier form exists, it is found first.
        let dictionary = &[
            "make", "mak", "go", "know", "prevent", "stop", "see", "sit", "cry", "lie", "ly", "die", "deny", "hate", "hat", "write",
            "writ", "love", "fall", "hear", "sing", "singe", "abide", "run", "flee", "do", "doe", "loved", "obey", "continue",
            "agree", "use", "us", "hope", "hop", "add", "err", "change", "judge", "rejoice", "bite", "bit",
        ];
        for (word, base) in [
            ("maketh", "make"),
            ("goeth", "go"),
            ("doeth", "do"),
            ("knoweth", "know"),
            ("knowest", "know"),
            ("makest", "make"),
            ("seeth", "see"),
            ("seest", "see"),
            ("fleeth", "flee"),
            ("sitteth", "sit"),
            ("runneth", "run"),
            ("falleth", "fall"),
            ("heareth", "hear"),
            ("singeth", "sing"),
            ("hateth", "hate"),
            ("writeth", "write"),
            ("biteth", "bite"),
            ("abideth", "abide"),
            ("loveth", "love"),
            ("rejoiceth", "rejoice"),
            ("continueth", "continue"),
            ("obeyeth", "obey"),
            ("crieth", "cry"),
            ("criest", "cry"),
            ("lieth", "lie"),
            ("dieth", "die"),
            ("denieth", "deny"),
            ("lovedst", "loved"),
            ("prevented", "prevent"),
            ("stopped", "stop"),
            ("hated", "hate"),
            ("hoped", "hope"),
            ("used", "use"),
            ("loved", "love"),
            ("agreed", "agree"),
            ("added", "add"),
            ("erred", "err"),
            ("changed", "change"),
            ("judged", "judge"),
            ("cried", "cry"),
            ("died", "die"),
            ("denied", "deny"),
            ("making", "make"),
            ("going", "go"),
            ("seeing", "see"),
            ("stopping", "stop"),
            ("singing", "sing"),
            ("dying", "die"),
            ("lying", "lie"),
            ("crying", "cry"),
            ("using", "use"),
        ] {
            assert_eq!(first_found(word, dictionary).as_deref(), Some(base), "{word}: {:?}", keys(word));
        }
    }

    #[test]
    fn ordinary_endings_come_off() {
        let dictionary = &[
            "church", "kiss", "box", "cry", "enemy", "die", "lie", "fly", "love", "use", "us", "horse", "toe", "to", "hero", "great",
            "wise", "big", "holy", "mighty", "happy", "gentle", "gent", "humble", "full", "ful", "wisdom", "neighbor", "honor",
            "labor", "honorable", "sepulcher", "scepter", "show", "show-bread", "basin", "fellowservant", "fellow-servant",
        ];
        for (word, base) in [
            ("churches", "church"),
            ("kisses", "kiss"),
            ("boxes", "box"),
            ("cries", "cry"),
            ("enemies", "enemy"),
            ("dies", "die"),
            ("lies", "lie"),
            ("flies", "fly"),
            ("loves", "love"),
            ("uses", "use"),
            ("horses", "horse"),
            ("toes", "toe"),
            ("heroes", "hero"),
            ("greater", "great"),
            ("greatest", "great"),
            ("wiser", "wise"),
            ("wisest", "wise"),
            ("bigger", "big"),
            ("holier", "holy"),
            ("holiest", "holy"),
            ("mightily", "mighty"),
            ("happily", "happy"),
            ("greatly", "great"),
            ("gently", "gentle"),
            ("humbly", "humble"),
            ("fully", "full"),
            // Webster's American spellings of the KJV's British ones.
            ("neighbour", "neighbor"),
            ("neighbours", "neighbor"),
            ("honour", "honor"),
            ("honourable", "honorable"),
            ("labour", "labor"),
            ("sepulchre", "sepulcher"),
            ("sepulchres", "sepulcher"),
            ("sceptre", "scepter"),
            ("shew", "show"),
            ("shewed", "show"),
            ("sheweth", "show"),
            ("shewbread", "show-bread"),
            ("bason", "basin"),
            // Compounds, joined or hyphenated.
            ("fellow-servant", "fellowservant"),
            ("fellowservant", "fellow-servant"),
        ] {
            assert_eq!(first_found(word, dictionary).as_deref(), Some(base), "{word}: {:?}", keys(word));
        }
    }

    #[test]
    fn king_james_irregulars_have_their_verbs() {
        for (word, base) in [
            ("hath", "have"),
            ("hast", "have"),
            ("doth", "do"),
            ("saith", "say"),
            ("spake", "speak"),
            ("brake", "break"),
            ("gat", "get"),
            ("wist", "wit"),
            ("wot", "wit"),
            ("clave", "cleave"),
            ("slew", "slay"),
            ("made", "make"),
            ("art", "be"),
            ("begat", "beget"),
        ] {
            assert_eq!(irregular_base(word), Some(BaseForm { key: base.into(), kind: Kind::Verb }), "{word}");
        }
        assert_eq!(irregular_base("lives"), Some(BaseForm { key: "life".into(), kind: Kind::Noun }));
        assert_eq!(irregular_base("brethren"), Some(BaseForm { key: "brother".into(), kind: Kind::Noun }));
        // Words the KJV uses in their own right too are left to the stub rule.
        for word in ["saw", "left", "found", "bare", "fell", "lay", "rose", "prevent"] {
            assert_eq!(irregular_base(word), None, "{word}");
        }
        // Through an ending: knewest is knew's, and knew is know's.
        assert_eq!(keys("knewest")[..2], ["know".to_string(), "knew".to_string()]);
        assert_eq!(keys("camest")[..2], ["come".to_string(), "came".to_string()]);
        assert_eq!(keys("madest")[..2], ["make".to_string(), "made".to_string()]);
        assert_eq!(keys("broughtest")[..2], ["bring".to_string(), "brought".to_string()]);
        // Only through the second person's: a stem that happens to be an
        // irregular is another word, and its verb is not among the forms.
        for (word, not) in [("hasted", "have"), ("hasteth", "have"), ("hasting", "have"), ("wasteth", "be"), ("wasted", "be"), ("arts", "be"), ("spokes", "speak")] {
            assert!(!keys(word).contains(&not.to_string()), "{word}: {:?}", keys(word));
        }
        assert_eq!(keys("hasted")[..2], ["hast".to_string(), "haste".to_string()]);
        // Behind a prefix, the verb keeps it.
        for (word, verb) in [
            ("overthrew", "overthrow"),
            ("withdrew", "withdraw"),
            ("foretold", "foretell"),
            ("foresaw", "foresee"),
            ("forgat", "forget"),
            ("forbare", "forbear"),
            ("became", "become"),
            ("befell", "befall"),
            ("undertook", "undertake"),
        ] {
            assert!(keys(word).contains(&verb.to_string()), "{word}: {:?}", keys(word));
        }
        assert_eq!(prefixed_irregular("forest"), None);
        assert_eq!(prefixed_irregular("overlay"), None);
    }

    #[test]
    fn the_kind_of_form_follows_the_ending() {
        let kind = |word: &str, key: &str| base_forms(word).into_iter().find(|f| f.key == key).map(|f| f.kind);
        assert_eq!(kind("maketh", "make"), Some(Kind::Verb));
        assert_eq!(kind("prevented", "prevent"), Some(Kind::Verb));
        assert_eq!(kind("making", "make"), Some(Kind::Verb));
        assert_eq!(kind("graven", "grave"), Some(Kind::Verb));
        assert_eq!(kind("loves", "love"), Some(Kind::Any));
        assert_eq!(kind("knowest", "know"), Some(Kind::VerbOrAdjective));
        assert_eq!(kind("greatest", "great"), Some(Kind::VerbOrAdjective));
        assert_eq!(kind("knewest", "know"), Some(Kind::Verb));
        assert_eq!(kind("horsemen", "horseman"), Some(Kind::Noun));
        // A spelling keeps the kind of the form it was made from.
        assert_eq!(kind("intreated", "entreat"), Some(Kind::Verb));
    }

    #[test]
    fn more_endings_spellings_and_compounds_come_off() {
        let dictionary = &[
            "horseman", "husbandman", "watchman", "yourself", "calf", "grave", "gra", "hold", "beat", "shake", "hew", "blow", "sow",
            "forbid", "befall", "bite", "bit", "wreathe", "wreath", "defense", "offense", "license", "recompense", "counselor",
            "marvelous", "traveler", "travel", "public", "music", "fulfill", "skillful", "willful", "entreat", "entreaty", "carcass",
            "ax", "basin", "labor", "laborer", "jubilee", "fullness", "manservant", "stumbling-block", "fellow-servant", "store-house",
            "armor-bearer", "sing", "singe", "hang", "long", "avenge", "breath", "breathe", "cloth", "clothe", "mouth", "berth",
        ];
        for (word, base) in [
            ("horsemen", "horseman"),
            ("husbandmen", "husbandman"),
            ("watchmen", "watchman"),
            ("yourselves", "yourself"),
            ("calves", "calf"),
            ("graven", "grave"),
            ("holden", "hold"),
            ("beaten", "beat"),
            ("shaken", "shake"),
            ("hewn", "hew"),
            ("blown", "blow"),
            ("sown", "sow"),
            ("forbidden", "forbid"),
            ("befallen", "befall"),
            ("bitten", "bite"),
            ("wreathen", "wreathe"),
            ("defence", "defense"),
            ("offences", "offense"),
            ("licence", "license"),
            ("recompence", "recompense"),
            ("counsellor", "counselor"),
            ("counsellors", "counselor"),
            ("marvellous", "marvelous"),
            ("travellers", "traveler"),
            ("travelled", "travel"),
            ("publick", "public"),
            ("musick", "music"),
            ("fulfil", "fulfill"),
            ("skilful", "skillful"),
            ("wilful", "willful"),
            ("intreat", "entreat"),
            ("intreated", "entreat"),
            ("intreaty", "entreaty"),
            ("carcase", "carcass"),
            ("carcases", "carcass"),
            ("axe", "ax"),
            ("basons", "basin"),
            ("labourer", "laborer"),
            ("laboured", "labor"),
            ("jubile", "jubilee"),
            ("fulness", "fullness"),
            ("menservants", "manservant"),
            ("stumblingblocks", "stumbling-block"),
            ("fellowservants", "fellow-servant"),
            ("storehouses", "store-house"),
            ("armourbearer", "armor-bearer"),
            // -nged after i, e or u is a verb in -nge; after a or o it is not.
            ("singed", "singe"),
            ("avenged", "avenge"),
            ("hanged", "hang"),
            ("longed", "long"),
            ("singing", "sing"),
            // th after a vowel was the verb's -the.
            ("breathed", "breathe"),
            ("breatheth", "breathe"),
            ("clothest", "clothe"),
            ("mouthed", "mouth"),
            ("berthed", "berth"),
        ] {
            assert_eq!(first_found(word, dictionary).as_deref(), Some(base), "{word}: {:?}", keys(word));
        }
        // Not fuller, smaller, dweller: one syllable before the l.
        for word in ["fuller", "smaller", "dweller"] {
            assert!(spelling_variants(word).is_empty(), "{word}: {:?}", spelling_variants(word));
        }
    }

    #[test]
    fn a_verb_is_read_from_a_heading_the_dump_gave_no_part_of_speech() {
        for text in [
            "DESPISE, .v.t.\n1. To contemn; to scorn.",
            "ABSCIND, vt. [L. abscindo.] To cut off. [Little used.]",
            "SPIN, v.il.\n1. To practice spinning.",
            "AMELIORATE, v.il To grow better; to meliorate.",
            "ROUGE, vi. [supra.] To paint the face, or rather the cheeks.",
            "CHALLENGE, VT\n1. To call, invite or summon to answer for an offense by single combat.",
            "BENUM, corruptly BENUMB', v.t.\n1. To make torpid.",
            "OBFIRMATE, obferm'ate. v.t. To make firm; to harden in resolution. [Not used.]",
            "BEND, [L.pando,pandare, to bend in; pando, pandere, to open; pandus, bent, crooked]\n1. To strain, or to crook by straining.",
            "COERCE,\n1. To restrain by force.",
            "SEW, To follow. [Not used. See Sue.]",
        ] {
            assert!(reads_as_verb(None, text), "{text}");
        }
        for text in [
            "VICE, L. vice, in the turn or place, is used in composition to denote one who acts in place of another.",
            "WAST, past tense of the substantive verb, in the second person; as, thou wast.",
            "HAST, the second person singular of have, I have, thou hast, contracted from havest.",
            "GRAVE, a final syllable, is a grove.",
            "AB, In English names, is an abbreviation of Abbey or Abbot.",
        ] {
            assert!(!reads_as_verb(None, text), "{text}");
        }
        assert!(reads_as_verb(Some("v.t."), "MAKE, v.t."));
        assert!(!reads_as_verb(Some("n."), "SOW, n.\n1. To be noted."));
    }

    #[test]
    fn a_word_is_normalized_the_way_keys_are_written() {
        assert_eq!(normalize_word("Prevented,").as_deref(), Some("prevented"));
        assert_eq!(normalize_word("  “Charity”; ").as_deref(), Some("charity"));
        assert_eq!(normalize_word("God's").as_deref(), Some("god"));
        assert_eq!(normalize_word("God\u{2019}s").as_deref(), Some("god"));
        assert_eq!(normalize_word("brethren'").as_deref(), Some("brethren"));
        assert_eq!(normalize_word("sons'").as_deref(), Some("sons"));
        assert_eq!(normalize_word("o'er").as_deref(), Some("oer"));
        assert_eq!(normalize_word("Fellow-Servant").as_deref(), Some("fellow-servant"));
        assert_eq!(normalize_word("(LORD)").as_deref(), Some("lord"));
        assert_eq!(normalize_word(""), None);
        assert_eq!(normalize_word("12"), None);
        assert_eq!(normalize_word("λόγος"), None);
        assert_eq!(normalize_word("בְּרֵאשִׁית"), None);
    }

    #[test]
    fn a_participle_or_preterit_is_read_from_its_heading() {
        let stub = |of: Option<&str>| Some(Inflection { of: of.map(str::to_string), stub: true });
        assert_eq!(inflection(Some("pret."), "SPAKE, pret. of speak; nearly obsolete. We not use spoke."), stub(Some("speak")));
        assert_eq!(inflection(Some("pret."), "CLAVE, pret. Of cleave."), stub(Some("cleave")));
        assert_eq!(inflection(Some("pp."), "PREVENTED, pp. Hindered from happening or taking effect."), stub(None));
        assert_eq!(inflection(Some("pp."), "BEGOT, BEGOTTEN, pp. of get. Procreated; generated."), stub(Some("get")));
        assert_eq!(inflection(Some("pret."), "HAD, pret. and pp. of have; contracted from Sax.haefd"), stub(Some("have")));
        assert_eq!(inflection(None, "CHOSE, s as z, pret. and p. of choose."), stub(Some("choose")));
        assert_eq!(inflection(None, "BEEN, Part.perf. of be; pronounced bin."), stub(Some("be")));
        assert_eq!(inflection(None, "SAT, pret of sit."), stub(Some("sit")));
        assert_eq!(inflection(None, "DRAVE, the old participle of drive. We now use drove."), stub(Some("drive")));
        assert_eq!(inflection(None, "AROSE, The past or preterit tense of the verb, to arise."), stub(Some("arise")));
        assert_eq!(inflection(None, "DOES, the third person of the verb do, indicative mode"), stub(Some("do")));
        assert_eq!(inflection(None, "HAST, the second person singular of have, I have, thou hast"), stub(Some("have")));
        // Named, but not a word it could be a form of.
        assert_eq!(inflection(None, "WAST, past tense of the substantive verb, in the second person"), stub(None));
        assert_eq!(inflection(None, "WAS, s. as z.; the past tense of the substantive verb; L., to be"), stub(None));
        // More than a paragraph, or an adjective as well: not a stub.
        assert_eq!(
            inflection(Some("ppr."), "PREVENTING, ppr. Going before.\n1. Hindering; obviating."),
            Some(Inflection { of: None, stub: false })
        );
        assert_eq!(
            inflection(Some("pp."), "CANDIED, pp. or a. Preserved with sugar, or incrusted with it."),
            Some(Inflection { of: None, stub: false })
        );
        // The verb itself, which names its own preterit, is not a form of anything.
        assert_eq!(inflection(Some("v.t."), "LET, v.t. pret. and pp. let. Letted is obsolete."), None);
        assert_eq!(inflection(Some("n."), "SAW, n. [See the Verb.]\n1. A cutting instrument"), None);
        assert_eq!(inflection(None, "LET, a termination of diminutives; as hamlet, a little house"), None);
        assert_eq!(inflection(None, "ART, The second person, indicative mode, present tense, of the substantive verb be"), Some(Inflection { of: Some("be".into()), stub: true }));
    }

    #[test]
    fn a_list_line_is_the_first_sense_not_the_heading() {
        let prevent = "PREVENT, v.t. [L. proevenio, supra.]\n1. To go before; to precede.\nI prevented the dawning of the morning, and cried. Ps.119.";
        assert_eq!(first_sense(prevent), "To go before; to precede.");
        assert_eq!(first_sense("LET, v.t. pret. and pp. let. Letted is obsolete. [To let out, like L. elocare, is to lease.]\n1. To permit; to allow; to suffer."), "To permit; to allow; to suffer.");
        assert_eq!(first_sense("LET, v.i. To forbear. Obs."), "To forbear. Obs.");
        assert_eq!(first_sense("PAAGE, n. [See Pay.] A toll for passage over another persons grounds. [Not used.]"), "A toll for passage over another persons grounds. [Not used.]");
        assert_eq!(first_sense("COMPREHEND, v.t. Literally, to take in; to take with, or together.\n1. To contain; to include."), "Literally, to take in; to take with, or together.");
        assert_eq!(first_sense("MAKE, v.t. pret. and pp. made.\n1. To compel; to constrain."), "To compel; to constrain.");
        assert_eq!(first_sense("SINGE, v.t. sinj. To burn slightly or superficially."), "To burn slightly or superficially.");
        assert_eq!(first_sense("MEAT, n.\n1. Food in general; any thing eaten for nourishment."), "Food in general; any thing eaten for nourishment.");
        assert_eq!(first_sense("PREVENTER, n. One that goes before. [Not in use.]\n1. One that hinders."), "One that goes before. [Not in use.]");
        let long = format!("CHARITY, n.\n1. In a general sense, love, benevolence, good will; {}", "that disposition of heart ".repeat(10));
        let line = first_sense(&long);
        assert!(line.starts_with("In a general sense, love") && line.ends_with('…') && line.len() <= SNIPPET_CHARS + 4, "{line}");
    }

    #[test]
    fn a_list_line_does_not_say_the_part_of_speech_again() {
        // A definition in lower case, on the only paragraph there is.
        assert_eq!(first_sense("ABJECTNESS, n. the state of being abject; meanness; servility."), "the state of being abject; meanness; servility.");
        assert_eq!(first_sense("ABOLISHED, pp. annulled; repealed; abrogated, or destroyed."), "annulled; repealed; abrogated, or destroyed.");
        // A pronunciation, respelt or given as a rule, before the definition.
        assert_eq!(first_sense("QUEASINESS, n. s as z. [from queasy.] Nausea; qualmishness; inclination to vomit."), "Nausea; qualmishness; inclination to vomit.");
        assert_eq!(first_sense("TREBLY, adv. trib'ly. In a threefold number or quantity."), "In a threefold number or quantity.");
        assert_eq!(first_sense("BRIGHTLY, adv. britely. Splendidly; with luster."), "Splendidly; with luster.");
        assert_eq!(first_sense("MOUSE, v.i.. mouz. To catch mice."), "To catch mice.");
        assert_eq!(first_sense("CONTEX, v.t To weave together. [Not used.]"), "To weave together. [Not used.]");
        // HEADLAND's first sense is on its heading, past the respelling, not
        // the numbered paragraph after it.
        assert_eq!(
            first_sense("HEADLAND, n. hed'land. A cape; a promontory.\n1. A ridge or strip of unplowed land at the ends of furrows."),
            "A cape; a promontory."
        );
        // Another part of speech, or a number, before the definition.
        assert_eq!(first_sense("BULGING, ppr. or a. Swelling out; bilging."), "Swelling out; bilging.");
        assert_eq!(first_sense("CHINESE, n. sing. and plu. A native of China; also, the language of China."), "A native of China; also, the language of China.");
        assert_eq!(first_sense("EXUDE, v.t. and i. [See Exsude, the preferable orthography.]"), "[See Exsude, the preferable orthography.]");
        // A plural's forms, then its definition, or its etymology and the
        // definition on the next paragraph -- not a note on the forms.
        assert_eq!(first_sense("PORITE, n. plu. porites. A petrified madrepore."), "A petrified madrepore.");
        assert_eq!(
            first_sense("SCHOLIUM, n. plu. scholia or scholiums. [L. scholion.]\nIn mathematics, a remark or observation subjoined to a demonstration."),
            "In mathematics, a remark or observation subjoined to a demonstration."
        );
        assert_eq!(
            first_sense("STRATUM, n. plu. stratums or strata. The latter is most common. [L., to spread or lay.]\nIn geology and mineralogy, a layer."),
            "In geology and mineralogy, a layer."
        );
        // A verb's forms, closed by a bracket or ending a one-line entry.
        assert_eq!(first_sense("REMAKE, v.t. pret. and pp. remade. [re and make.] To make anew."), "To make anew.");
        assert_eq!(first_sense("PEN, v.t. pret. and pp. penned or pent. To shut in a pen."), "To shut in a pen.");
        // A form's entry: the verb it is of, as the word card gives it.
        assert_eq!(first_sense("LED, pret. and pp. of lead."), "of lead.");
        assert_eq!(first_sense("KNEW, pret. of know."), "of know.");
        assert_eq!(first_sense("CRIED, pret. and part. of cry."), "of cry.");
        // Nothing but a cross-reference.
        assert_eq!(first_sense("CAT-PIPE, n. [See Catcall.]"), "[See Catcall.]");
        // A note that runs on past a bracket it never opened is not a sense.
        assert_eq!(
            first_sense("RATHER, adv. [I would rather go.] [L. ante, before.] But he said, yea rather, happy are they. Luke 11.]\n1. More readily or willingly."),
            "More readily or willingly."
        );
    }

    #[test]
    fn a_search_hit_shows_the_passage_it_matched() {
        let text = "PREVENT, v.t. [L. proevenio, supra.]\n1. To go before; to precede.\n6. To hinder; to obstruct; to intercept the approach or access of.";
        let terms = vec!["hindered".to_string()];
        assert_eq!(excerpt(text, &terms).as_deref(), Some("6. To hinder; to obstruct; to intercept the approach or access of."));
        assert_eq!(excerpt(text, &["precede".to_string()]).as_deref(), Some("1. To go before; to precede."));
        assert_eq!(excerpt(text, &["charity".to_string()]), None);
        // Words that stand together are shown where they do.
        assert_eq!(excerpt(text, &["to".to_string(), "obstruct".to_string()]).as_deref(), Some("6. To hinder; to obstruct; to intercept the approach or access of."));
        // A match in the heading, without the headword the list already shows.
        let gown = "MORNING-GOWN, n. A gown worn in the morning before one is formally dressed.";
        assert_eq!(excerpt(gown, &["before".to_string()]).as_deref(), Some("A gown worn in the morning before one is formally dressed."));
        assert_eq!(excerpt(gown, &["morning".to_string()]).as_deref(), Some("A gown worn in the morning before one is formally dressed."));
        assert_eq!(excerpt(text, &["proevenio".to_string()]).as_deref(), Some("[L. proevenio, supra.]"));
        let prevenient = "PREVENIENT, a. [L. proeveniens.] Going before; preceding; hence, preventive; as prevenient grace.";
        assert_eq!(
            excerpt(prevenient, &["go".to_string(), "before".to_string()]).as_deref(),
            Some("Going before; preceding; hence, preventive; as prevenient grace.")
        );
        // Inside a long paragraph, the window moves to the match.
        let long = format!("X, n.\n{}the word charity is here{}", "filler words ".repeat(20), " and more".repeat(20));
        let cut = excerpt(&long, &["charity".to_string()]).unwrap();
        assert!(cut.starts_with('…') && cut.contains("charity") && cut.ends_with('…'), "{cut}");
        assert_eq!(search_terms("love -hate \"go before\" OR x"), vec!["love", "go", "before", "x"]);
    }

    #[test]
    fn a_search_hit_is_not_shown_by_its_headword() {
        let terms = |t: &[&str]| t.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        // "quick living": not "QUICK, n.", but where the words stand together.
        let quick = "QUICK, n.\n1. A living animal. Obs.\n2. The living flesh; sensible parts; as penetrating to the quick; stung to the quick.";
        assert_eq!(
            excerpt(quick, &terms(&["quick", "living"])).as_deref(),
            Some("2. The living flesh; sensible parts; as penetrating to the quick; stung to the quick.")
        );
        let quickset = "QUICKSET, n. A living plant set to grow, particularly for a hedge.";
        assert_eq!(excerpt(quickset, &terms(&["quick", "living"])).as_deref(), Some("A living plant set to grow, particularly for a hedge."));
        // "fear -god": the headword, and the headword said again, are no
        // passage to show; the list falls back to the first sense.
        let fearless = "FEARLESS, a.\n1. Free from fear; as fearless of death; fearless of consequences.\n2. Bold; courageous.";
        assert_eq!(excerpt(fearless, &terms(&["fear"])).as_deref(), Some("1. Free from fear; as fearless of death; fearless of consequences."));
        // Nor is a match in the part of speech, the forms or the
        // pronunciation after it: the list falls back to the first sense.
        let lead = "LEAD, v.t. led. To cover with lead; to fit with lead.";
        assert_eq!(excerpt(lead, &terms(&["led"])), None);
        assert_eq!(first_sense(lead), "To cover with lead; to fit with lead.");
        assert_eq!(excerpt("WIS, v.t. pret. wist. To think; to suppose; to imagine.", &terms(&["wist"])), None);
        let fearfulness = "FEARFULNESS, n.\n1. Timorousness; timidity.\nA thing that makes a government despised, is fearfulness of, and mean compliances with, bold popular offenders.";
        assert_eq!(excerpt(fearfulness, &terms(&["fear"])), None);
        assert_eq!(first_sense(fearfulness), "Timorousness; timidity.");
        // "conversation manner": the paragraph with both.
        let conversation = "CONVERSATION, n.\n1. General course of manners; behavior; deportment; especially as it respects morals.\nLet your conversation be as becometh the gospel. Philippians 1.\nBe ye holy in all manner of conversation. 1 Peter 1.";
        assert_eq!(excerpt(conversation, &terms(&["conversation", "manner"])).as_deref(), Some("Be ye holy in all manner of conversation. 1 Peter 1."));
        // A phrase that begins with the headword is still the phrase.
        let quick_a = "QUICK, a. [L. vigeo.]\n1. Primarily, alive; living. Lev. 13.\nThe Lord Jesus Christ, who shall judge the quick and the dead. 2Tim. 4.";
        assert_eq!(
            excerpt(quick_a, &terms(&["quick", "and", "the", "dead"])).as_deref(),
            Some("The Lord Jesus Christ, who shall judge the quick and the dead. 2Tim. 4.")
        );
    }

    /// `entries` as the importer writes them, numbered from 1 in order, and
    /// `aliases` pointing at those numbers.
    fn fixture(entries: &[(&str, Option<&str>, &str)], aliases: &[(&str, i64)]) -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(crate::db::schema::CONTENT_MIGRATION_0028).unwrap();
        let mut insert = conn.prepare("INSERT INTO webster_entries (id, key, sort, word, pos, html, text) VALUES (?1, ?2, ?1, ?3, ?4, ?5, ?6)").unwrap();
        for (i, (key, pos, text)) in entries.iter().enumerate() {
            let word = format!("{}{}", key[..1].to_uppercase(), &key[1..]);
            let html: String = text.lines().map(|l| format!("<p>{l}</p>")).collect();
            insert.execute(params![i as i64 + 1, key, word, pos, html, text]).unwrap();
        }
        drop(insert);
        for (alias, id) in aliases {
            conn.execute("INSERT INTO webster_aliases (alias, entry_id) VALUES (?1, ?2)", params![alias, id]).unwrap();
        }
        conn
    }

    /// A handful of entries, as the importer writes them.
    fn dictionary() -> Connection {
        let entries: &[(&str, Option<&str>, &str)] = &[
            ("amongst", Some("prep."), "AMONGST, prep. [Gr. See Mingle.]\n1. In a general or primitive sense, mixed or mingled with."),
            ("brake", Some("pp."), "BRAKE, pp. of break. [See Break.]"),
            ("brake", Some("n."), "BRAKE, n. [L. erica.]\n1. Brake is a name given to fern."),
            ("break", Some("v.t."), "BREAK, v.t. pret. broke, [brake.obs.] pp. broke or broken.\n1. To part or divide by force."),
            ("break", Some("n."), "BREAK, n. A state of being open."),
            ("came", Some("pret."), "CAME, pret. of come, which see."),
            ("came", Some("n."), "CAME, n. A slender rod of cast lead."),
            ("come", Some("v.i."), "COME, v.i. pret. came; pp. come.\n1. To move towards; to advance nearer."),
            ("have", Some("v.t."), "HAVE, v.t. hav. pret. and pp. had.\n1. To possess; to hold in possession."),
            ("knew", Some("pret."), "KNEW, pret. of know."),
            ("know", Some("v.t."), "KNOW, v.t. no. pret. knew; pp. known.\n1. To perceive with certainty."),
            ("let", Some("v.t."), "LET, v.t. pret. and pp. let. Letted is obsolete.\n1. To permit; to allow.\n8. To hinder; to impede. 2 Thess. 2."),
            ("let", Some("n."), "LET, n. A retarding; hinderance; obstacle; impediment; delay."),
            ("made", Some("n."), "MADE, n. An earthworm."),
            ("make", Some("v.t."), "MAKE, v.t. pret. and pp. made.\n1. To compel; to constrain."),
            ("make", Some("n."), "MAKE, n. A companion; a mate."),
            ("prevent", Some("v.t."), "PREVENT, v.t. [L. proevenio, supra.]\n1. To go before; to precede.\n6. To hinder; to obstruct."),
            ("prevent", Some("v.i."), "PREVENT, v.i. To come before the usual time. [Not in use.]"),
            ("preventable", Some("a."), "PREVENTABLE, a. That may be prevented or hindered."),
            ("prevented", Some("pp."), "PREVENTED, pp. Hindered from happening or taking effect."),
            ("preventing", Some("ppr."), "PREVENTING, ppr. Going before.\n1. Hindering; obviating."),
            ("saw", Some("pret."), "SAW, pret. of see."),
            ("saw", Some("n."), "SAW, n. [See the Verb.]\n1. A cutting instrument."),
            ("see", Some("v.t."), "SEE, v.t. pret. saw; pp. seen.\n1. To perceive by the eye."),
            ("see", Some("n."), "SEE, n. The seat of episcopal power."),
            ("spake", Some("pret."), "SPAKE, pret. of speak; nearly obsolete."),
            ("speak", Some("v.i."), "SPEAK, v.i. pret. spoke.\n1. To utter words or articulate sounds."),
            ("speak", Some("v.t."), "SPEAK, v.t.\n1. To utter with the mouth."),
            ("wit", Some("v.i."), "WIT, v.i. [G., to know.] To know. This verb is used only in the infinitive, to wit."),
            ("wit", Some("n."), "WIT, n.\n1. Primarily, the intellect."),
            ("wot", Some("v.i."), "WOT, v.i. To know; to be aware."),
        ];
        fixture(entries, &[("among", 1)])
    }

    /// (matched, via, [(key, pos)]) of a lookup.
    fn look(conn: &Connection, word: &str) -> Option<(String, Via, Vec<(String, String)>)> {
        lookup(conn, word).unwrap().map(|l| {
            let entries = l.entries.iter().map(|e| (e.key.clone(), e.pos.clone().unwrap_or_default())).collect();
            (l.matched, l.via, entries)
        })
    }

    fn pairs(list: &[(&str, &str)]) -> Vec<(String, String)> {
        list.iter().map(|(k, p)| (k.to_string(), p.to_string())).collect()
    }

    #[test]
    fn prevented_finds_the_verb_before_its_participle() {
        let conn = dictionary();
        assert_eq!(
            look(&conn, "prevented,"),
            Some(("prevent".into(), Via::Base, pairs(&[("prevent", "v.t."), ("prevent", "v.i."), ("prevented", "pp.")])))
        );
        // A participle of more than one paragraph is its own entry first.
        assert_eq!(
            look(&conn, "preventing"),
            Some(("preventing".into(), Via::Exact, pairs(&[("preventing", "ppr."), ("prevent", "v.t."), ("prevent", "v.i.")])))
        );
        assert_eq!(look(&conn, "Prevent"), Some(("prevent".into(), Via::Exact, pairs(&[("prevent", "v.t."), ("prevent", "v.i.")]))));
    }

    #[test]
    fn king_james_forms_find_their_verbs() {
        let conn = dictionary();
        let base = |word: &str| look(&conn, word).map(|(matched, via, entries)| (matched, via, entries[0].clone()));
        assert_eq!(base("maketh"), Some(("make".into(), Via::Base, ("make".into(), "v.t.".into()))));
        // MAKE the mate is not what maketh means.
        assert_eq!(look(&conn, "maketh").unwrap().2, pairs(&[("make", "v.t.")]));
        assert_eq!(base("knowest"), Some(("know".into(), Via::Base, ("know".into(), "v.t.".into()))));
        assert_eq!(base("knewest"), Some(("know".into(), Via::Base, ("know".into(), "v.t.".into()))));
        assert_eq!(base("hath"), Some(("have".into(), Via::Base, ("have".into(), "v.t.".into()))));
        assert_eq!(
            look(&conn, "spake"),
            Some(("speak".into(), Via::Base, pairs(&[("speak", "v.i."), ("speak", "v.t."), ("spake", "pret.")])))
        );
        // Webster's MADE is an earthworm; the KJV's is make's.
        assert_eq!(look(&conn, "made"), Some(("make".into(), Via::Base, pairs(&[("make", "v.t."), ("made", "n.")]))));
        assert_eq!(
            look(&conn, "brake"),
            Some(("break".into(), Via::Base, pairs(&[("break", "v.t."), ("brake", "pp."), ("brake", "n.")])))
        );
        // wot is Webster's own entry, and wit the verb it is a form of.
        assert_eq!(look(&conn, "wot"), Some(("wit".into(), Via::Base, pairs(&[("wit", "v.i."), ("wot", "v.i.")]))));
        // A preterit beside a word of its own: the word first, then the verb.
        assert_eq!(
            look(&conn, "saw"),
            Some(("saw".into(), Via::Exact, pairs(&[("saw", "pret."), ("saw", "n."), ("see", "v.t.")])))
        );
        assert_eq!(look(&conn, "camest").unwrap().0, "come");
    }

    #[test]
    fn plain_words_aliases_and_misses() {
        let conn = dictionary();
        assert_eq!(look(&conn, "let"), Some(("let".into(), Via::Exact, pairs(&[("let", "v.t."), ("let", "n.")]))));
        assert_eq!(look(&conn, "Among"), Some(("amongst".into(), Via::Alias, pairs(&[("amongst", "prep.")]))));
        let among = lookup(&conn, "among").unwrap().unwrap();
        assert_eq!((among.query.as_str(), among.entries[0].aliases.clone()), ("among", vec!["among".to_string()]));
        assert_eq!(look(&conn, "xyzzy"), None);
        assert_eq!(look(&conn, "λόγος"), None);
        assert_eq!(look(&conn, ""), None);
    }

    /// The entries a review of the lookup against the whole KJV found it
    /// misreading, as the real dictionary has them (a line or two of each).
    fn misread_dictionary() -> Connection {
        let entries: &[(&str, Option<&str>, &str)] = &[
            ("art", None, "ART, The second person, indicative mode, present tense, of the substantive veb am."),
            ("art", Some("n."), "ART, n. [L. ars, artis.]\n1. The disposition or modification of things by human skill."),
            ("be", Some("v.i."), "BE, v.i. substantive verb, pret. was; pp. been.\n1. To exist."),
            ("bend", None, "BEND, [L.pando,pandare, to bend in]\n1. To strain, or to crook by straining."),
            ("bend", Some("v.i."), "BEND, v.i. To be crooked; to crook,or be curving."),
            ("bent", Some("pp."), "BENT, pp. Strained; incurvated; made crooked; inclined; subdued."),
            ("creat", Some("n."), "CREAT, n. In the manege, an usher to a riding master."),
            ("create", Some("v.t."), "CREATE, v.t. [L.]\n1. To produce; to bring into being from nothing."),
            ("despise", None, "DESPISE, .v.t.\n1. To contemn; to scorn; to disdain."),
            ("despised", Some("pp."), "DESPISED, pp. Contemned; disdained; abhorred."),
            ("eve", Some("n."), "EVE, n. The consort of Adam, and mother of the human race."),
            ("eve", Some("n."), "EVE, n. e'vn.\n1. The decline of the sun; the latter part or close of the day."),
            ("hast", None, "HAST, the second person singular of have, I have, thou hast, contracted from havest."),
            ("haste", Some("n."), "HASTE, n.\n1. Celerity of motion; speed; swiftness."),
            ("have", Some("v.t."), "HAVE, v.t. hav. pret. and pp. had.\n1. To possess."),
            ("rank", None, "RANK, the old pret. of ring. [Nearly obsolete.]"),
            ("ring", Some("v.t."), "RING, v.t. pret. and pp. rung.\nTo cause to sound."),
            ("sever", Some("v.t."), "SEVER, v.t.\n1. To part or divide by violence."),
            ("sever", Some("v.i."), "SEVER, v.i.\n1. To make a separation or distinction."),
            ("severe", Some("a."), "SEVERE, a. [L. severus.]\n1. Rigid; harsh."),
            ("sing", Some("v.i."), "SING, v. i. pret. sung, sang; pp. sung.\n1. To utter sounds with melodious modulations."),
            ("singe", Some("v.t."), "SINGE, v.t. sinj. To burn slightly or superficially."),
            ("singed", Some("pp."), "SINGED, pp. Burnt superficially."),
            ("sow", Some("n."), "SOW, n.\n1. The female of the hog kind or of swine."),
            ("sowed", Some("pp."), "SOWED, pp. Scattered on ground, as seed."),
            ("sowing", Some("ppr."), "SOWING, ppr. Scattering, as seed."),
            ("sowing", Some("n."), "SOWING, n. The act of scattering seed for propagation."),
            ("sown", Some("pp."), "SOWN, pp. Scattered, as seed."),
            ("speak", Some("v.i."), "SPEAK, v.i. pret. spoke.\n1. To utter words."),
            ("spoke", Some("pret."), "SPOKE, pret. of speak."),
            ("spoke", Some("n."), "SPOKE, n.\n1. The radius or ray of a wheel."),
            ("wast", None, "WAST, past tense of the substantive verb, in the second person; as, thou wast."),
            ("waste", Some("v.t."), "WASTE, v.t.\n1. To diminish by gradual dissipation or loss."),
            ("waste", Some("n."), "WASTE, n.\n1. The act of squandering."),
            ("wasted", Some("pp."), "WASTED, pp.\n1. Expended without necessity or use.\n2. Diminished; dissipated."),
        ];
        fixture(entries, &[("even", 12)])
    }

    #[test]
    fn a_stem_that_is_another_words_form_does_not_take_the_lookup() {
        let conn = misread_dictionary();
        // Not HAVE through HAST; this copy has no HASTE, v., so the noun.
        assert_eq!(look(&conn, "hasted"), Some(("haste".into(), Via::Base, pairs(&[("haste", "n.")]))));
        assert_eq!(look(&conn, "hasteth").unwrap().0, "haste");
        assert_eq!(look(&conn, "hasting").unwrap().0, "haste");
        assert_eq!(look(&conn, "wasteth"), Some(("waste".into(), Via::Base, pairs(&[("waste", "v.t.")]))));
        // A participle of its own has the verb it is of after it: WASTE, not BE.
        assert_eq!(look(&conn, "wasted"), Some(("wasted".into(), Via::Exact, pairs(&[("wasted", "pp."), ("waste", "v.t.")]))));
        assert_eq!(look(&conn, "arts"), Some(("art".into(), Via::Base, pairs(&[("art", "n.")]))));
        assert_eq!(look(&conn, "spokes"), Some(("spoke".into(), Via::Base, pairs(&[("spoke", "n.")]))));
    }

    #[test]
    fn a_base_form_is_taken_for_the_kind_of_word_the_ending_makes() {
        let conn = misread_dictionary();
        assert_eq!(look(&conn, "severed"), Some(("sever".into(), Via::Base, pairs(&[("sever", "v.t."), ("sever", "v.i.")]))));
        assert_eq!(look(&conn, "createth"), Some(("create".into(), Via::Base, pairs(&[("create", "v.t.")]))));
        // No SOW, v.: its participles, not the hog.
        let sow = pairs(&[("sowed", "pp."), ("sowing", "ppr."), ("sown", "pp.")]);
        assert_eq!(look(&conn, "soweth"), Some(("sowed".into(), Via::Base, sow.clone())));
        assert_eq!(look(&conn, "sowest"), Some(("sowed".into(), Via::Base, sow)));
        // -nged after an i is singe's, and the participle's own line follows.
        assert_eq!(look(&conn, "singed"), Some(("singe".into(), Via::Base, pairs(&[("singe", "v.t."), ("singed", "pp.")]))));
        // A verb the dump gave no part of speech, and a participle that names none.
        assert_eq!(look(&conn, "despised"), Some(("despise".into(), Via::Base, pairs(&[("despise", ""), ("despised", "pp.")]))));
        assert_eq!(look(&conn, "bent"), Some(("bend".into(), Via::Base, pairs(&[("bend", ""), ("bend", "v.i."), ("bent", "pp.")]))));
    }

    #[test]
    fn what_this_copy_lacks_is_said_rather_than_passed_off() {
        let conn = misread_dictionary();
        let even = lookup(&conn, "even").unwrap().unwrap();
        assert_eq!((even.matched.as_str(), even.via, even.entries.len()), ("eve", Via::Alias, 1));
        assert!(even.note.as_deref().is_some_and(|n| n.contains("EVEN") && n.contains("EVE,")), "{:?}", even.note);
        // RANK stays RANK -- the one line it has -- with RING after it, and the note.
        assert_eq!(look(&conn, "rank"), Some(("rank".into(), Via::Exact, pairs(&[("rank", ""), ("ring", "v.t.")]))));
        assert!(lookup(&conn, "rank").unwrap().unwrap().note.is_some_and(|n| n.contains("RANK")));
        assert!(lookup(&conn, "ranks").unwrap().unwrap().note.is_some());
        // And nothing at all where there is nothing to say, not even a null.
        let sever = lookup(&conn, "sever").unwrap().unwrap();
        assert_eq!(sever.note, None);
        assert!(serde_json::to_value(&sever).unwrap().get("note").is_none());
    }

    #[test]
    fn a_group_beside_a_term_is_joined_with_and() {
        assert_eq!(and_beside_groups("\"love\"* (\"joy\"* OR \"peace\"*)"), "\"love\"* AND (\"joy\"* OR \"peace\"*)");
        assert_eq!(and_beside_groups("(\"a\" OR \"b\") \"x\""), "(\"a\" OR \"b\") AND \"x\"");
        assert_eq!(and_beside_groups("(\"a\") (\"b\")"), "(\"a\") AND (\"b\")");
        assert_eq!(and_beside_groups("(\"a\") NEAR(\"b\" \"c\", 5)"), "(\"a\") AND NEAR(\"b\" \"c\", 5)");
        assert_eq!(and_beside_groups("\"NEAR\"* (\"a\"* \"b\"*)"), "\"NEAR\"* AND (\"a\"* \"b\"*)");
        // What FTS5 already takes is left as it is, brackets inside a phrase too.
        for expr in [
            "",
            "\"love\"* \"joy\"*",
            "(\"a\" OR \"b\")",
            "\"x\" NOT (\"a\" \"b\")",
            "\"x\"* NEAR(\"a\" \"b\", 5)",
            "NEAR(\"a\" \"b\", 5) \"x\"",
            "\"a (b\" \"c\"",
            "\"say \"\"hi\"\" (x)\" \"y\"",
        ] {
            assert_eq!(and_beside_groups(expr), expr);
        }
    }

    #[test]
    fn search_language_in_the_box_is_read_as_the_search_language() {
        assert_eq!(headword_query("fear -god"), None);
        assert_eq!(headword_query("+LORD"), None);
        assert_eq!(headword_query("love ~ God"), None);
        assert_eq!(headword_query("go before").as_deref(), Some("go before"));
        assert_eq!(headword_query("Fellow-Servant").as_deref(), Some("fellow-servant"));
        let conn = dictionary();
        // Taken as plain words, "go -before" was the phrase "go before", and
        // PREVENT and PREVENTING -- which have it -- came first.
        let hits = search(&conn, "go -before", 20).unwrap();
        assert!(!hits.iter().any(|h| h.key.starts_with("prevent")), "{hits:#?}");
        // A group after a word: the entries with hinder* and one of the two
        // (LET the noun by "hinderance" and "impediment").
        let hits = search(&conn, "hinder (obstruct OR impede)", 20).unwrap();
        let mut listed: Vec<(&str, Option<&str>)> = hits.iter().map(|h| (h.key.as_str(), h.pos.as_deref())).collect();
        listed.sort();
        assert_eq!(listed, [("let", Some("n.")), ("let", Some("v.t.")), ("prevent", Some("v.t."))]);
        // Nothing typed fails the search.
        for q in ["NEAR(a b)", "love (joy OR peace) -hate", "(((", ")", "\"", "*", "-", "a\"b", "^a", ":", "in:psalms", "G26", "/abc/", "NOT", "OR", "\"***\"", "()", "é"] {
            assert!(search(&conn, q, 20).is_ok(), "{q}");
        }
    }

    #[test]
    fn search_puts_headwords_first() {
        let conn = dictionary();
        let hits = search(&conn, "prevent", 20).unwrap();
        let listed: Vec<(&str, Option<&str>)> = hits.iter().map(|h| (h.key.as_str(), h.pos.as_deref())).collect();
        assert_eq!(
            listed[..5],
            [("prevent", Some("v.t.")), ("prevent", Some("v.i.")), ("preventable", Some("a.")), ("prevented", Some("pp.")), ("preventing", Some("ppr."))]
        );
        assert_eq!(hits[0].snippet, "To go before; to precede.");
        // Then the body: "hinder" is in LET and PREVENT's text, not their headwords.
        let hinder = search(&conn, "hinder", 20).unwrap();
        assert!(hinder.iter().any(|h| h.key == "let" && h.snippet.contains("hinder")), "{hinder:#?}");
        // Words as a phrase before words apart: PREVENTABLE has "prevented"
        // and "hindered", but not "go before".
        let before = search(&conn, "go before", 20).unwrap();
        let listed: Vec<&str> = before.iter().map(|h| h.key.as_str()).collect();
        assert_eq!(listed[..2], ["preventing", "prevent"], "{before:#?}");
        assert_eq!(before[1].snippet, "1. To go before; to precede.");
        assert!(search(&conn, "   ", 20).unwrap().is_empty());
        assert_eq!(search(&conn, "prevent", 2).unwrap().len(), 2);
    }

    #[test]
    fn browse_runs_on_from_the_prefix_in_dictionary_order() {
        let conn = dictionary();
        let page = browse(&conn, "Prev", 4).unwrap();
        let listed: Vec<&str> = page.iter().map(|h| h.key.as_str()).collect();
        assert_eq!(listed, ["prevent", "prevent", "preventable", "prevented"]);
        assert_eq!(page[3].snippet, "Hindered from happening or taking effect.");
        let on = browse(&conn, "sp", 10).unwrap();
        assert_eq!(on.iter().map(|h| h.key.as_str()).collect::<Vec<_>>(), ["spake", "speak", "speak", "wit", "wit", "wot"]);
        assert_eq!(browse(&conn, "", 1).unwrap()[0].key, "amongst");
        let entry = get_entry(&conn, 1).unwrap().unwrap();
        assert_eq!((entry.key.as_str(), entry.aliases), ("amongst", vec!["among".to_string()]));
        assert_eq!(get_entry(&conn, 9999).unwrap(), None);
    }

    #[test]
    fn a_content_db_without_webster_answers_empty() {
        let conn = Connection::open_in_memory().unwrap();
        assert!(lookup(&conn, "prevent").unwrap().is_none());
        assert!(search(&conn, "prevent", 10).unwrap().is_empty());
        assert!(browse(&conn, "p", 10).unwrap().is_empty());
        assert!(get_entry(&conn, 1).unwrap().is_none());
    }
}

/// Against the real content.db:
/// `cargo test --release --lib webster::real -- --ignored --nocapture`,
/// after build_content_db has imported the dictionary.
#[cfg(test)]
mod real {
    use super::*;

    #[test]
    #[ignore]
    fn the_king_james_senses_are_found() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        let dir = std::env::temp_dir().join(format!("sojourner-real-webster-{}", std::process::id()));
        let conn = crate::db::open(&dir, &root.join("content").join("content.db")).unwrap();
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM webster_entries", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 69_580);
        // (word, the key it should be found under, how, words one of its entries must hold)
        let cases: &[(&str, &str, Via, &[&str])] = &[
            ("prevent", "prevent", Via::Exact, &["To go before"]),
            ("prevented", "prevent", Via::Base, &["To go before"]),
            ("conversation", "conversation", Via::Exact, &["manners", "behavior"]),
            ("charity", "charity", Via::Exact, &["love"]),
            ("let", "let", Via::Exact, &["hinder"]),
            ("quick", "quick", Via::Exact, &["living", "alive"]),
            ("meat", "meat", Via::Exact, &["Food in general"]),
            ("suffer", "suffer", Via::Exact, &["To allow", "permit"]),
            ("comprehend", "comprehend", Via::Exact, &["To contain"]),
            ("maketh", "make", Via::Base, &["To compel"]),
            ("knowest", "know", Via::Base, &["perceive"]),
            ("spake", "speak", Via::Base, &["To utter"]),
            ("hath", "have", Via::Base, &["To possess"]),
            ("saith", "say", Via::Base, &["To speak"]),
            ("goeth", "go", Via::Base, &["to move"]),
            ("doth", "do", Via::Base, &["To perform"]),
            ("wist", "wit", Via::Base, &["To know"]),
            ("slew", "slay", Via::Base, &["To kill"]),
            ("clave", "cleave", Via::Base, &["To stick"]),
            ("among", "amongst", Via::Alias, &["mingled"]),
            ("neighbour", "neighbor", Via::Base, &["near"]),
            // "Only he who now letteth will let" (2 Thess 2:7): hinders.
            ("letteth", "let", Via::Base, &["hinder"]),
            ("comprehended", "comprehend", Via::Base, &["To contain"]),
            // A stem that is another word's irregular form is not that word:
            // "Abraham hasted into the tent" (Gen 18:6) is not HAVE's.
            ("hasted", "haste", Via::Base, &["Celerity"]),
            ("hasteth", "haste", Via::Base, &["Celerity"]),
            ("wasteth", "waste", Via::Base, &["To diminish"]),
            ("arts", "art", Via::Base, &["human skill"]),
            ("spokes", "spoke", Via::Base, &["The radius"]),
            // The kind of word the ending makes, not the first key there is.
            ("severed", "sever", Via::Base, &["To part or divi"]),
            ("createth", "create", Via::Base, &["bring into being"]),
            ("breatheth", "breathe", Via::Base, &["To respire"]),
            ("clothest", "clothe", Via::Base, &["garments"]),
            // No SOW, v. in this copy: "whatsoever a man soweth" (Gal 6:7) is
            // shown by SOWED and SOWING, not the hog.
            ("soweth", "sowed", Via::Base, &["Scattered"]),
            ("singed", "singe", Via::Base, &["burn slightly"]),
            // DESPISE, .v.t.: a verb the dump gave no part of speech.
            ("despised", "despise", Via::Base, &["To contemn"]),
            ("beaten", "beat", Via::Base, &["To strike"]),
            ("bent", "bend", Via::Base, &["To strain"]),
            ("yourselves", "yourself", Via::Base, &["A word added to you"]),
            ("horsemen", "horseman", Via::Base, &["rider on horseback"]),
            ("graven", "grave", Via::Base, &["To carve"]),
            ("marvellous", "marvelous", Via::Base, &["Wonderful"]),
            ("defence", "defense", Via::Base, &["opposes attack"]),
            ("overthrew", "overthrow", Via::Base, &["To turn upside down"]),
            ("foretold", "foretell", Via::Base, &["To predict"]),
            ("stumblingblocks", "stumbling-block", Via::Base, &["cause of stumbling"]),
        ];
        // (word, a key its entries must include, one they must not)
        let also: &[(&str, &str, &str)] = &[("wasted", "waste", "be"), ("wasting", "waste", "be"), ("hasting", "haste", "have")];
        for (word, key, not) in also {
            let l = lookup(&conn, word).unwrap().expect(word);
            let keys: Vec<&str> = l.entries.iter().map(|e| e.key.as_str()).collect();
            assert!(keys.contains(key) && !keys.contains(not), "{word}: {keys:?}");
        }
        // Where this copy lacks the KJV's word, the lookup says so.
        for word in ["even", "rank", "ranks"] {
            let l = lookup(&conn, word).unwrap().expect(word);
            assert!(l.note.is_some(), "{word}: no note");
        }
        assert!(lookup(&conn, "prevent").unwrap().unwrap().note.is_none());
        for word in ["blessed", "created", "born", "saw", "made", "lives", "sepulchre", "shewed", "brake", "gat", "wot", "suffered", "quickened", "charity's"] {
            let l = lookup(&conn, word).unwrap();
            println!(
                "  {word} -> {:?}",
                l.map(|l| (l.matched, l.via, l.entries.iter().map(|e| format!("{} {}", e.key, e.pos.as_deref().unwrap_or("-"))).collect::<Vec<_>>()))
            );
        }
        let mut failures = Vec::new();
        for (word, key, via, words) in cases {
            let t = std::time::Instant::now();
            let found = lookup(&conn, word).unwrap();
            let elapsed = t.elapsed();
            match found {
                None => failures.push(format!("{word}: nothing")),
                Some(l) => {
                    let summary: Vec<String> = l.entries.iter().map(|e| format!("{} {}", e.key, e.pos.as_deref().unwrap_or("-"))).collect();
                    println!("{word} -> {} ({:?}) {summary:?} {elapsed:?}", l.matched, l.via);
                    if l.matched != *key || l.via != *via {
                        failures.push(format!("{word}: {} ({:?}), not {key} ({via:?})", l.matched, l.via));
                    }
                    let first_key = &l.entries[0].key;
                    let held = l.entries.iter().filter(|e| &e.key == first_key).any(|e| words.iter().any(|w| e.html.contains(w)));
                    if !held {
                        failures.push(format!("{word}: no {key} entry says any of {words:?}"));
                    }
                }
            }
        }
        let t = std::time::Instant::now();
        let hits = search(&conn, "prevent", 50).unwrap();
        println!("search prevent: {} hits {:?}; {:?}", hits.len(), t.elapsed(), hits.iter().take(8).map(|h| (&h.key, &h.snippet)).collect::<Vec<_>>());
        if hits.first().map(|h| h.key.as_str()) != Some("prevent") {
            failures.push("search: prevent is not first".into());
        }
        let t = std::time::Instant::now();
        let broad = search(&conn, "a", 50).unwrap();
        println!("search a: {} hits {:?}", broad.len(), t.elapsed());
        let body = search(&conn, "go before", 30).unwrap();
        println!("search 'go before': {:?}", body.iter().take(6).map(|h| (&h.key, &h.snippet)).collect::<Vec<_>>());
        if !body.iter().any(|h| h.key == "prevent") {
            failures.push("search 'go before' does not find prevent".into());
        }
        // A negated word is left out, not searched for as part of a phrase.
        let fear = search(&conn, "fear -god", 30).unwrap();
        if let Some(h) = fear.iter().find(|h| {
            let text: String = conn.query_row("SELECT text FROM webster_entries WHERE id = ?1", [h.id], |r| r.get(0)).unwrap();
            text.to_lowercase().split(|c: char| !c.is_ascii_alphabetic()).any(|w| w.starts_with("god"))
        }) {
            failures.push(format!("search 'fear -god' finds {} ({})", h.key, h.snippet));
        }
        // Brackets after a word, which FTS5 takes only with an AND; and
        // whatever else a reader may type fails nothing.
        let grouped = search(&conn, "love (joy OR peace)", 30).unwrap();
        println!("search 'love (joy OR peace)': {:?}", grouped.iter().take(5).map(|h| &h.key).collect::<Vec<_>>());
        if grouped.is_empty() {
            failures.push("search 'love (joy OR peace)' finds nothing".into());
        }
        for q in ["NEAR(a b)", "(love OR charity) God", "\"", "*", "-", "a\"b", "^a", ":", "in:psalms", "G26", "/abc/", "(((", ")", "NOT", "OR", "\"***\"", "()", "é"] {
            if let Err(e) = search(&conn, q, 30) {
                failures.push(format!("search {q:?}: {e}"));
            }
        }
        let page = browse(&conn, "charit", 5).unwrap();
        println!("browse charit: {:?}", page.iter().map(|h| (&h.key, &h.snippet)).collect::<Vec<_>>());
        if page.first().map(|h| h.key.as_str()) != Some("charitable") {
            failures.push("browse charit does not start at charitable".into());
        }
        // No list line says its part of speech again ("Abjectness n." over
        // "n. the state of being abject"), across the whole dictionary.
        let mut stmt = conn.prepare("SELECT word, pos, text FROM webster_entries WHERE pos IS NOT NULL").unwrap();
        let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?))).unwrap();
        let repeats: Vec<String> = rows
            .map(|r| r.unwrap())
            .filter_map(|(word, pos, text)| {
                let line = first_sense(&text);
                line.starts_with(&pos).then(|| format!("{word} {pos} -- {line}"))
            })
            .collect();
        if !repeats.is_empty() {
            failures.push(format!("{} list lines repeat the part of speech: {:?}", repeats.len(), &repeats[..repeats.len().min(10)]));
        }
        assert!(failures.is_empty(), "{failures:#?}");
    }

    /// Every word the KJV prints in lower case, looked up as a reader would
    /// double-click it: how many find nothing, the commonest of those, and
    /// -- with `WEBSTER_PROBE` set to a file path -- every word's result as a
    /// line of tab-separated text (word, occurrences, matched, via, entries),
    /// to read a change to the rules against the whole Bible rather than the
    /// handful of words the tests name.
    /// `cargo test --release --lib webster::real::every_kjv_word -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn every_kjv_word_is_looked_up() {
        use std::collections::HashMap;
        use std::io::Write;
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        let dir = std::env::temp_dir().join(format!("sojourner-real-webster-probe-{}", std::process::id()));
        let conn = crate::db::open(&dir, &root.join("content").join("content.db")).unwrap();
        let mut counts: HashMap<String, usize> = HashMap::new();
        {
            let mut stmt = conn
                .prepare("SELECT v.text FROM verses v JOIN translations t ON t.id = v.translation_id WHERE t.code = 'KJV'")
                .unwrap();
            let texts = stmt.query_map([], |r| r.get::<_, String>(0)).unwrap();
            for text in texts {
                let text = text.unwrap();
                for token in text.split(|c: char| !c.is_ascii_alphabetic() && c != '\'') {
                    // Lower case only: a word the text never prints so is a name.
                    if token.starts_with(|c: char| c.is_ascii_lowercase()) {
                        if let Some(word) = normalize_word(token) {
                            *counts.entry(word).or_default() += 1;
                        }
                    }
                }
            }
        }
        let mut words: Vec<(String, usize)> = counts.into_iter().collect();
        words.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
        let mut out = std::env::var_os("WEBSTER_PROBE").map(|p| std::io::BufWriter::new(std::fs::File::create(p).unwrap()));
        let (mut missed, mut missed_occurrences) = (Vec::new(), 0usize);
        let t = std::time::Instant::now();
        for (word, n) in &words {
            let found = lookup(&conn, word).unwrap();
            if let Some(out) = out.as_mut() {
                let line = match &found {
                    None => format!("{word}\t{n}\t-\t-\t"),
                    Some(l) => format!(
                        "{word}\t{n}\t{}\t{:?}\t{}",
                        l.matched,
                        l.via,
                        l.entries.iter().map(|e| format!("{} {}", e.key, e.pos.as_deref().unwrap_or("-"))).collect::<Vec<_>>().join(", ")
                    ),
                };
                writeln!(out, "{line}").unwrap();
            }
            if found.is_none() {
                missed_occurrences += n;
                missed.push(format!("{word} ({n})"));
            }
        }
        println!(
            "{} word types in {:?}: {} find nothing ({missed_occurrences} occurrences); the commonest: {}",
            words.len(),
            t.elapsed(),
            missed.len(),
            missed.iter().take(60).cloned().collect::<Vec<_>>().join(", ")
        );
    }
}
