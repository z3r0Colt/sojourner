import { useEffect, useRef, type ReactNode } from "react";
import { ArrowLeftToLine, ArrowRightToLine, PanelRightClose } from "lucide-react";
import { IconButton } from "./ui/Button";
import { cx } from "./ui/classes";

const MIN_WIDTH = 280;
const MAX_WIDTH = 800;

/** A resizable, collapsible, movable side panel that docks to the left or
 * right edge of whatever it's placed in. Generic on purpose -- the reading
 * view's study tabs are its first user, but nothing here is specific to
 * them.
 *
 * Collapsed state renders `rail` (a thin always-visible strip, usually a
 * column of icon tabs) rather than unmounting entirely, so the panel's
 * open/closed toggle never moves layout further than that rail's width.
 *
 * "Movable" means docking side (left/right), not free-floating. */
export function DockPanel({
  open,
  onToggle,
  width,
  onWidthChange,
  side = "right",
  onSideChange,
  rail,
  header,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  width: number;
  onWidthChange: (width: number) => void;
  side?: "left" | "right";
  onSideChange?: (side: "left" | "right") => void;
  /** Rendered in place of the panel while collapsed. */
  rail: ReactNode;
  /** Rendered in the panel's top row, left of the move/close controls. */
  header?: ReactNode;
  children: ReactNode;
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
  const order = side === "left" ? -1 : undefined;

  if (!open) {
    return (
      <div style={{ order }} className={cx("flex w-11 shrink-0 flex-col items-center gap-1 bg-surface-2/60 py-2", edgeBorder, "border-line")}>
        {rail}
      </div>
    );
  }

  return (
    <div style={{ width, order }} className={cx("relative flex shrink-0 flex-col bg-surface-2/60", edgeBorder, "border-line")}>
      <div
        onMouseDown={(e) => {
          e.preventDefault();
          draggingRef.current = true;
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
        }}
        title="Drag to resize"
        className={cx(
          "absolute top-0 z-10 h-full w-1.5 -translate-x-1/2 cursor-col-resize hover:bg-accent/30",
          side === "right" ? "left-0" : "right-0 translate-x-1/2",
        )}
      />
      <div className="flex shrink-0 items-center gap-1 border-b border-line pr-1">
        <div className="min-w-0 flex-1">{header}</div>
        {onSideChange && (
          <IconButton
            icon={side === "right" ? ArrowLeftToLine : ArrowRightToLine}
            label={side === "right" ? "Move panel to the left" : "Move panel to the right"}
            size="sm"
            onClick={() => onSideChange(side === "right" ? "left" : "right")}
          />
        )}
        <IconButton icon={PanelRightClose} label="Collapse panel (Ctrl+B)" size="sm" onClick={onToggle} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
