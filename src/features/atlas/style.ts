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

/** A map pack's tiles, as the map reads them. */
export interface TileSource {
  tiles: string;
  format: string;
  encoding: string | null;
  minzoom: number;
  maxzoom: number;
  attribution: string;
}
export type Confidence = "certain" | "probable" | "possible" | "proposed";

export interface LayerSettings {
  base: BaseMap;
  groups: Record<PlaceGroup, boolean>;
  /** Ancient lands drawn as areas. */
  regions: boolean;
  /** Roman roads (AWMC), from zoom 5. */
  romanRoads: boolean;
  /** The great Old Testament routes: the Way of the Sea, the King's Highway... */
  otRoutes: boolean;
  modernTowns: boolean;
  modernBorders: boolean;
  modernCountries: boolean;
  /** Names of seas, deserts and ranges, from the base map. */
  physicalNames: boolean;
  labels: boolean;
  labelSize: number;
  /** The land raised in relief, when the terrain pack is installed. */
  relief3d: boolean;
  testament: Testament;
  /** The least certain identification still drawn. */
  confidence: Confidence;
  /** With a chapter's places or a journey on the map, the rest fade back. */
  fadeOthers: boolean;
}

export const DEFAULT_LAYERS: LayerSettings = {
  base: "terrain",
  groups: Object.fromEntries(PLACE_GROUPS.map((g) => [g.key, g.key !== "sites" && g.key !== "camps"])) as Record<PlaceGroup, boolean>,
  regions: false,
  romanRoads: true,
  otRoutes: true,
  modernTowns: false,
  modernBorders: false,
  modernCountries: false,
  physicalNames: true,
  labels: true,
  labelSize: 12,
  relief3d: false,
  testament: "both",
  confidence: "proposed",
  fadeOthers: true,
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
    road: dark ? "#9a7b55" : "#a0703f",
    route: dark ? "#c9935a" : "#b0542f",
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
export const DATA = typeof location === "undefined" ? "/atlas" : `${location.origin}/atlas`;

function geojson(file: string) {
  return { type: "geojson" as const, data: `${DATA}/${file}.geojson` };
}

const EMPTY = { type: "FeatureCollection" as const, features: [] };

/** Which places are drawn, from the settings: their group, their Testament,
 * how sure the identification is, and how far in the map is zoomed. A place
 * in focus -- named in the passage being read, a stop on the journey shown,
 * or selected -- is drawn regardless. */
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
  const always: ExpressionSpecification = ["==", ["get", "focus"], 1];
  const ofKind: ExpressionSpecification =
    kind === "lands"
      ? ["==", ["get", "group"], "lands"]
      : kind === "seas"
        ? ["==", ["get", "sea"], 1]
        : ["all", ["!=", ["get", "group"], "lands"], ["!=", ["get", "sea"], 1]];
  return ["all", ofKind, ["any", shown, always]] as FilterSpecification;
}

/** The point places of one of the three layers that draw them: faded back,
 * named in the ordinary way, or in focus. */
export function pointsFilter(s: LayerSettings, layer: "faint" | "named" | "focus"): FilterSpecification {
  const which =
    layer === "faint"
      ? [["==", ["get", "dim"], 1]]
      : layer === "focus"
        ? [["==", ["get", "focus"], 1]]
        : [["!=", ["get", "dim"], 1], ["!=", ["get", "focus"], 1]];
  return ["all", placeFilter(s, "points"), ...which] as unknown as FilterSpecification;
}

function vis(on: boolean): "visible" | "none" {
  return on ? "visible" : "none";
}

function demSource(terrain: TileSource, credited: boolean) {
  return {
    type: "raster-dem" as const,
    tiles: [terrain.tiles],
    tileSize: 256,
    encoding: (terrain.encoding === "mapbox" ? "mapbox" : "terrarium") as "mapbox" | "terrarium",
    minzoom: terrain.minzoom,
    maxzoom: terrain.maxzoom,
    // The sources' full credit is in Settings (Packs, and About); once is enough here.
    ...(credited ? { attribution: "Terrain: USGS (SRTM, GMTED2010), NOAA (ETOPO1), Copernicus (EU-DEM)" } : {}),
  };
}

/** Each label layer's type size, from the size picked in Layers: set when the
 * style is built, and changed in place after without rebuilding the map. */
