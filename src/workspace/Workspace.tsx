import { useEffect, useRef, useState, type RefObject } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LayoutGrid, Minimize2, X } from "lucide-react";
import { api } from "../api/client";
import { useBooks } from "../api/queries";
import { useUiStore } from "../state/uiStore";
import { MAX_PANES, currentPassage, findPane, useWorkspaceStore, type Pane as PaneModel, type PaneKind } from "../state/workspaceStore";
import { Button, IconButton } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { Popover, PopoverItem, PopoverLabel } from "../components/ui/Popover";
import { cx } from "../components/ui/classes";
import { Pane } from "./Pane";
import { PANE_KINDS, PANE_KIND_LIST_LISTED, STUDY_STRIP_KINDS, parseRoute, routeFor } from "./paneKinds";
import { openContent } from "./openContent";
import { DIVIDER_PX, RATIO_MAX, RATIO_MIN, minSize, type BranchNode, type LayoutNode, type LeafNode } from "./layoutTree";
import { DragOverlay } from "./DragOverlay";

/**
 * The workspace: the panes arranged by the split tree (layoutTree.ts),
 * with a draggable rule between the two halves of every split, the "Add
 * pane" strip on the right edge, the URL mirror, and the launch bootstrap.
 * With one pane and no chrome hidden it renders that pane's view edge to
 * edge, exactly as the page did before panes existed.
 *
 * A leaf of the tree holding several panes shows them as tabs; an empty
 * leaf (made by "Split right" or "Split down") offers to add content.
 */

/** Keeps the URL and the focused pane's content in step, in both
 * directions. Whichever side changed since the last run wins: a change
 * made by the workspace is written to the URL with `replace`; a change
 * made elsewhere (sidebar link, palette) is applied to the focused pane.
 * On mount the restored workspace wins over whatever hash was left over. */
