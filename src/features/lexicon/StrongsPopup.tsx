import { Link, useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { useBooks, useStrongsEntry } from "../../api/queries";
import { useViewportClampedPosition } from "../../lib/useViewportClampedPosition";
import { CommentaryHtml } from "../commentary/CommentaryPanel";
import { useNavigationStore } from "../../state/navigationStore";
import { IconButton } from "../../components/ui/Button";
import { LoadingState } from "../../components/ui/EmptyState";

export function StrongsPopup({ id, x, y, onClose }: { id: string; x: number; y: number; onClose: () => void }) {
  const { data: entry, isLoading } = useStrongsEntry(id);
  const { ref, style } = useViewportClampedPosition<HTMLDivElement>(x, y);
  const { data: books } = useBooks();
  const { goTo } = useNavigationStore();
  const navigate = useNavigate();

  function jumpToRef(bookOsisCode: string, chapter: number, verse: number) {
    const target = books?.find((b) => b.osis_code === bookOsisCode);
    if (target) {
      goTo({ bookId: target.id, chapter, verse });
      navigate("/");
      onClose();
    }
  }

  return (
    <div
      ref={ref}
      className="z-40 w-80 rounded-lg border border-line bg-surface p-3 shadow-xl"
      style={style}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="mb-1 flex items-start justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-3">{id}</span>
        <IconButton icon={X} label="Close" size="sm" onClick={onClose} />
      </div>
      {isLoading && <LoadingState className="py-2" />}
      {!isLoading && !entry && <p className="text-sm text-ink-3">No lexicon entry found.</p>}
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
    </div>
  );
}
