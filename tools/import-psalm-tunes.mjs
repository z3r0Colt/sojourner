// Turns tune files you already hold into psalter tunes.
//
// The public-domain corpus `fetch:tunes` draws on is a general hymn library:
// it has Old 100th and St Anne, but not the Scottish psalm tunes -- Dundee,
// French, Martyrs, Crimond, Coleshill and the rest -- which are what a 1650
// psalter is actually sung to. Those tunes are all long out of copyright, but
// no machine-readable collection of them is freely published, so this tool
// takes them from wherever you have them: a MIDI file, or an ABC score.
//
// Drop files into `reference/psalter/tunes-src/` and run:
//
//   npm run import:tunes
//
// The filename gives the tune its name, and may name the metre after a dot:
//
//   Dundee.CM.mid          -> "Dundee", Common Metre
//   French.8.6.8.6.mid     -> "French", the same metre written out
//   Martyrs.mid            -> "Martyrs", metre worked out from the note count
//
// A hymn MIDI is normally four parts at once. The melody is taken as the top
// line -- the highest note sounding at each fresh attack -- which is what the
// congregation sings and all this app needs.
//
// Nothing is checked against the network and nothing is trusted blindly: a
// tune whose melody does not come out to its metre's syllable count is
// reported and left out, because a tune that does not fit cannot carry the
// words.

import { readdir, readFile, mkdir } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import {
  ROOT,
  findMetre,
  intoLines,
  metresForNoteCount,
  saveTunes,
  slug,
  summarise,
} from "./psalter-tunes.mjs";

const SRC = join(ROOT, "reference", "psalter", "tunes-src");

// ----------------------------------------------------------------- midi in --

function reader(bytes) {
  let at = 0;
  return {
    get at() { return at; },
    set at(value) { at = value; },
    get done() { return at >= bytes.length; },
    u8: () => bytes[at++],
    u16: () => ((bytes[at++] << 8) | bytes[at++]) >>> 0,
    u32: () => (((bytes[at++] << 24) | (bytes[at++] << 16) | (bytes[at++] << 8) | bytes[at++]) >>> 0),
    text: (n) => { const s = String.fromCharCode(...bytes.slice(at, at + n)); at += n; return s; },
    skip: (n) => { at += n; },
    // MIDI's variable-length quantity: seven bits a byte, high bit continues.
    varint: () => {
      let value = 0;
      for (;;) {
        const byte = bytes[at++];
        value = (value << 7) | (byte & 0x7f);
        if (!(byte & 0x80)) return value;
      }
    },
  };
}

/** Every note in the file, as {midi, start, end} in ticks, across all tracks. */
function readMidi(bytes) {
  const r = reader(bytes);
  if (r.text(4) !== "MThd") throw new Error("not a MIDI file");
  r.u32();
  r.u16(); // format
  const trackCount = r.u16();
  const division = r.u16();
  if (division & 0x8000) throw new Error("SMPTE timing is not supported");

  const notes = [];
  for (let track = 0; track < trackCount && !r.done; track++) {
    if (r.text(4) !== "MTrk") break;
    const end = r.at + r.u32();
    let time = 0;
    let status = 0;
    const sounding = new Map(); // midi note -> start tick

    while (r.at < end) {
      time += r.varint();
      let byte = r.u8();
      if (byte & 0x80) status = byte;
      else r.at -= 1; // running status: the last command still applies

      const command = status & 0xf0;
      if (status === 0xff) {
        r.u8(); // meta type
        r.skip(r.varint());
      } else if (status === 0xf0 || status === 0xf7) {
        r.skip(r.varint());
      } else if (command === 0x90 || command === 0x80) {
        const midi = r.u8();
        const velocity = r.u8();
        if (command === 0x90 && velocity > 0) {
          sounding.set(midi, time);
        } else {
          const start = sounding.get(midi);
          if (start != null) {
            notes.push({ midi, start, end: time });
            sounding.delete(midi);
          }
        }
      } else if (command === 0xc0 || command === 0xd0) {
        r.u8();
      } else {
        r.u8();
        r.u8();
      }
    }
    r.at = end;
  }
  return { notes, division };
}

