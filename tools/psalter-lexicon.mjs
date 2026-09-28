// Makes `reference/psalter/syllables.json`: every word of the 1650 psalter,
// divided into the syllables it is sung in.
//
// Counting syllables by rule gets English wrong often enough to matter here
// ("tabernacles" is four, "people's" two, "lying" two), and a word counted
// wrong puts a stanza's line break in the wrong place and its words under the
// wrong notes. So the psalter's words are looked up rather than guessed:
//
//   The Moby Hyphenation List (Grady Ward, 1993; public domain by the
//   author's grant; Project Gutenberg ebook 3204) divides 187,000 English
//   words into syllables: "a-gainst", "be-fore", "re-joice", "dwell-ing".
//   Its divisions are what go under the notes.
//
//   The CMU Pronouncing Dictionary (Carnegie Mellon University, BSD
//   licence) gives each word's pronunciations. A word said more than one
//   way ("prayer" in one syllable or two, "every" in two or three) gets its
//   other counts noted, for the metre to choose between. For a word Moby
//   lacks, CMU's count decides how many pieces the rules divide it into.
//
// Only the psalter's own words are kept, so the file is small and is the
// thing to read or correct when a word is divided wrongly. A word Moby does
// not list ("nations", "tabernacles", "walketh") is built from one it does
// ("na-tion" + s, "tab-er-na-cle" + s, "walk" + eth). Words still not found are
// left to the rules in `psalter-syllables.mjs`, and listed at the end.
//
// The two dictionaries are fetched once into .cache/psalter-lexicon/.
//
// Run: node tools/psalter-lexicon.mjs   (after npm run build:psalter, so the
// psalter's corrected words are included; run the build again after it)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { keyOf, ruleDivide, useLexicon } from "./psalter-syllables.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, ".cache", "psalter-lexicon");
const OUT = join(ROOT, "reference", "psalter", "syllables.json");
const SOURCES = {
  moby: { file: "mhyph.txt", url: "https://www.gutenberg.org/files/3204/files/mhyph.txt" },
  cmu: { file: "cmudict.dict", url: "https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict" },
};
const PSALTER = join(ROOT, "reference", "psalter", "scottish_metrical_1650.json");

