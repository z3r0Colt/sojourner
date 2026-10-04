import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, CalendarRange, Church, MapPin, Maximize2, Route, Search, Users } from "lucide-react";
import { api } from "../../api/client";
import { useAtlasJourneys, useBooks } from "../../api/queries";
import type { Book, Timeline, TimelineEra, TimelineEvent } from "../../api/types";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";
import { formatChapterRef } from "../../lib/passage";
import { usePane, usePaneParams } from "../../workspace/PaneContext";
import { useCompact } from "../../hooks/useCompact";
import { cx } from "../../components/ui/classes";
import { openContent, openPassage, targetFor } from "../../workspace/openContent";
import { ChurchEventDetail } from "./ChurchEventDetail";
import { ChurchMarksKey } from "./ChurchMarksKey";
import {
  BIBLE_RANGE,
  bibleEraOf,
  bibleOnly,
  churchFrame,
  churchJumpLabel,
  eraAt,
  eraFrame,
  erasByTrack,
  eventDateLabel,
  isChurchEvent,
  lineOf,
  rangeAfterChurchToggle,
  wholeFrame,
  withChurchHistory,
} from "./churchHistory";
import { TimelineCanvas } from "./TimelineCanvas";
import { durationLabel, spanLabel } from "./timelineLayout";
import { useTimelinePrefs } from "./timelinePrefs";
import { clampRange, type TimelineViewRange } from "./timelineRange";
import { openFromTimeline } from "./timelineLinks";
import { keepTimelineView, keptTimelineView } from "./timelineViewMemory";

export function useTimeline() {
  return useQuery({ queryKey: ["timeline"], queryFn: api.getTimeline, staleTime: Infinity });
}

/** A range that shows an event with room either side, kept within `line`
 * (the canvas's, `lineOf` the timeline it is drawing) when one is given. */
export function rangeAround(start: number, end: number, minSpan = 60, line?: TimelineViewRange): TimelineViewRange {
  const span = Math.max(minSpan, (end - start) * 2.2);
  const mid = (start + end) / 2;
  return clampRange({ start: mid - span / 2, end: mid + span / 2 }, line);
}

/** The line runs to today, whatever year the content was built in. */
const PRESENT_YEAR = new Date().getFullYear();

/**
 * The full timeline: the line itself, a search over its events, and the
 * selected event below. Church history -- the apostles to the present, each
 * event dated from a source it quotes -- runs on after the Bible's events
 * unless the reader turns it off, which is remembered for every timeline.
 */
