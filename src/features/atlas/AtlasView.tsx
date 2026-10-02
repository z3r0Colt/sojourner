import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowLeft, MapPin, Route, Search } from "lucide-react";
import { api } from "../../api/client";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  useAtlasJourneys,
  useMapPacks,
  useAtlasPlaceVerses,
  useAtlasPlaces,
  useBooks,
  useIsbeEntryByTerm,
  usePlacesInPassage,
} from "../../api/queries";
import type { AtlasConfidence, AtlasPlace } from "../../api/types";
import { usePane, usePaneParams } from "../../workspace/PaneContext";
import { SidePanel } from "../../components/ui/SidePanel";
import { openContent, openPassage, targetFor } from "../../workspace/openContent";
import { useSetting } from "../../hooks/useSetting";
import { bookName, toPassageRef } from "../../lib/passage";
import { refAttrs } from "../../lib/refAttr";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";
import { cx, inputSmClass, selectSmClass } from "../../components/ui/classes";
import { StudyActions } from "../sermons/StudyActions";
import { atlasRef } from "../sermons/sourceIdentity";
import { AtlasMap } from "./AtlasMap";
import { TRAVEL, bearingWord, daysText, distanceKm, formatDistance, type Units } from "./geo";
import { PLACE_GROUPS, displayName, groupLabel, groupOf, kindsText, type PlaceGroup } from "./places";
import { ROMAN_ERAS, journeyRoutes, loadRoadGraph, type LegRoute } from "./routes";
import { DATA, completeLayers, type LayerSettings } from "./style";

/** What the confidence ratings mean, said plainly rather than as a score. */
const CONFIDENCE_NOTE: Record<AtlasConfidence, string> = {
  certain: "The site is not in doubt.",
  probable: "Widely accepted, though not beyond question.",
  possible: "One reasonable identification among others.",
  proposed: "A suggested site; the evidence is thin.",
  unidentified: "No one now knows where this was.",
};

type Tab = "places" | "journeys";

