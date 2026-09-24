import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarRange, MapPin, Maximize2, Route, Search, Users } from "lucide-react";
import { api } from "../../api/client";
import { useAtlasJourneys, useBooks } from "../../api/queries";
import type { Book, Timeline, TimelineEra, TimelineEvent } from "../../api/types";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";
import { formatChapterRef } from "../../lib/passage";
import { usePane, usePaneParams } from "../../workspace/PaneContext";
import { openContent, openPassage, targetFor } from "../../workspace/openContent";
import { FULL_RANGE, TimelineCanvas, clampRange, type TimelineViewRange } from "./TimelineCanvas";
import { durationLabel, spanLabel } from "./timelineLayout";

export function useTimeline() {
  return useQuery({ queryKey: ["timeline"], queryFn: api.getTimeline, staleTime: Infinity });
}

/** A range that shows an event with room either side. */
export function rangeAround(start: number, end: number, minSpan = 60): TimelineViewRange {
  const span = Math.max(minSpan, (end - start) * 2.2);
  const mid = (start + end) / 2;
  return clampRange({ start: mid - span / 2, end: mid + span / 2 });
}

/** The full timeline: the line itself, a search over its events, and the selected event below. */
export function TimelineView() {
  const [params, setParams] = usePaneParams("timeline");
  const { data: timeline, isLoading } = useTimeline();
  const [range, setRange] = useState<TimelineViewRange>(() =>
    params.year != null ? rangeAround(params.year, params.year, 200) : FULL_RANGE,
  );
  const selected = useMemo(() => timeline?.events.find((e) => e.id === params.eventId) ?? null, [timeline, params.eventId]);

  // Opened on an event (from a passage, or a link): bring it into view once.
  const [centeredOn, setCenteredOn] = useState<number | null>(null);
  useEffect(() => {
    if (selected && centeredOn !== selected.id) {
      setCenteredOn(selected.id);
      if (selected.end_year < range.start || selected.start_year > range.end) setRange(rangeAround(selected.start_year, selected.end_year));
    }
  }, [selected, centeredOn, range]);

  const select = useCallback((e: TimelineEvent | null) => setParams({ eventId: e?.id ?? null }), [setParams]);

  if (isLoading) return <LoadingState className="p-8" />;
  if (!timeline || timeline.events.length === 0) {
    return <EmptyState icon={CalendarRange} title="No timeline in this build" description="The timeline is built into the app's content; rebuild content to add it." />;
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <TimelineToolbar
        timeline={timeline}
        range={range}
        onRange={setRange}
        onPick={(e) => {
          select(e);
          setRange(rangeAround(e.start_year, e.end_year));
        }}
      />
      <TimelineCanvas
        className="min-h-[220px] flex-1"
        timeline={timeline}
        range={range}
        onRangeChange={setRange}
        selectedId={params.eventId}
        onSelect={select}
        onEraClick={(era) => setRange(clampRange({ start: era.start_year - (era.end_year - era.start_year) * 0.05, end: era.end_year + (era.end_year - era.start_year) * 0.05 }))}
      />
      <div className="max-h-[45%] min-h-[96px] shrink-0 overflow-y-auto border-t border-line">
        {selected ? (
          <EventDetail timeline={timeline} event={selected} onSelect={(e) => { select(e); setRange(rangeAround(e.start_year, e.end_year)); }} />
        ) : (
          <p className="p-4 text-sm text-ink-3">
            Click an event for its verses, people and places. Click an era to fit it. Wheel to zoom, drag to move. Dates are approximate, as the
            Theographic Bible Metadata gives them: a traditional chronology, Ussher's for the early ages.
          </p>
        )}
      </div>
    </div>
  );
}

