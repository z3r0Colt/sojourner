// One-time extractor: A. T. Robertson's "A Harmony of the Gospels for
// Students of the Life of Christ" (1922) into reference/harmony/robertson.json.
//
//   node tools/extract-harmony.mjs [path/to/36264-h.htm]
//
// Run this once; its output is committed, exactly as the other reference/
// data is. The app never downloads anything -- this script does, at
// development time, and only the finished JSON ships.
//
// Robertson's Harmony was published in 1922 and is public domain in the
// United States. The transcription used here is Project Gutenberg #36264;
// only the public-domain work itself is extracted -- Gutenberg's own
// boilerplate, licence, and references are not reproduced, which is exactly
// what their terms ask of anyone redistributing the underlying text alone.
//
// Four things are pulled out, from two independent passes that get
// cross-checked against each other:
//
//   * the Analytical Outline -- the fourteen Parts, and every section in
//     order with its title and its citations. Robertson splits section 128
//     into 128a and 128b, so the 184 numbers cover 185 sections.
//   * the body of the Harmony -- each section's headnote (the place and
//     approximate date Robertson prints under the title: "Bethany beyond
//     Jordan. Probably A.D. 26") and its per-Gospel citations, which the
//     body states one column at a time and so more precisely than the
//     outline's single run-on line.
//   * Robertson's own footnotes on individual sections.
//   * the fourteen "Explanatory Notes on Points of Special Difficulty" --
//     essays on the genealogies, the date of the Nativity, whether Christ
//     ate the Passover, the hour of the crucifixion, and so on -- which the
//     section footnotes point into.
//
// Not extracted: the American Standard Version text Robertson sets in
// parallel columns (the app already has verse text for every bundled
// translation, and renders the harmony against whichever one the reader is
// using), his marginal notes on textual variants, and the appended lists of
// parables, miracles and Old Testament quotations.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SOURCE_URL = "https://www.gutenberg.org/files/36264/36264-h/36264-h.htm";
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_FILE = path.join(REPO_ROOT, "reference", "harmony", "robertson.json");

// ------------------------------------------------------------------- text

