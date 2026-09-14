// Turns the 1650 Scottish Metrical Psalter into singable text.
//
// A psalm can only be sung once it is divided into metrical lines -- 8.6.8.6
// for Common Metre and so on -- so that each line of the psalm can sit under
// a line of the tune. Two scans of the psalter are used, because they fail in
// different ways and each corrects the other:
//
//   scottish_metrical_1650.raw.json -- John Brown of Haddington's edition
//   (archive.org item "scotishpsalter"), already extracted into verses. Its
//   letters are good but its structure is poor: it arrives as running prose,
//   carries the page furniture of the book it was scanned from (running
//   headers, page numbers, Brown's prose arguments and footnotes), and has a
//   systematic defect where the verse numbers "10" and "11" were read as the
//   words "to" and "n" and so never became verses at all -- 29 psalms had two
//   verses' text merged into one.
//
//   scottish_metrical_1650.ocr.txt -- a plainly-set edition from the same
//   archive.org item. Its structure is good: the line breaks are intact, the
//   metres and second versions are named, and there is no prose apparatus.
//   Its letters are worse ("Thc" for "The", "stìll" for "still", "al1" for
//   "all"), and it drops the occasional stanza.
//
// So the printed edition supplies the line breaks, and the Brown edition
// supplies both the fallback text and a vocabulary to mend the printed
// edition's misread words against. Where a printed line's syllables do not
// come out exactly, the line break is still the book's own, so the line is
// divided at the nearest word rather than discarded; where the printed
// edition cannot supply a setting at all, the Brown text is divided by
// counting syllables, and where even that fails the psalm keeps its verses
// and simply reads as prose.
//
// Run: npm run build:psalter

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { syllables, splitWord } from "./psalter-syllables.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "reference", "psalter", "scottish_metrical_1650.raw.json");
const OCR = join(ROOT, "reference", "psalter", "scottish_metrical_1650.ocr.txt");
const OUT = join(ROOT, "reference", "psalter", "scottish_metrical_1650.json");

// ---------------------------------------------------------------- metres --

// The raw labels are OCR of the book's own metre headings, so they arrive
// with stray spacing and letter/digit confusions ("l.M." for L.M., "l0.10..."
// for 10.10...). Normalised here to a name plus the line lengths that name
// means. An unlabelled psalm is Common Metre -- the 1650 book's default.
const METRES = {
  "": ["C.M.", [8, 6, 8, 6]],
  "c.m.": ["C.M.", [8, 6, 8, 6]],
  "s.m.": ["S.M.", [6, 6, 8, 6]],
  "l.m.": ["L.M.", [8, 8, 8, 8]],
  longmetre: ["L.M.", [8, 8, 8, 8]],
  // The printed edition's scan reads "Long Metre" as "Tong Metre".
  tongmetre: ["L.M.", [8, 8, 8, 8]],
  "10.10.10.10.10.": ["10.10.10.10.10.", [10, 10, 10, 10, 10]],
  "8-7.8.7.": ["8.7.8.7.", [8, 7, 8, 7]],
  "l0.10.10.10.10.": ["10.10.10.10.10.", [10, 10, 10, 10, 10]],
  "6.6.6.6.d.": ["6.6.6.6.D.", [6, 6, 6, 6, 6, 6, 6, 6]],
  "6.6.6.6.8.8.": ["6.6.6.6.8.8.", [6, 6, 6, 6, 8, 8]],
};

// The printed edition's headings come through the scan too, so an unreadable
// one means only that this setting falls back to the Brown text.
function metreOrNull(label) {
  try {
    return metreOf(label);
  } catch {
    return null;
  }
}

function metreOf(label) {
  const inner = label ? (label.match(/\(([^)]*)\)/)?.[1] ?? label) : "";
  const key = inner.toLowerCase().replace(/\s+/g, "");
  const hit = METRES[key];
  if (!hit) throw new Error(`unknown metre label: ${JSON.stringify(label)}`);
  return { name: hit[0], pattern: hit[1] };
}

// A psalm printed in two settings keeps the book's own ordinal, so the reader
// can be offered "First Version" / "Second Version" as the book offers them.
function versionName(label) {
  if (!label) return null;
  if (/first/i.test(label)) return "First Version";
  if (/second/i.test(label)) return "Second Version";
  return null;
}

// ---------------------------------------------------------------- repairs --

