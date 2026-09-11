import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Book } from "../../api/types";
import type { Position } from "../../state/workspaceStore";
import { Button } from "../../components/ui/Button";
import { stepChapter } from "./chapterStep";

/** The quiet card below a chapter's last verse: "Previous · Genesis 1" on
 * the left, "Next · Genesis 3" on the right. At the end of Revelation it
 * says so and offers Genesis 1 instead. Rendered outside the print region,
 * so it never appears on paper. */
export function ChapterEndCard({
  books,
  position,
  onNavigate,
}: {
  books: Book[];
  position: Position;
  /** Called with the chapter to open and the click event, so Ctrl+click
   * and middle-click can open it in a new pane. */
  onNavigate: (target: Position, e: React.MouseEvent) => void;
}) {
  const prev = stepChapter(books, position, -1);
  const next = stepChapter(books, position, 1);
  const label = (p: Position) => `${books.find((b) => b.id === p.bookId)?.name ?? ""} ${p.chapter}`;
  const genesis: Position = { bookId: books[0]?.id ?? 1, chapter: 1 };

  return (
    <nav aria-label="Continue reading" className="mb-16 mt-8 flex items-center justify-between gap-3 border-t border-line pt-3 text-sm print:hidden">
      {prev ? (
        <Button
          size="sm"
          variant="ghost"
          icon={ChevronLeft}
          onClick={(e) => onNavigate(prev, e)}
          onAuxClick={(e) => e.button === 1 && onNavigate(prev, e)}
          title={`Open ${label(prev)} (Ctrl+click for a new pane)`}
          className="text-ink-3"
        >
          <span>
            Previous <span className="text-ink-4">·</span> {label(prev)}
          </span>
        </Button>
      ) : (
        <span />
      )}
      {next ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => onNavigate(next, e)}
          onAuxClick={(e) => e.button === 1 && onNavigate(next, e)}
          title={`Open ${label(next)} (Ctrl+click for a new pane)`}
          className="text-ink-2"
        >
          <span>
            Next <span className="text-ink-4">·</span> {label(next)}
          </span>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      ) : (
        <span className="flex items-center gap-2 text-ink-3">
          End of the Bible
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => onNavigate(genesis, e)}
            onAuxClick={(e) => e.button === 1 && onNavigate(genesis, e)}
            title={`Open ${label(genesis)} (Ctrl+click for a new pane)`}
            className="text-ink-2"
          >
            <span>
              Back to <span className="text-ink-4">·</span> {label(genesis)}
            </span>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </span>
      )}
    </nav>
  );
}
