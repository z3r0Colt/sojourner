import { Search, X } from "lucide-react";
import { useBooks, useStrongsEntry } from "../../api/queries";
import { useViewportClampedPosition } from "../../lib/useViewportClampedPosition";
import { CommentaryHtml } from "../commentary/CommentaryPanel";
import { PaneLink as Link } from "../../workspace/PaneLink";
import { openPassage, targetFor } from "../../workspace/openContent";
import { Button, IconButton } from "../../components/ui/Button";
import { LoadingState } from "../../components/ui/EmptyState";

/** The Strong's entry card, opened from an interlinear word or from a
 * double-clicked word in the text. With no `id` (the word could not be
 * matched to the interlinear data) it offers a lexicon search for the word
 * instead, plus an optional one-time hint. */
export function StrongsPopup({
  id,
  word,
  loading,
  x,
  y,
  onClose,
  onSearchLexicon,
  hint,
}: {
  id: string | null;
  /** The word that was looked up, shown when there is no entry to name. */
  word?: string;
  /** True while the match is still being worked out. */
  loading?: boolean;
  x: number;
  y: number;
  onClose: () => void;
  onSearchLexicon?: (word: string) => void;
  hint?: { text: string; onDismiss: () => void } | null;
}) {
  const { data: entry, isLoading } = useStrongsEntry(id);
  const { ref, style } = useViewportClampedPosition<HTMLDivElement>(x, y);
  const { data: books } = useBooks();

  function jumpToRef(bookOsisCode: string, chapter: number, verse: number, e?: React.MouseEvent) {
    const target = books?.find((b) => b.osis_code === bookOsisCode);
    if (target) {
      openPassage({ bookId: target.id, chapter, verse }, { target: e ? targetFor(e) : "focused" });
      onClose();
    }
  }

  const heading = id ?? (word ? `‘${word}’` : "Word lookup");

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={id ? `Strong's ${id}` : `Lookup for ${word ?? "word"}`}
      className="z-40 w-80 rounded-lg border border-line bg-surface p-3 shadow-xl"
      style={style}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="mb-1 flex items-start justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-3">{heading}</span>
        <IconButton icon={X} label="Close" size="sm" onClick={onClose} />
      </div>
      {(loading || (id != null && isLoading)) && <LoadingState className="py-2" />}
      {!loading && id != null && !isLoading && !entry && <p className="text-sm text-ink-3">No lexicon entry found.</p>}
      {!loading && id == null && (
        <div className="text-sm">
          <p className="mb-2 text-ink-2">No Strong's number matched this word here.</p>
          {word && onSearchLexicon && (
            <Button size="sm" variant="secondary" icon={Search} onClick={() => onSearchLexicon(word)}>
              Search the lexicon for ‘{word}’
            </Button>
          )}
        </div>
      )}
      {entry && (
        <div className="text-sm">
          <div className="mb-1 flex items-baseline gap-2">
            <span className="text-2xl text-ink" lang={entry.language === "hebrew" ? "he" : "el"}>
              {entry.original_word}
            </span>
            {entry.transliteration && <span className="italic text-ink-3">{entry.transliteration}</span>}
          </div>
          {entry.pronunciation && <div className="mb-2 text-xs text-ink-3">pronounced: {entry.pronunciation}</div>}
          <p className="mb-2 text-ink-2">{entry.definition}</p>
          {entry.thayers_definition && (
            <div className="mb-2 max-h-48 overflow-y-auto border-l-2 border-line-2 pl-2 text-xs text-ink-2">
              <span className="font-semibold text-ink-3">Thayer's: </span>
              <CommentaryHtml html={entry.thayers_definition} onJumpToRef={jumpToRef} />
            </div>
          )}
          {entry.derivation && (
            <p className="mb-1 text-xs text-ink-3">
              <span className="font-semibold">Derivation:</span> {entry.derivation}
            </p>
          )}
          {entry.kjv_usage && (
            <p className="mb-2 text-xs text-ink-3">
              <span className="font-semibold">KJV usage:</span> {entry.kjv_usage}
            </p>
          )}
          <Link to={`/lexicon/${entry.id}`} className="text-sm text-accent hover:underline" onClick={onClose}>
            View full entry and concordance
          </Link>
        </div>
      )}
      {hint && (
        <div className="mt-3 flex items-start gap-2 border-t border-line pt-2 text-xs text-ink-3">
          <span className="min-w-0 flex-1">{hint.text}</span>
          <IconButton icon={X} label="Dismiss this hint" size="sm" onClick={hint.onDismiss} />
        </div>
      )}
    </div>
  );
}
