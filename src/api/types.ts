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
  /** The licence as About shows it ("CC BY-SA 4.0"); null for the bundled
   * Zefania files, which are all public domain. */
  license: string | null;
  /** The credit line the licence requires, where it requires one. */
  credit: string | null;
  /** "New Testament and part of the Old", for a partial translation. */
  scope: string | null;
  script: "latin" | "greek" | "hebrew";
  direction: "ltr" | "rtl";
  source_format: string;
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
  /** The translation a verse hit is from, or the commentary an entry is from. */
  source_id: number | null;
}

export interface SearchResults {
  verses: SearchResult[];
  /** How many verses matched in all; `verses` holds at most the limit asked for. */
  verse_total: number;
  /** Why the Scripture search could not run (a bad regular expression). */
  verse_error: string | null;
  commentary: SearchResult[];
  commentary_total: number;
  notes: SearchResult[];
  prayers: SearchResult[];
  parsed: {
    /** "love near God", "not: world", "in Psalms", "KJV". */
    chips: string[];
    /** Filter words not understood ("in:narnia"). */
    unknown: string[];
    mark_words: string[];
  };
}

/** Hits per book and per translation (or commentary): [id, count] pairs. */
export interface SearchFacets {
  by_book: [number, number][];
  by_source: [number, number][];
}

export interface SearchScope {
  bookId?: number;
  testament?: "OT" | "NT";
  wholeWords?: boolean;
  passageOrder?: boolean;
  olderSpellings?: boolean;
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
  /** The passage this card is a part of, if it was added as one. */
  passage_id: number | null;
  /** The named set it came in with: "The Romans Road", "Family". */
  set_name: string | null;
  /** Also practised the other way round: shown the words, say where. */
  ask_reference: boolean;
}

