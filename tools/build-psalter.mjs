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
//   archive.org item. Its structure is good: each printed line is two lines
//   of the metre (8.6 for Common Metre), the metres and second versions are
//   named, and there is no prose apparatus. Its letters are worse ("Thc" for
//   "The", "shaU" for "shall", "Hke" for "like"), its verse numbers are often
//   misread (an "I" read as verse 1, "11" read as "II"), and it once prints a
//   stanza under the wrong psalm.
//
// So the printed edition supplies the words and the couplet breaks, and the
// Brown edition supplies the fallback text, a vocabulary to mend the printed
// edition's misread words against, and its own text of each setting to mend
// the rest against word by word and to put a displaced stanza back. What is
// left misread is put right by a short list of corrections, checked by
// reporting every word that is still not English.
//
// The break inside each couplet -- where the 8 ends and the 6 begins -- is
// not printed, and is found by counting syllables (psalter-syllables.mjs).
// A whole setting is divided at once: its words are split into lines that
// each carry exactly the syllables their place in the metre asks for, the
// printed couplet breaks kept, and among the divisions that do both, the one
// that breaks after punctuation and takes words at their usual length, or at
// the lengths the book most often takes them at instead. A few couplets fill
// the metre as well broken in the wrong place as in the right one, and for
// those the book's own break is given (BOOK_BREAKS). Where no division fits,
// the line keeps the nearest break and the build reports it; where the
// printed edition cannot supply a setting at all, the Brown text is divided
// the same way without the printed breaks to lean on.
//
// The result was checked couplet by couplet against the Free Church of
// Scotland's text of the psalter (freechurch.org, PlainText.zip), which
// breaks every line as the 1650 printing does and marks the syllables the
// book sounds that modern speech does not.
//
// Run: npm run build:psalter  [-- --report <path>]   (the report is JSON:
// each setting's stanzas, any line off its metre, any word not known)

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PRICE, analyse, keyOf, splitWord } from "./psalter-syllables.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "reference", "psalter", "scottish_metrical_1650.raw.json");
const OCR = join(ROOT, "reference", "psalter", "scottish_metrical_1650.ocr.txt");
const OUT = join(ROOT, "reference", "psalter", "scottish_metrical_1650.json");
const BIBLES = join(ROOT, "bibles");
const KJV = join(BIBLES, "King James Version (1769).xml");
const reportAt = process.argv.indexOf("--report");
const REPORT = reportAt > 0 ? process.argv[reportAt + 1] : null;

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
  // The printed edition's scan reads "Long Metre" as "Tong Metre", and
  // Psalm 100's "L.M." as "F.M.".
  tongmetre: ["L.M.", [8, 8, 8, 8]],
  "f.m.": ["L.M.", [8, 8, 8, 8]],
  "10.10.10.10.10.": ["10.10.10.10.10.", [10, 10, 10, 10, 10]],
  "8-7.8.7.": ["8.7.8.7.", [8, 7, 8, 7]],
  "8.7.8.7.": ["8.7.8.7.", [8, 7, 8, 7]],
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
  return { name: hit[0], pattern: hit[1], printed: printedLayout(hit[0], hit[1]) };
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

// How many verses each psalm has, in the Authorised Version's numbering, which
// the 1650 book follows. Verse numbers are what both scans misread most often,
// so every number read from them is held to this: a number can only be a verse
// number if its psalm has that verse, and a finished setting must number its
// verses 1, 2, 3 ... to the last, in order.
const PSALM_VERSES = [
  6, 12, 8, 8, 12, 10, 17, 9, 20, 18, 7, 8, 6, 7, 5, 11, 15, 50, 14, 9, 13, 31, 6, 10, 22, 12, 14, 9, 11, 12,
  24, 11, 22, 22, 28, 12, 40, 22, 13, 17, 13, 11, 5, 26, 17, 11, 9, 14, 20, 23, 19, 9, 6, 7, 23, 13, 11, 11, 17, 12,
  8, 12, 11, 10, 13, 20, 7, 35, 36, 5, 24, 20, 28, 23, 10, 12, 20, 72, 13, 19, 16, 8, 18, 12, 13, 17, 7, 18, 52, 17,
  16, 15, 5, 23, 11, 13, 12, 9, 9, 5, 8, 28, 22, 35, 45, 48, 43, 13, 31, 7, 10, 10, 9, 8, 18, 19, 2, 29, 176, 7,
  8, 9, 4, 8, 5, 6, 5, 6, 8, 8, 3, 18, 3, 3, 21, 26, 9, 8, 24, 13, 10, 7, 12, 15, 21, 10, 20, 14, 9, 6,
];
const versesIn = (psalm) => PSALM_VERSES[psalm - 1];

// The scan read the verse numbers "10" and "11" as the words "to" and "n",
// so those verses were never split off and their text stayed glued to verse 9
// or 10. Only ever applied where the verse is genuinely missing from the
// version, so a real "to" ("to men his deeds make known") is never touched --
// and only where the psalm has that verse at all, as Psalms 43 and 120 do not.
const OCR_VERSE_MARKS = { 10: "to", 11: "n" };

