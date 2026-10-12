//! Scripture references in text: "Jn 3:16", "Rom. viii. 28", "1 Cor 13:4-7",
//! "Ps 23", "in:rom8".
//!
//! Two callers with different needs share this. Search reads a single
//! reference the reader typed (`in:rom8`, a Go-to row), where a bare book
//! and chapter is the common case. The citation index reads the prose of a
//! whole library, where a false positive puts a paragraph beside the wrong
//! verse forever -- so [`find_references`] asks for a chapter *and* verse,
//! a book name it recognises, and a chapter that book has.
//!
//! Old books write chapters in Roman numerals ("Matt. xvi. 18", "Isa. liii.
//! 5") and follow one book with a run of chapter-and-verse pairs ("Rom. 8:28,
//! 30; 9:1"). Both are handled: a run carries its book forward until
//! something that is not a reference interrupts it.

use once_cell::sync::Lazy;
use regex::Regex;
use std::collections::HashMap;

/// Chapter counts, by `books.id` - 1, for rejecting "Jude 3:1".
pub const CHAPTER_COUNTS: [i64; 66] = [
    50, 40, 27, 36, 34, 24, 21, 4, 31, 24, 22, 25, 29, 36, 10, 13, 10, 42, 150, 31, 12, 8, 66, 52, 5, 48, 12, 14, 3,
    9, 1, 4, 7, 3, 3, 3, 2, 14, 4, 28, 16, 24, 21, 28, 16, 16, 13, 6, 6, 4, 4, 5, 3, 6, 4, 3, 1, 13, 5, 5, 3, 5, 1, 1,
    1, 22,
];

/// Every name and abbreviation a book goes by, lower-case, without spaces
/// or full stops. The first is the canonical name.
const NAMES: [&[&str]; 66] = [
    &["genesis", "gen", "ge", "gn"],
    &["exodus", "exod", "exo", "ex"],
    &["leviticus", "lev", "le", "lv"],
    &["numbers", "num", "nu", "nm", "numb"],
    &["deuteronomy", "deut", "deu", "de", "dt"],
    &["joshua", "josh", "jos", "jsh", "josue"],
    &["judges", "judg", "jdg", "jg", "jdgs"],
    &["ruth", "rut", "ru", "rth"],
    &["1samuel", "1sam", "1sa", "1sm", "1s", "1kingdoms"],
    &["2samuel", "2sam", "2sa", "2sm", "2s", "2kingdoms"],
    &["1kings", "1kgs", "1ki", "1kin", "1k", "3kingdoms"],
    &["2kings", "2kgs", "2ki", "2kin", "2k", "4kingdoms"],
    &["1chronicles", "1chron", "1chr", "1ch", "1paralipomenon", "1par"],
    &["2chronicles", "2chron", "2chr", "2ch", "2paralipomenon", "2par"],
    &["ezra", "ezr", "ez", "1esdras"],
    &["nehemiah", "neh", "ne", "2esdras"],
    &["esther", "esth", "est", "es"],
    &["job", "jb"],
    &["psalms", "psalm", "ps", "psa", "pss", "psm", "pslm"],
    &["proverbs", "prov", "pro", "prv", "pr", "prvbs"],
    &["ecclesiastes", "eccles", "eccl", "ecc", "ec", "qoh", "qoheleth", "ecclus"],
    &["songofsolomon", "songofsongs", "song", "sos", "so", "canticles", "cant", "canticleofcanticles", "sg", "sng"],
    &["isaiah", "isa", "is", "isaias"],
    &["jeremiah", "jer", "je", "jr", "jeremias"],
    &["lamentations", "lam", "la"],
    &["ezekiel", "ezek", "eze", "ezk", "ezechiel"],
    &["daniel", "dan", "da", "dn"],
    &["hosea", "hos", "ho", "osee"],
    &["joel", "jl", "joe"],
    &["amos", "am", "amo"],
    &["obadiah", "obad", "ob", "oba", "abdias"],
    &["jonah", "jon", "jnh", "jonas"],
    &["micah", "mic", "mi", "mc", "micheas"],
    &["nahum", "nah", "na"],
    &["habakkuk", "hab", "hb", "habacuc"],
    &["zephaniah", "zeph", "zep", "zp", "sophonias"],
    &["haggai", "hag", "hg", "aggeus"],
    &["zechariah", "zech", "zec", "zc", "zach", "zacharias"],
    &["malachi", "mal", "ml", "malachias"],
    &["matthew", "matt", "mat", "mt"],
    &["mark", "mrk", "mar", "mk", "mr"],
    &["luke", "luk", "lk", "lu"],
    &["john", "joh", "jhn", "jn", "jno"],
    &["acts", "act", "ac"],
    &["romans", "rom", "ro", "rm"],
    &["1corinthians", "1cor", "1co"],
    &["2corinthians", "2cor", "2co"],
    &["galatians", "gal", "ga"],
    &["ephesians", "eph", "ephes", "ep"],
    &["philippians", "phil", "php", "pp", "philip"],
    &["colossians", "col", "co"],
    &["1thessalonians", "1thess", "1thes", "1th"],
    &["2thessalonians", "2thess", "2thes", "2th"],
    &["1timothy", "1tim", "1ti", "1tm"],
    &["2timothy", "2tim", "2ti", "2tm"],
    &["titus", "tit", "ti"],
    &["philemon", "philem", "phm", "phlm", "phile"],
    &["hebrews", "heb", "he"],
    &["james", "jas", "jam", "jm"],
    &["1peter", "1pet", "1pe", "1pt", "1p"],
    &["2peter", "2pet", "2pe", "2pt", "2p"],
    &["1john", "1jn", "1jo", "1joh", "1jhn"],
    &["2john", "2jn", "2jo", "2joh", "2jhn"],
    &["3john", "3jn", "3jo", "3joh", "3jhn"],
    &["jude", "jud", "jd"],
    &["revelation", "rev", "re", "rv", "apocalypse", "apoc", "revelations"],
];

