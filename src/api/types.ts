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

/** One Scripture reference found in a note's body (backlinks, F2.2). A
 * chapter-only mention ("Genesis 3") has null verses. */
export interface NoteRefInput {
  book_id: number;
  chapter: number;
  verse_start: number | null;
  verse_end: number | null;
}

export type NoteKind = "note" | "chapter_note";

/** A note elsewhere that mentions a passage in the chapter asked about. */
export interface Backlink {
  kind: NoteKind;
  id: number;
  /** The note's own passage; verses are null for a chapter note. */
  book_id: number;
  chapter: number;
  verse_start: number | null;
  verse_end: number | null;
  body: string;
  updated_at: string;
  /** The mentioned range within the chapter asked about; null = whole chapter. */
  ref_verse_start: number | null;
  ref_verse_end: number | null;
}

/** Which soft-deletable table a Trash operation addresses. */
export type TrashKind = "note" | "chapter_note" | "prayer_entry" | "sermon" | "illustration";

export interface TrashContents {
  notes: Note[];
  chapter_notes: ChapterNote[];
  prayer_entries: PrayerEntry[];
  sermons: Sermon[];
  illustrations: Illustration[];
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

/** A chapter read on a local calendar day (F3.1 reading log); the recent
 * list carries each chapter once with the last day it was read. */
export interface ReadingLogEntry {
  date: string;
  book_id: number;
  chapter: number;
  translation_id: number | null;
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
  /** A plan the reader built (F4.2); its code starts with "user:". */
  custom: boolean;
  /** ISO weekdays (1 = Monday … 7 = Sunday) the plan is read on; null means every day. */
  weekdays: number[] | null;
}

/** One reading of a custom plan as the builder sends it (F4.2). */
export interface PlanReadingInput {
  book_id: number;
  chapter_start: number;
  verse_start: number | null;
  chapter_end: number;
  verse_end: number | null;
  label: string;
}

/** A day of a plan pinned to a calendar date (F4.2). */
export interface ScheduleEntry {
  day_number: number;
  date: string;
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
  /** Days pinned to a date: a weekday plan's calendar or a spread's
   * re-dated days. A day not listed falls on start_date + (day - 1). */
  schedule: ScheduleEntry[];
}

export interface BackupInfo {
  file_name: string;
  created_at: string;
  size_bytes: number;
}

/** Study statistics for the Stats block (F3.5), gathered in one call. */
export interface BookStat {
  book_id: number;
  /** Passage notes plus chapter notes on the book. */
  notes: number;
  highlights: number;
}

export interface ReadingDay {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  /** Distinct chapters opened that day. */
  chapters: number;
}

export interface Stats {
  /** Only books with at least one note or highlight, in Bible order. */
  books: BookStat[];
  notes_total: number;
  highlights_total: number;
  /** Days with reading in the past 371 days (the heatmap window). */
  reading_days: ReadingDay[];
  reading_days_total: number;
  chapters_read_total: number;
  prayer_entries: number;
  prayer_people: number;
  memory_verses_total: number;
  /** Cards whose review interval has reached three weeks. */
  memory_verses_learned: number;
  catechism_total: number;
  catechism_learned: number;
  bookmarks: number;
  /** Preachings logged this year and ever (SB5.6). */
  sermons_preached_year: number;
  sermons_preached_total: number;
  sermons_total: number;
  sermon_words_total: number;
  /** Stories in the illustrations library. */
  illustrations_total: number;
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

/** One dictionary's article on a headword. An entry usually carries two. */
export interface DictionaryDefinition {
  source_code: string;
  source_name: string;
  body: string;
}

export interface DictionaryEntry {
  id: number;
  term: string;
  slug: string;
  /** The whole entry as words, for citation and search snippets. */
  body: string;
  definitions: DictionaryDefinition[];
  /** Other spellings this headword is filed under elsewhere. */
  aliases: string[];
}

export interface DictionaryEntrySummary {
  id: number;
  term: string;
  slug: string;
  /** Which dictionaries have an article here ("EAS", "SMI"). */
  sources: string[];
}

/** An ISBE article. `body` is HTML: scripture citations are
 *  `a.scripref[data-osis]` and cross-references to other articles are
 *  `a.isbe-link[data-isbe]`, both decorated at render time. */
export interface IsbeEntry {
  id: number;
  term: string;
  slug: string;
  body: string;
  /** Set on a "See SOMETHING ELSE" stub, so the reader can be sent on. */
  redirect_slug: string | null;
}

export interface IsbeEntrySummary {
  id: number;
  term: string;
  slug: string;
}

/** An encyclopedia article that discusses the passage being read. */
export interface IsbePassageEntry {
  id: number;
  term: string;
  slug: string;
  /** Which verses of it, in order. */
  verses: number[];
  /** References the whole article makes; small means focused. */
  ref_count: number;
}

export interface IsbeSearchResult {
  id: number;
  term: string;
  slug: string;
  /** HTML-escaped, with `[` and `]` around the matched words. */
  snippet: string;
}

/** How firmly a place is tied to a modern location. Most biblical sites are
 *  not certain, and the atlas says so rather than implying otherwise. */
export type AtlasConfidence = "certain" | "probable" | "possible" | "proposed" | "unidentified";
export type AtlasCategory = "settlement" | "region" | "water" | "mountain" | "other";

export interface AtlasPlace {
  id: string;
  slug: string;
  name: string;
  /** "the" for places read as "the Jordan"; null otherwise. */
  article: string | null;
  kinds: string[];
  category: AtlasCategory;
  lon: number | null;
  lat: number | null;
  /** True when the coordinate is the centre of a search radius, not a site. */
  approximate: boolean;
  confidence: AtlasConfidence;
  modern_name: string | null;
  modern_alternatives: number;
  verse_count: number;
}

export interface AtlasPlaceVerse {
  book_id: number;
  chapter: number;
  verse: number;
}

export interface AtlasJourney {
  id: number;
  slug: string;
  title: string;
  summary: string;
  era: string;
  reference: string;
  legs: AtlasJourneyLeg[];
}

export interface AtlasJourneyLeg {
  place_id: string | null;
  place_slug: string | null;
  label: string;
  note: string | null;
  lon: number | null;
  lat: number | null;
  book_id: number | null;
  chapter: number | null;
  verse: number | null;
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
  /** True for a book that ships with the app: it can be read, searched,
   * tagged and linked like any other, but not removed. */
  bundled: boolean;
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

// --- Sermon Builder (USER_MIGRATION_0015) ---------------------------------

export type SermonStatus = "draft" | "ready" | "preached" | "archived";
/** The prep track's six steps, in order. */
export type SermonStage = "text" | "study" | "outline" | "manuscript" | "rehearsed" | "preached";
/** Where a passage came from: the sermon's own text, a block in the
 *  manuscript, or a reference typed in prose. */
export type SermonPassageRole = "text" | "supporting" | "mentioned";
export type SermonSourceKind =
  | "commentary"
  | "confession"
  | "strongs"
  | "dictionary"
  | "resource"
  | "crossref"
  | "illustration"
  | "encyclopedia"
  | "atlas";
export type SermonEventKind = "rehearsal" | "preaching";
export type IllustrationKind = "illustration" | "quote";

export interface SermonPassage {
  id: number;
  sermon_id: number;
  role: SermonPassageRole;
  book_id: number;
  chapter: number;
  verse_start: number | null;
  verse_end: number | null;
  sort_order: number;
}

export interface SermonPassageInput {
  role: SermonPassageRole;
  book_id: number;
  chapter: number;
  verse_start: number | null;
  verse_end: number | null;
}

export interface SermonSource {
  id: number;
  sermon_id: number;
  kind: SermonSourceKind;
  /** The reopenable source identity, e.g. `commentary:42`, `strongs:G1343`. */
  ref_id: string | null;
  label: string;
  excerpt: string | null;
  sort_order: number;
  created_at: string;
}

export interface SermonSourceInput {
  kind: SermonSourceKind;
  ref_id: string | null;
  label: string;
  excerpt: string | null;
}

export interface SermonEvent {
  id: number;
  sermon_id: number;
  kind: SermonEventKind;
  date: string;
  venue: string | null;
  duration_seconds: number | null;
  word_count: number | null;
  notes: string | null;
  created_at: string;
}

export interface Sermon {
  id: number;
  title: string;
  big_idea: string | null;
  /** tiptap HTML; its passage blocks hold references, never verse text. */
  body: string;
  status: SermonStatus;
  stage: SermonStage;
  preach_date: string | null;
  series_id: number | null;
  series_order: number | null;
  venue: string | null;
  preacher: string | null;
  translation_id: number | null;
  target_minutes: number | null;
  reflection: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  passages: SermonPassage[];
  sources: SermonSource[];
  tags: string[];
  events: SermonEvent[];
  series_title: string | null;
}

export interface SermonSeries {
  id: number;
  title: string;
  description: string | null;
  /** The congregation's reading plan, once one has been built (SB5.2). */
  plan_code: string | null;
  created_at: string;
  sermon_count: number;
  preached_count: number;
}

export interface SermonFilter {
  status?: SermonStatus | null;
  stage?: SermonStage | null;
  series_id?: number | null;
  book_id?: number | null;
  tag?: string | null;
  year?: number | null;
  query?: string | null;
  sort?: "date" | "title" | "updated" | null;
  limit?: number | null;
}

/** Every editable field. A missing collection is left alone; a null scalar
 *  is written as null, since the pane sends the whole sermon back. */
export interface SermonInput {
  title?: string | null;
  big_idea?: string | null;
  body?: string | null;
  status?: SermonStatus | null;
  stage?: SermonStage | null;
  preach_date?: string | null;
  series_id?: number | null;
  series_order?: number | null;
  venue?: string | null;
  preacher?: string | null;
  translation_id?: number | null;
  target_minutes?: number | null;
  reflection?: string | null;
  passages?: SermonPassageInput[];
  sources?: SermonSourceInput[];
  tags?: string[];
}

export interface SermonForChapter {
  sermon_id: number;
  title: string;
  preach_date: string | null;
  stage: SermonStage;
  status: SermonStatus;
  role: SermonPassageRole;
  book_id: number;
  chapter: number;
  verse_start: number | null;
  verse_end: number | null;
}

/** The preacher's own rate, measured from timed runs (SB2.4). */
export interface SpeakingRate {
  wpm: number;
  rehearsals: number;
  preachings: number;
}

export interface Illustration {
  id: number;
  title: string;
  body: string;
  source_label: string | null;
  source_ref: string | null;
  kind: IllustrationKind;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  tags: string[];
  use_count: number;
  last_used_at: string | null;
}

export interface IllustrationFilter {
  kind?: IllustrationKind | null;
  tag?: string | null;
  query?: string | null;
  sort?: "newest" | "most_used" | null;
}

export interface IllustrationInput {
  title?: string | null;
  body?: string | null;
  source_label?: string | null;
  source_ref?: string | null;
  kind?: IllustrationKind | null;
  tags?: string[];
}

export interface IllustrationUse {
  illustration_id: number;
  sermon_id: number;
  sermon_title: string;
  series_id: number | null;
  preach_date: string | null;
  used_at: string;
}
