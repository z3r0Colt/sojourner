import type { PackStatus, Resource, Timeline, TimelineCitation, TimelineEra, TimelineEvent } from "../../api/types";
import { spanLabel, yearLabel } from "./timelineLayout";
import { clampRange, extentOf, lineFor, type TimelineViewRange } from "./timelineRange";

/**
 * Church history on the timeline: the events from the apostles to the present
 * that sit after the Bible's own on the same line (reference/timeline/
 * church_history.json). They differ from the Bible's in what a reader is
 * owed for each one. A Bible event is dated by the chronology the timeline
 * follows and points to the verses that record it; a church event is dated
 * by a history, and the date is only as good as the words it was taken from
 * -- so every one carries its source and quotes it, and the view shows that
 * quotation rather than asking to be trusted. These are the pure pieces: which
 * events and eras are church history, how their dates and sources read, and
 * the frames the view jumps to.
 */

export function isChurchEvent(e: Pick<TimelineEvent, "source">): boolean {
  return e.source === "church";
}

/** Church eras carry their own track, and slugs prefixed "church-" so they
 * never clash with the Bible's ("apostolic" is both the Bible's last era and
 * Schaff's first period). The slug is checked too, so a timeline served
 * without the track still sorts itself out. */
export function isChurchEra(era: Pick<TimelineEra, "slug"> & { track?: string | null }): boolean {
  return era.track === "church" || era.slug.startsWith("church-");
}

/** The timeline with church history, or without it: the reader's toggle.
 * With it on, the same object comes back, so nothing downstream redraws for
 * a filter that filtered nothing. */
export function withChurchHistory(timeline: Timeline, show: boolean): Timeline {
  if (show) return timeline;
  const events = timeline.events.filter((e) => !isChurchEvent(e));
  const eras = timeline.eras.filter((e) => !isChurchEra(e));
  if (events.length === timeline.events.length && eras.length === timeline.eras.length) return timeline;
  return { ...timeline, events, eras };
}

/** Just the Bible: what the strip beside a passage shows. Church events have
 * no verses, so a chapter never records one, and a strip around Acts 28 has
 * no business drawing Schaff's apostolic age over Luke's. */
export function bibleOnly(timeline: Timeline): Timeline {
  return withChurchHistory(timeline, false);
}

/** The Bible's eras, then church history's, in the timeline's order: the era
 * menu's two groups. */
export function erasByTrack(eras: TimelineEra[]): { bible: TimelineEra[]; church: TimelineEra[] } {
  return { bible: eras.filter((e) => !isChurchEra(e)), church: eras.filter((e) => isChurchEra(e)) };
}

/**
 * The era a year falls in. The two tracks overlap -- the Bible's apostolic
 * church runs to Paul's arrival in Rome, Schaff's apostolic age to AD 100 --
 * and where they do the Bible's era is the one named, as it was before church
 * history joined the line; past its last era the church's takes over.
 */
export function eraAt(eras: TimelineEra[], year: number): TimelineEra | undefined {
  const within = (e: TimelineEra) => e.start_year <= year && e.end_year > year;
  return eras.find((e) => !isChurchEra(e) && within(e)) ?? eras.find((e) => isChurchEra(e) && within(e));
}

/** A Bible event's era: the Bible's era its first year falls in, as the
 * detail named it before church history joined the line. Only the Bible's
 * track is looked at, so an event in AD 61, after the Bible's last era, is in
 * none rather than in Schaff's apostolic age. */
export function bibleEraOf(event: Pick<TimelineEvent, "start_year">, eras: TimelineEra[]): TimelineEra | undefined {
  return eras.find((e) => !isChurchEra(e) && e.start_year <= event.start_year && e.end_year > event.start_year);
}

/**
 * A church event's era: the one church_history.json files it under, by slug,
 * and never one worked out from its years. The two do not agree, and the
 * file is right. A life is filed with the age its work belongs to, not the
 * one it was born in -- Luther, born in 1483, is a man of the Reformation, not
 * of the late Middle Ages -- and an event on a boundary year goes to the age it
 * closes: the Peace of Westphalia ends the Reformation in 1648, it does not
 * open the Puritans'. Reckoned from the start year, 26 of the 296 would be
 * named wrongly, under a title whose whole point is that its dates can be
 * trusted. The build carries the file's `era` through to every church event
 * (and checks it: a council, a writing or a mission starts inside its era, a
 * life at least touches it), so the slug is all there is to look up. An event
 * with no era, or one naming an era this timeline lacks, is named in none
 * rather than in a guess.
 */
