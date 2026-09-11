export interface Book {
  id: number;
  osis_code: string;
  name: string;
  short_name: string;
  testament: "OT" | "NT";
  chapter_count: number;
}

export interface Translation {
  id: number;
  code: string;
  name: string;
  language: string | null;
  source_path: string;
  imported_at: string;
  verse_count: number;
  license_status: "public_domain" | "licensed";
}

export interface BookCoverage {
  book_id: number;
  chapters: number[];
}

export interface BookAlias {
  book_id: number;
  name: string;
  short_name: string;
}

export interface Verse {
  id: number;
  translation_id: number;
  book_id: number;
  chapter: number;
  verse: number;
  text: string;
}

/** One verse range to look up by reference. `verse_end` is inclusive. */
export interface PassageRef {
  book_id: number;
  chapter: number;
  verse_start: number;
  verse_end: number;
}

/** The text of one requested range: the echoed reference, the verses joined
 * with spaces, and the individual verses. `verses` is empty when the
 * translation has no text for that range. */
export interface Passage {
  ref: PassageRef;
  text: string;
  verses: Verse[];
}

export interface CommentarySource {
  id: number;
  code: string;
  title: string;
  author: string | null;
  imported_at: string;
  covered_book_ids: number[];
}

export interface CommentaryEntry {
  id: number;
  section_id: number;
  sort_order: number;
  book_id: number;
  chapter: number | null;
  verse_start: number | null;
  verse_end: number | null;
  html: string;
  plain_text: string;
  section_title: string | null;
}

export interface CommentarySection {
  id: number;
  book_id: number;
  chapter: number | null;
  title: string | null;
  sort_order: number;
}

export interface Highlight {
  id: number;
  book_id: number;
  chapter: number;
  verse_start: number;
  verse_end: number;
  char_start: number | null;
  char_end: number | null;
  color: string;
  style: "highlight" | "underline";
  translation_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: number;
  book_id: number;
  chapter: number;
  verse_start: number;
  verse_end: number;
  body: string;
  highlight_id: number | null;
  created_at: string;
  updated_at: string;
  /** Set while the note sits in the Trash; null everywhere else. */
  deleted_at: string | null;
}

