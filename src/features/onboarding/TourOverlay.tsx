import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "../../components/ui/Button";
import { useCompact } from "../../hooks/useCompact";
import { openContent } from "../../workspace/openContent";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { useTourStore } from "./tourStore";
import { advance, beginTour, skipStage, stageNumber, type TourProgress, type TourSight, type TourStage } from "./tourStages";

/**
 * The first-run tour: three things to do, not ten things to be told. The
 * old tour spotlit ten parts of the window in turn and the reader pressed
 * Next ten times; what stays with a person is what their own hand did. So
 * this one asks for the three acts the whole app turns on -- pick a verse,
 * see what is said about it, write what you see -- and waits for each
 * (tourStages.ts decides what has been done).
 *
 * It is a coach beside the app, not a dialog over it: the dimming is paint
 * only, every click and key goes to the app, and the card says what to do
 * next and where. While a note is being written it stands aside altogether.
 * Each element it points at is marked `data-tour="<name>"`. It runs on a
 * phone as on a desk; the wording changes ("tap"), the acts do not.
 */

interface Card {
  title: string;
  body: ReactNode;
  /** The `data-tour` mark to point at. */
  target: string;
  /** Shown instead when the target is not on screen. */
  lost?: ReactNode;
}

function cardFor(stage: Exclude<TourStage, "writing">, compact: boolean, menuOpen: boolean): Card {
  const tap = compact ? "Tap" : "Click";
  switch (stage) {
    case "verse":
      return {
        title: "Pick a verse",
        body: <>{tap} the small number beside any verse. Everything you can do with a verse is in the menu that opens.</>,
        target: "verse",
        lost: "Open the Bible to begin.",
      };
    case "commentary":
      return {
        title: "See what is said about it",
        body: (
          <>
            Choose <b>Commentary on this verse</b>. {compact ? "It opens as a tab of its own, at that verse." : "It opens beside the text, and follows the verse you pick from then on."}
          </>
        ),
        target: "verse-commentary",
      };
    case "followed":
      return {
        title: "See what is said about it",
        body: <>The commentary beside the text has turned to your verse. It follows whichever verse you pick.</>,
        target: "commentary-pane",
      };
    case "note":
      return menuOpen
        ? { title: "Write what you see", body: <>Choose <b>Add a note</b>, and write a line or two.</>, target: "verse-note" }
        : {
            title: "Write what you see",
            body: <>Now {tap.toLowerCase()} a verse's number again, and choose <b>Add a note</b>.</>,
            target: "verse",
            lost: (
              <>
                Go back to the Bible{compact ? " (its tab is at the top)" : ""}, then {tap.toLowerCase()} a verse's number and choose <b>Add a note</b>.
              </>
            ),
          };
    case "done":
      return {
        title: "That is the heart of it",
        body: (
          <>
            A verse, what is said about it, and what you make of it. Your notes are kept under <b>Notes</b>. <b>Help</b>, in the sidebar, has the whole tutorial and every keyboard shortcut.
          </>
        ),
        target: "help",
      };
  }
}

const PAD = 6;
const CARD_W = 340;
const GAP = 12;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function inViewport(r: DOMRect): boolean {
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
}

/** On screen to be pointed at. A phone keeps every pane laid out and shows
 * one (the others are `invisible`), so a place in the window is not enough. */
function showing(el: HTMLElement): boolean {
  return inViewport(el.getBoundingClientRect()) && getComputedStyle(el).visibility !== "hidden";
}

/** The element to spotlight for a step: the first marked element that is
 * on screen. Verse numbers are many; one just inside the pane's top is
 * scrolled into view when none is visible yet. */
