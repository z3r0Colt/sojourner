import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cx } from "./classes";

/** Breathing room kept between an open panel and the edge of the window. */
const EDGE_GAP = 8;
/** A panel shorter than this is not worth flipping or scrolling into. */
const MIN_PANEL_HEIGHT = 140;

/** Small anchored dropdown. Closes on outside click, Escape, or when the
 * trigger is clicked again. `trigger` receives the open state so it can
 * render as active. */
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
  // Where the panel ended up and how tall it is allowed to be. A tall panel on
  // a trigger near the bottom of the window -- the read-aloud bar's settings,
  // say -- would otherwise open downwards into empty space below the screen.
  const [placement, setPlacement] = useState<{ up: boolean; maxHeight: number | null }>({ up: false, maxHeight: null });

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
    setPlacement((prev) => {
      const maxHeight = wanted > room ? room : null;
      return prev.up === up && prev.maxHeight === maxHeight ? prev : { up, maxHeight };
    });
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
    if (!open) setPlacement({ up: false, maxHeight: null });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
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
      {open && (
        <div
          ref={panelRef}
          style={placement.maxHeight != null ? { maxHeight: placement.maxHeight } : undefined}
          className={cx(
            "absolute z-30 overflow-y-auto overscroll-contain rounded-lg border border-line bg-surface p-2 text-sm shadow-xl",
            placement.up ? "bottom-full mb-1" : "top-full mt-1",
            align === "right" ? "right-0" : "left-0",
            width,
          )}
        >
          {typeof children === "function" ? children(close) : children}
        </div>
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
