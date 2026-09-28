//! Strong's Hebrew and Greek dictionaries (see `reference/strongs/SOURCES.md`).
//!
//! Every Hebrew and Greek form is stored exactly as the source prints it --
//! the Hebrew headword with its vowel points, dagesh, shin/sin dots and
//! maqaf, the Greek with its accents and breathings. Nothing is stripped for
//! display. What a search compares is kept beside it, in `headword_plain` and
//! `transliteration_plain` (see CONTENT_MIGRATION_0029).

use once_cell::sync::Lazy;
use regex::Regex;
use rusqlite::{params, Connection};
use std::path::Path;

struct Entry {
    id: String,
    language: &'static str,
    original_word: String,
    transliteration: Option<String>,
    pronunciation: Option<String>,
    short_definition: Option<String>,
    definition: String,
    derivation: Option<String>,
    kjv_usage: Option<String>,
    /// The Greek forms printed after the headword, which open the derivation
    /// (see `alternate_forms`).
    #[cfg_attr(not(test), allow(dead_code))]
    forms: Option<String>,
}

/// Concatenates text content, resolving empty `<strongsref>`/`<see>` elements
/// (which carry no text of their own, just language+strongs attributes) into a
/// readable "H123"/"G123" reference instead of leaving a silent gap.
fn text_content(node: roxmltree::Node) -> String {
    let mut out = String::new();
    walk(node, &mut out);
    collapse(&out)
}

fn collapse(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn walk(node: roxmltree::Node, out: &mut String) {
    for child in node.children() {
        render(child, out);
    }
}

fn render(child: roxmltree::Node, out: &mut String) {
    if child.is_text() {
        out.push_str(child.text().unwrap_or(""));
        return;
    }
    if !child.is_element() {
        return;
    }
    match child.tag_name().name() {
        "strongsref" | "see" => {
            let prefix = match child.attribute("language") {
                Some(l) if l.eq_ignore_ascii_case("hebrew") => "H",
                _ => "G",
            };
            if let Some(num) = child.attribute("strongs") {
                out.push_str(prefix);
                out.push_str(num.trim_start_matches('0'));
            }
        }
        // A Greek word cited in the text (`from <greek unicode="ἁδρός"/>
        // (stout)`) is an empty element; its word is its `unicode`, the real
        // Greek the source gives in place of the e-text's transliteration.
        // Walking it for text found nothing, and G100 read "from (stout);".
        "greek" => {
            if let Some(word) = child.attribute("unicode") {
                out.push_str(word);
            }
        }
        // The pronunciation printed after a cited word is left out, as the
        // entry's own is kept in a column of its own.
        "pronunciation" => {}
        // The Hebrew dictionary names a word as an empty element. With a
        // number, `<w src="2616" lemma="חָסַד" xlit="châçad"/>`, it is an entry
        // of the dictionary, written "H2616 (châçad)" so it can be followed;
        // without "from H2616 (châçad)" read "from ;". Without one it is a
        // word the dictionary has no entry for -- H6440's "unused noun
        // <w lemma="פָּנֶה" xlit="pâneh"/>" -- written as its pointed form and
        // transliteration, "פָּנֶה (pâneh)"; skipped, H6440 read "an unused
        // noun ;". One names its word by pronunciation alone (H595,
        // "sometimes, aw-no'-kee"), which is then what is written.
        "w" => {
            let xlit = child.attribute("xlit");
            if let Some(num) = child.attribute("src") {
                out.push('H');
                out.push_str(num.trim_start_matches('0'));
                if let Some(x) = xlit {
                    out.push_str(&format!(" ({x})"));
                }
            } else if let Some(lemma) = child.attribute("lemma") {
                out.push_str(lemma);
                if let Some(x) = xlit {
                    out.push_str(&format!(" ({x})"));
                }
            } else if let Some(x) = xlit {
                out.push_str(x);
            } else if let Some(pos) = child.attribute("POS") {
                out.push_str(pos);
            } else {
                walk(child, out);
            }
        }
        // The Hebrew file's editor records each correction he made in a note
        // of its own ("lemma אי missing vowel, corrected to אִי"). Inside a
        // derivation it was being read as part of Strong's sentence:
        // "from H336 (ʼîy)lemma אי missing vowel, corrected to אִי and ...".
        "note" if child.attribute("type") == Some("x-typo") => {}
        _ => walk(child, out),
    }
}

/// Hebrew dictionary is OSIS-XML: <div type="glossary"><div type="entry"><w ID="H1" lemma=".." xlit=".."/>
/// <list><item>numbered senses</item></list><note type="exegesis|explanation|translation">...</note></div>
///
/// The headword is the `<w>`'s `lemma`, the pointed word Strong's prints
/// ("פָּנִים"). The element's own text is the same word stripped to its
/// consonants ("פנים"), which read as a different word beside its
/// transliteration and is in places simply wrong (H223's text is "איריה" for
/// אוּרִיָּה); it is not used. `POS` is Strong's pronunciation ("paw-neem'"),
/// the counterpart of the Greek file's `<pronunciation>`.
fn parse_hebrew(path: &Path) -> anyhow::Result<Vec<Entry>> {
    let text = std::fs::read_to_string(path)?;
    let doc = roxmltree::Document::parse(&text)?;
    let mut entries = Vec::new();

    for entry_div in doc
        .descendants()
        .filter(|n| n.is_element() && n.tag_name().name() == "div" && n.attribute("type") == Some("entry"))
    {
        let Some(w) = entry_div
            .children()
            .find(|n| n.is_element() && n.tag_name().name() == "w")
        else {
            continue;
        };
        let Some(id) = w.attribute("ID") else { continue };
        let original_word = w
            .attribute("lemma")
            .filter(|l| !l.trim().is_empty())
            .or_else(|| w.text())
            .unwrap_or("")
            .to_string();
        let transliteration = w.attribute("xlit").map(|s| s.to_string());
        let pronunciation = w.attribute("POS").filter(|p| !p.trim().is_empty()).map(|s| s.to_string());

        let senses: Vec<String> = entry_div
            .children()
            .find(|n| n.is_element() && n.tag_name().name() == "list")
            .map(|list| {
                list.children()
                    .filter(|n| n.is_element() && n.tag_name().name() == "item")
                    .map(text_content)
                    .collect()
            })
            .unwrap_or_default();

        let mut derivation = None;
        let mut short_definition = None;
        let mut kjv_usage = None;
        for note in entry_div
            .children()
            .filter(|n| n.is_element() && n.tag_name().name() == "note")
        {
            let content = text_content(note);
            match note.attribute("type") {
                Some("exegesis") => derivation = Some(content),
                Some("explanation") => short_definition = Some(content),
                Some("translation") => kjv_usage = Some(content),
                _ => {}
            }
        }

        let definition = if !senses.is_empty() {
            senses.join("; ")
        } else {
            short_definition.clone().unwrap_or_default()
        };

        entries.push(Entry {
            id: id.to_string(),
            language: "hebrew",
            original_word,
            transliteration,
            pronunciation,
            short_definition,
            definition,
            derivation,
            kjv_usage,
            forms: None,
        });
    }

    Ok(entries)
}

/// A clause that says where a word comes from or what form it is, not what
/// it means: it names a source ("from G1909", "of Hebrew origin", "probably
/// from..."), a form ("a prolonged form of a primary verb", "feminine of..."),
/// or how the forms are used ("which occurs only as an alternate in certain
/// tenses", "used only before G3303"). A meaning does not ("a deity",
/// "lonesome", "the eve", "to take", "properly, right").
static DERIVATION_CLAUSE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)^(?:\(|of\b|from\b|and\b|or\b|which\b|occurs\b|used\b|denoting\b|including\b|compare\b|probably\b|perhaps\b|apparently\b|possibly\b|akin\b|contracted\b|corresponding\b|feminine\b|masculine\b|neuter\b|plural\b|adverb\b|an? (?:primary|prolonged|reduplicated|strengthened|contracted|form|variation|derivative|compound|root|primitive|adverb|particle|\(middle voice\))\b|the (?:first|second|third|same)\b)",
    )
    .unwrap()
});

