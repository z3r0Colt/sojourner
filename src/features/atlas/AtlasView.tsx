import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowLeft, MapPin, Route, Search } from "lucide-react";
import { api } from "../../api/client";
import {
  useAtlasJourneys,
  useAtlasPlaceVerses,
  useAtlasPlaces,
  useBooks,
  useIsbeEntryByTerm,
  usePlacesInPassage,
} from "../../api/queries";
import type { AtlasConfidence, AtlasPlace } from "../../api/types";
import { usePane, usePaneParams } from "../../workspace/PaneContext";
import { openContent, openPassage, targetFor } from "../../workspace/openContent";
import { useSetting } from "../../hooks/useSetting";
import { bookName, toPassageRef } from "../../lib/passage";
import { refAttrs } from "../../lib/refAttr";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";
import { cx, inputSmClass } from "../../components/ui/classes";
import { StudyActions } from "../sermons/StudyActions";
import { atlasRef } from "../sermons/sourceIdentity";
import { MapCanvas } from "./MapCanvas";

/** What the confidence ratings mean, said plainly rather than as a score. */
const CONFIDENCE_NOTE: Record<AtlasConfidence, string> = {
  certain: "The site is not in doubt.",
  probable: "Widely accepted, though not beyond question.",
  possible: "One reasonable identification among others.",
  proposed: "A suggested site; the evidence is thin.",
  unidentified: "No one now knows where this was.",
};

const CATEGORY_LABEL: Record<string, string> = {
  settlement: "Town or city",
  region: "Region",
  water: "River or water",
  mountain: "Mountain or valley",
  other: "Place",
};

type Tab = "places" | "journeys";

/**
 * The atlas: a map of the biblical world, the places named in it, and the
 * journeys traced through it.
 *
 * The pane follows the passage, so an atlas beside a Bible pane shows what
 * is on the ground in the chapter being read. That is the connection worth
 * having -- the map answering a question the reader already has, rather than
 * waiting to be searched.
 */