async function source({ file, url }) {
  const path = join(CACHE, file);
  if (!existsSync(path)) {
    mkdirSync(CACHE, { recursive: true });
    console.log(`fetching ${url}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    writeFileSync(path, Buffer.from(await response.arrayBuffer()));
  }
  return path;
}

// Moby separates syllables with the byte 0xA5; entries of more than one word
// ("a cappella") are of no use here. Some words are listed twice, once with
// only the points a printer may break at ("founda-tion") and once with every
// syllable ("foun-da-tion"), and some beside a name or a foreign word spelled
// the same ("A-te", the goddess, beside "ate"; "fi-ne", the musical term,
// beside "fine"). The common word is kept before the name, then the entry
// said in CMU's usual count, then the fullest division.
function readMoby(path, cmu) {
  const all = new Map();
  for (const line of readFileSync(path, "latin1").split(/\r?\n/)) {
    if (!line || line.includes(" ")) continue;
    const name = /^[A-Z]/.test(line);
    const pieces = line.toLowerCase().split("\u00a5");
    const word = pieces.join("");
    if (!/^[a-z]+$/.test(word)) continue;
    // A few entries divide an abbreviation letter by letter ("A-M", "I-S").
    if (!pieces.every((piece) => /[aeiouy]/.test(piece))) continue;
    if (!all.has(word)) all.set(word, []);
    all.get(word).push({ pieces, name });
  }
  const map = new Map();
  for (const [word, entries] of all) {
    const usual = cmu.get(word)?.[0];
    const score = (e) => (e.name ? 0 : 100) + (e.pieces.length === usual ? 10 : 0) + e.pieces.length;
    map.set(word, tidy(entries.reduce((a, b) => (score(b) > score(a) ? b : a)).pieces));
  }
  return map;
}

// Moby divides for print ("tab-er-nac-le"); a singer divides before the
// consonant a final "-le" syllable begins with ("tab-er-na-cle").
function tidy(pieces) {
  const out = [...pieces];
  const n = out.length;
  if (n > 1 && /^les?$|^led$/.test(out[n - 1]) && /[aeiouy][^aeiouy]$/.test(out[n - 2])) {
    out[n - 1] = out[n - 2].slice(-1) + out[n - 1];
    out[n - 2] = out[n - 2].slice(0, -1);
  }
  return out;
}

// Each pronunciation's syllable count is its number of stressed-or-not
// vowels (the phonemes carrying a digit). The first pronunciation is the
// usual one.
function readCmu(path) {
  const map = new Map();
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const [head, ...phones] = line.split(" ");
    if (!head || !phones.length) continue;
    const word = head.replace(/\(\d+\)$/, "");
    const n = phones.filter((p) => /\d/.test(p)).length;
    if (!map.has(word)) map.set(word, []);
    if (!map.get(word).includes(n)) map.get(word).push(n);
  }
  return map;
}

// Every word of the built psalter, split at hyphens, as the syllable module
// will look it up -- and for each word the book shortens with an apostrophe,
// the word it ends ("turn'd" -> turn) and the full word ("en'mies" ->
// enemies), which is what the module divides the short form from. The full
// words are guesses, one per vowel, so only those a dictionary knows are
// kept.
function vocabulary(known) {
  const words = new Set();
  const guesses = new Set();
  const add = (token) => {
    for (const part of token.split(/[-\u2014]/)) {
      const bare = keyOf(part).replace(/^'+|'+$/g, "");
      if (!/[a-z]/.test(bare)) continue;
      if (!bare.includes("'")) {
        words.add(bare);
        continue;
      }
      const clitic = bare.match(/('d|'dst|'st|'s|s'|'n|'t|'rt|'lt|'ll|'re)$/);
      if (clitic) add(bare.slice(0, -clitic[0].length));
      const inner = bare.indexOf("'", 1);
      if (inner > 0 && inner < bare.length - 1 && !/[aeiou]'[aeiou]/.test(bare)) {
        for (const v of "aeiou") guesses.add(bare.slice(0, inner) + v + bare.slice(inner + 1));
      }
    }
  };
  const psalter = JSON.parse(readFileSync(PSALTER, "utf8"));
  for (const psalm of psalter) {
    for (const setting of psalm.versions) {
      const texts = [...setting.verses.map(([, text]) => text), ...(setting.stanzas ?? []).flatMap((s) => s.lines.map((l) => l.text))];
      for (const text of texts) for (const token of text.split(/\s+/)) add(token);
    }
  }
  for (const guess of guesses) if (!guess.includes("'") && known(guess)) words.add(guess);
  return [...words].filter((w) => /[aeiouy]/.test(w)).sort();
}

// Builds a word Moby lacks from one it has: "nations" from na-tion,
// "walketh" from walk, "places" from place. The ending either rides on the
// stem's last piece ("na-tions", "turned") or is a syllable of its own
// ("walk-eth", "dwell-ing", "want-ed", "pla-ces"); a doubled consonant goes
// with the ending ("sit-teth"), and a stem's silent e gives way to it
// ("lov-eth").
const undouble = (s) => s.replace(/([bdfgklmnprtz])\1$/, "$1");
const stemsOf = (base) => [...new Set([base, base + "e", undouble(base)])].filter((s) => s.length >= 2);
const withLast = (pieces, last) => [...pieces.slice(0, -1), last];

// A new syllable after the stem: the stem loses a silent e, and gives the
// ending the consonant that was doubled for it.
function newSyllable(pieces, word, stem, ending) {
  const head = word.slice(0, word.length - ending.length); // "cleav", "sitt", "walk"
  const joined = pieces.join("");
  let last = pieces.at(-1);
  let doubled = "";
  if (joined.endsWith("e") && head === joined.slice(0, -1)) last = last.slice(0, -1);
  else if (head.startsWith(joined)) doubled = head.slice(joined.length);
  else return null;
  return [...pieces.slice(0, -1), last, doubled + ending].filter(Boolean);
}

const RULES = [
  // mercies, iniquities, carried; mightiest, holiness, happily
  {
    ending: /i(es|ed|est|eth|er|ers|ness|ly|ful)$/,
    stems: (base) => [base + "y"],
    join: (p, w, stem, m) =>
      /^i(es|ed)$/.test(m) ? withLast(p, p.at(-1).replace(/y$/, m)) : [...withLast(p, p.at(-1).replace(/y$/, "i")), m.slice(1)],
  },
  // walketh, loveth, sitteth, goeth, lovest
  { ending: /(eth|est)$/, stems: stemsOf, join: (p, w, stem, m) => newSyllable(p, w, stem, m) },
  // dwelling, coming, running
  { ending: /ing$/, stems: stemsOf, join: (p, w, stem, m) => newSyllable(p, w, stem, m) },
  // wanted, hated, committed are sounded; turned, loved are not
  {
    ending: /ed$/,
    stems: stemsOf,
    join: (p, w, stem) =>
      /[td]$/.test(w.slice(0, -2)) ? newSyllable(p, w, stem, "ed") : withLast(p, p.at(-1) + w.slice(p.join("").length)),
  },
  // churches, witnesses; places, praises, judges
  {
    ending: /es$/,
    stems: (base) => [base, base + "e"].filter((s) => s.length >= 2),
    join: (p, w, stem) => {
      if (/(s|x|z|ch|sh)$/.test(stem)) return [...p, "es"];
      if (/[cgsz]e$/.test(stem)) {
        const last = p.at(-1).slice(0, -1);
        return last.length > 1 ? [...p.slice(0, -1), last.slice(0, -1), last.slice(-1) + "es"] : null;
      }
      return withLast(p, p.at(-1) + w.slice(p.join("").length));
    },
  },
  // nations, tabernacles, kings
  { ending: /s$/, stems: (base) => [base], join: (p) => withLast(p, p.at(-1) + "s") },
  // uprightness, gloriously, faithfully, kingdom; wiser, higher
  {
    ending: /(ness|ly|fully|ful|less|ments|ment|ship|wards|ward|dom|hood|some|ers|er|est)$/,
    stems: stemsOf,
    join: (p, w, stem, m) => {
      if (/^(er|ers|est)$/.test(m)) return newSyllable(p, w, stem, m);
      if (!w.startsWith(stem)) return null;
      return [...p, ...(m === "fully" ? ["ful", "ly"] : [m])];
    },
  },
];
const PREFIXES = /^(un|up|re|dis|mis|out|over|with|fore|for|be|in|en|a)/;

function derive(word, moby, depth = 0) {
  if (moby.has(word)) return moby.get(word);
  if (depth > 2 || word.length < 3) return null;
  // Moby spells as Webster did: "honor", "savior". The psalter's "honour",
  // "saviour" divide the same way, the u riding in the piece with the o.
  if (/our/.test(word)) {
    const american = derive(word.replace(/our/g, "or"), moby, depth + 1);
    if (american) {
      let rest = word;
      const out = american.map((piece) => {
        const spelled = piece.replace(/or/, (m) => (rest.startsWith(piece.replace(/or/, "our")) ? "our" : m));
        rest = rest.slice(spelled.length);
        return spelled;
      });
      if (out.join("") === word) return out;
    }
  }
  for (const rule of RULES) {
    const m = word.match(rule.ending);
    if (!m) continue;
    const base = word.slice(0, m.index);
    for (const stem of rule.stems(base)) {
      if (stem === word) continue;
      const pieces = derive(stem, moby, depth + 1);
      if (!pieces) continue;
      const out = rule.join(pieces, word, stem, m[0]);
      if (out && out.join("") === word && out.every((piece) => /[aeiouy]/.test(piece))) return out;
    }
  }
  const prefix = word.match(PREFIXES)?.[0];
  if (prefix && word.length - prefix.length >= 3) {
    const rest = derive(word.slice(prefix.length), moby, depth + 1);
    if (rest) return [...(moby.get(prefix) ?? [prefix]), ...rest];
  }
  // A closed compound of two common words: "handmaid", "sheepfold". Both
  // halves must be words the pronouncing dictionary knows too, or Moby's
  // rarer entries ("pur") split words that are not compounds at all.
  for (let i = word.length - 3; i >= 3; i--) {
    const a = moby.get(word.slice(0, i));
    const b = moby.get(word.slice(i));
    if (a && b && common(word.slice(0, i)) && common(word.slice(i))) return [...a, ...b].every((piece) => /[aeiouy]/.test(piece)) ? [...a, ...b] : null;
  }
  return null;
}

// Words the dictionaries divide for another language or another age. Each
// is the psalter's own count, which the metre of every line it stands in
// bears out.
const OVERRIDES = {
  canaan: "ca-na-an/2", // "the land of Ca-na-an"; Moby and CMU have the modern two
  baal: "ba-al/1", // "They unto Ba-al-pe-or did"
  pharaoh: "pha-ra-oh/2", // "Was proud king Pha-ra-oh"
  zeeb: "ze-eb", // "Like Oreb and like Ze-eb make"
  clave: "clave", // "he clave the rocks" -- CMU has only the Spanish word
  // The book sings "con-tin-ual-ly" in four every time it has the word (the
  // Free Church text slurs "ual" onto one note, all 22 times), so four is
  // its usual length here, and Moby's five only what the metre may ask for.
  continually: "con-tin-ual-ly/5",
};

const cmu = readCmu(await source(SOURCES.cmu));
const moby = readMoby(await source(SOURCES.moby), cmu);
const common = (word) => word.length >= 4 && cmu.has(word);
useLexicon(new Map());

const entries = {};
const missing = [];
for (const word of vocabulary((w) => moby.has(w) || cmu.has(w))) {
  const counts = cmu.get(word) ?? [];
  let pieces = derive(word, moby);
  if (OVERRIDES[word]) {
    entries[word] = OVERRIDES[word];
    continue;
  }
  // Where Moby and CMU disagree, Moby is usually dividing a fuller form the
  // book also uses ("Is-ra-el", "fa-mil-i-ar") and CMU's count becomes an
  // alternative. Two cases are Moby's mistakes: a short word it divides as
  // some other language's ("sa-id", "gra-ve", "va-le", "co-mes"), and an
  // inflection it lists undivided ("changes", "faces"). CMU counts the r of
  // "fire", "desire", "power" as a syllable where the book does not, so those
  // keep Moby's division.
  if (pieces && counts.length && !counts.includes(pieces.length)) {
    const n = pieces.length;
    const foreign = n === 2 && counts.every((c) => c === 1) && word.length <= 5;
    const undivided = n === 1 && Math.min(...counts) > 1 && !/(ire|our|ower|ier|yer|ior|iar)/.test(word);
    if (foreign || undivided) pieces = ruleDivide(word, counts[0]);
  }
  if (!pieces && counts.length) pieces = ruleDivide(word, counts[0]);
  if (!pieces) {
    missing.push(word);
    continue;
  }
  // CMU's other counts, where they are other ways of saying the word -- not
  // the spelling-out of an abbreviation ("us" as U.S., "am" as A.M.), and
  // not a count two away from the division, which is a different word.
  const alts = word.length <= 3 ? [] : counts.filter((n) => n !== pieces.length && n > 0 && Math.abs(n - pieces.length) === 1);
  entries[word] = pieces.join("-") + alts.map((n) => `/${n}`).join("");
}

writeFileSync(OUT, JSON.stringify(entries, null, 0).replace(/","/g, '",\n"').replace(/^\{/, "{\n").replace(/\}$/, "\n}\n"));
console.log(`wrote ${OUT}: ${Object.keys(entries).length} words`);
console.log(`  ${missing.length} not in either dictionary (left to the rules): ${missing.slice(0, 60).join(" ")}${missing.length > 60 ? " ..." : ""}`);
