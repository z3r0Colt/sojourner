// ---------------------------------------------------------------------------
// Headings set in capitals, said as words.
//
// The old books set their titles and heads in capitals -- "SINNERS IN THE
// HANDS OF AN ANGRY GOD.", "OF THE HOLY SCRIPTURE" -- and the neural voice
// takes a short word in capitals for an abbreviation and spells it: the title
// came out "of A-N angry God". So a run of two or more words in capitals is
// handed to the voice in a title's ordinary case, "Sinners in the Hands of an
// Angry God." A word in capitals standing alone is left: in the King James
// that is "the LORD", and in a book a word set so for its weight.
//
// Kept as they are inside a run: Roman numerals, for `speakNumerals` to read
// ("SERMON II" is "Sermon 2"), the pronoun and the vocative ("I", "O"), and
// what is plainly an abbreviation -- one with no vowel ("KJV", "BC"), one
// with full stops ("U.S.A."), and the few a Bible study names ("NASB", "AD").
//
// Only the letters' case changes, so the text keeps its length and every
// offset in it still points at the same letter on screen: no map back is
// needed for the voice's words to be highlighted where they are.

import { romanToNumber } from "./speakReferences";

/** Abbreviations with a vowel that are said by their letters. */
const ACRONYMS = new Set(["AD", "NASB", "NIV", "ESV", "ASV", "ISBE", "USA", "UK", "OT", "YHWH", "LXX", "KJV", "NKJV", "TSK", "JFB"]);

/** Short words a title keeps in lower case after its first. */
const SMALL = new Set([
  "a", "an", "the", "of", "in", "on", "to", "and", "or", "nor", "but", "for", "by", "at", "as", "from", "with", "into", "unto",
  "upon", "is", "be",
]);

/** A word in capitals: letters (and an apostrophe, "GOD'S"), none of them
 * small. An abbreviation's full stops are part of it: "U.S.A.". */
const WORD = /[A-Za-z](?:[A-Za-z'’]|\.(?=[A-Za-z]\.))*/g;

function isCapitals(word: string): boolean {
  return /[A-Z]/.test(word) && word === word.toUpperCase();
}

/** A word in capitals that is to stay so. */
function keepsCapitals(word: string): boolean {
  if (word.length === 1) return true;
  if (word.includes(".")) return true;
  if (!/[AEIOUY]/.test(word)) return true;
  if (ACRONYMS.has(word)) return true;
  return romanToNumber(word, 399) != null;
}

/** A word counted towards a run: more than a letter, and not a numeral. */
function countsTowardsRun(word: string): boolean {
  return word.length > 1 && !keepsCapitals(word);
}

/** `text` with its runs of words in capitals in a title's case. The result is
 * always the same length as `text`. */
export function speakCapitals(text: string): string {
  if (!/[A-Z]{2}/.test(text)) return text;
  const words = [...text.matchAll(WORD)].map((m) => ({ word: m[0], at: m.index ?? 0 }));
  let out = text;
  let i = 0;
  while (i < words.length) {
    if (!isCapitals(words[i].word)) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < words.length && isCapitals(words[j].word)) j += 1;
    const run = words.slice(i, j);
    if (run.filter((w) => countsTowardsRun(w.word)).length >= 2) {
      run.forEach(({ word, at }, n) => {
        if (keepsCapitals(word)) return;
        const lower = word.toLowerCase();
        // A title's first word keeps its capital, and so does the first
        // after a stop: "SERMON II. OF THE" is "Sermon II. Of the".
        const heads = n === 0 || /[.:;!?—]/.test(text.slice(run[n - 1].at + run[n - 1].word.length, at));
        const said = !heads && SMALL.has(lower) ? lower : lower[0].toUpperCase() + lower.slice(1);
        out = out.slice(0, at) + said + out.slice(at + word.length);
      });
    }
    i = j;
  }
  return out;
}
