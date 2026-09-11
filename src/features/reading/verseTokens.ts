import type { Highlight, Footnote } from "../../api/types";
import type { RedLetterSpan } from "./redLetterSpans";
import type { FindRange } from "./findMatches";

export interface Segment {
  text: string;
  color: string | null;
  style: string | null;
  highlightId: number | null;
  isRedLetter: boolean;
  /** Find-in-chapter: this segment is inside a match ("current" for the
   * one stepped to). Marks nest inside highlights like red letters do. */
  find: "match" | "current" | null;
}

export type Token = { kind: "text"; segment: Segment } | { kind: "footnote"; footnote: Footnote };

export function buildTokens(
  text: string,
  highlights: Highlight[],
  verseNum: number,
  footnotes: Footnote[],
  redLetterSpans: RedLetterSpan[] = [],
  findRanges: FindRange[] = [],
): Token[] {
  const relevant = highlights.filter((h) => verseNum >= h.verse_start && verseNum <= h.verse_end);

  const boundaries = new Set<number>([0, text.length]);
  for (const h of relevant) {
    if (h.char_start != null && h.char_end != null && h.verse_start === h.verse_end) {
      boundaries.add(Math.max(0, Math.min(text.length, h.char_start)));
      boundaries.add(Math.max(0, Math.min(text.length, h.char_end)));
    }
  }
  for (const s of redLetterSpans) {
    boundaries.add(Math.max(0, Math.min(text.length, s.start)));
    boundaries.add(Math.max(0, Math.min(text.length, s.end)));
  }
  for (const r of findRanges) {
    boundaries.add(Math.max(0, Math.min(text.length, r.start)));
    boundaries.add(Math.max(0, Math.min(text.length, r.end)));
  }
  const notesByOffset = new Map<number, Footnote[]>();
  for (const f of footnotes) {
    const offset = f.char_offset != null ? Math.max(0, Math.min(text.length, f.char_offset)) : text.length;
    boundaries.add(offset);
    const list = notesByOffset.get(offset) ?? [];
    list.push(f);
    notesByOffset.set(offset, list);
  }

  const sorted = Array.from(boundaries).sort((a, b) => a - b);
  const tokens: Token[] = [];

  // Footnotes anchored at the very start of the verse (offset 0) render before any text.
  for (const f of (notesByOffset.get(0) ?? []).sort((a, b) => a.sort_order - b.sort_order)) {
    tokens.push({ kind: "footnote", footnote: f });
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (start !== end) {
      const covering =
        relevant.find(
          (h) => h.char_start != null && h.char_end != null && h.verse_start === h.verse_end && start >= h.char_start && end <= h.char_end,
        ) ?? relevant.find((h) => h.char_start == null);
      const isRedLetter = redLetterSpans.some((s) => start >= s.start && end <= s.end);
      const found = findRanges.find((r) => start >= r.start && end <= r.end);
      tokens.push({
        kind: "text",
        segment: {
          text: text.slice(start, end),
          color: covering?.color ?? null,
          style: covering?.style ?? null,
          highlightId: covering?.id ?? null,
          isRedLetter,
          find: found ? (found.current ? "current" : "match") : null,
        },
      });
    }
    if (end > 0) {
      for (const f of (notesByOffset.get(end) ?? []).sort((a, b) => a.sort_order - b.sort_order)) {
        tokens.push({ kind: "footnote", footnote: f });
      }
    }
  }

  return tokens;
}
