import type { TtsSegment } from "../../state/ttsStore";
import { splitForSpeech } from "../tts/textUtils";

// ---------------------------------------------------------------------------
// Commentary, as the voice reads it.
//
// An entry used to go to the player whole: one segment per paragraph, and a
// paragraph of Barnes or Henry can run to thirteen thousand characters. The
// neural voice renders a segment entire before it plays a note, so a long one
// was a long silence under a player that said it was reading -- and there was
// no starting anywhere but at the top of the chapter. Each entry is now cut
// into sentence-sized pieces (splitForSpeech), numbered so that a click on a
// paragraph, or its "Read aloud from here", can find where that paragraph
// starts among them.

/** The part of a commentary entry reading aloud needs. */
export interface SpeakableEntry {
  id: number;
  plain_text: string;
}

export interface CommentaryReading {
  /** Every entry's pieces in order: what the player is handed. */
  segments: TtsSegment[];
  /** Where each entry's first piece sits in `segments`, by entry id. An entry
   * with nothing a voice can say -- a Greek word on its own line, a rule --
   * has none, and is passed over. */
  firstPiece: Map<number, number>;
  /** Each entry's pieces, by entry id: the words shown in place of the
   * entry's HTML while it is the one being read, so the highlighted word is
   * a word of the text actually being spoken. */
  pieces: Map<number, string[]>;
}

/** The segment id of an entry's `k`th piece (from 0). */
export function speechPieceId(entryId: number, k: number): string {
  return `${entryId}:${k}`;
}

/** The entry a piece belongs to, from the piece's segment id; null for an id
 * that is not a commentary piece's (a verse number, a book's paragraph). */
export function entryOfPiece(id: string | number | null | undefined): number | null {
  if (typeof id !== "string") return null;
  const m = /^(\d+):\d+$/.exec(id);
  return m ? Number(m[1]) : null;
}

/** "v. 3" or "vv. 3-5"; null for an entry on no verse in particular. */
export function verseRangeLabel(start: number | null, end: number | null): string | null {
  if (start == null) return null;
  return end != null && end !== start ? `vv. ${start}-${end}` : `v. ${start}`;
}

/**
 * Cuts `entries` into pieces for the voice and labels each piece with where
 * it is: `placeOf` names an entry's place ("v. 3", "Ch. 4"), and when several
 * entries share a place -- all of Calvin's paragraphs on 8:28-30 -- each gets
 * its paragraph number after it ("vv. 28-30 ¶2"), counted in reading order.
 * An entry's pieces all carry its label; the player's "5 of 40" says how far
 * through them it is.
 */
export function buildCommentaryReading<E extends SpeakableEntry>(entries: E[], placeOf: (entry: E) => string | null): CommentaryReading {
  const cut = entries.map((entry) => ({ entry, place: placeOf(entry), pieces: splitForSpeech(entry.plain_text) }));

  // How many paragraphs with something to say stand at each place. An entry
  // with nothing to say is left out of the count, so the numbers run on
  // without a gap where it was.
  const perPlace = new Map<string | null, number>();
  for (const c of cut) if (c.pieces.length > 0) perPlace.set(c.place, (perPlace.get(c.place) ?? 0) + 1);

  const segments: TtsSegment[] = [];
  const firstPiece = new Map<number, number>();
  const pieces = new Map<number, string[]>();
  const seen = new Map<string | null, number>();
  for (const { entry, place, pieces: said } of cut) {
    if (said.length === 0) continue;
    const n = (seen.get(place) ?? 0) + 1;
    seen.set(place, n);
    const numbered = (perPlace.get(place) ?? 0) > 1;
    const label = numbered ? (place ? `${place} ¶${n}` : `¶${n}`) : (place ?? undefined);
    firstPiece.set(entry.id, segments.length);
    pieces.set(entry.id, said);
    said.forEach((text, k) => segments.push({ id: speechPieceId(entry.id, k), text, label }));
  }
  return { segments, firstPiece, pieces };
}

/** The first entry at or after `entryIndex` that has something to say, as a
 * segment index; 0 when none does (the reading then starts at its top). */
