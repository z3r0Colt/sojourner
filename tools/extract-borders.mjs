// One-time extractor: the borders of the regions named in Scripture, from
// OpenBible.info's per-place geometry.
//
//   node tools/extract-borders.mjs [path/to/data/dir]
//
// Run this once; its output is committed to src/features/atlas/borders.json
// and loaded by the atlas pane beside the basemap.
//
// Nobody knows exactly where Bashan ended and Gilead began, and a Bible
// atlas that draws a crisp line says something the evidence does not. The
// source doesn't draw one either: each region comes as a set of nested
// "isobands" running from a 10% confidence outline down to a 90% one -- the
// outer saying "possibly this far", the inner "certainly this much". The
// widest and the middle band are kept, so the map can draw a border as the
// soft thing it actually is.
//
// Data © OpenBible.info, CC BY 4.0 -- see Settings -> About.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const RAW = "https://raw.githubusercontent.com/openbibleinfo/Bible-Geocoding-Data/master";
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_FILE = path.join(REPO_ROOT, "src", "features", "atlas", "borders.json");

/** Matches the atlas's own extent; a region wholly outside it can't be drawn. */
const BBOX = { west: -20, south: 0, east: 80, north: 58 };
const CONCURRENCY = 6;

const round = (n) => Math.round(n * 1000) / 1000;

/**
 * Douglas-Peucker, at about two kilometres.
 *
 * The source contours are drawn at a resolution no reader will ever zoom to
 * -- 263 regions come to a quarter of a million points, four megabytes, for
 * a line that is explicitly approximate. Thinning them to the precision the
 * data actually claims costs nothing visible and saves most of that.
 */
const TOLERANCE = 0.02;

function simplifyRing(points, tolerance = TOLERANCE) {
  if (points.length <= 4) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;

  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let worst = 0;
    let index = -1;
    const [ax, ay] = points[first];
    const [bx, by] = points[last];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    for (let i = first + 1; i < last; i++) {
      const [px, py] = points[i];
      // Perpendicular distance to the segment, squared.
      let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = ax + t * dx - px;
      const ey = ay + t * dy - py;
      const d = ex * ex + ey * ey;
      if (d > worst) { worst = d; index = i; }
    }
    if (index !== -1 && worst > tolerance * tolerance) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Thins the ring, rounds to ~110m, and drops points that land on their neighbour. */
function simplify(ring) {
  const out = [];
  for (const [x, y] of simplifyRing(ring)) {
    const p = [round(x), round(y)];
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  // A closing point repeating the first is implied by the renderer.
  if (out.length > 1 && out[0][0] === out[out.length - 1][0] && out[0][1] === out[out.length - 1][1]) out.pop();
  return out;
}

const ringArea = (ring) =>
  Math.abs(ring.reduce((s, p, i) => {
    const q = ring[(i + 1) % ring.length];
    return s + p[0] * q[1] - q[0] * p[1];
  }, 0) / 2);

/** The largest ring of a polygon -- islands and slivers are not the border. */
function mainRing(polygon) {
  return polygon.slice().sort((a, b) => ringArea(b) - ringArea(a))[0] ?? [];
}

function inExtent(ring) {
  return ring.some(([x, y]) => x >= BBOX.west && x <= BBOX.east && y >= BBOX.south && y <= BBOX.north);
}

/**
 * A region's widest and best-guess outlines.
 *
 * Isobands arrive as one MultiPolygon whose polygons are the nested
 * confidence steps, largest first. A plain polygon (some regions have a
 * definite outline rather than a surface) has no spread, so it stands as
 * both.
 */
function bandsOf(geojson) {
  const features = geojson.features ?? [geojson];
  const surface = features.find((f) => f.properties?.role === "isobands" || f.properties?.format === "isobands");
  if (surface) {
    const polys = surface.geometry?.coordinates ?? [];
    if (polys.length === 0) return null;
    const rings = polys.map(mainRing).filter((r) => r.length >= 3);
    if (!rings.length) return null;
    // The widest outline (what the region could not have exceeded) and the
    // middle one (the best single line to call its border).
    const pick = [rings[0], rings[Math.floor((rings.length - 1) / 2)]];
    return { bands: pick.map(simplify) };
  }

  const solid = features.find((f) => f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon");
  if (!solid) return null;
  const polys = solid.geometry.type === "Polygon" ? [solid.geometry.coordinates] : solid.geometry.coordinates;
  const ring = mainRing(polys.map(mainRing).filter((r) => r.length >= 3).map((r) => [r]).flat());
  if (!ring || ring.length < 3) return null;
  const simplified = simplify(ring);
  return { bands: [simplified, simplified] };
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

/** Runs `worker` over `items`, a few at a time. */
async function pooled(items, limit, worker) {
  let next = 0;
  const runners = Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const i = next++;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}

async function main() {
  const dir = process.argv[2];
  const ancientText = dir
    ? await readFile(path.join(dir, "ancient.jsonl"), "utf8")
    : await (await fetch(`${RAW}/data/ancient.jsonl`)).text();
  const ancient = ancientText.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));

  // Only places scholarship gives an extent to: a town is a point, and a
  // point has no border.
  const wanted = ancient.filter(
    (a) =>
      a.geojson_file &&
      a.url_slug &&
      (a.identifications ?? []).some((i) => (i.resolutions ?? []).some((r) => r.ancient_geometry === "polygon")),
  );
  console.log(`${wanted.length} places have an extent rather than a point`);

  if (dir) await mkdir(path.join(dir, "geometry"), { recursive: true });
  const out = {};
  let done = 0, failed = 0, skipped = 0;
  await pooled(wanted, CONCURRENCY, async (place) => {
    try {
      // A local checkout may hold only the .jsonl files; the per-place
      // geometry lives in its own folder, so fall back to the network.
      const local = dir ? path.join(dir, "geometry", place.geojson_file) : null;
      let geo = local ? await readFile(local, "utf8").then(JSON.parse, () => null) : null;
      if (!geo) {
        geo = await fetchJson(`${RAW}/geometry/${place.geojson_file}`);
        // Cache it beside the other source files, so re-running to retune the
        // simplification doesn't fetch 263 files again.
        if (local) await writeFile(local, JSON.stringify(geo)).catch(() => {});
      }
      const bands = bandsOf(geo);
      if (!bands || !inExtent(bands.bands[0])) {
        skipped++;
        return;
      }
      out[place.url_slug] = { name: place.friendly_id, outer: bands.bands[0], core: bands.bands[1] };
    } catch (e) {
      failed++;
      if (failed <= 5) console.warn(`  ${place.friendly_id}: ${e.message}`);
    } finally {
      done++;
      if (done % 40 === 0) process.stdout.write(`  ${done}/${wanted.length}\r`);
    }
  });

  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  const body = Object.entries(out)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([slug, r]) => `${JSON.stringify(slug)}:${JSON.stringify(r)}`)
    .join(",\n");
  const json = `{\n${body}\n}\n`;
  await writeFile(OUT_FILE, json, "utf8");

  const points = Object.values(out).reduce((n, r) => n + r.outer.length + r.core.length, 0);
  console.log(`\nwrote ${Object.keys(out).length} borders to ${path.relative(REPO_ROOT, OUT_FILE)}`);
  console.log(`  ${points} points, ${(Buffer.byteLength(json) / 1024).toFixed(0)}KB`);
  if (skipped) console.log(`  ${skipped} skipped (no usable outline, or outside the map)`);
  if (failed) console.log(`  ${failed} failed to fetch`);
}

await main();