function restoreMergedVerses(verses, count) {
  const present = new Set(verses.map(([n]) => n));
  const out = [];
  for (let [num, text] of verses) {
    const found = [];
    // Verse 11 is split off first so that splitting 10 cannot disturb it.
    for (const target of [11, 10]) {
      if (present.has(target) || num >= target || target > count) continue;
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

// What a division of a setting into lines costs, from worst to least:
//
//   a line that does not come to its metre's syllables at all, per syllable;
//   a printed couplet break not kept, or a break made where the book has a
//     couplet running on -- the printed lines are the book's own;
//   a line one syllable long in a way the book does not rhyme (see
//     `feminine`);
//   a line one syllable long the way the book rhymes: a rhyming line ending
//     on an unstressed syllable;
//   a line ending on an article or a possessive, parted from its noun --
//     the book does this once in the whole psalter ("To plot against the
//     Lord, and his / Anointed"), where nothing else fits the metre;
//   a word taken at other than its usual length ("heav'n" for heaven,
//     "sal-va-ti-on" for salvation), per word, priced by how often the book
//     does it (see `PRICE` in psalter-syllables);
//   a line ending on a word that leans on the next -- a preposition, "and"
//     ("coals by / it were turned"), which the book does about forty times;
//   a break between two words with no stop between them -- a line of the
//     1650 book usually ends on a comma, a semicolon or a colon, but not
//     always ("The tabernacles of thy grace / how pleasant, Lord, they be!").
//
// The word lengths come before the punctuation: a word counted at its usual
// length is right far more often than a line break is guaranteed a comma.
const COST = {
  offMetre: 40,
  printed: 12,
  unrhymedFeminine: 20,
  determiner: 3,
  feminine: 1.5,
  variant: 1,
  leaning: 1,
  unpunctuated: 0.9,
};
const LEANING = new Set(
  "a an the my thy his her its our your their of to by in into unto with from for at on and or nor o".split(" "),
);
// "her" is left out: as often as not it is the object ("The virgins that
// do follow her / ... shall be brought").
const DETERMINERS = new Set("a an the my thy his its our your their".split(" "));
// The most words a line of any metre here can hold.
const LINE_WORDS = 16;

// Which lines of the metre close a printed line. The printed edition sets
// the metre's lines two to a line (8.6 / 8.6 for Common Metre), except in
// its two rarer metres: 10.10.10.10.10 (Psalm 124's second version) has a
// printed line for each, and 6.6.6.6.8.8 (136 and 148) sets its sixes in
// pairs and each eight alone ("For certainly His mercies dure / Most firm
// and sure Eternally.").
function printedLayout(name, pattern) {
  const k = pattern.length;
  if (name === "10.10.10.10.10.") return new Set(pattern.map((_, p) => p));
  if (name === "6.6.6.6.8.8.") return new Set([1, 3, 4, 5]);
  return new Set(pattern.map((_, p) => p).filter((p) => p % 2 === 1 || p === k - 1));
}

// A feminine ending: a line one syllable long because it ends on an
// unstressed syllable after its last stressed one -- "to be my King
// ap-POINT-ed", "had been my friend or BRO-ther". The 1650 book rhymes a
// handful of stanzas this way (appointed / anointed, brother / mother,
// together / gather, "for ever" / "deliver"), always on the rhyming lines --
// the second and fourth -- and the extra syllable is sung on the line's
// last note. There it is about as likely as a word taken short to fit, and
// likelier than two ("And o'er Sion, my holy hill, / I have him King
// anointed", not "... hill, I / have him King anointed"). On a line that
// does not rhyme it is only the least bad of lines that will not fit ("And
// to observe his testimonies"). The ending is the last word's unstressed
// syllable, or, on a rhyming line, an unstressed pronoun after it ("to
// ab-HOR me").
const UNSTRESSED_ENDING = /(er|ers|ed|en|el|le|les|ness|ing|y|ies|tion|tions|sion|ure|es|est|eth|ow|ice|ace)$/i;
function feminine(text, p) {
  const word = text.replace(/[^A-Za-z']+$/, "");
  if (p % 2 === 1 && /^(me|thee|him|us|it|them)$/i.test(word)) return true;
  return analyse(word).pieces.length >= 2 && UNSTRESSED_ENDING.test(word);
}
const rhymes = (p) => p % 2 === 1;

// Words the book sings a syllable long where they end a line, their last two
// syllables on the line's last note, rather than taken short to fit: "In
// Salem is his tab-er-na-cle" (Ps 76:2, and 27:6, 78:28, 78:67, 132:7), which
// the Free Church of Scotland text marks "taber<u>nacle</u>" -- na-cle sung
// to one note -- in all five. Counting alone would sing "tab'r-na-cle" there,
// squeezing the syllables together inside the word instead.
const BOOK_FEMININE = /^tabernacles?$/i;
const bookFeminine = (text) => BOOK_FEMININE.test(text.replace(/[^A-Za-z']+$/, ""));

// Each word's possible syllable counts, priced (see psalter-syllables) for
// its place inside a line or at the end of one.
const optionsOf = (text, atEnd = false) =>
  analyse(text)[atEnd ? "countsAtEnd" : "counts"].map(({ n, cost }) => ({ n, cost: cost * COST.variant }));

// The syllable sums a run of words can make, each at its cheapest.
function extend(sums, options, most) {
  const next = new Map();
  for (const [sum, cost] of sums) {
    for (const option of options) {
      const s = sum + option.n;
      if (s > most) continue;
      if (!next.has(s) || next.get(s) > cost + option.cost) next.set(s, cost + option.cost);
    }
  }
  return next;
}

/**
 * Divides a setting's words into the lines of its metre, whole stanzas only.
 * Each word is `{ text, verse, printedBreak }`, where `printedBreak` is true
 * when the printed edition ends a line after it -- or absent altogether for
 * the Brown text, which has no line breaks to keep. Returns the lines, each
 * word carrying the syllable count it is sung in, and the indexes of any line
 * that could not be brought to its metre.
 */
function lineate(words, pattern, closes = printedLayout("", pattern)) {
  const closesPrinted = (p) => closes.has(p);
  const k = pattern.length;
  const n = words.length;
  if (!n) return { error: "no words" };
  const options = words.map((w) => optionsOf(w.text));
  const endOptions = words.map((w) => optionsOf(w.text, true));
  const printed = words.some((w) => w.printedBreak != null);

  // best[i][p]: the cheapest division of words[i..], starting at line p of
  // the metre and ending where a stanza ends.
  const best = Array.from({ length: n + 1 }, () => new Array(k).fill(null));
  best[n][0] = { cost: 0 };
  for (let i = n - 1; i >= 0; i--) {
    for (let p = 0; p < k; p++) {
      const target = pattern[p];
      let pick = null;
      let sums = new Map([[0, 0]]); // syllables of words i..j-1 -> cheapest word lengths
      let runOn = 0; // printed breaks this line would run over
      for (let j = i; j < n && j < i + LINE_WORDS; j++) {
        // The line as it would be if it ended on word j.
        const ending = extend(sums, endOptions[j], target + 3);
        if (!ending.size) break;
        sums = extend(sums, options[j], target + 3);
        const end = j + 1;
        const rest = best[end][(p + 1) % k];
        if (rest) {
          let lineCost = Infinity;
          for (const [s, cost] of ending) {
            const miss =
              s === target + 1 && bookFeminine(words[j].text)
                ? 0
                : s === target + 1 && feminine(words[j].text, p)
                  ? rhymes(p) ? COST.feminine : COST.unrhymedFeminine
                  : Math.abs(s - target) * COST.offMetre;
            lineCost = Math.min(lineCost, cost + miss);
          }
          let breakCost = runOn * COST.printed;
          if (end < n) {
            if (!/[.,;:!?)]['"]?$/.test(words[j].text)) {
              breakCost += COST.unpunctuated;
              const last = words[j].text.toLowerCase();
              if (DETERMINERS.has(last)) breakCost += COST.determiner;
              else if (LEANING.has(last)) breakCost += COST.leaning;
            }
            if (printed && !!words[j].printedBreak !== closesPrinted(p)) breakCost += COST.printed;
          }
          const total = lineCost + breakCost + rest.cost;
          if (!pick || total < pick.cost) pick = { cost: total, to: end };
        }
        // A break the book is known to make inside a couplet (BOOK_BREAKS)
        // is held to as a printed one is.
        if (printed && (words[j].printedBreak || words[j].bookBreak)) runOn++;
      }
      best[i][p] = pick;
    }
  }
  if (!best[0][0]) return { error: "no division into whole stanzas" };

  // The division, line by line, each line's words priced for their places.
  const spans = [];
  for (let i = 0, p = 0; i < n; p = (p + 1) % k) {
    const { to } = best[i][p];
    spans.push({ from: i, to, p, options: [...options.slice(i, to - 1), endOptions[to - 1]] });
    i = to;
  }

  // The book's feminine rhymes come in pairs -- "his mercy faileth never /
  // ... his truth endureth ever", "I will shew God's salvation / ... his life
  // and conversation" -- and a pair is sung with each line's extra syllable
  // on its last note. Where both rhyming lines of a stanza end unstressed and
  // run one syllable long -- one at its words' usual lengths, the other at
  // them or with an -ed sounded ("with shame be cloth-ed over / ... them, as
  // a mantle, cover") -- both are sung so, rather than each running two
  // syllables of some earlier word together to come out even ("con-ver" on
  // one note).
  const usual = (span) => span.options.map((o) => (o.find((x) => x.cost === 0) ?? o[0]).n);
  const runsLong = (span) => {
    if (!feminine(words[span.to - 1].text, span.p)) return null;
    const counts = usual(span);
    if (counts.reduce((a, b) => a + b, 0) === pattern[span.p] + 1) return { counts, cost: 0 };
    const sounded = lengths(span.options, pattern[span.p] + 1);
    return sounded.total === pattern[span.p] + 1 && sounded.cost <= PRICE.soundedEd * COST.variant ? sounded : null;
  };
  const femininePair = new Map();
  spans.forEach((span, at) => {
    const partner = spans[at + 2];
    if (!rhymes(span.p) || partner?.p !== span.p + 2) return;
    const a = runsLong(span);
    const b = runsLong(partner);
    if (a && b && (a.cost === 0 || b.cost === 0)) femininePair.set(span, a.counts).set(partner, b.counts);
  });

  const lines = [];
  const off = [];
  // Where the division did not keep the printed lines: a couplet run on
  // past its printed end, or a printed line split mid-couplet.
  const unprinted = [];
  for (const span of spans) {
    const { from: i, to, p } = span;
    const sungLong = bookFeminine(words[to - 1].text) && usual(span).reduce((a, b) => a + b, 0) === pattern[p] + 1;
    const { counts, total } = femininePair.has(span)
      ? { counts: femininePair.get(span), total: pattern[p] + 1 }
      : sungLong
        ? { counts: usual(span), total: pattern[p] + 1 }
        : lengths(span.options, pattern[p]);
    if (total !== pattern[p]) off.push(lines.length);
    const kept = !printed || to === n || !!words[to - 1].printedBreak === closesPrinted(p);
    const runOn = printed && words.slice(i, to - 1).some((w) => w.printedBreak);
    // A run-on is the scan wrapping a long printed line onto the next ("...
    // the thoughts sent from my / heart,"), which the division closes up.
    if (!kept || runOn) unprinted.push({ at: lines.length, why: runOn && kept ? "the scan wrapped a printed line here" : "a printed line break moved" });
    lines.push(words.slice(i, to).map((w, idx) => ({ ...w, syllables: counts[idx] })));
  }
  return { lines, off, unprinted, cost: best[0][0].cost };
}

// The length each word of a line is sung at: the cheapest way to make the
// line's target, or -- where nothing makes it -- the nearest total.
function lengths(options, target) {
  const reach = [new Map([[0, { cost: 0, from: null, n: 0 }]])];
  for (const opts of options) {
    const next = new Map();
    for (const [sum, node] of reach.at(-1)) {
      for (const option of opts) {
        const s = sum + option.n;
        const cost = node.cost + option.cost;
        if (!next.has(s) || next.get(s).cost > cost) next.set(s, { cost, from: sum, n: option.n });
      }
    }
    reach.push(next);
  }
  let total = null;
  for (const [s, node] of reach.at(-1)) {
    const better =
      total == null ||
      Math.abs(s - target) < Math.abs(total - target) ||
      (Math.abs(s - target) === Math.abs(total - target) && node.cost < reach.at(-1).get(total).cost);
    if (better) total = s;
  }
  const counts = new Array(options.length).fill(0);
  for (let j = options.length, sum = total; j > 0; j--) {
    const node = reach[j].get(sum);
    counts[j - 1] = node.n;
    sum = node.from;
  }
  return { counts, total, cost: reach.at(-1).get(total).cost };
}

// A line's words divided for the notes, one piece a note. "th'" has no
// syllable of its own and is sung with the word after it ("th'up-lif-ter").
function notesOf(words) {
  const out = [];
  let carry = "";
  for (const w of words) {
    const pieces = splitWord(w.text, w.syllables);
    if (!pieces.length) {
      carry += w.text;
      continue;
    }
    pieces[0] = carry + pieces[0];
    carry = "";
    out.push(...pieces);
  }
  if (carry) {
    if (out.length) out[out.length - 1] += ` ${carry}`;
    else out.push(carry);
  }
  return out;
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
// It is not simply better: its verse numbers are the part most often misread
// (see readNumbers), and Psalm 2's verse 7 is printed at the end of Psalm 3
// (see relocate). A setting it cannot supply falls back to the Brown text and
// the syllable-counting split.

// "First Version (S.M.)" -- the scan mangles the word itself ("I r ersion",
// "T 'ersion", "SecondVersion", "Second T r ersìon"), and once runs the psalm
// number onto the front of it ("124; Second ..."), so only the ordinal and the
// metre in brackets are relied on.
const VERSION_LINE = /^(?:\d+\W*\s+)?(First|Second)\s*.{0,6}ers.on\s*\(([^)]*)\)/i;

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
  [/ll/g, "u"], [/w/g, "vv"], [/^l'/, "I'"], [/H/g, "ll"],
];

// The scan's commonest confusion is a capital standing for lower-case
// letters of the same shape: "U" for "ll" ("shaU", "I'U"), "U" for "li" or
// "il" ("estabUsh", "buUd"), "H" for "li", "ll" or "l" ("Hke", "sHding",
// "aH", "circHng"), and a capital U read as "LT" ("LTpon", "LTnless"). A
// capital after a small letter can only be a misreading; a
// capital H opening a word is only that when the word is not English as it
// stands. The word keeps a capital only where it opens its printed line, as
// every line of this edition does.
const CAPITAL_MISREADS = [
  ["U", ["ll", "li", "il"]],
  ["H", ["li", "ll", "l", "il"]],
];

function repairCapitals(word, english, opensLine) {
  // "LTpon", "LTnless": a capital U read as the two letters L and T.
  const u = word.replace(/^LT(?=[a-z])/, "U");
  if (u !== word && english(u)) return u;
  // "l'U": the I of "I'll" is read as an l as well.
  const raw = word.replace(/^l'(?=[A-Z])/, "I'");
  for (const [capital, readings] of CAPITAL_MISREADS) {
    const inside = new RegExp(`(?<=[a-z'])${capital}|${capital}(?=[a-z]*[a-z]${capital})`);
    const leading = new RegExp(`^${capital}(?=[a-z])`);
    const at = inside.test(raw) ? inside : leading.test(raw) && !english(raw) ? leading : null;
    if (!at) continue;
    for (const reading of readings) {
      let tried = raw.replace(new RegExp(at.source, "g"), reading);
      if (!english(tried)) continue;
      if (at === leading && opensLine) tried = tried[0].toUpperCase() + tried.slice(1);
      return tried;
    }
  }
  return word;
}

function repairWord(word, vocabulary, english = () => false, opensLine = false) {
  // A bare number is a verse mark, not a misread word -- leaving it alone
  // keeps "1" from being mended into the letter "l".
  if (/^\d+$/.test(word)) return word;
  // Keep the punctuation; only the letters are in question.
  const letters = word.match(/[A-Za-zÀ-ÿ'0-9]+/);
  if (!letters) return word;
  const raw = letters[0];
  const capitals = repairCapitals(raw, english, opensLine);
  if (capitals !== raw) return word.replace(raw, capitals);
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

// One-off misreadings in the printed edition that no general rule should
// guess at. Each is quoted exactly as the scan has it and was checked against
// the Brown text and the Authorised Version's verse division.
const PRINTED_FIXES = [
  // Verse 6 read as an accent on the word before it.
  { psalm: 107, find: "faintsò their soul. When", replace: "faints their soul. 6 When" },
  // Ps 119:84, "Just judgment on these wicked men": the J read as a bar,
  // which the Brown text (misread itself, as "lust") would otherwise mend to
  // a word that is English and so passes every check. The 1650 printing
  // (EEBO-TCP A76561) has "Juſt judgement".
  { psalm: 119, find: "|ust judgment", replace: "Just judgment" },
  // Ps 89:47, "that thou / hast made all men in vain?": both scans print
  // "has", ungrammatical after "thou". The 1650 printing (EEBO-TCP A76561)
  // and the Free Church of Scotland text both have "hast".
  { psalm: 89, find: "that thou has made", replace: "that thou hast made" },
];

// Lines both scans print twice running where the book prints them once, so
// no comparison of the two can catch them. Each is dropped from the printed
// edition's lines and from the Brown text of its verse, keeping the first.
const REPEATED = [
  // Ps 69:4's second quatrain. The 1650 printing (EEBO-TCP A76561) and the
  // Free Church of Scotland text both have it once: 33 stanzas, not 34.
  {
    psalm: 69,
    verse: 4,
    text: "They that would me destroy, and are mine en'mies wrongfully, Are mighty: so what I took not, to render forc'd was I.",
  },
];

// A setting's printed lines with any REPEATED block's second printing taken
// out. Lines are compared on their words alone, as the scan's letters are
// mended after this.
function dropRepeats(psalm, lines) {
  const flat = (text) => wordsOf(text).join(" ");
  for (const { text } of REPEATED.filter((r) => r.psalm === psalm)) {
    const want = flat(text);
    for (let i = 0; i < lines.length; i++) {
      // The block is the fewest lines from i that spell it out.
      let k = 0;
      let got = "";
      while (i + k < lines.length && got.length < want.length) got = flat(lines.slice(i, i + ++k).map((l) => l.text).join(" "));
      if (got !== want) continue;
      const again = flat(lines.slice(i + k, i + 2 * k).map((l) => l.text).join(" "));
      if (again === want) lines.splice(i + k, k);
    }
  }
  return lines;
}

// Decides which of a printed line's numbers are verse numbers. `cursor.last`
// is the verse the setting has reached: a verse number only ever moves it
// forward -- by one, or by a few where the scan lost a number -- and never
// past the psalm's last verse. A number that cannot be a verse number there is
// letters the scan read as digits, in the same few ways throughout the book:
//
//   "12 0 Lord, do thou arise"           the vocative O
//   "4 1 cry'd", "1 will confess"        the pronoun I
//   "101 never did", "141 had"           a verse number run into the I after it
//   "1101 err'd not"                     ... a three-figure one, in Psalm 119
//   "21 111 shall the wicked slay"       the word Ill
//   "II Vow to the Lord"                 verse 11, read as two letters
//   "break'st:8 As we have heard"        a verse number run onto the word before
//   "help me, Lord:l 1 Thou turned"      both at once: verse 11 as "l 1"
//
// A line that opens with a number the setting has already passed is not a
// misreading but a line out of place (Psalm 2's verse 7 is printed at the end
// of Psalm 3), and is reported as `backward` so that it can be moved.
function readNumbers(tokens, cursor, count) {
  const forward = (n) => n > cursor.last && n <= Math.min(cursor.last + 4, count);
  const out = [];
  let backward = null;
  const mark = (n) => {
    out.push(String(n));
    cursor.last = n;
  };
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const split = token.match(/^(.*[.,;:!?])[lI1]$/);
    if (split && /^\d$/.test(tokens[i + 1] ?? "") && forward(Number(`1${tokens[i + 1]}`))) {
      out.push(split[1]);
      mark(Number(`1${tokens[i + 1]}`));
      i++;
      continue;
    }
    const glued = token.match(/^(.*[A-Za-z'.,;:!?)])(\d{1,3})$/);
    if (glued && forward(Number(glued[2]))) {
      out.push(glued[1]);
      mark(Number(glued[2]));
      continue;
    }
    // A verse number is never followed by punctuation, so "will 1:" can
    // only be the pronoun.
    const stop = token.match(/^(0|1|111)([.,;:!?)]+)$/);
    if (stop) {
      out.push({ 0: "O", 1: "I", 111: "Ill" }[stop[1]] + stop[2]);
      continue;
    }
    const numeric = /^[0-9Il]{1,4}$/.test(token) && (/\d/.test(token) || /^[Il]{2}$/.test(token));
    if (!numeric) {
      out.push(token);
      continue;
    }
    const n = Number(token.replace(/[Il]/g, "1"));
    if (forward(n)) mark(n);
    else if (token === "0") out.push("O");
    else if (/^\d{2,4}$/.test(token) && token.endsWith("1") && forward(Number(token.slice(0, -1)))) {
      mark(Number(token.slice(0, -1)));
      out.push("I");
    } else if (token === "1") out.push("I");
    else if (token === "111") out.push("Ill");
    else {
      if (i === 0 && /^\d+$/.test(token) && n >= 1 && n <= cursor.last) backward = n;
      out.push(token);
    }
  }
  return { tokens: out, backward };
}

function parsePrinted(text, vocabulary, english) {
  const psalms = new Map();
  const displaced = [];
  let repaired = 0;
  let psalm = null;
  let setting = null;
  let inBody = false;
  // Lines found out of place, gathered until the setting's own numbering
  // picks up again; `relocate` then moves them to where they belong.
  let block = null;

  const startSetting = (label, metreText) => {
    const metre = metreOrNull(metreText ? `(${metreText})` : null);
    // A superscription ahead of "First Version" opened an unnamed setting
    // that never reached a verse; the named one takes its place, or the
    // psalm's settings would no longer line up with the Brown text's.
    if (setting && !setting.lines.length) psalms.get(psalm).pop();
    setting = { label, metre, lines: [], cursor: { last: 0 } };
    psalms.get(psalm).push(setting);
    inBody = false;
    block = null;
  };

  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line) continue;

    const head = line.match(/^Psalm\s+(\d+)\s*$/i);
    if (head) {
      psalm = Number(head[1]);
      psalms.set(psalm, []);
      setting = null;
      inBody = false;
      block = null;
      continue;
    }
    if (psalm == null) continue;
    // Running header and bare page numbers; the heading of each of the five
    // books of the Psalter ("Book 2, Psalms 42-72"), and Psalm 119's heading
    // for each of its 22 parts ("Aleph, The 1st Part.") -- none of them sung.
    if (/^1650\s+METRICAL/i.test(line) || /^\d+$/.test(line)) continue;
    if (/^Book\s+\d+,\s*Psalms?\s+\d+/i.test(line)) continue;
    if (psalm === 119 && /^\S+,\s*The\s+\S+\s+Part\.?$/i.test(line)) continue;
    // The publisher's note after Psalm 150 closes the book.
    if (/^This copy of the 1650 Psalter/i.test(line)) break;

    const version = line.match(VERSION_LINE);
    if (version) {
      startSetting(version[1], version[2]);
      continue;
    }
    if (!setting) startSetting(null, null);

    // Everything between the heading and the first verse is the psalm's
    // superscription ("To the chief Musician", "A Psalm of David"), which is
    // prose about the psalm rather than part of it. The body begins at verse
    // one -- the scan sometimes reads that "1" as a letter. Only there: later
    // in the psalm a line that opens with "I" is the pronoun ("I will confess
    // unto the Lord"), not a verse number.
    if (!inBody) {
      if (!/^[1IlJ][\s.]/.test(line)) continue;
      inBody = true;
      line = line.replace(/^[IlJ](?=[\s.])/, "1");
    }
    for (const fix of PRINTED_FIXES) {
      if (fix.psalm === psalm && line.includes(fix.find)) line = line.replace(fix.find, fix.replace);
    }
    // An apostrophe the scan could not read ("a potsherd dry?d").
    line = line.replace(/([a-z])\?([a-z])/g, "$1'$2");

    const count = versesIn(psalm);
    const tokens = line.split(/\s+/);
    // A displaced block runs until the setting's own numbering carries on.
    const opens = Number(tokens[0]);
    if (block && /^\d+$/.test(tokens[0]) && opens > setting.cursor.last && opens <= count) block = null;
    let read = readNumbers(tokens, block ? block.cursor : setting.cursor, count);
    if (read.backward != null) {
      block = { psalm, setting, verse: read.backward, cursor: { last: read.backward - 1 }, lines: [] };
      displaced.push(block);
      read = readNumbers(tokens, block.cursor, count);
    }

    // "burnt-off 'rings": the scan opens a gap before the apostrophe of an
    // elided word. Closed wherever the joined word is one the Brown text has.
    const joined = [];
    for (const token of read.tokens) {
      const before = joined.at(-1);
      const whole = `${before?.split("-").at(-1)}${token}`.toLowerCase().replace(/[^a-z']/g, "");
      if (before && /^'[a-z]/.test(token) && /[a-z]$/.test(before) && vocabulary.has(whole)) joined[joined.length - 1] += token;
      else joined.push(token);
    }

    const entry = {
      text: joined
        .map((word, index) => {
          // A printed line's first word has its capital, and so does the
          // word after a verse number that opens the line.
          const opensLine = index === 0 || (index === 1 && /^\d+$/.test(joined[0]));
          const mended = repairWord(word, vocabulary, english, opensLine);
          if (mended !== word) repaired++;
          return mended;
        })
        .join(" "),
    };
    setting.lines.push(entry);
    block?.lines.push(entry);
  }
  return { psalms, displaced, repaired };
}

// A printed line's words, for comparing with the Brown text: verse numbers
// dropped, and case and punctuation ignored.
const wordsOf = (text) =>
  text
    .split(/\s+/)
    .filter((t) => !/^\d+$/.test(t))
    .map((t) => t.toLowerCase().replace(/[^a-z]/g, ""))
    .filter(Boolean);
const startsWith = (words, prefix) => prefix.length > 0 && prefix.every((w, i) => words[i] === w);

// Puts each displaced block back where it belongs: into the setting -- its
// own, or the psalm before's -- that is missing that verse, and whose Brown
// text begins that verse with the block's words. The block goes in front of
// the printed line that begins with whatever the Brown text has next, which is
// either the rest of the same verse or the verse after it. A block that cannot
// be placed with that certainty stays where the scan put it, and is reported.
function relocate(printed, displaced, brown) {
  const unplaced = [];
  for (const block of displaced) {
    const text = block.lines.map((l) => l.text).join(" ");
    const words = wordsOf(text);
    let placed = false;
    for (const psalm of [block.psalm, block.psalm - 1]) {
      for (const [index, setting] of (printed.get(psalm) ?? []).entries()) {
        if (placed) break;
        const own = setting.lines.filter((l) => !block.lines.includes(l));
        if (own.some((l) => l.text.split(/\s+/).includes(String(block.verse)))) continue;
        const verses = brown.get(psalm)?.[index] ?? [];
        const at = verses.findIndex(([n]) => n === block.verse);
        if (at === -1) continue;
        const verseWords = wordsOf(verses[at][1]);
        if (!startsWith(verseWords, words.slice(0, 4))) continue;
        const rest = verseWords.slice(words.length);
        const next = (rest.length ? rest : wordsOf(verses[at + 1]?.[1] ?? "")).slice(0, 3);
        const before = own.findIndex((l) => startsWith(wordsOf(l.text), next));
        if (before === -1) continue;
        block.setting.lines = block.setting.lines.filter((l) => !block.lines.includes(l));
        setting.lines.splice(setting.lines.indexOf(own[before]), 0, ...block.lines);
        placed = true;
      }
    }
    if (!placed) unplaced.push(`Psalm ${block.psalm}: "${text.slice(0, 50)}"`);
  }
  return unplaced;
}

// Every word of the Authorised Version -- the English the psalter was made in,
// and a spelling check that neither scan's misreadings can have got into.
function kjvVocabulary(xml) {
  return new Set(xml.replace(/<[^>]+>/g, " ").toLowerCase().match(/[a-z]+/g));
}

const lettersOf = (word) => word.toLowerCase().replace(/[^a-z]/g, "");

function editDistance(a, b) {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    row = next;
  }
  return row[b.length];
}

// Whether a word of the psalter is English: an Authorised Version word, or one
// made from one the way the psalter makes its words -- an elision ("fill'st",
// "pow'r", "veh'mently"), a compound ("burnt-off'rings"), or a prefix
// ("uplifted").
function isEnglish(word, kjv) {
  const lower = word.toLowerCase().replace(/[^a-z'-]/g, "");
  if (!lower) return false;
  if (lower.includes("-")) return lower.split("-").every((part) => isEnglish(part, kjv));
  const forms = [
    lower,
    lower.split("'")[0],
    lower.replace(/'/g, "e"),
    lower.replace(/^(up|un)/, ""),
  ];
  return forms.some((form) => kjv.has(form.replace(/[^a-z]/g, "")));
}

// The printed edition's letters are the worse of the two ("shau" for shall,
// "jusdy" for justly, "Tlie" for The), and `repairWord` can only mend a word
// whose misreading is one of the usual confusions. Here the whole setting is
// laid against the Brown text of it: where the two agree on the words either
// side, and have the same number of words between, those words pair off one
// to one, and a printed word that is not English takes the Brown spelling if
// that is. A printed word that is English is kept, as the Brown scan has its
// own misreadings ("Tord" for Lord, "hll'st" for fill'st), and so is an
// elision the Brown text spells out ("sp'rit"), as the metre depends on it.
function mendAgainstBrown(setting, verses, kjv) {
  const lines = setting.lines.map((line) => line.text.split(" "));
  const ours = [];
  lines.forEach((tokens, li) =>
    tokens.forEach((token, ti) => {
      if (!/^\d+$/.test(token) && lettersOf(token)) ours.push({ li, ti, token });
    }),
  );
  const theirs = verses.flatMap(([, text]) => text.split(/\s+/)).filter((token) => lettersOf(token));
  const a = ours.map((w) => lettersOf(w.token));
  const b = theirs.map(lettersOf);

  // Longest common subsequence, walked from the front.
  const n = a.length;
  const m = b.length;
  const table = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  let mended = 0;
  const settle = (from, to, theirFrom, theirTo) => {
    if (to - from !== theirTo - theirFrom) return;
    for (let k = 0; k < to - from; k++) {
      const word = ours[from + k];
      const printed = word.token;
      const brownWord = theirs[theirFrom + k];
      const [, lead, core, trail] = printed.match(/^([^A-Za-z]*)(.*?)([^A-Za-z]*)$/);
      const brownCore = brownWord.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "");
      const p = lettersOf(core);
      const q = lettersOf(brownCore);
      if (p === q || isEnglish(core, kjv) || !isEnglish(brownCore, kjv)) continue;
      if (core.includes("'") && !brownCore.includes("'")) continue;
      if (editDistance(p, q) > Math.max(2, Math.ceil(Math.max(p.length, q.length) / 2))) continue;
      // The Brown word's own case, unless the printed word opens its line,
      // where this edition always sets a capital. A capital elsewhere in the
      // printed word is the misreading itself ("Hes" for lies), not a name.
      const opensLine = word.ti === 0 || (word.ti === 1 && /^\d+$/.test(lines[word.li][0]));
      const cased = opensLine ? brownCore[0].toUpperCase() + brownCore.slice(1) : brownCore;
      // A bracket in front of the word was a letter the scan misread ("]udah").
      lines[word.li][word.ti] = `${lead.replace(/[\]}|]/g, "")}${cased}${trail}`;
      mended++;
    }
  };
  let i = 0;
  let j = 0;
  let open = null;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      if (open) settle(open.i, i, open.j, j);
      open = null;
      i++;
      j++;
      continue;
    }
    open ??= { i, j };
    if (j >= m || (i < n && table[i + 1][j] >= table[i][j + 1])) i++;
    else j++;
  }
  if (open) settle(open.i, n, open.j, m);

  setting.lines.forEach((line, li) => (line.text = lines[li].join(" ")));
  return mended;
}

// ------------------------------------------------------------ corrections --

// Misreadings the rules above cannot mend, because the misread word is not
// near enough any English word to be guessed at, or the Brown text has no
// matching word to take. Each was checked against the printed page's other
// scan and the Authorised Version. A correction applies to the word's
// letters; the punctuation around it is kept.
const CORRECTIONS = [
  // Letters the printed scan read as others.
  { find: "Isr'eFs", replace: "Isr'el's" }, // Ps 68:34 -- "l'" read as "F"
  { find: "fme", replace: "fine" }, // Ps 19:10 -- "much fine gold"
  { find: "shding", replace: "sliding" }, // Ps 66:9 -- "li" read as "h"
  { find: "stuffd", replace: "stuff'd" }, // the apostrophe lost
  { find: "Naphtìi's", replace: "Napht'li's" }, // Ps 68:27
  // Letters the Brown scan read as others, in the settings sung from it.
  { find: "Tord", replace: "Lord" },
  { find: "Lrom", replace: "From" },
  { find: "gifits", replace: "gifts" },
  { find: "hll'd", replace: "fill'd" },
  // Two words the Brown scan ran together.
  { find: "thyjudgments", replace: "thy judgments" },
];

// English words none of the period Bibles happens to use, checked by hand.
const ACCEPTED = new Set(["confide"]); // Ps 18:2, "in whom I do confide"

// Lines the book itself sets off its metre, which both scans read alike. A
// feminine ending (see `feminine`) is recognised without being listed.
const BOOK_IRREGULAR = [
  { psalm: 29, text: "And in the beauty of holiness", why: "the book's own nine-syllable line; both scans agree" },
];

// Couplets whose inner break counting cannot find, given as the 1650 book
// breaks them. The printed edition sets each couplet on one line, so the
// break is always the count's to make, and in these the count finds another
// division that fills the metre as well or better. Each was checked against
// the 1650 printing (EEBO-TCP A76561) and the Free Church of Scotland text,
// which agree; with these four, the build breaks every couplet of the
// psalter as the Free Church text does.
const BOOK_BREAKS = [
  // "de-cay-ed is, / then do not thou forsake me", the feminine rhyme with
  // "overtake me" -- against "decayed is, then / do not thou forsake me",
  // which fills both lines exactly.
  { psalm: 71, text: "And when my strength decayed is, / then do not thou forsake me." },
  // "glo-rious name / to all e-ter-ni-ty" and "glo-ri-ous / name to all
  // e-t'r-ni-ty" each take one word short.
  { psalm: 72, text: "And blessed be his glorious name / to all eternity:" },
  // "con-fu-si-on / them, as a mantle, cover", the feminine rhyme with
  // "clothed over" -- against "confusion them, / as a mantle, cover".
  { psalm: 109, text: "And let their own confusion / them, as a mantle, cover." },
  // "chas-tis-ed sore, / but not to death giv'n over", the feminine rhyme
  // with "discover" -- against "chastised sore, but / not to death giv'n over".
  { psalm: 118, text: "The Lord hath me chastised sore, / but not to death giv'n over." },
];
const bookBreaksUsed = new Set();

// Marks the word each BOOK_BREAKS couplet breaks after, in a setting's
// words, wherever the couplet's words stand in that order.
function markBookBreaks(psalm, words) {
  const letters = words.map((w) => lettersOf(w.text));
  for (const entry of BOOK_BREAKS.filter((b) => b.psalm === psalm)) {
    const [head, tail] = entry.text.split(" / ").map((half) => half.split(/\s+/).map(lettersOf));
    const want = [...head, ...tail];
    for (let s = 0; s + want.length <= words.length; s++) {
      if (!want.every((w, k) => letters[s + k] === w)) continue;
      words[s + head.length - 1].bookBreak = true;
      bookBreaksUsed.add(entry);
    }
  }
  return words;
}

// Names the Authorised Version always capitalises. A scan sometimes loses
// the capital ("In judah's land"), and a name is never lower case.
function properNames(xml) {
  const seen = new Map();
  for (const word of xml.replace(/<[^>]+>/g, " ").match(/[A-Za-z]+/g)) {
    const key = word.toLowerCase();
    const entry = seen.get(key) ?? { upper: 0, lower: 0 };
    if (/^[A-Z][a-z]/.test(word)) entry.upper++;
    else if (/^[a-z]/.test(word)) entry.lower++;
    seen.set(key, entry);
  }
  return new Set([...seen].filter(([, e]) => e.upper >= 2 && e.lower === 0).map(([key]) => key));
}

// Applies the corrections and the capitals of names to one word, keeping its
// punctuation.
function correctWord(token, names) {
  const [, lead, core, trail] = token.match(/^([^A-Za-zÀ-ɏ']*)(.*?)([^A-Za-zÀ-ɏ']*)$/);
  let word = core;
  const fix = CORRECTIONS.find((c) => c.find === word);
  if (fix) word = fix.replace;
  // "judah's", "isr'el": a name, lower-cased by the scan.
  const base = keyOf(word).replace(/'s$|s'$/, "").replace(/'/g, "");
  const nameLike = names.has(base) || names.has(keyOf(word).replace(/'s$/, "").replace(/'([a-z])/, "a$1").replace(/'/g, ""));
  if (/^[a-z]/.test(word) && nameLike) word = word[0].toUpperCase() + word.slice(1);
  return lead + word + trail;
}

const correctLine = (text, names) =>
  text
    .split(" ")
    .map((token) => (/^\d+$/.test(token) ? token : correctWord(token, names)))
    .join(" ");

// ------------------------------------------------------------ the checker --

// Every word of the Authorised Version and two other Bibles of the period,
// the English the psalter was made in and a spelling check neither scan's
// misreadings can have got into.
function bibleVocabulary() {
  const words = new Set();
  for (const file of ["King James Version (1769).xml", "Geneva Bible (1599).xml", "Webster's Bible (1833).xml"]) {
    for (const w of readFileSync(join(BIBLES, file), "utf8").replace(/<[^>]+>/g, " ").toLowerCase().match(/[a-z]+/g)) words.add(w);
  }
  return words;
}

// Whether a word of the psalter is known: a Bible word, or one made from a
// Bible word the way the psalter makes its words -- an elision ("pow'r",
// "fill'st", "maintain'dst"), an ending ("purify'd", "encamps"), a compound
// ("burnt-off'rings"), a prefix ("uplifted") -- or a word both scans read
// alike, which two different misreadings are unlikely to have made.
function knownWord(word, bible, bothScans) {
  if (word.includes("-")) return word.split("-").every((part) => !part || knownWord(part, bible, bothScans));
  const lower = keyOf(word).replace(/'+$/g, "");
  if (!lower.replace(/'/g, "")) return true;
  if (bothScans.has(lower)) return true;
  // "'mong", "'bove", "'twas": a first syllable let go.
  if (lower.startsWith("'")) return ["a", "e", "i", "be", "it "].some((v) => knownWord(v.trim() + lower.slice(1), bible, bothScans)) || knownWord(lower.slice(1), bible, bothScans);
  const stems = new Set([lower]);
  const grow = (form) => {
    for (const s of [...stems]) {
      const next = form(s);
      if (next && next !== s) stems.add(next);
    }
  };
  grow((s) => s.replace(/('s|s')$/, "s").replace(/'s$/, ""));
  grow((s) => s.replace(/'s$/, ""));
  grow((s) => s.replace(/y'd$/, "ied"));
  grow((s) => s.replace(/'d$/, "ed"));
  grow((s) => s.replace(/'d(st)?$/, "e"));
  grow((s) => s.replace(/'d(st)?$/, ""));
  grow((s) => s.replace(/'st$/, "est"));
  grow((s) => s.replace(/'st$/, ""));
  grow((s) => s.replace(/'(n|rt|lt|t|ll)$/, ""));
  for (const v of "eaiou") grow((s) => s.replace(/(?<=.)'(?=.)/, v));
  grow((s) => s.replace(/'/g, ""));
  grow((s) => s.replace(/^(o'er|over|un|up|re|fore)(?=...)/, ""));
  grow((s) => s.replace(/(s|es|ed|d|eth|est|st|ing|ly|ness|er|ers)$/, ""));
  grow((s) => s.replace(/ies$/, "y"));
  grow((s) => s.replace(/(s|es|ed|d|eth|est|st|ing|ly|ness|er|ers)$/, "e"));
  return [...stems].some((s) => bible.has(s));
}

// ------------------------------------------------------------------ build --

const raw = JSON.parse(readFileSync(SRC, "utf8"));
const kjvXml = readFileSync(KJV, "utf8");
const names = properNames(kjvXml);

// The Brown text of every setting, cleaned: psalm number -> one verse list
// per setting, in the book's order.
const brown = new Map(
  raw.map((psalm) => [
    psalm.number,
    psalm.versions.map((version) => {
      const verses = version.verses.map(([num, text]) => {
        const fix = PROSE.find((p) => p.psalm === psalm.number && p.verse === num);
        if (fix) {
          const at = text.indexOf(fix.from ?? fix.before);
          if (at === -1) throw new Error(`repair anchor missing in psalm ${psalm.number}:${num}`);
          text = fix.from ? text.slice(0, at) : text.slice(at);
        }
        text = scrub(text);
        for (const r of REPEATED.filter((r) => r.psalm === psalm.number && r.verse === num)) {
          if (!text.includes(`${r.text} ${r.text}`)) throw new Error(`repeated text missing in psalm ${psalm.number}:${num}`);
          text = text.replace(`${r.text} ${r.text}`, r.text);
        }
        return [num, correctLine(text, names)];
      });
      return restoreMergedVerses(verses, versesIn(psalm.number));
    }),
  ]),
);

const vocabulary = brownVocabulary(raw);
const kjv = kjvVocabulary(kjvXml);
const english = (word) => vocabulary.has(word.toLowerCase()) || isEnglish(word, kjv);
const ocrText = readFileSync(OCR, "utf8");
const { psalms: printed, displaced, repaired } = parsePrinted(ocrText, vocabulary, english);
const unplaced = relocate(printed, displaced, brown);
for (const psalm of new Set(REPEATED.map((r) => r.psalm))) {
  const settings = printed.get(psalm) ?? [];
  const before = settings.reduce((n, s) => n + s.lines.length, 0);
  for (const setting of settings) dropRepeats(psalm, setting.lines);
  if (settings.reduce((n, s) => n + s.lines.length, 0) === before) throw new Error(`repeated lines not found in the printed psalm ${psalm}`);
}
let mendedAgainstBrown = 0;
for (const [number, settings] of printed) {
  settings.forEach((setting, index) => {
    const verses = brown.get(number)?.[index];
    if (verses) mendedAgainstBrown += mendAgainstBrown(setting, verses, kjv);
    for (const line of setting.lines) line.text = correctLine(line.text, names);
  });
}

// The words the checker accepts without a Bible behind them: those both
// scans read the same way.
const ocrWords = new Set(ocrText.toLowerCase().match(/[a-z']+/g));
const bothScans = new Set([...vocabulary].filter((w) => ocrWords.has(w)));
const bible = bibleVocabulary();

// A printed setting's words in order, each carrying the verse that starts on
// it and whether the book ends a printed line after it.
function printedWords(setting) {
  const words = [];
  for (const line of setting.lines) {
    const start = words.length;
    let verse = null;
    for (const token of line.text.split(/\s+/).filter(Boolean)) {
      if (/^\d{1,3}$/.test(token)) {
        verse = Number(token);
        continue;
      }
      words.push({ text: token, verse, printedBreak: false });
      verse = null;
    }
    if (words.length > start) words[words.length - 1].printedBreak = true;
  }
  return words;
}

const failures = [];
const misnumbered = [];
const report = [];
const out = [];

for (const psalm of raw) {
  const versions = [];
  const available = printed.get(psalm.number) ?? [];
  // The settings are the Brown text's, and any the printed edition has past
  // them. Brown's Psalm 6 has only the first version, in Long Metre; the
  // book has a second, in Common Metre ("Another of the same" in the 1650
  // printing), and so does the printed edition, which sings it alone.
  const onlyPrinted = available
    .slice(psalm.versions.length)
    .filter((s) => s.label && s.metre && s.lines.length)
    .map((s) => ({ label: `${s.label} Version (${s.metre.name})` }));

  for (const [versionIndex, version] of [...psalm.versions, ...onlyPrinted].entries()) {
    const metre = metreOf(version.label);
    const verses = brown.get(psalm.number)[versionIndex] ?? [];
    const id = `Psalm ${psalm.number}${version.label ? ` (${metre.name})` : ""}`;

    // The Brown text as one word stream, each word remembering the verse it
    // begins, so verse numbers can be shown where they fall -- which in
    // metrical psalmody is regularly mid-line.
    const brownWords = [];
    for (const [num, text] of verses) {
      text.split(/\s+/).filter(Boolean).forEach((w, idx) => brownWords.push({ text: w, verse: idx === 0 ? num : null }));
    }

    // Prefer the printed edition, which knows where its couplets end. The
    // settings are matched by position: a psalm printed in two versions has
    // them in the same order in both scans.
    let result = null;
    let usedPrinted = false;
    const source = available[versionIndex];
    if (source && source.metre?.name === metre.name && source.lines.length) {
      result = lineate(markBookBreaks(psalm.number, printedWords(source)), metre.pattern, metre.printed);
      usedPrinted = !result.error;
    }
    if (!usedPrinted) {
      result = lineate(brownWords, metre.pattern);
      if (result.error) failures.push(`${id}: ${result.error}`);
    }
    const lines = result.lines ?? null;

    // Lineation is what lets a stanza be sung -- one line per line of the
    // tune, so the words can sit under the notes.
    const stanzas = [];
    const offMetre = [];
    // Lines whose ends are not where the printed edition ends its lines.
    const unprinted = (result.unprinted ?? []).map(({ at, why }) => ({
      stanza: Math.floor(at / metre.pattern.length) + 1,
      line: (at % metre.pattern.length) + 1,
      text: lines[at].map((w) => w.text).join(" "),
      why,
    }));
    // Words the metre took at other than their usual length ("sal-va-ti-on",
    // "turn-ed", "glo-rious"), for reading the report against the book.
    const otherLengths = new Map();
    for (const w of lines?.flat() ?? []) {
      const usual = analyse(w.text).pieces.length;
      if (w.syllables === usual) continue;
      const key = `${keyOf(w.text).replace(/^'+|'+$/g, "")} ${usual}->${w.syllables}`;
      otherLengths.set(key, (otherLengths.get(key) ?? 0) + 1);
    }
    for (let i = 0; lines && i < lines.length; i += metre.pattern.length) {
      const group = lines.slice(i, i + metre.pattern.length);
      const number = stanzas.length + 1;
      stanzas.push({
        number,
        // A line is its text plus any verse numbers starting inside it, each
        // at the word index it falls on, and its words divided one piece to
        // a note so they can be set under the tune.
        lines: group.map((ws, li) => {
          const notes = notesOf(ws);
          if (result.off.includes(i + li) || notes.length !== metre.pattern[li]) {
            const text = ws.map((w) => w.text).join(" ");
            const long = notes.length === metre.pattern[li] + 1 && feminine(ws.at(-1).text, li);
            const own = BOOK_IRREGULAR.find((b) => b.psalm === psalm.number && b.text === text);
            offMetre.push({
              stanza: number,
              line: li + 1,
              text,
              syllables: notes.length,
              wants: metre.pattern[li],
              why: own ? own.why : long ? "feminine ending: one unstressed syllable past the metre, sung on the last note" : "unexplained",
            });
          }
          return {
            text: ws.map((w) => w.text).join(" "),
            marks: ws.flatMap((w, idx) => (w.verse == null ? [] : [{ verse: w.verse, word: idx }])),
            syllables: notes,
          };
        }),
      });
    }

    // A setting that is sung must number its verses as the psalm does: every
    // verse, once, in order. Anything else is a misread number, or a line out
    // of place, that the rules above did not catch.
    if (stanzas.length) {
      const seen = stanzas.flatMap((s) => s.lines.flatMap((l) => l.marks.map((m) => m.verse)));
      const count = versesIn(psalm.number);
      if (seen.length !== count || seen.some((n, i) => n !== i + 1)) {
        const present = new Set(seen);
        const missing = Array.from({ length: count }, (_, i) => i + 1).filter((n) => !present.has(n));
        const stray = seen.filter((n, i) => n > count || (i > 0 && n <= seen[i - 1]));
        const problems = [];
        if (missing.length) problems.push(`no verse ${missing.join(", ")}`);
        if (stray.length) problems.push(`out of order ${stray.join(", ")}`);
        misnumbered.push(`${id}${usedPrinted ? "" : " (Brown)"}: ${problems.join("; ")}`);
      }
    }

    // A setting sung from the printed edition reads, verse by verse, in the
    // words it is sung in, so what is read and what is sung never disagree --
    // and the Brown scan lost whole verses the printed one has (Psalm 32's
    // 8-11, Psalm 76's 10-12).
    const running = [];
    if (usedPrinted) {
      for (const word of lines.flat()) {
        if (word.verse != null) running.push([word.verse, []]);
        running.at(-1)?.[1].push(word.text);
      }
    }
    const readVerses = usedPrinted ? running.map(([num, words]) => [num, words.join(" ")]) : verses.map(([num, text]) => [num, text]);

    const texts = stanzas.length ? stanzas.flatMap((s) => s.lines.map((l) => l.text)) : readVerses.map(([, t]) => t);
    const unknown = new Set();
    const ruled = new Set();
    for (const token of texts.join(" ").split(/\s+/)) {
      const core = token.replace(/^[^A-Za-zÀ-ɏ']+|[^A-Za-zÀ-ɏ']+$/g, "");
      if (!core || /^\d+$/.test(core)) continue;
      if (ACCEPTED.has(core.toLowerCase())) continue;
      if (!knownWord(core, bible, bothScans) || /[a-z][A-Z]/.test(core) || /[^A-Za-z'-]/.test(core)) unknown.add(core);
      if (analyse(core).source === "rules") ruled.add(core);
    }
    report.push({
      psalm: psalm.number,
      setting: versionName(version.label),
      metre: metre.name,
      source: stanzas.length ? (usedPrinted ? "printed" : "brown") : "verses only",
      stanzas: stanzas.length,
      lines: stanzas.length * metre.pattern.length,
      offMetre,
      unprinted,
      unknownWords: [...unknown].sort(),
      countedByRule: [...ruled].sort(),
      otherLengths: [...otherLengths].map(([key, n]) => (n > 1 ? `${key} (x${n})` : key)).sort(),
    });

    versions.push({
      label: versionName(version.label),
      metre: metre.name,
      pattern: metre.pattern,
      stanzas: stanzas.length ? stanzas : null,
      printed: usedPrinted,
      verses: readVerses,
    });
  }
  out.push({ number: psalm.number, versions });
}

// A correction that no longer finds its words is out of date, not harmless.
const unusedBreaks = BOOK_BREAKS.filter((b) => !bookBreaksUsed.has(b));
if (unusedBreaks.length) throw new Error(`BOOK_BREAKS entries not found: ${unusedBreaks.map((b) => `Psalm ${b.psalm} "${b.text}"`).join("; ")}`);

writeFileSync(OUT, JSON.stringify(out, null, 1));

const settings = report.length;
const sung = report.filter((r) => r.stanzas).length;
const stanzaCount = report.reduce((n, r) => n + r.stanzas, 0);
const lineCount = report.reduce((n, r) => n + r.lines, 0);
const offLines = report.flatMap((r) => r.offMetre.map((o) => ({ psalm: r.psalm, setting: r.setting, ...o })));
const unknownWords = [...new Set(report.flatMap((r) => r.unknownWords))].sort();
const fromPrinted = report.filter((r) => r.source === "printed").length;

console.log(`wrote ${OUT}`);
console.log(`  ${settings} settings, ${sung} divided into ${stanzaCount} stanzas (${lineCount} lines)`);
console.log(
  `  ${fromPrinted} sung from the printed edition (${repaired} misread words mended against the other` +
    ` scan's vocabulary, ${mendedAgainstBrown} more against its text of the same setting)`,
);
const unexplained = offLines.filter((o) => o.why === "unexplained");
console.log(
  `  ${offLines.length} line(s) off their metre: ${offLines.length - unexplained.length} the book's own (feminine endings, Psalm 29:2),` +
    ` ${unexplained.length} unexplained`,
);
for (const o of unexplained) console.log(`    Psalm ${o.psalm}${o.setting ? ` ${o.setting}` : ""} s${o.stanza}.${o.line}: ${o.syllables}/${o.wants} "${o.text}"`);
console.log(`  ${unknownWords.length} word(s) not known to the checker${unknownWords.length ? `: ${unknownWords.join(" ")}` : ""}`);
if (failures.length) {
  console.log(`\n  ${failures.length} settings kept their verses but could not be lineated:`);
  console.log(failures.map((f) => `    ${f}`).join("\n"));
}
if (unplaced.length) {
  console.log(`\n  ${unplaced.length} block(s) of lines printed out of place could not be put back:`);
  console.log(unplaced.map((f) => `    ${f}`).join("\n"));
}
if (misnumbered.length) {
  console.log(`\n  ${misnumbered.length} sung setting(s) do not number their verses from 1 to the last:`);
  console.log(misnumbered.map((f) => `    ${f}`).join("\n"));
}
if (REPORT) {
  writeFileSync(
    REPORT,
    JSON.stringify(
      {
        summary: {
          settings,
          sung,
          stanzas: stanzaCount,
          lines: lineCount,
          fromPrinted,
          offMetreLines: offLines.length,
          offMetreUnexplained: unexplained.length,
          linesNotAtPrintedBreaks: report.reduce((n, r) => n + r.unprinted.length, 0),
          printedBreaksMoved: report.reduce((n, r) => n + r.unprinted.filter((u) => u.why !== "the scan wrapped a printed line here").length, 0),
          wordsAtOtherLengths: report.reduce((n, r) => n + r.otherLengths.length, 0),
          unknownWords: unknownWords.length,
          misnumbered,
          failures,
          unplaced,
        },
        offMetre: offLines,
        unknownWords,
        settings: report,
      },
      null,
      1,
    ),
  );
  console.log(`\n  report: ${REPORT}`);
}
