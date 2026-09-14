import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AtlasJourney, AtlasPlace } from "../../api/types";
import { cx } from "../../components/ui/classes";
import {
  clampScale,
  fitTo,
  groupTransform,
  overlaps,
  project,
  toScreen,
  toWorld,
  type LabelBox,
  type Size,
  type View,
  type WorldPoint,
} from "./projection";

interface Basemap {
  bbox: [number, number, number, number];
  land: [number, number][][];
  lakes: [number, number][][];
  rivers: [number, number][][];
}

/** A region's extent: what it could not have exceeded, and its best line. */
interface Border {
  name: string;
  outer: [number, number][];
  core: [number, number][];
}
type Borders = Record<string, Border>;

/** Marker size by how much of Scripture a place appears in. */
function radiusFor(place: AtlasPlace, selected: boolean, highlighted: boolean): number {
  if (selected) return 6.5;
  const base = place.verse_count >= 200 ? 4.5 : place.verse_count >= 40 ? 3.8 : place.verse_count >= 8 ? 3.2 : 2.6;
  return highlighted ? base + 1 : base;
}

/**
 * How much of Scripture a place appears in, in steps -- the atlas's measure
 * of importance, and what decides when it is worth drawing.
 *
 * Five places reach the first step (Jerusalem, Egypt, Babylon, the Jordan,
 * Moab) and 1,335 reach the last. The steps are close together because a
 * coarse ladder wastes the budget: jumping straight from 51 places to 139
 * means a screen with room for a hundred shows fifty.
 */
const TIERS = [150, 90, 55, 35, 22, 14, 9, 6, 4, 3, 2, 1, 0];

/** A region has to be this much of Scripture before its border is drawn for
 *  context alone -- Egypt, Assyria, Moab, Canaan and their like. */
const MAJOR_BORDER = 50;
const MAJOR_BORDER_LIMIT = 6;

/** Regions and waters are named across their area, the way a map names a
 *  country or a sea, rather than tagged beside a dot. */
const AREA_CATEGORIES = new Set(["region", "water"]);
const AREA_LABEL_LIMIT = 16;
/** Extra width each letter of an upper-case area name takes, as a fraction
 *  of the type size -- it must match the letterSpacing used to draw them. */
const AREA_TRACKING = 0.18;

type AreaLabel = {
  place: AtlasPlace;
  text: string;
  water: boolean;
  type: number;
  cx: number;
  cy: number;
  x: number;
  y: number;
  width: number;
  height: number;
};
type PointLabel = {
  marker: { place: AtlasPlace; x: number; y: number };
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * The most generous importance threshold that still fits inside `budget`.
 *
 * This is what makes the map behave the way a reader expects: zooming in
 * narrows the view, fewer places fall inside it, a lower threshold fits, and
 * more names appear. It also adapts to where you are -- the same zoom shows
 * far more detail over Judea than over Arabia, because Judea is where the
 * places are.
 */
function thresholdFor(counts: number[], budget: number): number {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (counts[i] <= budget) return TIERS[i];
  }
  return TIERS[0];
}

function tierCounts(places: { place: AtlasPlace }[]): number[] {
  const counts = TIERS.map(() => 0);
  for (const { place } of places) {
    for (let i = 0; i < TIERS.length; i++) if (place.verse_count >= TIERS[i]) counts[i]++;
  }
  return counts;
}

function pathFrom(shape: [number, number][], close: boolean): string {
  let d = "";
  for (let i = 0; i < shape.length; i++) {
    const p = project(shape[i][0], shape[i][1]);
    d += `${i === 0 ? "M" : "L"}${p.x.toFixed(3)} ${p.y.toFixed(3)}`;
  }
  return close ? `${d}Z` : d;
}

export interface MapCanvasProps {
  places: AtlasPlace[];
  selected: AtlasPlace | null;
  /** Places named in the passage a linked Bible pane is showing. */
  highlighted: Set<string>;
  journey: AtlasJourney | null;
  showLabels: boolean;
  showBorders: boolean;
  /** Label type size in pixels, from the reader's own setting. */
  labelSize: number;
  onSelect: (place: AtlasPlace) => void;
  /** Bumped by the view to ask for a re-fit (a new passage, a new journey). */
  fitToken: number;
  fitTargets: AtlasPlace[];
  /** "frame" fits the targets on screen; "center" goes to one without
   *  throwing away the zoom the reader had chosen. */
  fitMode: "frame" | "center";
}

