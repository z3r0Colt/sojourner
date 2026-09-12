import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { ChevronDown, Download, FileText, MoreHorizontal, Printer } from "lucide-react";
import { api } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { Popover, PopoverItem, PopoverLabel } from "../../components/ui/Popover";
import { toast } from "../../components/ui/toast";
import { SermonPrintRegion, type PrintShape } from "./SermonPrint";
import type { Sermon } from "../../api/types";

/** Print, handout, and export, from the manuscript's toolbar (SB4.2, SB4.3).
 * Each print renders its shape into the hidden `.print-root` region and
 * asks the browser to print, which is also how a PDF is made. */
export function SermonActionsMenu({ sermon }: { sermon: Sermon }) {
  const [shape, setShape] = useState<PrintShape | null>(null);

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
            <PopoverLabel>As a file</PopoverLabel>
            <PopoverItem
              onClick={() => {
                close();
                void exportMarkdown();
              }}
            >
              <Download className="h-4 w-4 text-ink-3" aria-hidden="true" /> Export as Markdown…
            </PopoverItem>
          </>
        )}
      </Popover>
      {shape && <SermonPrintRegion sermon={sermon} shape={shape} />}
    </>
  );
}
