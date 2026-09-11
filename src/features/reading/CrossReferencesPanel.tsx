import { useBooks, useCrossReferences } from "../../api/queries";
import { useNavigationStore } from "../../state/navigationStore";
import type { Book } from "../../api/types";
import { EmptyState } from "../../components/ui/EmptyState";
import { refAttrs } from "../../lib/refAttr";
import { toPassageRef } from "../../lib/passage";
import { Link2 } from "lucide-react";

export function CrossReferencesPanel({ book, chapter, activeVerse }: { book: Book; chapter: number; activeVerse: number | null }) {
  const { data: books } = useBooks();
  const { data: refs } = useCrossReferences(book.id, chapter, activeVerse);
  const goTo = useNavigationStore((s) => s.goTo);

  function bookName(id: number) {
    return books?.find((b) => b.id === id)?.name ?? `#${id}`;
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="border-b border-line px-3 py-2 text-xs text-ink-3">
        {activeVerse ? `Cross references for ${book.name} ${chapter}:${activeVerse}` : "Cross references"}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2 text-sm">
        {activeVerse == null && (
          <EmptyState compact icon={Link2} title="Click a verse to see its cross references" description="The verse number on the left of each line is a handy target." />
        )}
        {activeVerse != null && refs && refs.length === 0 && <EmptyState compact title="No cross references for this verse" />}
        <ul className="space-y-0.5">
          {refs?.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                className="flex w-full items-baseline justify-between rounded-md px-2 py-1.5 text-left hover:bg-hover"
                onClick={() => goTo({ bookId: r.to_book_id, chapter: r.to_chapter, verse: r.to_verse_start })}
                {...refAttrs(toPassageRef(r.to_book_id, r.to_chapter, r.to_verse_start, r.to_verse_end))}
              >
                <span className="text-ink">
                  {bookName(r.to_book_id)} {r.to_chapter}:{r.to_verse_start}
                  {r.to_verse_end !== r.to_verse_start ? `-${r.to_verse_end}` : ""}
                </span>
                <span className="ml-2 shrink-0 text-xs text-ink-4">{r.votes} votes</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
