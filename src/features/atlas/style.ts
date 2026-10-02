import type { ExpressionSpecification, FilterSpecification, Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import { PLACE_GROUPS, type PlaceGroup, type Testament } from "./places";

/**
 * The Atlas's map style, built in code: an offline style needs no style
 * server, and the colours follow the app's theme.
 *
 * Sources are the Natural Earth base map in public/atlas/ (land, water,
 * modern borders and towns), and data the view hands over: the biblical
 * places, the ancient regions' outlines, a journey, and a measured line.
 */

export type BaseMap = "plain" | "terrain" | "satellite";
export type Confidence = "certain" | "probable" | "possible" | "proposed";

export interface LayerSettings {
  base: BaseMap;
  groups: Record<PlaceGroup, boolean>;
  /** Ancient lands drawn as areas. */
  regions: boolean;
  modernTowns: boolean;
  modernBorders: boolean;
  modernCountries: boolean;
  /** Names of seas, deserts and ranges, from the base map. */
  physicalNames: boolean;
  labels: boolean;
  labelSize: number;
  testament: Testament;
  /** The least certain identification still drawn. */
  confidence: Confidence;
}

export const DEFAULT_LAYERS: LayerSettings = {
  base: "terrain",
  groups: Object.fromEntries(PLACE_GROUPS.map((g) => [g.key, g.key !== "sites" && g.key !== "camps"])) as Record<PlaceGroup, boolean>,
  regions: false,
  modernTowns: false,
  modernBorders: false,
  modernCountries: false,
  physicalNames: true,
  labels: true,
  labelSize: 12,
  testament: "both",
  confidence: "proposed",
};

/** A stored settings object made whole: settings saved by an older version
 * lack the newer keys. */
export function completeLayers(stored: Partial<LayerSettings> | null | undefined): LayerSettings {
  return { ...DEFAULT_LAYERS, ...stored, groups: { ...DEFAULT_LAYERS.groups, ...stored?.groups } };
}

/** Any CSS colour (a theme token, color-mix() and all) as rgb(), which the
 * map can read: the canvas resolves it. */
function resolve(css: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const probe = document.createElement("span");
  probe.style.color = css;
  probe.style.display = "none";
  document.body.appendChild(probe);
  const computed = getComputedStyle(probe).color;
  probe.remove();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (!ctx || !computed) return fallback;
  ctx.fillStyle = fallback;
  ctx.fillStyle = computed;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `rgb(${r}, ${g}, ${b})`;
}

function isDark(): boolean {
  if (typeof document === "undefined") return false;
  const rgb = resolve("var(--color-surface)", "#ffffff").match(/\d+/g)?.map(Number) ?? [255, 255, 255];
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] < 80;
}

export function atlasColors() {
  const dark = isDark();
  return {
    dark,
    water: dark ? "#13232c" : "#b8d6e2",
    land: dark ? "#22262a" : "#f3efe4",
    coast: dark ? "#3c5866" : "#93b7c6",
    lake: dark ? "#152a35" : "#b8d6e2",
    river: dark ? "#2f5a70" : "#7fb3cb",
    waterLabel: dark ? "#6f9cb3" : "#3f7690",
    border: dark ? "#8a7d92" : "#9b8aa6",
    province: dark ? "#4b4650" : "#cdc3d3",
    countryLabel: dark ? "#a497ad" : "#7d6b89",
    town: dark ? "#9aa0a6" : "#6d7276",
    townLabel: dark ? "#aeb3b8" : "#5e6367",
    featureLabel: dark ? "#9c917c" : "#8c7a5b",
    ink: resolve("var(--color-ink)", dark ? "#eee" : "#1d1d1d"),
    ink2: resolve("var(--color-ink-2)", dark ? "#ccc" : "#3a3a3a"),
    ink3: resolve("var(--color-ink-3)", dark ? "#999" : "#666"),
    halo: dark ? "rgba(20,22,24,0.85)" : "rgba(246,243,235,0.92)",
    accent: resolve("var(--color-accent)", "#2a5f4c"),
    region: dark ? "#c8a96a" : "#a8803a",
    mountain: dark ? "#a68a6a" : "#8a6a45",
    waterPlace: dark ? "#5b9cbb" : "#2f7aa0",
    camp: dark ? "#b58f6b" : "#9a6f45",
    site: dark ? "#b07a8f" : "#8f4a64",
    measure: dark ? "#ffd166" : "#d1495b",
  };
}

