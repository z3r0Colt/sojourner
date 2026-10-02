import type { AtlasJourney } from "../../api/types";
import { distanceKm, type LonLat } from "./geo";

/**
 * Journeys along the roads.
 *
 * A New Testament traveller on land went by the Roman roads and the old
 * highways they were laid along, so a leg of such a journey is drawn along
 * them: the shortest way through the road network the Atlas already draws
 * (the AWMC's Roman roads and the great routes of the land). An Old Testament
 * journey, before there were Roman roads, has the great routes alone. A traveller can
 * also leave the road -- the network has gaps, and not every village was on
 * a highway -- at a cost: going across country counts for more than its
 * distance, so the road is taken wherever it really is the better way.
 * Where it is not -- Iconium to Lystra, which no surviving road joins, or a
 * voyage like Troas to Neapolis -- the leg is a straight line, and marked as
 * one.
 */

export interface RoadGraph {
  lon: Float64Array;
  lat: Float64Array;
  /** Each node's neighbours and the km to them. */
  edges: { to: number; km: number }[][];
  /** Nodes by 0.1-degree cell, for finding those near a point. */
  cells: Map<string, number[]>;
}

export interface LegRoute {
  /** The way drawn: the stop, the road, the next stop. */
  coords: [number, number][];
  /** Its length on the ground. */
  km: number;
  /** "road" when any of it follows a road; "direct" in a straight line. */
  by: "road" | "direct";
}

/** Road ends this close together are one junction: the AWMC's segments meet
 * near each other rather than on the same point. */
const JOIN_DEGREES = 0.004;
/** A loose road end this close to another road meets it, as does a station
 * of the old routes (they are drawn through towns the roads also reach). */
const LINK_KM = 5;
/** Going across country counts this much more than its distance. */
const OFF_ROAD = 1.6;
/** The furthest a traveller goes across country to reach a road. */
const OFF_ROAD_KM = 25;

const cellKey = (lon: number, lat: number) => `${Math.floor(lon * 10)}:${Math.floor(lat * 10)}`;

type Line = [number, number][];

function near(cells: Map<string, number[]>, p: LonLat, reach: number): number[] {
  const cx = Math.floor(p.lon * 10);
  const cy = Math.floor(p.lat * 10);
  const out: number[] = [];
  for (let dx = -reach; dx <= reach; dx++) for (let dy = -reach; dy <= reach; dy++) out.push(...(cells.get(`${cx + dx}:${cy + dy}`) ?? []));
  return out;
}

/** Which roads a journey can take: the Roman roads and the great routes, or
 * (before the Romans) the great routes alone. */
export type RoadNetwork = "roman" | "ancient";

const KINDS: Record<RoadNetwork, string[]> = { roman: ["roman", "ot"], ancient: ["ot"] };

