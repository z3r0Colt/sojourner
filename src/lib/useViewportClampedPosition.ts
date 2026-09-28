import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  READER_SCROLL_MS,
  createScrollAwayWatch,
  isScrollingKey,
  placePopup,
  pressIsOnScrollbar,
  samePlacement,
  type PopupAlign,
  type PopupPlacement,
  type ScrollOffset,
  type ScrollerBox,
} from "./popupPosition";

interface Options {
  /** "top-left" (the default) hangs the popup from a click point;
   * "above-center" floats it over a selection. See `PopupAlign`. */
  align?: PopupAlign;
  gap?: number;
  /** Minimum distance kept from every viewport edge. */
  margin?: number;
  /** The line the popup flips around when it has no room on its usual side
   * -- the top of the word a card was opened under. Defaults to y. */
  flipY?: number;
  /** Called when the reader scrolls the text the popup belongs to away from
   * under it. Pass the popup's own close: a popup pinned to a point on screen
   * is left pointing at the wrong words once the page moves. Scrolling inside
   * the popup, scrolling some other pane, the page settling in the moment
   * after the popup opens, and the app's own scrolling -- read-aloud following
   * the spoken word, a verse brought into view -- are all ignored. */
  onDismiss?: () => void;
  /** Also calls `onDismiss` on Escape, as a menu closes. The popup is the
   * topmost layer, so the key goes no further -- it does not also leave
   * focus mode or close a find bar -- unless a modal is open over the popup,
   * which has the key to itself. */
  closeOnEscape?: boolean;
  /** Also calls `onDismiss` on a press anywhere outside the popup: a click
   * elsewhere in the text, on another verse, in another pane. The press goes
   * on to do what it does there. */
  closeOnPressOutside?: boolean;
}

/** For a popup's root while it is `capped` (held to a scrolling height):
 * the boxes inside it that keep a long part of it short -- a Thayer's entry,
 * a passage's text -- marked `data-popup-inner-scroll`, let go of their own
 * height, so the popup is one scroll box. Left as they are, each shows a
 * couple of lines with a scrollbar of its own beside the popup's, and a wheel
 * turned over one moves it rather than the popup. */
export const CAPPED_POPUP_CLASS = "[&_[data-popup-inner-scroll]]:max-h-none [&_[data-popup-inner-scroll]]:overflow-visible";

/** How far outside a scroller's box the popup's point may lie and still count
 * as belonging to it, when it is not known what the popup was opened from: a
 * card opened under a word at the very foot of a pane has its point a few
 * pixels below the pane's edge. */
const ANCHOR_SLACK_PX = 16;

/** How soon after the reader presses something a popup counts as opened from
 * it. A popup opens in the same moment as the click, double-click or key that
 * asks for it; this only has to outlast the render. */
const OPENED_FROM_MS = 500;

/** Positions a `position: fixed` element at a raw (x, y) point, then -- once
 * it's actually rendered and its true size is known -- places it where it
 * fits (see `placePopup`): flipped to the other side of the point when its
 * own side has no room, held to a scrolling height when neither side does,
 * and never partially or fully off-screen, nor over the read-aloud player bar
 * along the bottom of the app. Popups render once at the naive
 * position (so nothing flashes at 0,0 while waiting to measure), then correct
 * before the browser paints via `useLayoutEffect`.
 *
 * And again whenever the popup's size changes. A Strong's card opens with a
 * spinner and grows when its entry, its lexicon shelf and its Factbook match
 * arrive; placed only once, at the spinner's size, it ran off the bottom of
 * the window once the definition filled it in. It is re-placed after every
 * render of the component using it, and a ResizeObserver catches content
 * that grows on its own, as does a window resize or the player bar coming or
 * going.
 *
 * Besides the ref and style, it says whether the popup is `capped` -- held
 * to a scrolling height, so that a scroll box of its own inside it would be a
 * second scrollbar beside its own -- and whether it is `scrolled` down from
 * its top, content passing under a pinned header. */
