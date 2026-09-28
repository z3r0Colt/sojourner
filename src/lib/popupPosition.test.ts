import { describe, expect, it, vi } from "vitest";
import { createScrollAwayWatch, isScrollingKey, lineBoxAt, placePopup, pressIsOnScrollbar, samePlacement, type PopupRequest } from "./popupPosition";

/** A 1000 x 800 window, an 8 px margin and gap, and a 300 x 200 popup opened
 * from the middle -- each case changes only what it is about. */
function place(overrides: Partial<PopupRequest>) {
  return placePopup({
    x: 500,
    y: 400,
    width: 300,
    height: 200,
    viewportWidth: 1000,
    viewportHeight: 800,
    align: "top-left",
    gap: 8,
    margin: 8,
    ...overrides,
  });
}

describe("a popup opened from a click point", () => {
  it("hangs below the point when it fits there", () => {
    expect(place({})).toEqual({ left: 500, top: 400, maxHeight: null, placement: "below" });
  });

  it("fits exactly down to the bottom margin without flipping", () => {
    // 800 - 8 - 592 = 200: just room for it.
    expect(place({ y: 592 })).toMatchObject({ top: 592, maxHeight: null, placement: "below" });
  });

  it("flips above the point when there is no room below", () => {
    // Opened on a word near the foot of the window: its bottom edge sits the
    // gap above the point instead of running off the screen.
    expect(place({ y: 700 })).toEqual({ left: 500, top: 700 - 8 - 200, maxHeight: null, placement: "above" });
  });

  it("flips above the anchor's top, clearing the word, when told where that is", () => {
    // The point is 4 px under a word whose top is 24 px higher.
    expect(place({ y: 700, flipY: 676 })).toMatchObject({ top: 676 - 8 - 200, placement: "above" });
  });

  it("takes the roomier side and scrolls when it fits on neither", () => {
    // 500 tall, opened at 400: 392 of room below, 384 above.
    expect(place({ height: 500 })).toEqual({ left: 500, top: 400, maxHeight: 392, placement: "below" });
    // Opened lower down, the room above is the larger: it runs from the top
    // margin to the gap above the point.
    expect(place({ height: 500, y: 450 })).toEqual({ left: 500, top: 8, maxHeight: 450 - 8 - 8, placement: "above" });
  });

  it("stays on its usual side when both sides have the same room", () => {
    // 400 - 8 - 8 = 384 above; 800 - 8 - 408 = 384 below.
    expect(place({ height: 500, y: 408, flipY: 400 })).toMatchObject({ placement: "below", maxHeight: 384 });
  });

  it("is held inside the side margins", () => {
    expect(place({ x: -40 }).left).toBe(8);
    expect(place({ x: 3 }).left).toBe(8);
    expect(place({ x: 900 }).left).toBe(1000 - 300 - 8);
  });
});

