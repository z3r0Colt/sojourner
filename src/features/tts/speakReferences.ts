// ---------------------------------------------------------------------------
// Scripture references, said the way a reader would say them.
//
// The old books this app reads cite Scripture the way their printers did:
// "John viii. 23", "Isa. lxvi. 23, 24", "1 Cor. xv. 22", "Ro 8:28-30". Handed
// to the neural voice as printed, a chapter in Roman numerals came out as the
// word "Roman" -- "John Roman, twenty-three" -- and an abbreviated book as its
// letters, "I, S, A". A Puritan sermon quotes a text every few lines, so a
// listener heard that every few lines. Here each reference the voice would
// stumble over is rewritten into words -- "John 8, verse 23", "Isaiah 66,
// verses 23, 24" -- with a map back to the printed text, so a voice that
// follows along word by word still lands on the right word.
//
// Barnes cites in the Treasury's shorthand, "Comp. Jas 4:4; 1 Jo 2:15" and
// "Ga 2:19; 5:1", which came out as "one Joe two fifteen" and "five:one"; the
// short forms are known here, and a chain's later chapters are read under the
// book named first -- however they are joined: "; 5:1", ", 11:29", the
// Treasury's bare "Ge 24:40 18:17", Henry's "Neh. viii. 9, x. 1". Where only a
// space joins them the voice is given a semicolon for the pause a reader makes:
// "verse 40 18, verse 17" was heard as "verse forty-eighteen". A range
// printed with a dash of any length, "vv. 3—5", is "verses 3 to 5", and one
// running into another chapter, "Jer 3:6-6:30", is read to that chapter.
// Henry cites the book in hand by its chapter alone, "ch. ix. 3", which is
// "chapter 9, verse 3".

import type { SpokenChunk } from "./pronunciation";

/** Book names by every abbreviation old commentaries and modern references
 * use for them, lowercased and without the full stop. A numbered book is
 * listed under its name alone ("cor"); the number is read separately. */
const BOOKS: Record<string, string> = {};
function book(name: string, ...abbrevs: string[]) {
  for (const a of [name, ...abbrevs]) BOOKS[a.toLowerCase()] = name;
}
// The two-letter forms at the end of several lines ("Jo", "He", "Ga", "Php",
// "1 Pe") are Barnes's, and the Treasury of Scripture Knowledge's: "Comp. Jas
// 4:4; 1 Jo 2:15" is how Barnes prints a cross-reference.
book("Genesis", "gen", "ge", "gn");
book("Exodus", "exod", "ex", "exo");
book("Leviticus", "lev", "le", "lv");
book("Numbers", "num", "nu", "nm", "numb");
book("Deuteronomy", "deut", "de", "dt");
book("Joshua", "josh", "jos");
book("Judges", "judg", "jdg", "jud");
book("Ruth", "ru");
book("Samuel", "sam", "sa", "sm");
book("Kings", "kgs", "ki", "kin");
book("Chronicles", "chron", "chr", "ch");
book("Ezra", "ezr");
book("Nehemiah", "neh", "ne");
book("Esther", "esth", "est", "es");
book("Job", "jb");
book("Psalm", "ps", "psa", "psal", "pss", "psalms");
book("Proverbs", "prov", "pro", "prv", "pr");
book("Ecclesiastes", "eccl", "eccles", "ecc", "ec");
book("Song of Solomon", "song", "sol", "cant", "canticles", "so");
book("Isaiah", "isa", "is", "esai", "esay");
book("Jeremiah", "jer", "je");
book("Lamentations", "lam", "la");
book("Ezekiel", "ezek", "eze", "ezk");
book("Daniel", "dan", "da", "dn");
book("Hosea", "hos", "ho");
book("Joel", "jl", "joe");
book("Amos", "am");
book("Obadiah", "obad", "ob");
book("Jonah", "jon", "jnh");
book("Micah", "mic", "mi");
book("Nahum", "nah", "na");
book("Habakkuk", "hab");
book("Zephaniah", "zeph", "zep");
book("Haggai", "hag", "hg");
book("Zechariah", "zech", "zec");
book("Malachi", "mal");
book("Matthew", "matt", "mat", "mt", "matth");
book("Mark", "mk", "mar", "mr");
book("Luke", "lk", "lu", "luk");
book("John", "jn", "jno", "joh", "jo");
book("Acts", "ac");
book("Romans", "rom", "ro", "rm");
book("Corinthians", "cor", "co");
book("Galatians", "gal", "ga");
book("Ephesians", "eph", "ephes");
book("Philippians", "phil", "php");
book("Colossians", "col");
book("Thessalonians", "thess", "thes", "th");
book("Timothy", "tim", "ti");
book("Titus", "tit");
book("Philemon", "philem", "phm");
book("Hebrews", "heb", "he");
book("James", "jas", "jam", "jm");
book("Peter", "pet", "pe", "pt");
book("Jude", "jud");
book("Revelation", "rev", "re", "apoc");
// The Apocrypha, which the commentators quote for its history and its Greek:
// "1 Maccabees 1:41", "2 Mac. 15:39", "Tobit 3:17", "Wisdom 16:12".
book("Tobit", "tob");
book("Judith", "jdt");
book("Wisdom", "wisd");
book("Ecclesiasticus", "ecclus");
book("Sirach");
book("Baruch");
book("Maccabees", "macc", "mac");
book("Esdras", "esd");
// "Jud." is Judges more often than Jude in the commentaries this app ships;
// the later entry would otherwise win.
BOOKS["jud"] = "Judges";
// Now and then a commentator, or his printer, shortens a book otherwise:
// Barnes's "Ep 4:26", "Ph 1:6" and "Act 1:24", Calvin's translator's "Hebrew
// 4:13", the Treasury's "1 Chronicle 15:21".
BOOKS["ep"] = "Ephesians";
BOOKS["ph"] = "Philippians";
BOOKS["act"] = "Acts";
BOOKS["hebrew"] = "Hebrews";
BOOKS["chronicle"] = "Chronicles";

