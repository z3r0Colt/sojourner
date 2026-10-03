/**
 * How far the timeline runs and how the view moves along it: the pure half of
 * the canvas's panning and zooming, so the limits a reader meets at either end
 * can be tested without a canvas. Years are astronomical, as everywhere on the
 * timeline (1 BC is 0).
 */

export interface TimelineViewRange {
  start: number;
  end: number;
}

/** A little before Creation: Ussher's 4004 BC (-4003), with a century to spare. */
const LINE_START = -4100;
/** How far past its last year the line runs, so the last event has a little
 * room after it even at "All". */
const PAST_THE_END = 10;
/** Where the Bible's own line ended before church history joined it: a little
 * after Acts. A timeline without church history still ends here. */
const BIBLE_END = 120;

/** The line through church history to `year` (the present): the widest the
 * timeline can be, whatever events it is showing. */
export function fullRangeUntil(year: number): TimelineViewRange {
  return { start: LINE_START, end: Math.floor(year) + PAST_THE_END };
}

/** The whole line: a little before Creation to a little after today. */
export const FULL_RANGE: TimelineViewRange = fullRangeUntil(new Date().getFullYear());

/** The narrowest the view zooms: four years across. */
export const MIN_SPAN = 4;

/**
 * The line as far as what it is showing reaches: from before Creation to a
 * little after the last event or era it was given, and never past `full`.
 * With church history on that is today; with it off, the Bible's own end, so
 * a reader who has turned the councils off is not left panning through
 * nineteen empty centuries after Acts.
 */
export function lineFor(lastYear: number | null, full: TimelineViewRange = FULL_RANGE): TimelineViewRange {
  if (lastYear == null || !Number.isFinite(lastYear)) return full;
  return { start: full.start, end: Math.min(full.end, Math.max(BIBLE_END, Math.ceil(lastYear) + PAST_THE_END)) };
}

/** The first and last years among events and eras: where Home and End go. */
export function extentOf(items: Iterable<{ start_year: number; end_year: number }>): TimelineViewRange | null {
  let start = Infinity;
  let end = -Infinity;
  for (const it of items) {
    if (it.start_year < start) start = it.start_year;
    if (it.end_year > end) end = it.end_year;
  }
  return Number.isFinite(start) && Number.isFinite(end) ? { start, end } : null;
}

/** The margin past either end of the line at full zoom-out: a twentieth of
 * its length, about three centuries, enough that neither Creation nor today
 * sits on the frame. */
export function edgeYears(full: TimelineViewRange = FULL_RANGE): number {
  return (full.end - full.start) * 0.05;
}

/** The view zoomed right out: the whole line with its margins. The overview
 * strip under the canvas maps exactly this. */
export function widestRange(full: TimelineViewRange = FULL_RANGE): TimelineViewRange {
  const edge = edgeYears(full);
  return { start: full.start - edge, end: full.end + edge };
}

/**
 * How far past an end of the line a view `span` years wide may run. Zoomed
 * in, half the view: an end of the line can come to the middle of the screen,
 * so the first event and the last are read in the open rather than pinned
 * against the frame. Zoomed right out, half the view would let the whole line
 * slide half off the screen, so the slack narrows as the view widens, down to
 * the fixed margin at full zoom-out. It narrows continuously -- the two rules
 * meet where they are equal -- so zooming near an end never jumps.
 */
export function slackYears(span: number, full: TimelineViewRange = FULL_RANGE): number {
  const edge = edgeYears(full);
  const widest = full.end - full.start + 2 * edge;
  return Math.max(0, Math.min(span / 2, edge + (widest - span) / 2));
}

/**
 * A view the timeline can show: no narrower than MIN_SPAN, no wider than the
 * whole line with its margins, and no further past either end than
 * `slackYears` allows. Anything not a finite number -- a pan that divided by
 * a zero width, a range built from no events -- comes back as the whole line.
 */
export function clampRange(r: TimelineViewRange, full: TimelineViewRange = FULL_RANGE): TimelineViewRange {
  const widest = widestRange(full);
  const maxSpan = widest.end - widest.start;
  const asked = r.end - r.start;
  const span = Number.isFinite(asked) ? Math.min(Math.max(asked, MIN_SPAN), maxSpan) : maxSpan;
  const slack = slackYears(span, full);
  const lo = full.start - slack;
  const hi = full.end + slack - span;
  const start = Number.isFinite(r.start) ? Math.min(Math.max(r.start, lo), hi) : lo;
  return { start, end: start + span };
}

/** Two views the same to within float noise. What `clampRange` hands back
 * for a view it leaves alone can differ from it in the last digits, as the
 * end is rebuilt from the start and the span; and a wheel notch or a drag at
 * a limit asks for the view it already has, which is no change to hand on --
 * handing it on redraws the canvas and re-renders the whole timeline around
 * it for nothing, sixty times a second. */
export function sameRange(a: TimelineViewRange, b: TimelineViewRange): boolean {
  const tolerance = 1e-12 * Math.max(1, Math.abs(a.start), Math.abs(a.end));
  return Math.abs(a.start - b.start) <= tolerance && Math.abs(a.end - b.end) <= tolerance;
}