export type AtlasColors = ReturnType<typeof atlasColors>;

const FONT = ["Noto Sans Regular"];
const FONT_BOLD = ["Noto Sans Bold"];
const FONT_ITALIC = ["Noto Sans Italic"];

/** Where the base map's files are: absolute, because the map fetches them
 * from a worker started from a blob: URL, against which a path like
 * "/atlas/land.geojson" does not resolve. */
const DATA = typeof location === "undefined" ? "/atlas" : `${location.origin}/atlas`;

function geojson(file: string) {
  return { type: "geojson" as const, data: `${DATA}/${file}.geojson` };
}

const EMPTY = { type: "FeatureCollection" as const, features: [] };

/** Which places are drawn, from the settings: their group, their Testament,
 * how sure the identification is, and how far in the map is zoomed. A place
 * named in the passage being read, or selected, is drawn regardless. */
export function placeFilter(s: LayerSettings, kind: "points" | "lands" | "seas"): FilterSpecification {
  const groups = PLACE_GROUPS.map((g) => g.key).filter((g) => s.groups[g]);
  const confidence = ["certain", "probable", "possible", "proposed"].slice(0, ["certain", "probable", "possible", "proposed"].indexOf(s.confidence) + 1);
  const testament: ExpressionSpecification =
    s.testament === "ot" ? [">", ["get", "ot"], 0] : s.testament === "nt" ? [">", ["get", "nt"], 0] : ["literal", true];
  const shown: ExpressionSpecification = [
    "all",
    ["in", ["get", "group"], ["literal", groups]],
    ["in", ["get", "confidence"], ["literal", confidence]],
    testament,
    [">=", ["zoom"], ["get", "minzoom"]],
  ];
  const always: ExpressionSpecification = ["any", ["==", ["get", "highlighted"], 1], ["==", ["get", "selected"], 1]];
  const ofKind: ExpressionSpecification =
    kind === "lands"
      ? ["==", ["get", "group"], "lands"]
      : kind === "seas"
        ? ["==", ["get", "sea"], 1]
        : ["all", ["!=", ["get", "group"], "lands"], ["!=", ["get", "sea"], 1]];
  return ["all", ofKind, ["any", shown, always]] as FilterSpecification;
}

function vis(on: boolean): "visible" | "none" {
  return on ? "visible" : "none";
}

