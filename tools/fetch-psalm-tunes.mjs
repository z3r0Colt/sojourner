// Fetches psalm tunes into `reference/psalter/tunes.json`, the way
// `fetch:voices` fills `models/`: a build-time step on the developer's
// machine, so the shipped app carries the tunes inside it and never reaches
// the network to sing.
//
// The source is the Open Hymnal Project, which publishes its scores in ABC
// notation, in the public domain, transcribed from printed hymnals rather
// than from MIDI. Two things make it the right source here: every score
// carries its metre (`%OHMETRICAL 8 6 8 6`), which is what decides whether a
// tune can carry a given psalm at all; and the melody is a separate voice
// (`V: S1V1`), so the soprano line can be lifted out on its own.
//
// Only the melody is kept. A psalm tune's note count equals its metre's
// syllable count exactly -- one note per syllable, which is what lets the
// words sit under the notes -- and that identity is used as the check: a
// tune whose melody does not come out to its own metre is dropped rather
// than shipped, and reported at the end.
//
// Run: npm run fetch:tunes

import { mkdir, readFile, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { saveTunes, slug, summarise } from "./psalter-tunes.mjs";

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, ".cache", "openhymnal");
const TARBALL = join(CACHE, "openhymnal.tar.gz");
const OUT = join(ROOT, "reference", "psalter", "tunes.json");
const SOURCE = "https://codeload.github.com/mzealey/openhymnal/tar.gz/refs/heads/master";

// The metres the 1650 psalter is actually set in, named as a psalter names
// them. A tune is only useful here if it fits one of these exactly.
const METRES = {
  "8 6 8 6": "C.M.",
  "6 6 8 6": "S.M.",
  "8 8 8 8": "L.M.",
  "8 7 8 7": "8.7.8.7.",
  "6 6 6 6 8 8": "6.6.6.6.8.8.",
  "6 6 6 6 6 6 6 6": "6.6.6.6.D.",
  // Doubled metres sing a psalm two stanzas at a time, which is how a
  // psalter offers them.
  "8 6 8 6 8 6 8 6": "C.M.D.",
  "6 6 8 6 6 6 8 6": "S.M.D.",
  "8 8 8 8 8 8": "L.M.6",
};

// ------------------------------------------------------------ abc parsing --

const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// ABC writes middle C as "C" and the octave above as "c"; a trailing comma
// drops an octave and an apostrophe raises one.
function pitchToMidi(letter, octaveMarks, accidental, keyAccidentals) {
  const upper = letter.toUpperCase();
  let midi = 60 + STEP[upper] + (letter === upper ? 0 : 12);
  for (const mark of octaveMarks) midi += mark === "'" ? 12 : -12;
  if (accidental) {
    midi += accidental === "^" ? 1 : accidental === "_" ? -1 : 0;
  } else {
    midi += keyAccidentals[upper] ?? 0;
  }
  return midi;
}

// Key signature as a map of letter -> semitone offset. Enough for the major
// and minor keys these hymnals use.
const SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"];
const FLAT_ORDER = ["B", "E", "A", "D", "G", "C", "F"];
const FIFTHS = {
  "C#": 7, "F#": 6, B: 5, E: 4, A: 3, D: 2, G: 1, C: 0,
  F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7,
};