export function firstSpokenFrom(reading: CommentaryReading, entries: SpeakableEntry[], entryIndex: number): number {
  for (let i = Math.max(0, entryIndex); i < entries.length; i++) {
    const at = reading.firstPiece.get(entries[i].id);
    if (at != null) return at;
  }
  return 0;
}

/** Of rows listed top to bottom by where their bottom edge is, the first
 * that is still showing below `top` by more than `slack` pixels -- a row
 * whose last line is all that is left at the top of the view has been read,
 * and reading starts after it. Null when none is. */
export function firstRowShowing(rows: { index: number; bottom: number }[], top: number, slack = 24): number | null {
  for (const row of rows) if (row.bottom > top + slack) return row.index;
  return null;
}

/** The index (its `data-entry-index`) of the first entry on screen in a
 * scrolling list, or null when none is found. */
export function firstEntryOnScreen(scroller: HTMLElement | null): number | null {
  if (!scroller) return null;
  const top = scroller.getBoundingClientRect().top;
  const rows = Array.from(scroller.querySelectorAll<HTMLElement>("[data-entry-index]"))
    .map((el) => ({ index: Number(el.dataset.entryIndex), bottom: el.getBoundingClientRect().bottom }))
    .filter((r) => Number.isFinite(r.index))
    .sort((a, b) => a.index - b.index);
  return firstRowShowing(rows, top);
}

/**
 * Where the header's Read aloud starts: at the first paragraph on screen with
 * something to say, rather than the first in the chapter. The panel beside
 * the Bible scrolls itself to the verse being read, so what the reader sees
 * there is the commentary on verse 28; a Read aloud that went back to the
 * notes on verse 1 was the same complaint as a book that always started at
 * its first word. Scrolled to the top -- or with nothing on screen to go by --
 * it reads from the top. Asked at the moment of the click: the scroll
 * position is only worth reading then.
 */
export function onScreenStart(scroller: HTMLElement | null, reading: CommentaryReading, entries: SpeakableEntry[]): number {
  const onScreen = firstEntryOnScreen(scroller);
  return onScreen == null ? 0 : firstSpokenFrom(reading, entries, onScreen);
}

/**
 * Whether a click on commentary text means "read from here": not a click on
 * a link, a button or a control inside it (a Scripture reference opens its
 * passage, as it always has), and not the mouse-up that ends a selection --
 * someone selecting a sentence to copy is not asking to hear it.
 */
export function isReadingClick(target: EventTarget | null, selection: Pick<Selection, "isCollapsed"> | null): boolean {
  if (selection && !selection.isCollapsed) return false;
  if (!(target instanceof Element)) return false;
  return !target.closest("a, button, input, select, textarea, [role='button'], [role='link']");
}

/** The piece under a click in an entry being read, by its place in the
 * reading: a `data-speech-index` around the target, or else the piece of an
 * entry shown as its HTML (`spokenEntries`) whose words are under `point`.
 * Null outside one. */
export function pieceIndexAt(target: EventTarget | null, point?: { x: number; y: number }): number | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest<HTMLElement>("[data-speech-index]");
  const n = el ? Number(el.dataset.speechIndex) : NaN;
  if (Number.isFinite(n)) return n;
  if (!point) return null;
  for (let node: Element | null = target; node; node = node.parentElement) {
    const entry = spokenEntries.get(node);
    if (entry) return pieceAtPoint(entry, point);
  }
  return null;
}

// ---------------------------------------------------------------------------
// The entry being read, shown as itself.
//
// While the voice was in an entry, the entry used to be swapped for the plain
// pieces the voice was handed, so the word being said could be lit: its
// italics ("Is enmity."), its Scripture links, went plain and dead, and the
// paragraph reflowed each time the reading reached or left it. It keeps its
// HTML now, and each piece is found in the HTML's text and marked there as a
// range (see CommentaryReadAloud's `useSpokenPieces`).

/** An entry's pieces as ranges over its HTML, and where they start in the
 * reading. */
export interface SpokenEntryRanges {
  ranges: (Range | null)[];
  /** Each piece's words as ranges, where the piece was found word for word;
   * null where it was only found roughly. */
  words: ((Range | null)[] | null)[];
  first: number;
}

/** Entries on screen shown as their HTML while being read, by the element
 * holding the HTML: what a click in one is matched against. */
export const spokenEntries = new WeakMap<Element, SpokenEntryRanges>();

