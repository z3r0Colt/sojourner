import type { TimelineEvent } from "../../api/types";

/**
 * Years on the timeline are astronomical: 1 BC is 0, 588 BC is -587, and a
 * fraction is part of the way through the year. That is what lays out on a
 * line without a gap between 1 BC and AD 1; these turn it back into BC and AD.
 */
export function yearLabel(astro: number): string {
  const y = Math.floor(astro + 1e-9);
  return y <= 0 ? `${1 - y} BC` : `AD ${y}`;
}

/** A span as a chronology prints it -- the start year, and the start plus the
 * length: "588 BC", Solomon's "1015–975 BC", "4 BC–AD 30". */
export function spanLabel(start: number, end: number): string {
  const a = yearLabel(start);
  if (end - start < 1) return a;
  const b = yearLabel(end);
  if (a === b) return a;
  const bothBc = a.endsWith("BC") && b.endsWith("BC");
  const bothAd = a.startsWith("AD") && b.startsWith("AD");
  if (bothBc) return `${a.slice(0, -3)}–${b}`;
  if (bothAd) return `${a}–${b.slice(3)}`;
  return `${a}–${b}`;
}

/** How long, in the source's terms: "40 years", "8 days". */
export function durationLabel(start: number, end: number): string | null {
  const years = end - start;
  if (years <= 0) return null;
  if (years >= 1.5) return `${Math.round(years)} years`;
  if (years >= 0.95) return "a year";
  const months = Math.round(years * 12);
  if (months >= 2) return `${months} months`;
  const days = Math.round(years * 365.25);
  return days <= 1 ? null : `${days} days`;
}

const STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];

/** Axis ticks at round historical years ("600 BC", "AD 30") across a span,
 * roughly one per `minGap` pixels. Each is [astronomical year, label]. */
export function ticks(viewStart: number, viewEnd: number, width: number, minGap = 90): [number, string][] {
  const perPx = (viewEnd - viewStart) / Math.max(width, 1);
  const step = STEPS.find((s) => s / perPx >= minGap) ?? 1000;
  const out: [number, string][] = [];
  // BC: historical year h is astronomical 1 - h.
  const firstBc = Math.ceil((1 - Math.min(viewEnd, 0)) / step) * step;
  for (let h = firstBc; 1 - h >= viewStart; h += step) out.push([1 - h, `${h} BC`]);
  const firstAd = Math.max(step, Math.ceil(Math.max(viewStart, 1) / step) * step);
  for (let a = firstAd; a <= viewEnd; a += step) out.push([a, `AD ${a}`]);
  return out.sort((x, y) => x[0] - y[0]);
}

/** Where a label pinned at the left edge begins: after a small arrow saying
 * its mark is off to the left. */
export const PIN_TEXT_X = 12;
/** The least room a label is cut short to. Less than this and the mark goes
 * unnamed, as a cut would leave hardly a word of it: its title is on hover. */
const MIN_LABEL_ROOM = 32;

/** Where an event's label goes (`labelPlacement`). */
export interface LabelAt {
  /** Inside its bar, on a wash. */
  inside: boolean;
  /** Before its mark, set to end at `x + room`, just short of it. */
  before: boolean;
  /** Its mark is off the left edge: the label is pinned whole at the edge,
   * after an arrow pointing the way to it. */
  pinned: boolean;
  /** Where the label's room begins. */
  x: number;
  /** How wide it is: the label's own width, or less where it is cut short to
   * fit (`fitLabel`), and none where there is no room for a name at all. */
  room: number;
  /** From where to where the row is held for the event's mark and label. */
  start: number;
  end: number;
}