export function useViewportClampedPosition<T extends HTMLElement>(
  x: number,
  y: number,
  { align = "top-left", gap = 8, margin = 8, flipY, onDismiss, closeOnEscape = false, closeOnPressOutside = false }: Options = {},
) {
  const ref = useRef<T>(null);
  const [placement, setPlacement] = useState<PopupPlacement | null>(null);
  const [scrolledDown, setScrolledDown] = useState(false);

  // The observers below outlive any one render; they call whatever the
  // latest render left here, so they always place with the current point.
  const reposition = useRef(() => {});
  useLayoutEffect(() => {
    reposition.current = () => {
      const el = ref.current;
      if (!el) return;
      const { width, height } = naturalSize(el);
      const next = placePopup({
        x,
        y,
        width,
        height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        align,
        gap,
        margin,
        flipY,
        bottomInset: bottomBarsHeight(),
      });
      // Only a real move re-renders, so a popup settles instead of chasing
      // its own measurements.
      setPlacement((prev) => (prev && samePlacement(prev, next) ? prev : next));
    };
    reposition.current();
  });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onChange = () => reposition.current();
    const onOwnScroll = () => setScrolledDown(el.scrollTop > 0);
    window.addEventListener("resize", onChange);
    el.addEventListener("scroll", onOwnScroll, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(onChange);
    observer?.observe(el);
    // The workspace shrinks when the player bar comes up under it -- read
    // aloud started while the popup is open -- and grows back when it goes.
    const workspace = workspaceElement();
    if (workspace) observer?.observe(workspace);
    return () => {
      window.removeEventListener("resize", onChange);
      el.removeEventListener("scroll", onOwnScroll);
      observer?.disconnect();
    };
  }, []);

  const dismiss = useRef(onDismiss);
  useLayoutEffect(() => {
    dismiss.current = onDismiss;
  });
  const dismissible = onDismiss != null;
  useEffect(() => {
    if (!dismissible) return;
    const openedAt = performance.now();
    const scrolledAway = createScrollAwayWatch(openedAt);
    const inPopup = (node: Node) => ref.current?.contains(node) ?? false;

    // Which scrollers carry the popup's text. Best known from what it was
    // opened from: the scrollers around the word, highlight or verse number
    // the reader just pressed. That holds even when the popup's point lies
    // outside them -- a toolbar over a selection whose first line has
    // scrolled above the pane floats at the top of the window, over the
    // chrome, yet belongs to the pane. Opened some other way, the popup
    // belongs to whatever scroller its point lies in.
    const anchorScrollers = scrollersAround(openedFrom(openedAt), inPopup);
    const holdsCache = new WeakMap<Element, boolean>();
    function carries(el: Element): boolean {
      if (anchorScrollers) return anchorScrollers.includes(el);
      let holds = holdsCache.get(el);
      if (holds === undefined) holdsCache.set(el, (holds = holdsPoint(el, x, y)));
      return holds;
    }
    function movesPopupText(target: EventTarget): target is Element | Document {
      if (target === document) return true;
      // The popup's own content scrolling (a long definition, a capped
      // menu) is the reader using the popup, not leaving it.
      return target instanceof Element && !inPopup(target) && carries(target);
    }

    // As the reader reaches to scroll, note where the scrollers stand before
    // anything moves, so that the very first jump -- one notch of a wheel
    // that does not scroll smoothly, a press on the scrollbar's track --
    // closes the popup at once.
    function noteStartingPoints(from: Element | null, now: number) {
      scrolledAway.note(document, () => scrollOffsetOf(document), now);
      for (const el of anchorScrollers ?? ancestorsOf(from)) {
        if (movesPopupText(el)) scrolledAway.note(el, () => scrollOffsetOf(el), now);
      }
    }

    let dismissed = false;
    function onScroll(e: Event) {
      const target = e.target;
      if (dismissed || !target || !movesPopupText(target)) return;
      const now = performance.now();
      if (!scrolledAway.scrolled(target, scrollOffsetOf(target), now, readerIsScrolling(target, now))) return;
      dismissed = true;
      dismiss.current?.();
    }
    reader.onReach.add(noteStartingPoints);
    // Capture, because scroll does not bubble: this is the only way to hear
    // every pane's scroller from one listener.
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      reader.onReach.delete(noteStartingPoints);
      document.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, [dismissible, x, y]);

  useEffect(() => {
    if (!dismissible || (!closeOnEscape && !closeOnPressOutside)) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const modal = document.querySelector('[aria-modal="true"]');
      if (modal && !(ref.current && modal.contains(ref.current))) return;
      e.stopPropagation();
      dismiss.current?.();
    }
    function onPointerDown(e: PointerEvent) {
      if (e.target instanceof Node && ref.current?.contains(e.target)) return;
      dismiss.current?.();
    }
    // Capture, so that nothing the press or key lands on can keep it from
    // the popup; the popup opened on an earlier press, so the press that
    // opened it is long past by now.
    if (closeOnEscape) window.addEventListener("keydown", onKeyDown, true);
    if (closeOnPressOutside) document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [dismissible, closeOnEscape, closeOnPressOutside]);

  const style: React.CSSProperties = placement ? placedStyle(placement) : { position: "fixed", left: x, top: y };
  const capped = placement?.maxHeight != null;

  // A popup that is not held short does not scroll, whatever its last
  // scroll position was.
  return { ref, style, capped, scrolled: capped && scrolledDown };
}

