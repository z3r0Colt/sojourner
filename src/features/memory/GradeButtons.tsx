import { cx } from "../../components/ui/classes";
import { Kbd } from "../../components/ui/Page";
import { GRADE_KEYS } from "./practiceKeys";

/** SM-2's 0–5 "quality" collapsed to four buttons a person can actually
 * judge themselves by. `suggested` (from typed-recall accuracy) gets a ring
 * but the reader still clicks whichever matches how it felt. Each button
 * shows the number key that presses it (F2.6). */
export function GradeButtons({ onGrade, suggested }: { onGrade: (q: number) => void; suggested?: number | null }) {
  const styles: Record<string, string> = {
    "1": "bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-950 dark:text-red-300",
    "2": "bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-300",
    "3": "bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-950 dark:text-green-300",
    "4": "bg-accent-soft text-accent hover:bg-accent-soft-2",
  };
  return (
    <div>
      <p className="mb-2 text-xs text-ink-3">How well did you recall it? Press 1 to 4.</p>
      <div className="flex gap-2">
        {GRADE_KEYS.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => onGrade(o.quality)}
            aria-keyshortcuts={o.key}
            title={`${o.label} (${o.key})`}
            className={cx(
              "inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md text-sm font-medium",
              styles[o.key],
              suggested === o.quality && "ring-2 ring-current ring-offset-1 ring-offset-bg",
            )}
          >
            {o.label}
            <Kbd>{o.key}</Kbd>
          </button>
        ))}
      </div>
    </div>
  );
}
