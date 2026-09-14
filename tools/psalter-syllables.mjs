// Syllable counting for the 1650 psalter's English.
//
// A metrical psalm is sung to a fixed line length, so a line's syllable count
// is not a matter of taste -- "Common Metre" means 8.6.8.6 and nothing else.
// That makes this module checkable: `build-psalter.mjs` lineates all 150
// psalms by consuming exactly the metre's syllables per line, and any word
// counted wrongly makes a line fail to land. The rules below are what survive
// that test over ~51,000 words.
//
// The text's own conventions help. Elision is always marked with an
// apostrophe ("bless'd", "ev'n", "o'er", "pow'r"), so a spelled-out "-ed" is
// genuinely sung as a syllable -- the opposite of modern English.

// Words the rules get wrong and that are common enough to name. Compounds,
// proper names, and the handful of vowel pairs that refuse to generalise.
export const EXCEPTIONS = {
  quiet: 2,
  israel: 3,
  "israel's": 3,
  wherewith: 2,
  wherewithal: 3,
  fire: 1,
  fires: 1,
  hire: 1,
  higher: 2,
};

// Suffixes pronounced whole, leaving the stem to be counted on its own terms
// -- so "safety" is safe + ty (2), not sa-fe-ty (3).
const SUFFIXES = [
  ["fully", 2], ["ness", 1], ["ments", 1], ["ment", 1], ["less", 1],
  ["ful", 1], ["some", 1], ["hood", 1], ["ly", 1], ["ty", 1],
];

function splitSuffix(w) {
  for (const [suffix, n] of SUFFIXES) {
    if (w.length > suffix.length + 2 && w.endsWith(suffix)) return [w.slice(0, -suffix.length), n];
  }
  return [w, 0];
}

function countCore(w) {
  // "qu" and "gu" are consonant digraphs, not vowel pairs -- fold them away
  // so "quiet" reads as qui-et while "tongue" keeps one vowel nucleus.
  const folded = w.replace(/qu(?=[aeiouy])/g, "kw").replace(/gu(?=[aeiouy])/g, "g");
  const groups = folded.match(/[aeiouy]+/g);
  if (!groups) return 0;
  let n = groups.length;

  // Diaeresis: i or u before a back vowel is its own syllable ("glo-ri-ous",
  // "con-tin-u-al"). "ie" is excluded -- here it is a digraph far more often
  // than not ("grief", "shield", "chief", "mercies").
  for (const g of groups) n += (g.match(/[iu][aou]/g) ?? []).length;

  // Silent final e ("name", "are", "age") -- but not -le, and not when it is
  // the word's only vowel ("the", "he", "be", "ye").
  if (/[^aeiouy]e$/.test(folded) && !/[^aeiouy]le$/.test(folded) && folded.length > 2 && groups.length > 1) n--;
  // Silent -ue after g/q ("tongue", "plague").
  if (/[gq]ue$/.test(w)) n--;
  // "-es" silent after most consonants ("names" 1, but "places" 2). "-ed" is
  // deliberately absent: this text marks its elisions with an apostrophe.
  if (/[^aeiouyszxcgh]es$/.test(folded)) n--;

  return Math.max(1, n);
}

