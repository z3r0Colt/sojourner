import { create } from "zustand";

/**
 * The first-run tour (F3.7): nine spotlight steps over the live app -- the
 * Go to button, a verse, the Add pane strip, a pane header, the layout
 * button, the three sidebar groups, and Settings. `start` is called once
 * on a fresh install (setting `tour_done` unset) and again from Settings →
 * Tutorial → "Show the tour again". The overlay itself is `TourOverlay`.
 *
 * The pane-header step needs a second pane to point at; if the tour has
 * to open one it remembers the id and closes it again when it ends.
 */
interface TourState {
  active: boolean;
  step: number;
  /** A pane the tour opened for its own purposes, to close on finish. */
  openedPaneId: string | null;
  start: () => void;
  next: () => void;
  back: () => void;
  stop: () => void;
  setOpenedPane: (id: string | null) => void;
}

export const useTourStore = create<TourState>((set) => ({
  active: false,
  step: 0,
  openedPaneId: null,
  start: () => set({ active: true, step: 0, openedPaneId: null }),
  next: () => set((s) => ({ step: s.step + 1 })),
  back: () => set((s) => ({ step: Math.max(0, s.step - 1) })),
  stop: () => set({ active: false, step: 0 }),
  setOpenedPane: (openedPaneId) => set({ openedPaneId }),
}));

export function startTour() {
  useTourStore.getState().start();
}