/// Normalised name -> book id.
static LOOKUP: Lazy<HashMap<String, i64>> = Lazy::new(|| {
    let mut map = HashMap::new();
    for (i, names) in NAMES.iter().enumerate() {
        for n in *names {
            map.insert(n.to_string(), i as i64 + 1);
        }
    }
    map
});

/// A canonical name for display ("1 Corinthians").
pub fn book_name(book_id: i64) -> Option<&'static str> {
    const DISPLAY: [&str; 66] = [
        "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth", "1 Samuel",
        "2 Samuel", "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah", "Esther", "Job",
        "Psalms", "Proverbs", "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah", "Lamentations", "Ezekiel",
        "Daniel", "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai",
        "Zechariah", "Malachi", "Matthew", "Mark", "Luke", "John", "Acts", "Romans", "1 Corinthians",
        "2 Corinthians", "Galatians", "Ephesians", "Philippians", "Colossians", "1 Thessalonians",
        "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews", "James", "1 Peter", "2 Peter",
        "1 John", "2 John", "3 John", "Jude", "Revelation",
    ];
    DISPLAY.get((book_id - 1) as usize).copied()
}

/// "1 Cor.", "I Cor", "First Corinthians", "1co" all become "1cor..." keys.
fn normalise_book(s: &str) -> String {
    let lower = s.trim().to_lowercase();
    let lower = lower.trim_end_matches('.');
    // Leading ordinal: "first", "second", "third", "iii", "ii", "i".
    let mut rest = lower;
    let mut prefix = "";
    for (word, digit) in [
        ("first ", "1"),
        ("second ", "2"),
        ("third ", "3"),
        ("1st ", "1"),
        ("2nd ", "2"),
        ("3rd ", "3"),
        ("iii ", "3"),
        ("ii ", "2"),
        ("i ", "1"),
        ("iii.", "3"),
        ("ii.", "2"),
        ("i.", "1"),
    ] {
        if let Some(r) = lower.strip_prefix(word) {
            prefix = digit;
            rest = r;
            break;
        }
    }
    let mut out = String::from(prefix);
    out.extend(rest.chars().filter(|c| c.is_alphanumeric()));
    out
}

/// The book a name or abbreviation means, if any.
pub fn lookup_book(name: &str) -> Option<i64> {
    let key = normalise_book(name);
    if key.is_empty() {
        return None;
    }
    LOOKUP.get(&key).copied()
}

/// A Roman numeral in lower or upper case ("xvi", "LIII"), up to 199.
pub fn roman_to_int(s: &str) -> Option<i64> {
    let s = s.to_ascii_lowercase();
    if s.is_empty() || !s.chars().all(|c| matches!(c, 'i' | 'v' | 'x' | 'l' | 'c')) {
        return None;
    }
    let value = |c: char| match c {
        'i' => 1,
        'v' => 5,
        'x' => 10,
        'l' => 50,
        'c' => 100,
        _ => 0,
    };
    let chars: Vec<char> = s.chars().collect();
    let mut total = 0i64;
    for i in 0..chars.len() {
        let v = value(chars[i]);
        if i + 1 < chars.len() && value(chars[i + 1]) > v {
            total -= v;
        } else {
            total += v;
        }
    }
    (total > 0 && total < 200).then_some(total)
}

