/**
 * Distances and travel times on the ground.
 *
 * Distances are great-circle ("as the crow flies"); a road or path is
 * always longer, typically by a fifth to a third in hill country, and the
 * Atlas says so wherever it gives a straight-line figure.
 *
 * Travel times use rates the ancient sources and modern studies of them
 * agree on as ordinary: on foot about 20 miles (32 km) a day, which a
 * determined traveller could stretch and a family with animals would not
 * reach; a caravan with laden animals about 15 miles (24 km); a merchant
 * ship under sail, in season, about 100 miles (160 km) a day.
 */

export type Units = "mi" | "km";

export interface LonLat {
  lon: number;
  lat: number;
}

const EARTH_KM = 6371.0088;
export const KM_PER_MILE = 1.609344;

export function distanceKm(a: LonLat, b: LonLat): number {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function pathKm(points: LonLat[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distanceKm(points[i - 1], points[i]);
  return total;
}

/** Compass direction from a to b, in eight points: "northeast". */
export function bearingWord(a: LonLat, b: LonLat): string {
  const toRad = Math.PI / 180;
  const y = Math.sin((b.lon - a.lon) * toRad) * Math.cos(b.lat * toRad);
  const x = Math.cos(a.lat * toRad) * Math.sin(b.lat * toRad) - Math.sin(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.cos((b.lon - a.lon) * toRad);
  const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"][Math.round(deg / 45) % 8];
}

export function formatDistance(km: number, units: Units): string {
  const value = units === "mi" ? km / KM_PER_MILE : km;
  const rounded = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${rounded.toLocaleString()} ${units === "mi" ? (rounded === 1 ? "mile" : "miles") : "km"}`;
}

export const TRAVEL = [
  { key: "foot", label: "on foot", kmPerDay: 32 },
  { key: "caravan", label: "with a caravan", kmPerDay: 24 },
  { key: "ship", label: "by ship", kmPerDay: 160 },
] as const;

/** "about 7 days", "about half a day". */
export function daysText(km: number, kmPerDay: number): string {
  const days = km / kmPerDay;
  if (days < 0.4) return "a few hours";
  if (days < 0.75) return "about half a day";
  if (days < 1.5) return "about a day";
  return `about ${Math.round(days)} days`;
}
