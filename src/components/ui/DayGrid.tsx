import { useMemo } from "react";
import { localDate, logWeeks } from "../../features/family/familyWorship";
import { cx } from "./classes";

/**
 * The last five weeks, Sunday first, a dot on each day something was done:
 * family worship's gatherings, memory's reviews. A calendar, not a streak --
 * a missed day is just a day.
 *
 * `log` holds one local date (YYYY-MM-DD) per time it was done; `did` says
 * what, for the tooltip ("gathered", "practised").
 */
export function DayGrid({ log, label, did }: { log: string[]; label: string; did: string }) {
  const today = localDate();
  const rows = useMemo(() => logWeeks(log, 5, today), [log, today]);
  const dayNames = ["S", "M", "T", "W", "T", "F", "S"];
  return (
    <div className="inline-grid grid-cols-7 gap-1.5" role="table" aria-label={label}>
      {dayNames.map((d, i) => (
        <span key={i} className="text-center text-[10px] text-ink-4" aria-hidden="true">
          {d}
        </span>
      ))}
      {rows.flat().map((cell, i) =>
        cell ? (
          <span
            key={cell.date}
            role="cell"
            title={`${new Date(cell.date + "T12:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}${cell.count ? `: ${did}${cell.count > 1 ? ` ${cell.count} times` : ""}` : ""}`}
            className={cx(
              "flex h-6 w-6 items-center justify-center rounded-md border text-[10px]",
              cell.date === today ? "border-accent/50" : "border-line",
              cell.count ? "bg-accent-soft text-accent" : "text-ink-4",
            )}
          >
            {cell.count ? "●" : Number(cell.date.slice(8))}
          </span>
        ) : (
          <span key={`empty-${i}`} className="h-6 w-6" />
        ),
      )}
    </div>
  );
}