export function churchEraOf(event: Pick<TimelineEvent, "source" | "era">, eras: TimelineEra[]): TimelineEra | undefined {
  if (!isChurchEvent(event) || !event.era) return undefined;
  return eras.find((e) => isChurchEra(e) && e.slug === event.era);
}

/** The Bible's whole line, a little before Creation to a little after Acts:
 * what "All" framed before church history joined it, and still what the
 * "Bible" jump frames. */
export const BIBLE_RANGE: TimelineViewRange = { start: -4100, end: 120 };

/** An era with a twentieth of its length either side, so its ends show. */
export function eraFrame(era: Pick<TimelineEra, "start_year" | "end_year">): TimelineViewRange {
  const pad = (era.end_year - era.start_year) * 0.05;
  return { start: era.start_year - pad, end: era.end_year + pad };
}

/**
 * AD 30 to the present: the whole of church history, from its first era's
 * start to the later of its last era's end and this year (so a line built
 * in one year still reaches today in the next), with a fiftieth of the span
 * either side. Null when the timeline has no church history to frame -- a
 * build without it, or the toggle off.
 */
export function churchFrame(timeline: Timeline, presentYear: number): TimelineViewRange | null {
  const eras = timeline.eras.filter((e) => isChurchEra(e));
  const events = timeline.events.filter((e) => isChurchEvent(e));
  if (eras.length === 0 && events.length === 0) return null;
  const start = Math.min(...eras.map((e) => e.start_year), ...events.map((e) => e.start_year));
  const end = Math.max(...eras.map((e) => e.end_year), ...events.map((e) => e.end_year), presentYear);
  const pad = (end - start) * 0.02;
  return { start: start - pad, end: end + pad };
}

/** The church jump's name, from where church history starts: "AD 30–present".
 * Null when there is none. */
export function churchJumpLabel(timeline: Timeline): string | null {
  const starts = [...timeline.eras.filter((e) => isChurchEra(e)), ...timeline.events.filter((e) => isChurchEvent(e))].map((x) => x.start_year);
  return starts.length ? `${yearLabel(Math.min(...starts))}–present` : null;
}

/** Everything showing: the Bible's line, and on through church history to the
 * present when it is on. */
export function wholeFrame(timeline: Timeline, presentYear: number): TimelineViewRange {
  const church = churchFrame(timeline, presentYear);
  return church ? { start: BIBLE_RANGE.start, end: Math.max(BIBLE_RANGE.end, church.end) } : BIBLE_RANGE;
}

/**
 * The line a timeline is drawn along: before Creation to a little after the
 * last event or era it has. The canvas works this out for itself from the
 * timeline it is handed, and clamps every drag and wheel to it; the view
 * works it out the same way so that its jumps land where the canvas will
 * keep them, instead of somewhere the first drag snaps away from.
 */
export function lineOf(timeline: Timeline): TimelineViewRange {
  return lineFor(extentOf([...timeline.events, ...timeline.eras])?.end ?? null);
}

/**
 * Where the view goes when church history is switched. Off, the line ends a
 * little after Acts again, so the view is brought within it as a drag would
 * bring it, at the same zoom: the whole line, Creation to today, narrows to the
 * widest the Bible allows, and a view of the early church slides back until
 * the Bible's last years sit in the middle of it -- the reader keeps their
 * zoom and is not left looking at nineteen empty centuries. A view within the
 * Bible's years does not move. On, nothing moves -- the line only grows, and
 * the reader can jump when they like. `bibleLine` is the line without church
 * history, `lineOf(bibleOnly(timeline))`.
 */
export function rangeAfterChurchToggle(range: TimelineViewRange, show: boolean, bibleLine: TimelineViewRange): TimelineViewRange {
  if (show) return range;
  const kept = clampRange(range, bibleLine);
  return kept.start === range.start && kept.end === range.end ? range : kept;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** An event's `date`, "1483-11-10" or "0064-07": the month or day its source
 * prints. ISO years are astronomical, like the timeline's (0000 is 1 BC). */
export function parseEventDate(date: string | null | undefined): { year: number; month: number; day: number | null } | null {
  const m = date ? /^(-?\d{1,6})-(\d{2})(?:-(\d{2}))?$/.exec(date) : null;
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year: Number(m[1]), month, day: m[3] != null ? Number(m[3]) : null };
}

const wholeYear = (astro: number) => Math.floor(astro + 1e-9);

