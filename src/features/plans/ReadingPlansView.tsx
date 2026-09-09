import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { useNavigationStore } from "../../state/navigationStore";
import type { ReadingPlanReading } from "../../api/types";

function ReadingRefs({ readings, books, onNavigate }: {
  readings: ReadingPlanReading[];
  books: { id: number; name: string }[] | undefined;
  onNavigate: (bookId: number, chapter: number, verse: number | undefined) => void;
}) {
  return (
    <span className="space-x-2">
      {readings.map((r, i) => {
        const name = books?.find((b) => b.id === r.book_id)?.name ?? `#${r.book_id}`;
        return (
          <button
            key={i}
            onClick={() => onNavigate(r.book_id, r.chapter_start, r.verse_start ?? undefined)}
            className="text-blue-600 hover:underline dark:text-blue-400"
            title={`${name} ${r.label}`}
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
  const goTo = useNavigationStore((s) => s.goTo);
  const navigate = useNavigate();

  const plan = plans?.find((p) => p.code === planCode);
  const progress = progressList?.find((p) => p.plan_code === planCode);
  const completedSet = useMemo(() => new Set(progress?.completed_days ?? []), [progress]);

  function toggleDay(dayNumber: number) {
    if (completedSet.has(dayNumber)) {
      unmarkDay.mutate({ planCode, dayNumber });
    } else {
      markDay.mutate({ planCode, dayNumber });
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      <button onClick={onBack} className="mb-3 text-sm text-gray-400 hover:underline">
        ← All plans
      </button>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">{plan?.title ?? planCode}</h1>
          {plan?.description && <p className="mt-1 max-w-xl text-sm text-gray-500">{plan.description}</p>}
        </div>
        {progress ? (
          <div className="shrink-0 text-right">
            <div className="text-sm font-semibold text-blue-600 dark:text-blue-400">
              Day {Math.min(progress.current_day, plan?.length_days ?? progress.current_day)} of {plan?.length_days}
            </div>
            <div className="text-xs text-gray-400">{progress.streak}-day streak</div>
            <button
              onClick={() => abandonPlan.mutate(planCode)}
              className="mt-1 text-xs text-gray-400 hover:underline"
            >
              Reset plan
            </button>
          </div>
        ) : (
          <button
            onClick={() => startPlan.mutate({ planCode, startDate: new Date().toISOString().slice(0, 10) })}
            className="shrink-0 rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
          >
            Start plan
          </button>
        )}
      </div>

      <ul className="divide-y divide-gray-100 dark:divide-gray-900">
        {days?.map((d) => (
          <li key={d.day_number} className="flex items-center gap-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={completedSet.has(d.day_number)}
              onChange={() => toggleDay(d.day_number)}
              disabled={!progress}
              className="h-4 w-4"
            />
            <span className="w-14 shrink-0 text-xs text-gray-400">Day {d.day_number}</span>
            <ReadingRefs
              readings={d.readings}
              books={books}
              onNavigate={(bookId, chapter, verse) => {
                goTo({ bookId, chapter, verse });
                navigate("/");
              }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ReadingPlansView() {
  const { data: plans } = useReadingPlans();
  const { data: progressList } = useReadingPlanProgressList();
  const [selected, setSelected] = useState<string | null>(null);

  if (selected) {
    return <PlanDetail planCode={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      <h1 className="mb-4 text-xl font-semibold">Reading Plans</h1>
      <ul className="space-y-3">
        {plans?.map((p) => {
          const progress = progressList?.find((pr) => pr.plan_code === p.code);
          return (
            <li key={p.id} className="rounded border border-gray-200 p-4 dark:border-gray-800">
              <button onClick={() => setSelected(p.code)} className="text-left">
                <div className="font-medium hover:underline">{p.title}</div>
                {p.description && <p className="mt-1 text-sm text-gray-500">{p.description}</p>}
                <div className="mt-2 text-xs text-gray-400">
                  {p.length_days} days
                  {progress && (
                    <>
                      {" · "}
                      Day {Math.min(progress.current_day, p.length_days)} of {p.length_days}
                      {" · "}
                      {progress.streak}-day streak
                    </>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
