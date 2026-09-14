import { BookMarked } from "lucide-react";
import { useIsbeForPassage } from "../../api/queries";
import type { Book } from "../../api/types";
import { openContent, targetFor } from "../../workspace/openContent";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";
import { cx } from "../../components/ui/classes";

/** How many groups to name before it stops being useful to. */
const GROUPS_SHOWN = 4;

/** "1, 2, 3, 7, 8" reads as "1-3, 7-8": a citation of a whole chapter should
 *  say so rather than listing every verse in it. */
function versesLabel(verses: number[]): string {
  if (verses.length === 0) return "";
  const runs: string[] = [];
  for (let i = 0; i < verses.length; ) {
    let j = i;
    while (j + 1 < verses.length && verses[j + 1] === verses[j] + 1) j++;
    runs.push(j > i ? `${verses[i]}-${verses[j]}` : `${verses[i]}`);
    i = j + 1;
  }
  const shown = runs.slice(0, GROUPS_SHOWN).join(", ");
  const more = runs.length > GROUPS_SHOWN ? ` and ${runs.length - GROUPS_SHOWN} more` : "";
  return `${verses.length === 1 ? "v." : "vv."} ${shown}${more}`;
}

/**
 * The encyclopedia articles that discuss the chapter being read.
 *
 * ISBE tags every citation it makes, and this is that index read backwards:
 * open Genesis 14 and it answers with Melchizedek, Salem, Chedorlaomer,
 * Tithe. A reference work is only as good as the reader's guess at what to
 * look up, and this removes the guess.
 */
export function EncyclopediaForPassage({
  book,
  chapter,
  activeVerse,
}: {
  book: Book;
  chapter: number;
  activeVerse: number | null;
}) {
  const { data: entries, isPending } = useIsbeForPassage(book.id, chapter);

  // A verse is selected: the articles about it come first, the rest of the
  // chapter's stay below rather than disappearing.
  const onVerse = activeVerse != null ? (entries ?? []).filter((e) => e.verses.includes(activeVerse)) : [];
  const rest = activeVerse != null ? (entries ?? []).filter((e) => !e.verses.includes(activeVerse)) : entries ?? [];

  if (isPending) return <LoadingState className="p-6" />;
  if (!entries?.length) {
    return (
      <EmptyState
        icon={BookMarked}
        compact
        title="Nothing on this chapter"
        description={`The encyclopedia makes no reference to ${book.name} ${chapter}.`}
      />
    );
  }

  function open(slug: string, e: React.MouseEvent) {
    openContent("encyclopedia", { slug }, { target: targetFor(e) });
  }

  const row = (entry: (typeof entries)[number], emphasised: boolean) => (
    <button
      key={entry.slug}
      type="button"
      onClick={(e) => open(entry.slug, e)}
      onAuxClick={(e) => e.button === 1 && open(entry.slug, e)}
      className="block w-full border-b border-line px-3 py-2 text-left hover:bg-hover"
    >
      <span className={cx("block text-sm", emphasised ? "font-medium text-accent" : "text-ink")}>{entry.term}</span>
      <span className="block text-xs text-ink-4">{versesLabel(entry.verses)}</span>
    </button>
  );

  return (
    <div className="flex h-full flex-col">
      <p className="border-b border-line px-3 py-2 text-xs text-ink-3">
        {entries.length} {entries.length === 1 ? "article discusses" : "articles discuss"} {book.name} {chapter}
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {onVerse.length > 0 && (
          <>
            <h3 className="bg-surface-2/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">
              On verse {activeVerse}
            </h3>
            {onVerse.map((e) => row(e, true))}
            <h3 className="bg-surface-2/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">
              Elsewhere in the chapter
            </h3>
          </>
        )}
        {rest.map((e) => row(e, false))}
      </div>
      <p className="border-t border-line px-3 py-1.5 text-[11px] text-ink-4">
        International Standard Bible Encyclopedia (1915)
      </p>
    </div>
  );
}
