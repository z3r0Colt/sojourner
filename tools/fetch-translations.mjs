// Fetches the open-licensed modern translations into `bibles/usfm/<CODE>/`,
// where `build_content_db` picks them up beside the Zefania files.
//
// Every one of these is published in USFM, one file per book. What lands in
// the repo is that USFM with its word-level tagging removed and nothing else
// changed: `\w word|strong="H1234"\w*` becomes `word`, and unfoldingWord's
// alignment milestones (`\zaln-s ...\*`, `\zaln-e\*`, `\k-s`/`\k-e`) and
// chunk marks (`\ts\*`) go. Those tags are nine-tenths of the bytes -- ULT is
// 102 MB as published and about 6 MB without them -- and the app reads
// Strong's numbers from the tagged Greek and Hebrew, not from an English
// translation's guesses at them. Headings, poetry, footnotes and every word
// of the text are kept exactly as published.
//
// `source.json` in each folder records the name, code, licence, credit line
// and the URL and date the files came from; the importer reads it, and
// Settings → About shows the credit.
//
// Run: node tools/fetch-translations.mjs [CODE ...]

import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "bibles", "usfm");

// unfoldingWord's licence asks that a modified copy -- and removing the
// alignment is a modification -- not carry the unfoldingWord® mark in its
// name, and that it credit the original in the words given below. Their two
// texts are named here by their own abbreviations for that reason.
const SOURCES = [
  {
    code: "BSB",
    name: "Berean Standard Bible",
    year: 2023,
    license: "Public domain",
    credit: "The Holy Bible, Berean Standard Bible (BSB), dedicated to the public domain in 2023 by BSB Publishing.",
    url: "https://ebible.org/Scriptures/engbsb_usfm.zip",
  },
  {
    code: "LSV",
    name: "Literal Standard Version",
    year: 2020,
    license: "CC BY-SA 4.0",
    credit: "Literal Standard Version (LSV), © 2020 Covenant Press and the Covenant Christian Coalition, licensed CC BY-SA 4.0. Word-level tags removed; section headings not shown.",
    url: "https://ebible.org/Scriptures/englsv_usfm.zip",
  },
  {
    code: "ULT",
    name: "Literal Text (ULT)",
    year: 2022,
    license: "CC BY-SA 4.0",
    credit: "Adapted from the unfoldingWord® Literal Text, © unfoldingWord, licensed CC BY-SA 4.0. The original work by unfoldingWord is available from unfoldingword.org/ult. Changes: word alignment and tagging removed; section headings not shown.",
    url: "https://git.door43.org/unfoldingWord/en_ult/archive/master.zip",
  },
  {
    code: "UST",
    name: "Simplified Text (UST)",
    year: 2022,
    license: "CC BY-SA 4.0",
    credit: "Adapted from the unfoldingWord® Simplified Text, © unfoldingWord, licensed CC BY-SA 4.0. The original work by unfoldingWord is available from unfoldingword.org/ust. Changes: word alignment and tagging removed; section headings not shown.",
    url: "https://git.door43.org/unfoldingWord/en_ust/archive/master.zip",
  },
  {
    code: "LXX",
    name: "Septuagint (Brenton's Greek text)",
    year: 1851,
    license: "Public domain",
    credit:
      "The Septuagint in the Greek text printed by Sir Lancelot C. L. Brenton (1851), after the Vatican Codex. Public domain. The Psalms, Daniel and Nehemiah are laid out in English chapter and verse numbering; Jeremiah 25–52, which the Septuagint orders differently, Esther, whose Greek additions run through it, and the deuterocanonical books are not included.",
    url: "https://ebible.org/Scriptures/grcbrent_usfm.zip",
    renameBooks: { DAG: "DAN" },
    scope: "Old Testament",
    language: "grc",
    script: "greek",
    psalms_numbering: "lxx",
    adjust: [
      // Daniel 3:24-90 is the Song of the Three; English 3:24-30 is 3:91-97.
      { book: "DAN", chapter: 3, verses: [24, 90], action: "drop" },
      { book: "DAN", chapter: 3, verses: [91, 97], shift: -67 },
      // Brenton's Daniel 6:1 is the English 5:31.
      { book: "DAN", chapter: 6, verses: [1, 1], chapter_shift: -1, shift: 30 },
      { book: "DAN", chapter: 6, verses: [2, 29], shift: -1 },
      { book: "JER", chapters: [25, 52], action: "drop" },
      // 2 Esdras 11-23 is Nehemiah 1-13.
      { book: "EZR", chapters: [11, 23], chapter_shift: -10, to_book: "NEH" },
    ],
  },
  {
    code: "VUL",
    name: "Clementine Vulgate",
    year: 1598,
    license: "Public domain",
    credit:
      "The Clementine Vulgate (1592/1598). Public domain. From eBible.org's edition; its Glossa Ordinaria notes are not included. The Psalms are laid out in English chapter and verse numbering; the deuterocanonical books are not included.",
    url: "https://ebible.org/Scriptures/latVUC_usfm.zip",
    language: "la",
    script: "latin",
    footnotes: false,
    strip: "[]",
    psalms_numbering: "lxx",
    adjust: [
      { book: "DAN", chapter: 3, verses: [24, 90], action: "drop" },
      { book: "DAN", chapter: 3, verses: [91, 97], shift: -67 },
    ],
  },
];

