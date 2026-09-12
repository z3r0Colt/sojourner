import { useMemo } from "react";
import { BarChart3 } from "lucide-react";
import { useBooks, useStats } from "../../../api/queries";
import type { Stats } from "../../../api/types";
import { EmptyState, LoadingState } from "../../../components/ui/EmptyState";
import { cx } from "../../../components/ui/classes";
import { localToday, parseLocalDate } from "../../plans/planSchedule";
import { hasStudyData } from "../backupReminder";

/**
 * Settings → Data & backups → Stats (F3.5): notes and highlights per book
 * as a compact bar list, a reading-day heatmap for the past year drawn as
 * a CSS grid, and totals for prayer, memory, and reading. One `get_stats`
 * call feeds all of it.
 */

const WEEKS = 53;
const DAY_MS = 86_400_000;

/** The heatmap's cells: 53 columns of 7 days ending today, Sunday on top.
 * A cell before the log's window is null so the grid stays rectangular. */
function buildHeatmap(days: Stats["reading_days"], todayIso: string): { cells: ({ date: string; chapters: number } | null)[]; monthLabels: { col: number; label: string }[] } {
  const byDate = new Map(days.map((d) => [d.date, d.chapters]));
  const today = parseLocalDate(todayIso) ?? new Date();
  // The grid's last column ends on the Saturday of the current week, so
  // today's cell sits in its weekday row and later days are empty.
  const end = new Date(today);
  end.setDate(end.getDate() + (6 - end.getDay()));
  const start = new Date(end);
  start.setDate(start.getDate() - WEEKS * 7 + 1);
  const cells: ({ date: string; chapters: number } | null)[] = [];
  const monthLabels: { col: number; label: string }[] = [];
  let lastMonth = -1;
  for (let i = 0; i < WEEKS * 7; i++) {
    const d = new Date(start.getTime() + i * DAY_MS);
    const pad = (n: number) => String(n).padStart(2, "0");
    const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (d > today) {
      cells.push(null);
      continue;
    }
    cells.push({ date: iso, chapters: byDate.get(iso) ?? 0 });
    const col = Math.floor(i / 7);
    if (d.getDay() === 0 && d.getMonth() !== lastMonth) {
      lastMonth = d.getMonth();
      monthLabels.push({ col, label: d.toLocaleDateString(undefined, { month: "short" }) });
    }
  }
  // A month label crammed against the left edge is unreadable; drop it.
  if (monthLabels.length > 1 && monthLabels[1].col - monthLabels[0].col < 2) monthLabels.shift();
  return { cells, monthLabels };
}

/** 0 for none, 1 to 4 by how much was read that day. */
function level(chapters: number): number {
  if (chapters <= 0) return 0;
  if (chapters === 1) return 1;
  if (chapters <= 3) return 2;
  if (chapters <= 6) return 3;
  return 4;
}

