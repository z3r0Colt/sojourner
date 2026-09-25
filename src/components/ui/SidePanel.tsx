import { useRef, useState, type ReactNode } from "react";
import { create } from "zustand";
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import { usePaneOptional } from "../../workspace/PaneContext";
import { cx } from "./classes";
import { SIDE_PANEL_DEFAULTS, sidePanelCollapsed, sidePanelWidth, type SidePanelPrefs, type SidePanelRules } from "./sidePanelLayout";

const STORAGE_KEY = "bsa-side-panels";

function load(): Record<string, SidePanelPrefs> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Each kind of side panel's width and folded state, shared by every pane
 * showing that kind and remembered across launches. */
const useSidePanelStore = create<{ prefs: Record<string, SidePanelPrefs>; set: (id: string, patch: SidePanelPrefs) => void }>((set) => ({
  prefs: load(),
  set: (id, patch) =>
    set((s) => {
      const prefs = { ...s.prefs, [id]: { ...s.prefs[id], ...patch } };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
      } catch {
        // A preference that cannot be saved still applies until the app closes.
      }
      return { prefs };
    }),
}));

const KEY_STEP_PX = 16;

/**
 * A pane's side panel -- a list, an index, a table of contents -- that the
 * reader can drag wider or narrower by its inner edge and fold away to a
 * strip (see sidePanelLayout.ts for the rules). Replaces a fixed-width
 * `<aside>`: pass the classes for the panel's own inside (`flex flex-col`,
 * `overflow-y-auto p-4`); the width, border, and background are the panel's.
 */
export function SidePanel({
  id,
  label,
  side = "left",
  defaultWidth,
  minWidth = SIDE_PANEL_DEFAULTS.minWidth,
  maxShare = SIDE_PANEL_DEFAULTS.maxShare,
  collapseBelow = SIDE_PANEL_DEFAULTS.collapseBelow,
  autoCollapse = SIDE_PANEL_DEFAULTS.autoCollapse,
  className,
  children,
}: {
  /** Names this kind of panel for the remembered width ("atlas-list"). */
  id: string;
  /** What the panel holds, for the strip and screen readers ("Places and journeys"). */
  label: string;
  side?: "left" | "right";
  defaultWidth: number;
  minWidth?: number;
  maxShare?: number;
  collapseBelow?: number;
  autoCollapse?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const paneWidth = usePaneOptional()?.width ?? 0;
  const prefs = useSidePanelStore((s) => s.prefs[id]) ?? {};
  const setPrefs = useSidePanelStore((s) => s.set);
  const [override, setOverride] = useState<boolean | null>(null);
  /** The width while a drag is under way, before it is saved. */
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  const rules: SidePanelRules = { defaultWidth, minWidth, maxShare, collapseBelow, autoCollapse };
  const collapsed = sidePanelCollapsed(prefs, rules, paneWidth, override);
  const width = sidePanelWidth({ ...prefs, width: dragWidth ?? prefs.width }, rules, paneWidth);
  const narrow = paneWidth > 0 && paneWidth < collapseBelow;
  const left = side === "left";

  function setCollapsed(next: boolean) {
    // In a narrow pane the choice holds for this pane only; in a wide one it
    // is remembered for this kind of panel.
    if (narrow) setOverride(next);
    else {
      setOverride(null);
      setPrefs(id, { collapsed: next });
    }
  }

  function saveWidth(next: number) {
    setPrefs(id, { width: sidePanelWidth({ width: next }, rules, paneWidth) });
  }

  if (collapsed) {
    const OpenIcon = left ? PanelLeftOpen : PanelRightOpen;
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        title={`Show ${label}`}
        aria-label={`Show ${label}`}
        aria-expanded={false}
        className={cx(
          "group flex w-8 shrink-0 flex-col items-center gap-3 bg-surface-2/60 py-2 text-ink-3 hover:bg-hover hover:text-ink",
          left ? "border-r border-line" : "border-l border-line",
        )}
      >
        <OpenIcon className="h-4 w-4" aria-hidden="true" />
        <span className="text-xs font-medium [writing-mode:vertical-rl]">{label}</span>
      </button>
    );
  }

  const CloseIcon = left ? PanelLeftClose : PanelRightClose;
  return (
    <aside
      aria-label={label}
      style={{ width }}
      className={cx("relative shrink-0 bg-surface-2/60", left ? "border-r border-line" : "border-l border-line")}
    >
      <div className={cx("h-full w-full min-w-0", className)}>{children}</div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${label}`}
        aria-valuenow={width}
        tabIndex={0}
        title="Drag to resize; double-click to reset"
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { startX: e.clientX, startWidth: width };
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const delta = e.clientX - d.startX;
          setDragWidth(d.startWidth + (left ? delta : -delta));
        }}
        onPointerUp={(e) => {
          if (!drag.current) return;
          drag.current = null;
          e.currentTarget.releasePointerCapture(e.pointerId);
          document.body.style.removeProperty("cursor");
          document.body.style.removeProperty("user-select");
          if (dragWidth != null) saveWidth(dragWidth);
          setDragWidth(null);
        }}
        onDoubleClick={() => setPrefs(id, { width: undefined })}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          const wider = (e.key === "ArrowRight") === left;
          saveWidth(width + (wider ? KEY_STEP_PX : -KEY_STEP_PX));
        }}
        className={cx(
          "absolute inset-y-0 z-10 w-1.5 cursor-col-resize hover:bg-accent/40 focus-visible:bg-accent/40",
          left ? "-right-1" : "-left-1",
        )}
      />
      <button
        type="button"
        onClick={() => setCollapsed(true)}
        title={`Hide ${label}`}
        aria-label={`Hide ${label}`}
        aria-expanded={true}
        className={cx(
          // Halfway down the edge, where it is clear of the search box or
          // tabs a panel usually starts with.
          "absolute top-1/2 z-20 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface text-ink-3 shadow-sm hover:text-ink",
          left ? "-right-2.5" : "-left-2.5",
        )}
      >
        <CloseIcon className="h-3 w-3" aria-hidden="true" />
      </button>
    </aside>
  );
}
