/**
 * What a citation quotes. "Send to sermon" from a selection takes the
 * selected words; from an entry with nothing selected it takes the entry's
 * opening paragraph, which is nearly always the sentence a preacher wanted
 * -- a whole Henry entry pasted into a manuscript is a wall, not a quote.
 */

const MAX_EXCERPT = 1200;

/** The first paragraph of a plain-text entry, trimmed to a quotable length
 * at a sentence boundary where there is one. */
export function firstParagraph(text: string | null | undefined): string | null {
  if (!text) return null;
  const first = text
    .split(/\n{2,}|\r\n\r\n/)
    .map((p) => p.trim())
    .find((p) => p.length > 0);
  if (!first) return null;
  if (first.length <= MAX_EXCERPT) return first;
  const cut = first.slice(0, MAX_EXCERPT);
  const lastStop = cut.lastIndexOf(". ");
  return lastStop > MAX_EXCERPT / 2 ? cut.slice(0, lastStop + 1) : `${cut.trimEnd()}…`;
}

/** The words the reader has selected inside `root`, or null when the
 * selection is empty or lies outside it. */
export function selectionWithin(root: HTMLElement | null): string | null {
  const selection = window.getSelection();
  if (!root || !selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  const text = selection.toString().replace(/\s+/g, " ").trim();
  return text.length > 0 ? text.slice(0, MAX_EXCERPT) : null;
}

/** Plain text from an HTML entry, for a citation sent from imported markup. */
export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent ?? "").replace(/[ \t]+/g, " ").trim();
}
