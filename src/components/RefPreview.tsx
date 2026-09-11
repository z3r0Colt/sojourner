import { useEffect, type RefObject } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { create } from "zustand";
import { ArrowUpRight } from "lucide-react";
import { useBooks, usePassageText } from "../api/queries";
import { useNavigationStore } from "../state/navigationStore";
import { useReadingTypography } from "../state/uiStore";
import { useViewportClampedPosition } from "../lib/useViewportClampedPosition";
import { decodeRef, REF_ATTR } from "../lib/refAttr";
import { formatRef, refKey } from "../lib/passage";
import { Button } from "./ui/Button";
import { LoadingState } from "./ui/EmptyState";
import type { PassageRef } from "../api/types";

/**
 * Hover preview for Scripture references.
 *
 * Any element carrying `data-ref="bookId:chapter:vs:ve"` (see refAttr.ts)
 * shows a small card with the passage text after a short hover, or on
 * keyboard focus. One card exists per app: `RefPreviewHost` in the shell
 * installs a single delegated listener on the document and renders the
 * card; views only add the attribute. The card never opens while a modal,
 * confirm dialog, or context menu is up, closes on mouse-out, focus-out,
 * Escape, scroll, or a click elsewhere, and stays open while the pointer
 * is over the card itself so its "Open" action is reachable.
 */

const HOVER_DELAY_MS = 350;
const LEAVE_GRACE_MS = 150;
const CARD_ATTR = "data-ref-preview-card";
/** Matches the card's `w-80`. */
const CARD_WIDTH = 320;
const CARD_GAP = 8;

interface PreviewState {
  ref: PassageRef | null;
  anchor: HTMLElement | null;
  x: number;
  y: number;
  open: (ref: PassageRef, anchor: HTMLElement) => void;
  close: () => void;
}

const useRefPreviewStore = create<PreviewState>((set) => ({
  ref: null,
  anchor: null,
  x: 0,
  y: 0,
  open: (ref, anchor) => {
    const rect = anchor.getBoundingClientRect();
    // A full-width row (a cross-reference list, a proof-text list) gets the
    // card beside it so the rows underneath stay hoverable; an inline
    // reference in running text gets it just below, like a tooltip.
    const wide = rect.width > CARD_WIDTH * 0.75;
    if (!wide) {
      set({ ref, anchor, x: rect.left, y: rect.bottom + 6 });
    } else if (rect.left - CARD_WIDTH - CARD_GAP >= CARD_GAP) {
      set({ ref, anchor, x: rect.left - CARD_WIDTH - CARD_GAP, y: rect.top });
    } else {
      set({ ref, anchor, x: rect.right + CARD_GAP, y: rect.top });
    }
  },
  close: () => set({ ref: null, anchor: null }),
}));

/** Timers shared by the delegated listener and the card, so hovering from
 * the link onto the card cancels the pending close. */
const timers = {
  open: null as number | null,
  close: null as number | null,
  scheduleClose() {
    this.cancelClose();
    this.close = window.setTimeout(() => useRefPreviewStore.getState().close(), LEAVE_GRACE_MS);
  },
  cancelClose() {
    if (this.close != null) window.clearTimeout(this.close);
    this.close = null;
  },
  cancelOpen() {
    if (this.open != null) window.clearTimeout(this.open);
    this.open = null;
  },
};

/** A modal, confirm dialog, or context menu is showing -- previews stay closed. */
function anotherLayerIsOpen(): boolean {
  return document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]') != null;
}

function findAnchor(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>(`[${REF_ATTR}]`) : null;
}

function insideCard(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(`[${CARD_ATTR}]`) != null;
}

/** Installs the delegated hover/focus listener. Pass a container to scope
 * it; the shell's `RefPreviewHost` installs it once on the document. */
