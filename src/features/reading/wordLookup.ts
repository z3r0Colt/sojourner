import type { InterlinearWord, MorphologyWord } from "../../api/types";
import { bareGreek } from "./editionDiff";
import { closestWithAttr, textOffsetWithin } from "../../lib/domOffsets";

/**
 * Double-click word lookup (F1.4): from the word the browser selected on a
 * double-click, find the Strong's number the interlinear data gives it.
 *
 * The interlinear phrases are tagged to KJV wording, so in another
 * translation a word may not appear in any phrase; the caller then falls
 * back to a lexicon search for the word.
 *
 * Where the lookup settles on one particular Greek or Hebrew word of the
 * verse -- the tagged word clicked in an original-language text, or the one
 * word an English word's Strong's number stands on -- it gives that word
 * too, and the card shows its parsing. Where it only reaches a lexicon
 * entry it gives none, rather than another word's parsing.
 */

export interface WordAtPoint {
  /** The word as it appears in the text (trimmed, punctuation kept). */
  word: string;
  verse: number;
  /** Which occurrence of the word within the verse was clicked (0-based,
   * words compared by their bare letters), so "the" in "the Word was with
   * God, and the Word was God" resolves to the phrase at that position
   * rather than always the first. */
  occurrence: number;
}

/** Lower-cased letters and digits only, so "Loved," matches "loved". */
export function normalizeWord(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/** The word a double-click selected inside a verse, or null when the
 * selection is empty or not inside verse text. */
export function wordFromSelection(sel: Selection | null): WordAtPoint | null {
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  const verseEl = closestWithAttr(range.startContainer, "data-verse-text");
  if (!verseEl) return null;
  const word = sel.toString().trim();
  const normalized = normalizeWord(word);
  if (!normalized || /\s/.test(word)) return null;
  const verse = Number(verseEl.getAttribute("data-verse-text"));
  const offset = textOffsetWithin(verseEl, range.startContainer, range.startOffset);
  const before = (verseEl.textContent ?? "").slice(0, offset);
  return { word, verse, occurrence: namesakesBefore(before, word) };
}

/**
 * The words of a stretch of verse text, divided where a double-click divides
 * them: at anything that is not a letter, a mark written on one (a vowel
 * point, an accent, a breathing) or a digit -- except an apostrophe inside a
 * word ("man's", "Ba‘al") and the comma or point inside a number ("20,000"),
 * which the browser keeps in the word it selects.
 *
 * Not at spaces alone. The Leningrad Codex joins a little word to the next
 * with a maqaf (אֶת־יְהוָה, "the LORD" with the object marker), the browser
 * selects either half on its own, and the tagged Hebrew text gives each half
 * its own tag. Counted as one, the halves hid their namesakes: in Genesis 4:1
 * the third אֶת ("with the LORD") came after two others each joined to a name,
 * was counted as the first, and the card showed the object marker H853 and
 * its parsing, as certain, where the verse has the preposition H854. The
 * hyphen of an English "Tubal-Cain" and a dash between two words hid theirs
 * the same way.
 */
const WORD_AS_SELECTED = /[\p{L}\p{M}\p{N}]+(?:(?:['’‘]|(?<=\p{N})[,.](?=\p{N}))[\p{L}\p{M}\p{N}]+)*/gu;

export function wordsAsSelected(text: string): string[] {
  return text.match(WORD_AS_SELECTED) ?? [];
}

/**
 * How many words of `before` -- the verse up to the one clicked -- are the
 * clicked word again, compared by bare letters, as matchOriginalStrongs
 * compares a Greek or Hebrew word. Counted with its accents and breathings,
 * the second ὁ ("the") of a verse with a ὅ ("which") between the two was the
 * second ὁ but only the second of the three the match lines up, which is the
 * ὅ: the card named the relative pronoun and showed its parsing. English has
 * no accents to differ.
 */
export function namesakesBefore(before: string, word: string): number {
  const bare = bareGreek(word);
  if (!bare) return 0;
  return wordsAsSelected(before).filter((w) => bareGreek(w) === bare).length;
}

function phraseWords(p: InterlinearWord): string[] {
  return p.text.split(/\s+/).map(normalizeWord).filter(Boolean);
}

/** The Strong's number for `word` among a verse's interlinear phrases, or
 * null. Exact word matches are preferred; failing that, a phrase word that
 * shares a stem of at least four letters (so "loved" still finds "love").
 * Among several candidates the one at `occurrence` wins. */
export function matchStrongs(word: string, occurrence: number, phrases: InterlinearWord[]): string | null {
  const target = normalizeWord(word);
  if (!target) return null;
  const tagged = phrases.filter((p) => p.strongs_id);
  let candidates = tagged.filter((p) => phraseWords(p).includes(target));
  if (candidates.length === 0) {
    candidates = tagged.filter((p) =>
      phraseWords(p).some((w) => {
        const shorter = Math.min(w.length, target.length);
        return shorter >= 4 && (w.startsWith(target) || target.startsWith(w));
      }),
    );
  }
  if (candidates.length === 0) return null;
  return (candidates[Math.min(occurrence, candidates.length - 1)] ?? candidates[0]).strongs_id;
}

/** A word clicked in a Greek or Hebrew text, as the verse's tagged words
 * read it. */
export interface OriginalWordMatch {
  strongsId: string;
  /** The tagged word the click lands on, when it is certainly that word:
   * the Strong's card shows its parsing. Null when the match only reaches
   * the lexicon entry -- a spelling the tagged text lacks, matched on its
   * first four letters, may be another form of the word altogether
   * (ἀγάπη for ἀγαπᾷ), and its parsing would be another word's. */
  word: MorphologyWord | null;
}

/** The Strong's number for a word clicked in a Greek or Hebrew text, from
 * the verse's tagged words (the TR and the Leningrad Codex), compared by
 * bare letters so accents, points and punctuation do not matter, and the
 * tagged word it is. Another edition's spelling that the tagged text lacks
 * falls back to a shared beginning of at least four letters, which names
 * the lexicon entry but not the word.
 *
 * A clicked word spelled as a tagged one is that word at the same place
 * among its namesakes -- the second καί clicked is the second καί tagged.
 * An edition with more of them than the tagged text (a word the TR lacks,
 * spelled as one it has) points past the last; that one's Strong's number
 * still serves, and its parsing does too if every namesake parses alike. */
export function matchOriginalStrongs(word: string, occurrence: number, words: MorphologyWord[]): OriginalWordMatch | null {
  const target = bareGreek(word);
  if (!target) return null;
  const tagged = words.filter((w) => w.strongs_id);
  const exact = tagged.filter((w) => bareGreek(w.original_word) === target);
  if (exact.length > 0) {
    const at = exact[Math.min(occurrence, exact.length - 1)] ?? exact[0];
    const certain = occurrence < exact.length || exact.every((w) => w.morph_code === at.morph_code);
    return { strongsId: at.strongs_id!, word: certain ? at : null };
  }
  const similar = tagged.filter((w) => {
    const b = bareGreek(w.original_word);
    return Math.min(b.length, target.length) >= 4 && (b.startsWith(target.slice(0, 4)) || target.startsWith(b.slice(0, 4)));
  });
  if (similar.length === 0) return null;
  return { strongsId: (similar[Math.min(occurrence, similar.length - 1)] ?? similar[0]).strongs_id!, word: null };
}

/**
 * The one Greek or Hebrew word of a verse that a Strong's number picks out,
 * for an English word matched to the number through the KJV interlinear:
 * "loved" in John 3:16 is G25, and G25 there is ἠγάπησεν alone. The English
 * and the original do not keep the same order, so where the number stands
 * on several words of the verse there is no telling which the English word
 * translates -- "God" in John 1:1 is both θεόν and θεός -- and there is no
 * word, unless all of them parse alike ("the Word" there is ὁ λόγος three
 * times over), when any one of them is as good as another.
 */
export function taggedWordForStrongs(strongsId: string | null | undefined, words: MorphologyWord[]): MorphologyWord | null {
  if (!strongsId) return null;
  const tagged = words.filter((w) => w.strongs_id === strongsId);
  if (tagged.length === 0) return null;
  return tagged.every((w) => w.morph_code === tagged[0].morph_code) ? tagged[0] : null;
}

/**
 * Whether a translation is English, for the word card's Webster 1828
 * section: a Greek or Hebrew text is not, and neither is the Vulgate, whose
 * script is the Latin alphabet too. The bundled Zefania files say "ENG",
 * the USFM ones "en", and the ASV says nothing, so no language at all in a
 * Latin-script text is taken to be English.
 */
export function isEnglishText(translation: { script: string; language: string | null } | null | undefined): boolean {
  if (!translation || translation.script !== "latin") return false;
  return translation.language == null || /^en(g|glish)?$/i.test(translation.language.trim());
}

/**
 * The word to look up in Webster for a word double-clicked in an English
 * text, or null when there is none to look up. The browser's selection
 * keeps what surrounds the word ("Loved," "‘Behold") and the possessive
 * ("man's", "God’s"), neither of which Webster files; he files the word, in
 * lower case. A number is not a word.
 */
export function englishLookupWord(selected: string): string | null {
  const word = selected
    .trim()
    .replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "")
    .replace(/['’]s$/u, "")
    .replace(/’/g, "'")
    .toLowerCase();
  if (!word || /\d/.test(word) || !/^[\p{L}'-]+$/u.test(word)) return null;
  return word;
}