function placedStyle({ left, top, maxHeight }: PopupPlacement): React.CSSProperties {
  if (maxHeight == null) return { position: "fixed", left, top };
  return {
    position: "fixed",
    left,
    top,
    maxHeight,
    overflowY: "auto",
    // Scrolling to the end of the popup must not run on into the page behind
    // it, which would move the text and close the popup.
    overscrollBehavior: "contain",
  };
}

/** The popup's size as its content would have it. Moved to the window's
 * left edge to measure (a toolbar with no set width shrinks to fit the room
 * right of wherever it stands, and would otherwise measure narrower the
 * nearer it sits to the right edge), which is put back before anything is
 * painted. A capped popup measures as exactly its cap, and would never be
 * allowed to grow back; its height is its content's, which it scrolls, and
 * the borders round it. (The cap is not lifted to measure it: that leaves it
 * nothing to scroll, and the browser takes it back to its top and cuts short
 * a scroll under way. It is measured again after every render, so a card
 * being read jumped back to its top, and the smooth scroll of its "Webster
 * 1828" link stopped a few pixels down.) */
function naturalSize(el: HTMLElement): { width: number; height: number } {
  const { left, maxHeight } = el.style;
  el.style.left = "0px";
  const rect = el.getBoundingClientRect();
  el.style.left = left;
  const capped = maxHeight !== "" && maxHeight !== "none";
  const height = capped ? Math.max(rect.height, el.scrollHeight + el.offsetHeight - el.clientHeight) : rect.height;
  return { width: rect.width, height };
}

/** The app's workspace: the panes, which is where the text popups are about
 * lives. The shell lays its bars along the bottom beneath it. */
function workspaceElement(): Element | null {
  return document.querySelector("main");
}

/** How much of the foot of the window the app's bottom bars take -- the
 * read-aloud player bar, and anything else the shell stacks under the
 * workspace -- which a popup is to keep clear of (`bottomInset`). A Strong's
 * card opened on a word low in the pane while a chapter was being read ran
 * to the foot of the window, over the player's title and controls. Measured
 * as the height below the workspace, so a bar counts for exactly as long as
 * it is on screen, and nothing that draws one has to report it. */
function bottomBarsHeight(): number {
  const workspace = workspaceElement();
  if (!workspace) return 0;
  return Math.max(0, window.innerHeight - workspace.getBoundingClientRect().bottom);
}

function holdsPoint(el: Element, x: number, y: number): boolean {
  const rect = el.getBoundingClientRect();
  return (
    x >= rect.left - ANCHOR_SLACK_PX &&
    x <= rect.right + ANCHOR_SLACK_PX &&
    y >= rect.top - ANCHOR_SLACK_PX &&
    y <= rect.bottom + ANCHOR_SLACK_PX
  );
}

function scrollOffsetOf(target: Element | Document): ScrollOffset {
  if (target instanceof Element) return { top: target.scrollTop, left: target.scrollLeft };
  return { top: window.scrollY, left: window.scrollX };
}

/** Content taller or wider than the box it is shown in: something that can
 * scroll, or be scrolled. */
function overflows(el: Element): boolean {
  return el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth;
}

function ancestorsOf(el: Element | null): Element[] {
  const found: Element[] = [];
  for (let at = el; at; at = at.parentElement) found.push(at);
  return found;
}

/** The scrollers `el` sits in, innermost first, leaving out any inside the
 * popup itself -- or null when there are none to go by, as for a key pressed
 * with nothing in particular focused. */
function scrollersAround(el: Element | null, inPopup: (node: Node) => boolean): Element[] | null {
  const found = ancestorsOf(el).filter((at) => overflows(at) && !inPopup(at));
  return found.length > 0 ? found : null;
}