fn number(s: &str) -> Option<i64> {
    s.parse::<i64>().ok().or_else(|| roman_to_int(s))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ScriptureRef {
    pub book_id: i64,
    pub chapter: i64,
    /// None for a whole chapter ("Ps 23").
    pub verse_start: Option<i64>,
    pub verse_end: Option<i64>,
}

/// A whole-input reference: "jn 3:16", "Genesis 1", "1 cor 13:4-7", "rom8",
/// "Psalm 23". A bare book name returns chapter 0, meaning the whole book.
pub fn parse_reference(input: &str) -> Option<ScriptureRef> {
    static RE: Lazy<Regex> = Lazy::new(|| {
        Regex::new(r"(?i)^\s*((?:[1-3]|i{1,3})?\s*[a-z][a-z .]*?)\.?\s*(\d+)?(?:\s*[:.]\s*(\d+)(?:\s*[-–]\s*(\d+))?)?\s*$").unwrap()
    });
    let caps = RE.captures(input)?;
    let book_id = lookup_book(caps.get(1)?.as_str())?;
    let chapter = caps.get(2).and_then(|m| m.as_str().parse().ok()).unwrap_or(0);
    if chapter > CHAPTER_COUNTS[(book_id - 1) as usize] {
        return None;
    }
    let verse_start = caps.get(3).and_then(|m| m.as_str().parse().ok());
    let verse_end = caps.get(4).and_then(|m| m.as_str().parse().ok()).or(verse_start);
    if verse_start.is_some() && chapter == 0 {
        return None;
    }
    Some(ScriptureRef { book_id, chapter, verse_start, verse_end })
}

/// One reference found in prose.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FoundRef {
    /// Byte range of the reference in the text.
    pub start: usize,
    pub end: usize,
    pub reference: ScriptureRef,
}

