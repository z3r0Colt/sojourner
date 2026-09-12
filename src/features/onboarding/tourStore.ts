import { create } from "zustand";

/**
 * The first-run tour (F3.7): three spotlight steps over the Go to button,
 * a verse number, and the Add pane strip. `start` is called once on a
 * fresh install (setting `tour_done` unset) and again from Settings →
 * Tutorial → "Show the tour again". The overlay itself is `TourOverlay`.
 */
interface TourState {
  active: boolean;
  step: number;
  start: () => void;
  next: () => void;
  back: () => void;
  stop: () => void;
}

export const useTourStore = create<TourState>((set) => ({
  active: false,
  step: 0,
  start: () => set({ active: true, step: 0 }),
  next: () => set((s) => ({ step: s.step + 1 })),
  back: () => set((s) => ({ step: Math.max(0, s.step - 1) })),
  stop: () => set({ active: false, step: 0 }),
}));

export function startTour() {
  useTourStore.getState().start();
}