describe("a bar along the foot of the window", () => {
  // The read-aloud player: 56 px along the bottom, so the popup's room ends
  // at 744, and its margin is kept above that.
  const bar = { bottomInset: 56 };

  it("is kept clear of: a card that would reach into it flips above its word instead", () => {
    // 800 - 8 - 560 = 232 of window below would fit it; 744 - 8 - 560 = 176
    // above the bar does not.
    expect(place({ y: 560 })).toMatchObject({ top: 560, placement: "below" });
    expect(place({ y: 560, flipY: 540, ...bar })).toMatchObject({ top: 540 - 8 - 200, maxHeight: null, placement: "above" });
  });

  it("caps a card that fits on neither side at the bar's top, not the window's foot", () => {
    // A tall card opened on a word in the upper part of the pane: held to
    // 744 - 8 - 300 = 436 below it, where the window alone would give 492.
    expect(place({ height: 900, y: 300, flipY: 280 })).toMatchObject({ maxHeight: 492, placement: "below" });
    expect(place({ height: 900, y: 300, flipY: 280, ...bar })).toEqual({ left: 500, top: 300, maxHeight: 436, placement: "below" });
  });

  it("fits exactly down to the margin above the bar", () => {
    expect(place({ y: 536, ...bar })).toMatchObject({ top: 536, maxHeight: null, placement: "below" });
  });

  it("keeps a toolbar that drops below a selection out of the bar too", () => {
    // No room over a selection that starts at the top of the window. Under
    // its last line (at 620) the window has 800 - 8 - 628 = 164 px, room for
    // a 120 px toolbar; above the bar it has 744 - 8 - 628 = 108, not room.
    // So it drops under the selection's first line instead, as it does for a
    // selection that runs to the foot of the window.
    const toolbar = { align: "above-center" as const, height: 120, y: 20, flipY: 620 };
    expect(place(toolbar)).toMatchObject({ top: 628, placement: "below", maxHeight: null });
    expect(place({ ...toolbar, ...bar })).toMatchObject({ top: 28, placement: "below", maxHeight: null });
  });

  it("is ignored for a popup opened from inside the bar itself", () => {
    // A menu opened from the bar's own buttons at 770 goes up from there, as
    // it would with no bar, rather than having nowhere to be.
    expect(place({ y: 770, height: 100, ...bar })).toMatchObject({ top: 770 - 8 - 100, placement: "above" });
    expect(place({ y: 770, height: 100, ...bar })).toEqual(place({ y: 770, height: 100 }));
  });
});

describe("a toolbar over a selection", () => {
  const toolbar = { align: "above-center" as const, width: 400, height: 40 };

  it("sits centered above the point", () => {
    expect(place({ ...toolbar, y: 300 })).toEqual({ left: 500 - 200, top: 300 - 8 - 40, maxHeight: null, placement: "above" });
  });

  it("drops below the point when there is no room above", () => {
    expect(place({ ...toolbar, y: 30 })).toEqual({ left: 300, top: 30 + 8, maxHeight: null, placement: "below" });
  });

  it("drops below the selection's bottom, not onto the selection, when told where that is", () => {
    expect(place({ ...toolbar, y: 30, flipY: 70 })).toMatchObject({ top: 70 + 8, placement: "below" });
  });

  it("drops under the selection's first line, whole, when the selection runs past the foot of the window", () => {
    // No room above line one, none below a last line off the screen: over the
    // selection at full height, rather than cut down to a sliver of buttons.
    expect(place({ ...toolbar, y: 30, flipY: 1400 })).toEqual({ left: 300, top: 30 + 8, maxHeight: null, placement: "below" });
    // Nor when the last line ends just short of the margin.
    expect(place({ ...toolbar, y: 30, flipY: 770 })).toEqual({ left: 300, top: 30 + 8, maxHeight: null, placement: "below" });
    // A selection that leaves room under it is still cleared.
    expect(place({ ...toolbar, y: 30, flipY: 700 })).toMatchObject({ top: 700 + 8, maxHeight: null, placement: "below" });
  });

  it("is held inside the side margins at both edges", () => {
    expect(place({ ...toolbar, x: 100, y: 300 }).left).toBe(8);
    expect(place({ ...toolbar, x: 950, y: 300 }).left).toBe(1000 - 400 - 8);
  });

  it("takes the roomier side and scrolls when it fits on neither", () => {
    expect(place({ ...toolbar, height: 600, y: 500 })).toEqual({ left: 300, top: 8, maxHeight: 500 - 8 - 8, placement: "above" });
    expect(place({ ...toolbar, height: 600, y: 200 })).toEqual({ left: 300, top: 208, maxHeight: 800 - 8 - 208, placement: "below" });
  });
});

