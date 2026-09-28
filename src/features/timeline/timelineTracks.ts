import type { Timeline, TimelineEra, TimelineEvent } from "../../api/types";
import { isChurchEra, isChurchEvent } from "./churchHistory";

/** The timeline sorted into where the canvas draws each thing. */
export interface TimelineTracks {
  /** Events something else is part of: they pack ahead of single events. */
  parents: Set<number>;
  /** The reigns of Judah and of Israel: the two lanes under the eras. */
  judah: TimelineEvent[];
  israel: TimelineEvent[];
  /** The Bible's other events, packed in rows under the lanes. */
  bible: TimelineEvent[];
  /** Church history's events, packed in a band of their own under the Bible's. */
  church: TimelineEvent[];
  /** Each track's eras in date order: the Bible's row, and church history's. */
  bibleEras: TimelineEra[];
  churchEras: TimelineEra[];
}

/**
 * Which part of the canvas every event and era belongs to, worked out once
 * per timeline rather than once per frame (a drag redraws sixty times a
 * second). Church history is sorted out first, so a church event is in the
 * church band whatever else it carries -- never in a lane of the kings, never
 * packed among the Bible's rows. The two reigns' containers ("The kings of
 * Judah") are left out altogether: the lanes' names stand for them. Each
 * track's eras are put in date order, so neighbouring eras alternate shades
 * however the timeline happens to list them.
 */
export function timelineTracks(timeline: Pick<Timeline, "events" | "eras">): TimelineTracks {
  const parents = new Set<number>();
  const laneParents = new Set<number>();
  for (const e of timeline.events) {
    if (e.parent_id == null) continue;
    parents.add(e.parent_id);
    if (e.lane && !isChurchEvent(e)) laneParents.add(e.parent_id);
  }
  const tracks: TimelineTracks = { parents, judah: [], israel: [], bible: [], church: [], bibleEras: [], churchEras: [] };
  for (const e of timeline.events) {
    if (isChurchEvent(e)) tracks.church.push(e);
    else if (e.lane === "judah") tracks.judah.push(e);
    else if (e.lane === "israel") tracks.israel.push(e);
    else if (!laneParents.has(e.id)) tracks.bible.push(e);
  }
  for (const era of timeline.eras) (isChurchEra(era) ? tracks.churchEras : tracks.bibleEras).push(era);
  const byStart = (a: TimelineEra, b: TimelineEra) => a.start_year - b.start_year;
  tracks.bibleEras.sort(byStart);
  tracks.churchEras.sort(byStart);
  return tracks;
}
