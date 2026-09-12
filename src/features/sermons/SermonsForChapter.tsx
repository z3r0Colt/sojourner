import { Mic } from "lucide-react";
import { useSermonsForChapter } from "../../api/queries";
import { cx, sectionLabelClass } from "../../components/ui/classes";
import { openContent, targetFor } from "../../workspace/openContent";
import { usePaneOptional } from "../../workspace/PaneContext";
import { formatPreachDate, passageLabel, STAGE_LABEL } from "./sermonFormat";
import { useBooks } from "../../api/queries";
import type { SermonForChapter } from "../../api/types";

/**
 * Sermons on the chapter being read (SB5.4): the ones whose own text is
 * here first, then the ones that quote it, then the ones that merely
 * mention it -- so a preacher opening Romans 8 sees at once what he has
 * already said about it.
 */
export function SermonsForChapterSection({ bookId, chapter }: { bookId: number; chapter: number }) {
  const { data: sermons } = useSermonsForChapter(bookId, chapter);
  const { data: books } = useBooks();
  const pane = usePaneOptional();
  if (!sermons || sermons.length === 0) return null;

  const groups: { role: SermonForChapter["role"]; label: string }[] = [
    { role: "text", label: "Preached from this chapter" },
    { role: "supporting", label: "Quoted in a sermon" },
    { role: "mentioned", label: "Mentioned in a sermon" },
  ];

  return (
    <section className="mb-4">
      <h3 className={cx(sectionLabelClass, "mb-1.5 px-1")}>Sermons</h3>
      {groups.map(({ role, label }) => {
        const rows = sermons.filter((s) => s.role === role);
        if (rows.length === 0) return null;
        return (
          <div key={role} className="mb-2">
            <p className="px-1 text-xs text-ink-4">{label}</p>
            <ul className="mt-0.5 space-y-0.5">
              {rows.map((row) => (
                <li key={`${row.role}-${row.sermon_id}`}>
                  <button
                    type="button"
                    onClick={(e) => openContent("sermon", { id: row.sermon_id }, { target: targetFor(e), from: pane?.id })}
                    onAuxClick={(e) => e.button === 1 && openContent("sermon", { id: row.sermon_id }, { target: "new", from: pane?.id })}
                    title="Open this sermon (Ctrl+click for a new pane)"
                    className="flex w-full items-baseline gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-hover"
                  >
                    <Mic className="h-3.5 w-3.5 shrink-0 self-center text-ink-4" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-ink-2">{row.title}</span>
                    <span className="shrink-0 text-xs text-ink-4">
                      {row.preach_date ? formatPreachDate(row.preach_date, { month: "short", year: "numeric" }) : STAGE_LABEL[row.stage]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {books && sermons.some((s) => s.role === "text" && s.verse_start != null) && (
        <p className="px-1 text-xs text-ink-4">
          {sermons
            .filter((s) => s.role === "text")
            .map((s) => passageLabel(books, { book_id: s.book_id, chapter: s.chapter, verse_start: s.verse_start, verse_end: s.verse_end }))
            .join(" · ")}
        </p>
      )}
    </section>
  );
}

/** The Bible pane's Related row: the sermons preached *from* this chapter,
 * as chips beside the resources. */
export function SermonChipsForChapter({ bookId, chapter }: { bookId: number; chapter: number }) {
  const { data: sermons } = useSermonsForChapter(bookId, chapter);
  const pane = usePaneOptional();
  const texts = (sermons ?? []).filter((s) => s.role === "text");
  if (texts.length === 0) return null;
  return (
    <>
      {texts.map((row) => (
        <button
          key={row.sermon_id}
          type="button"
          onClick={(e) => openContent("sermon", { id: row.sermon_id }, { target: targetFor(e), from: pane?.id })}
          title={`Open “${row.title}” (Ctrl+click for a new pane)`}
          className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-sm text-ink-2 hover:bg-hover hover:text-ink"
        >
          <Mic className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden="true" />
          {row.title}
        </button>
      ))}
    </>
  );
}
