/** Find in chapter (F1.2): where a query occurs in a chapter's verses.
 * Computed once per chapter per query from the verse data, not the DOM, so
 * matches in rows the virtualizer has not mounted still count and can be
 * stepped to. */

export interface FindMatch {
  verse: number;
  start: number;
  end: number;
}

/** A match's character range within one verse, as `buildTokens` consumes
 * it; `current` marks the one the reader has stepped to. */
export interface FindRange {
  start: number;
  end: number;
  current: boolean;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Every occurrence of `query` in `verses`, in verse then text order.
 * Case-insensitive; `wholeWord` requires the match to stand alone between
 * non-letters. An empty or whitespace-only query matches nothing. */
export function findMatches(verses: { verse: number; text: string }[], query: string, wholeWord: boolean): FindMatch[] {
  const q = query.trim();
  if (!q) return [];
  const body = escapeRegExp(q);
  const re = new RegExp(wholeWord ? `(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])` : body, "giu");
  const out: FindMatch[] = [];
  for (const v of verses) {
    for (const m of v.text.matchAll(re)) {
      if (m[0].length === 0) continue;
      out.push({ verse: v.verse, start: m.index, end: m.index + m[0].length });
    }
  }
  return out;
}

/** Groups matches by verse for the renderers, flagging the current one.
 * Returns null when there is nothing to mark. */
export function findRangesByVerse(matches: FindMatch[], currentIndex: number): Map<number, FindRange[]> | null {
  if (matches.length === 0) return null;
  const map = new Map<number, FindRange[]>();
  matches.forEach((m, i) => {
    const list = map.get(m.verse) ?? [];
    list.push({ start: m.start, end: m.end, current: i === currentIndex });
    map.set(m.verse, list);
  });
  return map;
}
