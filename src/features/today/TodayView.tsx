import { useMemo } from "react";
import { BookOpen, Bookmark as BookmarkIcon, Brain, HandHeart, History } from "lucide-react";
import {
  useBookmarks,
  useBooks,
  useDueCatechismMemory,
  useDueMemoryVerses,
  useMarkPrayerListPersonPrayed,
  useMarkReadingPlanDay,
  usePassageText,
  usePrayerListPeople,
  useReadingLog,
  useReadingPlanDays,
  useReadingPlanProgressList,
  useReadingPlans,
  useReadingPosition,
  useUnmarkReadingPlanDay,
} from "../../api/queries";
import type { ReadingPlanProgress } from "../../api/types";
import { openPassage, targetFor } from "../../workspace/openContent";
import { usePaneNavigate } from "../../workspace/PaneContext";
import { Page } from "../../components/ui/Page";
import { Button } from "../../components/ui/Button";
import { toast } from "../../components/ui/toast";
import { cardClass, checkboxClass, cx, sectionLabelClass } from "../../components/ui/classes";
import { useReadingTypography } from "../../state/uiStore";
import { formatChapterRef, toPassageRef } from "../../lib/passage";
import { refAttrs } from "../../lib/refAttr";
import { ReadingRefs } from "../plans/ReadingPlansView";
import { CatchUpBanner } from "../plans/CatchUpBanner";
import { calendarDay, isFinished } from "../plans/planSchedule";
import { longestUnprayed, timeAgo } from "../prayer/prayerListTime";

/**
 * The Today page (F3.1): one place to start the day from. Six blocks in a
 * fixed order -- Continue reading, Today's plan, Due for review, Pray for,
 * Bookmarks, Recent chapters -- and every block but the first hides when
 * it has nothing to show, so a fresh install sees only Continue reading.
 * A pane kind, so it can sit beside the text; every jump lands in the
 * pane the reader is working in (Ctrl+click for a new pane).
 */

const BOOKMARK_LIMIT = 8;
const RECENT_LIMIT = 8;
const PRAY_FOR_LIMIT = 3;