function useUrlMirror() {
  const location = useLocation();
  const navigate = useNavigate();
  const route = useWorkspaceStore((s) => {
    const focused = findPane(s.panes, s.focusedPaneId);
    return focused ? routeFor(focused) : "/";
  });
  const current = location.pathname + location.search;
  const prev = useRef({ route, current });
  // The hash update lands asynchronously, so a URL we wrote ourselves can
  // arrive after the pane has already moved on; it must not be mistaken
  // for a navigation made elsewhere. Every URL we write is pending until
  // it arrives.
  const pending = useRef(new Set<string>());

  useEffect(() => {
    const before = prev.current;
    prev.current = { route, current };
    const echo = pending.current.delete(current);
    if (route === current) return;
    const urlChanged = !echo && current !== before.current && route === before.route;
    if (urlChanged) {
      const parsed = parseRoute(location.pathname, location.search);
      if (parsed) {
        openContent(parsed.kind, parsed.params as never, { target: "focused" });
        return;
      }
    }
    pending.current.add(route);
    navigate(route, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, current]);
}

/** On a fresh workspace (first launch after the upgrade, or cleared
 * storage) the first Bible pane opens at the saved reading position, as
 * the app always has. A restored workspace already knows where it was. */
function useBootstrap() {
  const restored = useWorkspaceStore((s) => s.restored);
  const ready = useWorkspaceStore((s) => s.ready);
  const { data: books } = useBooks();
  useEffect(() => {
    if (ready || !books || books.length === 0) return;
    const store = useWorkspaceStore.getState();
    if (restored) {
      store.setReady();
      return;
    }
    let cancelled = false;
    api
      .getReadingPosition()
      .then((pos) => {
        if (cancelled) return;
        const s = useWorkspaceStore.getState();
        const bible = s.panes.find((p) => p.kind === "bible");
        if (bible && bible.kind === "bible" && pos && pos.book_id != null && pos.chapter != null) {
          const params = { ...bible.params, bookId: pos.book_id, chapter: pos.chapter, verse: pos.verse ?? undefined, activeVerse: pos.verse ?? null };
          if (pos.translation_id != null) params.translationId = pos.translation_id;
          s.setPaneContent(bible.id, { kind: "bible", params }, { pushHistory: false });
          s.publishPassage(bible.id, { bookId: pos.book_id, chapter: pos.chapter, verse: pos.verse ?? null });
        }
      })
      // `.finally` re-throws rather than catching, so without this a failed
      // `getReadingPosition` became an unhandled rejection. The app is not
      // stuck either way -- `setReady` still runs below -- it just opens at
      // the default passage instead of the saved one.
      .catch(() => {})
      .finally(() => {
        if (!cancelled) useWorkspaceStore.getState().setReady();
      });
    return () => {
      cancelled = true;
    };
  }, [restored, ready, books]);
}

function useElementSize(ref: RefObject<HTMLElement | null>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      setSize({ width: Math.round(r?.width ?? 0), height: Math.round(r?.height ?? 0) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/** The draggable rule between the two halves of a split. Arrow keys
 * resize it too. `onDelta` receives the pointer movement in pixels along
 * the axis. */
function Divider({ orientation, onDelta, label }: { orientation: "vertical" | "horizontal"; onDelta: (deltaPx: number) => void; label: string }) {
  const dragging = useRef<{ start: number; moved: number } | null>(null);
  const vertical = orientation === "vertical";
  const cursor = vertical ? "col-resize" : "row-resize";

  return (
    <div
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      tabIndex={0}
      title="Drag to resize"
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        dragging.current = { start: vertical ? e.clientX : e.clientY, moved: 0 };
        document.body.style.cursor = cursor;
        document.body.style.userSelect = "none";
      }}
      onPointerMove={(e) => {
        const d = dragging.current;
        if (!d) return;
        const pos = vertical ? e.clientX : e.clientY;
        const deltaPx = pos - d.start - d.moved;
        if (Math.abs(deltaPx) < 2) return;
        onDelta(deltaPx);
        d.moved += deltaPx;
      }}
      onPointerUp={(e) => {
        if (!dragging.current) return;
        dragging.current = null;
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        document.body.style.removeProperty("cursor");
        document.body.style.removeProperty("user-select");
      }}
      onKeyDown={(e) => {
        const back = vertical ? "ArrowLeft" : "ArrowUp";
        const forward = vertical ? "ArrowRight" : "ArrowDown";
        if (e.key !== back && e.key !== forward) return;
        e.preventDefault();
        onDelta(e.key === forward ? 24 : -24);
      }}
      className={cx(
        "relative z-10 shrink-0 bg-line hover:bg-accent/40 focus-visible:bg-accent/40",
        vertical ? "w-1.5 cursor-col-resize" : "h-1.5 cursor-row-resize",
      )}
    />
  );
}

/** The right-edge strip that opens a study pane beside the text. Kinds
 * that already have a pane are focused rather than opened twice. */
function AddPaneStrip() {
  const panes = useWorkspaceStore((s) => s.panes);
  const focusPane = useWorkspaceStore((s) => s.focusPane);
  const inPsalms = useWorkspaceStore((s) => currentPassage(s)?.bookId === 19);
  const full = panes.length >= MAX_PANES;

  function open(kind: PaneKind) {
    const existing = panes.find((p) => p.kind === kind);
    if (existing) focusPane(existing.id);
    else openContent(kind, {}, { target: "new" });
  }

  return (
    <div className="flex w-11 shrink-0 flex-col items-center gap-1 border-l border-line bg-surface-2/60 py-2" role="toolbar" aria-label="Add pane" data-tour="add-pane">
      {STUDY_STRIP_KINDS.filter((k) => k !== "metrical" || inPsalms).map((kind) => {
        const meta = PANE_KINDS[kind];
        const exists = panes.some((p) => p.kind === kind);
        return (
          <IconButton
            key={kind}
            icon={meta.icon}
            label={exists ? `Focus the ${meta.label} pane` : `Open ${meta.label} in a new pane`}
            active={exists}
            disabled={!exists && full}
            onClick={() => open(kind)}
          />
        );
      })}
    </div>
  );
}

/** An empty slot made by "Split": offers to fill it, or to close it again. */
function EmptySlot({ leafId }: { leafId: string }) {
  const closeLeaf = useWorkspaceStore((s) => s.closeLeaf);
  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-1 items-center justify-center bg-bg p-4" data-empty-slot="">
      <IconButton icon={X} label="Close this empty slot" size="sm" onClick={() => closeLeaf(leafId)} className="absolute right-1 top-1" />
      <EmptyState
        icon={LayoutGrid}
        title="Empty pane"
        description="Choose what to show here, drag a pane in, or Ctrl+click any link to open it in this space."
        compact
        action={
          <Popover
            width="w-60"
            align="left"
            trigger={({ toggle, open }) => (
              <Button size="sm" variant="secondary" onClick={toggle} aria-haspopup="menu" aria-expanded={open}>
                Add content…
              </Button>
            )}
          >
            {(close) => (
              <>
                <PopoverLabel>Show here</PopoverLabel>
                <div className="max-h-64 overflow-y-auto">
                  {PANE_KIND_LIST_LISTED.map((k) => {
                    const meta = PANE_KINDS[k];
                    const KindIcon = meta.icon;
                    return (
                      <PopoverItem
                        key={k}
                        onClick={() => {
                          openContent(k, {}, { target: "new", intoLeaf: leafId });
                          close();
                        }}
                      >
                        <KindIcon className="h-4 w-4 text-ink-3" aria-hidden="true" />
                        {meta.label}
                      </PopoverItem>
                    );
                  })}
                </div>
              </>
            )}
          </Popover>
        }
      />
    </div>
  );
}

/** One leaf: a pane, several panes as tabs (only the active one visible),
 * or a placeholder. Panes stay mounted while hidden so their scroll
 * position and state survive switching tabs. */
function Leaf({ leaf, showHeader }: { leaf: LeafNode; showHeader: boolean }) {
  const panes = useWorkspaceStore((s) => s.panes);
  const members = leaf.paneIds.map((id) => findPane(panes, id)).filter((p): p is PaneModel => p != null);
  if (members.length === 0) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-leaf-id={leaf.id}>
        <EmptySlot leafId={leaf.id} />
      </div>
    );
  }
  const active = leaf.activeId ?? members[0].id;
  const tabs = members.length > 1 ? members : undefined;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-leaf-id={leaf.id}>
      {members.map((pane) => (
        <div key={pane.id} hidden={pane.id !== active} className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Only the visible pane draws the tab strip; a hidden pane's
              copy would be a second set of tabs for the drag hit-test. */}
          <Pane pane={pane} showHeader={showHeader || members.length > 1} tabs={pane.id === active ? tabs : undefined} leafId={leaf.id} />
        </div>
      ))}
    </div>
  );
}

