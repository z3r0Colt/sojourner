/**
 * Where a small floating popup goes, and when the reader has scrolled its
 * text away from under it: the arithmetic behind `useViewportClampedPosition`,
 * kept free of the DOM so every case can be checked with plain numbers.
 *
 * A popup is opened from a point -- the word that was double-clicked, the
 * verse number that was right-clicked, the top of a selection -- and wants to
 * sit on one side of it. When there is no room on that side it flips to the
 * other, so a Strong's card opened on a word near the foot of the window
 * opens upwards instead of running off the bottom. When it fits on neither
 * side it takes the side with more room and is held to that height, its
 * content scrolling inside it, rather than being slid back over the very word
 * it is about.
 */

export type PopupAlign =
  /** Top-left corner at (x, y), opening downwards -- a popup opened from a
   * click point: a context menu, a word or footnote card. */
  | "top-left"
  /** Centered on x with its bottom edge `gap` px above y -- a toolbar that
   * floats just over a text selection or a highlighted span. */
  | "above-center";

export type PopupSide = "below" | "above";

export interface PopupRequest {
  /** The point the popup is opened from, in viewport pixels. */
  x: number;
  y: number;
  /** The popup's own size, uncapped: as tall as its content wants to be. */
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  align: PopupAlign;
  /** Space kept between the popup and the line it flips around. */
  gap: number;
  /** Minimum distance kept from every edge of the window. */
  margin: number;
  /** The line the popup flips around when it has to change sides. A card
   * opened just under a word flips to sit above the word's top rather than
   * above the point under it, so it does not cover the word it is about; a
   * toolbar over a selection flips to below the selection's bottom. Defaults
   * to `y`, which is right for a bare click point. */
  flipY?: number;
  /** Height at the foot of the window that is not the popup's to use: a bar
   * laid along the bottom of the app, such as the read-aloud player, which
   * the popup must not cover. The popup's margin is kept above it. Ignored
   * when the popup is opened from inside that strip -- from the bar itself --
   * where it would otherwise have nowhere to be. */
  bottomInset?: number;
}

export interface PopupPlacement {
  left: number;
  top: number;
  /** Set only when the popup fits on neither side: it is held to the room
   * there, and its content scrolls inside it. */
  maxHeight: number | null;
  /** Which side of the point it ended up on. */
  placement: PopupSide;
}

export function placePopup({ x, y, width, height, viewportWidth, viewportHeight, align, gap, margin, flipY = y, bottomInset = 0 }: PopupRequest): PopupPlacement {
  const left = clampLeft(align === "above-center" ? x - width / 2 : x, width, viewportWidth, margin);

  // The lowest the popup may reach: the window's foot, or the top of a bar
  // along it -- unless what the popup is about is itself down in that bar.
  const floor = bottomInset > 0 && Math.min(y, flipY) < viewportHeight - bottomInset ? viewportHeight - bottomInset : viewportHeight;

  // Where each side starts, and how much height it has before the margin.
  // A top-left popup hangs from y and flips to end `gap` above flipY; a
  // toolbar ends `gap` above y and flips to hang `gap` below flipY.
  const belowTop = Math.max(margin, align === "top-left" ? y : flipY + gap);
  const aboveBottom = Math.min(floor - margin, (align === "top-left" ? flipY : y) - gap);
  const room: Record<PopupSide, number> = {
    below: Math.max(0, floor - margin - belowTop),
    above: Math.max(0, aboveBottom - margin),
  };
  const topFor = (side: PopupSide, h: number) => (side === "below" ? belowTop : Math.max(margin, aboveBottom - h));

  const [preferred, other]: PopupSide[] = align === "top-left" ? ["below", "above"] : ["above", "below"];
  for (const side of [preferred, other]) {
    if (height <= room[side]) return { left, top: topFor(side, height), maxHeight: null, placement: side };
  }
  // A toolbar over a selection that fills the window -- no room above its
  // first line, and its last line at or past the foot -- has nowhere to go
  // that clears it. Cut down to the room either side has it would be a sliver
  // of its buttons, which is no toolbar at all (a card cut down still scrolls;
  // a row of buttons does not), so it drops just under the selection's first
  // line instead, over the selection, where it went before it knew where the
  // selection ends.
  if (align === "above-center" && flipY !== y) {
    const underFirstLine = Math.max(margin, y + gap);
    if (height <= floor - margin - underFirstLine) return { left, top: underFirstLine, maxHeight: null, placement: "below" };
  }
  // Too tall for either side: the roomier one (the usual side on a tie),
  // held to exactly the room it has.
  const side = room[preferred] >= room[other] ? preferred : other;
  return { left, top: topFor(side, room[side]), maxHeight: room[side], placement: side };
}

/** The line a press at height `y` landed on, out of the boxes a wrapped
 * inline element is drawn in (its `getClientRects()`, one per line): the
 * line under the press, or the nearest one when it fell between two. A popup
 * opened from a highlight that runs over several lines belongs beside the
 * line the reader pressed -- the part they can see -- rather than the top of
 * the whole highlight, which may be scrolled out of the pane. Null when the
 * element is drawn in no boxes at all. */
export function lineBoxAt<T extends { top: number; bottom: number; left: number; right: number }>(boxes: ArrayLike<T>, y: number): T | null {
  let best: T | null = null;
  let bestDistance = Infinity;
  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    // An empty box (a line break with nothing drawn on it) is no line.
    if (box.right <= box.left && box.bottom <= box.top) continue;
    const distance = y < box.top ? box.top - y : y > box.bottom ? y - box.bottom : 0;
    if (distance < bestDistance) {
      best = box;
      bestDistance = distance;
    }
  }
  return best;
}

