// Builds reference/reading_plans/townsend_nt.json from the chronological
// arrangement of the New Testament published by the Rev. George Townsend,
// "The New Testament, arranged in historical and chronological order, in such a
// manner that the books, chapters, epistles, &c. may be read as one connected
// history, in the words of the authorized translation" -- London 1826;
// transcribed here from the Boston edition of 1837 (Perkins & Marvin),
// archive.org/details/newtestamentarra00townrich. Public domain.
//
// The companion to tools/extract-townsend-chronological.mjs, and the same kind
// of thing: the order is Townsend's, not this script's. The four Gospels are
// harmonised into one life of Christ, so a section names every Gospel that
// records the event and the day reads them together; the epistles stand at the
// point in the Acts where each was written, so Galatians falls at Thessalonica,
// 1 Corinthians at Ephesus, Romans at Corinth, and Hebrews and 2 Timothy in the
// Roman imprisonment at the end.
//
// The SECTIONS below are Townsend's sections in his order, each carrying his
// SCRIPTURE column, transcribed by eye from the page images of INDEX THE FIRST,
// pages *425-442, leaves n888-n905. Townsend numbers chapters in roman numerals
// ("Matt. iv. 12-17"); they are written in arabic here, which is a change of
// notation only. Eleven sections of Part XV -- St. Paul's last journeys, his
// martyrdom, the destruction of Jerusalem -- carry no Scripture column at all
// and so are not days.
//
// One reading of the printed text is emended, noted at the line, and one cell
// is repunctuated where Townsend's comma could be read as a verse; both are
// marked where they occur. As in the Old Testament volume, Townsend repeatedly
// splits a verse between two sections ("part of ver. 22", "last part ver. 20"),
// and each such mark resolves to the whole verse.
//
// Checked against the bundled KJV verse by verse: of the 7,957 verses of the
// New Testament this sequence reads 7,947. The ten it does not are gaps in
// Townsend's printed index itself -- Matthew 19. 2, Luke 11. 29-36, and
// Luke 22. 62 -- each confirmed against the volume's own OCR. Nothing is
// invented to fill them.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BIBLE = join(ROOT, "bibles", "King James Version (1769).xml");


const xml = readFileSync(BIBLE, "utf8");
const verses = new Map();
const chapters = new Map();
{
  const bookRe = /<BIBLEBOOK[^>]*bname="([^"]+)"[^>]*>([\s\S]*?)<\/BIBLEBOOK>/g;
  let b;
  while ((b = bookRe.exec(xml))) {
    const name = b[1] === "Psalm" ? "Psalms" : b[1];
    const chapRe = /<CHAPTER[^>]*cnumber="(\d+)"[^>]*>([\s\S]*?)<\/CHAPTER>/g;
    let c;
    let n = 0;
    while ((c = chapRe.exec(b[2]))) {
      const cn = Number(c[1]);
      n = Math.max(n, cn);
      verses.set(`${name}|${cn}`, (c[2].match(/<VERS\b/g) || []).length);
    }
    chapters.set(name, n);
  }
}

const NAME = { Matt: "Matthew", Mark: "Mark", Luke: "Luke", John: "John", Acts: "Acts" };
const WHOLE_BOOK = {
  "Epistle to the Galatians": "Galatians",
  "First Epistle to the Thessalonians": "1 Thessalonians",
  "Second Epistle to the Thessalonians": "2 Thessalonians",
  "Epistle to Titus": "Titus",
  "First Epistle to the Corinthians": "1 Corinthians",
  "Second Epistle to the Corinthians": "2 Corinthians",
  "First Epistle to Timothy": "1 Timothy",
  "Epistle to the Romans": "Romans",
  "The Epistle to the Ephesians": "Ephesians",
  "The Epistle to the Philippians": "Philippians",
  "The Epistle to the Colossians": "Colossians",
  "The Epistle to Philemon": "Philemon",
  "The general Epistle of St. James": "James",
  "The Epistle to the Hebrews": "Hebrews",
  "The Second Epistle to Timothy": "2 Timothy",
  "The First Epistle general of St. Peter": "1 Peter",
  "The Second Epistle general of St. Peter": "2 Peter",
  "The general Epistle of Jude": "Jude",
  "The Book of Revelation": "Revelation",
  "The First Epistle of John": "1 John",
  "The Second Epistle of John": "2 John",
  "The Third Epistle of John": "3 John",
};
const BOOK_KEYS = Object.keys(NAME).sort((a, b) => b.length - a.length);

const problems = [];
let current = null;

function bookOf(item) {
  for (const key of BOOK_KEYS) {
    const re = new RegExp(`^${key}\\.?\\s+`);
    if (re.test(item)) return [NAME[key], item.replace(re, "")];
  }
  return [null, item];
}

