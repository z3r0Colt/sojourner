import { create } from "zustand";

export type Theme = "light" | "dark" | "oled" | "sepia" | "system";

interface UiState {
  theme: Theme;
  fontSize: number;
  showVerseNumbers: boolean;
  commentaryPanelOpen: boolean;
  commentaryPanelWidth: number;
  commentaryPanelSide: "left" | "right";
  showHighlights: boolean;
  showNoteSymbols: boolean;
  showMorphology: boolean;
  rightPanelTab: "commentary" | "crossrefs" | "metrical";
  redLetterMode: boolean;
  paragraphMode: boolean;
  distractionFreeMode: boolean;
  setTheme: (t: Theme) => void;
  setFontSize: (n: number) => void;
  toggleVerseNumbers: () => void;
  toggleCommentaryPanel: () => void;
  setCommentaryPanelWidth: (n: number) => void;
  setCommentaryPanelSide: (side: "left" | "right") => void;
  toggleShowHighlights: () => void;
  toggleShowNoteSymbols: () => void;
  toggleShowMorphology: () => void;
  setRightPanelTab: (t: "commentary" | "crossrefs" | "metrical") => void;
  toggleRedLetterMode: () => void;
  toggleParagraphMode: () => void;
  toggleDistractionFreeMode: () => void;
  setDistractionFreeMode: (on: boolean) => void;
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
  showVerseNumbers: stored.showVerseNumbers ?? true,
  commentaryPanelOpen: stored.commentaryPanelOpen ?? true,
  commentaryPanelWidth: stored.commentaryPanelWidth ?? 420,
  commentaryPanelSide: stored.commentaryPanelSide ?? "right",
  showHighlights: stored.showHighlights ?? true,
  showNoteSymbols: stored.showNoteSymbols ?? true,
  showMorphology: stored.showMorphology ?? true,
  rightPanelTab: "commentary",
  redLetterMode: stored.redLetterMode ?? false,
  paragraphMode: stored.paragraphMode ?? false,
  distractionFreeMode: false,

  setTheme: (theme) => {
    persist({ theme });
    set({ theme });
  },
  setFontSize: (fontSize) => {
    persist({ fontSize });
    set({ fontSize });
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
}));
