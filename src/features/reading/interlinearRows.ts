import type { InterlinearWord, MorphologyWord } from "../../api/types";
import { displayForm, shortParsingLabel } from "../lexicon/parsingDisplay";
import { rootToShow } from "../lexicon/originalText";
import { FOLDED_RENDERINGS, isMarker, type VerseAlignment } from "./interlinearAlign";

/**
 * The interlinear as a table, as the Blue Letter Bible sets out its
 * interlinear: the English, the Strong's number, the word with its root, and
 * its parsing, on one line. In the English's order a row is a phrase, with
 * every Greek or Hebrew word it stands for; in the original's order a row is
 * a word. The rows come from `alignVerse`, which has already said which
 * phrase translates which word; all this does is put them in the order the
 * table reads them in, and find a row for the words no phrase's number
 * claims.
 */
export interface InterlinearRow {
  key: string;
  /** The English phrase, or null for a word no phrase translates. */
  phrase: InterlinearWord | null;
  /** The phrase's place in the verse, for finding the word it translates. */
  phraseIndex: number | null;
  /** The row shows its phrase's English. In the original's order the rows
   * after it for the same phrase show an arrow up to it instead, as the Blue
   * Letter Bible does where one English phrase stands for several words. A
   * row in the English's order always leads, as does a word no phrase
   * translates, with a dash for its English. */
  lead: boolean;
  /** The row's head word, the one its number, root, transliteration and
   * parsing are of: the word the phrase's Strong's number stands on. Null
   * for a phrase with no word: a word the KJV supplied (in italics, with no
   * number), or one whose number the verse's words lack. */
  word: MorphologyWord | null;
  /** Every word of the row, the head among them, in the original's order:
   * "the Word" is ὁ λόγος, the article before its noun as the Greek has it,
   * though λόγος is the head. One word in the original's order. */
  words: RowWord[];
  /** The head word is shown in full under another phrase; the KJV spent two
   * phrases on it ("should" and "perish" are the one ἀπόληται). */
  echo: boolean;
  /** The head word is a little word folded into the phrase's English: the
   * article of "the Word" in the original's order, where it has a row of its
   * own. */
  folded: boolean;
  /** The Strong's number shown and looked up for the row: the head word's
   * own, where there is a word -- the one its root and transliteration are
   * of -- or else the phrase's. */
  strongs: string | null;
}

/** A word in a row. */
export interface RowWord {
  word: MorphologyWord;
  /** The row's head word (`InterlinearRow.word`). */
  head: boolean;
  /** A little word the phrase's number does not claim, set in with it: an
   * article or particle folded into its English (`FOLDED_RENDERINGS`), or
   * one the KJV leaves untranslated that belongs with the words beside it
   * (`untranslatedHomes`). Shown, but muted, as the head's company. */
  folded: boolean;
  /** Shown in full under another phrase (see `InterlinearRow.echo`). */
  echo: boolean;
}

/**
 * The rows in the English's order, a row to a phrase as the Blue Letter
 * Bible has it: each phrase in turn with all the words it stands for in its
 * one row, in the original's order -- the words its number claims, the
 * little words folded into its English, and the words the KJV leaves
 * untranslated that go with them (`untranslatedHomes`): the article of "the
 * Word", the אֵת before "the heaven". A table of a row to each word ran John
 * 1:1-5 to two screens, a phrase's article under an arrow on a row of its
 * own and the untranslated at the verse's foot, each under a dash. Now only
 * a word of weight no phrase translates has a row of its own with a dash,
 * at the foot, with the little words that go with it and any word of weight
 * beside it no phrase translates either (Genesis 1's "and it was so").
 */