/** The top line: at each fresh attack, the highest note starting there. A
 *  four-part setting reduces to the melody the congregation sings. */
function melodyFrom(notes, division) {
  if (!notes.length) return [];
  const starts = [...new Set(notes.map((n) => n.start))].sort((a, b) => a - b);
  const melody = [];

  for (const start of starts) {
    const here = notes.filter((n) => n.start === start);
    const top = here.reduce((best, n) => (n.midi > best.midi ? n : best));
    // A note restruck on the same pitch while the melody holds it is an inner
    // part moving underneath, not a new syllable.
    const previous = melody[melody.length - 1];
    if (previous && previous.midi === top.midi && previous.end > start) {
      previous.end = Math.max(previous.end, top.end);
      continue;
    }
    melody.push({ midi: top.midi, start, end: top.end });
  }

  // Ticks to crotchets, which is what the app counts in.
  return melody.map((n, i) => ({
    midi: n.midi,
    beats: Math.max(Math.round(((melody[i + 1]?.start ?? n.end) - n.start) / division * 2) / 2, 0.5),
  }));
}

// ------------------------------------------------------------------ abc in --

// A tune file you supply is likely a single melody line rather than the Open
// Hymnal's four named voices, so the parsing here is the plain case: notes in
// order, with slurred groups counted as one syllable.
const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"];
const FLAT_ORDER = ["B", "E", "A", "D", "G", "C", "F"];
const FIFTHS = { "C#": 7, "F#": 6, B: 5, E: 4, A: 3, D: 2, G: 1, C: 0, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7 };

