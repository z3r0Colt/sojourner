/**
 * The Atlas's terrain and satellite layers on the web. On the desktop they
 * are packs the reader installs; here they are PMTiles files on R2
 * (tools/build-web-maps.py, `npm run upload:web-maps`) that the map reads
 * the tiles it shows from with Range requests, so nothing is installed.
 * Which files there are, is pinned in maps.json when they are uploaded.
 */
import type { PackStatus } from "../api/types";
import pinned from "./maps.json";

// Functions, not constants: a constant computed from maps.json is kept by the
// desktop bundle even where nothing reads it; a function nothing calls is not.

/** Where the maps are: in dev, content/web-maps/ as the dev server serves
 * it; in a build, R2. $VITE_MAPS_BASE overrides both. */
function mapsBase(): string {
  return import.meta.env.VITE_MAPS_BASE ?? (import.meta.env.DEV ? "/dev-maps/" : pinned.base);
}

/** The packs as `pack_statuses` gives them on the desktop, so the Atlas
 * treats every one as installed. */
export function webMapPacks(): PackStatus[] {
  return pinned.packs.map((p) => ({
    id: p.id,
    kind: "map",
    map: p.map,
    installed: true,
    name: p.name,
    version: p.version,
    built_at: null,
    book_count: 0,
    bytes_on_disk: p.bytes,
  }));
}

/** The tile URL template MapLibre reads a pack's tiles by: the `sjmap`
 * protocol (registered in AtlasMap; mapTiles.ts), which knows which of the
 * pack's files holds a tile. */
export function webTileTemplate(id: string): string | null {
  return pinned.packs.some((p) => p.id === id) ? `sjmap://${id}/{z}/{x}/{y}` : null;
}

/** The absolute address of one of a pack's PMTiles files. */
export function mapFileUrl(id: string, version: string, file: string): string {
  return new URL(`${id}/${version}/${file}`, new URL(mapsBase(), window.location.href)).href;
}
