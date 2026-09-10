import { invoke } from "@tauri-apps/api/core";
import type {
  Book,
  BookCoverage,
  BookAlias,
  Translation,
  Verse,
  CommentarySource,
  CommentaryEntry,
  CommentarySection,
  Highlight,
  Note,
  Bookmark,
  ReadingPosition,
  SearchResults,
  ImportReportItem,
  StrongsEntry,
  ConcordanceEntry,
  SermonNote,
  SermonNotePassageLink,
  PrayerEntry,
  MemoryVerse,
  ReadingPlan,
  ReadingPlanDay,
  ReadingPlanProgress,
  HarmonySection,
  RedLetterRange,
  DictionaryEntry,
  DictionaryEntrySummary,
  InterlinearWord,
  MorphologyWord,
  Footnote,
  ChapterNote,
  CrossReference,
  MetricalPsalmVersion,
  WestminsterDocument,
  WestminsterSectionSummary,
  WestminsterSection,
  WestminsterSearchResult,
  WestminsterCommentarySource,
  WestminsterCommentaryEntry,
  Resource,
  ResourcePassageLink,
  ResourceLink,
  ResourceSearchResult,
} from "./types";

export const api = {
  listBooks: () => invoke<Book[]>("list_books"),
  listBookAliases: () => invoke<BookAlias[]>("list_book_aliases"),
  getTranslationCoverage: (translationId: number) =>
    invoke<BookCoverage[]>("get_translation_coverage", { translationId }),
  listTranslations: () => invoke<Translation[]>("list_translations"),
  listCommentarySources: () => invoke<CommentarySource[]>("list_commentary_sources"),
  removeTranslation: (translationId: number) =>
    invoke<void>("remove_translation", { translationId }),
  removeCommentarySource: (sourceId: number) =>
    invoke<void>("remove_commentary_source", { sourceId }),
  scanLibrary: () => invoke<ImportReportItem[]>("scan_library"),
  addFile: (sourcePath: string) => invoke<ImportReportItem>("add_file", { sourcePath }),

  getChapter: (translationId: number, bookId: number, chapter: number) =>
    invoke<Verse[]>("get_chapter", { translationId, bookId, chapter }),
  getParallelChapter: (translationIds: number[], bookId: number, chapter: number) =>
    invoke<Record<number, Verse[]>>("get_parallel_chapter", { translationIds, bookId, chapter }),
  compareVerse: (bookId: number, chapter: number, verse: number) =>
    invoke<Verse[]>("compare_verse", { bookId, chapter, verse }),
  getCommentaryForPassage: (sourceId: number, bookId: number, chapter: number, verse?: number) =>
    invoke<CommentaryEntry[]>("get_commentary_for_passage", { sourceId, bookId, chapter, verse: verse ?? null }),
  bookHasCommentary: (sourceId: number, bookId: number) =>
    invoke<boolean>("book_has_commentary", { sourceId, bookId }),
  getCommentaryToc: (sourceId: number, bookId: number) =>
    invoke<CommentarySection[]>("get_commentary_toc", { sourceId, bookId }),
  getSectionEntries: (sectionId: number) =>
    invoke<CommentaryEntry[]>("get_section_entries", { sectionId }),
  getReadingPosition: () => invoke<ReadingPosition | null>("get_reading_position"),
  setReadingPosition: (translationId: number, bookId: number, chapter: number, verse?: number) =>
    invoke<void>("set_reading_position", { translationId, bookId, chapter, verse: verse ?? null }),

  listHighlights: (bookId: number, chapter: number) =>
    invoke<Highlight[]>("list_highlights", { bookId, chapter }),
  createHighlight: (input: {
    bookId: number;
    chapter: number;
    verseStart: number;
    verseEnd: number;
    charStart?: number;
    charEnd?: number;
    color: string;
    style: "highlight" | "underline";
    translationId?: number;
  }) =>
    invoke<Highlight>("create_highlight", {
      bookId: input.bookId,
      chapter: input.chapter,
      verseStart: input.verseStart,
      verseEnd: input.verseEnd,
      charStart: input.charStart ?? null,
      charEnd: input.charEnd ?? null,
      color: input.color,
      style: input.style,
      translationId: input.translationId ?? null,
    }),
  updateHighlight: (id: number, color: string, style: "highlight" | "underline") =>
    invoke<void>("update_highlight", { id, color, style }),
  deleteHighlight: (id: number) => invoke<void>("delete_highlight", { id }),

  listNotesForChapter: (bookId: number, chapter: number) =>
    invoke<Note[]>("list_notes_for_chapter", { bookId, chapter }),
  listAllNotes: () => invoke<Note[]>("list_all_notes"),
  createNote: (bookId: number, chapter: number, verseStart: number, verseEnd: number, body: string, highlightId?: number) =>
    invoke<Note>("create_note", { bookId, chapter, verseStart, verseEnd, body, highlightId: highlightId ?? null }),
  updateNote: (id: number, body: string) => invoke<void>("update_note", { id, body }),
  deleteNote: (id: number) => invoke<void>("delete_note", { id }),

  listChapterNotes: (bookId: number, chapter: number) => invoke<ChapterNote[]>("list_chapter_notes", { bookId, chapter }),
  listAllChapterNotes: () => invoke<ChapterNote[]>("list_all_chapter_notes"),
  createChapterNote: (bookId: number, chapter: number, body: string) =>
    invoke<ChapterNote>("create_chapter_note", { bookId, chapter, body }),
  updateChapterNote: (id: number, body: string) => invoke<void>("update_chapter_note", { id, body }),
  deleteChapterNote: (id: number) => invoke<void>("delete_chapter_note", { id }),

  listBookmarks: () => invoke<Bookmark[]>("list_bookmarks"),
  createBookmark: (bookId: number, chapter: number, verse?: number, label?: string) =>
    invoke<Bookmark>("create_bookmark", { bookId, chapter, verse: verse ?? null, label: label ?? null }),
  deleteBookmark: (id: number) => invoke<void>("delete_bookmark", { id }),

  search: (
    query: string,
    translationIds: number[],
    commentarySourceIds: number[],
    scope: { bookId?: number; testament?: "OT" | "NT" } = {},
    limit = 50,
  ) =>
    invoke<SearchResults>("search", {
      query,
      translationIds,
      commentarySourceIds,
      bookId: scope.bookId ?? null,
      testament: scope.testament ?? null,
      limit,
    }),
  recordSearchQuery: (query: string) => invoke<void>("record_search_query", { query }),
  listRecentSearches: (limit = 10) => invoke<string[]>("list_recent_searches", { limit }),
  listSavedSearches: () => invoke<string[]>("list_saved_searches"),
  setSearchSaved: (query: string, saved: boolean) => invoke<void>("set_search_saved", { query, saved }),
  deleteSearchHistory: (query: string) => invoke<void>("delete_search_history", { query }),

  getStrongsEntry: (id: string) => invoke<StrongsEntry | null>("get_strongs_entry", { id }),
  getConcordance: (strongsId: string) => invoke<ConcordanceEntry[]>("get_concordance", { strongsId }),
  getStrongsEntries: (ids: string[]) => invoke<StrongsEntry[]>("get_strongs_entries", { ids }),
  searchStrongs: (query: string, language?: "hebrew" | "greek", limit = 50) =>
    invoke<StrongsEntry[]>("search_strongs", { query, language: language ?? null, limit }),

  listDictionaryIndex: () => invoke<DictionaryEntrySummary[]>("list_dictionary_index"),
  getDictionaryEntry: (slug: string) => invoke<DictionaryEntry | null>("get_dictionary_entry", { slug }),
  searchDictionary: (query: string, limit = 50) =>
    invoke<DictionaryEntrySummary[]>("search_dictionary", { query, limit }),

  getInterlinearForChapter: (bookId: number, chapter: number) =>
    invoke<Record<number, InterlinearWord[]>>("get_interlinear_for_chapter", { bookId, chapter }),
  getMorphologyForChapter: (bookId: number, chapter: number) =>
    invoke<Record<number, MorphologyWord[]>>("get_morphology_for_chapter", { bookId, chapter }),
  getFootnotesForChapter: (translationId: number, bookId: number, chapter: number) =>
    invoke<Record<number, Footnote[]>>("get_footnotes_for_chapter", { translationId, bookId, chapter }),

  getCrossReferences: (bookId: number, chapter: number, verse: number) =>
    invoke<CrossReference[]>("get_cross_references", { bookId, chapter, verse }),
  getMetricalPsalm: (psalm: number) => invoke<MetricalPsalmVersion[]>("get_metrical_psalm", { psalm }),

  listWestminsterDocuments: () => invoke<WestminsterDocument[]>("list_westminster_documents"),
  listWestminsterSections: (documentId: number) =>
    invoke<WestminsterSectionSummary[]>("list_westminster_sections", { documentId }),
  getWestminsterSection: (id: number) => invoke<WestminsterSection | null>("get_westminster_section", { id }),
  searchWestminster: (query: string, limit = 50) =>
    invoke<WestminsterSearchResult[]>("search_westminster", { query, limit }),
  listWestminsterCommentarySources: () =>
    invoke<WestminsterCommentarySource[]>("list_westminster_commentary_sources"),
  getWestminsterCommentary: (sourceId: number, chapter: number) =>
    invoke<WestminsterCommentaryEntry[]>("get_westminster_commentary", { sourceId, chapter }),

  listResources: () => invoke<Resource[]>("list_resources"),
  getResource: (id: number) => invoke<Resource | null>("get_resource", { id }),
  getResourceText: (id: number) => invoke<string | null>("get_resource_text", { id }),
  addResource: (sourcePath: string, title: string, author?: string) =>
    invoke<Resource>("add_resource", { sourcePath, title, author: author ?? null }),
  deleteResource: (id: number) => invoke<void>("delete_resource", { id }),
  searchResources: (query: string, limit = 50) => invoke<ResourceSearchResult[]>("search_resources", { query, limit }),

  listResourcePassageLinksForChapter: (bookId: number, chapter: number) =>
    invoke<ResourcePassageLink[]>("list_resource_passage_links_for_chapter", { bookId, chapter }),
  listResourcePassageLinksForResource: (resourceId: number) =>
    invoke<ResourcePassageLink[]>("list_resource_passage_links_for_resource", { resourceId }),
  createResourcePassageLink: (input: {
    resourceId: number;
    bookId: number;
    chapter: number;
    verseStart?: number;
    verseEnd?: number;
    location?: string;
    label?: string;
  }) =>
    invoke<ResourcePassageLink>("create_resource_passage_link", {
      resourceId: input.resourceId,
      bookId: input.bookId,
      chapter: input.chapter,
      verseStart: input.verseStart ?? null,
      verseEnd: input.verseEnd ?? null,
      location: input.location ?? null,
      label: input.label ?? null,
    }),
  deleteResourcePassageLink: (id: number) => invoke<void>("delete_resource_passage_link", { id }),

  listResourceLinks: (resourceId: number) => invoke<ResourceLink[]>("list_resource_links", { resourceId }),
  createResourceLink: (fromResourceId: number, toResourceId: number, fromLocation?: string, label?: string) =>
    invoke<ResourceLink>("create_resource_link", { fromResourceId, toResourceId, fromLocation: fromLocation ?? null, label: label ?? null }),
  deleteResourceLink: (id: number) => invoke<void>("delete_resource_link", { id }),

  listSermonNotes: () => invoke<SermonNote[]>("list_sermon_notes"),
  getSermonNote: (id: number) => invoke<SermonNote | null>("get_sermon_note", { id }),
  createSermonNote: (input: {
    date: string;
    preacher?: string;
    title?: string;
    passageText?: string;
    outline?: string;
    application?: string;
  }) =>
    invoke<SermonNote>("create_sermon_note", {
      date: input.date,
      preacher: input.preacher ?? null,
      title: input.title ?? null,
      passageText: input.passageText ?? null,
      outline: input.outline ?? null,
      application: input.application ?? null,
    }),
  updateSermonNote: (
    id: number,
    input: { date: string; preacher?: string; title?: string; passageText?: string; outline?: string; application?: string },
  ) =>
    invoke<void>("update_sermon_note", {
      id,
      date: input.date,
      preacher: input.preacher ?? null,
      title: input.title ?? null,
      passageText: input.passageText ?? null,
      outline: input.outline ?? null,
      application: input.application ?? null,
    }),
  deleteSermonNote: (id: number) => invoke<void>("delete_sermon_note", { id }),
  addSermonNotePassage: (sermonNoteId: number, bookId: number, chapter: number, verseStart?: number, verseEnd?: number) =>
    invoke<SermonNotePassageLink>("add_sermon_note_passage", {
      sermonNoteId,
      bookId,
      chapter,
      verseStart: verseStart ?? null,
      verseEnd: verseEnd ?? null,
    }),
  deleteSermonNotePassage: (id: number) => invoke<void>("delete_sermon_note_passage", { id }),
  searchSermonNotes: (query: string, limit = 50) => invoke<SermonNote[]>("search_sermon_notes", { query, limit }),

  listPrayerEntries: () => invoke<PrayerEntry[]>("list_prayer_entries"),
  createPrayerEntry: (input: {
    entryDate: string;
    adoration?: string;
    confession?: string;
    thanksgiving?: string;
    supplication?: string;
    bookId?: number;
    chapter?: number;
    verseStart?: number;
    verseEnd?: number;
  }) =>
    invoke<PrayerEntry>("create_prayer_entry", {
      entryDate: input.entryDate,
      adoration: input.adoration ?? null,
      confession: input.confession ?? null,
      thanksgiving: input.thanksgiving ?? null,
      supplication: input.supplication ?? null,
      bookId: input.bookId ?? null,
      chapter: input.chapter ?? null,
      verseStart: input.verseStart ?? null,
      verseEnd: input.verseEnd ?? null,
    }),
  updatePrayerEntry: (
    id: number,
    input: {
      entryDate: string;
      adoration?: string;
      confession?: string;
      thanksgiving?: string;
      supplication?: string;
      bookId?: number;
      chapter?: number;
      verseStart?: number;
      verseEnd?: number;
    },
  ) =>
    invoke<void>("update_prayer_entry", {
      id,
      entryDate: input.entryDate,
      adoration: input.adoration ?? null,
      confession: input.confession ?? null,
      thanksgiving: input.thanksgiving ?? null,
      supplication: input.supplication ?? null,
      bookId: input.bookId ?? null,
      chapter: input.chapter ?? null,
      verseStart: input.verseStart ?? null,
      verseEnd: input.verseEnd ?? null,
    }),
  deletePrayerEntry: (id: number) => invoke<void>("delete_prayer_entry", { id }),
  searchPrayerEntries: (query: string, limit = 50) => invoke<PrayerEntry[]>("search_prayer_entries", { query, limit }),

  listMemoryVerses: () => invoke<MemoryVerse[]>("list_memory_verses"),
  listDueMemoryVerses: () => invoke<MemoryVerse[]>("list_due_memory_verses"),
  createMemoryVerse: (
    bookId: number,
    chapter: number,
    verseStart: number,
    verseEnd: number,
    translationId: number | undefined,
    mode: "first-letter" | "blank-word",
  ) => invoke<MemoryVerse>("create_memory_verse", { bookId, chapter, verseStart, verseEnd, translationId: translationId ?? null, mode }),
  setMemoryVerseMode: (id: number, mode: "first-letter" | "blank-word") =>
    invoke<void>("set_memory_verse_mode", { id, mode }),
  deleteMemoryVerse: (id: number) => invoke<void>("delete_memory_verse", { id }),
  reviewMemoryVerse: (id: number, quality: number) => invoke<MemoryVerse>("review_memory_verse", { id, quality }),

  listReadingPlans: () => invoke<ReadingPlan[]>("list_reading_plans"),
  getReadingPlanDays: (planCode: string) => invoke<ReadingPlanDay[]>("get_reading_plan_days", { planCode }),
  listReadingPlanProgress: () => invoke<ReadingPlanProgress[]>("list_reading_plan_progress"),
  getReadingPlanProgress: (planCode: string) => invoke<ReadingPlanProgress | null>("get_reading_plan_progress", { planCode }),
  startReadingPlan: (planCode: string, startDate: string) =>
    invoke<ReadingPlanProgress>("start_reading_plan", { planCode, startDate }),
  abandonReadingPlan: (planCode: string) => invoke<void>("abandon_reading_plan", { planCode }),
  markReadingPlanDay: (planCode: string, dayNumber: number) =>
    invoke<ReadingPlanProgress>("mark_reading_plan_day", { planCode, dayNumber }),
  unmarkReadingPlanDay: (planCode: string, dayNumber: number) =>
    invoke<ReadingPlanProgress>("unmark_reading_plan_day", { planCode, dayNumber }),

  listHarmonySections: () => invoke<HarmonySection[]>("list_harmony_sections"),

  getRedLetterRanges: (bookId: number, chapter: number) =>
    invoke<RedLetterRange[]>("get_red_letter_ranges", { bookId, chapter }),
};
