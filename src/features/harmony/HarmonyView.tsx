import { useState } from "react";
import { Columns3 } from "lucide-react";
import { useBooks, useHarmonySections } from "../../api/queries";
import { openPassage, targetFor } from "../../workspace/openContent";
import { HarmonyParallelPanel } from "./HarmonyParallelPanel";
import { Page } from "../../components/ui/Page";
import { Button } from "../../components/ui/Button";
import { LoadingState } from "../../components/ui/EmptyState";

export function HarmonyView() {
  const { data: books } = useBooks();
  const { data: sections } = useHarmonySections();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  return (
    <Page
      title="Harmony of the Gospels"
      lead="The events of Christ's life in order, with where each is told in Matthew, Mark, Luke, and John. Compare the accounts side by side."
      wide
    >
      {!sections && <LoadingState />}
      <ol className="divide-y divide-line rounded-lg border border-line bg-surface">
        {sections?.map((s) => (
          <li key={s.id} className="px-4 py-3 text-sm">
            <div className="flex items-baseline gap-3">
              <span className="w-7 shrink-0 text-right text-xs tabular-nums text-ink-4">{s.sort_order}.</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="font-medium text-ink">{s.title}</div>
                  {s.readings.length > 1 && (
                    <Button size="sm" variant="ghost" icon={Columns3} active={expandedId === s.id} onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}>
                      {expandedId === s.id ? "Hide" : "Compare"}
                    </Button>
                  )}
                </div>
                <div className="mt-0.5 space-x-3">
                  {s.readings.map((r, i) => {
                    const name = books?.find((b) => b.id === r.book_id)?.name ?? `#${r.book_id}`;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={(e) => openPassage({ bookId: r.book_id, chapter: r.chapter_start, verse: r.verse_start ?? undefined }, { target: targetFor(e) })}
                        className="text-accent hover:underline"
                        title={`Open ${name} ${r.label}`}
                      >
                        {r.label}
                      </button>
                    );
                  })}
                </div>
                {expandedId === s.id && <HarmonyParallelPanel readings={s.readings} />}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </Page>
  );
}
