export interface RedLetterSpan {
  start: number;
  end: number;
}

interface VerseText {
  verse: number;
  text: string;
}

interface QuoteResult {
  spans: RedLetterSpan[];
  /** Whether this verse's own text contained a quote mark to derive spans from. */
  hasQuoteChar: boolean;
}

/** Core quote-nesting scan shared by the primary text and the reference
 * translation (see computeRedLetterSpans below): walks a flagged verse's
 * text looking for the quotation marks it already uses to find the exact
 * quoted span(s) within it.
 *
 * Only double quotes (straight `"` and curly `“`/ `”`) are tracked -- a
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
 * rather than toggled. */
function quoteScan(verses: VerseText[], isFlagged: (verseNum: number) => boolean): Map<number, QuoteResult> {
  const result = new Map<number, QuoteResult>();
  let depth = 0;

  for (const v of verses) {
    if (!isFlagged(v.verse)) {
      depth = 0;
      result.set(v.verse, { spans: [], hasQuoteChar: false });
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

    result.set(v.verse, { spans, hasQuoteChar });
  }

  return result;
}

/** Rounds `idx` back to the start of whatever word it falls inside, so a
 * mapped span never begins mid-word. */
function wordStart(text: string, idx: number): number {
  let i = Math.max(0, Math.min(idx, text.length));
  while (i > 0 && !/\s/.test(text[i - 1])) i--;
  return i;
}

/** Rounds `idx` forward to the end of whatever word it falls inside, so a
 * mapped span never ends mid-word. */
function wordEnd(text: string, idx: number): number {
  let i = Math.max(0, Math.min(idx, text.length));
  while (i < text.length && !/\s/.test(text[i])) i++;
  return i;
}

/** Maps a span found in `refText` onto `targetText` by relative position
 * (e.g. a quote starting 20% of the way through the reference verse starts
 * ~20% of the way through the target verse), then snaps both ends outward
 * to the nearest word boundary. Translations rarely match the reference
 * word-for-word, so this is inherently approximate -- but it keeps a whole
 * clause of narration ("Jesus answering said,") from being colored red
 * along with the quote, which is the failure mode this exists to reduce. */
function mapSpanByFraction(span: RedLetterSpan, refLength: number, targetText: string): RedLetterSpan | null {
  if (refLength <= 0 || targetText.length === 0) return null;
  const start = wordStart(targetText, Math.round((span.start / refLength) * targetText.length));
  const end = wordEnd(targetText, Math.round((span.end / refLength) * targetText.length));
  if (end <= start) return null;
  return { start, end };
}

/** Computes, per verse, the character range(s) that are Christ's actual
 * quoted words -- rather than coloring an entire flagged verse red the way
 * this app used to. There's no sub-verse data to draw on directly (per-
 * translation character offsets aren't practical to source or maintain --
 * see red_letter.rs's own comment on why the importer collapses to verse
 * granularity), so this looks for quotation marks the translation's own
 * text already uses to find the exact quoted span within an already-flagged
 * verse.
 *
 * Several bundled translations don't punctuate dialogue at all (KJV, ASV,
 * Darby, Geneva, Tyndale, Webster's, YLT, Douay-Rheims), so there
 * are no quote marks in their text to find a span with. When `referenceVerses`
 * is supplied -- the same chapter in a translation that *does* use quotes,
 * e.g. WEB, the very source the red-letter ranges were derived from -- a
 * quote-less verse borrows the reference translation's span(s) by relative
 * position instead of coloring the whole verse. Only a verse whose reference
 * counterpart actually resolved a real quote (not itself a whole-verse
 * fallback) is remapped this way, since a fallback span carries no positional
 * information to borrow. Any verse with no usable reference still falls back
 * to whole-verse coloring, same as before. */
export function computeRedLetterSpans(
  verses: VerseText[],
  isFlagged: (verseNum: number) => boolean,
  referenceVerses?: VerseText[] | null,
): Map<number, RedLetterSpan[]> {
  const target = quoteScan(verses, isFlagged);
  const referenceByVerse =
    referenceVerses && referenceVerses.length > 0
      ? new Map(referenceVerses.map((v) => [v.verse, v]))
      : null;
  const reference = referenceByVerse ? quoteScan(referenceVerses!, isFlagged) : null;

  const result = new Map<number, RedLetterSpan[]>();
  for (const v of verses) {
    const own = target.get(v.verse);
    if (!own || own.hasQuoteChar || !isFlagged(v.verse)) {
      result.set(v.verse, own?.spans ?? []);
      continue;
    }

    const refResult = reference?.get(v.verse);
    const refText = referenceByVerse?.get(v.verse)?.text;
    if (refResult?.hasQuoteChar && refText) {
      const mapped = refResult.spans
        .map((s) => mapSpanByFraction(s, refText.length, v.text))
        .filter((s): s is RedLetterSpan => s !== null);
      result.set(v.verse, mapped.length > 0 ? mapped : own.spans);
    } else {
      result.set(v.verse, own.spans);
    }
  }

  return result;
}
