// Builds reference/reading_plans/townsend_ot.json from the chronological
// arrangement of the Old Testament published by the Rev. George Townsend,
// "The Old Testament, arranged in historical and chronological order (on the
// basis of Lightfoot's Chronicle), in such a manner that the books, chapters,
// psalms, prophecies, &c. may be read as one connected history, in the words of
// the authorized translation" -- London 1821; transcribed here from the Boston
// edition of 1838 (Perkins & Marvin), archive.org/details/oldtestamentarra00bostrich.
// Public domain.
//
// The order is not this script's and not the app's. It is Townsend's, and
// Townsend built it on "The Harmony, Chronicle and Order of the Old Testament"
// (1647) of John Lightfoot, a member of the Westminster Assembly. Job stands
// among the patriarchs, Chronicles is woven verse by verse into Samuel and
// Kings, every prophet is placed in the reign he preached in, and the psalms
// are set beside the occasions that produced them -- Psalm 142 in the cave,
// Psalm 51 after Bathsheba, Psalm 137 by the waters of Babylon.
//
// The SECTIONS below are Townsend's 469 sections in his order, each carrying
// his SCRIPTURE column verbatim, transcribed by eye from the page images of
// INDEX THE FIRST ("The Periods, Parts, and Sections, with the Passages of
// Scripture contained in each"), pages *1-*14, leaves n1204-n1217. The item's
// OCR interleaves the index columns into an unusable jumble and was not used.
//
// Two readings of the printed text are emended, each noted at the line; both
// are forced by the arrangement itself rather than chosen. A third class is
// left exactly as printed: Townsend repeatedly splits a single verse between
// two sections ("part of 21", "middle of 9", "beginning of ver. 2"), and since
// a reading cannot open half a verse, each such mark resolves to the whole
// verse and that verse is read in both sections.
//
// The transcription is checked against the bundled KJV verse by verse: of the
// 23,145 verses of the Old Testament, this sequence reads 23,119. The 26 it
// does not are gaps in Townsend's printed index itself, not in the
// transcription -- Genesis 50. 1, 1 Kings 9. 25, 2 Chronicles 29. 1-2, and the
// whole of Psalm 103, which the index never names. Nothing is invented to fill
// them.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BIBLE = join(ROOT, "bibles", "King James Version (1769).xml");

// --- verse counts from the bundled KJV (Zefania) -----------------------------
const xml = readFileSync(BIBLE, "utf8");
const verses = new Map(); // "Book|chapter" -> verse count
const chapters = new Map(); // Book -> chapter count
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

// --- book names --------------------------------------------------------------
const NAME = {
  Gen: "Genesis", Exod: "Exodus", Lev: "Leviticus", Num: "Numbers", Deut: "Deuteronomy",
  Joshua: "Joshua", Judges: "Judges", Ruth: "Ruth", "1 Sam": "1 Samuel", "2 Sam": "2 Samuel",
  "1 Kings": "1 Kings", "2 Kings": "2 Kings", "1 Chron": "1 Chronicles", "2 Chron": "2 Chronicles",
  Ezra: "Ezra", Neh: "Nehemiah", Esther: "Esther", Job: "Job", Ps: "Psalms", Psalm: "Psalms",
  Psalms: "Psalms", Prov: "Proverbs", Isaiah: "Isaiah", Jer: "Jeremiah", Ezek: "Ezekiel",
  Dan: "Daniel", Hosea: "Hosea", Joel: "Joel", Amos: "Amos", Obadiah: "Obadiah", Jonah: "Jonah",
  Micah: "Micah", Nahum: "Nahum", Hab: "Habakkuk", Zeph: "Zephaniah", Hag: "Haggai",
  Zech: "Zechariah", Mal: "Malachi",
};
// Townsend's whole-book phrases.
const WHOLE_BOOK = {
  "The Book of Proverbs": "Proverbs",
  "Book of Ecclesiastes": "Ecclesiastes",
  "The Book of Ruth": "Ruth",
  "Book of Canticles": "Song of Solomon",
  "The Book of Joel": "Joel",
  "The Book of Jonah": "Jonah",
  "The Book of Nahum": "Nahum",
  "The Book of Zephaniah": "Zephaniah",
  "The Book of Habakkuk": "Habakkuk",
  "The Lamentations of Jeremiah": "Lamentations",
};
const BOOK_KEYS = Object.keys(NAME).sort((a, b) => b.length - a.length);

const problems = [];
let current = null; // book carried across items of one section