/**
 * A church event's date as the history gives it, and no more exactly:
 * "AD 52", "c. AD 190" where the source says "about", "July AD 64" and
 * "10 August AD 70" where it prints the month or the day, "AD 255–256" for
 * a span, and a life as born–died, "AD 185–254" (with the birthday where the
 * source has it, "10 November AD 1483 – 1546"). BC and AD read as the Bible
 * events' do, through the same `yearLabel`. The day and month belong to the
 * start: no source here gives both ends to the day, so the end is a year.
 */
export function churchDateLabel(e: Pick<TimelineEvent, "start_year" | "end_year" | "date" | "circa">): string {
  const date = parseEventDate(e.date);
  const startYear = date?.year ?? wholeYear(e.start_year);
  const endYear = wholeYear(e.end_year);
  const circa = e.circa ? "c. " : "";
  if (!date) return circa + spanLabel(startYear, Math.max(startYear, endYear));
  const start = [date.day, MONTHS[date.month - 1], yearLabel(startYear)].filter((x) => x != null).join(" ");
  if (endYear <= startYear) return circa + start;
  const end = yearLabel(endYear);
  // Both AD: the second needs no "AD", as in "AD 46–49".
  const endShort = startYear >= 1 && end.startsWith("AD ") ? end.slice(3) : end;
  return `${circa}${start} – ${endShort}`;
}

/** Any event's date: a church event's as its history gives it, a Bible
 * event's as its chronology does. */
export function eventDateLabel(e: TimelineEvent): string {
  return isChurchEvent(e) ? churchDateLabel(e) : spanLabel(e.start_year, e.end_year);
}

/** What hovering an event on the line says: its title and date, and for a
 * church council, life, writing or mission, which of them it is -- what its
 * mark's shape stands for: "Synod of Dort · Council · 13 November AD 1618 –
 * 1619". (Anything else has the plain dot, and "Event" would say nothing.) */
export function eventHoverText(e: TimelineEvent): string {
  const kind = isChurchEvent(e) && e.kind !== "event" ? kindLabel(e.kind) : null;
  return [e.title, kind, eventDateLabel(e)].filter(Boolean).join(" · ");
}

const KIND_LABELS: Record<NonNullable<TimelineEvent["kind"]>, string> = {
  council: "Council",
  life: "Life",
  writing: "Writing",
  mission: "Mission",
  event: "Event",
};

export function kindLabel(kind: TimelineEvent["kind"]): string | null {
  return kind ? (KIND_LABELS[kind] ?? null) : null;
}

/**
 * A citation as a reader would write it down to look it up: the work, the
 * volume, and where in it -- "Schaff, History of the Christian Church, vol. II,
 * § 187. Origen". The source's own full stop at the end of a locator is
 * dropped, so every line ends alike.
 */
export function citationLine(c: Pick<TimelineCitation, "work" | "volume" | "locator">): string {
  const parts = [c.work, c.volume ? `vol. ${c.volume}` : null, c.locator]
    .map((p) => p?.trim().replace(/\.$/, ""))
    .filter((p): p is string => !!p);
  return parts.join(", ");
}

/** Where a web citation's link goes, shown beside it so the reader knows
 * before following it ("encyclopedia.ushmm.org"). Null for anything that is
 * not an http(s) address. */
export function citationHost(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.hostname.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
}

/** "Read the Westminster Confession of Faith", from the document's own title
 * (one of which, the Directory, already begins "The"). */
export function confessionLinkLabel(title: string): string {
  return `Read the ${title.replace(/^the\s+/i, "")}`;
}

/**
 * The library book an event concerns, by its file name in the pack -- which is
 * its `library_key` once installed -- when it can be opened. Null when this
 * library does not have it, and null too when no pack is installed at all:
 * after an upgrade from the builds that bundled the library, the reader's rows
 * keep their `library_key` (it is the only record of which book each one was,
 * and a pack installed later re-adopts them by it) while the files are not on
 * the machine. The Resources view shows those as "Not installed"; offered
 * here as "Open in the library" they would open a book that is not there.
 * With any pack installed, the launch sync has already let go of every row
 * whose book is in no installed pack and not on the machine, so a key that
 * is still set is one that opens (the Resources view reasons the same way).
 * `packs` unknown (still loading) counts as none, so the link is never offered
 * on a guess.
 */
export function findLibraryResource(
  resources: Resource[] | undefined,
  fileName: string | null,
  packs: Pick<PackStatus, "installed">[] | undefined,
): Resource | null {
  if (!fileName || !resources || !packs?.some((p) => p.installed)) return null;
  return resources.find((r) => r.library_key === fileName) ?? null;
}

/** A pack file's name as a title: "The Works of Flavius Josephus". */
export function libraryBookName(fileName: string): string {
  return fileName.replace(/\.epub$/i, "");
}
