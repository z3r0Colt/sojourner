import { useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, GripVertical, ListTree, NotebookPen, Presentation, Quote } from "lucide-react";
import { useBooks, useSermonIdeas } from "../../api/queries";
import { Tabs } from "../../components/ui/Tabs";
import { cx } from "../../components/ui/classes";
import { formatRef } from "../../lib/passage";
import {
  blockLevels,
  countWords,
  dropLineFor,
  passageBlocks,
  sectionMove,
  sectionsOf,
  sourceBlocks,
  type DropSide,
} from "./editor/documentModel";
import { canOpenSource, openSourceRef, SOURCE_KIND_LABEL } from "./sourceIdentity";
import { minutesFor, type SpeakingRateInfo } from "./sermonStats";
import { buildSlides } from "./slides";
import { useSermonEditorContext } from "./editor/context";
import { IdeasPanel } from "./IdeasPanel";
import type { Sermon, SermonSourceKind } from "../../api/types";

export type SidePanelTab = "outline" | "sources" | "slides" | "ideas";

/** The drag type of an outline row. */
const SECTION_MIME = "application/x-sojourner-section";

/** Which half of the row under the pointer a drag is over. */
function sideOf(e: React.DragEvent<HTMLElement>): DropSide {
  const box = e.currentTarget.getBoundingClientRect();
  return e.clientY < box.top + box.height / 2 ? "before" : "after";
}

/**
 * The sermon's own two views of itself (SB1.5).
 *
 * Outline is the manuscript's h2 and h3 headings -- there is no second
 * outline model to keep in step (Q3) -- with each section's words and
 * minutes, and the section the cursor sits in marked. A row drags, or steps
 * with its arrows, and what moves is the manuscript itself: the heading and
 * everything under it (editor/moveSection.ts). The outline is still only
 * ever read off the headings.
 *
 * Sources is every passage and citation in document order: a bibliography
 * that writes itself and needs no maintenance, each row opening what it
 * came from.
 */