/// The clauses of a derivation: split at each semicolon outside brackets,
/// trimmed, the empty ones dropped. The file's brackets do not always
/// balance; a semicolon after an unclosed one is inside it.
fn derivation_clauses(derivation: &str) -> Vec<String> {
    let mut clauses = Vec::new();
    let mut current = String::new();
    let mut depth = 0i32;
    for ch in derivation.chars() {
        match ch {
            '(' => depth += 1,
            ')' => depth -= 1,
            _ => {}
        }
        if ch == ';' && depth <= 0 {
            clauses.push(std::mem::take(&mut current));
        } else {
            current.push(ch);
        }
    }
    clauses.push(current);
    clauses.into_iter().map(|c| c.trim().to_string()).filter(|c| !c.is_empty()).collect()
}

/// Strong's prints each Greek entry as one run: where the word comes from,
/// then what it means, then the King James renderings -- "θεός, of uncertain
/// affinity; a deity, especially (with 3588) the supreme Divinity;
/// figuratively, a magistrate; by Hebraism, very:--X exceeding, God". The
/// source file marks that run up as `<strongs_derivation>` and
/// `<strongs_def>`, and for eight entries closes the derivation too late,
/// carrying the start of the meaning into it: θεός's derivation was "of
/// uncertain affinity; a deity, especially (with G3588) the supreme
/// Divinity;" and its definition only the tail, "figuratively, a magistrate;
/// by Hebraism, very".
///
/// So the derivation is read clause by clause (Strong's separates them with
/// semicolons), and from the first clause after the first that says nothing
/// of where the word comes from (see [`DERIVATION_CLAUSE`]), the rest goes
/// back to the front of the definition, which then reads as Strong's wrote
/// it. The first clause always stays: it is where Strong's puts the word's
/// origin even when it is not one of the usual phrasings ("the definite
/// article", "an enclitic indefinite pronoun"). Checked against every Greek
/// entry: it moves the eight split in the wrong place (G2048, G2063, G2073,
/// G2316, G2537, G2570, G2983, G3741) and leaves every derivation that
/// rightly runs to several clauses as it is.
///
/// The markup also closes a derivation too early, in two ways, carrying its
/// end into the definition:
///
/// - inside a bracket, at a semicolon of the bracket's own (106 entries):
///   ἄγγελος's derivation was "from ἀγγέλλω (probably derived from G71;" and
///   its definition "compare G34) (to bring tidings); a messenger; ...". The
///   derivation runs on to the first semicolon after its brackets close,
///   "from ἀγγέλλω (probably derived from G71; compare G34) (to bring
///   tidings);", and the definition is "a messenger; ...". Where the file
///   never closes the bracket (G123, G1537, G2819, G5177, G5342) there is
///   nowhere to end it, and the entry is left as the file has it.
/// - after the first of two sources, at Strong's own semicolon (8 entries):
///   "from G2596;" and then "and ἧμαι (to sit; ...); to sit down". A
///   definition whose first clause goes on with "and" or "or" and names a
///   Strong's number or a Greek word is still naming sources, and that
///   clause goes back to the derivation. ("and yet, i.e. nevertheless",
///   G2543's meaning, names neither.)
fn split_greek(derivation: Option<String>, definition: String) -> (Option<String>, String) {
    let Some(derivation) = derivation.filter(|d| !d.trim().is_empty()) else {
        return (None, definition);
    };
    let clauses = derivation_clauses(&derivation);
    let meaning_at = clauses.iter().enumerate().position(|(i, c)| i > 0 && !DERIVATION_CLAUSE.is_match(c));
    let (mut derivation, mut definition) = match meaning_at {
        None => (derivation, definition.trim().to_string()),
        Some(at) => {
            let meaning = clauses[at..].join("; ");
            let meaning = meaning.strip_suffix(';').unwrap_or(&meaning).to_string();
            let definition = if definition.trim().is_empty() { meaning } else { format!("{meaning}; {}", definition.trim()) };
            (format!("{};", clauses[..at].join("; ")), definition)
        }
    };

    let open = bracket_depth(&derivation);
    if open > 0 {
        if let Some(end) = clause_end(&definition, open) {
            derivation = format!("{derivation} {}", &definition[..=end]);
            definition = definition[end + 1..].trim().to_string();
        }
    }
    if let Some(end) = clause_end(&definition, 0) {
        let head = &definition[..end];
        if (LINKED_SOURCE.is_match(head) && CITES_A_WORD.is_match(head)) || UNCERTAIN_SOURCE.is_match(head) {
            // G4434's file closes the bracket of "(to crouch; akin to G4422
            // and the alternate of G4098)" at the derivation's end, and opens
            // the definition with the bracket's close: the one bracket is
            // put back where Strong's closes it.
            if bracket_depth(head) < 0 && derivation.ends_with(");") {
                derivation.truncate(derivation.len() - 2);
                derivation.push(';');
            }
            derivation = format!("{derivation} {}", &definition[..=end]);
            definition = definition[end + 1..].trim().to_string();
        }
    }
    (Some(derivation), definition)
}