/**
 * Where an event's label goes, in a view `width` pixels wide, or null when
 * nothing of the event would show there.
 *
 * Inside its bar when the part of the bar in view has room for it -- from the
 * left edge of the view when the bar runs in from off it, so Luther's life
 * across a view of the Reformation is still named. Else just after the bar
 * (or the dot); or, where that would run off the right edge and there is room
 * before the mark, just before it, so a name at the present end of the line
 * is read whole and not cut to "Karl Bar". Where it fits whole on none of
 * those -- a long title in a narrow pane -- it goes wherever there is most
 * room and is cut short at a word to fit ("Calvin's Institutes of the…"),
 * never at the edge of the canvas mid-letter.
 *
 * An event whose mark is off the left edge altogether has no mark in view to
 * name. Its label would run in from off the left, a tail of letters with no
 * beginning ("rmed Dogmatics"), so it is pinned whole at the left edge
 * instead, after an arrow, for as long as some of it would have shown; and
 * where it cannot be pinned whole -- wider than the view -- it is not shown.
 * An event whose mark is past the right edge shows nothing: its label runs
 * further right still.
 *
 * Drawing and packing both use this, so a row is held for exactly as long as
 * its mark and label run: from `start` to `end`.
 */
export function labelPlacement(x0: number, x1: number, labelWidth: number, width = Infinity): LabelAt | null {
  const markEnd = Math.max(x1, x0 + 6);
  const after = markEnd + 4;
  if (markEnd < 0) {
    if (after + labelWidth <= 0 || PIN_TEXT_X + labelWidth > width) return null;
    return { inside: false, before: false, pinned: true, x: PIN_TEXT_X, room: labelWidth, start: 0, end: PIN_TEXT_X + labelWidth };
  }
  if (x0 > width) return null;
  const shownFrom = Math.max(x0, 0);
  const insideRoom = Math.min(x1, width) - shownFrom - 16;
  const afterRoom = width - after;
  const beforeRoom = x0 - 4;
  const inside = (room: number): LabelAt => ({ inside: true, before: false, pinned: false, x: shownFrom + 8, room, start: x0, end: x1 });
  const atAfter = (room: number): LabelAt => ({ inside: false, before: false, pinned: false, x: after, room, start: x0, end: after + room });
  const atBefore = (room: number): LabelAt => ({ inside: false, before: true, pinned: false, x: x0 - 4 - room, room, start: x0 - 4 - room, end: markEnd });
  if (insideRoom > labelWidth) return inside(labelWidth);
  if (labelWidth <= afterRoom) return atAfter(labelWidth);
  if (labelWidth <= beforeRoom) return atBefore(labelWidth);
  // Whole nowhere: cut short where there is most room.
  const most = Math.max(insideRoom, afterRoom, beforeRoom);
  if (most < MIN_LABEL_ROOM) return atAfter(0);
  if (most === afterRoom) return atAfter(afterRoom);
  if (most === insideRoom) return inside(insideRoom);
  return atBefore(beforeRoom);
}

/** Punctuation and space a cut would leave hanging: "Luther," "Trent –". */
const HANGING = /[\s,;:·–—-]+$/u;
/** The least of a title a cut keeps: "The…" or "St.…" names nothing. */
const MIN_KEPT = 4;

/** A word that names someone or somewhere: capitalised ("Methuselah",
 * "Haran", "Spurgeon's"). */
const NAME = /^\p{Lu}/u;

/**
 * A title cut short to fit `room` pixels: whole where it fits; else as many of
 * its words as fit, and an ellipsis ("Calvin's Institutes of the…"); else as
 * many of its letters as fit, four at least ("Constantin…", "The Re…"); else
 * nothing. The whole title is on hover.
 *
 * Before any of that, a title keeps the names it goes on to, and the cut is
 * made in the middle: the words a title begins with are often ones its
 * neighbours share ("Lifetime of", "Martyrdom of", "Abraham"), and a row of
 * "Lifetime of…" tells nothing apart. So where a title opens on a plain
 * word, the first name after it is kept with all that comes after that
 * ("Lifetime… Methuselah", "Martyrdom… Paul in Rome", "…Paul in Rome",
 * "Abraham goes… Egypt"); else the name it ends in ("Charles… Spurgeon",
 * "Calvin's Institutes… Religion"). A title with no name after
 * its opening words ("Constantinople falls", "Council of Trent – first
 * session", whose end names nothing) is cut at its end as before.
 */