/* ---- What the reader is doing with their hands ---------------------------
 *
 * A scroll event does not say who moved the text. Read-aloud follows the
 * spoken word down the page a line at a time, and a verse jumped to is
 * scrolled into view; closing every popup in the pane as that happens would
 * leave the reader unable to use them while listening -- just when "Read
 * aloud from here" is wanted. But the reader cannot scroll without first
 * doing something the page hears: turning the wheel, swiping, pressing a
 * scrolling key, taking hold of a scrollbar. Those are heard here, once for
 * the whole app, from the moment this module loads. Listening only while a
 * popup is open would be too late for the other thing kept here: the element
 * the reader pressed to open it, which happened before the popup existed.
 */

interface Reach {
  at: number;
  /** Where the reader reached: the element under the wheel or the finger,
   * the scroller whose scrollbar they took hold of, or the element a
   * scrolling key was pressed in. Null for a key pressed with nothing in
   * particular focused, which scrolls whatever the browser last had in hand. */
  from: Element | null;
}

const reader = {
  reach: null as Reach | null,
  /** A scrollbar is held: dragging its thumb goes on as long as the reader
   * likes, and all of it is their doing. */
  holdingScrollbar: false,
  lastPressed: null as { target: Element; at: number } | null,
  /** The open popups, each told as the reader reaches to scroll so that it
   * can note where its scrollers stand before they move. */
  onReach: new Set<(from: Element | null, now: number) => void>(),
};

/** Whether the reader has just reached to scroll `scroller` -- turned the
 * wheel or swiped over it, taken hold of its scrollbar, or pressed a
 * scrolling key -- so that its moving now is their doing rather than the
 * app's. A wheel turned over one pane says nothing about another. */
export function readerIsScrolling(scroller: EventTarget, now = performance.now()): boolean {
  const { reach } = reader;
  if (!reach || (!reader.holdingScrollbar && now - reach.at >= READER_SCROLL_MS)) return false;
  return reach.from == null || !(scroller instanceof Node) || scroller.contains(reach.from);
}

/** The element the reader pressed to open a popup opening now -- the word
 * double-clicked, the highlight or verse number clicked, the text a selection
 * was started in -- if they pressed it just now and it is still there. */
function openedFrom(openedAt: number): Element | null {
  const pressed = reader.lastPressed;
  return pressed && openedAt - pressed.at < OPENED_FROM_MS && pressed.target.isConnected ? pressed.target : null;
}

function reachToScroll(target: EventTarget | null) {
  const now = performance.now();
  const from = target instanceof Element && target !== document.body && target !== document.documentElement ? target : null;
  reader.reach = { at: now, from };
  for (const noteStartingPoints of reader.onReach) noteStartingPoints(from, now);
}

function notePressed(target: EventTarget | null) {
  if (target instanceof Element) reader.lastPressed = { target, at: performance.now() };
}

function isTextField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || target.matches("input, textarea, select"));
}

function boxOf(el: Element): ScrollerBox {
  const { left, top, right, bottom } = el.getBoundingClientRect();
  return { left, top, right, bottom, clientLeft: el.clientLeft, clientTop: el.clientTop, clientWidth: el.clientWidth, clientHeight: el.clientHeight };
}

function onPointerDown(e: MouseEvent) {
  notePressed(e.target);
  // The middle button starts the browser's own autoscroll.
  if (e.button === 1) {
    reachToScroll(e.target);
  } else if (e.target instanceof Element && overflows(e.target) && pressIsOnScrollbar(e.clientX, e.clientY, boxOf(e.target))) {
    reader.holdingScrollbar = true;
    reachToScroll(e.target);
  }
}

function onPointerUp(e: MouseEvent) {
  // A long press opens its popup only as the button comes up.
  if (e.type === "pointerup") notePressed(e.target);
  if (!reader.holdingScrollbar) return;
  reader.holdingScrollbar = false;
  // The thumb's last moves land just after the button comes up.
  if (reader.reach) reader.reach = { ...reader.reach, at: performance.now() };
}

function onKeyDown(e: KeyboardEvent) {
  notePressed(e.target);
  if (isScrollingKey(e.key) && !isTextField(e.target)) reachToScroll(e.target);
}

if (typeof window !== "undefined") {
  // On the window and in the capture phase, so that nothing the app does
  // with these events -- a menu swallowing its keys -- keeps them from here.
  const heard = { capture: true, passive: true };
  window.addEventListener("wheel", (e) => reachToScroll(e.target), heard);
  window.addEventListener("touchmove", (e) => reachToScroll(e.target), heard);
  window.addEventListener("keydown", onKeyDown, heard);
  window.addEventListener("pointerdown", onPointerDown, heard);
  window.addEventListener("pointerup", onPointerUp, heard);
  window.addEventListener("pointercancel", onPointerUp, heard);
}
