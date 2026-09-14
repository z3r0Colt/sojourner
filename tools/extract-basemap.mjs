// One-time extractor: a vector basemap of the biblical world for the atlas,
// from Natural Earth's public-domain 1:50m physical data.
//
//   node tools/extract-basemap.mjs [path/to/geojson/dir]
//
// Run this once; its output is committed to src/features/atlas/basemap.json
// and loaded by the atlas pane. The app never downloads anything -- this
// script does, at development time.
//
// The output is deliberately not GeoJSON. The atlas draws it and nothing
// else reads it, so it ships as bare coordinate rings: no per-feature
// properties, no nesting, no type tags to walk at render time.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BASE_URL = "https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/50m/physical";
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_FILE = path.join(REPO_ROOT, "src", "features", "atlas", "basemap.json");

// The places span lon -6.9..67.4, lat 11.6..44.9 -- Tarshish in the west to
// Susa in the east, Nubia in the south to the Black Sea in the north.
//
// The clip is drawn well outside that. A map framed exactly to its data
// shows a straight edge where the coastline stops, which is the one thing
// that gives away a map as a picture; the margin means the land runs off
// the view instead.
const BBOX = { west: -20, south: 0, east: 80, north: 58 };

const LAYERS = [
  { name: "land", file: "ne_50m_land.json", kind: "polygon", minArea: 0.004 },
  { name: "lakes", file: "ne_50m_lakes.json", kind: "polygon", minArea: 0.0006 },
  { name: "rivers", file: "ne_50m_rivers_lake_centerlines.json", kind: "line", minLength: 0.25 },
];

// ------------------------------------------------------------------ clipping

/**
 * Sutherland-Hodgman against the four edges of the view rectangle.
 *
 * Without this, a single Natural Earth land polygon reaching from Portugal to
 * Kamchatka would ship in full to draw the sliver of it the atlas shows.
 */
function clipRing(ring) {
  const edges = [
    { inside: (p) => p[0] >= BBOX.west, cut: (a, b) => interpolateX(a, b, BBOX.west) },
    { inside: (p) => p[0] <= BBOX.east, cut: (a, b) => interpolateX(a, b, BBOX.east) },
    { inside: (p) => p[1] >= BBOX.south, cut: (a, b) => interpolateY(a, b, BBOX.south) },
    { inside: (p) => p[1] <= BBOX.north, cut: (a, b) => interpolateY(a, b, BBOX.north) },
  ];
  let out = ring;
  for (const edge of edges) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const current = input[i];
      const previous = input[(i + input.length - 1) % input.length];
      const currentIn = edge.inside(current);
      const previousIn = edge.inside(previous);
      if (currentIn) {
        if (!previousIn) out.push(edge.cut(previous, current));
        out.push(current);
      } else if (previousIn) {
        out.push(edge.cut(previous, current));
      }
    }
    if (!out.length) return [];
  }
  return out;
}

const interpolateX = (a, b, x) => [x, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])];
const interpolateY = (a, b, y) => [a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]), y];

const inBox = (p) => p[0] >= BBOX.west && p[0] <= BBOX.east && p[1] >= BBOX.south && p[1] <= BBOX.north;

/**
 * Clips a line to the rectangle, splitting it wherever it leaves and returns
 * -- a river that wanders off the map comes back as two paths, not one with a
 * straight line joining the ends.
 */
function clipLine(line) {
  const pieces = [];
  let current = [];
  for (let i = 0; i < line.length; i++) {
    const point = line[i];
    if (inBox(point)) {
      if (!current.length && i > 0) current.push(crossing(point, line[i - 1]));
      current.push(point);
    } else if (current.length) {
      current.push(crossing(current[current.length - 1], point));
      pieces.push(current);
      current = [];
    }
  }
  if (current.length) pieces.push(current);
  return pieces.filter((p) => p.length >= 2);
}

/**
 * Where the segment between them meets the rectangle, by bisection.
 * `inner` must be the endpoint inside the box: the result converges from
 * that side, so it never lands outside.
 */
function crossing(inner, outer) {
  let lo = inner, hi = outer;
  for (let i = 0; i < 20; i++) {
    const mid = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2];
    if (inBox(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

// --------------------------------------------------------------- geometry

function* ringsOf(geometry) {
  if (!geometry) return;
  if (geometry.type === "Polygon") yield* geometry.coordinates;
  else if (geometry.type === "MultiPolygon") for (const poly of geometry.coordinates) yield* poly;
}

function* linesOf(geometry) {
  if (!geometry) return;
  if (geometry.type === "LineString") yield geometry.coordinates;
  else if (geometry.type === "MultiLineString") yield* geometry.coordinates;
}

/** Shoelace area, in square degrees -- only ever compared to a threshold. */
function area(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum / 2);
}

function length(line) {
  let total = 0;
  for (let i = 1; i < line.length; i++) {
    total += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
  }
  return total;
}

/** Rounds to ~110m and drops points that round onto their neighbour. */
function simplify(points) {
  const out = [];
  for (const [x, y] of points) {
    const point = [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000];
    const last = out[out.length - 1];
    if (!last || last[0] !== point[0] || last[1] !== point[1]) out.push(point);
  }
  return out;
}

// ------------------------------------------------------------------ driver

async function load(dir, file) {
  if (dir) {
    console.log(`reading ${path.join(dir, file)}`);
    return JSON.parse(await readFile(path.join(dir, file), "utf8"));
  }
  const url = `${BASE_URL}/${file}`;
  console.log(`downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText}`);
  return res.json();
}

async function main() {
  const dir = process.argv[2];
  const out = { bbox: [BBOX.west, BBOX.south, BBOX.east, BBOX.north] };

  for (const layer of LAYERS) {
    const collection = await load(dir, layer.file);
    const shapes = [];
    for (const feature of collection.features ?? []) {
      if (layer.kind === "polygon") {
        for (const ring of ringsOf(feature.geometry)) {
          const clipped = simplify(clipRing(ring));
          if (clipped.length >= 4 && area(clipped) >= layer.minArea) shapes.push(clipped);
        }
      } else {
        for (const line of linesOf(feature.geometry)) {
          for (const piece of clipLine(line)) {
            const simplified = simplify(piece);
            if (simplified.length >= 2 && length(simplified) >= layer.minLength) shapes.push(simplified);
          }
        }
      }
    }
    out[layer.name] = shapes;
    const points = shapes.reduce((n, s) => n + s.length, 0);
    console.log(`  ${layer.name}: ${shapes.length} shapes, ${points} points`);
  }

  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  // One shape per line: compact, but still diffable if the source updates.
  const body = Object.entries(out)
    .map(([key, value]) =>
      Array.isArray(value[0])
        ? `"${key}":[\n${value.map((s) => JSON.stringify(s)).join(",\n")}\n]`
        : `"${key}":${JSON.stringify(value)}`,
    )
    .join(",\n");
  const json = `{\n${body}\n}\n`;
  await writeFile(OUT_FILE, json, "utf8");

  console.log(`\nwrote ${path.relative(REPO_ROOT, OUT_FILE)} (${(Buffer.byteLength(json) / 1024).toFixed(0)}KB)`);
  console.log(`  extent: lon ${BBOX.west}..${BBOX.east}, lat ${BBOX.south}..${BBOX.north}`);
}

await main();
