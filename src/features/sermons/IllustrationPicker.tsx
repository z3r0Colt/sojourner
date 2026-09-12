import { useState } from "react";
import { Lightbulb, Search } from "lucide-react";
import { useIllustrationUses, useIllustrations } from "../../api/queries";
import { Modal } from "../../components/ui/Modal";
import { EmptyState } from "../../components/ui/EmptyState";
import { cx, inputSmClass } from "../../components/ui/classes";
import { htmlToText } from "./excerpt";
import { formatPreachDate } from "./sermonFormat";
import type { Illustration } from "../../api/types";

/**
 * The picker behind the manuscript toolbar's Illustration button (SB3.3):
 * search by title or first line, see when each was last used, and be warned
 * when one has already been told in this series -- the congregation
 * remembers, even when the preacher does not.
 */
export function IllustrationPicker({
  seriesId,
  onChoose,
  onClose,
}: {
  seriesId: number | null;
  onChoose: (illustration: Illustration) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const { data: illustrations } = useIllustrations({ query: query.trim() || null });
  const { data: uses } = useIllustrationUses();

  return (
    <Modal title="Insert an illustration" onClose={onClose} size="md" align="top">
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-4" aria-hidden="true" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search titles, text, and sources…"
          aria-label="Search illustrations"
          className={cx(inputSmClass, "w-full pl-7")}
        />
      </div>
      {(illustrations?.length ?? 0) === 0 && (
        <EmptyState
          compact
          icon={Lightbulb}
          title={query.trim() ? "Nothing matches" : "The library is empty"}
          description={
            query.trim()
              ? "Try fewer words."
              : "Select anything you are reading and choose “Save as illustration” to start the library."
          }
        />
      )}
      <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
        {illustrations?.map((illustration) => {
          const mine = (uses ?? []).filter((u) => u.illustration_id === illustration.id);
          const inThisSeries = seriesId != null && mine.some((u) => u.series_id === seriesId);
          const lastUse = mine[0];
          return (
            <li key={illustration.id}>
              <button
                type="button"
                onClick={() => onChoose(illustration)}
                className="w-full rounded-md border border-line bg-surface px-3 py-2 text-left hover:border-line-2"
              >
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm font-medium text-ink">{illustration.title}</span>
                  {illustration.kind === "quote" && <span className="text-xs uppercase tracking-wide text-ink-4">Quotation</span>}
                  {inThisSeries && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-xs text-warn">Already used in this series</span>}
                  <span className="ml-auto text-xs text-ink-4">
                    {mine.length === 0
                      ? "Not used yet"
                      : `Used ${mine.length}×${lastUse?.preach_date ? ` · last ${formatPreachDate(lastUse.preach_date, { month: "short", year: "numeric" })}` : ""}`}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-sm text-ink-3">{htmlToText(illustration.body)}</p>
                {illustration.source_label && <p className="mt-0.5 text-xs text-ink-4">{illustration.source_label}</p>}
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
