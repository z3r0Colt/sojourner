import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { distanceKm } from "./geo";
import { buildRoadGraph, routeLeg } from "./routes";

const roads = JSON.parse(readFileSync(join(__dirname, "../../../public/atlas/roads.geojson"), "utf8"));
const graph = buildRoadGraph(roads);

const at = {
  jerusalem: { lon: 35.23417, lat: 31.77667 },
  damascus: { lon: 36.30639, lat: 33.51111 },
  troas: { lon: 26.15861, lat: 39.75194 },
  neapolis: { lon: 24.415, lat: 40.935 },
  iconium: { lon: 32.49233, lat: 37.8722 },
  lystra: { lon: 32.3384, lat: 37.6017 },
  philippi: { lon: 24.28458, lat: 41.01207 },
  thessalonica: { lon: 22.94577, lat: 40.63777 },
  caesarea: { lon: 34.89167, lat: 32.5 },
  rome: { lon: 12.4852, lat: 41.8922 },
};

describe("journeys along the Roman roads", () => {
  it("goes by road where the roads serve", () => {
    for (const [a, b] of [
      ["jerusalem", "damascus"],
      ["iconium", "lystra"],
      ["philippi", "thessalonica"],
    ] as const) {
      const leg = routeLeg(graph, at[a], at[b]);
      expect(leg.by, `${a} to ${b}`).toBe("road");
      // Longer than the straight line, but not absurdly.
      const straight = distanceKm(at[a], at[b]);
      expect(leg.km).toBeGreaterThan(straight);
      expect(leg.km).toBeLessThan(straight * 1.7);
      expect(leg.coords.length).toBeGreaterThan(3);
    }
  });

  it("keeps a voyage a straight line", () => {
    expect(routeLeg(graph, at.troas, at.neapolis).by).toBe("direct");
    expect(routeLeg(graph, at.caesarea, at.rome).by).toBe("direct");
  });

  it("starts and ends on the stops themselves", () => {
    const leg = routeLeg(graph, at.jerusalem, at.damascus);
    expect(leg.coords[0]).toEqual([at.jerusalem.lon, at.jerusalem.lat]);
    expect(leg.coords[leg.coords.length - 1]).toEqual([at.damascus.lon, at.damascus.lat]);
  });
});
