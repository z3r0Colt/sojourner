import { Fragment, useEffect, useRef, type RefObject } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Minimize2 } from "lucide-react";
import { api } from "../api/client";
import { useBooks } from "../api/queries";
import { useUiStore } from "../state/uiStore";
import { currentPassage, findPane, useWorkspaceStore, type PaneKind } from "../state/workspaceStore";
import { Button, IconButton } from "../components/ui/Button";
import { cx } from "../components/ui/classes";
import { Pane } from "./Pane";
import { PANE_KINDS, STUDY_STRIP_KINDS, parseRoute, routeFor } from "./paneKinds";
import { openContent } from "./openContent";

/**
 * The workspace: the panes side by side with draggable dividers, the
 * "Add pane" strip on the right edge, the URL mirror, and the launch
 * bootstrap. With one pane and no chrome hidden it renders that pane's
 * view edge to edge, exactly as the page did before panes existed.
 */

/** Keeps the URL and the focused pane's content in step, in both
 * directions. A change made by the workspace is written to the URL with
 * `replace`; a change made elsewhere (sidebar link, deep link, palette)
 * is applied to the focused pane. */
function useUrlMirror() {
  const location = useLocation();
  const navigate = useNavigate();
  const route = useWorkspaceStore((s) => {
    const focused = findPane(s.panes, s.focusedPaneId);
    return focused ? routeFor(focused) : "/";
  });
  const current = location.pathname + location.search;
  const lastWritten = useRef<string | null>(null);

  // Pane → URL.
  useEffect(() => {
    if (route === current) return;
    lastWritten.current = route;
    navigate(route, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);

  // URL → pane, for navigations the workspace did not make itself.
  useEffect(() => {
    if (current === route || current === lastWritten.current) return;
    const parsed = parseRoute(location.pathname, location.search);
    if (parsed) {
      openContent(parsed.kind, parsed.params as never, { target: "focused" });
    } else {
      lastWritten.current = route;
      navigate(route, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);
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

/** The draggable rule between two panes. Arrow keys resize it too. */
function Divider({ leftId, rightId, containerRef }: { leftId: string; rightId: string; containerRef: RefObject<HTMLDivElement | null> }) {
  const resizeBetween = useWorkspaceStore((s) => s.resizeBetween);
  const dragging = useRef<{ startX: number; pxPerWeight: number; moved: number } | null>(null);

  function pxPerWeight() {
    const container = containerRef.current;
    const total = useWorkspaceStore.getState().panes.reduce((sum, p) => sum + p.width, 0);
    const px = container?.clientWidth ?? 1000;
    return px / Math.max(total, 1);
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panes"
      tabIndex={0}
      title="Drag to resize"
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        dragging.current = { startX: e.clientX, pxPerWeight: pxPerWeight(), moved: 0 };
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      }}
      onPointerMove={(e) => {
        const d = dragging.current;
        if (!d) return;
        const deltaPx = e.clientX - d.startX - d.moved;
        const deltaWeight = deltaPx / d.pxPerWeight;
        if (Math.abs(deltaWeight) < 1) return;
        resizeBetween(leftId, rightId, deltaWeight);
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
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        resizeBetween(leftId, rightId, (e.key === "ArrowRight" ? 24 : -24) / pxPerWeight());
      }}
      className="relative z-10 w-1.5 shrink-0 cursor-col-resize bg-line hover:bg-accent/40 focus-visible:bg-accent/40"
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
    <div className="flex w-11 shrink-0 flex-col items-center gap-1 border-l border-line bg-surface-2/60 py-2" role="toolbar" aria-label="Add pane">
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

export function Workspace() {
  const panes = useWorkspaceStore((s) => s.panes);
  const maximizedPaneId = useWorkspaceStore((s) => s.maximizedPaneId);
  const distractionFreeMode = useUiStore((s) => s.distractionFreeMode);
  const containerRef = useRef<HTMLDivElement>(null);
  useUrlMirror();
  useBootstrap();

  const maximized = findPane(panes, maximizedPaneId);
  const visible = maximized ? [maximized] : panes;

  return (
    <div className="flex h-full min-h-0">
      <div ref={containerRef} className={cx("flex min-h-0 min-w-0 flex-1")}>
        {visible.map((pane, i) => (
          <Fragment key={pane.id}>
            {i > 0 && <Divider leftId={visible[i - 1].id} rightId={pane.id} containerRef={containerRef} />}
            <Pane pane={pane} showHeader={visible.length > 1} index={i} count={visible.length} />
          </Fragment>
        ))}
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