export function englishOrderRows(alignment: VerseAlignment, words: MorphologyWord[]): InterlinearRow[] {
  const at = new Map(words.map((w, j) => [w.id, j]));
  const place = (w: MorphologyWord) => at.get(w.id) ?? Infinity;
  const homes = untranslatedHomes(alignment, words);
  const withPhrase: MorphologyWord[][] = alignment.phrases.map(() => []);
  const withOrphan = new Map<number, MorphologyWord[]>();
  for (const word of alignment.untranslated) {
    const home = homes.get(word.id);
    if (home && "phrase" in home) withPhrase[home.phrase].push(word);
    else {
      const orphan = home?.orphan ?? word.id;
      withOrphan.set(orphan, [...(withOrphan.get(orphan) ?? []), word]);
    }
  }

  const rows: InterlinearRow[] = alignment.phrases.map(({ phrase, words: under }, i) => {
    const rowWords = [
      ...under.map(({ word, echo, folded }) => ({ word, echo, folded })),
      ...withPhrase[i].map((word) => ({ word, echo: false, folded: true })),
    ].sort((a, b) => place(a.word) - place(b.word));
    const head = headWord(rowWords);
    return {
      key: `${i}`,
      phrase,
      phraseIndex: i,
      lead: true,
      word: head?.word ?? null,
      // A word over under the head's own number is found as a little word
      // is, by its English, but is no little word: "Verily verily" is ἀμὴν
      // ἀμὴν, the second as much the phrase's as the first.
      words: rowWords.map((w) => ({
        ...w,
        head: w === head,
        folded: w.folded && !(head && w.word.strongs_id === head.word.strongs_id),
      })),
      echo: head?.echo ?? false,
      folded: head?.folded ?? false,
      strongs: head ? rowNumber(head.word) : phrase.strongs_id,
    };
  });
  for (const [id, group] of withOrphan) {
    const ordered = [...group].sort((a, b) => place(a) - place(b));
    const head = ordered.find((w) => w.id === id) ?? ordered[0];
    rows.push({
      key: `u-${id}`,
      phrase: null,
      phraseIndex: null,
      lead: true,
      word: head,
      words: ordered.map((word) => ({ word, head: word === head, echo: false, folded: word !== head })),
      echo: false,
      folded: false,
      strongs: rowNumber(head),
    });
  }
  return rows;
}

/**
 * The row's head word: the first its phrase's number claims -- the one
 * translating it, else one it echoes -- or, where the number claims none
 * (a phrase whose number the verse lacks, given only the little words
 * beside it), the first word of weight, or the first word.
 */
function headWord<W extends { word: MorphologyWord; echo: boolean; folded: boolean }>(words: W[]): W | undefined {
  return (
    words.find((w) => !w.folded && !w.echo) ??
    words.find((w) => !w.folded) ??
    words.find((w) => !isLittleWord(w.word)) ??
    words[0]
  );
}

/** Where a word no phrase translates goes: under a phrase, in its row, or in
 * the row of a word of weight no phrase translates either (by that word's
 * id, the first of a run of them side by side), which leads a row of its
 * own. */
export type UntranslatedHome = { phrase: number } | { orphan: number };

/**
 * Where each word no phrase translates is shown, by its id.
 *
 * The words the KJV leaves untranslated are nearly all little words -- the
 * article, the object marker, a καί or a γάρ it has no word for, a pronoun
 * the English does not repeat -- and belong with the word beside them as
 * much as the article of "the Word" does. Each goes in the row of the word
 * it belongs to:
 *
 * - the article and the object marker, the word they mark: the word after
 *   them (past a δέ or γάρ set in between, "ὁ δὲ Ἰησοῦς"). John 1:1's τὸν
 *   goes with θεόν in "God"; Genesis 1:1's אֵת with הַשָּׁמַיִם, "the heaven".
 * - a particle that stands second in its clause (δέ, γάρ, οὖν ...), and a
 *   personal pronoun or a Hebrew pronoun suffix, which follow the word they
 *   are said of: the word before them.
 * - any other little word -- a conjunction, a preposition, a negative, most
 *   particles -- the word after it, whose clause or phrase it leads.
 *
 * and, where there is no such word (a verse ending in an article), the word
 * on its other side. A word of weight no phrase translates -- a noun, a verb,
 * an adjective, an adverb -- cannot be put under another's English without
 * saying something the KJV does not; it leads a row of its own, and the
 * little words that go with it are in its row. Words of weight side by side
 * that no phrase translates share the one row: Genesis 1:9's closing וַיְהִי
 * כֵן, "and it was so", for which the KJV-with-Strong's has no phrase, is one
 * row under a dash and not two. A little word with no word beside it
 * anywhere (a verse of nothing else) is the same.
 *
 * The unit of a number in the teens goes with its עָשָׂר where the KJV's
 * phrase carries the עָשָׂר's number rather than the unit's: Genesis 5:8's
 * "and twelve" is H6240, and the שְׁתֵּים before its עֶשְׂרֵה is the "twelve" as
 * much as the עֶשְׂרֵה is (`TEEN_UNITS`).
 */
