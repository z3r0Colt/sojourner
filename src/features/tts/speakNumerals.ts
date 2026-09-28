// ---------------------------------------------------------------------------
// Roman numerals outside Scripture references, said as numbers.
//
// `speakReferences` puts the numerals of a reference into words ("John viii.
// 23" is "John 8, verse 23"), and that was the only place any were. The rest
// went to the neural voice as printed, and it says every numeral from II up
// as the word "Roman" -- and "I" as the pronoun. The old books this app reads
// number everything that way: "SERMON II.", "CHAPTER IV. His Diary",
// "Section XII. Of the Covenant", and the heads of a sermon, "I. Show what...
// II. How it is given... III. Show the truth...". A listener heard "Sermon
// Roman", and "Roman. How it is given", again and again.
//
// A numeral is only taken for one where the text leaves no doubt: after a word
// that numbers things ("Chapter", "Sermon", "Part", "vol.", the Latin
// "VOLUMEN"), at the head of a sentence with its full stop ("II. How it is
// given"), in brackets ("(ii)"), before a numbered book ("II Kings"), after a
// king's or a pope's name ("Charles II", "Leo X"), or in a list begun by one
// of those ("Parts I and II"). Everywhere else the letters stay as they are:
// "I" is far more often the pronoun, and "C" a letter.
//
// The same pass says ordinals printed in figures -- "July 8th", "the 1st of
// May", and the old American "2d" and "3d" that Hodge numbers his heads with --
// as words. Given as printed, the voice read their letters: "eight tee-aitch",
// "one sent", "two dee". And a range printed with an en or em dash between
// figures -- Barnes's "pp. 356—381", a chapter summary's "converted, 13—15" --
// is read "356 to 381", where the voice ran the two numbers together. And the
// "pp." before them is "pages", "p. 213" is "page 213": the voice spelled
// them, "P P three hundred".

import type { SpokenChunk } from "./pronunciation";
import type { SpokenReferences } from "./speakReferences";
import { bookNamedInFull, isAmbiguousBookName, romanToNumber } from "./speakReferences";

/** Words that number what follows them, lowercased and without a full stop:
 * the heads and divisions of old books, and their abbreviations -- English,
 * and the Latin of the Fathers' and Reformers' collected works. */
const HEADINGS = new Set([
  "chapter", "chap", "ch", "sermon", "serm", "section", "sect", "sec", "part", "pt", "book", "bk", "lecture", "lect",
  "discourse", "disc", "article", "art", "question", "quest", "qu", "q", "psalm", "psalms", "ps", "volume", "vol", "vols",
  "canto", "letter", "epistle", "homily", "hymn", "head", "proposition", "prop", "observation", "obs", "doctrine", "doct",
  "use", "reason", "argument", "arg", "lesson", "meditation", "med", "dialogue", "essay", "act", "scene", "appendix",
  "number", "no", "nos", "rule", "direction", "dir", "motive", "inference", "inf", "objection", "obj", "answer", "ans",
  "case", "branch", "step", "sign", "lemma", "canon", "session", "sess", "tract", "treatise", "stanza", "table", "plate",
  "figure", "fig", "note", "class", "division", "div", "period", "century", "paragraph", "par", "para", "p", "pp", "page",
  "stage", "degree", "particular", "consideration", "caution", "mark", "evidence", "query", "day", "week", "lord's",
  "volumen", "tomus", "tom", "liber", "lib", "caput", "cap", "capitulum", "pars", "sectio", "sermo", "epistola", "epist",
  "quaestio", "articulus", "disputatio", "disp", "homilia", "oratio", "psalmus", "lectio", "dist", "distinctio",
]);

/** A heading word, or its plural: "Parts", "Chapters", "Sermons". */
function isHeading(key: string): boolean {
  return HEADINGS.has(key) || (key.length > 3 && key.endsWith("s") && HEADINGS.has(key.slice(0, -1)));
}

/** What joins the numerals of a list: "I and II", "i, ii, and iii", "iv-vi". */
const LIST_JOIN = /^(?:\s*,\s*(?:and\s+|or\s+|&\s*)?|\s+(?:and|or|to|&)\s+|\s*[-–—]\s*)$/;

