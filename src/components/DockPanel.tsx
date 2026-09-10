import { useEffect, useRef } from "react";

const MIN_WIDTH = 280;
const MAX_WIDTH = 800;

/** A resizable, collapsible, movable side panel that docks to the left or
 * right edge of whatever it's placed in. Generic on purpose -- the reading
 * view's Commentary/Cross References/Metrical tabs are its first user, but
 * nothing here is specific to them; any feature that wants the same "study
 * panel beside the main content" affordance (sermon notes, resources, etc.)
 * can reuse it directly rather than re-implementing collapse/resize/move
 * each time.
 *
 * Collapsed state renders as a thin always-visible rail (a single button)
 * rather than unmounting entirely, so the panel's open/closed toggle never
 * moves layout further than that rail's width.
 *
 * "Movable" means docking side (left/right), not free-floating -- a study
 * panel that can land anywhere mid-page would fight the two-column reading
 * layout it's meant to sit beside, so flipping which edge it hugs is the
 * useful degree of freedom here. */
export function DockPanel({
  open,
  onToggle,
  width,
  onWidthChange,
  side = "right",
  onSideChange,
  collapsedLabel = "Study",
  children,
}: {
  open: boolean;
  onToggle: () => void;
  width: number;
  onWidthChange: (width: number) => void;
  side?: "left" | "right";
  onSideChange?: (side: "left" | "right") => void;
  collapsedLabel?: string;
  children: React.ReactNode;
}) {
  const draggingRef = useRef(false);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!draggingRef.current) return;
      const fromEdge = side === "right" ? window.innerWidth - e.clientX : e.clientX;
      onWidthChange(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, fromEdge)));
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
  }, [onWidthChange, side]);

  const edgeBorder = side === "right" ? "border-l" : "border-r";

  if (!open) {
    return (
      <button
        onClick={onToggle}
        title={`Open ${collapsedLabel}`}
        className={`shrink-0 ${edgeBorder} border-gray-200 px-1 text-xs text-gray-400 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900`}
      >
        {side === "right" ? "‹" : "›"} {collapsedLabel}
      </button>
    );
  }

  return (
    <div
      style={{ width, order: side === "left" ? -1 : undefined }}
      className={`relative flex shrink-0 flex-col ${edgeBorder} border-gray-200 dark:border-gray-800`}
    >
      <div
        onMouseDown={(e) => {
          e.preventDefault();
          draggingRef.current = true;
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
        }}
        title="Drag to resize"
        className={`absolute top-0 z-10 h-full w-1.5 -translate-x-1/2 cursor-col-resize hover:bg-blue-400/30 ${
          side === "right" ? "left-0" : "right-0 translate-x-1/2"
        }`}
      />
      {onSideChange && (
        <div className="flex shrink-0 items-center justify-end border-b border-gray-100 px-1 py-0.5 dark:border-gray-800">
          <button
            onClick={() => onSideChange(side === "right" ? "left" : "right")}
            title={side === "right" ? "Move panel to left side" : "Move panel to right side"}
            className="rounded px-1.5 py-0.5 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          >
            {side === "right" ? "⇤ Move left" : "Move right ⇥"}
          </button>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