describe("a window smaller than the popup", () => {
  it("lines the popup up with the left margin and holds it to the room there is", () => {
    const placed = place({ x: 50, y: 60, width: 320, height: 400, viewportWidth: 200, viewportHeight: 120 });
    // 120 - 8 - 60 = 52 below, 60 - 8 - 8 = 44 above.
    expect(placed).toEqual({ left: 8, top: 60, maxHeight: 52, placement: "below" });
  });

  it("never asks for a negative height or a spot above the top margin", () => {
    for (const align of ["top-left", "above-center"] as const) {
      const placed = place({ align, x: 5, y: 5, viewportWidth: 10, viewportHeight: 10 });
      expect(placed.maxHeight).toBeGreaterThanOrEqual(0);
      expect(placed.top).toBeGreaterThanOrEqual(8);
      expect(placed.left).toBe(8);
    }
  });
});

describe("samePlacement", () => {
  const base = { left: 100, top: 200, maxHeight: null, placement: "below" as const };

  it("ignores fractions of a pixel", () => {
    expect(samePlacement(base, { ...base, left: 100.3, top: 199.8 })).toBe(true);
    expect(samePlacement({ ...base, maxHeight: 300 }, { ...base, maxHeight: 300.4 })).toBe(true);
  });

  it("notices a real move, a flip, or a cap coming or going", () => {
    expect(samePlacement(base, { ...base, top: 201 })).toBe(false);
    expect(samePlacement(base, { ...base, placement: "above" })).toBe(false);
    expect(samePlacement(base, { ...base, maxHeight: 300 })).toBe(false);
    expect(samePlacement({ ...base, maxHeight: 300 }, base)).toBe(false);
  });
});

describe("createScrollAwayWatch", () => {
  const pane = {};
  const at = (top: number, left = 0) => ({ top, left });
  const reader = true;
  const app = false;

  it("forgives anything during the grace period, measuring from where it settled", () => {
    const watch = createScrollAwayWatch(1000);
    watch.note(pane, () => at(0), 1010);
    expect(watch.scrolled(pane, at(40), 1050, reader)).toBe(false); // the double-click's nudge
    expect(watch.scrolled(pane, at(60), 1200, reader)).toBe(false); // ...still moving
    expect(watch.scrolled(pane, at(62), 1400, reader)).toBe(false); // settled, 2 px on
    expect(watch.scrolled(pane, at(70), 1450, reader)).toBe(true); // the reader scrolls
  });

  it("closes at the first jump when the starting point was noted as the reader reached to scroll", () => {
    // One notch of a wheel that does not scroll smoothly: a single scroll
    // event, already 100 px on.
    const watch = createScrollAwayWatch(0);
    watch.note(pane, () => at(500), 1000);
    expect(watch.scrolled(pane, at(600), 1010, reader)).toBe(true);
  });

  it("measures from the first scroll event it hears when nothing was noted", () => {
    const watch = createScrollAwayWatch(0);
    expect(watch.scrolled(pane, at(500), 1000, reader)).toBe(false);
    expect(watch.scrolled(pane, at(504), 1010, reader)).toBe(false);
    expect(watch.scrolled(pane, at(505), 1020, reader)).toBe(true);
  });

  it("forgives the app's own scrolling, carrying the starting point along with it", () => {
    // Read-aloud following the spoken word, a line at a time.
    const watch = createScrollAwayWatch(0);
    watch.note(pane, () => at(0), 1000);
    for (let line = 1; line <= 10; line++) expect(watch.scrolled(pane, at(line * 30), 1000 + line * 2000, app)).toBe(false);
    // The reader reaches for the wheel: measured from where read-aloud left
    // the text, not from where the popup first saw it.
    watch.note(pane, () => at(300), 30_000);
    expect(watch.scrolled(pane, at(303), 30_010, reader)).toBe(false);
    expect(watch.scrolled(pane, at(310), 30_020, reader)).toBe(true);
  });

  it("keeps the first starting point noted once the popup has settled, and reads the position only when it needs it", () => {
    const watch = createScrollAwayWatch(0);
    const where = vi.fn(() => at(0));
    watch.note(pane, where, 1000);
    watch.note(pane, () => at(999), 1005); // each wheel step reaches again
    expect(watch.scrolled(pane, at(8), 1010, reader)).toBe(true);
    const later = vi.fn(() => at(0));
    watch.note(pane, later, 1020);
    expect(where).toHaveBeenCalledTimes(1);
    expect(later).not.toHaveBeenCalled();
  });

  it("notes afresh during the grace period, while the page is still settling", () => {
    const watch = createScrollAwayWatch(1000);
    watch.note(pane, () => at(0), 1010);
    watch.note(pane, () => at(50), 1100);
    expect(watch.scrolled(pane, at(52), 1500, reader)).toBe(false);
  });

  it("counts sideways scrolling too", () => {
    const watch = createScrollAwayWatch(0);
    watch.note(pane, () => at(0, 0), 1000);
    expect(watch.scrolled(pane, at(0, -12), 1010, reader)).toBe(true);
  });

  it("keeps each scroller's starting point apart", () => {
    const watch = createScrollAwayWatch(0);
    const other = {};
    watch.note(pane, () => at(0), 1000);
    watch.note(other, () => at(300), 1000);
    expect(watch.scrolled(pane, at(3), 1020, reader)).toBe(false);
    expect(watch.scrolled(other, at(290), 1030, reader)).toBe(true);
  });
});

