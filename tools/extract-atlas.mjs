// One-time extractor: OpenBible.info's Bible Geocoding data into
// reference/atlas/places.json -- every place named in Scripture, where
// scholarship places it, and how sure it is.
//
//   node tools/extract-atlas.mjs [path/to/data/dir]
//
// Run this once; its output is committed. The app never downloads anything --
// this script does, at development time, and only the finished JSON ships.
//
// The data is CC BY 4.0, so the app must credit OpenBible.info: that credit
// lives in Settings -> About, under "Sources and licences". Do not remove it.
//
// The upstream records are far richer than an atlas pane needs -- satellite
// imagery, OSM geometry, per-translation spelling counts, linked-data ids for
// Wikidata and Pleiades. This keeps the name, the coordinates, how confident
// the identification is, and the verses, and drops the rest.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BASE_URL = "https://raw.githubusercontent.com/openbibleinfo/Bible-Geocoding-Data/master/data";
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(REPO_ROOT, "reference", "atlas");

/**
 * How firmly a place is tied to a modern location, from OpenBible's 0-1000
 * association score. Most biblical sites are not certain, and saying so is
 * the point -- a reader should be able to tell Jerusalem from a proposal.
 */
function confidenceFor(score) {
  if (score >= 1000) return "certain";
  if (score >= 700) return "probable";
  if (score >= 400) return "possible";
  return "proposed";
}

/** The 37 upstream types, grouped into what a map actually draws differently. */
const CATEGORY_OF = new Map(
  Object.entries({
    settlement: ["settlement", "district in settlement", "fortification", "structure", "gate", "hall", "room", "altar", "mine"],
    region: ["region", "people group", "island", "natural area", "field", "garden", "forest", "district"],
    water: ["river", "body of water", "spring", "well", "pool", "wadi", "canal", "ford", "sea"],
    mountain: ["mountain", "hill", "mountain range", "mountain ridge", "mountain pass", "cliff", "rock", "promontory", "valley", "stone heap"],
  }).flatMap(([category, types]) => types.map((t) => [t, category])),
);

function categoryFor(types) {
  for (const t of types) {
    const c = CATEGORY_OF.get(t);
    if (c) return c;
  }
  return "other";
}

/**
 * The best-attested modern location for an ancient place.
 *
 * 777 of the 1,342 places have more than one candidate; the highest-scoring
 * one is what gets plotted, and the count of the rest is kept so the detail
 * panel can say the identification is contested rather than implying it is
 * settled.
 */
function bestAssociation(place) {
  const associations = Object.values(place.modern_associations ?? {});
  if (!associations.length) return { name: null, score: 0, alternatives: 0 };
  const sorted = associations.slice().sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return {
    name: sorted[0].name ?? null,
    score: sorted[0].score ?? 0,
    alternatives: sorted.length - 1,
  };
}

/** The first resolved coordinate pair, walking identifications in order. */
function coordinatesFor(place) {
  for (const identification of place.identifications ?? []) {
    for (const resolution of identification.resolutions ?? []) {
      if (!resolution.lonlat) continue;
      const [lon, lat] = resolution.lonlat.split(",").map(Number);
      if (Number.isFinite(lon) && Number.isFinite(lat)) {
        return {
          lon: Math.round(lon * 1e5) / 1e5,
          lat: Math.round(lat * 1e5) / 1e5,
          // "point" is a located site; "center" means the place is only known
          // to lie within some radius of one.
          approximate: resolution.lonlat_type !== "point",
        };
      }
    }
  }
  return null;
}

async function load(dir, name) {
  if (dir) {
    console.log(`reading ${path.join(dir, name)}`);
    return readFile(path.join(dir, name), "utf8");
  }
  const url = `${BASE_URL}/${name}`;
  console.log(`downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText}`);
  return res.text();
}

const parseJsonl = (text) => text.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));

async function main() {
  const dir = process.argv[2];
  const ancient = parseJsonl(await load(dir, "ancient.jsonl"));
  console.log(`  ${ancient.length} ancient places`);

  const places = [];
  const counts = { located: 0, unlocated: 0, verses: 0, contested: 0 };
  const byConfidence = new Map();
  const slugs = new Set();

  for (const raw of ancient) {
    if (!raw.url_slug || !raw.friendly_id) continue;
    if (slugs.has(raw.url_slug)) throw new Error(`duplicate place slug: ${raw.url_slug}`);
    slugs.add(raw.url_slug);

    const where = coordinatesFor(raw);
    const modern = bestAssociation(raw);
    const confidence = where ? confidenceFor(modern.score) : "unidentified";

    // One row per verse, deduplicated: a place named twice in a verse is
    // still one reference for an atlas's purposes.
    const seen = new Set();
    const verses = [];
    for (const v of (raw.verses ?? []).slice().sort((a, b) => Number(a.sort) - Number(b.sort))) {
      if (!v.osis || seen.has(v.osis)) continue;
      seen.add(v.osis);
      verses.push({ osis: v.osis, readable: v.readable });
    }

    const types = raw.types ?? [];
    places.push({
      id: raw.id,
      slug: raw.url_slug,
      name: raw.friendly_id,
      article: raw.preceding_article || null,
      kinds: types,
      category: categoryFor(types),
      lon: where?.lon ?? null,
      lat: where?.lat ?? null,
      approximate: where?.approximate ?? false,
      confidence,
      modern_name: modern.name,
      modern_alternatives: modern.alternatives,
      verses,
    });

    if (where) counts.located++;
    else counts.unlocated++;
    counts.verses += verses.length;
    if (modern.alternatives > 0) counts.contested++;
    byConfidence.set(confidence, (byConfidence.get(confidence) ?? 0) + 1);
  }

  places.sort((a, b) => a.name.localeCompare(b.name, "en"));

  await mkdir(OUT_DIR, { recursive: true });
  const json = JSON.stringify(places, null, 1);
  await writeFile(path.join(OUT_DIR, "places.json"), json, "utf8");
  await writeFile(
    path.join(OUT_DIR, "_index.json"),
    JSON.stringify(
      {
        source: "OpenBible.info Bible Geocoding",
        license: "CC BY 4.0",
        license_url: "https://creativecommons.org/licenses/by/4.0/",
        attribution: "Bible Geocoding data © OpenBible.info, used under CC BY 4.0.",
        origin: "https://github.com/openbibleinfo/Bible-Geocoding-Data",
        total_places: places.length,
        located: counts.located,
        total_verse_references: counts.verses,
        by_confidence: Object.fromEntries([...byConfidence].sort((a, b) => b[1] - a[1])),
      },
      null,
      1,
    ),
    "utf8",
  );

  console.log(`\nwrote ${places.length} places to ${path.relative(REPO_ROOT, OUT_DIR)} (${(Buffer.byteLength(json) / 1048576).toFixed(1)}MB)`);
  console.log(`  ${counts.located} located, ${counts.unlocated} without coordinates`);
  console.log(`  ${counts.verses} verse references`);
  console.log(`  ${counts.contested} places with more than one proposed modern site`);
  console.log(`  confidence: ${[...byConfidence].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ")}`);
}

await main();