function bookOf(item) {
  for (const key of BOOK_KEYS) {
    const re = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.?\\s+`);
    if (re.test(item)) return [NAME[key], item.replace(re, "")];
  }
  return [null, item];
}

/** Resolve one section string into a list of {book,c1,v1,c2,v2}. */
function parseSection(section, index) {
  if (WHOLE_BOOK[section]) {
    const book = WHOLE_BOOK[section];
    return [{ book, c1: 1, v1: null, c2: chapters.get(book), v2: null }];
  }
  if (section === "Obadiah") return [{ book: "Obadiah", c1: 1, v1: null, c2: 1, v2: null }];

  const out = [];
  current = null;
  for (const raw of section.split(";")) {
    let item = raw.trim().replace(/^and\s+/i, "");
    if (!item) continue;
    if (item === "Obadiah") { out.push({ book: "Obadiah", c1: 1, v1: null, c2: 1, v2: null }); current = "Obadiah"; continue; }
    const whole = Object.keys(WHOLE_BOOK).find((k) => item.startsWith(k));
    if (whole) {
      const book = WHOLE_BOOK[whole];
      out.push({ book, c1: 1, v1: null, c2: chapters.get(book), v2: null });
      current = book;
      continue;
    }
    const [book, rest] = bookOf(item);
    if (book) current = book;
    if (!current) {
      problems.push({ index, section, item, why: "no book in scope" });
      continue;
    }
    const pieces = parseSpec(rest, current, { index, section, item });
    out.push(...pieces);
  }
  return out;
}

/**
 * Townsend splits single verses between sections ("part of 21", "middle of 9",
 * "beginning of ver. 2"). A reading plan cannot open half a verse, so each such
 * mark resolves to the whole verse; the verse is simply read in both sections.
 */
function normalize(spec) {
  return spec
    .replace(/\b(?:the\s+)?(?:latter|last|first|beginning|middle|end)\s+(?:part\s+)?of\s+(?:ver\.\s*)?(\d+)/gi, "$1")
    .replace(/\bpart\s+of\s+(?:ver\.\s*)?(\d+)/gi, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSpec(spec, book, ctx) {
  const max = chapters.get(book);
  spec = normalize(spec).replace(/^and\s+/i, "").replace(/\.$/, "");

  // "5. and 6" / "33. and 34" -- two whole chapters joined by "and".
  let two = /^(\d+)\.?\s*and\s*(\d+)$/i.exec(spec);
  if (two) {
    return [
      { book, c1: Number(two[1]), v1: null, c2: Number(two[1]), v2: null },
      { book, c1: Number(two[2]), v1: null, c2: Number(two[2]), v2: null },
    ];
  }

  // "40. to the end of the Book" / "9. to end of Book"
  let m = /^(\d+)\.?\s*,?\s*(?:to (?:the )?end of (?:the )?Book)$/i.exec(spec);
  if (m) return [{ book, c1: Number(m[1]), v1: null, c2: max, v2: null }];

  // "7. 10, to end of the Book" -- from a verse to the end of the book
  m = /^(\d+)\.\s*(\d+),?\s*to (?:the )?end of (?:the )?Book$/i.exec(spec);
  if (m) return [{ book, c1: Number(m[1]), v1: Number(m[2]), c2: max, v2: null }];

  // "26 to 31" / "1. to 9" / "12 to 16" -- a run of whole chapters
  m = /^(\d+)\.?\s*to\s*(\d+)$/i.exec(spec);
  if (m) return [{ book, c1: Number(m[1]), v1: null, c2: Number(m[2]), v2: null }];

  // "11. to 14. 1-27" / "8. to 11. 1-21" / "1. to 7. 1-9" -- chapters up to a verse
  m = /^(\d+)\.?\s*to\s*(\d+)\.\s*1-(\d+)$/i.exec(spec);
  if (m) return [{ book, c1: Number(m[1]), v1: null, c2: Number(m[2]), v2: Number(m[3]) }];

  // A bare chapter.
  m = /^(\d+)$/.exec(spec);
  if (m) return [{ book, c1: Number(m[1]), v1: null, c2: Number(m[1]), v2: null }];

  // "C. <verse groups>", where a later ", and D. <groups>" starts a new chapter.
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

/** "1-16, 24, 17-25, 26" / "48, to end" / "5, to end" within one chapter. */
function parseVerses(spec, book, chapter, ctx) {
  const last = verses.get(`${book}|${chapter}`);
  if (!last) {
    problems.push({ ...ctx, why: `no such chapter ${book} ${chapter}` });
    return [];
  }
  const out = [];
  const groups = normalize(spec).split(/,|\band\b|&/).map((s) => s.trim()).filter(Boolean);
  let pendingStart = null;
  for (const g of groups) {
    // "to end" / "to 50" -- extend the verse just named.
    const upto = /^to (end|\d+)$/i.exec(g);
    if (upto) {
      if (pendingStart == null) {
        problems.push({ ...ctx, why: `"${g}" with no start in "${spec}"` });
        return out;
      }
      out[out.length - 1].v2 = upto[1].toLowerCase() === "end" ? last : Number(upto[1]);
      pendingStart = null;
      continue;
    }
    // "50 to 61" -- a verse range written with "to".
    let mm = /^(\d+)\s*to\s*(\d+)$/i.exec(g);
    if (mm) {
      out.push({ book, c1: chapter, v1: Number(mm[1]), c2: chapter, v2: Number(mm[2]) });
      pendingStart = null;
      continue;
    }
    mm = /^(\d+)-(\d+)$/.exec(g);
    if (mm) {
      out.push({ book, c1: chapter, v1: Number(mm[1]), c2: chapter, v2: Number(mm[2]) });
      pendingStart = null;
      continue;
    }
    mm = /^(\d+)$/.exec(g);
    if (mm) {
      const v = Number(mm[1]);
      if (v > last) {
        // Cannot be a verse of this chapter; Townsend's typography is
        // ambiguous here, so flag rather than guess.
        problems.push({ ...ctx, why: `"${g}" is not a verse of ${book} ${chapter} (${last} verses)` });
        return out;
      }
      out.push({ book, c1: chapter, v1: v, c2: chapter, v2: v });
      pendingStart = v;
      continue;
    }
    problems.push({ ...ctx, why: `unparsed verse group "${g}" in "${spec}"` });
    return out;
  }
  return out;
}


const SECTIONS = [
  // ---- page *1 (n1204) ----
  // PERIOD I. From the Creation to the Deluge.
  "Gen. 1; 2. 4, to end",
  "Gen. 2. 1-3; 3",
  "Gen. 4. 1-16, 24, 17-25, 26",
  "Gen. 5",
  "Gen. 6; 7. 1-4",
  "Gen. 7. 5, to end; 8. 1-12",
  "Gen. 8. 13, to end; 9. 1-17",
  "Gen. 9. 18, to end",
  // PERIOD II. From the Dispersion to the Exodus.
  // Part I. The Confusion of Tongues, and Dispersion of Mankind.
  "Gen. 11. 1-9",
  "Gen. 10",
  "Gen. 11. 10-26",
  // Part II. The Life of Job.
  "Job 1. 1-5",
  "Job 1. 6, to end",
  "Job 2. 1-10",
  "Job 2. 11, to end; 3",
  "Job 4; 5",
  "Job 6; 7",
  "Job 8",
  "Job 9; 10",
  "Job 11",
  "Job 12; 13; 14",
  "Job 15",
  "Job 16; 17",
  "Job 18",
  "Job 19",
  "Job 20",
  "Job 21",
  "Job 22",
  "Job 23; 24",
  "Job 25",
  "Job 26 to 31",
  "Job 32 to 37",
  // ---- page *2 (n1205) ----
  "Job 38; 39; 40. 1, 2",
  "Job 40. 3-5",
  "Job 40. 6, to end; 41",
  "Job 42. 1-6",
  "Job 42. 7, to end",
  // Part III. The Life of Abraham.
  "Gen. 11. 27, to end; 12; 13. 1",
  "Gen. 20; 13. 2-4",
  "Gen. 13. 5-13",
  "Gen. 13. 14, to end",
  "Gen. 14",
  "Gen. 15",
  "Gen. 16",
  "Gen. 17",
  "Gen. 18. 1-15",
  "Gen. 18. 16, to end; 19. 1-29",
  "Gen. 19. 30, to end",
  "Gen. 21. 1-8",
  "Gen. 21. 9-21",
  "Gen. 21. 22, to end",
  "Gen. 22. 1-19",
  "Gen. 23",
  "Gen. 22. 20, to end",
  "Gen. 24",
  "Gen. 25. 1-6",
  "Gen. 25. 19-28",
  "Gen. 25. 7-10",
  // Part IV. From the Death of Abraham to the Selling of Joseph by his Brethren.
  "Gen. 25. 11; 26. part of 1; 25. 29, to end",
  "Gen. 26. latter part of 1, to end",
  "Gen. 25. 12-18",
  "Gen. 27. 1-45",
  "Gen. 27. 46; 28; 29. 1-14",
  "Gen. 29. 15, to end; 30",
  "Gen. 31",
  "Gen. 32; 33. 1-17",
  "Gen. 33. 18, to end; 38. 1-5; 34",
  "Gen. 35. 1-27",
  "Gen. 36",
  // Part V. History of Joseph and his Family in Egypt.
  "Gen. 37; 39. 1-6",
  "Gen. 38. 6, to end",
  "Gen. 39. 7, to end; 40",
  "Gen. 35. 28, 29",
  "Gen. 41. 1-45",
  "Gen. 41. 46, to end; 42",
  "Gen. 43; 44; 45",
  "Gen. 46. 1-7; 37. beginning of ver. 2; 46. 8, to end, and 47. 1-12",
  "Gen. 47. 13-26",
  // Part VI. From the Death of Jacob to the Death of Joseph.
  "Gen. 47. 27, to end; 48; 49",
  "Gen. 50. 2, to end",
  "Exod. 1",
  // PERIOD III. From the Birth to the Death of Moses.
  "Exod. 2; Psalm 88",
  "Exod. 3; 4. 1-28",
  "Exod. 4. 29, to end; 5; 6. 1-13",
  // ---- page *3 (n1206) ----
  "Exod. 6. 14-27",
  "Exod. 6. 28, to end; 7. 1-13",
  // Part IV. Infliction of the first eight Plagues.
  "Exod. 7. 14, to end",
  "Exod. 8. 1-15",
  "Exod. 8. 16-19",
  "Exod. 8. 20, to end",
  "Exod. 9. 1-7",
  "Exod. 9. 8-12",
  "Exod. 9. 13, to end",
  "Exod. 10. 1-20",
  // Part V. Institution of the Passover.
  "Exod. 12. 1-20",
  // Part VI. Conclusion of the Ten Plagues.
  "Exod. 10. 21-27",
  "Exod. 10. 28, 29; 11. 1-10; 12. 21-30",
  // Part VII. The Exodus.
  "Exod. 12. 31-36, and 40-42",
  // Part VIII. The Wandering in the Wilderness.
  "Num. 33. 1-5; Exod. 12. 37-39",
  "Exod. 12. 43, to end; 13. 1-19",
  "Exod. 13. 20, to end; Num. 33. 6",
  "Num. 33. 7; Exod. 14. 1-18",
  "Num. 33. 8; Exod. 14. 19, to end; 15. 1-21",
  "Exod. 15. 22-26",
  "Num. 33. 9, 10; Exod. 15. 27",
  "Exod. 16; Num. 33. 11",
  "Num. 33. 12, 13",
  "Exod. 17; Num. 33. 14",
  "Num. 33. 15; Exod. 19",
  "Exod. 20",
  // Printed "Exod. 21. 22; 23"; the section is "The Judicial Law", which is
  // Exodus 21-23 entire (the Book of the Covenant), so the mark after 21 is a
  // comma set as a period.
  "Exod. 21; 22; 23",
  "Exod. 24",
  "Exod. 25; 26; 27",
  "Exod. 28; 29",
  "Exod. 30; 31",
  "Exod. 32; 33",
  "Exod. 34",
  "Exod. 35. to 40",
  "Lev. 1. to 7",
  "Lev. 8; 9",
  "Lev. 10. 1-7",
  "Lev. 10. 8, to end",
  "Num. 9. 1-14",
  "Lev. 11",
  "Lev. 12",
  "Lev. 13",
  "Lev. 14. 1-32",
  "Lev. 14. 33, to end",
  "Lev. 15",
  "Lev. 16",
  "Lev. 17",
  "Lev. 18",
  "Lev. 19",
  "Lev. 20",
  "Lev. 21; 22",
  "Lev. 23",
  // ---- page *4 (n1207) ----
  "Lev. 24",
  "Lev. 25",
  "Lev. 26",
  "Lev. 27",
  "Num. 1; 2",
  "Num. 3; 4",
  "Num. 5; 6",
  "Num. 7",
  "Num. 8",
  "Num. 10. 1-10",
  "Exod. 18. 1-26",
  "Num. 9. 15, to end; 10. 11-28, 33, to end; and 33. 16",
  "Num. 10. 29-32; Exod. 18. 27",
  "Num. 11. 1-34",
  "Num. 11. 35; 12. 1-15, and 33. 17",
  "Num. 12. 16; 13; 14; and 33. 18; Psalm 90",
  "Num. 15",
  "Num. 16; 17",
  "Num. 18",
  "Num. 19",
  "Num. 33. 19-35",
  "Num. 20. 1-13; 33. 36",
  "Num. 20. 14-21; 21. 1-3; 33. 40",
  "Num. 20. 22-29; 33. 37-39",
  "Num. 21. 4-9; 33. 41",
  "Num. 33. 42-44; 21. 10, 11",
  "Num. 33. 45; 21. 12, to part of 18, and 21, to end",
  "Num. 33. 46, 47; 21. last part of 18, 19, 20",
  "Num. 22; 23; 24; 33. 48",
  "Num. 33. 49; 25",
  "Num. 26",
  "Num. 27. 1-11; 36. 1-12",
  "Num. 28; 29",
  "Num. 30",
  "Num. 31",
  "Num. 32",
  "Num. 33. 50, to end; 34",
  "Num. 35",
  "Deut. 1; 2. 1; 10. 6-9; 2. 2, to end; 3; and 4. 1-40",
  "Deut. 4. 41, to end",
  "Deut. 5. and 6",
  "Deut. 7. and 8",
  "Deut. 9; 10. 1-5, 10, to end; and 11",
  "Deut. 12 to 16; and 17. 1",
  "Deut. 17. 2, to end, and 18. to 26",
  "Deut. 27; 28",
  "Deut. 29; 30; Num. 36. 13",
  "Num. 27. 12, to end; and Deut. 31. 1-8",
  // ---- page *5 (n1208) ----
  "Deut. 31. 9, to end, and 32. 1-47",
  "Deut. 32. 48, to end, 33. and 34",
  // PERIOD IV. From the Entrance of the Israelites into Canaan, to the Death of David.
  // Part I. The Conquest of Canaan.
  "Joshua 1. 1-9",
  "Joshua 2",
  "Joshua 1. 10, to end; 3; 4",
  "Joshua 5. 1-12",
  "Joshua 6. 1; 5. 13, to end; 6. 2, to end",
  "Joshua 7; 8. 1-29",
  "Joshua 9; 10",
  "Joshua 11; 8. 30, to end",
  "Joshua 22",
  // Part II. General Division of the Country.
  "Joshua 12; 13. 1-14",
  "Joshua 14. 1-5; 13. 15, to end; 14. 6, to end; 15. 13-19, 1-12, 20, to end; 16. to 19",
  "Joshua 20; 21. 1-42",
  // Part III. Last Exhortations and Death of Joshua.
  "Joshua 21. 43, to end; 23; 24",
  // Part IV. Events after the Death of Joshua.
  "Judges 1; 2. 1-5",
  "Judges 2. 6-13; 17; 18",
  "Judges 19; 20; 21",
  // Part V. Government of the Judges.
  "Judges 2. 14, to end; 3. 1-11",
  "Judges 3. 12-30",
  "Judges 3. 31",
  "Judges 4; 5",
  "Judges 6. 1-6",
  "The Book of Ruth",
  "Judges 6. 7, to end; 7; 8",
  "Judges 9",
  "Judges 10. 1-5",
  "Judges 10. 6, to end; 11; 12. 1-7",
  "Judges 12. 8, to end",
  "Judges 13",
  "1 Sam. 1; 2. 1-21; 3",
  "Judges 14; 15. 1-19",
  "1 Sam. 2. 22, to end",
  "Judges 16; 15. 20",
  "1 Sam. 4",
  "1 Sam. 5; 6; 7. 1",
  "1 Sam. 7. 2, to end; 8",
  // Part VI. The Reign of Saul.
  "1 Sam. 9; 10",
  "1 Sam. 11; 12",
  "1 Sam. 13; 14",
  "1 Sam. 15",
  "1 Sam. 16. 1-13",
  "1 Sam. 17. 1-40, 55, 56, 41-54, 57, 58; 18. 1-4; Psalm 9",
  "1 Sam. 18. 5-9; 16. 14, to end; 18. 10, to end; 19. 1-3; Psalm 11; 1 Sam. 19. 4-17; Ps. 59",
  // ---- page *6 (n1209) ----
  "1 Sam. 19. 18, to end; 20",
  "1 Sam. 21; Ps. 56; 34; 1 Sam. 22. part of 1; Psalm 142; 1 Sam. 22. 1, 2; 1 Chron. 12. 8-18; 2 Sam. 23. 13-17; 1 Chron. 11. 15-19",
  "1 Sam. 22. 3-19; Ps. 52; 109; 17; 140; 35; 64",
  "1 Sam. 23. 1; 22. 20, to end; 23. 6, 2-5, 7-12; Psalm 31; 1 Sam. 23. 13-23; Ps. 54; 1 Sam. 23. 24-28",
  "1 Sam. 23. 29; 24; Psalm 57; 58; 63",
  "1 Sam. 25",
  "1 Sam. 26",
  "1 Sam. 27. 1; Psalm 141; 1 Sam. 27. 2-7; 1 Chron. 12. 1-7; 1 Sam. 27. 8, to end",
  "1 Sam. 28; 29; 1 Chron. 12. 19-22",
  "1 Sam. 30",
  "1 Sam. 31; 1 Chron. 10. 13, 14; 2 Sam. 1; 1 Chron. 10. 1-12",
  // Part VII. The Reign of David.
  "2 Sam. 2; 3; 4",
  "2 Sam. 5. 1-3; 1 Chron. 13. 1-4; Psalm 139; 1 Chron. 12. 23, to end; 2 Sam. 23. 8-12; 1 Chron. 11. 20, to end; 2 Sam. 5. 4-10; 1 Chron. 11. 1-14; 2 Sam. 23. 18, to end",
  "2 Sam. 5. 11, to end; 1 Chron. 14. 17, and 1-16",
  "2 Sam. 6. 1-11; Psalm 68; 1 Chron. 13. 5, to end",
  "1 Chron. 15. 1-14; Psalm 132; 1 Chron. 15. 15, to end; 16; Ps. 105; 96; 106; 2 Sam. 6. 20, to end, 12-19",
  "2 Sam. 7; Ps. 2; 1 Chron. 17",
  "Psalms 45; 22; 16; 118; 110",
  // The "13" after "8. 14, to end" is verse 13 of the same chapter, not chapter
  // 13: the section is the war with the surrounding nations, 2 Sam. 8. 13 is the
  // valley of salt that Psalm 60 and 1 Kings 11. 15-20 belong to, and chapter 13
  // (Amnon and Tamar) is read in its own place later.
  "2 Sam. 8. 1-12; 1 Chron. 18. 12; 2 Sam. 8. 14, to end, 13; 1 Kings 11. 15-20; Psalm 60; 108; 1 Chron. 18. 1-11, 13, to end",
  "2 Sam. 4. 4; 9; 10; Ps. 20; 21; 1 Chron. 19",
  "2 Sam. 11; 12. 1-15; Ps. 51; 32; 33; 107; 2 Sam. 12. 15-23; 1 Chron. 20. 1; 2 Sam. 12. 26, to end; 1 Chron. 20. 1-3",
  "2 Sam. 13. 1-20; 12. 24, part of 25; 13. 21, to end; 14. 1-7, 15-17, 8-14, and 18, to end",
  "2 Sam. 15. 1-29; Ps. 3; 2 Sam. 15. 30, to end; 16. 1-14; Ps. 7; 2 Sam. 16. 15, to end; 17",
  "Psalm 42; 43; 55; 4; 5; 62; 143; 144; 70; 71",
  "2 Sam. 18; 19; 20. 3",
  "2 Sam. 20. 1, 2, 4, to end",
  "2 Sam. 21. 1-14",
  "2 Sam. 21. 15, to end; 22; Psalm 18; 1 Chron. 20. 4, to end",
  // ---- page *7 (n1210) ----
  "2 Sam. 24. 1-9; 1 Chron. 21. 6, 7; 27. 23, 24; 2 Sam. 24. 10-15; 1 Chron. 21. 15, 16; 2 Sam. 24. 17; 1 Chron. 21. part of 17, to end; Psalm 30; 1 Chron. 21. 1-5, 8-14; 2 Sam. 24. 16; 1 Chron. 21. part of 17; 2 Sam. 24. 18, to end",
  "1 Chron. 22",
  "1 Kings 1",
  "1 Chron. 23. 1; 28. 1-10; Psalm 91; 145",
  "1 Chron. 23. 2, to end; 24; 25; 26; 27. 1-22, 25, to end; 28. 11, to end",
  "Psalms 40; 41; 61; 65; 69; 78",
  "Psalms 6; 8; 12; 19; 23; 24; 28; 29; 38; 39; 86; 95; 101; 104; 120; 121; 122; 124; 131; 133",
  "1 Chron. 29. 1-19; Psalm 72; 1 Chron. 29. 20-25",
  "1 Kings 2. 1-9; 2 Sam. 23. 1-7; 1 Chron. 29. 26, to end; 1 Kings 2. 10, 11",
  // PERIOD V. The Reign of Solomon.
  // Part I. Reign of Solomon before the Dedication of the Temple.
  "1 Kings 2. 12; 2 Chron. 1. 1; 1 Kings 3. 3; 2 Chron. 1. 2-6; 1 Kings 3. 5, to end; 2 Chron. 1. 13; 1 Kings 2. 13-38; 11. 21, 22; 3. 4; 2 Chron. 1. 7-12",
  "1 Kings 4. 1-25; 2 Chron. 2. 1, 2; 1 Kings 5. 1-9; 2 Chron. 2. 3-16; 1 Kings 5. 10, to end; 2 Chron. 2. 17, 18; 1 Kings 2. 39, to end; 3. 1, 2",
  // Part II. The Building of the Temple.
  "2 Chron. 3. 1; 1 Kings 6. 1; 2 Chron. 3. 2-9; 1 Kings 6. 4-8, and 15-28; 2 Chron. 3. part of 13, 14; 1 Kings 6. 29-36; 7. 13-22; 2 Chron. 4. 1; 1 Kings 7. 23-50; 2 Chron. 4. 8-10; 1 Kings 6. 9-14; 7. 51; 6. 37, 38, and 2, 3; 2 Chron. 3. 10-12, part of 13, 15, to end; 4. 2-7, 11, to end",
  // Part III. The Dedication of the Temple -- Psalms on the Occasion.
  "2 Chron. 5. 1-10; Ps. 47; 97; 98; 99; and 100; 2 Chron. 5. 11-14; Ps. 135; 136; 2 Chron. 7. 4-7; 6. 1-39; 1 Kings 8. part of 50 to 61; 2 Chron. 6. 40, to end; 7. 1-3, 8-10; 1 Kings 8. 1, to middle of 50, 62, to end",
  // Part IV. Other Buildings and Magnificence of Solomon.
  "1 Kings 7. 1-12; 2 Chron. 7. 11, to end; 1 Kings 9. 1-9",
  "1 Kings 9. 10-14; 2 Chron. 8. 1-11; 1 Kings 9. 24",
  "Book of Canticles",
  // Part V. Greatness of Solomon -- Visit of the Queen of Sheba.
  "1 Kings 9. 15-23; 2 Chron. 8. 12-16; 1 Kings 9. 26, to end; 2 Chron. 8. 17; 1 Kings 10. 14, to end; 4. 26-28, 34; 10. 1-13; 2 Chron. 8. 18; 9. 13-28; 1. 14, to end; 9. 1-12",
  // ---- page *8 (n1211) ----
  "1 Kings 4. 29-31, 33, 32; The Book of Proverbs",
  "1 Kings 11. 1-14, 23-40; Book of Ecclesiastes",
  "1 Kings 11. 41-43; 2 Chron. 9. 29-31",
  // PERIOD VI. From the Elevation of Rehoboam to the Babylonish Captivity.
  // Part I. The Reign of Rehoboam, first King of Judah.
  "1 Kings 14. part of 21; 12. 1-24; 2 Chron. 11. 5, to end; 12. 1; 1 Kings 14. 22-24; 2 Chron. 12. 2, to end; 1 Kings 14. part of 21, 25, to end; 2 Chron. 10; 11. 1-4",
  "1 Kings 12. 25, to end; 13",
  "2 Chron. 13. 1-21; 1 Kings 15. 3-8; 2 Chron. 13. 22; 14. part of 1; 1 Kings 15. 1, 2",
  "1 Kings 15. 9-11; 2 Chron. 14. 3; 1 Kings 15. 12-15; 2 Chron. 14. 4-6, part of 1, 7, to end; 15. 1-15, 18, 19; 1 Kings 15. 16-22; 2 Chron. 16. 7, to end; 1 Kings 15. 23, 24; 2 Chron. 14. 2; 15. 16, 17; 16. 1-6",
  "1 Kings 14. 1-20",
  "1 Kings 15. 25-31",
  "1 Kings 15. 32, to end; 16. 1-7",
  "1 Kings 16. 8-14",
  "1 Kings 16. 15-22",
  "1 Kings 16. 23-28",
  "1 Kings 16. 29, to end",
  "1 Kings 22. 41-44, 46, 47; 2 Chron. 17. 2, to end; 18. 1, 2; 19. 1-7; Psalm 82; 2 Chron. 19. 8, to end; 20. 1-26; Psalm 115; 46; 2 Chron. 20. 27-30, 35, to end; 1 Kings 22. 49; 2 Kings 8. 16; 2 Chron. 20. 32-34; 1 Kings 22. end of 45, 50, beginning of 45, 48; 2 Chron. 17. 1; 20. 31",
  "1 Kings 17",
  "1 Kings 18; 19. 1-21",
  "1 Kings 20",
  "1 Kings 21",
  "1 Kings 22. 1-40; 2 Chron. 18. 3, to end",
  "1 Kings 22. 51, to end; 2 Kings 1",
  "2 Kings 3. 1-5",
  "2 Kings 2",
  "2 Kings 3. 6, to end",
  "2 Kings 4; 5; 6. 1-23",
  "2 Chron. 21. 1, 5-7, 2-4, 11-15, 8-10, 16, to end; 2 Kings 8. 23, 24, and 17-22",
  // ---- page *9 (n1212) ----
  "2 Kings 6. 24, to end; 7; 8. 1-6",
  "2 Chron. 22. 1; 2 Kings 8. 25; 2 Chron. 22. 2-7; 2 Kings 9. part of 27; 2 Chron. 22. 8, part of 9; 2 Kings 9. part of 27, 28; 2 Chron. 22. part of 9; 2 Kings 9. 29; 8. 26, to end; 2 Chron. 22. middle of 9",
  "2 Kings 8. 7-15",
  "2 Kings 9. 1-26",
  "2 Kings 9. 30, to end; 10. 1-28",
  "2 Chron. 22. 10, to end; 24. 7-11; 23. 1-15; 2 Kings 11. 1-16",
  "2 Kings 10. 29",
  "2 Kings 12. part of 1; 11. 21; 12. end of 1, 2, 3; 2 Chron. 23. 16, to end; 24. 3-5; 2 Kings 12. 4-6; 2 Chron. 24. 6; 2 Kings 12. 7-14; 2 Chron. 24. 12-14; 2 Kings 12. 15-18; 2 Chron. 24. 15-27; 2 Kings 12. 19; 11. 17-20; 12. 20, 21; 2 Chron. 24. 1, 2",
  "2 Kings 10. 30, to end",
  "2 Kings 13. 1-9",
  "2 Kings 13. 10, 14-21",
  // Printed "1 Kings 14. 1-6", but the section is the Reign of Amaziah, whose
  // accession is 2 Kings 14. 1-6; 1 Kings 14 is read entire under the death of
  // Jeroboam, and 2 Kings 14. 1-6 is otherwise never read. Emended to 2 Kings.
  "2 Kings 14. 1-6; 2 Chron. 25. 5-11; 2 Kings 14. part of 7; 2 Chron. 25. 12-16; 2 Kings 14. 8-14; 2 Chron. 25. 27, 28, 25, 26; 2 Kings 14. part of 7, 17-20; 2 Chron. 25. 1-4, and 17-24",
  "2 Kings 13. 22, to end, and 11-13; 14. 15, 16",
  "2 Kings 14. 23, 24",
  "2 Chron. 26. 1; 2 Kings 15. 1; 2 Chron. 26. 2-15",
  "The Book of Joel",
  "2 Chron. 26. 16-21",
  "Isaiah 1. 1; 6; 2; 3; 4; 5",
  "2 Chron. 26. 22, 23; 2 Kings 14. 21, 22; 15. 2-7",
  "2 Kings 14. 25-27",
  "Hosea 1; 2; 3",
  "Amos 1. to 7. 1-9",
  "The Book of Jonah",
  "2 Kings 14. 28; Amos 7. 10, to end of the Book; 2 Kings 14. 29",
  "Hosea 4",
  "2 Kings 15. 8-12",
  "2 Kings 15. 13-15",
  // ---- page *10 (n1213) ----
  "2 Kings 15. 16-22",
  "2 Kings 15. 23-26",
  "2 Kings 15. 32; 2 Chron. 27. 1, 2; 2 Kings 15. part of 35; Micah 1; 2; 2 Chron. 27. 3, to end; 2 Kings 15. 37, 33, 34, part of 35, 36, 38",
  "2 Kings 15. 27-29",
  "2 Kings 16. 1-4; Isaiah 7; 8; 9; 10. 1-4; 2 Kings 16. 5",
  "Isaiah 17",
  "2 Chron. 28. 4-19",
  "Obadiah; Isaiah 1. 2, to end",
  "2 Kings 16. 6-9; Isaiah 28; 2 Chron. 28. 20-23; 2 Kings 16. 10-18; 2 Chron. 28. 24, 25; Hosea 5; 6",
  "2 Chron. 28. 26, 27; Isaiah 14. 28, to end; 2 Kings 16. 19, 20; 2 Chron. 28. 1-3",
  "2 Kings 15. 30, 31; 17. 1, 2",
  // Part XIII. The Reign of Hezekiah.
  "2 Kings 18. 1-6; 2 Chron. 29. 3, to end; 30; 31",
  "Isaiah 15; 16",
  "Micah 3. to the end of the Book; 2 Kings 18. 7, 8",
  "Isaiah 18; 19",
  "The Book of Nahum",
  "Isaiah 23",
  "Isaiah 10. 5, to end; 11. to 14. 1-27",
  "Isaiah 24. to 27",
  "Isaiah 22. 1-14; 21",
  "2 Chron. 32. 1-8; 2 Kings 18. 13-16; Isaiah 20",
  "Isaiah 29; 30; 31",
  "2 Kings 20. 1-11; Isaiah 32. to 35; and 38. 9-20; 2 Chron. 32. 25, 26; 2 Kings 20. 12-19; 2 Chron. 32. 24; Isaiah 38. 1-8, 21, 22; and 39",
  "Isaiah 36. 1; 2 Kings 18. 17, to end; 19. 1-7; Ps. 44; 2 Kings 19. 8-19; Psalm 73; 2 Kings 19. 20-35; 2 Chron. 32. 22, 23; Psalms 75; 76; 2 Kings 19. 36, 37; 2 Chron. 32. 9-21; Isaiah 36. 2, to end; and 37",
  "Isaiah 40; 41",
  "Isaiah 42; 43",
  "Isaiah 44; 45",
  "Isaiah 46; 47",
  "Isaiah 48",
  "Isaiah 49",
  "Isaiah 50; 51; 52. 1-12",
  "Isaiah 52. 13, to end; 53",
  "Isaiah 54",
  "Isaiah 55; 56. 1-8",
  // ---- page *11 (n1214) ----
  "Isaiah 56. 9, to end; 57; 58; 59. 1-15",
  "Isaiah 59. 16, to the end of the Book",
  "2 Chron. 32. 27-31, part of 32; 2 Kings 20. part of 20; 2 Chron. 32. part of 32, 33; 2 Kings 20. end of 20, 21",
  "2 Kings 17. 3, 4",
  "Hosea 7. to the end of the Book",
  "2 Kings 18. 9-12; 2 Kings 17. 7-23, 5, 6",
  // Part XIV. The Reign of Manasseh, King of Judah.
  "2 Kings 21. 1-16; Isaiah 22. 15, to end; 2 Chron. 33. 11-19; 2 Kings 21. 17, 18; 2 Chron. 33. 1-10, 20",
  "2 Kings 17. 24, to end",
  "2 Kings 21. 19, to end; 2 Chron. 33. 21, to end",
  // Part XVI. The Reign of Josiah, King of Judah.
  "2 Kings 22. 1, 2; 2 Chron. 34. 3-7, 1, 2",
  "Jer. 1; 2; 3. 1-5",
  "2 Chron. 34. 8-32; 2 Kings 22. 3, to end; 23. 1-3",
  "The Book of Zephaniah",
  "2 Kings 23. 4-20; 2 Chron. 34. 33; 35. 1-19; 2 Kings 23. 21-24",
  "Jer. 3. 6, to end",
  "Jer. 4; 5; 6",
  "The Book of Habakkuk",
  "Jer. 7. to 10",
  "Jer. 11; 12",
  "2 Chron. 35. 20-24; 2 Kings 23. 25-27; 2 Chron. 35. 25, to end; 2 Kings 23. 28, 29, part of 30",
  "2 Kings 23. part of 30, 31-35; 2 Chron. 36. 1-4",
  // Reign of Jehoiakim.
  "2 Kings 23. 36, 37",
  "Jer. 13. to 20",
  "Jer. 22. 1-23",
  "Jer. 26",
  "Jer. 46. 1-12",
  "Jer. 35",
  "Jer. 25",
  "Jer. 36. 1-8; 45",
  "Dan. 1. 1-7; 2 Kings 24. 3, 4; 2 Chron. 36. 6, 7",
  // ---- page *12 (n1215) ----
  // PERIOD VII. The Babylonish Captivity.
  "Jer. 36. 9, to end",
  "2 Kings 24. part of 1, 2; 2 Chron. 36. 8; 2 Kings 24. 5; 2 Chron. 36. 5",
  "2 Kings 24. 6-9; Jer. 22. 24, to end; 23; 2 Kings 24. 10-16; 2 Chron. 36. 9, 10",
  "Jer. 52. 1-3; 24",
  "Jer. 29. 1-14, 16-20, 15, 21, to end",
  "Jer. 30; 31",
  "Jer. 27; 28",
  "Jer. 48; 49",
  "Jer. 50; 51",
  "2 Chron. 36. 11-21",
  "Jer. 39. 1; 2 Kings 25. end of 1, 2; Jer. 37. 1-4; 34. 1-10; 2 Kings 25. beginning of 1",
  "Jer. 32; 33",
  "Jer. 37. 5",
  "Jer. 47; 37. 6-10",
  "Jer. 34. 11, to end",
  "Jer. 37. 11, to end",
  "Jer. 21",
  "Jer. 38; 39. 15, to end",
  "Jer. 52. 5, 6; 39. 3; 52. 7-11; 39. 11-14; 52. 24-27, 12-14, 17-23, 15, 16; 39. 10; 2 Kings 24. 17, to end; 25. 3-21; Jer. 39. 2, 4-9; 52. 4",
  "Psalms 79; 74; 83; 94",
  "The Lamentations of Jeremiah",
  // Part II. Events at Babylon between the Commencement of the Captivity and the Destruction of the Temple.
  "Dan. 1. 8, to end",
  "Ezek. 1; 2; 3. 1-21",
  "Ezek. 3. 22, to end; 4. to 7",
  "Ezek. 8. to 11. 1-21",
  "Ezek. 11. 22, to end; 12. to 19",
  "Ezek. 20. to 23",
  "Ezek. 24",
  "Ezek. 29. 1-16",
  "Ezek. 30. 20, to end; 31",
  // Part III. History of that Portion of the Jewish Nation who were not carried captive to Babylon.
  "2 Kings 25. 22; Jer. 40; 41. 1-10; 2 Kings 25. 23-26",
  // ---- page *13 (n1216) ----
  "Jer. 41. 11, to end; 42; 43. 1-7",
  "Jer. 43. 8, to end; 46. 13, to end",
  "Jer. 44",
  "Jer. 52. 28-30",
  // Part IV. Events at Babylon between the Destruction of Jerusalem and the Return from the Captivity.
  "Ezek. 33. 21, to end; 25",
  "Ezek. 26. to 28",
  "Ezek. 32. 1-16",
  "Ezek. 32. 17, to end",
  "Ezek. 33. 1-20",
  "Ezek. 34. to 37",
  "Ezek. 38; 39",
  "Ezek. 40. to the end of the Book",
  "Ezek. 29. 17, to end; 30. 1-19",
  "Dan. 2",
  "Dan. 3",
  "Dan. 4",
  "Jer. 52. 31, to end; 2 Kings 25. 27, to end",
  "Dan. 7",
  "Psalms 137; 130; 80; 77; 37; 67; 49; 53; 50; 10; 13; 14; 15; 25; 26; 27; 36; 89; 92; 93; 123",
  "Dan. 5",
  "Dan. 8",
  "Dan. 9; Psalm 102",
  "Dan. 6",
  "Ezra 1. 1-4; Psalms 126; 85; 2 Chron. 36. 22, 23",
  // PERIOD VIII. From the Termination of the Babylonish Captivity to the
  // Reformation of Worship by Nehemiah, and the Completion of the Canon.
  // Part I. From the Decree of Cyrus to the Dedication of the Second Temple.
  "Ezra 1. 5, to end; 2; 3. 1-7; Psalms 107; 87; 111; 112; 113; 114; 116; 117; 125; 127; 128; 134",
  "Ezra 3. 8, to end; Psalms 84; 66",
  "Ezra 4. 1-5, part of 24; Ps. 129; Dan. 10; 11; 12",
  "Ezra 4. part of 24; 5. 1; Hag. 1. 1-11; Ezra 5. 2; Hag. 1. 12, to end; 2. 1-9; Zech. 1. 1-6; Hag. 2. 10, to end; Zech. 1. 7, to end; 2 to 6",
  "Ezra 5. 3, to end; 6. 1-13; Psalm 138; Zech. 7; 8",
  "Ezra 6. 14, to end; Psalms 48; 81; 146; 147; 148; 149; 150",
  // Part II. From the Dedication of the Second Temple to the Death of Haman.
  "Ezra 4. 6",
  // ---- page *14 (n1217) ----
  "Ezra 4. 7-23",
  "Esther 1; 2. 1, to part of 15",
  "Ezra 7; 8",
  "Esther 2. part of ver. 15-20",
  "Ezra 9; 10",
  "Zech. 9. to end of Book",
  "Esther 2. 21, to end",
  "Esther 3. to the end of the Book",
  // Part III. From the Reformation by Nehemiah to the Closing of the Canon.
  "Neh. 1; 2. 1-11",
  "Neh. 2. 12, to end; 3. to 6",
  "Neh. 12. 27-43",
  "Neh. 7. 1-4",
  "Neh. 7. 5, to end; 8. to 11; 12. 1-9, and 44, to end; 13. 1-3; Ps. 1; 119",
  "Mal. 1; 2; 3. 1-15",
  "Neh. 13. 4, to end",
  "Mal. 3. 16, to end; 4",
  "1 Chron. 1. to 9; Neh. 12. 10-26",
];


const all = SECTIONS.map((s, i) => ({ section: s, readings: parseSection(s, i) }));

console.log(`sections: ${SECTIONS.length}`);
console.log(`readings: ${all.reduce((n, s) => n + s.readings.length, 0)}`);
if (problems.length) {
  for (const p of problems) console.log(`  [${p.index}] ${p.why}
      in: ${p.section}`);
}

// Verse-by-verse check against the bundled KJV. A mistranscribed run shows up
// here at once as a block of unread verses.
const OT = ["Genesis","Exodus","Leviticus","Numbers","Deuteronomy","Joshua","Judges","Ruth","1 Samuel","2 Samuel","1 Kings","2 Kings","1 Chronicles","2 Chronicles","Ezra","Nehemiah","Esther","Job","Psalms","Proverbs","Ecclesiastes","Song of Solomon","Isaiah","Jeremiah","Lamentations","Ezekiel","Daniel","Hosea","Joel","Amos","Obadiah","Jonah","Micah","Nahum","Habakkuk","Zephaniah","Haggai","Zechariah","Malachi"];
const KNOWN_GAPS = 26; // Townsend's own omissions; see the header.
const seen = new Map();
for (const s of all) for (const r of s.readings) {
  for (let c = r.c1; c <= r.c2; c++) {
    const vmax = verses.get(`${r.book}|${c}`);
    if (!vmax) throw new Error(`no such chapter: ${r.book} ${c}`);
    const from = c === r.c1 && r.v1 != null ? r.v1 : 1;
    const to = c === r.c2 && r.v2 != null ? r.v2 : vmax;
    for (let v = from; v <= to; v++) seen.set(`${r.book}|${c}|${v}`, true);
  }
}
let total = 0;
const unread = [];
for (const book of OT) {
  for (let c = 1; c <= chapters.get(book); c++) {
    for (let v = 1; v <= verses.get(`${book}|${c}`); v++) {
      total++;
      if (!seen.has(`${book}|${c}|${v}`)) unread.push(`${book} ${c}:${v}`);
    }
  }
}
console.log(`Old Testament verses read: ${total - unread.length} of ${total}`);
if (unread.length !== KNOWN_GAPS) {
  throw new Error(`expected ${KNOWN_GAPS} unread verses, found ${unread.length}: ${unread.slice(0, 30).join(", ")}`);
}

// --- emit -------------------------------------------------------------------

/** "Psalm" in a label, "Psalms" as the book name -- as the bundled plans have it. */
const labelBook = (name) => (name === "Psalms" ? "Psalm" : name);

function label(book, c1, v1, c2, v2) {
  const b = labelBook(book);
  if (v1 == null && v2 == null) return c1 === c2 ? `${b} ${c1}` : `${b} ${c1}-${c2}`;
  if (c1 === c2) return v2 == null || v2 === v1 ? `${b} ${c1}:${v1 ?? 1}` : `${b} ${c1}:${v1 ?? 1}-${v2}`;
  if (v1 == null) return `${b} ${c1}-${c2}:${v2}`;
  return v2 == null ? `${b} ${c1}:${v1}-${c2}` : `${b} ${c1}:${v1}-${c2}:${v2}`;
}

/**
 * Townsend writes "1 Chron. 21. 6, 7" for two consecutive verses and
 * "Exod. 25; 26; 27" for three consecutive chapters. Joining runs that are
 * adjacent and ascending turns those into one reading each -- the same text in
 * the same order, one link instead of three. A run that doubles back (his
 * "Gen. 4. 1-16, 24, 17-25", where verse 24 is deliberately read early) is left
 * alone, since merging it would undo the arrangement.
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
  code: "townsend_ot",
  title: "The Old Testament in Chronological Order (Townsend)",
  description:
    "George Townsend's arrangement of 1821, built on the chronicle of John Lightfoot of the Westminster Assembly: the whole Old Testament re-ordered so that it reads as one connected history, with Job set among the patriarchs, Chronicles woven into Samuel and Kings, each prophet placed in the reign he preached in, and the psalms set beside the occasions that produced them. One of Townsend's own sections a day.",
  length_days: days.length,
  days,
};

const OUT = join(ROOT, "reference", "reading_plans", "sources", "townsend_ot.json");
writeFileSync(OUT, JSON.stringify(plan, null, 1) + "\n");
console.log(`\n${OUT}: ${days.length} days, ${days.reduce((n, d) => n + d.readings.length, 0)} readings`);
