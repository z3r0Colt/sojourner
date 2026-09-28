// Syllables for the 1650 psalter's English: how many a word is sung in, and
// where it divides under the notes.
//
// A metrical psalm is sung to a fixed line length, so a line's syllable count
// is not a matter of taste -- "Common Metre" means 8.6.8.6 and nothing else.
// That makes this module checkable: `build-psalter.mjs` divides every stanza
// into lines by consuming exactly the metre's syllables per line, and a word
// counted wrongly shows up as a line that will not land, or as a line broken
// one word early.
//
// Where a word's syllables come from, in order:
//
//   1. `reference/psalter/syllables.json`, the psalter's own lexicon: every
//      word of the book, divided as a dictionary divides it ("a-gainst",
//      "tab-er-na-cles"), with any other count the word is known to be said
//      in ("pray-er/1": prayer is two syllables or one). It is made by
//      `tools/psalter-lexicon.mjs` from the Moby hyphenation list and the CMU
//      pronouncing dictionary; see that file.
//   2. A word the psalter shortens with an apostrophe is its full word with
//      the marked vowel taken out: "en'mies" is en-e-mies less one,
//      "deliv'rance" is de-liv-er-ance less one. "-'d", "-'st" and "'s" add no
//      syllable to the word they end ("turn'd" is sung as "turn").
//   3. Rules, for anything else (a name the lexicon lacks, a word the scan
//      mangled): the vowel groups, less a silent final e.
//
// The text's own conventions help. Elision is usually marked ("bless'd",
// "ev'n", "o'er", "pow'r"), so a spelled-out "-ed" is often sung as a
// syllable -- the opposite of modern English. Usually, not always: the book
// also sings "heaven" and "power" in one syllable unmarked, and "salvation"
// in three or in four. So a word does not have one count. It has a preferred
// count, and the others the book is known to use, each with a small cost, and
// the metre chooses among them (`variants`).

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const LEXICON = join(ROOT, "reference", "psalter", "syllables.json");

// ---------------------------------------------------------------- lexicon --

/** Reads the lexicon's entries: "tab-er-na-cles", or "pray-er/1" for a word
 *  also said in another count. */
export function parseLexicon(entries) {
  const map = new Map();
  for (const [word, value] of Object.entries(entries)) {
    const [division, ...alts] = value.split("/");
    map.set(word, { pieces: division.split("-"), alts: alts.map(Number) });
  }
  return map;
}

let lexicon = existsSync(LEXICON) ? parseLexicon(JSON.parse(readFileSync(LEXICON, "utf8"))) : new Map();
const cache = new Map();

/** Swaps the lexicon in -- its own generator starts from an empty one. */
export function useLexicon(map) {
  lexicon = map;
  cache.clear();
  analysed.clear();
}

/** The lower-case letters a word is looked up by: accents the scan added
 *  dropped, punctuation other than the apostrophe gone. */
export function keyOf(word) {
  return word
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z']/g, "");
}

// ------------------------------------------------------------------ rules --

// Which letters of a word are vowels. "y" is one after a consonant or at the
// end ("cry", "ly-ing", "might-y"), part of the vowel before it ("they",
// "joy"), and a consonant where it opens a syllable ("yea", "ye").
function vowelMask(w) {
  return [...w].map((c, i) => {
    if (/[aeiou]/.test(c)) return true;
    if (c !== "y") return false;
    const prev = w[i - 1];
    const next = w[i + 1];
    if (prev == null || prev === "'") return next == null || !/[aeiou]/.test(next);
    return true;
  });
}

// Vowel pairs sounded apart ("li-on", "cru-el", "po-et"). Most pairs are one
// sound ("great", "field", "boat"); where one of these is not, the lexicon
// has the word anyway.
const HIATUS = new Set(["ia", "io", "iu", "ua", "uo", "ui", "eo", "oe", "ya", "yo", "ye", "yi"]);

