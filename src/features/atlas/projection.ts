/**
 * The atlas projection and viewport maths.
 *
 * Equirectangular, with longitudes scaled by the cosine of a standard
 * parallel through the middle of the biblical world. Over an extent this
 * small the result is visually indistinguishable from a conformal
 * projection, and unlike one it inverts in a line -- which drag-panning,
 * zooming about the pointer, and hit-testing a click all need.
 */

/** 32°N: through Jerusalem, Babylon, and the middle of the map's extent. */
const STANDARD_PARALLEL = (32 * Math.PI) / 180;
const LON_SCALE = Math.cos(STANDARD_PARALLEL);

export interface WorldPoint {
  x: number;
  y: number;
}

/** Degrees to world units. World y grows southward, as screen y does. */
export function project(lon: number, lat: number): WorldPoint {
  return { x: lon * LON_SCALE, y: -lat };
}

export function unproject(x: number, y: number): { lon: number; lat: number } {
  return { lon: x / LON_SCALE, lat: -y };
}

/** What the map is looking at: a world-space centre and a pixels-per-unit scale. */
export interface View {
  cx: number;
  cy: number;
  k: number;
}

export interface Size {
  width: number;
  height: number;
}

export function toScreen(p: WorldPoint, view: View, size: Size) {
  return {
    x: (p.x - view.cx) * view.k + size.width / 2,
    y: (p.y - view.cy) * view.k + size.height / 2,
  };
}

export function toWorld(sx: number, sy: number, view: View, size: Size): WorldPoint {
  return {
    x: (sx - size.width / 2) / view.k + view.cx,
    y: (sy - size.height / 2) / view.k + view.cy,
  };
}

/** The transform that puts world-space geometry on screen, for the one <g>
 *  holding the basemap. Everything else is positioned in pixels directly, so
 *  labels and markers keep their size at every zoom. */
export function groupTransform(view: View, size: Size): string {
  const tx = size.width / 2 - view.cx * view.k;
  const ty = size.height / 2 - view.cy * view.k;
  return `translate(${tx} ${ty}) scale(${view.k})`;
}

export const MIN_SCALE = 6;
export const MAX_SCALE = 900;

export const clampScale = (k: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, k));

/**
 * A view that frames the given points with room to breathe.
 *
 * A single point has no extent to fit, so it gets a fixed comfortable scale
 * rather than an infinite one.
 */
export function fitTo(points: WorldPoint[], size: Size, padding = 56): View | null {
  if (!points.length || size.width <= 0 || size.height <= 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  if (spanX < 1e-6 && spanY < 1e-6) return { cx, cy, k: clampScale(90) };
  const usableWidth = Math.max(32, size.width - padding * 2);
  const usableHeight = Math.max(32, size.height - padding * 2);
  const k = Math.min(
    spanX > 1e-6 ? usableWidth / spanX : Infinity,
    spanY > 1e-6 ? usableHeight / spanY : Infinity,
  );
  return { cx, cy, k: clampScale(k) };
}

export interface LabelBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** True when a label's box runs into any already placed. */
export function overlaps(box: LabelBox, taken: LabelBox[]): boolean {
  return taken.some((t) => box.left < t.right && box.right > t.left && box.top < t.bottom && box.bottom > t.top);
}