export function fitLabel(title: string, room: number, measure: (s: string) => number): string {
  if (measure(title) <= room) return title;
  const words = title.split(" ");
  const fits = (s: string) => measure(s) <= room;
  const head = (n: number) => words.slice(0, n).join(" ").replace(HANGING, "");
  /** The title from word `t` on, after as much of its beginning as fits. */
  const keepFrom = (t: number): string | null => {
    const tail = words.slice(t).join(" ");
    if (tail.length < MIN_KEPT) return null;
    for (let n = t - 1; n >= 1; n--) {
      const kept = head(n);
      if (kept.length >= MIN_KEPT && fits(`${kept}… ${tail}`)) return `${kept}… ${tail}`;
    }
    return fits(`…${tail}`) ? `…${tail}` : null;
  };
  // A title that opens on a plain word after its first ("Lifetime of",
  // "Abraham goes") begins with what its neighbours share; one that opens
  // on a name of two words or more ("Calvin's Institutes", "Charles Haddon")
  // begins with what it is, and keeps that.
  const named = words.length > 2 && !NAME.test(words[1]) ? words.findIndex((w, i) => i >= 2 && NAME.test(w) && !NAME.test(words[i - 1])) : -1;
  const last = words.length - 1;
  const kept = (named > 0 ? keepFrom(named) : null) ?? (last >= 1 && NAME.test(words[last]) ? keepFrom(last) : null);
  if (kept) return kept;
  for (let n = words.length - 1; n >= 1; n--) {
    const cut = head(n);
    if (cut.length >= MIN_KEPT && fits(`${cut}…`)) return `${cut}…`;
  }
  for (let n = title.length - 1; n >= MIN_KEPT; n--) {
    const cut = title.slice(0, n).replace(HANGING, "");
    if (cut.length >= MIN_KEPT && fits(`${cut}…`)) return `${cut}…`;
  }
  return "";
}

export interface Placed {
  event: TimelineEvent;
  row: number;
  x0: number;
  x1: number;
  /** Where its mark or its label begins, whichever is first: the row is
   * taken from here. */
  xFrom: number;
  /** Where its mark or its label ends: the row is taken up to here. */
  xLabel: number;
  /** Where its label goes, as it was packed: drawing puts it there. */
  label: LabelAt;
}

/** Where an event's mark and label run across a view `width` pixels wide:
 * its bar from its start to its end (never narrower than the dot), and its
 * label where `labelPlacement` puts it, with a little room kept either side;
 * or null when nothing of it shows. Packing, reach and drawing all measure
 * an event this one way. */
function extentOnCanvas(e: TimelineEvent, x: (year: number) => number, labelWidth: (e: TimelineEvent) => number, width: number) {
  const x0 = x(e.start_year);
  const x1 = Math.max(x(e.end_year), x0 + 6);
  const label = labelPlacement(x0, x1, labelWidth(e), width);
  return label && { x0, x1, xFrom: label.start - 4, xLabel: label.end + 8, label };
}

/**
 * Whether an event's mark shows in a view `width` pixels wide. One whose mark
 * is off the left edge is not in reach, though its name may be pinned there
 * (`labelPlacement`): it is not counted among those left out, and a history
 * with nothing else near is not given rows for it. An event that starts past
 * the right edge shows nothing -- its label runs further right still -- so it
 * takes no row. (It once did, which cost nothing while there was one band;
 * with two, a council just past the right edge of a view of the kings would
 * have opened a church band with nothing to see in it.)
 */
export function inReach(e: TimelineEvent, x: (year: number) => number, width: number, labelWidth: (e: TimelineEvent) => number): boolean {
  const at = extentOnCanvas(e, x, labelWidth, width);
  return at != null && !at.label.pinned;
}

export interface Packed {
  placed: Placed[];
  /** In reach but with no row to go in. */
  hidden: number;
  /** How many rows it took. */
  rows: number;
}

const NOTHING_PACKED: Packed = { placed: [], hidden: 0, rows: 0 };

