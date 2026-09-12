import { Check } from "lucide-react";
import { cx } from "../../components/ui/classes";
import { SERMON_STAGES, STAGE_LABEL } from "./sermonFormat";
import { stageIndex } from "./prepStages";
import type { SermonStage } from "../../api/types";

/** The six stages across the top of a sermon (SB2.1). Each advances itself
 * from evidence; clicking one sets it by hand, which sticks until new
 * evidence appears. */
export function PrepTrack({
  stage,
  onSetStage,
  hint,
  compact,
}: {
  stage: SermonStage;
  onSetStage: (stage: SermonStage) => void;
  /** What the next stage is waiting for; hidden when there is none. */
  hint?: string | null;
  compact?: boolean;
}) {
  const current = stageIndex(stage);

  return (
    <div>
      <ol className="flex flex-wrap items-center gap-1" aria-label="Preparation">
        {SERMON_STAGES.map((s, i) => {
          const done = i < current;
          const isCurrent = i === current;
          return (
            <li key={s} className="flex items-center gap-1">
              {i > 0 && <span className={cx("h-px w-3", done || isCurrent ? "bg-accent" : "bg-line")} aria-hidden="true" />}
              <button
                type="button"
                onClick={() => onSetStage(s)}
                aria-current={isCurrent ? "step" : undefined}
                title={
                  isCurrent
                    ? `${STAGE_LABEL[s]} — where this sermon is now`
                    : `Set this sermon to ${STAGE_LABEL[s]}`
                }
                className={cx(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                  compact && "px-1.5",
                  isCurrent
                    ? "border-transparent bg-accent-soft font-medium text-accent"
                    : done
                      ? "border-transparent bg-surface-2 text-ink-3 hover:text-ink"
                      : "border-line text-ink-4 hover:border-line-2 hover:text-ink-2",
                )}
              >
                {done && <Check className="h-3 w-3" aria-hidden="true" />}
                {STAGE_LABEL[s]}
              </button>
            </li>
          );
        })}
      </ol>
      {hint && <p className="mt-1 text-xs text-ink-4">{hint}</p>}
    </div>
  );
}