function findTarget(name: string, scroll = true): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`));
  const visible = all.find(showing);
  if (visible) return visible;
  const first = all.find((el) => getComputedStyle(el).visibility !== "hidden");
  if (first && scroll) first.scrollIntoView({ block: "center" });
  return first ?? null;
}

function measure(el: HTMLElement | null): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!showing(el)) return null;
  return { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 };
}

/** Where the card goes: below the target when there is room, else above,
 * else beside it; always clamped to the window. */
function cardPosition(rect: Rect | null, cardH: number): { left: number; top: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!rect) return { left: Math.max(8, (vw - CARD_W) / 2), top: Math.max(8, (vh - cardH) / 2) };
  let left = rect.x + rect.w / 2 - CARD_W / 2;
  let top: number;
  if (rect.y + rect.h + GAP + cardH <= vh) top = rect.y + rect.h + GAP;
  else if (rect.y - GAP - cardH >= 0) top = rect.y - GAP - cardH;
  else {
    top = Math.max(8, Math.min(rect.y, vh - cardH - 8));
    left = rect.x - GAP - CARD_W >= 0 ? rect.x - GAP - CARD_W : rect.x + rect.w + GAP;
  }
  left = Math.max(8, Math.min(left, vw - CARD_W - 8));
  return { left, top };
}


/** What the tour can see of the app just now (tourStages.ts). */
function look(): TourSight {
  const commentaries = useWorkspaceStore
    .getState()
    .panes.filter((p) => p.kind === "commentary")
    .map((p) => (p.kind === "commentary" ? `${p.id}:${p.params.bookId}:${p.params.chapter}:${p.params.verse ?? ""}` : ""))
    .join("|");
  return {
    menuOpen: !!document.querySelector('[role="menu"][aria-label$=" actions"]'),
    commentaries,
    noteOpen: !!document.querySelector('[data-tour="note-editor"]'),
  };
}

export function TourOverlay({ onFinish }: { onFinish: () => void }) {
  const active = useTourStore((s) => s.active);
  const stop = useTourStore((s) => s.stop);
  const compact = useCompact();
  const [progress, setProgress] = useState<TourProgress | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const [anchor, setAnchor] = useState<Rect | null>(null);
  const [cardH, setCardH] = useState(160);
  const cardRef = useRef<HTMLDivElement>(null);
  const stage = progress?.stage ?? null;
  const card = stage && stage !== "writing" ? cardFor(stage, compact, menuOpen) : null;
  const target = card?.target ?? null;

  function finish() {
    stop();
    onFinish();
  }

  // Begin: with the text on screen. A new install opens on Today (or the
  // family worship page), so the Bible takes that pane; Back returns to it.
  useEffect(() => {
    if (!active) {
      setProgress(null);
      return;
    }
    const s = useWorkspaceStore.getState();
    const focused = s.panes.find((p) => p.id === s.focusedPaneId);
    if (focused?.kind !== "bible") openContent("bible", {}, { target: "focused" });
    setProgress(beginTour(look()));
  }, [active]);

  // Watch what the reader does, and keep the cutout on its target while the
  // app moves under it: the pane may scroll, a menu may open.
  useLayoutEffect(() => {
    if (!active) return;
    let el: HTMLElement | null = null;
    const update = () => {
      const sight = look();
      setMenuOpen(sight.menuOpen);
      setProgress((p) => (p ? advance(p, sight) : p));
      if (!target) return;
      if (!el || !el.isConnected || el.dataset.tour !== target) el = findTarget(target);
      // Gone from view (scrolled off, or its pane is no longer the one
      // showing): another of the same on screen, without moving the page.
      else if (!showing(el)) el = findTarget(target, false) ?? el;
      setRect(measure(el));
      // Beside the whole menu, not over the rest of it.
      const menu = el?.closest<HTMLElement>('[role="menu"]') ?? null;
      setAnchor(menu ? measure(menu) : null);
      if (cardRef.current) setCardH(cardRef.current.offsetHeight);
    };
    update();
    const timer = window.setInterval(update, 200);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [active, target]);

  // Standing aside while a note is written.
  if (!active || !progress || !card || stage == null || stage === "writing") return null;

  const pos = cardPosition(anchor ?? rect, cardH);
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const done = stage === "done";

  return (
    <div className="pointer-events-none fixed inset-0 z-[70]" data-tour-overlay="">
      <svg className="absolute inset-0 h-full w-full" width={vw} height={vh} aria-hidden="true">
        <defs>
          <mask id="tour-mask">
            <rect x="0" y="0" width={vw} height={vh} fill="white" />
            {rect && <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx="8" fill="black" />}
          </mask>
        </defs>
        <rect x="0" y="0" width={vw} height={vh} fill="rgba(0,0,0,0.35)" mask="url(#tour-mask)" />
        {rect && <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx="8" fill="none" stroke="var(--color-accent)" strokeWidth="2" />}
      </svg>
      <div
        ref={cardRef}
        role="region"
        aria-label="Tour"
        aria-live="polite"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            finish();
          }
        }}
        className="pointer-events-auto absolute flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 text-sm shadow-2xl"
        style={{ left: pos.left, top: pos.top, width: Math.min(CARD_W, vw - 16) }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="tour-title" className="text-base font-semibold text-ink">
            {card.title}
          </h2>
          {!done && (
            <span className="shrink-0 text-xs text-ink-3">
              {stageNumber(stage)} of 3
            </span>
          )}
        </div>
        <p id="tour-body" className="text-ink-2">
          {!rect && card.lost ? card.lost : card.body}
        </p>
        <div className="flex items-center gap-2">
          {done ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                finish();
                openContent("settings", { section: "tutorial" });
              }}
            >
              Open the tutorial
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={finish}>
              Skip tour
            </Button>
          )}
          <div className="flex-1" />
          {done ? (
            <Button size="sm" variant="primary" onClick={finish}>
              Done
            </Button>
          ) : stage === "followed" ? (
            <Button size="sm" variant="primary" onClick={() => setProgress((p) => (p ? skipStage(p) : p))}>
              Next
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setProgress((p) => (p ? skipStage(p) : p))}>
              Skip this step
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
