import { useBooks, useCrossReferences } from "../../api/queries";
import { openPassage, targetFor } from "../../workspace/openContent";
import type { Book } from "../../api/types";
import { EmptyState } from "../../components/ui/EmptyState";
import { refAttrs } from "../../lib/refAttr";
import { formatRef, toPassageRef } from "../../lib/passage";
import { Link2 } from "lucide-react";
import { SendToSermonButton } from "../sermons/StudyActions";
import { crossrefRef } from "../sermons/sourceIdentity";

export function CrossReferencesPanel({ book, chapter, activeVerse }: { book: Book; chapter: number; activeVerse: number | null }) {
  const { data: books } = useBooks();
  const { data: refs } = useCrossReferences(book.id, chapter, activeVerse);

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
          {refs?.map((r, i) => {
            const ref = toPassageRef(r.to_book_id, r.to_chapter, r.to_verse_start, r.to_verse_end);
            return (
            <li key={i} className="group flex items-center gap-1">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-baseline justify-between rounded-md px-2 py-1.5 text-left hover:bg-hover"
                onClick={(e) => openPassage({ bookId: r.to_book_id, chapter: r.to_chapter, verse: r.to_verse_start }, { target: targetFor(e) })}
                onAuxClick={(e) => e.button === 1 && openPassage({ bookId: r.to_book_id, chapter: r.to_chapter, verse: r.to_verse_start }, { target: "new" })}
                {...refAttrs(ref)}
              >
                <span className="text-ink">{formatRef(books, ref)}</span>
                <span className="ml-2 shrink-0 text-xs text-ink-4">{r.votes} votes</span>
              </button>
              <SendToSermonButton
                label={`Send ${formatRef(books, ref)} to the sermon`}
                item={() => ({
                  kind: "passage",
                  refId: crossrefRef(ref.book_id, ref.chapter, ref.verse_start, ref.verse_end),
                  label: formatRef(books, ref),
                  excerpt: null,
                  passage: ref,
                })}
              />
            </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
