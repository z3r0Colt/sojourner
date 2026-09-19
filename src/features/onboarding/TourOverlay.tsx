import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "../../components/ui/Button";
import { Kbd } from "../../components/ui/Page";
import { openContent } from "../../workspace/openContent";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { useTourStore } from "./tourStore";

/**
 * Nine spotlight steps drawn over the live app (F3.7). Each target is an
 * element marked `data-tour="<name>"`; the overlay measures it, dims
 * everything else with an SVG mask cutout, and floats a card beside it.
 * Fully keyboard-driven: Tab stays inside the card, Right/Left step,
 * Escape skips. A step whose target is not on screen (say, the Bible is
 * not open) shows its card centered instead of spotlighting nothing.
 */

interface Step {
  target: string;
  title: string;
  body: ReactNode;
  /** Shown when the target cannot be found on screen. */
  missing: string;
  /** This step points at a pane header, so a second pane must be open. */
  needsSecondPane?: boolean;
}

export const TOUR_STEPS: Step[] = [
  {
    target: "goto",
    title: "Jump anywhere",
    body: (
      <>
        Click <b>Go to</b> (or press <Kbd>Ctrl</Kbd>+<Kbd>K</Kbd>) and type a reference like “John 3:16”, a Strong's number, or a word. Type <Kbd>&gt;</Kbd> first to list every command the app has.
      </>
    ),
    missing: "The Go to button sits in the top bar.",
  },
  {
    target: "verse",
    title: "Click a verse; linked panes follow it",
    body: (
      <>
        Click a verse number for its menu: highlight, note, copy, compare, memorize, bookmark. Click anywhere on a verse to select it, and every linked commentary, cross-reference, or confession pane moves to it. <Kbd>↓</Kbd> and <Kbd>↑</Kbd> select the next and previous verse.
      </>
    ),
    missing: "Open the Bible to see this in place.",
  },
  {
    target: "add-pane",
    title: "Study beside the text",
    body: (
      <>
        These icons open Commentary, Cross references, Confessions, or Mine (your own notes on the chapter) beside the text. <Kbd>Ctrl</Kbd>+click any link, sidebar item, or reference to open it in a new pane.
      </>
    ),
    missing: "The Add pane strip sits on the right edge of the Bible page.",
  },
  {
    target: "pane-header",
    title: "Every pane has a header",
    body: (
      <>
        The letter is the pane's link group: panes in one group follow each other's passage. The dotted grip at the left moves the pane: drag it onto another pane's edge to split that pane, or onto its middle to add it as a tab. Double-click the header to maximize; the ⋯ menu changes what the pane shows, splits it, or closes it.
      </>
    ),
    missing: "Headers appear once a second pane is open.",
    needsSecondPane: true,
  },
  {
    target: "layout",
    title: "Arrange the panes",
    body: (
      <>
        Pick a quick arrangement here, from one pane to two by three. Then split, drag, and resize freely: every divider is its own, and up to eight panes fit. The Workspaces button beside it saves an arrangement under a name.
      </>
    ),
    missing: "The layout button sits in the top bar, beside Workspaces.",
  },
  {
    target: "sidebar-library",
    title: "The library",
    body: (
      <>
        Works someone else wrote: the Westminster Confession and Catechisms, a Hebrew and Greek lexicon, two Bible dictionaries, the ISBE encyclopedia, an atlas of 1,342 places, and Resources for your own books, audio, and video.
      </>
    ),
    missing: "The Library group is in the sidebar on the left.",
  },
  {
    target: "sidebar-notebook",
    title: "Your notebook",
    body: (
      <>
        What you write: Notes on verses and chapters, every Highlight in one place, Sermons with a manuscript editor, rehearsal clock, and slides, and Illustrations kept apart from any one sermon.
      </>
    ),
    missing: "The Notebook group is in the sidebar on the left.",
  },
  {
    target: "sidebar-devotion",
    title: "Daily practice",
    body: (
      <>
        Reading plans (M'Cheyne, chronological, and your own), a Prayer journal and prayer list, and Scripture and catechism Memory with spaced repetition. Today, at the top of the sidebar, gathers all of it for the day.
      </>
    ),
    missing: "The Devotion group is in the sidebar on the left.",
  },
  {
    target: "settings",
    title: "Settings and the tutorial",
    body: (
      <>
        Theme, text, backups, added translations, the book library pack, and a full written tutorial with a step for every feature. Press <Kbd>Ctrl</Kbd>+<Kbd>/</Kbd> any time for the keyboard shortcuts.
      </>
    ),
    missing: "Settings is at the bottom of the sidebar.",
  },
];

const STEPS = TOUR_STEPS;

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

/** The element to spotlight for a step: the first marked element that is
 * on screen. Verse numbers are many; one just inside the pane's top is
 * scrolled into view when none is visible yet. */
function findTarget(name: string): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`));
  const visible = all.find((el) => inViewport(el.getBoundingClientRect()));
  if (visible) return visible;
  const first = all[0];
  if (first) first.scrollIntoView({ block: "center" });
  return first ?? null;
}

function measure(el: HTMLElement | null): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!inViewport(r)) return null;
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

export function TourOverlay({ onFinish }: { onFinish: () => void }) {
  const active = useTourStore((s) => s.active);
  const step = useTourStore((s) => s.step);
  const next = useTourStore((s) => s.next);
  const back = useTourStore((s) => s.back);
  const stop = useTourStore((s) => s.stop);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardH, setCardH] = useState(160);
  const cardRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const current = STEPS[step];
  const last = step === STEPS.length - 1;

  function finish() {
    // A pane the tour opened for its header step goes away with the tour.
    const opened = useTourStore.getState().openedPaneId;
    if (opened) {
      useWorkspaceStore.getState().closePane(opened);
      useTourStore.getState().setOpenedPane(null);
    }
    stop();
    onFinish();
  }

  // The header step has nothing to point at on a fresh install's single
  // pane, so the tour opens a commentary pane beside the Bible for it.
  useEffect(() => {
    if (!active || !current?.needsSecondPane) return;
    const ws = useWorkspaceStore.getState();
    if (ws.panes.length > 1) return;
    const before = new Set(ws.panes.map((p) => p.id));
    openContent("commentary", {}, { target: "new" });
    const added = useWorkspaceStore.getState().panes.find((p) => !before.has(p.id));
    if (added) useTourStore.getState().setOpenedPane(added.id);
  }, [active, current]);

  // Keep the cutout on its target while the app moves under it: the pane
  // may scroll, the window may resize, a query may reflow the toolbar.
  useLayoutEffect(() => {
    if (!active || !current) return;
    let el = findTarget(current.target);
    const update = () => {
      if (!el || !el.isConnected) el = findTarget(current.target);
      setRect(measure(el));
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
  }, [active, step, current]);

  // Focus lands on the primary button of each step and stays in the card.
  useEffect(() => {
    if (!active) return;
    const opener = document.activeElement as HTMLElement | null;
    primaryRef.current?.focus();
    return () => opener?.focus?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  useEffect(() => {
    if (active) primaryRef.current?.focus();
  }, [active, step]);

  useEffect(() => {
    if (!active) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        finish();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        if (last) finish();
        else next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        back();
      } else if (e.key === "Tab" && cardRef.current) {
        const nodes = Array.from(cardRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]"));
        if (nodes.length === 0) return;
        const first = nodes[0];
        const end = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          end.focus();
        } else if (!e.shiftKey && document.activeElement === end) {
          e.preventDefault();
          first.focus();
        } else if (!cardRef.current.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    // Capture phase, so the page's own shortcuts (verse keys, Ctrl+K) never
    // act underneath the tour.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, step, last]);

  if (!active || !current) return null;

  const pos = cardPosition(rect, cardH);
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  return (
    <div className="fixed inset-0 z-[70]" data-tour-overlay="">
      <svg className="absolute inset-0 h-full w-full" width={vw} height={vh} aria-hidden="true">
        <defs>
          <mask id="tour-mask">
            <rect x="0" y="0" width={vw} height={vh} fill="white" />
            {rect && <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx="8" fill="black" />}
          </mask>
        </defs>
        <rect x="0" y="0" width={vw} height={vh} fill="rgba(0,0,0,0.55)" mask="url(#tour-mask)" />
        {rect && <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx="8" fill="none" stroke="var(--color-accent)" strokeWidth="2" />}
      </svg>
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        className="absolute flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 text-sm shadow-2xl"
        style={{ left: pos.left, top: pos.top, width: CARD_W }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="tour-title" className="text-base font-semibold text-ink">
            {current.title}
          </h2>
          <span className="shrink-0 text-xs text-ink-3">
            {step + 1} of {STEPS.length}
          </span>
        </div>
        <p id="tour-body" className="text-ink-2">
          {current.body}
          {!rect && <span className="mt-1 block text-xs text-ink-3">{current.missing}</span>}
        </p>
        <div className="flex items-center gap-2">
          {last ? (
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
          {step > 0 && (
            <Button size="sm" variant="ghost" onClick={back}>
              Back
            </Button>
          )}
          <Button ref={primaryRef} size="sm" variant="primary" onClick={last ? finish : next}>
            {last ? "Done" : "Next"}
          </Button>
        </div>
        <p className="text-xs text-ink-4" aria-hidden="true">
          <Kbd>→</Kbd> next · <Kbd>←</Kbd> back · <Kbd>Esc</Kbd> skip
        </p>
      </div>
    </div>
  );
}
