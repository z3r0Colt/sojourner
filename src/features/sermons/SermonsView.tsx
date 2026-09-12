import { useMemo, useState } from "react";
import { Copy, Mic, MoreHorizontal, Plus, Presentation, Search, SquareArrowOutUpRight, Trash2 } from "lucide-react";
import {
  useBooks,
  useCreateSermon,
  useDeleteSermon,
  useDuplicateSermon,
  useRestoreSermon,
  useSermonSeries,
  useSermonTags,
  useSermons,
} from "../../api/queries";
import { Button, IconButton } from "../../components/ui/Button";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";
import { Page } from "../../components/ui/Page";
import { Popover, PopoverItem } from "../../components/ui/Popover";
import { confirmDelete } from "../../components/ui/confirm";
import { toast } from "../../components/ui/toast";
import { cx, inputSmClass, selectSmClass } from "../../components/ui/classes";
import { usePane } from "../../workspace/PaneContext";
import { openContent, targetFor } from "../../workspace/openContent";
import { PrepTrack } from "./PrepTrack";
import { SeriesSection } from "./SeriesView";
import { startRun } from "./preachingSession";
import {
  formatPreachDate,
  nextSunday,
  SERMON_STAGES,
  sermonTextLabel,
  STAGE_LABEL,
  STATUS_LABEL,
} from "./sermonFormat";
import { countWords, manuscriptText } from "./editor/documentModel";
import type { Sermon, SermonStage, SermonStatus } from "../../api/types";

/** Creates the row first and opens it, so there is never an unsaved
 * document waiting to be lost. Shared by the page, the palette, and Today. */
export function useNewSermon() {
  const create = useCreateSermon();
  return (opts: { from?: string; target?: "focused" | "new"; seriesId?: number | null } = {}) =>
    create.mutate(
      { title: "Untitled sermon", preach_date: nextSunday(), series_id: opts.seriesId ?? null },
      {
        onSuccess: (sermon) => {
          openContent("sermon", { id: sermon.id }, { target: opts.target ?? "focused", from: opts.from });
          toast.success("Sermon created");
        },
      },
    );
}

/** The Sermons page (SB5.1): every sermon with the text it preaches and how
 * far along it is, filtered, searched, and grouped the way a preacher
 * actually looks for one. */
