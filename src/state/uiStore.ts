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

export const READING_FONT_OPTIONS: { value: ReadingFont; label: string }[] = [
  { value: "serif", label: "Serif" },
  { value: "sans", label: "Sans-serif" },
  { value: "dyslexic", label: "Dyslexia-friendly" },
];
/** How a copied passage is laid out: text alone, "text (John 3:16)",
 * "John 3:16 — text", or a Markdown blockquote with the reference on its
 * own line. See `lib/clipboard.ts`. */
export type CopyFormat = "text" | "text-ref" | "ref-text" | "markdown";

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
  /** F11: chrome hidden, the focused pane maximized (see workspaceStore). */
  distractionFreeMode: boolean;
  sidebarCollapsed: boolean;
  setTheme: (t: Theme) => void;
  setReduceMotion: (on: boolean) => void;
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
  distractionFreeMode: false,
  sidebarCollapsed: stored.sidebarCollapsed ?? false,

  setTheme: (theme) => {
    persist({ theme });
    set({ theme });
  },
  setReduceMotion: (reduceMotion) => {
    persist({ reduceMotion });
    set({ reduceMotion });
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

const LINE_HEIGHTS: Record<LineSpacing, number> = { compact: 1.5, normal: 1.7, relaxed: 1.9 };

/** Inline style for any long-form reading surface (Bible text, commentary,
 * confessions, dictionary entries) so the reader's size, spacing, and
 * font preferences apply everywhere, not only to the Bible page. `scale`
 * shrinks the size for secondary surfaces such as the study panel. */
export function useReadingTypography(scale = 1): React.CSSProperties {
  const fontSize = useUiStore((s) => s.fontSize);
  const lineSpacing = useUiStore((s) => s.lineSpacing);
  return {
    fontSize: Math.max(14, Math.round(fontSize * scale)),
    lineHeight: LINE_HEIGHTS[lineSpacing],
  };
}
