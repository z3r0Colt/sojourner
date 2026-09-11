import { create } from "zustand";

export type Theme = "light" | "dark" | "oled" | "sepia" | "system";
export type LineSpacing = "compact" | "normal" | "relaxed";
export type ReadingFont = "serif" | "sans";
export type StudyTab = "commentary" | "crossrefs" | "metrical" | "confession";

interface UiState {
  theme: Theme;
  fontSize: number;
  lineSpacing: LineSpacing;
  readingFont: ReadingFont;
  showVerseNumbers: boolean;
  commentaryPanelOpen: boolean;
  commentaryPanelWidth: number;
  commentaryPanelSide: "left" | "right";
  showHighlights: boolean;
  showNoteSymbols: boolean;
  showMorphology: boolean;
  rightPanelTab: StudyTab;
  redLetterMode: boolean;
  paragraphMode: boolean;
  distractionFreeMode: boolean;
  sidebarCollapsed: boolean;
  setTheme: (t: Theme) => void;
  setFontSize: (n: number) => void;
  setLineSpacing: (s: LineSpacing) => void;
  setReadingFont: (f: ReadingFont) => void;
  toggleVerseNumbers: () => void;
  toggleCommentaryPanel: () => void;
  setCommentaryPanelOpen: (open: boolean) => void;
  setCommentaryPanelWidth: (n: number) => void;
  setCommentaryPanelSide: (side: "left" | "right") => void;
  toggleShowHighlights: () => void;
  toggleShowNoteSymbols: () => void;
  toggleShowMorphology: () => void;
  setRightPanelTab: (t: StudyTab) => void;
  toggleRedLetterMode: () => void;
  toggleParagraphMode: () => void;
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
  // Closed by default so a first-time reader's very first view of a
  // chapter is just the text -- the study panel is one click away via its
  // collapsed rail, and this only governs the *default*: anyone who's
  // already toggled it keeps their own preference via `stored`.
  commentaryPanelOpen: stored.commentaryPanelOpen ?? false,
  commentaryPanelWidth: stored.commentaryPanelWidth ?? 420,
  commentaryPanelSide: stored.commentaryPanelSide ?? "right",
  showHighlights: stored.showHighlights ?? true,
  showNoteSymbols: stored.showNoteSymbols ?? true,
  showMorphology: stored.showMorphology ?? true,
  rightPanelTab: "commentary",
  redLetterMode: stored.redLetterMode ?? false,
  paragraphMode: stored.paragraphMode ?? false,
  distractionFreeMode: false,
  sidebarCollapsed: stored.sidebarCollapsed ?? false,

  setTheme: (theme) => {
    persist({ theme });
    set({ theme });
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
  toggleVerseNumbers: () =>
    set((s) => {
      persist({ showVerseNumbers: !s.showVerseNumbers });
      return { showVerseNumbers: !s.showVerseNumbers };
    }),
  toggleCommentaryPanel: () =>
    set((s) => {
      persist({ commentaryPanelOpen: !s.commentaryPanelOpen });
      return { commentaryPanelOpen: !s.commentaryPanelOpen };
    }),
  setCommentaryPanelOpen: (commentaryPanelOpen) => {
    persist({ commentaryPanelOpen });
    set({ commentaryPanelOpen });
  },
  setCommentaryPanelWidth: (commentaryPanelWidth) => {
    persist({ commentaryPanelWidth });
    set({ commentaryPanelWidth });
  },
  setCommentaryPanelSide: (commentaryPanelSide) => {
    persist({ commentaryPanelSide });
    set({ commentaryPanelSide });
  },
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
  setRightPanelTab: (rightPanelTab) => set({ rightPanelTab }),
  toggleRedLetterMode: () =>
    set((s) => {
      persist({ redLetterMode: !s.redLetterMode });
      return { redLetterMode: !s.redLetterMode };
    }),
  toggleParagraphMode: () =>
    set((s) => {
      persist({ paragraphMode: !s.paragraphMode });
      return { paragraphMode: !s.paragraphMode };
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
