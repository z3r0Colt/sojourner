import { MIN_SPAN, clampRange, sameRange, widestRange, type TimelineViewRange } from "./timelineRange";

/**
 * The overview strip's arithmetic: the whole line (`world`, the view zoomed
 * right out) drawn across `width` pixels, and the current view as a window on
 * it that the reader drags. Pure, so the strip's feel -- what a drag of so
 * many pixels does, where the edges can be caught -- is tested here rather
 * than by hand.
 */

/** A year's place on the strip, in pixels from its left. */
export function stripX(year: number, world: TimelineViewRange, width: number): number {
  return ((year - world.start) / (world.end - world.start)) * width;
}

/** The year under a pixel on the strip. */
export function stripYear(px: number, world: TimelineViewRange, width: number): number {
  return world.start + (px / Math.max(width, 1)) * (world.end - world.start);
}

/**
 * The view's window on the strip. Zoomed in to a few years it would be a
 * hairline no one could catch, so it never draws narrower than `minPx`, held
 * about the view's middle. It may run past the strip where the view runs past
 * the line's margins; the strip clips it.
 */
export function stripWindow(view: TimelineViewRange, world: TimelineViewRange, width: number, minPx = 8): { x0: number; x1: number } {
  const x0 = stripX(view.start, world, width);
  const x1 = stripX(view.end, world, width);
  if (x1 - x0 >= minPx) return { x0, x1 };
  const mid = (x0 + x1) / 2;
  return { x0: mid - minPx / 2, x1: mid + minPx / 2 };
}

/** What a press on the strip takes hold of: an edge of the window (to zoom),
 * the window itself (to pan), or the strip outside it (to jump). */
export type StripGrip = "start" | "end" | "move" | "outside";

/**
 * Which part of the window a press at `px` catches. The edges are caught
 * within `grip` pixels either side, but only on a window wide enough to have
 * a middle left over -- on a narrow one every press moves it, which is what a
 * reader reaching for a small thing means.
 */
export function stripGrip(px: number, win: { x0: number; x1: number }, grip = 5): StripGrip {
  const wide = win.x1 - win.x0 >= grip * 3;
  if (wide && Math.abs(px - win.x0) <= grip) return "start";
  if (wide && Math.abs(px - win.x1) <= grip) return "end";
  if (px >= win.x0 && px <= win.x1) return "move";
  return "outside";
}

/**
 * The view after dragging what `grip` caught from `fromPx` to `px`, starting
 * from the view `from`. Moving the window pans, clamped like any other view.
 * Moving an edge zooms with the other edge held where it is -- see
 * `dragEdge` -- never closer than MIN_SPAN. Either way the window follows the
 * pointer by how far it has moved, not to where it is, so catching it a few
 * pixels off does not make it jump.
 */
export function stripDrag(
  grip: Exclude<StripGrip, "outside">,
  from: TimelineViewRange,
  fromPx: number,
  px: number,
  world: TimelineViewRange,
  width: number,
  full: TimelineViewRange,
): TimelineViewRange {
  const by = (px - fromPx) * ((world.end - world.start) / Math.max(width, 1));
  if (grip === "move") return clampRange({ start: from.start + by, end: from.end + by }, full);
  return dragEdge(grip, from, by, full);
}

/**
 * One edge of the view moved by `by` years with the other held still. Handing
 * the moved range to `clampRange` is not enough: near an end of the line it
 * keeps the new width and slides the whole window back inside the slack, so
 * the edge the reader is not touching creeps along, the dragged edge lags the
 * pointer, and past the strip's end (pointer capture lets the pointer go on)
 * it even turns back. Instead the dragged edge goes as far towards `by` as it
 * can while the view stays one `clampRange` leaves alone, and stops there: at
 * Creation or today, widening by the outer edge stops once the line's end has
 * all the room past it the slack allows, and the reader widens by the other
 * edge. The limit is found by bisection between the edge as it was and the
 * furthest it could go (the whole line's width, or MIN_SPAN inward). That
 * works because the edges that keep a view whole are one unbroken stretch --
 * the slack grows with the width and then shrinks again, but never breaks in
 * two -- and because the limit is worked out from `from` alone, not from the
 * pointer, the edge never moves back as the pointer goes further: it follows
 * to the limit and holds there.
 */
export function dragEdge(grip: "start" | "end", from: TimelineViewRange, by: number, full: TimelineViewRange): TimelineViewRange {
  // A view that was not whole to begin with (it should always be, but it
  // comes in as a prop) is made so first, and the edge held from there.
  const whole = clampRange(from, full);
  const base = sameRange(whole, from) ? from : whole;
  const widest = widestRange(full);
  const held = grip === "start" ? base.end : base.start;
  const was = grip === "start" ? base.start : base.end;
  /** The view with the dragged edge at `edge`. */
  const at = (edge: number): TimelineViewRange => (grip === "start" ? { start: edge, end: held } : { start: held, end: edge });
  const fits = (edge: number) => {
    const r = at(edge);
    return sameRange(clampRange(r, full), r);
  };
  const wanted = was + by;
  if (!Number.isFinite(wanted)) return base;
  if (fits(wanted)) return at(wanted);
  // Outward the view widens (the start earlier, the end later), at most to
  // the whole line; inward it narrows, at most to MIN_SPAN.
  const outward = grip === "start" ? -1 : 1;
  const widening = Math.sign(by) === outward;
  let good = was;
  let bad = held + outward * (widening ? widest.end - widest.start : MIN_SPAN);
  for (let i = 0; i < 64 && Math.abs(bad - good) > 1e-9; i++) {
    const mid = (good + bad) / 2;
    if (fits(mid)) good = mid;
    else bad = mid;
  }
  // `wanted` did not fit, and the edges that do are one stretch holding
  // `was`, so it lies past the limit: the edge stops there.
  return at(good);
}