// The 66 books the app carries, by USFM id, in canonical order. Anything else
// in a download (front matter, glossary, deuterocanon) is left behind.
const BOOKS = [
  "GEN", "EXO", "LEV", "NUM", "DEU", "JOS", "JDG", "RUT", "1SA", "2SA", "1KI", "2KI", "1CH", "2CH",
  "EZR", "NEH", "EST", "JOB", "PSA", "PRO", "ECC", "SNG", "ISA", "JER", "LAM", "EZK", "DAN", "HOS",
  "JOL", "AMO", "OBA", "JON", "MIC", "NAM", "HAB", "ZEP", "HAG", "ZEC", "MAL", "MAT", "MRK", "LUK",
  "JHN", "ACT", "ROM", "1CO", "2CO", "GAL", "EPH", "PHP", "COL", "1TH", "2TH", "1TI", "2TI", "TIT",
  "PHM", "HEB", "JAS", "1PE", "2PE", "1JN", "2JN", "3JN", "JUD", "REV",
];

/** Removes word-level tagging and alignment, keeping every word. */
export function slim(usfm) {
  return (
    usfm
      .replace(/^﻿/, "")
      // Alignment and chunk milestones carry no text of their own.
      .replace(/\\(?:zaln|k)-[se]\b[^\\]*?\\\*/g, "")
      .replace(/\\zaln-e\\\*/g, "")
      .replace(/\\ts\\\*/g, "")
      // `\w word|attrs\w*` and the nested `\+w` form: keep the word.
      .replace(/\\\+?w ([^|\\]*?)(?:\|[^\\]*?)?\\\+?w\*/g, "$1")
      // Alignment leaves words one per line; put the lines back together
      // where no marker begins the next one.
      .replace(/\r\n/g, "\n")
      .replace(/\n(?!\\)/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/ {2,}/g, " ")
  );
}

async function fetchZip(url) {
  // eBible refuses requests without a browser-like user agent for some files.
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Sojourner build tools)" } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return JSZip.loadAsync(Buffer.from(await res.arrayBuffer()));
}

async function fetchOne(src) {
  process.stdout.write(`${src.code}: ${src.url}\n`);
  const zip = await fetchZip(src.url);
  const dir = join(OUT, src.code);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  const found = new Map();
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || !entry.name.toLowerCase().endsWith(".usfm")) continue;
    const text = await entry.async("string");
    const id = /^﻿?\\id\s+(\S+)/m.exec(text)?.[1]?.toUpperCase();
    // Brenton gives Daniel as "DAG", the Greek Daniel with its additions;
    // its canonical chapters are Daniel's.
    const bookId = src.renameBooks?.[id] ?? id;
    const index = BOOKS.indexOf(bookId);
    if (index < 0) continue;
    found.set(bookId, true);
    const name = `${String(index + 1).padStart(2, "0")}-${bookId}.usfm`;
    const body = bookId === id ? slim(text) : slim(text).replace(/^\\id\s+\S+/m, `\\id ${bookId}`);
    await writeFile(join(dir, name), body, "utf8");
  }

  const missing = BOOKS.filter((b) => !found.has(b));
  const meta = {
    code: src.code,
    name: src.name,
    year: src.year,
    language: src.language ?? "en",
    script: src.script ?? "latin",
    direction: src.direction ?? "ltr",
    license: src.license,
    credit: src.credit,
    // Only a translation that does not cover all 66 books says so.
    scope: src.scope ?? null,
    // Import options (see SourceMeta in src-tauri/src/import/usfm.rs).
    ...(src.footnotes === false ? { footnotes: false } : {}),
    ...(src.strip ? { strip: src.strip } : {}),
    ...(src.psalms_numbering ? { psalms_numbering: src.psalms_numbering } : {}),
    ...(src.adjust ? { adjust: src.adjust } : {}),
    source_url: src.url,
    fetched: new Date().toISOString().slice(0, 10),
    books: found.size,
    missing_books: missing,
    changes: "Word-level Strong's tags and alignment milestones removed; text, headings, poetry and footnotes unchanged.",
  };
  await writeFile(join(dir, "source.json"), JSON.stringify(meta, null, 2) + "\n", "utf8");
  const files = await readdir(dir);
  process.stdout.write(`  ${files.length - 1} book(s)${missing.length ? `, missing ${missing.length}` : ""}\n`);
}

const wanted = process.argv.slice(2).map((s) => s.toUpperCase());
for (const src of SOURCES) {
  if (wanted.length && !wanted.includes(src.code)) continue;
  await fetchOne(src);
}
