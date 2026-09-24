/**
 * Where printed Greek editions of a verse differ, word by word.
 *
 * Each edition is aligned against a base edition by its words' bare letters
 * (accents, breathings and punctuation ignored, final sigma folded), using
 * the longest common subsequence: the words both share, in order, line up;
 * what is left over in either is where they differ. That is what a reader
 * wants from an apparatus most of the time -- does this edition have the
 * Comma Johanneum, the longer ending of Mark, this word or that -- though it
 * is a comparison of printed editions, not of manuscripts.
 */

export function bareGreek(word: string): string {
  return word
    .normalize("NFD")
    .replace(/[̀-ͯ᾽-῿֑-ׇ]/g, "")
    .toLowerCase()
    .replace(/ς/g, "σ")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export interface DiffWord {
  text: string;
  /** Not in the base edition, or spelled differently there. */
  differs: boolean;
  /** Index of the base word this one lines up with; for a differing word,
   * the base word it follows (-1 before the first). */
  anchor: number;
}

export interface EditionDiff {
  words: DiffWord[];
  /** Base words this edition lacks, by base index. */
  missing: number[];
}

/** Aligns `words` against `base` (both already split on whitespace). */
export function diffAgainst(base: string[], words: string[]): EditionDiff {
  const a = base.map(bareGreek);
  const b = words.map(bareGreek);
  const n = a.length;
  const m = b.length;
  // LCS table, lengths of the suffixes.
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] && a[i] !== "" ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffWord[] = [];
  const missing: number[] = [];
  let i = 0;
  let j = 0;
  let lastAnchor = -1;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j] && a[i] !== "") {
      out.push({ text: words[j], differs: false, anchor: i });
      lastAnchor = i;
      i++;
      j++;
    } else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) {
      // Punctuation-only tokens never count as a difference.
      out.push({ text: words[j], differs: b[j] !== "", anchor: lastAnchor });
      j++;
    } else {
      if (a[i] !== "") missing.push(i);
      i++;
    }
  }
  return { words: out, missing };
}

/** What an edition reads at the place after base word `anchor`: the words
 * it has there that the base does not. Empty when it reads as the base. */
export function readingAfter(diff: EditionDiff, anchor: number): string {
  return diff.words
    .filter((w) => w.differs && w.anchor === anchor)
    .map((w) => w.text)
    .join(" ");
}

/** What the base reads at that place, as seen against one edition: the run
 * of base words that edition lacks, starting right after `anchor`. */
export function baseReadingAfter(base: string[], diff: EditionDiff, anchor: number): string {
  const lacked = new Set(diff.missing);
  const out: string[] = [];
  for (let k = anchor + 1; lacked.has(k); k++) out.push(base[k]);
  return out.join(" ");
}
