import { useEffect, useMemo, useRef, useState } from "react";
import {
  AttributionControl,
  Map as MapLibre,
  NavigationControl,
  Popup,
  ScaleControl,
  setWorkerUrl,
  type GeoJSONSource,
  type MapMouseEvent,
  type Map as MapLibreMap,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { Layers, Maximize, Ruler, X } from "lucide-react";
import type { AtlasJourney, AtlasPlace } from "../../api/types";
import { cx } from "../../components/ui/classes";
import { useThemeVersion } from "../timeline/timelineTheme";
import bordersData from "./borders.json";
import { TRAVEL, bearingWord, daysText, distanceKm, formatDistance, pathKm, type LonLat, type Units } from "./geo";
import { displayName, groupOf, kindsText, minZoom, type PlaceGroup } from "./places";
import type { LegRoute } from "./routes";
import { applySettings, atlasColors, buildStyle, placeImage, STOP_PILL, stopPillImage, type LayerSettings, type TileSource } from "./style";
import { stopBadges } from "./stopBadges";
import { LayersPanel } from "./LayersPanel";

// MapLibre looks for its worker beside its own file, which is not where a
// bundler puts either of them; this is the worker Vite built for it.
setWorkerUrl(mapWorkerUrl);

type Border = { name: string; outer: [number, number][]; core: [number, number][] };
const BORDERS = bordersData as unknown as Record<string, Border>;

/** Regions this much of Scripture get their outline drawn for context. */
const REGION_OUTLINE_MIN_VERSES = 50;

/** The biblical world, for "show everything". */
const WORLD: [[number, number], [number, number]] = [
  [10, 22],
  [56, 44],
];
/** The Holy Land, where a first look starts. */
const HOLY_LAND: [[number, number], [number, number]] = [
  [33.6, 29.4],
  [37.4, 33.6],
];

interface Props {
  places: AtlasPlace[];
  selected: AtlasPlace | null;
  highlighted: Set<string>;
  journey: AtlasJourney | null;
  /** The journey's legs as drawn, from its first located stop: by road where
   * the Roman roads served, or straight; null until worked out. */
  routes: LegRoute[] | null;
  /** Whether the journey's travellers went by the Roman roads. */
  roman: boolean;
  /** What the map is showing in focus, said at its top: "Places in Acts 16". */
  focusLabel: string | null;
  settings: LayerSettings;
  onSettings: (next: LayerSettings) => void;
  units: Units;
  onUnits: (u: Units) => void;
  onSelect: (place: AtlasPlace) => void;
  fitToken: number;
  fitTargets: AtlasPlace[];
  fitMode: "frame" | "center";
  /** Elevation tiles from the terrain pack, when it is installed. */
  terrain: TileSource | null;
  /** Satellite tiles from the imagery pack, when it is installed. */
  imagery: TileSource | null;
}

/** The colour a place's dot takes, by its group: a key into atlasColors. */
const TONE: Partial<Record<PlaceGroup, string>> = {
  mountains: "mountain",
  waters: "waterPlace",
  camps: "camp",
  sites: "site",
  valleys: "featureLabel",
};

/**
 * The places, each marked for how the map should draw it: in focus (named in
 * the chapter beside the map, a stop on the journey shown, or selected), or
 * faded back while something else is in focus.
 */
function placesGeoJSON(places: AtlasPlace[], selected: string | null, focus: Set<string>, fade: boolean) {
  const focusing = fade && focus.size > 0;
  return {
    type: "FeatureCollection" as const,
    features: places
      .filter((p) => p.lon != null && p.lat != null)
      .map((p) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [p.lon as number, p.lat as number] },
        properties: {
          slug: p.slug,
          // A name used for another place (Babylon for Rome) always says so.
          label: p.slug === selected || p.qualifier?.startsWith("for ") ? displayName(p) : p.name,
          group: groupOf(p),
          tone: focus.has(p.slug) || p.slug === selected ? "accent" : TONE[groupOf(p)] ?? "ink2",
          // Seas and lakes are named across the water, not marked with a dot.
          sea: p.kinds.includes("body of water") ? 1 : 0,
          rank: p.verse_count,
          minzoom: minZoom(p),
          confidence: p.confidence,
          ot: p.ot_verses,
          nt: p.nt_verses,
          selected: p.slug === selected ? 1 : 0,
          focus: focus.has(p.slug) || p.slug === selected ? 1 : 0,
          dim: focusing && !focus.has(p.slug) && p.slug !== selected ? 1 : 0,
        },
      })),
  };
}

