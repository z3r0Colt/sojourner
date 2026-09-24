import { describe, expect, it } from "vitest";
import type { TimelineEvent } from "../../api/types";
import { durationLabel, packRows, spanLabel, ticks, yearLabel } from "./timelineLayout";

const event = (id: number, start: number, end: number): TimelineEvent => ({
  id,
  title: `e${id}`,
  start_year: start,
  end_year: end,
  precision: "year",
  parent_id: null,
  lane: null,
  note: null,
  source: "theographic",
  book_id: null,
  chapter: null,
  verse: null,
  entities: [],
});

describe("years", () => {
  it("reads astronomical years as BC and AD", () => {
    expect(yearLabel(-587)).toBe("588 BC");
    expect(yearLabel(-586.5)).toBe("588 BC"); // halfway through 588 BC
    expect(yearLabel(0)).toBe("1 BC");
    expect(yearLabel(1)).toBe("AD 1");
    expect(yearLabel(30.25)).toBe("AD 30");
  });

  it("spans", () => {
    expect(spanLabel(-1014, -974)).toBe("1015–975 BC");
    expect(spanLabel(-3, 30)).toBe("4 BC–AD 30");
    expect(spanLabel(-587, -587)).toBe("588 BC");
    expect(spanLabel(46, 49)).toBe("AD 46–49");
  });

  it("durations", () => {
    expect(durationLabel(0, 40)).toBe("40 years");
    expect(durationLabel(0, 8 / 365.25)).toBe("8 days");
    expect(durationLabel(0, 3 / 12 + 10 / 365.25)).toBe("3 months");
    expect(durationLabel(0, 0)).toBeNull();
  });

  it("ticks fall on round historical years either side of the era", () => {
    const t = ticks(-700, 100, 800);
    expect(t.map(([, l]) => l)).toContain("600 BC");
    expect(t.map(([, l]) => l)).toContain("AD 100");
    const at600 = t.find(([, l]) => l === "600 BC")![0];
    expect(at600).toBe(-599);
  });
});

describe("rows", () => {
  it("puts overlapping events on separate rows and reuses a free one", () => {
    const x = (y: number) => y;
    const { placed } = packRows([event(1, 0, 50), event(2, 10, 20), event(3, 100, 110)], x, () => 20, 5, 1000);
    const row = (id: number) => placed.find((p) => p.event.id === id)!.row;
    expect(row(1)).toBe(0);
    expect(row(2)).toBe(1);
    expect(row(3)).toBe(0);
  });

  it("places the more important first when room runs out", () => {
    const x = (y: number) => y;
    const { placed } = packRows([event(1, 0, 50), event(2, 1, 5), event(3, 2, 50)], x, () => 10, 1, 1000, (e) => (e.id === 3 ? 1 : 0));
    expect(placed.map((p) => p.event.id)).toEqual([3]);
  });

  it("leaves out what does not fit and says how many", () => {
    const x = (y: number) => y;
    const { placed, hidden } = packRows([event(1, 0, 50), event(2, 1, 50), event(3, 2, 50)], x, () => 10, 2, 1000);
    expect(placed).toHaveLength(2);
    expect(hidden).toBe(1);
  });
});