/** Books whose name is also an everyday word or name. Written out in full they
 * are only taken for a book when a chapter follows in Roman numerals or with
 * a verse ("Mark v. 3", "Job 19:25") -- never "Mark 3" alone, which may be a
 * mark on a page. */
const AMBIGUOUS = new Set([
  "mark", "job", "acts", "numbers", "kings", "am", "song", "ruth", "joel", "amos", "jonah", "james", "jude", "wisdom", "judith", "baruch",
]);

/** Short forms that are also words or names -- "Is", "Am", "He", "So", and
 * "Joe", Barnes's Joel -- are a book only with their full stop or a verse:
 * "He 12:2", never "He 3". Every form of two letters is counted among them. */
const WORDLIKE = new Set(["joe"]);

/** Short forms that are a book only with a verse: "Ep 4:26" is Ephesians, but
 * "Ep. 63" is one of Cyprian's letters, "Act 3" is in a play, and "the
 * Hebrew. 3" is a language. */
const VERSE_ONLY = new Set(["ep", "act", "hebrew"]);

/** Two-letter forms that are no English word, and so a book with a chapter
 * alone: Barnes's whole psalm, "Ps 29; 104:3". */
const NOT_WORDS = new Set(["ps"]);

/** The books that come in parts, and so take a number: "1 Cor.", "II Kings",
 * "1 Jo". */
const NUMBERED_BOOKS = new Set(["Samuel", "Kings", "Chronicles", "Corinthians", "Thessalonians", "Timothy", "Peter", "John", "Maccabees", "Esdras"]);

/** Short forms that are a book only with the book's number before them: "1 Ch
 * 16:34" is First Chronicles, but "Ch. 16" is a chapter, "Ti" and "Sa" are
 * nothing on their own, "Co." is a company, and "Mac" a name. */
const NUMBERED_ONLY = new Set(["ch", "sa", "ki", "ti", "th", "co", "pe", "mac", "macc", "esd", "chronicle"]);

