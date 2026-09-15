import { Fragment, useEffect, useRef, useState } from "react";
import { Columns3, StickyNote } from "lucide-react";
import { useBooks, useHarmonies, useHarmony } from "../../api/queries";
import { useUiStore } from "../../state/uiStore";
import { openPassage, targetFor, type OpenTarget } from "../../workspace/openContent";
import { bookName, readingPreviewRef } from "../../lib/passage";
import { refAttrs } from "../../lib/refAttr";
import { HarmonyParallelPanel } from "./HarmonyParallelPanel";
import { Page } from "../../components/ui/Page";
import { Button } from "../../components/ui/Button";
import { Tabs } from "../../components/ui/Tabs";
import { LoadingState } from "../../components/ui/EmptyState";
import { cx, linkClass, selectSmClass, sectionLabelClass } from "../../components/ui/classes";
import type { Book, HarmonySection, HarmonySectionNote } from "../../api/types";

/** A harmonist's footnotes on one event, with a way through to the longer
 * discussion where the footnote defers to one. */
function SectionNotes({
  notes,
  onOpenEssay,
}: {
  notes: HarmonySectionNote[];
  onOpenEssay: (n: number) => void;
}) {
  return (
    <ul className="mt-3 space-y-2 border-l-2 border-line-2 pl-3">
      {notes.map((note, i) => (
        <li key={i} className="text-xs leading-relaxed text-ink-2">
          <span className="mr-1 font-semibold text-ink-3">{note.marker}</span>
          {note.text}
          {note.essay_number != null && (
            <button type="button" className={cx(linkClass, "ml-1.5")} onClick={() => onOpenEssay(note.essay_number!)}>
              Read the note
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function SectionRow({
  section,
  books,
  expanded,
  onToggle,
  onOpenEssay,
}: {
  section: HarmonySection;
  books: Book[] | undefined;
  expanded: boolean;
  onToggle: () => void;
  onOpenEssay: (n: number) => void;
}) {
  const comparable = section.readings.length > 1;
  const hasMore = comparable || section.notes.length > 0;

  return (
    <li className="px-4 py-3 text-sm">
      <div className="flex items-baseline gap-3">
        <span className="w-9 shrink-0 text-right text-xs tabular-nums text-ink-4">
          {section.number ?? section.sort_order}.
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium text-ink">{section.title}</div>
              {section.headnote && <div className="mt-0.5 text-xs text-ink-3">{section.headnote}</div>}
            </div>
            {hasMore && (
              <Button
                size="sm"
                variant="ghost"
                icon={comparable ? Columns3 : StickyNote}
                active={expanded}
                onClick={onToggle}
              >
                {expanded ? "Hide" : comparable ? "Compare" : "Note"}
              </Button>
            )}
          </div>
          <div className="mt-0.5 space-x-3">
            {section.readings.map((r, i) => {
              const open = (target: OpenTarget) =>
                openPassage(
                  { bookId: r.book_id, chapter: r.chapter_start, verse: r.verse_start ?? undefined },
                  { target },
                );
              return (
                <button
                  key={i}
                  type="button"
                  onClick={(e) => open(targetFor(e))}
                  onAuxClick={(e) => e.button === 1 && open("new")}
                  className="text-accent hover:underline"
                  title={`Open ${bookName(books, r.book_id)} ${r.chapter_start}`}
                  {...refAttrs(readingPreviewRef(r))}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
          {expanded && comparable && <HarmonyParallelPanel readings={section.readings} />}
          {expanded && section.notes.length > 0 && (
            <SectionNotes notes={section.notes} onOpenEssay={onOpenEssay} />
          )}
        </div>
      </div>
    </li>
  );
}

export function HarmonyView() {
  const { data: books } = useBooks();
  const { data: harmonies } = useHarmonies();
  const storedCode = useUiStore((s) => s.harmonyCode);
  const setHarmonyCode = useUiStore((s) => s.setHarmonyCode);
  // A code left over from a build that no longer carries that harmony would
  // fetch nothing, so fall back to the first rather than showing an empty page.
  const code = harmonies && storedCode && !harmonies.some((h) => h.code === storedCode) ? null : storedCode;
  const { data: detail } = useHarmony(code);

  const [tab, setTab] = useState<"harmony" | "essays">("harmony");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [pendingEssay, setPendingEssay] = useState<number | null>(null);
  const essayRefs = useRef(new Map<number, HTMLLIElement>());

  useEffect(() => {
    if (pendingEssay == null || tab !== "essays") return;
    essayRefs.current.get(pendingEssay)?.scrollIntoView({ block: "start", behavior: "smooth" });
    setPendingEssay(null);
  }, [pendingEssay, tab]);

  const openEssay = (n: number) => {
    setTab("essays");
    setPendingEssay(n);
  };

  const harmony = detail?.harmony;
  const parts = new Map(detail?.parts.map((p) => [p.id, p]) ?? []);

  return (
    <Page
      title={harmony?.title ?? "Harmony of the Gospels"}
      lead={
        harmony?.description ??
        "The events of Christ's life in order, with where each is told in Matthew, Mark, Luke, and John."
      }
      wide
      actions={
        harmonies && harmonies.length > 1 ? (
          <select
            aria-label="Harmony"
            className={selectSmClass}
            // Driven off the chosen code rather than the loaded harmony, so
            // the picker keeps its selection while the new one is fetching.
            value={code ?? harmonies[0]?.code ?? ""}
            onChange={(e) => {
              setHarmonyCode(e.target.value);
              setExpandedId(null);
              setTab("harmony");
            }}
          >
            {harmonies.map((h) => (
              <option key={h.code} value={h.code}>
                {/* The two titles are nearly the same phrase; who made it and
                    how finely he divided it are what tell them apart. */}
                {[h.author ?? h.title, h.year && `(${h.year})`, `— ${h.section_count} events`].filter(Boolean).join(" ")}
              </option>
            ))}
          </select>
        ) : undefined
      }
    >
      {!detail && <LoadingState />}

      {detail && detail.essays.length > 0 && (
        <Tabs
          className="mb-4"
          value={tab}
          onChange={setTab}
          items={[
            { key: "harmony" as const, label: "The harmony", count: detail.sections.length },
            { key: "essays" as const, label: "Explanatory notes", count: detail.essays.length },
          ]}
        />
      )}

      {detail && tab === "harmony" && (
        <ol className="divide-y divide-line rounded-lg border border-line bg-surface">
          {detail.sections.map((s, i) => {
            // A part heading is printed where the run of sections under it
            // begins, so the list reads as the harmonist divided it.
            const part = s.part_id != null && s.part_id !== detail.sections[i - 1]?.part_id ? parts.get(s.part_id) : null;
            return (
              <Fragment key={s.id}>
                {part && (
                  <li className="bg-surface-2 px-4 py-2">
                    <div className={sectionLabelClass}>{part.label}</div>
                    <div className="text-sm font-semibold text-ink">{part.title}</div>
                  </li>
                )}
                <SectionRow
                  section={s}
                  books={books}
                  expanded={expandedId === s.id}
                  onToggle={() => setExpandedId(expandedId === s.id ? null : s.id)}
                  onOpenEssay={openEssay}
                />
              </Fragment>
            );
          })}
        </ol>
      )}

      {detail && tab === "essays" && (
        <ul className="space-y-5">
          {detail.essays.map((essay) => (
            <li
              key={essay.number}
              ref={(el) => {
                if (el) essayRefs.current.set(essay.number, el);
                else essayRefs.current.delete(essay.number);
              }}
              className="scroll-mt-4 rounded-lg border border-line bg-surface p-4"
            >
              <h2 className="text-sm font-semibold text-ink">
                <span className="mr-2 tabular-nums text-ink-4">{essay.number}.</span>
                {essay.title}
              </h2>
              <div className="mt-2 space-y-2 text-sm leading-relaxed text-ink-2">
                {essay.body.split("\n\n").map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      {harmony?.source_note && (
        <p className="mt-6 text-xs leading-relaxed text-ink-4">{harmony.source_note}</p>
      )}
    </Page>
  );
}