/** Elements that end the word before them: paragraphs, lines, cells. */
const BREAKS_WORDS = /^(p|div|br|li|dd|dt|blockquote|h[1-6]|tr|td|th|section|article)$/i;

/** How much of a piece's start or end is looked for when the piece is not
 * found whole -- its HTML has a marker the voice was spared, say. */
const PROBE = 24;

/**
 * Where each of `pieces` stands in the text under `root`, as a Range, in
 * order; null for a piece that cannot be found. Spacing is compared plainly,
 * so a line break in the HTML is a space as it is in the piece. A piece not
 * found whole is found by its first and last words, which is enough to mark
 * it but not to mark its words one by one.
 */
export function locatePieces(root: Node, pieces: readonly string[]): { ranges: (Range | null)[]; words: ((Range | null)[] | null)[] } {
  const doc = root.ownerDocument ?? (root as Document);
  // The text under root with its spacing made plain, and for each of its
  // characters the text node and offset it came from.
  let flat = "";
  const at: { node: Text; offset: number }[] = [];
  // Elements and text both: a paragraph or a line break between two words is
  // a space between them, as it is in the plain text the pieces were cut from.
  const walker = doc.createTreeWalker(root, 0x1 | 0x4);
  let lastWasSpace = true;
  let pendingSpace = false;
  for (let next = walker.nextNode(); next; next = walker.nextNode()) {
    if (next.nodeType === 1) {
      if (BREAKS_WORDS.test((next as Element).localName)) pendingSpace = true;
      continue;
    }
    const node = next as Text;
    const data = pendingSpace && !lastWasSpace ? ` ${node.data}` : node.data;
    const shift = data.length - node.data.length;
    pendingSpace = false;
    for (let i = 0; i < data.length; i++) {
      const c = data[i];
      if (/\s/.test(c)) {
        if (lastWasSpace) continue;
        flat += " ";
        lastWasSpace = true;
      } else {
        flat += c;
        lastWasSpace = false;
      }
      at.push({ node, offset: Math.max(0, i - shift) });
    }
  }
  const rangeOf = (start: number, end: number): Range | null => {
    if (start < 0 || end <= start || end > at.length) return null;
    const range = doc.createRange();
    range.setStart(at[start].node, at[start].offset);
    range.setEnd(at[end - 1].node, at[end - 1].offset + 1);
    return range;
  };

  const ranges: (Range | null)[] = [];
  const words: ((Range | null)[] | null)[] = [];
  let from = 0;
  for (const piece of pieces) {
    const plain = piece.replace(/\s+/g, " ").trim();
    let start = plain ? flat.indexOf(plain, from) : -1;
    if (start >= 0) {
      const end = start + plain.length;
      ranges.push(rangeOf(start, end));
      const pieceWords: (Range | null)[] = [];
      for (const m of plain.matchAll(/\S+/g)) pieceWords.push(rangeOf(start + (m.index ?? 0), start + (m.index ?? 0) + m[0].length));
      words.push(pieceWords);
      from = end;
      continue;
    }
    words.push(null);
    start = plain ? flat.indexOf(plain.slice(0, PROBE), from) : -1;
    if (start < 0) {
      ranges.push(null);
      continue;
    }
    const tail = plain.slice(-PROBE);
    const tailAt = flat.indexOf(tail, start);
    const end = tailAt >= 0 && tailAt - start < plain.length * 2 ? tailAt + tail.length : Math.min(flat.length, start + plain.length);
    ranges.push(rangeOf(start, end));
    from = end;
  }
  return { ranges, words };
}

/** The piece of an entry whose words are under a point on screen: the one
 * holding the caret there, or else the last to start before it. */
function pieceAtPoint(entry: SpokenEntryRanges, point: { x: number; y: number }): number | null {
  const doc = entry.ranges.find((r) => r)?.startContainer.ownerDocument;
  const caret = doc?.caretRangeFromPoint?.(point.x, point.y);
  if (!caret) return null;
  let found: number | null = null;
  entry.ranges.forEach((range, k) => {
    if (!range) return;
    if (range.comparePoint(caret.startContainer, caret.startOffset) >= 0) found = k;
  });
  return found == null ? null : entry.first + found;
}