/// A clause that goes on naming sources: "and G1160", "or perhaps rather of
/// a base of G5167", "probably akin to the base of G1325" (G1156), "from an
/// obsolete equivalent χέρης" (G5501) -- when it names a number or a word.
static LINKED_SOURCE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)^(?:and|or|(?:probably |perhaps |apparently )?(?:akin to|from))\b").unwrap());
/// A source Strong's could not name: G2359's "of uncertain derivation", its
/// whole derivation after the genitive it prints.
static UNCERTAIN_SOURCE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)^of uncertain (?:derivation|affinity|origin)$").unwrap());

/// Fifteen entries have no `<strongs_def>`: the file puts the whole run in
/// `<strongs_derivation>`. Where that run starts with a source ("from",
/// "of ... origin", "adverb from") and goes on to a meaning, the two are
/// parted where the source ends -- after its last number or Greek word and
/// any bracket after that, at the comma, stop or colon there if any:
/// G814 "adverb from G813," / "irregularly (morally)", G1122 "from G1121." /
/// "a writer, ...", G2366 "from G2380 (in the sense of blowing)" / "a storm",
/// G5184 "of Hebrew origin (H6865):" / "Tyrus (i.e. Tsor), a place in
/// Palestine". Without this the card showed origin and meaning run together
/// as the definition. The rest (G302 "a primary particle, denoting a
/// supposition...", G976 "properly, the inner bark...") are Strong's whole
/// text for the word and are shown as its definition.
///
/// G2022 has nothing after its source at all: the file gives its meaning in
/// front of the renderings ("--to pour upon:--pour in."), and it goes back
/// to the definition.
fn split_run_on(derivation: Option<String>, definition: String, kjv: Option<String>) -> (Option<String>, String, Option<String>) {
    let Some(run) = derivation.as_deref().filter(|_| definition.trim().is_empty()) else {
        return (derivation, definition, kjv);
    };
    if !RUN_ON_SOURCE.is_match(run) {
        return (derivation, definition, kjv);
    }
    let Some(last) = CITES_A_WORD.find_iter(run).last() else {
        return (derivation, definition, kjv);
    };
    // Past the last word cited, out of any bracket it sits in, and past any
    // brackets that follow it.
    let mut end = last.end();
    let mut depth = bracket_depth(&run[..end]);
    let bytes: Vec<(usize, char)> = run[end..].char_indices().map(|(i, c)| (i + end, c)).collect();
    let mut k = 0;
    while k < bytes.len() {
        let (i, c) = bytes[k];
        match c {
            '(' => depth += 1,
            ')' => depth -= 1,
            c if depth <= 0 && !c.is_whitespace() && !unicode_normalization::char::is_combining_mark(c) => break,
            _ => {}
        }
        end = i + c.len_utf8();
        k += 1;
    }
    // The stop, comma, colon or semicolon that closes the source.
    let rest = &run[end..];
    let (source, meaning) = match rest.chars().next() {
        Some(c @ (',' | '.' | ':' | ';')) => (format!("{}{c}", run[..end].trim_end()), rest[c.len_utf8()..].trim()),
        _ => (run[..end].trim_end().to_string(), rest.trim()),
    };
    if !meaning.is_empty() {
        return (Some(source), meaning.to_string(), kjv);
    }
    if let Some(k) = kjv.as_deref() {
        if let Some(body) = k.strip_prefix("--") {
            if let Some(at) = body.find(":--") {
                return (Some(source), body[..at].trim().to_string(), Some(body[at..].to_string()));
            }
        }
    }
    (derivation, definition, kjv)
}

