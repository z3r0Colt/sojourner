import { Timer, Trash2 } from "lucide-react";
import { useDeleteSermonEvent } from "../../api/queries";
import { IconButton } from "../../components/ui/Button";
import { confirmDelete } from "../../components/ui/confirm";
import { toast } from "../../components/ui/toast";
import { formatPreachDate } from "./sermonFormat";
import type { Sermon } from "../../api/types";

/** Every timed run of this sermon (SB2.3): rehearsals and preachings with
 * their minutes, newest first. Deleting one is how a mis-timed run stops
 * dragging the measured rate around. */
export function SermonHistory({ sermon }: { sermon: Sermon }) {
  const remove = useDeleteSermonEvent();
  const events = [...sermon.events].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  if (events.length === 0) return null;

  async function handleDelete(eventId: number, label: string) {
    if (!(await confirmDelete(`this ${label}`, "The measured speaking rate is worked out again without it."))) return;
    remove.mutate({ eventId, sermonId: sermon.id }, { onSuccess: () => toast.info("Run deleted") });
  }

  return (
    <section aria-labelledby="sermon-history" className="mt-6 border-t border-line pt-3">
      <h2 id="sermon-history" className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">
        History
      </h2>
      <ul className="space-y-0.5 text-sm">
        {events.map((event) => {
          const minutes = event.duration_seconds ? Math.max(1, Math.round(event.duration_seconds / 60)) : null;
          const label = event.kind === "preaching" ? "preaching" : "rehearsal";
          return (
            <li key={event.id} className="flex items-baseline gap-2 rounded-md px-1 py-0.5">
              <Timer className="h-3.5 w-3.5 shrink-0 self-center text-ink-4" aria-hidden="true" />
              <span className="text-ink-2">
                {event.kind === "preaching" ? "Preached" : "Rehearsed"} {formatPreachDate(event.date, { month: "short", day: "numeric" })}
                {event.venue ? ` at ${event.venue}` : ""}
              </span>
              {minutes != null && <span className="tabular-nums text-ink-3">{minutes} min</span>}
              {event.notes && <span className="min-w-0 flex-1 truncate text-ink-3">— {event.notes}</span>}
              <IconButton
                icon={Trash2}
                label={`Delete this ${label}`}
                size="sm"
                className="ml-auto"
                onClick={() => handleDelete(event.id, label)}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
