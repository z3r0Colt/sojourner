export interface TtsWordToken {
  text: string;
  start: number; // char offset into the owning segment's text
  end: number;
}

/** Splits text into whitespace-delimited word tokens with their char offsets. */
export function tokenizeWords(text: string): TtsWordToken[] {
  const tokens: TtsWordToken[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return tokens;
}

/** Finds the index of the word token whose [start,end) range contains charIndex. */
export function findWordIndexAtChar(tokens: TtsWordToken[], charIndex: number): number {
  for (let i = 0; i < tokens.length; i++) {
    if (charIndex < tokens[i].end) return i;
  }
  return tokens.length > 0 ? tokens.length - 1 : -1;
}

/** Splits a large blob of plain text (e.g. a resource's extracted_text) into
 * readable paragraph-sized segments for TTS, dropping empty lines. */
export function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0);
}

// ---------------------------------------------------------------------------
// Text as the voice should get it.
//
// Library books, commentary entries and memory cards reach read-aloud as
// whatever their importer left: a commentary paragraph can run to thirteen
// thousand characters, and a library book whose text was flattened for search
// arrives as one "paragraph" of millions. Handed over whole, that was one
// segment the neural voice choked on (the player went quiet, or the voice task
// panicked), always starting at the first word of the book, with no way to
// start anywhere else. So every source cuts its text into sentence-sized
// pieces through here, and cleans out what no voice can say.

/** Characters that take up no room on the page and mean nothing said aloud:
 * zero-width spaces and joiners, the word joiner, a byte-order mark, a soft
 * hyphen. Left in, a word with one inside is two words to the voice. */
const INVISIBLE = /[\u00ad\u200b-\u200f\u2060-\u2064\ufeff]/g;

/** Rules, blanks and leaders: two or more long dashes, three or more hyphens,
 * underscores or asterisks (spaced or not: "* * *"), and four or more dots
 * (". . . ." running to a page number). The voice reads them as a long pause
 * at best and as "dash dash dash" at worst. A single dash is punctuation and
 * stays, as does an ellipsis of three dots -- the voice pauses on it, as a
 * reader would. */
const RULES = [/[‒–—―]{2,}/g, /[-‐‑_]{3,}/g, /(?:\*\s*){3,}/g, /(?:\.\s?){4,}/g, /…{2,}/g];

/** A note's marker in braces, as the old commentaries print them before a
 * cross-reference or a marginal reading: "{n}", "{2}", "{*}", "{++}", "{u2}".
 * Read aloud it was a letter said for no reason -- "en, 'Say not in thine
 * heart', Deuteronomy 30" -- at the head of every such line of Barnes. */
const BRACED_MARKER = /\{[^{}\s]{0,4}\}/g;

/** A word the same commentaries set in braces for emphasis, "{fables}": the
 * braces go and the word stays. */
const BRACED_WORD = /\{([^{}]{5,40})\}/g;

/** The text with what cannot be said taken out and its spacing made plain. */
export function cleanForSpeech(text: string): string {
  let out = text.replace(INVISIBLE, "").replace(BRACED_MARKER, " ").replace(BRACED_WORD, "$1");
  for (const rule of RULES) out = out.replace(rule, " ");
  return out.replace(/\s+/g, " ").trim();
}

/** Whether there is anything here an English voice can say: a Latin letter
 * or a digit. A line that is all Greek or Hebrew, or all punctuation, gives
 * the neural voice nothing to speak -- it renders half a second of silence --
 * and is better skipped than read as a pause. */
export function hasSpeakableText(text: string): boolean {
  return /[A-Za-z0-9\u00c0-\u024f]/.test(text);
}

/** Pieces are gathered up to this length: long enough that a paragraph is a
 * handful of pieces rather than dozens, short enough that the neural voice
 * renders one faster than it takes to say. */
export const SPEECH_PIECE_CHARS = 400;

/** Abbreviations whose full stop does not end a sentence. */
const ABBREVIATIONS = new Set(
  [
    "mr", "mrs", "ms", "dr", "st", "sr", "jr", "rev", "revd", "prof", "mt", "ver", "vs", "viz", "cf", "ch", "chap", "vol", "vols",
    "ed", "eds", "p", "pp", "nos", "v", "vv", "ib", "ibid", "sect", "sec", "fig", "e.g", "i.e", "etc", "al", "ps",
    "gen", "ex", "exod", "lev", "num", "deut", "josh", "judg", "sam", "kgs", "chron", "neh", "esth", "prov", "eccl", "eccles",
    "isa", "jer", "lam", "ezek", "dan", "hos", "obad", "mic", "nah", "hab", "zeph", "hag", "zech", "mal", "matt", "mk", "lk",
    "jn", "rom", "cor", "gal", "eph", "phil", "col", "thess", "tim", "tit", "philem", "heb", "jas", "pet", "jude", "rev",
  ].map((a) => a.toLowerCase()),
);

/** A list's number standing at the head of a sentence: "2", "(3)", "iv",
 * "II" -- read with the sentence it numbers, not as one of its own. */
const LIST_NUMBER = /^\s*\(?(?:\d{1,3}|[ivxlc]{1,7}|[IVXLC]{1,7})\)?$/;

/** A list's number after a sentence: "2. As he that stands", "(3) Nor". */
const NEXT_IS_LIST_NUMBER = /^\s+\(?\d{1,3}[.)]\s/;

/** Letters that are, or could be, a chapter in Roman numerals. */
const NUMERAL_WORD = /^(?:[ivxlc]+|[IVXLC]+)$/;

