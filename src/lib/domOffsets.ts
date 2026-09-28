/** Character offset of (targetNode, targetOffset) relative to root's full text content. */
export function textOffsetWithin(root: Node, targetNode: Node, targetOffset: number): number {
  let total = 0;
  let found = false;
  function walk(node: Node): boolean {
    if (node === targetNode) {
      total += targetOffset;
      return true;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      total += node.textContent?.length ?? 0;
      return false;
    }
    for (const child of Array.from(node.childNodes)) {
      if (walk(child)) return true;
    }
    return false;
  }
  found = walk(root);
  return found ? total : total;
}

export function closestWithAttr(node: Node | null, attr: string): HTMLElement | null {
  let el: Node | null = node;
  while (el) {
    if (el instanceof HTMLElement && el.hasAttribute(attr)) return el;
    el = el.parentNode;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Offsets in a verse's own words.
//
// A verse is drawn with more than its words: a footnote's "[a]" sits in the
// line, a superscript the reader can click but not select. `textOffsetWithin`
// counts every character drawn, which is right for comparing against the
// element's own `textContent` (as the word lookup does) but not for a place
// in the verse itself. A highlight is kept as characters of the verse's text
// and drawn by slicing that text, so one made from a selection counted the
// marker too and landed its length late -- "ogether until" selected after
// Romans 8:22's "[a]" came out highlighted three letters on. These count only
// the verse's words; red letters, find marks and highlights are all words.

/** Drawn in a verse but not part of its words: footnote markers (a `sup`),
 * buttons, anything hidden from reading or from selection. */
const NOT_VERSE_TEXT = "sup, button, [aria-hidden='true'], .select-none";

function isVerseText(text: Text, root: Element): boolean {
  const skip = text.parentElement?.closest(NOT_VERSE_TEXT);
  return !skip || !root.contains(skip);
}

function textNodesOf(root: Element): Text[] {
  const out: Text[] = [];
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) out.push(node as Text);
  return out;
}

/** The characters of the verse's own words in `root` before the point
 * (`node`, `offset`) -- which may be a text node and a character in it, or an
 * element and a child index, as a selection's range gives either. A point
 * inside a footnote marker counts as the place just before it. */
export function verseTextOffset(root: Element, node: Node, offset: number): number {
  const point = root.ownerDocument.createRange();
  point.setStart(node, offset);
  let total = 0;
  for (const text of textNodesOf(root)) {
    if (text === node) return isVerseText(text, root) ? total + offset : total;
    // A text node ending at or before the point is counted whole; the first
    // one past it ends the count.
    if (point.comparePoint(text, text.length) > 0) break;
    if (isVerseText(text, root)) total += text.length;
  }
  return total;
}

/** The length of the verse's own words in `root`, markers left out. */
export function verseTextLength(root: Element): number {
  let total = 0;
  for (const text of textNodesOf(root)) if (isVerseText(text, root)) total += text.length;
  return total;
}
