import { Layers, Play, Plus, Trash2 } from "lucide-react";
import { useAddNextMemoryPassagePart, useBooks, useDeleteMemoryPassage } from "../../api/queries";
import type { MemoryPassage, MemoryVerse } from "../../api/types";
import { Button, IconButton } from "../../components/ui/Button";
import { cardClass } from "../../components/ui/classes";
import { confirmDelete } from "../../components/ui/confirm";
import { toast } from "../../components/ui/toast";

/** The parts of a passage in the deck, first to last, then the whole. */
export function partsOf(passage: MemoryPassage, cards: MemoryVerse[]): MemoryVerse[] {
  return cards
    .filter(
      (c) =>
        c.book_id === passage.book_id &&
        c.chapter === passage.chapter &&
        c.translation_id === passage.translation_id &&
        c.verse_start >= passage.verse_start &&
        c.verse_end <= passage.verse_end,
    )
    .sort((a, b) => a.verse_end - a.verse_start - (b.verse_end - b.verse_start) || a.verse_start - b.verse_start);
}

/**
 * Passages being learned a part at a time: how far along each is, its
 * parts, and the next part to be had now for a reader who is ready for it.
 */
export function PassageList({
  passages,
  cards,
  onPractise,
}: {
  passages: MemoryPassage[];
  cards: MemoryVerse[];
  onPractise: (cards: MemoryVerse[]) => void;
}) {
  const { data: books } = useBooks();
  const addNext = useAddNextMemoryPassagePart();
  const remove = useDeleteMemoryPassage();
  if (passages.length === 0) return null;
  const name = (id: number) => books?.find((b) => b.id === id)?.name ?? `#${id}`;

  return (
    <section className="mb-5">
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">
        <Layers className="h-3.5 w-3.5" aria-hidden="true" />
        Passages, a part at a time
      </h3>
      <ul className="space-y-2">
        {passages.map((p) => {
          const label = `${name(p.book_id)} ${p.chapter}:${p.verse_start}-${p.verse_end}`;
          const parts = partsOf(p, cards);
          // A passage of one part has no separate whole to say through.
          const whole = p.whole_card_id != null || (p.parts === 1 && p.added === 1);
          const done = p.added >= p.parts && whole;
          const status = whole
            ? "Every part learned: now say it all through."
            : p.added >= p.parts
              ? `All ${p.parts} parts added; ${p.learned} learned.`
              : `Part ${p.added} of ${p.parts}; ${p.learned} learned. The next part comes once this one is recalled twice running.`;
          return (
            <li key={p.id} className={cardClass}>
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-ink">{label}</span>
                  {p.set_name && <span className="ml-2 whitespace-nowrap rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-3">{p.set_name}</span>}
                  <div className="text-xs text-ink-3">{status}</div>
                </div>
                <Button size="sm" variant="secondary" icon={Play} disabled={parts.length === 0} onClick={() => onPractise(parts)}>
                  Practise
                </Button>
                {!done && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Plus}
                    onClick={() => addNext.mutate(p.id, { onSuccess: (added) => toast.info(added ? "Next part added" : "Every part is in already") })}
                    title="For when you already know the part you are on"
                  >
                    {p.added >= p.parts ? "Add the whole" : "Add the next part now"}
                  </Button>
                )}
                <IconButton
                  icon={Trash2}
                  label={`Remove ${label}`}
                  size="sm"
                  onClick={async () => {
                    if (await confirmDelete(`${label} and its parts`, "Their review history goes too. A verse that was in your deck before stays.")) {
                      remove.mutate(p.id, { onSuccess: () => toast.info("Passage removed") });
                    }
                  }}
                />
              </div>
              <div className="mt-2 flex gap-1" aria-hidden="true">
                {Array.from({ length: p.parts }, (_, i) => (
                  <span
                    key={i}
                    className={
                      i < p.learned ? "h-1.5 flex-1 rounded-full bg-accent" : i < p.added ? "h-1.5 flex-1 rounded-full bg-accent/40" : "h-1.5 flex-1 rounded-full bg-line"
                    }
                  />
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