/** Townsend's part-verse marks resolve to the whole verse; see the OT tool. */
function normalize(spec) {
  return spec
    .replace(/\b(?:the\s+)?(?:latter|last|first|beginning|middle|end)\s+(?:part\s+)?(?:of\s+)?(?:ver\.|v\.)?\s*(\d+)/gi, "$1")
    .replace(/\b(?:part|pt)\.?\s+(?:of\s+)?(?:ver\.|v\.)?\s*(\d+)/gi, "$1")
    .replace(/\bver\.\s*(\d+)/gi, "$1")
    .replace(/\bv\.\s*(\d+)/gi, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSection(section, index) {
  if (WHOLE_BOOK[section]) {
    const book = WHOLE_BOOK[section];
    return [{ book, c1: 1, v1: null, c2: chapters.get(book), v2: null }];
  }
  const out = [];
  current = null;
  for (const raw of section.split(";")) {
    let item = raw.trim().replace(/^and\s+/i, "");
    if (!item) continue;
    const whole = Object.keys(WHOLE_BOOK).find((k) => item === k);
    if (whole) {
      const book = WHOLE_BOOK[whole];
      out.push({ book, c1: 1, v1: null, c2: chapters.get(book), v2: null });
      current = book;
      continue;
    }
    const [book, rest] = bookOf(item);
    if (book) current = book;
    if (!current) {
      problems.push({ index, section, why: `no book in scope for "${item}"` });
      continue;
    }
    out.push(...parseSpec(rest, current, { index, section, item }));
  }
  return out;
}

function parseSpec(spec, book, ctx) {
  spec = normalize(spec).replace(/^and\s+/i, "").replace(/\.$/, "");

  let m = /^(\d+)$/.exec(spec);
  if (m) return [{ book, c1: Number(m[1]), v1: null, c2: Number(m[1]), v2: null }];

  m = /^(\d+)\.?\s*to\s*(\d+)$/i.exec(spec);
  if (m) return [{ book, c1: Number(m[1]), v1: null, c2: Number(m[2]), v2: null }];

  m = /^(\d+)\.\s*(.+)$/.exec(spec);
  if (m) {
    const chapter = Number(m[1]);
    const rest = m[2];
    const split = /,?\s*(?:and\s+)?(\d+)\.\s+(?=\d|to\s|and\s+\d)/.exec(rest);
    if (split) {
      const head = rest.slice(0, split.index);
      const tail = rest.slice(split.index).replace(/^,?\s*(?:and\s+)?/, "");
      return [...parseVerses(head, book, chapter, ctx), ...parseSpec(tail, book, ctx)];
    }
    return parseVerses(rest, book, chapter, ctx);
  }

  problems.push({ ...ctx, why: `unparsed spec "${spec}"` });
  return [];
}

function parseVerses(spec, book, chapter, ctx) {
  const last = verses.get(`${book}|${chapter}`);
  if (!last) {
    problems.push({ ...ctx, why: `no such chapter ${book} ${chapter}` });
    return [];
  }
  const out = [];
  const groups = normalize(spec).split(/,|\band\b|&/).map((s) => s.trim()).filter(Boolean);
  let pending = null;
  for (const g of groups) {
    // "to end", "to the end", a bare "end", or "to 16".
    const upto = /^(?:to\s+(?:the\s+)?)?(end|\d+)$/i.exec(g);
    if (upto && (/^to/i.test(g) || /^end$/i.test(g))) {
      if (pending == null) {
        problems.push({ ...ctx, why: `"${g}" with no start in "${spec}"` });
        return out;
      }
      out[out.length - 1].v2 = /^end$/i.test(upto[1]) ? last : Number(upto[1]);
      pending = null;
      continue;
    }
    // "14 to 16" -- a verse range written with "to".
    let mm = /^(\d+)\s+to\s+(\d+)$/i.exec(g);
    if (mm) {
      out.push({ book, c1: chapter, v1: Number(mm[1]), c2: chapter, v2: Number(mm[2]) });
      pending = null;
      continue;
    }
    mm = /^(\d+)-(\d+)$/.exec(g);
    if (mm) {
      out.push({ book, c1: chapter, v1: Number(mm[1]), c2: chapter, v2: Number(mm[2]) });
      pending = null;
      continue;
    }
    mm = /^(\d+)$/.exec(g);
    if (mm) {
      const v = Number(mm[1]);
      if (v > last) {
        problems.push({ ...ctx, why: `"${g}" is not a verse of ${book} ${chapter} (${last} verses)` });
        return out;
      }
      out.push({ book, c1: chapter, v1: v, c2: chapter, v2: v });
      pending = v;
      continue;
    }
    problems.push({ ...ctx, why: `unparsed verse group "${g}" in "${spec}"` });
    return out;
  }
  return out;
}


const NT_SECTIONS = [
  // ---- page *425 (n888) ----
  // PART I. From the Birth of Christ to the Temptation.
  "Mark 1. 1; Luke 1. 1-4",
  "John 1. 1-18",
  "Luke 1. 5-25",
  "Luke 1. 26-38",
  "Luke 1. 39-56",
  "Luke 1. 57, to end",
  "Matt. 1. 18-25",
  "Luke 2. 1-7",
  "Matt. 1. 1-17; Luke 3. 23, to the end",
  "Luke 2. 8-20",
  "Luke 2. 21",
  "Luke 2. 22-39",
  "Matt. 2. 1-12",
  "Matt. 2. 13-15",
  "Matt. 2. 16-18",
  "Matt. 2. 19, to end; Luke 2. 40",
  "Luke 2. 41, to end",
  "Matt. 3. 1-12; Mark 1. 2-8; Luke 3. 1-18",
  "Matt. 3. 13, to end; Mark 1. 9-11; Luke 3. 21, 22, and part of 23",
  "Matt. 4. 1-11; Mark 1. 12, 13; Luke 4. 1-13",
  // PART II. From the Temptation to the Commencement of his more public Ministry.
  "John 1. 19-34",
  "John 1. 35, to the end",
  "John 2. 1-11",
  "John 2. 12",
  "John 2. 13, to the end",
  "John 3. 1-21",
  "John 3. 22, to end",
  "Matt. 14. 3-5; Mark 6. 17-20; Luke 3. 19, 20",
  // ---- page *426 (n889) ----
  // PART III. From the Commencement of the more public Ministry to the Mission
  // of the twelve Apostles.
  "Matt. 4. 12-17; Mark 1. 14, 15; Luke 4. 14, 15",
  "John 4. 1-42",
  "John 4. 43, to end",
  "Luke 4. 16-30",
  "Luke 4. 31, 32",
  "Matt. 4. 18-22; Mark 1. 16-20; Luke 5. 1-11",
  "Mark 1. 21-28; Luke 4. 33-37",
  "Matt. 8. 14, 15; Mark 1. 29-31; Luke 4. 38, 39",
  "Matt. 4. 23-25; 8. 16, 17; Mark 1. 32-39; Luke 4. 40, to end",
  "Matt. 8. 2-4; Mark 1. 40, to end; Luke 5. 12-16",
  "Matt. 9. 2-8; Mark 2. 1-12; Luke 5. 17-26",
  "Matt. 9. 9; Mark 2. 13, 14; Luke 5. 27, 28",
  "John 5. 1-15",
  "John 5. 16, to end",
  "Matt. 12. 1-8; Mark 2. 23, to end; Luke 6. 1-5",
  "Matt. 12. 9-14; Mark 3. 1-6; Luke 6. 6-11",
  "Matt. 12. 15-21; Mark 3. 7-12",
  "Mark 3. 13-19; Luke 6. 12-19",
  "Matt. 5; 6; 7; and 8. 1; Luke 6. 20, to end",
  "Matt. 8. 5-13; Luke 7. 1-10",
  "Luke 7. 11-18",
  "Matt. 11. 2-6; Luke 7. 19-23",
  "Matt. 11. 7-15; Luke 7. 24-30",
  "Matt. 11. 16-24; Luke 7. 31-35",
  "Matt. 11. 25, to end",
  "Luke 7. 36, to the end",
  "Luke 8. 1-3",
  "Matt. 12. 22-45; Mark 3. 19-30; Luke 11. 14-28",
  "Matt. 12. 46, to the end; Mark 3. 31, to end; Luke 8. 19-21",
  // ---- page *427 (n890) ----
  "Matt. 13. 1-9; Mark 4. 1-9; Luke 8. 4-8",
  "Matt. 13. 10-17; Mark 4. 10-12; Luke 8. 9, 10",
  "Matt. 13. 18-23; Mark 4. 13-23; Luke 8. part of ver. 9, and 11-17",
  "Mark 4. 24, 25; Luke 8. 18",
  "Matt. 13. 24-53; Mark 4. 26-34",
  "Matt. 8. 18-27; Mark 4. 35, to end; Luke 8. 22-25",
  "Matt. 8. 28, to end; Mark 5. 1-20; Luke 8. 26-40",
  "Matt. 9. 10-17; Mark 2. 15-22; Luke 5. 29, to end",
  "Matt. 9. 1, 18-26; Mark 5. 21, to end; Luke 8. 40, to the end",
  "Matt. 9. 27-31",
  "Matt. 9. 32-34",
  "Matt. 13. 54, to the end; Mark 6. 1-6",
  "Matt. 9. 35, to the end",
  // PART IV. From the Mission of the Twelve Apostles to the Mission of the Seventy.
  "Matt. 10; and 11. 1; Mark 6. 7-13; Luke 9. 1-6",
  "Matt. 14. 1-12; Mark 6. 14-29; Luke 9. 7-9",
  "Matt. 14. 13, 14; Mark 6. 30-34; Luke 9. 10, 11; John 6. 1, 2",
  "Matt. 14. 15-21; Mark 6. 35-44; Luke 9. 12-17; John 6. 3-14",
  "Matt. 14. 22, 23; Mark 6. 45, 46; John 6. 15",
  "Matt. 14. 24-33; Mark 6. 47-52; John 6. 16-21",
  "Matt. 14. 34-36; Mark 6. 53, to end",
  "John 6. 22, to the end, and 7. 1",
  "Matt. 15. 1-20; Mark 7. 1-23",
  "Matt. 15. 21-28; Mark 7. 24-30",
  "Matt. 15. 29-31; Mark 7. 31, to the end",
  // ---- page *428 (n891) ----
  "Matt. 15. 32, to the end; Mark 8. 1-10",
  "Matt. 16. 1-12; Mark 8. 11-21",
  "Mark 8. 22-26",
  "Matt. 16. 13-20; Mark 8. 27-30; Luke 9. 18-21",
  "Matt. 16. 21, to the end; Mark 8. 31, to end, and 9. 1; Luke 9. 22-27",
  "Matt. 17. 1-13; Mark 9. 2-13; Luke 9. 28-36",
  "Matt. 17. 14-21; Mark 9. 14-29; Luke 9. 37-42, and part of 43",
  "Matt. 17. 22, 23; Mark 9. 30-32, and part of 33; Luke 9. 43-46",
  "Matt. 17. 24, to the end",
  "Matt. 18. 1, to the end; Mark 9. part of 33, to the end; Luke 9. 47-50",
  // PART V. From the Mission of the Seventy Disciples to the triumphal Entry.
  "Luke 10. 1-16",
  "Matt. 19. 1; Mark 10. 1; John 7. 2-10",
  "John 7. 11-52",
  "John 7. 53, and 8. 1-11",
  "John 8. 12-20",
  "John 8. 21, to the end",
  "Luke 10. 17-24",
  "Luke 10. 25-28",
  "Luke 10. 29-37",
  "Luke 10. 38, to end",
  "Luke 11. 1-13",
  "Luke 11. 37, to the end",
  "Luke 12. 1-12",
  "Luke 12. 13, 14",
  "Luke 12. 15-34",
  "Luke 12. 35, to the end, and 13. 1-9",
  "Luke 13. 10-17",
  "Luke 13. 22, and 18-21",
  // ---- page *429 (n892) ----
  "John 9. 1-34",
  "John 9. 35, to the end, and 10. 1-21",
  "John 10. 22-38",
  "John 10. 39, to the end",
  "Luke 13. 23, to the end",
  "Luke 14. 1-24",
  "Luke 14. 25, to the end",
  "Luke 15. 1-10",
  "Luke 15. 11, to the end",
  "Luke 16. 1-13",
  "Luke 16. 14-17",
  "Matt. 19. 3-12; Mark 10. 2-12; Luke 16. 18",
  "Matt. 19. 13-15; Mark 10. 13-17; Luke 18. 15-17",
  "Luke 16. 19, to the end",
  "Luke 17. 1-10",
  "Luke 9. 51, to the end, and 17. 11",
  "Luke 17. 12-19",
  "Luke 17. 20, to the end",
  "Luke 18. 1-8",
  "Luke 18. 9-14",
  "Matt. 19. 16-29; Mark 10. 17-30; Luke 18. 18-30",
  "Matt. 19. 30, and 20. 1-16; Mark 10. 31",
  "John 11. 1-16",
  "Matt. 20. 17-19; Mark 10. 32-34; Luke 18. 31-34",
  "Matt. 20. 20-28; Mark 10. 35-45",
  "Matt. 20. 29, to the end; Mark 10. 46, to the end; Luke 18. 35, to the end",
  "Luke 19. 1-28",
  "John 11. 17-46",
  "John 11. 47, 48",
  "John 11. 49-52",
  "John 11. 53",
  "John 11. 54",
  "John 11. 55, to the end",
  "Matt. 26. 6-13; Mark 14. 3-9; John 12. 1-11",
  "Matt. 21. 1-7; Mark 11. 1-7; Luke 19. 29-35; John 12. 12-18",
  // ---- page *430 (n893) ----
  // PART VI. From Christ's triumphant Entry into Jerusalem, to his Apprehension.
  "Matt. 21. 8, 9; Mark 11. 8-10; Luke 19. 36-40; John 12. 19",
  "Luke 19. 41-44",
  "Matt. 21. 10-13; Mark 11. part of ver. 11; Luke 19. 45, 46",
  "Matt. 21. 14-16",
  "John 12. 20-43",
  "John 12. 44, to the end",
  "Matt. 21. 17; Mark 11. part of ver. 11",
  "Matt. 21. 18, 19; Mark 11. 12-14",
  "Mark 11. 15-17",
  "Mark 11. 18; Luke 19. 47, 48",
  "Mark 11. 19",
  "Matt. 21. 20-22; Mark 11. 20-26",
  // Printed "Luke xix. 1-19"; the section is Christ answering the chief priests
  // with the parables of the vineyard and the marriage feast, whose Lucan
  // parallel is Luke 20. 1-19. Luke 19. 1-19 is already read entire under
  // Zacchaeus and the pounds, and Luke 20. 1-19 is otherwise never read, so the
  // roman numeral has lost an x. Emended to chapter 20.
  "Matt. 21. 23, to the end, and 22. 1-14; Mark 11. 27, to end, and 12. 1-12; Luke 20. 1-19",
  "Matt. 22. 15-22; Mark 12. 13-17; Luke 20. 20-26",
  "Matt. 22. 23-33; Mark 12. 18-27; Luke 20. 27-40",
  "Matt. 22. 34-40; Mark 12. 28-35",
  "Matt. 22. 41, to the end; Mark 12. 35-37; Luke 20. 41-44",
  "Matt. 23. 1, to the end; Mark 12. 38-40; Luke 20. 45, to the end",
  "Mark 12. 41, to the end; Luke 21. 1-4",
  "Matt. 24. 1-35; Mark 13. 1-31; Luke 21. 5-33",
  "Matt. 24. 36, to the end; Mark 13. 32, to the end; Luke 21. 34-36",
  "Matt. 25. 1-13",
  "Matt. 25. 14-30",
  // ---- page *431 (n894) ----
  "Matt. 25. 31, to the end",
  "Luke 21. 37, 38",
  "Matt. 26. 1, 2; Mark 14. part of ver. 1",
  "Matt. 26. 3-5; Mark 14. part of ver. 1, ver. 2; Luke 22. 1, 2",
  "Matt. 26. 14-16; Mark 14. 10, 11; Luke 22. 3-6",
  "Matt. 26. 17-19; Mark 14. 12-16; Luke 22. 7-13",
  "Matt. 26. 20; Mark 14. 17; Luke 22. 14-18; John 13. 1",
  "Luke 22. 24-27; John 13. 2-16",
  "Matt. 26. 21-25; Mark 14. 18-21; Luke 22. 21-23; John 13. 17-30",
  "Luke 22. 28-38; John 13. 31, to the end",
  "Matt. 26. 26-29; Mark 14. 22-25; Luke 22. 19, 20",
  "John 14",
  "Matt. 26. 30; Mark 14. 26; Luke 22. 39",
  "John 15. 1-8",
  "John 15. 9, to end, and 16. 1-4",
  "John 16. 5, to the end",
  "John 17",
  "Matt. 26. 31-35; Mark 14. 27-31",
  "Matt. 26. 36-46; Mark 14. 32-42; Luke 22. 40-46; John 18. 1, 2",
  "Matt. 26. 47-56; Mark 14. 43-50; Luke 22. 47-53; John 18. 3-11",
  // PART VII. From the Apprehension of Christ to the Crucifixion.
  "Matt. 26. 57; Mark 14. 51-53; Luke 22. 54; John 18. 12-14",
  "Matt. 26. 58; Mark 14. 54; Luke 22. 55; John 18. 15, 16",
  "Matt. 26. 59-66; Mark 14. 55-64; John 18. 19-24",
  "Matt. 26. 67, 68; Mark 14. 65; Luke 22. 63-65",
  // ---- page *432 (n895) ----
  "Matt. 26. 69, 70; Mark 14. 66-68; Luke 22. 56, 57; John 18. 17, 18, 25-27",
  "Matt. 26. 71, 72; Mark 14. 69, part of 70; Luke 22. 58",
  "Matt. 26. 73, to the end; Mark 14. part of 70, to end; Luke 22. 59-61",
  "Matt. 27. 1; Mark 15. part of ver. 1; Luke 22. 66, to the end",
  "Matt. 27. 3-10",
  "Matt. 27. 2, and 11-14; Mark 15. 1-5; Luke 23. 1-4; John 18. 28-38",
  "Luke 23. 5-12",
  "Matt. 27. 15-20; Mark 15. 6-11; Luke 23. 13-19; John 18. 39",
  "Matt. 27. 21-23; Mark 15. 12-14; Luke 23. 20-23; John 18. 40",
  "Matt. 27. 24, 25",
  "Matt. 27. 26-30; Mark 15. 15-19; Luke 23. 24, 25; John 19. 1-16",
  "Matt. 27. 31, 32; Mark 15. 20, 21; Luke 23. 26-32; John 19. part of v. 16, and v. 17",
  "Matt. 27. 33, 34, 37, 38; Mark 15. 22, 23, 26, 27, 28; Luke 23. 33-38; John 19. 18-22",
  "Luke 23. part of ver. 34",
  "Matt. 27. 35, 36; Mark 15. 24, 25; Luke 23. part of ver. 34; John 19. 23, 24",
  "Matt. 27. 39-44; Mark 15. 29-32; Luke 23. 35-37",
  "Luke 23. 39-43",
  "John 19. 25-27",
  "Matt. 27. 45-51, 54-56; Mark 15. 33-41; Luke 23. 44-49; John 19. 28-37",
  // ---- page *433 (n896) ----
  // PART VIII. From the Death of Christ till his Ascension into Heaven.
  "Matt. 27. 57-60; Mark 15. 42-46; Luke 23. 50-54; John 19. 38, to the end",
  "Mark 15. 47; Luke 23. 55",
  "Luke 23. 56",
  "Matt. 27. 61",
  "Matt. 27. 62, to the end",
  "Mark 16. 1",
  "Matt. 28. 1; Mark 16. part of ver. 2; John 20. part of v. 1",
  "Matt. 28. 2-4",
  "Matt. 27. part of v. 52, and v. 53",
  "Mark 16. part of v. 2, and v. 3, 4; John 20. part of v. 1",
  "John 20. 2",
  "Matt. 28. 5-7; Mark 16. 5-7",
  "Matt. 28. 8; Mark 16. 8",
  "John 20. 3-10",
  "John 20. part of ver. 11",
  "John 20. part of v. 11, 12, 13, and part of 14",
  "Mark 16. 9; John 20. part of v. 14, and 15-17",
  "Matt. 28. 9, 10; John 20. 18",
  "Matt. 28. 11-15",
  "Luke 24. 1-3",
  // ---- page *434 (n897) ----
  "Luke 24. 4-9",
  "Mark 16. 10; Luke 24. 10",
  "Mark 16. 11; Luke 24. 11",
  "Luke 24. part of 12",
  "Luke 24. part of 12",
  "Mark 16. 12; Luke 24. 13-32",
  "Mark 16. 13; Luke 24. 33-35",
  "Luke 24. 36-43; John 20. 19-23",
  "John 20. 24, 25",
  "Mark 16. 14; John 20. 26-29",
  "Matt. 28. 16, 17, and part of 18",
  "John 21. 1-24",
  "Luke 24. 44-49; Acts 1. 4, 5",
  "Matt. 28. part of 18-20; Mark 16. 15, end; Luke 24. 50, end; Acts 1. 6-12",
  "John 20. 30, 31, and 21. 25",
  // PART IX. From the Ascension of Christ to the Termination of the Period in
  // which the Gospel was preached to the Jews only.
  "Acts 1. 1-3, and ver. 12-14",
  "Acts 1. 15, to the end",
  "Acts 2. 1-13",
  "Acts 2. 14-36",
  "Acts 2. 37-42",
  "Acts 2. 43, to the end",
  "Acts 3. 1-10",
  "Acts 3. 11, to end",
  "Acts 4. 1-7",
  "Acts 4. 8-22",
  "Acts 4. 23-31",
  "Acts 4. 32, to the end",
  "Acts 5. 1-10",
  "Acts 5. 11-16",
  "Acts 5. 17-20, part of ver. 21",
  "Acts 5. part of 21, 22-33",
  // ---- page *435 (n898) ----
  "Acts 5. 34, to the end",
  "Acts 6. 1-6",
  "Acts 6. 7",
  "Acts 6. 8-14",
  "Acts 6. 15, and 7. 1-50",
  "Acts 7. 51-53",
  "Acts 7. 54, to the end, and 8. part of ver. 1, and ver. 2",
  "Acts 8. part of ver. 1, and ver. 3",
  "Acts 8. 5-13",
  "Acts 8. 14-17",
  "Acts 8. 18-24",
  "Acts 8. 25",
  "Acts 8. 26, to the end",
  "Acts 8. 4",
  "Acts 9. 1-9",
  "Acts 9. 10-19",
  "Acts 9. 19-30",
  "Acts 9. 32, to the end",
  "Acts 9. 31",
  // PART X. The Conversion of the devout Gentiles, or Proselytes of the Gate.
  "Acts 10. 1-16",
  "Acts 10. 17-33",
  "Acts 10. 34-43",
  "Acts 10. 44, to the end",
  "Acts 11. 1-18",
  // ---- page *436 (n899) ----
  "Acts 11. 19-21",
  "Acts 11. 22-24",
  "Acts 11. 25, 26",
  "Acts 12. 1-18, and part of ver. 19",
  "Acts 11. 27, to the end",
  "Acts 12. part of ver. 19, and 20-23",
  "Acts 12. 24",
  "Acts 12. 25",
  // PART XI. St. Paul's First Apostolical Journey.
  "Acts 13. 1-3",
  "Acts 13. part of ver. 4",
  "Acts 13. part of ver. 4-12",
  "Acts 13. 13",
  "Acts 13. 14-50",
  "Acts 13. 51, 52, and 14. 1-5, and part of ver. 6",
  "Acts 14. 8-19, and part ver. 20",
  "Acts 14. last part ver. 20, part ver. 6, and ver. 7",
  "Acts 14. 21-23",
  "Acts 14. 24, 25",
  "Acts 14. 26, to the end",
  "Acts 15. 1, 2",
  // ---- page *437 (n900) ----
  "Acts 15. 3-29",
  "Acts 15. 30-35",
  // PART XII. St. Paul's Second Apostolical Journey.
  "Acts 15. 36",
  "Acts 15. 37, to the end, and 16. 4, 5",
  "Acts 16. 1-3",
  "Acts 16. 6",
  "Acts 16. 7-10",
  "Acts 16. part of 11",
  "Acts 16. part of 11",
  "Acts 16. 12, to the end",
  "Acts 17. 1-9",
  "Epistle to the Galatians",
  "Acts 17. 10-14",
  "Acts 17. 15, to the end",
  "Acts 18. 1-5",
  "First Epistle to the Thessalonians",
  "Acts 18. 6-11",
  "Second Epistle to the Thessalonians",
  "Acts 18. 12-17, and part of ver. 18",
  "Epistle to Titus",
  // ---- page *438 (n901) ----
  "Acts 18. part of ver. 18",
  "Acts 18. 19",
  "Acts 18. 20-22",
  // PART XIII. The Third Apostolical Journey of St. Paul.
  "Acts 18. 23",
  "Acts 18. 24, to the end",
  "Acts 19. 1-10",
  "Acts 19. 11-20",
  "Acts 19. 21, part of ver. 22",
  "First Epistle to the Corinthians",
  "Acts 19. part of ver. 22, to end",
  "Acts 20. 1",
  "First Epistle to Timothy",
  "Acts 20. 2, and part of ver. 3",
  "Second Epistle to the Corinthians",
  "Acts 20. part ver. 3, ver. 4, 5",
  "Epistle to the Romans",
  "Acts 20. 6-12",
  "Acts 20. 13, 14",
  // ---- page *439 (n902) ----
  "Acts 20. part of 15",
  "Acts 20. part of 15",
  "Acts 20. part of 15, to end",
  "Acts 21. 1-3",
  "Acts 21. 4-6",
  "Acts 21. 7",
  "Acts 21. 8-14",
  "Acts 21. 15-26",
  "Acts 21. 27-36",
  "Acts 21. 37, to end, and 22. 1-21",
  "Acts 22. 22",
  "Acts 22. 23-29",
  "Acts 22. 30, and 23. 1-10",
  "Acts 23. 11",
  "Acts 23. 12, to the end",
  "Acts 24. 1-21",
  "Acts 24. 22, to the end",
  "Acts 25. 1-12",
  "Acts 25. 13-22",
  // Printed "Acts xxv. 23, to end, and xxvi." -- the "26" is chapter 26, not a
  // verse of chapter 25; written with a semicolon here so it cannot be read as
  // one, since Acts 25 does have a verse 26.
  "Acts 25. 23, to end; 26",
  "Acts 27. 1",
  // PART XIV. The Fourth Journey of St. Paul.
  "Acts 27. 2",
  "Acts 27. 3, 4",
  "Acts 27. 5-8",
  // ---- page *440 (n903) ----
  "Acts 27. 9-13",
  "Acts 27. 14, to the end",
  "Acts 28. 1-10",
  "Acts 28. 11, to part of ver. 14",
  "Acts 28. part of v. 14 to 16",
  "Acts 28. 17-29",
  "The Epistle to the Ephesians",
  "The Epistle to the Philippians",
  "The Epistle to the Colossians",
  "The Epistle to Philemon",
  "The general Epistle of St. James",
  "Acts 28. 30, 31",
  // ---- page *441 (n904) ----
  // PART XV. From the Fifth and last Journey of St. Paul to the Completion of
  // the Canon. Sections II-XI, XVI and XVII are narrative of St. Paul's travels,
  // his imprisonment and martyrdom and the destruction of Jerusalem, and carry
  // no Scripture column at all; they are not days here, since there is nothing
  // to read on them.
  "The Epistle to the Hebrews",
  "The Second Epistle to Timothy",
  "The First Epistle general of St. Peter",
  "The Second Epistle general of St. Peter",
  "The general Epistle of Jude",
  // ---- page *442 (n905) ----
  "The Book of Revelation",
  "The First Epistle of John",
  "The Second Epistle of John",
  "The Third Epistle of John",
];


const all = NT_SECTIONS.map((s, i) => ({ section: s, readings: parseSection(s, i) }));

console.log(`sections: ${NT_SECTIONS.length}`);
console.log(`readings: ${all.reduce((n, s) => n + s.readings.length, 0)}`);
for (const p of problems) console.log(`  [${p.index}] ${p.why}
      in: ${p.section}`);

// Verse-by-verse check against the bundled KJV.
const NT = ["Matthew","Mark","Luke","John","Acts","Romans","1 Corinthians","2 Corinthians","Galatians","Ephesians","Philippians","Colossians","1 Thessalonians","2 Thessalonians","1 Timothy","2 Timothy","Titus","Philemon","Hebrews","James","1 Peter","2 Peter","1 John","2 John","3 John","Jude","Revelation"];
const KNOWN_GAPS = 10; // Townsend's own omissions; see the header.
const seen = new Set();
for (const s of all) for (const r of s.readings) {
  for (let c = r.c1; c <= r.c2; c++) {
    const vmax = verses.get(`${r.book}|${c}`);
    if (!vmax) throw new Error(`no such chapter: ${r.book} ${c}`);
    const from = c === r.c1 && r.v1 != null ? r.v1 : 1;
    const to = c === r.c2 && r.v2 != null ? r.v2 : vmax;
    for (let v = from; v <= to; v++) seen.add(`${r.book}|${c}|${v}`);
  }
}
let total = 0;
const unread = [];
for (const book of NT) {
  for (let c = 1; c <= chapters.get(book); c++) {
    for (let v = 1; v <= verses.get(`${book}|${c}`); v++) {
      total++;
      if (!seen.has(`${book}|${c}|${v}`)) unread.push(`${book} ${c}:${v}`);
    }
  }
}
console.log(`New Testament verses read: ${total - unread.length} of ${total}`);
if (unread.length !== KNOWN_GAPS) {
  throw new Error(`expected ${KNOWN_GAPS} unread verses, found ${unread.length}: ${unread.slice(0, 30).join(", ")}`);
}

// --- emit -------------------------------------------------------------------

function label(book, c1, v1, c2, v2) {
  if (v1 == null && v2 == null) return c1 === c2 ? `${book} ${c1}` : `${book} ${c1}-${c2}`;
  if (c1 === c2) return v2 == null || v2 === v1 ? `${book} ${c1}:${v1 ?? 1}` : `${book} ${c1}:${v1 ?? 1}-${v2}`;
  if (v1 == null) return `${book} ${c1}-${c2}:${v2}`;
  return v2 == null ? `${book} ${c1}:${v1}-${c2}` : `${book} ${c1}:${v1}-${c2}:${v2}`;
}

/**
 * Townsend writes "Mark i. 14, 15" for two consecutive verses and "Matt. v. vi.
 * vii." for three consecutive chapters. Joining runs that are adjacent and
 * ascending turns those into one reading each, which is the same text in the
 * same order and one link instead of three. A run that doubles back -- his
 * "Gen. 4. 1-16, 24, 17-25", where verse 24 is deliberately read early -- is
 * left alone, since merging it would undo the arrangement.
 */
function joinRuns(readings) {
  const out = [];
  for (const r of readings) {
    const prev = out[out.length - 1];
    const bothWhole = prev && prev.v1 == null && prev.v2 == null && r.v1 == null && r.v2 == null;
    const bothVerses = prev && prev.v2 != null && r.v1 != null;
    if (prev && prev.book === r.book) {
      if (bothWhole && r.c1 === prev.c2 + 1) {
        prev.c2 = r.c2;
        continue;
      }
      if (bothVerses && r.c1 === prev.c2 && r.v1 === prev.v2 + 1) {
        prev.c2 = r.c2;
        prev.v2 = r.v2;
        continue;
      }
    }
    out.push({ ...r });
  }
  return out;
}

const days = all.map((s, i) => ({
  day: i + 1,
  readings: joinRuns(s.readings).map((r) => ({
    book: r.book,
    chapter_start: r.c1,
    verse_start: r.v1,
    chapter_end: r.c2,
    verse_end: r.v2,
    label: label(r.book, r.c1, r.v1, r.c2, r.v2),
  })),
}));

if (problems.length) throw new Error(`${problems.length} unresolved cells; refusing to write`);
if (days.some((d) => d.readings.length === 0)) throw new Error("a section produced no readings");

const plan = {
  code: "townsend_nt",
  title: "The New Testament in Chronological Order (Townsend)",
  description:
    "George Townsend's arrangement of 1826, the companion to his Old Testament: the New Testament re-ordered so that it reads as one connected history, with the four Gospels harmonised into a single life of Christ -- each event read in every Gospel that records it -- and every epistle set at the point in the Acts where Paul or Peter or James wrote it. One of Townsend's own sections a day.",
  length_days: days.length,
  days,
};

const OUT = join(ROOT, "reference", "reading_plans", "sources", "townsend_nt.json");
writeFileSync(OUT, JSON.stringify(plan, null, 1) + "\n");
console.log(`\n${OUT}: ${days.length} days, ${days.reduce((n, d) => n + d.readings.length, 0)} readings`);
