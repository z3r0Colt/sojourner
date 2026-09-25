import { useState } from "react";
import { Check, ChevronDown, ChevronRight, Plus } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { toast } from "../../components/ui/toast";
import { MEMORY_SETS, type MemorySet } from "./memorySets";
import { useAddToMemory } from "./useAddToMemory";

/**
 * The ready-made sets, each added in one step: the Romans Road, psalms to
 * know by heart, the Ten Commandments... A set already in the deck says so
 * rather than adding itself twice.
 */
export function MemorySetsPanel({ setsInDeck, translationId, deckEmpty }: { setsInDeck: Set<string>; translationId: number | null; deckEmpty: boolean | null }) {
  // Open for a deck with nothing in it yet, folded otherwise -- decided once
  // the deck has loaded (null until then), then the reader's to toggle.
  const [chosen, setChosen] = useState<boolean | null>(null);
  const open = chosen ?? deckEmpty === true;
  const setOpen = (f: (v: boolean) => boolean) => setChosen(f(open));
  const add = useAddToMemory();
  const [adding, setAdding] = useState<string | null>(null);

  async function addSet(set: MemorySet) {
    setAdding(set.name);
    const results = [];
    for (const ref of set.refs) results.push(await add(ref, { setName: set.name, translationId }));
    setAdding(null);
    const added = results.filter((r) => r.ok).length;
    const skipped = results.length - added;
    if (added === 0) toast.info(`Everything in ${set.name} is already in your deck.`);
    else toast.success(`Added ${set.name}${skipped ? ` (${skipped} already in your deck)` : ""}`);
  }

  return (
    <section className="mb-5 rounded-lg border border-line bg-surface">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-1.5 px-3 py-2 text-left">
        {open ? <ChevronDown className="h-4 w-4 text-ink-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4 text-ink-4" aria-hidden="true" />}
        <span className="text-sm font-medium text-ink">Ready-made sets</span>
        <span className="text-xs text-ink-3">Add a whole set at once. Long passages are learned a part at a time.</span>
      </button>
      {open && (
        <ul className="divide-y divide-line border-t border-line">
          {MEMORY_SETS.map((set) => {
            const inDeck = setsInDeck.has(set.name);
            return (
              <li key={set.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-ink">{set.name}</div>
                  <div className="text-xs text-ink-3">
                    {set.note} <span className="text-ink-4">{set.refs.join(" · ")}</span>
                  </div>
                </div>
                {inDeck ? (
                  <span className="inline-flex items-center gap-1 text-xs text-accent">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    In your deck
                  </span>
                ) : (
                  <Button size="sm" icon={Plus} disabled={adding != null} onClick={() => void addSet(set)}>
                    {adding === set.name ? "Adding…" : "Add"}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
