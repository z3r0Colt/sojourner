import { invoke } from "@tauri-apps/api/core";
import type {
  Book,
  BookCoverage,
  BookAlias,
  Translation,
  Verse,
  Passage,
  PassageRef,
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
  PrayerEntry,
  PrayerEntryMode,
  PrayerListPerson,
  MemoryVerse,
  MemoryMode,
  CatechismMemory,
  ReadingPlan,
  ReadingPlanDay,
  ReadingPlanProgress,
  HarmonySection,
  RedLetterRange,
  BackupInfo,
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
  WestminsterPassageMatch,
  DoctrineTopic,
  Resource,
  ResourcePassageLink,
  ResourceLink,
  ResourceSearchResult,
  BulkImportOutcome,
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
  /** Text for one or many verse ranges in one round trip, in `refs` order. */
  getPassages: (translationId: number, refs: PassageRef[]) =>
    invoke<Passage[]>("get_passages", { translationId, refs }),
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
  addNoteTag: (noteId: number, tag: string) => invoke<void>("add_note_tag", { noteId, tag }),
  removeNoteTag: (noteId: number, tag: string) => invoke<void>("remove_note_tag", { noteId, tag }),
  listAllNoteTags: () => invoke<string[]>("list_all_note_tags"),
  listAllNoteTagsByNote: () => invoke<[number, string][]>("list_all_note_tags_by_note"),

  listChapterNotes: (bookId: number, chapter: number) => invoke<ChapterNote[]>("list_chapter_notes", { bookId, chapter }),
  listAllChapterNotes: () => invoke<ChapterNote[]>("list_all_chapter_notes"),
  createChapterNote: (bookId: number, chapter: number, body: string) =>
    invoke<ChapterNote>("create_chapter_note", { bookId, chapter, body }),
  updateChapterNote: (id: number, body: string) => invoke<void>("update_chapter_note", { id, body }),
  deleteChapterNote: (id: number) => invoke<void>("delete_chapter_note", { id }),
  addChapterNoteTag: (chapterNoteId: number, tag: string) => invoke<void>("add_chapter_note_tag", { chapterNoteId, tag }),
  removeChapterNoteTag: (chapterNoteId: number, tag: string) => invoke<void>("remove_chapter_note_tag", { chapterNoteId, tag }),
  listAllChapterNoteTags: () => invoke<string[]>("list_all_chapter_note_tags"),
  listAllChapterNoteTagsByNote: () => invoke<[number, string][]>("list_all_chapter_note_tags_by_note"),

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
  findDictionaryEntryByTerm: (term: string) => invoke<DictionaryEntrySummary | null>("find_dictionary_entry_by_term", { term }),
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
  getConfessionForPassage: (bookId: number, chapter: number, verse: number) =>
    invoke<WestminsterPassageMatch[]>("get_confession_for_passage", { bookId, chapter, verse }),
  searchWestminster: (query: string, limit = 50) =>
    invoke<WestminsterSearchResult[]>("search_westminster", { query, limit }),
  listWestminsterCommentarySources: () =>
    invoke<WestminsterCommentarySource[]>("list_westminster_commentary_sources"),
  getWestminsterCommentary: (sourceId: number, chapter: number) =>
    invoke<WestminsterCommentaryEntry[]>("get_westminster_commentary", { sourceId, chapter }),
  listDoctrineTopics: () => invoke<DoctrineTopic[]>("list_doctrine_topics"),
  getDoctrineTopic: (id: number) => invoke<DoctrineTopic | null>("get_doctrine_topic", { id }),

  listResources: () => invoke<Resource[]>("list_resources"),
  getResource: (id: number) => invoke<Resource | null>("get_resource", { id }),
  getResourceText: (id: number) => invoke<string | null>("get_resource_text", { id }),
  addResource: (sourcePath: string, title: string, author?: string) =>
    invoke<Resource>("add_resource", { sourcePath, title, author: author ?? null }),
  bulkImportResources: (folderPath: string) => invoke<BulkImportOutcome>("bulk_import_resources", { folderPath }),
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
  addResourceTag: (resourceId: number, tag: string) => invoke<void>("add_resource_tag", { resourceId, tag }),
  removeResourceTag: (resourceId: number, tag: string) => invoke<void>("remove_resource_tag", { resourceId, tag }),
  listAllResourceTags: () => invoke<string[]>("list_all_resource_tags"),
  listAllResourceTagsByResource: () => invoke<[number, string][]>("list_all_resource_tags_by_resource"),
  listResourcesByTag: (tag: string) => invoke<Resource[]>("list_resources_by_tag", { tag }),
  suggestResourcesForPassage: (bookId: number, chapter: number) =>
    invoke<Resource[]>("suggest_resources_for_passage", { bookId, chapter }),
  suggestResourcesForTopic: (topicId: number) => invoke<Resource[]>("suggest_resources_for_topic", { topicId }),

  exportNote: (noteId: number, destPath: string) => invoke<void>("export_note", { noteId, destPath }),
  exportChapterNote: (chapterNoteId: number, destPath: string) => invoke<void>("export_chapter_note", { chapterNoteId, destPath }),
  exportPrayerEntry: (prayerEntryId: number, destPath: string) => invoke<void>("export_prayer_entry", { prayerEntryId, destPath }),

  listPrayerEntries: () => invoke<PrayerEntry[]>("list_prayer_entries"),
  createPrayerEntry: (input: {
    entryDate: string;
    mode: PrayerEntryMode;
    adoration?: string;
    confession?: string;
    thanksgiving?: string;
    supplication?: string;
    freeText?: string;
    bookId?: number;
    chapter?: number;
    verseStart?: number;
    verseEnd?: number;
  }) =>
    invoke<PrayerEntry>("create_prayer_entry", {
      entryDate: input.entryDate,
      mode: input.mode,
      adoration: input.adoration ?? null,
      confession: input.confession ?? null,
      thanksgiving: input.thanksgiving ?? null,
      supplication: input.supplication ?? null,
      freeText: input.freeText ?? null,
      bookId: input.bookId ?? null,
      chapter: input.chapter ?? null,
      verseStart: input.verseStart ?? null,
      verseEnd: input.verseEnd ?? null,
    }),
  updatePrayerEntry: (
    id: number,
    input: {
      entryDate: string;
      mode: PrayerEntryMode;
      adoration?: string;
      confession?: string;
      thanksgiving?: string;
      supplication?: string;
      freeText?: string;
      bookId?: number;
      chapter?: number;
      verseStart?: number;
      verseEnd?: number;
    },
  ) =>
    invoke<void>("update_prayer_entry", {
      id,
      entryDate: input.entryDate,
      mode: input.mode,
      adoration: input.adoration ?? null,
      confession: input.confession ?? null,
      thanksgiving: input.thanksgiving ?? null,
      supplication: input.supplication ?? null,
      freeText: input.freeText ?? null,
      bookId: input.bookId ?? null,
      chapter: input.chapter ?? null,
      verseStart: input.verseStart ?? null,
      verseEnd: input.verseEnd ?? null,
    }),
  deletePrayerEntry: (id: number) => invoke<void>("delete_prayer_entry", { id }),
  searchPrayerEntries: (query: string, limit = 50) => invoke<PrayerEntry[]>("search_prayer_entries", { query, limit }),
  addPrayerEntryTag: (prayerEntryId: number, tag: string) => invoke<void>("add_prayer_entry_tag", { prayerEntryId, tag }),
  removePrayerEntryTag: (prayerEntryId: number, tag: string) => invoke<void>("remove_prayer_entry_tag", { prayerEntryId, tag }),
  listAllPrayerEntryTags: () => invoke<string[]>("list_all_prayer_entry_tags"),
  listAllPrayerEntryTagsByEntry: () => invoke<[number, string][]>("list_all_prayer_entry_tags_by_entry"),

  listPrayerListPeople: () => invoke<PrayerListPerson[]>("list_prayer_list_people"),
  createPrayerListPerson: (input: { name: string; category?: string; notes?: string }) =>
    invoke<PrayerListPerson>("create_prayer_list_person", {
      name: input.name,
      category: input.category ?? null,
      notes: input.notes ?? null,
    }),
  updatePrayerListPerson: (id: number, input: { name: string; category?: string; notes?: string }) =>
    invoke<void>("update_prayer_list_person", {
      id,
      name: input.name,
      category: input.category ?? null,
      notes: input.notes ?? null,
    }),
  setPrayerListPersonActive: (id: number, active: boolean) => invoke<void>("set_prayer_list_person_active", { id, active }),
  markPrayerListPersonPrayed: (id: number) => invoke<void>("mark_prayer_list_person_prayed", { id }),
  markPrayerListPersonAnswered: (id: number, answerNote?: string) =>
    invoke<void>("mark_prayer_list_person_answered", { id, answerNote: answerNote ?? null }),
  deletePrayerListPerson: (id: number) => invoke<void>("delete_prayer_list_person", { id }),

  listMemoryVerses: () => invoke<MemoryVerse[]>("list_memory_verses"),
  listDueMemoryVerses: () => invoke<MemoryVerse[]>("list_due_memory_verses"),
  createMemoryVerse: (
    bookId: number,
    chapter: number,
    verseStart: number,
    verseEnd: number,
    translationId: number | undefined,
    mode: MemoryMode,
  ) => invoke<MemoryVerse>("create_memory_verse", { bookId, chapter, verseStart, verseEnd, translationId: translationId ?? null, mode }),
  setMemoryVerseMode: (id: number, mode: MemoryMode) =>
    invoke<void>("set_memory_verse_mode", { id, mode }),
  deleteMemoryVerse: (id: number) => invoke<void>("delete_memory_verse", { id }),
  reviewMemoryVerse: (id: number, quality: number) => invoke<MemoryVerse>("review_memory_verse", { id, quality }),
  setMemoryVerseDoctrinalLink: (id: number, westminsterSectionId: number | null, doctrinalNote: string | null) =>
    invoke<void>("set_memory_verse_doctrinal_link", { id, westminsterSectionId, doctrinalNote }),

  listCatechismMemory: () => invoke<CatechismMemory[]>("list_catechism_memory"),
  listDueCatechismMemory: () => invoke<CatechismMemory[]>("list_due_catechism_memory"),
  createCatechismMemory: (westminsterSectionId: number, mode: MemoryMode) =>
    invoke<CatechismMemory>("create_catechism_memory", { westminsterSectionId, mode }),
  setCatechismMemoryMode: (id: number, mode: MemoryMode) => invoke<void>("set_catechism_memory_mode", { id, mode }),
  deleteCatechismMemory: (id: number) => invoke<void>("delete_catechism_memory", { id }),
  reviewCatechismMemory: (id: number, quality: number) => invoke<CatechismMemory>("review_catechism_memory", { id, quality }),

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

  createBackup: () => invoke<string>("create_backup"),
  listBackups: () => invoke<BackupInfo[]>("list_backups"),
  exportDatabase: (destPath: string) => invoke<void>("export_database", { destPath }),
  stageImport: (sourcePath: string) => invoke<void>("stage_import", { sourcePath }),
  stageRestore: (fileName: string) => invoke<void>("stage_restore", { fileName }),
  quickCheck: () => invoke<string[]>("quick_check"),
  getBackupSyncFolder: () => invoke<string | null>("get_backup_sync_folder"),
  setBackupSyncFolder: (folder: string | null) => invoke<void>("set_backup_sync_folder", { folder }),
  getLogsDir: () => invoke<string>("get_logs_dir"),

  // Key/value preferences stored in user.db (survive reinstall, travel with
  // backups). Values are raw strings; `useSetting` layers JSON on top.
  getSetting: (key: string) => invoke<string | null>("get_setting", { key }),
  setSetting: (key: string, value: string) => invoke<void>("set_setting", { key, value }),
  deleteSetting: (key: string) => invoke<void>("delete_setting", { key }),
  listSettings: (prefix: string) => invoke<[string, string][]>("list_settings", { prefix }),
};
