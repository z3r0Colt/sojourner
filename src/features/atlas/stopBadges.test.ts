import { describe, expect, it } from "vitest";
import { badgeWidth, stopBadges, stopLabel } from "./stopBadges";

describe("a badge's numbers", () => {
  it("lists stops in order, a run of three or more as a range", () => {
    expect(stopLabel([14, 1])).toBe("1, 14");
    expect(stopLabel([3, 4, 5])).toBe("3–5");
    expect(stopLabel([7, 1, 2, 3, 9, 10])).toBe("1–3, 7, 9, 10");
    expect(stopLabel([5, 5])).toBe("5");
  });
});

describe("the badges on the map", () => {
  it("draws stops with room between them one by one", () => {
    const b = stopBadges([
      { n: 1, x: 0, y: 0 },
      { n: 2, x: 100, y: 0 },
    ]);
    expect(b.map((x) => x.label)).toEqual(["1", "2"]);
  });

  it("draws a city the journey comes back to as one badge, at its first visit", () => {
    const b = stopBadges([
      { n: 1, x: 50, y: 50 },
      { n: 2, x: 300, y: 50 },
      { n: 14, x: 50, y: 50 },
    ]);
    expect(b).toHaveLength(2);
    expect(b[0]).toMatchObject({ label: "1, 14", x: 50, y: 50 });
  });

  it("joins towns too close to tell apart, and parts them when there is room", () => {
    const near = [
      { n: 3, x: 100, y: 100 },
      { n: 4, x: 108, y: 104 },
      { n: 5, x: 112, y: 98 },
    ];
    expect(stopBadges(near).map((x) => x.label)).toEqual(["3–5"]);
    const zoomedIn = near.map((s) => ({ ...s, x: (s.x - 100) * 20, y: (s.y - 100) * 20 }));
    expect(stopBadges(zoomedIn).map((x) => x.label)).toEqual(["3", "4", "5"]);
  });

  it("goes on joining as a badge widens to reach a neighbour", () => {
    // 1 and 2 touch; neither touches 3, but "1, 2", drawn at 1 and wider
    // than either, does.
    const b = stopBadges([
      { n: 1, x: 20, y: 0 },
      { n: 2, x: 0, y: 0 },
      { n: 3, x: 49, y: 0 },
    ]);
    expect(b.map((x) => x.label)).toEqual(["1–3"]);
  });

  it("leaves no two badges overlapping", () => {
    const stops = Array.from({ length: 30 }, (_, i) => ({ n: i + 1, x: (i * 37) % 200, y: (i * 53) % 120 }));
    const b = stopBadges(stops);
    expect(b.flatMap((x) => x.ns).sort((a, c) => a - c)).toEqual(stops.map((s) => s.n));
    for (let i = 0; i < b.length; i++)
      for (let j = i + 1; j < b.length; j++) {
        const apart = Math.abs(b[i].x - b[j].x) >= (badgeWidth(b[i].label) + badgeWidth(b[j].label)) / 2 || Math.abs(b[i].y - b[j].y) >= 20;
        expect(apart, `${b[i].label} / ${b[j].label}`).toBe(true);
      }
  });
});