function TimelineToolbar({
  timeline,
  range,
  onRange,
  onPick,
}: {
  timeline: Timeline;
  range: TimelineViewRange;
  onRange: (r: TimelineViewRange) => void;
  onPick: (e: TimelineEvent) => void;
}) {
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return timeline.events
      .filter((e) => e.title.toLowerCase().includes(q) || e.entities.some((x) => x.name.toLowerCase() === q))
      .slice(0, 10);
  }, [timeline, query]);
  const era = timeline.eras.find((e) => e.start_year <= (range.start + range.end) / 2 && e.end_year > (range.start + range.end) / 2);
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-4" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find an event or a name"
          aria-label="Find an event or a name"
          className="w-56 rounded-md border border-line bg-surface py-1 pl-7 pr-2 text-sm text-ink placeholder:text-ink-4"
          onKeyDown={(e) => {
            if (e.key === "Enter" && matches[0]) {
              onPick(matches[0]);
              setQuery("");
            }
          }}
        />
        {matches.length > 0 && (
          <ul className="absolute left-0 top-full z-20 mt-1 w-80 overflow-hidden rounded-md border border-line bg-surface shadow-lg">
            {matches.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  className="flex w-full items-baseline justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-hover"
                  onClick={() => {
                    onPick(e);
                    setQuery("");
                  }}
                >
                  <span className="truncate text-ink">{e.title}</span>
                  <span className="shrink-0 text-xs text-ink-3">{spanLabel(e.start_year, e.end_year)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <select
        aria-label="Go to an era"
        className="rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink"
        value={era?.slug ?? ""}
        onChange={(e) => {
          const target = timeline.eras.find((x) => x.slug === e.target.value);
          if (target) onRange(clampRange({ start: target.start_year - (target.end_year - target.start_year) * 0.05, end: target.end_year + (target.end_year - target.start_year) * 0.05 }));
        }}
      >
        <option value="" disabled>
          Era…
        </option>
        {timeline.eras.map((e) => (
          <option key={e.slug} value={e.slug}>
            {e.name} ({spanLabel(e.start_year, e.end_year)})
          </option>
        ))}
      </select>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-ink-2 hover:bg-hover"
        onClick={() => onRange(FULL_RANGE)}
        title="Show the whole timeline"
      >
        <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" /> All
      </button>
      <span className="ml-auto text-xs text-ink-4">{spanLabel(range.start, range.end)}</span>
    </div>
  );
}

function refLabel(books: Book[] | undefined, b: number, c: number, v: number) {
  return formatChapterRef(books, b, c, v);
}

export function EventDetail({ timeline, event, onSelect, compact }: { timeline: Timeline; event: TimelineEvent; onSelect: (e: TimelineEvent) => void; compact?: boolean }) {
  const { id: paneId } = usePane();
  const { data: books } = useBooks();
  const { data: journeys } = useAtlasJourneys();
  const { data: verses } = useQuery({ queryKey: ["timelineVerses", event.id], queryFn: () => api.getTimelineEventVerses(event.id) });
  const parent = event.parent_id != null ? timeline.events.find((e) => e.id === event.parent_id) : null;
  const children = timeline.events.filter((e) => e.parent_id === event.id);
  const era: TimelineEra | undefined = timeline.eras.find((e) => e.start_year <= event.start_year && e.end_year > event.start_year);
  const eraJourneys = (journeys ?? []).filter((j) => era?.journey_era && j.era === era.journey_era);
  const people = event.entities.filter((e) => e.role === "person");
  const places = event.entities.filter((e) => e.role === "place");
  const duration = durationLabel(event.start_year, event.end_year);
  const first = event.book_id != null && event.chapter != null ? { bookId: event.book_id, chapter: event.chapter, verse: event.verse ?? undefined } : null;

  return (
    <div className={compact ? "space-y-2 p-3" : "space-y-3 p-4"}>
      <div>
        <h3 className="text-base font-semibold text-ink">{event.title}</h3>
        <p className="text-sm text-ink-3">
          {spanLabel(event.start_year, event.end_year)}
          {duration && ` · ${duration}`}
          {era && ` · ${era.name}`}
          {parent && (
            <>
              {" · part of "}
              <button type="button" className="text-accent hover:underline" onClick={() => onSelect(parent)}>
                {parent.title}
              </button>
            </>
          )}
        </p>
      </div>
      {first && (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
          <span className="text-ink-3">Recorded in</span>
          {(verses ?? [[first.bookId, first.chapter, first.verse ?? 1]]).slice(0, compact ? 4 : 12).map(([b, c, v], i) => (
            <button
              key={i}
              type="button"
              className="text-accent hover:underline"
              onClick={(e) => openPassage({ bookId: b, chapter: c, verse: v }, { target: targetFor(e, "focused"), from: paneId })}
            >
              {refLabel(books, b, c, v)}
            </button>
          ))}
          {verses && verses.length > (compact ? 4 : 12) && <span className="text-xs text-ink-4">and {verses.length - (compact ? 4 : 12)} more verses</span>}
        </div>
      )}
      {people.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <Users className="h-3.5 w-3.5 text-ink-4" aria-label="People" />
          {people.map((p) => (
            <button
              key={p.id}
              type="button"
              className="rounded-full bg-surface-2 px-2 py-0.5 text-ink-2 hover:bg-hover hover:text-ink"
              onClick={(e) => openContent("factbook", { id: p.id }, { target: targetFor(e, "new"), from: paneId })}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
      {places.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <MapPin className="h-3.5 w-3.5 text-ink-4" aria-label="Places" />
          {places.map((p) => (
            <button
              key={p.id}
              type="button"
              className="rounded-full bg-surface-2 px-2 py-0.5 text-ink-2 hover:bg-hover hover:text-ink"
              title={p.atlas_slug ? "Open in the atlas" : "Open in the Factbook"}
              onClick={(e) =>
                p.atlas_slug
                  ? openContent("atlas", { slug: p.atlas_slug }, { target: targetFor(e, "new"), from: paneId })
                  : openContent("factbook", { id: p.id }, { target: targetFor(e, "new"), from: paneId })
              }
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
      {!compact && children.length > 0 && (
        <div className="text-sm">
          <span className="text-ink-3">Within it: </span>
          {children.slice(0, 40).map((c, i) => (
            <span key={c.id}>
              {i > 0 && ", "}
              <button type="button" className="text-accent hover:underline" onClick={() => onSelect(c)}>
                {c.title}
              </button>
            </span>
          ))}
        </div>
      )}
      {!compact && eraJourneys.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <Route className="h-3.5 w-3.5 text-ink-4" aria-label="Journeys" />
          {eraJourneys.map((j) => (
            <button
              key={j.slug}
              type="button"
              className="text-accent hover:underline"
              onClick={(e) => openContent("atlas", { journey: j.slug }, { target: targetFor(e, "new"), from: paneId })}
            >
              {j.title}
            </button>
          ))}
        </div>
      )}
      {event.note && !compact && <p className="text-sm text-ink-3">{event.note}</p>}
      <p className="text-xs text-ink-4">
        {event.source === "added"
          ? "Added by Sojourner, dated by the Theographic Bible Metadata's year for the verse that records it."
          : "From the Theographic Bible Metadata (CC BY-SA 4.0). Dates approximate."}
      </p>
    </div>
  );
}