function regionsGeoJSON(places: AtlasPlace[], selected: string | null, highlighted: Set<string>) {
  const bySlug = new Map(places.map((p) => [p.slug, p]));
  return {
    type: "FeatureCollection" as const,
    features: Object.entries(BORDERS)
      .filter(([slug]) => {
        const p = bySlug.get(slug);
        return !!p && (p.verse_count >= REGION_OUTLINE_MIN_VERSES || slug === selected || highlighted.has(slug));
      })
      .map(([slug, b]) => ({
        type: "Feature" as const,
        geometry: { type: "Polygon" as const, coordinates: [[...b.outer, b.outer[0]]] },
        properties: { slug, selected: slug === selected ? 1 : 0 },
      })),
  };
}

/** The journey: a line for each leg -- along the roads, or straight. Its
 * numbered stops are drawn apart, as badges (`stopsGeoJSON`). */
function journeyGeoJSON(journey: AtlasJourney | null, routes: LegRoute[] | null, roman: boolean) {
  if (!journey) return { type: "FeatureCollection" as const, features: [] };
  const stops = journey.legs.filter((l) => l.lon != null && l.lat != null);
  const legs = stops.slice(1).map((l, i) => {
    const route = routes?.[i];
    const coords = route?.coords ?? [
      [stops[i].lon as number, stops[i].lat as number],
      [l.lon as number, l.lat as number],
    ];
    // A leg on the road, or off it: a Roman-era leg off the road is drawn
    // open (by sea, or across country); an older one is a plain line.
    const way = route?.by === "road" ? "road" : roman ? "open" : "line";
    return { type: "Feature" as const, geometry: { type: "LineString" as const, coordinates: coords }, properties: { way } };
  });
  return { type: "FeatureCollection" as const, features: legs };
}

/** The journey's stops as the map shows them at its present zoom: one badge
 * for stops that would overlap ("1, 14", "3–5"), at the earliest of them. */
function stopsGeoJSON(journey: AtlasJourney | null, map: MapLibreMap) {
  const stops = (journey?.legs ?? []).filter((l) => l.lon != null && l.lat != null);
  const onScreen = stops.map((l, i) => {
    const p = map.project([l.lon as number, l.lat as number]);
    return { n: i + 1, x: p.x, y: p.y, lonLat: [l.lon as number, l.lat as number] as [number, number] };
  });
  const at = new Map(onScreen.map((s) => [s.n, s.lonLat]));
  const badges = stopBadges(onScreen);
  return {
    key: badges.map((b) => b.label).join("|"),
    data: {
      type: "FeatureCollection" as const,
      features: badges.map((b) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: at.get(b.ns[0])! },
        properties: { label: b.label, first: b.ns[0] },
      })),
    },
  };
}

function measureGeoJSON(points: LonLat[], units: Units) {
  let total = 0;
  return {
    type: "FeatureCollection" as const,
    features: [
      ...(points.length > 1
        ? [{ type: "Feature" as const, geometry: { type: "LineString" as const, coordinates: points.map((p) => [p.lon, p.lat]) }, properties: {} }]
        : []),
      ...points.map((p, i) => {
        if (i > 0) total += distanceKm(points[i - 1], p);
        return {
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] },
          properties: i > 0 ? { label: formatDistance(total, units) } : {},
        };
      }),
    ],
  };
}

