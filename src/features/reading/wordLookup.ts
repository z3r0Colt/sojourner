import type { InterlinearWord } from "../../api/types";
import { closestWithAttr, textOffsetWithin } from "../../lib/domOffsets";

/**
 * Double-click word lookup (F1.4): from the word the browser selected on a
 * double-click, find the Strong's number the interlinear data gives it.
 *
 * The interlinear phrases are tagged to KJV wording, so in another
 * translation a word may not appear in any phrase; the caller then falls
 * back to a lexicon search for the word.
 */

export interface WordAtPoint {
  /** The word as it appears in the text (trimmed, punctuation kept). */
  word: string;
  verse: number;
  /** Which occurrence of the word within the verse was clicked (0-based),
   * so "the" in "the Word was with God, and the Word was God" resolves to
   * the phrase at that position rather than always the first. */
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
  let occurrence = 0;
  for (const token of before.split(/\s+/)) {
    if (normalizeWord(token) === normalized) occurrence++;
  }
  return { word, verse, occurrence };
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
