import { CalendarClock, FastForward } from "lucide-react";
import type { ReadingPlan, ReadingPlanProgress } from "../../api/types";
import { useSetReadingPlanDays, useShiftReadingPlanStart } from "../../api/queries";
import { Button } from "../../components/ui/Button";
import { confirmDialog } from "../../components/ui/confirm";
import { toast } from "../../components/ui/toast";
import { cx } from "../../components/ui/classes";
import { daysBehind } from "./planSchedule";

/**
 * Reading plan catch-up (F3.3). Shown on the plan page and on Today when
 * the calendar has run ahead of the checklist: "You're 5 days behind" with
 * two ways out. Shift my schedule moves the start date forward so today
 * becomes the next unread day (nothing is skipped); Skip to today marks
 * the missed days done (confirmed, with Undo on the toast). Renders
 * nothing when the reader is caught up or ahead.
 */
export function CatchUpBanner({ plan, progress, compact }: { plan: ReadingPlan; progress: ReadingPlanProgress; compact?: boolean }) {
  const shift = useShiftReadingPlanStart();
  const setDays = useSetReadingPlanDays();
  const behind = daysBehind(progress, plan.length_days);
  if (behind <= 0) return null;
  const planCode = progress.plan_code;
  const missed = Array.from({ length: behind }, (_, i) => progress.current_day + i);
  const dayWord = behind === 1 ? "day" : "days";
  const busy = shift.isPending || setDays.isPending;

  function shiftSchedule() {
    shift.mutate(
      { planCode, days: behind },
      {
        onSuccess: () =>
          toast.success(`Schedule shifted ${behind} ${dayWord}: today is day ${progress.current_day}`, {
            label: "Undo",
            onClick: () => shift.mutate({ planCode, days: -behind }, { onSuccess: () => toast.info("Schedule restored") }),
          }),
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
      <span className="flex shrink-0 items-center gap-1.5">
        <Button size="sm" icon={CalendarClock} disabled={busy} onClick={shiftSchedule} title="Move the start date forward so today becomes the next unread day; nothing is skipped">
          Shift my schedule
        </Button>
        <Button size="sm" variant="ghost" icon={FastForward} disabled={busy} onClick={skipToToday} title="Mark the missed days as read and carry on from today's reading">
          Skip to today
        </Button>
      </span>
    </div>
  );
}