export function labelSizes(size: number): Record<string, number | ExpressionSpecification> {
  return {
    "roads-label": size - 1.5,
    "towns-label": size - 1.5,
    "marine-label": ["interpolate", ["linear"], ["zoom"], 3, size - 1, 7, size + 2],
    "features-label": size - 2,
    "countries-label": size - 1,
    "lands-label": ["interpolate", ["linear"], ["get", "rank"], 1, size - 2, 60, size + 1, 300, size + 4],
    "seas-label": ["interpolate", ["linear"], ["get", "rank"], 1, size - 1, 30, size + 1, 100, size + 3],
    places: ["interpolate", ["linear"], ["get", "rank"], 1, size - 1, 60, size, 300, size + 2],
    "places-focus": ["interpolate", ["linear"], ["get", "rank"], 1, size, 60, size + 1, 300, size + 2],
  };
}

/** A place's dot is an image named for its colour and fill (see
 * placeImage), drawn when the map first asks for it. */
const PLACE_ICON: ExpressionSpecification = [
  "concat",
  "pt-",
  ["get", "tone"],
  ["case", ["in", ["get", "confidence"], ["literal", ["certain", "probable"]]], "-f", "-o"],
];

function placeLayout(s: LayerSettings, size: number | ExpressionSpecification, focus: boolean) {
  return {
    "icon-image": PLACE_ICON,
    "icon-size": ["interpolate", ["linear"], ["get", "rank"], 1, focus ? 0.8 : 0.6, 40, focus ? 0.95 : 0.8, 200, focus ? 1.15 : 1] as ExpressionSpecification,
    // Without names the dots alone are the map, and all of them are shown.
    "icon-allow-overlap": focus || !s.labels,
    "icon-padding": 1,
    "text-field": s.labels ? (["get", "label"] as ExpressionSpecification) : "",
    "text-font": ["case", ["any", ["==", ["get", "selected"], 1], [">=", ["get", "rank"], 60]], ["literal", FONT_BOLD], ["literal", FONT]] as ExpressionSpecification,
    "text-size": size,
    "text-variable-anchor": ["left", "right", "top", "bottom"] as ("left" | "right" | "top" | "bottom")[],
    "text-radial-offset": focus ? 0.9 : 0.6,
    "text-justify": "auto" as const,
    "text-padding": focus ? 2 : 4,
    // A place in focus keeps its dot even where its name will not fit.
    "text-optional": focus,
    "symbol-sort-key": ["case", ["==", ["get", "selected"], 1], -100000, ["-", 0, ["get", "rank"]]] as ExpressionSpecification,
  };
}

/** The image for a place's dot: "pt-<tone>-f" filled, "pt-<tone>-o" open
 * (an identification less than probable), in the tone's colour. */
export function placeImage(id: string, c: AtlasColors): ImageData | null {
  const m = /^pt-(\w+)-([fo])$/.exec(id);
  if (!m) return null;
  const color = (c as unknown as Record<string, string>)[m[1]] ?? c.ink2;
  const ratio = 2;
  const size = 16 * ratio;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const r = 5 * ratio;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
  if (m[2] === "f") {
    // A filled dot inside a ring of the halo colour, to stand off the map.
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1.6 * ratio;
    ctx.strokeStyle = c.halo;
    ctx.stroke();
  } else {
    ctx.fillStyle = c.land;
    ctx.fill();
    ctx.lineWidth = 1.8 * ratio;
    ctx.strokeStyle = color;
    ctx.stroke();
  }
  return ctx.getImageData(0, 0, size, size);
}