/** A split: two children along an axis with the rule between them. The
 * rule moves the ratio, clamped so neither side drops under the smallest
 * box its own leaves need. */
function Branch({ node, showHeader }: { node: BranchNode; showHeader: boolean }) {
  const setRatio = useWorkspaceStore((s) => s.setRatio);
  const ref = useRef<HTMLDivElement>(null);
  const row = node.direction === "row";

  function onDelta(px: number) {
    const el = ref.current;
    const axis = el ? (row ? el.clientWidth : el.clientHeight) - DIVIDER_PX : 0;
    if (axis <= 0) return;
    const a = minSize(node.children[0]);
    const b = minSize(node.children[1]);
    const lo = Math.max(RATIO_MIN, (row ? a.width : a.height) / axis);
    const hi = Math.min(RATIO_MAX, 1 - (row ? b.width : b.height) / axis);
    const next = node.ratio + px / axis;
    setRatio(node.id, lo <= hi ? Math.min(hi, Math.max(lo, next)) : next);
  }

  return (
    <div ref={ref} className={cx("flex min-h-0 min-w-0 flex-1", row ? "flex-row" : "flex-col")} data-branch-id={node.id}>
      <div className="flex min-h-0 min-w-0 flex-col" style={{ flex: `${node.ratio} 1 0px` }}>
        <TreeNode node={node.children[0]} showHeader={showHeader} />
      </div>
      <Divider orientation={row ? "vertical" : "horizontal"} label={row ? "Resize columns" : "Resize rows"} onDelta={onDelta} />
      <div className="flex min-h-0 min-w-0 flex-col" style={{ flex: `${1 - node.ratio} 1 0px` }}>
        <TreeNode node={node.children[1]} showHeader={showHeader} />
      </div>
    </div>
  );
}

function TreeNode({ node, showHeader }: { node: LayoutNode; showHeader: boolean }) {
  return node.type === "leaf" ? <Leaf leaf={node} showHeader={showHeader} /> : <Branch node={node} showHeader={showHeader} />;
}

/** Said once when the window cannot hold the arrangement at the panes'
 * minimum sizes; dismissed until the arrangement changes again. */
function NarrowHint({ tree, width }: { tree: LayoutNode; width: number }) {
  const [dismissedFor, setDismissedFor] = useState<LayoutNode | null>(null);
  const needed = minSize(tree).width;
  if (width <= 0 || needed <= width || dismissedFor === tree) return null;
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-line bg-surface-2 px-3 py-1 text-xs text-ink-2" role="status">
      <span className="min-w-0 flex-1">The window is narrower than this arrangement needs. Use the layout button to stack some panes as tabs, or drag a pane onto another to add it as a tab.</span>
      <Button size="sm" variant="ghost" onClick={() => setDismissedFor(tree)}>
        Dismiss
      </Button>
    </div>
  );
}

export function Workspace() {
  const panes = useWorkspaceStore((s) => s.panes);
  const tree = useWorkspaceStore((s) => s.tree);
  const maximizedPaneId = useWorkspaceStore((s) => s.maximizedPaneId);
  const distractionFreeMode = useUiStore((s) => s.distractionFreeMode);
  const containerRef = useRef<HTMLDivElement>(null);
  useUrlMirror();
  useBootstrap();

  const { width: containerWidth } = useElementSize(containerRef);
  const maximized = findPane(panes, maximizedPaneId);
  const showHeader = panes.length > 1 && !distractionFreeMode;

  return (
    <div className="flex h-full min-h-0" data-leaves={panes.length}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {!maximized && !distractionFreeMode && <NarrowHint tree={tree} width={containerWidth} />}
        <div ref={containerRef} className="flex min-h-0 min-w-0 flex-1">
          {maximized ? <Pane pane={maximized} showHeader={showHeader} maximized /> : <TreeNode node={tree} showHeader={showHeader} />}
        </div>
      </div>
      {!distractionFreeMode && <AddPaneStrip />}
      {distractionFreeMode && (
        <Button
          variant="secondary"
          size="sm"
          icon={Minimize2}
          onClick={() => {
            useWorkspaceStore.getState().setMaximized(null);
            useUiStore.getState().setDistractionFreeMode(false);
          }}
          title="Exit focus mode (Esc)"
          className="fixed right-4 top-4 z-40 shadow-lg"
        >
          Exit focus
        </Button>
      )}
      <DragOverlay />
    </div>
  );
}
