import { useUiStore } from "../../state/uiStore";
import { useWorkspaceStore } from "../../state/workspaceStore";

/**
 * Follows a link from the timeline -- `open`, an `openContent` or
 * `openPassage` -- and makes sure the reader can see where it went.
 *
 * A maximized pane is the only one the workspace shows. A link from a
 * maximized timeline that opens its page in another pane ("Read the Canons
 * of Dort" beside it, a passage in the Bible pane, a book in the library)
 * would focus a pane hidden behind the timeline, and nothing would seem to
 * happen until the reader restored the panes themselves. So when the link
 * has landed in a pane other than the maximized one, the maximize is let go,
 * as "Restore all panes" would, and the page is on the screen beside the
 * timeline it was opened from. Focus mode, which is a maximize with the
 * app's chrome hidden, is left the same way, as Esc leaves it. A link that
 * opened in the maximized pane itself -- a full workspace falls back to the
 * pane the link is in -- is already in view, and the pane stays maximized.
 */
export function openFromTimeline(open: () => void): void {
  open();
  const s = useWorkspaceStore.getState();
  if (s.maximizedPaneId == null || s.focusedPaneId === s.maximizedPaneId) return;
  s.setMaximized(null);
  const ui = useUiStore.getState();
  if (ui.distractionFreeMode) ui.setDistractionFreeMode(false);
}
