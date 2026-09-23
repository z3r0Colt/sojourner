import { create } from "zustand";

/** "contrast" and "contrast-dark" are the high-contrast pair (F3.6). */
export type Theme = "light" | "dark" | "oled" | "sepia" | "contrast" | "contrast-dark" | "system";
export type LineSpacing = "compact" | "normal" | "relaxed";
/** "dyslexic" is the bundled OpenDyslexic face (F3.6). */
export type ReadingFont = "serif" | "sans" | "dyslexic";

export const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "system", label: "Match Windows" },
  { value: "light", label: "Light" },
  { value: "sepia", label: "Sepia" },
  { value: "dark", label: "Dark" },
  { value: "oled", label: "True black (OLED)" },
  { value: "contrast", label: "High contrast" },
  { value: "contrast-dark", label: "High contrast, dark" },
];

/** "app" keeps each theme's own accent (the default, decided); "windows"
 * follows the system accent color, contrast-corrected (F3.8). */
export type AccentSource = "app" | "windows";

export const READING_FONT_OPTIONS: { value: ReadingFont; label: string }[] = [
  { value: "serif", label: "Serif" },
  { value: "sans", label: "Sans-serif" },
  { value: "dyslexic", label: "Dyslexia-friendly" },
];

/** How wide a line of an EPUB is allowed to run before the page is
 * centred in the pane (see `epubStyles.ts`). */
export type EpubWidth = "narrow" | "medium" | "wide" | "full";

export const EPUB_WIDTH_OPTIONS: { value: EpubWidth; label: string }[] = [
  { value: "narrow", label: "Narrow" },
  { value: "medium", label: "Medium" },
  { value: "wide", label: "Wide" },
  { value: "full", label: "Full width" },
];
/** The Resources page's kind filter: books are epub, pdf, and mobi. */
export type ResourceKindTab = "all" | "books" | "audio" | "video";
/** How the Resources page groups what it lists. */
export type ResourceGroupBy = "author" | "recent" | "topic";

export const EPUB_ZOOM_MIN = 50;
export const EPUB_ZOOM_MAX = 200;
export const EPUB_ZOOM_STEP = 10;

/** How a copied passage is laid out: text alone, "text (John 3:16)",
 * "John 3:16 — text", or a Markdown blockquote with the reference on its
 * own line. See `lib/clipboard.ts`. */
export type CopyFormat = "text" | "text-ref" | "ref-text" | "markdown";

export type SearchTranslation = "all" | "reader" | number;

/**
 * Global, window-level preferences (local storage). Anything about *what*
 * a pane shows -- translation, chapter, selected verse, paragraph mode,
 * red letters -- is per pane and lives in `workspaceStore`; anything a
 * user would miss after reinstalling goes through `useSetting`.
 */
