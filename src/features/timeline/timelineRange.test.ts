import { describe, expect, it } from "vitest";
import {
  MIN_SPAN,
  centreOn,
  clampRange,
  edgeYears,
  extentOf,
  fullRangeUntil,
  lineFor,
  panBy,
  rangeForKey,
  sameRange,
  slackYears,
  wheelIntent,
  widestRange,
  zoomAbout,
} from "./timelineRange";

// Pinned to a year, so the tests do not move with the calendar.
const full = fullRangeUntil(2026);
const span = (r: { start: number; end: number }) => r.end - r.start;
/** The same range, to the arithmetic's last few digits. */
const expectNear = (r: { start: number; end: number }, want: { start: number; end: number }) => {
  expect(r.start).toBeCloseTo(want.start, 6);
  expect(r.end).toBeCloseTo(want.end, 6);
};

describe("the line", () => {
  it("runs from before Creation to a little after the present", () => {
    expect(full.start).toBe(-4100);
    expect(full.end).toBeGreaterThan(2026);
    expect(full.end).toBeLessThanOrEqual(2026 + 25);
    expect(fullRangeUntil(2031).end - full.end).toBe(5);
  });

  it("stops a little after Acts when church history is off, and reaches today when it is on", () => {
    expect(lineFor(60, full)).toEqual({ start: -4100, end: 120 }); // the Bible's last event, Paul in Rome
    expect(lineFor(2026, full).end).toBe(full.end);
    expect(lineFor(2018, full).end).toBeGreaterThan(2018);
    expect(lineFor(5000, full)).toEqual(full); // never past the present
    expect(lineFor(null, full)).toEqual(full);
    expect(lineFor(NaN, full)).toEqual(full);
  });

  it("finds the first and last years among events and eras", () => {
    expect(extentOf([{ start_year: -4003, end_year: -4003 }, { start_year: 30, end_year: 2026 }, { start_year: 1517, end_year: 1517 }])).toEqual({
      start: -4003,
      end: 2026,
    });
    expect(extentOf([])).toBeNull();
  });
});

describe("clampRange", () => {
  const edge = edgeYears(full);

  it("zooms right out to the whole line with a margin past both ends", () => {
    const r = clampRange({ start: -1e9, end: 1e9 }, full);
    expect(r.start).toBeCloseTo(full.start - edge);
    expect(r.end).toBeCloseTo(full.end + edge);
    expectNear(r, widestRange(full));
    // A margin, not a gulf: a twentieth of the line.
    expect(edge).toBeCloseTo((full.end - full.start) / 20);
  });

  it("at full zoom-out, cannot slide the line along", () => {
    const widest = widestRange(full);
    expectNear(clampRange({ start: widest.start + 2000, end: widest.end + 2000 }, full), widest);
    expectNear(clampRange({ start: widest.start - 2000, end: widest.end - 2000 }, full), widest);
  });

  it("lets the first year of the line come to the middle of a zoomed-in view", () => {
    const r = clampRange({ start: -9000, end: -8900 }, full);
    expect(span(r)).toBe(100);
    expect((r.start + r.end) / 2).toBeCloseTo(full.start);
  });

  it("lets the last year of the line come to the middle of a zoomed-in view", () => {
    const r = clampRange({ start: 5000, end: 5100 }, full);
    expect(span(r)).toBe(100);
    expect((r.start + r.end) / 2).toBeCloseTo(full.end);
  });

  it("pans freely near either end within that slack", () => {
    const nearStart = { start: -4150, end: -4050 };
    expect(clampRange(nearStart, full)).toEqual(nearStart);
    const nearEnd = { start: 1985, end: 2085 };
    expect(clampRange(nearEnd, full)).toEqual(nearEnd);
  });

  it("narrows the slack continuously as the view widens, down to the margin", () => {
    const widest = span(widestRange(full));
    expect(slackYears(100, full)).toBe(50);
    expect(slackYears(widest, full)).toBeCloseTo(edge);
    // No jumps anywhere between: a year wider never moves the slack by more
    // than half a year.
    let last = slackYears(1, full);
    let worst = 0;
    for (let s = 2; s <= widest; s += 1) {
      const slack = slackYears(s, full);
      worst = Math.max(worst, Math.abs(slack - last));
      last = slack;
    }
    expect(worst).toBeLessThanOrEqual(0.5 + 1e-9);
  });

  it("keeps a view inside the line as it was", () => {
    expect(clampRange({ start: -1000, end: -900 }, full)).toEqual({ start: -1000, end: -900 });
    expect(clampRange({ start: 300, end: 1600 }, full)).toEqual({ start: 300, end: 1600 });
  });

  it("zooms no closer than MIN_SPAN", () => {
    const r = clampRange({ start: 100, end: 100.5 }, full);
    expect(span(r)).toBe(MIN_SPAN);
    expect(r.start).toBe(100);
  });

  it("turns anything not a number into the whole line", () => {
    expectNear(clampRange({ start: NaN, end: 100 }, full), widestRange(full));
    expectNear(clampRange({ start: -Infinity, end: Infinity }, full), widestRange(full));
    const r = clampRange({ start: 500, end: NaN }, full);
    expect(Number.isFinite(r.start) && Number.isFinite(r.end)).toBe(true);
    expectNear(r, widestRange(full));
  });

  it("defaults to the line through today", () => {
    const r = clampRange({ start: 1e6, end: 1e6 + 50 });
    expect((r.start + r.end) / 2).toBeGreaterThanOrEqual(new Date().getFullYear());
  });
});

