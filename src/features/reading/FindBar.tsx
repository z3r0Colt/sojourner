import { useEffect, useRef } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { Button, IconButton } from "../../components/ui/Button";
import { cx, inputSmClass } from "../../components/ui/classes";

/** The slim find-in-chapter bar under a Bible pane's toolbar: a text box,
 * "3 of 12", previous/next, a whole-word toggle, and close. Enter steps to
 * the next match, Shift+Enter to the previous, Escape closes (which clears
 * the marks). One per Bible pane; Ctrl+G opens the focused pane's. */
export function FindBar({
  query,
  onQueryChange,
  wholeWord,
  onWholeWordChange,
  count,
  current,
  onNext,
  onPrev,
  onClose,
  /** Bumped by the pane to pull focus back into the box (Ctrl+G while open). */
  focusToken,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  wholeWord: boolean;
  onWholeWordChange: (on: boolean) => void;
  count: number;
  /** Zero-based index of the current match, or -1 when there is none. */
  current: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  focusToken: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusToken]);

  const hasQuery = query.trim().length > 0;
  const status = !hasQuery ? "" : count === 0 ? "No matches" : `${current + 1} of ${count}`;

  return (
    <div role="search" aria-label="Find in chapter" className="flex h-9 shrink-0 items-center gap-1 border-b border-line bg-surface-2/60 px-2">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey) onPrev();
            else onNext();
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
        placeholder="Find in this chapter…"
        aria-label="Find in this chapter"
        autoFocus
        className={cx(inputSmClass, "w-56 max-w-[40%]")}
      />
      <span className={cx("min-w-16 px-1 text-xs tabular-nums", hasQuery && count === 0 ? "text-danger" : "text-ink-3")} aria-live="polite">
        {status}
      </span>
      <IconButton icon={ChevronUp} label="Previous match (Shift+Enter)" size="sm" onClick={onPrev} disabled={count === 0} />
      <IconButton icon={ChevronDown} label="Next match (Enter)" size="sm" onClick={onNext} disabled={count === 0} />
      <Button size="sm" variant="ghost" active={wholeWord} aria-pressed={wholeWord} onClick={() => onWholeWordChange(!wholeWord)} title="Match whole words only">
        Whole word
      </Button>
      <div className="min-w-0 flex-1" />
      <IconButton icon={X} label="Close find (Esc)" size="sm" onClick={onClose} />
    </div>
  );
}
