import { useEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceStore, type Pane as PaneModel } from "../state/workspaceStore";
import { PaneContext, type PaneContextValue } from "./PaneContext";
import { PaneHeader, usePaneTitle } from "./PaneHeader";
import { PANE_COMPONENTS } from "./paneComponents";
import { ErrorBoundary, PaneCrashCard } from "../layout/ErrorBoundary";

/** One pane: an optional header, then the view for its kind. Clicking (or
 * focusing a control) anywhere inside focuses the pane. Its size is
 * measured so views can fold their toolbars when narrow or short. The pane fills the leaf
 * the tree gives it; moving it is the header's business (see paneDrag). */
export function Pane({ pane, showHeader, tabs, leafId, maximized }: { pane: PaneModel; showHeader: boolean; tabs?: PaneModel[]; leafId?: string; maximized?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const focused = useWorkspaceStore((s) => s.focusedPaneId === pane.id);
  const focusPane = useWorkspaceStore((s) => s.focusPane);
  const title = usePaneTitle(pane);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      const next = { width: Math.round(rect?.width ?? 0), height: Math.round(rect?.height ?? 0) };
      setSize((s) => (s.width === next.width && s.height === next.height ? s : next));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const ctx = useMemo<PaneContextValue>(
    () => ({ id: pane.id, isFocused: focused, width: size.width, height: size.height }),
    [pane.id, focused, size],
  );
  const Component = PANE_COMPONENTS[pane.kind];

  return (
    <section
      ref={ref}
      data-pane-id={pane.id}
      data-pane-kind={pane.kind}
      aria-label={title}
      onPointerDownCapture={() => focusPane(pane.id)}
      onFocusCapture={() => focusPane(pane.id)}
      className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-bg"
    >
      {showHeader && <PaneHeader pane={pane} focused={focused} tabs={tabs} leafId={leafId} maximized={maximized} />}
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
    </section>
  );
}
