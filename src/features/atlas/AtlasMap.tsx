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
import { displayName, groupOf, kindsText, minZoom } from "./places";
import { applySettings, atlasColors, buildStyle, type LayerSettings } from "./style";
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
  settings: LayerSettings;
  onSettings: (next: LayerSettings) => void;
  units: Units;
  onUnits: (u: Units) => void;
  onSelect: (place: AtlasPlace) => void;
  fitToken: number;
  fitTargets: AtlasPlace[];
  fitMode: "frame" | "center";
  /** Terrarium elevation tiles from the terrain pack, when it is installed. */
  terrainTiles: string | null;
}

function placesGeoJSON(places: AtlasPlace[], selected: string | null, highlighted: Set<string>) {
  return {
    type: "FeatureCollection" as const,
    features: places
      .filter((p) => p.lon != null && p.lat != null)
      .map((p) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [p.lon as number, p.lat as number] },
        properties: {
          slug: p.slug,
          label: p.slug === selected ? displayName(p) : p.name,
          group: groupOf(p),
          // Seas and lakes are named across the water, not marked with a dot.
          sea: p.kinds.includes("body of water") ? 1 : 0,
          rank: p.verse_count,
          minzoom: minZoom(p),
          confidence: p.confidence,
          ot: p.ot_verses,
          nt: p.nt_verses,
          selected: p.slug === selected ? 1 : 0,
          highlighted: highlighted.has(p.slug) ? 1 : 0,
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

function journeyGeoJSON(journey: AtlasJourney | null) {
  if (!journey) return { type: "FeatureCollection" as const, features: [] };
  const stops = journey.legs.filter((l) => l.lon != null && l.lat != null);
  const line = stops.map((l) => [l.lon as number, l.lat as number]);
  return {
    type: "FeatureCollection" as const,
    features: [
      ...(line.length > 1 ? [{ type: "Feature" as const, geometry: { type: "LineString" as const, coordinates: line }, properties: {} }] : []),
      ...stops.map((l, i) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [l.lon as number, l.lat as number] },
        properties: { n: i + 1 },
      })),
    ],
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
  const { places, selected, highlighted, journey, settings, units, onSelect, fitToken, fitTargets, fitMode, terrainTiles } = props;
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
  const styleKey = `${theme}:${settings.labelSize}:${terrainTiles ?? ""}`;

  // The map itself, once.
  useEffect(() => {
    if (!container.current) return;
    const map = new MapLibre({
      container: container.current,
      style: buildStyle(colors, settings, terrainTiles ? { tiles: terrainTiles } : null),
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
    const interactive = ["places-dot", "places-label", "lands-label", "seas-label"];
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
      if (e.id === "arrow" && !map.hasImage("arrow")) map.addImage("arrow", arrowImage(atlasColors().dark ? "#111" : "#fff"));
    });
    map.on("load", () => setReady((n) => n + 1));

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
    map.setStyle(buildStyle(colors, settings, terrainTiles ? { tiles: terrainTiles } : null));
    map.once("style.load", () => setReady((n) => n + 1));
  }, [styleKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Everything else the settings change, in place.
  useEffect(() => {
    const map = mapRef.current;
    if (map && ready && map.isStyleLoaded()) applySettings(map, settings);
  }, [settings, ready]);

  // The data: places, regions, the journey, the measured line.
  const selectedSlug = selected?.slug ?? null;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("places") as GeoJSONSource | undefined)?.setData(placesGeoJSON(places, selectedSlug, highlighted));
    (map.getSource("regions") as GeoJSONSource | undefined)?.setData(regionsGeoJSON(places, selectedSlug, highlighted));
  }, [places, selectedSlug, highlighted, ready]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("journey") as GeoJSONSource | undefined)?.setData(journeyGeoJSON(journey));
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

      {panel === "layers" && (
        <div className="absolute left-14 top-3 max-h-[calc(100%-1.5rem)] w-72 overflow-y-auto rounded-lg border border-line bg-surface shadow-lg">
          <LayersPanel settings={settings} onChange={props.onSettings} units={units} onUnits={props.onUnits} terrainInstalled={!!terrainTiles} onClose={() => setPanel(null)} />
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
