// The Psalter as a page of its own.
//
// The metrical psalms were only ever reached beside a Bible open at the
// Psalms, as a study pane that follows it. A family learning Psalm 23, or a
// precentor finding the tune for Sunday, wants the Psalter itself: pick a
// psalm, sing it, turn to the next -- with no Bible pane needed at all. So
// this page chooses its own psalm (it never follows a linked pane, and
// turning its psalm never moves one), keeps it in the pane's params and the
// URL like a Bible chapter, and comes back to the last psalm opened.
//
// Its staff and words are set in a centred column, and it zooms as a book in
// Resources does (the buttons, Ctrl+scroll, Ctrl+= / Ctrl+- / Ctrl+0), so the
// same page serves a precentor at a desk and a family reading from across the
// room -- and still works squeezed into a thin pane beside a Bible.

import { useCallback, useEffect, useRef, type MouseEvent } from "react";
import { BookOpen, BookOpenText, ChevronLeft, ChevronRight, Music, ZoomIn, ZoomOut } from "lucide-react";
import { IconButton } from "../../components/ui/Button";
import { Tabs, type TabItem } from "../../components/ui/Tabs";
import { selectSmClass } from "../../components/ui/classes";
import { isTypingTarget } from "../../lib/keyboard";
import { PSALTER_ZOOM_MAX, PSALTER_ZOOM_MIN, PSALTER_ZOOM_STEP, useUiStore } from "../../state/uiStore";
import { resolveBiblePane, useWorkspaceStore, type PsalterTab } from "../../state/workspaceStore";
import { usePane, usePaneParams } from "../../workspace/PaneContext";
import { openContent, openPassage, targetFor } from "../../workspace/openContent";
import { MetricalPsalmPanel } from "../reading/MetricalPsalmPanel";
import { TuneIndexPanel } from "./TuneIndexPanel";
import { PSALMS_BOOK_ID, PSALM_COUNT, psalmShown, stepPsalm } from "./psalterParams";

const PSALM_NUMBERS = Array.from({ length: PSALM_COUNT }, (_, i) => i + 1);

const TABS: TabItem<PsalterTab>[] = [
  { key: "psalm", label: "Psalm", icon: BookOpenText, title: "The psalm's words, set to a tune" },
  { key: "tunes", label: "Tunes", icon: Music, title: "Every tune the Psalter carries, by metre" },
];

/** Below this width the tabs fold to their icons, and the picker drops its
 *  "Psalm" label, so the bar's controls keep to as few rows as they can. */
const NARROW_PX = 400;

/** One Ctrl+scroll step at most this often, so a single flick of the wheel is
 *  one step of zoom rather than five (as in a Bible pane). */
const WHEEL_STEP_MS = 80;

/** Choices from the psalm list closer together than this are one choice
 * still being made (see `pickFromList`). */
const PICK_RUN_MS = 800;