/** Keeps a popup `width` wide inside the window's side margins. One wider
 * than the window lines up with the left margin, so its start is readable. */
function clampLeft(left: number, width: number, viewportWidth: number, margin: number): number {
  const maxLeft = Math.max(margin, viewportWidth - width - margin);
  return Math.min(Math.max(left, margin), maxLeft);
}

/** Two placements a reader could not tell apart. Measured sizes carry
 * fractions of a pixel, and re-placing a popup that has not really moved
 * would only re-render it (and re-measure it) for nothing. */
export function samePlacement(a: PopupPlacement, b: PopupPlacement): boolean {
  const near = (p: number, q: number) => Math.abs(p - q) < 0.5;
  const sameCap = a.maxHeight == null || b.maxHeight == null ? a.maxHeight === b.maxHeight : near(a.maxHeight, b.maxHeight);
  return a.placement === b.placement && near(a.left, b.left) && near(a.top, b.top) && sameCap;
}

/** A popup ignores scrolling for this long after it opens: the double-click
 * that opened a word card can nudge the page, and a verse revealed from the
 * keyboard is still settling into view. */
export const SCROLL_GRACE_MS = 300;
/** Movement smaller than this is the page settling, not the reader scrolling. */
export const SCROLL_SLOP_PX = 4;
/** How long after the reader turns the wheel, presses a scrolling key or
 * lets go of a scrollbar the text moving still counts as their doing. A
 * scroll's first frames land well inside this even on a busy machine, and
 * that is all it takes to clear the slop. */
export const READER_SCROLL_MS = 800;

export interface ScrollOffset {
  top: number;
  left: number;
}

export interface ScrollAwayWatch {
  /** Where `scroller` stands before the reader moves it, noted as they reach
   * for the wheel, a key or a scrollbar -- before anything has moved. Once
   * the popup has settled, the first position noted for a scroller stands,
   * so noting it again on every wheel step costs nothing; `where` is only
   * read when it is needed, as reading a scroll position can make the
   * browser lay the page out. */
  note(scroller: object, where: () => ScrollOffset, now: number): void;
  /** One scroll event: true once the reader has scrolled the popup's text
   * away. `byReader` is false when nothing the reader did could have moved
   * this scroller. */
  scrolled(scroller: object, offset: ScrollOffset, now: number, byReader: boolean): boolean;
}

/**
 * Decides, one scroll event at a time, whether the reader has scrolled the
 * text a popup is pinned to away from under it -- at which point the popup,
 * left floating over the wrong words, should close.
 *
 * A scroll event says only where a scroller now is, not where it started, so
 * each scroller is measured against a starting point: the one noted before
 * the reader moved it, or failing that wherever the first scroll event found
 * it. Noting it beforehand is what catches a single jump -- a wheel notch
 * with smooth scrolling turned off, a click on a scrollbar arrow -- at once,
 * rather than a notch late with the popup already over the wrong words.
 *
 * Two kinds of movement are forgiven, and simply become the new starting
 * point. Anything in the grace period after the popup opens is the page
 * settling. And anything the reader did not do is the app's own scrolling:
 * read-aloud following the spoken word down the page moves the text a line
 * at a time, and closing every popup in the pane as it went would leave the
 * reader unable to use them while listening -- the very time "Read aloud
 * from here" is wanted. Past those, the popup closes once the scroller has
 * travelled more than the slop from where it started.
 */
export function createScrollAwayWatch(openedAt: number, graceMs = SCROLL_GRACE_MS, slopPx = SCROLL_SLOP_PX): ScrollAwayWatch {
  const startingPoints = new WeakMap<object, ScrollOffset>();
  const settling = (now: number) => now - openedAt < graceMs;
  return {
    note(scroller, where, now) {
      if (settling(now) || !startingPoints.has(scroller)) startingPoints.set(scroller, where());
    },
    scrolled(scroller, offset, now, byReader) {
      const start = startingPoints.get(scroller);
      if (!start || !byReader || settling(now)) {
        startingPoints.set(scroller, offset);
        return false;
      }
      return Math.abs(offset.top - start.top) > slopPx || Math.abs(offset.left - start.left) > slopPx;
    },
  };
}

/** The keys that scroll the text in front of the reader when pressed outside
 * a text field. */
const SCROLLING_KEYS = new Set(["PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "]);

export function isScrollingKey(key: string): boolean {
  return SCROLLING_KEYS.has(key);
}

/** A scroller's box as the browser reports it: its border box, in viewport
 * pixels, and the part of that inside its borders and scrollbars. */
export interface ScrollerBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
  clientLeft: number;
  clientTop: number;
  clientWidth: number;
  clientHeight: number;
}

/** Whether a press at (x, y) on a scroller landed on one of its scrollbars --
 * the strip right of its content or the strip below it -- rather than on the
 * content. A press there is the reader taking hold of the scrollbar to scroll;
 * a press on the content is only a click. */
export function pressIsOnScrollbar(x: number, y: number, box: ScrollerBox): boolean {
  const inBox = x >= box.left && x < box.right && y >= box.top && y < box.bottom;
  const pastContent = x >= box.left + box.clientLeft + box.clientWidth || y >= box.top + box.clientTop + box.clientHeight;
  return inBox && pastContent;
}
