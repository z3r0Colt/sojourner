import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useAddSermonEvent } from "../../api/queries";
import { useSetting } from "../../hooks/useSetting";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { toast } from "../../components/ui/toast";
import { cx, inputSmClass } from "../../components/ui/classes";
import { LAST_VENUE_SETTING } from "./SermonHeader";
import { localToday } from "./sermonFormat";
import type { Sermon } from "../../api/types";

/** "Mark as preached" (SB5.3): writes the preaching down -- the date it was
 * actually preached, the church, and how long it took -- and the prep track
 * and the status follow it to Preached. */
export function MarkPreachedButton({ sermon, wordCount }: { sermon: Sermon; wordCount: number }) {
  const [open, setOpen] = useState(false);
  const preached = sermon.events.some((e) => e.kind === "preaching");

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        icon={CheckCircle2}
        active={preached}
        title={preached ? "This sermon has been preached; log another time it was preached" : "Log this sermon as preached"}
        onClick={() => setOpen(true)}
      >
        {preached ? "Preached again" : "Mark as preached"}
      </Button>
      {open && <MarkPreachedModal sermon={sermon} wordCount={wordCount} onClose={() => setOpen(false)} />}
    </>
  );
}

function MarkPreachedModal({ sermon, wordCount, onClose }: { sermon: Sermon; wordCount: number; onClose: () => void }) {
  const addEvent = useAddSermonEvent();
  const [lastVenue, setLastVenue] = useSetting<string>(LAST_VENUE_SETTING, "");
  const [date, setDate] = useState(sermon.preach_date ?? localToday());
  const [venue, setVenue] = useState(sermon.venue ?? lastVenue ?? "");
  const [minutes, setMinutes] = useState<string>("");
  const [notes, setNotes] = useState("");

  return (
    <Modal
      title="Log this as preached"
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={addEvent.isPending}
            onClick={() =>
              addEvent.mutate(
                {
                  sermonId: sermon.id,
                  kind: "preaching",
                  date,
                  venue: venue.trim() || null,
                  durationSeconds: minutes ? Math.round(Number(minutes) * 60) : null,
                  wordCount,
                  notes: notes.trim() || null,
                },
                {
                  onSuccess: () => {
                    if (venue.trim()) setLastVenue(venue.trim());
                    toast.success("Logged as preached");
                    onClose();
                  },
                },
              )
            }
          >
            Log it
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <span className="w-16 shrink-0">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cx(inputSmClass, "w-44")} />
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <span className="w-16 shrink-0">Church</span>
          <input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Where" className={cx(inputSmClass, "min-w-0 flex-1")} />
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <span className="w-16 shrink-0">Minutes</span>
          <input
            type="number"
            min={1}
            max={240}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            placeholder="optional"
            className={cx(inputSmClass, "w-24")}
          />
          <span className="text-xs text-ink-3">A timed preaching feeds your measured speaking rate.</span>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-3">A note (optional)</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Evening service" className={cx(inputSmClass, "w-full")} />
        </label>
      </div>
    </Modal>
  );
}

/** The reflection box under the History list: what landed, what to cut,
 * what to say next time. Plain text on the sermon, indexed for search, and
 * opened first when a preached sermon is reopened. */
export function SermonReflection({
  sermon,
  value,
  onChange,
}: {
  sermon: Sermon;
  value: string | null;
  onChange: (reflection: string | null) => void;
}) {
  const preached = sermon.events.some((e) => e.kind === "preaching");
  const [open, setOpen] = useState(preached && !value?.trim());
  if (!preached && !value?.trim()) return null;

  return (
    <section aria-labelledby="sermon-reflection" className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        id="sermon-reflection"
        className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3 hover:text-ink"
      >
        Reflection
      </button>
      {open ? (
        <textarea
          autoFocus={!value?.trim()}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          rows={4}
          placeholder="What landed, what to cut, what to say next time…"
          aria-label="Reflection"
          className="w-full rounded-md border border-line-2 bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
      ) : (
        <p className="whitespace-pre-wrap text-sm text-ink-2">{value}</p>
      )}
    </section>
  );
}
