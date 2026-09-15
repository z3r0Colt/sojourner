// Builds reference/reading_plans/chronological_year.json: the whole Bible in
// chronological order in 365 days.
//
// The order is not invented here. It is Townsend's, taken whole from the two
// plans already built by tools/extract-townsend-chronological.mjs and
// tools/extract-townsend-nt.mjs -- his Old Testament arrangement of 1821 on
// John Lightfoot's chronicle, then his New Testament of 1826. All that is done
// here is pacing: his readings are grouped into 365 days of roughly equal
// length. Day boundaries are therefore arithmetic; everything inside them, and
// the whole order, is Townsend's.
//
// This exists because his own plans run 469 days and 388 -- two years and four
// months to read both -- which is a different undertaking from reading the
// Bible through in a year.
//
// A day closes at a chapter boundary rather than at one of Townsend's section
// boundaries. His sections run from a single verse to the whole of Proverbs,
// 915 verses and more than ten days' reading, so keeping every section whole
// would leave some days with one verse and others with a book. Splitting only
// ever happens between consecutive chapters of one reading, so the sequence
// itself is untouched -- which the tool checks at the end, verse by verse.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PLANS = join(ROOT, "reference", "reading_plans");
const BIBLE = join(ROOT, "bibles", "King James Version (1769).xml");

const DAYS = 365;

// --- verse counts from the bundled KJV ---------------------------------------
const verses = new Map();
{
  const xml = readFileSync(BIBLE, "utf8");
  const bookRe = /<BIBLEBOOK[^>]*bname="([^"]+)"[^>]*>([\s\S]*?)<\/BIBLEBOOK>/g;
  let b;
  while ((b = bookRe.exec(xml))) {
    const name = b[1] === "Psalm" ? "Psalms" : b[1];
    const chapRe = /<CHAPTER[^>]*cnumber="(\d+)"[^>]*>([\s\S]*?)<\/CHAPTER>/g;
    let c;
    while ((c = chapRe.exec(b[2]))) {
      verses.set(`${name}|${Number(c[1])}`, (c[2].match(/<VERS\b/g) || []).length);
    }
  }
}

// Townsend's own plans are build inputs, not plans the app ships: at 469 days
// and 388 they are the same order as this one at four times the length, so they
// live under sources/ and only this repacking of them is imported.
const load = (code) => JSON.parse(readFileSync(join(PLANS, "sources", `${code}.json`), "utf8"));
const source = [...load("townsend_ot").days, ...load("townsend_nt").days].flatMap((d) => d.readings);

/** One reading split into one unit per chapter, each carrying its verse count. */
function toChapters(r) {
  const out = [];
  for (let c = r.chapter_start; c <= r.chapter_end; c++) {
    const vmax = verses.get(`${r.book}|${c}`);
    if (!vmax) throw new Error(`no such chapter: ${r.book} ${c}`);
    const v1 = c === r.chapter_start && r.verse_start != null ? r.verse_start : null;
    const v2 = c === r.chapter_end && r.verse_end != null ? r.verse_end : null;
    out.push({
      book: r.book,
      chapter_start: c,
      verse_start: v1,
      chapter_end: c,
      verse_end: v2,
      weight: (v2 ?? vmax) - (v1 ?? 1) + 1,
    });
  }
  return out;
}

const units = source.flatMap(toChapters);
const total = units.reduce((n, u) => n + u.weight, 0);
console.log(`${source.length} readings -> ${units.length} chapter units, ${total} verses`);

/** "Psalm" in a label, "Psalms" as the book name, as the bundled plans have it. */
const labelBook = (name) => (name === "Psalms" ? "Psalm" : name);

function label(u) {
  const b = labelBook(u.book);
  const { chapter_start: c1, chapter_end: c2, verse_start: v1, verse_end: v2 } = u;
  if (v1 == null && v2 == null) return c1 === c2 ? `${b} ${c1}` : `${b} ${c1}-${c2}`;
  if (c1 === c2) {
    if (v1 == null) return `${b} ${c1}:1-${v2}`;
    if (v2 == null) return `${b} ${c1}:${v1}-${verses.get(`${u.book}|${c1}`)}`;
    return v2 === v1 ? `${b} ${c1}:${v1}` : `${b} ${c1}:${v1}-${v2}`;
  }
  return `${b} ${c1}:${v1 ?? 1}-${c2}:${v2}`;
}

/** Consecutive whole chapters of one book become one reading again. */
function joinRuns(list) {
  const out = [];
  for (const u of list) {
    const prev = out[out.length - 1];
    const whole = (x) => x.verse_start == null && x.verse_end == null;
    if (prev && prev.book === u.book && whole(prev) && whole(u) && u.chapter_start === prev.chapter_end + 1) {
      prev.chapter_end = u.chapter_end;
      continue;
    }
    out.push({ ...u });
  }
  return out;
}

// Pack into 365 days, closing a day once it has reached its share of the
// running total and always leaving at least one unit for every day that is
// still to come.
const days = [];
let cursor = 0;
let carried = 0;
for (let i = 0; i < DAYS; i++) {
  const boundary = Math.round((total * (i + 1)) / DAYS);
  const remainingDays = DAYS - i;
  const taken = [];
  do {
    carried += units[cursor].weight;
    taken.push(units[cursor]);
    cursor++;
  } while (cursor < units.length && carried < boundary && units.length - cursor >= remainingDays);
  if (i === DAYS - 1) {
    while (cursor < units.length) {
      carried += units[cursor].weight;
      taken.push(units[cursor]);
      cursor++;
    }
  }
  days.push({
    day: i + 1,
    readings: joinRuns(taken).map((u) => ({
      book: u.book,
      chapter_start: u.chapter_start,
      verse_start: u.verse_start,
      chapter_end: u.chapter_end,
      verse_end: u.verse_end,
      label: label(u),
    })),
  });
}

if (cursor !== units.length) throw new Error(`${units.length - cursor} units left over`);
if (days.some((d) => d.readings.length === 0)) throw new Error("a day has no readings");

// The packing must not lose, duplicate or reorder a verse.
const key = (list) =>
  list.map((u) => `${u.book} ${u.chapter_start}:${u.verse_start ?? "*"}-${u.chapter_end}:${u.verse_end ?? "*"}`).join("|");
if (key(units) !== key(days.flatMap((d) => d.readings.flatMap(toChapters)))) {
  throw new Error("the packed days are not Townsend's sequence");
}

const weights = days.map((d) => d.readings.flatMap(toChapters).reduce((n, u) => n + u.weight, 0)).sort((a, b) => a - b);
console.log(
  `verses a day: min ${weights[0]}, median ${weights[Math.floor(weights.length / 2)]}, max ${weights[weights.length - 1]}`
);

writeFileSync(
  join(PLANS, "chronological_year.json"),
  JSON.stringify(
    {
      code: "chronological_year",
      title: "Chronological in a Year",
      description:
        "The whole Bible in the order the events happened, read through in a year. The arrangement is George Townsend's — his Old Testament of 1821, built on the chronicle of John Lightfoot of the Westminster Assembly, then his New Testament of 1826 — so Job stands among the patriarchs, Chronicles is woven into Samuel and Kings, each prophet is read in the reign he preached in, the psalms sit beside the occasions that produced them, and the four Gospels are harmonised into one life of Christ. The days are this app's own division of his order into 365 roughly equal readings.",
      length_days: DAYS,
      days,
    },
    null,
    1
  ) + "\n"
);
console.log(`wrote chronological_year.json: ${DAYS} days, ${days.reduce((n, d) => n + d.readings.length, 0)} readings`);