/** A passage learned a part at a time; its parts are MemoryVerse cards. */
export interface MemoryPassage {
  id: number;
  book_id: number;
  chapter: number;
  verse_start: number;
  verse_end: number;
  translation_id: number | null;
  chunk_size: number;
  mode: MemoryMode;
  set_name: string | null;
  created_at: string;
  /** How many parts it has, how many are in the deck, how many learned. */
  parts: number;
  added: number;
  learned: number;
  /** The card for saying it all through, once every part is learned. */
  whole_card_id: number | null;
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

/** One bundled harmony of the Gospels, as listed in the picker. */
export interface Harmony {
  id: number;
  code: string;
  title: string;
  author: string | null;
  year: number | null;
  description: string | null;
  source_note: string | null;
  section_count: number;
}

/** A period a harmony groups its sections into. A flat harmony has none. */
export interface HarmonyPart {
  id: number;
  sort_order: number;
  label: string | null;
  title: string;
}

/** A harmonist's footnote on one section, and the essay it defers to. */
export interface HarmonySectionNote {
  marker: string;
  text: string;
  essay_number: number | null;
}

export interface HarmonySection {
  id: number;
  sort_order: number;
  /** The harmony's own label, which need not be the ordinal (Robertson has a 128a). */
  number: string | null;
  title: string;
  /** Place and approximate date, as the harmonist printed it. */
  headnote: string | null;
  part_id: number | null;
  readings: HarmonyReading[];
  notes: HarmonySectionNote[];
}

/** One of the longer discussions appended to a harmony. */
export interface HarmonyEssay {
  number: number;
  title: string;
  body: string;
}

export interface HarmonyDetail {
  harmony: Harmony;
  parts: HarmonyPart[];
  sections: HarmonySection[];
  essays: HarmonyEssay[];
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

/** How to say a name, in ISBE's own notation: `{ word: "MEPHIBOSHETH",
 * respelling: "me-fib'-o-sheth" }`. */
export interface Pronunciation {
  word: string;
  respelling: string;
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

/** A Bible verse number that begins inside a metrical line -- regularly
 *  part-way along it, since a stanza does not respect verse divisions. */
export interface MetricalPsalmMark {
  verse: number;
  word: number;
}

export interface MetricalPsalmLine {
  text: string;
  marks: MetricalPsalmMark[];
  /** One entry per note the line is sung on, longer words already divided
   *  ("sal", "va", "ti", "on"), so the words sit under the notes. */
  syllables: string[];
}

export interface MetricalPsalmStanza {
  number: number;
  lines: MetricalPsalmLine[];
}

export interface MetricalPsalmVersion {
  label: string | null;
  /** "C.M.", "L.M.", "8.7.8.7." -- what decides which tunes will carry it. */
  metre: string;
  /** Syllables per line, e.g. [8, 6, 8, 6]. */
  pattern: number[];
  verses: MetricalPsalmVerse[];
  /** Empty where the scan was too damaged to divide into singable lines; the
   *  psalm then reads as verses and its tune plays without words under it. */
  stanzas: MetricalPsalmStanza[];
}

export interface TuneNote {
  midi: number;
  beats: number;
}

/** A tune, melody only. `lines` is one entry per line of the metre, each a
 *  list of syllables, each syllable the note or notes it is sung to. */
export interface PsalmTune {
  id: string;
  name: string;
  metre: string;
  pattern: number[];
  composer: string | null;
  key: string | null;
  /** Crotchets per minute, as the source score marks it. */
  tempo: number;
  lines: TuneNote[][][];
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
  /** A catechism's question, or the Confession's chapter title. */
  prompt: string | null;
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
  /** A shipped book's file name in its pack: its key in the library catalog. */
  library_key: string | null;
}

/** A shipped book's shelf and subject, for grouping in Resources. */
export interface CatalogEntry {
  file_name: string;
  shelf_id: string;
  shelf_name: string;
  shelf_order: number;
  subject: string | null;
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

/** A sermon idea (USER_MIGRATION_0022). `sermon_id` is set while it is
 * filed into a live sermon; with none, it is in the inbox. */
export interface SermonIdea {
  id: number;
  body: string;
  book_id: number | null;
  chapter: number | null;
  verse_start: number | null;
  verse_end: number | null;
  source_label: string | null;
  sermon_id: number | null;
  sermon_title: string | null;
  filed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** A new idea or an edit; the reference is replaced whole. */
export interface SermonIdeaInput {
  body: string;
  book_id?: number | null;
  chapter?: number | null;
  verse_start?: number | null;
  verse_end?: number | null;
  source_label?: string | null;
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

// --- File dialogs ----------------------------------------------------------

/** Which dialog filters `pickSavePath`/`pickOpenPath` should use. The page
 * names a kind rather than a set of extensions, because the dialog itself is
 * described on the Rust side (see `commands::file_picker`). */
export type PickKind = "markdown" | "database" | "pptx" | "html" | "resource" | "library_xml" | "pack";

/** The installed book library pack, or the absence of one. */
export interface PackStatus {
  /** "library" for the Puritan and Reformed shelf; each other shelf's own id. */
  id: string | null;
  installed: boolean;
  name: string | null;
  version: string | null;
  built_at: string | null;
  book_count: number | null;
  bytes_on_disk: number | null;
}

/**
 * How far an install has got. Emitted on the `pack-install-progress` event,
 * many times a second while `stage` is "extracting".
 */
export interface PackProgress {
  stage: "checking" | "extracting" | "installing" | "cataloguing" | "done";
  file: string | null;
  files_done: number;
  files_total: number;
  bytes_done: number;
  bytes_total: number;
}

/** What an install did, once it is done. */
export interface PackInstallOutcome {
  name: string;
  version: string;
  book_count: number;
  bytes: number;
  /** True when this replaced a pack that was already installed. */
  replaced: boolean;
}

/** A file the user chose in a dialog Rust ran. `token` is what the commands
 * that read or write it take -- one use, then it is spent. `display_path` is
 * for showing the user which file they picked, and nothing else. */
export interface PickedPath {
  token: string;
  display_path: string;
}

// --- Updates ---------------------------------------------------------------

/** The answer to "is there a newer Sojourner?" (see `crate::update`).
 *
 * Nothing here downloads or installs anything: `url` is a page for the reader
 * to visit. `latest` is null when no release has been published yet, which is
 * not an error and not an update. */
export interface UpdateCheck {
  current: string;
  latest: string | null;
  update_available: boolean;
  url: string;
}

/** One Strong's number, studied (see `queries::word_study`). Counts are of
 * the tagged Greek and Hebrew, not of any English translation. */
export interface WordStudy {
  entry: StrongsEntry;
  occurrences: number;
  verses: number;
  /** How the KJV renders it, commonest first. */
  renderings: { gloss: string; count: number }[];
  /** [book id, occurrences], canonical order. */
  by_book: [number, number][];
  forms: { form: string; morph_code: string; description: string; count: number }[];
  related: { id: string; original_word: string; transliteration: string | null; short_definition: string | null; relation: "root" | "derived" }[];
}

export interface WordOccurrence {
  book_id: number;
  chapter: number;
  verse: number;
  original_word: string;
  morph_code: string | null;
  description: string | null;
  /** The KJV's words for it in this verse. */
  renderings: string[];
  text: string | null;
}

export interface MorphQuery {
  language: "greek" | "hebrew";
  word?: string | null;
  fields: Record<string, string>;
  book_ids: number[];
  testament?: "OT" | "NT" | null;
  translation_id?: number | null;
  limit: number;
}

export interface MorphSearchPage {
  hits: {
    book_id: number;
    chapter: number;
    verse: number;
    words: { sort_order: number; original_word: string; description: string; strongs_id: string | null }[];
    text: string | null;
  }[];
  verse_total: number;
  word_total: number;
  description: string;
}

export interface LexiconSource {
  id: number;
  code: string;
  name: string;
  language: "greek" | "hebrew";
  license: string;
  credit: string;
  entry_count: number;
}

export interface LexiconEntry {
  id: number;
  source_code: string;
  source_name: string;
  headword: string;
  strongs_id: string | null;
  /** Built by the importer from an allowlist; rendered through CommentaryHtml. */
  html: string;
}

export interface LexiconHit {
  id: number;
  source_code: string;
  source_name: string;
  headword: string;
  strongs_id: string | null;
  snippet: string;
}

/** A person, place or named thing (from STEPBible's TIPNR). */
export interface FactbookSummary {
  /** TIPNR's unique name, "Zechariah@2Ch.24.20-Luk". */
  id: string;
  kind: "person" | "place" | "other";
  name: string;
  description: string;
  entity_type: string;
  verse_count: number;
}

export interface FactbookEntry {
  summary: FactbookSummary;
  /** One sentence, with Scripture links (render through CommentaryHtml). */
  summary_html: string;
  tribe: string | null;
  region: string | null;
  lat: number | null;
  lon: number | null;
  names: { significance: string; english: string; original: string | null; strongs_id: string | null; strongs_plain: string | null }[];
  relations: { kind: string; qualifier: string | null; entity: FactbookSummary }[];
  /** [book, chapter, verse]. */
  verses: [number, number, number][];
  links: { kind: "isbe" | "dictionary" | "atlas"; slug: string; title: string }[];
}

export interface PassageEntity {
  entity: FactbookSummary;
  verses: number[];
}

/** A book that cites a passage, and where (see `queries::citations`). */
export interface CitationHit {
  resource_id: number;
  title: string;
  author: string | null;
  /** The shelf it is on ("Church Fathers"), or "Your books". */
  shelf: string;
  /** The reference as the book prints it ("Matt. xvi. 18"). */
  label: string;
  /** Which printing of `label` in the book this is (0-based). */
  occurrence: number;
  context: string;
  chapter: number;
  verse_start: number;
  verse_end: number;
}

/** The timeline (see `queries::timeline`). Years are astronomical and
 * fractional: 588 BC is -587, AD 30 is 30. */
export interface TimelineEra {
  slug: string;
  name: string;
  start_year: number;
  end_year: number;
  /** The atlas journeys of this era, by their `era`. */
  journey_era: string | null;
}

export interface TimelineEntity {
  id: string;
  name: string;
  role: "person" | "place";
  atlas_slug: string | null;
}

export interface TimelineEvent {
  id: number;
  title: string;
  start_year: number;
  end_year: number;
  precision: "year" | "month" | "day";
  parent_id: number | null;
  lane: "judah" | "israel" | null;
  note: string | null;
  source: "theographic" | "added";
  book_id: number | null;
  chapter: number | null;
  verse: number | null;
  entities: TimelineEntity[];
}

export interface Timeline {
  eras: TimelineEra[];
  events: TimelineEvent[];
}

export interface PassageTimeline {
  start_year: number | null;
  end_year: number | null;
  event_ids: number[];
}
