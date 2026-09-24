// Fetches the books of the shelves beyond the Puritan and Reformed one into
// the repo's flat `library/` folder, and writes `library/shelves/<id>.json`
// for each: what is on the shelf, where each file came from, and the terms it
// is here on. `build_library_pack --shelf <id>` builds a shelf's pack from that.
//
// Every book here is a real public-domain edition from a named source --
// CCEL's epubs of Schaff's Fathers and the 19th-century standards, Project
// Gutenberg's of the classical writers -- never a text reconstructed or
// summarized. Titles are the edition's own, read from the epub's metadata
// where a series has many volumes.
//
// There is no Reformers shelf. The Puritan and Reformed shelf already carries
// Luther, Calvin, Knox, Latimer, Cranmer, Melanchthon and Bullinger, and
// Calvin's commentaries are built into content.db; a separate shelf would
// ship the same words twice.
//
// Idempotent: a file already in library/ is not fetched again.
//
// Usage:
//   node tools/fetch-shelves.mjs [<shelf id> ...]
// Then, for each shelf:
//   npm run build:pack -- --shelf <id>

import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import JSZip from "jszip";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIBRARY = join(ROOT, "library");
const SHELVES = join(LIBRARY, "shelves");

const ccel = (path) => `https://ccel.org/ccel/${path[0]}/${path}/cache/${path.split("/").pop()}.epub`;
const gutenberg = (id) => `https://www.gutenberg.org/ebooks/${id}.epub3.images`;
const CCEL_TERMS = "Public domain (text); epub from the Christian Classics Ethereal Library";
const PG_TERMS = "Public domain in the USA; Project Gutenberg";

const range = (n) => Array.from({ length: n }, (_, i) => String(i + 1).padStart(2, "0"));

const SHELF_DEFS = {
  fathers: {
    name: "Church Fathers",
    description:
      "The Ante-Nicene Fathers and both series of the Nicene and Post-Nicene Fathers, as Roberts, Donaldson, Schaff and Wace edited them (1885-1900), with Lightfoot's Apostolic Fathers.",
    books: [
      // Not ANF 10: CCEL's volume 10 is the bibliography and index alone (its
      // Origen commentaries are in their volume 9), an empty book to a reader.
      ...range(9).map((v) => ({ url: ccel(`schaff/anf${v}`), author: "Roberts, Donaldson and Coxe (eds.)", sortKey: `ANF ${v}` })),
      ...range(14).map((v) => ({ url: ccel(`schaff/npnf1${v}`), author: "Philip Schaff (ed.)", sortKey: `NPNF1 ${v}` })),
      ...range(14).map((v) => ({ url: ccel(`schaff/npnf2${v}`), author: "Schaff and Wace (eds.)", sortKey: `NPNF2 ${v}` })),
      { url: ccel("lightfoot/fathers"), title: "The Apostolic Fathers", author: "J. B. Lightfoot" },
    ],
  },
  ancient: {
    name: "Ancient literature",
    description:
      "The writers around the Bible: Josephus (Whiston), Philo (Yonge), 1 Enoch (Charles, 1917), and the Roman historians who mention Christ and the church -- Tacitus, Pliny and Suetonius.",
    books: [
      { url: ccel("josephus/complete"), title: "The Works of Flavius Josephus", author: "Flavius Josephus (tr. William Whiston)" },
      { url: ccel("philo/works"), title: "The Works of Philo Judaeus", author: "Philo of Alexandria (tr. C. D. Yonge)" },
      { url: gutenberg(77935), title: "The Book of Enoch", author: "R. H. Charles (tr.)", terms: PG_TERMS },
      { url: gutenberg(7959), title: "The Reign of Tiberius, Out of the First Six Annals of Tacitus", author: "Tacitus (tr. Thomas Gordon)", terms: PG_TERMS },
      { url: gutenberg(2811), title: "Letters of Pliny", author: "Pliny the Younger (tr. William Melmoth)", terms: PG_TERMS },
      { url: gutenberg(6400), title: "The Lives of the Twelve Caesars", author: "Suetonius (tr. Alexander Thomson)", terms: PG_TERMS },
    ],
  },
  nineteenth: {
    name: "Nineteenth century",
    description:
      "Schaff's History of the Christian Church and Creeds of Christendom, and Edersheim's Life and Times of Jesus the Messiah, The Temple, and Sketches of Jewish Social Life.",
    books: [
      ...range(8).map((v) => ({ url: ccel(`schaff/hcc${Number(v)}`), author: "Philip Schaff", sortKey: `HCC ${v}` })),
      // CCEL's own metadata calls volume II "The History of Creeds" too.
      ...["The History of Creeds", "The Greek and Latin Creeds", "The Evangelical Protestant Creeds"].map((sub, i) => ({
        url: ccel(`schaff/creeds${i + 1}`),
        title: `The Creeds of Christendom, Volume ${"I".repeat(i + 1)}: ${sub}`,
        author: "Philip Schaff",
      })),
      { url: ccel("edersheim/lifetimes"), title: "The Life and Times of Jesus the Messiah", author: "Alfred Edersheim" },
      { url: ccel("edersheim/temple"), title: "The Temple: Its Ministry and Services", author: "Alfred Edersheim" },
      { url: ccel("edersheim/sketches"), title: "Sketches of Jewish Social Life", author: "Alfred Edersheim" },
    ],
  },
};