// The vowel groups of a word, as [start, end) letter ranges. A spelled-out
// "-ed" that modern English leaves silent is marked `optional`: counted
// short, but there to be opened if the metre asks.
function nuclei(w) {
  const mask = vowelMask(w);
  const groups = [];
  for (let i = 0; i < w.length; i++) {
    if (!mask[i]) continue;
    let j = i;
    // An apostrophe between two vowels marks a consonant let go, and the
    // vowels either side run together: "o'er", "e'er", "ta'en".
    while (j + 1 < w.length && (mask[j + 1] || (w[j + 1] === "'" && mask[j + 2]))) j++;
    groups.push({ start: i, end: j + 1 });
    i = j;
  }
  // "qu" and "gu" before a vowel are consonants: "quiet" is qui-et.
  for (const g of groups) {
    if (g.end - g.start > 1 && w[g.start] === "u" && /[qg]/.test(w[g.start - 1] ?? "")) g.start++;
  }
  const split = [];
  for (const g of groups) {
    let from = g.start;
    for (let k = g.start + 1; k < g.end; k++) {
      const pair = w.slice(k - 1, k + 1);
      // "be-ing", "do-ing", "go-eth", "do-est": a verb's ending after its
      // own final vowel is always a syllable of its own.
      const ending = /^(ing|eth|est)$/.test(w.slice(k)) && !/^(ee|ea|ie|ei|oi|ai|ay|ey|oy|oo)$/.test(pair);
      if (HIATUS.has(pair) || ending) {
        split.push({ start: from, end: k });
        from = k;
      }
    }
    split.push({ start: from, end: g.end });
  }

  // Silent endings: a final e after a consonant ("name", "grace") but not
  // "-le" after one ("ta-ble", "peo-ple") and not the only vowel ("the");
  // "-es" after most consonants ("names", but "pla-ces", "ta-bles"); "-ue"
  // after g and q ("tongue", "tongues"); "-ed" after all but t and d
  // ("turned", but "want-ed"). Each is kept as `optional`: not counted, but
  // there to be sounded where the metre asks ("fi-re", "turn-ed").
  const last = split.at(-1);
  if (split.length > 1 && last) {
    const tail = w.slice(last.start);
    const before = w[last.start - 1] ?? "";
    const syllabicL = before === "l" && !/[aeiouy]/.test(w[last.start - 2] ?? "");
    if (/^[gq]ue?s?$/.test(w.slice(last.start - 1)) && last.end - last.start <= 2) split.pop();
    else if (tail === "e" && !syllabicL) last.optional = true;
    else if (tail === "es" && !/[szxcgh]/.test(before) && !syllabicL) last.optional = true;
    else if (tail === "ed" && !/[td]/.test(before)) last.optional = true;
  }
  return split;
}

