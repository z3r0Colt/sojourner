import { useState } from "react";
import { ChevronDown, Download, FileText, MoreHorizontal, Presentation, Printer, TabletSmartphone } from "lucide-react";
import { api } from "../../api/client";
import { useBooks, useTranslations } from "../../api/queries";
import { useReaderTranslationId } from "../../state/workspaceStore";
import { useSetting } from "../../hooks/useSetting";
import { buildSlides } from "./slides";
import { Button } from "../../components/ui/Button";
import { Popover, PopoverItem, PopoverLabel } from "../../components/ui/Popover";
import { toast } from "../../components/ui/toast";
import { cx, inputSmClass } from "../../components/ui/classes";
import { SermonPrintRegion, type HandoutPrintOptions, type PrintShape } from "./SermonPrint";
import { pinnedKey, refKey } from "../../lib/passage";
import { passageBlocks, pinnedPassageBlocks } from "./editor/documentModel";
import type { Passage, PassageRef, Sermon } from "../../api/types";

/** How the handout prints. Kept with the data rather than the window, since
 * a preacher who wants the text on the sheet wants it every week. */
export const HANDOUT_LINES_SETTING = "handout_note_lines";
export const HANDOUT_PASSAGE_TEXT_SETTING = "handout_passage_text";

/** Print, handout, and export, from the manuscript's toolbar (SB4.2, SB4.3).
 * Each print renders its shape into the hidden `.print-root` region and
 * asks the browser to print, which is also how a PDF is made. */
export function SermonActionsMenu({
  sermon,
  flush,
  onPresent,
}: {
  sermon: Sermon;
  /** Writes the manuscript's pending edit, so what is printed or exported is
   * what is on the screen and not the last autosave. */
  flush: () => Promise<void>;
  onPresent: () => void;
}) {
  const [shape, setShape] = useState<PrintShape | null>(null);
  /** The sermon as saved just before the print, which `sermon` may lag. */
  const [printed, setPrinted] = useState<Sermon | null>(null);
  const { data: books } = useBooks();
  const { data: translations } = useTranslations();
  const readerTranslationId = useReaderTranslationId();
  const [exporting, setExporting] = useState(false);
  const [noteLines, setNoteLines] = useSetting<number>(HANDOUT_LINES_SETTING, 2);
  const [passageText, setPassageText] = useSetting<boolean>(HANDOUT_PASSAGE_TEXT_SETTING, false);
  const handout: HandoutPrintOptions = { noteLines, includePassageText: passageText };

  /** The sermon's title as a file name Windows will accept. */
  function fileName(extension: string) {
    return `${sermon.title || "sermon"}.${extension}`.replace(/[\\/:*?"<>|]+/g, "-");
  }

  /** The sermon as it stands on the screen: the pending edit written, then
   * read back. Everything below prints or exports this, never the copy the
   * pane last rendered, which can be up to an autosave behind. */
  async function saved(): Promise<Sermon> {
    await flush();
    return (await api.getSermon(sermon.id)) ?? sermon;
  }

  /** Every passage's words for `s`: the sermon translation's, and those of
   * any block pinned to another translation. Fetched here rather than taken
   * from the pane, whose map can be missing a passage added a moment ago. */
  async function wordsOf(s: Sermon) {
    const translationId = s.translation_id ?? readerTranslationId;
    const passages = new Map<string, Passage>();
    const refs = passageBlocks(s.body);
    if (translationId != null && refs.length > 0) {
      for (const p of await api.getPassages(translationId, refs)) passages.set(refKey(p.ref), p);
    }
    const pinned = new Map<string, Passage>();
    const byTranslation = new Map<number, PassageRef[]>();
    for (const b of pinnedPassageBlocks(s.body)) byTranslation.set(b.translationId, [...(byTranslation.get(b.translationId) ?? []), b.ref]);
    for (const [id, group] of byTranslation) {
      for (const p of await api.getPassages(id, group)) pinned.set(pinnedKey(id, p.ref), p);
    }
    return { translationId, passages, pinned };
  }

  async function print(next: PrintShape) {
    try {
      setPrinted(await saved());
    } catch {
      // Print what the pane has rather than nothing.
      setPrinted(null);
    }
    setShape(next);
    // One frame for the region to render before the print dialog reads it.
    window.setTimeout(() => {
      window.print();
      setShape(null);
      setPrinted(null);
    }, 120);
  }

  async function exportMarkdown() {
    try {
      const picked = await api.pickSavePath("markdown", fileName("md"));
      if (!picked) return;
      // The Markdown is written from the database, so the edit has to be there.
      await flush();
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
      const current = await saved();
      const { passages } = await wordsOf(current);
      await exportSlidesToPptx(buildSlides(current, { books, passages }), current.title, picked.token);
      toast.success("Slides exported");
    } catch (error) {
      toast.error(`Could not write the slides: ${String(error)}`);
    } finally {
      setExporting(false);
    }
  }

  /** The manuscript as one web page for a phone or tablet at the pulpit. */
  async function exportPodium() {
    try {
      const picked = await api.pickSavePath("html", fileName("html"));
      if (!picked) return;
      const { buildPodiumHtml } = await import("./podiumExport");
      const current = await saved();
      const { translationId, passages, pinned } = await wordsOf(current);
      const translationCode = translations?.find((t) => t.id === translationId)?.code ?? null;
      const translationCodes = new Map((translations ?? []).map((t) => [t.id, t.code]));
      await api.exportSermonPodium(
        picked.token,
        buildPodiumHtml(current, { passages, pinned, books, translationCode, translationCodes }),
      );
      toast.success("Podium file written: open it in any browser, even offline");
    } catch (error) {
      toast.error(`Could not write the podium file: ${String(error)}`);
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
            <PopoverItem
              onClick={() => {
                close();
                void exportPodium();
              }}
            >
              <TabletSmartphone className="h-4 w-4 text-ink-3" aria-hidden="true" /> Podium file for a phone or tablet…
            </PopoverItem>
            <p className="px-2 pb-1 text-xs text-ink-4">
              One web page with the passages written in, paged by a tap or a swipe, with a clock. Email, AirDrop, or copy it to
              the device; it needs no internet.
            </p>
          </>
        )}
      </Popover>
      {shape && <SermonPrintRegion sermon={printed ?? sermon} shape={shape} handout={handout} />}
    </>
  );
}
