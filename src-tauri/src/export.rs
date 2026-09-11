// Plain-Markdown export for material a student wants outside the app: a
// study note pulled into a paper or teaching handout. Deliberately plain
// Markdown rather than a rich format -- it opens cleanly in anything, prints
// cleanly, and needs no library beyond String formatting.
use crate::models::{ChapterNote, Note, PrayerEntry};
use std::collections::HashMap;

fn book_name(book_names: &HashMap<i64, String>, book_id: i64) -> String {
    book_names.get(&book_id).cloned().unwrap_or_else(|| format!("Book #{book_id}"))
}

fn verse_ref(book_names: &HashMap<i64, String>, book_id: i64, chapter: i64, verse_start: Option<i64>, verse_end: Option<i64>) -> String {
    let mut s = format!("{} {}", book_name(book_names, book_id), chapter);
    if let Some(vs) = verse_start {
        s.push_str(&format!(":{vs}"));
        if let Some(ve) = verse_end {
            if ve != vs {
                s.push_str(&format!("-{ve}"));
            }
        }
    }
    s
}

/// Renders a single passage note as Markdown: the passage reference as a
/// heading, the note body below it.
pub fn format_note(note: &Note, book_names: &HashMap<i64, String>) -> String {
    let heading = verse_ref(book_names, note.book_id, note.chapter, Some(note.verse_start), Some(note.verse_end));
    format!("# {heading}\n\n{}\n", note.body)
}

/// Renders a chapter note as Markdown: the chapter reference as a heading,
/// the note body below it.
pub fn format_chapter_note(note: &ChapterNote, book_names: &HashMap<i64, String>) -> String {
    let heading = format!("{} {}", book_name(book_names, note.book_id), note.chapter);
    format!("# {heading}\n\n{}\n", note.body)
}

/// Renders a prayer journal entry as Markdown: the date as a heading, then
/// either the four ACTS sections (whichever are filled in) or the free-write
/// body, plus the linked passage if there is one.
pub fn format_prayer_entry(entry: &PrayerEntry, book_names: &HashMap<i64, String>) -> String {
    let mut out = format!("# Prayer — {}\n\n", entry.entry_date);
    if let (Some(book_id), Some(chapter)) = (entry.book_id, entry.chapter) {
        out.push_str(&format!(
            "**Passage:** {}\n\n",
            verse_ref(book_names, book_id, chapter, entry.verse_start, entry.verse_end)
        ));
    }
    if entry.mode == "free" {
        if let Some(text) = &entry.free_text {
            out.push_str(text);
            out.push('\n');
        }
    } else {
        for (label, body) in [
            ("Adoration", &entry.adoration),
            ("Confession", &entry.confession),
            ("Thanksgiving", &entry.thanksgiving),
            ("Supplication", &entry.supplication),
        ] {
            if let Some(text) = body {
                out.push_str(&format!("## {label}\n\n{text}\n\n"));
            }
        }
    }
    out
}