export function untranslatedHomes(alignment: VerseAlignment, words: MorphologyWord[]): Map<number, UntranslatedHome> {
  const at = new Map(words.map((w, j) => [w.id, j]));
  const home: (UntranslatedHome | undefined)[] = words.map(() => undefined);
  alignment.phrases.forEach(({ words: under }, phrase) => {
    for (const w of under) if (!w.echo && at.has(w.word.id)) home[at.get(w.word.id)!] = { phrase };
  });
  const loose: number[] = [];
  const claimed = (j: number) => !!home[j] && "phrase" in home[j];
  words.forEach((w, j) => {
    if (home[j]) return;
    if (isLittleWord(w) || (TEEN_UNITS.has(w.strongs_id ?? "") && words[j + 1]?.strongs_id === TEEN && claimed(j + 1))) loose.push(j);
    else if (j > 0 && !claimed(j - 1) && home[j - 1] && !isLittleWord(words[j - 1])) home[j] = home[j - 1];
    else home[j] = { orphan: w.id };
  });

  /** The word a little word belongs with, and failing that the one on its
   * other side. */
  const neighbours = (j: number): [number, number] => {
    const w = words[j];
    if (followsItsWord(w)) return [j - 1, j + 1];
    let next = j + 1;
    // Past a δέ or γάρ between the article and its word, whether or not a
    // phrase translates it: Romans 8:2's ὁ γὰρ νόμος, "For the law", is the
    // law's ὁ, not the "For"'s.
    if (isMarker(w)) while (next < words.length && POSTPOSITIVES.has(words[next].strongs_id ?? "")) next++;
    return [next, j - 1];
  };
  // A little word waits for the word it belongs with, which may be another
  // little word waiting in its turn ("καὶ ὁ λόγος" with neither translated),
  // until no more can be placed; then one takes the word on its other side,
  // and the rest wait again.
  const settle = (otherSide: boolean) => {
    for (const j of loose) {
      if (home[j]) continue;
      const [near, far] = neighbours(j);
      const found = home[near] ?? (otherSide ? home[far] : undefined);
      if (!found) continue;
      home[j] = found;
      return true;
    }
    return false;
  };
  while (settle(false) || settle(true));

  const homes = new Map<number, UntranslatedHome>();
  words.forEach((w, j) => homes.set(w.id, home[j] ?? { orphan: w.id }));
  return homes;
}

/** The parts of speech of the little words: those that go with another
 * word rather than saying anything of their own. */
const LITTLE_PARTS = new Set(["article", "preposition", "conjunction", "particle", "interjection", "pronoun"]);

/** The Greek particles that stand second in their clause, after the word
 * they go with: δέ, γάρ, οὖν, τε, γε, μέν, ἄν, δή, τοίνυν. */
const POSTPOSITIVES = new Set(["G1161", "G1063", "G3767", "G5037", "G1065", "G3303", "G302", "G1211", "G5105"]);

/** The "-teen" of a Hebrew number from eleven to nineteen, עָשָׂר after its
 * unit (אַחַד עָשָׂר, "eleven"): the KJV's "eleven" carries the unit's number
 * only, and the עָשָׂר was the commonest word of weight left without a row
 * of its own (300 of them). It goes with the unit before it. */
const TEEN = "H6240";

/** The units a number in the teens is made of, before its עָשָׂר: אֶחָד and
 * עַשְׁתֵּי (the "one" of eleven), then two to nine. */
