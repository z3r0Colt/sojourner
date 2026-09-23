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
  ReadingLogEntry,
  SearchResults,
  SearchFacets,
  SearchScope,
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
  PlanReadingInput,
  ScheduleEntry,
  Harmony,
  HarmonyDetail,
  RedLetterRange,
  BackupInfo,
  Stats,
  AtlasJourney,
  AtlasPlace,
  AtlasPlaceVerse,
  DictionaryEntry,
  DictionaryEntrySummary,
  IsbeEntry,
  IsbeEntrySummary,
  Pronunciation,
  IsbePassageEntry,
  IsbeSearchResult,
  InterlinearWord,
  MorphologyWord,
  Footnote,
  ChapterNote,
  NoteRefInput,
  NoteKind,
  Backlink,
  TrashContents,
  TrashKind,
  UpdateCheck,
  CrossReference,
  MetricalPsalmVersion,
  PsalmTune,
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
  Sermon,
  SermonEvent,
  SermonFilter,
  SermonForChapter,
  SermonInput,
  SermonSeries,
  SpeakingRate,
  Illustration,
  IllustrationFilter,
  IllustrationInput,
  IllustrationUse,
  PickKind,
  PickedPath,
  PackStatus,
  PackInstallOutcome,
} from "./types";

export const api = {
  // --- File dialogs --------------------------------------------------------
  //
  // The dialogs run in Rust, not here. What comes back is a single-use token
  // standing for the chosen path (and a string to show the user); every
  // command that reads or writes a user-chosen file takes that token. The
  // page therefore never holds a filesystem path, and cannot name one -- a
  // command called from the console with no dialog behind it has nothing to
  // write to. `null` means the user cancelled.
  pickSavePath: (kind: PickKind, defaultName?: string) =>
    invoke<PickedPath | null>("pick_save_path", { kind, defaultName: defaultName ?? null }),
  pickOpenPath: (kind: PickKind) => invoke<PickedPath | null>("pick_open_path", { kind }),
  pickFolder: () => invoke<PickedPath | null>("pick_folder"),

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
  addFile: (token: string) => invoke<ImportReportItem>("add_file", { token }),

  // --- The book library pack ----------------------------------------------
  //
  // The shipped books are not in the installer; they arrive in a pack the
  // reader fetches from the releases page and installs from a file. Nothing
  // here downloads anything -- see `crate::pack` for why that is deliberate.
  packStatus: () => invoke<PackStatus>("pack_status"),
  /** Long-running. Listen on `pack-install-progress` for a progress bar. */
  installPack: (token: string) => invoke<PackInstallOutcome>("install_pack", { token }),
  removePack: () => invoke<void>("remove_pack"),

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
  /** Recently read chapters, newest first, each once (the reading log). */
  listReadingLog: (limit = 12) => invoke<ReadingLogEntry[]>("list_reading_log", { limit }),

  listHighlights: (bookId: number, chapter: number) =>
    invoke<Highlight[]>("list_highlights", { bookId, chapter }),
  /** Every highlight in Bible order (the Highlights page). */
  listAllHighlights: () => invoke<Highlight[]>("list_all_highlights"),
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
  createNote: (bookId: number, chapter: number, verseStart: number, verseEnd: number, body: string, highlightId?: number, refs?: NoteRefInput[]) =>
    invoke<Note>("create_note", { bookId, chapter, verseStart, verseEnd, body, highlightId: highlightId ?? null, refs: refs ?? null }),
  updateNote: (id: number, body: string, refs?: NoteRefInput[]) => invoke<void>("update_note", { id, body, refs: refs ?? null }),
  // Backlinks: the references a note's body mentions (kept per save, and
  // backfilled once for older notes) and the reverse lookup for a chapter.
  setNoteRefs: (kind: NoteKind, id: number, refs: NoteRefInput[]) => invoke<void>("set_note_refs", { kind, id, refs }),
  listBacklinks: (bookId: number, chapter: number) => invoke<Backlink[]>("list_backlinks", { bookId, chapter }),
  deleteNote: (id: number) => invoke<void>("delete_note", { id }),
  addNoteTag: (noteId: number, tag: string) => invoke<void>("add_note_tag", { noteId, tag }),
  removeNoteTag: (noteId: number, tag: string) => invoke<void>("remove_note_tag", { noteId, tag }),
  listAllNoteTags: () => invoke<string[]>("list_all_note_tags"),
  listAllNoteTagsByNote: () => invoke<[number, string][]>("list_all_note_tags_by_note"),

  listChapterNotes: (bookId: number, chapter: number) => invoke<ChapterNote[]>("list_chapter_notes", { bookId, chapter }),
  listAllChapterNotes: () => invoke<ChapterNote[]>("list_all_chapter_notes"),
  createChapterNote: (bookId: number, chapter: number, body: string, refs?: NoteRefInput[]) =>
    invoke<ChapterNote>("create_chapter_note", { bookId, chapter, body, refs: refs ?? null }),
  updateChapterNote: (id: number, body: string, refs?: NoteRefInput[]) => invoke<void>("update_chapter_note", { id, body, refs: refs ?? null }),
  deleteChapterNote: (id: number) => invoke<void>("delete_chapter_note", { id }),
  addChapterNoteTag: (chapterNoteId: number, tag: string) => invoke<void>("add_chapter_note_tag", { chapterNoteId, tag }),
  removeChapterNoteTag: (chapterNoteId: number, tag: string) => invoke<void>("remove_chapter_note_tag", { chapterNoteId, tag }),
  listAllChapterNoteTags: () => invoke<string[]>("list_all_chapter_note_tags"),
  listAllChapterNoteTagsByNote: () => invoke<[number, string][]>("list_all_chapter_note_tags_by_note"),

  // Trash: deleting a note, chapter note, or prayer entry soft-deletes it
  // for thirty days; these restore or permanently remove one item.
  listTrash: () => invoke<TrashContents>("list_trash"),
  restoreTrashItem: (kind: TrashKind, id: number) => invoke<boolean>("restore_trash_item", { kind, id }),
  purgeTrashItem: (kind: TrashKind, id: number) => invoke<boolean>("purge_trash_item", { kind, id }),

  listBookmarks: () => invoke<Bookmark[]>("list_bookmarks"),
  createBookmark: (bookId: number, chapter: number, verse?: number, label?: string) =>
    invoke<Bookmark>("create_bookmark", { bookId, chapter, verse: verse ?? null, label: label ?? null }),
  deleteBookmark: (id: number) => invoke<void>("delete_bookmark", { id }),

  search: (
    query: string,
    translationIds: number[],
    commentarySourceIds: number[],
    scope: SearchScope = {},
    limit = 50,
  ) =>
    invoke<SearchResults>("search", {
      query,
      translationIds,
      commentarySourceIds,
      bookId: scope.bookId ?? null,
      testament: scope.testament ?? null,
      wholeWords: scope.wholeWords ?? false,
      passageOrder: scope.passageOrder ?? false,
      olderSpellings: scope.olderSpellings ?? false,
      limit,
    }),
  searchFacets: (query: string, kind: "verses" | "commentary", translationIds: number[], commentarySourceIds: number[], scope: SearchScope = {}) =>
    invoke<SearchFacets>("search_facets", {
      query,
      kind,
      translationIds,
      commentarySourceIds,
      bookId: scope.bookId ?? null,
      testament: scope.testament ?? null,
      wholeWords: scope.wholeWords ?? false,
      olderSpellings: scope.olderSpellings ?? false,
    }),
  suggestSearchWords: (prefix: string, limit = 8) => invoke<[string, number][]>("suggest_search_words", { prefix, limit }),
  didYouMean: (word: string) => invoke<string[]>("did_you_mean", { word }),
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

  listIsbeIndex: () => invoke<IsbeEntrySummary[]>("list_isbe_index"),
  listPronunciations: () => invoke<Pronunciation[]>("list_pronunciations"),
  getIsbeEntry: (slug: string) => invoke<IsbeEntry | null>("get_isbe_entry", { slug }),
  findIsbeEntryByTerm: (term: string) => invoke<IsbeEntrySummary | null>("find_isbe_entry_by_term", { term }),
  findDictionaryEntryForIsbe: (slug: string) =>
    invoke<DictionaryEntrySummary | null>("find_dictionary_entry_for_isbe", { slug }),
  searchIsbe: (query: string, limit = 50) => invoke<IsbeEntrySummary[]>("search_isbe", { query, limit }),
  searchIsbeGlobal: (query: string, limit = 50) => invoke<IsbeSearchResult[]>("search_isbe_global", { query, limit }),
  isbeForPassage: (bookId: number, chapter: number, verse?: number | null, limit = 40) =>
    invoke<IsbePassageEntry[]>("isbe_for_passage", { bookId, chapter, verse: verse ?? null, limit }),

  listAtlasPlaces: () => invoke<AtlasPlace[]>("list_atlas_places"),
  getAtlasPlace: (slug: string) => invoke<AtlasPlace | null>("get_atlas_place", { slug }),
  getAtlasPlaceVerses: (slug: string) => invoke<AtlasPlaceVerse[]>("get_atlas_place_verses", { slug }),
  placesInPassage: (bookId: number, chapter: number, verse?: number | null) =>
    invoke<AtlasPlace[]>("places_in_passage", { bookId, chapter, verse: verse ?? null }),
  searchAtlasPlaces: (query: string, limit = 50) => invoke<AtlasPlace[]>("search_atlas_places", { query, limit }),
  listAtlasJourneys: () => invoke<AtlasJourney[]>("list_atlas_journeys"),

  getInterlinearForChapter: (bookId: number, chapter: number) =>
    invoke<Record<number, InterlinearWord[]>>("get_interlinear_for_chapter", { bookId, chapter }),
  getMorphologyForChapter: (bookId: number, chapter: number) =>
    invoke<Record<number, MorphologyWord[]>>("get_morphology_for_chapter", { bookId, chapter }),
  getFootnotesForChapter: (translationId: number, bookId: number, chapter: number) =>
    invoke<Record<number, Footnote[]>>("get_footnotes_for_chapter", { translationId, bookId, chapter }),

  getCrossReferences: (bookId: number, chapter: number, verse: number) =>
    invoke<CrossReference[]>("get_cross_references", { bookId, chapter, verse }),
  getMetricalPsalm: (psalm: number) => invoke<MetricalPsalmVersion[]>("get_metrical_psalm", { psalm }),
  listPsalmTunes: (metre?: string) => invoke<PsalmTune[]>("list_psalm_tunes", { metre: metre ?? null }),

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
  addResource: (token: string, title: string, author?: string) =>
    invoke<Resource>("add_resource", { token, title, author: author ?? null }),
  bulkImportResources: (token: string) => invoke<BulkImportOutcome>("bulk_import_resources", { token }),
  reextractResource: (id: number) => invoke<Resource>("reextract_resource", { id }),
  updateResource: (id: number, title: string, author: string | null) => invoke<Resource>("update_resource", { id, title, author }),
  setAuthorForResources: (ids: number[], author: string | null) => invoke<number>("set_author_for_resources", { ids, author }),
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

  exportNote: (noteId: number, token: string) => invoke<void>("export_note", { noteId, token }),
  exportChapterNote: (chapterNoteId: number, token: string) => invoke<void>("export_chapter_note", { chapterNoteId, token }),
  exportPrayerEntry: (prayerEntryId: number, token: string) => invoke<void>("export_prayer_entry", { prayerEntryId, token }),

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
  setMemoryVerseTranslation: (id: number, translationId: number | null) =>
    invoke<void>("set_memory_verse_translation", { id, translationId }),
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
  /** Catch-up (F3.3): move the start date forward by `days` (negative moves it back). */
  shiftReadingPlanStart: (planCode: string, days: number) =>
    invoke<ReadingPlanProgress>("shift_reading_plan_start", { planCode, days }),
  /** Catch-up (F3.3): mark or unmark several days in one call. */
  setReadingPlanDays: (planCode: string, dayNumbers: number[], done: boolean) =>
    invoke<ReadingPlanProgress>("set_reading_plan_days", { planCode, dayNumbers, done }),
  // Custom plans (F4.2). `days[i]` holds day i + 1's readings.
  createUserReadingPlan: (input: { title: string; description?: string; weekdays: number[] | null; days: PlanReadingInput[][] }) =>
    invoke<ReadingPlan>("create_user_reading_plan", { title: input.title, description: input.description ?? null, weekdays: input.weekdays, days: input.days }),
  updateUserReadingPlan: (planCode: string, input: { title: string; description?: string; weekdays: number[] | null; days: PlanReadingInput[][] }) =>
    invoke<ReadingPlan>("update_user_reading_plan", { planCode, title: input.title, description: input.description ?? null, weekdays: input.weekdays, days: input.days }),
  deleteUserReadingPlan: (planCode: string) => invoke<boolean>("delete_user_reading_plan", { planCode }),
  /** Catch-up (F4.2): put `dayNumber` on `date` (or the next reading day) and move the start to match. */
  reanchorReadingPlan: (planCode: string, dayNumber: number, date: string) =>
    invoke<ReadingPlanProgress>("reanchor_reading_plan", { planCode, dayNumber, date }),
  /** Catch-up (F4.2): spread the overdue and coming week's days over the next `window` days. */
  spreadReadingPlan: (planCode: string, today: string, window = 7) =>
    invoke<ReadingPlanProgress>("spread_reading_plan", { planCode, today, window }),
  /** Replaces a plan's schedule rows (the undo of a spread). */
  setReadingPlanSchedule: (planCode: string, entries: ScheduleEntry[]) =>
    invoke<ReadingPlanProgress>("set_reading_plan_schedule", { planCode, entries }),

  listHarmonies: () => invoke<Harmony[]>("list_harmonies"),
  getHarmony: (code: string | null) => invoke<HarmonyDetail | null>("get_harmony", { code }),

  getRedLetterRanges: (bookId: number, chapter: number) =>
    invoke<RedLetterRange[]>("get_red_letter_ranges", { bookId, chapter }),

  createBackup: () => invoke<string>("create_backup"),
  listBackups: () => invoke<BackupInfo[]>("list_backups"),
  exportDatabase: (token: string) => invoke<void>("export_database", { token }),
  stageImport: (token: string) => invoke<void>("stage_import", { token }),
  stageRestore: (fileName: string) => invoke<void>("stage_restore", { fileName }),
  quickCheck: () => invoke<string[]>("quick_check"),
  getBackupSyncFolder: () => invoke<string | null>("get_backup_sync_folder"),
  /** `token` from `pickFolder`, or null to clear the setting. */
  setBackupSyncFolder: (token: string | null) => invoke<void>("set_backup_sync_folder", { token }),
  getLogsDir: () => invoke<string>("get_logs_dir"),
  /** Every count the Stats block shows (F3.5), in one round trip. */
  getStats: () => invoke<Stats>("get_stats"),

  /** The only call in this file that leaves the machine, and the only one the
   * app never makes on its own -- it runs when the reader presses "Check for
   * updates" in Settings → About, and never otherwise. Downloads nothing; the
   * answer carries a link. */
  checkForUpdate: () => invoke<UpdateCheck>("check_for_update"),
  /** The running version, for About to show. Touches no network. */
  appVersion: () => invoke<string>("app_version"),
  /** The Windows accent color as "#rrggbb", or null off Windows (F3.8). */
  getSystemAccent: () => invoke<string | null>("get_system_accent"),

  // Key/value preferences stored in user.db (survive reinstall, travel with
  // backups). Values are raw strings; `useSetting` layers JSON on top.
  getSetting: (key: string) => invoke<string | null>("get_setting", { key }),
  setSetting: (key: string, value: string) => invoke<void>("set_setting", { key, value }),
  deleteSetting: (key: string) => invoke<void>("delete_setting", { key }),
  listSettings: (prefix: string) => invoke<[string, string][]>("list_settings", { prefix }),

  // --- Sermon Builder ------------------------------------------------------

  listSermons: (filter: SermonFilter = {}) => invoke<Sermon[]>("list_sermons", { filter }),
  getSermon: (sermonId: number) => invoke<Sermon | null>("get_sermon", { sermonId }),
  createSermon: (input: SermonInput = {}) => invoke<Sermon>("create_sermon", { input }),
  /** One save for the fields, the passages, and the sources together. */
  updateSermon: (sermonId: number, input: SermonInput) => invoke<Sermon>("update_sermon", { sermonId, input }),
  setSermonStage: (sermonId: number, stage: string) => invoke<void>("set_sermon_stage", { sermonId, stage }),
  /** Soft delete: to the Trash, restorable for thirty days. */
  deleteSermon: (sermonId: number) => invoke<void>("delete_sermon", { sermonId }),
  duplicateSermon: (sermonId: number) => invoke<Sermon>("duplicate_sermon", { sermonId }),
  listAllSermonTags: () => invoke<string[]>("list_all_sermon_tags"),
  searchSermons: (query: string, limit = 30) => invoke<Sermon[]>("search_sermons", { query, limit }),
  listSermonsForChapter: (bookId: number, chapter: number) =>
    invoke<SermonForChapter[]>("list_sermons_for_chapter", { bookId, chapter }),

  addSermonEvent: (input: {
    sermonId: number;
    kind: "rehearsal" | "preaching";
    date: string;
    venue?: string | null;
    durationSeconds?: number | null;
    wordCount?: number | null;
    notes?: string | null;
  }) =>
    invoke<SermonEvent>("add_sermon_event", {
      sermonId: input.sermonId,
      kind: input.kind,
      date: input.date,
      venue: input.venue ?? null,
      durationSeconds: input.durationSeconds ?? null,
      wordCount: input.wordCount ?? null,
      notes: input.notes ?? null,
    }),
  deleteSermonEvent: (eventId: number) => invoke<boolean>("delete_sermon_event", { eventId }),
  listSermonEvents: (sermonId: number) => invoke<SermonEvent[]>("list_sermon_events", { sermonId }),
  /** Null until two timed runs exist; the setting stands until then. */
  getSpeakingRate: () => invoke<SpeakingRate | null>("get_speaking_rate"),

  listSermonSeries: () => invoke<SermonSeries[]>("list_sermon_series"),
  createSermonSeries: (title: string, description?: string | null) =>
    invoke<SermonSeries>("create_sermon_series", { title, description: description ?? null }),
  updateSermonSeries: (seriesId: number, title: string, description: string | null, planCode: string | null) =>
    invoke<SermonSeries>("update_sermon_series", { seriesId, title, description, planCode }),
  deleteSermonSeries: (seriesId: number) => invoke<boolean>("delete_sermon_series", { seriesId }),

  listIllustrations: (filter: IllustrationFilter = {}) => invoke<Illustration[]>("list_illustrations", { filter }),
  getIllustration: (illustrationId: number) => invoke<Illustration | null>("get_illustration", { illustrationId }),
  createIllustration: (input: IllustrationInput) => invoke<Illustration>("create_illustration", { input }),
  updateIllustration: (illustrationId: number, input: IllustrationInput) =>
    invoke<Illustration>("update_illustration", { illustrationId, input }),
  deleteIllustration: (illustrationId: number) => invoke<void>("delete_illustration", { illustrationId }),
  listAllIllustrationTags: () => invoke<string[]>("list_all_illustration_tags"),
  recordIllustrationUse: (illustrationId: number, sermonId: number) =>
    invoke<void>("record_illustration_use", { illustrationId, sermonId }),
  listIllustrationUses: (illustrationId?: number) =>
    invoke<IllustrationUse[]>("list_illustration_uses", { illustrationId: illustrationId ?? null }),

  /** Markdown, with every passage block rendered at export time. */
  exportSermon: (sermonId: number, token: string) => invoke<void>("export_sermon", { sermonId, token }),
  /** The generated .pptx. The bytes come from pptxgenjs in the webview, but
   * the write goes through a command, since the fs plugin's scope allows no
   * arbitrary path. */
  exportSermonSlides: (token: string, data: Uint8Array) =>
    invoke<void>("export_sermon_slides", { token, data: Array.from(data) }),
};
