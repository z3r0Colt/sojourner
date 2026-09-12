import { Fragment, useEffect, useRef, useState, type RefObject } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LayoutGrid, Minimize2 } from "lucide-react";
import { api } from "../api/client";
import { useBooks } from "../api/queries";
import { useUiStore } from "../state/uiStore";
import { currentPassage, findPane, useWorkspaceStore, type Pane as PaneModel, type PaneKind } from "../state/workspaceStore";
import { Button, IconButton } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { Popover, PopoverItem, PopoverLabel } from "../components/ui/Popover";
import { cx } from "../components/ui/classes";
import { Pane, PANE_MIN_WIDTH } from "./Pane";
import { PANE_KINDS, PANE_KIND_LIST_LISTED, STUDY_STRIP_KINDS, parseRoute, routeFor } from "./paneKinds";
import { openContent } from "./openContent";
import { assignSlots, columnsOf, effectiveLayout, slotsOf } from "./layouts";

/**
 * The workspace: the panes arranged by the chosen layout template with
 * draggable dividers, the "Add pane" strip on the right edge, the URL
 * mirror, and the launch bootstrap. With one pane and no chrome hidden it
 * renders that pane's view edge to edge, exactly as the page did before
 * panes existed.
 *
 * Layouts (see layouts.ts) are columns of slots. A slot holding several
 * panes shows them as tabs in the pane header; an empty slot offers to add
 * content. Below 1300px of window width the three- and four-slot layouts
 * collapse to two columns with the extra panes as tabs on the right.
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

/** The window's inner width, for the narrow-window layout fallback. */
export function useWindowWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}

const DIVIDER_PX = 6;

/** The draggable rule between two panes or two rows. Arrow keys resize it
 * too. `onDelta` receives the pointer movement in pixels along the axis. */
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
  const full = panes.length >= 4;

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

/** An empty slot of a layout with more slots than panes: offers to fill it. */
function EmptySlot({ afterPaneId }: { afterPaneId: string | undefined }) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 items-center justify-center bg-bg p-4" data-empty-slot="">
      <EmptyState
        icon={LayoutGrid}
        title="Empty pane"
        description="Choose what to show here, or Ctrl+click any link to open it in this space."
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
                          openContent(k, {}, { target: "new", from: afterPaneId });
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

/** One slot: a pane, several panes as tabs (only the active one visible),
 * or a placeholder. Panes stay mounted while hidden so their scroll
 * position and state survive switching tabs. */
function Slot({ panes, showHeader, minWidth, lastPaneId }: { panes: PaneModel[]; showHeader: boolean; minWidth: number; lastPaneId: string | undefined }) {
  const focusedPaneId = useWorkspaceStore((s) => s.focusedPaneId);
  const [activeId, setActiveId] = useState<string | null>(null);
  const inSlot = panes.some((p) => p.id === focusedPaneId);
  // The focused pane is always the visible tab; otherwise the last one
  // shown here stays, falling back to the first.
  useEffect(() => {
    if (inSlot) setActiveId(focusedPaneId);
  }, [inSlot, focusedPaneId]);
  const active = (inSlot ? focusedPaneId : activeId && panes.some((p) => p.id === activeId) ? activeId : panes[0]?.id) ?? null;

  if (panes.length === 0) return <EmptySlot afterPaneId={lastPaneId} />;
  const tabs = panes.length > 1 ? panes : undefined;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" style={{ minWidth }}>
      {panes.map((pane) => (
        <div key={pane.id} hidden={pane.id !== active} className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Pane pane={pane} showHeader={showHeader || panes.length > 1} tabs={tabs} />
        </div>
      ))}
    </div>
  );
}

export function Workspace() {
  const panes = useWorkspaceStore((s) => s.panes);
  const layoutChosen = useWorkspaceStore((s) => s.layout);
  const rowSplit = useWorkspaceStore((s) => s.rowSplit);
  const maximizedPaneId = useWorkspaceStore((s) => s.maximizedPaneId);
  const resizeBetween = useWorkspaceStore((s) => s.resizeBetween);
  const setRowSplit = useWorkspaceStore((s) => s.setRowSplit);
  const distractionFreeMode = useUiStore((s) => s.distractionFreeMode);
  const containerRef = useRef<HTMLDivElement>(null);
  useUrlMirror();
  useBootstrap();

  const windowWidth = useWindowWidth();
  const { width: containerWidth, height: containerHeight } = useElementSize(containerRef);
  const maximized = findPane(panes, maximizedPaneId);
  const layout = effectiveLayout(layoutChosen, windowWidth, panes.length);
  const columns = columnsOf(layout);
  const slots = assignSlots(panes, slotsOf(layout));
  const lastPaneId = panes[panes.length - 1]?.id;
  const showHeader = panes.length > 1 && !distractionFreeMode;
  const minWidth = containerWidth > 0 ? Math.min(PANE_MIN_WIDTH, Math.floor((containerWidth - DIVIDER_PX * (columns.length - 1)) / columns.length)) : PANE_MIN_WIDTH;

  /** The pane whose flex weight sizes a column: the first pane in its top slot. */
  function columnLead(col: number[]): PaneModel | undefined {
    for (const slot of col) if (slots[slot]?.[0]) return slots[slot][0];
    return undefined;
  }
  function pxPerWeight(): number {
    const total = columns.reduce((sum, col) => sum + (columnLead(col)?.width ?? 420), 0);
    return (containerRef.current?.clientWidth ?? 1000) / Math.max(total, 1);
  }

  return (
    <div className="flex h-full min-h-0" data-layout={layout}>
      <div ref={containerRef} className={cx("flex min-h-0 min-w-0 flex-1")}>
        {maximized ? (
          <Pane pane={maximized} showHeader={showHeader} maximized />
        ) : (
          columns.map((col, ci) => {
            const lead = columnLead(col);
            const prevLead = ci > 0 ? columnLead(columns[ci - 1]) : undefined;
            return (
              <Fragment key={ci}>
                {ci > 0 && (
                  <Divider
                    orientation="vertical"
                    label={`Resize columns ${ci} and ${ci + 1}`}
                    onDelta={(px) => {
                      if (prevLead && lead) resizeBetween(prevLead.id, lead.id, px / pxPerWeight());
                    }}
                  />
                )}
                <div className="flex min-h-0 min-w-0 flex-col" style={{ flex: `${lead?.width ?? 420} 1 0px`, minWidth }}>
                  {col.map((slotIndex, ri) => (
                    <Fragment key={slotIndex}>
                      {ri > 0 && (
                        <Divider
                          orientation="horizontal"
                          label="Resize rows"
                          onDelta={(px) => setRowSplit(rowSplit + px / Math.max(containerHeight, 1))}
                        />
                      )}
                      <div
                        className="flex min-h-0 min-w-0 flex-col"
                        style={{ flex: col.length > 1 ? `${ri === 0 ? rowSplit : 1 - rowSplit} 1 0px` : "1 1 0px" }}
                      >
                        <Slot panes={slots[slotIndex] ?? []} showHeader={showHeader} minWidth={0} lastPaneId={lastPaneId} />
                      </div>
                    </Fragment>
                  ))}
                </div>
              </Fragment>
            );
          })
        )}
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
    </div>
  );
}