export interface ChapterNote {
  id: number;
  book_id: number;
  chapter: number;
  body: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Which soft-deletable table a Trash operation addresses. */
export type TrashKind = "note" | "chapter_note" | "prayer_entry";

export interface TrashContents {
  notes: Note[];
  chapter_notes: ChapterNote[];
  prayer_entries: PrayerEntry[];
}

export interface Bookmark {
  id: number;
  book_id: number;
  chapter: number;
  verse: number | null;
  label: string | null;
  created_at: string;
}

export interface ReadingPosition {
  translation_id: number | null;
  book_id: number | null;
  chapter: number | null;
  verse: number | null;
}

export interface SearchResult {
  kind: "verse" | "commentary" | "note" | "prayer";
  book_id: number | null;
  chapter: number | null;
  verse: number | null;
  snippet: string;
  source_label: string;
  entry_id: number;
}

export interface SearchResults {
  verses: SearchResult[];
  commentary: SearchResult[];
  notes: SearchResult[];
  prayers: SearchResult[];
}

export interface ImportReportItem {
  file: string;
  format: string;
  status: string;
  detail: string | null;
}

export type PrayerEntryMode = "acts" | "free";

export interface PrayerEntry {
  id: number;
  entry_date: string;
  mode: PrayerEntryMode;
  adoration: string | null;
  confession: string | null;
  thanksgiving: string | null;
  supplication: string | null;
  free_text: string | null;
  book_id: number | null;
  chapter: number | null;
  verse_start: number | null;
  verse_end: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PrayerListPerson {
  id: number;
  name: string;
  category: string | null;
  notes: string | null;
  active: boolean;
  last_prayed_at: string | null;
  created_at: string;
  updated_at: string;
  answered_at: string | null;
  answer_note: string | null;
}

export type MemoryMode = "first-letter" | "blank-word" | "type-it";

export interface MemoryVerse {
  id: number;
  book_id: number;
  chapter: number;
  verse_start: number;
  verse_end: number;
  translation_id: number | null;
  mode: MemoryMode;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  due_at: string;
  last_reviewed_at: string | null;
  created_at: string;
  westminster_section_id: number | null;
  doctrinal_note: string | null;
}

export interface CatechismMemory {
  id: number;
  westminster_section_id: number;
  mode: MemoryMode;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  due_at: string;
  last_reviewed_at: string | null;
  created_at: string;
}

export interface ReadingPlan {
  id: number;
  code: string;
  title: string;
  description: string | null;
  length_days: number;
}

export interface ReadingPlanReading {
  book_id: number;
  chapter_start: number;
  verse_start: number | null;
  chapter_end: number;
  verse_end: number | null;
  label: string;
}

export interface ReadingPlanDay {
  day_number: number;
  readings: ReadingPlanReading[];
}

export interface ReadingPlanProgress {
  plan_code: string;
  start_date: string;
  current_day: number;
  streak: number;
  completed_days: number[];
  created_at: string;
}

export interface BackupInfo {
  file_name: string;
  created_at: string;
  size_bytes: number;
}

export interface RedLetterRange {
  verse_start: number;
  verse_end: number;
}

export interface HarmonyReading {
  book_id: number;
  chapter_start: number;
  verse_start: number | null;
  chapter_end: number;
  verse_end: number | null;
  label: string;
}

export interface HarmonySection {
  id: number;
  sort_order: number;
  title: string;
  readings: HarmonyReading[];
}

export interface ConcordanceEntry {
  book_id: number;
  chapter: number;
  verse: number;
  text: string;
}

export interface StrongsEntry {
  id: string;
  language: "hebrew" | "greek";
  original_word: string;
  transliteration: string | null;
  pronunciation: string | null;
  short_definition: string | null;
  definition: string;
  derivation: string | null;
  kjv_usage: string | null;
  thayers_definition: string | null;
}

export interface DictionaryEntry {
  id: number;
  term: string;
  slug: string;
  body: string;
}

export interface DictionaryEntrySummary {
  id: number;
  term: string;
  slug: string;
}

export interface InterlinearWord {
  id: number;
  sort_order: number;
  text: string;
  strongs_id: string | null;
}

export interface MorphologyWord {
  id: number;
  sort_order: number;
  original_word: string;
  lemma: string | null;
  morph_code: string | null;
  strongs_id: string | null;
}

export interface Footnote {
  id: number;
  verse: number;
  sort_order: number;
  marker: string;
  text: string;
  char_offset: number | null;
}

export interface MetricalPsalmVerse {
  verse: number;
  text: string;
}

export interface MetricalPsalmVersion {
  label: string | null;
  verses: MetricalPsalmVerse[];
}

export interface CrossReference {
  to_book_id: number;
  to_chapter: number;
  to_verse_start: number;
  to_verse_end: number;
  votes: number;
}

export interface WestminsterDocument {
  id: number;
  code: string;
  title: string;
}

export interface WestminsterSectionSummary {
  id: number;
  sort_order: number;
  heading: string;
}

export interface WestminsterProofRef {
  marker: number;
  book_id: number;
  chapter: number;
  verse_start: number;
  verse_end: number;
}

export interface WestminsterSection {
  id: number;
  document_id: number;
  sort_order: number;
  heading: string;
  prompt: string | null;
  body: string;
  body_with_proofs: string;
  proofs: WestminsterProofRef[];
}

export interface WestminsterCommentarySource {
  id: number;
  code: string;
  title: string;
  author: string | null;
  document_code: string | null;
}

export interface WestminsterCommentaryEntry {
  id: number;
  chapter: number;
  section: number | null;
  sort_order: number;
  body: string;
}

export interface WestminsterSearchResult {
  section_id: number;
  document_id: number;
  heading: string;
  prompt: string | null;
  snippet: string;
}

export interface DoctrineTopic {
  id: number;
  name: string;
  category: string;
  westminster_section_id: number;
  document_code: string;
  heading: string;
}

export interface WestminsterPassageMatch {
  section_id: number;
  document_id: number;
  document_code: string;
  document_title: string;
  heading: string;
  prompt: string | null;
  marker: number;
}

export interface BulkImportOutcome {
  imported: string[];
  skipped_duplicate: string[];
  skipped_excluded: string[];
  skipped_unrecognized: string[];
  errors: string[];
}

export type ResourceKind = "epub" | "pdf" | "mobi" | "video" | "audio";

export interface Resource {
  id: number;
  kind: ResourceKind;
  title: string;
  author: string | null;
  file_path: string;
  has_text: boolean;
  added_at: string;
}

export interface ResourcePassageLink {
  id: number;
  resource_id: number;
  book_id: number;
  chapter: number;
  verse_start: number | null;
  verse_end: number | null;
  location: string | null;
  label: string | null;
  created_at: string;
}

export interface ResourceLink {
  id: number;
  from_resource_id: number;
  to_resource_id: number;
  from_location: string | null;
  label: string | null;
  created_at: string;
}

export interface ResourceSearchResult {
  resource_id: number;
  title: string;
  kind: ResourceKind;
  snippet: string;
}
