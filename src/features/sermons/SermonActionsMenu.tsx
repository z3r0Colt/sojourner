import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { ChevronDown, Download, FileText, MoreHorizontal, Presentation, Printer } from "lucide-react";
import { api } from "../../api/client";
import { useBooks } from "../../api/queries";
import { buildSlides } from "./slides";
import { Button } from "../../components/ui/Button";
import { Popover, PopoverItem, PopoverLabel } from "../../components/ui/Popover";
import { toast } from "../../components/ui/toast";
import { SermonPrintRegion, type PrintShape } from "./SermonPrint";
import type { Passage, Sermon } from "../../api/types";

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

  function print(next: PrintShape) {
    setShape(next);
    // One frame for the region to render before the print dialog reads it.
    window.setTimeout(() => {
      window.print();
      setShape(null);
    }, 120);
  }

  async function exportMarkdown() {
    const destPath = await save({
      defaultPath: `${sermon.title || "sermon"}.md`.replace(/[\/:*?"<>|]+/g, "-"),
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (!destPath) return;
    await api.exportSermon(sermon.id, destPath);
    toast.success("Sermon exported");
  }

  async function exportSlides() {
    const destPath = await save({
      defaultPath: `${sermon.title || "sermon"}.pptx`.replace(/[\/:*?"<>|]+/g, "-"),
      filters: [{ name: "PowerPoint", extensions: ["pptx"] }],
    });
    if (!destPath) return;
    setExporting(true);
    try {
      // pptxgenjs is loaded here, on first use, so it never reaches the
      // startup bundle.
      const { exportSlidesToPptx } = await import("./pptxExport");
      await exportSlidesToPptx(buildSlides(sermon, { books, passages }), sermon.title, destPath);
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
      {shape && <SermonPrintRegion sermon={sermon} shape={shape} />}
    </>
  );
}
