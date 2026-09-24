import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Library } from "lucide-react";
import { api } from "../../api/client";
import type { Book, CitationHit } from "../../api/types";
import { usePane } from "../../workspace/PaneContext";
import { openContent, targetFor } from "../../workspace/openContent";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A reference standing alone in a footnote ("…2074 Matt. xvi. 18 .", as the
 * Fathers print theirs), with no words around it worth showing. */
function isBareFootnote(hit: CitationHit): boolean {
  return (hit.context.replace(hit.label, "").match(/[A-Za-z]{2,}/g) ?? []).length < 3;
}

/** The context, escaped, with the reference marked. */
function contextHtml(hit: CitationHit): string {
  const text = esc(hit.context);
  const label = esc(hit.label);
  const i = text.indexOf(label);
  if (i < 0) return text;
  return `${text.slice(0, i)}<mark class='rounded bg-accent-soft px-0.5 text-accent'>${label}</mark>${text.slice(i + label.length)}`;
}

/**
 * "Cited in your library": every book on every installed shelf, and every
 * book of the reader's own, that cites the passage -- the Fathers and
 * Josephus first, then the rest, each hit opening the book at that place.
 */
export function CitationsForPassage({ book, chapter, activeVerse }: { book: Book; chapter: number; activeVerse: number | null }) {
  const { id: paneId } = usePane();
  const { data, isLoading } = useQuery({
    queryKey: ["citations", book.id, chapter, activeVerse],
    queryFn: () => api.citationsForPassage(book.id, chapter, activeVerse),
  });
  // Shelves in the order a reader of the passage wants them: the ancient
  // witnesses first, then the church's teachers, then their own books.
  const groups = useMemo(() => {
    const order = (shelf: string) => {
      const s = shelf.toLowerCase();
      if (s.includes("ancient")) return 0;
      if (s.includes("father")) return 1;
      if (s.includes("reformer")) return 2;
      if (s.includes("puritan") || s.includes("library")) return 3;
      if (s.includes("nineteenth")) return 4;
      if (s === "your books") return 9;
      return 5;
    };
    const byShelf = new Map<string, Map<number, CitationHit[]>>();
    for (const h of data ?? []) {
      const books = byShelf.get(h.shelf) ?? new Map<number, CitationHit[]>();
      const list = books.get(h.resource_id) ?? [];
      list.push(h);
      books.set(h.resource_id, list);
      byShelf.set(h.shelf, books);
    }
    return [...byShelf.entries()].sort((a, b) => order(a[0]) - order(b[0]) || a[0].localeCompare(b[0]));
  }, [data]);

  const open = (h: CitationHit, e: React.MouseEvent) =>
    openContent(
      "resource",
      { id: h.resource_id, find: { text: h.label, occurrence: h.occurrence, fallback: h.context.replace(/^…/, "").split(" ").slice(0, 8).join(" ") } },
      { target: targetFor(e, "new"), from: paneId },
    );

  if (isLoading) return <LoadingState className="p-8" />;
  const where = `${book.name} ${chapter}${activeVerse ? `:${activeVerse}` : ""}`;
  if (!data || data.length === 0) {
    return (
      <EmptyState
        compact
        icon={Library}
        title={`Nothing in your library cites ${where}`}
        description="Books on the installed shelves, and your own books, are listed here where they cite the passage. Install more shelves in Settings → Book library."
      />
    );
  }
  const bookCount = groups.reduce((n, [, books]) => n + books.size, 0);
  return (
    <div className="h-full overflow-y-auto p-3">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-3">
        {where} · cited {data.length} time{data.length === 1 ? "" : "s"} in {bookCount} book{bookCount === 1 ? "" : "s"}
      </h2>
      {groups.map(([shelf, books]) => (
        <section key={shelf} className="mb-5">
          <h3 className="mb-1 text-xs text-ink-3">{shelf}</h3>
          <ul className="space-y-2">
            {[...books.values()].map((hits) => (
              <li key={hits[0].resource_id}>
                <div className="text-sm font-medium text-ink">
                  {hits[0].title}
                  {hits[0].author && <span className="font-normal text-ink-3"> · {hits[0].author}</span>}
                </div>
                <BookCitations hits={hits} open={open} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** One book's citations: those in running text with their sentence, those
 * standing alone in footnotes as a row of references. */
function BookCitations({ hits, open }: { hits: CitationHit[]; open: (h: CitationHit, e: React.MouseEvent) => void }) {
  const inText = hits.filter((h) => !isBareFootnote(h));
  const notes = hits.filter(isBareFootnote);
  return (
    <>
      {inText.length > 0 && (
        <ul className="mt-0.5 space-y-1">
          {inText.slice(0, 6).map((h, i) => (
            <li key={i}>
              <button
                type="button"
                className="block w-full rounded-md px-2 py-1 text-left text-sm text-ink-2 hover:bg-hover"
                onClick={(e) => open(h, e)}
                dangerouslySetInnerHTML={{ __html: contextHtml(h) }}
              />
            </li>
          ))}
          {inText.length > 6 && <li className="px-2 text-xs text-ink-4">and {inText.length - 6} more in this book</li>}
        </ul>
      )}
      {notes.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-1 px-2 text-xs">
          <span className="text-ink-4">In {notes.length === 1 ? "a footnote" : `${notes.length} footnotes`}:</span>
          {notes.slice(0, 12).map((h, i) => (
            <button
              key={i}
              type="button"
              className="rounded bg-accent-soft px-1 text-accent hover:underline"
              title={`Open at this footnote (${h.label})`}
              onClick={(e) => open(h, e)}
            >
              {h.label}
            </button>
          ))}
          {notes.length > 12 && <span className="text-ink-4">+{notes.length - 12}</span>}
        </div>
      )}
    </>
  );
}
