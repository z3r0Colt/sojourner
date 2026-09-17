// Adds books from a nested personal epub library into the repo's flat
// `library/` folder, and records each one in `library/manifest.json`.
//
// `library::collect` (npm run library:collect) already does this for books a
// reader added *through the app*, reading the titles and authors back out of
// their user.db. This is for the other case: a folder of epubs organized as
// `Shelf/Author/Book.epub` that the app has never seen, where the title and
// author have to come from the paths themselves.
//
// Three things it does that a plain copy would not:
//
//   * Skips what the app already has -- by file name, by title, and by shelf,
//     since a folder of Calvin's commentaries duplicates the ThML commentary
//     set that is built into content.db, and re-adding them as epubs would
//     put the same words in the library twice under a worse reader.
//   * Skips epubs with no usable text. Some are page images with no HTML at
//     all; others are CCEL downloads that came out structurally perfect and
//     empty, which `repair-ccel-epub.mjs` exists to refill. Either way a book
//     that cannot be read and cannot be searched should not ship.
//   * Builds a real title and author out of the path, because `Vol 1.epub`
//     under `Robert Traill/Works (EPUB)/` is not a title, and two authors
//     both have a file by that name.
//
// Dry by default: it prints what it would add and changes nothing. Pass
// --apply to copy the files and write the manifest.
//
// Usage:
//   node tools/stage-library-books.mjs [<source dir>] [--apply] [--verbose]
//
// Defaults to ../epublibrary beside the repo. Afterwards, rebuild the pack:
//   npm run build:pack

import { readFile, writeFile, copyFile, readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, basename, extname, relative, sep } from "node:path";
import JSZip from "jszip";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIBRARY = join(ROOT, "library");
const MANIFEST = join(LIBRARY, "manifest.json");

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const VERBOSE = args.includes("--verbose");
const SOURCE = args.find((a) => !a.startsWith("--")) ?? join(ROOT, "..", "epublibrary");

/** Shelves whose second path segment is a person, not a category. */
const AUTHOR_SHELVES = new Set(["Puritans", "Puritan-Adjacent", "Reformers", "Reformed Heritage"]);

/**
 * Whole subtrees the app already carries through a better path -- as
 * structured, cross-referenced data rather than as a book to page through.
 * The same list `src-tauri/src/bin/import_epub_library.rs` keeps, for the
 * same reasons.
 */
