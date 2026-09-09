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
    pub kind: String, // "verse" | "commentary"
    pub book_id: i64,
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

#[derive(Debug, Clone, Serialize)]
pub struct WestminsterCommentarySource {
    pub id: i64,
    pub code: String,
    pub title: String,
    pub author: Option<String>,
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