export function buildRoadGraph(
  geojson: { features: { geometry: { type: string; coordinates: unknown } | null; properties: { kind?: string } }[] },
  network: RoadNetwork = "roman",
): RoadGraph {
  const kinds = KINDS[network];
  const lon: number[] = [];
  const lat: number[] = [];
  const edges: { to: number; km: number }[][] = [];
  const byKey = new Map<string, number>();
  const stations = new Set<number>();
  const node = (x: number, y: number) => {
    const key = `${Math.round(x / JOIN_DEGREES)}:${Math.round(y / JOIN_DEGREES)}`;
    let i = byKey.get(key);
    if (i === undefined) {
      i = lon.length;
      byKey.set(key, i);
      lon.push(x);
      lat.push(y);
      edges.push([]);
    }
    return i;
  };
  const link = (i: number, j: number, km = distanceKm({ lon: lon[i], lat: lat[i] }, { lon: lon[j], lat: lat[j] })) => {
    edges[i].push({ to: j, km });
    edges[j].push({ to: i, km });
  };
  const addLine = (line: Line, station: boolean) => {
    let prev = -1;
    for (const [x, y] of line) {
      const i = node(x, y);
      if (station) stations.add(i);
      if (prev >= 0 && prev !== i) link(prev, i);
      prev = i;
    }
  };
  for (const f of geojson.features) {
    const kind = f.properties.kind;
    if (!kind || !kinds.includes(kind) || !f.geometry) continue;
    if (f.geometry.type === "LineString") addLine(f.geometry.coordinates as Line, kind === "ot");
    else if (f.geometry.type === "MultiLineString") for (const l of f.geometry.coordinates as Line[]) addLine(l, kind === "ot");
  }
  const cells = new Map<string, number[]>();
  for (let i = 0; i < lon.length; i++) {
    const k = cellKey(lon[i], lat[i]);
    const list = cells.get(k);
    if (list) list.push(i);
    else cells.set(k, [i]);
  }

  // The AWMC's roads end near one another, or against the middle of another
  // road, without sharing a point: a road's loose end is joined to the
  // nearest road it is not already connected to. The old routes' stations
  // are joined to the nearest Roman road through the same town.
  const parent = Int32Array.from({ length: lon.length }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  for (let i = 0; i < lon.length; i++) for (const { to } of edges[i]) parent[find(i)] = find(to);
  for (let i = 0; i < lon.length; i++) {
    const station = stations.has(i);
    if (edges[i].length > 1 && !station) continue;
    const here = { lon: lon[i], lat: lat[i] };
    let best = -1;
    let bestKm = LINK_KM;
    for (const j of near(cells, here, 1)) {
      if (j === i) continue;
      // A loose end looks for another road; a station for a Roman one.
      if (station ? stations.has(j) : find(j) === find(i)) continue;
      const km = distanceKm(here, { lon: lon[j], lat: lat[j] });
      if (km < bestKm) {
        bestKm = km;
        best = j;
      }
    }
    if (best >= 0) {
      link(i, best, bestKm);
      parent[find(i)] = find(best);
    }
  }
  return { lon: Float64Array.from(lon), lat: Float64Array.from(lat), edges, cells };
}

/**
 * The way from a to b: A* through the network, from a, to b, with the
 * traveller free to go across country at the OFF_ROAD cost -- from a to a
 * road, from a road to b, or the whole way.
 */
export function routeLeg(g: RoadGraph, a: LonLat, b: LonLat): LegRoute {
  const straight = distanceKm(a, b);
  const direct: LegRoute = { coords: [[a.lon, a.lat], [b.lon, b.lat]], km: straight, by: "direct" };
  // Neighbouring places are walked between, not routed.
  if (straight < 3) return direct;

  const n = g.lon.length;
  const START = n;
  const GOAL = n + 1;
  const reach = Math.ceil(OFF_ROAD_KM / 11) + 1;
  const pos = (i: number): LonLat => (i === START ? a : i === GOAL ? b : { lon: g.lon[i], lat: g.lat[i] });
  const toGoal = (i: number) => distanceKm(pos(i), b);
  const fromStart = near(g.cells, a, reach)
    .map((i) => ({ to: i, km: distanceKm(a, pos(i)) }))
    .filter((e) => e.km <= OFF_ROAD_KM);
  const nearGoal = new Set(near(g.cells, b, reach).filter((i) => toGoal(i) <= OFF_ROAD_KM));

  // Cost so far, and the km on the ground, kept apart: the cost steers, the km is reported.
  const cost = new Map<number, number>([[START, 0]]);
  const ground = new Map<number, number>([[START, 0]]);
  const prev = new Map<number, number>();
  const heap: [number, number][] = [[toGoal(START), START]];
  const push = (item: [number, number]) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  const relax = (from: number, to: number, km: number, offRoad: boolean) => {
    const c = cost.get(from)! + km * (offRoad ? OFF_ROAD : 1);
    if (c < (cost.get(to) ?? Infinity)) {
      cost.set(to, c);
      ground.set(to, ground.get(from)! + km);
      prev.set(to, from);
      push([c + toGoal(to), to]);
    }
  };
  // Going straight there is always open; nothing dearer than it is worth a look.
  const ceiling = straight * OFF_ROAD;
  while (heap.length) {
    const [estimate, i] = pop();
    if (i === GOAL) break;
    if (estimate > ceiling + 1e-9) break;
    if (estimate - toGoal(i) > cost.get(i)! + 1e-9) continue;
    if (i === START) {
      relax(START, GOAL, straight, true);
      for (const e of fromStart) relax(START, e.to, e.km, true);
      continue;
    }
    for (const e of g.edges[i]) relax(i, e.to, e.km, false);
    if (nearGoal.has(i)) relax(i, GOAL, toGoal(i), true);
  }
  if (!prev.has(GOAL) || prev.get(GOAL) === START) return direct;
  const path = [GOAL];
  while (path[path.length - 1] !== START) path.push(prev.get(path[path.length - 1])!);
  path.reverse();
  return {
    coords: path.map((i): [number, number] => [pos(i).lon, pos(i).lat]),
    km: ground.get(GOAL)!,
    by: "road",
  };
}

/** A journey's legs, from each located stop to the next: along the roads when
 * a road network is given, otherwise straight. */
export function journeyRoutes(journey: AtlasJourney, g: RoadGraph | null): LegRoute[] {
  const stops = journey.legs.filter((l) => l.lon != null && l.lat != null).map((l) => ({ lon: l.lon as number, lat: l.lat as number }));
  return stops.slice(1).map((b, i) => {
    const a = stops[i];
    return g ? routeLeg(g, a, b) : { coords: [[a.lon, a.lat], [b.lon, b.lat]], km: distanceKm(a, b), by: "direct" };
  });
}

/** The eras whose travellers went by the Roman roads. */
export const ROMAN_ERAS = new Set(["The life of Christ", "The apostolic church"]);

const graphs = new Map<RoadNetwork, Promise<RoadGraph>>();

/** A road network, read once from the Atlas's roads file. */
export function loadRoadGraph(url: string, network: RoadNetwork): Promise<RoadGraph> {
  let graph = graphs.get(network);
  if (!graph) {
    graph = fetch(url)
      .then((r) => r.json())
      .then((json) => buildRoadGraph(json, network))
      .catch((e) => {
        graphs.delete(network);
        throw e;
      });
    graphs.set(network, graph);
  }
  return graph;
}