// Prose that the scan interleaved with the verse. Each entry names the psalm
// and verse, and an anchor: `from` drops the anchor and everything after it,
// `before` drops everything up to the anchor. Anchors are quoted exactly as
// they appear in the raw file. These are the only places in the book where
// argument, footnote or section-header text bled into a verse.
const PROSE = [
  // Brown's "argument" prefaces, which run ahead of the psalm's first verse.
  { psalm: 34, verse: 1, before: "God will I bless all times" },
  { psalm: 105, verse: 1, before: "Give thanks to God, call on his name" },
  { psalm: 127, verse: 1, before: "Except the Lord do build the house" },
  { psalm: 119, verse: 153, before: "Consider mine affliction" },
  // Footnotes, which run on after the verse they hang from.
  { psalm: 84, verse: 3, from: "* To me it is inconceivable" },
  { psalm: 133, verse: 2, from: "* To imagine that the sacred oil" },
  // Psalm 84's footnote spills onto the next page, where it lands after v9.
  { psalm: 84, verse: 9, from: "them; and I cannot believe" },
  // Psalm 119's acrostic section headers, each followed by its own argument.
  { psalm: 119, verse: 32, from: "H he, The5th Part." },
  { psalm: 119, verse: 136, from: "tsaddi, The i 8 th Part." },
];

// Page furniture and letter/digit confusions that recur throughout.
function scrub(text) {
  let t = text;
  // Running header at a page break: "PSALM ll8", "PSALM I 44", "PSALM 6l".
  t = t.replace(/\s*PSALM\s+[IlO0-9]+(\s+[0-9]+)?\s*$/i, "");
  // Page numbers, which the scan set with a letter for the final digit.
  t = t.replace(/\s+\b\d+[il]\b/g, "");
  // "Ill" (as in "Ill shall the wicked slay") read as the digits 111.
  t = t.replace(/(^|\s)111(\s)/g, "$1Ill$2");
  // "I'll" read as "Tll".
  t = t.replace(/(^|\s)Tll(\s)/g, "$1I'll$2");
  // Footnote reference marks left attached to the word they followed.
  t = t.replace(/,\*/g, ",").replace(/\*/g, "");
  return t.replace(/\s+/g, " ").trim();
}

// The scan read the verse numbers "10" and "11" as the words "to" and "n",
// so those verses were never split off and their text stayed glued to verse 9
// or 10. Only ever applied where the verse is genuinely missing from the
// version, so a real "to" ("to men his deeds make known") is never touched.
const OCR_VERSE_MARKS = { 10: "to", 11: "n" };

