import { beforeEach, describe, expect, it } from "vitest";
import { forgetTimelineViews, keepTimelineView, keptTimelineView } from "./timelineViewMemory";

const reformation = { start: 1510, end: 1654 };

describe("a timeline pane's place", () => {
  beforeEach(() => forgetTimelineViews());

  it("is given back to the same pane showing the same event, as when a pane opened beside it rebuilds it", () => {
    keepTimelineView("p1", { eventId: 100232, year: null }, reformation);
    expect(keptTimelineView("p1", { eventId: 100232, year: null })).toEqual(reformation);
  });

  it("is not given to another pane, nor to the same pane sent somewhere else", () => {
    keepTimelineView("p1", { eventId: 100232, year: null }, reformation);
    expect(keptTimelineView("p2", { eventId: 100232, year: null })).toBeNull();
    expect(keptTimelineView("p1", { eventId: 7, year: null })).toBeNull();
    expect(keptTimelineView("p1", { eventId: 100232, year: -1000 })).toBeNull();
  });

  it("follows the selection, and the opening view keeps nothing", () => {
    keepTimelineView("p1", { eventId: null, year: null }, reformation);
    keepTimelineView("p1", { eventId: 100171, year: null }, reformation);
    expect(keptTimelineView("p1", { eventId: null, year: null })).toBeNull();
    expect(keptTimelineView("p1", { eventId: 100171, year: null })).toEqual(reformation);
    keepTimelineView("p1", { eventId: 100171, year: null }, null);
    expect(keptTimelineView("p1", { eventId: 100171, year: null })).toBeNull();
  });

  it("lets the oldest panes go first", () => {
    for (let i = 0; i < 40; i++) keepTimelineView(`p${i}`, { eventId: null, year: null }, { start: i, end: i + 10 });
    expect(keptTimelineView("p0", { eventId: null, year: null })).toBeNull();
    expect(keptTimelineView("p39", { eventId: null, year: null })).toEqual({ start: 39, end: 49 });
  });
});