/** Strip tags and settle the entities the 1922 transcription actually uses. */
function text(html, { keepBreaks = false } = {}) {
  let s = html
    .replace(/<sup>.*?<\/sup>/gs, "")
    .replace(/<br\s*\/?>/gi, keepBreaks ? "\n" : " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#8212;/g, "—")
    .replace(/&#8217;/g, "’")
    .replace(/&#8216;/g, "‘")
    .replace(/&#8220;/g, "“")
    .replace(/&#8221;/g, "”");
  // Æ/æ is left as Robertson set it ("Machærus", "Cæsarea"): it is the
  // spelling of the edition, and folding it would quietly rewrite proper
  // names.
  if (keepBreaks) {
    return s
      .replace(/[ \t]+/g, " ")
      .split("\n")
      .map((l) => l.trim())
      .join("\n")
      .trim();
  }
  return s.replace(/\s+/g, " ").trim();
}

// ------------------------------------------------------------- references

// Robertson cites the Gospels, Acts 1 for the ascension, and 1 Cor. 15 for
// the appearances Paul lists that no Gospel records.
const BOOKS = {
  Matt: "Matthew",
  Mark: "Mark",
  Luke: "Luke",
  John: "John",
  Acts: "Acts",
  "1 Cor": "1 Corinthians",
};
const BOOK_RE = /\b(Matt|Mark|Luke|John|Acts|1 Cor)\.?\s*/g;

function label(book, cs, vs, ce, ve) {
  if (vs == null) return cs === ce ? `${book} ${cs}` : `${book} ${cs}-${ce}`;
  if (cs === ce) return ve == null || ve === vs ? `${book} ${cs}:${vs}` : `${book} ${cs}:${vs}-${ve}`;
  return `${book} ${cs}:${vs}-${ce}:${ve}`;
}

/** One book's citation text -> [chapterStart, verseStart, chapterEnd, verseEnd][]
 *
 * Every shape the Harmony uses:
 *   1:1-4            one range in one chapter
 *   12               a whole chapter
 *   15, 16           two whole chapters ("15 and 16" too)
 *   21:1-11, 14-17   two ranges, the chapter carried across the comma
 *   7:53 to 8:11     a range spanning chapters, spelled with "to"
 *   11:27-12:12      the same, spelled with a dash
 *   11:55-12:1, 9-11 a spanning range, then a range back inside chapter 12
 */
function parseCitation(book, spec) {
  const out = [];
  let chapter = null;
  // A bare number means a verse only once a colon has fixed which chapter we
  // are in: "21:1-11, 14-17" is two ranges of Matthew 21, while "15, 16"
  // with no colon anywhere is two whole chapters.
  let verseMode = false;
  // Within one book a semicolon separates ranges exactly as a comma does
  // ("Luke 3:19-20; 4:14"); the semicolons that separate books have already
  // been cut by the time this sees a spec.
  const pieces = spec
    .replace(/\band\b/g, ",")
    .replace(/[–—]/g, "-")
    .split(/[,;]/);
  for (let piece of pieces) {
    piece = piece.trim().replace(/[.;]+$/, "").trim();
    if (!piece) continue;
    let m;
    if ((m = /^(\d+):(\d+)\s*(?:-|to)\s*(\d+):(\d+)$/.exec(piece))) {
      const [cs, vs, ce, ve] = m.slice(1).map(Number);
      chapter = ce;
      verseMode = true;
      out.push([cs, vs, ce, ve]);
    } else if ((m = /^(\d+):(\d+)\s*-\s*(\d+)$/.exec(piece))) {
      const [cs, vs, ve] = m.slice(1).map(Number);
      chapter = cs;
      verseMode = true;
      out.push([cs, vs, cs, ve]);
    } else if ((m = /^(\d+):(\d+)$/.exec(piece))) {
      const [cs, vs] = m.slice(1).map(Number);
      chapter = cs;
      verseMode = true;
      out.push([cs, vs, cs, vs]);
    } else if ((m = /^(\d+)\s*-\s*(\d+)$/.exec(piece))) {
      const [a, b] = m.slice(1).map(Number);
      if (!verseMode) {
        out.push([a, null, b, null]);
        chapter = b;
      } else {
        out.push([chapter, a, chapter, b]);
      }
    } else if ((m = /^(\d+)$/.exec(piece))) {
      const n = Number(m[1]);
      if (!verseMode) {
        out.push([n, null, n, null]);
        chapter = n;
      } else {
        out.push([chapter, n, chapter, n]);
      }
    } else {
      throw new Error(`unparsed citation piece ${JSON.stringify(piece)} in "${book} ${spec}"`);
    }
  }
  return out;
}

/** A verse-range ordinal, for comparing and containment-testing readings.
 * A missing verse bound means the whole chapter, so it opens at verse 1 and
 * closes past any real verse number. */
const opens = (r) => r.chapter_start * 1000 + (r.verse_start ?? 1);
const closes = (r) => r.chapter_end * 1000 + (r.verse_end ?? 999);

/** Drop readings another reading of the same book already covers, and put
 * what is left in reading order.
 *
 * Robertson heads a column afresh whenever he breaks a section into scenes,
 * so a section can cite a range and then re-cite part of it: §128b gives
 * "Mark 11:1-11" for the triumphal entry and "Mark 11:11" again for the
 * return to Bethany at its end. The narrower citation says nothing the wider
 * one does not.
 *
 * Books keep the order Robertson prints them in -- he leads with Mark
 * through the Galilean ministry, which is his argument about the sources,
 * not an accident -- and each book's own ranges are sorted within that.
 */
function tidyReadings(readings) {
  const order = [];
  for (const r of readings) if (!order.includes(r.book)) order.push(r.book);
  const kept = readings.filter(
    (r, i) =>
      !readings.some(
        (o, j) =>
          j !== i &&
          o.book === r.book &&
          opens(o) <= opens(r) &&
          closes(o) >= closes(r) &&
          // Of two identical ranges keep the first, not neither.
          (opens(o) !== opens(r) || closes(o) !== closes(r) || j < i),
      ),
  );
  return kept.sort((a, b) => order.indexOf(a.book) - order.indexOf(b.book) || opens(a) - opens(b));
}

/** A full citation string -> reading records in the shape the importer reads. */
function parseRefs(str) {
  const hits = [...str.matchAll(BOOK_RE)];
  const readings = [];
  hits.forEach((hit, i) => {
    const book = BOOKS[hit[1]];
    const spec = str.slice(hit.index + hit[0].length, i + 1 < hits.length ? hits[i + 1].index : str.length);
    for (const [cs, vs, ce, ve] of parseCitation(book, spec)) {
      readings.push({
        book,
        chapter_start: cs,
        verse_start: vs,
        chapter_end: ce,
        verse_end: ve,
        label: label(book, cs, vs, ce, ve),
      });
    }
  });
  return readings;
}

/** True when a line is nothing but scripture citations. */
function isRefs(line) {
  if (!BOOK_RE.test(line)) {
    BOOK_RE.lastIndex = 0;
    return false;
  }
  BOOK_RE.lastIndex = 0;
  const rest = line.replace(BOOK_RE, "").replace(/\band\b/g, "");
  BOOK_RE.lastIndex = 0;
  return !/[A-Za-z]{3}/.test(rest);
}

// --------------------------------------------------------------- outline

/** The Analytical Outline: fourteen Parts, each with its sections in order. */
function parseOutline(raw) {
  const from = raw.indexOf("ANALYTICAL OUTLINE OF THE HARMONY");
  const to = raw.indexOf("TABLE FOR FINDING ANY PASSAGE");
  const parts = [];
  let current = null;
  for (const row of raw.slice(from, to).match(/<tr>.*?<\/tr>/gs) ?? []) {
    const tds = [...row.matchAll(/<td[^>]*>(.*?)<\/td>/gs)].map((m) => text(m[1]));
    const [a = "", b = ""] = tds;
    if (a.startsWith("PART")) {
      parts.push({ label: a.replace(/:$/, ""), title: b, sections: [] });
      current = null;
      continue;
    }
    const m = /^§?\s*(\d+)([ab]?)\s*:/.exec(a);
    if (m) {
      current = { key: m[1] + m[2], number: m[1] + m[2], title: b, refs: "" };
      parts[parts.length - 1].sections.push(current);
      continue;
    }
    // A citation line has no label cell. Sub-headings inside a section (the
    // Sermon on the Mount's eight groups, say) fail the citations-only test.
    if (!a && b && current && isRefs(b)) current.refs = `${current.refs} ${b}`.trim();
  }
  return parts;
}

// ------------------------------------------------------------------ body

/** Each section as the Harmony itself prints it: headnote, citations, notes.
 *
 * Robertson subdivides two sections -- the Sermon on the Mount (#54, in
 * eight groups) and the parables by the sea (#64) -- and every subdivision
 * carries its own anchor and its own parallel table. Those are not sections
 * in their own right (the Outline does not list them), so their content
 * folds into the parent, whose readings then legitimately run to several
 * disjoint ranges in one Gospel.
 */
function parseBody(raw, realKeys, bounds) {
  const { bodyStart, notesStart } = bounds;
  const anchors = [];
  const seen = new Set();
  for (const m of raw.slice(bodyStart, notesStart).matchAll(/<a name="section(\d+[ab]?)"><\/a>/g)) {
    const key = m[1];
    if (realKeys.has(key) && !seen.has(key)) {
      seen.add(key);
      anchors.push([key, m.index + bodyStart]);
    }
  }

  const out = new Map();
  anchors.forEach(([key, pos], i) => {
    const chunk = raw.slice(pos, i + 1 < anchors.length ? anchors[i + 1][1] : notesStart);
    const head = /<h[34][^>]*>(.*?)<\/h[34]>/s.exec(chunk);
    const title = head ? text(head[1]).replace(/^§\s*\d+[ab]?\.\s*/, "") : "";

    // Citations, one column at a time, from every parallel table in the span.
    // A table can carry more than one header row: §167 sets John's account
    // across all four columns first, then heads the synoptic columns
    // separately lower down. So every row whose cells are citations and
    // nothing else counts as a header, not just the first.
    const refs = [];
    const addRef = (t) => {
      if (isRefs(t) && !refs.includes(t)) refs.push(t);
    };
    for (const tbl of chunk.matchAll(/<table[^>]*summary="section[^"]*"[^>]*>(.*?)<\/table>/gs)) {
      for (const row of tbl[1].matchAll(/<tr>(.*?)<\/tr>/gs)) {
        const cells = [...row[1].matchAll(/<td[^>]*>(.*?)<\/td>/gs)].map((m) => text(m[1])).filter(Boolean);
        if (cells.length && cells.every(isRefs)) cells.forEach(addRef);
      }
    }
    // §176 heads Mark's column inside a table but sets Luke's much longer
    // account as running text under a <center> of its own, so loose
    // citations anywhere in the span count too.
    for (const cen of chunk.matchAll(/<center>(.*?)<\/center>/gs)) {
      for (const line of text(cen[1], { keepBreaks: true }).split("\n")) addRef(line);
    }

    // The headnote sits in a <center> between the title and the first table
    // or paragraph of text. Later <center>s in the span belong to a
    // subdivision or to the next Part's heading, so the search stops there.
    const afterHead = head ? head.index + head[0].length : 0;
    const rest = chunk.slice(afterHead);
    const stop = Math.min(
      ...[/<table[^>]*summary="section/, /<p[ >]/, /<h[34][ >]/]
        .map((re) => {
          const m = re.exec(rest);
          return m ? m.index : Infinity;
        }),
    );
    const headnote = [];
    const cen = /<center>(.*?)<\/center>/s.exec(rest.slice(0, stop === Infinity ? rest.length : stop));
    if (cen) {
      for (const line of text(cen[1], { keepBreaks: true }).split("\n")) {
        // Citations here are already collected above; what is left is the
        // place and date, minus any subdivision or Part heading (numbered,
        // parenthesised, or set in capitals).
        if (!line || isRefs(line)) continue;
        if (!/^[§(\d]/.test(line) && line !== line.toUpperCase()) headnote.push(line);
      }
    }

    // Robertson's own footnotes, lettered, often pointing at one of the
    // fourteen essays at the end of the Harmony. The lettering restarts at
    // each subdivision, so a section that absorbs its subdivisions can reach
    // here with three notes all called "a" -- re-letter in place, since the
    // superscripts these answer to live in verse text the app does not set.
    const notes = [];
    for (const m of chunk.matchAll(
      /<p><small><small><sup>([a-z])<\/sup><\/small>(.*?)<\/small><\/p>/gs,
    )) {
      const body = text(m[2]);
      const essay = /note\s*(\d+)/.exec(body);
      notes.push({ marker: m[1], text: body, essay: essay ? Number(essay[1]) : null });
    }
    if (new Set(notes.map((n) => n.marker)).size !== notes.length) {
      notes.forEach((n, i) => {
        n.marker = String.fromCharCode(97 + (i % 26));
      });
    }

    out.set(key, { title, headnote: headnote.join(" "), refs, notes });
  });
  return out;
}

// ------------------------------------------------------ explanatory notes

/** The fourteen essays. Split on the italic numbered title rather than on
 * the <a name="noteN"> anchors: note 1 carries no anchor at all and note
 * 14's title sits outside a <p>, so the anchors alone would drop both. */
function parseEssays(raw, notesStart) {
  const tail = raw.slice(notesStart, raw.indexOf("A LIST OF THE PARABLES OF JESUS", notesStart));
  const heads = [...tail.matchAll(/<i>(\d+)\.\s*([^<]+)<\/i>/g)];
  return heads.map((h, i) => {
    const body = tail.slice(h.index + h[0].length, i + 1 < heads.length ? heads[i + 1].index : tail.length);
    return {
      number: Number(h[1]),
      title: text(h[2]).trim(),
      paragraphs: [...body.matchAll(/<p>(.*?)<\/p>/gs)].map((m) => text(m[1])).filter(Boolean),
    };
  });
}

// ------------------------------------------------------------------ main

async function main() {
  const local = process.argv[2];
  const raw = local
    ? await readFile(local, "latin1")
    : await fetch(SOURCE_URL)
        .then((r) => {
          if (!r.ok) throw new Error(`${SOURCE_URL} -> HTTP ${r.status}`);
          return r.arrayBuffer();
        })
        .then((b) => Buffer.from(b).toString("latin1"));
  console.log(`read ${(raw.length / 1024).toFixed(0)}KB from ${local ?? SOURCE_URL}`);

  const bounds = {
    bodyStart: raw.indexOf('<a name="part1"'),
    notesStart: raw.indexOf("EXPLANATORY NOTES ON POINTS OF SPECIAL DIFFICULTY"),
  };
  const parts = parseOutline(raw);
  const outlineSections = parts.flatMap((p) => p.sections);
  const body = parseBody(raw, new Set(outlineSections.map((s) => s.key)), bounds);
  const essays = parseEssays(raw, bounds.notesStart);

  const warnings = [];
  const missing = outlineSections.filter((s) => !body.has(s.key));
  if (missing.length) warnings.push(`outline sections absent from the body: ${missing.map((s) => s.key).join(", ")}`);

  const sections = [];
  let order = 0;
  let fellBack = 0;
  let disagreed = 0;
  parts.forEach((part, partIndex) => {
    for (const s of part.sections) {
      const b = body.get(s.key) ?? { headnote: "", refs: [], notes: [] };
      // The body states citations one Gospel at a time and is preferred; the
      // outline's run-on line is the fallback for the handful of sections
      // whose body headnote gives none.
      let readings = tidyReadings(parseRefs(b.refs.join("; ")));
      if (!readings.length) {
        readings = tidyReadings(parseRefs(s.refs));
        if (readings.length) fellBack++;
      } else {
        const fromOutline = parseRefs(s.refs);
        const shape = (rs) => [...new Set(rs.map((r) => r.book))].sort().join(",");
        if (fromOutline.length && shape(readings) !== shape(fromOutline)) {
          disagreed++;
          warnings.push(
            `§${s.number}: body cites ${shape(readings) || "nothing"}, outline cites ${shape(fromOutline)}`,
          );
        }
      }
      if (!readings.length) warnings.push(`§${s.number} has no citations at all`);
      sections.push({
        order: ++order,
        number: s.number,
        part: partIndex + 1,
        // The outline's titles are the cleaner of the two -- the body's carry
        // footnote letters fused onto the last word ("THE ANNUNCIATIONa").
        title: titleCase(s.title || b.title),
        headnote: b.headnote || null,
        notes: b.notes.length ? b.notes : undefined,
        readings,
      });
    }
  });

  const out = {
    code: "robertson",
    title: "Robertson's Harmony of the Gospels",
    author: "A. T. Robertson",
    year: 1922,
    description:
      "The life of Christ in 185 sections across fourteen periods, from the Gospels' own prefaces to the ascension, each event placed and dated as far as the evidence allows. Built on the Broadus Harmony and the standard student's harmony for a century.",
    source_note:
      "A. T. Robertson, A Harmony of the Gospels for Students of the Life of Christ (New York: Harper & Brothers, 1922), based on the Broadus Harmony in the Revised Version. Published 1922 and in the public domain. Robertson's section divisions, titles, headnotes, footnotes and explanatory essays are reproduced; the American Standard Version text he sets in parallel columns is not, the app rendering each reading in the reader's own translation instead.",
    parts: parts.map((p, i) => ({ order: i + 1, label: p.label, title: titleCase(p.title) })),
    sections,
    essays,
  };

  await writeFile(OUT_FILE, JSON.stringify(out, null, 1), "utf8");

  const readings = sections.reduce((n, s) => n + s.readings.length, 0);
  const notes = sections.reduce((n, s) => n + (s.notes?.length ?? 0), 0);
  console.log(`wrote ${path.relative(REPO_ROOT, OUT_FILE)}`);
  console.log(`  ${parts.length} parts, ${sections.length} sections, ${readings} readings`);
  console.log(`  ${notes} section footnotes, ${essays.length} explanatory essays`);
  if (fellBack) console.log(`  ${fellBack} sections took their citations from the outline (no headnote in the body)`);
  if (disagreed) console.log(`  ${disagreed} sections where body and outline name different Gospels`);
  for (const w of warnings) console.log(`  WARNING ${w}`);
}

/** Robertson sets titles in full capitals; the app sets them in sentence
 * case like every other list in it. Roman numerals, initials and the divine
 * name have to survive the conversion. */
const KEEP_CAPS = new Set(["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "A.D.", "B.C.", "A.M.", "P.M.", "OT", "NT"]);
const LOWER = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "into", "nor", "of", "on", "or", "the", "to", "upon", "with"]);

function titleCase(s) {
  if (!s) return s;
  // Several of Robertson's titles are two sentences ("The First Retirement.
  // The Twelve Return..."), so a small word opens a title whenever the word
  // before it closed a sentence, not only at the very start.
  let opening = true;
  return s
    .split(/(\s+)/)
    .map((w) => {
      if (/^\s+$/.test(w)) return w;
      const bare = w.replace(/[^A-Za-z.]/g, "");
      const wasOpening = opening;
      opening = /[.:?!]$/.test(w) && !KEEP_CAPS.has(bare);
      if (KEEP_CAPS.has(bare)) return w;
      const lower = w.toLowerCase();
      return !wasOpening && LOWER.has(lower.replace(/[^a-z]/g, ""))
        ? lower
        : lower.replace(/([a-z])/, (c) => c.toUpperCase());
    })
    .join("");
}

await main();
