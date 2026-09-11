import { useNavigate } from "react-router-dom";
import { useBooks, useChapter } from "../../api/queries";
import { useNavigationStore } from "../../state/navigationStore";
import { useReadingTypography } from "../../state/uiStore";
import type { HarmonyReading } from "../../api/types";
import { cx } from "../../components/ui/classes";
import { bookName, joinVerses } from "../../lib/passage";

/** One Gospel's column in the parallel-reading panel. Only renders inline
 * text for a single-chapter reading (the common case) -- a reading that
 * spans chapters (e.g. John 2:23-3:21) falls back to a jump-to-passage
 * link rather than stitching two chapters' worth of verses together. */
function GospelColumn({ reading }: { reading: HarmonyReading }) {
  const { data: books } = useBooks();
  const primaryTranslationId = useNavigationStore((s) => s.primaryTranslationId);
  const goTo = useNavigationStore((s) => s.goTo);
  const navigate = useNavigate();
  const typography = useReadingTypography(0.85);
  const spansChapters = reading.chapter_start !== reading.chapter_end;
  const { data: verses } = useChapter(spansChapters ? null : primaryTranslationId, reading.book_id, reading.chapter_start);
  const text = verses ? joinVerses(verses, reading.verse_start ?? 1, reading.verse_end) : undefined;

  return (
    <div className="min-w-0 rounded-lg border border-line bg-surface-2 p-3">
      <button
        type="button"
        onClick={() => {
          goTo({ bookId: reading.book_id, chapter: reading.chapter_start, verse: reading.verse_start ?? undefined });
          navigate("/");
        }}
        className="mb-1 block text-xs font-semibold text-accent hover:underline"
      >
        {bookName(books, reading.book_id)} {reading.label}
      </button>
      {spansChapters ? (
        <p className="text-xs text-ink-3">Spans chapters. Open the passage to read it.</p>
      ) : (
        <p className="reading-font text-ink-2" style={typography}>
          {text ?? "…"}
        </p>
      )}
    </div>
  );
}

/** Side-by-side reading of every Gospel's account of one harmony event,
 * expanded in place under its row in the flat chronological list. */
export function HarmonyParallelPanel({ readings }: { readings: HarmonyReading[] }) {
  return (
    <div className={cx("mt-3 grid gap-2", readings.length >= 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2")}>
      {readings.map((r, i) => (
        <GospelColumn key={i} reading={r} />
      ))}
    </div>
  );
}