const TEEN_UNITS = new Set(["H259", "H6249", "H8147", "H7969", "H702", "H2568", "H8337", "H7651", "H8083", "H8672"]);

/** TAHOT's own numbers, above Strong's, for a pronoun suffix written as a
 * word of its own (H9030-H9039, לָנוּ, "to us"). */
const SUFFIX_NUMBER = /^H9\d{3}$/;

/**
 * Whether a word is a little word, which goes with the word beside it when
 * the KJV has no English for it: the article and the object marker, a
 * Hebrew pronoun suffix, a postpositive particle, the עָשָׂר of a number in
 * the teens (`TEEN`), and any article, preposition, conjunction, particle,
 * interjection or pronoun by its parsing. Nouns, verbs, adjectives and
 * adverbs are words of weight -- but for the few nouns `FOLDED_RENDERINGS`
 * knows, which the Hebrew uses as a preposition, a quantifier or a negative
 * (תַּחַת "under", כָּל "all", אַיִן "not", בַּד "alone"), and the adverbs
 * that only join or weigh a clause (`LITTLE_ADVERBS`).
 *
 * `FOLDED_RENDERINGS` is otherwise for finding a word in the English, not
 * for saying it is little. It knows הָיָה, "to be", and the adverbs שָׁם
 * "there", כֵּן "so", עוֹד "again", for the "was" or "there" of the phrase
 * beside them; but where the KJV has none, the word is a clause's verb or
 * says where or how, and folded into the phrase beside it the row claimed
 * that phrase translated it: "and let the dry" was הַיַּבָּשָׁה וַיְהִי כֵן. A
 * word with no parsing is little if `FOLDED_RENDERINGS` knows it.
 */
export function isLittleWord(word: MorphologyWord): boolean {
  const n = word.strongs_id;
  if (n && (isMarker(word) || SUFFIX_NUMBER.test(n) || POSTPOSITIVES.has(n) || n === TEEN)) return true;
  const part = word.parsing?.part_of_speech;
  if (!part) return !!n && n in FOLDED_RENDERINGS;
  return LITTLE_PARTS.has(part) || (part === "noun" && !!n && n in FOLDED_RENDERINGS) || (part === "adverb" && LITTLE_ADVERBS.has(n ?? ""));
}

/** The Hebrew adverbs that are a clause's joints rather than anything said
 * in it: גַּם "also", אַךְ "surely", עַתָּה "now". The KJV leaves them out as
 * it does a וְ, and they go with the words beside them as it does. */
const LITTLE_ADVERBS = new Set(["H1571", "H389", "H6258"]);

/** Whether a little word goes with the word before it: a particle that
 * stands second, a personal pronoun ("his" after its noun, a resumptive
 * "him" after its verb), a Hebrew pronoun suffix, the עָשָׂר of "eleven". */
function followsItsWord(word: MorphologyWord): boolean {
  const n = word.strongs_id ?? "";
  if (POSTPOSITIVES.has(n) || SUFFIX_NUMBER.test(n) || n === TEEN) return true;
  const p = word.parsing;
  return p?.part_of_speech === "pronoun" && (p.kind === "personal" || p.kind === "reflexive" || p.kind === "possessive");
}

/**
 * The numbers a row shows after its head's, smaller: each of its other
 * words' once, in the original's order, with the word that opens it --
 * "the Word" is G3056 and then G3588 for its ὁ. A word with no number
 * (`rowNumber`), or the head's own number again, adds none.
 */
export function otherNumbers(row: InterlinearRow): { strongs: string; word: MorphologyWord }[] {
  const seen = new Set(row.strongs ? [row.strongs] : []);
  const out: { strongs: string; word: MorphologyWord }[] = [];
  for (const { word, head } of row.words) {
    const strongs = rowNumber(word);
    if (head || !strongs || seen.has(strongs)) continue;
    seen.add(strongs);
    out.push({ strongs, word });
  }
  return out;
}

