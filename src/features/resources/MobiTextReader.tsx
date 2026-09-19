import { useResourceText } from "../../api/queries";
import { useTtsReadingHere, useTtsStore } from "../../state/ttsStore";
import { usePaneOptional } from "../../workspace/PaneContext";
import { EPUB_ZOOM_MAX, EPUB_ZOOM_MIN, EPUB_ZOOM_STEP, useReadingTypography, useUiStore } from "../../state/uiStore";
import { ReadAloudWords } from "../tts/ReadAloudWords";
import { splitIntoParagraphs } from "../tts/textUtils";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";
import { IconButton } from "../../components/ui/Button";
import { ZoomIn, ZoomOut } from "lucide-react";

/** A MOBI's extracted text on a sheet, with the same page zoom a book in
 * EPUB form gets (the zoom is shared: it is "how big the page is"). */
export function MobiTextReader({ resourceId }: { resourceId: number }) {
  const { data: text } = useResourceText(resourceId);
  const ttsHere = useTtsReadingHere(usePaneOptional()?.id ?? null, "resource");
  const ttsCurrentSegmentId = useTtsStore((s) => (ttsHere ? (s.segments[s.currentSegmentIndex]?.id ?? null) : null));
  const typography = useReadingTypography();
  const zoom = useUiStore((s) => s.epubZoom);
  const setZoom = useUiStore((s) => s.setEpubZoom);
  const paragraphs = text ? splitIntoParagraphs(text) : [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line bg-surface px-2">
        <span className="min-w-0 flex-1 truncate text-xs text-ink-3">Shown as extracted text; the book's own formatting and images are not kept.</span>
        <div className="flex items-center gap-0.5" role="group" aria-label="Page zoom">
          <IconButton icon={ZoomOut} label="Zoom out" size="sm" onClick={() => setZoom(zoom - EPUB_ZOOM_STEP)} disabled={zoom <= EPUB_ZOOM_MIN} />
          <button type="button" className="min-w-[3.25rem] rounded px-1 text-center text-xs tabular-nums text-ink-2 hover:bg-hover" onClick={() => setZoom(100)} title="Page zoom; click to reset">
            {zoom}%
          </button>
          <IconButton icon={ZoomIn} label="Zoom in" size="sm" onClick={() => setZoom(zoom + EPUB_ZOOM_STEP)} disabled={zoom >= EPUB_ZOOM_MAX} />
        </div>
      </div>
      <div
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
          <div className="reading-font space-y-4 text-ink" style={typography}>
            {paragraphs.map((p, i) => (
              <p key={i}>
                <ReadAloudWords text={p} active={ttsHere && ttsCurrentSegmentId === i} />
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