/** Distances in the place card are measured from here. */
const JERUSALEM = { lon: 35.2304, lat: 31.7767 };

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
  const [storedLayers, setStoredLayers] = useSetting<Partial<LayerSettings> | null>("atlas.layers", null);
  const layers = useMemo(() => completeLayers(storedLayers), [storedLayers]);
  const [units, setUnits] = useSetting<Units>("atlas.units", "mi");
  const [groupShown, setGroupShown] = useState<PlaceGroup | "all">("all");
  const mapPacks = useMapPacks();
  const packSource = (layer: string) => {
    const pack = mapPacks.find((p) => p.map?.layer === layer);
    return pack?.id && pack.map ? { tiles: `${convertFileSrc(pack.id, "sjtiles")}/{z}/{x}/{y}`, ...pack.map } : null;
  };
  const terrain = packSource("terrain");
  const imagery = packSource("imagery");
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
  const chapterName = params.bookId && params.chapter ? `${bookName(books, params.bookId)} ${params.chapter}` : null;

  // A journey goes by the roads of its day: a New Testament one by the
  // Roman roads, an Old Testament one by the great routes. Each network is
  // read when the first journey that needs it is shown, and kept.
  const roman = !!journey && ROMAN_ERAS.has(journey.era);
  const network = roman ? "roman" : "ancient";
  const { data: roadGraph } = useQuery({
    queryKey: ["atlasRoadGraph", network],
    queryFn: () => loadRoadGraph(`${DATA}/roads.geojson`, network),
    enabled: !!journey,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const routes = useMemo(() => (journey && roadGraph ? journeyRoutes(journey, roadGraph) : null), [journey, roadGraph]);

  // Said at the top of the map, so what is marked is never a puzzle.
  const focusLabel = journey
    ? journey.title
    : chapterName && passagePlaces
      ? passagePlaces.length
        ? `${chapterName}: ${passagePlaces.length} ${passagePlaces.length === 1 ? "place" : "places"} marked`
        : `No places on the map in ${chapterName}`
      : null;

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  const { data: searchResults, isFetching } = useQuery({
    queryKey: ["atlasSearch", debounced],
    queryFn: () => api.searchAtlasPlaces(debounced, 200),
    enabled: debounced.trim().length > 1,
  });

  const searched = debounced.trim().length > 1 ? searchResults ?? [] : places ?? [];
  const list = groupShown === "all" ? searched : searched.filter((p) => groupOf(p) === groupShown);
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
  const [fitMode, setFitMode] = useState<"frame" | "center">("frame");
  const refit = (targets: AtlasPlace[], mode: "frame" | "center" = "frame") => {
    if (!targets.length) return;
    setFitTargets(targets);
    setFitMode(mode);
    setFitToken((n) => n + 1);
  };
  // Where the current selection came from. Picking a place off the map
  // should take you to it without discarding the zoom you used to find it;
  // picking one out of the list has no such context to keep.
  const pickedFromMap = useRef(false);

  useEffect(() => {
    if (selected) refit([selected], pickedFromMap.current ? "center" : "frame");
    pickedFromMap.current = false;
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

  function selectPlace(place: AtlasPlace, from: "map" | "list" = "list") {
    pickedFromMap.current = from === "map";
    setParams({ slug: place.slug, journey: null });
    setTab("places");
  }

  const hasDetail = !!(selected || journey);
  const showList = !compact || !hasDetail;
  const showDetail = !compact || hasDetail;

  return (
    <div className="flex h-full">
      {showList && (
      <SidePanel id="atlas-list" label="Places and journeys" defaultWidth={320} maxShare={0.35} className="flex flex-col">
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
              <select
                aria-label="Kind of place"
                value={groupShown}
                onChange={(e) => setGroupShown(e.target.value as PlaceGroup | "all")}
                className={cx(selectSmClass, "mt-2 w-full")}
              >
                <option value="all">All places</option>
                {PLACE_GROUPS.map((g) => (
                  <option key={g.key} value={g.key}>
                    {g.label}
                  </option>
                ))}
              </select>
              {isFetching && <LoadingState className="pt-2" label="Searching…" />}
            </div>
            {compact && chapterName && !!passagePlaces?.length && (
              <div className="max-h-48 overflow-y-auto border-b border-line p-3">
                <PassagePlaces chapter={chapterName} places={passagePlaces} onPick={(p) => selectPlace(p)} />
              </div>
            )}
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
                        {place.qualifier && <span className="text-ink-3"> ({place.qualifier})</span>}
                        {highlighted.has(place.slug) && (
                          <span className="ml-1.5 align-middle text-[10px] text-accent" title="Named in the passage being read">
                            ●
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-ink-4">
                        {groupLabel(groupOf(place))} · {place.verse_count}{" "}
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

      </SidePanel>
      )}

      <div className="min-w-0 flex-1">
        {places ? (
          <AtlasMap
            places={places}
            selected={selected}
            highlighted={highlighted}
            journey={journey}
            routes={routes}
            roman={roman}
            focusLabel={focusLabel}
            settings={layers}
            onSettings={setStoredLayers}
            units={units}
            onUnits={setUnits}
            onSelect={(place) => selectPlace(place, "map")}
            fitToken={fitToken}
            fitTargets={fitTargets}
            fitMode={fitMode}
            terrain={terrain}
            imagery={imagery}
          />
        ) : (
          <LoadingState className="p-8" label="Loading the map…" />
        )}
      </div>

      {showDetail && (
      <SidePanel id="atlas-detail" label="Place details" side="right" defaultWidth={320} maxShare={0.35} autoCollapse={false} className="overflow-y-auto p-4">
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
        {journey && <JourneyDetail slug={journey.slug} units={units} routes={routes} roman={roman} />}
        {!journey && selected && <PlaceDetail place={selected} books={books} units={units} />}
        {!journey && !selected && chapterName && !!passagePlaces?.length && (
          <PassagePlaces chapter={chapterName} places={passagePlaces} onPick={(p) => selectPlace(p)} />
        )}
        {!journey && !selected && !(chapterName && passagePlaces?.length) && (
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
      </SidePanel>
      )}
    </div>
  );
}

function PlaceDetail({ place, books, units }: { place: AtlasPlace; books: ReturnType<typeof useBooks>["data"]; units: Units }) {
  const { data: verses } = useAtlasPlaceVerses(place.slug);
  const { data: inEncyclopedia } = useIsbeEntryByTerm(place.name);

  return (
    <div>
      <div className="mb-2 flex items-start gap-2">
        <h2 className="min-w-0 flex-1 text-lg font-semibold text-ink">
          {place.name}
          {place.qualifier && <span className="block text-sm font-normal text-ink-3">{place.qualifier}</span>}
        </h2>
        <StudyActions
          what={place.name}
          item={() => ({
            kind: "atlas",
            refId: atlasRef(place.slug),
            label: `${displayName(place)}, Bible atlas`,
            excerpt: [
              kindsText(place) || groupLabel(groupOf(place)),
              place.modern_name ? `identified with ${place.modern_name}` : null,
              place.lat != null ? `${place.lat.toFixed(3)}, ${place.lon?.toFixed(3)}` : null,
            ]
              .filter(Boolean)
              .join(" · "),
          })}
        />
      </div>

      <dl className="mb-4 space-y-1.5 text-sm">
        <Row label="Kind">{kindsText(place) || groupLabel(groupOf(place))}</Row>
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
        {place.lat != null && place.lon != null && place.slug !== "jerusalem" && groupOf(place) !== "lands" && (
          <Row label="From Jerusalem">
            {formatDistance(distanceKm(JERUSALEM, { lon: place.lon, lat: place.lat }), units)}{" "}
            {bearingWord(JERUSALEM, { lon: place.lon, lat: place.lat })}
            <span className="block text-xs text-ink-4">
              in a straight line; {daysText(distanceKm(JERUSALEM, { lon: place.lon, lat: place.lat }), TRAVEL[0].kmPerDay)} on foot
            </span>
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

/** The places named in the chapter beside the map, which the map marks. */
function PassagePlaces({ chapter, places, onPick }: { chapter: string; places: AtlasPlace[]; onPick: (place: AtlasPlace) => void }) {
  const sorted = [...places].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div>
      <h2 className="text-sm font-semibold text-ink">Places in {chapter}</h2>
      <p className="mb-2 text-xs text-ink-4">Marked on the map in colour; the rest fade back. Pick one for its card.</p>
      <ul className="space-y-0.5">
        {sorted.map((p) => (
          <li key={p.slug}>
            <button type="button" onClick={() => onPick(p)} className="w-full rounded px-1.5 py-1 text-left hover:bg-hover">
              <span className="block text-sm text-accent">
                {p.name}
                {p.qualifier && <span className="text-ink-3"> ({p.qualifier})</span>}
              </span>
              <span className="block text-xs text-ink-4">{kindsText(p) || groupLabel(groupOf(p))}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function JourneyDetail({ slug, units, routes, roman }: { slug: string; units: Units; routes: LegRoute[] | null; roman: boolean }) {
  const { data: journeys } = useAtlasJourneys();
  const { data: books } = useBooks();
  const journey = journeys?.find((j) => j.slug === slug);
  if (!journey) return <LoadingState />;
  const located = journey.legs.filter((l) => l.lon != null && l.lat != null);
  let totalKm = 0;
  // Each leg's way from the stop before: along the road where the journey
  // went by road, else the straight line.
  const legRoute = journey.legs.map((leg): LegRoute | null => {
    const i = located.indexOf(leg);
    if (i <= 0) return null;
    const prev = located[i - 1];
    const route = routes?.[i - 1] ?? {
      coords: [],
      km: distanceKm({ lon: prev.lon as number, lat: prev.lat as number }, { lon: leg.lon as number, lat: leg.lat as number }),
      by: "direct" as const,
    };
    totalKm += route.km;
    return route;
  });

  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5">
        <Route className="h-4 w-4 text-ink-3" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-ink">{journey.title}</h2>
      </div>
      <p className="mb-1 text-xs text-ink-4">{journey.reference}</p>
      <p className="mb-2 text-sm leading-relaxed text-ink-2">{journey.summary}</p>
      {totalKm > 0 &&
        (roman ? (
          <p className="mb-4 text-xs text-ink-3">
            About {formatDistance(totalKm, units)} in all, along the Roman roads where they ran. A dashed leg is one no road served: by sea, or
            across country.
          </p>
        ) : (
          <p className="mb-4 text-xs text-ink-3">
            About {formatDistance(totalKm, units)} in all: along the great routes where the way followed them, elsewhere from stop to stop in
            straight lines (more on the ground).
          </p>
        ))}

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
              {legRoute[i] && legRoute[i]!.km >= 1 && <LegDistance route={legRoute[i]!} roman={roman} units={units} />}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function LegDistance({ route, roman, units }: { route: LegRoute; roman: boolean; units: Units }) {
  const km = route.km;
  const foot = `${daysText(km, TRAVEL[0].kmPerDay)} on foot`;
  const text =
    route.by === "road"
      ? `${formatDistance(km, units)} ${roman ? "by road" : "along the highway"}, ${foot}`
      : roman
        ? `${formatDistance(km, units)} in a straight line: ${foot}, or ${daysText(km, TRAVEL[2].kmPerDay)} by ship`
        : `${formatDistance(km, units)} from the last stop, ${foot}`;
  return <p className="text-xs text-ink-4">{text}</p>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-xs text-ink-4">{label}</dt>
      <dd className="min-w-0 flex-1 text-ink-2">{children}</dd>
    </div>
  );
}
