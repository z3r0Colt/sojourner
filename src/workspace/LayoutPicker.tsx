import { useMemo } from "react";
import { LayoutGrid } from "lucide-react";
import { useWorkspaceStore } from "../state/workspaceStore";
import { IconButton } from "../components/ui/Button";
import { Popover, PopoverLabel } from "../components/ui/Popover";
import { cx } from "../components/ui/classes";
import { LAYOUTS, arrangementFor, detectTemplate, type LayoutId } from "./layouts";
import type { LayoutNode } from "./layoutTree";

const W = 28;
const H = 18;
const GAP = 2;

type Rect = [number, number, number, number];

/** The boxes a tree divides a W×H picture into, by its ratios. */
function rectsOf(node: LayoutNode, x: number, y: number, w: number, h: number, out: Rect[] = []): Rect[] {
  if (node.type === "leaf") {
    out.push([x, y, w, h]);
    return out;
  }
  if (node.direction === "row") {
    const a = Math.round((w - GAP) * node.ratio);
    rectsOf(node.children[0], x, y, a, h, out);
    rectsOf(node.children[1], x + a + GAP, y, w - a - GAP, h, out);
  } else {
    const a = Math.round((h - GAP) * node.ratio);
    rectsOf(node.children[0], x, y, w, a, out);
    rectsOf(node.children[1], x, y + a + GAP, w, h - a - GAP, out);
  }
  return out;
}

/** A small drawing of an arrangement: one rectangle per slot. Give it a
 * template id, or any tree. */
export function LayoutPictogram({ id, tree, className }: { id?: LayoutId; tree?: LayoutNode; className?: string }) {
  const rects = useMemo(() => {
    const node = tree ?? arrangementFor(id ?? "one", Array.from({ length: 6 }, (_, i) => String(i)));
    return rectsOf(node, 0, 0, W, H);
  }, [id, tree]);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className={cx("shrink-0", className)} aria-hidden="true">
      {rects.map(([x, y, w, h], i) => (
        <rect key={i} x={x + 0.5} y={y + 0.5} width={Math.max(0, w - 1)} height={Math.max(0, h - 1)} rx={1.5} fill="currentColor" fillOpacity={0.18} stroke="currentColor" strokeWidth={1} />
      ))}
    </svg>
  );
}

/** The layout picker in the top bar: quick arrangements, one button per
 * template, applied to the panes that exist. Panes beyond a template's
 * slots become tabs in its last slot; the arrangement can be split and
 * rearranged freely afterwards, so a template is marked as current only
 * while the panes still have exactly its shape. */
export function LayoutPicker() {
  const tree = useWorkspaceStore((s) => s.tree);
  const applyArrangement = useWorkspaceStore((s) => s.applyArrangement);
  const paneCount = useWorkspaceStore((s) => s.panes.length);
  const current = detectTemplate(tree);
  const label = current ? LAYOUTS.find((l) => l.id === current)?.label : "custom";

  return (
    <Popover
      width="w-64"
      trigger={({ toggle, open }) => (
        <IconButton icon={LayoutGrid} label={`Layout: ${label}. Choose a pane arrangement`} onClick={toggle} active={open} aria-haspopup="menu" aria-expanded={open} data-tour="layout" />
      )}
    >
      {(close) => (
        <>
          <PopoverLabel>Arrange panes</PopoverLabel>
          <div role="radiogroup" aria-label="Pane arrangement" className="grid gap-0.5">
            {LAYOUTS.map((l) => {
              const active = l.id === current;
              const extra = paneCount - l.slots;
              return (
                <button
                  key={l.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    applyArrangement((ids) => arrangementFor(l.id, ids));
                    close();
                  }}
                  className={cx(
                    "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm",
                    active ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-hover hover:text-ink",
                  )}
                >
                  <LayoutPictogram id={l.id} className={active ? "text-accent" : "text-ink-3"} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{l.label}</span>
                    <span className="block text-xs text-ink-3">{extra > 0 ? `${extra} pane${extra > 1 ? "s" : ""} as tabs` : l.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="px-2 pb-1 pt-2 text-xs text-ink-3">These are starting points. Split any pane from its ⋯ menu, or drag a pane by its grip onto another pane's edge, to arrange them however you like.</p>
        </>
      )}
    </Popover>
  );
}