export function MapCanvas({
  places,
  selected,
  highlighted,
  journey,
  showLabels,
  showBorders,
  labelSize,
  onSelect,
  fitToken,
  fitTargets,
  fitMode,
}: MapCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [basemap, setBasemap] = useState<Basemap | null>(null);
  const [borders, setBorders] = useState<Borders | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  // ~350KB of coastlines: loaded when the atlas is first opened rather than
  // carried in the bundle for every reader who never opens it.
  useEffect(() => {
    let alive = true;
    import("./basemap.json").then((m) => {
      if (alive) setBasemap((m.default ?? m) as unknown as Basemap);
    });
    import("./borders.json").then((m) => {
      if (alive) setBorders((m.default ?? m) as unknown as Borders);
    });
    return () => {
      alive = false;
    };
  }, []);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const located = useMemo(() => places.filter((p) => p.lon != null && p.lat != null), [places]);

  /**
   * Each region's extent in world units, with the point to write its name
   * at -- measured once when the borders load, not on every pan.
   */
  const borderBoxes = useMemo(() => {
    if (!borders) return null;
    const boxes = new Map<string, { x0: number; y0: number; x1: number; y1: number; area: number; at: WorldPoint }>();
    for (const [slug, border] of Object.entries(borders)) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      let sx = 0, sy = 0;
      const ring = border.core.length >= 3 ? border.core : border.outer;
      for (const [lon, lat] of border.outer) {
        const p = project(lon, lat);
        x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
        y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
      }
      for (const [lon, lat] of ring) {
        const p = project(lon, lat);
        sx += p.x; sy += p.y;
      }
      boxes.set(slug, {
        x0, y0, x1, y1,
        area: (x1 - x0) * (y1 - y0),
        at: { x: sx / ring.length, y: sy / ring.length },
      });
    }
    return boxes;
  }, [borders]);

  // Opening view: the whole gazetteer, so the reader sees the world the
  // Bible happens in before narrowing to any part of it.
  useEffect(() => {
    if (view || !size.width || !located.length) return;
    setView(fitTo(located.map((p) => project(p.lon as number, p.lat as number)), size));
  }, [view, size, located]);

  useEffect(() => {
    if (!size.width || !fitTargets.length) return;
    const points = fitTargets.filter((p) => p.lon != null).map((p) => project(p.lon as number, p.lat as number));
    if (!points.length) return;

    // Picking a place off the map: go to it, but keep the scale the reader
    // had settled on -- re-fitting would throw away the zoom they just used
    // to find it. Only a view too far out to be useful is pulled closer.
    if (fitMode === "center") {
      setView((current) =>
        current ? { cx: points[0].x, cy: points[0].y, k: Math.max(current.k, 90) } : current,
      );
      return;
    }

    const next = fitTo(points, size);
    // A lone place would otherwise fill the screen at maximum zoom with no
    // surroundings, which is the one thing a map is for.
    if (next) setView(points.length === 1 ? { ...next, k: clampScale(130) } : next);
  }, [fitToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoomBy = useCallback(
    (factor: number, focus?: { x: number; y: number }) => {
      setView((current) => {
        if (!current) return current;
        const k = clampScale(current.k * factor);
        if (k === current.k) return current;
        if (!focus) return { ...current, k };
        // Keep the point under the pointer where it is.
        const before = toWorld(focus.x, focus.y, current, size);
        const after = toWorld(focus.x, focus.y, { ...current, k }, size);
        return { cx: current.cx + before.x - after.x, cy: current.cy + before.y - after.y, k };
      });
    },
    [size],
  );

  // React attaches wheel listeners as passive, which cannot preventDefault,
  // and without that the WebView zooms the whole page instead. The reading
  // pane does the same thing for the same reason.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      const rect = host.getBoundingClientRect();
      zoomBy(Math.pow(0.998, e.deltaY), { x: e.clientX - rect.left, y: e.clientY - rect.top });
    };
    host.addEventListener("wheel", onWheel, { passive: false });
    return () => host.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 3) return; // Let a click stay a click.
    d.moved = true;
    d.x = e.clientX;
    d.y = e.clientY;
    setView((current) => (current ? { ...current, cx: current.cx - dx / current.k, cy: current.cy - dy / current.k } : current));
  }

  /**
   * Selection happens here rather than in a handler on each marker.
   *
   * The container captures the pointer so a drag survives the cursor leaving
   * the window, and a captured pointer retargets the click that follows to
   * the container -- so a marker's own onClick never runs. Hit-testing the
   * release point also lets a click land *near* a dot, which matters when
   * the dot is five pixels across.
   */
  function onPointerUp(e: React.PointerEvent) {
    const d = drag.current;
    if (d?.id !== e.pointerId) return;
    drag.current = null;
    if (d.moved) return; // A pan, not a pick.

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let best: { place: AtlasPlace; d2: number } | null = null;
    for (const m of visible) {
      const reach = radiusFor(m.place, m.place.slug === selected?.slug, highlighted.has(m.place.slug)) + 7;
      const d2 = (m.x - x) ** 2 + (m.y - y) ** 2;
      if (d2 <= reach * reach && (!best || d2 < best.d2)) best = { place: m.place, d2 };
    }
    if (best) onSelect(best.place);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const step = 60;
    const pan = (dx: number, dy: number) =>
      setView((c) => (c ? { ...c, cx: c.cx + dx / c.k, cy: c.cy + dy / c.k } : c));
    switch (e.key) {
      case "ArrowLeft": pan(-step, 0); break;
      case "ArrowRight": pan(step, 0); break;
      case "ArrowUp": pan(0, -step); break;
      case "ArrowDown": pan(0, step); break;
      case "+": case "=": zoomBy(1.4); break;
      case "-": case "_": zoomBy(1 / 1.4); break;
      default: return;
    }
    e.preventDefault();
  }

  const basePaths = useMemo(() => {
    if (!basemap) return null;
    return {
      land: basemap.land.map((r) => pathFrom(r, true)).join(""),
      lakes: basemap.lakes.map((r) => pathFrom(r, true)).join(""),
      rivers: basemap.rivers.map((r) => pathFrom(r, false)).join(""),
    };
  }, [basemap]);

  // Markers, in screen space. Anything off-screen is dropped before it
  // reaches the DOM: at full zoom that is most of the gazetteer.
  const markers = useMemo(() => {
    if (!view || !size.width) return [];
    const margin = 40;
    return located
      .map((place) => ({ place, ...toScreen(project(place.lon as number, place.lat as number), view, size) }))
      .filter((m) => m.x > -margin && m.x < size.width + margin && m.y > -margin && m.y < size.height + margin);
  }, [located, view, size]);

  /** Places shown whatever the zoom: the reader put them on the map. */
  const always = useMemo(() => {
    const journeySlugs = new Set((journey?.legs ?? []).map((l) => l.place_slug).filter(Boolean) as string[]);
    return (place: AtlasPlace) =>
      place.slug === selected?.slug || highlighted.has(place.slug) || journeySlugs.has(place.slug);
  }, [selected, highlighted, journey]);

  /** The importance a place needs to earn a dot at this zoom. */
  const threshold = useMemo(() => {
    const area = size.width * size.height;
    return thresholdFor(tierCounts(markers), Math.max(30, Math.round(area / 11000)));
  }, [markers, size]);

  const visible = useMemo(
    () => markers.filter((m) => m.place.verse_count >= threshold || always(m.place)),
    [markers, threshold, always],
  );

  /**
   * The whole label layout, in one pass.
   *
   * Territories and settlements queue together, most-named first, and the
   * first one to reach a piece of the map keeps it. Two passes -- areas then
   * points -- read well until you notice that at the world view the river
   * Jordan had taken the space Jerusalem wanted. Importance decides, not
   * which kind of thing it is.
   */
  const { areaLabels, labels } = useMemo(() => {
    const empty = { areaLabels: [] as AreaLabel[], labels: [] as PointLabel[] };
    if (!showLabels || !view || !size.width) return empty;

    const journeySlugs = new Set((journey?.legs ?? []).map((l) => l.place_slug).filter(Boolean) as string[]);
    const rank = (place: AtlasPlace) =>
      (place.slug === selected?.slug ? 3 : 0) + (highlighted.has(place.slug) ? 2 : 0) + (journeySlugs.has(place.slug) ? 1 : 0);

    const type = labelSize * 1.1;
    const areaCandidates: AreaLabel[] = markers
      .filter((m) => AREA_CATEGORIES.has(m.place.category))
      .map((m) => {
        const box = borderBoxes?.get(m.place.slug);
        const at = box ? toScreen(box.at, view, size) : { x: m.x, y: m.y };
        const water = m.place.category === "water";
        // "Galilee 1" is the gazetteer disambiguating itself; a map just
        // says Galilee.
        const bare = m.place.name.replace(/ \d+$/, "");
        const text = water ? bare : bare.toUpperCase();
        // Letter-spacing is most of an upper-case name's width; leaving it
        // out of the estimate is what let CANAAN and GILEAD collide.
        const width = text.length * type * (water ? 0.5 : 0.68 + AREA_TRACKING);
        return { place: m.place, text, water, type, cx: at.x, cy: at.y, x: at.x - width / 2, y: at.y, width, height: type + 4 };
      })
      .filter((l) => l.cx > -60 && l.cx < size.width + 60 && l.cy > -30 && l.cy < size.height + 30);

    const area = size.width * size.height;
    const pointLimit = Math.max(12, Math.round(area / (labelSize * 1500)));
    const threshold = thresholdFor(tierCounts(visible), pointLimit);
    const pointCandidates: PointLabel[] = visible
      .filter((m) => !AREA_CATEGORIES.has(m.place.category))
      .filter((m) => m.place.verse_count >= threshold || rank(m.place) > 0)
      .map((m) => ({
        marker: m,
        x: m.x + radiusFor(m.place, false, false) + 4,
        y: m.y + labelSize * 0.36,
        width: m.place.name.length * labelSize * 0.55 + 4,
        height: labelSize + 2,
      }));

    const queue: ({ area: AreaLabel; point?: undefined } | { point: PointLabel; area?: undefined })[] = [
      ...areaCandidates.map((a) => ({ area: a })),
      ...pointCandidates.map((p) => ({ point: p })),
    ];
    const importance = (e: (typeof queue)[number]) => {
      const place = e.area ? e.area.place : e.point!.marker.place;
      return { rank: rank(place), verses: place.verse_count };
    };
    queue.sort((a, b) => {
      const x = importance(a), y = importance(b);
      return y.rank - x.rank || y.verses - x.verses;
    });

    const taken: LabelBox[] = [];
    const areas: AreaLabel[] = [];
    const points: PointLabel[] = [];
    for (const entry of queue) {
      const label = entry.area ?? entry.point!;
      if (entry.area && areas.length >= AREA_LABEL_LIMIT) continue;
      if (entry.point && points.length >= pointLimit * 2) continue;
      const box = { left: label.x, right: label.x + label.width, top: label.y - label.height, bottom: label.y };
      if (overlaps(box, taken)) continue;
      taken.push(box);
      if (entry.area) areas.push(entry.area);
      else points.push(entry.point!);
    }
    return { areaLabels: areas, labels: points };
  }, [markers, visible, showLabels, labelSize, borderBoxes, selected, highlighted, journey, view, size]);

  /**
   * The borders to draw.
   *
   * A map that outlines every region at once is unreadable, and most of
   * these overlap -- Judea sits inside Canaan sits inside Syria. So: the
   * region you picked, whatever the passage put on the map, and a handful of
   * the major territories for bearings. That is how an atlas behaves, and it
   * keeps the line you actually asked for the one you can see.
   */
  const borderShapes = useMemo(() => {
    if (!showBorders || !borders || !borderBoxes || !view || !size.width) return [];
    const topLeft = toWorld(0, 0, view, size);
    const bottomRight = toWorld(size.width, size.height, view, size);
    const viewArea = (bottomRight.x - topLeft.x) * (bottomRight.y - topLeft.y);
    const onScreen = (slug: string) => {
      const box = borderBoxes.get(slug);
      return box && !(box.x1 < topLeft.x || box.x0 > bottomRight.x || box.y1 < topLeft.y || box.y0 > bottomRight.y);
    };

    const withBorder = located.filter((p) => borders[p.slug] && onScreen(p.slug));
    const chosen = new Map<string, AtlasPlace>();
    for (const place of withBorder) if (always(place)) chosen.set(place.slug, place);

    // Then the major territories, biggest first, only a few.
    const majors = withBorder
      .filter((p) => p.verse_count >= MAJOR_BORDER && !chosen.has(p.slug))
      .sort((a, b) => b.verse_count - a.verse_count)
      .slice(0, MAJOR_BORDER_LIMIT);
    for (const place of majors) chosen.set(place.slug, place);

    return [...chosen.values()]
      .map((place) => {
        const border = borders[place.slug];
        const box = borderBoxes.get(place.slug)!;
        const isSelected = place.slug === selected?.slug;
        return {
          slug: place.slug,
          selected: isSelected,
          marked: highlighted.has(place.slug),
          // A region far larger than the screen would tint the whole map;
          // past that point only its line is worth drawing.
          fill: isSelected || box.area < viewArea * 0.7,
          outer: pathFrom(border.outer, true),
          core: pathFrom(border.core, true),
        };
      })
      // The selected region last, so its line is not buried under its neighbours.
      .sort((a, b) => Number(a.selected) - Number(b.selected));
  }, [located, borders, borderBoxes, showBorders, selected, highlighted, always, view, size]);

  const journeyPath = useMemo(() => {
    if (!journey || !view || !size.width) return null;
    const points: WorldPoint[] = journey.legs
      .filter((l) => l.lon != null && l.lat != null)
      .map((l) => project(l.lon as number, l.lat as number));
    if (points.length < 2) return null;
    return points.map((p, i) => {
      const s = toScreen(p, view, size);
      return `${i === 0 ? "M" : "L"}${s.x.toFixed(1)} ${s.y.toFixed(1)}`;
    }).join("");
  }, [journey, view, size]);

  const journeyStops = useMemo(() => {
    if (!journey || !view || !size.width) return [];
    return journey.legs
      .filter((l) => l.lon != null && l.lat != null)
      .map((leg, i) => ({ leg, order: i + 1, ...toScreen(project(leg.lon as number, leg.lat as number), view, size) }));
  }, [journey, view, size]);

  return (
    <div
      ref={hostRef}
      className="atlas-map relative h-full w-full cursor-grab touch-none overflow-hidden outline-none active:cursor-grabbing"
      tabIndex={0}
      role="application"
      aria-label="Map of the biblical world. Arrow keys pan, plus and minus zoom. Every place is also listed beside the map."
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    >
      {view && size.width > 0 && (
        <svg width={size.width} height={size.height} className="block select-none">
          {/* Everything geographic scales; everything readable does not. */}
          <g transform={groupTransform(view, size)}>
            {basePaths && (
              <>
                {/* Land sits on the water ground painted behind the whole
                    map, so the coast is a real edge rather than two greys
                    a shade apart. */}
                <path d={basePaths.land} fillRule="evenodd" fill="var(--atlas-land)" stroke="var(--atlas-coast)" strokeWidth={1.1} vectorEffect="non-scaling-stroke" />
                <path d={basePaths.rivers} fill="none" stroke="var(--atlas-water-line)" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                <path d={basePaths.lakes} fillRule="evenodd" fill="var(--atlas-water)" stroke="var(--atlas-water-line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              </>
            )}

            {/* A border is a claim about where a region reached, and the
                evidence for one is soft -- so it is drawn soft: a wash out
                to the widest extent scholarship allows, and a dashed line
                on the likeliest one. Never a hard boundary. */}
            {borderShapes.map((b) => (
              <g key={b.slug}>
                {b.fill && (
                  <path
                    d={b.outer}
                    fill={b.selected || b.marked ? "var(--color-accent)" : "var(--color-ink-4)"}
                    fillOpacity={b.selected ? 0.16 : b.marked ? 0.1 : 0.05}
                    stroke="none"
                  />
                )}
                <path
                  d={b.core}
                  fill="none"
                  stroke={b.selected || b.marked ? "var(--color-accent)" : "var(--color-ink-4)"}
                  strokeOpacity={b.selected ? 0.85 : b.marked ? 0.6 : 0.4}
                  strokeWidth={b.selected ? 1.75 : 1.25}
                  strokeDasharray={b.selected ? "6 3" : "4 4"}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            ))}
          </g>

          {journeyPath && (
            <path
              d={journeyPath}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="7 5"
              opacity={0.75}
            />
          )}

          {visible.map(({ place, x, y }) => {
            const isSelected = place.slug === selected?.slug;
            const isHighlighted = highlighted.has(place.slug);
            return (
              <circle
                key={place.slug}
                cx={x}
                cy={y}
                r={radiusFor(place, isSelected, isHighlighted)}
                fill={isSelected || isHighlighted ? "var(--color-accent)" : "var(--color-ink-3)"}
                stroke="var(--atlas-land)"
                strokeWidth={isSelected || isHighlighted ? 1.5 : 1}
                // An uncertain identification is drawn hollow-ish, so the map
                // never claims more than the scholarship does.
                fillOpacity={place.confidence === "certain" || place.confidence === "probable" ? 1 : 0.45}
                className="cursor-pointer"
                onPointerEnter={() => setHovered(place.slug)}
                onPointerLeave={() => setHovered((h) => (h === place.slug ? null : h))}
              >
                <title>{place.name}</title>
              </circle>
            );
          })}

          {journeyStops.map(({ order, x, y, leg }) => {
            // The stop numbers follow the label size: someone who made the
            // names bigger to read them needs these bigger too.
            const badge = Math.max(8, labelSize * 0.75);
            return (
              <g key={`${leg.place_id}-${order}`} pointerEvents="none">
                <circle cx={x} cy={y} r={badge} fill="var(--color-accent)" />
                <text x={x} y={y + badge * 0.37} textAnchor="middle" fontSize={badge * 1.15} fontWeight={600} fill="var(--color-bg)">
                  {order}
                </text>
              </g>
            );
          })}

          {areaLabels.map(({ place, text, water, type, cx: lx, cy: ly }) => (
            <text
              key={`area-${place.slug}`}
              x={lx}
              y={ly}
              textAnchor="middle"
              fontSize={type}
              pointerEvents="none"
              fill={water ? "var(--atlas-water-label)" : "var(--color-ink-3)"}
              fontStyle={water ? "italic" : undefined}
              fontWeight={water ? 400 : 500}
              letterSpacing={water ? 0.3 : type * AREA_TRACKING}
              opacity={0.9}
              stroke={water ? "var(--atlas-water)" : "var(--atlas-land)"}
              strokeWidth={3}
              paintOrder="stroke"
              strokeLinejoin="round"
            >
              {text}
            </text>
          ))}

          {labels.map(({ marker, x, y }) => (
            <text
              key={marker.place.slug}
              x={x}
              y={y}
              fontSize={labelSize}
              pointerEvents="none"
              fill={
                marker.place.slug === selected?.slug || highlighted.has(marker.place.slug)
                  ? "var(--color-accent)"
                  : "var(--color-ink-2)"
              }
              fontWeight={marker.place.slug === selected?.slug || highlighted.has(marker.place.slug) ? 600 : 400}
              stroke="var(--atlas-land)"
              strokeWidth={2.5}
              paintOrder="stroke"
              strokeLinejoin="round"
            >
              {marker.place.name}
            </text>
          ))}
        </svg>
      )}

      {hovered && !showLabels && (
        <div className="pointer-events-none absolute bottom-2 left-2 rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink">
          {places.find((p) => p.slug === hovered)?.name}
        </div>
      )}

      <MapControls onZoomIn={() => zoomBy(1.5)} onZoomOut={() => zoomBy(1 / 1.5)} onReset={() => {
        if (size.width && located.length) {
          setView(fitTo(located.map((p) => project(p.lon as number, p.lat as number)), size));
        }
      }} />

      <p className="pointer-events-none absolute bottom-1 right-2 text-[10px] text-ink-4">
        Places © OpenBible.info (CC BY 4.0) · Coastlines: Natural Earth
      </p>
    </div>
  );
}

function MapControls({ onZoomIn, onZoomOut, onReset }: { onZoomIn: () => void; onZoomOut: () => void; onReset: () => void }) {
  const buttonClass =
    "flex h-7 w-7 items-center justify-center rounded-md border border-line bg-surface text-ink-2 hover:bg-hover hover:text-ink";
  return (
    <div className="absolute right-2 top-2 flex flex-col gap-1">
      <button type="button" onClick={onZoomIn} className={buttonClass} aria-label="Zoom in" title="Zoom in">+</button>
      <button type="button" onClick={onZoomOut} className={buttonClass} aria-label="Zoom out" title="Zoom out">−</button>
      <button type="button" onClick={onReset} className={cx(buttonClass, "text-xs")} aria-label="Show the whole map" title="Show the whole map">⤢</button>
    </div>
  );
}