interface UiState {
  theme: Theme;
  fontSize: number;
  lineSpacing: LineSpacing;
  readingFont: ReadingFont;
  showVerseNumbers: boolean;
  showHighlights: boolean;
  showNoteSymbols: boolean;
  showMorphology: boolean;
  copyFormat: CopyFormat;
  /** Append the translation code to the reference when copying ("John 3:16 KJV"). */
  copyIncludeTranslation: boolean;
  /** Forces reduced motion (no transitions, no toast slide) regardless of
   * the OS setting, which applies on its own (F3.6). */
  reduceMotion: boolean;
  accentSource: AccentSource;
  /** F11: chrome hidden, the focused pane maximized (see workspaceStore). */
  distractionFreeMode: boolean;
  sidebarCollapsed: boolean;
  /** A sermon pane publishes the passage under the cursor to its link group
   * (SB1.1), so the Bible and commentary beside it turn to the text being
   * written about. Off for a writer who wants the study panes to stay put. */
  sermonFollowsCursor: boolean;
  /** Preaching mode's text size in pixels (SB4.1); the pulpit wants a much
   * larger face than the study does, so it is its own setting. */
  pulpitFontSize: number;
  /** How wide an EPUB's text column runs. Size, spacing and font are the
   * shared reading preferences above; only the measure is the book's own,
   * because a book is read in a pane of its own width. */
  epubWidth: EpubWidth;
  /** Show an EPUB exactly as its publisher styled it, instead of in the
   * app's theme, font and size. Off by default: most books are typeset for
   * black on white and are hard to read in a dark theme. */
  epubUseBookStyles: boolean;
  /** Which harmony of the Gospels the harmony view opens on, by code. Null
   * means the first bundled one. Harmonists divide and date the life of
   * Christ differently, so a reader who has settled on one keeps it. */
  harmonyCode: string | null;
  /** Page zoom of a book in Resources, in percent (100 is the app's text size). */
  epubZoom: number;
  resourcesKindTab: ResourceKindTab;
  resourcesGroupBy: ResourceGroupBy;
  /** Which translation the search box looks in: "all", "reader" for
   * whatever the Bible pane is showing, or one translation's id. Kept
   * between searches, because a reader who searches the KJV searches the
   * KJV tomorrow too. */
  searchTranslation: SearchTranslation;
  /** Which commentary the search box looks in: "all" or one source's id. */
  searchCommentarySource: "all" | number;
  /** Match bare words whole instead of as prefixes ("son" no longer finds "song"). */
  searchWholeWords: boolean;
  /** List Scripture and commentary hits in Bible order instead of by relevance. */
  searchPassageOrder: boolean;
  /** Match older spellings (shew, -eth) when an older English translation
   * is searched. On unless the reader switches it off. */
  searchOlderSpellings: boolean;
  /** Scripture hits as a concordance: one line each, the match in a fixed column. */
  searchConcordance: boolean;
  /** Hits per book and translation down the side of the results. */
  searchShowFacets: boolean;
  setSearchTranslation: (t: SearchTranslation) => void;
  setSearchCommentarySource: (s: "all" | number) => void;
  setSearchWholeWords: (on: boolean) => void;
  setSearchPassageOrder: (on: boolean) => void;
  setSearchOlderSpellings: (on: boolean) => void;
  setSearchConcordance: (on: boolean) => void;
  setSearchShowFacets: (on: boolean) => void;
  setEpubZoom: (percent: number) => void;
  setResourcesKindTab: (tab: ResourceKindTab) => void;
  setResourcesGroupBy: (by: ResourceGroupBy) => void;
  setTheme: (t: Theme) => void;
  setReduceMotion: (on: boolean) => void;
  setAccentSource: (s: AccentSource) => void;
  setFontSize: (n: number) => void;
  setLineSpacing: (s: LineSpacing) => void;
  setReadingFont: (f: ReadingFont) => void;
  setCopyFormat: (f: CopyFormat) => void;
  setCopyIncludeTranslation: (on: boolean) => void;
  toggleVerseNumbers: () => void;
  toggleShowHighlights: () => void;
  toggleShowNoteSymbols: () => void;
  toggleShowMorphology: () => void;
  toggleDistractionFreeMode: () => void;
  setDistractionFreeMode: (on: boolean) => void;
  toggleSidebar: () => void;
  setSermonFollowsCursor: (on: boolean) => void;
  setPulpitFontSize: (px: number) => void;
  setEpubWidth: (w: EpubWidth) => void;
  setEpubUseBookStyles: (on: boolean) => void;
  setHarmonyCode: (code: string | null) => void;
}

