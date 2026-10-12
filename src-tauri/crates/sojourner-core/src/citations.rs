//! Scripture references in a book's text, for "cited in your library".
//!
//! Every chapter-and-verse reference `refparse::find_references` finds in a
//! book's extracted text becomes one citation: the passage, where in the text
//! it stands, a stretch of the sentence around it to show, and the reference
//! exactly as printed with which occurrence of that printing it is -- so the
//! reader can open the book and find that very spot ("Matt. xvi. 18", the
//! third time it appears), which a character offset into extracted text
//! could never do reliably in a rendered page.

use crate::refparse::find_references;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Citation {
    pub book_id: i64,
    pub chapter: i64,
    pub verse_start: i64,
    pub verse_end: i64,
    /// Byte offset of the reference in the text.
    pub offset: usize,
    /// The reference as printed ("Matt. xvi. 18").
    pub label: String,
    /// Which occurrence of `label` in the text this is (0-based).
    pub occurrence: i64,
    /// Up to a couple of hundred characters of the sentence around it.
    pub context: String,
}

const CONTEXT_BEFORE: usize = 160;
const CONTEXT_AFTER: usize = 80;

fn floor_boundary(s: &str, mut i: usize) -> usize {
    while i > 0 && !s.is_char_boundary(i) {
        i -= 1;
    }
    i
}

fn ceil_boundary(s: &str, mut i: usize) -> usize {
    while i < s.len() && !s.is_char_boundary(i) {
        i += 1;
    }
    i
}

/// The sentence around `[start, end)`, cut at a sentence end or a word.
fn context(text: &str, start: usize, end: usize) -> String {
    let from = floor_boundary(text, start.saturating_sub(CONTEXT_BEFORE));
    let to = ceil_boundary(text, (end + CONTEXT_AFTER).min(text.len()));
    let before = &text[from..start];
    // Start after the last sentence end in the window, else at a word.
    let cut = before
        .rfind(|c| c == '.' || c == '?' || c == '!' || c == '\n')
        .filter(|&i| i + 2 < before.len() && i > 20)
        .map(|i| from + i + 1)
        .unwrap_or_else(|| before.find(' ').map(|i| from + i + 1).unwrap_or(from));
    let after = &text[end..to];
    let stop = after
        .find(['.', '?', '!', '\n'])
        .map(|i| end + i + 1)
        .unwrap_or_else(|| after.rfind(' ').map(|i| end + i).unwrap_or(to));
    let s = text[cut..stop.max(end)].split_whitespace().collect::<Vec<_>>().join(" ");
    let leading = if cut > from || cut > 0 { "…" } else { "" };
    format!("{leading}{s}")
}

/// The reference without words the parser took in before it: trying two-
/// and three-word book names ("Song of Solomon"), it can read "See Matt." or
/// "Scripture References Genesis" as the name. A leading word is dropped for
/// as long as what is left still reads as the same reference.
fn trim_lead_words(text: &str, mut start: usize, end: usize, want: &crate::refparse::ScriptureRef) -> usize {
    loop {
        let rest = &text[start..end];
        let Some(space) = rest.find(' ') else { return start };
        let shorter = &rest[space + 1..];
        let same = find_references(shorter).first().is_some_and(|f| {
            f.start == 0 && f.end == shorter.len() && f.reference.book_id == want.book_id && f.reference.chapter == want.chapter && f.reference.verse_start == want.verse_start
        });
        if !same {
            return start;
        }
        start += space + 1;
    }
}

/// Every citation in a book's text.
pub fn extract(text: &str) -> Vec<Citation> {
    let mut seen: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    find_references(text)
        .into_iter()
        .map(|mut f| {
            f.start = trim_lead_words(text, f.start, f.end, &f.reference);
            let label = text[f.start..f.end].trim().to_string();
            let occurrence = {
                let n = seen.entry(label.clone()).or_insert(0);
                let this = *n;
                *n += 1;
                this
            };
            let r = f.reference;
            let verse_start = r.verse_start.unwrap_or(1);
            Citation {
                book_id: r.book_id,
                chapter: r.chapter,
                verse_start,
                verse_end: r.verse_end.unwrap_or(verse_start).max(verse_start),
                offset: f.start,
                context: context(text, f.start, f.end),
                label,
                occurrence,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_run_of_references_each_with_its_place() {
        let text = "Of the church it is said (Matt. xvi. 18) that the gates of hell shall not prevail. Compare Rom. 8:28, 30; and again Matt. xvi. 18.";
        let c = extract(text);
        assert_eq!(c.len(), 4);
        assert_eq!((c[0].book_id, c[0].chapter, c[0].verse_start), (40, 16, 18));
        assert_eq!(c[0].label, "Matt. xvi. 18");
        assert_eq!(c[0].occurrence, 0);
        assert_eq!(c[3].occurrence, 1, "the second printing of the same reference");
        assert!(c[0].context.contains("gates of hell"), "{}", c[0].context);
        assert_eq!((c[2].book_id, c[2].verse_start), (45, 30));
    }

    #[test]
    fn a_lead_word_is_not_part_of_the_reference() {
        let c = extract("As the Lord said to Peter. See Matt. xvi. 13–19, and cf. John xxi. 15. Scripture References Genesis 1:1");
        let labels: Vec<&str> = c.iter().map(|c| c.label.as_str()).collect();
        assert_eq!(labels, ["Matt. xvi. 13–19", "John xxi. 15", "Genesis 1:1"]);
        assert_eq!((c[0].book_id, c[0].chapter, c[0].verse_start, c[0].verse_end), (40, 16, 13, 19));
    }
}
