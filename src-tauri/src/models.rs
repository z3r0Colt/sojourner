use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
pub struct Book {
    pub id: i64,
    pub osis_code: String,
    pub name: String,
    pub short_name: String,
    pub testament: String,
    pub chapter_count: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Translation {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub language: Option<String>,
    pub source_path: String,
    pub imported_at: String,
    pub verse_count: i64,
    pub license_status: String,
}

/// Which chapters of a book a given translation actually has verses for --
/// used by the book/chapter picker and Go To palette to gray out or reject
/// passages a translation doesn't cover (e.g. Tyndale is NT + Pentateuch
/// only) instead of navigating to an empty chapter.
#[derive(Debug, Clone, Serialize)]
pub struct BookCoverage {
    pub book_id: i64,
    pub chapters: Vec<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MetricalPsalmVerse {
    pub verse: i64,
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct MetricalPsalmVersion {
    pub label: Option<String>,
    pub verses: Vec<MetricalPsalmVerse>,
}

/// An alternate book name a bundled translation's own source uses (e.g. a
/// Vulgate-named edition's "Josue" for Joshua) -- see `book_aliases`.
#[derive(Debug, Clone, Serialize)]
pub struct BookAlias {
    pub book_id: i64,
    pub name: String,
    pub short_name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct Verse {
    pub id: i64,
    pub translation_id: i64,
    pub book_id: i64,
    pub chapter: i64,
    pub verse: i64,
    pub text: String,
}

/// One verse range to look up by reference -- the input half of
/// `get_passages`. `verse_end` is inclusive; a single verse has
/// `verse_start == verse_end`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PassageRef {
    pub book_id: i64,
    pub chapter: i64,
    pub verse_start: i64,
    pub verse_end: i64,
}

/// The text of one requested verse range: the echoed reference, the verses
/// joined with single spaces as `text`, and the individual verses for
/// callers that need per-verse numbering. `verses` is empty when the
/// translation has no text for that range (e.g. Tyndale outside the NT).
#[derive(Debug, Clone, Serialize)]
pub struct Passage {
    #[serde(rename = "ref")]
    pub passage_ref: PassageRef,
    pub text: String,
    pub verses: Vec<Verse>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CommentarySource {
    pub id: i64,
    pub code: String,
    pub title: String,
    pub author: Option<String>,
    pub imported_at: String,
    pub covered_book_ids: Vec<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CommentaryEntry {
    pub id: i64,
    pub section_id: i64,
    pub sort_order: i64,
    pub book_id: i64,
    pub chapter: Option<i64>,
    pub verse_start: Option<i64>,
    pub verse_end: Option<i64>,
    pub html: String,
    pub plain_text: String,
    pub section_title: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CommentarySection {
    pub id: i64,
    pub book_id: i64,
    pub chapter: Option<i64>,
    pub title: Option<String>,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Highlight {
    pub id: i64,
    pub book_id: i64,
    pub chapter: i64,
    pub verse_start: i64,
    pub verse_end: i64,
    pub char_start: Option<i64>,
    pub char_end: Option<i64>,
    pub color: String,
    pub style: String,
    pub translation_id: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Note {
    pub id: i64,
    pub book_id: i64,
    pub chapter: i64,
    pub verse_start: i64,
    pub verse_end: i64,
    pub body: String,
    pub highlight_id: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChapterNote {
    pub id: i64,
    pub book_id: i64,
    pub chapter: i64,
    pub body: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bookmark {
    pub id: i64,
    pub book_id: i64,
    pub chapter: i64,
    pub verse: Option<i64>,
    pub label: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReadingPosition {
    pub translation_id: Option<i64>,
    pub book_id: Option<i64>,
    pub chapter: Option<i64>,
    pub verse: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SearchResult {
    pub kind: String, // "verse" | "commentary" | "note" | "prayer"
    pub book_id: Option<i64>,
    pub chapter: Option<i64>,
    pub verse: Option<i64>,
    pub snippet: String,
    pub source_label: String,
    pub entry_id: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct StrongsEntry {
    pub id: String,
    pub language: String,
    pub original_word: String,
    pub transliteration: Option<String>,
    pub pronunciation: Option<String>,
    pub short_definition: Option<String>,
    pub definition: String,
    pub derivation: Option<String>,
    pub kjv_usage: Option<String>,
    /// HTML (small sanitized allow-list, same convention as
    /// commentary_entries.html -- <b>/<u>/<sup>/<p>/scripref links).
    pub thayers_definition: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DictionaryEntry {
    pub id: i64,
    pub term: String,
    pub slug: String,
    pub body: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct DictionaryEntrySummary {
    pub id: i64,
    pub term: String,
    pub slug: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct InterlinearWord {
    pub id: i64,
    pub sort_order: i64,
    pub text: String,
    pub strongs_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CrossReference {
    pub to_book_id: i64,
    pub to_chapter: i64,
    pub to_verse_start: i64,
    pub to_verse_end: i64,
    pub votes: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct WestminsterDocument {
    pub id: i64,
    pub code: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct WestminsterSectionSummary {
    pub id: i64,
    pub sort_order: i64,
    pub heading: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct WestminsterProofRef {
    pub marker: i64,
    pub book_id: i64,
    pub chapter: i64,
    pub verse_start: i64,
    pub verse_end: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct WestminsterSection {
    pub id: i64,
    pub document_id: i64,
    pub sort_order: i64,
    pub heading: String,
    pub prompt: Option<String>,
    pub body: String,
    pub body_with_proofs: String,
    pub proofs: Vec<WestminsterProofRef>,
}

/// One Standards paragraph found to cite a given Scripture passage as proof
/// -- the reverse of `WestminsterSection.proofs` (which goes
/// section-to-verses; this goes verse-to-sections). `document_code`/`title`
/// are denormalized in so the reading-pane panel can group and label matches
/// without a second round trip.
#[derive(Debug, Clone, Serialize)]
pub struct WestminsterPassageMatch {
    pub section_id: i64,
    pub document_id: i64,
    pub document_code: String,
    pub document_title: String,
    pub heading: String,
    pub prompt: Option<String>,
    pub marker: i64,
}

/// One entry in the doctrine/topic index -- see the doctrine_topics schema
/// comment. `heading`/`document_code` are denormalized in from the resolved
/// section so the UI can link straight to it without a second lookup.
#[derive(Debug, Clone, Serialize)]
pub struct DoctrineTopic {
    pub id: i64,
    pub name: String,
    pub category: String,
    pub westminster_section_id: i64,
    pub document_code: String,
    pub heading: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct WestminsterCommentarySource {
    pub id: i64,
    pub code: String,
    pub title: String,
    pub author: Option<String>,
    pub document_code: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct WestminsterCommentaryEntry {
    pub id: i64,
    pub chapter: i64,
    pub section: Option<i64>,
    pub sort_order: i64,
    pub body: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SearchResults {
    pub verses: Vec<SearchResult>,
    pub commentary: Vec<SearchResult>,
    pub notes: Vec<SearchResult>,
    pub prayers: Vec<SearchResult>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ImportReportItem {
    pub file: String,
    pub format: String,
    pub status: String, // "Added" | "Updated" | "Skipped" | "Failed"
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Resource {
    pub id: i64,
    pub kind: String,
    pub title: String,
    pub author: Option<String>,
    pub file_path: String,
    pub has_text: bool,
    pub added_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourcePassageLink {
    pub id: i64,
    pub resource_id: i64,
    pub book_id: i64,
    pub chapter: i64,
    pub verse_start: Option<i64>,
    pub verse_end: Option<i64>,
    pub location: Option<String>,
    pub label: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceLink {
    pub id: i64,
    pub from_resource_id: i64,
    pub to_resource_id: i64,
    pub from_location: Option<String>,
    pub label: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ResourceSearchResult {
    pub resource_id: i64,
    pub title: String,
    pub kind: String,
    pub snippet: String,
}

/// One verse where a given Strong's-tagged word occurs -- see `concordance`.
#[derive(Debug, Clone, Serialize)]
pub struct ConcordanceEntry {
    pub book_id: i64,
    pub chapter: i64,
    pub verse: i64,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrayerEntry {
    pub id: i64,
    pub entry_date: String,
    pub mode: String,
    pub adoration: Option<String>,
    pub confession: Option<String>,
    pub thanksgiving: Option<String>,
    pub supplication: Option<String>,
    pub free_text: Option<String>,
    pub book_id: Option<i64>,
    pub chapter: Option<i64>,
    pub verse_start: Option<i64>,
    pub verse_end: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrayerListPerson {
    pub id: i64,
    pub name: String,
    pub category: Option<String>,
    pub notes: Option<String>,
    pub active: bool,
    pub last_prayed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub answered_at: Option<String>,
    pub answer_note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryVerse {
    pub id: i64,
    pub book_id: i64,
    pub chapter: i64,
    pub verse_start: i64,
    pub verse_end: i64,
    pub translation_id: Option<i64>,
    pub mode: String,
    pub ease_factor: f64,
    pub interval_days: i64,
    pub repetitions: i64,
    pub due_at: String,
    pub last_reviewed_at: Option<String>,
    pub created_at: String,
    pub westminster_section_id: Option<i64>,
    pub doctrinal_note: Option<String>,
}

/// Catechism Study mode's spaced-repetition card: same shape and SM-2 state
/// as `MemoryVerse`, but keyed to a Westminster question/paragraph instead
/// of a Bible passage -- see the schema comment on `catechism_memory` for
/// why this is a parallel table rather than a shared "memory item" type.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatechismMemory {
    pub id: i64,
    pub westminster_section_id: i64,
    pub mode: String,
    pub ease_factor: f64,
    pub interval_days: i64,
    pub repetitions: i64,
    pub due_at: String,
    pub last_reviewed_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadingPlan {
    pub id: i64,
    pub code: String,
    pub title: String,
    pub description: Option<String>,
    pub length_days: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadingPlanReading {
    pub book_id: i64,
    pub chapter_start: i64,
    pub verse_start: Option<i64>,
    pub chapter_end: i64,
    pub verse_end: Option<i64>,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadingPlanDay {
    pub day_number: i64,
    pub readings: Vec<ReadingPlanReading>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadingPlanProgress {
    pub plan_code: String,
    pub start_date: String,
    pub current_day: i64,
    pub streak: i64,
    pub completed_days: Vec<i64>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedLetterRange {
    pub verse_start: i64,
    pub verse_end: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HarmonyReading {
    pub book_id: i64,
    pub chapter_start: i64,
    pub verse_start: Option<i64>,
    pub chapter_end: i64,
    pub verse_end: Option<i64>,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HarmonySection {
    pub id: i64,
    pub sort_order: i64,
    pub title: String,
    pub readings: Vec<HarmonyReading>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MorphologyWord {
    pub id: i64,
    pub sort_order: i64,
    pub original_word: String,
    pub lemma: Option<String>,
    pub morph_code: Option<String>,
    pub strongs_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Footnote {
    pub id: i64,
    pub verse: i64,
    pub sort_order: i64,
    pub marker: String,
    pub text: String,
    pub char_offset: Option<i64>,
}
