import { invoke } from "@tauri-apps/api/core";
import type {
  Book,
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
  DictionaryEntry,
  DictionaryEntrySummary,
  InterlinearWord,
  MorphologyWord,
  Footnote,
  ChapterNote,
  CrossReference,
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

  search: (query: string, translationIds: number[], commentarySourceIds: number[], limit = 50) =>
    invoke<SearchResults>("search", { query, translationIds, commentarySourceIds, limit }),

  getStrongsEntry: (id: string) => invoke<StrongsEntry | null>("get_strongs_entry", { id }),
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
};
