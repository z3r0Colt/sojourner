import { describe, expect, it } from "vitest";
import { dragEdge, stripDrag, stripGrip, stripWindow, stripX, stripYear } from "./timelineStrip";
import { MIN_SPAN, clampRange, fullRangeUntil, sameRange, widestRange, type TimelineViewRange } from "./timelineRange";

const full = fullRangeUntil(2026);
const world = widestRange(full);
const width = 1000;
const perPx = (world.end - world.start) / width;

describe("the overview strip", () => {
  it("maps the whole line with its margins across the strip, and back", () => {
    expect(stripX(world.start, world, width)).toBeCloseTo(0);
    expect(stripX(world.end, world, width)).toBeCloseTo(width);
    for (const year of [-4003, -587, 30, 1517, 2026]) {
      expect(stripYear(stripX(year, world, width), world, width)).toBeCloseTo(year, 6);
    }
    // Creation and today sit inside the ends, not on them.
    expect(stripX(-4003, world, width)).toBeGreaterThan(0);
    expect(stripX(2026, world, width)).toBeLessThan(width);
  });

  it("draws the view as a window, never too narrow to catch", () => {
    const wide = stripWindow({ start: -1000, end: 0 }, world, width);
    expect(wide.x1 - wide.x0).toBeCloseTo(1000 / perPx);
    const narrow = stripWindow({ start: 1517, end: 1521 }, world, width);
    expect(narrow.x1 - narrow.x0).toBe(8);
    expect((narrow.x0 + narrow.x1) / 2).toBeCloseTo(stripX(1519, world, width));
  });

  it("catches an edge, the window, or the strip outside it", () => {
    const win = { x0: 100, x1: 200 };
    expect(stripGrip(98, win)).toBe("start");
    expect(stripGrip(104, win)).toBe("start");
    expect(stripGrip(150, win)).toBe("move");
    expect(stripGrip(203, win)).toBe("end");
    expect(stripGrip(50, win)).toBe("outside");
    expect(stripGrip(260, win)).toBe("outside");
    // A narrow window has no edges to catch: every press moves it.
    const narrow = { x0: 100, x1: 108 };
    expect(stripGrip(100, narrow)).toBe("move");
    expect(stripGrip(108, narrow)).toBe("move");
  });

  it("pans by the years under the pixels dragged", () => {
    const from = { start: -1000, end: -500 };
    const r = stripDrag("move", from, 300, 320, world, width, full);
    expect(r.start).toBeCloseTo(-1000 + 20 * perPx);
    expect(r.end - r.start).toBeCloseTo(500);
  });

  it("zooms by an edge with the other held", () => {
    const from = { start: -1000, end: -500 };
    const later = stripDrag("start", from, 300, 310, world, width, full);
    expect(later.end).toBeCloseTo(-500);
    expect(later.start).toBeCloseTo(-1000 + 10 * perPx);
    const wider = stripDrag("end", from, 400, 420, world, width, full);
    expect(wider.start).toBeCloseTo(-1000);
    expect(wider.end).toBeCloseTo(-500 + 20 * perPx);
  });

  it("does not let an edge cross the other", () => {
    const from = { start: -1000, end: -500 };
    const r = stripDrag("start", from, 300, 900, world, width, full);
    expect(r.end).toBeCloseTo(-500);
    expect(r.end - r.start).toBeCloseTo(MIN_SPAN);
    const e = stripDrag("end", from, 400, 0, world, width, full);
    expect(e.start).toBeCloseTo(-1000);
    expect(e.end - e.start).toBeCloseTo(MIN_SPAN);
  });

  it("stops a drag at the line's limits", () => {
    const from = { start: -1000, end: -500 };
    const r = stripDrag("move", from, 300, -5000, world, width, full);
    expect((r.start + r.end) / 2).toBeCloseTo(full.start); // the line's start in the middle, no further
    const s = stripDrag("move", from, 300, 50_000, world, width, full);
    expect((s.start + s.end) / 2).toBeCloseTo(full.end);
  });

  /** The views an edge drag passes through as the pointer goes from the
   * edge's own place on the strip to each of `pxs` in turn. */
  const sweep = (grip: "start" | "end", from: TimelineViewRange, pxs: number[]) => {
    const fromPx = stripX(grip === "start" ? from.start : from.end, world, width);
    return pxs.map((px) => stripDrag(grip, from, fromPx, px, world, width, full));
  };
  /** Every view is one clampRange leaves alone: no drag hands the canvas a
   * view the next pan would snap away from. */
  const expectWhole = (views: TimelineViewRange[]) => {
    for (const v of views) expect(sameRange(clampRange(v, full), v)).toBe(true);
  };

  it("widens by the start edge near Creation with the end held, and stops at the limit", () => {
    // Home: the first event a tenth of the view in from the left.
    const from = { start: -4013, end: -3913 };
    const x0 = stripX(from.start, world, width);
    const views = sweep("start", from, [x0 - 2, x0 - 5, x0 - 10, x0 - 20, 20, 10, 0, -100, -500]);
    expectWhole(views);
    for (const v of views) expect(v.end).toBe(-3913);
    // The start only goes out, never back, as the pointer goes on past the
    // strip's end (pointer capture lets it).
    let last = from.start;
    for (const v of views) {
      expect(v.start).toBeLessThanOrEqual(last);
      last = v.start;
    }
    // It follows the pointer while it can...
    expect(views[0].start).toBeCloseTo(from.start - 2 * perPx, 6);
    // ...and stops where Creation's side has all the room the slack gives
    // it: half the view, so s = -4100 - (-3913 - s) / 2.
    expect(views[views.length - 1].start).toBeCloseTo(-4287, 6);
    expect(views[views.length - 2].start).toBeCloseTo(-4287, 6);
  });

  it("does not move a view already at Creation's limit by its outer edge", () => {
    const from = { start: -4200, end: -4000 };
    for (const v of sweep("start", from, [25.6, 20.6, 10.6, 0, -300])) {
      expect(v.end).toBe(-4000);
      expect(v.start).toBeCloseTo(-4200, 6);
    }
  });

  it("widens by the end edge near today with the start held, and stops at the limit", () => {
    const from = { start: 1900, end: 2100 };
    expect(clampRange(from, full)).toEqual(from);
    const x1 = stripX(from.end, world, width);
    const views = sweep("end", from, [x1 + 1, x1 + 3, 984, 1000, 1100, 3000]);
    expectWhole(views);
    let last = from.end;
    for (const v of views) {
      expect(v.start).toBe(1900);
      expect(v.end).toBeGreaterThanOrEqual(last);
      last = v.end;
    }
    expect(views[0].end).toBeCloseTo(2100 + perPx, 6);
    // The line ends at 2036; with the start at 1900, the end may run past it
    // by half the view: e = 2036 + (e - 1900) / 2.
    expect(views[views.length - 1].end).toBeCloseTo(2172, 6);
  });

  it("widens by the start edge from the middle of the line with the end held, all the way out", () => {
    const from = { start: 0, end: 500 };
    const views = sweep("start", from, [-100, -200, -300]);
    expectWhole(views);
    for (const v of views) expect(v.end).toBe(500);
    // Wide, the slack is the margin and a little more (see slackYears):
    // s = -4100 - (edge + (widest - (500 - s)) / 2).
    const edge = (full.end - full.start) * 0.05;
    const widest = full.end - full.start + 2 * edge;
    const limit = (-4100 - edge - (widest - 500) / 2) / 1.5;
    for (const v of views) expect(v.start).toBeCloseTo(limit, 6);
  });

  it("narrows by an edge near an end only as far as keeps the other edge held", () => {
    // Narrowing a view that runs past today: a narrower view has less slack
    // past the end, so the start stops where the end is still allowed --
    // the end 2100 is 64 years past 2036, which a view of 128 years allows.
    const from = { start: 1900, end: 2100 };
    const x0 = stripX(from.start, world, width);
    const narrowed = stripDrag("start", from, x0, x0 + 400, world, width, full);
    expect(narrowed.end).toBe(2100);
    expect(narrowed.start).toBeCloseTo(1972, 6);
    expectWhole([narrowed]);
  });

  it("holds an edge from a view that was not whole to begin with, once it is made so", () => {
    const r = dragEdge("end", { start: 5000, end: 5100 }, 10, full);
    expectWhole([r]);
    expect(r.end - r.start).toBeGreaterThanOrEqual(100);
    expect(dragEdge("start", { start: -1000, end: -500 }, NaN, full)).toEqual({ start: -1000, end: -500 });
  });
});