/**
 * The rows in the original's order: each word of the verse once, with the
 * phrase that translates it (not a phrase that only echoes it). A run of
 * words under one phrase shows the phrase on the first of them only, the
 * rest an arrow up to it. The English the KJV supplied has no word, and no
 * row here; the verse's line above the table still has it.
 */
export function originalOrderRows(alignment: VerseAlignment, words: MorphologyWord[]): InterlinearRow[] {
  const owner = new Map<number, { index: number; folded: boolean }>();
  alignment.phrases.forEach(({ words: under }, index) => {
    for (const w of under) if (!w.echo) owner.set(w.word.id, { index, folded: w.folded });
  });
  let previous: number | null = null;
  return words.map((word) => {
    const found = owner.get(word.id);
    const phraseIndex = found?.index ?? null;
    const lead = phraseIndex === null || phraseIndex !== previous;
    previous = phraseIndex;
    const folded = found?.folded ?? false;
    return {
      key: `o-${word.id}`,
      phrase: phraseIndex === null ? null : alignment.phrases[phraseIndex].phrase,
      phraseIndex,
      lead,
      word,
      words: [{ word, head: true, echo: false, folded }],
      echo: false,
      folded,
      strongs: rowNumber(word),
    };
  });
}

/**
 * The root shown after a word: the headword of the word's Strong's entry,
 * exactly as the entry has it, unless that is the word as written. It is
 * the entry's and not the tagged text's lemma so that the number, the root
 * and the transliteration beside it are always one entry's: TAHOT gives
 * פְּנֵי (H6440, "face") the lemma פָּנֶה, the unused singular Strong's
 * derives it from, and the waters (H4325) the lemma מַי, and the table set
 * them beside the entry's "pânîym" and "mayim" -- a root and its letters
 * that were two words, and unpointed, read as "to turn" and "who". A number
 * with no entry (TAHOT's suffix numbers) has no root.
 */
export function rowRoot(word: MorphologyWord, display?: (text: string) => string): string | null {
  return rootToShow(word.headword, displayForm(word), display);
}

/**
 * The Strong's number a word's row shows and looks up: the word's own, where
 * the dictionary has an entry for it. TAHOT numbers a preposition's pronoun
 * suffix -- לָנוּ, "to us", בּוֹ, "in it" -- with numbers of its own above
 * Strong's (H9030-H9039, 6,079 words); Strong's numbered none of them, and
 * the row showed a "Strong's" number that opened "No lexicon entry found".
 * Such a word has no number here (it keeps it in the data, where the table
 * finds the "us" it is folded into by it). A word whose entry is not known
 * yet (`headword` not given) keeps its number.
 */
export function rowNumber(word: MorphologyWord): string | null {
  return word.headword === null ? null : word.strongs_id;
}

/** About how wide a character is in each column, in pixels, at the table's
 * sizes: the English in the reading font at 15px (a space counted as a
 * character), the word at 17px, its root at 13px, the transliteration in
 * italics at 13px, the parsing at 12px. Measured over John 1 and Genesis 1
 * in the app, row by row; a Greek or Hebrew letter is counted without its
 * accents and points, which take no width of their own. The Hebrew's
 * letters, in Ezra SIL, are a little wider than the Greek's. */
const CHAR_PX = { english: 7.1, form: 9.2, root: 7.1, translit: 6.3, parsing: 5.4 };
const HEBREW_CHAR_PX = { form: 9.5, root: 7.6 };
/** The spaces inside the original's cell: word to word in a phrase's row,
 * the words to the head's root, root to its letters. */
const ORIGINAL_GAPS_PX = { word: 6, root: 8, translit: 4 };

/** How wide a column's rows want it: wide enough for nine rows in ten to
 * stand on one line, the widest few taking a second line rather than the
 * width every other row needs. The same for each column, as any cell too
 * long for its column wraps and the row grows a line, whichever it is. The
 * English was once given its 97th row, when only the English wrapped and a
 * root or parsing lost its end to an ellipsis; with those wrapping too, the
 * English's widest rows took the width the Hebrew and its parsing needed,
 * and Genesis 1 had four rows in nine on two lines. Taken alike, with the
 * row's padding counted (`ROW_PADDING_PX`) and the columns set closer
 * (`InterlinearTable`), it has two in nine. */
