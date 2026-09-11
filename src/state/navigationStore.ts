import { create } from "zustand";

export interface Position {
  bookId: number;
  chapter: number;
  verse?: number;
}

interface NavigationState {
  primaryTranslationId: number | null;
  parallelTranslationIds: number[];
  position: Position | null;
  /** The verse the reader last clicked in the current chapter -- drives the
   * study panel and bookmarks. Separate from `position.verse`, which is a
   * navigation target rather than a selection. */
  activeVerse: number | null;
  history: Position[];
  future: Position[];
  activeCommentarySourceId: number | null;
  interlinearMode: boolean;
  setPrimaryTranslation: (id: number) => void;
  toggleParallelTranslation: (id: number) => void;
  clearParallelTranslations: () => void;
  setActiveCommentarySource: (id: number | null) => void;
  toggleInterlinearMode: () => void;
  setInterlinearMode: (on: boolean) => void;
  setActiveVerse: (verse: number | null) => void;
  goTo: (pos: Position, opts?: { pushHistory?: boolean }) => void;
  goBack: () => void;
  goForward: () => void;
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
  primaryTranslationId: null,
  parallelTranslationIds: [],
  position: null,
  activeVerse: null,
  history: [],
  future: [],
  activeCommentarySourceId: null,
  interlinearMode: false,

  setPrimaryTranslation: (id) => set({ primaryTranslationId: id }),

  toggleInterlinearMode: () => set((s) => ({ interlinearMode: !s.interlinearMode })),
  setInterlinearMode: (interlinearMode) => set({ interlinearMode }),

  toggleParallelTranslation: (id) =>
    set((s) => ({
      parallelTranslationIds: s.parallelTranslationIds.includes(id)
        ? s.parallelTranslationIds.filter((t) => t !== id)
        : [...s.parallelTranslationIds, id],
    })),
  clearParallelTranslations: () => set({ parallelTranslationIds: [] }),

  setActiveCommentarySource: (id) => set({ activeCommentarySourceId: id }),

  setActiveVerse: (activeVerse) => set({ activeVerse }),

  goTo: (pos, opts) => {
    const { position, history } = get();
    const pushHistory = opts?.pushHistory ?? true;
    set({
      position: pos,
      activeVerse: pos.verse ?? null,
      history: pushHistory && position ? [...history, position] : history,
      future: [],
    });
  },

  goBack: () => {
    const { history, position, future } = get();
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    set({
      position: prev,
      activeVerse: prev.verse ?? null,
      history: history.slice(0, -1),
      future: position ? [position, ...future] : future,
    });
  },

  goForward: () => {
    const { future, position, history } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({
      position: next,
      activeVerse: next.verse ?? null,
      future: future.slice(1),
      history: position ? [...history, position] : history,
    });
  },
}));
