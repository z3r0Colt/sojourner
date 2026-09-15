import { useBooks, useChapter } from "../../api/queries";
import { useReaderTranslationId } from "../../state/workspaceStore";
import { openPassage, targetFor } from "../../workspace/openContent";
import { useReadingTypography } from "../../state/uiStore";
import type { HarmonyReading } from "../../api/types";
import { cx } from "../../components/ui/classes";
import { bookName, joinVerses } from "../../lib/passage";

/** One column in the parallel-reading panel: one range of one Gospel, which
 * is usually that Gospel's whole account of the event but need not be --
 * Robertson breaks the Sermon on the Mount into eight groups, so Matthew and
 * Luke each get several columns there. Only renders inline text for a
 * single-chapter reading (the common case) -- a reading that spans chapters
 * (e.g. John 2:23-3:21) falls back to a jump-to-passage link rather than
 * stitching two chapters' worth of verses together. */
function GospelColumn({ reading }: { reading: HarmonyReading }) {
  const { data: books } = useBooks();
  const primaryTranslationId = useReaderTranslationId();
  const typography = useReadingTypography(0.85);
  const spansChapters = reading.chapter_start !== reading.chapter_end;
  const { data: verses } = useChapter(spansChapters ? null : primaryTranslationId, reading.book_id, reading.chapter_start);
  const text = verses ? joinVerses(verses, reading.verse_start ?? 1, reading.verse_end) : undefined;

  return (
    <div className="min-w-0 rounded-lg border border-line bg-surface-2 p-3">
      <button
        type="button"
        onClick={(e) => openPassage({ bookId: reading.book_id, chapter: reading.chapter_start, verse: reading.verse_start ?? undefined }, { target: targetFor(e) })}
        className="mb-1 block text-xs font-semibold text-accent hover:underline"
        title={`Open ${bookName(books, reading.book_id)} ${reading.chapter_start}`}
      >
        {reading.label}
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
 * expanded in place under its row in the list. The readings arrive in the
 * order the harmonist printed his columns in, so a harmony that leads with
 * Mark keeps leading with Mark here. */
export function HarmonyParallelPanel({ readings }: { readings: HarmonyReading[] }) {
  return (
    <div className={cx("mt-3 grid gap-2", readings.length >= 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2")}>
      {readings.map((r, i) => (
        <GospelColumn key={i} reading={r} />
      ))}
    </div>
  );
}
