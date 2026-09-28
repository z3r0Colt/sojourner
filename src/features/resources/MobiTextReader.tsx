import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject } from "react";
import { useResourceText } from "../../api/queries";
import { useTtsStore } from "../../state/ttsStore";
import { usePaneOptional } from "../../workspace/PaneContext";
import { EPUB_ZOOM_MAX, EPUB_ZOOM_MIN, EPUB_ZOOM_STEP, useReadingTypography, useUiStore } from "../../state/uiStore";
import { ReadAloudWords } from "../tts/ReadAloudWords";
import { splitIntoParagraphs } from "../tts/textUtils";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";
import { IconButton } from "../../components/ui/Button";
import { toast } from "../../components/ui/toast";
import { ZoomIn, ZoomOut } from "lucide-react";
import { ReadAloudControls } from "./ReadAloudControls";
import { isReadingHere } from "./readAloudLoading";
import { mobiReadAloud, shownWordRanges, type ReadAloudFrom, type ResourceReadAloudHandle } from "./readAloudText";

/** Marks a piece of the text the voice reads; its value is the piece's
 * index in the reading. */
const PIECE_ATTR = "data-piece";

/**
 * One piece of the text, as the page shows it; `spoken` is the same piece as
 * the voice is given it. Memoised, and the word-by-word highlight only
 * mounted on the piece being read: a MOBI's extracted text is often the
 * whole book in one paragraph, cut into tens of thousands of pieces, and
 * every mounted `ReadAloudWords` re-renders on every word the voice says.
 */
const Piece = memo(function Piece({ index, text, spoken, active }: { index: number; text: string; spoken: string; active: boolean }) {
  return (
    <span data-piece={index}>
      {!active ? text : text === spoken ? <ReadAloudWords text={text} active /> : <ShownWords shown={text} spoken={spoken} />}
    </span>
  );
});

/**
 * The piece being read, when the page shows it otherwise than the voice was
 * given it -- a soft hyphen, a rule, the "——" of a name left blank, which
 * the voice is spared and the page keeps. The player counts the word being
 * said among the words of what the voice was given, so counting the page's
 * words instead would mark the wrong one from the first blank on; each of
 * the voice's words is found where it stands on the page and that is what is
 * marked. Otherwise this does what `ReadAloudWords` does, in the same style.
 */
function ShownWords({ shown, spoken }: { shown: string; spoken: string }) {
  const currentWordIndex = useTtsStore((s) => s.currentWordIndex);
  const highlightColor = useTtsStore((s) => s.highlightColor);
  const highlightStyle = useTtsStore((s) => s.highlightStyle);
  const autoScroll = useTtsStore((s) => s.autoScroll);
  const words = useMemo(() => shownWordRanges(shown, spoken), [shown, spoken]);
  const activeRef = useRef<HTMLSpanElement | null>(null);
  const containerRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!autoScroll) return;
    const target = activeRef.current ?? containerRef.current;
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [currentWordIndex, autoScroll]);

  const word = currentWordIndex >= 0 ? words[currentWordIndex] : undefined;
  if (!word) return <span ref={containerRef}>{shown}</span>;
  const style: CSSProperties =
    highlightStyle === "background"
      ? { backgroundColor: highlightColor, borderRadius: 2, padding: "0 1px" }
      : highlightStyle === "underline"
        ? { textDecoration: "underline", textDecorationColor: highlightColor, textDecorationThickness: 2 }
        : { fontWeight: 700, backgroundColor: `${highlightColor}55` };
  return (
    <span ref={containerRef}>
      {shown.slice(0, word.start)}
      <span ref={activeRef} style={style}>
        {shown.slice(word.start, word.end)}
      </span>
      {shown.slice(word.end)}
    </span>
  );
}

/** A MOBI's extracted text on a sheet, with the same page zoom a book in
 * EPUB form gets (the zoom is shared: it is "how big the page is"). */