const ORDINALS: Record<string, string> = { "1": "First", "2": "Second", "3": "Third", i: "First", ii: "Second", iii: "Third" };

const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 };

/** A chapter number in Roman numerals, or null when it is not one. Only the
 * well-formed ones: "iiii" and "vx" are not chapters. `max` is the largest
 * taken: 150 psalms by default. */
export function romanToNumber(numeral: string, max = 150): number | null {
  const s = numeral.toLowerCase();
  if (!/^[ivxlc]+$/.test(s)) return null;
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const value = ROMAN[s[i]];
    const next = ROMAN[s[i + 1]] ?? 0;
    total += value < next ? -value : value;
  }
  // Round-trip check rejects the malformed ones.
  return total > 0 && total <= max && toRoman(total) === s ? total : null;
}

/** The book of the Bible a word names, written out ("Luke", "Psalm"), or
 * undefined. Abbreviations are not counted: "Is" and "Am" are words. */
export function bookNamedInFull(word: string): string | undefined {
  const key = word.toLowerCase();
  const name = BOOKS[key];
  return name && (key === name.toLowerCase() || key === "psalms") ? name : undefined;
}

/** Whether a book's name is also an everyday word or a person's name. */
export function isAmbiguousBookName(word: string): boolean {
  return AMBIGUOUS.has(word.toLowerCase());
}

