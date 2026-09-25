/** First-letter mode: each word collapses to its first letter plus a run of
 * underscores standing in for the rest, punctuation left untouched so the
 * sentence shape (and any obvious short words) still guides recall. */
export function firstLetterHint(text: string): string {
  return text.replace(/[A-Za-z]+/g, (word) => word[0] + "_".repeat(Math.max(0, word.length - 1)));
}

/** Blank-the-word mode: a deterministic ~35% of words (by simple hash of
 * position, not random per render, so the same card doesn't reshuffle which
 * words are blanked every time React re-renders it) are replaced entirely
 * with underscores; the rest are shown in full. */
export function blankWordHint(text: string): string {
  let wordIndex = 0;
  return text.replace(/[A-Za-z]+/g, (word) => {
    const blank = wordIndex % 3 === 1 || wordIndex % 7 === 5;
    wordIndex++;
    return blank ? "_".repeat(word.length) : word;
  });
}

export function applyMemoryMode(text: string, mode: "first-letter" | "blank-word"): string {
  return mode === "first-letter" ? firstLetterHint(text) : blankWordHint(text);
}

function normalizeWord(w: string): string {
  return w.toLowerCase().replace(/[^a-z0-9']/g, "");
}

export interface WordDiffToken {
  word: string;
  status: "correct" | "wrong" | "missing";
}

/** Word-by-word comparison of what the reader typed against the actual
 * verse text, for "type-it" mode's recall check. Case and punctuation are
 * ignored (this checks recall of the words, not exact transcription).
 * Walks both word lists in lockstep by position rather than doing a real
 * alignment/diff -- simple, and sufficient for judging "did they recall
 * this in order," which is what the mode is actually testing. */
export function diffTyped(actual: string, typed: string): WordDiffToken[] {
  const actualWords = actual.match(/[A-Za-z0-9']+/g) ?? [];
  const typedWords = typed.match(/[A-Za-z0-9']+/g) ?? [];
  const tokens: WordDiffToken[] = [];
  for (let i = 0; i < actualWords.length; i++) {
    const a = actualWords[i];
    const t = typedWords[i];
    if (t == null) {
      tokens.push({ word: a, status: "missing" });
    } else if (normalizeWord(a) === normalizeWord(t)) {
      tokens.push({ word: a, status: "correct" });
    } else {
      tokens.push({ word: a, status: "wrong" });
    }
  }
  return tokens;
}

export function diffAccuracy(tokens: WordDiffToken[]): number {
  if (tokens.length === 0) return 1;
  return tokens.filter((t) => t.status === "correct").length / tokens.length;
}

/** Which way a card is asked this time. A card that also practises its
 * reference alternates: the words to recall first, then (once recalled)
 * shown the words, say where they are -- so each is asked every other time. */
export function askWhere(card: { ask_reference: boolean; repetitions: number }): boolean {
  return card.ask_reference && card.repetitions % 2 === 1;
}

/** Whether a typed reference names the card's passage: book, chapter and
 * the verse it starts on ("John 3:16" for John 3:16-17; the end of a range
 * need not be spelled out, but "John 3" alone is not enough). */
export function referenceMatches(
  typed: { bookId: number; chapter: number; verse?: number } | null,
  card: { book_id: number; chapter: number; verse_start: number },
): boolean {
  return !!typed && typed.bookId === card.book_id && typed.chapter === card.chapter && typed.verse === card.verse_start;
}

/** The Hebrew letters that head the stanzas of Psalm 119 (and the other
 * acrostics): "NUN." in capitals in the KJV and Geneva, "[Nun.]" in
 * Young's. Capitals or brackets only, so a verse that begins "He." is not
 * taken for the letter HE. */
const LETTERS = "ALEPH|BETH|GIMEL|DALETH|HE|VAU|ZAIN|CHETH|TETH|JOD|CAPH|LAMED|MEM|NUN|SAMECH|AIN|PE|TZADDI|KOPH|RESH|SCHIN|SHIN|TAU";
const ACROSTIC_CAPS = new RegExp(String.raw`^\s*(?:${LETTERS})\.\s+`);
const ACROSTIC_BRACKETED = new RegExp(String.raw`^\s*\[(?:${LETTERS})\.\]\s+`, "i");

/**
 * A verse's words as they are learned by heart: without a psalm title the
 * translation folds into verse 1 («A Psalm of David.»), without the
 * acrostic letter over a stanza of Psalm 119 ("NUN."), and with the
 * brackets that mark supplied words taken off the words themselves
 * ("[is]" -> "is").
 */
export function memoryWords(text: string): string {
  return text
    .replace(/«[^»]*»\s*/g, "")
    .replace(ACROSTIC_CAPS, "")
    .replace(ACROSTIC_BRACKETED, "")
    .replace(/\[([^\]]*)\]/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