export function buildStyle(c: AtlasColors, s: LayerSettings, terrain: { tiles: string } | null): StyleSpecification {
  const size = s.labelSize;
  const placeColor: ExpressionSpecification = [
    "case",
    ["==", ["get", "selected"], 1],
    c.accent,
    ["==", ["get", "highlighted"], 1],
    c.accent,
    [
      "match",
      ["get", "group"],
      "mountains",
      c.mountain,
      "waters",
      c.waterPlace,
      "camps",
      c.camp,
      "sites",
      c.site,
      "valleys",
      c.featureLabel,
      c.ink2,
    ],
  ];
  const certain: ExpressionSpecification = ["in", ["get", "confidence"], ["literal", ["certain", "probable"]]];

  return {
    version: 8,
    glyphs: `${DATA}/fonts/{fontstack}/{range}.pbf`,
    sources: {
      land: geojson("land"),
      lakes: geojson("lakes"),
      rivers: geojson("rivers"),
      borders: geojson("borders"),
      provinces: geojson("provinces"),
      countries: geojson("countries"),
      towns: geojson("towns"),
      marine: geojson("marine"),
      features: geojson("features"),
      places: { type: "geojson", data: EMPTY },
      regions: { type: "geojson", data: EMPTY },
      journey: { type: "geojson", data: EMPTY },
      measure: { type: "geojson", data: EMPTY },
      ...(terrain ? { dem: { type: "raster-dem" as const, tiles: [terrain.tiles], tileSize: 256, encoding: "terrarium" as const, maxzoom: 11 } } : {}),
    },
    layers: [
      { id: "water", type: "background", paint: { "background-color": c.water } },
      { id: "land", type: "fill", source: "land", paint: { "fill-color": c.land, "fill-antialias": true } },
      ...(terrain
        ? [
            {
              id: "hillshade",
              type: "hillshade" as const,
              source: "dem",
              layout: { visibility: vis(s.base === "terrain") },
              paint: {
                "hillshade-exaggeration": 0.55,
                "hillshade-shadow-color": c.dark ? "#000000" : "#5a4a35",
                "hillshade-highlight-color": c.dark ? "#3a3f44" : "#ffffff",
                "hillshade-accent-color": c.dark ? "#1a1a1a" : "#6b5b45",
              },
            },
          ]
        : []),
      { id: "coast", type: "line", source: "land", paint: { "line-color": c.coast, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.4, 8, 1.2] } },
      { id: "lakes", type: "fill", source: "lakes", paint: { "fill-color": c.lake, "fill-outline-color": c.coast } },
      {
        id: "rivers",
        type: "line",
        source: "rivers",
        filter: ["<=", ["get", "rank"], ["interpolate", ["linear"], ["zoom"], 3, 5, 6, 9, 8, 12]],
        paint: { "line-color": c.river, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.6, 7, 1.4, 10, 2.4] },
      },
      {
        id: "provinces",
        type: "line",
        source: "provinces",
        minzoom: 5.5,
        layout: { visibility: vis(s.modernBorders) },
        paint: { "line-color": c.province, "line-width": 0.7, "line-dasharray": [2, 2] },
      },
      {
        id: "borders",
        type: "line",
        source: "borders",
        layout: { visibility: vis(s.modernBorders), "line-join": "round" },
        paint: { "line-color": c.border, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.8, 8, 1.6], "line-dasharray": [3, 1.5, 1, 1.5] },
      },
      {
        id: "regions-fill",
        type: "fill",
        source: "regions",
        filter: s.regions ? ["literal", true] : ["==", ["get", "selected"], 1],
        paint: { "fill-color": c.region, "fill-opacity": ["case", ["==", ["get", "selected"], 1], 0.16, 0.05] },
      },
      {
        id: "regions-line",
        type: "line",
        source: "regions",
        filter: s.regions ? ["literal", true] : ["==", ["get", "selected"], 1],
        paint: {
          "line-color": ["case", ["==", ["get", "selected"], 1], c.accent, c.region],
          "line-opacity": ["case", ["==", ["get", "selected"], 1], 0.9, 0.45],
          "line-width": ["case", ["==", ["get", "selected"], 1], 2, 1],
          "line-dasharray": [2, 2],
        },
      },
      {
        id: "journey-line",
        type: "line",
        source: "journey",
        filter: ["==", ["geometry-type"], "LineString"],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": c.accent, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 2, 9, 4], "line-opacity": 0.85 },
      },
      {
        id: "journey-arrows",
        type: "symbol",
        source: "journey",
        filter: ["==", ["geometry-type"], "LineString"],
        layout: { "symbol-placement": "line", "symbol-spacing": 90, "icon-image": "arrow", "icon-size": 0.7, "icon-allow-overlap": true, "icon-rotation-alignment": "map" },
      },
      {
        id: "measure-line",
        type: "line",
        source: "measure",
        filter: ["==", ["geometry-type"], "LineString"],
        layout: { "line-cap": "round" },
        paint: { "line-color": c.measure, "line-width": 2.5, "line-dasharray": [2, 1.5] },
      },
      {
        id: "towns",
        type: "circle",
        source: "towns",
        layout: { visibility: vis(s.modernTowns) },
        filter: ["<=", ["get", "rank"], ["interpolate", ["linear"], ["zoom"], 3, 2, 5, 4, 7, 7, 9, 10]],
        paint: { "circle-radius": 2.5, "circle-color": c.land, "circle-stroke-color": c.town, "circle-stroke-width": 1.2 },
      },
      {
        id: "towns-label",
        type: "symbol",
        source: "towns",
        layout: {
          visibility: vis(s.modernTowns && s.labels),
          "text-field": ["get", "name"],
          "text-font": FONT_ITALIC,
          "text-size": size - 1.5,
          "text-offset": [0, 0.9],
          "text-anchor": "top",
          "symbol-sort-key": ["get", "rank"],
        },
        filter: ["<=", ["get", "rank"], ["interpolate", ["linear"], ["zoom"], 3, 2, 5, 4, 7, 7, 9, 10]],
        paint: { "text-color": c.townLabel, "text-halo-color": c.halo, "text-halo-width": 1.2 },
      },
      {
        id: "marine-label",
        type: "symbol",
        source: "marine",
        layout: {
          visibility: vis(s.physicalNames && s.labels),
          "text-field": ["get", "name"],
          "text-font": FONT_ITALIC,
          "text-size": ["interpolate", ["linear"], ["zoom"], 3, size - 1, 7, size + 2],
          "text-letter-spacing": 0.15,
          "text-max-width": 8,
          "symbol-sort-key": ["get", "rank"],
        },
        filter: ["<=", ["get", "rank"], ["interpolate", ["linear"], ["zoom"], 3, 2, 5, 4, 7, 8]],
        paint: { "text-color": c.waterLabel, "text-halo-color": c.water, "text-halo-width": 1 },
      },
      {
        id: "features-label",
        type: "symbol",
        source: "features",
        layout: {
          visibility: vis(s.physicalNames && s.labels),
          "text-field": ["upcase", ["get", "name"]],
          "text-font": FONT_ITALIC,
          "text-size": size - 2,
          "text-letter-spacing": 0.2,
          "text-max-width": 9,
          "symbol-sort-key": ["get", "rank"],
        },
        filter: ["<=", ["get", "rank"], ["interpolate", ["linear"], ["zoom"], 3, 2, 5, 4, 7, 7]],
        paint: { "text-color": c.featureLabel, "text-halo-color": c.halo, "text-halo-width": 1 },
      },
      {
        id: "countries-label",
        type: "symbol",
        source: "countries",
        layout: {
          visibility: vis(s.modernCountries && s.labels),
          "text-field": ["upcase", ["get", "name"]],
          "text-font": FONT_BOLD,
          "text-size": size - 1,
          "text-letter-spacing": 0.25,
          "text-max-width": 8,
          "symbol-sort-key": ["get", "rank"],
        },
        paint: { "text-color": c.countryLabel, "text-halo-color": c.halo, "text-halo-width": 1.2, "text-opacity": 0.85 },
      },
      {
        id: "lands-label",
        type: "symbol",
        source: "places",
        filter: placeFilter(s, "lands"),
        layout: {
          visibility: vis(s.labels),
          "text-field": ["upcase", ["get", "label"]],
          "text-font": FONT_ITALIC,
          "text-size": ["interpolate", ["linear"], ["get", "rank"], 1, size - 2, 60, size + 1, 300, size + 4],
          "text-letter-spacing": 0.22,
          "text-max-width": 9,
          "symbol-sort-key": ["-", 0, ["get", "rank"]],
          "text-padding": 6,
        },
        paint: {
          "text-color": ["case", ["any", ["==", ["get", "selected"], 1], ["==", ["get", "highlighted"], 1]], c.accent, c.region],
          "text-halo-color": c.halo,
          "text-halo-width": 1.2,
        },
      },
      {
        id: "seas-label",
        type: "symbol",
        source: "places",
        filter: placeFilter(s, "seas"),
        layout: {
          visibility: vis(s.labels),
          "text-field": ["get", "label"],
          "text-font": FONT_ITALIC,
          "text-size": ["interpolate", ["linear"], ["get", "rank"], 1, size - 1, 30, size + 1, 100, size + 3],
          "text-letter-spacing": 0.12,
          "text-max-width": 7,
          "symbol-sort-key": ["-", 0, ["get", "rank"]],
        },
        paint: {
          "text-color": ["case", ["any", ["==", ["get", "selected"], 1], ["==", ["get", "highlighted"], 1]], c.accent, c.waterLabel],
          "text-halo-color": c.water,
          "text-halo-width": 1,
        },
      },
      {
        id: "places-dot",
        type: "circle",
        source: "places",
        filter: placeFilter(s, "points"),
        paint: {
          "circle-radius": [
            "+",
            ["case", ["==", ["get", "selected"], 1], 2.5, ["==", ["get", "highlighted"], 1], 1.2, 0],
            ["interpolate", ["linear"], ["get", "rank"], 1, 2.6, 40, 3.8, 200, 5],
          ],
          "circle-color": ["case", certain, placeColor, c.land],
          "circle-stroke-color": placeColor,
          "circle-stroke-width": ["case", certain, 1.2, 1.6],
          "circle-opacity": ["case", ["==", ["get", "confidence"], "proposed"], 0.75, 1],
          "circle-stroke-opacity": ["case", ["==", ["get", "confidence"], "proposed"], 0.75, 1],
        },
      },
      {
        id: "places-label",
        type: "symbol",
        source: "places",
        filter: placeFilter(s, "points"),
        layout: {
          visibility: vis(s.labels),
          "text-field": ["get", "label"],
          "text-font": ["case", ["any", ["==", ["get", "selected"], 1], [">=", ["get", "rank"], 60]], ["literal", FONT_BOLD], ["literal", FONT]],
          "text-size": ["interpolate", ["linear"], ["get", "rank"], 1, size - 1, 60, size + 1, 300, size + 3],
          "text-variable-anchor": ["left", "right", "top", "bottom"],
          "text-radial-offset": 0.7,
          "text-justify": "auto",
          "symbol-sort-key": ["case", ["==", ["get", "selected"], 1], -100000, ["==", ["get", "highlighted"], 1], -50000, ["-", 0, ["get", "rank"]]],
          "text-padding": 3,
        },
        paint: {
          "text-color": ["case", ["any", ["==", ["get", "selected"], 1], ["==", ["get", "highlighted"], 1]], c.accent, ["==", ["get", "group"], "waters"], c.waterLabel, c.ink],
          "text-halo-color": c.halo,
          "text-halo-width": 1.4,
        },
      },
      {
        id: "journey-stops",
        type: "circle",
        source: "journey",
        filter: ["==", ["geometry-type"], "Point"],
        paint: { "circle-radius": 9, "circle-color": c.accent, "circle-stroke-color": c.halo, "circle-stroke-width": 1.5 },
      },
      {
        id: "journey-numbers",
        type: "symbol",
        source: "journey",
        filter: ["==", ["geometry-type"], "Point"],
        layout: { "text-field": ["to-string", ["get", "n"]], "text-font": FONT_BOLD, "text-size": 10, "text-allow-overlap": true },
        paint: { "text-color": c.dark ? "#111" : "#fff" },
      },
      {
        id: "measure-points",
        type: "circle",
        source: "measure",
        filter: ["==", ["geometry-type"], "Point"],
        paint: { "circle-radius": 4, "circle-color": c.measure, "circle-stroke-color": c.halo, "circle-stroke-width": 1.5 },
      },
      {
        id: "measure-labels",
        type: "symbol",
        source: "measure",
        filter: ["all", ["==", ["geometry-type"], "Point"], ["has", "label"]],
        layout: { "text-field": ["get", "label"], "text-font": FONT_BOLD, "text-size": 11, "text-offset": [0, -1.2], "text-allow-overlap": true },
        paint: { "text-color": c.measure, "text-halo-color": c.halo, "text-halo-width": 1.6 },
      },
    ],
  };
}

/** Applies changed settings to a map in place: visibility and filters, so
 * the view does not flash as a whole new style would make it. */
export function applySettings(map: MapLibreMap, s: LayerSettings): void {
  const set = (id: string, on: boolean) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", vis(on));
  set("hillshade", s.base === "terrain");
  set("provinces", s.modernBorders);
  set("borders", s.modernBorders);
  // A selected land's outline shows whether or not the others do.
  const regionFilter: FilterSpecification = s.regions ? ["literal", true] : ["==", ["get", "selected"], 1];
  map.setFilter("regions-fill", regionFilter);
  map.setFilter("regions-line", regionFilter);
  set("towns", s.modernTowns);
  set("towns-label", s.modernTowns && s.labels);
  set("marine-label", s.physicalNames && s.labels);
  set("features-label", s.physicalNames && s.labels);
  set("countries-label", s.modernCountries && s.labels);
  set("lands-label", s.labels);
  set("places-label", s.labels);
  set("seas-label", s.labels);
  map.setFilter("seas-label", placeFilter(s, "seas"));
  map.setFilter("lands-label", placeFilter(s, "lands"));
  map.setFilter("places-dot", placeFilter(s, "points"));
  map.setFilter("places-label", placeFilter(s, "points"));
}
