import { useEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceStore, type Pane as PaneModel } from "../state/workspaceStore";
import { cx } from "../components/ui/classes";
import { PaneContext, type PaneContextValue } from "./PaneContext";
import { PANE_DRAG_TYPE, PaneHeader, usePaneTitle } from "./PaneHeader";
import { PANE_COMPONENTS } from "./paneComponents";
import { ErrorBoundary, PaneCrashCard } from "../layout/ErrorBoundary";

export const PANE_MIN_WIDTH = 280;

/** One pane: an optional header, then the view for its kind. Clicking (or
 * focusing a control) anywhere inside focuses the pane. Width is measured
 * so views can fold their toolbars when narrow. The pane fills the slot
 * the layout gives it; dropping another pane's header on it swaps the two. */
export function Pane({ pane, showHeader, tabs, maximized }: { pane: PaneModel; showHeader: boolean; tabs?: PaneModel[]; maximized?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(0);
  const [dropTarget, setDropTarget] = useState(false);
  const focused = useWorkspaceStore((s) => s.focusedPaneId === pane.id);
  const focusPane = useWorkspaceStore((s) => s.focusPane);
  const swapPanes = useWorkspaceStore((s) => s.swapPanes);
  const title = usePaneTitle(pane);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setWidth(Math.round(w));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const ctx = useMemo<PaneContextValue>(() => ({ id: pane.id, isFocused: focused, width }), [pane.id, focused, width]);
  const Component = PANE_COMPONENTS[pane.kind];

  function draggedPaneId(e: React.DragEvent): string | null {
    return e.dataTransfer.types.includes(PANE_DRAG_TYPE) ? e.dataTransfer.getData(PANE_DRAG_TYPE) || "other" : null;
  }

  return (
    <section
      ref={ref}
      data-pane-id={pane.id}
      data-pane-kind={pane.kind}
      aria-label={title}
      onPointerDownCapture={() => focusPane(pane.id)}
      onFocusCapture={() => focusPane(pane.id)}
      onDragOver={(e) => {
        if (!draggedPaneId(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!dropTarget) setDropTarget(true);
      }}
      onDragLeave={(e) => {
        if (!ref.current?.contains(e.relatedTarget as Node)) setDropTarget(false);
      }}
      onDrop={(e) => {
        const fromId = e.dataTransfer.getData(PANE_DRAG_TYPE);
        setDropTarget(false);
        if (!fromId || fromId === pane.id) return;
        e.preventDefault();
        swapPanes(fromId, pane.id);
      }}
      className={cx("relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-bg", dropTarget && "ring-2 ring-inset ring-accent")}
    >
      {showHeader && <PaneHeader pane={pane} focused={focused} tabs={tabs} maximized={maximized} />}
      <PaneContext.Provider value={ctx}>
        <div className="relative min-h-0 min-w-0 flex-1">
          {/* One view throwing costs the reader that view, not the whole
              workspace -- which may well have a manuscript open beside it.
              Keyed on the kind like the view itself, so navigating the pane
              somewhere else clears a previous failure on its own. */}
          <ErrorBoundary
            key={pane.kind}
            where={`pane:${pane.kind}`}
            fallback={(error, reset) => <PaneCrashCard error={error} onRetry={reset} />}
          >
            <Component />
          </ErrorBoundary>
        </div>
      </PaneContext.Provider>
      {dropTarget && (
        <div className="pointer-events-none absolute inset-x-0 top-10 z-20 flex justify-center" aria-hidden="true">
          <span className="rounded-md bg-accent px-2 py-1 text-xs font-medium text-white shadow">Swap panes</span>
        </div>
      )}
    </section>
  );
}