function keySignature(key) {
  const match = key.trim().match(/^([A-G][#b]?)\s*(m|min|dor|mix)?/i);
  if (!match) return {};
  let fifths = FIFTHS[match[1].replace(/b$/, "b")] ?? 0;
  if (/^m/i.test(match[2] ?? "")) fifths -= 3; // relative major
  const out = {};
  if (fifths > 0) for (let i = 0; i < fifths; i++) out[SHARP_ORDER[i]] = 1;
  if (fifths < 0) for (let i = 0; i < -fifths; i++) out[FLAT_ORDER[i]] = -1;
  return out;
}

// Pulls the melody voice out of an ABC score, grouped by syllable.
//
// A psalm tune is very nearly one note per syllable, but not quite: where the
// tune carries a syllable over two notes the score slurs them, "(c/2 d/2)",
// and the lyric line marks the passed-over note with "*". A tie does the same
// for one pitch held across a bar. Both are returned as a single group, so a
// group is one syllable however many notes it takes -- which is what the
// words-under-notes alignment needs.
function parseMelody(abc, voice, unitLength, keyAccidentals) {
  const groups = [];
  let accidentals = { ...keyAccidentals };
  let slurred = false;
  let slurOpened = false;
  let tied = false;

  for (const raw of abc.split(/\r?\n/)) {
    const line = raw.match(new RegExp(`^\\[V:\\s*${voice}\\s*\\]\\s*(.*)$`));
    if (!line) continue;

    // Strip everything that is not a note or a slur: trailing comments,
    // inline fields ([Q:...]), decorations (!fine!), chord symbols ("Am")
    // and grace notes ({ab}).
    const body = line[1]
      .replace(/%.*$/, "")
      .replace(/\[[A-Za-z]:[^\]]*\]/g, "")
      .replace(/![^!]*!/g, "")
      .replace(/"[^"]*"/g, "")
      .replace(/\{[^}]*\}/g, "");

    const token =
      /(\^{1,2}|_{1,2}|=)?([A-Ga-g])([,']*)(\d+)?(\/\d*)?(-)?|(\()|(\))|(\|\]?|\]\||:\|)|z\d*\/?\d*|[\[\]]/g;
    let m;
    while ((m = token.exec(body))) {
      if (m[7]) { slurred = true; slurOpened = true; continue; }
      if (m[8]) { slurred = false; continue; }
      if (m[9]) { accidentals = { ...keyAccidentals }; continue; } // bar resets
      if (!m[2]) continue; // rests, chord brackets
      const [, accidental, letter, octaves = "", numerator, fraction, tie] = m;

      // An explicit accidental holds for the rest of the bar.
      if (accidental) accidentals[letter.toUpperCase()] = accidental === "^" ? 1 : accidental === "_" ? -1 : 0;

      let length = numerator ? Number(numerator) : 1;
      if (fraction) length /= fraction.length > 1 ? Number(fraction.slice(1)) : 2;
      // Duration in quarter notes, whatever the score's unit length is.
      const note = { midi: pitchToMidi(letter, octaves, accidental, accidentals), beats: (length * unitLength) / 0.25 };

      // A slur's first note still begins its own syllable -- it is the notes
      // after it, and any note carried in by a tie, that belong to the
      // syllable already sounding.
      if (groups.length && ((slurred && !slurOpened) || tied)) groups[groups.length - 1].push(note);
      else groups.push([note]);
      slurOpened = false;
      tied = Boolean(tie);
    }
  }
  return groups;
}

// Header fields carry trailing comments -- "L: 1/4 % default length" -- so
// the value stops at the percent sign.
function field(abc, name) {
  const value = abc.match(new RegExp(`^${name}:\\s*(.+)$`, "m"))?.[1];
  return value ? value.replace(/%.*$/, "").trim() : null;
}

// A score marks its tempo against whatever note it counts in -- "Q:1/2=60"
// is sixty minims a minute, which is 120 crotchets. Everything downstream
// counts crotchets, so convert rather than take the number as it stands.
function tempoOf(abc) {
  const mark = abc.match(/\[?Q:\s*(\d+)\/(\d+)\s*=\s*(\d+)/);
  if (!mark) return 92;
  const [, num, den, rate] = mark.map(Number);
  const perMinute = rate * (num / den) * 4;
  // Guard against a score whose marking would be unsingable.
  return perMinute >= 40 && perMinute <= 200 ? Math.round(perMinute) : 92;
}

function comment(abc, name) {
  return abc.match(new RegExp(`^%${name}\\s+(.+)$`, "m"))?.[1]?.trim() ?? null;
}

// --------------------------------------------------------------- fetching --

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

async function download() {
  await mkdir(CACHE, { recursive: true });
  if (await exists(TARBALL)) {
    console.log("using cached openhymnal.tar.gz");
    return;
  }
  console.log(`downloading ${SOURCE}`);
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(TARBALL));
}

async function extract() {
  const dir = join(CACHE, "src");
  await mkdir(dir, { recursive: true });
  // Extract whenever the directory is empty, not merely absent -- a run that
  // failed part way through leaves the directory behind.
  if (!(await readdir(dir)).length) {
    // Relative paths, run from the cache directory: GNU tar reads a leading
    // "C:\" as a remote host and refuses.
    await run("tar", ["xzf", "openhymnal.tar.gz", "-C", "src"], { cwd: CACHE });
  }
  const files = [];
  async function walk(at) {
    for (const entry of await readdir(at, { withFileTypes: true })) {
      const path = join(at, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.name.endsWith(".abc")) files.push(path);
    }
  }
  await walk(dir);
  return files;
}

// ------------------------------------------------------------------ build --

// The tune's name. The filename carries it after the hymn title
// ("Our_God_Our_Help_In_Ages_Past-St_Anne.abc") but flattened: underscores
// for spaces and no punctuation, so "Darwall's 148th" arrives as
// "Darwalls_148th". The score's own credit line spells it properly --
// "Music: 'Darwall`s 148th' John Darwall, 1770." -- so that is preferred, and
// the filename is the fallback for scores that do not name their tune.
function tuneName(file, abc) {
  // The credit quotes the name, and writes an apostrophe inside it as a
  // backtick -- "'Darwall`s 148th'", "'Tallis` Canon'" -- so the closing mark
  // has to be the same character the name opened with.
  const credited = abc.match(/^C:.*\bMusic:\s*(['"])(.+?)\1/m)?.[2];
  if (credited) return credited.replace(/[`´’]/g, "'").replace(/\s+/g, " ").trim();

  const stem = basename(file, ".abc");
  const parts = stem.split("-").slice(1);
  if (!parts.length) return null;
  return parts[0].replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

const files = await (async () => { await download(); return extract(); })();

const tunes = new Map();
const rejected = [];

// These scores predate UTF-8 and name their composers in Latin-1 ("Gläser").
const utf8 = new TextDecoder("utf-8", { fatal: true });
const latin1 = new TextDecoder("latin1");

function decode(bytes) {
  try {
    return utf8.decode(bytes);
  } catch {
    return latin1.decode(bytes);
  }
}

for (const file of files) {
  const abc = decode(await readFile(file));
  const metrical = comment(abc, "OHMETRICAL");
  const metre = metrical && METRES[metrical.trim()];
  if (!metre) continue;

  const name = tuneName(file, abc);
  if (!name || tunes.has(slug(name))) continue;

  const unit = field(abc, "L") ?? "1/4";
  const [num, den] = unit.split("/").map(Number);
  const key = field(abc, "K") ?? "C";
  // The melody is the top voice, which most scores call S1V1; a score set in
  // unison names it plainly S1.
  const signature = keySignature(key);
  let notes = parseMelody(abc, "S1V1", num / den, signature);
  if (!notes.length) notes = parseMelody(abc, "S1", num / den, signature);

  const pattern = metrical.trim().split(/\s+/).map(Number);
  const wanted = pattern.reduce((a, b) => a + b, 0);
  if (notes.length !== wanted) {
    rejected.push(`${name} (${metre}): ${notes.length} notes for ${wanted} syllables`);
    continue;
  }

  // One array of notes per line of the metre, so a line of the psalm and a
  // line of the tune can be shown together.
  const lines = [];
  let at = 0;
  for (const count of pattern) {
    lines.push(notes.slice(at, at + count));
    at += count;
  }

  tunes.set(slug(name), {
    id: slug(name),
    name,
    metre,
    pattern,
    composer: comment(abc, "OHCOMPOSER"),
    key,
    tempo: tempoOf(abc),
    lines,
  });
}

// Written as the whole of this source, leaving any tune imported from your
// own files in place -- see import-psalm-tunes.mjs.
const all = await saveTunes("openhymnal", [...tunes.values()]);

console.log(`\nwrote ${OUT}`);
console.log(`  ${tunes.size} from the Open Hymnal; ${all.length} in all: ${summarise(all)}`);
if (rejected.length) {
  console.log(`\n  ${rejected.length} dropped -- melody did not come out to the metre:`);
  console.log(rejected.map((r) => `    ${r}`).join("\n"));
}