/// Every chapter-and-verse reference in a passage of prose.
///
/// A book name must be followed by a chapter and a verse. After one is
/// found, a run continues it: "Rom. 8:28, 30; 9:1, 2" gives four references,
/// the bare "30" taking the last chapter and "9:1" the last book.
pub fn find_references(text: &str) -> Vec<FoundRef> {
    // Book: optional ordinal, then a capitalised word (and "of Solomon"-style
    // continuations). Chapter/verse: Arabic or Roman, separated by ":" or
    // "." (the old style, "viii. 28"), optionally a range.
    static HEAD: Lazy<Regex> = Lazy::new(|| {
        Regex::new(
            r"\b((?:[1-3]|I{1,3}|First|Second|Third)\s?\.?\s?[A-Z][a-z]+|[A-Z][a-z]+(?:\s(?:of\s)?[A-Z][a-z]+){0,2})\.?\s+([0-9]{1,3}|[ivxlc]{1,7}|[IVXLC]{1,7})\s?[:.]\s?([0-9]{1,3})(?:\s?[-–]\s?([0-9]{1,3}))?(\s?ff?\.?)?",
        )
        .unwrap()
    });
    // What may follow in the same run: ", 30", "; 9:1", ", 9. 1-3", "; ix. 2".
    static TAIL: Lazy<Regex> = Lazy::new(|| {
        Regex::new(r"^\s?([,;])\s?(?:([0-9]{1,3}|[ivxlc]{1,7})\s?[:.]\s?)?([0-9]{1,3})(?:\s?[-–]\s?([0-9]{1,3}))?(?:\s?ff?\.?)?")
            .unwrap()
    });

    let mut out = Vec::new();
    let mut pos = 0;
    while let Some(caps) = HEAD.captures_at(text, pos) {
        let whole = caps.get(0).unwrap();
        pos = whole.end();
        let book_part = caps.get(1).unwrap().as_str();
        // Two-letter abbreviations ("He", "Is", "Am", "So") are ordinary
        // words far more often than they are books; in prose they count
        // only when written as abbreviations, with a full stop.
        let followed_by_stop = text[caps.get(1).unwrap().end()..].starts_with('.');
        if normalise_book(book_part).trim_start_matches(|c: char| c.is_ascii_digit()).len() <= 2 && !followed_by_stop {
            continue;
        }
        let Some(book_id) = lookup_book(book_part).or_else(|| {
            // "Song of Solomon" matched as three words; try the last word
            // alone for things like "See Matthew" swallowed as one phrase.
            book_part.rsplit(' ').next().and_then(lookup_book)
        }) else {
            continue;
        };
        let max_chapter = CHAPTER_COUNTS[(book_id - 1) as usize];
        let Some(chapter) = number(caps.get(2).unwrap().as_str()).filter(|&c| c >= 1 && c <= max_chapter) else {
            continue;
        };
        let Some(verse) = caps.get(3).and_then(|m| m.as_str().parse::<i64>().ok()).filter(|&v| v >= 1 && v <= 176)
        else {
            continue;
        };
        let verse_end = caps.get(4).and_then(|m| m.as_str().parse::<i64>().ok()).filter(|&e| e >= verse);
        // The book name's own start, skipping the word "See" or similar that
        // the three-word book pattern may have swallowed.
        let start = whole.start();
        out.push(FoundRef {
            start,
            end: whole.end(),
            reference: ScriptureRef { book_id, chapter, verse_start: Some(verse), verse_end: verse_end.or(Some(verse)) },
        });

        // The run.
        let mut chapter = chapter;
        let mut sep_ok;
        loop {
            let rest = &text[pos..];
            let Some(t) = TAIL.captures(rest) else { break };
            let sep = t.get(1).unwrap().as_str();
            let explicit_chapter = t.get(2).and_then(|m| number(m.as_str()));
            // A bare number after ";" is ambiguous (a new chapter?); only
            // accept it after ",".
            sep_ok = explicit_chapter.is_some() || sep == ",";
            if !sep_ok {
                break;
            }
            let c = explicit_chapter.unwrap_or(chapter);
            if c < 1 || c > max_chapter {
                break;
            }
            let Some(v) = t.get(3).and_then(|m| m.as_str().parse::<i64>().ok()).filter(|&v| v >= 1 && v <= 176) else {
                break;
            };
            let e = t.get(4).and_then(|m| m.as_str().parse::<i64>().ok()).filter(|&e| e >= v);
            let m = t.get(0).unwrap();
            // Skip the separator itself when recording the range.
            let s = pos + t.get(2).or(t.get(3)).unwrap().start();
            out.push(FoundRef {
                start: s,
                end: pos + m.end(),
                reference: ScriptureRef { book_id, chapter: c, verse_start: Some(v), verse_end: e.or(Some(v)) },
            });
            chapter = c;
            pos += m.end();
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_and_abbreviations() {
        assert_eq!(lookup_book("Jn"), Some(43));
        assert_eq!(lookup_book("1 Cor."), Some(46));
        assert_eq!(lookup_book("I Cor"), Some(46));
        assert_eq!(lookup_book("First Corinthians"), Some(46));
        assert_eq!(lookup_book("Song of Solomon"), Some(22));
        assert_eq!(lookup_book("Psalm"), Some(19));
        assert_eq!(lookup_book("Rev"), Some(66));
        assert_eq!(lookup_book("Fish"), None);
    }

    #[test]
    fn whole_input_references() {
        assert_eq!(
            parse_reference("Jn 3:16"),
            Some(ScriptureRef { book_id: 43, chapter: 3, verse_start: Some(16), verse_end: Some(16) })
        );
        assert_eq!(parse_reference("Ps 23"), Some(ScriptureRef { book_id: 19, chapter: 23, verse_start: None, verse_end: None }));
        assert_eq!(
            parse_reference("1 Jn 1:9-10"),
            Some(ScriptureRef { book_id: 62, chapter: 1, verse_start: Some(9), verse_end: Some(10) })
        );
        assert_eq!(parse_reference("rom8"), Some(ScriptureRef { book_id: 45, chapter: 8, verse_start: None, verse_end: None }));
        assert_eq!(parse_reference("psalms"), Some(ScriptureRef { book_id: 19, chapter: 0, verse_start: None, verse_end: None }));
        assert_eq!(parse_reference("Jude 3:1"), None);
        assert_eq!(parse_reference("love"), None);
    }

    #[test]
    fn prose_with_runs_and_roman_chapters() {
        let found = find_references("as Paul says (Rom. 8:28, 30; 9:1), and Matt. xvi. 18 teaches");
        let refs: Vec<_> = found.iter().map(|f| (f.reference.book_id, f.reference.chapter, f.reference.verse_start.unwrap())).collect();
        assert_eq!(refs, vec![(45, 8, 28), (45, 8, 30), (45, 9, 1), (40, 16, 18)]);
    }

    #[test]
    fn prose_rejects_what_is_not_a_reference() {
        assert!(find_references("In the year 1662, 3 men").is_empty());
        assert!(find_references("Chapter 3. 4 things").is_empty());
        assert!(find_references("Jude 30:1").is_empty());
    }

    #[test]
    fn numbered_books_in_prose() {
        let found = find_references("see 1 Cor. 13:4-7 and I John 4. 8");
        assert_eq!(found[0].reference, ScriptureRef { book_id: 46, chapter: 13, verse_start: Some(4), verse_end: Some(7) });
        assert_eq!(found[1].reference.book_id, 62);
        assert_eq!(found[1].reference.chapter, 4);
    }
}