function keySignature(key) {
  const match = (key ?? "C").trim().match(/^([A-G][#b]?)\s*(m|min)?/i);
  let fifths = match ? (FIFTHS[match[1]] ?? 0) : 0;
  if (match && /^m/i.test(match[2] ?? "")) fifths -= 3;
  const out = {};
  for (let i = 0; i < Math.abs(fifths); i++) out[(fifths > 0 ? SHARP_ORDER : FLAT_ORDER)[i]] = fifths > 0 ? 1 : -1;
  return out;
}

function parseAbc(text) {
  const header = (name) => text.match(new RegExp(`^${name}:\\s*(.+)$`, "m"))?.[1]?.replace(/%.*$/, "").trim() ?? null;
  const [num, den] = (header("L") ?? "1/8").split("/").map(Number);
  const unit = num / den;
  const signature = keySignature(header("K") ?? "C");

  // Everything after the K: field is music.
  const body = text
    .slice(text.search(/^K:.*$/m))
    .split(/\r?\n/)
    .slice(1)
    .filter((l) => !/^[A-Za-z]:/.test(l) && !l.startsWith("%"))
    .join(" ")
    .replace(/![^!]*!/g, "")
    .replace(/"[^"]*"/g, "")
    .replace(/\{[^}]*\}/g, "");

  const token = /(\^{1,2}|_{1,2}|=)?([A-Ga-g])([,']*)(\d+)?(\/\d*)?(-)?|(\()|(\))|(\|)/g;
  const groups = [];
  let accidentals = { ...signature };
  let slurred = false;
  let slurOpened = false;
  let tied = false;
  let m;
  while ((m = token.exec(body))) {
    if (m[7]) { slurred = true; slurOpened = true; continue; }
    if (m[8]) { slurred = false; continue; }
    if (m[9]) { accidentals = { ...signature }; continue; }
    if (!m[2]) continue;
    const [, accidental, letter, octaves = "", numerator, fraction, tie] = m;
    if (accidental) accidentals[letter.toUpperCase()] = accidental === "^" ? 1 : accidental === "_" ? -1 : 0;

    const upper = letter.toUpperCase();
    let midi = 60 + STEP[upper] + (letter === upper ? 0 : 12);
    for (const mark of octaves) midi += mark === "'" ? 12 : -12;
    midi += accidental ? (accidental === "^" ? 1 : accidental === "_" ? -1 : 0) : (accidentals[upper] ?? 0);

    let length = numerator ? Number(numerator) : 1;
    if (fraction) length /= fraction.length > 1 ? Number(fraction.slice(1)) : 2;
    const note = { midi, beats: (length * unit) / 0.25 };

    if (groups.length && ((slurred && !slurOpened) || tied)) groups[groups.length - 1].push(note);
    else groups.push([note]);
    slurOpened = false;
    tied = Boolean(tie);
  }
  return { groups, key: header("K") ?? "C", title: header("T"), composer: header("C") };
}

// ------------------------------------------------------------------- build --

// "Dundee.CM.mid" -> name "Dundee", metre "C.M."; "French.8.6.8.6.mid" too.
function readFilename(file) {
  const stem = basename(file, extname(file));
  const at = stem.indexOf(".");
  if (at === -1) return { name: stem.replace(/[_-]+/g, " ").trim(), metre: null };
  return {
    name: stem.slice(0, at).replace(/[_-]+/g, " ").trim(),
    metre: findMetre(stem.slice(at + 1)),
  };
}

await mkdir(SRC, { recursive: true });
const files = (await readdir(SRC)).filter((f) => /\.(mid|midi|abc)$/i.test(f));

if (!files.length) {
  // This folder is the source of truth for the tunes it owns, so an empty one
  // means none -- which is how removing a file takes effect.
  const all = await saveTunes("local", []);
  console.log(`no tune files in ${SRC}`);
  console.log("  drop in .mid or .abc files named for their tune, e.g. Dundee.CM.mid");
  console.log(`\ntunes.json now holds ${all.length}: ${summarise(all)}`);
  process.exit(0);
}

const tunes = [];
const rejected = [];

for (const file of files) {
  const path = join(SRC, file);
  const { name, metre: declared } = readFilename(file);
  let syllables;
  let key = null;
  let composer = null;

  try {
    if (/\.abc$/i.test(file)) {
      const abc = parseAbc(await readFile(path, "utf8"));
      syllables = abc.groups;
      key = abc.key;
      composer = abc.composer;
    } else {
      const { notes, division } = readMidi(await readFile(path));
      syllables = melodyFrom(notes, division).map((n) => [n]);
    }
  } catch (error) {
    rejected.push(`${file}: ${error.message}`);
    continue;
  }

  // The metre the filename declares, or the only one the note count can mean.
  const candidates = declared ? [declared] : metresForNoteCount(syllables.length);
  if (!candidates.length) {
    rejected.push(`${file}: ${syllables.length} notes fit no metre the psalter uses -- name the metre, e.g. ${name}.CM${extname(file)}`);
    continue;
  }
  if (candidates.length > 1) {
    rejected.push(`${file}: ${syllables.length} notes could be ${candidates.map((c) => c.name).join(" or ")} -- name the metre, e.g. ${name}.${candidates[0].name.replace(/\.$/, "")}${extname(file)}`);
    continue;
  }

  const metre = candidates[0];
  const wanted = metre.pattern.reduce((a, b) => a + b, 0);
  if (syllables.length !== wanted) {
    rejected.push(`${file}: ${syllables.length} notes for ${metre.name}'s ${wanted} syllables`);
    continue;
  }

  tunes.push({
    id: slug(name),
    name,
    metre: metre.name,
    pattern: metre.pattern,
    composer,
    key,
    tempo: 92,
    lines: intoLines(syllables, metre.pattern),
  });
}

const all = await saveTunes("local", tunes);
console.log(`imported ${tunes.length} of ${files.length} file(s) from ${SRC}`);
if (tunes.length) console.log(`  ${tunes.map((t) => `${t.name} (${t.metre})`).join(", ")}`);
console.log(`\ntunes.json now holds ${all.length}: ${summarise(all)}`);
if (rejected.length) {
  console.log(`\n  ${rejected.length} not imported:`);
  console.log(rejected.map((r) => `    ${r}`).join("\n"));
}
