import type { TimelineViewRange } from "./timelineRange";

/**
 * Where each timeline pane's view was, by pane id. The view is the timeline's
 * own state, not a pane param -- it changes sixty times a second in a drag --
 * so it would otherwise live and die with the component. But the workspace
 * rebuilds a pane's view whenever the layout around it changes: "Read the
 * Canons of Dort" or "Open in the library" splits a pane beside the timeline,
 * and closing that pane joins them again, and each time the timeline came back
 * at "All", Creation to the present, with the reader's place lost. It keeps
 * its place here instead, for as long as the app is open.
 *
 * A view is kept with the params it was shown for, and given back only to a
 * pane that is still showing them. A pane sent somewhere else on the timeline
 * -- a passage's "Full timeline" opened in it, a link to another event -- opens
 * where it was sent, not where it last was.
 */
interface Kept {
  range: TimelineViewRange;
  eventId: number | null;
  year: number | null;
}

/** Enough for every timeline a workspace could hold, and then some: the
 * oldest is let go first. */
const MAX_KEPT = 32;

const kept = new Map<string, Kept>();

export interface TimelinePlace {
  eventId: number | null;
  year: number | null;
}

/** Keeps `range` as where pane `paneId` is, showing `place`. Null -- the view
 * the timeline opens on, worked out afresh each time -- keeps nothing. */
export function keepTimelineView(paneId: string, place: TimelinePlace, range: TimelineViewRange | null): void {
  kept.delete(paneId);
  if (!range) return;
  kept.set(paneId, { range, eventId: place.eventId, year: place.year });
  if (kept.size > MAX_KEPT) kept.delete(kept.keys().next().value!);
}

/** Where pane `paneId` was, if it is still showing `place`; else null. */
export function keptTimelineView(paneId: string, place: TimelinePlace): TimelineViewRange | null {
  const k = kept.get(paneId);
  return k && k.eventId === place.eventId && k.year === place.year ? k.range : null;
}

/** For tests: forget every pane. */
export function forgetTimelineViews(): void {
  kept.clear();
}
