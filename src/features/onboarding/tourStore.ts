import { create } from "zustand";

/**
 * The first-run tour: three things to do, in the app itself, rather than
 * ten things to be told (TourOverlay.tsx). `start` is called once on a new
 * install (setting `tour_done` unset) and again from the tutorial's "Show
 * the tour again".
 */
interface TourState {
  active: boolean;
  start: () => void;
  stop: () => void;
}

export const useTourStore = create<TourState>((set) => ({
  active: false,
  start: () => set({ active: true }),
  stop: () => set({ active: false }),
}));

export function startTour() {
  useTourStore.getState().start();
}
