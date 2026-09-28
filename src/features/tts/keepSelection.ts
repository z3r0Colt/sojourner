// ---------------------------------------------------------------------------
// A reader's selection, kept while read-aloud redraws the text under it.
//
// The verse being read is drawn a word to a span (`ReadAloudWords`), and the
// rest as the page normally draws them, so when the voice moves on the verse
// it leaves and the verse it enters are both drawn afresh. Words selected in
// either went with the old text: the selection vanished under the reader, and
// since Chromium does not count that as a selection change, the selection
// toolbar stayed up over nothing selected.
//
// So the selection is noted as places in the text -- which passage, and how
// many characters into it -- rather than as nodes, and put back on the new
// nodes once the redraw is done. Characters are counted in the passage's own
// words: a footnote's "[a]" is drawn in the text but is not part of the verse,
// and is left out of the count, since the voice's drawing of the verse has
// none.

/** A place in a passage: the passage (the value of its marking attribute) and
 * the characters before the place in it. */
export interface TextPlace {
  key: string;
  offset: number;
}

/** A selection noted as places: where it was begun and where it was taken
 * to, which may be earlier in the text. */
export interface NotedSelection {
  anchor: TextPlace;
  focus: TextPlace;
}

/** Text drawn in a passage that is not part of its words: footnote markers,
 * buttons, anything hidden from reading or from selection. */
const NOT_TEXT = "sup, button, [aria-hidden='true'], .select-none";

function counts(text: Node, root: Element): boolean {
  const parent = text.parentElement;
  const skip = parent?.closest(NOT_TEXT);
  return !skip || !root.contains(skip);
}

function textNodes(root: Element): Text[] {
  const out: Text[] = [];
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) out.push(node as Text);
  return out;
}

/** The characters of `root`'s words before the point (`node`, `offset`). */
function offsetWithin(root: Element, node: Node, offset: number): number {
  const point = root.ownerDocument.createRange();
  point.setStart(node, offset);
  let total = 0;
  for (const text of textNodes(root)) {
    if (text === node) return counts(text, root) ? total + offset : total;
    // A text node ending at or before the point is counted whole; the first
    // one past it ends the count.
    if (point.comparePoint(text, text.length) > 0) break;
    if (counts(text, root)) total += text.length;
  }
  return total;
}

/** The point `offset` characters into `root`'s words. At the seam between
 * two text nodes, a start takes the second and an end the first. */
function pointAt(root: Element, offset: number, isEnd: boolean): [Node, number] {
  let total = 0;
  let last: Text | null = null;
  for (const text of textNodes(root)) {
    if (!counts(text, root)) continue;
    const end = total + text.length;
    if (offset < end || (isEnd && offset === end)) return [text, offset - total];
    total = end;
    last = text;
  }
  return last ? [last, last.length] : [root, 0];
}

function passageOf(node: Node | null, container: Element, attr: string): Element | null {
  const element = node == null ? null : node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  const passage = element?.closest(`[${attr}]`) ?? null;
  return passage && container.contains(passage) ? passage : null;
}

function findPassage(container: Element, attr: string, key: string): Element | null {
  for (const passage of container.querySelectorAll(`[${attr}]`)) {
    if (passage.getAttribute(attr) === key) return passage;
  }
  return null;
}

/**
 * The selection noted as places in the passages of `container` (the elements
 * carrying `attr`), or null when no words there are selected.
 */
export function noteSelection(container: Element, selection: Selection | null, attr: string): NotedSelection | null {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const anchorPassage = passageOf(selection.anchorNode, container, attr);
  const focusPassage = passageOf(selection.focusNode, container, attr);
  if (!anchorPassage || !focusPassage || !selection.anchorNode || !selection.focusNode) return null;
  return {
    anchor: { key: anchorPassage.getAttribute(attr) ?? "", offset: offsetWithin(anchorPassage, selection.anchorNode, selection.anchorOffset) },
    focus: { key: focusPassage.getAttribute(attr) ?? "", offset: offsetWithin(focusPassage, selection.focusNode, selection.focusOffset) },
  };
}

/** Whether two noted selections are the same words. */
export function sameSelection(a: NotedSelection | null, b: NotedSelection | null): boolean {
  if (!a || !b) return a === b;
  return a.anchor.key === b.anchor.key && a.anchor.offset === b.anchor.offset && a.focus.key === b.focus.key && a.focus.offset === b.focus.offset;
}

/**
 * Select the words `noted` again, on whatever nodes now draw them. False
 * when it cannot: a passage no longer on the page (scrolled out of a
 * virtualized list), or a selection that will not take.
 */
export function restoreSelection(container: Element, noted: NotedSelection, selection: Selection | null, attr: string): boolean {
  if (!selection) return false;
  const anchorPassage = findPassage(container, attr, noted.anchor.key);
  const focusPassage = findPassage(container, attr, noted.focus.key);
  if (!anchorPassage || !focusPassage) return false;
  // Which way the selection runs decides which end is the start.
  const backward =
    anchorPassage === focusPassage
      ? noted.focus.offset < noted.anchor.offset
      : (anchorPassage.compareDocumentPosition(focusPassage) & Node.DOCUMENT_POSITION_PRECEDING) !== 0;
  const [anchorNode, anchorOffset] = pointAt(anchorPassage, noted.anchor.offset, backward);
  const [focusNode, focusOffset] = pointAt(focusPassage, noted.focus.offset, !backward);
  try {
    selection.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset);
  } catch {
    return false;
  }
  return !selection.isCollapsed;
}
