// One-time extractor: the International Standard Bible Encyclopedia (1915)
// from its CrossWire SWORD module into reference/isbe/{a..z}.json.
//
//   node tools/extract-isbe.mjs [path/to/ISBE.zip]
//
// Run this once; its output is committed, exactly as reference/dictionary/
// is. The app never downloads anything -- this script does, at development
// time, and only the finished JSON ships.
//
// The module is public domain (DistributionLicense=Public Domain in its
// isbe.conf) and its text is TEI with a vocabulary of five tags:
// entryFree, p, ref, hi, lb. Every scripture citation is already tagged
// `<ref osisRef="Bible:Exod.6.20">`, and every internal cross-reference
// `<ref target="ISBE:ALEPH">`, so nothing here has to guess at a reference.

import { createHash } from "node:crypto";
import { inflateRawSync, inflateSync } from "node:zlib";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const MODULE_URL = "https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/ISBE.zip";
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(REPO_ROOT, "reference", "isbe");

// ---------------------------------------------------------------- zip reading

/** Minimal stored/deflated zip reader -- enough for the four module files. */
function readZip(buf) {
  const files = new Map();
  // Walk the central directory backwards from the end-of-central-directory record.
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("not a zip file (no end-of-central-directory record)");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("corrupt central directory");
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    // The local header repeats the name/extra with its own lengths.
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);
    // Method 0 is stored; 8 is the headerless deflate zip uses.
    files.set(name, method === 0 ? raw : inflateRawSync(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

// ------------------------------------------------------------ zLD module read

/**
 * SWORD's compressed lexicon/dictionary format.
 *
 *   .idx  8 bytes per entry: u32 offset into .dat, u32 length
 *   .dat  at that offset: "KEY\r\n", then u32 block number, u32 entry index
 *   .zdx  8 bytes per block: u32 offset into .zdt, u32 compressed length
 *   .zdt  concatenated zlib streams; an inflated block is
 *         u32 entryCount, then (u32 offset, u32 length) per entry
 *
 * Note the .zdx record is 8 bytes, not the 12 the SWORD sources imply --
 * assuming 12 decodes block 0 and then dies with Z_DATA_ERROR.
 */
function readModule(files) {
  const base = "modules/lexdict/zld/isbe/isbe";
  const get = (ext) => {
    const f = files.get(base + ext);
    if (!f) throw new Error(`module is missing ${base}${ext}`);
    return f;
  };
  const idx = get(".idx"), dat = get(".dat"), zdx = get(".zdx"), zdt = get(".zdt");

  const blocks = new Map();
  const block = (n) => {
    if (!blocks.has(n)) {
      const off = zdx.readUInt32LE(n * 8);
      const len = zdx.readUInt32LE(n * 8 + 4);
      blocks.set(n, inflateSync(zdt.subarray(off, off + len)));
    }
    return blocks.get(n);
  };

  const entries = [];
  for (let i = 0; i < idx.length / 8; i++) {
    const off = idx.readUInt32LE(i * 8);
    const len = idx.readUInt32LE(i * 8 + 4);
    const rec = dat.subarray(off, off + len);
    const nl = rec.indexOf(0x0a);
    if (nl < 0) continue;
    const key = rec.subarray(0, nl).toString("utf8").trim();
    const blockNo = rec.readUInt32LE(nl + 1);
    const entryNo = rec.readUInt32LE(nl + 5);
    const blk = block(blockNo);
    const eOff = blk.readUInt32LE(4 + entryNo * 8);
    const eLen = blk.readUInt32LE(8 + entryNo * 8);
    const text = blk.subarray(eOff, eOff + eLen).toString("utf8").replace(/\0+$/, "");
    if (key && text.trim()) entries.push({ key, text });
  }
  return entries;
}

// --------------------------------------------------------------- headword work

const SMALL_WORDS = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "nor", "of",
  "on", "or", "the", "to", "with", "upon", "unto", "into",
]);

