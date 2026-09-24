// Builds reference/timeline/ from the Theographic Bible Metadata.
//
// Theographic (Robert Rouse, CC BY-SA 4.0) is a knowledge graph of the Bible:
// 450 events, each with a date, a duration, the verses that record it, the
// people in it and the places it happened, and a year for every verse. Its
// chronology is a traditional one -- Ussher's years for the early ages
// (Creation 4004 BC, the Flood 2348) -- but it is its own, not Ussher's
// throughout: the reigns of the kings and the life of Christ follow later
// reckonings (Zedekiah from 597 BC, the birth of Jesus in 4 BC, the cross in
// AD 30). The app says so, and calls the dates approximate.
//
// What this reads is reproduced; what the app adds is kept apart and named:
//
//   reference/timeline/eras.json       the eras, each bounded by two of
//                                      Theographic's own events, so no era
//                                      date is typed in by hand
//   reference/timeline/additions.json  events Theographic lacks (the fall of
//                                      Jerusalem, Ezra and Nehemiah), each
//                                      dated by Theographic's year for the
//                                      verse that records it
//   reference/timeline/overrides.json  events left out, with the reason, and
//                                      names mapped to Factbook entries by hand
//
// Writes reference/timeline/events.json and chapter_years.json. Years are
// astronomical (1 BC is 0, 588 BC is -587) and fractional where the source
// gives a month or day; the app prints them as BC and AD.
//
// Usage: node tools/extract-timeline.mjs [<folder with Theographic's json>]
// Without a folder it downloads the pinned commit below.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "reference", "timeline");
const COMMIT = "cfb1c485d4da6fb63a69cb3b7f5b0752792f46bc";
const RAW = `https://raw.githubusercontent.com/robertrouse/theographic-bible-metadata/${COMMIT}/json`;

// OSIS book codes in canonical order: the index + 1 is the app's book id.
const OSIS = [
  "Gen", "Exod", "Lev", "Num", "Deut", "Josh", "Judg", "Ruth", "1Sam", "2Sam", "1Kgs", "2Kgs", "1Chr", "2Chr", "Ezra", "Neh", "Esth", "Job",
  "Ps", "Prov", "Eccl", "Song", "Isa", "Jer", "Lam", "Ezek", "Dan", "Hos", "Joel", "Amos", "Obad", "Jonah", "Mic", "Nah", "Hab", "Zeph",
  "Hag", "Zech", "Mal", "Matt", "Mark", "Luke", "John", "Acts", "Rom", "1Cor", "2Cor", "Gal", "Eph", "Phil", "Col", "1Thess", "2Thess",
  "1Tim", "2Tim", "Titus", "Phlm", "Heb", "Jas", "1Pet", "2Pet", "1John", "2John", "3John", "Jude", "Rev",
];
const BOOK_ID = new Map(OSIS.map((c, i) => [c, i + 1]));

/** "2Kgs.25.8" -> [12, 25, 8]. */
function parseOsis(ref) {
  const [b, c, v] = ref.split(".");
  const book = BOOK_ID.get(b);
  if (!book) throw new Error(`unknown OSIS book in ${ref}`);
  return [book, Number(c), Number(v)];
}

const LANES = { "Southern Kingdom (Judah)": "judah", "Northern Kingdom (Israel)": "israel" };

/** ISO-8601-style year ("-4003", "0030", "0029-10-9") to an astronomical decimal year. */
function parseStart(s) {
  const m = /^(-?)(\d+)(?:-(\d+)(?:-(\d+))?)?$/.exec(String(s ?? "").trim());
  if (!m) return null;
  const year = Number(m[2]) * (m[1] ? -1 : 1);
  const month = m[3] ? Number(m[3]) : null;
  const day = m[4] ? Number(m[4]) : null;
  const precision = day ? "day" : month ? "month" : "year";
  return { at: year + (month ? (month - 1) / 12 : 0) + (day ? (day - 1) / 365.25 : 0), precision };
}

/** "3M10D", "120Y", "7D" to years. */
function parseDuration(s) {
  let years = 0;
  for (const [, n, unit] of String(s ?? "").matchAll(/(\d+)\s*([YMD])/gi)) {
    years += Number(n) / { Y: 1, M: 12, D: 365.25 }[unit.toUpperCase()];
  }
  return years;
}

/** Theographic gives verse years as historical years (-588 is 588 BC). */
const histToAstro = (y) => (y < 0 ? y + 1 : y);

async function load(dir, name) {
  if (dir) return JSON.parse(await readFile(join(dir, `${name}.json`), "utf8"));
  const res = await fetch(`${RAW}/${name}.json`);
  if (!res.ok) throw new Error(`${name}.json: HTTP ${res.status}`);
  return res.json();
}

const dir = process.argv[2];
const [events, people, places, verses] = await Promise.all(["events", "people", "places", "verses"].map((n) => load(dir, n)));
const eras = JSON.parse(await readFile(join(OUT, "eras.json"), "utf8"));
const additions = JSON.parse(await readFile(join(OUT, "additions.json"), "utf8"));
const overrides = JSON.parse(await readFile(join(OUT, "overrides.json"), "utf8"));