export function useRefPreviews(containerRef?: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root: HTMLElement | Document = containerRef?.current ?? document;
    const store = useRefPreviewStore;

    function scheduleOpen(el: HTMLElement) {
      timers.cancelOpen();
      const ref = decodeRef(el.getAttribute(REF_ATTR));
      if (!ref) return;
      timers.open = window.setTimeout(() => {
        timers.open = null;
        if (anotherLayerIsOpen() || !el.isConnected) return;
        store.getState().open(ref, el);
      }, HOVER_DELAY_MS);
    }

    function onMouseOver(e: Event) {
      const el = findAnchor(e.target);
      if (!el) return;
      timers.cancelClose();
      if (el === store.getState().anchor) return;
      scheduleOpen(el);
    }
    function onMouseOut(e: Event) {
      const el = findAnchor(e.target);
      if (!el) return;
      const to = (e as MouseEvent).relatedTarget;
      if (to instanceof Node && el.contains(to)) return;
      timers.cancelOpen();
      if (store.getState().anchor === el && !insideCard(to)) timers.scheduleClose();
    }
    function onFocusIn(e: Event) {
      const el = findAnchor(e.target);
      if (!el) return;
      timers.cancelClose();
      if (el !== store.getState().anchor) scheduleOpen(el);
    }
    function onFocusOut(e: Event) {
      const el = findAnchor(e.target);
      if (!el) return;
      timers.cancelOpen();
      if (store.getState().anchor === el) timers.scheduleClose();
    }
    function onPointerDown(e: Event) {
      timers.cancelOpen();
      if (store.getState().ref && !insideCard(e.target)) store.getState().close();
    }
    function onScroll() {
      timers.cancelOpen();
      if (store.getState().ref) store.getState().close();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape" || !store.getState().ref) return;
      // The preview is always the topmost layer while open, so Escape
      // closes it alone and never reaches a panel underneath.
      e.stopPropagation();
      store.getState().close();
    }

    root.addEventListener("mouseover", onMouseOver);
    root.addEventListener("mouseout", onMouseOut);
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("blur", onScroll);
    return () => {
      root.removeEventListener("mouseover", onMouseOver);
      root.removeEventListener("mouseout", onMouseOut);
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("blur", onScroll);
      timers.cancelOpen();
      timers.cancelClose();
      store.getState().close();
    };
  }, [containerRef]);
}

/** Mount once in the shell: installs the listener and renders the card. */
export function RefPreviewHost() {
  useRefPreviews();
  const ref = useRefPreviewStore((s) => s.ref);
  const x = useRefPreviewStore((s) => s.x);
  const y = useRefPreviewStore((s) => s.y);
  if (!ref) return null;
  return <RefPreviewCard key={refKey(ref)} passage={ref} x={x} y={y} />;
}

function RefPreviewCard({ passage, x, y }: { passage: PassageRef; x: number; y: number }) {
  const { ref: posRef, style } = useViewportClampedPosition<HTMLDivElement>(x, y);
  const { data: books } = useBooks();
  const { data, isLoading } = usePassageText(passage);
  const typography = useReadingTypography(0.9);
  const goTo = useNavigationStore((s) => s.goTo);
  const navigate = useNavigate();
  const location = useLocation();
  const close = useRefPreviewStore((s) => s.close);

  const heading = formatRef(books, passage);
  const verses = data?.verses ?? [];
  const multi = verses.length > 1;

  function open() {
    goTo({ bookId: passage.book_id, chapter: passage.chapter, verse: passage.verse_start });
    if (location.pathname !== "/") navigate("/");
    close();
  }

  return (
    <div
      ref={posRef}
      style={style}
      role="tooltip"
      aria-label={`Preview of ${heading}`}
      {...{ [CARD_ATTR]: "" }}
      className="z-40 w-80 max-w-[calc(100vw-16px)] rounded-lg border border-line bg-surface text-sm shadow-xl"
      onMouseEnter={() => timers.cancelClose()}
      onMouseLeave={() => timers.scheduleClose()}
    >
      <div className="flex items-center justify-between gap-2 border-b border-line py-1 pl-3 pr-1">
        <span className="truncate font-semibold text-ink">{heading}</span>
        <Button size="sm" variant="ghost" icon={ArrowUpRight} onClick={open} title={`Open ${heading} in the reading view`}>
          Open
        </Button>
      </div>
      <div className="reading-font max-h-56 overflow-y-auto px-3 py-2 text-ink-2" style={typography}>
        {isLoading && <LoadingState className="py-1" />}
        {!isLoading && verses.length === 0 && (
          <p className="font-sans text-sm text-ink-3">No text for this passage in the current translation.</p>
        )}
        {verses.length > 0 && (
          <p>
            {verses.map((v, i) => (
              <span key={v.id}>
                {multi && <sup className="mr-0.5 font-sans text-xs text-ink-4">{v.verse}</sup>}
                {v.text.trim()}
                {i < verses.length - 1 ? " " : ""}
              </span>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}