export function buildStyle(c: AtlasColors, s: LayerSettings, terrain: TileSource | null, imagery: TileSource | null): StyleSpecification {
  const sizes = labelSizes(s.labelSize);
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
      roads: geojson("roads"),
      features: geojson("features"),
      places: { type: "geojson", data: EMPTY },
      regions: { type: "geojson", data: EMPTY },
      journey: { type: "geojson", data: EMPTY },
      measure: { type: "geojson", data: EMPTY },
      // The same elevation twice: MapLibre shades and raises the land
      // better from a source each than from one shared.
      ...(terrain
        ? {
            dem: demSource(terrain, true),
            "dem-shade": demSource(terrain, false),
          }
        : {}),
      ...(imagery
        ? {
            imagery: {
              type: "raster" as const,
              tiles: [imagery.tiles],
              tileSize: 256,
              minzoom: imagery.minzoom,
              maxzoom: imagery.maxzoom,
              attribution: imagery.attribution,
            },
          }
        : {}),
    },
    layers: [
      { id: "water", type: "background", paint: { "background-color": c.water } },
      { id: "land", type: "fill", source: "land", paint: { "fill-color": c.land, "fill-antialias": true } },
      ...(imagery
        ? [
            {
              id: "imagery",
              type: "raster" as const,
              source: "imagery",
              layout: { visibility: vis(s.base === "satellite") },
              paint: { "raster-opacity": 1, "raster-fade-duration": 150 },
            },
          ]
        : []),
      ...(terrain
        ? [
            {
              id: "hillshade",
              type: "hillshade" as const,
              source: "dem-shade",
              layout: { visibility: vis(s.base === "terrain" || s.base === "satellite") },
              paint: {
                "hillshade-exaggeration": s.base === "satellite" ? 0.25 : 0.55,
                "hillshade-shadow-color": c.dark ? "#000000" : "#5a4a35",
                "hillshade-highlight-color": c.dark ? "#3a3f44" : "#ffffff",
                "hillshade-accent-color": c.dark ? "#1a1a1a" : "#6b5b45",
              },
            },
          ]
        : []),
      { id: "coast", type: "line", source: "land", layout: { visibility: vis(s.base !== "satellite" || !imagery) }, paint: { "line-color": c.coast, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.4, 8, 1.2] } },
      { id: "lakes", type: "fill", source: "lakes", layout: { visibility: vis(s.base !== "satellite" || !imagery) }, paint: { "fill-color": c.lake, "fill-outline-color": c.coast } },
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
        id: "roman-roads",
        type: "line",
        source: "roads",
        minzoom: 4.5,
        filter: ["==", ["get", "kind"], "roman"],
        layout: { visibility: vis(s.romanRoads), "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": c.road,
          "line-width": ["interpolate", ["linear"], ["zoom"], 5, ["case", ["==", ["get", "major"], 1], 1.1, 0.6], 9, ["case", ["==", ["get", "major"], 1], 2.4, 1.3]],
          // Dashes cannot vary by feature, so a conjectured course is fainter.
          "line-opacity": ["case", ["==", ["get", "known"], 1], 0.85, 0.4],
        },
      },
      {
        id: "ot-routes",
        type: "line",
        source: "roads",
        filter: ["==", ["get", "kind"], "ot"],
        layout: { visibility: vis(s.otRoutes), "line-join": "round", "line-cap": "round" },
        paint: { "line-color": c.route, "line-width": ["interpolate", ["linear"], ["zoom"], 4, 1.4, 9, 3], "line-opacity": 0.75, "line-dasharray": [2.5, 1.5] },
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
        id: "journey-casing",
        type: "line",
        source: "journey",
        filter: ["all", ["==", ["geometry-type"], "LineString"], ["!=", ["get", "way"], "open"]],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": c.halo, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 4, 9, 7] },
      },
      {
        id: "journey-line",
        type: "line",
        source: "journey",
        filter: ["all", ["==", ["geometry-type"], "LineString"], ["!=", ["get", "way"], "open"]],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": c.accent, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 2, 9, 4], "line-opacity": 0.9 },
      },
      // A leg of a Roman-era journey that no road serves: by sea, or across country.
      {
        id: "journey-open",
        type: "line",
        source: "journey",
        filter: ["all", ["==", ["geometry-type"], "LineString"], ["==", ["get", "way"], "open"]],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": c.accent, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1.8, 9, 3.2], "line-opacity": 0.85, "line-dasharray": [2, 2] },
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
        id: "roads-label",
        type: "symbol",
        source: "roads",
        minzoom: 5.5,
        filter: ["all", ["!=", ["get", "name"], ""], ["any", ["==", ["get", "kind"], "ot"], ["==", ["get", "major"], 1]]],
        layout: {
          visibility: vis(s.labels && (s.romanRoads || s.otRoutes)),
          "symbol-placement": "line",
          "text-field": ["get", "name"],
          "text-font": FONT_ITALIC,
          "text-size": sizes["roads-label"],
          "symbol-spacing": 400,
          "text-letter-spacing": 0.05,
        },
        paint: { "text-color": ["case", ["==", ["get", "kind"], "ot"], c.route, c.road], "text-halo-color": c.halo, "text-halo-width": 1.3 },
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
          "text-size": sizes["towns-label"],
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
          "text-size": sizes["marine-label"],
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
          "text-size": sizes["features-label"],
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
          "text-size": sizes["countries-label"],
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
          "text-size": sizes["lands-label"],
          "text-letter-spacing": 0.22,
          "text-max-width": 9,
          "symbol-sort-key": ["-", 0, ["get", "rank"]],
          "text-padding": 6,
        },
        paint: {
          "text-color": ["case", ["==", ["get", "focus"], 1], c.accent, c.region],
          "text-halo-color": c.halo,
          "text-halo-width": 1.2,
          "text-opacity": ["case", ["==", ["get", "dim"], 1], 0.35, 1],
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
          "text-size": sizes["seas-label"],
          "text-letter-spacing": 0.12,
          "text-max-width": 7,
          "symbol-sort-key": ["-", 0, ["get", "rank"]],
        },
        paint: {
          "text-color": ["case", ["==", ["get", "focus"], 1], c.accent, c.waterLabel],
          "text-halo-color": c.water,
          "text-halo-width": 1,
          "text-opacity": ["case", ["==", ["get", "dim"], 1], 0.35, 1],
        },
      },
      // Places out of focus, while a chapter or a journey is shown: faint
      // dots for context, unnamed, never in the way.
      {
        id: "places-faint",
        type: "circle",
        source: "places",
        filter: pointsFilter(s, "faint"),
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "rank"], 1, 1.8, 200, 3],
          "circle-color": c.ink3,
          "circle-opacity": 0.4,
        },
      },
      // Every other place is a dot and a name that stand or fall together,
      // the way a road map names a town or leaves it off: where names would
      // crowd, the lesser place gives way, dot and all, until the reader
      // zooms in and there is room.
      {
        id: "places",
        type: "symbol",
        source: "places",
        filter: pointsFilter(s, "named"),
        layout: placeLayout(s, sizes.places, false),
        paint: {
          "text-color": ["case", ["==", ["get", "group"], "waters"], c.waterLabel, c.ink],
          "text-halo-color": c.halo,
          "text-halo-width": 1.4,
          "icon-opacity": ["case", ["==", ["get", "confidence"], "proposed"], 0.75, 1],
        },
      },
      // The places in focus: always drawn, and named wherever there is room.
      {
        id: "places-focus",
        type: "symbol",
        source: "places",
        filter: pointsFilter(s, "focus"),
        layout: placeLayout(s, sizes["places-focus"], true),
        paint: { "text-color": c.accent, "text-halo-color": c.halo, "text-halo-width": 1.6 },
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
  set("hillshade", s.base === "terrain" || s.base === "satellite");
  set("imagery", s.base === "satellite");
  // Over the pictures the drawn water and coastline only get in the way.
  const pictures = s.base === "satellite" && !!map.getLayer("imagery");
  set("lakes", !pictures);
  set("coast", !pictures);
  if (map.getLayer("hillshade")) map.setPaintProperty("hillshade", "hillshade-exaggeration", s.base === "satellite" ? 0.25 : 0.55);
  // Relief in 3D: the land raised on the elevation tiles, seen at a tilt.
  const relief = s.relief3d && !!map.getSource("dem");
  map.setTerrain(relief ? { source: "dem", exaggeration: 1.4 } : null);
  if (relief && map.getPitch() < 20) map.easeTo({ pitch: 55, duration: 600 });
  if (!relief && map.getPitch() > 0) map.easeTo({ pitch: 0, duration: 400 });
  set("roman-roads", s.romanRoads);
  set("ot-routes", s.otRoutes);
  set("roads-label", s.labels && (s.romanRoads || s.otRoutes));
  if (map.getLayer("roads-label")) {
    const kinds = [...(s.otRoutes ? ["ot"] : []), ...(s.romanRoads ? ["roman"] : [])];
    map.setFilter("roads-label", ["all", ["!=", ["get", "name"], ""], ["in", ["get", "kind"], ["literal", kinds]], ["any", ["==", ["get", "kind"], "ot"], ["==", ["get", "major"], 1]]]);
  }
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
  set("seas-label", s.labels);
  map.setFilter("seas-label", placeFilter(s, "seas"));
  map.setFilter("lands-label", placeFilter(s, "lands"));
  map.setFilter("places-faint", pointsFilter(s, "faint"));
  map.setFilter("places", pointsFilter(s, "named"));
  map.setFilter("places-focus", pointsFilter(s, "focus"));
  for (const id of ["places", "places-focus"]) {
    map.setLayoutProperty(id, "text-field", s.labels ? ["get", "label"] : "");
    map.setLayoutProperty(id, "icon-allow-overlap", id === "places-focus" || !s.labels);
  }
  // The type size, in place: a whole new style would only flash.
  for (const [id, size] of Object.entries(labelSizes(s.labelSize))) if (map.getLayer(id)) map.setLayoutProperty(id, "text-size", size);
}
