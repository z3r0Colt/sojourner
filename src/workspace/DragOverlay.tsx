import { useUiStore } from "../state/uiStore";
import { cx } from "../components/ui/classes";
import { PANE_KINDS } from "./paneKinds";
import { useDragStore, type DragTarget } from "./paneDrag";

/**
 * What the reader sees while dragging a pane: a chip with the pane's name
 * following the pointer, and the place it would land drawn over the
 * target -- the half of the leaf a side dock would take, the whole leaf
 * for "add as tab", or a caret between tabs. Nothing here takes pointer
 * events; the grip holds the capture.
 */

const CARET_W = 3;

function zoneRect(t: DragTarget): { left: number; top: number; width: number; height: number; label: string } {
  if (t.kind === "tab") {
    return { left: t.strip.left, top: t.strip.top, width: t.strip.width, height: t.strip.height, label: "Move here" };
  }
  const r = t.rect;
  switch (t.zone) {
    case "left":
      return { left: r.left, top: r.top, width: r.width / 2, height: r.height, label: "Split left" };
    case "right":
      return { left: r.left + r.width / 2, top: r.top, width: r.width / 2, height: r.height, label: "Split right" };
    case "top":
      return { left: r.left, top: r.top, width: r.width, height: r.height / 2, label: "Split above" };
    case "bottom":
      return { left: r.left, top: r.top + r.height / 2, width: r.width, height: r.height / 2, label: "Split below" };
    default:
      return { left: r.left, top: r.top, width: r.width, height: r.height, label: "Add as tab" };
  }
}

export function DragOverlay() {
  const paneId = useDragStore((s) => s.paneId);
  const label = useDragStore((s) => s.label);
  const paneKind = useDragStore((s) => s.paneKind);
  const pointer = useDragStore((s) => s.pointer);
  const target = useDragStore((s) => s.target);
  const reduceMotion = useUiStore((s) => s.reduceMotion);
  if (!paneId) return null;
  const Icon = paneKind ? PANE_KINDS[paneKind].icon : null;
  const zone = target ? zoneRect(target) : null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50" aria-hidden="true">
      {zone && (
        <div
          className={cx("absolute rounded-md border-2 border-accent bg-accent/15", !reduceMotion && "transition-[left,top,width,height] duration-100")}
          style={{ left: zone.left, top: zone.top, width: zone.width, height: zone.height }}
        >
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md bg-accent px-2 py-1 text-xs font-medium text-white shadow">{zone.label}</span>
        </div>
      )}
      {target?.kind === "tab" && <TabCaret target={target} />}
      <div className="absolute flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-xs font-medium text-ink shadow-lg" style={{ left: pointer.x + 12, top: pointer.y + 12 }}>
        {Icon && <Icon className="h-3.5 w-3.5 text-ink-3" />}
        <span className="max-w-56 truncate">{label}</span>
      </div>
    </div>
  );
}

/** The insertion point between tabs, from the measured tab rectangles. */
function TabCaret({ target }: { target: Extract<DragTarget, { kind: "tab" }> }) {
  const tabs = Array.from(document.querySelectorAll<HTMLElement>(`[data-leaf-id="${target.leafId}"] [data-tab-pane-id]`))
    .filter((t) => t.dataset.tabPaneId !== useDragStore.getState().paneId)
    .map((t) => t.getBoundingClientRect());
  const x = target.index < tabs.length ? tabs[target.index].left : (tabs[tabs.length - 1]?.right ?? target.strip.left + 4);
  return <div className="absolute rounded bg-accent" style={{ left: x - CARET_W / 2, top: target.strip.top + 4, width: CARET_W, height: target.strip.height - 8 }} />;
}
