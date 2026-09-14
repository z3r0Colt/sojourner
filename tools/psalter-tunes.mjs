// Shared ground between the two tune tools.
//
// `fetch-psalm-tunes.mjs` pulls public-domain scores off the net at build
// time; `import-psalm-tunes.mjs` takes tune files you already hold. Both end
// up writing the same `reference/psalter/tunes.json`, so the metre table, the
// record shape and the merge live here rather than in either of them.

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const TUNES = join(ROOT, "reference", "psalter", "tunes.json");

// The metres the 1650 psalter is actually set in, keyed by the syllable count
// per line. A tune is only useful here if it fits one of these exactly: the
// psalm and the tune have to agree line for line.
export const METRES = [
  { name: "C.M.", pattern: [8, 6, 8, 6] },
  { name: "S.M.", pattern: [6, 6, 8, 6] },
  { name: "L.M.", pattern: [8, 8, 8, 8] },
  { name: "8.7.8.7.", pattern: [8, 7, 8, 7] },
  { name: "6.6.6.6.8.8.", pattern: [6, 6, 6, 6, 8, 8] },
  { name: "6.6.6.6.D.", pattern: [6, 6, 6, 6, 6, 6, 6, 6] },
  { name: "10.10.10.10.10.", pattern: [10, 10, 10, 10, 10] },
  // Doubled metres sing a psalm two stanzas at a time, which is how a psalter
  // offers them.
  { name: "C.M.D.", pattern: [8, 6, 8, 6, 8, 6, 8, 6] },
  { name: "S.M.D.", pattern: [6, 6, 8, 6, 6, 6, 8, 6] },
  { name: "L.M.6", pattern: [8, 8, 8, 8, 8, 8] },
];

const BY_NAME = new Map(METRES.map((m) => [m.name.replace(/\./g, "").toUpperCase(), m]));

/** Resolves however a metre was written -- "C.M.", "CM", "8 6 8 6", "8.6.8.6" */
export function findMetre(text) {
  if (!text) return null;
  const trimmed = String(text).trim();
  const byName = BY_NAME.get(trimmed.replace(/[.\s]/g, "").toUpperCase());
  if (byName) return byName;
  const numbers = trimmed.split(/[^0-9]+/).filter(Boolean).map(Number);
  if (!numbers.length) return null;
  return METRES.find((m) => m.pattern.length === numbers.length && m.pattern.every((n, i) => n === numbers[i])) ?? null;
}

/** The metres whose syllables add up to a given number of notes. More than
 *  one can match -- 48 notes is both L.M.6 and 6.6.6.6.D. */
export function metresForNoteCount(count) {
  return METRES.filter((m) => m.pattern.reduce((a, b) => a + b, 0) === count);
}

export function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Splits a melody into one array of notes per line of the metre. */
export function intoLines(notes, pattern) {
  const lines = [];
  let at = 0;
  for (const count of pattern) {
    lines.push(notes.slice(at, at + count));
    at += count;
  }
  return lines;
}

export async function loadTunes() {
  try {
    return JSON.parse(await readFile(TUNES, "utf8"));
  } catch {
    return [];
  }
}

/** Writes the given tunes as the whole of one source, leaving every tune that
 *  came from elsewhere untouched -- so re-running either tool never discards
 *  the other's work. A tune you supplied yourself wins a name collision.
 */
export async function saveTunes(source, tunes) {
  const existing = await loadTunes();
  // Anything this tool wrote before is replaced outright. An entry with no
  // source at all predates the two-tool split and is equally replaceable --
  // whichever tool made it can make it again.
  const byId = new Map();
  for (const tune of existing) {
    if (tune.source && tune.source !== source) byId.set(tune.id, tune);
  }
  // A tune you supplied yourself outranks a fetched one of the same name.
  for (const tune of tunes) {
    if (byId.get(tune.id)?.source === "local" && source !== "local") continue;
    byId.set(tune.id, { ...tune, source });
  }

  const all = [...byId.values()].sort(
    (a, b) => a.metre.localeCompare(b.metre) || a.name.localeCompare(b.name),
  );
  await writeFile(TUNES, JSON.stringify(all, null, 1));
  return all;
}

export function summarise(all) {
  const byMetre = {};
  for (const t of all) byMetre[t.metre] = (byMetre[t.metre] ?? 0) + 1;
  return Object.entries(byMetre)
    .map(([metre, n]) => `${metre} ${n}`)
    .join(", ");
}