export function syllables(word) {
  let w = word.toLowerCase().replace(/[^a-z']/g, "");
  if (!w) return 0;
  if (EXCEPTIONS[w] != null) return EXCEPTIONS[w];

  // Archaic elisions: the apostrophe stands for a dropped vowel, so what is
  // left of the ending never makes a syllable of its own.
  w = w.replace(/'d$/, "d").replace(/'st$/, "st").replace(/'s$/, "s");
  w = w.replace(/^th'/, "").replace(/'/g, "");
  if (!w) return 0;
  if (EXCEPTIONS[w] != null) return EXCEPTIONS[w];

  // "there-" and "where-" are compounds whose first half keeps its own silent
  // e: "therefore" is there + fore (2), not there-fo-re (3).
  const compound = w.match(/^(there|where)(.+)$/);
  if (compound) return 1 + syllables(compound[2]);

  // -tion/-sion is two syllables here, not one. Metrical psalmody sings the
  // older "sal-va-ti-on", and the metre depends on it -- "in thy salvation"
  // has to fill a six-syllable line.
  if (w.length > 4) w = w.replace(/([tsc])ions?$/, "$1ion").replace(/[tsc]ious$/, "shus");
  w = w.replace(/ies$/, "ys");

  const [stem, extra] = splitSuffix(w);
  return extra ? Math.max(1, countCore(stem) + extra) : Math.max(1, countCore(w));
}

export function countText(text) {
  return text.split(/\s+/).filter(Boolean).reduce((sum, w) => sum + syllables(w), 0);
}

// Divides a word into exactly `count` pieces for setting under the notes --
// "sal-va-tion" against its three notes. The division is for singing from,
// not for a dictionary: it breaks after the consonant that follows each vowel
// group, which is where a singer moves to the next note.
// Consonant pairs that will not be broken, so the split falls before them:
// "peo-ple", not "peop-le". Kept to the blends and digraphs that genuinely
// cannot be divided -- pairs like "st" and "sp" do divide ("pas-tures").
const ONSETS = /^(bl|br|ch|cl|cr|dr|fl|fr|gl|gr|pl|pr|sh|th|tr|tw|wh|wr)/i;

export function splitWord(word, count) {
  if (count <= 1) return [word];

  const letters = [...word];
  const vowel = (c) => c != null && /[aeiouy]/i.test(c);
  // Each candidate break carries how good a place it is: splitting a
  // consonant cluster ("pas|tures") divides a word more naturally than
  // handing a lone consonant to the next syllable ("pastu|res").
  const candidates = [];
  const strength = new Map();
  const add = (at, weight) => {
    if (at <= 0 || at >= letters.length) return;
    if (!candidates.includes(at)) candidates.push(at);
    strength.set(at, Math.max(strength.get(at) ?? 0, weight));
  };

  for (let i = 1; i < letters.length; i++) {
    if (!vowel(letters[i - 1])) continue;
    if (vowel(letters[i])) {
      // Two vowels sounded apart -- "qui-et", "glo-ri-ous".
      if (letters[i - 1].toLowerCase() !== letters[i].toLowerCase()) add(i, 2);
      continue;
    }
    // A vowel has ended. Count the consonants before the next vowel: one goes
    // to the next syllable, two or more split unless they open a syllable
    // together.
    let end = i;
    while (end < letters.length && !vowel(letters[end])) end++;
    const run = letters.slice(i, end).join("");
    if (end >= letters.length) add(i + 1, 1); // word ends in consonants
    else if (run.length === 1) add(i, 1);
    else if (ONSETS.test(run)) add(i, 2);
    else add(i + 1, 2);
  }
  candidates.sort((a, b) => a - b);

  // Take the candidate nearest each evenly-spaced division, so a word is cut
  // where it reads rather than merely where it can be.
  const breaks = [];
  for (let piece = 1; piece < count; piece++) {
    const target = (letters.length * piece) / count;
    const free = candidates.filter((at) => !breaks.includes(at));
    if (!free.length) break;
    // Nearest to the even division, and where two are equally near, the one
    // that divides the word better.
    let best = free[0];
    for (const at of free) {
      const closer = Math.abs(at - target) - Math.abs(best - target);
      if (closer < 0 || (closer === 0 && (strength.get(at) ?? 0) >= (strength.get(best) ?? 0))) best = at;
    }
    breaks.push(best);
  }
  breaks.sort((a, b) => a - b);

  // Too few places to divide: fall back to even division, which only happens
  // on words the rules could not read.
  while (breaks.length < count - 1) {
    const at = Math.round((letters.length * (breaks.length + 1)) / count);
    const clamped = Math.min(Math.max(at, 1), letters.length - 1);
    if (breaks.includes(clamped)) break;
    breaks.push(clamped);
    breaks.sort((a, b) => a - b);
  }

  const pieces = [];
  let from = 0;
  for (const at of breaks) {
    pieces.push(letters.slice(from, at).join(""));
    from = at;
  }
  pieces.push(letters.slice(from).join(""));
  return pieces;
}
