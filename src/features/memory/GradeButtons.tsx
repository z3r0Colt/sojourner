import { cx } from "../../components/ui/classes";

/** SM-2's 0–5 "quality" collapsed to four buttons a person can actually
 * judge themselves by. `suggested` (from typed-recall accuracy) gets a ring
 * but the reader still clicks whichever matches how it felt. */
export function GradeButtons({ onGrade, suggested }: { onGrade: (q: number) => void; suggested?: number | null }) {
  const options = [
    { q: 1, label: "Again", cls: "bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-950 dark:text-red-300" },
    { q: 3, label: "Hard", cls: "bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-300" },
    { q: 4, label: "Good", cls: "bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-950 dark:text-green-300" },
    { q: 5, label: "Easy", cls: "bg-accent-soft text-accent hover:bg-accent-soft-2" },
  ];
  return (
    <div>
      <p className="mb-2 text-xs text-ink-3">How well did you recall it?</p>
      <div className="flex gap-2">
        {options.map((o) => (
          <button
            key={o.q}
            type="button"
            onClick={() => onGrade(o.q)}
            className={cx("h-9 flex-1 rounded-md text-sm font-medium", o.cls, suggested === o.q && "ring-2 ring-current ring-offset-1 ring-offset-bg")}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
