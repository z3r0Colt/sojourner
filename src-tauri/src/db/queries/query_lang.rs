//! The search box's language, parsed once for every tab.
//!
//! What the reader types becomes three things:
//!
//! - an FTS5 `MATCH` expression, for every index in the app;
//! - checks FTS5 cannot make, done in Rust on the rows it returns: an exact
//!   word form (`+love` is not "loved"), case (`+LORD` is not "Lord"), and a
//!   regular expression;
//! - filters typed in the box (`in:psalms`, `t:kjv`, `G26`, `red:`,
//!   `has:note`, `since:2026-01`), so that a saved search carries its own
//!   scope.
//!
//! It also describes what it understood, one short phrase per part, for the
//! "parsed as" chip under the box: an operator the reader can see being read
//! is one they will trust.
//!
//! Syntax, all of it optional:
//!
//! | typed                    | means                                         |
//! |--------------------------|-----------------------------------------------|
//! | `love joy`               | both words (prefixes unless Whole words)      |
//! | `"in the beginning"`     | the phrase                                    |
//! | `love OR charity`        | either                                        |
//! | `-world`, `NOT world`    | without                                       |
//! | `-"the world"`           | without the phrase                            |
//! | `(love OR charity) -hate`| grouping                                      |
//! | `love ~5 God`            | within five words (`~` alone is ten)          |
//! | `lov*`                   | prefix even when Whole words is on            |
//! | `+love`                  | this exact form only                          |
//! | `+LORD`                  | exact form and case (any capital = cased)     |
//! | `/righteous(ness)?$/i`   | a regular expression (one translation)        |
//! | `in:psalms,ot,rom8`      | books, testaments, groups, a chapter          |
//! | `t:kjv,geneva`           | translations                                  |
//! | `c:henry`                | commentaries whose title contains the word    |
//! | `G26`, `H2617`           | verses whose Greek or Hebrew has that number  |
//! | `lemma:λόγος`            | verses with that lemma                        |
//! | `red:`                   | words of Christ                               |
//! | `has:note`, `has:highlight`, `color:amber` | the reader's own marks      |
//! | `since:2026-01`, `series:romans` | notes, sermons and illustrations      |

use serde::Serialize;

/// How words without an operator of their own are matched.
#[derive(Debug, Clone, Copy, Default)]
pub struct ParseOptions {
    /// A bare word matches as a prefix (`love` finds "lovely").
    pub prefix: bool,
    /// A bare word also matches its older spellings: the `-eth` and `-est`
    /// forms the Porter stemmer does not fold, and a short table of words
    /// the older translations spell differently (shew/show).
    pub older_spellings: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ExactTerm {
    pub word: String,
    pub case_sensitive: bool,
}

/// Filters typed in the box. Empty means "not given" throughout.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct Filters {
    pub books: Vec<i64>,
    /// `in:rom8`: a chapter, meaningful only with exactly one book.
    pub chapter: Option<i64>,
    pub testament: Option<String>,
    /// Upper-case translation codes.
    pub translations: Vec<String>,
    /// `t:all`.
    pub all_translations: bool,
    /// Lower-case fragments of commentary titles.
    pub commentaries: Vec<String>,
    /// "G26", "H2617" -- without leading zeros.
    pub strongs: Vec<String>,
    pub lemmas: Vec<String>,
    pub red: bool,
    pub has_note: bool,
    pub has_highlight: bool,
    pub color: Option<String>,
    /// "2026-01" or "2026-01-15": on or after.
    pub since: Option<String>,
    pub series: Option<String>,
}

