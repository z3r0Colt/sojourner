import { LayoutGrid } from "lucide-react";
import { useWorkspaceStore } from "../state/workspaceStore";
import { IconButton } from "../components/ui/Button";
import { Popover, PopoverLabel } from "../components/ui/Popover";
import { cx } from "../components/ui/classes";
import { LAYOUTS, NARROW_WINDOW, slotsOf, type LayoutId } from "./layouts";
import { useWindowWidth } from "./Workspace";

/** A small drawing of a layout: one rectangle per slot. */
export function LayoutPictogram({ id, className }: { id: LayoutId; className?: string }) {
  const W = 28;
  const H = 18;
  const g = 2;
  const rects: [number, number, number, number][] = (() => {
    const half = (W - g) / 2;
    const third = (W - 2 * g) / 3;
    const row = (H - g) / 2;
    switch (id) {
      case "one":
        return [[0, 0, W, H]];
      case "two":
        return [
          [0, 0, half, H],
          [half + g, 0, half, H],
        ];
      case "two-plus-one":
        return [
          [0, 0, half, H],
          [half + g, 0, half, row],
          [half + g, row + g, half, row],
        ];
      case "three":
        return [
          [0, 0, third, H],
          [third + g, 0, third, H],
          [2 * (third + g), 0, third, H],
        ];
      case "two-by-two":
        return [
          [0, 0, half, row],
          [half + g, 0, half, row],
          [0, row + g, half, row],
          [half + g, row + g, half, row],
        ];
    }
  })();
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className={cx("shrink-0", className)} aria-hidden="true">
      {rects.map(([x, y, w, h], i) => (
        <rect key={i} x={x + 0.5} y={y + 0.5} width={w - 1} height={h - 1} rx={1.5} fill="currentColor" fillOpacity={0.18} stroke="currentColor" strokeWidth={1} />
      ))}
    </svg>
  );
}

/** The layout picker in the top bar: one button per template, the current
 * one marked. Choosing a layout with more slots than panes leaves empty
 * slots that offer to add content. */
export function LayoutPicker() {
  const layout = useWorkspaceStore((s) => s.layout);
  const setLayout = useWorkspaceStore((s) => s.setLayout);
  const paneCount = useWorkspaceStore((s) => s.panes.length);
  const windowWidth = useWindowWidth();
  const narrow = windowWidth < NARROW_WINDOW;
  const current = LAYOUTS.find((l) => l.id === layout);

  return (
    <Popover
      width="w-64"
      trigger={({ toggle, open }) => (
        <IconButton icon={LayoutGrid} label={`Layout: ${current?.label ?? layout}. Choose a pane layout`} onClick={toggle} active={open} aria-haspopup="menu" aria-expanded={open} />
      )}
    >
      {(close) => (
        <>
          <PopoverLabel>Layout</PopoverLabel>
          <div role="radiogroup" aria-label="Pane layout" className="grid gap-0.5">
            {LAYOUTS.map((l) => {
              const active = l.id === layout;
              const extra = paneCount - l.slots;
              return (
                <button
                  key={l.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    setLayout(l.id);
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
                    <span className="block text-xs text-ink-3">
                      {extra > 0 ? `${extra} pane${extra > 1 ? "s" : ""} as tabs` : extra < 0 ? `${-extra} empty slot${extra < -1 ? "s" : ""}` : l.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {narrow && slotsOf(layout) >= 3 && (
            <p className="px-2 pb-1 pt-2 text-xs text-ink-3">The window is narrower than {NARROW_WINDOW}px, so this layout shows as two columns with tabs on the right.</p>
          )}
        </>
      )}
    </Popover>
  );
}
