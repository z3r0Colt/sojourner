import { useEffect } from "react";
import { useBooks } from "../../api/queries";
import { useSetting } from "../../hooks/useSetting";
import { useUiStore } from "../../state/uiStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { startTour } from "./tourStore";

/** Completion lives in user.db so a reinstall does not replay the tour. */
export const TOUR_DONE_SETTING = "tour_done";

export function useTourDone() {
  return useSetting<boolean>(TOUR_DONE_SETTING, false);
}

let checked = false;

/** Starts the tour once, on the first launch that finds `tour_done`
 * unset, after the workspace has bootstrapped and the books have loaded
 * (so the Bible pane has verses to point at). */
export function useFirstRunTour() {
  const [done, , { isLoaded }] = useTourDone();
  const ready = useWorkspaceStore((s) => s.ready);
  const { data: books } = useBooks();
  const focusMode = useUiStore((s) => s.distractionFreeMode);
  useEffect(() => {
    if (checked || !isLoaded || !ready || !books || focusMode) return;
    checked = true;
    if (!done) {
      // A beat after paint so the first chapter's rows exist to spotlight.
      const t = window.setTimeout(startTour, 600);
      return () => window.clearTimeout(t);
    }
  }, [done, isLoaded, ready, books, focusMode]);
}