export function SermonsView() {
  const { id: paneId } = usePane();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<SermonStatus | "">("");
  const [stage, setStage] = useState<SermonStage | "">("");
  const [seriesId, setSeriesId] = useState<number | "">("");
  const [bookId, setBookId] = useState<number | "">("");
  const [tag, setTag] = useState("");
  const [year, setYear] = useState<number | "">("");
  const [sort, setSort] = useState<"date" | "title" | "updated">("date");
  const [groupBySeries, setGroupBySeries] = useState(false);

  const { data: books } = useBooks();
  const { data: series } = useSermonSeries();
  const { data: tags } = useSermonTags();
  const { data: sermons, isLoading } = useSermons({
    query: query.trim() || null,
    status: status || null,
    stage: stage || null,
    series_id: seriesId === "" ? null : seriesId,
    book_id: bookId === "" ? null : bookId,
    tag: tag || null,
    year: year === "" ? null : year,
    sort,
  });
  const newSermon = useNewSermon();

  const filtering = Boolean(query.trim() || status || stage || seriesId !== "" || bookId !== "" || tag || year !== "");
  const years = useMemo(() => {
    const set = new Set<number>();
    for (const s of sermons ?? []) if (s.preach_date) set.add(Number(s.preach_date.slice(0, 4)));
    return [...set].sort((a, b) => b - a);
  }, [sermons]);
  const booksWithSermons = useMemo(() => {
    const ids = new Set<number>();
    for (const s of sermons ?? []) for (const p of s.passages) if (p.role === "text") ids.add(p.book_id);
    return (books ?? []).filter((b) => ids.has(b.id));
  }, [sermons, books]);

  const grouped = useMemo(() => {
    if (!groupBySeries) return null;
    const map = new Map<string, { title: string; sermons: Sermon[] }>();
    for (const sermon of sermons ?? []) {
      const key = sermon.series_id != null ? String(sermon.series_id) : "none";
      const title = sermon.series_title ?? "No series";
      const entry = map.get(key) ?? { title, sermons: [] };
      entry.sermons.push(sermon);
      map.set(key, entry);
    }
    for (const entry of map.values()) {
      entry.sermons.sort((a, b) => (a.series_order ?? 999) - (b.series_order ?? 999) || (a.preach_date ?? "").localeCompare(b.preach_date ?? ""));
    }
    return [...map.entries()].sort(([a], [b]) => (a === "none" ? 1 : b === "none" ? -1 : 0));
  }, [sermons, groupBySeries]);

  return (
    <Page
      title="Sermons"
      lead="Every sermon you are working on, with the text it preaches and how far along it is."
      actions={
        <Button variant="primary" icon={Plus} onClick={() => newSermon({ from: paneId })}>
          New sermon
        </Button>
      }
      wide
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-4" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles, big ideas, manuscripts, and reflections…"
            aria-label="Search sermons"
            className={cx(inputSmClass, "w-full pl-7")}
          />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value as SermonStatus | "")} aria-label="Status" className={selectSmClass}>
          <option value="">Every status</option>
          {(Object.keys(STATUS_LABEL) as SermonStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select value={stage} onChange={(e) => setStage(e.target.value as SermonStage | "")} aria-label="Stage" className={selectSmClass}>
          <option value="">Every stage</option>
          {SERMON_STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABEL[s]}
            </option>
          ))}
        </select>
        <select
          value={seriesId}
          onChange={(e) => setSeriesId(e.target.value === "" ? "" : Number(e.target.value))}
          aria-label="Series"
          className={selectSmClass}
        >
          <option value="">Every series</option>
          {series?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <select
          value={bookId}
          onChange={(e) => setBookId(e.target.value === "" ? "" : Number(e.target.value))}
          aria-label="Book"
          className={selectSmClass}
        >
          <option value="">Every book</option>
          {booksWithSermons.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        {(tags?.length ?? 0) > 0 && (
          <select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Tag" className={selectSmClass}>
            <option value="">Every tag</option>
            {tags?.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
        {years.length > 1 && (
          <select value={year} onChange={(e) => setYear(e.target.value === "" ? "" : Number(e.target.value))} aria-label="Year" className={selectSmClass}>
            <option value="">Every year</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        )}
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort" className={selectSmClass}>
          <option value="date">By date</option>
          <option value="title">By title</option>
          <option value="updated">Last edited</option>
        </select>
        <button
          type="button"
          onClick={() => setGroupBySeries((v) => !v)}
          aria-pressed={groupBySeries}
          className={cx("rounded-md px-2 py-1 text-sm", groupBySeries ? "bg-accent-soft text-accent" : "text-ink-3 hover:bg-hover hover:text-ink")}
        >
          Group by series
        </button>
      </div>

      {isLoading && <LoadingState />}
      {!isLoading && (sermons?.length ?? 0) === 0 && (
        <EmptyState
          icon={Mic}
          title={filtering ? "No sermon matches" : "No sermons yet"}
          description={
            filtering
              ? "Try fewer words, or clear the filters above."
              : "A sermon here is the study, gathered: its passages are live text in your translation, its citations reopen the commentary or confession they came from, it drives the panes beside it as you write, and once preached it can hand the congregation a reading plan for the series."
          }
          action={
            filtering ? undefined : (
              <Button variant="primary" icon={Plus} onClick={() => newSermon({ from: paneId })}>
                New sermon
              </Button>
            )
          }
        />
      )}

      {grouped
        ? grouped.map(([key, entry]) => (
            <section key={key} className="mb-6">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">{entry.title}</h2>
              <ul className="space-y-2">
                {entry.sermons.map((sermon) => (
                  <li key={sermon.id}>
                    <SermonCard sermon={sermon} books={books} paneId={paneId} />
                  </li>
                ))}
              </ul>
            </section>
          ))
        : (sermons?.length ?? 0) > 0 && (
            <ul className="space-y-2">
              {sermons?.map((sermon) => (
                <li key={sermon.id}>
                  <SermonCard sermon={sermon} books={books} paneId={paneId} />
                </li>
              ))}
            </ul>
          )}

      <SeriesSection paneId={paneId} />
    </Page>
  );
}

function SermonCard({ sermon, books, paneId }: { sermon: Sermon; books: ReturnType<typeof useBooks>["data"]; paneId: string }) {
  const duplicate = useDuplicateSermon();
  const remove = useDeleteSermon();
  const restore = useRestoreSermon();
  const text = sermonTextLabel(books, sermon);
  const words = countWords(manuscriptText(sermon.body));
  const preached = sermon.events.filter((e) => e.kind === "preaching").length;

  function open(e: React.MouseEvent) {
    openContent("sermon", { id: sermon.id }, { target: targetFor(e), from: paneId });
  }

  async function handleDelete() {
    if (!(await confirmDelete(`“${sermon.title}”`, "It goes to the Trash, where it can be restored for thirty days."))) return;
    remove.mutate(sermon.id, {
      onSuccess: () =>
        toast.info("Sermon moved to Trash", {
          label: "Undo",
          onClick: () => restore.mutate(sermon.id, { onSuccess: () => toast.success("Sermon restored") }),
        }),
    });
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <button type="button" onClick={open} onAuxClick={(e) => e.button === 1 && open(e)} className="text-sm font-medium text-ink hover:text-accent">
          {sermon.title}
        </button>
        {text && <span className="text-sm text-ink-2">{text}</span>}
        {sermon.series_title && (
          <span className="text-xs text-ink-3">
            {sermon.series_title}
            {sermon.series_order != null ? ` #${sermon.series_order + 1}` : ""}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <span className="text-xs text-ink-3">{formatPreachDate(sermon.preach_date, { month: "short", day: "numeric", year: "numeric" })}</span>
          <Popover
            width="w-56"
            trigger={({ toggle, open: isOpen }) => (
              <IconButton icon={MoreHorizontal} label={`Actions for “${sermon.title}”`} size="sm" active={isOpen} onClick={toggle} />
            )}
          >
            {(close) => (
              <>
                <PopoverItem
                  onClick={() => {
                    close();
                    openContent("sermon", { id: sermon.id }, { target: "focused", from: paneId });
                  }}
                >
                  <Mic className="h-4 w-4 text-ink-3" aria-hidden="true" /> Open
                </PopoverItem>
                <PopoverItem
                  onClick={() => {
                    close();
                    openContent("sermon", { id: sermon.id }, { target: "new", from: paneId });
                  }}
                >
                  <SquareArrowOutUpRight className="h-4 w-4 text-ink-3" aria-hidden="true" /> Open in a new pane
                </PopoverItem>
                <PopoverItem
                  onClick={() => {
                    close();
                    duplicate.mutate(sermon.id, { onSuccess: () => toast.success("Sermon duplicated") });
                  }}
                >
                  <Copy className="h-4 w-4 text-ink-3" aria-hidden="true" /> Duplicate
                </PopoverItem>
                <PopoverItem
                  onClick={() => {
                    close();
                    startRun(sermon.id, { kind: "preaching", fullScreen: true });
                  }}
                >
                  <Presentation className="h-4 w-4 text-ink-3" aria-hidden="true" /> Preach
                </PopoverItem>
                <div className="my-1 h-px bg-line" aria-hidden="true" />
                <PopoverItem
                  danger
                  onClick={() => {
                    close();
                    void handleDelete();
                  }}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete
                </PopoverItem>
              </>
            )}
          </Popover>
        </span>
      </div>
      {sermon.big_idea && <p className="mt-1 text-sm text-ink-3">{sermon.big_idea}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <PrepTrack stage={sermon.stage} readOnly compact />
        <span className="ml-auto text-xs text-ink-3">
          {STATUS_LABEL[sermon.status]}
          {preached > 0 && ` · preached ${preached === 1 ? "once" : preached === 2 ? "twice" : `${preached} times`}`}
          {words > 0 && ` · ${words.toLocaleString()} words`}
        </span>
      </div>
    </div>
  );
}
