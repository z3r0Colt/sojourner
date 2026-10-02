import { ArrowRight, GraduationCap } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { cardClass, cx } from "../../components/ui/classes";
import { useSetting } from "../../hooks/useSetting";
import { openContent, targetFor } from "../../workspace/openContent";
import { usePane } from "../../workspace/PaneContext";
import { EMPTY_GUIDE, GUIDE_SETTING, nextLesson, questionsLabel, stepsDone, type GuideState } from "../guide/course";

/** "Continue: Lesson 18, Justification" on Today, for a student who has
 * begun the guided study. Nothing shows before then, and nothing counts
 * days. */
export function GuideToday() {
  const [state, , { isLoaded }] = useSetting<GuideState>(GUIDE_SETTING, EMPTY_GUIDE);
  const { id: paneId } = usePane();
  if (!isLoaded || Object.keys(state.lessons).length === 0) return null;
  const next = nextLesson(state);
  if (!next) return null;
  const progress = state.lessons[next.id];
  const { done, of } = stepsDone(next, progress);

  return (
    <section aria-labelledby="today-guide" className="mb-7">
      <h2 id="today-guide" className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">
        Guided study
      </h2>
      <div className={cx(cardClass, "flex flex-wrap items-center gap-3")}>
        <GraduationCap className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
        <div className="min-w-[12rem] flex-1">
          <p className="text-sm font-medium text-ink">
            Lesson {next.number}: {next.title}
          </p>
          <p className="text-xs text-ink-3">
            {next.review ? "Review of" : "Shorter Catechism"} {questionsLabel(next)}
            {progress ? ` · ${done} of ${of} steps done` : ""}
          </p>
        </div>
        <Button variant="primary" icon={ArrowRight} onClick={(e) => openContent("guide", { lessonId: next.id }, { target: targetFor(e, paneId) })}>
          {progress ? "Continue" : "Begin"}
        </Button>
      </div>
    </section>
  );
}