/** "ABOMINATION, BIRDS OF" -> "Abomination, Birds of"; "ABEL-MAIM" -> "Abel-Maim". */
function titleCase(key) {
  const words = key.toLowerCase().split(/(\s+)/);
  let isFirst = true;
  return words
    .map((w) => {
      if (/^\s+$/.test(w)) return w;
      const bare = w.replace(/[^a-z0-9]/g, "");
      const small = SMALL_WORDS.has(bare);
      const capitalize = isFirst || !small;
      isFirst = false;
      if (!capitalize) return w;
      // Capitalize the first letter of each hyphen-separated part, but not
      // after an apostrophe ("aaron's" -> "Aaron's", not "Aaron'S").
      return w.replace(/(^|[-–(])([a-z])/g, (_, pre, ch) => pre + ch.toUpperCase());
    })
    .join("");
}

/**
 * Finds the article a cross-reference means.
 *
 * Targets are not always the keys verbatim: they cite one headword of a
 * combined entry ("ABGARUS" for "ABGAR; ABGARUS; ABAGARUS"), carry the
 * sentence's trailing period, or omit a disambiguating number. `index` holds
 * those forms, so this only has to try them in order.
 *
 * Nothing more speculative is attempted. Guessing that "PSALMS" means
 * "PSALMS, BOOK OF" would also rule that "LITERATURE" means "LITERATURE,
 * SUB-APOSTOLIC" -- but in ISBE that word is an article's own bibliography
 * heading, and the link would carry the reader somewhere the encyclopedia
 * never pointed. An unresolved target keeps its words and loses its link.
 */
function resolveKey(target, index) {
  const cleaned = target.trim().replace(/[.,;:\s]+$/, "").toUpperCase();
  return index.get(cleaned) ?? index.get(cleaned.replace(/\s*\(\d+\)$/, ""));
}

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "entry";
}

/**
 * Alternate headwords a reader might search for. ISBE packs several into one
 * key ("ABGAR; ABGARUS; ABAGARUS") and inverts others for alphabetization
 * ("ABOMINATION, BIRDS OF"), so both forms are indexed.
 */
function aliasesFor(key) {
  const out = new Set();
  for (const part of key.split(";")) {
    const headword = part.trim().replace(/\s*\(\d+\)\s*$/, "");
    if (!headword) continue;
    out.add(titleCase(headword));
    const comma = headword.split(",");
    if (comma.length === 2 && comma[1].trim()) {
      out.add(titleCase(`${comma[1].trim()} ${comma[0].trim()}`));
    }
  }
  return [...out];
}

// ------------------------------------------------------------- TEI -> HTML

const HEADING_AS = { underline: "h2", italic: "h3", bold: "h3" };
const INLINE_AS = { underline: "strong", italic: "em", bold: "strong" };

/** Turns the two <ref> forms into anchors the app already knows how to read. */
function convertRefs(text, slugForKey, stats) {
  let s = text;

  // Scripture. "Bible:Exod.6.20" and its ranges pass through to data-osis
  // verbatim, which is the form parseOsis() on the frontend already reads.
  s = s.replace(/<ref\s+osisRef="([^"]+)"\s*>([\s\S]*?)<\/ref>/g, (_, osis, label) => {
    stats.scripRefs++;
    return `<a class="scripref" data-osis="${escapeAttr(osis.replace(/^Bible:/, ""))}">${label}</a>`;
  });

  // Cross-references between articles.
  s = s.replace(/<ref\s+target="([^"]+)"\s*>([\s\S]*?)<\/ref>/g, (_, target, label) => {
    const m = /^ISBE:(.+)$/.exec(target);
    const slug = m ? resolveKey(m[1], slugForKey) : undefined;
    if (!slug) {
      stats.danglingRefs++;
      return label; // A target we can't resolve: keep the words, drop the link.
    }
    stats.isbeRefs++;
    return `<a class="isbe-link" data-isbe="${escapeAttr(slug)}">${label}</a>`;
  });

  // Any <ref> shape we didn't anticipate: keep its text, and count it, so a
  // change in the source can't pass unnoticed.
  s = s.replace(/<ref\b[^>]*>([\s\S]*?)<\/ref>/g, (_, label) => {
    stats.unknownRefs++;
    return label;
  });

  return s;
}

/**
 * TEI to HTML.
 *
 * This walks the markup rather than rewriting it with paired regexes, because
 * the source's <hi> tags are not reliably balanced -- there are entries where
 * one is closed by </em>, and others where it is never closed at all. A
 * regex pairing an open with the next close silently swallows whole
 * paragraphs when it meets one of those.
 *
 * ISBE's outline structure is carried by paragraphs whose entire content is a
 * single <hi>: `<p><hi rend="underline">I. Name.</hi></p>` is a section
 * heading, `<p><hi rend="italic">1. Various Forms:</hi></p>` a subsection.
 * A <hi> amid running text is only emphasis.
 */