/**
 * Packs events into rows without overlap. The most important go first -- an
 * era's containers and long spans, then single events, births and deaths
 * last -- each into the first row with room for its mark and its label, from
 * whichever begins first to whichever ends last. What finds no room in
 * `maxRows` rows is left out at this zoom (zooming in makes room) and
 * counted, so the view can say how many. Only what shows is packed
 * (`inReach`), and each event's priority is asked once, not at every
 * comparison of the sort: this runs on every frame of a drag, over the whole
 * timeline.
 *
 * Names pinned at the left edge for marks off it come last of all, the
 * nearest first, and only into room the rows already have: they never push
 * an event in view down or out, open a row of their own, or count among those
 * left out -- zooming in would not bring them into view.
 */
export function packRows(
  events: TimelineEvent[],
  x: (year: number) => number,
  labelWidth: (e: TimelineEvent) => number,
  maxRows: number,
  width: number,
  priority: (e: TimelineEvent) => number = () => 0,
): Packed {
  type Showing = { event: TimelineEvent; rank: number; x0: number; x1: number; xFrom: number; xLabel: number; label: LabelAt };
  const rows: [number, number][][] = [];
  const placed: Placed[] = [];
  let hidden = 0;
  const showing: Showing[] = [];
  const pinned: Showing[] = [];
  for (const event of events) {
    const at = extentOnCanvas(event, x, labelWidth, width);
    if (!at) continue;
    if (at.label.pinned) pinned.push({ event, rank: 0, ...at });
    else showing.push({ event, rank: priority(event), ...at });
  }
  showing.sort((a, b) => b.rank - a.rank || a.event.start_year - b.event.start_year || b.event.end_year - a.event.end_year);
  pinned.sort((a, b) => b.event.end_year - a.event.end_year || b.event.start_year - a.event.start_year);
  const free = (row: [number, number][], a: number, b: number) => row.every(([s, e]) => b <= s || a >= e);
  const put = ({ event, x0, x1, xFrom, xLabel, label }: Showing, row: number) => {
    rows[row].push([xFrom, xLabel]);
    placed.push({ event, row, x0, x1, xFrom, xLabel, label });
  };
  for (const s of showing) {
    let row = rows.findIndex((r) => free(r, s.xFrom, s.xLabel));
    if (row < 0) {
      if (rows.length >= maxRows) {
        hidden++;
        continue;
      }
      row = rows.length;
      rows.push([]);
    }
    put(s, row);
  }
  for (const s of pinned) {
    const row = rows.findIndex((r) => free(r, s.xFrom, s.xLabel));
    if (row >= 0) put(s, row);
  }
  return { placed, hidden, rows: rows.length };
}

/**
 * How much of the view a history's events span: from the first mark showing
 * to the last, as a share of the width (a name pinned at the left edge adds
 * nothing -- its years are off the screen). Null when none of them shows.
 */
export function viewShare(
  events: TimelineEvent[],
  x: (year: number) => number,
  labelWidth: (e: TimelineEvent) => number,
  width: number,
): number | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const e of events) {
    const at = extentOnCanvas(e, x, labelWidth, width);
    if (!at || at.label.pinned) continue;
    lo = Math.min(lo, Math.max(0, at.x0));
    hi = Math.max(hi, Math.min(width, at.x1));
  }
  if (lo === Infinity) return null;
  return Math.max(0, hi - lo) / Math.max(width, 1);
}

/** The least of the rows the Bible is held to while both histories are in
 * view (before either hands on what it leaves empty), and the most church
 * history is: a quarter and three quarters. */
const BAND_SHARE_MIN = 0.25;
/** How much of the view church history's years must span before its band is
 * held to that quarter too. */
const CHURCH_FULL_FLOOR_AT = 0.2;

/** The least share of the rows church history is held to when its years span
 * `share` of the view: a quarter once they span a fifth of it, and less as
 * they narrow, so a sliver gets a sliver and not a quarter of the canvas. */
function churchFloor(share: number): number {
  return BAND_SHARE_MIN * Math.min(1, share / CHURCH_FULL_FLOOR_AT);
}