function Block({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mb-7">
      <h2 id={id} className={cx(sectionLabelClass, "mb-2")}>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Where the reader left off, with the first verse as a teaser. Always
 * shown; with nothing read yet it offers Genesis 1. */
function ContinueReading() {
  const { data: pos, isLoading } = useReadingPosition();
  const { data: books } = useBooks();
  const typography = useReadingTypography(0.95);
  const fresh = !pos || pos.book_id == null || pos.chapter == null;
  const bookId = fresh ? 1 : pos.book_id!;
  const chapter = fresh ? 1 : pos.chapter!;
  const verse = fresh ? null : pos.verse;
  const teaserRef = toPassageRef(bookId, chapter, verse ?? 1);
  const { data: passage } = usePassageText(isLoading ? null : teaserRef);
  if (isLoading) return null;
  const label = formatChapterRef(books, bookId, chapter, verse);
  const open = (e: React.MouseEvent) => openPassage({ bookId, chapter, verse: verse ?? undefined }, { target: targetFor(e) });
  return (
    <Block id="today-continue" title="Continue reading">
      <div className={cx(cardClass, "flex flex-wrap items-start justify-between gap-3")}>
        {/* The teaser keeps a readable column; in a narrow pane the button wraps below it. */}
        <div className="min-w-[14rem] flex-1">
          <button
            type="button"
            className="text-base font-semibold text-accent hover:underline"
            title={`Open ${label} (Ctrl+click for a new pane)`}
            onClick={open}
            onAuxClick={(e) => e.button === 1 && open(e)}
          >
            {label}
          </button>
          {fresh && <p className="mt-0.5 text-xs text-ink-3">Nothing read yet. Start at the beginning.</p>}
          {passage?.text && (
            <p className="reading-font mt-1.5 line-clamp-3 text-ink-2" style={typography}>
              <sup className="mr-1 select-none font-sans text-xs font-semibold text-ink-4">{verse ?? 1}</sup>
              {passage.text}
            </p>
          )}
        </div>
        <Button variant="primary" icon={BookOpen} onClick={open} onAuxClick={(e) => e.button === 1 && open(e)}>
          {fresh ? "Start reading" : "Continue"}
        </Button>
      </div>
    </Block>
  );
}

/** One in-progress plan's reading for the calendar day, with its checkbox. */
function PlanToday({ progress }: { progress: ReadingPlanProgress }) {
  const { data: plans } = useReadingPlans();
  const { data: days } = useReadingPlanDays(progress.plan_code);
  const { data: books } = useBooks();
  const markDay = useMarkReadingPlanDay();
  const unmarkDay = useUnmarkReadingPlanDay();
  const plan = plans?.find((p) => p.code === progress.plan_code);
  if (!plan || !days || isFinished(progress, plan.length_days)) return null;
  const dayNumber = calendarDay(progress, plan.length_days);
  const day = days.find((d) => d.day_number === dayNumber);
  if (!day) return null;
  const done = progress.completed_days.includes(dayNumber);
  const planCode = progress.plan_code;
  function toggle() {
    if (done) unmarkDay.mutate({ planCode, dayNumber }, { onSuccess: () => toast.info(`Day ${dayNumber} unmarked`) });
    else markDay.mutate({ planCode, dayNumber }, { onSuccess: () => toast.success(`Day ${dayNumber} of ${plan!.title} done`) });
  }
  return (
    <li className={cx(cardClass, "flex items-start gap-3")}>
      <input type="checkbox" className={cx(checkboxClass, "mt-1")} checked={done} onChange={toggle} aria-label={`${plan.title}, day ${dayNumber} complete`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-ink-3">
          <span className="font-medium text-ink">{plan.title}</span>
          <span>
            Day {dayNumber} of {plan.length_days}
          </span>
        </div>
        <div className={cx("mt-0.5 text-sm", done && "text-ink-3 line-through decoration-line-2")}>
          <ReadingRefs readings={day.readings} books={books} onNavigate={(bookId, chapter, verse, e) => openPassage({ bookId, chapter, verse }, { target: targetFor(e) })} />
        </div>
        <div className="mt-2 empty:hidden">
          <CatchUpBanner plan={plan} progress={progress} compact />
        </div>
      </div>
    </li>
  );
}

function TodaysPlan() {
  const { data: progressList } = useReadingPlanProgressList();
  const { data: plans } = useReadingPlans();
  const active = useMemo(() => {
    if (!progressList || !plans) return [];
    return progressList.filter((pr) => {
      const plan = plans.find((p) => p.code === pr.plan_code);
      return plan && !isFinished(pr, plan.length_days);
    });
  }, [progressList, plans]);
  if (active.length === 0) return null;
  return (
    <Block id="today-plan" title="Today's plan">
      <ul className="space-y-2">
        {active.map((pr) => (
          <PlanToday key={pr.plan_code} progress={pr} />
        ))}
      </ul>
    </Block>
  );
}

function DueForReview() {
  const { data: dueVerses } = useDueMemoryVerses();
  const { data: dueCatechism } = useDueCatechismMemory();
  const navigate = usePaneNavigate();
  const verses = dueVerses?.length ?? 0;
  const questions = dueCatechism?.length ?? 0;
  const count = verses + questions;
  if (count === 0) return null;
  const parts = [verses > 0 && `${verses} ${verses === 1 ? "verse" : "verses"}`, questions > 0 && `${questions} catechism ${questions === 1 ? "question" : "questions"}`].filter(Boolean);
  return (
    <Block id="today-review" title="Due for review">
      <div className={cx(cardClass, "flex flex-wrap items-center justify-between gap-3")}>
        <div className="flex items-center gap-2.5 text-sm text-ink-2">
          <Brain className="h-4 w-4 shrink-0 text-warn" aria-hidden="true" />
          <span>
            <span className="font-medium text-ink">{count} due today</span>
            <span className="text-ink-3"> · {parts.join(" and ")}</span>
          </span>
        </div>
        <Button variant="primary" onClick={(e) => navigate("/memory", e)} title="Open Memory (Ctrl+click for a new pane)">
          Practice
        </Button>
      </div>
    </Block>
  );
}

function PrayFor() {
  const { data: people } = usePrayerListPeople();
  const markPrayed = useMarkPrayerListPersonPrayed();
  const top = useMemo(() => longestUnprayed(people ?? []).slice(0, PRAY_FOR_LIMIT), [people]);
  if (top.length === 0) return null;
  return (
    <Block id="today-pray" title="Pray for">
      <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
        {top.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-medium text-ink">{p.name}</span>
                {p.category?.trim() && <span className="text-xs text-ink-4">{p.category}</span>}
              </div>
              <div className="text-xs text-ink-3">Last prayed for {timeAgo(p.last_prayed_at)}</div>
            </div>
            <Button
              size="sm"
              icon={HandHeart}
              disabled={markPrayed.isPending}
              onClick={() => markPrayed.mutate(p.id, { onSuccess: () => toast.success(`Logged a prayer for ${p.name}`) })}
              aria-label={`Prayed for ${p.name}`}
            >
              Prayed
            </Button>
          </li>
        ))}
      </ul>
    </Block>
  );
}

function Bookmarks() {
  const { data: bookmarks } = useBookmarks();
  const { data: books } = useBooks();
  if (!bookmarks || bookmarks.length === 0) return null;
  const shown = bookmarks.slice(0, BOOKMARK_LIMIT);
  return (
    <Block id="today-bookmarks" title="Bookmarks">
      <ul className="flex flex-wrap gap-2">
        {shown.map((b) => {
          const label = formatChapterRef(books, b.book_id, b.chapter, b.verse);
          const open = (e: React.MouseEvent) => openPassage({ bookId: b.book_id, chapter: b.chapter, verse: b.verse ?? undefined }, { target: targetFor(e) });
          return (
            <li key={b.id}>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1 text-sm text-ink-2 hover:border-line-2 hover:bg-hover hover:text-ink"
                title={`Open ${label} (Ctrl+click for a new pane)`}
                onClick={open}
                onAuxClick={(e) => e.button === 1 && open(e)}
                {...refAttrs({ book_id: b.book_id, chapter: b.chapter, verse_start: b.verse ?? 1, verse_end: b.verse ?? 999 })}
              >
                <BookmarkIcon className="h-3.5 w-3.5 text-ink-4" aria-hidden="true" />
                <span>{label}</span>
                {b.label && <span className="text-xs text-ink-3">· {b.label}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {bookmarks.length > shown.length && <p className="mt-1.5 text-xs text-ink-3">The bookmark button in the reading toolbar lists all {bookmarks.length}.</p>}
    </Block>
  );
}

function RecentChapters() {
  const { data: log } = useReadingLog(RECENT_LIMIT + 1);
  const { data: pos } = useReadingPosition();
  const { data: books } = useBooks();
  // The chapter Continue reading already offers is left out, so a fresh
  // install (whose Bible pane logs Genesis 1 the moment it opens) shows
  // only Continue reading, and no chapter is listed twice.
  const recent = (log ?? []).filter((e) => !(pos && e.book_id === pos.book_id && e.chapter === pos.chapter)).slice(0, RECENT_LIMIT);
  if (recent.length === 0) return null;
  return (
    <Block id="today-recent" title="Recent chapters">
      <ul className="flex flex-wrap gap-2">
        {recent.map((e) => {
          const label = formatChapterRef(books, e.book_id, e.chapter);
          const open = (ev: React.MouseEvent) => openPassage({ bookId: e.book_id, chapter: e.chapter }, { target: targetFor(ev) });
          return (
            <li key={`${e.book_id}:${e.chapter}`}>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1 text-sm text-ink-2 hover:border-line-2 hover:bg-hover hover:text-ink"
                title={`Read on ${e.date}. Open (Ctrl+click for a new pane)`}
                onClick={open}
                onAuxClick={(ev) => ev.button === 1 && open(ev)}
                {...refAttrs({ book_id: e.book_id, chapter: e.chapter, verse_start: 1, verse_end: 999 })}
              >
                <History className="h-3.5 w-3.5 text-ink-4" aria-hidden="true" />
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </Block>
  );
}

export function TodayView() {
  const lead = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  return (
    <Page title="Today" lead={lead}>
      <ContinueReading />
      <TodaysPlan />
      <DueForReview />
      <PrayFor />
      <Bookmarks />
      <RecentChapters />
    </Page>
  );
}