describe("isScrollingKey", () => {
  it("knows the keys that scroll the page and no others", () => {
    for (const key of ["PageDown", "PageUp", "Home", "End", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", " "]) expect(isScrollingKey(key)).toBe(true);
    for (const key of ["Enter", "Escape", "Tab", "a", "Shift"]) expect(isScrollingKey(key)).toBe(false);
  });
});

describe("pressIsOnScrollbar", () => {
  // A pane at (100, 50), 400 x 300, with a 1 px border and a 15 px
  // scrollbar down its right side: 383 px of content across, 298 down.
  const box = { left: 100, top: 50, right: 500, bottom: 350, clientLeft: 1, clientTop: 1, clientWidth: 383, clientHeight: 298 };

  it("is a press on the strip right of the content", () => {
    expect(pressIsOnScrollbar(490, 200, box)).toBe(true);
    expect(pressIsOnScrollbar(484, 60, box)).toBe(true);
  });

  it("is not a press on the content, or outside the pane", () => {
    expect(pressIsOnScrollbar(483, 200, box)).toBe(false);
    expect(pressIsOnScrollbar(300, 200, box)).toBe(false);
    expect(pressIsOnScrollbar(510, 200, box)).toBe(false);
    expect(pressIsOnScrollbar(490, 360, box)).toBe(false);
  });

  it("is a press on a scrollbar along the bottom", () => {
    const wide = { ...box, clientWidth: 398, clientHeight: 283 };
    expect(pressIsOnScrollbar(300, 340, wide)).toBe(true);
    expect(pressIsOnScrollbar(300, 330, wide)).toBe(false);
  });
});

describe("lineBoxAt", () => {
  // A highlight wrapped over three lines of a pane: the tail of one line, a
  // whole line, and the start of the next, 30 px apart.
  const line = (top: number, left: number, right: number) => ({ left, right, top, bottom: top + 24 });
  const lines = [line(64, 300, 560), line(94, 272, 560), line(124, 272, 410)];

  it("is the line the press landed on", () => {
    expect(lineBoxAt(lines, 132)).toBe(lines[2]);
    expect(lineBoxAt(lines, 70)).toBe(lines[0]);
  });

  it("is the nearest line for a press between two", () => {
    expect(lineBoxAt(lines, 90)).toBe(lines[0]);
    expect(lineBoxAt(lines, 92)).toBe(lines[1]);
  });

  it("passes over empty boxes, and is null with no lines at all", () => {
    expect(lineBoxAt([{ left: 300, right: 300, top: 130, bottom: 130 }, lines[1]], 130)).toBe(lines[1]);
    expect(lineBoxAt([], 100)).toBeNull();
  });
});
