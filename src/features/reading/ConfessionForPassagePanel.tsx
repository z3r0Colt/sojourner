import { ScrollText } from "lucide-react";
import { useConfessionForPassage } from "../../api/queries";
import type { Book } from "../../api/types";
import { EmptyState } from "../../components/ui/EmptyState";
import { usePaneNavigate } from "../../workspace/PaneContext";
import { StudyActions } from "../sermons/StudyActions";
import { westminsterRef } from "../sermons/sourceIdentity";

const DOC_ORDER: Record<string, number> = { wcf: 0, wsc: 1, wlc: 2 };

export function ConfessionForPassagePanel({ book, chapter, activeVerse }: { book: Book; chapter: number; activeVerse: number | null }) {
  const { data: matches } = useConfessionForPassage(book.id, chapter, activeVerse);
  const navigate = usePaneNavigate();

  const sorted = [...(matches ?? [])].sort(
    (a, b) => (DOC_ORDER[a.document_code] ?? 9) - (DOC_ORDER[b.document_code] ?? 9),
  );

  return (
    <div className="flex h-full w-full flex-col">
      <div className="border-b border-line px-3 py-2 text-xs text-ink-3">
        {activeVerse ? `Confessions citing ${book.name} ${chapter}:${activeVerse}` : "Confessions"}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2 text-sm">
        {activeVerse == null && (
          <EmptyState
            compact
            icon={ScrollText}
            title="Click a verse to see where the Confessions cite it"
            description="Westminster Confession and Catechism proof texts that point to the selected verse."
          />
        )}
        {activeVerse != null && matches && sorted.length === 0 && <EmptyState compact title="No Confession or Catechism proofs cite this verse" />}
        <ul className="space-y-0.5">
          {sorted.map((m) => (
            <li key={`${m.section_id}-${m.marker}`} className="flex items-start gap-1">
              <button
                type="button"
                className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-left hover:bg-hover"
                onClick={(e) => navigate(`/westminster/${m.document_code}/${m.section_id}`, e)}
                onAuxClick={(e) => e.button === 1 && navigate(`/westminster/${m.document_code}/${m.section_id}`, e)}
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-medium text-ink">
                    {m.document_code.toUpperCase()} {m.heading}
                  </span>
                  <span className="ml-2 shrink-0 text-xs text-ink-4">proof {m.marker}</span>
                </div>
                {m.prompt && <div className="text-xs text-ink-3">{m.prompt}</div>}
              </button>
              <StudyActions
                what={`${m.document_code.toUpperCase()} ${m.heading}`}
                item={() => ({
                  kind: "confession",
                  refId: westminsterRef(m.document_code, m.section_id),
                  label: `${m.document_code.toUpperCase()} ${m.heading}`,
                  excerpt: m.prompt ?? null,
                })}
              />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
