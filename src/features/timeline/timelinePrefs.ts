import { create } from "zustand";

const STORAGE_KEY = "bsa-timeline-prefs";

export interface TimelinePrefs {
  /** Church history, from the apostles to the present, drawn on after the
   * Bible's own events. On unless the reader turns it off. */
  showChurchHistory: boolean;
}

/** What is stored, as an object whatever state it is in: nothing yet, JSON
 * that no longer parses, or something that parses to a non-object all read as
 * nothing stored, so a damaged entry costs the reader their preference and
 * never the timeline. */
function storedObject(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The preferences in `raw` (the stored string, or null for none). Church
 * history is off only when the reader turned it off; anything else -- a first
 * launch, a damaged entry -- shows it. */
export function readTimelinePrefs(raw: string | null): TimelinePrefs {
  return { showChurchHistory: storedObject(raw).showChurchHistory !== false };
}

/** `raw` with `prefs` written over it, keeping whatever else it holds. A
 * damaged entry is replaced rather than left to block every later save. */
export function writeTimelinePrefs(raw: string | null, prefs: Partial<TimelinePrefs>): string {
  return JSON.stringify({ ...storedObject(raw), ...prefs });
}

function load(): TimelinePrefs {
  try {
    return readTimelinePrefs(localStorage.getItem(STORAGE_KEY));
  } catch {
    return readTimelinePrefs(null);
  }
}

/**
 * How the reader likes the timeline, shared by every timeline pane and
 * remembered across launches -- a preference about the line, not about one
 * pane's place on it (that is the pane's params: its event and year). A reader
 * who turned church history off to study the kings should not find it back on
 * in the next timeline they open, nor in a workspace restored from before
 * they turned it off. Every open timeline follows a switch in any of them,
 * each bringing its own view within the line (TimelineView).
 */
export const useTimelinePrefs = create<TimelinePrefs & { setShowChurchHistory: (on: boolean) => void }>((set) => ({
  ...load(),
  setShowChurchHistory: (on) =>
    set(() => {
      try {
        localStorage.setItem(STORAGE_KEY, writeTimelinePrefs(localStorage.getItem(STORAGE_KEY), { showChurchHistory: on }));
      } catch {
        // A preference that cannot be saved still applies until the app closes.
      }
      return { showChurchHistory: on };
    }),
}));