function toRoman(n: number): string {
  const table: [number, string][] = [[100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
  let out = "";
  for (const [value, letters] of table) {
    while (n >= value) {
      out += letters;
      n -= value;
    }
  }
  return out;
}

/** Verses: "23", "12-14", "23, 24", "3, 5-7". A range is printed with a
 * hyphen, an en dash or -- in the old books -- an em dash: "vv. 3—5". A
 * number with a colon of its own is the next chapter, not a verse: "Ro 8:28,
 * 11:29", and the "6:30" of "Jer 3:6-6:30" (see `CROSS`). Nor is a book's
 * number: "Ro 8:28, 2 Co 5:1". */
const VERSES = String.raw`\d{1,3}(?:\s?[-–—]\s?\d{1,3}(?![\d:]))?(?:\s?,\s?(?![123]\s?[A-Z][a-z])\d{1,3}(?![\d:])(?:\s?[-–—]\s?\d{1,3}(?![\d:]))?)*`;

/** A range running on into a later chapter: the "-6:30" of "Jer 3:6-6:30",
 * the chapter and the verse it ends at. */
const CROSS = String.raw`(?:\s?[-–—]\s?(\d{1,3}):(\d{1,3}))`;

/** What may follow a reference: a space, punctuation, a closing bracket or
 * quotation mark ('See Barnes "Ro 7:23"'), a dash, the Treasury's asterisk,
 * or the end. */
const REFERENCE_END = String.raw`(?=[\s.,;:)\]"'’”—–\-*?!]|$)`;

/**
 * A reference: an optional book number, a book, a chapter in Arabic or Roman
 * numerals, and optionally the verses. The chapter and verses are separated
 * by a full stop, a colon, or a comma and space, as the printers had it. A
 * book's number in figures may be set close up against it, "1Sa 5:3", as the
 * topical Bibles print it. The longest name taken is "Ecclesiasticus".
 */
const REFERENCE = new RegExp(
  String.raw`(?:\b([123])\.?\s*|\b([iI]{1,3})\s*\.?\s+|\b)([A-Z][a-z]{0,13})(\.?)\s+([ivxlc]{1,8}|[IVXLC]{1,8}|\d{1,3})(?:(?:\.|:|,)\s?(${VERSES})${CROSS}?)?${REFERENCE_END}`,
  "g",
);

/**
 * More chapters of the same book, after a reference: "Ga 2:19; 5:1", "Heb
 * 11:1; 12:2", "Isa. xl. 3; lxi. 1". Barnes chains them so, and the book is
 * named once. A chapter and verse joined by a colon is a reference whatever
 * comes before it, so a comma may join those too ("Ro 8:28, 11:29"), or
 * nothing but a space, as the Treasury sets them ("Ge 24:40 18:17"). A
 * chapter in small Roman numerals with its full stop follows a semicolon, or
 * a comma when it is more than a letter: "Neh. viii. 9, x. 1" -- but "John i.
 * 3, v. 12" is Henry's verse 12.
 */
const CHAIN = new RegExp(
  String.raw`(\s*[;,]\s*|\s+)(\d{1,3}):(${VERSES})${CROSS}?${REFERENCE_END}|(\s*;\s*|\s*,\s*(?=x|[ivxlc]{2}))([ivxlc]{1,8})\.\s?(${VERSES})${REFERENCE_END}`,
  "y",
);

/**
 * A chapter of the book in hand, named by itself: Henry's "ch. ix. 3" and
 * "ch. 43", "chap. xlii. 8", "Chap. iii. 4". The abbreviation is said as
 * "chapter" -- the voice read "chap." as the word "chap" -- and the chapter
 * and verse as a reference is. Only a full stop or a colon joins the verse:
 * "chap. 6,7" is chapters six and seven. The word written out is taken with
 * a colon's verse only, "Hebrews Chapter 6:16-20", "(chapter 15:15; 4:18)":
 * "chapter 3. 5 men" is a sentence and the next.
 */
const CHAPTER_REFERENCE = new RegExp(
  String.raw`\b(?:(Chap|chap|CHAP|Ch|ch|CH)\.\s?([ivxlc]{1,8}|[IVXLC]{1,8}|\d{1,3})(?:[.:]\s?(${VERSES})${CROSS}?)?|(Chapter|chapter|CHAPTER)\s(\d{1,3}):(${VERSES})${CROSS}?)${REFERENCE_END}`,
  "g",
);

/**
 * Verses named by themselves, after the chapter has been given: "v. 12",
 * "vv. 3—5", "ver. 7", "verses 28—30". The short forms need their full stop;
 * the words are only rewritten when a dash would otherwise be read out.
 */
const VERSES_ALONE = new RegExp(String.raw`\b(?:([Vv]{1,2}|[Vv]ers?)\.|([Vv]erses?))\s?(${VERSES})${REFERENCE_END}`, "g");

/** A word that numbers what follows, just before a lone "v.": then the "v."
 * is a chapter or a part in Roman numerals ("ch. v. 3", "Book v."). */
const AFTER_HEADING = /\b(?:ch|chap|chapter|sect?|section|part|pt|vol|book|bk|lib|cap|art|p|pp|no)\.?\s+$/i;

/** The verses said aloud: "23" -> "verse 23"; "12-14" -> "verses 12 to 14";
 * "23, 24" -> "verses 23 and 24". With a range's end in another chapter,
 * "verse 6, to chapter 6, verse 30". */
function sayVerses(verses: string, toChapter?: string, toVerse?: string): string {
  const parts = verses.split(/\s*,\s*/).map((p) => p.replace(/\s*[-–—]\s*/, " to "));
  const many = parts.length > 1 || parts[0].includes(" to ");
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
  const said = `${many ? "verses" : "verse"} ${list}`;
  return toChapter && toVerse ? `${said}, to chapter ${Number(toChapter)}, verse ${Number(toVerse)}` : said;
}

/** Every reference `REFERENCE` finds, overlapping ones included. Each search
 * goes on from the chapter of the last, not past it: the chapter's figure may
 * be the next reference's book number. Taken one after another, "See 1 Co
 * 15:1" and "Comp. 1 Ti 6:21" were read as the book "See", chapter 1 -- no
 * book, and passed over -- and "Co 15:1" and "Ti 6:21" were left without
 * their number, and so unread. */
function referenceCandidates(text: string): RegExpExecArray[] {
  const out: RegExpExecArray[] = [];
  REFERENCE.lastIndex = 0;
  for (let m = REFERENCE.exec(text); m; m = REFERENCE.exec(text)) {
    out.push(m);
    const name = m[3];
    REFERENCE.lastIndex = m.index + m[0].indexOf(name) + name.length;
  }
  return out;
}

export interface SpokenReferences {
  spoken: string;
  /** Null when nothing was rewritten and the spoken text is the text. */
  chunks: SpokenChunk[] | null;
}

/** `text` with its Scripture references in words, and a map back. */
export function speakReferences(text: string): SpokenReferences {
  const chunks: SpokenChunk[] = [];
  let spoken = "";
  let cursor = 0;
  const push = (srcStart: number, srcEnd: number, out: string, literal: boolean) => {
    if (out.length === 0 && srcStart === srcEnd) return;
    chunks.push({ spokenStart: spoken.length, spokenEnd: spoken.length + out.length, srcStart, srcEnd, literal });
    spoken += out;
  };

  /** Replace `length` characters of the text at `start` with `said`. */
  const rewrite = (start: number, length: number, said: string) => {
    push(cursor, start, text.slice(cursor, start), true);
    push(start, start + length, said, false);
    cursor = start + length;
  };
  /** Where the last reference said (or its chain) ended: a reference with
   * nothing but a space between it and that one is the next of a list, the
   * Treasury's "Ec 3:14-15,18 Ho 9:13", and is given its semicolon too. */
  let referenceEnd = -1;

  /** The same book's further chapters after a reference or a chapter just
   * said, "; 5:1", said the same way. Roman ones only after a reference with
   * its verses, as "Isa. xl. 3; lxi. 1": after "Ps 29" or "ch. 4", "; xl."
   * could be anything. */
  const sayChain = (romanToo: boolean) => {
    CHAIN.lastIndex = cursor;
    for (let link = CHAIN.exec(text); link; link = CHAIN.exec(text)) {
      const [linkWhole, colonSep, colonChapter, colonVerses, toChapter, toVerse, romanSep, romanChapter, romanVerses] = link;
      if (romanChapter && !romanToo) break;
      const sep = colonSep ?? romanSep;
      const next = colonChapter ? Number(colonChapter) : romanToNumber(romanChapter);
      if (!next) break;
      const said = `${next}, ${sayVerses(colonVerses ?? romanVerses, toChapter, toVerse)}`;
      // Joined by a space alone: the space becomes "; ".
      if (/^\s+$/.test(sep)) rewrite(link.index, linkWhole.length, `; ${said}`);
      else rewrite(link.index + sep.length, linkWhole.length - sep.length, said);
      CHAIN.lastIndex = cursor;
    }
  };

  // References, chapters of the book in hand, and verses standing alone, in
  // the order they come; at the same place a reference is tried first.
  const found = [
    ...referenceCandidates(text).map((m) => ({ m, kind: "reference" as const })),
    ...[...text.matchAll(CHAPTER_REFERENCE)].map((m) => ({ m, kind: "chapter" as const })),
    ...[...text.matchAll(VERSES_ALONE)].map((m) => ({ m, kind: "verses" as const })),
  ].sort((a, b) => (a.m.index ?? 0) - (b.m.index ?? 0));

  for (const { m, kind } of found) {
    const start = m.index ?? 0;
    // Inside a reference already said -- a chain's "5:1", or "v. 3" of
    // "Matt. v. 3". (A reference whose number was a chain's last figure --
    // the "1" of "; 5:1. Matt. v. 3" -- starts again at its book, below.)
    if (start < cursor && kind !== "reference") continue;
    if (kind === "verses") {
      const [whole, short, word, verses] = m;
      const lower = sayVerses(verses);
      // "Verses 19,20." at the head of a note keeps its capital.
      const said = /^[A-Z]/.test(whole) ? lower[0].toUpperCase() + lower.slice(1) : lower;
      // "verse 12" says itself; only a range's dash or a short form needs words.
      if (word && `${word} ${verses}` === said) continue;
      if (!short && !/[-–—,]/.test(verses)) continue;
      // "ch. v. 3" is a chapter in Roman numerals, not a verse.
      if (short?.length === 1 && AFTER_HEADING.test(text.slice(Math.max(0, start - 10), start))) continue;
      rewrite(start, whole.length, said);
      continue;
    }
    if (kind === "chapter") {
      const [whole, short, shortChapter, shortVerses, shortToChapter, shortToVerse, full, fullChapter, fullVerses, fullToChapter, fullToVerse] = m;
      const abbreviation = short ?? full;
      const chapterText = shortChapter ?? fullChapter;
      const verses = shortVerses ?? fullVerses;
      const toChapter = shortToChapter ?? fullToChapter;
      const toVerse = shortToVerse ?? fullToVerse;
      const chapter = /^[ivxlc]+$/i.test(chapterText) ? romanToNumber(chapterText) : Number(chapterText);
      if (!chapter) continue;
      const word = abbreviation === abbreviation.toUpperCase() ? "CHAPTER" : abbreviation[0] === "C" ? "Chapter" : "chapter";
      rewrite(start, whole.length, `${word} ${chapter}${verses ? `, ${sayVerses(verses, toChapter, toVerse)}` : ""}`);
      if (verses) sayChain(true);
      continue;
    }
    const [matched, digitNumber, romanNumber, name, dot, chapterText, verses, toChapter, toVerse] = m;
    const key = name.toLowerCase();
    const bookName = BOOKS[key];
    if (!bookName) continue;
    // A figure before a book that comes in one part is not its number but
    // something else's -- a list's, "1. Gen. 3:15" -- and is left as it is.
    let number: string | undefined = digitNumber ?? romanNumber;
    let whole = matched;
    let from = start;
    if (number && (!NUMBERED_BOOKS.has(bookName) || start < cursor)) {
      const at = matched.indexOf(name);
      whole = matched.slice(at);
      from += at;
      number = undefined;
    }
    if (from < cursor) continue;
    const roman = /^[ivxlc]+$/i.test(chapterText) ? romanToNumber(chapterText) : null;
    if (/^[ivxlc]+$/i.test(chapterText) && roman == null) continue;
    const chapter = roman ?? Number(chapterText);
    if (!chapter) continue;
    // A full name that is also a word needs a Roman chapter or a verse to be
    // sure; an abbreviation (a short form, or any form with its full stop)
    // is a reference on sight when a number follows it.
    const abbreviated = key !== bookName.toLowerCase() || dot === ".";
    if (AMBIGUOUS.has(key) && !abbreviated && roman == null && !verses) continue;
    // "I" is a word; "I 3" is not a reference, and a lone capital Roman
    // chapter after a full name ("John I") is too easily a name and a title.
    if (roman != null && chapterText === chapterText.toUpperCase() && !dot && !verses) continue;
    // Plain prose: "in 3 ways" never matches, since "in" is no book, but "Am
    // 3" and "Is 40" would be read as references out of "I am 3" -- the two-
    // letter forms need their full stop or a verse.
    // Nor with a capital Roman chapter: "So-and-So. I shall stay" is no Song
    // of Solomon.
    if ((key.length <= 2 || WORDLIKE.has(key)) && !NOT_WORDS.has(key) && !verses && (!dot || (roman != null && chapterText === chapterText.toUpperCase()))) continue;
    if (VERSE_ONLY.has(key) && !verses) continue;
    if (NUMBERED_ONLY.has(key) && !number) continue;
    const ordinal = number ? ORDINALS[number.toLowerCase()] : undefined;
    if (number && !ordinal) continue;
    if (referenceEnd === cursor && cursor < from && /^\s+$/.test(text.slice(cursor, from))) rewrite(cursor, from - cursor, "; ");
    rewrite(from, whole.length, `${ordinal ? `${ordinal} ` : ""}${bookName} ${chapter}${verses ? `, ${sayVerses(verses, toChapter, toVerse)}` : ""}`);
    sayChain(!!verses);
    referenceEnd = cursor;
  }
  if (chunks.length === 0) return { spoken: text, chunks: null };
  push(cursor, text.length, text.slice(cursor), true);
  return { spoken, chunks };
}
