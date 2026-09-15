import { useState } from "react";
import { ChevronDown, Download, FileText, MoreHorizontal, Presentation, Printer } from "lucide-react";
import { api } from "../../api/client";
import { useBooks } from "../../api/queries";
import { useSetting } from "../../hooks/useSetting";
import { buildSlides } from "./slides";
import { Button } from "../../components/ui/Button";
import { Popover, PopoverItem, PopoverLabel } from "../../components/ui/Popover";
import { toast } from "../../components/ui/toast";
import { cx, inputSmClass } from "../../components/ui/classes";
import { SermonPrintRegion, type HandoutPrintOptions, type PrintShape } from "./SermonPrint";
import type { Passage, Sermon } from "../../api/types";

/** How the handout prints. Kept with the data rather than the window, since
 * a preacher who wants the text on the sheet wants it every week. */
export const HANDOUT_LINES_SETTING = "handout_note_lines";
export const HANDOUT_PASSAGE_TEXT_SETTING = "handout_passage_text";

/** Print, handout, and export, from the manuscript's toolbar (SB4.2, SB4.3).
 * Each print renders its shape into the hidden `.print-root` region and
 * asks the browser to print, which is also how a PDF is made. */
export function SermonActionsMenu({
  sermon,
  passages,
  onPresent,
}: {
  sermon: Sermon;
  /** The rendered passages, so a slide of Scripture holds the words. */
  passages: Map<string, Passage>;
  onPresent: () => void;
}) {
  const [shape, setShape] = useState<PrintShape | null>(null);
  const { data: books } = useBooks();
  const [exporting, setExporting] = useState(false);
  const [noteLines, setNoteLines] = useSetting<number>(HANDOUT_LINES_SETTING, 2);
  const [passageText, setPassageText] = useSetting<boolean>(HANDOUT_PASSAGE_TEXT_SETTING, false);
  const handout: HandoutPrintOptions = { noteLines, includePassageText: passageText };

  /** The sermon's title as a file name Windows will accept. */
  function fileName(extension: string) {
    return `${sermon.title || "sermon"}.${extension}`.replace(/[\\/:*?"<>|]+/g, "-");
  }

  function print(next: PrintShape) {
    setShape(next);
    // One frame for the region to render before the print dialog reads it.
    window.setTimeout(() => {
      window.print();
      setShape(null);
    }, 120);
  }

  async function exportMarkdown() {
    try {
      const picked = await api.pickSavePath("markdown", fileName("md"));
      if (!picked) return;
      await api.exportSermon(sermon.id, picked.token);
      toast.success("Sermon exported");
    } catch (error) {
      // A path that cannot be written, a file held open by Word: the reader
      // has to be told, or the export looks as though it worked.
      toast.error(`Could not export the sermon: ${String(error)}`);
    }
  }

  async function exportSlides() {
    const picked = await api.pickSavePath("pptx", fileName("pptx"));
    if (!picked) return;
    setExporting(true);
    try {
      // pptxgenjs is loaded here, on first use, so it never reaches the
      // startup bundle.
      const { exportSlidesToPptx } = await import("./pptxExport");
      await exportSlidesToPptx(buildSlides(sermon, { books, passages }), sermon.title, picked.token);
      toast.success("Slides exported");
    } catch (error) {
      toast.error(`Could not write the slides: ${String(error)}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <Popover
        width="w-60"
        trigger={({ toggle, open }) => (
          <Button size="sm" variant="ghost" icon={MoreHorizontal} onClick={toggle} aria-haspopup="menu" aria-expanded={open}>
            Print & export
            <ChevronDown className="h-3.5 w-3.5 text-ink-4" aria-hidden="true" />
          </Button>
        )}
      >
        {(close) => (
          <>
            <PopoverLabel>On paper</PopoverLabel>
            <PopoverItem
              onClick={() => {
                close();
                print("manuscript");
              }}
            >
              <Printer className="h-4 w-4 text-ink-3" aria-hidden="true" /> Print the manuscript
            </PopoverItem>
            <PopoverItem
              onClick={() => {
                close();
                print("outline");
              }}
            >
              <FileText className="h-4 w-4 text-ink-3" aria-hidden="true" /> Print the outline
            </PopoverItem>
            <PopoverItem
              onClick={() => {
                close();
                print("handout");
              }}
            >
              <FileText className="h-4 w-4 text-ink-3" aria-hidden="true" /> Print the handout
            </PopoverItem>
            <PopoverItem
              onClick={() => {
                close();
                print("handout-key");
              }}
            >
              <FileText className="h-4 w-4 text-ink-3" aria-hidden="true" /> Handout with the answer key
            </PopoverItem>
            <div className="mt-1 space-y-1.5 rounded-md bg-surface-2/70 px-2 py-1.5 text-xs text-ink-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={passageText}
                  onChange={(e) => setPassageText(e.target.checked)}
                  className="accent-accent"
                />
                Print each passage in full
              </label>
              <label className="flex items-center gap-2">
                <span>Lines to write on</span>
                <input
                  type="number"
                  min={0}
                  max={12}
                  value={noteLines}
                  onChange={(e) => setNoteLines(Math.min(12, Math.max(0, Number(e.target.value) || 0)))}
                  aria-label="Lines to write on after each point"
                  className={cx(inputSmClass, "w-14")}
                />
              </label>
            </div>
            <div className="my-1 h-px bg-line" aria-hidden="true" />
            <PopoverLabel>On the screen</PopoverLabel>
            <PopoverItem
              onClick={() => {
                close();
                onPresent();
              }}
            >
              <Presentation className="h-4 w-4 text-ink-3" aria-hidden="true" /> Present the slides
            </PopoverItem>
            <div className="my-1 h-px bg-line" aria-hidden="true" />
            <PopoverLabel>As a file</PopoverLabel>
            <PopoverItem
              onClick={() => {
                close();
                void exportMarkdown();
              }}
            >
              <Download className="h-4 w-4 text-ink-3" aria-hidden="true" /> Export as Markdown…
            </PopoverItem>
            <PopoverItem
              onClick={() => {
                close();
                void exportSlides();
              }}
            >
              <Presentation className="h-4 w-4 text-ink-3" aria-hidden="true" />
              {exporting ? "Writing the slides…" : "Export slides as .pptx…"}
            </PopoverItem>
          </>
        )}
      </Popover>
      {shape && <SermonPrintRegion sermon={sermon} shape={shape} handout={handout} />}
    </>
  );
}