export function MobiTextReader({
  resourceId,
  readAloudTitle,
  readAloudRef,
}: {
  resourceId: number;
  /** The book's title, which reading it aloud goes by. Without it the text
   * has no read-aloud controls. */
  readAloudTitle?: string;
  /** Filled in with this book's read-aloud, for the reader sidebar. */
  readAloudRef?: MutableRefObject<ResourceReadAloudHandle | null>;
}) {
  const { data: text } = useResourceText(resourceId);
  const paneId = usePaneOptional()?.id ?? null;
  const title = readAloudTitle ?? "";
  const readingHere = useTtsStore((s) => s.sourceKind === "resource" && s.paneId === paneId && s.title === title && s.segments.length > 0);
  const ttsCurrentSegmentId = useTtsStore((s) => (readingHere ? (s.segments[s.currentSegmentIndex]?.id ?? null) : null));
  const typography = useReadingTypography();
  const zoom = useUiStore((s) => s.epubZoom);
  const setZoom = useUiStore((s) => s.setEpubZoom);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hasSelection, setHasSelection] = useState(false);
  /** Where the last selection in the text began. The selection is this
   * document's own, and a click on a button can collapse it before the
   * click arrives, so "from the selection" falls back on where it was. */
  const selectionStartRef = useRef<Node | null>(null);
  // What is shown is cut where what is read is cut, so a piece on the page
  // is found in the reading by its number.
  const book = useMemo(() => mobiReadAloud(text ? splitIntoParagraphs(text) : []), [text]);

  // Words selected in the text, for "Read aloud from the selection".
  useEffect(() => {
    const onChange = () => {
      const selection = document.getSelection();
      const inside = !!selection && !selection.isCollapsed && !!scrollRef.current?.contains(selection.anchorNode);
      const has = inside && selection.toString().trim() !== "";
      if (has && selection.rangeCount > 0) selectionStartRef.current = selection.getRangeAt(0).startContainer;
      setHasSelection(has);
    };
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, []);

  /** The piece a node is in, or the first one after it (a selection can
   * start in text the voice skips); -1 when there is none. */
  function pieceAt(node: Node | null): number {
    const scroller = scrollRef.current;
    if (!node || !scroller?.contains(node)) return -1;
    const element = node.nodeType === 1 ? (node as Element) : node.parentElement;
    const own = element?.closest(`[${PIECE_ATTR}]`);
    if (own) return Number(own.getAttribute(PIECE_ATTR));
    const pieces = scroller.querySelectorAll<HTMLElement>(`[${PIECE_ATTR}]`);
    for (let i = 0; i < pieces.length; i++) {
      if (node.compareDocumentPosition(pieces[i]) & Node.DOCUMENT_POSITION_FOLLOWING) return Number(pieces[i].getAttribute(PIECE_ATTR));
    }
    return -1;
  }

  /** The first piece on screen. Pieces run down the page in order, so the
   * first one reaching below the top edge is found by halving.
   *
   * A piece here is a sentence (see `mobiReadAloud`), not a paragraph, and
   * one cut by the top edge is read from its start: those are lines the
   * reader can see, and the sentence they end. Passing over it for the first
   * piece to begin on screen, as a paragraph cut by the edge is passed over,
   * skipped the lines at the top of the page and began in the middle of a
   * sentence. (Pieces of a few sentences each began a sentence or two above
   * the view instead.) */
  function firstPieceOnScreen(): number {
    const scroller = scrollRef.current;
    if (!scroller) return 0;
    const pieces = scroller.querySelectorAll<HTMLElement>(`[${PIECE_ATTR}]`);
    const view = scroller.getBoundingClientRect();
    // A line scrolled all but out of sight -- its descenders showing -- is
    // not on screen.
    const top = view.top + 4;
    let lo = 0;
    let hi = pieces.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pieces[mid].getBoundingClientRect().bottom <= top) lo = mid + 1;
      else hi = mid;
    }
    const element = pieces[Math.min(lo, pieces.length - 1)];
    return element ? Number(element.getAttribute(PIECE_ATTR)) : 0;
  }

  const readAloud = (from: ReadAloudFrom) => {
    if (book.segments.length === 0) {
      toast.info("There is nothing here the voice can read aloud.");
      return;
    }
    let index = -1;
    if (from === "selection") {
      const selection = document.getSelection();
      const start = selection && !selection.isCollapsed && selection.rangeCount > 0 ? selection.getRangeAt(0).startContainer : selectionStartRef.current;
      index = pieceAt(start);
    }
    if (index < 0) index = firstPieceOnScreen();
    useTtsStore.getState().readFrom(title, "resource", book.segments, index, { paneId });
  };
  const readAloudFnRef = useRef(readAloud);
  readAloudFnRef.current = readAloud;

  useEffect(() => {
    if (!readAloudRef) return;
    readAloudRef.current = { readAloud: (from) => readAloudFnRef.current(from) };
    return () => {
      readAloudRef.current = null;
    };
  }, [readAloudRef]);

  /** While this pane is reading the book, a click on the text (not the end
   * of a drag that selected words) reads from the piece clicked. */
  function readFromClick(event: { target: EventTarget; button: number }) {
    if (event.button !== 0 || !isReadingHere(useTtsStore.getState(), title, paneId)) return;
    if (document.getSelection()?.isCollapsed === false) return;
    const piece = (event.target as Element).closest?.(`[${PIECE_ATTR}]`);
    if (!piece) return;
    useTtsStore.getState().readFrom(title, "resource", book.segments, Number(piece.getAttribute(PIECE_ATTR)), { paneId });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line bg-surface px-2">
        <span className="min-w-0 flex-1 truncate text-xs text-ink-3">Shown as extracted text; the book's own formatting and images are not kept.</span>
        {readAloudTitle && text && <ReadAloudControls compact title={readAloudTitle} onRead={(from) => readAloudFnRef.current(from)} hasSelection={hasSelection} />}
        <div className="flex items-center gap-0.5" role="group" aria-label="Page zoom">
          <IconButton icon={ZoomOut} label="Zoom out" size="sm" onClick={() => setZoom(zoom - EPUB_ZOOM_STEP)} disabled={zoom <= EPUB_ZOOM_MIN} />
          <button type="button" className="min-w-[3.25rem] rounded px-1 text-center text-xs tabular-nums text-ink-2 hover:bg-hover" onClick={() => setZoom(100)} title="Page zoom; click to reset">
            {zoom}%
          </button>
          <IconButton icon={ZoomIn} label="Zoom in" size="sm" onClick={() => setZoom(zoom + EPUB_ZOOM_STEP)} disabled={zoom >= EPUB_ZOOM_MAX} />
        </div>
      </div>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto bg-surface-2 p-4"
        onWheel={(e) => {
          if (!e.ctrlKey) return;
          e.preventDefault();
          if (e.deltaY !== 0) setZoom(zoom + (e.deltaY < 0 ? EPUB_ZOOM_STEP : -EPUB_ZOOM_STEP));
        }}
      >
        <div className="mx-auto min-h-full w-full max-w-[70ch] rounded-sm border border-line bg-surface px-10 py-10 shadow-lg" style={{ zoom: zoom / 100 }}>
          {text == null && <LoadingState />}
          {text === "" && <EmptyState title="No readable text could be extracted from this file" />}
          <div className="reading-font space-y-4 text-ink" style={typography} onClick={readFromClick}>
            {book.paragraphs.map((runs, i) => (
              <p key={i}>
                {runs.map((run, j) =>
                  run.piece == null ? (
                    run.text
                  ) : (
                    <Piece
                      key={j}
                      index={run.piece}
                      text={run.text}
                      spoken={book.segments[run.piece].text}
                      active={ttsCurrentSegmentId === `m:${run.piece}`}
                    />
                  ),
                )}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
