import type { AtlasPlace } from "../../api/types";

/** "Aphek (in Sharon)": the name, and where it is when other sites share it. */
export function displayName(place: Pick<AtlasPlace, "name" | "qualifier">): string {
  return place.qualifier ? `${place.name} (${place.qualifier})` : place.name;
}

/**
 * The groups the Atlas sorts places into, from OpenBible's thirty-eight kinds:
 * what a reader looks for, and what the map draws differently. A place goes
 * in the first group any of its kinds belongs to, in this order -- a camp of
 * the exodus that was also a town is a camp; a gate of Jerusalem is a site in
 * the city, not a town.
 */
export const PLACE_GROUPS = [
  { key: "camps", label: "Camps of the exodus", kinds: ["campsite"] },
  {
    key: "sites",
    label: "Sites and buildings",
    kinds: ["gate", "hall", "room", "altar", "structure", "district in settlement", "fortification", "pool", "garden", "tree", "stone heap"],
  },
  { key: "towns", label: "Cities and towns", kinds: ["settlement"] },
  { key: "islands", label: "Islands", kinds: ["island"] },
  {
    key: "mountains",
    label: "Mountains and hills",
    kinds: ["mountain", "hill", "mountain range", "mountain ridge", "mountain pass", "cliff", "rock", "promontory"],
  },
  { key: "waters", label: "Seas, rivers and springs", kinds: ["river", "body of water", "spring", "well", "wadi", "canal", "ford"] },
  { key: "valleys", label: "Valleys, plains and wildernesses", kinds: ["valley", "natural area", "field", "forest", "mine"] },
  { key: "lands", label: "Lands and peoples", kinds: ["region", "people group"] },
  { key: "other", label: "Other places", kinds: [] as string[] },
] as const;

export type PlaceGroup = (typeof PLACE_GROUPS)[number]["key"];

const GROUP_OF_KIND = new Map<string, PlaceGroup>();
for (const g of PLACE_GROUPS) for (const k of g.kinds) if (!GROUP_OF_KIND.has(k)) GROUP_OF_KIND.set(k, g.key);
const ORDER = new Map<PlaceGroup, number>(PLACE_GROUPS.map((g, i) => [g.key, i]));

export function groupOf(place: Pick<AtlasPlace, "kinds">): PlaceGroup {
  let best: PlaceGroup = "other";
  for (const k of place.kinds) {
    const g = GROUP_OF_KIND.get(k);
    if (g && ORDER.get(g)! < ORDER.get(best)!) best = g;
  }
  return best;
}

export function groupLabel(group: PlaceGroup): string {
  return PLACE_GROUPS.find((g) => g.key === group)?.label ?? "Other places";
}

/** A place's kinds as a reader would say them: "spring, town". */
export function kindsText(place: Pick<AtlasPlace, "kinds">): string {
  const words = place.kinds.filter((k) => k !== "special").map((k) => (k === "settlement" ? "town" : k));
  return words.join(", ");
}

export type Testament = "both" | "ot" | "nt";

export function inTestament(place: Pick<AtlasPlace, "ot_verses" | "nt_verses">, t: Testament): boolean {
  return t === "both" || (t === "ot" ? place.ot_verses > 0 : place.nt_verses > 0);
}

/** The zoom at which a place is worth naming: the most-read places from the
 * start, the rest as the reader closes in, the way a road map shows cities
 * first and villages later. */
export function minZoom(place: Pick<AtlasPlace, "verse_count">): number {
  // Whole zoom levels: the map tests a filter's zoom once per level.
  const n = place.verse_count;
  if (n >= 100) return 0;
  if (n >= 40) return 4;
  if (n >= 15) return 5;
  if (n >= 6) return 6;
  if (n >= 3) return 7;
  if (n >= 2) return 8;
  return 9;
}

export const CONFIDENCE_ORDER = ["certain", "probable", "possible", "proposed", "unidentified"] as const;