/** Books that come in numbered parts, as "II Kings" names them. John and
 * Peter are left out: "I John" is also Revelation's "And I John saw". */
const NUMBERED_BOOKS = /^\s+(?:Kings|Samuel|Sam|Chronicles|Chron|Corinthians|Cor|Thessalonians|Thess|Timothy|Tim|Esdras|Maccabees|Macc)\b/;

/** Capitalized words that begin a sentence or a phrase far more often than
 * they name a king: "In II Kings" is not a king called In. */
const NOT_NAMES = new Set([
  "the", "a", "an", "in", "of", "on", "to", "and", "but", "or", "for", "see", "by", "at", "as", "from", "with", "under",
  "unto", "that", "this", "these", "those", "vide", "also", "compare", "comp", "cf", "so", "if", "when", "then", "than",
]);

const ORDINAL_WORDS = [
  "", "First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth", "Eleventh", "Twelfth",
  "Thirteenth", "Fourteenth", "Fifteenth", "Sixteenth", "Seventeenth", "Eighteenth", "Nineteenth",
];
const TENS_ORDINAL = ["", "", "Twentieth", "Thirtieth"];
const TENS = ["", "", "Twenty", "Thirty"];

/** 1 -> "First", 23 -> "Twenty-third", up to 39; null past that. */
export function ordinalWord(n: number): string | null {
  if (n < 1 || n > 39) return null;
  if (n < 20) return ORDINAL_WORDS[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return ones === 0 ? TENS_ORDINAL[tens] : `${TENS[tens]}-${ORDINAL_WORDS[ones].toLowerCase()}`;
}

/** A numeral a word could as easily be a letter: "C" in "Appendix C", "L". */
function isLoneLetter(numeral: string): boolean {
  return numeral.length === 1 && !/[ivx]/i.test(numeral);
}

/** Uppercase and more than a letter, or V or X: a numeral by its looks. "I"
 * is not -- it is the pronoun until something says otherwise. */
function looksNumeral(numeral: string): boolean {
  return numeral === numeral.toUpperCase() && (numeral.length > 1 || numeral === "V" || numeral === "X");
}

/** What a numeral at `index` of `text` is said as, or null to leave it. */
function sayNumeral(text: string, index: number, numeral: string): string | null {
  const value = romanToNumber(numeral, 399);
  if (value == null) return null;
  const before = text.slice(0, index);
  const after = text.slice(index + numeral.length);
  // Part of a longer word or figure: "I'll", "X-ray", "IV2". A hyphen before
  // another numeral is a range, "Sermons II-IV".
  if (/^(?:['’\w]|-(?![IVXLC]+\b|[ivxlc]+\b))/.test(after)) return null;
  const upper = numeral === numeral.toUpperCase();

  // "II Kings", "I Cor."
  if (upper && value <= 3 && NUMBERED_BOOKS.test(after)) return ORDINAL_WORDS[value];

  const prev = before.match(/([A-Za-z']+)(\.?)\s+$/);
  const prevWord = prev?.[1] ?? "";
  const prevKey = prevWord.toLowerCase();
  const capitalized = /^[A-Z]/.test(prevWord);

  // "Sermon II.", "CHAPTER IV", "vol. ii", "Sermon I." -- and "the book I
  // read" left alone: "I" after a heading only when the heading is
  // capitalized and the numeral stands by itself, closed by punctuation, or
  // heads a list of them ("Parts I and II").
  if (prev && isHeading(prevKey) && !isLoneLetter(numeral)) {
    if (!upper || looksNumeral(numeral)) return String(value);
    if (capitalized && /^(?:\s*$|[.:,;)\]]|\s+[-–—])/.test(after)) return String(value);
    if (capitalized && /^(?:\s*,\s*|\s+(?:and|or|to|&)\s+|\s*[-–—]\s*)(?:[IVXLC]{2,9}|[VX])\b/.test(after)) return String(value);
    // "Volume I and Volume II": the next heading's numeral makes a list of
    // it. ("On the Lord's Day I and my family" keeps its pronoun.)
    const next = after.match(/^\s+(?:and|or|to)\s+([A-Za-z']+)\.?\s+(?:[IVXLC]{1,9}|[ivxlc]{1,9})\b/);
    if (capitalized && numeral === "I" && next && isHeading(next[1].toLowerCase())) return String(value);
  }

  // "Luke XV", "Psalm CXIX": a chapter after a book written out.
  if (prev && !prev[2] && bookNamedInFull(prevWord) && !isAmbiguousBookName(prevWord) && looksNumeral(numeral)) return String(value);

  // The head of a sentence: "II. How it is given", "I. Show what". Not "C. H.
  // Spurgeon" -- a letter and a full stop before another is an initial.
  // Nor "i. e." or "v. 12", an abbreviation and a verse.
  const atHead = before.trim() === "" || /[.!?:]["'’”)\]]*\s+$/.test(before);
  if (atHead && !isLoneLetter(numeral) && /^[.)](?:\s|$)/.test(after) && !/^\.\s*[A-Za-z]\./.test(after) && !/^[.)]\s*\d/.test(after)) {
    if (numeral !== "I" || /^[.)](?:\s*$|\s+["“‘(]?[A-Z])/.test(after)) return String(value);
  }

  // "(ii)", "(IV)".
  if (/\($/.test(before) && after.startsWith(")") && !isLoneLetter(numeral)) return String(value);

  // "Charles II", "Henry VIII", "Leo X": the Second, the Eighth, the Tenth.
  if (
    prev &&
    !prev[2] &&
    /^[A-Z][a-z]+$/.test(prevWord) &&
    !isHeading(prevKey) &&
    !NOT_NAMES.has(prevKey) &&
    (!bookNamedInFull(prevWord) || isAmbiguousBookName(prevWord)) &&
    (looksNumeral(numeral) || (numeral === "I" && new RegExp(String.raw`^\s+(?:and|or)\s+${prevWord}\s+[IVXL]+\b`).test(after)))
  ) {
    // (A king's "I" only in a list of his line: "Charles I and Charles II".)
    const ordinal = ordinalWord(value);
    if (ordinal) return `the ${ordinal}`;
  }
  return null;
}

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen",
  "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS_WORDS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const TENS_ORDINALS = ["", "", "twentieth", "thirtieth", "fortieth", "fiftieth", "sixtieth", "seventieth", "eightieth", "ninetieth"];

/** 8 -> "eighth", 21 -> "twenty-first", 101 -> "one hundred and first", up to
 * 9999; null past that. */
export function ordinalInWords(n: number): string | null {
  if (!Number.isInteger(n) || n < 1 || n > 9999) return null;
  if (n < 20) return ORDINAL_WORDS[n].toLowerCase();
  if (n < 100) {
    const ones = n % 10;
    return ones === 0 ? TENS_ORDINALS[Math.floor(n / 10)] : `${TENS_WORDS[Math.floor(n / 10)]}-${ORDINAL_WORDS[ones].toLowerCase()}`;
  }
  const [unit, size] = n < 1000 ? [100, "hundred"] : [1000, "thousand"];
  const rest = n % unit;
  const head = `${cardinalInWords(Math.floor(n / unit))} ${size}`;
  if (rest === 0) return `${head}th`;
  return `${head} ${rest < 100 ? "and " : ""}${ordinalInWords(rest)}`;
}

function cardinalInWords(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) return n % 10 === 0 ? TENS_WORDS[Math.floor(n / 10)] : `${TENS_WORDS[Math.floor(n / 10)]}-${ONES[n % 10]}`;
  const rest = n % 100;
  return `${ONES[Math.floor(n / 100)]} hundred${rest ? ` and ${cardinalInWords(rest)}` : ""}`;
}

/** Whether `suffix` is the one `n` takes: 1st, 2nd or 2d, 3rd or 3d, 4th,
 * 11th-13th. A figure with the wrong letters after it is something else --
 * "6d." is sixpence, not the sixth. */
function ordinalSuffixFits(n: number, suffix: string): boolean {
  const s = suffix.toLowerCase();
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return s === "th";
  switch (n % 10) {
    case 1:
      return s === "st";
    case 2:
      return s === "nd" || s === "d";
    case 3:
      return s === "rd" || s === "d";
    default:
      return s === "th";
  }
}

/** An ordinal in figures ("8th", "2d") or in Roman numerals ("xivth"), said as
 * a word, or null to leave it. */
function sayOrdinal(text: string, index: number, digits: string | undefined, numeral: string | undefined, suffix: string): string | null {
  const value = digits != null ? Number(digits) : romanToNumber(numeral ?? "", 399);
  if (value == null || !ordinalSuffixFits(value, suffix)) return null;
  // A Roman one only where an ordinal stands: "the xviiith and xixth
  // chapters", "XIXTH SATIRE". In a book read from a scan, "vith" and "cth"
  // are "with" and the end of "draweth" misread, and were "sixth" and "one
  // hundredth".
  if (numeral != null) {
    const shouting = numeral === numeral.toUpperCase() && suffix === "TH" && numeral.length > 1;
    if (!shouting && !/\b(?:the|and|or)\s+$/i.test(text.slice(Math.max(0, index - 5), index))) return null;
  }
  // Money: "2s. 2d." and "£1 3d" are pence.
  if (suffix === "d" && /(?:£\s*\d*|\d\s*s\.?,?)\s*$/.test(text.slice(Math.max(0, index - 8), index))) return null;
  return ordinalInWords(value);
}

/** Every numeral a passage could hold: a Roman numeral, a Roman numeral with
 * an ordinal's ending ("XVth"), or a figure with one ("8th", "2d", "1ST") --
 * and the en or em dash of a range between figures ("356—381"), and the "p."
 * or "pp." of a page number before one ("pp. 356", "p. ii"). */
const NUMERALS = /\b(?:(\d{1,4})(st|nd|rd|th|ST|ND|RD|TH|d)|([IVXLC]{1,9}|[ivxlc]{1,9})(th|TH)?)\b|(?<=\d)(\s?[–—]\s?)(?=\d)|\b(pp?)\.(?=\s?(?:\d|[ivxlc]{1,9}\b))/g;

/** `text` with its Roman numerals in words where they are numerals, and its
 * ordinals in figures in words, with a map back, in the shape
 * `speakReferences` gives. */
export function speakNumerals(text: string): SpokenReferences {
  const chunks: SpokenChunk[] = [];
  let spoken = "";
  let cursor = 0;
  const push = (srcStart: number, srcEnd: number, out: string, literal: boolean) => {
    if (out.length === 0 && srcStart === srcEnd) return;
    chunks.push({ spokenStart: spoken.length, spokenEnd: spoken.length + out.length, srcStart, srcEnd, literal });
    spoken += out;
  };
  /** Where the last numeral said as a number ended, so the next one in a list
   * ("Parts I and II", "chapters iv, v and vi") is said as one too. A king's
   * "the Second" starts no list. */
  let listFrom = -1;
  for (const m of text.matchAll(NUMERALS)) {
    const [whole, digits, digitSuffix, numeral, romanSuffix, dash, page] = m;
    const start = m.index ?? 0;
    let said: string | null;
    if (dash != null) said = " to ";
    // "p.12" set close up still has its space said.
    else if (page != null) said = `${page === "pp" ? "pages" : "page"}${/\s/.test(text[start + whole.length] ?? "") ? "" : " "}`;
    else if (digits != null) said = sayOrdinal(text, start, digits, undefined, digitSuffix);
    else if (romanSuffix != null) said = sayOrdinal(text, start, undefined, numeral, romanSuffix);
    else {
      said = sayNumeral(text, start, numeral);
      if (said == null && listFrom >= 0 && LIST_JOIN.test(text.slice(listFrom, start)) && !isLoneLetter(numeral)) {
        const value = romanToNumber(numeral, 399);
        // "I" goes on a list only where it closes one: "Parts II and I." --
        // not "in Chapter IV, and I think".
        const closes = numeral !== "I" || /^(?:\s*$|[.:;)\]])/.test(text.slice(start + 1));
        if (value != null && closes) said = String(value);
      }
    }
    if (said == null) continue;
    push(cursor, start, text.slice(cursor, start), true);
    push(start, start + whole.length, said, false);
    cursor = start + whole.length;
    listFrom = /^\d+$/.test(said) ? cursor : -1;
  }
  if (chunks.length === 0) return { spoken: text, chunks: null };
  push(cursor, text.length, text.slice(cursor), true);
  return { spoken, chunks };
}
