import { Mic, Plus } from "lucide-react";
import { useBooks, useCreateSermon, useSermons } from "../../api/queries";
import { Button } from "../../components/ui/Button";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";
import { Page } from "../../components/ui/Page";
import { toast } from "../../components/ui/toast";
import { usePane } from "../../workspace/PaneContext";
import { openContent, targetFor } from "../../workspace/openContent";
import { formatPreachDate, nextSunday, sermonTextLabel, STAGE_LABEL, STATUS_LABEL } from "./sermonFormat";
import type { Sermon } from "../../api/types";

/** Creates the row first and opens it, so there is never an unsaved
 * document waiting to be lost. Shared by the page, the palette, and Today. */
export function useNewSermon() {
  const create = useCreateSermon();
  return (opts: { from?: string; target?: "focused" | "new" } = {}) =>
    create.mutate(
      { title: "Untitled sermon", preach_date: nextSunday() },
      {
        onSuccess: (sermon) => {
          openContent("sermon", { id: sermon.id }, { target: opts.target ?? "focused", from: opts.from });
          toast.success("Sermon created");
        },
      },
    );
}

/** The Sermons page: every sermon, newest date first. SB5.1 adds filters,
 * search, series grouping, and each card's menu. */
export function SermonsView() {
  const { id: paneId } = usePane();
  const { data: sermons, isLoading } = useSermons();
  const { data: books } = useBooks();
  const newSermon = useNewSermon();

  return (
    <Page
      title="Sermons"
      lead="Every sermon you are working on, with the text it preaches and how far along it is."
      actions={
        <Button variant="primary" icon={Plus} onClick={() => newSermon({ from: paneId })}>
          New sermon
        </Button>
      }
      wide
    >
      {isLoading && <LoadingState />}
      {!isLoading && (sermons?.length ?? 0) === 0 && (
        <EmptyState
          icon={Mic}
          title="No sermons yet"
          description="A sermon here is the study, gathered: its passages are live text in your translation, its citations reopen the commentary or confession they came from, and it drives the panes beside it as you write."
          action={
            <Button variant="primary" icon={Plus} onClick={() => newSermon({ from: paneId })}>
              New sermon
            </Button>
          }
        />
      )}
      {(sermons?.length ?? 0) > 0 && (
        <ul className="space-y-2">
          {sermons?.map((sermon) => (
            <li key={sermon.id}>
              <SermonCard sermon={sermon} books={books} paneId={paneId} />
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}

function SermonCard({ sermon, books, paneId }: { sermon: Sermon; books: ReturnType<typeof useBooks>["data"]; paneId: string }) {
  const text = sermonTextLabel(books, sermon);
  return (
    <button
      type="button"
      onClick={(e) => openContent("sermon", { id: sermon.id }, { target: targetFor(e), from: paneId })}
      onAuxClick={(e) => {
        if (e.button === 1) openContent("sermon", { id: sermon.id }, { target: "new", from: paneId });
      }}
      className="w-full rounded-lg border border-line bg-surface p-3 text-left hover:border-line-2"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="text-sm font-medium text-ink">{sermon.title}</span>
        {text && <span className="text-sm text-ink-2">{text}</span>}
        <span className="ml-auto text-xs text-ink-3">{formatPreachDate(sermon.preach_date)}</span>
      </div>
      {sermon.big_idea && <p className="mt-1 text-sm text-ink-3">{sermon.big_idea}</p>}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 text-xs text-ink-3">
        <span>{STAGE_LABEL[sermon.stage]}</span>
        <span>{STATUS_LABEL[sermon.status]}</span>
        {sermon.series_title && <span>{sermon.series_title}</span>}
      </div>
    </button>
  );
}