export function TimelineView() {
  const { id: paneId } = usePane();
  const [params, setParams] = usePaneParams("timeline");
  const { data: allOfIt, isLoading } = useTimeline();
  const showChurch = useTimelinePrefs((s) => s.showChurchHistory);
  const setShowChurch = useTimelinePrefs((s) => s.setShowChurchHistory);
  // What the line shows: church events and eras are left out here, before
  // the canvas, the search and the era menu ever see them.
  const timeline = useMemo(() => (allOfIt ? withChurchHistory(allOfIt, showChurch) : undefined), [allOfIt, showChurch]);
  const hasChurchHistory = useMemo(() => !!allOfIt?.events.some(isChurchEvent), [allOfIt]);
  const churchShown = hasChurchHistory && showChurch;
  // The line the canvas draws along and holds every drag and wheel to: to
  // today with church history, to a little after Acts without it. Every jump
  // below is kept within it too, so none lands somewhere the first drag would
  // snap away from. `bibleLine` is the line without church history, where
  // the view has to fit the moment it is switched off.
  const line = useMemo(() => (timeline ? lineOf(timeline) : undefined), [timeline]);
  const bibleLine = useMemo(() => (allOfIt ? lineOf(bibleOnly(allOfIt)) : undefined), [allOfIt]);
  const fit = useCallback((r: TimelineViewRange) => clampRange(r, line), [line]);
  // Where this pane was, when the workspace has only rebuilt it around a pane
  // opened beside it (timelineViewMemory); else around the year it was
  // opened on. Null until the reader moves: then it opens on everything
  // showing, and follows the toggle, without having to wait for the data to
  // know how far "everything" runs.
  const [chosenRange, setRange] = useState<TimelineViewRange | null>(
    () => keptTimelineView(paneId, params) ?? (params.year != null ? rangeAround(params.year, params.year, 200) : null),
  );
  useEffect(() => {
    keepTimelineView(paneId, { eventId: params.eventId, year: params.year }, chosenRange);
  }, [paneId, params.eventId, params.year, chosenRange]);
  const range = useMemo(() => chosenRange ?? fit(timeline ? wholeFrame(timeline, PRESENT_YEAR) : BIBLE_RANGE), [chosenRange, timeline, fit]);
  const selected = useMemo(() => timeline?.events.find((e) => e.id === params.eventId) ?? null, [timeline, params.eventId]);

  // Opened on an event with no view of its own -- a link to it, a restored
  // workspace, a reload -- the event is framed once it is found, rather than
  // left a speck somewhere in the whole line.
  const openedOn = useRef(chosenRange == null ? params.eventId : null);
  // Selected from outside the view (a link, "part of", church history turned
  // back on under a church event): bring it into view once. One selected by
  // a click is in view already and stays where it was clicked. With nothing
  // selected -- or the selection hidden, church history turned off under it
  // -- the next one is brought into view afresh, even if it is the same.
  const [centeredOn, setCenteredOn] = useState<number | null>(null);
  useEffect(() => {
    if (!selected) {
      if (centeredOn != null) setCenteredOn(null);
      return;
    }
    if (centeredOn === selected.id) return;
    setCenteredOn(selected.id);
    const opening = openedOn.current === selected.id;
    openedOn.current = null;
    if (opening || selected.end_year < range.start || selected.start_year > range.end) setRange(rangeAround(selected.start_year, selected.end_year, 60, line));
  }, [selected, centeredOn, range, line]);

  // Church history switched, here or in another timeline pane (the toggle is
  // one preference for them all): off, the line shrinks back to the Bible's,
  // so the view is brought within it as a drag would bring it, keeping the
  // reader's zoom where it can. A view that is still the opening one needs
  // nothing, as it is worked out afresh from what is showing.
  const [fittedTo, setFittedTo] = useState(showChurch);
  useEffect(() => {
    if (fittedTo === showChurch) return;
    setFittedTo(showChurch);
    if (bibleLine) setRange((r) => (r ? rangeAfterChurchToggle(r, showChurch, bibleLine) : r));
  }, [showChurch, fittedTo, bibleLine]);

  const select = useCallback((e: TimelineEvent | null) => setParams({ eventId: e?.id ?? null }), [setParams]);
  const compact = useCompact();

  if (isLoading) return <LoadingState className="p-8" />;
  if (!timeline || !allOfIt || allOfIt.events.length === 0) {
    return <EmptyState icon={CalendarRange} title="The timeline is missing" description="Reinstalling Sojourner restores it. Your notes are not affected." />;
  }
  // The canvas takes what the toolbar and the detail leave, down to a height
  // that still shows a few rows; the detail gives way before it does. In a
  // pane too short even for that (a small tab, with the toolbar wrapped to
  // four lines), the view scrolls rather than running off the pane's foot.
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <TimelineToolbar
        timeline={timeline}
        range={range}
        onRange={setRange}
        onPick={(e) => {
          select(e);
          setRange(rangeAround(e.start_year, e.end_year, 60, line));
        }}
        fit={fit}
        hasChurchHistory={hasChurchHistory}
        showChurch={showChurch}
        onShowChurch={setShowChurch}
      />
      <TimelineCanvas
        className="min-h-[140px] flex-1"
        timeline={timeline}
        range={range}
        onRangeChange={setRange}
        selectedId={params.eventId}
        onSelect={select}
        onEraClick={(era) => setRange(fit(eraFrame(era)))}
      />
      {/* On a phone the detail keeps one height whatever is in it: sized to
          its content, it took more of the screen with each event tapped, and
          the canvas above, shrinking, packed its rows afresh under the
          finger. */}
      <div className={cx("overflow-y-auto border-t border-line", compact ? "h-[42%] shrink-0" : "max-h-[45%] min-h-[72px]")}>
        {selected ? (
          <EventDetail timeline={timeline} event={selected} onSelect={(e) => { select(e); setRange(rangeAround(e.start_year, e.end_year, 60, line)); }} />
        ) : (
          <div className="space-y-2 p-4">
            <p className="text-sm text-ink-3">
              {compact ? "Tap" : "Click"} an event for its verses, people and places{churchShown && ", or a church event for the source that dates it"}.{" "}
              {compact ? "Tap" : "Click"} an era to fit it. {compact ? "Pinch to zoom, drag to move." : "Wheel to zoom, drag to move."} Biblical dates are approximate, following
              Ussher's traditional chronology.
            </p>
            {churchShown && <ChurchMarksKey />}
          </div>
        )}
      </div>
    </div>
  );
}

