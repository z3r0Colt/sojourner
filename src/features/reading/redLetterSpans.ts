export interface RedLetterSpan {
  start: number;
  end: number;
}

/** Computes, per verse, the character range(s) that are Christ's actual
 * quoted words -- rather than coloring an entire flagged verse red the way
 * this app used to. There's no sub-verse data to draw on (per-translation
 * character offsets aren't practical to source or maintain -- see
 * red_letter.rs's own comment on why the importer collapses to
 * verse-granularity), so this instead looks for quotation marks the
 * translation's own text already uses to find the exact quoted span within
 * an already-flagged verse.
 *
 * Only double quotes (straight `"` and curly `“`/`”`) are tracked -- a
 * single/curly-apostrophe is too easily a possessive or contraction to use
 * reliably for this. A straight quote's role (open vs. close) is inferred
 * from the current nesting depth, so mixed straight/curly usage in the same
 * verse still nests correctly; nested quoted speech inside an outer open
 * span stays red automatically, no special-casing needed.
 *
 * Depth carries across verses in the order given (a continuing quote with
 * no closing mark yet stays open into the next verse), reset to 0 whenever
 * a verse isn't flagged at all -- the importer's own rule ("a verse is
 * flagged if any part of it falls inside a \wj span") means a genuine
 * continuation is never adjacent to a gap in flagged verses.
 *
 * Real bundled text (NASB/NKJV's John 3:10-21, verified directly) exposed a
 * common English typesetting convention this has to account for: a
 * multi-verse quotation re-opens a quote mark at the start of *every* verse
 * it continues into, closing only once at the very end -- naively treating
 * that leading mark as a close (since depth is already >0 when the verse
 * starts) would end the span after a single character and lose the rest of
 * the verse. So a quote character sitting at the very start of a verse
 * while a quote is already open is treated as a re-open marker and skipped
 * rather than toggled.
 *
 * A flagged verse with no quote characters at all colors as a whole verse
 * -- either because the translation doesn't punctuate dialogue (KJV, ASV,
 * Darby, Geneva, Tyndale, Webster's, Wycliffe, YLT, Douay-Rheims all fall
 * here) or because a quote is continuing through it with nothing to mark
 * where it picks back up. */
export function computeRedLetterSpans(
  verses: { verse: number; text: string }[],
  isFlagged: (verseNum: number) => boolean,
): Map<number, RedLetterSpan[]> {
  const result = new Map<number, RedLetterSpan[]>();
  let depth = 0;

  for (const v of verses) {
    if (!isFlagged(v.verse)) {
      depth = 0;
      result.set(v.verse, []);
      continue;
    }

    const text = v.text;
    const spans: RedLetterSpan[] = [];
    let spanStart: number | null = depth > 0 ? 0 : null;
    let hasQuoteChar = false;
    // A re-opened leading quote (see comment above) doesn't toggle anything.
    const reopenIndex = depth > 0 && (text[0] === '"' || text[0] === "“") ? 0 : -1;

    for (let i = 0; i < text.length; i++) {
      if (i === reopenIndex) continue;
      const c = text[i];
      const isOpen = c === "“" || (c === '"' && depth === 0);
      const isClose = c === "”" || (c === '"' && depth > 0);
      if (!isOpen && !isClose) continue;
      hasQuoteChar = true;

      if (isOpen) {
        depth += 1;
        if (depth === 1) spanStart = i + 1;
      } else if (depth > 0) {
        depth -= 1;
        if (depth === 0 && spanStart !== null) {
          spans.push({ start: spanStart, end: i });
          spanStart = null;
        }
      }
    }

    if (depth > 0 && spanStart !== null) {
      // Quote didn't close in this verse -- carries into the next one.
      spans.push({ start: spanStart, end: text.length });
    } else if (!hasQuoteChar) {
      spans.push({ start: 0, end: text.length });
    }

    result.set(v.verse, spans);
  }

  return result;
}
