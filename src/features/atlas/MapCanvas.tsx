import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AtlasJourney, AtlasPlace } from "../../api/types";
import { cx } from "../../components/ui/classes";
import {
  clampScale,
  fitTo,
  groupTransform,
  placeLabels,
  project,
  toScreen,
  toWorld,
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

/** Marker size by how much of Scripture a place appears in. */
function radiusFor(place: AtlasPlace, selected: boolean, highlighted: boolean): number {
  if (selected) return 6.5;
  const base = place.verse_count >= 200 ? 4.5 : place.verse_count >= 40 ? 3.8 : place.verse_count >= 8 ? 3.2 : 2.6;
  return highlighted ? base + 1 : base;
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
  onSelect: (place: AtlasPlace) => void;
  /** Bumped by the view to ask for a re-fit (a new passage, a new journey). */
  fitToken: number;
  fitTargets: AtlasPlace[];
}

export function MapCanvas({
  places,
  selected,
  highlighted,
  journey,
  showLabels,
  onSelect,
  fitToken,
  fitTargets,
}: MapCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [basemap, setBasemap] = useState<Basemap | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  // ~350KB of coastlines: loaded when the atlas is first opened rather than
  // carried in the bundle for every reader who never opens it.
  useEffect(() => {
    let alive = true;
    import("./basemap.json").then((m) => {
      if (alive) setBasemap((m.default ?? m) as unknown as Basemap);
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

  // Opening view: the whole gazetteer, so the reader sees the world the
  // Bible happens in before narrowing to any part of it.
  useEffect(() => {
    if (view || !size.width || !located.length) return;
    setView(fitTo(located.map((p) => project(p.lon as number, p.lat as number)), size));
  }, [view, size, located]);

  useEffect(() => {
    if (!size.width || !fitTargets.length) return;
    const next = fitTo(
      fitTargets.filter((p) => p.lon != null).map((p) => project(p.lon as number, p.lat as number)),
      size,
    );
    // A lone place would otherwise fill the screen at maximum zoom with no
    // surroundings, which is the one thing a map is for.
    if (next) setView(fitTargets.length === 1 ? { ...next, k: clampScale(130) } : next);
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
  // A drag that ends over a marker still fires a click on it, which would
  // select a place the reader was only panning past.
  const draggedRef = useRef(false);

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
    draggedRef.current = true;
    d.x = e.clientX;
    d.y = e.clientY;
    setView((current) => (current ? { ...current, cx: current.cx - dx / current.k, cy: current.cy - dy / current.k } : current));
  }

  function onPointerUp(e: React.PointerEvent) {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    // Cleared after the click that follows this release has been handled.
    if (draggedRef.current) setTimeout(() => (draggedRef.current = false), 0);
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

  const labels = useMemo(() => {
    if (!showLabels) return [];
    const CHAR_WIDTH = 6.1;
    const candidates = markers
      .slice()
      .sort((a, b) => {
        // Selection and the passage's places always get a name.
        const rank = (m: typeof a) =>
          (m.place.slug === selected?.slug ? 2 : 0) + (highlighted.has(m.place.slug) ? 1 : 0);
        return rank(b) - rank(a) || b.place.verse_count - a.place.verse_count;
      })
      .map((m) => ({
        marker: m,
        x: m.x + radiusFor(m.place, false, false) + 4,
        y: m.y + 4,
        width: m.place.name.length * CHAR_WIDTH + 4,
        height: 13,
      }));
    return placeLabels(candidates);
  }, [markers, showLabels, selected, highlighted]);

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
      className="relative h-full w-full cursor-grab touch-none overflow-hidden bg-surface-2 outline-none active:cursor-grabbing"
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
                <path d={basePaths.land} fillRule="evenodd" fill="var(--color-surface)" stroke="var(--color-line-2)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                <path d={basePaths.rivers} fill="none" stroke="var(--color-line-2)" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity={0.85} />
                <path d={basePaths.lakes} fillRule="evenodd" fill="var(--color-surface-2)" stroke="var(--color-line-2)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              </>
            )}
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

          {markers.map(({ place, x, y }) => {
            const isSelected = place.slug === selected?.slug;
            const isHighlighted = highlighted.has(place.slug);
            return (
              <circle
                key={place.slug}
                cx={x}
                cy={y}
                r={radiusFor(place, isSelected, isHighlighted)}
                fill={isSelected || isHighlighted ? "var(--color-accent)" : "var(--color-ink-3)"}
                stroke="var(--color-surface)"
                strokeWidth={isSelected || isHighlighted ? 1.5 : 1}
                // An uncertain identification is drawn hollow-ish, so the map
                // never claims more than the scholarship does.
                fillOpacity={place.confidence === "certain" || place.confidence === "probable" ? 1 : 0.45}
                className="cursor-pointer"
                onPointerEnter={() => setHovered(place.slug)}
                onPointerLeave={() => setHovered((h) => (h === place.slug ? null : h))}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!draggedRef.current) onSelect(place);
                }}
              >
                <title>{place.name}</title>
              </circle>
            );
          })}

          {journeyStops.map(({ order, x, y, leg }) => (
            <g key={`${leg.place_id}-${order}`} pointerEvents="none">
              <circle cx={x} cy={y} r={8} fill="var(--color-accent)" />
              <text x={x} y={y + 3} textAnchor="middle" fontSize={9} fontWeight={600} fill="var(--color-bg)">
                {order}
              </text>
            </g>
          ))}

          {labels.map(({ marker, x, y }) => (
            <text
              key={marker.place.slug}
              x={x}
              y={y}
              fontSize={11}
              pointerEvents="none"
              fill={
                marker.place.slug === selected?.slug || highlighted.has(marker.place.slug)
                  ? "var(--color-accent)"
                  : "var(--color-ink-2)"
              }
              fontWeight={marker.place.slug === selected?.slug || highlighted.has(marker.place.slug) ? 600 : 400}
              stroke="var(--color-surface)"
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
