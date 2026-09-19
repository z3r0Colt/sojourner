import { useCallback, useRef } from "react";
import { create } from "zustand";
import { useWorkspaceStore, type PaneKind } from "../state/workspaceStore";
import type { Side } from "./layoutTree";

/**
 * Dragging a pane by its grip (or a tab by itself) to dock it somewhere
 * else. Pointer events throughout, never HTML5 drag-and-drop: the webview
 * hands HTML5 drags to the window's file-drop handler on Windows and the
 * page never sees them, which is why the old header drag did nothing in
 * the installed app.
 *
 * The grip captures the pointer, so moves and the release reach it even
 * over a book's iframe or a PDF's canvas. Where the pointer is over is
 * worked out against the leaf rectangles measured once when the drag
 * starts; the tree does not change mid-drag, and a window resize cancels
 * it. Nothing is dropped until the pointer has moved a few pixels, so a
 * plain click on a tab still just selects it.
 */

export type DropZone = Side | "center";

export type DragTarget =
  | { kind: "dock"; leafId: string; zone: DropZone; rect: DOMRect }
  | { kind: "tab"; leafId: string; index: number; rect: DOMRect; strip: DOMRect };

export interface DragState {
  paneId: string | null;
  label: string;
  paneKind: PaneKind | null;
  pointer: { x: number; y: number };
  target: DragTarget | null;
  start: (paneId: string, label: string, paneKind: PaneKind, x: number, y: number) => void;
  move: (x: number, y: number, target: DragTarget | null) => void;
  end: () => void;
}

export const useDragStore = create<DragState>((set) => ({
  paneId: null,
  label: "",
  paneKind: null,
  pointer: { x: 0, y: 0 },
  target: null,
  start: (paneId, label, paneKind, x, y) => set({ paneId, label, paneKind, pointer: { x, y }, target: null }),
  move: (x, y, target) => set({ pointer: { x, y }, target }),
  end: () => set({ paneId: null, label: "", paneKind: null, target: null }),
}));

/** How far the pointer must travel before a press becomes a drag. */
const DRAG_THRESHOLD_PX = 4;

interface LeafRects {
  leafId: string;
  rect: DOMRect;
  strip: DOMRect | null;
  tabs: { paneId: string; rect: DOMRect }[];
}

function measureLeaves(): LeafRects[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-leaf-id]")).map((el) => {
    const strip = el.querySelector<HTMLElement>("[data-tab-strip]");
    return {
      leafId: el.dataset.leafId!,
      rect: el.getBoundingClientRect(),
      strip: strip?.getBoundingClientRect() ?? null,
      tabs: Array.from(el.querySelectorAll<HTMLElement>("[data-tab-pane-id]")).map((t) => ({ paneId: t.dataset.tabPaneId!, rect: t.getBoundingClientRect() })),
    };
  });
}

function inside(r: DOMRect, x: number, y: number): boolean {
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

/** The edge band a drop on a side needs: a quarter of the leaf, kept
 * between 40 and 120 pixels so a huge pane still has a generous middle
 * and a tiny one still has edges. */
function band(size: number): number {
  return Math.max(40, Math.min(120, size * 0.25));
}

/** Which leaf, and where in it, the pointer is over. */
export function hitTest(rects: LeafRects[], x: number, y: number, draggedPaneId: string): DragTarget | null {
  const hit = rects.find((r) => inside(r.rect, x, y));
  if (!hit) return null;
  if (hit.strip && inside(hit.strip, x, y)) {
    // Between the tabs: the number of tab midpoints left of the pointer,
    // not counting the dragged tab itself.
    const others = hit.tabs.filter((t) => t.paneId !== draggedPaneId);
    const index = others.filter((t) => x > t.rect.left + t.rect.width / 2).length;
    return { kind: "tab", leafId: hit.leafId, index, rect: hit.rect, strip: hit.strip };
  }
  const r = hit.rect;
  const bx = band(r.width);
  const by = band(r.height);
  const d = { left: x - r.left, right: r.right - x, top: y - r.top, bottom: r.bottom - y };
  const candidates: [DropZone, number][] = [];
  if (d.left <= bx) candidates.push(["left", d.left]);
  if (d.right <= bx) candidates.push(["right", d.right]);
  if (d.top <= by) candidates.push(["top", d.top]);
  if (d.bottom <= by) candidates.push(["bottom", d.bottom]);
  candidates.sort((a, b) => a[1] - b[1]);
  const zone: DropZone = candidates[0]?.[0] ?? "center";
  return { kind: "dock", leafId: hit.leafId, zone, rect: r };
}

/** Applies a drop; the caller has already checked the target is real. */
export function applyDrop(paneId: string, target: DragTarget): void {
  const s = useWorkspaceStore.getState();
  if (target.kind === "tab") s.movePaneTo(paneId, target.leafId, "center", target.index);
  else s.movePaneTo(paneId, target.leafId, target.zone);
  useWorkspaceStore.getState().focusPane(paneId);
}

/**
 * Pointer handlers for a drag handle. `onClick` runs on a press released
 * without dragging, which is how a tab stays clickable.
 */
export function useDragHandle(paneId: string, label: string, paneKind: PaneKind, onClick?: () => void) {
  const press = useRef<{ x: number; y: number; dragging: boolean; rects: LeafRects[]; raf: number | null; cancel: () => void } | null>(null);

  const finish = useCallback((apply: boolean) => {
    const p = press.current;
    if (!p) return;
    press.current = null;
    if (p.raf != null) cancelAnimationFrame(p.raf);
    p.cancel();
    if (!p.dragging) return;
    const { target } = useDragStore.getState();
    useDragStore.getState().end();
    document.body.style.removeProperty("user-select");
    document.body.style.removeProperty("cursor");
    if (apply && target) applyDrop(paneId, target);
  }, [paneId]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      const onKey = (k: KeyboardEvent) => {
        if (k.key === "Escape") {
          k.preventDefault();
          k.stopPropagation();
          finish(false);
        }
      };
      const onResize = () => finish(false);
      window.addEventListener("keydown", onKey, true);
      window.addEventListener("resize", onResize);
      press.current = {
        x: e.clientX,
        y: e.clientY,
        dragging: false,
        rects: [],
        raf: null,
        cancel: () => {
          window.removeEventListener("keydown", onKey, true);
          window.removeEventListener("resize", onResize);
          if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
        },
      };
    },
    [finish],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const p = press.current;
      if (!p) return;
      if (!p.dragging) {
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_THRESHOLD_PX) return;
        p.dragging = true;
        p.rects = measureLeaves();
        document.body.style.userSelect = "none";
        document.body.style.cursor = "grabbing";
        useDragStore.getState().start(paneId, label, paneKind, e.clientX, e.clientY);
      }
      const { clientX, clientY } = e;
      if (p.raf != null) return;
      p.raf = requestAnimationFrame(() => {
        p.raf = null;
        if (!press.current) return;
        useDragStore.getState().move(clientX, clientY, hitTest(p.rects, clientX, clientY, paneId));
      });
    },
    [paneId, label, paneKind],
  );

  const onPointerUp = useCallback(() => {
    const wasDragging = press.current?.dragging ?? false;
    finish(true);
    if (!wasDragging) onClick?.();
  }, [finish, onClick]);

  const onPointerCancel = useCallback(() => finish(false), [finish]);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