const WIDTH_PERCENTILE = { english: 0.9, original: 0.9, parsing: 0.9 };

/** The row's padding at each end, which a subgrid's row takes from its
 * first column and its last: the English and the parsing have that much
 * less than their columns' widths for their text, and "and + Verb · qal seq
 * impf · 3rd masc sg", every "said" of Genesis 1, lost its "sg" to a second
 * line in a column wide enough for it. */
const ROW_PADDING_PX = 8;

/** A column is never given less than this, in pixels. */
const MIN_COLUMN_PX = 96;

export interface TableColumns {
  english: number;
  original: number;
  parsing: number;
}

function letters(s: string): number {
  return [...s.normalize("NFD")].filter((c) => !/\p{M}/u.test(c)).length;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

/**
 * How wide each of the table's three text columns wants to be, in pixels,
 * from the rows of the chapter. The table had them in fixed shares, and at
 * the width a pane has beside the Bible they fell out with the rows: the
 * original's column a third empty on most rows while the parsing beside it
 * was cut off on a third of them and the English wrapped. The rows say what
 * each column needs -- a Hebrew chapter's English runs longer and its words
 * shorter than a Greek one's -- and the columns share the pane in those
 * proportions (`tableGridTemplate`).
 */
export function tableColumnWidths(rows: InterlinearRow[]): TableColumns {
  const english: number[] = [];
  const original: number[] = [];
  const parsing: number[] = [];
  for (const row of rows) {
    if (row.phrase && row.lead) english.push(letters(row.phrase.text) * CHAR_PX.english);
    const word = row.word;
    if (!word) continue;
    const root = rowRoot(word);
    const translit = word.headword_transliteration;
    const px = word.strongs_id?.startsWith("H") ? HEBREW_CHAR_PX : CHAR_PX;
    const forms = row.words.reduce((sum, w) => sum + letters(displayForm(w.word)) * px.form, 0);
    original.push(
      forms +
        (row.words.length - 1) * ORIGINAL_GAPS_PX.word +
        (root || translit ? ORIGINAL_GAPS_PX.root : 0) +
        (root ? letters(root) * px.root : 0) +
        (root && translit ? ORIGINAL_GAPS_PX.translit : 0) +
        (translit ? letters(translit) * CHAR_PX.translit : 0),
    );
    const label = shortParsingLabel(word.parsing) || word.morph_code || "";
    if (label) parsing.push(label.length * CHAR_PX.parsing);
  }
  const want = (values: number[], p: number, padding = 0) =>
    Math.max(MIN_COLUMN_PX, Math.round(percentile(values, p) + (values.length ? padding : 0)));
  return {
    english: want(english, WIDTH_PERCENTILE.english, ROW_PADDING_PX),
    original: want(original, WIDTH_PERCENTILE.original),
    parsing: want(parsing, WIDTH_PERCENTILE.parsing, ROW_PADDING_PX),
  };
}

/**
 * The table's columns as a grid template: the English, the Strong's numbers
 * at their own width up to two to a line (\`NUMBERS_WIDTH\`), the original and
 * the parsing, the three text columns sharing what width there is in
 * proportion to what they want. A pane wider than they want widens each
 * alike; a narrower one narrows each alike, none below its least.
 */
export function tableGridTemplate(widths: TableColumns): string {
  const min = `${MIN_COLUMN_PX / 16}rem`;
  return `minmax(${min},${widths.english}fr) fit-content(${NUMBERS_WIDTH}) minmax(${min},${widths.original}fr) minmax(${min},${widths.parsing}fr)`;
}

/** The most the Strong's column takes: a head's number and one more after
 * it ("G3056 G3588", the Word and its article). A row with more wraps them
 * under the first. Left to size itself, the column took the width of Psalm
 * 23:4's "for thou art with me thy rod", four numbers long, from every row
 * of the psalm, and the Hebrew beside it wrapped on half of them. */
const NUMBERS_WIDTH = "4.75rem";