/** Counts a word by rule, for the words no lexicon entry covers. */
export function countByRules(word) {
  const w = keyOf(word);
  if (!w.replace(/'/g, "")) return 0;
  const groups = nuclei(w);
  return Math.max(1, groups.filter((g) => !g.optional).length);
}

// Consonants that can open a syllable together, so a division falls before
// them: "peo-ple", "a-gainst", "re-joice". Other pairs divide between the
// two: "pas-ture", "al-ways", "dwel-ling".
const ONSETS = new Set([
  "bl", "br", "ch", "cl", "cr", "dr", "fl", "fr", "gl", "gr", "ph", "pl", "pr", "sc", "sh", "sk", "sl",
  "sm", "sn", "sp", "st", "sw", "th", "tr", "tw", "wh", "wr", "qu", "gu", "thr", "shr", "chr", "scr",
  "spr", "str", "spl", "squ",
]);

/** Divides a word into `count` pieces by rule: one vowel group to a piece,
 *  and the consonants between two groups shared out so the next piece starts
 *  as an English syllable can. The pieces are the word's own letters and
 *  apostrophes, so they join back into it. */
export function ruleDivide(word, count = countByRules(word)) {
  const w = word.toLowerCase();
  const groups = nuclei(w);
  let active = groups.filter((g) => !g.optional);
  if (active.length < count) active = groups;
  active = active.map((g) => ({ ...g }));
  // Too many: run together the two groups with least between them.
  while (active.length > Math.max(count, 1)) {
    let best = 1;
    for (let i = 2; i < active.length; i++) {
      if (active[i].start - active[i - 1].end < active[best].start - active[best - 1].end) best = i;
    }
    active.splice(best - 1, 2, { start: active[best - 1].start, end: active[best].end });
  }
  // Too few: part a group of two or more vowels.
  while (active.length < count) {
    const at = active.findIndex((g) => g.end - g.start >= 2);
    if (at === -1) break;
    const g = active[at];
    active.splice(at, 1, { start: g.start, end: g.start + 1 }, { start: g.start + 1, end: g.end });
  }
  if (active.length <= 1) return [word];

  const breaks = [];
  for (let i = 1; i < active.length; i++) {
    const from = active[i - 1].end;
    const to = active[i].start;
    const letters = w.slice(from, to).replace(/'/g, "");
    // How many of the consonants between go forward to the next piece.
    let forward;
    if (!letters.length) forward = 0;
    else if (letters.length === 1) forward = letters === "x" ? 0 : 1;
    else if (letters.endsWith("ck")) forward = 0;
    else {
      forward = 1;
      for (let n = Math.min(3, letters.length); n >= 2; n--) {
        if (ONSETS.has(letters.slice(-n))) {
          forward = n;
          break;
        }
      }
    }
    let at = to;
    for (let kept = 0; kept < forward && at > from; ) {
      at--;
      if (w[at] !== "'") kept++;
    }
    // An apostrophe stays with the piece it follows: "en'-mies".
    while (at < to && w[at] === "'") at++;
    breaks.push(Math.max(at, (breaks.at(-1) ?? 0) + 1));
  }
  const pieces = [];
  let from = 0;
  for (const at of breaks) {
    if (at <= from || at >= word.length) continue;
    pieces.push(word.slice(from, at));
    from = at;
  }
  pieces.push(word.slice(from));
  return pieces;
}

// ----------------------------------------------------------- the psalter --

// Endings the book writes with an apostrophe that add no syllable to the word
// they end: "turn'd", "fill'st", "maintain'dst", "God's", "giv'n", "is't",
// "thou'rt", "thou'lt", "I'll".
const CLITIC_ENDINGS = /('d|'dst|'st|'s|s'|'n|'t|'rt|'lt|'ll|'re)$/;

/** A word's pieces by preference, in lower case, and the other counts the
 *  lexicon says it is said in. */
function lookup(w) {
  let result = cache.get(w);
  if (!result) {
    result = lookupUncached(w);
    cache.set(w, result);
  }
  return result;
}

function lookupUncached(w) {
  // "th'" is sung with the word after it: "th' uplifter" is th'up-lif-ter.
  if (w === "th'" || w === "t'") return { pieces: [], alts: [], source: "elision" };
  const hit = lexicon.get(w);
  if (hit) return { pieces: hit.pieces, alts: hit.alts, source: "lexicon" };
  // "house'", "Sion'": a possessive with its s let go adds nothing.
  if (/[a-z]'$/.test(w) && !w.endsWith("s'")) {
    const base = lookup(w.slice(0, -1));
    if (base.pieces.length) return { ...base, pieces: [...base.pieces.slice(0, -1), base.pieces.at(-1) + "'"] };
  }

  // Shortened at the end: the word left is divided, and the ending rides on
  // its last piece.
  const clitic = w.match(CLITIC_ENDINGS);
  if (clitic && w.length > clitic[0].length + 1) {
    // "foxes'", "kings'": the plural is the word, the apostrophe its mark.
    if (clitic[0] === "s'") clitic[0] = "'";
    const base = lookup(w.slice(0, -clitic[0].length));
    // "house's", "prince's": after a hiss the possessive is a syllable of
    // its own, as the plural is ("hou-ses").
    const last = base.pieces.at(-1) ?? "";
    if (clitic[0] === "'s" && /[aeiouy][^aeiouy]*(s|z|c|g)e$/.test(last)) {
      return { pieces: [...base.pieces.slice(0, -1), last.slice(0, -2), last.slice(-2) + "'s"], alts: [], source: base.source };
    }
    if (base.pieces.length) {
      return { pieces: [...base.pieces.slice(0, -1), base.pieces.at(-1) + clitic[0]], alts: base.alts, source: base.source };
    }
  }
  // "whate'er", "whosoe'er": a word and "e'er" (ever) run together.
  const ever = w.match(/^([a-z]{2,}?)(so)?e'er$/);
  if (ever && lexicon.has(ever[1])) {
    return { pieces: [...lexicon.get(ever[1]).pieces, ...(ever[2] ? ["so"] : []), "e'er"], alts: [], source: "lexicon" };
  }
  // A vowel taken out inside the word: "en'mies", "deliv'rance", "Isr'el".
  // Between two vowels the apostrophe marks a consonant let go instead
  // ("ne'er", "o'er", "ta'en"), and the rules run the vowels together.
  const inner = w.indexOf("'", 1);
  if (inner > 0 && inner < w.length - 1 && !/[aeiou]'[aeiou]/.test(w)) {
    for (const vowel of "eaiou") {
      const full = lexicon.get(w.slice(0, inner) + vowel + w.slice(inner + 1));
      if (full && full.pieces.length > 1) return { pieces: elide(full.pieces, inner), alts: [], source: "lexicon" };
    }
  }
  // "'gainst", "'mong", "'bove": the syllable lost was the first.
  if (w.startsWith("'") && w.length > 1) {
    const rest = lookup(w.slice(1));
    if (rest.pieces.length) return { pieces: ["'" + rest.pieces[0], ...rest.pieces.slice(1)], alts: [], source: rest.source };
  }
  const second = secondPerson(w);
  if (second) return second;
  return { pieces: ruleDivide(w), alts: [], source: "rules" };
}

// The old second person the lexicon's word list lacks, built on the verb it
// is made from so the stem stays whole: "girdedst" is gird-edst (as
// "girded" is gird-ed), "causedst" caus-edst, "castedst" cast-edst, and
// "settlest" is "settle" and -st, set-tlest. A spelled-out -edst after any
// letter but t or d can also be let go ("caus'dst"), which the metre may
// take; after t or d it is always a syllable.
function secondPerson(w) {
  const edst = w.match(/^([a-z]{2,})edst$/);
  if (edst) {
    const stem = edst[1];
    const base = lexicon.get(stem) ?? lexicon.get(stem + "e");
    if (base?.pieces.length) {
      const pieces = [...base.pieces];
      if (!lexicon.has(stem)) pieces[pieces.length - 1] = pieces.at(-1).replace(/e$/, "");
      if (!/[aeiouy]/.test(pieces.at(-1))) return null;
      pieces.push("edst");
      return { pieces, alts: /[td]$/.test(stem) ? [] : [pieces.length - 1], source: "lexicon" };
    }
  }
  // "settlest": "settle" and -st -- or, where only "settled" is listed
  // (set-tled), that word with its -d for -st.
  const st = w.match(/^([a-z]{2,}e)st$/);
  if (st) {
    const verb = lexicon.get(st[1]);
    if (verb?.pieces.length) return { pieces: [...verb.pieces.slice(0, -1), verb.pieces.at(-1) + "st"], alts: verb.alts, source: "lexicon" };
    const past = lexicon.get(st[1] + "d");
    if (past?.pieces.length > 1) return { pieces: [...past.pieces.slice(0, -1), past.pieces.at(-1).slice(0, -1) + "st"], alts: [], source: "lexicon" };
  }
  return null;
}

// Takes the letter at `at` out of a divided word, puts the apostrophe in its
// place, and folds any piece left without a vowel into a neighbour: its
// consonants forward where the next piece starts with a vowel ("Is-r'el",
// "de-liv'-rance"), otherwise back onto the piece before ("heav'n",
// "je-rus'-lem").
function elide(pieces, at) {
  const out = [];
  let pos = 0;
  for (const piece of pieces) {
    out.push(at >= pos && at < pos + piece.length ? piece.slice(0, at - pos) + "'" + piece.slice(at - pos + 1) : piece);
    pos += piece.length;
  }
  for (let i = 0; i < out.length && out.length > 1; i++) {
    if (/[aeiouy]/.test(out[i])) continue;
    const bare = out[i];
    if (i + 1 < out.length && /^[aeiouy]/.test(out[i + 1])) {
      const lead = bare.match(/^'*/)[0];
      if (i > 0) out[i - 1] += lead;
      out[i + 1] = (i > 0 ? bare.slice(lead.length) : bare) + out[i + 1];
    } else if (i > 0) out[i - 1] += bare;
    else out[i + 1] = bare + out[i + 1];
    out.splice(i, 1);
    i--;
  }
  return out;
}

// ------------------------------------------------ what the metre can ask --

// The ways the book lengthens or shortens a word beyond the counts the
// lexicon gives, each priced so the metre reaches for them only when the
// words as preferred will not fill the line:
//
//   sal-va-tion   -> sal-va-ti-on     -tion, -sion: the older four
//   gra-cious     -> gra-ci-ous       -ious, -eous, -ience, -ial, -iour
//   right-eous    -> right-e-ous
//   glo-ri-ous    -> glo-rious        two vowels sounded apart, run together
//   turned        -> turn-ed          a spelled-out -ed, sounded -- after a
//   de-stroyed    -> de-stroy-ed      vowel too ("pur-su-ed", "cri-ed")
//   bless-ed      -> bless'd          a sounded -ed, let go
//   heav-en       -> heav'n           -en, -er, -el after a vowel sound or v
//                                     ("seven", "power", "towers")
//   tab-er-na-cle -> tab'r-na-cle     an unstressed -er-, -or-, -our-
//   hon-our-a-ble -> hon'ra-ble       mid-word ("gen'ral", "vict'ry")
//
// They are not all equally likely, and where two readings of a couplet fill
// the metre equally well -- "Thy righteousness shall also be / declared by
// my tongue" or "Thy right-e-ous-ness shall also / be declared by my
// tongue" -- the likelier one should win. The prices follow how the book
// itself sings, as the Free Church of Scotland's text of it marks it (è for
// a sounded -ed, a diaeresis for a vowel pair sounded apart):
//
//   A spelled-out -ed is all but always sounded. The book writes "'d" where
//   it lets the ending go ("sham'd", "vex'd"), and of the 250 words it
//   leaves spelled out, 246 are marked sounded.
//   A vowel pair is usually sounded apart at the end of a line, where the
//   tune's last beat falls on the last syllable ("to all gen-er-a-ti-on"
//   rhymes with "upon"): 107 of the 111 -tion and -sion words ending a line
//   are marked so (the other four are feminine endings), and 15 of the 19
//   -ious, -eous and -iour words.
//   Inside a line it is rare: 14 of 180 -tion words, 9 of 102 -ious.
export const PRICE = { soundedEd: 0.25, openAtEnd: 0.5, openInside: 1.5, other: 1 };

function alternatives(pieces, atEnd = false) {
  const n = pieces.length;
  const out = new Map();
  const add = (count, cost) => {
    if (count >= 1 && count !== n && !(out.get(count) <= cost)) out.set(count, cost);
  };
  const word = pieces.join("");
  const last = pieces.at(-1) ?? "";
  if (openAt(pieces)) add(n + 1, atEnd ? PRICE.openAtEnd : PRICE.openInside);
  for (let i = 1; i < n; i++) {
    if (/[aeiouy]$/.test(pieces[i - 1]) && /^[aeiouy]/.test(pieces[i])) add(n - 1, PRICE.other);
    if (/^[^aeiouy]?e[nrl]s?$/.test(pieces[i]) && /([aeiouy]|v|w)$/.test(pieces[i - 1])) add(n - 1, PRICE.other);
    if (i < n - 1 && /^[^aeiouy]{0,2}(e|o|ou)[rnl]$/.test(pieces[i])) add(n - 1, PRICE.other);
  }
  if (/[a-z]ed$/.test(word) && !/eed$/.test(word) && /[aeiouy]/.test(last.slice(0, -2)) && !/[td]ed$/.test(word)) add(n + 1, PRICE.soundedEd);
  // "un-feign-ed-ly", "as-sur-ed-ly": the -ed inside an adverb is sounded.
  if (/[^aeiouytd]edly$/.test(word) && !pieces.some((p) => /^ed/.test(p))) add(n + 1, PRICE.soundedEd);
  if (/^ed$/.test(last) && n > 1 && !/[td]$/.test(pieces[n - 2])) add(n - 1, PRICE.other);
  return out;
}

// Where a piece holds two vowels the book can sound apart: "tion" (ti-on),
// "cious" (ci-ous), "eous" (e-ous), "tience" (ti-ence). Returns the piece and
// the letter to divide it before, or null.
function openAt(pieces) {
  for (let i = pieces.length - 1; i >= 0; i--) {
    const piece = pieces[i].toLowerCase();
    for (let k = 0; k < piece.length - 1; k++) {
      const pair = piece.slice(k, k + 3);
      const opens = /^i[aou]/.test(pair) || /^eou/.test(pair) || (/^ien/.test(pair) && /ien(ce|t)s?$/.test(piece));
      const before = k > 0 ? piece[k - 1] : (pieces[i - 1] ?? "").at(-1) ?? "";
      if (opens && before && !/[aeiouy]/.test(before) && !(k === 0 && i === 0)) {
        return { piece: i, at: k + 1 };
      }
    }
  }
  return null;
}

/** A word as the psalter sings it: its letters divided by preference, and
 *  every count the metre may take it at, each with its cost, preferred
 *  first -- `counts` inside a line, `countsAtEnd` where the word ends one. */
const analysed = new Map();

export function analyse(token) {
  let result = analysed.get(token);
  if (!result) {
    result = analyseUncached(token);
    analysed.set(token, result);
  }
  return result;
}

function analyseUncached(token) {
  const lead = token.match(/^[^A-Za-zÀ-ɏ']*/)[0];
  const rest = token.slice(lead.length);
  const trail = rest.match(/[^A-Za-zÀ-ɏ']*$/)[0];
  const core = rest.slice(0, rest.length - trail.length);
  if (!/[A-Za-zÀ-ɏ]/.test(core)) {
    const none = [{ n: 0, cost: 0 }];
    return { lead, core, trail, pieces: [], counts: none, countsAtEnd: none, source: "none" };
  }

  // A hyphenated compound is its parts, each divided on its own; the hyphen
  // rides on the part it follows ("dwell-ing-" "place").
  const parts = core.split(/(?<=-)/).filter((p) => /[A-Za-z]/.test(p) || p === "-");
  const pieces = [];
  // Each part's counts and their prices, inside a line and ending one.
  const partOptions = [];
  let source = "lexicon";
  for (const part of parts) {
    const bare = part.replace(/-+$/, "");
    const found = lookup(keyOf(bare));
    if (found.source === "rules") source = "rules";
    const partPieces = matchCase(found.pieces, bare);
    if (part.endsWith("-")) {
      if (partPieces.length) partPieces[partPieces.length - 1] += part.slice(bare.length);
      else pieces.length && (pieces[pieces.length - 1] += part);
    }
    pieces.push(...partPieces);
    const optionsFor = (atEnd) => {
      const options = new Map([[found.pieces.length, 0]]);
      for (const alt of found.alts) if (!options.has(alt)) options.set(alt, PRICE.other);
      if (found.pieces.length) for (const [n, c] of alternatives(found.pieces, atEnd)) if (!options.has(n)) options.set(n, c);
      return options;
    };
    partOptions.push({ inside: optionsFor(false), atEnd: optionsFor(true) });
  }
  const preferred = pieces.length;
  // Only the last part of a compound ends the line.
  const countsWhere = (atEnd) => {
    let counts = new Map([[0, 0]]);
    partOptions.forEach((o, k) => {
      const options = atEnd && k === partOptions.length - 1 ? o.atEnd : o.inside;
      const next = new Map();
      for (const [a, ca] of counts) {
        for (const [b, cb] of options) {
          if (!next.has(a + b) || next.get(a + b) > ca + cb) next.set(a + b, ca + cb);
        }
      }
      counts = next;
    });
    return [...counts]
      .map(([n, cost]) => ({ n, cost: n === preferred ? 0 : cost }))
      .filter((o) => o.n >= 1 || preferred === 0)
      // Only a count the word can be divided into for the notes.
      .filter((o) => o.n === preferred || dividedInto(pieces, o.n).length === o.n)
      .sort((a, b) => a.cost - b.cost || Math.abs(a.n - preferred) - Math.abs(b.n - preferred) || a.n - b.n);
  };
  return { lead, core, trail, pieces, counts: countsWhere(false), countsAtEnd: countsWhere(true), source };
}

// Carries the word's own letters (its capitals) onto pieces worked out in
// lower case. The pieces are the same letters, so lengths line up -- except
// where the scan left an accent the key dropped, which rides on the last.
function matchCase(pieces, original) {
  const out = [];
  let at = 0;
  for (const piece of pieces) {
    out.push(original.slice(at, at + piece.length));
    at += piece.length;
  }
  if (out.length && at < original.length) out[out.length - 1] += original.slice(at);
  return out.filter((p, i) => p || i === 0);
}

/** How many syllables a word is sung in, by preference. */
export function syllables(word) {
  return analyse(word).pieces.length;
}

/** Every count the metre may take a word at, cheapest first: [{n, cost}] --
 *  priced for the end of a line when `atEnd`. */
export function variants(word, atEnd = false) {
  return atEnd ? analyse(word).countsAtEnd : analyse(word).counts;
}

export function countText(text) {
  return text.split(/\s+/).filter(Boolean).reduce((sum, w) => sum + syllables(w), 0);
}

/** Divides a word into `count` pieces for setting under the notes, its
 *  punctuation riding on the first and last. Sung in fewer syllables than it
 *  is divided into, two pieces join where a vowel was let go ("glo-rious",
 *  "heav'n"); sung in more, a piece opens at a vowel pair ("sal-va-ti-on") or
 *  at a sounded -ed ("turn-ed"). A count of zero is "th'", which the caller
 *  joins to the word after it. */
export function splitWord(word, count) {
  if (count <= 0) return [];
  const { lead, trail, pieces, core } = analyse(word);
  const out = dividedInto(pieces.length ? pieces : [core || word], count);
  out[0] = lead + out[0];
  out[out.length - 1] += trail;
  return out;
}

// The pieces taken to `count`: joined where there are too many, opened where
// too few -- as far as the word allows.
function dividedInto(pieces, count) {
  let out = [...pieces];
  while (out.length > Math.max(count, 1)) out = mergeOne(out);
  while (out.length < count) {
    const opened = openOne(out);
    if (!opened) break;
    out = opened;
  }
  return out;
}

function mergeOne(pieces) {
  let at = -1;
  // Where two vowels meet ("glo-ri-ous"), else onto an unstressed -en, -er
  // or -el ("heav-en", "pow-er"), else the last two.
  for (let i = 1; i < pieces.length && at < 0; i++) {
    if (/[aeiouy]$/i.test(pieces[i - 1]) && /^[aeiouy]/i.test(pieces[i])) at = i;
  }
  for (let i = pieces.length - 1; i > 0 && at < 0; i--) {
    if (/^[^aeiouy]?e[nrl]s?'?s?-?$/i.test(pieces[i])) at = i;
  }
  if (at < 0) at = pieces.length - 1;
  return [...pieces.slice(0, at - 1), pieces[at - 1] + pieces[at], ...pieces.slice(at + 1)];
}

function openOne(pieces) {
  // A vowel pair a consonant opens: "tion" -> "ti-on", "cious" -> "ci-ous",
  // "eous" -> "e-ous".
  const open = openAt(pieces);
  if (open) {
    const piece = pieces[open.piece];
    return [...pieces.slice(0, open.piece), piece.slice(0, open.at), piece.slice(open.at), ...pieces.slice(open.piece + 1)];
  }
  // A sounded -ed: "turned" -> "turn-ed", "destroyed" -> "de-stroy-ed",
  // "unfeignedly" -> "un-feign-ed-ly".
  for (let i = pieces.length - 1; i >= 0; i--) {
    const ed = pieces[i].match(/^(.*[a-z])(ed(?:ly)?)$/i);
    if (ed && /[aeiouy]/i.test(ed[1]) && (i === pieces.length - 1 || /^ly$/i.test(pieces[i + 1]))) {
      return [...pieces.slice(0, i), ed[1], ed[2], ...pieces.slice(i + 1)];
    }
  }
  // Two vowels sounded apart inside one piece: "prayer" -> "pray-er".
  for (let i = pieces.length - 1; i >= 0; i--) {
    const halves = ruleDivide(pieces[i], 2);
    if (halves.length === 2) return [...pieces.slice(0, i), ...halves, ...pieces.slice(i + 1)];
  }
  return null;
}
