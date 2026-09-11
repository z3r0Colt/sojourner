import { Bookmark, BookmarkCheck, BookmarkPlus, Trash2 } from "lucide-react";
import { useBookmarks, useBooks, useCreateBookmark, useDeleteBookmark } from "../../api/queries";
import { useNavigationStore } from "../../state/navigationStore";
import { IconButton } from "../../components/ui/Button";
import { Popover, PopoverItem, PopoverLabel } from "../../components/ui/Popover";
import { toast } from "../../components/ui/toast";
import { cx } from "../../components/ui/classes";

/** Toolbar bookmark button: the icon fills when the current chapter (or
 * selected verse) is bookmarked; the menu adds/removes and lists every
 * bookmark for jumping back. */
export function BookmarksMenu({ bookId, chapter, activeVerse }: { bookId: number; chapter: number; activeVerse: number | null }) {
  const { data: bookmarks } = useBookmarks();
  const { data: books } = useBooks();
  const createBookmark = useCreateBookmark();
  const deleteBookmark = useDeleteBookmark();
  const goTo = useNavigationStore((s) => s.goTo);

  function bookName(id: number) {
    return books?.find((b) => b.id === id)?.name ?? `#${id}`;
  }
  function label(b: { book_id: number; chapter: number; verse: number | null }) {
    return `${bookName(b.book_id)} ${b.chapter}${b.verse ? `:${b.verse}` : ""}`;
  }

  const chapterMark = bookmarks?.find((b) => b.book_id === bookId && b.chapter === chapter && b.verse == null);
  const verseMark = activeVerse != null ? bookmarks?.find((b) => b.book_id === bookId && b.chapter === chapter && b.verse === activeVerse) : undefined;
  const hereMarked = !!chapterMark || !!verseMark;

  function toggle(verse: number | undefined, existing: { id: number } | undefined) {
    const text = label({ book_id: bookId, chapter, verse: verse ?? null });
    if (existing) {
      deleteBookmark.mutate(existing.id, { onSuccess: () => toast.info(`Bookmark removed: ${text}`) });
    } else {
      createBookmark.mutate({ bookId, chapter, verse }, { onSuccess: () => toast.success(`Bookmarked ${text}`) });
    }
  }

  const sorted = [...(bookmarks ?? [])].sort((a, b) => a.book_id - b.book_id || a.chapter - b.chapter || (a.verse ?? 0) - (b.verse ?? 0));

  return (
    <Popover
      width="w-72"
      trigger={({ toggle: open, open: isOpen }) => (
        <IconButton icon={hereMarked ? BookmarkCheck : Bookmark} label="Bookmarks (Ctrl+D bookmarks this spot)" active={isOpen || hereMarked} onClick={open} />
      )}
    >
      {(close) => (
        <>
          <PopoverItem
            onClick={() => {
              toggle(undefined, chapterMark);
              close();
            }}
          >
            {chapterMark ? <BookmarkCheck className="h-4 w-4 text-accent" aria-hidden="true" /> : <BookmarkPlus className="h-4 w-4 text-ink-3" aria-hidden="true" />}
            {chapterMark ? "Remove bookmark for this chapter" : `Bookmark ${bookName(bookId)} ${chapter}`}
          </PopoverItem>
          {activeVerse != null && (
            <PopoverItem
              onClick={() => {
                toggle(activeVerse, verseMark);
                close();
              }}
            >
              {verseMark ? <BookmarkCheck className="h-4 w-4 text-accent" aria-hidden="true" /> : <BookmarkPlus className="h-4 w-4 text-ink-3" aria-hidden="true" />}
              {verseMark ? `Remove bookmark for verse ${activeVerse}` : `Bookmark verse ${activeVerse}`}
            </PopoverItem>
          )}
          <div className="my-1 h-px bg-line" aria-hidden="true" />
          <PopoverLabel>All bookmarks</PopoverLabel>
          {sorted.length === 0 && <p className="px-2 pb-1 text-xs text-ink-3">Nothing bookmarked yet.</p>}
          <ul className="max-h-72 overflow-y-auto">
            {sorted.map((b) => (
              <li key={b.id} className="group flex items-center">
                <button
                  type="button"
                  onClick={() => {
                    goTo({ bookId: b.book_id, chapter: b.chapter, verse: b.verse ?? undefined });
                    close();
                  }}
                  className={cx(
                    "min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-hover",
                    b.book_id === bookId && b.chapter === chapter ? "text-accent" : "text-ink-2",
                  )}
                >
                  {label(b)}
                  {b.label && <span className="ml-1.5 text-xs text-ink-3">{b.label}</span>}
                </button>
                <IconButton
                  icon={Trash2}
                  label={`Remove bookmark ${label(b)}`}
                  size="sm"
                  className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={() => deleteBookmark.mutate(b.id)}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </Popover>
  );
}
