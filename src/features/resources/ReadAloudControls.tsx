import { TextCursor, Volume2 } from "lucide-react";
import { Button, IconButton } from "../../components/ui/Button";
import { cx } from "../../components/ui/classes";
import { useTtsStore } from "../../state/ttsStore";
import { usePaneOptional } from "../../workspace/PaneContext";
import { ReadAloudButton } from "../tts/ReadAloudButton";
import type { ReadAloudFrom } from "./readAloudText";

/**
 * Read aloud for a book, in two places: the reader's header bar (icons, so
 * it is there whichever way the pane is laid out) and the reader sidebar
 * (words). Both start from the page on screen; while the reader has words
 * selected in the book, a second button starts from the paragraph where the
 * selection begins.
 *
 * The reading goes by the book's title, so the button can tell the reading
 * under way is this book's and offer to stop it.
 */
export function ReadAloudControls({
  title,
  onRead,
  hasSelection,
  compact,
}: {
  title: string;
  onRead: (from: ReadAloudFrom) => void;
  /** Words are selected in the book, so "from the selection" means something. */
  hasSelection?: boolean;
  /** Icons only, for the header bar. */
  compact?: boolean;
}) {
  const paneId = usePaneOptional()?.id ?? null;
  const readingHere = useTtsStore((s) => (s.isPlaying || s.isPaused) && s.sourceKind === "resource" && s.title === title && s.paneId === paneId);

  if (compact) {
    // The selection's button comes and goes as words are selected, so it
    // stands to the left of Read aloud, where the header's free space is.
    // To its right it pushed Read aloud along by a button's width, and a
    // click aimed at Read aloud landed on "from the selection" instead.
    return (
      <div className="flex items-center gap-0.5" role="group" aria-label="Read aloud">
        {hasSelection && <IconButton icon={TextCursor} label="Read aloud from the selection" size="sm" onClick={() => onRead("selection")} />}
        <ReadAloudButton iconOnly title={title} sourceKind="resource" onStart={() => onRead("page")} />
      </div>
    );
  }

  // The sidebar keeps one shape whatever is selected or playing. The Contents
  // list sits below, and when selecting words brought in a button (on a row
  // of its own in a narrow sidebar) and a longer hint, the list jumped down
  // 52 px under a reader about to click an entry in it. So the selection's
  // button always holds its place, unseen until there is a selection -- and
  // is named short enough to share Read aloud's row in the usual sidebar --
  // and the hints are laid over one another, the space kept the tallest's.
  const hint = readingHere ? "reading" : hasSelection ? "selection" : "page";
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1">
        {/* Read aloud turns into Stop, a word narrower, and "From selection"
            moved 40 px left while the book was read. The cell keeps Read
            aloud's width, with an unseen copy of it holding the space. */}
        <div className="grid">
          <Button size="sm" variant="ghost" icon={Volume2} aria-hidden tabIndex={-1} className="invisible [grid-area:1/1]">
            Read aloud
          </Button>
          <div className="[grid-area:1/1] justify-self-start">
            <ReadAloudButton title={title} sourceKind="resource" onStart={() => onRead("page")} />
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          icon={TextCursor}
          onClick={() => onRead("selection")}
          title="Read aloud from the paragraph where the selection starts"
          disabled={!hasSelection}
          aria-hidden={!hasSelection || undefined}
          tabIndex={hasSelection ? undefined : -1}
          className={cx(!hasSelection && "invisible")}
        >
          From selection
        </Button>
      </div>
      <div className="mt-1 grid text-xs text-ink-3">
        {(
          [
            ["page", "Starts at the page you are on."],
            ["selection", "Or at the paragraph you have selected."],
            ["reading", "Click a paragraph to read from there."],
          ] as const
        ).map(([key, text]) => (
          <p key={key} className={cx("[grid-area:1/1]", key !== hint && "invisible")} aria-hidden={key !== hint || undefined}>
            {text}
          </p>
        ))}
      </div>
    </div>
  );
}