function restoreMergedVerses(verses) {
  const present = new Set(verses.map(([n]) => n));
  const out = [];
  for (let [num, text] of verses) {
    const found = [];
    // Verse 11 is split off first so that splitting 10 cannot disturb it.
    for (const target of [11, 10]) {
      if (present.has(target) || num >= target) continue;
      const mark = OCR_VERSE_MARKS[target];
      // The mark stands alone and is followed by the new verse's first word,
      // which is capitalised because a verse always begins one.
      const re = new RegExp(`\\s${mark}\\s(?=[A-Z])`);
      const at = text.search(re);
      if (at === -1) continue;
      const rest = text.slice(at).replace(re, "");
      text = text.slice(0, at);
      found.push([target, rest]);
      present.add(target);
    }
    out.push([num, text]);
    for (const f of found.sort((a, b) => a[0] - b[0])) out.push(f);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

// ------------------------------------------------------------- lineation --

// Metrical psalmody elides unstressed vowels to make a line fit, and the
// book does not always mark it: "covered" is sung cov'red, "turned" turn'd,
// "sanctuary" sanct'ry, "salvation" sometimes sal-va-tion and sometimes
// sal-va-ti-on. So a word does not have one syllable count -- it has a
// preferred count and, where an unstressed vowel could go, a shorter one.
const ELIDABLE = /(ed|e[rln]|o[rn]|a[rl]|ure|ous|ual|[aeiou]ry|ion|ness|ty)$/;
// The reverse also happens: a vowel pair the counter reads as one sound can
// be opened out to fill a line -- "gra-ci-ous", "fi-re", "hi-gher".
const OPENABLE = /(i[oe]us|eous|i[ae]n|ire|yer|ier|uet|iet|ye|oe)$/;

function variants(word) {
  const w = word.toLowerCase().replace(/[^a-z']/g, "");
  const n = syllables(word);
  const out = [n];
  if (n > 1 && ELIDABLE.test(w)) out.push(n - 1);
  if (OPENABLE.test(w)) out.push(n + 1);
  return out;
}

// A line wants to end where the text does: after a stop, and before a word
// that starts with a capital. Boundaries that respect the writing are
// preferred over boundaries that merely satisfy the arithmetic.
function boundaryCost(words, at) {
  if (at >= words.length) return 0;
  const ends = /[.,;:?!]$/.test(words[at - 1].text);
  const opens = /^[A-Z]/.test(words[at].text);
  return (ends ? 0 : 1) + (opens ? 0 : 1);
}

// Chooses the lineation: every line lands on exactly the syllables its metre
// asks for, the psalm ends on a whole stanza, and among the splits that do
// both, the one that elides fewest words and breaks at the likeliest places.
// Returns an error only when no such split exists at all.
function lineate(words, pattern) {
  const k = pattern.length;
  const syls = words.map((w) => variants(w.text));

  // ends[i][p] -> list of {to, cost} for a line starting at word i under
  // metre position p. Built lazily; a line is at most ~12 words.
  function endsFrom(i, p) {
    const target = pattern[p];
    const out = [];
    let reach = new Map([[0, 0]]); // syllables so far -> cheapest elision cost
    for (let j = i; j < words.length; j++) {
      const next = new Map();
      for (const [sum, cost] of reach) {
        syls[j].forEach((n, idx) => {
          const s = sum + n;
          if (s > target) return;
          const c = cost + (idx === 0 ? 0 : 1);
          if (!next.has(s) || next.get(s) > c) next.set(s, c);
        });
      }
      if (!next.size) break;
      reach = next;
      if (reach.has(target)) out.push({ to: j + 1, cost: reach.get(target) + boundaryCost(words, j + 1) });
    }
    return out;
  }

  // best[i][p] = cheapest way to lineate words[i..] starting at metre
  // position p and finishing on a stanza boundary.
  const best = Array.from({ length: words.length + 1 }, () => new Array(k).fill(null));
  for (let p = 0; p < k; p++) best[words.length][p] = p === 0 ? { cost: 0 } : null;

  for (let i = words.length - 1; i >= 0; i--) {
    for (let p = 0; p < k; p++) {
      let pick = null;
      for (const { to, cost } of endsFrom(i, p)) {
        const rest = best[to][(p + 1) % k];
        if (!rest) continue;
        const total = cost + rest.cost;
        if (!pick || total < pick.cost) pick = { cost: total, to };
      }
      best[i][p] = pick;
    }
  }

  if (!best[0][0]) {
    const total = words.reduce((s, w) => s + syllables(w.text), 0);
    const stanza = pattern.reduce((a, b) => a + b, 0);
    return { error: `no split fits ${pattern.join(".")}  (${total} syllables, ${(total / stanza).toFixed(2)} stanzas)` };
  }

  // Recovers how many syllables each word was taken as, so the words can be
  // divided to match the notes they will be sung on.
  function counts(from, to, target) {
    const chosen = new Array(to - from).fill(0);
    // reach[j] maps a running total to the cheapest way of reaching it.
    const reach = [new Map([[0, { cost: 0, from: null, n: 0 }]])];
    for (let j = from; j < to; j++) {
      const next = new Map();
      for (const [sum, node] of reach[j - from]) {
        syls[j].forEach((n, idx) => {
          const s = sum + n;
          if (s > target) return;
          const cost = node.cost + (idx === 0 ? 0 : 1);
          if (!next.has(s) || next.get(s).cost > cost) next.set(s, { cost, from: sum, n });
        });
      }
      reach.push(next);
    }
    let sum = target;
    for (let j = to - 1; j >= from; j--) {
      const node = reach[j - from + 1].get(sum);
      if (!node) return chosen.map(() => 1);
      chosen[j - from] = node.n;
      sum = node.from;
    }
    return chosen;
  }

  const lines = [];
  let i = 0;
  let p = 0;
  while (i < words.length) {
    const { to } = best[i][p];
    const taken = counts(i, to, pattern[p]);
    lines.push(words.slice(i, to).map((w, idx) => ({ ...w, syllables: taken[idx] })));
    i = to;
    p = (p + 1) % k;
  }
  return { lines, cost: best[0][0].cost };
}

// ------------------------------------------------- the printed edition ----

// A second scan of the same psalter sits in the same archive.org item, set
// plainly and -- crucially -- with its line breaks intact. Where the Brown
// edition arrives as running prose that has to be divided by counting
// syllables, this one already tells us where each printed line ends, which is
// the harder half of the problem solved for free. It also names each psalm's
// metre and marks its second version, and it carries none of Brown's prose
// apparatus.
//
// It is not simply better: it drops the odd stanza the Brown text has (Psalm
// 2 loses verse 7). So it is used for its line structure, and a setting it
// cannot supply falls back to the Brown text and the syllable-counting split.

// "First Version (S.M.)" -- the scan mangles the word itself ("I r ersion",
// "T 'ersion"), so only the ordinal and the metre in brackets are relied on.
const VERSION_LINE = /^(First|Second)\s+.{0,6}ersion\s*\(([^)]*)\)/i;

// The two scans fail in different ways, which makes each a check on the
// other. This one is cleaner in structure but noisier in letters -- it reads
// "The" as "Thc", "still" as "stìll", "all" as "al1" or "shau" -- so a word it
// produces that never appears anywhere in the Brown scan is almost certainly
// misread. Rather than list every confusion by hand, the usual scanning
// confusions are tried against the Brown vocabulary and the first spelling
// that is a real word of this psalter wins.
const CONFUSIONS = [
  [/[ìíîï]/g, "i"], [/[àáâ]/g, "a"], [/[èéê]/g, "e"], [/[òóô]/g, "o"], [/[ùúû]/g, "u"],
  [/rn/g, "m"], [/\bl/g, "I"], [/1/g, "l"], [/1/g, "i"], [/l/g, "i"], [/i/g, "l"],
  [/u/g, "ll"], [/c/g, "e"], [/e/g, "c"], [/0/g, "o"], [/5/g, "s"], [/d\b/g, "tly"],
  [/ll/g, "u"], [/w/g, "vv"],
];

function repairWord(word, vocabulary) {
  // A bare number is a verse mark, not a misread word -- leaving it alone
  // keeps "1" from being mended into the letter "l".
  if (/^\d+$/.test(word)) return word;
  // Keep the punctuation; only the letters are in question.
  const letters = word.match(/[A-Za-zÀ-ÿ'0-9]+/);
  if (!letters) return word;
  const raw = letters[0];
  if (vocabulary.has(raw.toLowerCase())) return word;

  for (const [pattern, replacement] of CONFUSIONS) {
    const tried = raw.replace(pattern, replacement);
    if (tried !== raw && vocabulary.has(tried.toLowerCase())) {
      return word.replace(raw, tried);
    }
  }
  return word;
}

function brownVocabulary(brown) {
  const words = new Set();
  for (const psalm of brown) {
    for (const version of psalm.versions) {
      for (const [, text] of version.verses) {
        for (const word of text.toLowerCase().match(/[a-z']+/g) ?? []) words.add(word);
      }
    }
  }
  return words;
}

function parsePrinted(text, vocabulary) {
  const psalms = new Map();
  let repaired = 0;
  let psalm = null;
  let setting = null;
  let inBody = false;

  const startSetting = (label, metreText) => {
    const metre = metreOrNull(metreText ? `(${metreText})` : null);
    setting = { label, metre, lines: [] };
    psalms.get(psalm).push(setting);
    inBody = false;
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    const head = line.match(/^Psalm\s+(\d+)\s*$/i);
    if (head) {
      psalm = Number(head[1]);
      psalms.set(psalm, []);
      setting = null;
      inBody = false;
      continue;
    }
    if (psalm == null) continue;
    // Running header and bare page numbers.
    if (/^1650\s+METRICAL/i.test(line) || /^\d+$/.test(line)) continue;

    const version = line.match(VERSION_LINE);
    if (version) {
      startSetting(version[1], version[2]);
      continue;
    }
    if (!setting) startSetting(null, null);

    // Everything between the heading and the first verse is the psalm's
    // superscription ("To the chief Musician", "A Psalm of David"), which is
    // prose about the psalm rather than part of it. The body begins at verse
    // one -- the scan sometimes reads that "1" as a letter.
    if (!inBody) {
      if (!/^[1IlJ][\s.]/.test(line)) continue;
      inBody = true;
    }
    const fixed = line
      .replace(/^[IlJ](?=[\s.])/, "1")
      .split(/\s+/)
      .map((word) => {
        const mended = repairWord(word, vocabulary);
        if (mended !== word) repaired++;
        return mended;
      })
      .join(" ");
    setting.lines.push(fixed);
  }
  return { psalms, repaired };
}

// A printed line holds two lines of the metre -- 8.6 for Common Metre -- so
// the metre's lines pair up into the lines the book actually sets.
function printedPattern(pattern) {
  const pairs = [];
  for (let i = 0; i < pattern.length; i += 2) pairs.push(pattern.slice(i, i + 2));
  return pairs;
}

// Turns the printed lines of one setting into the same word stream the Brown
// path produces, but with the line breaks already known: each printed line is
// divided only into the two metrical lines it holds, which is a far smaller
// question than dividing a whole psalm and keeps any mistake to one line.
// Where the syllables do not come out exactly, the printed line break is
// still right -- the miscount is inside it, from a word this counter reads
// wrongly or a letter the scan mangled ("exceUent", "profìt"). So the line is
// divided at the word boundary nearest the mark rather than thrown away:
// keeping the book's own line breaks with one word possibly on the wrong side
// beats giving up the whole psalm and printing it as prose.
function splitNearest(words, pair) {
  const [first] = pair;
  let best = { at: 1, off: Infinity };
  let running = 0;
  for (let i = 0; i < words.length - 1; i++) {
    running += syllables(words[i].text);
    const off = Math.abs(running - first);
    if (off < best.off) best = { at: i + 1, off };
  }
  return [words.slice(0, best.at), words.slice(best.at)];
}

function lineatePrinted(printed, pattern, approximate) {
  const pairs = printedPattern(pattern);
  if (printed.length % pairs.length !== 0) {
    return { error: `${printed.length} printed lines do not group into stanzas of ${pairs.length}` };
  }

  const lines = [];
  for (const [index, text] of printed.entries()) {
    const pair = pairs[index % pairs.length];
    // Verse numbers are set inline, at the word they fall on.
    const words = [];
    let pending = null;
    for (const token of text.split(/\s+/).filter(Boolean)) {
      const asNumber = token.match(/^(\d{1,3})$/);
      if (asNumber) { pending = Number(asNumber[1]); continue; }
      words.push({ text: token, verse: pending });
      pending = null;
    }
    if (!words.length) return { error: `printed line ${index + 1} has no words` };

    if (pair.length === 1) {
      lines.push(words.map((w) => ({ ...w, syllables: syllables(w.text) })));
      continue;
    }
    const split = lineate(words, pair);
    if (split.lines) {
      lines.push(...split.lines);
      continue;
    }
    approximate.push(`line ${index + 1}: "${text.slice(0, 44)}"`);
    for (const part of splitNearest(words, pair)) {
      if (!part.length) return { error: `printed line ${index + 1} cannot be divided at all` };
      lines.push(part.map((w) => ({ ...w, syllables: syllables(w.text) })));
    }
  }
  return { lines };
}

// ------------------------------------------------------------------ build --

const raw = JSON.parse(readFileSync(SRC, "utf8"));
const { psalms: printed, repaired } = parsePrinted(readFileSync(OCR, "utf8"), brownVocabulary(raw));
const failures = [];
const fellBack = [];
const approximated = [];
const out = [];

for (const psalm of raw) {
  const versions = [];
  const available = printed.get(psalm.number) ?? [];

  for (const [versionIndex, version] of psalm.versions.entries()) {
    const metre = metreOf(version.label);

    let verses = version.verses.map(([num, text]) => {
      const fix = PROSE.find((p) => p.psalm === psalm.number && p.verse === num);
      if (fix) {
        const at = text.indexOf(fix.from ?? fix.before);
        if (at === -1) throw new Error(`repair anchor missing in psalm ${psalm.number}:${num}`);
        text = fix.from ? text.slice(0, at) : text.slice(at);
      }
      return [num, scrub(text)];
    });
    verses = restoreMergedVerses(verses);

    // One flat word stream, each word remembering the verse it belongs to, so
    // verse numbers can be shown at the point they fall -- which in metrical
    // psalmody is regularly mid-line.
    const words = [];
    for (const [num, text] of verses) {
      text.split(/\s+/).filter(Boolean).forEach((w, idx) => {
        words.push({ text: w, verse: idx === 0 ? num : null });
      });
    }

    const id = `Psalm ${psalm.number}${version.label ? ` (${metre.name})` : ""}`;

    // Prefer the printed edition, which knows where its own lines end. The
    // settings are matched by position: a psalm printed in two versions has
    // them in the same order in both scans.
    let lines = null;
    let error = null;
    let usedPrinted = false;
    const source = available[versionIndex];
    const approximate = [];
    if (source && source.metre?.name === metre.name && source.lines.length) {
      const attempt = lineatePrinted(source.lines, metre.pattern, approximate);
      if (attempt.lines) {
        lines = attempt.lines;
        usedPrinted = true;
        if (approximate.length) approximated.push({ id, lines: approximate });
      } else error = attempt.error;
    }
    // Fall back to dividing the Brown text by counting syllables.
    if (!lines) {
      const attempt = lineate(words, metre.pattern);
      if (attempt.lines) {
        lines = attempt.lines;
        if (error) fellBack.push(`${id}: ${error}`);
      } else {
        failures.push(`${id}: ${error ?? attempt.error}`);
      }
    }

    // Lineation is what lets a stanza be sung -- one line per line of the
    // tune, so the words can sit under the notes. Where the scan is too
    // damaged for any split to fit the metre, the psalm still gets its
    // cleaned text and its tunes; it just reads as verses rather than
    // stanzas, and the tune plays without words under it.
    const stanzas = [];
    for (let i = 0; lines && i < lines.length; i += metre.pattern.length) {
      const group = lines.slice(i, i + metre.pattern.length);
      stanzas.push({
        number: stanzas.length + 1,
        // A line is its text plus any verse numbers starting inside it, each
        // at the word index it falls on -- in metrical psalmody a verse
        // regularly begins mid-line.
        lines: group.map((ws) => ({
          text: ws.map((w) => w.text).join(" "),
          marks: ws.flatMap((w, idx) => (w.verse == null ? [] : [{ verse: w.verse, word: idx }])),
          // One entry per note the line will be sung on, so the words can be
          // set under the tune. A word of more than one syllable is divided.
          syllables: ws.flatMap((w) => splitWord(w.text, w.syllables)),
        })),
      });
    }

    versions.push({
      label: versionName(version.label),
      metre: metre.name,
      pattern: metre.pattern,
      stanzas: stanzas.length ? stanzas : null,
      printed: usedPrinted,
      verses: verses.map(([num, text]) => [num, text]),
    });
  }
  out.push({ number: psalm.number, versions });
}

const fromPrinted = out.reduce((n, p) => n + p.versions.filter((v) => v.printed).length, 0);
const settings = out.reduce((n, p) => n + p.versions.length, 0);
const sung = out.reduce((n, p) => n + p.versions.filter((v) => v.stanzas).length, 0);
const stanzas = out.reduce((n, p) => n + p.versions.reduce((m, v) => m + (v.stanzas?.length ?? 0), 0), 0);

writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`wrote ${OUT}`);
console.log(`  ${settings} settings, ${sung} lineated into ${stanzas} stanzas`);
console.log(`  ${fromPrinted} took their line breaks from the printed edition (${repaired} misread words mended against the other scan)`);
const approximateLines = approximated.reduce((n, a) => n + a.lines.length, 0);
if (approximateLines) {
  const allLines = out.reduce((n, p) => n + p.versions.reduce((m, v) => m + (v.stanzas?.length ?? 0) * v.pattern.length, 0), 0);
  console.log(
    `  ${approximateLines} printed line(s) across ${approximated.length} setting(s) were divided at the nearest` +
      ` word rather than exactly -- ${((approximateLines * 2) / allLines * 100).toFixed(1)}% of all lines`,
  );
}
if (fellBack.length) {
  console.log(`\n  ${fellBack.length} fell back to counting syllables -- the printed edition did not fit:`);
  console.log(fellBack.slice(0, 12).map((f) => `    ${f}`).join("\n"));
}
if (failures.length) {
  console.log(`\n  ${failures.length} settings kept their verses but could not be lineated:`);
  console.log(failures.map((f) => `    ${f}`).join("\n"));
}