static RUN_ON_SOURCE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)^(?:adverb from|from|of \w+ origin)\b").unwrap());

/// The forms Strong's prints after the headword and before the derivation --
/// G3588 ὁ "including the feminine ἡ, and the neuter τό in all their
/// inflections", G3756 οὐ "also (before a vowel) οὐκ, and (before an
/// aspirate) οὐχ", G683 "or ἀπώθομαι" -- as loose text in the entry between
/// its `<pronunciation>` and `<strongs_derivation>`. Their own pronunciations
/// are left out as the headword's is. The e-text's conversion left debris in
/// two of these places, G3179's "UP9875: LEXEME NOT FOUND ..." where a word
/// should be, and G3378's pronunciation "may ook" as text; they are not read.
/// The hundred "Not Used" numbers (G2717, G3203-G3302) have no word to have
/// forms of.
fn alternate_forms(entry: roxmltree::Node) -> Option<String> {
    let mut out = String::new();
    let mut seen_head = false;
    for child in entry.children() {
        if child.is_element() {
            match child.tag_name().name() {
                "strongs_derivation" | "strongs_def" | "kjv_def" => break,
                "strongs" | "see" => continue,
                "greek" if !seen_head => {
                    seen_head = true;
                    continue;
                }
                _ => {}
            }
        }
        render(child, &mut out);
    }
    let text = tidy_greek_text(&collapse(&out), "");
    let text = text.trim_matches(|c: char| c == ',' || c == ';' || c.is_whitespace());
    let debris = text.contains("LEXEME NOT FOUND") || text == "may ook" || text == "Not Used";
    (!text.is_empty() && !debris).then(|| text.to_string())
}

/// A cited word's pronunciation is left out, and the space before it stayed
/// before the punctuation after it: G4572 read "σεαυτῷ , and accusative case
/// σεαυτόν , likewise". The space goes, as Strong's prints the word with its
/// comma. And eighteen entries print a number Strong's refers to as plain
/// text rather than as a reference ("the same as 1547", "(3563 implied)",
/// "from 2596 and 5368"); it is written as the reference it is, "G1547",
/// like every other. G5516, whose text is the numeral's values ("600, 60 and
/// 6"), is not touched.
fn tidy_greek_text(text: &str, id: &str) -> String {
    let text = SPACE_BEFORE_STOP.replace_all(text, "$1$2").into_owned();
    if id == "G5516" {
        return text;
    }
    BARE_NUMBER
        .replace_all(&text, |c: &regex::Captures| {
            let n: u32 = c[2].parse().unwrap_or(0);
            let next = c.get(3).map(|m| m.as_str()).unwrap_or("");
            if n == 0 || n > 5624 || next.starts_with(|ch: char| ch.is_alphanumeric() || ch == ':') {
                c[0].to_string()
            } else {
                format!("{}G{n}{next}", &c[1])
            }
        })
        .into_owned()
}

static SPACE_BEFORE_STOP: Lazy<Regex> = Lazy::new(|| Regex::new(r"([\p{Greek}\p{M}]) ([,;:.])").unwrap());
/// A number of three or four digits standing alone: not part of a reference
/// already ("G1547"), a verse ("7:16"), an ordinal ("22nd") or a count.
static BARE_NUMBER: Lazy<Regex> = Lazy::new(|| Regex::new(r"(^|[\s(,])(\d{3,4})(\S?)").unwrap());
/// A Strong's number or a Greek word.
static CITES_A_WORD: Lazy<Regex> = Lazy::new(|| Regex::new(r"[GH]\d+|[\x{0370}-\x{03FF}\x{1F00}-\x{1FFF}]").unwrap());

/// How many brackets `s` leaves open.
fn bracket_depth(s: &str) -> i32 {
    s.chars().fold(0, |d, c| match c {
        '(' => d + 1,
        ')' => d - 1,
        _ => d,
    })
}

/// The byte index of the first semicolon in `s` outside brackets, counting
/// `open` brackets as already open when it starts.
fn clause_end(s: &str, open: i32) -> Option<usize> {
    let mut depth = open;
    for (i, c) in s.char_indices() {
        match c {
            '(' => depth += 1,
            ')' => depth -= 1,
            ';' if depth <= 0 => return Some(i),
            _ => {}
        }
    }
    None
}

