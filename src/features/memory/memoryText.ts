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