const verseRef = new Map(verses.map((v) => [v.id, v.fields.osisRef]));
const verseYear = new Map(verses.filter((v) => v.fields.yearNum != null).map((v) => [v.fields.osisRef, Number(v.fields.yearNum)]));
const personById = new Map(people.map((p) => [p.id, p.fields]));
const placeById = new Map(places.map((p) => [p.id, p.fields]));
const eventById = new Map(events.map((e) => [e.id, e.fields]));

/** A person as the importer resolves them: name, and verses they are named in. */
function person(p) {
  const refs = (p.verses ?? []).map((id) => verseRef.get(id)).filter(Boolean);
  return { key: p.personLookup, name: p.name, verses: refs.slice(0, 40).map(parseOsis) };
}

function place(p) {
  const lat = Number(p.latitude ?? p.openBibleLat);
  const lon = Number(p.longitude ?? p.openBibleLong);
  const refs = (p.verses ?? []).map((id) => verseRef.get(id)).filter(Boolean);
  return {
    key: p.placeLookup,
    name: p.kjvName ?? p.displayTitle,
    verses: refs.slice(0, 40).map(parseOsis),
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
  };
}

const excluded = overrides.exclude ?? {};
const out = [];
const skipped = [];
for (const e of events) {
  const f = e.fields;
  if (excluded[f.title]) {
    skipped.push(f.title);
    continue;
  }
  const start = parseStart(f.startDate);
  if (!start) {
    skipped.push(`${f.title} (no date)`);
    continue;
  }
  const parent = f.partOf?.[0] ? eventById.get(f.partOf[0]) : null;
  out.push({
    id: `theo:${f.eventID}`,
    title: f.title.trim(),
    start: round(start.at),
    end: round(start.at + parseDuration(f.duration)),
    precision: start.precision,
    parent: f.partOf?.[0] ? `theo:${eventById.get(f.partOf[0])?.eventID}` : null,
    lane: parent ? (LANES[parent.title] ?? null) : null,
    verses: (f.verses ?? []).map((id) => verseRef.get(id)).filter(Boolean).map(parseOsis),
    people: (f.participants ?? []).map((id) => personById.get(id)).filter(Boolean).map(person),
    places: (f.locations ?? []).map((id) => placeById.get(id)).filter(Boolean).map(place),
    note: f.notes?.trim() || null,
    source: "theographic",
  });
}

for (const a of additions.events) {
  const refs = a.verses;
  const years = refs.map((r) => verseYear.get(r)).filter((y) => y != null);
  if (years.length === 0) throw new Error(`addition "${a.title}": Theographic gives no year for ${refs.join(", ")}`);
  const at = histToAstro(years[0]);
  out.push({
    id: `add:${a.id}`,
    title: a.title,
    start: at,
    end: at + (a.years ?? 0),
    precision: "year",
    parent: null,
    lane: null,
    verses: refs.map(parseOsis),
    // Named people, resolved by the importer against these verses.
    people: (a.people ?? []).map((name) => ({ key: null, name, verses: refs.map(parseOsis) })),
    places: (a.places ?? []).map((name) => ({ key: null, name, verses: refs.map(parseOsis), lat: null, lon: null })),
    note: a.note ?? null,
    source: "added",
  });
}
out.sort((a, b) => a.start - b.start || a.title.localeCompare(b.title));

// Each era runs from the start of one of Theographic's events to the start of
// another (or the end of one), so its bounds are the source's too.
const byTitle = new Map(out.map((e) => [e.title, e]));
const resolvedEras = eras.eras.map((era) => {
  const from = byTitle.get(era.from);
  const to = byTitle.get(era.to);
  if (!from) throw new Error(`era "${era.name}": no event "${era.from}"`);
  if (!to) throw new Error(`era "${era.name}": no event "${era.to}"`);
  return { slug: era.slug, name: era.name, start: era.fromEnd ? from.end : from.start, end: era.toEnd ? to.end : to.start, journey_era: era.journey_era ?? null, from: era.from, to: era.to };
});

// The year of each chapter, first verse and last, for "where the open chapter falls".
const chapters = new Map();
for (const v of verses) {
  const y = v.fields.yearNum;
  if (y == null) continue;
  const [book, chapter] = parseOsis(v.fields.osisRef);
  const key = `${book}.${chapter}`;
  const at = histToAstro(Number(y));
  const cur = chapters.get(key);
  chapters.set(key, cur ? [Math.min(cur[0], at), Math.max(cur[1], at)] : [at, at]);
}
const chapterYears = [...chapters.entries()].map(([k, [start, end]]) => {
  const [book, chapter] = k.split(".").map(Number);
  return [book, chapter, start, end];
});

function round(x) {
  return Math.round(x * 1000) / 1000;
}

await writeFile(
  join(OUT, "events.json"),
  JSON.stringify({ source: `theographic-bible-metadata@${COMMIT}`, eras: resolvedEras, events: out }) + "\n",
);
await writeFile(join(OUT, "chapter_years.json"), JSON.stringify(chapterYears) + "\n");
console.log(`${out.length} events (${additions.events.length} added), ${resolvedEras.length} eras, ${chapterYears.length} chapters dated`);
if (skipped.length) console.log(`left out: ${skipped.join("; ")}`);