/// Greek dictionary uses a small custom DTD: <entry strongs="00001"><strongs>1</strongs>
/// <greek unicode=".." translit=".."/><pronunciation strongs=".."/><strongs_derivation>..</strongs_derivation>
/// <strongs_def>..</strongs_def><kjv_def>..</kjv_def></entry>
///
/// What Strong's prints after the King James renderings -- "Compare 2570.",
/// "Often used in composition to denote contrast, requital, substitution,
/// correspondence, etc.", G1511's own renderings carried past the closing
/// tag -- is loose text in the entry after `<kjv_def>`. It is the rest of the
/// same run and is kept with the renderings it follows. The `<see>` elements
/// beside it are the file's index of the numbers the text names, not text.
fn parse_greek(path: &Path) -> anyhow::Result<Vec<Entry>> {
    let text = std::fs::read_to_string(path)?;
    let sanitized = crate::import::thml::sanitize_thml_xml(&text);
    let doc = roxmltree::Document::parse(&sanitized)?;
    let mut entries = Vec::new();

    for entry in doc
        .descendants()
        .filter(|n| n.is_element() && n.tag_name().name() == "entry")
    {
        let Some(num_text) = entry
            .children()
            .find(|n| n.is_element() && n.tag_name().name() == "strongs")
            .and_then(|n| n.text())
        else {
            continue;
        };
        let Ok(num) = num_text.trim().parse::<u32>() else {
            continue;
        };
        let id = format!("G{num}");

        let greek = entry
            .children()
            .find(|n| n.is_element() && n.tag_name().name() == "greek");
        let original_word = greek.and_then(|g| g.attribute("unicode")).unwrap_or("").to_string();
        let transliteration = greek.and_then(|g| g.attribute("translit")).map(|s| s.to_string());

        let pronunciation = entry
            .children()
            .find(|n| n.is_element() && n.tag_name().name() == "pronunciation")
            .and_then(|n| n.attribute("strongs"))
            .map(|s| s.to_string());

        let forms = alternate_forms(entry);
        let derivation = entry
            .children()
            .find(|n| n.is_element() && n.tag_name().name() == "strongs_derivation")
            .map(text_content)
            .map(|d| tidy_greek_text(&d, &id));
        let mut definition = entry
            .children()
            .find(|n| n.is_element() && n.tag_name().name() == "strongs_def")
            .map(text_content)
            .map(|d| tidy_greek_text(&d, &id))
            .unwrap_or_default();
        let kjv = entry
            .children()
            .find(|n| n.is_element() && n.tag_name().name() == "kjv_def");
        let mut kjv_usage = kjv.map(text_content).map(|k| tidy_greek_text(&k, &id));

        // G1 closes its definition on the colon of Strong's ":--" and opens
        // the renderings on the dashes ("the first:" / "--Alpha."); the colon
        // goes back to the renderings it introduces.
        if let Some(k) = kjv_usage.as_mut() {
            if k.starts_with("--") && definition.ends_with(':') {
                definition.pop();
                definition = definition.trim_end().to_string();
                k.insert(0, ':');
            }
        }

        if let Some(kjv) = kjv {
            let mut after = String::new();
            for sib in kjv.next_siblings().skip(1) {
                if sib.is_element() && sib.tag_name().name() == "see" {
                    continue;
                }
                render(sib, &mut after);
            }
            let after = collapse(&after);
            // One entry (G3741) ends in a stray page number of the e-text.
            if !after.is_empty() && !after.chars().all(|c| c.is_ascii_digit()) {
                let after = tidy_greek_text(&after, &id);
                // G5104's renderings close their bracket after the tag: ")".
                let joiner = if after.starts_with([')', ',', '.', ';', ':']) { "" } else { " " };
                kjv_usage = Some(match kjv_usage {
                    Some(k) if !k.is_empty() => format!("{k}{joiner}{after}"),
                    _ => after,
                });
            }
        }

        let (derivation, definition, kjv_usage) = split_run_on(derivation, definition, kjv_usage);
        let (derivation, mut definition) = split_greek(derivation, definition);
        // The forms Strong's prints after the headword open the run, before
        // the derivation -- or, where there is none, the definition.
        // Read clause by clause again, the forms' clause would put the
        // derivation's first after it and could move it into the definition:
        // the split is made here, once, and a card shows the fields as they
        // are (see strongsText.ts).
        let derivation = match (forms.clone(), derivation) {
            (Some(f), Some(d)) => Some(format!("{f}; {d}")),
            (Some(f), None) => {
                definition = if definition.is_empty() { f } else { format!("{f}; {definition}") };
                None
            }
            (None, d) => d,
        };

        entries.push(Entry {
            id,
            language: "greek",
            original_word,
            transliteration,
            pronunciation,
            short_definition: None,
            definition,
            derivation,
            kjv_usage,
            forms,
        });
    }

    Ok(entries)
}

/// A transliteration as a reader types it: marks and the modifier letters
/// for aleph and ayin gone, the superscript vowels written as letters --
/// "ʼĕlôhîym" is "elohiym". Strong's writes a long vowel with its mater
/// ("îy", "ôw", "ûw"), which nobody types, so the form without them is
/// indexed too: "elohiym elohim". For search only; the column shown is
/// `transliteration`, untouched.
fn transliteration_plain(xlit: &str) -> String {
    use unicode_normalization::UnicodeNormalization;
    let base: String = xlit
        .nfd()
        .filter(|c| !matches!(*c as u32, 0x0300..=0x036F))
        .filter(|c| !matches!(c, 'ʼ' | 'ʻ' | '’' | '\''))
        .map(|c| match c {
            'ᵉ' => 'e',
            'ˢ' => 's',
            '-' => ' ',
            c => c,
        })
        .flat_map(char::to_lowercase)
        .collect();
    let base = collapse(&base);
    let short = base.replace("iy", "i").replace("ow", "o").replace("uw", "u");
    if short == base {
        base
    } else {
        format!("{base} {short}")
    }
}

