import { useEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceStore, type Pane as PaneModel } from "../state/workspaceStore";
import { PaneContext, type PaneContextValue } from "./PaneContext";
import { PaneHeader, usePaneTitle } from "./PaneHeader";
import { PANE_COMPONENTS } from "./paneComponents";

export const PANE_MIN_WIDTH = 280;

/** One pane: an optional header, then the view for its kind. Clicking (or
 * focusing a control) anywhere inside focuses the pane. Width is measured
 * so views can fold their toolbars when narrow. */
export function Pane({ pane, showHeader, index, count }: { pane: PaneModel; showHeader: boolean; index: number; count: number }) {
  const ref = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(0);
  const focused = useWorkspaceStore((s) => s.focusedPaneId === pane.id);
  const focusPane = useWorkspaceStore((s) => s.focusPane);
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

  return (
    <section
      ref={ref}
      data-pane-id={pane.id}
      data-pane-kind={pane.kind}
      aria-label={title}
      onPointerDownCapture={() => focusPane(pane.id)}
      onFocusCapture={() => focusPane(pane.id)}
      className="flex min-h-0 min-w-0 flex-col bg-bg"
      style={{ flex: `${pane.width} 1 0px`, minWidth: PANE_MIN_WIDTH }}
    >
      {showHeader && <PaneHeader pane={pane} focused={focused} index={index} count={count} />}
      <PaneContext.Provider value={ctx}>
        <div className="relative min-h-0 min-w-0 flex-1">
          <Component key={pane.kind} />
        </div>
      </PaneContext.Provider>
    </section>
  );
}
