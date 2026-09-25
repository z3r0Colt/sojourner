import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import { cx } from "./classes";

interface Placement {
  up: boolean;
  maxHeight: number | null;
  top: number | null;
  bottom: number | null;
  left: number | null;
  right: number | null;
}

function samePlacement(a: Placement, b: Placement): boolean {
  return a.up === b.up && a.maxHeight === b.maxHeight && a.top === b.top && a.bottom === b.bottom && a.left === b.left && a.right === b.right;
}

/** Breathing room kept between an open panel and the edge of the window. */
const EDGE_GAP = 8;
/** What Tab can land on inside the panel or the trigger. */
const TABBABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
/** A panel shorter than this is not worth flipping or scrolling into. */
const MIN_PANEL_HEIGHT = 140;

/** Small anchored dropdown. Closes on outside click, Escape, or when the
 * trigger is clicked again. `trigger` receives the open state so it can
 * render as active.
 *
 * The panel is drawn on <body> at fixed coordinates taken from the trigger,
 * not inside the trigger's own box: inside a dialog, a pane or a side panel
 * that scrolls, an absolutely placed panel was clipped by that scroller --
 * a note's "Start from…" list cut off at the bottom of the note dialog. */
export function Popover({
  trigger,
  children,
  align = "right",
  width = "w-56",
  className,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "left" | "right";
  width?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const alignRef = useRef(align);
  alignRef.current = align;
  // Where the panel ended up and how tall it is allowed to be. A tall panel on
  // a trigger near the bottom of the window -- the read-aloud bar's settings,
  // say -- would otherwise open downwards into empty space below the screen.
  const [placement, setPlacement] = useState<Placement | null>(null);

  const reposition = useCallback(() => {
    const root = rootRef.current;
    const panel = panelRef.current;
    if (!root || !panel) return;
    const rect = root.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - EDGE_GAP;
    const above = rect.top - EDGE_GAP;
    // scrollHeight, not offsetHeight: once a max-height is in force the panel
    // measures as exactly that, and it would never grow back.
    const wanted = panel.scrollHeight;
    const up = wanted > below && above > below;
    const room = Math.max(up ? above : below, MIN_PANEL_HEIGHT);
    const next: Placement = {
      up,
      maxHeight: wanted > room ? room : null,
      top: up ? null : rect.bottom + 4,
      bottom: up ? window.innerHeight - rect.top + 4 : null,
      left: alignRef.current === "left" ? Math.max(EDGE_GAP, rect.left) : null,
      right: alignRef.current === "right" ? Math.max(EDGE_GAP, window.innerWidth - rect.right) : null,
    };
    setPlacement((prev) => (prev && samePlacement(prev, next) ? prev : next));
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    window.addEventListener("resize", reposition);
    // A panel anchored to something inside a scrolling pane moves with it.
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, reposition]);

  // Content that arrives or folds away after opening (a voice list, a revealed
  // sub-section) changes how much room the panel needs.
  useEffect(() => {
    if (!open || typeof ResizeObserver === "undefined") return;
    const panel = panelRef.current;
    if (!panel) return;
    const observer = new ResizeObserver(() => reposition());
    observer.observe(panel);
    return () => observer.disconnect();
  }, [open, reposition]);

  useEffect(() => {
    if (!open) setPlacement(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        return;
      }
      // The panel lives at the end of <body>, so Tab from the trigger would
      // skip it: step into it instead, and out of it back to the trigger.
      if (e.key === "Tab" && panelRef.current) {
        const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(TABBABLE));
        const active = document.activeElement;
        if (!e.shiftKey && rootRef.current?.contains(active) && items.length > 0) {
          e.preventDefault();
          items[0].focus();
        } else if (panelRef.current.contains(active) && (e.shiftKey ? active === items[0] : active === items[items.length - 1])) {
          e.preventDefault();
          setOpen(false);
          rootRef.current?.querySelector<HTMLElement>(TABBABLE)?.focus();
        }
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={rootRef} className={cx("relative", className)}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              // Hidden for the one frame before it is measured and placed.
              visibility: placement ? undefined : "hidden",
              top: placement?.top ?? undefined,
              bottom: placement?.bottom ?? undefined,
              left: placement?.left ?? undefined,
              right: placement?.right ?? undefined,
              maxHeight: placement?.maxHeight ?? undefined,
            }}
            className={cx(
              // Above a dialog (z-50), beneath a confirmation and the tour (z-70).
              "fixed z-[60] overflow-y-auto overscroll-contain rounded-lg border border-line bg-surface p-2 text-sm text-ink shadow-xl",
              width,
            )}
          >
            {typeof children === "function" ? children(close) : children}
          </div>,
          document.body,
        )}
    </div>
  );
}

/** A row inside a Popover: full-width, left-aligned, hover wash. `selected`
 * marks the current choice in a menu that picks one of several. */
export function PopoverItem({
  onClick,
  children,
  className,
  danger,
  selected,
}: {
  onClick: () => void;
  children: ReactNode;
  className?: string;
  danger?: boolean;
  selected?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-checked={selected}
      role={selected === undefined ? undefined : "menuitemradio"}
      className={cx(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
        danger ? "text-danger hover:bg-danger-soft" : "text-ink-2 hover:bg-hover hover:text-ink",
        selected && !danger && "font-medium text-ink",
        className,
      )}
    >
      {selected !== undefined && (
        <Check className={cx("h-3.5 w-3.5 shrink-0", selected ? "text-accent" : "opacity-0")} aria-hidden="true" />
      )}
      {children}
    </button>
  );
}

export function PopoverLabel({ children }: { children: ReactNode }) {
  return <div className="px-2 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">{children}</div>;
}