describe("moving the view", () => {
  it("pans and zooms within the limits", () => {
    expect(panBy({ start: 0, end: 100 }, 50, full)).toEqual({ start: 50, end: 150 });
    expect(panBy({ start: 0, end: 100 }, -1e6, full).start).toBeCloseTo(full.start - 50);
    const z = zoomAbout({ start: 0, end: 100 }, 25, 0.5, full);
    expect(z).toEqual({ start: 12.5, end: 62.5 }); // the year under the pointer stays put
    expect(centreOn({ start: 0, end: 100 }, 1517, full)).toEqual({ start: 1467, end: 1567 });
  });

  it("answers the scrollbar's keys and lets others through", () => {
    const r = { start: 0, end: 100 };
    const extent = { start: -4003, end: 2026 };
    expect(rangeForKey({ key: "ArrowRight" }, r, extent, full)).toEqual({ start: 15, end: 115 });
    expect(rangeForKey({ key: "ArrowLeft" }, r, extent, full)).toEqual({ start: -15, end: 85 });
    expect(rangeForKey({ key: "PageDown" }, r, extent, full)).toEqual({ start: 90, end: 190 });
    expect(rangeForKey({ key: "PageUp" }, r, extent, full)).toEqual({ start: -90, end: 10 });
    const home = rangeForKey({ key: "Home" }, r, extent, full)!;
    expect(home.start).toBeCloseTo(-4013);
    expect(span(home)).toBeCloseTo(100);
    const end = rangeForKey({ key: "End" }, r, extent, full)!;
    expect(end.end).toBeCloseTo(2036);
    expect(span(rangeForKey({ key: "+" }, r, extent, full)!)).toBeCloseTo(70);
    expect(span(rangeForKey({ key: "-" }, r, extent, full)!)).toBeCloseTo(100 / 0.7);
    expect(rangeForKey({ key: "a" }, r, extent, full)).toBeNull();
    expect(rangeForKey({ key: "Enter" }, r, extent, full)).toBeNull();
  });

  it("leaves the app its chords: Alt+Left is Back, Ctrl+= the text size", () => {
    const r = { start: 0, end: 100 };
    const extent = { start: -4003, end: 2026 };
    expect(rangeForKey({ key: "ArrowLeft", altKey: true }, r, extent, full)).toBeNull();
    expect(rangeForKey({ key: "ArrowRight", altKey: true }, r, extent, full)).toBeNull();
    expect(rangeForKey({ key: "=", ctrlKey: true }, r, extent, full)).toBeNull();
    expect(rangeForKey({ key: "-", ctrlKey: true }, r, extent, full)).toBeNull();
    expect(rangeForKey({ key: "_", ctrlKey: true }, r, extent, full)).toBeNull();
    expect(rangeForKey({ key: "+", metaKey: true }, r, extent, full)).toBeNull();
    expect(rangeForKey({ key: "Home", ctrlKey: true }, r, extent, full)).toBeNull();
    // Shift is how + and _ are typed, so it is let through.
    expect(span(rangeForKey({ key: "+" }, r, extent, full)!)).toBeCloseTo(70);
    expect(span(rangeForKey({ key: "_" }, r, extent, full)!)).toBeCloseTo(100 / 0.7);
  });

  it("knows a view it already has, to within float noise", () => {
    const r = { start: 0.1, end: 0.3 };
    expect(sameRange(r, { start: 0.1, end: 0.1 + (0.3 - 0.1) })).toBe(true);
    expect(sameRange({ start: -4003, end: -3903 }, { start: -4003, end: -3903 })).toBe(true);
    expect(sameRange({ start: -4003, end: -3903 }, { start: -4003, end: -3902.99 })).toBe(false);
    // What a pan or zoom at the limit asks for is the view it already has.
    const atEnd = clampRange({ start: 1e6, end: 1e6 + 100 }, full);
    expect(sameRange(panBy(atEnd, 50, full), atEnd)).toBe(true);
    const widest = widestRange(full);
    expect(sameRange(zoomAbout(widest, 0, 1.3, full), widest)).toBe(true);
  });
});