function toHtml(text, slugForKey, stats) {
  const s = convertRefs(
    text.replace(/^\s*<entryFree\b[^>]*>/, "").replace(/<\/entryFree>\s*$/, ""),
    slugForKey,
    stats,
  );

  const out = [];
  /** Segments of the paragraph being built: { rend, html }. */
  let para = null;
  let rend = null; // The innermost open <hi>, if any.

  const openPara = () => {
    if (para) closePara();
    para = [];
  };
  const closePara = () => {
    if (!para) return;
    const segments = para;
    para = null;
    rend = null;
    // Whitespace-only segments still matter to the output (they are the
    // spaces between words), but not to what the paragraph *is*.
    const meaningful = segments.filter((seg) => seg.html.trim());
    if (!meaningful.length) return;

    // A paragraph that is nothing but one emphasis is a heading.
    const only = meaningful[0].rend;
    if (only && meaningful.every((seg) => seg.rend === only) && HEADING_AS[only]) {
      const tag = HEADING_AS[only];
      stats.headings++;
      out.push(`<${tag}>${segments.map((s) => s.html).join("").trim()}</${tag}>`);
      return;
    }
    // Coalesce neighbours sharing a rend, so a run doesn't come out as a
    // string of adjacent <em> elements.
    const runs = [];
    for (const seg of segments) {
      const last = runs[runs.length - 1];
      if (last && last.rend === seg.rend) last.html += seg.html;
      else runs.push({ ...seg });
    }
    const body = runs
      .map(({ rend: r, html }) => {
        const tag = r ? INLINE_AS[r] : null;
        return tag && html.trim() ? `<${tag}>${html}</${tag}>` : html;
      })
      .join("");
    out.push(`<p>${body.trim()}</p>`);
  };
  const push = (html) => {
    if (!para) openPara();
    para.push({ rend, html });
  };

  for (const [, tag, textRun] of s.matchAll(/(<[^>]*>)|([^<]+)/g)) {
    if (textRun !== undefined) {
      push(textRun.replace(/\s*\n\s*/g, " "));
      continue;
    }
    const name = /^<\/?\s*([a-zA-Z][a-zA-Z0-9]*)/.exec(tag)?.[1]?.toLowerCase();
    const isClose = tag.startsWith("</");
    switch (name) {
      case "p":
        isClose ? closePara() : openPara();
        break;
      case "hi":
        if (isClose) rend = null;
        else rend = /rend="([^"]*)"/.exec(tag)?.[1] ?? null;
        break;
      // The source closes some <hi> elements with the tag it renders as
      // instead of its own; treat those as the close they were meant to be.
      case "em":
      case "i":
      case "b":
      case "strong":
        if (isClose) rend = null;
        else stats.strayInline++;
        break;
      case "lb":
        push("<br>");
        break;
      case "a":
        push(tag);
        break;
      default:
        stats.leftoverTags.set(tag, (stats.leftoverTags.get(tag) ?? 0) + 1);
    }
  }
  closePara();

  return out.join("");
}

