import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bearingWord, daysText, distanceKm, formatDistance, pathKm } from "./geo";
import { displayName, groupOf, inTestament, kindsText, minZoom } from "./places";
import { DEFAULT_LAYERS, completeLayers } from "./style";

const JERUSALEM = { lon: 35.2304, lat: 31.7767 };
const DAMASCUS = { lon: 36.3064, lat: 33.5111 };

describe("distances", () => {
  it("measures Jerusalem to Damascus as the crow flies", () => {
    const km = distanceKm(JERUSALEM, DAMASCUS);
    expect(km).toBeGreaterThan(215);
    expect(km).toBeLessThan(222);
    expect(formatDistance(km, "mi")).toBe("135 miles");
    expect(formatDistance(km, "km")).toBe("218 km");
    expect(bearingWord(JERUSALEM, DAMASCUS)).toBe("northeast");
    expect(daysText(km, 32)).toBe("about 7 days");
  });

  it("adds up a path and says short trips plainly", () => {
    expect(pathKm([JERUSALEM])).toBe(0);
    expect(pathKm([JERUSALEM, DAMASCUS, JERUSALEM])).toBeCloseTo(2 * distanceKm(JERUSALEM, DAMASCUS));
    expect(daysText(10, 32)).toBe("a few hours");
    expect(daysText(20, 32)).toBe("about half a day");
    expect(daysText(35, 32)).toBe("about a day");
    expect(formatDistance(1, "km")).toBe("1 km");
    expect(formatDistance(3.24, "km")).toBe("3.2 km");
  });
});

describe("places", () => {
  const place = (kinds: string[], extra = {}) => ({ name: "Aphek", qualifier: null, kinds, verse_count: 1, ot_verses: 1, nt_verses: 0, ...extra });

  it("names a place with its qualifier", () => {
    expect(displayName(place([]))).toBe("Aphek");
    expect(displayName(place([], { qualifier: "in Sharon" }))).toBe("Aphek (in Sharon)");
  });

  it("groups by the first group any kind belongs to", () => {
    expect(groupOf(place(["settlement"]))).toBe("towns");
    expect(groupOf(place(["settlement", "campsite"]))).toBe("camps");
    expect(groupOf(place(["gate"]))).toBe("sites");
    expect(groupOf(place(["hill", "settlement"]))).toBe("towns");
    expect(groupOf(place(["spring"]))).toBe("waters");
    expect(groupOf(place(["region"]))).toBe("lands");
    expect(groupOf(place(["special"]))).toBe("other");
    expect(kindsText(place(["settlement", "special"]))).toBe("town");
  });

  it("shows the most-read places first", () => {
    expect(minZoom({ verse_count: 800 })).toBe(0);
    expect(minZoom({ verse_count: 58 })).toBe(4);
    expect(minZoom({ verse_count: 1 })).toBe(9);
    expect(Number.isInteger(minZoom({ verse_count: 7 }))).toBe(true);
  });

  it("filters by Testament", () => {
    expect(inTestament({ ot_verses: 3, nt_verses: 0 }, "both")).toBe(true);
    expect(inTestament({ ot_verses: 3, nt_verses: 0 }, "nt")).toBe(false);
    expect(inTestament({ ot_verses: 0, nt_verses: 2 }, "nt")).toBe(true);
  });
});

describe("layer settings", () => {
  it("completes settings stored by an older version", () => {
    const s = completeLayers({ labels: false, groups: { towns: false } as never });
    expect(s.labels).toBe(false);
    expect(s.groups.towns).toBe(false);
    expect(s.groups.mountains).toBe(DEFAULT_LAYERS.groups.mountains);
    expect(completeLayers(null)).toEqual(DEFAULT_LAYERS);
  });
});

describe("names.json", () => {
  const dir = join(__dirname, "../../../reference/atlas");
  const names: Record<string, { name: string; qualifier?: string; same_as?: string }> = JSON.parse(readFileSync(join(dir, "names.json"), "utf8"));
  const places: { slug: string; name: string }[] = JSON.parse(readFileSync(join(dir, "places.json"), "utf8"));
  const slugs = new Set(places.map((p) => p.slug));

  it("names every numbered place, without its number", () => {
    for (const p of places.filter((p) => / \d+$/.test(p.name))) {
      expect(names[p.slug], p.slug).toBeDefined();
      expect(names[p.slug].name).not.toMatch(/\d$/);
    }
  });

  it("merges only into places that exist and are not themselves merged", () => {
    for (const [slug, n] of Object.entries(names)) {
      if (!n.same_as) continue;
      expect(slugs.has(n.same_as), slug).toBe(true);
      expect(names[n.same_as]?.same_as, slug).toBeUndefined();
    }
  });

  it("tells apart every pair of distinct sites that share a name", () => {
    const seen = new Map<string, string>();
    for (const [slug, n] of Object.entries(names)) {
      if (n.same_as) continue;
      const key = `${n.name}|${n.qualifier ?? ""}`;
      expect(seen.get(key), `${slug} and ${seen.get(key)}`).toBeUndefined();
      seen.set(key, slug);
    }
  });
});
