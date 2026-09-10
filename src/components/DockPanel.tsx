import { useEffect, useRef } from "react";

const MIN_WIDTH = 280;
const MAX_WIDTH = 800;

/** A resizable, collapsible side panel docked to the right edge of whatever
 * it's placed in. Generic on purpose -- the reading view's Commentary/Cross
 * References/Metrical tabs are its first user, but nothing here is specific
 * to them; any feature that wants the same "study panel beside the main
 * content" affordance (sermon notes, resources, etc.) can reuse it directly
 * rather than re-implementing collapse/resize each time.
 *
 * Collapsed state renders as a thin always-visible rail (a single button)
 * rather than unmounting entirely, so the panel's open/closed toggle never
 * moves layout further than that rail's width. */
export function DockPanel({
  open,
  onToggle,
  width,
  onWidthChange,
  collapsedLabel = "Study",
  children,
}: {
  open: boolean;
  onToggle: () => void;
  width: number;
  onWidthChange: (width: number) => void;
  collapsedLabel?: string;
  children: React.ReactNode;
}) {
  const draggingRef = useRef(false);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!draggingRef.current) return;
      const fromRight = window.innerWidth - e.clientX;
      onWidthChange(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, fromRight)));
    }
    function onMouseUp() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onWidthChange]);

  if (!open) {
    return (
      <button
        onClick={onToggle}
        title={`Open ${collapsedLabel}`}
        className="shrink-0 border-l border-gray-200 px-1 text-xs text-gray-400 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900"
      >
        ‹ {collapsedLabel}
      </button>
    );
  }

  return (
    <div style={{ width }} className="relative flex shrink-0 flex-col border-l border-gray-200 dark:border-gray-800">
      <div
        onMouseDown={(e) => {
          e.preventDefault();
          draggingRef.current = true;
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
        }}
        title="Drag to resize"
        className="absolute left-0 top-0 z-10 h-full w-1.5 -translate-x-1/2 cursor-col-resize hover:bg-blue-400/30"
      />
      {children}
    </div>
  );
}
