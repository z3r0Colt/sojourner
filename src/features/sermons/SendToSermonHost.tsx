import { Mic, Plus } from "lucide-react";
import { useCreateSermon, useSermons } from "../../api/queries";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { PopoverItem } from "../../components/ui/Popover";
import { openContent } from "../../workspace/openContent";
import { describeItem, queueInsert, useSendToSermonStore } from "./sendToSermon";
import { formatPreachDate, nextSunday } from "./sermonFormat";

/**
 * The picker "Send to sermon" falls back on when no sermon pane is open, or
 * when the pane it aimed at has gone (Q7): the five most recently edited
 * sermons, plus "New sermon". Choosing one opens it in a new pane and then
 * inserts, so the material lands in a manuscript the reader can see.
 *
 * Mounted once in the shell, like the other dialog hosts.
 */
export function SendToSermonHost() {
  const picking = useSendToSermonStore((s) => s.picking);
  const setPicking = useSendToSermonStore((s) => s.setPicking);
  const { data: sermons } = useSermons({ sort: "updated", limit: 5 });
  const create = useCreateSermon();

  if (!picking) return null;

  function chooseSermon(sermonId: number) {
    const item = picking;
    if (!item) return;
    setPicking(null);
    openContent("sermon", { id: sermonId }, { target: "new" });
    queueInsert(sermonId, item);
  }

  function chooseNew() {
    const item = picking;
    if (!item) return;
    setPicking(null);
    create.mutate(
      { title: "Untitled sermon", preach_date: nextSunday() },
      {
        onSuccess: (sermon) => {
          openContent("sermon", { id: sermon.id }, { target: "new" });
          queueInsert(sermon.id, item);
        },
      },
    );
  }

  return (
    <Modal title="Send to which sermon?" onClose={() => setPicking(null)} size="sm">
      <p className="mb-3 text-sm text-ink-3">{describeItem(picking)}</p>
      <div className="space-y-0.5">
        {sermons?.map((sermon) => (
          <PopoverItem key={sermon.id} onClick={() => chooseSermon(sermon.id)}>
            <Mic className="h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{sermon.title}</span>
            <span className="shrink-0 text-xs text-ink-4">{formatPreachDate(sermon.preach_date, { month: "short", day: "numeric" })}</span>
          </PopoverItem>
        ))}
        {(sermons?.length ?? 0) === 0 && <p className="px-2 py-1 text-sm text-ink-3">No sermons yet.</p>}
      </div>
      <div className="mt-3 border-t border-line pt-3">
        <Button variant="secondary" icon={Plus} onClick={chooseNew} disabled={create.isPending}>
          New sermon
        </Button>
      </div>
    </Modal>
  );
}