/**
 * The Bible's events and church history's, packed as two bands, one under the
 * other, out of the same `maxRows`. Each band's rows are its own -- row 0 of
 * the church band is the first row below the Bible's last -- so a council can
 * never be packed into a gap between two of the kings, and a reader always
 * knows which history a mark belongs to by where it is as well as its color.
 *
 * Where the view holds only one, that one has every row. Where it holds both,
 * each is held to rows in proportion to how much of the view its years span.
 * The Bible is never held under a quarter: the Middle Ages with Acts at the
 * left edge still give it its quarter, as it is what the app is for. Church
 * history is held to a quarter too once its years span a fifth of the view,
 * but squeezed into a sliver at the right edge it gets rows for a sliver, and
 * at least one: the first century at the end of the "Bible" jump, a few
 * pixels wide, is a row of church history, not a quarter of the canvas given
 * to its marks while the Bible's own events go unshown. Church history is
 * packed first to its share, the Bible takes every row the church band did
 * not use, and if the Bible then leaves rows empty the church band gets
 * another pass with them. Where rows are short the Bible keeps the odd one,
 * and with a single row the Bible has it.
 */
export function packBands(
  bible: TimelineEvent[],
  church: TimelineEvent[],
  x: (year: number) => number,
  labelWidth: (e: TimelineEvent) => number,
  maxRows: number,
  width: number,
  priority: (e: TimelineEvent) => number = () => 0,
): { bible: Packed; church: Packed } {
  const pack = (events: TimelineEvent[], rows: number) => packRows(events, x, labelWidth, Math.max(0, rows), width, priority);
  const churchShare = viewShare(church, x, labelWidth, width);
  if (churchShare == null) return { bible: pack(bible, maxRows), church: NOTHING_PACKED };
  const bibleShare = viewShare(bible, x, labelWidth, width);
  if (bibleShare == null) return { bible: NOTHING_PACKED, church: pack(church, maxRows) };
  const total = bibleShare + churchShare;
  const share = Math.min(1 - BAND_SHARE_MIN, Math.max(churchFloor(churchShare), total > 0 ? churchShare / total : 0.5));
  let churchBand = pack(church, Math.min(maxRows - 1, Math.max(1, Math.floor(maxRows * share))));
  const bibleBand = pack(bible, maxRows - churchBand.rows);
  const left = maxRows - bibleBand.rows;
  if (churchBand.hidden > 0 && left > churchBand.rows) churchBand = pack(church, left);
  return { bible: bibleBand, church: churchBand };
}

/** What a selected event's priority is raised to when it would otherwise be
 * left out. */
const MUST_SHOW = 10_000;

/**
 * `packBands`, with the reader's selection sure to show. A selected event keeps
 * the row it was clicked in: selecting it changes its color, not where it or
 * its neighbours are, so the reader does not lose their place. Only one that
 * would be left out at this zoom -- picked from the search, or found again by
 * a jump -- is put first, and then the rows are packed again around it.
 */
export function packBandsWithSelection(
  bible: TimelineEvent[],
  church: TimelineEvent[],
  x: (year: number) => number,
  labelWidth: (e: TimelineEvent) => number,
  maxRows: number,
  width: number,
  priority: (e: TimelineEvent) => number,
  selected: TimelineEvent | null | undefined,
): { bible: Packed; church: Packed } {
  const bands = packBands(bible, church, x, labelWidth, maxRows, width, priority);
  if (!selected || !inReach(selected, x, width, labelWidth)) return bands;
  const shows = (b: Packed) => b.placed.some((p) => p.event === selected);
  if (shows(bands.bible) || shows(bands.church)) return bands;
  return packBands(bible, church, x, labelWidth, maxRows, width, (e) => (e === selected ? MUST_SHOW : priority(e)));
}

/** How much an event matters at a glance: what contains others and what
 * lasts, before the single day; a birth or a death last of all. Church
 * history has no containers, so there the creeds and confessions the app
 * carries come first (Nicaea, Chalcedon, Dort, Westminster: what a reader can
 * open from the event), then the councils, which a life of seventy years
 * would otherwise crowd out, then lives by their length. */
export function importance(e: TimelineEvent, hasChildren: boolean): number {
  let score = Math.min(e.end_year - e.start_year, 400);
  if (hasChildren) score += 500;
  if (e.source === "added") score += 60;
  if (e.confession) score += 120;
  if (e.kind === "council") score += 80;
  if (/^(Birth|Death) of /.test(e.title)) score -= 200;
  return score;
}