const DUPLICATED_BY_CORE = [
  // Translations are first-class in the Reading view; the same text as a
  // generic epub would be clutter beside the real thing. Goodspeed and
  // Weymouth are the exception: neither ships as a translation.
  { test: (p) => p.startsWith(`Bibles${sep}`) && !/Goodspeed|Weymouth/.test(p), why: "bibles/*.xml" },
  // Calvin's commentaries and Matthew Henry's are both bundled as ThML.
  { test: (p) => p.includes(`John Calvin${sep}Commentary on`) || p.includes(`John Calvin${sep}Harmony of the Law`), why: "commentaries/calvin" },
  { test: (p) => p.includes(`Matthew Henry${sep}`), why: "commentaries/matthew henry" },
  // The Standards are structured documents with proof texts; their three
  // commentaries are folded into the Confessions view itself.
  { test: (p) => p.startsWith(`Westminster Standards${sep}`), why: "reference/westminster" },
  { test: (p) => /Canons of Dort|Heidelberg Catechism/.test(p), why: "reference/confessions" },
  { test: (p) => /(Easton|Smith)'s Bible/.test(p), why: "reference/dictionary" },
];

/** Authors a path cannot supply, for the handful of files that need one. */
const AUTHOR_OVERRIDES = [
  [/New Schaff-Herzog/, "Samuel Macauley Jackson (ed.)"],
  [/Dictionary of the Bible Vol/, "James Hastings (ed.)"],
  [/Dictionary of Christ and the Gospels/, "James Hastings (ed.)"],
  [/Hitchcock's Bible Names/, "Roswell D. Hitchcock"],
  [/Weymouth New Testament/, "Richard Francis Weymouth"],
  [/Nave's Topical Bible/, "Orville J. Nave"],
  // Both name themselves in the file name, but only by surname -- and
  // "Torrey's New Topical Textbook" does not name itself at all.
  [/Goodspeed/, "Edgar J. Goodspeed"],
  [/Torrey/, "R. A. Torrey"],
];

/** Below this many words, a book is a broken download, not a short book. */
const MIN_WORDS = 1000;

/** The Internet Archive's own per-page OCR notices, which are not prose. */
const OCR_BOILERPLATE =
  /The text on this page is estimated to be only [\d.]+% accurate|Created with hocr-to-epub[^\s]*/gi;

function normalizeTitle(s) {
  return (s ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|a|an|of|on|and|or|in|to|by|vol|volume)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path, out);
    else if (entry.isFile() && extname(entry.name).toLowerCase() === ".epub") out.push(path);
  }
  return out;
}

/**
 * How many words of prose an epub actually holds.
 *
 * The count is what separates a real book from the two failure modes worth
 * refusing: an epub of page images (no HTML at all, so zero), and a CCEL
 * download whose article files came out holding nothing but a page index
 * (a few dozen words across the whole book). OCR notices are stripped first
 * so a scanned-but-readable volume is not punished for its front matter.
 */
async function wordCount(path) {
  let zip;
  try {
    zip = await JSZip.loadAsync(await readFile(path));
  } catch {
    return 0;
  }
  const docs = Object.keys(zip.files).filter((n) => /\.x?html?$/i.test(n) && !zip.files[n].dir);
  let words = 0;
  for (const name of docs) {
    let html;
    try {
      html = await zip.files[name].async("string");
    } catch {
      continue;
    }
    const text = html
      .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(OCR_BOILERPLATE, " ");
    words += (text.match(/[A-Za-z']{2,}/g) ?? []).length;
    // Enough to tell a book from a shell; no reason to read the rest.
    if (words > MIN_WORDS * 5) return words;
  }
  return words;
}

/**
 * A title and author out of a path.
 *
 * Four shapes appear in a library organized this way:
 *
 *   Puritans/John Owen/Of Temptation.epub          author folder, plain title
 *   Puritans/Robert Traill/Works (EPUB)/Vol 1.epub author folder, collection
 *   .../Systematic Theology/Louis Berkhof - X.epub category folder, "A - T"
 *   .../New Schaff-Herzog .../Vol 01 - Aachen.epub collection, editor by name
 */
function describe(relPath) {
  const parts = relPath.split(sep);
  const stem = basename(relPath, extname(relPath));
  const shelf = parts[0];
  const parent = parts.length > 1 ? parts[parts.length - 2] : null;
  const grandparent = parts.length > 2 ? parts[parts.length - 3] : null;

  let author = null;
  let title = stem;

  const volume = stem.match(/^Vol[\s.]*0*(\d+)\s*(?:[-–]\s*(.+))?$/i);
  if (volume && parent) {
    const [, number, subtitle] = volume;
    const collection = parent.replace(/\s*\((EPUB|PDF)\)\s*$/i, "").trim();
    title = `${collection}, Vol. ${number}${subtitle ? ` (${subtitle.trim()})` : ""}`;
    // `Author/Works (EPUB)/Vol 1.epub` -- the author is above the collection.
    if (grandparent && AUTHOR_SHELVES.has(shelf)) author = grandparent;
  } else if (AUTHOR_SHELVES.has(shelf) && parent && parent !== shelf) {
    author = parent;
  }

  // "Louis Berkhof - Systematic Theology": the file names its own author.
  const named = title.match(/^(.{2,40}?)\s+[-–]\s+(.+)$/);
  if (!author && named) {
    author = named[1].trim();
    title = named[2].trim();
  }

  for (const [pattern, name] of AUTHOR_OVERRIDES) {
    if (pattern.test(relPath)) author = name;
  }
  return { title, author };
}

/** A file name that is safe on Windows and unique within the flat library. */
function fileNameFor(title, author, taken) {
  const clean = (s) => s.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim();
  let base = clean(title);
  if (taken.has(`${base.toLowerCase()}.epub`) && author) base = `${clean(author)} - ${base}`;
  let name = `${base}.epub`;
  let n = 2;
  while (taken.has(name.toLowerCase())) name = `${base} (${n++}).epub`;
  return name;
}

const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
const haveFiles = new Set(manifest.map((e) => e.file_name.toLowerCase()));
const haveTitles = new Set(manifest.map((e) => normalizeTitle(e.title)));

const found = (await walk(SOURCE)).sort();
console.log(`${found.length} epub(s) under ${SOURCE}`);
console.log(`${manifest.length} already in the shipped library\n`);

const added = [];
const skipped = { alreadyThere: 0, core: new Map(), noText: [] };

for (const path of found) {
  const rel = relative(SOURCE, path);
  const stem = basename(rel, extname(rel));

  if (haveFiles.has(basename(rel).toLowerCase()) || haveTitles.has(normalizeTitle(stem))) {
    skipped.alreadyThere++;
    continue;
  }
  const duplicated = DUPLICATED_BY_CORE.find((rule) => rule.test(rel));
  if (duplicated) {
    skipped.core.set(duplicated.why, (skipped.core.get(duplicated.why) ?? 0) + 1);
    continue;
  }

  const words = await wordCount(path);
  if (words < MIN_WORDS) {
    skipped.noText.push({ rel, words });
    continue;
  }

  const { title, author } = describe(rel);
  if (haveTitles.has(normalizeTitle(title))) {
    skipped.alreadyThere++;
    continue;
  }
  const fileName = fileNameFor(title, author, haveFiles);
  haveFiles.add(fileName.toLowerCase());
  haveTitles.add(normalizeTitle(title));
  added.push({ source: path, entry: { file_name: fileName, kind: "epub", title, author }, words });
}

console.log(`already in the library:      ${skipped.alreadyThere}`);
for (const [why, n] of [...skipped.core].sort((a, b) => b[1] - a[1])) {
  console.log(`duplicated by ${why.padEnd(28)} ${n}`);
}
console.log(`no usable text:              ${skipped.noText.length}`);
if (skipped.noText.length && VERBOSE) {
  for (const { rel, words } of skipped.noText) console.log(`    ${String(words).padStart(5)} words  ${rel}`);
}
console.log(`\nto add: ${added.length}\n`);

const byAuthor = new Map();
for (const { entry } of added) {
  const key = entry.author ?? "(no author)";
  byAuthor.set(key, [...(byAuthor.get(key) ?? []), entry.title]);
}
for (const [author, titles] of [...byAuthor].sort()) {
  console.log(`  ${author}`);
  for (const title of titles.sort()) console.log(`      ${title}`);
}

if (!APPLY) {
  console.log(`\nDry run. Nothing was copied. Re-run with --apply to add these ${added.length} book(s).`);
  process.exit(0);
}

for (const { source, entry } of added) {
  await copyFile(source, join(LIBRARY, entry.file_name));
  manifest.push(entry);
}
manifest.sort((a, b) => a.file_name.localeCompare(b.file_name));
await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

let bytes = 0;
for (const entry of manifest) bytes += (await stat(join(LIBRARY, entry.file_name))).size;
console.log(`\nAdded ${added.length}. The library now ships ${manifest.length} book(s), ${(bytes / 1e6).toFixed(1)} MB.`);
console.log("Next: npm run build:pack");
