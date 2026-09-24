import { useQuery } from "@tanstack/react-query";
import { MapPin, Users } from "lucide-react";
import { api } from "../../api/client";
import type { Book, PassageEntity } from "../../api/types";
import { usePane } from "../../workspace/PaneContext";
import { openContent, targetFor } from "../../workspace/openContent";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";
import { cx } from "../../components/ui/classes";

const GROUPS: [PassageEntity["entity"]["kind"], string][] = [
  ["person", "People"],
  ["place", "Places"],
  ["other", "Peoples, things and titles"],
];

/** The people, places and things the chapter names, following the verse:
 * those the selected verse names come first and stand out. */
export function FactbookForPassage({ book, chapter, activeVerse }: { book: Book; chapter: number; activeVerse: number | null }) {
  const { id: paneId } = usePane();
  const { data, isLoading } = useQuery({
    queryKey: ["factbookForPassage", book.id, chapter],
    queryFn: () => api.getFactbookForPassage(book.id, chapter),
    staleTime: Infinity,
  });
  if (isLoading) return <LoadingState className="p-8" />;
  if (!data || data.length === 0) return <EmptyState compact icon={Users} title={`No names in ${book.name} ${chapter}`} />;
  const inVerse = (p: PassageEntity) => activeVerse != null && p.verses.includes(activeVerse);
  return (
    <div className="h-full overflow-y-auto p-3">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-3">
        Named in {book.name} {chapter}
        {activeVerse != null && ` · verse ${activeVerse} first`}
      </h2>
      {GROUPS.map(([kind, label]) => {
        const list = data.filter((p) => p.entity.kind === kind).sort((a, b) => Number(inVerse(b)) - Number(inVerse(a)));
        if (list.length === 0) return null;
        return (
          <section key={kind} className="mb-4">
            <h3 className="mb-1 text-xs text-ink-3">{label}</h3>
            <ul className="space-y-0.5">
              {list.map((p) => (
                <li key={p.entity.id}>
                  <button
                    type="button"
                    onClick={(e) => openContent("factbook", { id: p.entity.id }, { target: targetFor(e, "new"), from: paneId })}
                    className={cx("flex w-full items-baseline gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-hover", inVerse(p) && "bg-accent-soft")}
                  >
                    {kind === "place" ? <MapPin className="h-3.5 w-3.5 shrink-0 self-center text-ink-3" aria-hidden="true" /> : null}
                    <span className="text-ink">{p.entity.name}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-ink-3">{p.entity.description !== "Place" ? p.entity.description : ""}</span>
                    <span className="shrink-0 text-xs tabular-nums text-ink-4">
                      v. {p.verses.slice(0, 4).join(", ")}
                      {p.verses.length > 4 ? "…" : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