export function AtlasView() {
  const [params, setParams] = usePaneParams("atlas");
  const { data: places } = useAtlasPlaces();
  const { data: journeys } = useAtlasJourneys();
  const { data: books } = useBooks();
  const [showLabels, setShowLabels] = useSetting("atlas.labels", true);
  // Beside a Bible pane the atlas gets a study column, not a page. Below the
  // width the three-column layout needs, the map keeps the space and the one
  // remaining column shows the detail when something is picked, the list
  // otherwise -- rather than three panels squeezed into none.
  const { width } = usePane();
  const compact = width > 0 && width < 860;

  const [tab, setTab] = useState<Tab>(params.journey ? "journeys" : "places");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => (params.slug ? places?.find((p) => p.slug === params.slug) ?? null : null),
    [places, params.slug],
  );
  const journey = useMemo(
    () => (params.journey ? journeys?.find((j) => j.slug === params.journey) ?? null : null),
    [journeys, params.journey],
  );

  // What the linked Bible pane is showing.
  const { data: passagePlaces } = usePlacesInPassage(params.bookId, params.chapter);
  const highlighted = useMemo(() => new Set((passagePlaces ?? []).map((p) => p.slug)), [passagePlaces]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  const { data: searchResults, isFetching } = useQuery({
    queryKey: ["atlasSearch", debounced],
    queryFn: () => api.searchAtlasPlaces(debounced, 200),
    enabled: debounced.trim().length > 1,
  });

  const list = debounced.trim().length > 1 ? searchResults ?? [] : places ?? [];
  const rows = useVirtualizer({
    count: list.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 44,
    overscan: 12,
  });

  // The map re-frames when the reader picks something, or when the passage
  // beside it changes -- but not while they are panning around by hand.
  const [fitToken, setFitToken] = useState(0);
  const [fitTargets, setFitTargets] = useState<AtlasPlace[]>([]);
  const refit = (targets: AtlasPlace[]) => {
    if (!targets.length) return;
    setFitTargets(targets);
    setFitToken((n) => n + 1);
  };

  useEffect(() => {
    if (selected) refit([selected]);
  }, [selected?.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (journey && places) {
      const stops = journey.legs
        .map((l) => places.find((p) => p.slug === l.place_slug))
        .filter((p): p is AtlasPlace => !!p);
      refit(stops);
    }
  }, [journey?.slug, places]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selected && !journey && passagePlaces?.length) refit(passagePlaces);
  }, [params.bookId, params.chapter, passagePlaces]); // eslint-disable-line react-hooks/exhaustive-deps

  function selectPlace(place: AtlasPlace) {
    setParams({ slug: place.slug, journey: null });
    setTab("places");
  }

  const hasDetail = !!(selected || journey);
  const showList = !compact || !hasDetail;
  const showDetail = !compact || hasDetail;

  return (
    <div className="flex h-full">
      {showList && (
      <aside className="flex w-80 shrink-0 flex-col border-r border-line bg-surface-2/60">
        <div className="flex border-b border-line">
          {(["places", "journeys"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
              className={cx(
                "flex-1 px-3 py-2 text-sm font-medium capitalize",
                tab === t ? "border-b-2 border-accent text-accent" : "text-ink-3 hover:text-ink",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "places" ? (
          <>
            <div className="border-b border-line p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-4" aria-hidden="true" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search places…"
                  className={cx(inputSmClass, "w-full pl-7")}
                />
              </div>
              {isFetching && <LoadingState className="pt-2" label="Searching…" />}
            </div>
            <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
              {!places && <LoadingState />}
              {places && list.length === 0 && <EmptyState compact title="No places match" />}
              <div style={{ position: "relative", height: rows.getTotalSize() }}>
                {rows.getVirtualItems().map((item) => {
                  const place = list[item.index];
                  return (
                    <button
                      key={place.slug}
                      ref={rows.measureElement}
                      data-index={item.index}
                      type="button"
                      onClick={() => selectPlace(place)}
                      style={{ position: "absolute", top: 0, left: 0, right: 0, transform: `translateY(${item.start}px)` }}
                      className={cx(
                        "block w-full border-b border-line px-3 py-2 text-left hover:bg-hover",
                        place.slug === params.slug ? "bg-accent-soft" : "",
                      )}
                    >
                      <span
                        className={cx(
                          "block text-sm",
                          place.slug === params.slug ? "font-medium text-accent" : "text-ink-2",
                        )}
                      >
                        {place.name}
                        {highlighted.has(place.slug) && (
                          <span className="ml-1.5 align-middle text-[10px] text-accent" title="Named in the passage being read">
                            ●
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-ink-4">
                        {CATEGORY_LABEL[place.category] ?? "Place"} · {place.verse_count}{" "}
                        {place.verse_count === 1 ? "verse" : "verses"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {!journeys && <LoadingState />}
            {journeys?.map((j) => (
              <button
                key={j.slug}
                type="button"
                onClick={() => setParams({ journey: j.slug, slug: null })}
                className={cx(
                  "block w-full border-b border-line px-3 py-2.5 text-left hover:bg-hover",
                  j.slug === params.journey ? "bg-accent-soft" : "",
                )}
              >
                <span className={cx("block text-sm", j.slug === params.journey ? "font-medium text-accent" : "text-ink-2")}>
                  {j.title}
                </span>
                <span className="block text-xs text-ink-4">{j.reference}</span>
              </button>
            ))}
          </div>
        )}

        <label className="flex items-center gap-2 border-t border-line px-3 py-2 text-xs text-ink-3">
          <input
            type="checkbox"
            checked={showLabels}
            onChange={(e) => setShowLabels(e.target.checked)}
            className="h-3.5 w-3.5 accent-accent"
          />
          Show place names on the map
        </label>
      </aside>
      )}

      <div className="min-w-0 flex-1">
        {places ? (
          <MapCanvas
            places={places}
            selected={selected}
            highlighted={highlighted}
            journey={journey}
            showLabels={showLabels}
            onSelect={selectPlace}
            fitToken={fitToken}
            fitTargets={fitTargets}
          />
        ) : (
          <LoadingState className="p-8" label="Loading the map…" />
        )}
      </div>

      {showDetail && (
      <aside className="w-80 shrink-0 overflow-y-auto border-l border-line bg-surface-2/60 p-4">
        {compact && hasDetail && (
          <button
            type="button"
            onClick={() => setParams({ slug: null, journey: null })}
            className="mb-3 flex items-center gap-1 text-xs text-ink-3 hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            All places
          </button>
        )}
        {journey && <JourneyDetail slug={journey.slug} />}
        {!journey && selected && <PlaceDetail place={selected} books={books} />}
        {!journey && !selected && (
          <EmptyState
            icon={MapPin}
            compact
            title="Bible atlas"
            description={
              params.bookId
                ? `Pick a place or a journey, or open a chapter in a Bible pane beside this one — the places named in ${bookName(books, params.bookId)} ${params.chapter} are marked on the map.`
                : "Pick a place from the list, or a journey to trace."
            }
          />
        )}
      </aside>
      )}
    </div>
  );
}

function PlaceDetail({ place, books }: { place: AtlasPlace; books: ReturnType<typeof useBooks>["data"] }) {
  const { data: verses } = useAtlasPlaceVerses(place.slug);
  const { data: inEncyclopedia } = useIsbeEntryByTerm(place.name);

  return (
    <div>
      <div className="mb-2 flex items-start gap-2">
        <h2 className="min-w-0 flex-1 text-lg font-semibold text-ink">{place.name}</h2>
        <StudyActions
          what={place.name}
          item={() => ({
            kind: "atlas",
            refId: atlasRef(place.slug),
            label: `${place.name}, Bible atlas`,
            excerpt: [
              CATEGORY_LABEL[place.category] ?? "Place",
              place.modern_name ? `identified with ${place.modern_name}` : null,
              place.lat != null ? `${place.lat.toFixed(3)}, ${place.lon?.toFixed(3)}` : null,
            ]
              .filter(Boolean)
              .join(" · "),
          })}
        />
      </div>

      <dl className="mb-4 space-y-1.5 text-sm">
        <Row label="Kind">{place.kinds.join(", ") || CATEGORY_LABEL[place.category]}</Row>
        {place.modern_name && (
          <Row label="Today">
            {place.modern_name}
            {place.modern_alternatives > 0 && (
              <span className="text-ink-4">
                {" "}
                (and {place.modern_alternatives} other {place.modern_alternatives === 1 ? "proposal" : "proposals"})
              </span>
            )}
          </Row>
        )}
        {place.lat != null && place.lon != null && (
          <Row label="Coordinates">
            {place.lat.toFixed(4)}, {place.lon.toFixed(4)}
            {place.approximate && <span className="text-ink-4"> (approximate)</span>}
          </Row>
        )}
        <Row label="Confidence">
          <span className="capitalize">{place.confidence}</span>
          <span className="block text-xs text-ink-4">{CONFIDENCE_NOTE[place.confidence]}</span>
        </Row>
      </dl>

      {inEncyclopedia && (
        <button
          type="button"
          onClick={(e) => openContent("encyclopedia", { slug: inEncyclopedia.slug }, { target: targetFor(e, "focused") })}
          className="mb-4 text-sm text-accent hover:underline"
        >
          Read the ISBE article →
        </button>
      )}

      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">
        {place.verse_count} {place.verse_count === 1 ? "reference" : "references"}
      </h3>
      <div className="flex flex-wrap gap-1">
        {(verses ?? []).map((v) => (
          <button
            key={`${v.book_id}-${v.chapter}-${v.verse}`}
            type="button"
            onClick={(e) => openPassage({ bookId: v.book_id, chapter: v.chapter, verse: v.verse }, { target: targetFor(e) })}
            onAuxClick={(e) =>
              e.button === 1 && openPassage({ bookId: v.book_id, chapter: v.chapter, verse: v.verse }, { target: targetFor(e) })
            }
            className="rounded-md border border-line bg-surface px-1.5 py-0.5 text-xs text-ink-2 hover:border-accent hover:text-accent"
            {...refAttrs(toPassageRef(v.book_id, v.chapter, v.verse))}
          >
            {bookName(books, v.book_id)} {v.chapter}:{v.verse}
          </button>
        ))}
        {!verses && <LoadingState className="py-1" />}
      </div>
    </div>
  );
}

function JourneyDetail({ slug }: { slug: string }) {
  const { data: journeys } = useAtlasJourneys();
  const { data: books } = useBooks();
  const journey = journeys?.find((j) => j.slug === slug);
  if (!journey) return <LoadingState />;

  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5">
        <Route className="h-4 w-4 text-ink-3" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-ink">{journey.title}</h2>
      </div>
      <p className="mb-1 text-xs text-ink-4">{journey.reference}</p>
      <p className="mb-4 text-sm leading-relaxed text-ink-2">{journey.summary}</p>

      <ol className="space-y-2.5">
        {journey.legs.map((leg, i) => (
          <li key={`${leg.place_slug}-${i}`} className="flex gap-2.5">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-bg">
              {i + 1}
            </span>
            <div className="min-w-0">
              <button
                type="button"
                disabled={!leg.place_slug}
                onClick={(e) =>
                  leg.place_slug && openContent("atlas", { slug: leg.place_slug, journey: null }, { target: targetFor(e, "focused") })
                }
                className={cx("text-sm font-medium", leg.place_slug ? "text-ink hover:text-accent" : "text-ink-3")}
              >
                {leg.label}
              </button>
              {leg.book_id != null && leg.chapter != null && (
                <button
                  type="button"
                  onClick={(e) =>
                    openPassage(
                      { bookId: leg.book_id as number, chapter: leg.chapter as number, verse: leg.verse ?? undefined },
                      { target: targetFor(e) },
                    )
                  }
                  className="ml-1.5 text-xs text-accent hover:underline"
                >
                  {bookName(books, leg.book_id)} {leg.chapter}
                  {leg.verse != null ? `:${leg.verse}` : ""}
                </button>
              )}
              {leg.note && <p className="text-xs leading-relaxed text-ink-3">{leg.note}</p>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-xs text-ink-4">{label}</dt>
      <dd className="min-w-0 flex-1 text-ink-2">{children}</dd>
    </div>
  );
}
