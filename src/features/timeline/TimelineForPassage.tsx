import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarRange, Maximize2 } from "lucide-react";
import { api } from "../../api/client";
import type { Book, TimelineEvent } from "../../api/types";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";
import { usePane } from "../../workspace/PaneContext";
import { openContent, targetFor } from "../../workspace/openContent";
import { TimelineCanvas, type TimelineViewRange } from "./TimelineCanvas";
import { EventDetail, rangeAround, useTimeline } from "./TimelineView";
import { spanLabel } from "./timelineLayout";

/**
 * Where the open chapter falls: a slim strip of the timeline around its
 * years, the chapter marked as a band and the events it records in the
 * accent, with the eras either side -- and those events listed below.
 */
export function TimelineForPassage({ book, chapter }: { book: Book; chapter: number }) {
  const { id: paneId } = usePane();
  const { data: timeline, isLoading } = useTimeline();
  const { data: here } = useQuery({
    queryKey: ["timelineForPassage", book.id, chapter],
    queryFn: () => api.getTimelineForPassage(book.id, chapter),
  });
  const hereIds = useMemo(() => new Set(here?.event_ids ?? []), [here]);
  const events = useMemo(() => (timeline?.events ?? []).filter((e) => hereIds.has(e.id)), [timeline, hereIds]);

  // The chapter's own years if the source dates it, else its events'.
  const span = useMemo(() => {
    if (here?.start_year != null && here.end_year != null) return { start: here.start_year, end: here.end_year };
    if (events.length) return { start: Math.min(...events.map((e) => e.start_year)), end: Math.max(...events.map((e) => e.start_year)) };
    return null;
  }, [here, events]);

  const [range, setRange] = useState<TimelineViewRange | null>(null);
  const [selected, setSelected] = useState<TimelineEvent | null>(null);
  useEffect(() => {
    setRange(span ? rangeAround(span.start, span.end, 120) : null);
    setSelected(null);
  }, [span?.start, span?.end, book.id, chapter]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading || !here) return <LoadingState className="p-8" />;
  if (!timeline || !span || !range) {
    return (
      <EmptyState
        compact
        icon={CalendarRange}
        title={`${book.name} ${chapter} is not dated`}
        description="Psalms, the wisdom books and the letters are mostly left undated by the source the timeline follows. Open the full timeline to browse it."
        action={
          <button type="button" className="text-sm text-accent hover:underline" onClick={(e) => openContent("timeline", {}, { target: targetFor(e, "new"), from: paneId })}>
            Open the timeline
          </button>
        }
      />
    );
  }
  const era = timeline.eras.find((e) => e.start_year <= span.start && e.end_year > span.start);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-baseline gap-2 px-3 pb-1 pt-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-3">
          {book.name} {chapter} · {spanLabel(span.start, span.end === span.start ? span.start : span.end)}
          {era && ` · ${era.name}`}
        </h2>
        <button
          type="button"
          className="ml-auto inline-flex items-center gap-1 rounded px-1.5 text-xs text-ink-3 hover:bg-hover hover:text-ink"
          title="Open the full timeline here"
          onClick={(e) => openContent("timeline", { year: (span.start + span.end) / 2, eventId: selected?.id ?? events[0]?.id ?? null }, { target: targetFor(e, "new"), from: paneId })}
        >
          <Maximize2 className="h-3 w-3" aria-hidden="true" /> Full timeline
        </button>
      </div>
      <TimelineCanvas
        className="h-[200px] shrink-0 px-2"
        timeline={timeline}
        range={range}
        onRangeChange={setRange}
        selectedId={selected?.id ?? null}
        onSelect={setSelected}
        here={span}
        hereEventIds={hereIds}
        maxRows={6}
        onEraClick={(e) => setRange(rangeAround(e.start_year, e.end_year, 60))}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {selected ? (
          <EventDetail compact timeline={timeline} event={selected} onSelect={setSelected} />
        ) : events.length > 0 ? (
          <ul className="space-y-1 p-3">
            <li className="text-xs text-ink-3">This chapter records</li>
            {events.map((e) => (
              <li key={e.id}>
                <button type="button" className="w-full rounded-md px-2 py-1 text-left hover:bg-hover" onClick={() => setSelected(e)}>
                  <span className="text-sm text-ink">{e.title}</span>
                  <span className="ml-2 text-xs text-ink-3">{spanLabel(e.start_year, e.end_year)}</span>
                  {e.entities.length > 0 && (
                    <span className="block truncate text-xs text-ink-4">{e.entities.map((x) => x.name).join(", ")}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-3 text-sm text-ink-3">No event on the timeline is recorded in this chapter; the band marks its years.</p>
        )}
      </div>
    </div>
  );
}
