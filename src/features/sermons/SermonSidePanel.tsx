import { useMemo, useState } from "react";
import { ExternalLink, ListTree, Presentation, Quote } from "lucide-react";
import { useBooks } from "../../api/queries";
import { Tabs } from "../../components/ui/Tabs";
import { cx } from "../../components/ui/classes";
import { formatRef } from "../../lib/passage";
import { countWords, passageBlocks, sectionsOf, sourceBlocks } from "./editor/documentModel";
import { canOpenSource, openSourceRef, SOURCE_KIND_LABEL } from "./sourceIdentity";
import { minutesFor, type SpeakingRateInfo } from "./sermonStats";
import { buildSlides } from "./slides";
import { useSermonEditorContext } from "./editor/context";
import type { Sermon, SermonSourceKind } from "../../api/types";

export type SidePanelTab = "outline" | "sources" | "slides";

/**
 * The sermon's own two views of itself (SB1.5).
 *
 * Outline is the manuscript's h2 and h3 headings -- there is no second
 * outline model to keep in step (Q3) -- with each section's words and
 * minutes, and the section the cursor sits in marked. Reordering happens in
 * the manuscript, so this is a map, not an editor.
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
}: {
  body: string;
  tab: SidePanelTab;
  onTabChange: (tab: SidePanelTab) => void;
  /** Which section the cursor is in, or null when the editor is not focused. */
  activeSectionIndex: number | null;
  onGoToSection: (index: number) => void;
  rate: SpeakingRateInfo;
  paneId?: string;
  /** The sermon itself, for the generated slide list. */
  sermon: Sermon;
  onPresent: (startIndex: number) => void;
}) {
  const { data: books } = useBooks();
  const [groupByKind, setGroupByKind] = useState(false);
  // The slide list needs the rendered passages, which the pane already has.
  const { passages: slidePassages } = useSermonEditorContext();

  const sections = useMemo(() => sectionsOf(body), [body]);
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
        items={[
          { key: "outline", label: "Outline", icon: ListTree, count: sections.filter((s) => s.heading).length },
          { key: "sources", label: "Sources", icon: Quote, count: rows.length },
          { key: "slides", label: "Slides", icon: Presentation, count: slides.length },
        ]}
        value={tab}
        onChange={onTabChange}
        size="sm"
        stretch
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-2 text-sm">
        {tab === "outline" && (
          <>
            {sections.filter((s) => s.heading).length === 0 && (
              <p className="p-2 text-xs text-ink-3">
                Write a point with Ctrl+Alt+1 and it appears here, with its words and minutes.
              </p>
            )}
            <ul className="space-y-0.5">
              {sections.map((section, index) => {
                if (!section.heading) return null;
                const words = countWords(section.text);
                return (
                  <li key={`${index}-${section.heading.text}`}>
                    <button
                      type="button"
                      onClick={() => onGoToSection(section.heading!.index)}
                      className={cx(
                        "flex w-full items-baseline gap-2 rounded-md px-2 py-1 text-left hover:bg-hover",
                        section.heading.level === 3 && "pl-5",
                        activeSectionIndex === index ? "bg-accent-soft text-accent" : "text-ink-2",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{section.heading.text || "Untitled point"}</span>
                      <span className="shrink-0 text-xs tabular-nums text-ink-4">
                        {words.toLocaleString()} · {minutesFor(words, rate.wpm)} min
                      </span>
                    </button>
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
        {tab === "slides" && (
          <>
            <p className="mb-1 px-1 text-xs text-ink-3">
              Generated from the manuscript: a title slide, one per point, one per passage, and one for each short
              quotation. Click any of them to present from there.
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