const jumpClass = "inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-ink-2 hover:bg-hover";

function TimelineToolbar({
  timeline,
  range,
  onRange,
  onPick,
  fit,
  hasChurchHistory,
  showChurch,
  onShowChurch,
}: {
  timeline: Timeline;
  range: TimelineViewRange;
  onRange: (r: TimelineViewRange) => void;
  onPick: (e: TimelineEvent) => void;
  /** A frame brought within the line the canvas is drawing. */
  fit: (r: TimelineViewRange) => TimelineViewRange;
  /** Whether this build has any church history to toggle. */
  hasChurchHistory: boolean;
  showChurch: boolean;
  onShowChurch: (on: boolean) => void;
}) {
  const { width: paneWidth } = usePane();
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return timeline.events
      .filter((e) => e.title.toLowerCase().includes(q) || e.entities.some((x) => x.name.toLowerCase() === q))
      .slice(0, 10);
  }, [timeline, query]);
  const era = eraAt(timeline.eras, (range.start + range.end) / 2);
  const tracks = erasByTrack(timeline.eras);
  const church = churchFrame(timeline, PRESENT_YEAR);
  const churchLabel = churchJumpLabel(timeline);
  const eraOption = (e: TimelineEra) => (
    <option key={e.slug} value={e.slug}>
      {e.name} ({spanLabel(e.start_year, e.end_year)})
    </option>
  );
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
          // As wide as a title and a long date want, within the pane (it
          // starts at the toolbar's padding, and the pane clips what runs past).
          <ul
            className="absolute left-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-line bg-surface shadow-lg"
            style={{ width: paneWidth > 0 ? Math.max(224, Math.min(384, paneWidth - 24)) : 384 }}
          >
            {matches.map((e) => (
              <li key={e.id}>
                {/* The title whole, and the date beside it where both fit on
                    a line -- else under it: a church event's date can run to
                    "21 September AD 1522 – 1534". */}
                <button
                  type="button"
                  className="flex w-full flex-wrap items-baseline justify-between gap-x-3 px-3 py-1.5 text-left text-sm hover:bg-hover"
                  onClick={() => {
                    onPick(e);
                    setQuery("");
                  }}
                >
                  <span className="min-w-0 text-ink">{e.title}</span>
                  <span className="ml-auto whitespace-nowrap text-xs text-ink-3">{eventDateLabel(e)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <select
        aria-label="Go to an era"
        className="min-w-0 max-w-full rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink"
        value={era?.slug ?? ""}
        onChange={(e) => {
          const target = timeline.eras.find((x) => x.slug === e.target.value);
          if (target) onRange(fit(eraFrame(target)));
        }}
      >
        <option value="" disabled>
          Era…
        </option>
        {tracks.church.length > 0 ? (
          <>
            <optgroup label="The Bible">{tracks.bible.map(eraOption)}</optgroup>
            <optgroup label="Church history">{tracks.church.map(eraOption)}</optgroup>
          </>
        ) : (
          timeline.eras.map(eraOption)
        )}
      </select>
      <button
        type="button"
        className={jumpClass}
        onClick={() => onRange(fit(wholeFrame(timeline, PRESENT_YEAR)))}
        title={church ? "Show the whole timeline, Creation to the present" : "Show the whole timeline"}
      >
        <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" /> All
      </button>
      {church && (
        <>
          <button type="button" className={jumpClass} onClick={() => onRange(fit(BIBLE_RANGE))} title="Frame the Bible's years, Creation to Acts">
            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" /> Bible
          </button>
          <button type="button" className={jumpClass} onClick={() => onRange(fit(church))} title="Frame church history, the apostles to the present">
            <Church className="h-3.5 w-3.5" aria-hidden="true" /> {churchLabel ?? "Church history"}
          </button>
        </>
      )}
      {hasChurchHistory && (
        <label className="flex items-center gap-1.5 text-sm text-ink-2" title="Church history from the apostles to the present, each date from a source it quotes">
          <input type="checkbox" className="h-3.5 w-3.5 accent-accent" checked={showChurch} onChange={(e) => onShowChurch(e.target.checked)} />
          Church history
        </label>
      )}
      <span className="ml-auto text-xs text-ink-4">{spanLabel(range.start, range.end)}</span>
    </div>
  );
}

function refLabel(books: Book[] | undefined, b: number, c: number, v: number) {
  return formatChapterRef(books, b, c, v);
}

/** The selected event. A church event has no verses, people or places to
 * show; what it has instead is its source, so it gets a detail of its own
 * (and asks nothing of the verse query it would never use). */
export function EventDetail({ timeline, event, onSelect, compact }: { timeline: Timeline; event: TimelineEvent; onSelect: (e: TimelineEvent) => void; compact?: boolean }) {
  return isChurchEvent(event) ? (
    <ChurchEventDetail timeline={timeline} event={event} compact={compact} />
  ) : (
    <BibleEventDetail timeline={timeline} event={event} onSelect={onSelect} compact={compact} />
  );
}

function BibleEventDetail({ timeline, event, onSelect, compact }: { timeline: Timeline; event: TimelineEvent; onSelect: (e: TimelineEvent) => void; compact?: boolean }) {
  const { id: paneId } = usePane();
  const { data: books } = useBooks();
  const { data: journeys } = useAtlasJourneys();
  const { data: verses } = useQuery({ queryKey: ["timelineVerses", event.id], queryFn: () => api.getTimelineEventVerses(event.id) });
  const parent = event.parent_id != null ? timeline.events.find((e) => e.id === event.parent_id) : null;
  const children = timeline.events.filter((e) => e.parent_id === event.id);
  const era: TimelineEra | undefined = bibleEraOf(event, timeline.eras);
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
              onClick={(e) => openFromTimeline(() => openPassage({ bookId: b, chapter: c, verse: v }, { target: targetFor(e, "focused"), from: paneId }))}
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
              onClick={(e) => openFromTimeline(() => openContent("factbook", { id: p.id }, { target: targetFor(e, "new"), from: paneId }))}
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
                openFromTimeline(() =>
                  p.atlas_slug
                    ? openContent("atlas", { slug: p.atlas_slug }, { target: targetFor(e, "new"), from: paneId })
                    : openContent("factbook", { id: p.id }, { target: targetFor(e, "new"), from: paneId }),
                )
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
              onClick={(e) => openFromTimeline(() => openContent("atlas", { journey: j.slug }, { target: targetFor(e, "new"), from: paneId }))}
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