function Heatmap({ stats }: { stats: Stats }) {
  const todayIso = localToday();
  const { cells, monthLabels } = useMemo(() => buildHeatmap(stats.reading_days, todayIso), [stats.reading_days, todayIso]);
  const daysInWindow = stats.reading_days.length;
  const chaptersInWindow = stats.reading_days.reduce((n, d) => n + d.chapters, 0);
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-xs text-ink-3">
        <span>
          {daysInWindow === 0
            ? "No reading days in the past year yet"
            : `${daysInWindow} reading ${daysInWindow === 1 ? "day" : "days"} in the past year · ${chaptersInWindow} ${chaptersInWindow === 1 ? "chapter" : "chapters"}`}
        </span>
        <span className="flex items-center gap-1" aria-hidden="true">
          Less
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} className="heat-cell inline-block h-2.5 w-2.5 rounded-[2px]" data-level={l} />
          ))}
          More
        </span>
      </div>
      <div className="overflow-x-auto">
        <div className="relative pt-4" style={{ width: `${WEEKS * 13}px` }}>
          {monthLabels.map((m) => (
            <span key={`${m.label}-${m.col}`} className="absolute top-0 text-[10px] leading-none text-ink-3" style={{ left: `${m.col * 13}px` }} aria-hidden="true">
              {m.label}
            </span>
          ))}
          <div
            role="img"
            aria-label={daysInWindow === 0 ? "Reading heatmap: no reading days in the past year" : `Reading heatmap: ${daysInWindow} reading days in the past year`}
            className="grid gap-[3px]"
            style={{ gridTemplateColumns: `repeat(${WEEKS}, 10px)`, gridTemplateRows: "repeat(7, 10px)", gridAutoFlow: "column" }}
          >
            {cells.map((c, i) =>
              c ? (
                <span
                  key={c.date}
                  className={cx("heat-cell rounded-[2px]", c.date === todayIso && "ring-1 ring-ink-3")}
                  data-level={level(c.chapters)}
                  title={`${new Date(parseLocalDate(c.date) ?? c.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}: ${
                    c.chapters === 0 ? "nothing read" : `${c.chapters} ${c.chapters === 1 ? "chapter" : "chapters"}`
                  }`}
                />
              ) : (
                <span key={`empty-${i}`} aria-hidden="true" />
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Notes and highlights per book: two thin bars per row, scaled to the
 * busiest book so the list reads at a glance. */
function BookBars({ stats }: { stats: Stats }) {
  const { data: books } = useBooks();
  const name = (id: number) => books?.find((b) => b.id === id)?.name ?? `Book ${id}`;
  const max = Math.max(1, ...stats.books.map((b) => Math.max(b.notes, b.highlights)));
  if (stats.books.length === 0) return <p className="text-sm text-ink-3">No notes or highlights yet. They will be counted here by book.</p>;
  return (
    <ul className="space-y-1.5">
      {stats.books.map((b) => (
        <li key={b.book_id} className="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-3 text-sm">
          <span className="truncate text-ink-2" title={name(b.book_id)}>
            {name(b.book_id)}
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="flex items-center gap-2" title={`${b.notes} ${b.notes === 1 ? "note" : "notes"}`}>
              <span className="h-2 rounded-sm bg-accent" style={{ width: `${Math.max(2, (b.notes / max) * 100)}%` }} aria-hidden="true" />
              <span className="w-8 shrink-0 text-xs tabular-nums text-ink-3">
                <span className="sr-only">notes </span>
                {b.notes}
              </span>
            </span>
            <span className="flex items-center gap-2" title={`${b.highlights} ${b.highlights === 1 ? "highlight" : "highlights"}`}>
              <span className="h-2 rounded-sm bg-warn" style={{ width: `${Math.max(2, (b.highlights / max) * 100)}%` }} aria-hidden="true" />
              <span className="w-8 shrink-0 text-xs tabular-nums text-ink-3">
                <span className="sr-only">highlights </span>
                {b.highlights}
              </span>
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Total({ value, label, hint }: { value: number; label: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2">
      <div className="text-lg font-semibold tabular-nums text-ink">{value}</div>
      <div className="text-xs text-ink-3">
        {label}
        {hint && <span className="block">{hint}</span>}
      </div>
    </div>
  );
}

export function StatsSection() {
  const { data: stats, isLoading } = useStats();
  return (
    <section className="mt-8" aria-labelledby="stats-heading">
      <h3 id="stats-heading" className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">
        Stats
      </h3>
      {isLoading && <LoadingState label="Counting…" />}
      {stats && !hasStudyData(stats) && (
        <EmptyState
          icon={BarChart3}
          compact
          title="Nothing to count yet"
          description="Once you read, highlight, take notes, pray, or memorize, this block shows your notes and highlights by book, the days you read, and your totals."
        />
      )}
      {stats && hasStudyData(stats) && (
        <div className="space-y-5">
          <div className="rounded-lg border border-line bg-surface p-3">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-ink">Notes and highlights by book</span>
              <span className="flex items-center gap-3 text-xs text-ink-3">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-3 rounded-sm bg-accent" aria-hidden="true" /> Notes
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-3 rounded-sm bg-warn" aria-hidden="true" /> Highlights
                </span>
              </span>
            </div>
            <BookBars stats={stats} />
          </div>
          <div className="rounded-lg border border-line bg-surface p-3">
            <div className="mb-2 text-sm font-medium text-ink">Days you read</div>
            <Heatmap stats={stats} />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Total value={stats.chapters_read_total} label="Chapters read" hint={`over ${stats.reading_days_total} ${stats.reading_days_total === 1 ? "day" : "days"}`} />
            <Total value={stats.prayer_entries} label="Prayers logged" hint={`${stats.prayer_people} on the prayer list`} />
            <Total value={stats.memory_verses_learned} label="Verses memorized" hint={`of ${stats.memory_verses_total} being learned`} />
            <Total value={stats.catechism_learned} label="Catechism answers memorized" hint={`of ${stats.catechism_total} being learned`} />
          </div>
        </div>
      )}
    </section>
  );
}