export function SermonSidePanel({
  body,
  tab,
  onTabChange,
  activeSectionIndex,
  onGoToSection,
  rate,
  paneId,
  sermon,
  onPresent,
  onMoveSection,
  onStepSection,
  onInsertIdea,
}: {
  body: string;
  tab: SidePanelTab;
  onTabChange: (tab: SidePanelTab) => void;
  /** Which point the cursor is in, by its index among the manuscript's
   * headings, or null when the cursor is above the first one. */
  activeSectionIndex: number | null;
  onGoToSection: (index: number) => void;
  rate: SpeakingRateInfo;
  paneId?: string;
  /** The sermon itself, for the generated slide list. */
  sermon: Sermon;
  onPresent: (startIndex: number) => void;
  /** Drops heading `from`'s section before or after heading `target`. */
  onMoveSection: (from: number, target: number, side: DropSide) => void;
  /** Moves heading `from`'s section one step up or down. */
  onStepSection: (from: number, direction: -1 | 1) => void;
  /** Puts an idea's markup at the manuscript's cursor. */
  onInsertIdea: (html: string) => void;
}) {
  const { data: books } = useBooks();
  const { data: ideas } = useSermonIdeas();
  const inboxCount = (ideas ?? []).filter((i) => i.sermon_id == null).length;
  const [groupByKind, setGroupByKind] = useState(false);
  // The heading being dragged, and where it would land. A ref for the first,
  // since dragover cannot read the drag's data -- only drop can.
  const draggingRef = useRef<number | null>(null);
  const [dropAt, setDropAt] = useState<{ index: number; side: DropSide } | null>(null);
  // The slide list needs the rendered passages, which the pane already has.
  const { passages: slidePassages } = useSermonEditorContext();

  const sections = useMemo(() => sectionsOf(body), [body]);
  const levels = useMemo(() => blockLevels(body), [body]);
  const slides = useMemo(() => buildSlides(sermon, { books, passages: slidePassages }), [sermon, books, slidePassages]);
  const passages = useMemo(() => passageBlocks(body), [body]);
  const sources = useMemo(() => sourceBlocks(body), [body]);

  const rows = useMemo(() => {
    const all: { kind: SermonSourceKind | "passage"; label: string; refId: string | null }[] = [
      ...passages.map((p) => ({ kind: "passage" as const, label: formatRef(books, p), refId: null })),
      ...sources.map((s) => ({ kind: s.kind, label: s.label || SOURCE_KIND_LABEL[s.kind], refId: s.ref_id })),
    ];
    if (!groupByKind) return all;
    return [...all].sort((a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label));
  }, [passages, sources, books, groupByKind]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Tabs
        // Four tabs do not fit the panel's width with their words, so they
        // are icons, each naming itself and its count on hover.
        items={[
          { key: "outline" as const, label: "Outline", icon: ListTree, count: sections.filter((s) => s.heading).length },
          { key: "sources" as const, label: "Sources", icon: Quote, count: rows.length },
          { key: "slides" as const, label: "Slides", icon: Presentation, count: slides.length },
          { key: "ideas" as const, label: "Ideas", icon: NotebookPen, count: inboxCount },
        ].map((item) => ({ ...item, title: `${item.label} (${item.count})` }))}
        value={tab}
        onChange={onTabChange}
        size="sm"
        stretch
        hideLabels
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-2 text-sm">
        {tab === "outline" && (
          <>
            {sections.filter((s) => s.heading).length === 0 && (
              <p className="p-2 text-xs text-ink-3">
                Write a point with Ctrl+Alt+1 and it appears here, with its words and minutes.
              </p>
            )}
            <ul className="space-y-0.5" onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDropAt(null)}>
              {sections.map((section, index) => {
                if (!section.heading) return null;
                const heading = section.heading;
                const words = countWords(section.text);
                const label = heading.text || "Untitled point";
                return (
                  <li
                    key={`${index}-${heading.text}`}
                    draggable
                    onDragStart={(e) => {
                      draggingRef.current = heading.index;
                      e.dataTransfer.effectAllowed = "move";
                      // A type of its own, so the manuscript never takes the
                      // drop as text to paste.
                      e.dataTransfer.setData(SECTION_MIME, String(heading.index));
                    }}
                    onDragEnd={() => {
                      draggingRef.current = null;
                      setDropAt(null);
                    }}
                    onDragOver={(e) => {
                      if (draggingRef.current == null) return;
                      const move = sectionMove(levels, draggingRef.current, heading.index, sideOf(e));
                      // A drop that would change nothing is not offered.
                      if (!move) {
                        if (dropAt) setDropAt(null);
                        return;
                      }
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      const line = dropLineFor(levels, move);
                      if (dropAt?.index !== line.index || dropAt.side !== line.side) setDropAt(line);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const from = draggingRef.current;
                      draggingRef.current = null;
                      setDropAt(null);
                      // From the drop itself, not the line's state, which can
                      // lag the last dragover by a render.
                      if (from != null) onMoveSection(from, heading.index, sideOf(e));
                    }}
                    className="group relative"
                  >
                    {dropAt?.index === heading.index && (
                      <span
                        aria-hidden="true"
                        className={cx(
                          "pointer-events-none absolute inset-x-1 h-0.5 rounded bg-accent",
                          dropAt.side === "before" ? "-top-px" : "-bottom-px",
                          heading.level === 3 && "left-5",
                        )}
                      />
                    )}
                    <div
                      className={cx(
                        "flex w-full items-center gap-1 rounded-md py-0.5 pr-1",
                        heading.level === 3 ? "pl-4" : "pl-0.5",
                        activeSectionIndex === heading.index ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-hover",
                      )}
                    >
                      <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-ink-4 opacity-0 group-hover:opacity-100" aria-hidden="true" />
                      <button
                        type="button"
                        onClick={() => onGoToSection(heading.index)}
                        className="flex min-w-0 flex-1 items-baseline gap-2 py-0.5 text-left"
                      >
                        <span className="min-w-0 flex-1 truncate">{label}</span>
                        <span className="shrink-0 text-xs tabular-nums text-ink-4 group-focus-within:hidden group-hover:hidden">
                          {words.toLocaleString()} · {minutesFor(words, rate.wpm)} min
                        </span>
                      </button>
                      <span className="hidden shrink-0 items-center group-focus-within:flex group-hover:flex">
                        <button
                          type="button"
                          onClick={() => onStepSection(heading.index, -1)}
                          title={`Move “${label}” up (Alt+Shift+↑ in the manuscript)`}
                          aria-label={`Move “${label}” up`}
                          className="rounded p-0.5 text-ink-4 hover:bg-surface hover:text-ink"
                        >
                          <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onStepSection(heading.index, 1)}
                          title={`Move “${label}” down (Alt+Shift+↓ in the manuscript)`}
                          aria-label={`Move “${label}” down`}
                          className="rounded p-0.5 text-ink-4 hover:bg-surface hover:text-ink"
                        >
                          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {tab === "sources" && (
          <>
            <div className="mb-1 flex items-center justify-between px-1">
              <span className="text-xs text-ink-3">{rows.length === 0 ? "Nothing cited yet" : `${rows.length} in the manuscript`}</span>
              <button
                type="button"
                onClick={() => setGroupByKind((v) => !v)}
                aria-pressed={groupByKind}
                className={cx("rounded px-1.5 py-0.5 text-xs", groupByKind ? "text-accent" : "text-ink-3 hover:text-ink")}
              >
                Group by kind
              </button>
            </div>
            {rows.length === 0 && (
              <p className="p-2 text-xs text-ink-3">
                Every passage you insert and everything you send from the commentary, the confessions, the lexicon, or a book lands here as the sermon's bibliography.
              </p>
            )}
            <ul className="space-y-0.5">
              {rows.map((row, i) => (
                <li key={`${row.kind}-${row.label}-${i}`}>
                  <div className="flex items-baseline gap-2 rounded-md px-2 py-1">
                    <span className="w-20 shrink-0 text-xs uppercase tracking-wide text-ink-4">
                      {row.kind === "passage" ? "Passage" : SOURCE_KIND_LABEL[row.kind]}
                    </span>
                    <span className="min-w-0 flex-1 text-ink-2">{row.label}</span>
                    {canOpenSource(row.refId) && (
                      <button
                        type="button"
                        onClick={(e) => openSourceRef(row.kind, row.refId, e, paneId)}
                        title="Open this source in a pane"
                        aria-label={`Open ${row.label}`}
                        className="shrink-0 rounded p-0.5 text-ink-4 hover:text-accent"
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        {tab === "ideas" && <IdeasPanel sermonId={sermon.id} onInsert={onInsertIdea} paneId={paneId} compact />}
        {tab === "slides" && (
          <>
            <p className="mb-1 px-1 text-xs text-ink-3">
              Generated from the manuscript: a title slide, one per point, one per passage, one for each short
              quotation, and one for anything you mark with Ctrl+Shift+L. Click any of them to present from there.
            </p>
            <ul className="space-y-0.5">
              {slides.map((slide, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => onPresent(i)}
                    className="flex w-full items-baseline gap-2 rounded-md px-2 py-1 text-left hover:bg-hover"
                  >
                    <span className="w-14 shrink-0 text-xs uppercase tracking-wide text-ink-4">{slide.kind}</span>
                    <span className="min-w-0 flex-1 truncate text-ink-2">{slide.heading || "—"}</span>
                    {slide.part && (
                      <span className="shrink-0 text-xs tabular-nums text-ink-4">
                        {slide.part.index}/{slide.part.total}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