export function PsalterView() {
  const { id: paneId, width, isFocused } = usePane();
  const [params, setParams] = usePaneParams("psalter");
  const setPsalterPsalm = useUiStore((s) => s.setPsalterPsalm);
  const zoom = useUiStore((s) => s.psalterZoom);
  const setZoom = useUiStore((s) => s.setPsalterZoom);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const zoomBy = useCallback((direction: 1 | -1) => setZoom(zoomRef.current + direction * PSALTER_ZOOM_STEP), [setZoom]);
  const narrow = width > 0 && width < NARROW_PX;

  // Params are completed to a real psalm on the way in; a damaged saved
  // workspace is brought to the nearest one rather than shown blank, the
  // same way the pane's title and URL bring it.
  const psalm = psalmShown(params);
  const view: PsalterTab = params.view === "tunes" ? "tunes" : "psalm";
  const prev = stepPsalm(psalm, -1);
  const next = stepPsalm(psalm, 1);

  // The psalm on the Psalter the reader is using is the one it comes back to
  // the next time it is opened without a number (the sidebar, the palette).
  // Only the focused pane records it: a Psalter in a hidden tab, or every
  // pane mounting again on restore or maximize, must not overwrite the psalm
  // the reader was actually singing.
  useEffect(() => {
    if (isFocused) setPsalterPsalm(psalm);
  }, [isFocused, psalm, setPsalterPsalm]);

  // Turning to another psalm is navigation, like turning a chapter: it goes
  // on the pane's history, so Back (Alt+Left) returns to the psalm before,
  // and into the URL.
  const goTo = useCallback((n: number) => openContent("psalter", { psalm: n }, { target: paneId }), [paneId]);

  // A closed list on Windows answers every key as a choice of its own:
  // typing 1-1-9 chooses Psalm 1, then 11, then 119, and the arrow keys
  // choose each psalm they pass. Only the first choice of such a run goes on
  // the pane's history; the rest replace it, so Back returns to the psalm
  // the reader started from rather than through the ones typed on the way.
  const lastListPickAt = useRef(0);
  function pickFromList(n: number) {
    const now = Date.now();
    const sameRun = now - lastListPickAt.current < PICK_RUN_MS;
    lastListPickAt.current = now;
    if (sameRun) setParams({ psalm: n, view: "psalm" });
    else goTo(n);
  }

  // Ctrl+[ and Ctrl+] turn the psalm while the Psalter is the pane being
  // read, as they turn the chapter in a Bible pane; Ctrl and = / - / 0 zoom
  // it, in place of the app's text size, as they zoom a book being read. Listened for on the
  // window's capture phase so this runs before the shell's own chapter keys,
  // which leave a chord that has already been answered alone -- otherwise the
  // Bible pane elsewhere would turn instead of the psalm in front of you.
  //
  // The psalm list itself is the exception to "leave keys typed into a
  // control alone": choosing Psalm 23 from it and pressing Ctrl+] to go on
  // is the natural thing to do, and the list has no use for the chord.
  const steps = useRef({ prev, next });
  steps.current = { prev, next };
  const psalmList = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const turn = e.key === "[" || e.key === "]";
      const zoomKey = ["=", "+", "-", "_", "0"].includes(e.key);
      if (!turn && !zoomKey) return;
      if (useWorkspaceStore.getState().focusedPaneId !== paneId) return;
      if (e.target !== psalmList.current && isTypingTarget(e.target)) return;
      e.preventDefault();
      if (zoomKey) {
        if (e.key === "0") setZoom(100);
        else zoomBy(e.key === "=" || e.key === "+" ? 1 : -1);
        return;
      }
      const to = e.key === "]" ? steps.current.next : steps.current.prev;
      if (to != null) goTo(to);
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [paneId, goTo, zoomBy, setZoom]);

  // Ctrl+scroll anywhere over the Psalter zooms it. A native listener,
  // because React registers wheel as passive and the WebView's own page zoom
  // must be prevented.
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let last = 0;
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey || e.deltaY === 0) return;
      e.preventDefault();
      const now = performance.now();
      if (now - last < WHEEL_STEP_MS) return;
      last = now;
      zoomBy(e.deltaY < 0 ? 1 : -1);
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  /** The psalm in prose: in the Bible pane already open (it turns to the
   * psalm), else in a new one beside the Psalter -- never over the Psalter
   * itself. Ctrl+click always opens a new pane. */
  function readInBible(e: MouseEvent) {
    const bible = resolveBiblePane(useWorkspaceStore.getState());
    openPassage({ bookId: PSALMS_BOOK_ID, chapter: psalm }, { target: targetFor(e, bible ? bible.id : "new"), from: paneId });
  }

  // The bar's controls sit in the same centred column as the psalm below
  // them. In a pane too narrow for one row they wrap -- the tabs last, onto a
  // row of their own at the bar's foot, where their rule still meets the
  // bar's bottom edge.
  return (
    <div ref={root} className="flex h-full w-full flex-col">
      <div className="shrink-0 border-b border-line bg-surface px-2">
        <div className="mx-auto flex min-h-11 w-full max-w-3xl flex-wrap items-center gap-x-1">
          <div className="flex h-11 items-center gap-1">
            <IconButton icon={ChevronLeft} label="Previous psalm (Ctrl+[)" size="sm" disabled={prev == null} onClick={() => prev != null && goTo(prev)} />
            <label className="flex items-center gap-1.5 text-sm text-ink-2">
              {!narrow && "Psalm"}
              {/* Numbers alone, so typing 1-1-9 on the closed list lands on Psalm 119. */}
              <select
                ref={psalmList}
                className={selectSmClass}
                value={psalm}
                onChange={(e) => pickFromList(Number(e.target.value))}
                aria-label={narrow ? "Psalm" : undefined}
              >
                {PSALM_NUMBERS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <IconButton icon={ChevronRight} label="Next psalm (Ctrl+])" size="sm" disabled={next == null} onClick={() => next != null && goTo(next)} />
            <IconButton icon={BookOpen} label={`Read Psalm ${psalm} in the Bible (Ctrl+click for a new pane)`} size="sm" onClick={readInBible} />
          </div>
          <div className="min-w-0 flex-1" />
          <div className="flex h-11 items-center gap-0.5" role="group" aria-label="Page zoom">
            <IconButton icon={ZoomOut} label="Zoom out (Ctrl+-)" size="sm" onClick={() => zoomBy(-1)} disabled={zoom <= PSALTER_ZOOM_MIN} />
            <button
              type="button"
              className="min-w-[3.25rem] rounded px-1 text-center text-xs tabular-nums text-ink-2 hover:bg-hover"
              onClick={() => setZoom(100)}
              title="Page zoom; click to reset to 100% (Ctrl+0)"
              aria-label={`Page zoom ${zoom} percent; reset to 100 percent`}
            >
              {zoom}%
            </button>
            <IconButton icon={ZoomIn} label="Zoom in (Ctrl+=)" size="sm" onClick={() => zoomBy(1)} disabled={zoom >= PSALTER_ZOOM_MAX} />
          </div>
          {/* Stretched to its row's full height so the active tab's rule sits on the bar's own bottom edge. */}
          <Tabs bare size="sm" className="ml-auto self-stretch" hideLabels={narrow} items={TABS} value={view} onChange={(v) => setParams({ view: v })} />
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {view === "psalm" ? <MetricalPsalmPanel psalm={psalm} zoom={zoom / 100} /> : <TuneIndexPanel zoom={zoom / 100} />}
      </div>
    </div>
  );
}