pub fn import(conn: &mut Connection, hebrew_path: &Path, greek_path: &Path) -> anyhow::Result<usize> {
    let mut all = parse_hebrew(hebrew_path)?;
    all.extend(parse_greek(greek_path)?);
    let count = all.len();

    let tx = conn.transaction()?;
    {
        let mut stmt = tx.prepare(
            "INSERT INTO strongs_entries (id, language, original_word, transliteration, pronunciation, short_definition, definition, derivation, kjv_usage, headword_plain, transliteration_plain)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)
             ON CONFLICT(id) DO NOTHING",
        )?;
        for e in &all {
            stmt.execute(params![
                e.id,
                e.language,
                e.original_word,
                e.transliteration,
                e.pronunciation,
                e.short_definition,
                e.definition,
                e.derivation,
                e.kjv_usage,
                crate::plain::plain(&e.original_word),
                e.transliteration.as_deref().map(transliteration_plain).unwrap_or_default(),
            ])?;
        }
    }
    tx.commit()?;
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn repo_reference() -> std::path::PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("reference").join("strongs")
    }

    fn hebrew() -> &'static Vec<Entry> {
        static H: Lazy<Vec<Entry>> = Lazy::new(|| parse_hebrew(&repo_reference().join("hebrew.xml")).unwrap());
        &H
    }

    fn greek() -> &'static Vec<Entry> {
        static G: Lazy<Vec<Entry>> = Lazy::new(|| parse_greek(&repo_reference().join("greek.xml")).unwrap());
        &G
    }

    fn find<'a>(entries: &'a [Entry], id: &str) -> &'a Entry {
        entries.iter().find(|e| e.id == id).unwrap_or_else(|| panic!("{id} missing"))
    }

    #[test]
    fn hebrew_headwords_keep_their_points() {
        let h = hebrew();
        assert_eq!(h.len(), 8674);
        assert_eq!(find(h, "H6440").original_word, "\u{5e4}\u{5bc}\u{5b8}\u{5e0}\u{5b4}\u{5d9}\u{5dd}");
        assert_eq!(find(h, "H4325").original_word, "\u{5de}\u{5b7}\u{5d9}\u{5b4}\u{5dd}");
        assert_eq!(find(h, "H430").original_word, "\u{5d0}\u{5b1}\u{5dc}\u{5b9}\u{5d4}\u{5b4}\u{5d9}\u{5dd}");
        assert_eq!(find(h, "H3068").original_word, "\u{5d9}\u{5b0}\u{5d4}\u{5b9}\u{5d5}\u{5b8}\u{5d4}");
        assert_eq!(find(h, "H7225").original_word, "\u{5e8}\u{5b5}\u{5d0}\u{5e9}\u{5c1}\u{5b4}\u{5d9}\u{5ea}");
        assert_eq!(find(h, "H6437").original_word, "\u{5e4}\u{5bc}\u{5b8}\u{5e0}\u{5b8}\u{5d4}");
        assert_eq!(find(h, "H1008").original_word, "\u{5d1}\u{5bc}\u{5b5}\u{5d9}\u{5ea}\u{5be}\u{5d0}\u{5b5}\u{5dc}");
        assert_eq!(find(h, "H6440").pronunciation.as_deref(), Some("paw-neem'"));
        // Every headword is pointed: none is left as bare consonants.
        let bare: Vec<&str> = h
            .iter()
            .filter(|e| !e.original_word.chars().any(|c| matches!(c as u32, 0x05B0..=0x05BC | 0x05C1 | 0x05C2 | 0x05C7)))
            .map(|e| e.id.as_str())
            .collect();
        assert!(bare.is_empty(), "unpointed headwords: {bare:?}");
    }

    #[test]
    fn hebrew_derivations_name_their_words_and_leave_out_the_editors_notes() {
        let h = hebrew();
        assert_eq!(
            find(h, "H6440").derivation.as_deref(),
            Some("plural (but always as singular) of an unused noun \u{5e4}\u{5bc}\u{5b8}\u{5e0}\u{5b6}\u{5d4} (pâneh); from H6437 (pânâh));")
        );
        assert_eq!(find(h, "H350").derivation.as_deref(), Some("from H336 (ʼîy) and H3519 (kâbôwd); (there is) no glory, i.e. inglorious;"));
        assert_eq!(find(h, "H595").derivation.as_deref(), Some("sometimes, aw-no'-kee; a primitive pronoun;"));
        assert!(h.iter().all(|e| !e.derivation.as_deref().unwrap_or("").contains("corrected to")));
    }

    #[test]
    fn greek_definitions_start_where_strongs_meaning_does() {
        let g = greek();
        let theos = find(g, "G2316");
        assert_eq!(theos.derivation.as_deref(), Some("of uncertain affinity;"));
        assert_eq!(theos.definition, "a deity, especially (with G3588) the supreme Divinity; figuratively, a magistrate; by Hebraism, very");
        let eremos = find(g, "G2048");
        assert_eq!(eremos.derivation.as_deref(), Some("of uncertain affinity;"));
        assert_eq!(eremos.definition, "lonesome, i.e. (by implication) waste (usually as a noun, G5561 being implied)");
        let lambano = find(g, "G2983");
        assert_eq!(lambano.derivation.as_deref(), Some("a prolonged form of a primary verb, which is use only as an alternate in certain tenses;"));
        assert!(lambano.definition.starts_with("to take (in very many applications"));
        // Closed inside a bracket, and after the first of two sources.
        let angelos = find(g, "G32");
        assert_eq!(
            angelos.derivation.as_deref(),
            Some("from \u{1f00}\u{3b3}\u{3b3}\u{1f73}\u{3bb}\u{3bb}\u{3c9} (probably derived from G71; compare G34) (to bring tidings);")
        );
        assert_eq!(angelos.definition, "a messenger; especially an \"angel\"; by implication, a pastor");
        let kathemai = find(g, "G2521");
        assert_eq!(kathemai.derivation.as_deref(), Some("from G2596; and \u{1f27}\u{3bc}\u{3b1}\u{3b9} (to sit; akin to the base of G1476);"));
        assert_eq!(kathemai.definition, "to sit down; figuratively, to remain, reside");
        assert_eq!(find(g, "G2543").definition, "and yet, i.e. nevertheless");
        // A bracket the file never closes is left as it is.
        assert!(find(g, "G1537").derivation.as_deref().unwrap().ends_with("out (of place, time, or cause;"));
        let open: Vec<&str> = g
            .iter()
            .filter(|e| e.derivation.as_deref().is_some_and(|d| bracket_depth(d) > 0))
            .map(|e| e.id.as_str())
            .collect();
        // G3779's is in the forms before it: "or (before a vowel οὕτως".
        assert_eq!(open, ["G123", "G1537", "G2819", "G3779", "G5177", "G5342"]);
        // Untouched: a single clause, and derivations of several clauses.
        assert_eq!(find(g, "G746").derivation.as_deref(), Some("from G756;"));
        assert_eq!(find(g, "G26").definition, "love, i.e. affection or benevolence; specially (plural) a love-feast");
        assert_eq!(find(g, "G2532").derivation.as_deref(), Some("apparently, a primary particle, having a copulative and sometimes also a cumulative force;"));
        assert_eq!(find(g, "G1510").derivation.as_deref(), Some("the first person singular present indicative; a prolonged form of a primary and defective verb;"));
        assert_eq!(find(g, "G5108").derivation.as_deref(), Some("(including the other inflections); from G5104 and G3778;"));
        let own = |e: &Entry| match (&e.forms, &e.derivation) {
            (Some(f), Some(d)) => d.strip_prefix(&format!("{f}; ")).map(str::to_string),
            (_, d) => d.clone(),
        };
        let moved: Vec<&str> = g
            .iter()
            .filter(|e| own(e).is_some_and(|d| derivation_clauses(&d).len() > 1))
            .filter(|e| split_greek(own(e), e.definition.clone()).1 != e.definition)
            .map(|e| e.id.as_str())
            .collect();
        assert!(moved.is_empty(), "re-splitting moves more: {moved:?}");
    }

    #[test]
    fn greek_forms_after_the_headword_open_the_run() {
        let g = greek();
        let ho = find(g, "G3588");
        assert_eq!(ho.derivation.as_deref(), Some("including the feminine \u{1f21}, and the neuter \u{3c4}\u{1f79} in all their inflections; the definite article;"));
        assert_eq!(ho.definition, "the (sometimes to be supplied, at others omitted, in English idiom)");
        assert!(find(g, "G3756").derivation.as_deref().unwrap().starts_with("also (before a vowel) \u{3bf}\u{1f50}\u{3ba}, and (before an aspirate) \u{3bf}\u{1f50}\u{3c7}; "));
        assert!(find(g, "G683").derivation.as_deref().unwrap().starts_with("or \u{1f00}\u{3c0}\u{1f7d}\u{3b8}\u{3bf}\u{3bc}\u{3b1}\u{3b9}; from G575"));
        // Debris is not read, nor "Not Used".
        assert_eq!(find(g, "G3179").derivation.as_deref(), Some("from G3326 and G2476;"));
        assert_eq!(find(g, "G3378").derivation.as_deref(), Some("i.e. G3361 and G3756;"));
        assert!(g.iter().all(|e| !e.derivation.as_deref().unwrap_or("").contains("Not Used")));
    }

    #[test]
    fn greek_runs_the_file_leaves_in_one_field_are_parted_where_strongs_parts_them() {
        let g = greek();
        let pair = |id: &str| {
            let e = find(g, id);
            (e.derivation.clone().unwrap_or_default(), e.definition.clone())
        };
        assert_eq!(pair("G814"), ("adverb from G813,".into(), "irregularly (morally)".into()));
        assert_eq!(pair("G1122"), ("from G1121.".into(), "a writer, i.e. (professionally) scribe or secretary".into()));
        assert_eq!(pair("G1682"), ("of Chaldean origin (H426 with pronominal suffix)".into(), "my God".into()));
        assert_eq!(pair("G2366"), ("from G2380 (in the sense of blowing)".into(), "a storm".into()));
        assert_eq!(pair("G5184"), ("of Hebrew origin (H6865):".into(), "Tyrus (i.e. Tsor), a place in Palestine".into()));
        let pour = find(g, "G2022");
        assert_eq!(pour.definition, "to pour upon");
        assert_eq!(pour.kjv_usage.as_deref(), Some(":--pour in."));
        // The whole of Strong's text for the word stays whole.
        assert_eq!(pair("G302").1, "");
        // A first clause that is still a source goes back to the derivation.
        assert_eq!(pair("G1156"), ("from \u{3b4}\u{1f71}\u{3bd}\u{3bf}\u{3c2} (a gift); probably akin to the base of G1325;".into(), "a loan".into()));
        assert_eq!(pair("G2359").1, "hair");
        assert_eq!(pair("G4434").0, "from \u{3c0}\u{3c4}\u{1f7d}\u{3c3}\u{3c3}\u{3c9} (to crouch; akin to G4422 and the alternate of G4098);");
    }

    #[test]
    fn greek_text_is_tidied_where_the_file_left_it_ragged() {
        let g = greek();
        assert!(find(g, "G4572").derivation.as_deref().unwrap().contains("\u{3c3}\u{3b5}\u{3b1}\u{3c5}\u{3c4}\u{1ff7}, and accusative case"));
        assert_eq!(find(g, "G1548").definition, "the same as G1547");
        assert_eq!(find(g, "G5333").derivation.as_deref(), Some("the same as G5332"));
        assert!(find(g, "G4337").definition.contains("(G3563 implied)"));
        // Not a reference: the numeral's values, a count, a verse.
        assert!(find(g, "G5516").derivation.as_deref().unwrap().contains("600, 60 and 6"));
        assert!(find(g, "G2250").definition.contains("24 hours"));
        assert!(find(g, "G11").kjv_usage.as_deref().unwrap().contains("Acts 7:16"));
    }

    #[test]
    fn greek_words_cited_in_the_text_are_kept() {
        let g = greek();
        assert_eq!(find(g, "G100").derivation.as_deref(), Some("from \u{1f01}\u{3b4}\u{3c1}\u{1f79}\u{3c2} (stout);"));
        assert!(find(g, "G3501").derivation.as_deref().unwrap().contains("\u{3bd}\u{3b5}\u{1f79}\u{3c4}\u{3b5}\u{3c1}\u{3bf}\u{3c2}"));
    }

    #[test]
    fn greek_notes_after_the_renderings_are_kept_with_them() {
        let g = greek();
        let alpha = find(g, "G1");
        assert_eq!(alpha.definition, "the first letter of the alphabet; figuratively, only (from its use as a numeral) the first");
        assert!(alpha.kjv_usage.as_deref().unwrap().starts_with(":--Alpha. Often used (usually \u{1f04}\u{3bd}, before a vowel) also in composition (as a contraction from G427)"));
        assert_eq!(find(g, "G25").kjv_usage.as_deref(), Some(":--(be-)love(-ed). Compare G5368."));
        assert_eq!(find(g, "G3741").kjv_usage.as_deref(), Some(":--holy, mercy, shalt be."));
        assert!(g.iter().all(|e| !e.kjv_usage.as_deref().unwrap_or("").contains("G0")));
    }

    /// The whole import through the real schema: the pointed headword is what
    /// a card gets, and the lexicon search still finds it by bare letters,
    /// by a transliteration as typed, and in Greek without accents.
    #[test]
    fn imported_entries_are_found_by_what_readers_type() {
        let path = std::env::temp_dir().join(format!("strongs-import-test-{}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        let mut conn = crate::db::open_content_db(&path).unwrap();
        let dir = repo_reference();
        let n = import(&mut conn, &dir.join("hebrew.xml"), &dir.join("greek.xml")).unwrap();
        assert_eq!(n, 14298);
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM strongs_entries", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 14298);

        let entry = crate::db::queries::reference::get_strongs_entry(&conn, "H6440").unwrap().unwrap();
        assert_eq!(entry.original_word, "\u{5e4}\u{5bc}\u{5b8}\u{5e0}\u{5b4}\u{5d9}\u{5dd}");
        let ids = |q: &str| -> Vec<String> {
            crate::db::queries::reference::search_strongs(&conn, q, None, 20).unwrap().into_iter().map(|e| e.id).collect()
        };
        assert_eq!(ids("\u{5e4}\u{5e0}\u{5d9}\u{5dd}").first().map(String::as_str), Some("H6440"));
        assert_eq!(ids("\u{5e4}\u{5bc}\u{5b8}\u{5e0}\u{5b4}\u{5d9}\u{5dd}").first().map(String::as_str), Some("H6440"));
        assert!(ids("elohim").contains(&"H430".to_string()));
        assert!(ids("\u{3b8}\u{3b5}\u{3bf}\u{3c2}").contains(&"G2316".to_string()));
        assert!(ids("\u{3bb}\u{1f79}\u{3b3}\u{3bf}\u{3c2}").contains(&"G3056".to_string()));
        // As a keyboard types it: omicron with tonos, not the source's oxia.
        assert!(ids("\u{3bb}\u{3cc}\u{3b3}\u{3bf}\u{3c2}").contains(&"G3056".to_string()));

        // `lemma:` looks a Strong's entry up by its bare headword.
        let by_lemma: Vec<String> = conn
            .prepare("SELECT id FROM strongs_entries WHERE headword_plain = ?1")
            .unwrap()
            .query_map([crate::plain::plain("\u{5de}\u{5b7}\u{5d9}\u{5b4}\u{5dd}")], |r| r.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(by_lemma, vec!["H4325".to_string()]);
        drop(conn);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn transliterations_are_indexed_as_typed() {
        assert_eq!(transliteration_plain("ʼĕlôhîym"), "elohiym elohim");
        assert_eq!(transliteration_plain("Yᵉhôvâh"), "yehovah");
        assert_eq!(transliteration_plain("pânîym"), "paniym panim");
        assert_eq!(transliteration_plain("lógos"), "logos");
        assert_eq!(transliteration_plain("archḗ"), "arche");
    }
}
