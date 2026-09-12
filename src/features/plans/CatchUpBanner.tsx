import { CalendarClock, CalendarRange, FastForward } from "lucide-react";
import type { ReadingPlan, ReadingPlanProgress } from "../../api/types";
import { useReanchorReadingPlan, useSetReadingPlanDays, useSetReadingPlanSchedule, useSpreadReadingPlan } from "../../api/queries";
import { Button } from "../../components/ui/Button";
import { confirmDialog } from "../../components/ui/confirm";
import { toast } from "../../components/ui/toast";
import { cx } from "../../components/ui/classes";
import { localToday, overdueDays } from "./planSchedule";

const SPREAD_DAYS = 7;

/**
 * Reading plan catch-up (F3.3, F4.2). Shown on the plan page and on Today
 * when the calendar has run ahead of the checklist: "You're 5 days behind"
 * with three ways out. Shift my schedule re-anchors the plan so the next
 * unread day is today (nothing is skipped); Spread over 7 days re-dates
 * the missed days plus this week's evenly across the coming week; Skip to
 * today marks the missed days done (confirmed). Every choice offers Undo
 * on its toast. Renders nothing when the reader is caught up or ahead.
 */
export function CatchUpBanner({ plan, progress, compact }: { plan: ReadingPlan; progress: ReadingPlanProgress; compact?: boolean }) {
  const reanchor = useReanchorReadingPlan();
  const spread = useSpreadReadingPlan();
  const setSchedule = useSetReadingPlanSchedule();
  const setDays = useSetReadingPlanDays();
  const missed = overdueDays(progress, plan.length_days);
  const behind = missed.length;
  if (behind <= 0) return null;
  const planCode = progress.plan_code;
  const dayWord = behind === 1 ? "day" : "days";
  const busy = reanchor.isPending || spread.isPending || setSchedule.isPending || setDays.isPending;

  function shiftSchedule() {
    const previousStart = progress.start_date;
    reanchor.mutate(
      { planCode, dayNumber: progress.current_day, date: localToday() },
      {
        onSuccess: () =>
          toast.success(`Schedule shifted ${behind} ${dayWord}: today is day ${progress.current_day}`, {
            label: "Undo",
            onClick: () => reanchor.mutate({ planCode, dayNumber: 1, date: previousStart }, { onSuccess: () => toast.info("Schedule restored") }),
          }),
      },
    );
  }

  function spreadOut() {
    const previous = progress.schedule ?? [];
    spread.mutate(
      { planCode, today: localToday(), window: SPREAD_DAYS },
      {
        onSuccess: (next) => {
          const redated = next.schedule.length - previous.length;
          toast.success(`${behind} missed ${dayWord} spread over the next ${SPREAD_DAYS} days${redated > behind ? " with this week's readings" : ""}`, {
            label: "Undo",
            onClick: () => setSchedule.mutate({ planCode, entries: previous }, { onSuccess: () => toast.info("Schedule restored") }),
          });
        },
      },
    );
  }

  async function skipToToday() {
    const first = missed[0];
    const last = missed[missed.length - 1];
    const ok = await confirmDialog({
      title: `Skip ${behind} ${dayWord}?`,
      message: `Marks ${behind === 1 ? `day ${first}` : `days ${first} to ${last}`} of ${plan.title} as read so today's reading is day ${last + 1}. You can undo this from the toast, or untick any day later.`,
      confirmLabel: "Skip to today",
    });
    if (!ok) return;
    setDays.mutate(
      { planCode, dayNumbers: missed, done: true },
      {
        onSuccess: () =>
          toast.success(`Marked ${behind} ${dayWord} done`, {
            label: "Undo",
            onClick: () => setDays.mutate({ planCode, dayNumbers: missed, done: false }, { onSuccess: () => toast.info(`${behind} ${dayWord} unmarked`) }),
          }),
      },
    );
  }

  return (
    <div
      role="status"
      className={cx("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-warn/30 bg-warn-soft text-sm text-ink-2", compact ? "px-2.5 py-1.5" : "px-3 py-2")}
    >
      <span className="min-w-0 flex-1">
        <span className="font-medium text-warn">
          You're {behind} {dayWord} behind
        </span>
        {!compact && <span className="text-ink-3"> · next unread is day {progress.current_day}</span>}
      </span>
      {/* The choices wrap onto their own line in a narrow pane rather than clipping. */}
      <span className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" icon={CalendarClock} disabled={busy} onClick={shiftSchedule} title="Move the schedule so today becomes the next unread day; nothing is skipped">
          Shift my schedule
        </Button>
        <Button size="sm" icon={CalendarRange} disabled={busy} onClick={spreadOut} title={`Spread the missed days and this week's readings evenly over the next ${SPREAD_DAYS} days`}>
          Spread over {SPREAD_DAYS} days
        </Button>
        <Button size="sm" variant="ghost" icon={FastForward} disabled={busy} onClick={skipToToday} title="Mark the missed days as read and carry on from today's reading">
          Skip to today
        </Button>
      </span>
    </div>
  );
}