impl Filters {
    /// True when a filter narrows which verses can match -- enough to list
    /// verses even with no words to search for.
    pub fn narrows_verses(&self) -> bool {
        !self.strongs.is_empty() || !self.lemmas.is_empty() || self.red || self.has_note || self.has_highlight || self.color.is_some()
    }
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct ParsedQuery {
    /// The FTS5 expression, empty when there are no words.
    pub fts: String,
    pub exact: Vec<ExactTerm>,
    /// The pattern as typed, flags applied (`(?i)` for a trailing `i`).
    pub regex: Option<String>,
    pub filters: Filters,
    /// "love near God · not: world · in Psalms · KJV".
    pub chips: Vec<String>,
    /// Words to mark in a result the index did not mark itself (the exact
    /// and regex paths build their own snippets).
    pub mark_words: Vec<String>,
    /// Filter words that were not understood (`in:narnia`), reported rather
    /// than silently dropped.
    pub unknown: Vec<String>,
    /// The words are Greek or Hebrew: searched by bare letters against
    /// `verses_plain`, since the reader rarely types accents or points.
    pub original_script: bool,
}

impl ParsedQuery {
    /// Something to search for at all.
    pub fn is_empty(&self) -> bool {
        self.fts.is_empty() && self.regex.is_none() && !self.filters.narrows_verses()
    }
    /// Rows the index returns still have to be checked in Rust.
    pub fn needs_post_filter(&self) -> bool {
        !self.exact.is_empty() || self.regex.is_some()
    }
}

/// Word pairs the older English translations spell differently. Each group
/// is every form a search for any one of them should find.
const SPELLINGS: &[&[&str]] = &[
    &["show", "shew"],
    &["showed", "shewed"],
    &["shows", "shews", "sheweth", "showeth"],
    &["showing", "shewing"],
    &["shown", "shewn"],
    &["has", "hath"],
    &["does", "doth", "doeth"],
    &["says", "saith"],
    &["music", "musick"],
    &["public", "publick"],
    &["cloak", "cloke"],
    &["jail", "gaol"],
    &["soap", "sope"],
    &["ankles", "ancles"],
    &["honor", "honour"],
    &["honored", "honoured"],
    &["color", "colour"],
    &["colors", "colours"],
    &["savior", "saviour"],
    &["neighbor", "neighbour"],
    &["neighbors", "neighbours"],
    &["labor", "labour"],
    &["labored", "laboured"],
    &["favor", "favour"],
    &["armor", "armour"],
    &["odor", "odour"],
    &["vapor", "vapour"],
    &["gray", "grey"],
    &["center", "centre"],
    &["mold", "mould"],
    &["plow", "plough"],
    &["plowman", "ploughman"],
    &["fulfill", "fulfil"],
    &["forever", "for ever"],
    &["spoke", "spake"],
    &["broke", "brake"],
];

/// Groups of books a reader names in `in:`.
const BOOK_GROUPS: &[(&str, &str, std::ops::RangeInclusive<i64>)] = &[
    ("pentateuch", "the Pentateuch", 1..=5),
    ("law", "the Law", 1..=5),
    ("torah", "the Law", 1..=5),
    ("history", "the Histories", 6..=17),
    ("histories", "the Histories", 6..=17),
    ("wisdom", "the Wisdom books", 18..=22),
    ("poetry", "the Wisdom books", 18..=22),
    ("prophets", "the Prophets", 23..=39),
    ("majorprophets", "the Major Prophets", 23..=27),
    ("minorprophets", "the Minor Prophets", 28..=39),
    ("gospels", "the Gospels", 40..=43),
    ("epistles", "the Epistles", 45..=65),
    ("letters", "the Epistles", 45..=65),
    ("pauline", "Paul's letters", 45..=57),
    ("paul", "Paul's letters", 45..=57),
    ("general", "the General Epistles", 58..=65),
];

/// Highlight colour names to the hex values `highlights.color` stores (see
/// `highlightColors.ts`, whose values must never change). "amber" is the
/// yellow; "underline" the underline.
pub const HIGHLIGHT_COLORS: &[(&str, &str)] = &[
    ("yellow", "#fef08a"),
    ("amber", "#fef08a"),
    ("green", "#bbf7d0"),
    ("blue", "#bfdbfe"),
    ("pink", "#fbcfe8"),
    ("orange", "#fed7aa"),
    ("underline", "#f59e0b"),
];

#[derive(Debug, Clone, PartialEq)]
enum Tok {
    Word { text: String, negate: bool },
    Phrase { text: String, negate: bool },
    Regex(String),
    Filter { key: String, value: String },
    Open,
    Close,
    Or,
    And,
    Not,
    Near(u32),
}

fn tokenize(query: &str) -> Vec<Tok> {
    let chars: Vec<char> = query.chars().collect();
    let mut i = 0;
    let mut out = Vec::new();
    let mut negate_quote = false;
    while i < chars.len() {
        let c = chars[i];
        if c.is_whitespace() {
            i += 1;
            continue;
        }
        if c == '(' {
            out.push(Tok::Open);
            i += 1;
            continue;
        }
        if c == ')' {
            out.push(Tok::Close);
            i += 1;
            continue;
        }
        if c == '-' && chars.get(i + 1) == Some(&'"') {
            negate_quote = true;
            i += 1;
            continue;
        }
        if c == '"' {
            let start = i + 1;
            let mut j = start;
            while j < chars.len() && chars[j] != '"' {
                j += 1;
            }
            let text: String = chars[start..j].iter().collect();
            if !text.trim().is_empty() {
                out.push(Tok::Phrase { text: text.trim().to_string(), negate: negate_quote });
            }
            negate_quote = false;
            i = (j + 1).min(chars.len());
            continue;
        }
        negate_quote = false;
        if c == '/' {
            // A regular expression runs to the next unescaped slash, then
            // takes optional flags.
            let mut j = i + 1;
            let mut pat = String::new();
            let mut closed = false;
            while j < chars.len() {
                if chars[j] == '\\' && j + 1 < chars.len() {
                    pat.push(chars[j]);
                    pat.push(chars[j + 1]);
                    j += 2;
                    continue;
                }
                if chars[j] == '/' {
                    closed = true;
                    break;
                }
                pat.push(chars[j]);
                j += 1;
            }
            if closed && !pat.is_empty() {
                j += 1;
                let mut flags = String::new();
                while j < chars.len() && chars[j].is_ascii_alphabetic() {
                    flags.push(chars[j]);
                    j += 1;
                }
                let pattern = if flags.contains('i') { format!("(?i){pat}") } else { pat };
                out.push(Tok::Regex(pattern));
                i = j;
                continue;
            }
        }
        if c == '~' {
            let mut j = i + 1;
            let mut digits = String::new();
            while j < chars.len() && chars[j].is_ascii_digit() {
                digits.push(chars[j]);
                j += 1;
            }
            out.push(Tok::Near(digits.parse().unwrap_or(10).clamp(1, 100)));
            i = j;
            continue;
        }
        // A word runs to whitespace or a parenthesis.
        let mut j = i;
        while j < chars.len() && !chars[j].is_whitespace() && chars[j] != '(' && chars[j] != ')' {
            j += 1;
        }
        let word: String = chars[i..j].iter().collect();
        i = j;
        match word.as_str() {
            "OR" => out.push(Tok::Or),
            "AND" => out.push(Tok::And),
            "NOT" => out.push(Tok::Not),
            _ => {
                if let Some((key, value)) = word.split_once(':') {
                    let key_l = key.to_ascii_lowercase();
                    if matches!(
                        key_l.as_str(),
                        "in" | "t" | "c" | "lemma" | "red" | "has" | "color" | "colour" | "since" | "series"
                    ) {
                        out.push(Tok::Filter { key: key_l, value: value.to_string() });
                        continue;
                    }
                }
                let (text, negate) = match word.strip_prefix('-') {
                    Some(rest) if !rest.is_empty() => (rest.to_string(), true),
                    _ => (word, false),
                };
                out.push(Tok::Word { text, negate });
            }
        }
    }
    out
}

fn quote(s: &str) -> String {
    format!("\"{}\"", s.replace('"', "\"\""))
}

/// "G0026" -> "G26"; None if it is not a Strong's number.
fn strongs_number(word: &str) -> Option<String> {
    let mut chars = word.chars();
    let letter = chars.next()?;
    if letter != 'G' && letter != 'H' {
        return None;
    }
    let digits: String = chars.as_str().to_string();
    if digits.is_empty() || digits.len() > 5 || !digits.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let n: u32 = digits.parse().ok()?;
    (n > 0).then(|| format!("{letter}{n}"))
}

/// The alternatives an older-spellings search adds for one word.
fn older_forms(word: &str, prefix: bool) -> Vec<String> {
    let lower = word.to_lowercase();
    let mut forms = Vec::new();
    for group in SPELLINGS {
        if group.contains(&lower.as_str()) {
            forms.extend(group.iter().filter(|w| **w != lower).map(|w| w.to_string()));
        }
    }
    // A prefix search for "love" already finds "loveth" and "lovest".
    if !prefix && lower.len() > 2 && lower.chars().all(|c| c.is_alphabetic()) {
        if lower.ends_with('e') {
            forms.push(format!("{lower}th"));
            forms.push(format!("{lower}st"));
        } else if !lower.ends_with("eth") && !lower.ends_with("est") {
            forms.push(format!("{lower}eth"));
            forms.push(format!("{lower}est"));
        }
    }
    forms
}

/// Adds one term (already an FTS5 fragment), honouring a pending NOT or NEAR.
fn emit(out: &mut Vec<String>, has_left: &mut [bool], term: String, negate: bool, near: &mut Option<u32>, near_term: Option<String>) {
    let left = *has_left.last().unwrap();
    if let (Some(distance), Some(this)) = (near.take(), near_term) {
        // NEAR joins two plain terms; after a group or a negation it cannot
        // apply, and the term is added as an ordinary one instead.
        if let Some(prev) = out.last().filter(|p| p.starts_with('"')).cloned() {
            out.pop();
            out.push(format!("NEAR({prev} {this}, {distance})"));
            return;
        }
    }
    if negate {
        if left {
            out.push(format!("NOT {term}"));
        }
        return;
    }
    out.push(term);
    *has_left.last_mut().unwrap() = true;
}

fn book_label(id: i64) -> String {
    crate::refparse::book_name(id).unwrap_or("?").to_string()
}

/// True for a Greek or Hebrew letter (or one of their marks).
pub fn is_original_script(c: char) -> bool {
    matches!(c as u32, 0x0370..=0x03FF | 0x1F00..=0x1FFF | 0x0590..=0x05FF)
}

/// The query with each run of Greek or Hebrew reduced to bare letters,
/// everything else (operators, filters, English) left as typed.
fn plain_original_runs(query: &str) -> String {
    let mut out = String::with_capacity(query.len());
    let mut run = String::new();
    for c in query.chars() {
        if is_original_script(c) || (!run.is_empty() && crate::plain::plain(&c.to_string()).is_empty()) {
            run.push(c);
        } else {
            if !run.is_empty() {
                out.push_str(&crate::plain::plain(&run));
                run.clear();
            }
            out.push(c);
        }
    }
    out.push_str(&crate::plain::plain(&run));
    out
}

/// Parses what the reader typed.
pub fn parse(query: &str, options: ParseOptions) -> ParsedQuery {
    if query.chars().any(is_original_script) {
        let mut q = parse_inner(&plain_original_runs(query), ParseOptions { older_spellings: false, ..options });
        q.original_script = true;
        return q;
    }
    parse_inner(query, options)
}

fn parse_inner(query: &str, options: ParseOptions) -> ParsedQuery {
    let star = if options.prefix { "*" } else { "" };
    let mut q = ParsedQuery::default();
    let mut out: Vec<String> = Vec::new();
    // Whether the current group has a positive term for NOT or OR to hang
    // from, one entry per open parenthesis plus the top level.
    let mut has_left: Vec<bool> = vec![false];
    let mut negate_next = false;
    let mut near: Option<u32> = None;
    let mut words_chip: Vec<String> = Vec::new();
    let mut not_chip: Vec<String> = Vec::new();
    // Whether any word actually took an older spelling, for the chip.
    let mut widened = false;

    let toks = tokenize(query);

    for tok in toks {
        match tok {
            Tok::Open => {
                out.push("(".into());
                has_left.push(false);
            }
            Tok::Close => {
                if has_left.len() > 1 {
                    has_left.pop();
                    if out.last().map(String::as_str) == Some("OR") {
                        out.pop();
                    }
                    if out.last().map(String::as_str) == Some("(") {
                        out.pop();
                    } else {
                        out.push(")".into());
                        *has_left.last_mut().unwrap() = true;
                    }
                }
            }
            Tok::Or => {
                if *has_left.last().unwrap() && out.last().map(String::as_str) != Some("OR") {
                    out.push("OR".into());
                    *has_left.last_mut().unwrap() = false;
                }
                negate_next = false;
            }
            Tok::And => {}
            Tok::Not => negate_next = true,
            Tok::Near(n) => {
                if *has_left.last().unwrap() {
                    near = Some(n);
                }
            }
            Tok::Regex(p) => {
                q.chips.push(format!("pattern /{}/", p.trim_start_matches("(?i)")));
                q.regex = Some(p);
            }
            Tok::Phrase { text, negate } => {
                let negate = negate || negate_next;
                negate_next = false;
                let term = quote(&text);
                let near_term = near.map(|_| term.clone());
                if near.is_some() {
                    words_chip.push(format!("near “{text}”"));
                } else if negate {
                    not_chip.push(format!("“{text}”"));
                } else {
                    words_chip.push(format!("“{text}”"));
                    q.mark_words.push(text.clone());
                }
                emit(&mut out, &mut has_left, term, negate, &mut near, near_term);
            }
            Tok::Filter { key, value } => {
                apply_filter(&mut q, &key, &value);
            }
            Tok::Word { text, negate } => {
                let negate = negate || negate_next;
                negate_next = false;
                if !negate {
                    if let Some(n) = strongs_number(&text) {
                        q.chips.push(format!("Strong's {n}"));
                        q.filters.strongs.push(n);
                        continue;
                    }
                }
                // `+word`: this form only.
                let (text, exact) = match text.strip_prefix('+') {
                    Some(rest) if !rest.is_empty() => (rest.to_string(), true),
                    _ => (text, false),
                };
                // `word*`: an explicit prefix.
                let (text, explicit_prefix) = match text.strip_suffix('*') {
                    Some(rest) if !rest.is_empty() => (rest.to_string(), true),
                    _ => (text, false),
                };
                if text.chars().all(|c| !c.is_alphanumeric()) {
                    continue;
                }
                let base = quote(&text);
                let term = if exact {
                    let case_sensitive = text.chars().any(|c| c.is_uppercase());
                    if !negate {
                        q.exact.push(ExactTerm { word: text.clone(), case_sensitive });
                        q.mark_words.push(text.clone());
                        words_chip.push(format!("exactly “{text}”"));
                    } else {
                        not_chip.push(text.clone());
                    }
                    base.clone()
                } else if explicit_prefix {
                    if !negate {
                        words_chip.push(format!("{text}…"));
                        q.mark_words.push(text.clone());
                    } else {
                        not_chip.push(format!("{text}…"));
                    }
                    format!("{base}*")
                } else {
                    let forms = if options.older_spellings && !negate && near.is_none() { older_forms(&text, options.prefix) } else { vec![] };
                    if negate {
                        not_chip.push(text.clone());
                    } else if near.is_some() {
                        words_chip.push(format!("near {text}"));
                        q.mark_words.push(text.clone());
                    } else {
                        words_chip.push(text.clone());
                        q.mark_words.push(text.clone());
                    }
                    if forms.is_empty() {
                        format!("{base}{star}")
                    } else {
                        widened = true;
                        let mut alts = vec![format!("{base}{star}")];
                        alts.extend(forms.iter().map(|f| quote(f)));
                        q.mark_words.extend(forms);
                        format!("({})", alts.join(" OR "))
                    }
                };
                let near_term = near.map(|_| if term.starts_with('(') { base.clone() + star } else { term.clone() });
                emit(&mut out, &mut has_left, term, negate, &mut near, near_term);
            }
        }
    }

    // Close what was left open, dropping a trailing OR in each.
    while has_left.len() > 1 {
        has_left.pop();
        if out.last().map(String::as_str) == Some("OR") {
            out.pop();
        }
        if out.last().map(String::as_str) == Some("(") {
            out.pop();
        } else {
            out.push(")".into());
        }
    }
    if out.last().map(String::as_str) == Some("OR") {
        out.pop();
    }
    // A NEAR whose second term never came leaves the first alone, which is
    // what emit already did.
    q.fts = out.join(" ").replace("( ", "(").replace(" )", ")");

    let mut chips = Vec::new();
    if !words_chip.is_empty() {
        chips.push(words_chip.join(" "));
    }
    if !not_chip.is_empty() {
        chips.push(format!("not: {}", not_chip.join(", ")));
    }
    if widened {
        chips.push("older spellings".into());
    }
    chips.append(&mut q.chips);
    q.chips = chips;
    q
}

fn apply_filter(q: &mut ParsedQuery, key: &str, value: &str) {
    let f = &mut q.filters;
    match key {
        "in" => {
            let mut labels = Vec::new();
            for part in value.split(',').map(str::trim).filter(|p| !p.is_empty()) {
                let key = part.to_lowercase().replace([' ', '-', '_'], "");
                match key.as_str() {
                    "ot" | "oldtestament" => {
                        f.testament = Some("OT".into());
                        labels.push("the Old Testament".to_string());
                        continue;
                    }
                    "nt" | "newtestament" => {
                        f.testament = Some("NT".into());
                        labels.push("the New Testament".to_string());
                        continue;
                    }
                    _ => {}
                }
                if let Some((_, label, range)) = BOOK_GROUPS.iter().find(|(k, _, _)| *k == key) {
                    f.books.extend(range.clone());
                    labels.push(label.to_string());
                    continue;
                }
                match crate::refparse::parse_reference(part) {
                    Some(r) => {
                        f.books.push(r.book_id);
                        if r.chapter > 0 {
                            f.chapter = Some(r.chapter);
                            labels.push(format!("{} {}", book_label(r.book_id), r.chapter));
                        } else {
                            labels.push(book_label(r.book_id));
                        }
                    }
                    None => q.unknown.push(format!("in:{part}")),
                }
            }
            f.books.sort_unstable();
            f.books.dedup();
            if f.books.len() != 1 {
                f.chapter = None;
            }
            if !labels.is_empty() {
                q.chips.push(format!("in {}", labels.join(", ")));
            }
        }
        "t" => {
            let codes: Vec<String> = value.split(',').map(|s| s.trim().to_uppercase()).filter(|s| !s.is_empty()).collect();
            // `t:all` is every translation, which is what no t: means too.
            if codes.iter().any(|c| c == "ALL") {
                q.chips.push("all translations".into());
                f.all_translations = true;
            } else if !codes.is_empty() {
                q.chips.push(codes.join(", "));
                f.translations.extend(codes);
            }
        }
        "c" => {
            let names: Vec<String> = value.split(',').map(|s| s.trim().to_lowercase()).filter(|s| !s.is_empty()).collect();
            if !names.is_empty() {
                q.chips.push(format!("commentary: {}", names.join(", ")));
                f.commentaries.extend(names);
            }
        }
        "lemma" => {
            if !value.trim().is_empty() {
                q.chips.push(format!("lemma {}", value.trim()));
                f.lemmas.push(value.trim().to_string());
            }
        }
        "red" => {
            f.red = true;
            q.chips.push("words of Christ".into());
        }
        "has" => match value.to_lowercase().as_str() {
            "note" | "notes" => {
                f.has_note = true;
                q.chips.push("verses with notes".into());
            }
            "highlight" | "highlights" | "highlighted" => {
                f.has_highlight = true;
                q.chips.push("highlighted verses".into());
            }
            other => q.unknown.push(format!("has:{other}")),
        },
        "color" | "colour" => {
            let c = value.to_lowercase();
            if let Some((_, hex)) = HIGHLIGHT_COLORS.iter().find(|(name, _)| *name == c) {
                q.chips.push(format!("highlighted {c}"));
                f.color = Some(hex.to_string());
            } else {
                q.unknown.push(format!("color:{value}"));
            }
        }
        "since" => {
            let v = value.trim();
            let ok = v.len() >= 4 && v.chars().all(|c| c.is_ascii_digit() || c == '-');
            if ok {
                q.chips.push(format!("since {v}"));
                f.since = Some(v.to_string());
            } else {
                q.unknown.push(format!("since:{v}"));
            }
        }
        "series" => {
            if !value.trim().is_empty() {
                q.chips.push(format!("series: {}", value.trim()));
                f.series = Some(value.trim().to_lowercase());
            }
        }
        _ => {}
    }
}

/// Marks every whole-word occurrence of `words` in `text` with the snippet
/// markers, case-insensitively unless a word is marked case-sensitive. Used
/// by the paths that check rows in Rust, which get no snippet from FTS5.
pub fn mark_exact(text: &str, exact: &[ExactTerm], also: &[String]) -> String {
    let mut spans: Vec<(usize, usize)> = Vec::new();
    for t in exact {
        spans.extend(find_word(text, &t.word, t.case_sensitive));
    }
    for w in also {
        if exact.iter().any(|t| t.word == *w) {
            continue;
        }
        spans.extend(find_word(text, w, false));
    }
    mark_spans(text, spans)
}

pub fn mark_spans(text: &str, mut spans: Vec<(usize, usize)>) -> String {
    spans.sort();
    let mut out = String::with_capacity(text.len() + 8);
    let mut at = 0;
    for (s, e) in spans {
        if s < at {
            continue;
        }
        out.push_str(&text[at..s]);
        out.push(super::search::MARK_START);
        out.push_str(&text[s..e]);
        out.push(super::search::MARK_END);
        at = e;
    }
    out.push_str(&text[at..]);
    out
}

/// Byte ranges of `word` in `text` standing as a whole word.
pub fn find_word(text: &str, word: &str, case_sensitive: bool) -> Vec<(usize, usize)> {
    if word.is_empty() {
        return vec![];
    }
    let (hay, needle) = if case_sensitive { (text.to_string(), word.to_string()) } else { (text.to_lowercase(), word.to_lowercase()) };
    // Lower-casing can change byte lengths for a few scripts; fall back to
    // no marks rather than slicing mid-character.
    if hay.len() != text.len() {
        return vec![];
    }
    let mut out = Vec::new();
    let mut from = 0;
    while let Some(i) = hay[from..].find(&needle) {
        let s = from + i;
        let e = s + needle.len();
        let before_ok = !hay[..s].chars().next_back().is_some_and(|c| c.is_alphanumeric());
        let after_ok = !hay[e..].chars().next().is_some_and(|c| c.is_alphanumeric());
        if before_ok && after_ok {
            out.push((s, e));
        }
        from = e;
    }
    out
}

/// Whether a row's text passes the checks FTS5 could not make.
pub fn passes(text: &str, q: &ParsedQuery, regex: Option<&regex::Regex>) -> bool {
    for t in &q.exact {
        if find_word(text, &t.word, t.case_sensitive).is_empty() {
            return false;
        }
    }
    if let Some(re) = regex {
        if !re.is_match(text) {
            return false;
        }
    }
    true
}

pub fn compile_regex(pattern: &str) -> anyhow::Result<regex::Regex> {
    regex::RegexBuilder::new(pattern)
        .size_limit(1 << 20)
        .build()
        .map_err(|e| anyhow::anyhow!("that pattern is not a regular expression the search understands: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fts(q: &str) -> String {
        parse(q, ParseOptions { prefix: true, older_spellings: false }).fts
    }
    fn whole(q: &str) -> String {
        parse(q, ParseOptions { prefix: false, older_spellings: false }).fts
    }

    #[test]
    fn plain_words_phrases_and_boolean() {
        assert_eq!(fts("love joy"), "\"love\"* \"joy\"*");
        assert_eq!(fts("\"in the beginning\""), "\"in the beginning\"");
        assert_eq!(fts("faith OR hope"), "\"faith\"* OR \"hope\"*");
        assert_eq!(fts("love -hate"), "\"love\"* NOT \"hate\"*");
        assert_eq!(fts("-hate"), "");
        assert_eq!(fts("love OR"), "\"love\"*");
        assert_eq!(fts("let not your heart"), "\"let\"* \"not\"* \"your\"* \"heart\"*");
    }

    #[test]
    fn grouping_near_and_negated_phrases() {
        assert_eq!(fts("(love OR charity) -world"), "(\"love\"* OR \"charity\"*) NOT \"world\"*");
        assert_eq!(fts("love -\"the world\""), "\"love\"* NOT \"the world\"");
        assert_eq!(whole("love ~5 God"), "NEAR(\"love\" \"God\", 5)");
        assert_eq!(whole("love ~ God"), "NEAR(\"love\" \"God\", 10)");
        assert_eq!(fts("((love"), "((\"love\"*))");
        assert_eq!(fts("love)"), "\"love\"*");
        assert_eq!(fts("()"), "");
    }

    #[test]
    fn exact_forms_and_prefixes() {
        let q = parse("+LORD", ParseOptions { prefix: true, older_spellings: false });
        assert_eq!(q.fts, "\"LORD\"");
        assert_eq!(q.exact, vec![ExactTerm { word: "LORD".into(), case_sensitive: true }]);
        let q = parse("+love", ParseOptions { prefix: false, older_spellings: false });
        assert!(!q.exact[0].case_sensitive);
        assert_eq!(whole("lov*"), "\"lov\"*");
    }

    #[test]
    fn filters_come_out_of_the_words() {
        let q = parse("in:psalms +LORD -\"LORD of hosts\" t:kjv", ParseOptions { prefix: true, older_spellings: false });
        assert_eq!(q.fts, "\"LORD\" NOT \"LORD of hosts\"");
        assert_eq!(q.filters.books, vec![19]);
        assert_eq!(q.filters.translations, vec!["KJV".to_string()]);
        let q = parse("in:rom8 love", ParseOptions::default());
        assert_eq!(q.filters.books, vec![45]);
        assert_eq!(q.filters.chapter, Some(8));
        let q = parse("in:gospels G26 red:", ParseOptions::default());
        assert_eq!(q.filters.books, vec![40, 41, 42, 43]);
        assert_eq!(q.filters.strongs, vec!["G26".to_string()]);
        assert!(q.filters.red);
        assert!(q.fts.is_empty());
        assert!(!q.is_empty());
        let q = parse("in:narnia love", ParseOptions::default());
        assert_eq!(q.unknown, vec!["in:narnia".to_string()]);
    }

    #[test]
    fn older_spellings_widen_bare_words() {
        let q = parse("shew", ParseOptions { prefix: false, older_spellings: true });
        assert!(q.fts.contains("\"show\""), "{}", q.fts);
        let q = parse("believe", ParseOptions { prefix: false, older_spellings: true });
        assert!(q.fts.contains("\"believeth\""), "{}", q.fts);
    }

    #[test]
    fn regex_and_marks() {
        let q = parse("/righteous(ness)?$/i", ParseOptions::default());
        assert_eq!(q.regex.as_deref(), Some("(?i)righteous(ness)?$"));
        let marked = mark_exact("The LORD is my Lord", &[ExactTerm { word: "LORD".into(), case_sensitive: true }], &[]);
        assert_eq!(marked.replace(super::super::search::MARK_START, "[").replace(super::super::search::MARK_END, "]"), "The [LORD] is my Lord");
    }
}
