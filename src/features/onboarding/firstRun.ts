import { useEffect } from "react";
import { useBooks, useReadingPosition } from "../../api/queries";
import { useSetting } from "../../hooks/useSetting";
import { useUiStore } from "../../state/uiStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { startTour } from "./tourStore";
import { shouldAsk } from "./purpose";
import { usePurpose } from "./usePurpose";

/** Completion lives in user.db so a reinstall does not replay the tour. */
export const TOUR_DONE_SETTING = "tour_done";

export function useTourDone() {
  return useSetting<boolean>(TOUR_DONE_SETTING, false);
}

/** Whether to ask a new install what it came for (purpose.ts, Welcome.tsx):
 * `null` until the settings, the reading position and the workspace have
 * all answered, so nothing acts on a guess. */
export function useAskPurpose(): boolean | null {
  const [purpose, , { isLoaded: purposeLoaded }] = usePurpose();
  const [tourDone, , { isLoaded: tourLoaded }] = useTourDone();
  const { data: position, isSuccess: positionLoaded } = useReadingPosition();
  const ready = useWorkspaceStore((s) => s.ready);
  if (!purposeLoaded || !tourLoaded || !positionLoaded || !ready) return null;
  return shouldAsk({ purpose, tourDone, hasRead: position?.book_id != null });
}

let checked = false;

/** Starts the tour once, on the first launch that finds `tour_done`
 * unset, after the workspace has bootstrapped and the books have loaded
 * (so the Bible pane has verses to point at), and after a new install has
 * said what it came for. */
export function useFirstRunTour() {
  const [done, , { isLoaded }] = useTourDone();
  const ready = useWorkspaceStore((s) => s.ready);
  const { data: books } = useBooks();
  const focusMode = useUiStore((s) => s.distractionFreeMode);
  // The question at the door comes first; the tour begins on its answer.
  const asking = useAskPurpose();
  useEffect(() => {
    if (checked || !isLoaded || !ready || !books || focusMode || asking !== false) return;
    checked = true;
    if (!done) {
      // A beat after paint so the first chapter's rows exist to spotlight.
      const t = window.setTimeout(startTour, 600);
      return () => window.clearTimeout(t);
    }
  }, [done, isLoaded, ready, books, focusMode, asking]);
}
