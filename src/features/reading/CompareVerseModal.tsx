import { useCompareVerse, useTranslations } from "../../api/queries";
import { useReadingTypography } from "../../state/uiStore";
import type { Book } from "../../api/types";
import { Modal } from "../../components/ui/Modal";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";

/** Lighter-weight single-verse comparison across every installed translation
 * that covers it, opened from a verse's context menu -- distinct from full
 * chapter Parallel mode, which shows a whole chapter in a handful of
 * translations picked ahead of time. */
export function CompareVerseModal({
  book,
  chapter,
  verse,
  onClose,
}: {
  book: Book;
  chapter: number;
  verse: number;
  onClose: () => void;
}) {
  const { data: translations } = useTranslations();
  const { data: results } = useCompareVerse(book.id, chapter, verse);
  const typography = useReadingTypography(0.9);

  function translationName(id: number) {
    const t = translations?.find((t) => t.id === id);
    return t?.name ?? t?.code ?? `#${id}`;
  }

  return (
    <Modal title={`${book.name} ${chapter}:${verse} in every translation`} onClose={onClose} size="lg">
      {!results && <LoadingState />}
      {results?.length === 0 && <EmptyState compact title="No translation has this verse" />}
      <div className="space-y-4">
        {results?.map((v) => (
          <div key={v.translation_id}>
            <div className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-ink-3">{translationName(v.translation_id)}</div>
            <p className="reading-font text-ink" style={typography}>
              {v.text}
            </p>
          </div>
        ))}
      </div>
    </Modal>
  );
}