/** A reference's verse, closing it: a chapter with its stop and then the
 * verse, "ii. 16", "2:16", "v. 3-5". A list's number after it is the next
 * point's -- "Eccl. ii. 16. 9. All wicked men's pains" -- where after "Rom.
 * 8." the number is the verse. */
const ENDS_WITH_VERSE = /(?:^|[\s(])(?:\d{1,3}|[ivxlc]{1,7}|[IVXLC]{1,7})[.:,]\s?\d{1,3}(?:\s?[-–—]\s?\d{1,3})?$/;

/**
 * Where the sentences of `text` end, as offsets just past each one.
 *
 * A full stop ends a sentence unless the word before it is a known
 * abbreviation or a single letter ("J. Calvin"), or the next word starts with
 * a small letter or a digit ("ch. 4", "Rom. 8. 28") -- except that a number
 * followed by its own full stop is the next point of a list ("…foot sliding.
 * 2. As he that…"), and that one goes with the sentence it numbers. Cut the
 * other way, the voice said "two" at the end of the sentence before, and a
 * reading could begin on a sentence that had lost its number. The number's
 * own stop ends nothing, for the same reason.
 *
 * A semicolon or colon is not an end here: breaking at one started pieces --
 * and so readings -- halfway through a sentence. It is where a sentence too
 * long for one piece is cut (see `cutLong`). A closing quotation mark or
 * bracket stays with the sentence it closes.
 *
 * Only a few characters either side of each mark are looked at, so a whole
 * book's text costs one pass rather than one pass per sentence.
 */
function sentenceEnds(text: string): number[] {
  const ends: number[] = [];
  const re = /([.!?])["'’”)\]]*(?=\s+|$)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const end = m.index + m[0].length;
    if (m[1] === ".") {
      if (LIST_NUMBER.test(text.slice(last, m.index))) continue;
      const before = text.slice(Math.max(0, m.index - 12), m.index).match(/(?:^|[^A-Za-z.])([A-Za-z.]+)$/)?.[1] ?? "";
      if (before.length === 1 || ABBREVIATIONS.has(before.toLowerCase())) continue;
      const after = text.slice(end, end + 8).match(/^\s+(\S)/)?.[1] ?? "";
      if (after && /[a-z0-9]/.test(after)) {
        // "John iii. 16." is a reference, not a list: only an ordinary
        // word's full stop, or a reference's closing verse, before a list's
        // number ends a sentence.
        const closes = (before.length > 1 && !NUMERAL_WORD.test(before)) || ENDS_WITH_VERSE.test(text.slice(Math.max(0, m.index - 16), m.index));
        const listFollows = NEXT_IS_LIST_NUMBER.test(text.slice(end, end + 8)) && closes;
        if (!listFollows) continue;
      }
    }
    ends.push(end);
    last = end;
  }
  return ends;
}

/** A sentence too long to be one piece, cut at the last semicolon or colon
 * before the limit -- where the old writers paused -- or failing that at a
 * comma, then a space, and in a run with no space at all at the limit
 * itself. A break in the first third is passed over for a later one, or the
 * pieces would come out a few words long. */
function cutLong(piece: string, maxChars: number): string[] {
  const out: string[] = [];
  let rest = piece.trim();
  const inReach = (at: number) => (at >= maxChars / 3 ? at : -1);
  while (rest.length > maxChars) {
    const window = rest.slice(0, maxChars + 1);
    const clause = inReach(Math.max(window.lastIndexOf("; "), window.lastIndexOf(": ")));
    const comma = inReach(window.lastIndexOf(", "));
    const space = inReach(window.lastIndexOf(" "));
    const at = clause >= 0 ? clause + 1 : comma >= 0 ? comma + 1 : space >= 0 ? space : maxChars;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** A sentence shorter than this, read a sentence at a time, goes with the one
 * before it: "Selah.", or the "Eccl. ii. 16." that closes a sentence. */
const SHORT_SENTENCE_CHARS = 40;

/**
 * The text cleaned and cut into pieces of whole sentences, each at most
 * `maxChars` long. Short sentences are gathered together up to the limit, so
 * "Selah." is not a piece of its own. Nothing is dropped except what
 * `cleanForSpeech` removes; a piece with nothing speakable in it is left out.
 *
 * With `bySentence`, each sentence is a piece of its own, but for a short one,
 * which goes with the sentence before it. That is for text with no paragraphs
 * worth the name -- a MOBI's extracted text is often the whole book in one --
 * where a reading starts at the piece at the top of the view: gathered up to
 * the limit, that piece began a sentence or two above the view.
 */
export function splitForSpeech(text: string, maxChars: number = SPEECH_PIECE_CHARS, opts?: { bySentence?: boolean }): string[] {
  const clean = cleanForSpeech(text);
  if (!clean) return [];
  const sentences: string[] = [];
  let start = 0;
  for (const end of sentenceEnds(clean)) {
    sentences.push(clean.slice(start, end).trim());
    start = end;
  }
  if (start < clean.length) sentences.push(clean.slice(start).trim());

  const pieces: string[] = [];
  let current = "";
  for (const sentence of sentences.flatMap((s) => (s.length > maxChars ? cutLong(s, maxChars) : [s]))) {
    if (!sentence) continue;
    const gathers = !opts?.bySentence || sentence.length < SHORT_SENTENCE_CHARS;
    if (!current) current = sentence;
    else if (gathers && current.length + 1 + sentence.length <= maxChars) current = `${current} ${sentence}`;
    else {
      pieces.push(current);
      current = sentence;
    }
  }
  if (current) pieces.push(current);
  return pieces.filter(hasSpeakableText);
}