function escapeAttr(s) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function toPlainText(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A stub article -- "a'-a-lar. See ALTAR." -- is worth following rather than
 * reading. Detected structurally: one short paragraph whose only substance is
 * a cross-reference.
 */
function redirectTarget(html) {
  if (toPlainText(html).length > 220) return null;
  const paragraphs = html.match(/<p>/g);
  if (paragraphs && paragraphs.length > 1) return null;
  if (!/\bSee\b/.test(html)) return null;
  const links = [...html.matchAll(/data-isbe="([^"]+)"/g)];
  return links.length === 1 ? links[0][1] : null;
}

// ------------------------------------------------------------------- driver

async function loadModule(argPath) {
  if (argPath) {
    console.log(`reading ${argPath}`);
    return readFile(argPath);
  }
  console.log(`downloading ${MODULE_URL}`);
  const res = await fetch(MODULE_URL);
  if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const zipBuf = await loadModule(process.argv[2]);
  console.log(`  ${(zipBuf.length / 1048576).toFixed(1)}MB, sha256 ${createHash("sha256").update(zipBuf).digest("hex").slice(0, 16)}…`);

  const files = readZip(zipBuf);
  const conf = files.get("mods.d/isbe.conf")?.toString("utf8") ?? "";
  const license = /^DistributionLicense=(.*)$/m.exec(conf)?.[1]?.trim();
  const version = /^Version=(.*)$/m.exec(conf)?.[1]?.trim();
  console.log(`  module version ${version}, license: ${license}`);
  if (license !== "Public Domain") {
    throw new Error(`refusing to extract: expected a public-domain module, got "${license}"`);
  }

  const raw = readModule(files);
  console.log(`  ${raw.length} entries`);

  // The source carries 31 entries whose body is an empty <p>. Nothing can be
  // shown for them, so they are dropped here rather than becoming blank pages.
  const usable = raw.filter((e) => e.text.replace(/<[^>]+>/g, "").trim());
  const blank = raw.length - usable.length;

  // Pass 1: assign every entry a slug, and index every name a cross-reference
  // might use to reach it, so pass 2 can resolve them.
  const slugForEntry = new Map(); // exact key -> slug
  const crossRefIndex = new Map(); // any citable name -> slug
  const taken = new Set();
  for (const e of usable) {
    let slug = slugify(e.key);
    if (taken.has(slug)) {
      let n = 2;
      while (taken.has(`${slug}-${n}`)) n++;
      slug = `${slug}-${n}`;
    }
    taken.add(slug);
    slugForEntry.set(e.key, slug);
    const names = [e.key, ...e.key.split(";")].flatMap((n) => {
      const name = n.trim().toUpperCase();
      return [name, name.replace(/\s*\(\d+\)$/, "")];
    });
    for (const n of names) if (n && !crossRefIndex.has(n)) crossRefIndex.set(n, slug);
  }

  // Pass 2: convert.
  const stats = {
    scripRefs: 0, isbeRefs: 0, danglingRefs: 0, unknownRefs: 0,
    headings: 0, strayInline: 0, leftoverTags: new Map(),
  };
  const byLetter = new Map();
  let redirects = 0;
  for (const e of usable) {
    const body = toHtml(e.text, crossRefIndex, stats);
    if (!toPlainText(body)) continue;
    const redirect = redirectTarget(body);
    if (redirect) redirects++;
    const term = titleCase(e.key);
    const sortKey = e.key.replace(/^[^A-Z0-9]+/, "");
    const letter = /^[A-Z]/.test(sortKey) ? sortKey[0].toLowerCase() : "_";
    if (!byLetter.has(letter)) byLetter.set(letter, {});
    byLetter.get(letter)[e.key] = {
      key: e.key,
      term,
      slug: slugForEntry.get(e.key),
      sort_key: sortKey,
      aliases: aliasesFor(e.key).filter((a) => a !== term),
      body,
      redirect_slug: redirect,
    };
  }

  await mkdir(OUT_DIR, { recursive: true });
  const written = [];
  let total = 0, bytes = 0;
  for (const letter of [...byLetter.keys()].sort()) {
    const file = `${letter}.json`;
    const json = JSON.stringify(byLetter.get(letter), null, 1);
    await writeFile(path.join(OUT_DIR, file), json, "utf8");
    written.push(file);
    total += Object.keys(byLetter.get(letter)).length;
    bytes += Buffer.byteLength(json);
  }

  await writeFile(
    path.join(OUT_DIR, "_index.json"),
    JSON.stringify(
      {
        source: "International Standard Bible Encyclopedia (1915)",
        source_short: "ISBE",
        editor: "James Orr, General Editor",
        license: "Public Domain",
        origin: MODULE_URL,
        module_version: version,
        total_entries: total,
        total_scripture_refs: stats.scripRefs,
        total_cross_refs: stats.isbeRefs,
        redirect_entries: redirects,
        files: written,
      },
      null,
      1,
    ),
    "utf8",
  );

  console.log(`\nwrote ${total} entries to ${path.relative(REPO_ROOT, OUT_DIR)} (${(bytes / 1048576).toFixed(1)}MB across ${written.length} files)`);
  console.log(`  ${stats.scripRefs} scripture refs, ${stats.isbeRefs} cross-references, ${stats.headings} headings, ${redirects} "see also" stubs`);
  if (blank) console.log(`  ${blank} entries skipped as empty in the source`);
  if (stats.danglingRefs) console.log(`  ${stats.danglingRefs} cross-references to articles this edition doesn't carry (rendered as plain text)`);
  if (stats.strayInline) console.log(`  ${stats.strayInline} unbalanced emphasis tags repaired`);
  if (stats.unknownRefs) console.log(`  ${stats.unknownRefs} <ref> tags of an unrecognized shape (text kept)`);
  if (stats.leftoverTags.size) {
    console.log(`  WARNING unconverted tags: ${[...stats.leftoverTags].map(([t, n]) => `${t} x${n}`).join(", ")}`);
  }
}

await main();
