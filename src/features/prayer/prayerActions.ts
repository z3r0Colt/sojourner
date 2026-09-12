import { useEffect } from "react";
import { create } from "zustand";

/**
 * A request to open the prayer journal's editor from outside the page
 * (the Go to palette's "New prayer entry", F3.2). The journal view
 * consumes it whether it was already mounted or is opened by the same
 * command, so the editor appears either way.
 */
interface PrayerActionState {
  newEntryRequested: boolean;
  requestNewEntry: () => void;
  clear: () => void;
}

export const usePrayerActions = create<PrayerActionState>((set) => ({
  newEntryRequested: false,
  requestNewEntry: () => set({ newEntryRequested: true }),
  clear: () => set({ newEntryRequested: false }),
}));

export function requestNewPrayerEntry(): void {
  usePrayerActions.getState().requestNewEntry();
}

/** Calls `onRequest` once for each pending "new entry" request. */
export function useNewPrayerEntryRequest(onRequest: () => void): void {
  const requested = usePrayerActions((s) => s.newEntryRequested);
  useEffect(() => {
    if (!requested) return;
    usePrayerActions.getState().clear();
    onRequest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested]);
}