/** The epub's own title, from its package document. */
async function epubTitle(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const container = await zip.file("META-INF/container.xml")?.async("string");
  const opfPath = container?.match(/full-path="([^"]+)"/)?.[1];
  const opf = opfPath ? await zip.file(opfPath)?.async("string") : null;
  const raw = opf?.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/)?.[1];
  return raw ? decodeEntities(raw.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim() : null;
}

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Enough text to be a book, not a shell of empty chapters (see repair-ccel-epub.mjs). */
async function textLength(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  let n = 0;
  for (const name of Object.keys(zip.files)) {
    if (!/\.x?html?$/i.test(name)) continue;
    const html = await zip.file(name).async("string");
    n += html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").length;
  }
  return n;
}

const safeName = (title) =>
  title
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.+$/, "");

/** A file name for the title: the whole of it when short, otherwise cut at
 * the last comma or semicolon before 90 characters -- the ANF volumes' titles
 * list every work in them and would run past Windows' path limit. */
function fileNameFor(title) {
  const name = safeName(title);
  if (name.length <= 90) return name;
  const cut = name.slice(0, 90);
  const at = Math.max(cut.lastIndexOf(","), cut.lastIndexOf(";"));
  return (at > 30 ? cut.slice(0, at) : cut.slice(0, cut.lastIndexOf(" "))).trim();
}

async function exists(path) {
  try {
    return (await stat(path)).size > 0;
  } catch {
    return false;
  }
}

async function fetchShelf(id) {
  const def = SHELF_DEFS[id];
  if (!def) throw new Error(`no shelf ${id}; the shelves are ${Object.keys(SHELF_DEFS).join(", ")}`);
  const shelfPath = join(SHELVES, `${id}.json`);
  const known = new Map();
  try {
    for (const b of JSON.parse(await readFile(shelfPath, "utf8")).books) known.set(b.source_url, b);
  } catch {
    // A new shelf.
  }
  const books = [];
  const save = async (list) => {
    await mkdir(SHELVES, { recursive: true });
    await writeFile(shelfPath, JSON.stringify({ id, name: def.name, description: def.description, books: list }, null, 2) + "\n");
  };
  for (const spec of def.books) {
    const prior = known.get(spec.url);
    if (prior && (await exists(join(LIBRARY, prior.file_name)))) {
      books.push(prior);
      continue;
    }
    process.stdout.write(`${id}: ${spec.title ?? spec.sortKey} ... `);
    const res = await fetch(spec.url, { redirect: "follow" });
    if (!res.ok) throw new Error(`${spec.url}: HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    const chars = await textLength(bytes);
    if (chars < 20000) throw new Error(`${spec.url}: only ${chars} characters of text -- an empty CCEL epub?`);
    let title = spec.title ?? (await epubTitle(bytes)) ?? spec.sortKey;
    // CCEL's series titles lead with the volume code ("ANF01. The Apostolic
    // Fathers..."), sometimes "NPNF-211."; keep the code, which is how the
    // volumes are cited, in one form: "NPNF2 11: ...".
    title = title
      .replace(/^ANF-?(\d{1,2})\.\s*/i, (_, n) => `ANF ${n.padStart(2, "0")}: `)
      .replace(/^NPNF-?([12])-?(\d{2})\.\s*/i, (_, series, n) => `NPNF${series} ${n}: `);
    const fileName = `${fileNameFor(title)}.epub`;
    await writeFile(join(LIBRARY, fileName), bytes);
    console.log(`${(bytes.length / 1e6).toFixed(1)} MB, ${(chars / 1e6).toFixed(1)}M chars -> ${fileName}`);
    books.push({
      file_name: fileName,
      kind: "epub",
      title,
      author: spec.author ?? null,
      source_url: spec.url,
      license: spec.terms ?? CCEL_TERMS,
    });
  }
  await mkdir(SHELVES, { recursive: true });
  await writeFile(shelfPath, JSON.stringify({ id, name: def.name, description: def.description, books }, null, 2) + "\n");
  console.log(`${id}: ${books.length} books -> ${shelfPath}`);
}

const wanted = process.argv.slice(2);
for (const id of wanted.length ? wanted : Object.keys(SHELF_DEFS)) await fetchShelf(id);
