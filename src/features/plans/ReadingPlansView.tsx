import { useMemo, useState } from "react";
import { ArrowLeft, CalendarCheck, Flame, Play, Plus, RotateCcw } from "lucide-react";
import { PlanBuilderModal } from "./PlanBuilderModal";
import {
  useBooks,
  useReadingPlans,
  useReadingPlanDays,
  useReadingPlanProgressList,
  useStartReadingPlan,
  useAbandonReadingPlan,
  useMarkReadingPlanDay,
  useUnmarkReadingPlanDay,
} from "../../api/queries";
import { openPassage, targetFor } from "../../workspace/openContent";
import { readingPreviewRef } from "../../lib/passage";
import { refAttrs } from "../../lib/refAttr";
import type { ReadingPlanReading } from "../../api/types";
import { Page } from "../../components/ui/Page";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { confirmDialog } from "../../components/ui/confirm";
import { toast } from "../../components/ui/toast";
import { cardClass, checkboxClass, cx } from "../../components/ui/classes";
import { CatchUpBanner } from "./CatchUpBanner";
import { effectiveDate, todaysDays } from "./planSchedule";

/** "Thu, Sep 11" for a plan day's date. */
function formatPlanDate(iso: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function ReadingRefs({
  readings,
  books,
  onNavigate,
}: {
  readings: ReadingPlanReading[];
  books: { id: number; name: string }[] | undefined;
  onNavigate: (bookId: number, chapter: number, verse: number | undefined, e: React.MouseEvent) => void;
}) {
  return (
    <span className="space-x-3">
      {readings.map((r, i) => {
        const name = books?.find((b) => b.id === r.book_id)?.name ?? `#${r.book_id}`;
        return (
          <button
            key={i}
            type="button"
            onClick={(e) => onNavigate(r.book_id, r.chapter_start, r.verse_start ?? undefined, e)}
            onAuxClick={(e) => e.button === 1 && onNavigate(r.book_id, r.chapter_start, r.verse_start ?? undefined, e)}
            className="text-accent hover:underline"
            title={`Open ${name} ${r.label}`}
            {...refAttrs(readingPreviewRef(r))}
          >
            {r.label}
          </button>
        );
      })}
    </span>
  );
}

function PlanDetail({ planCode, onBack }: { planCode: string; onBack: () => void }) {
  const { data: books } = useBooks();
  const { data: plans } = useReadingPlans();
  const { data: days } = useReadingPlanDays(planCode);
  const { data: progressList } = useReadingPlanProgressList();
  const startPlan = useStartReadingPlan();
  const abandonPlan = useAbandonReadingPlan();
  const markDay = useMarkReadingPlanDay();
  const unmarkDay = useUnmarkReadingPlanDay();

  const plan = plans?.find((p) => p.code === planCode);
  const progress = progressList?.find((p) => p.plan_code === planCode);
  const completedSet = useMemo(() => new Set(progress?.completed_days ?? []), [progress]);
  const currentDay = progress ? Math.min(progress.current_day, plan?.length_days ?? progress.current_day) : null;
  // The days the calendar puts today (several after a spread) are marked
  // beside the checklist's; they differ only while the reader is behind or
  // ahead.
  const todayDays = useMemo(() => (progress && plan ? todaysDays(progress, plan.length_days) : []), [progress, plan]);

  function toggleDay(dayNumber: number) {
    if (completedSet.has(dayNumber)) {
      unmarkDay.mutate({ planCode, dayNumber });
    } else {
      markDay.mutate({ planCode, dayNumber });
    }
  }

  return (
    <Page
      title={plan?.title ?? planCode}
      lead={plan?.description}
      actions={
        progress ? (
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-semibold text-accent">
                Day {currentDay} of {plan?.length_days}
              </div>
              <div className="flex items-center justify-end gap-1 text-xs text-ink-3">
                {progress.streak > 0 && <Flame className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />}
                {progress.streak}-day streak
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              icon={RotateCcw}
              onClick={async () => {
                if (
                  await confirmDialog({
                    title: "Reset this plan?",
                    message: "Your progress and streak for this plan are cleared. You can start it again from day one.",
                    confirmLabel: "Reset plan",
                    danger: true,
                  })
                ) {
                  abandonPlan.mutate(planCode, { onSuccess: () => toast.info("Plan reset") });
                }
              }}
            >
              Reset
            </Button>
          </div>
        ) : (
          <Button
            variant="primary"
            icon={Play}
            onClick={() => startPlan.mutate({ planCode, startDate: new Date().toISOString().slice(0, 10) }, { onSuccess: () => toast.success("Plan started") })}
          >
            Start plan
          </Button>
        )
      }
    >
      <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={onBack} className="-mt-3 mb-3">
        All plans
      </Button>
      {plan && progress && (
        <div className="mb-3">
          <CatchUpBanner plan={plan} progress={progress} />
        </div>
      )}
      <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
        {days?.map((d) => {
          const done = completedSet.has(d.day_number);
          const isToday = currentDay === d.day_number;
          const isCalendarToday = todayDays.includes(d.day_number) && d.day_number !== currentDay;
          const date = progress ? formatPlanDate(effectiveDate(progress, d.day_number)) : null;
          return (
            <li key={d.day_number} className={cx("flex items-center gap-3 px-3 py-2 text-sm", isToday && "bg-accent-soft/60")}>
              <input
                type="checkbox"
                className={checkboxClass}
                checked={done}
                onChange={() => toggleDay(d.day_number)}
                disabled={!progress}
                aria-label={`Day ${d.day_number} complete${isCalendarToday ? ", today's date" : ""}${date ? `, ${date}` : ""}`}
              />
              <span className={cx("w-14 shrink-0 text-xs", isToday ? "font-semibold text-accent" : "text-ink-3")} title={[date, isCalendarToday ? "where the calendar puts today" : null].filter(Boolean).join(" · ") || undefined}>
                Day {d.day_number}
                {isCalendarToday && <span className="ml-1 text-warn" aria-hidden="true">●</span>}
              </span>
              <span className={cx(done && "text-ink-3 line-through decoration-line-2")}>
                <ReadingRefs
                  readings={d.readings}
                  books={books}
                  onNavigate={(bookId, chapter, verse, e) => openPassage({ bookId, chapter, verse }, { target: targetFor(e) })}
                />
              </span>
            </li>
          );
        })}
      </ul>
    </Page>
  );
}

export function ReadingPlansView() {
  const { data: plans } = useReadingPlans();
  const { data: progressList } = useReadingPlanProgressList();
  const [selected, setSelected] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);

  if (selected) {
    return <PlanDetail planCode={selected} onBack={() => setSelected(null)} />;
  }

  const newPlanButton = (
    <Button variant="primary" icon={Plus} onClick={() => setBuilding(true)}>
      New plan
    </Button>
  );

  return (
    <Page title="Reading plans" lead="Pick a plan and it tracks each day's reading as you go, or build your own." actions={newPlanButton}>
      {plans && plans.length === 0 && <EmptyState icon={CalendarCheck} title="No reading plans yet" description="Build one: a book in N days, or a list of readings." action={newPlanButton} />}
      {building && (
        <PlanBuilderModal
          onClose={() => setBuilding(false)}
          onSaved={(plan) => {
            setBuilding(false);
            setSelected(plan.code);
          }}
        />
      )}
      <ul className="space-y-3">
        {plans?.map((p) => {
          const progress = progressList?.find((pr) => pr.plan_code === p.code);
          return (
            <li key={p.id}>
              <button type="button" onClick={() => setSelected(p.code)} className={cx(cardClass, "block w-full text-left transition-colors hover:border-line-2 hover:bg-hover/40")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-ink">{p.title}</div>
                    {p.description && <p className="mt-0.5 text-sm text-ink-3">{p.description}</p>}
                  </div>
                  {progress ? (
                    <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">In progress</span>
                  ) : (
                    <span className="shrink-0 text-xs text-ink-3">{p.length_days} days</span>
                  )}
                </div>
                {progress && (
                  <div className="mt-2">
                    <div className="mb-1 flex justify-between text-xs text-ink-3">
                      <span>
                        Day {Math.min(progress.current_day, p.length_days)} of {p.length_days}
                      </span>
                      <span>{progress.streak}-day streak</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (progress.completed_days.length / p.length_days) * 100)}%` }} />
                    </div>
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </Page>
  );
}
