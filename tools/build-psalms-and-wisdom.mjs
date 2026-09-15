// Builds reference/reading_plans/psalms_wisdom.json: the Psalter and the
// wisdom books read side by side over 150 days.
//
// Unlike the Townsend and Westminster plans, this one reproduces no printed
// source. The shape is the app's own, and a plain one: a psalm a day, in order,
// so the Psalter takes exactly as many days as it has psalms, with the wisdom
// books running alongside in their own track -- Job first as the oldest of
// them, then Proverbs, Ecclesiastes and the Song. Ninety-three chapters spread
// across a hundred and fifty days means a wisdom chapter about two days in
// three; the other days are the psalm alone.
//
// Psalm 119 is left on its own day. At a hundred and seventy-six verses it is
// longer than some of the books beside it, and pairing a wisdom chapter with it
// would make one day of the plan twice the weight of any other.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BIBLE = join(ROOT, "bibles", "King James Version (1769).xml");
const OUT = join(ROOT, "reference", "reading_plans", "psalms_wisdom.json");

const DAYS = 150;
const WISDOM = [
  ["Job", 42],
  ["Proverbs", 31],
  ["Ecclesiastes", 12],
  ["Song of Solomon", 8],
];

// --- verse counts from the bundled KJV, to weigh the days --------------------
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

const reading = (book, chapter) => {
  if (!verses.get(`${book}|${chapter}`)) throw new Error(`no such chapter: ${book} ${chapter}`);
  return {
    book,
    chapter_start: chapter,
    verse_start: null,
    chapter_end: chapter,
    verse_end: null,
    label: `${book === "Psalms" ? "Psalm" : book} ${chapter}`,
  };
};

// The wisdom track, in order.
const wisdom = WISDOM.flatMap(([book, chapters]) =>
  Array.from({ length: chapters }, (_, i) => reading(book, i + 1))
);

// Spread them over the days, skipping the day Psalm 119 falls on.
const open = Array.from({ length: DAYS }, (_, i) => i + 1).filter((d) => d !== 119);
if (wisdom.length > open.length) throw new Error("more wisdom chapters than days to put them on");
const placement = new Map();
wisdom.forEach((r, i) => {
  const slot = open[Math.floor((i * open.length) / wisdom.length)];
  if (placement.has(slot)) throw new Error(`two wisdom chapters landed on day ${slot}`);
  placement.set(slot, r);
});

const days = Array.from({ length: DAYS }, (_, i) => {
  const day = i + 1;
  const readings = [reading("Psalms", day)];
  const w = placement.get(day);
  if (w) readings.push(w);
  return { day, readings };
});

// Every psalm once, every wisdom chapter once.
const seen = days.flatMap((d) => d.readings).map((r) => `${r.book} ${r.chapter_start}`);
if (new Set(seen).size !== seen.length) throw new Error("a chapter is read twice");
for (let p = 1; p <= 150; p++) if (!seen.includes(`Psalms ${p}`)) throw new Error(`Psalm ${p} unread`);
for (const [book, chapters] of WISDOM) {
  for (let c = 1; c <= chapters; c++) if (!seen.includes(`${book} ${c}`)) throw new Error(`${book} ${c} unread`);
}

const weights = days
  .map((d) => d.readings.reduce((n, r) => n + verses.get(`${r.book}|${r.chapter_start}`), 0))
  .sort((a, b) => a - b);
console.log(`verses a day: min ${weights[0]}, median ${weights[Math.floor(weights.length / 2)]}, max ${weights[weights.length - 1]}`);
console.log(`days with a wisdom reading: ${placement.size} of ${DAYS}`);

writeFileSync(
  OUT,
  JSON.stringify(
    {
      code: "psalms_wisdom",
      title: "Psalms and Wisdom",
      description:
        "A psalm a day straight through the Psalter, with the wisdom books running alongside in their own track — Job, then Proverbs, Ecclesiastes and the Song of Solomon — a chapter about two days in three. A hundred and fifty days, ending with the last psalm. Psalm 119 keeps its day to itself.",
      length_days: DAYS,
      days,
    },
    null,
    1
  ) + "\n"
);
console.log(`wrote psalms_wisdom.json: ${DAYS} days, ${days.reduce((n, d) => n + d.readings.length, 0)} readings`);
