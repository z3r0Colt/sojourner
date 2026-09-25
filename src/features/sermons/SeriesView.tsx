import { useState } from "react";
import { Brain, CalendarCheck, ChevronDown, ChevronRight, Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { SeriesMemoryModal } from "./SeriesMemory";
import {
  useBooks,
  useCreateSermonSeries,
  useCreateUserReadingPlan,
  useDeleteSermonSeries,
  useReadingPlans,
  useSermonSeries,
  useSermons,
  useStartReadingPlan,
  useUpdateSermonSeries,
  useSetReadingPlanSchedule,
  useUpdateUserReadingPlan,
} from "../../api/queries";
import { Button, IconButton } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { Modal } from "../../components/ui/Modal";
import { confirmDelete } from "../../components/ui/confirm";
import { toast } from "../../components/ui/toast";
import { cx, inputSmClass } from "../../components/ui/classes";
import { openContent, targetFor } from "../../workspace/openContent";
import { PrepTrack } from "./PrepTrack";
import { useNewSermon } from "./SermonsView";
import { buildSeriesPlan, describeSeriesPlan, type SeriesPlanShape } from "./seriesPlan";
import { formatPreachDate, sermonTextLabel } from "./sermonFormat";
import type { SermonSeries } from "../../api/types";

/**
 * Series on the Sermons page (SB5.2): a preaching calendar, and the one
 * click that turns it into a reading plan for the congregation.
 */
export function SeriesSection({ paneId }: { paneId: string }) {
  const { data: series } = useSermonSeries();
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const create = useCreateSermonSeries();

  return (
    <section aria-labelledby="sermon-series" className="mt-8 border-t border-line pt-5">
      <div className="mb-2 flex items-center gap-3">
        <h2 id="sermon-series" className="text-xs font-semibold uppercase tracking-wide text-ink-3">
          Series
        </h2>
        <Button size="sm" variant="ghost" icon={Plus} className="ml-auto" onClick={() => setCreating(true)}>
          New series
        </Button>
      </div>

      {(series?.length ?? 0) === 0 && (
        <EmptyState
          compact
          icon={Layers}
          title="No series yet"
          description="A series is a preaching calendar. Once its sermons have texts and dates, one click turns it into a reading plan your congregation can follow through the week."
        />
      )}

      <ul className="space-y-2">
        {series?.map((s) => (
          <li key={s.id}>
            <SeriesRow
              series={s}
              expanded={open === s.id}
              onToggle={() => setOpen(open === s.id ? null : s.id)}
              paneId={paneId}
            />
          </li>
        ))}
      </ul>

      {creating && (
        <SeriesModal
          series={null}
          onClose={() => setCreating(false)}
          onSave={(title, description) =>
            create.mutate({ title, description }, { onSuccess: () => toast.success("Series created") })
          }
        />
      )}
    </section>
  );
}

function SeriesRow({
  series,
  expanded,
  onToggle,
  paneId,
}: {
  series: SermonSeries;
  expanded: boolean;
  onToggle: () => void;
  paneId: string;
}) {
  const { data: books } = useBooks();
  const { data: sermons } = useSermons({ series_id: series.id, sort: "date" });
  const { data: plans } = useReadingPlans();
  const update = useUpdateSermonSeries();
  const remove = useDeleteSermonSeries();
  const newSermon = useNewSermon();
  const [editing, setEditing] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [memorizing, setMemorizing] = useState(false);

  const inOrder = [...(sermons ?? [])].sort(
    (a, b) => (a.series_order ?? 999) - (b.series_order ?? 999) || (a.preach_date ?? "").localeCompare(b.preach_date ?? ""),
  );
  const plan = series.plan_code ? plans?.find((p) => p.code === series.plan_code) : undefined;

  async function handleDelete() {
    if (!(await confirmDelete(`the “${series.title}” series`, "Its sermons stay exactly as they are; they simply stop belonging to a series."))) return;
    remove.mutate(series.id, { onSuccess: () => toast.info("Series deleted") });
  }

  return (
    <div className="rounded-lg border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
        <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex min-w-0 items-center gap-1.5 text-left">
          {expanded ? <ChevronDown className="h-4 w-4 text-ink-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4 text-ink-4" aria-hidden="true" />}
          <span className="text-sm font-medium text-ink">{series.title}</span>
        </button>
        <span className="text-xs text-ink-3">
          {series.preached_count} of {series.sermon_count} preached
        </span>
        {plan && <span className="text-xs text-accent">Reading plan: {plan.title}</span>}
        <span className="ml-auto flex shrink-0 items-center gap-0.5">
          <Button size="sm" variant="ghost" icon={CalendarCheck} onClick={() => setPlanning(true)}>
            {plan ? "Rebuild the reading plan" : "Make a reading plan"}
          </Button>
          <Button size="sm" variant="ghost" icon={Brain} onClick={() => setMemorizing(true)}>
            Memory verses
          </Button>
          <IconButton icon={Pencil} label={`Rename “${series.title}”`} size="sm" onClick={() => setEditing(true)} />
          <IconButton
            icon={Trash2}
            label={`Delete “${series.title}”`}
            size="sm"
            className="text-danger hover:bg-danger-soft hover:text-danger"
            onClick={() => void handleDelete()}
          />
        </span>
      </div>

      {expanded && (
        <div className="border-t border-line px-3 py-2">
          {inOrder.length === 0 && <p className="text-sm text-ink-3">No sermons in this series yet.</p>}
          <ol className="space-y-1">
            {inOrder.map((sermon, i) => (
              <li key={sermon.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className="w-5 shrink-0 text-xs tabular-nums text-ink-4">{i + 1}.</span>
                <button
                  type="button"
                  onClick={(e) => openContent("sermon", { id: sermon.id }, { target: targetFor(e), from: paneId })}
                  className="text-sm text-ink hover:text-accent"
                >
                  {sermon.title}
                </button>
                <span className="text-sm text-ink-2">{sermonTextLabel(books, sermon)}</span>
                <span className="text-xs text-ink-3">{formatPreachDate(sermon.preach_date, { month: "short", day: "numeric" })}</span>
                <span className="ml-auto">
                  <PrepTrack stage={sermon.stage} readOnly compact />
                </span>
              </li>
            ))}
          </ol>
          <Button size="sm" variant="ghost" icon={Plus} className="mt-2" onClick={() => newSermon({ from: paneId, seriesId: series.id })}>
            Add a sermon to this series
          </Button>
        </div>
      )}

      {editing && (
        <SeriesModal
          series={series}
          onClose={() => setEditing(false)}
          onSave={(title, description) =>
            update.mutate(
              { seriesId: series.id, title, description: description || null, planCode: series.plan_code },
              { onSuccess: () => toast.success("Series saved") },
            )
          }
        />
      )}

      {planning && <SeriesPlanModal series={series} onClose={() => setPlanning(false)} />}
      {memorizing && <SeriesMemoryModal series={series} onClose={() => setMemorizing(false)} />}
    </div>
  );
}

function SeriesModal({
  series,
  onSave,
  onClose,
}: {
  series: SermonSeries | null;
  onSave: (title: string, description: string) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(series?.title ?? "");
  const [description, setDescription] = useState(series?.description ?? "");

  return (
    <Modal
      title={series ? `Edit “${series.title}”` : "New series"}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={title.trim().length === 0}
            onClick={() => {
              onSave(title.trim(), description.trim());
              onClose();
            }}
          >
            {series ? "Save" : "Create series"}
          </Button>
        </>
      }
    >
      <label className="mb-3 block">
        <span className="mb-1 block text-xs font-medium text-ink-3">Title</span>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Through Romans" className={cx(inputSmClass, "w-full")} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-3">Description</span>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Sunday mornings, autumn 2026"
          className={cx(inputSmClass, "w-full")}
        />
      </label>
    </Modal>
  );
}

/** Builds (or rebuilds) the congregation's reading plan from the series. */
function SeriesPlanModal({ series, onClose }: { series: SermonSeries; onClose: () => void }) {
  const { data: books } = useBooks();
  const { data: sermons } = useSermons({ series_id: series.id, sort: "date" });
  const createPlan = useCreateUserReadingPlan();
  const updatePlan = useUpdateUserReadingPlan();
  const updateSeries = useUpdateSermonSeries();
  const startPlan = useStartReadingPlan();
  const setSchedule = useSetReadingPlanSchedule();
  const [shape, setShape] = useState<SeriesPlanShape>("before");

  const draft = buildSeriesPlan(series.title, sermons ?? [], books, shape);
  const rebuilding = series.plan_code != null;

  function build() {
    if (!draft) return;
    const input = { title: draft.title, description: draft.description, weekdays: null, days: draft.days };
    const done = async (planCode: string) => {
      // The series remembers its plan, so rebuilding replaces that plan's
      // days rather than leaving a second one behind.
      updateSeries.mutate({ seriesId: series.id, title: series.title, description: series.description, planCode });
      await startPlan.mutateAsync({ planCode, startDate: draft.startDate });
      // The sermons are a week apart, so the reading days are not
      // consecutive: each one is pinned to the date it belongs on.
      await setSchedule.mutateAsync({ planCode, entries: draft.schedule });
      toast.success(rebuilding ? "Reading plan rebuilt" : "Reading plan created");
      onClose();
    };
    const onError = (error: unknown) => toast.error(`Could not build the plan: ${String(error)}`);
    if (rebuilding && series.plan_code) {
      updatePlan.mutate({ planCode: series.plan_code, ...input }, { onSuccess: () => void done(series.plan_code as string), onError });
    } else {
      createPlan.mutate(input, { onSuccess: (plan) => void done(plan.code), onError });
    }
  }

  return (
    <Modal
      title={rebuilding ? "Rebuild the congregation's reading plan" : "Make a reading plan for the congregation"}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!draft || createPlan.isPending || updatePlan.isPending} onClick={build}>
            {rebuilding ? "Rebuild the plan" : "Make the plan"}
          </Button>
        </>
      }
    >
      {!draft ? (
        <p className="text-sm text-ink-2">
          This series has no dated sermons with a text yet. Give each sermon a date and the passage it preaches, and the
          plan writes itself from them.
        </p>
      ) : (
        <>
          <p className="mb-3 text-sm text-ink-2">
            A family that reads next Sunday's text during the week hears the sermon differently. This builds a custom
            reading plan from the series' texts, which then shows up on Today and on the Reading plans page like any
            other plan.
          </p>
          <fieldset className="mb-3">
            <legend className="mb-1 text-xs font-medium text-ink-3">Shape</legend>
            {(
              [
                ["before", "One reading the day before each sermon"],
                ["spread", "Read ahead: the text split over the six days before"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-start gap-2 py-1 text-sm text-ink-2">
                <input type="radio" name="series-plan-shape" checked={shape === value} onChange={() => setShape(value)} className="mt-1" />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
          <p className="text-xs text-ink-3">{describeSeriesPlan(draft)}</p>
          {rebuilding && (
            <p className="mt-2 text-xs text-warn">
              Rebuilding replaces this plan's days. Ticks on days that still exist are kept.
            </p>
          )}
        </>
      )}
    </Modal>
  );
}
