// Refills a CCEL epub whose chapter files came out empty.
//
// library/ is deliberately not in the repo -- 145 MB of epub, and .gitignore
// says to keep a copy elsewhere because nothing here can rebuild it. That is
// fine for a book that was simply downloaded. It is not fine for one that was
// repaired by hand, which is why this exists: the fix lives in version control
// even though the file does not.
//
// The fault it repairs: an epub that is structurally perfect -- manifest,
// spine, TOC, cover, stylesheet all correct -- in which every chapter file is
// zero bytes. The book lists normally in the library, opens to blank pages, and
// is invisible to search, so nothing but a text-length query gives it away.
// "Epistles of St. Peter and St. Jude Preached and Explained" (Luther) shipped
// like that: 240 KB of file, 241,885 of which were the cover image.
//
// CCEL publishes that work as ThML and plain text but not as epub, so whoever
// generated the file built the structure correctly and the content extraction
// silently produced nothing. The epub's internal chapter names match CCEL's own
// HTML pages one for one, which is what makes the repair possible: each empty
// entry is refilled from the matching page, taking the <div id="theText">
// content and leaving CCEL's navigation and scripts behind.
//
// Usage:
//   node tools/repair-ccel-epub.mjs [<epub>] [<ccel base url>]
//
// Defaults to the Luther volume. Idempotent: an epub with no empty chapters is
// reported and left alone.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";
import JSZip from "jszip";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const EPUB =
  process.argv[2] ?? join(ROOT, "library", "Epistles of St. Peter and St. Jude Preached and Explained.epub");
const BASE = process.argv[3] ?? "https://ccel.org/ccel/luther/stpeter_stjude/";

const isChapter = (name) => /\.x?html?$/i.test(name);

/** The book text on a CCEL page is inside <div id="theText">. */
function contentDiv(page) {
  const start = page.indexOf('<div id="theText"');
  if (start < 0) return null;
  let depth = 0;
  const re = /<div\b|<\/div>/g;
  re.lastIndex = start;
  for (let m; (m = re.exec(page)); ) {
    depth += m[0] === "</div>" ? -1 : 1;
    if (depth === 0) return page.slice(start, re.lastIndex);
  }
  return null;
}

/** Drop CCEL's chapter navigation and any scripting; keep the prose. */
function clean(fragment) {
  return fragment
    .replace(/<div[^>]*class="[^"]*(?:chapnav|navchap|pb)[^"]*"[^>]*>[\s\S]*?<\/div>/gi, " ")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/(«|«|�)\s*Prev\b[\s\S]*?Next\s*(»|»|�)/gi, " ");
}

const textOf = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const zip = await JSZip.loadAsync(await readFile(EPUB));
const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
const chapters = names.filter(isChapter);

const empty = [];
for (const name of chapters) {
  const bytes = await zip.files[name].async("uint8array");
  if (bytes.length === 0) empty.push(name);
}
console.log(`${basename(EPUB)}: ${chapters.length} chapter files, ${empty.length} empty`);
if (empty.length === 0) {
  console.log("nothing to repair");
  process.exit(0);
}

const filled = new Map();
for (const name of empty) {
  const leaf = name.split("/").pop();
  const res = await fetch(BASE + leaf, { headers: { "User-Agent": "Mozilla/5.0 (library repair)" } });
  if (!res.ok) {
    console.log(`  ${leaf}: HTTP ${res.status}`);
    continue;
  }
  const fragment = contentDiv(await res.text());
  if (!fragment) {
    console.log(`  ${leaf}: no #theText on the page`);
    continue;
  }
  const body = clean(fragment);
  const doc =
    `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n` +
    `<html xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"/>` +
    `<link rel="stylesheet" type="text/css" href="ccel-epub.css"/><title>${leaf}</title></head>` +
    `<body>\n${body}\n</body></html>\n`;
  filled.set(name, doc);
  console.log(`  ${leaf}: ${textOf(body).length} chars of text`);
  await new Promise((r) => setTimeout(r, 400));
}

if (filled.size !== empty.length) {
  console.error(`only ${filled.size} of ${empty.length} chapters recovered; leaving the file alone`);
  process.exit(1);
}

// Rebuild. An epub must open with an uncompressed "mimetype" entry, so it goes
// in first and stored; everything else keeps its original order.
const out = new JSZip();
out.file("mimetype", await zip.files["mimetype"].async("uint8array"), { compression: "STORE" });
for (const name of names) {
  if (name === "mimetype") continue;
  const data = filled.has(name) ? filled.get(name) : await zip.files[name].async("uint8array");
  out.file(name, data, { compression: "DEFLATE" });
}
await writeFile(EPUB, await out.generateAsync({ type: "nodebuffer" }));

// Prove it, rather than trust it.
const check = await JSZip.loadAsync(await readFile(EPUB));
let total = 0;
for (const name of chapters) total += textOf(await check.files[name].async("string")).length;
const first = Object.keys(check.files)[0];
console.log(`\nrewrote ${basename(EPUB)}`);
console.log(`  first entry: ${first}`);
console.log(`  text recoverable from chapters: ${total} characters`);
if (first !== "mimetype") throw new Error("mimetype must be the first entry of an epub");
if (total === 0) throw new Error("still no text after the repair");