/** The view moved along by `years` (later when positive). */
export function panBy(r: TimelineViewRange, years: number, full: TimelineViewRange = FULL_RANGE): TimelineViewRange {
  return clampRange({ start: r.start + years, end: r.end + years }, full);
}

/** The view zoomed by `k` (below 1 is in) about the year `at`, which stays
 * where it is on the screen -- under the pointer, for the wheel. */
export function zoomAbout(r: TimelineViewRange, at: number, k: number, full: TimelineViewRange = FULL_RANGE): TimelineViewRange {
  return clampRange({ start: at - (at - r.start) * k, end: at + (r.end - at) * k }, full);
}

/**
 * Two fingers on a touch screen: the view `from` (where the pinch began)
 * stretched by how far the fingers have spread -- `startGap` apart then,
 * `gap` now -- with the year that was between them, `at`, kept between them
 * as they move (`fraction` of the way across). So one gesture zooms and pans
 * at once, as a map does.
 */
export function pinchRange(
  from: TimelineViewRange,
  at: number,
  startGap: number,
  gap: number,
  fraction: number,
  full: TimelineViewRange = FULL_RANGE,
): TimelineViewRange {
  const span = ((from.end - from.start) * Math.max(startGap, 1)) / Math.max(gap, 1);
  const start = at - fraction * span;
  return clampRange({ start, end: start + span }, full);
}

/** The view, the same width, centred on `year`: a click on the overview. */
export function centreOn(r: TimelineViewRange, year: number, full: TimelineViewRange = FULL_RANGE): TimelineViewRange {
  const span = r.end - r.start;
  return clampRange({ start: year - span / 2, end: year + span / 2 }, full);
}

/** The parts of a key press the timeline reads. */
export interface TimelineKey {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

/**
 * The keys the canvas and the overview strip share, as a scrollbar's are:
 * the arrows move a little over a seventh of the view, Page Up and Page Down
 * most of a screen, Home and End to the first and last events (a tenth of the
 * view in from the frame, so they are not on it), and plus and minus zoom
 * about the middle. Null for a key that is not the timeline's, so the caller
 * lets it through -- and for any key with Alt, Ctrl or Cmd held, whatever it
 * is: those chords are the app's, and a timeline that took them (it calls
 * preventDefault, and the shell leaves alone what a view has answered) would
 * turn Alt+Left from Back into a pan and Ctrl+= from the app's text size into
 * a zoom, just because a click had left it with focus. Shift is let through,
 * as it is how + and _ are typed.
 */
export function rangeForKey(
  press: TimelineKey,
  r: TimelineViewRange,
  extent: TimelineViewRange | null,
  full: TimelineViewRange = FULL_RANGE,
): TimelineViewRange | null {
  if (press.altKey || press.ctrlKey || press.metaKey) return null;
  const span = r.end - r.start;
  const first = extent?.start ?? full.start;
  const last = extent?.end ?? full.end;
  switch (press.key) {
    case "ArrowLeft":
      return panBy(r, -span * 0.15, full);
    case "ArrowRight":
      return panBy(r, span * 0.15, full);
    case "PageUp":
      return panBy(r, -span * 0.9, full);
    case "PageDown":
      return panBy(r, span * 0.9, full);
    case "Home":
      return clampRange({ start: first - span * 0.1, end: first + span * 0.9 }, full);
    case "End":
      return clampRange({ start: last - span * 0.9, end: last + span * 0.1 }, full);
    case "+":
    case "=":
      return zoomAbout(r, (r.start + r.end) / 2, 0.7, full);
    case "-":
    case "_":
      return zoomAbout(r, (r.start + r.end) / 2, 1 / 0.7, full);
    default:
      return null;
  }
}

/** What a wheel event asks of the view, in screen pixels. */
export type WheelIntent = { pan: number } | { zoom: number };

/**
 * What a wheel event means on the timeline. A plain wheel zooms about the
 * pointer, as it always has; Shift with the wheel pans, as it scrolls sideways
 * everywhere else on the desktop; and a trackpad's sideways swipe (a mostly
 * horizontal delta) pans too. Chromium hands Shift+wheel over already turned
 * into a horizontal delta and some browsers do not, so under Shift whichever
 * delta is larger is the pan. A pinch arrives as Ctrl+wheel and stays a zoom
 * even with Shift held. `panOnly` is for the overview strip, which is a
 * scrollbar: there every wheel pans. Line and page deltas (Firefox's) are
 * turned into pixels first, so a notch feels the same everywhere. Null for a
 * delta of nothing.
 */
export function wheelIntent(
  ev: { deltaX: number; deltaY: number; deltaMode: number; shiftKey: boolean; ctrlKey?: boolean },
  pagePx: number,
  panOnly = false,
): WheelIntent | null {
  const unit = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? pagePx : 1;
  const dx = ev.deltaX * unit;
  const dy = ev.deltaY * unit;
  if (dx === 0 && dy === 0) return null;
  const sideways = Math.abs(dx) > Math.abs(dy);
  if (panOnly || sideways || (ev.shiftKey && !ev.ctrlKey)) return { pan: sideways ? dx : dy };
  return { zoom: Math.exp(dy * 0.0015) };
}