describe("the wheel", () => {
  const wheel = (deltaX: number, deltaY: number, more: { shiftKey?: boolean; ctrlKey?: boolean; deltaMode?: number } = {}) => ({
    deltaX,
    deltaY,
    deltaMode: more.deltaMode ?? 0,
    shiftKey: more.shiftKey ?? false,
    ctrlKey: more.ctrlKey ?? false,
  });

  it("zooms with a plain wheel, as it always has", () => {
    const intent = wheelIntent(wheel(0, 100), 800);
    expect(intent && "zoom" in intent && intent.zoom).toBeCloseTo(Math.exp(0.15));
    const back = wheelIntent(wheel(0, -100), 800);
    expect(back && "zoom" in back && back.zoom).toBeLessThan(1);
  });

  it("pans with Shift, whichever axis the browser reports it on", () => {
    expect(wheelIntent(wheel(0, 100, { shiftKey: true }), 800)).toEqual({ pan: 100 });
    expect(wheelIntent(wheel(100, 0, { shiftKey: true }), 800)).toEqual({ pan: 100 }); // Chromium's
    expect(wheelIntent(wheel(0, -100, { shiftKey: true }), 800)).toEqual({ pan: -100 });
  });

  it("pans with a trackpad's sideways swipe", () => {
    expect(wheelIntent(wheel(40, 5), 800)).toEqual({ pan: 40 });
  });

  it("keeps a pinch (Ctrl+wheel) a zoom even with Shift", () => {
    const intent = wheelIntent(wheel(0, 30, { shiftKey: true, ctrlKey: true }), 800);
    expect(intent && "zoom" in intent).toBe(true);
  });

  it("reads line and page deltas as pixels", () => {
    expect(wheelIntent(wheel(0, 3, { shiftKey: true, deltaMode: 1 }), 800)).toEqual({ pan: 48 });
    expect(wheelIntent(wheel(0, 1, { shiftKey: true, deltaMode: 2 }), 800)).toEqual({ pan: 800 });
  });

  it("always pans over the overview strip, and ignores a delta of nothing", () => {
    expect(wheelIntent(wheel(0, 100), 800, true)).toEqual({ pan: 100 });
    expect(wheelIntent(wheel(0, 0), 800)).toBeNull();
  });
});
