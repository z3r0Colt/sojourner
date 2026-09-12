import { Mic } from "lucide-react";
import { useBooks, useSermons } from "../../api/queries";
import { Button } from "../../components/ui/Button";
import { cardClass, cx } from "../../components/ui/classes";
import { openContent, targetFor } from "../../workspace/openContent";
import { usePane } from "../../workspace/PaneContext";
import { PrepTrack } from "../sermons/PrepTrack";
import { evidenceFor, nextStepHint } from "../sermons/prepStages";
import { useAddSermonEvent, useSetSermonStage } from "../../api/queries";
import { toast } from "../../components/ui/toast";
import { useSermonWordCount, useSpeakingRateInfo } from "../sermons/sermonStats";
import { daysUntil, localToday, relativeDay, sermonTextLabel, STAGE_LABEL } from "../sermons/sermonFormat";
import { startRun } from "../sermons/preachingMode";
import type { Sermon } from "../../api/types";

/** How far ahead a sermon counts as "this Sunday". */
const HORIZON_DAYS = 14;

/**
 * "This Sunday" on Today (SB2.2): the sermon coming up, how far along it
 * is, and how much of it is written -- so the week's real work is the first
 * thing the study page says. Two sermons the same day get two cards; a
 * past-dated sermon that was never logged says so.
 */
export function ThisSunday() {
  const { data: sermons } = useSermons();
  const today = localToday();

  const upcoming = (sermons ?? [])
    .filter((s) => s.preach_date != null && s.status !== "archived")
    .filter((s) => {
      const days = daysUntil(s.preach_date as string);
      if (days >= 0) return days <= HORIZON_DAYS && s.stage !== "preached";
      // A past date with nothing logged is a loose end worth showing.
      return days >= -HORIZON_DAYS && s.stage !== "preached" && s.status !== "preached";
    })
    .sort((a, b) => (a.preach_date ?? "").localeCompare(b.preach_date ?? ""));

  if (upcoming.length === 0) return null;

  return (
    <section aria-labelledby="today-sermon" className="mb-7">
      <h2 id="today-sermon" className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">
        This Sunday
      </h2>
      <div className="space-y-2">
        {upcoming.map((sermon) => (
          <SermonCard key={sermon.id} sermon={sermon} today={today} />
        ))}
      </div>
    </section>
  );
}

function SermonCard({ sermon, today }: { sermon: Sermon; today: string }) {
  const { id: paneId } = usePane();
  const { data: books } = useBooks();
  const rate = useSpeakingRateInfo();
  const words = useSermonWordCount(sermon.body, sermon.translation_id, rate);
  const setStage = useSetSermonStage();
  const logPreaching = useAddSermonEvent();
  const days = daysUntil(sermon.preach_date as string);
  const overdue = days < 0;
  const text = sermonTextLabel(books, sermon);
  const evidence = evidenceFor(sermon, sermon.body, rate.wpm);
  const targetWords = sermon.target_minutes ? Math.round(sermon.target_minutes * rate.wpm) : null;

  function open(e: React.MouseEvent) {
    openContent("sermon", { id: sermon.id }, { target: targetFor(e), from: paneId });
  }

  return (
    <div className={cardClass}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Mic className="h-4 w-4 shrink-0 self-center text-accent" aria-hidden="true" />
        <span className="text-sm font-medium text-ink">{sermon.title}</span>
        {text && <span className="text-sm text-ink-2">{text}</span>}
        {sermon.series_title && <span className="text-xs text-ink-3">{sermon.series_title}</span>}
        <span className={cx("ml-auto text-xs", overdue ? "text-warn" : "text-ink-3")}>
          {overdue ? "Not logged as preached" : relativeDay(days)}
        </span>
      </div>

      <div className="mt-2">
        <PrepTrack
          stage={sermon.stage}
          onSetStage={(stage) => setStage.mutate({ sermonId: sermon.id, stage })}
          hint={nextStepHint(sermon.stage, evidence)}
          compact
        />
      </div>

      <p className="mt-2 text-xs text-ink-3">
        At {STAGE_LABEL[sermon.stage]} · {words.total.toLocaleString()}
        {targetWords ? ` of about ${targetWords.toLocaleString()}` : ""} words · about {words.minutes} min
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="primary" onClick={open} title="Open this sermon (Ctrl+click for a new pane)">
          Open
        </Button>
        <Button
          size="sm"
          variant="secondary"
          title="Open it and run it with the clock going"
          onClick={(e) => {
            openContent("sermon", { id: sermon.id }, { target: targetFor(e), from: paneId });
            startRun(sermon.id, { kind: "rehearsal", fullScreen: false });
          }}
        >
          Rehearse
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={logPreaching.isPending}
          onClick={() =>
            logPreaching.mutate(
              {
                sermonId: sermon.id,
                kind: "preaching",
                date: sermon.preach_date ?? today,
                venue: sermon.venue,
                wordCount: words.total,
              },
              { onSuccess: () => toast.success(`${sermon.title} logged as preached`) },
            )
          }
        >
          Mark preached
        </Button>
      </div>
    </div>
  );
}