/** A chevron for the journey line, drawn once per style. */
function arrowImage(color: string) {
  const size = 24;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(8, 6);
  ctx.lineTo(16, 12);
  ctx.lineTo(8, 18);
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}

export function AtlasMap(props: Props) {
  const { places, selected, highlighted, journey, routes, roman, focusLabel, settings, units, onSelect, fitToken, fitTargets, fitMode, terrain, imagery } = props;
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(0);
  const theme = useThemeVersion();
  const [panel, setPanel] = useState<"layers" | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [measure, setMeasure] = useState<LonLat[]>([]);
  const [pointer, setPointer] = useState<LonLat | null>(null);
  const latest = useRef({ places, onSelect, measuring });
  latest.current = { places, onSelect, measuring };

  const colors = useMemo(() => atlasColors(), [theme]); // eslint-disable-line react-hooks/exhaustive-deps
  // The type size is not here: it changes in place (applySettings).
  const styleKey = `${theme}:${terrain?.tiles ?? ""}:${imagery?.tiles ?? ""}`;

  // The map itself, once.
  useEffect(() => {
    if (!container.current) return;
    const map = new MapLibre({
      container: container.current,
      style: buildStyle(colors, settings, terrain, imagery),
      bounds: HOLY_LAND,
      fitBoundsOptions: { padding: 30 },
      minZoom: 2.5,
      maxZoom: 14,
      maxBounds: [
        [-30, -5],
        [90, 62],
      ],
      attributionControl: false,
      dragRotate: true,
      pitchWithRotate: true,
    });
    map.addControl(new NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new AttributionControl({ compact: true, customAttribution: "Natural Earth · OpenBible.info (CC BY)" }), "bottom-right");
    mapRef.current = map;
    map.on("error", (e) => console.error("[atlas]", e.error?.message ?? e));
    if (import.meta.env.DEV) (window as unknown as { __atlasMap?: MapLibreMap }).__atlasMap = map;

    const hover = new Popup({ closeButton: false, closeOnClick: false, offset: 10, className: "atlas-hover" });
    const interactive = ["places-focus", "places", "places-faint", "lands-label", "seas-label"];
    const placeAt = (e: MapMouseEvent) => {
      const hit = map.queryRenderedFeatures(e.point, { layers: interactive.filter((l) => map.getLayer(l)) })[0];
      const slug = hit?.properties?.slug as string | undefined;
      return slug ? latest.current.places.find((p) => p.slug === slug) : undefined;
    };
    map.on("mousemove", (e: MapMouseEvent) => {
      setPointer({ lon: e.lngLat.lng, lat: e.lngLat.lat });
      if (latest.current.measuring) {
        map.getCanvas().style.cursor = "crosshair";
        hover.remove();
        return;
      }
      const place = placeAt(e);
      map.getCanvas().style.cursor = place ? "pointer" : "";
      if (place && place.lon != null && place.lat != null) {
        const kinds = kindsText(place);
        hover
          .setLngLat([place.lon, place.lat])
          .setHTML(
            `<strong>${escape(displayName(place))}</strong>${kinds ? `<br><span>${escape(kinds)}</span>` : ""}${place.modern_name ? `<br><span>Today: ${escape(place.modern_name)}</span>` : ""}`,
          )
          .addTo(map);
      } else hover.remove();
    });
    map.on("mouseout", () => {
      hover.remove();
      setPointer(null);
    });
    map.on("click", (e: MapMouseEvent) => {
      if (latest.current.measuring) {
        setMeasure((pts) => [...pts, { lon: e.lngLat.lng, lat: e.lngLat.lat }]);
        return;
      }
      const place = placeAt(e);
      if (place) latest.current.onSelect(place);
    });
    map.on("styleimagemissing", (e: { id: string }) => {
      if (map.hasImage(e.id)) return;
      if (e.id === "arrow") map.addImage("arrow", arrowImage(atlasColors().dark ? "#111" : "#fff"));
      if (e.id === STOP_PILL) {
        const pill = stopPillImage(atlasColors());
        map.addImage(STOP_PILL, pill.data, pill.options);
        return;
      }
      const dot = placeImage(e.id, atlasColors());
      if (dot) map.addImage(e.id, dot, { pixelRatio: 2 });
    });
    map.on("load", () => {
      setReady((n) => n + 1);
      // The credits start folded behind their (i) button, not across the map.
      container.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
    });

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(container.current);
    return () => {
      ro.disconnect();
      hover.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A new style when the theme, the type size or the terrain changes.
  const firstStyle = useRef(true);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (firstStyle.current) {
      firstStyle.current = false;
      return;
    }
    // Not diffed: a diff keeps the old style's empty sources in place of the
    // data set since, and fires no load to set it again.
    map.setStyle(buildStyle(colors, settings, terrain, imagery), { diff: false });
    map.once("style.load", () => setReady((n) => n + 1));
  }, [styleKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Everything else the settings change, in place.
  useEffect(() => {
    const map = mapRef.current;
    if (map && ready && map.isStyleLoaded()) applySettings(map, settings);
  }, [settings, ready]);

  // The data: places, regions, the journey, the measured line.
  const selectedSlug = selected?.slug ?? null;
  // In focus: a journey's stops while one is shown, else the chapter's places.
  const focus = useMemo(
    () => (journey ? new Set(journey.legs.map((l) => l.place_slug).filter((s): s is string => !!s)) : highlighted),
    [journey, highlighted],
  );
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("places") as GeoJSONSource | undefined)?.setData(placesGeoJSON(places, selectedSlug, focus, settings.fadeOthers));
    (map.getSource("regions") as GeoJSONSource | undefined)?.setData(regionsGeoJSON(places, selectedSlug, focus));
  }, [places, selectedSlug, focus, settings.fadeOthers, ready]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("journey") as GeoJSONSource | undefined)?.setData(journeyGeoJSON(journey, routes, roman));
  }, [journey, routes, roman, ready]);
  // The stops' badges, joined and parted as the zoom (or the tilt and turn
  // of the map) brings stops together or apart. Set only when what they say
  // changes, not on every frame of a zoom.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let shown: string | null = null;
    const update = () => {
      const source = map.getSource("journey-stops") as GeoJSONSource | undefined;
      if (!source) return;
      const { key, data } = stopsGeoJSON(journey, map);
      if (key === shown) return;
      shown = key;
      source.setData(data);
    };
    update();
    map.on("zoom", update);
    map.on("rotate", update);
    map.on("pitch", update);
    return () => {
      map.off("zoom", update);
      map.off("rotate", update);
      map.off("pitch", update);
    };
  }, [journey, ready]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("measure") as GeoJSONSource | undefined)?.setData(measureGeoJSON(measure, units));
  }, [measure, units, ready]);

  // Framing what the reader picked.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fitToken) return;
    const pts = fitTargets.filter((p) => p.lon != null && p.lat != null);
    if (!pts.length) return;
    if (fitMode === "center" || pts.length === 1) {
      const p = pts[0];
      map.flyTo({ center: [p.lon as number, p.lat as number], zoom: fitMode === "center" ? map.getZoom() : Math.max(map.getZoom(), groupOf(p) === "lands" ? 6 : 8), duration: 700 });
      return;
    }
    const lons = pts.map((p) => p.lon as number);
    const lats = pts.map((p) => p.lat as number);
    map.fitBounds(
      [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ],
      { padding: 60, maxZoom: 9, duration: 700 },
    );
  }, [fitToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // The scale bar follows the units.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const scale = new ScaleControl({ maxWidth: 120, unit: units === "mi" ? "imperial" : "metric" });
    map.addControl(scale, "bottom-left");
    return () => {
      // The map may already be gone: its own cleanup runs first.
      if (mapRef.current === map) map.removeControl(scale);
    };
  }, [units]);

  // Leaving measuring clears the line; Escape leaves it.
  useEffect(() => {
    if (!measuring) {
      setMeasure([]);
      return;
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMeasuring(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [measuring]);

  const totalKm = pathKm(measure);

  return (
    <div className="relative h-full w-full">
      {/* Inline, because MapLibre's stylesheet gives its container
          position: relative, which would win over a class. */}
      <div ref={container} style={{ position: "absolute", inset: 0 }} />

      <div className="absolute left-3 top-3 flex flex-col gap-1.5">
        <ToolButton icon={Layers} label="Layers" active={panel === "layers"} onClick={() => setPanel(panel === "layers" ? null : "layers")} />
        <ToolButton
          icon={Ruler}
          label="Measure distance"
          active={measuring}
          onClick={() => setMeasuring((m) => !m)}
        />
        <ToolButton icon={Maximize} label="Show the whole biblical world" onClick={() => mapRef.current?.fitBounds(WORLD, { padding: 20, duration: 700 })} />
      </div>

      {focusLabel && (
        <div className="pointer-events-none absolute left-1/2 top-3 max-w-[calc(100%-9rem)] -translate-x-1/2 truncate rounded-full border border-line bg-surface/95 px-3 py-1 text-xs font-medium text-ink-2 shadow-sm">
          {focusLabel}
        </div>
      )}

      {panel === "layers" && (
        <div className="absolute left-14 top-3 max-h-[calc(100%-1.5rem)] w-72 overflow-y-auto rounded-lg border border-line bg-surface shadow-lg">
          <LayersPanel
            settings={settings}
            onChange={props.onSettings}
            units={units}
            onUnits={props.onUnits}
            terrainInstalled={!!terrain}
            imageryInstalled={!!imagery}
            onClose={() => setPanel(null)}
          />
        </div>
      )}

      {measuring && (
        <div className="absolute bottom-10 left-1/2 w-80 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-lg border border-line bg-surface p-3 text-sm shadow-lg">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="font-medium text-ink">Measure</span>
            <button type="button" onClick={() => setMeasuring(false)} className="text-ink-3 hover:text-ink" aria-label="Stop measuring">
              <X className="h-4 w-4" />
            </button>
          </div>
          {measure.length < 2 ? (
            <p className="text-ink-3">Click on the map to set a starting point, then each point along the way. Esc to finish.</p>
          ) : (
            <>
              <p className="text-ink">
                <span className="text-base font-semibold">{formatDistance(totalKm, units)}</span>
                <span className="text-ink-3">
                  {" "}
                  {measure.length === 2 ? `${bearingWord(measure[0], measure[1])}, ` : ""}in a straight line
                </span>
              </p>
              <p className="mt-1 text-xs text-ink-3">
                {TRAVEL.map((t) => `${daysText(totalKm, t.kmPerDay)} ${t.label}`).join(" · ")}
              </p>
              <p className="mt-1 text-xs text-ink-4">A road through hill country runs a fifth to a third longer than the straight line.</p>
              <div className="mt-2 flex gap-3 text-xs">
                <button type="button" className="text-accent hover:underline" onClick={() => setMeasure((m) => m.slice(0, -1))}>
                  Undo last point
                </button>
                <button type="button" className="text-accent hover:underline" onClick={() => setMeasure([])}>
                  Clear
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {pointer && (
        <div className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 rounded bg-surface/80 px-1.5 text-[11px] tabular-nums text-ink-3">
          {pointer.lat.toFixed(4)}° {pointer.lat >= 0 ? "N" : "S"}, {pointer.lon.toFixed(4)}° {pointer.lon >= 0 ? "E" : "W"}
        </div>
      )}
    </div>
  );
}

function ToolButton({ icon: Icon, label, active, onClick }: { icon: typeof Layers; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        "flex h-9 w-9 items-center justify-center rounded-md border shadow-sm",
        active ? "border-accent bg-accent text-white" : "border-line bg-surface text-ink-2 hover:text-ink",
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

function escape(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