const stored = (() => {
  try {
    const raw = localStorage.getItem("bsa-ui-prefs");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
})();

function persist(partial: Record<string, unknown>) {
  try {
    const raw = localStorage.getItem("bsa-ui-prefs");
    const existing = raw ? JSON.parse(raw) : {};
    localStorage.setItem("bsa-ui-prefs", JSON.stringify({ ...existing, ...partial }));
  } catch {
    // ignore storage failures (private browsing, quota, etc.)
  }
}

export const useUiStore = create<UiState>((set) => ({
  theme: stored.theme ?? "system",
  fontSize: stored.fontSize ?? 18,
  lineSpacing: stored.lineSpacing ?? "normal",
  readingFont: stored.readingFont ?? "serif",
  showVerseNumbers: stored.showVerseNumbers ?? true,
  showHighlights: stored.showHighlights ?? true,
  showNoteSymbols: stored.showNoteSymbols ?? true,
  showMorphology: stored.showMorphology ?? true,
  copyFormat: stored.copyFormat ?? "text-ref",
  copyIncludeTranslation: stored.copyIncludeTranslation ?? false,
  reduceMotion: stored.reduceMotion ?? false,
  accentSource: stored.accentSource ?? "app",
  distractionFreeMode: false,
  sidebarCollapsed: stored.sidebarCollapsed ?? false,
  sermonFollowsCursor: stored.sermonFollowsCursor ?? true,
  pulpitFontSize: stored.pulpitFontSize ?? 28,
  epubWidth: stored.epubWidth ?? "medium",
  epubUseBookStyles: stored.epubUseBookStyles ?? false,
  harmonyCode: stored.harmonyCode ?? null,
  epubZoom: typeof stored.epubZoom === "number" ? stored.epubZoom : 100,
  resourcesKindTab: stored.resourcesKindTab ?? "all",
  resourcesGroupBy: stored.resourcesGroupBy ?? "author",
  searchTranslation:
    stored.searchTranslation === "all" || typeof stored.searchTranslation === "number" ? stored.searchTranslation : "reader",
  searchCommentarySource: typeof stored.searchCommentarySource === "number" ? stored.searchCommentarySource : "all",
  searchWholeWords: stored.searchWholeWords ?? false,
  searchPassageOrder: stored.searchPassageOrder ?? false,
  searchOlderSpellings: stored.searchOlderSpellings ?? true,
  searchConcordance: stored.searchConcordance ?? false,
  searchShowFacets: stored.searchShowFacets ?? true,

  setSearchTranslation: (searchTranslation) => {
    persist({ searchTranslation });
    set({ searchTranslation });
  },
  setSearchCommentarySource: (searchCommentarySource) => {
    persist({ searchCommentarySource });
    set({ searchCommentarySource });
  },
  setSearchWholeWords: (searchWholeWords) => {
    persist({ searchWholeWords });
    set({ searchWholeWords });
  },
  setSearchPassageOrder: (searchPassageOrder) => {
    persist({ searchPassageOrder });
    set({ searchPassageOrder });
  },
  setSearchOlderSpellings: (searchOlderSpellings) => {
    persist({ searchOlderSpellings });
    set({ searchOlderSpellings });
  },
  setSearchConcordance: (searchConcordance) => {
    persist({ searchConcordance });
    set({ searchConcordance });
  },
  setSearchShowFacets: (searchShowFacets) => {
    persist({ searchShowFacets });
    set({ searchShowFacets });
  },

  setEpubZoom: (percent) => {
    const epubZoom = Math.max(EPUB_ZOOM_MIN, Math.min(EPUB_ZOOM_MAX, Math.round(percent)));
    persist({ epubZoom });
    set({ epubZoom });
  },
  setResourcesKindTab: (resourcesKindTab) => {
    persist({ resourcesKindTab });
    set({ resourcesKindTab });
  },
  setResourcesGroupBy: (resourcesGroupBy) => {
    persist({ resourcesGroupBy });
    set({ resourcesGroupBy });
  },

  setHarmonyCode: (harmonyCode) => {
    set({ harmonyCode });
    persist({ harmonyCode });
  },

  setEpubWidth: (epubWidth) => {
    persist({ epubWidth });
    set({ epubWidth });
  },

  setEpubUseBookStyles: (epubUseBookStyles) => {
    persist({ epubUseBookStyles });
    set({ epubUseBookStyles });
  },

  setPulpitFontSize: (px) => {
    const pulpitFontSize = Math.max(16, Math.min(72, Math.round(px)));
    persist({ pulpitFontSize });
    set({ pulpitFontSize });
  },

  setSermonFollowsCursor: (sermonFollowsCursor) => {
    persist({ sermonFollowsCursor });
    set({ sermonFollowsCursor });
  },

  setTheme: (theme) => {
    persist({ theme });
    set({ theme });
  },
  setReduceMotion: (reduceMotion) => {
    persist({ reduceMotion });
    set({ reduceMotion });
  },
  setAccentSource: (accentSource) => {
    persist({ accentSource });
    set({ accentSource });
  },
  setFontSize: (fontSize) => {
    persist({ fontSize });
    set({ fontSize });
  },
  setLineSpacing: (lineSpacing) => {
    persist({ lineSpacing });
    set({ lineSpacing });
  },
  setReadingFont: (readingFont) => {
    persist({ readingFont });
    set({ readingFont });
  },
  setCopyFormat: (copyFormat) => {
    persist({ copyFormat });
    set({ copyFormat });
  },
  setCopyIncludeTranslation: (copyIncludeTranslation) => {
    persist({ copyIncludeTranslation });
    set({ copyIncludeTranslation });
  },
  toggleVerseNumbers: () =>
    set((s) => {
      persist({ showVerseNumbers: !s.showVerseNumbers });
      return { showVerseNumbers: !s.showVerseNumbers };
    }),
  toggleShowHighlights: () =>
    set((s) => {
      persist({ showHighlights: !s.showHighlights });
      return { showHighlights: !s.showHighlights };
    }),
  toggleShowNoteSymbols: () =>
    set((s) => {
      persist({ showNoteSymbols: !s.showNoteSymbols });
      return { showNoteSymbols: !s.showNoteSymbols };
    }),
  toggleShowMorphology: () =>
    set((s) => {
      persist({ showMorphology: !s.showMorphology });
      return { showMorphology: !s.showMorphology };
    }),
  toggleDistractionFreeMode: () => set((s) => ({ distractionFreeMode: !s.distractionFreeMode })),
  setDistractionFreeMode: (distractionFreeMode) => set({ distractionFreeMode }),
  toggleSidebar: () =>
    set((s) => {
      persist({ sidebarCollapsed: !s.sidebarCollapsed });
      return { sidebarCollapsed: !s.sidebarCollapsed };
    }),
}));

/** Exported because an EPUB is typeset inside its own frame, where the
 * spacing has to be written into a stylesheet rather than an inline
 * style. */
export const READING_LINE_HEIGHTS: Record<LineSpacing, number> = { compact: 1.5, normal: 1.7, relaxed: 1.9 };

/** Inline style for any long-form reading surface (Bible text, commentary,
 * confessions, dictionary entries) so the reader's size, spacing, and
 * font preferences apply everywhere, not only to the Bible page. `scale`
 * shrinks the size for secondary surfaces such as the study panel. */
export function useReadingTypography(scale = 1): React.CSSProperties {
  const fontSize = useUiStore((s) => s.fontSize);
  const lineSpacing = useUiStore((s) => s.lineSpacing);
  return {
    fontSize: Math.max(14, Math.round(fontSize * scale)),
    lineHeight: READING_LINE_HEIGHTS[lineSpacing],
  };
}
