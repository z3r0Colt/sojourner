/**
 * The Atlas's tiles on the web: MapLibre asks the `sjmap` protocol for
 * `sjmap://<pack>/<z>/<x>/<y>`, and this reads the tile out of whichever of
 * the pack's PMTiles files holds it (tools/build-web-maps.py cuts a big pack
 * into files by zoom level, and a level too big for one by columns). A tile is
 * one or two Range requests; the files' directories are kept after the first.
 * Loaded only by the web build (AtlasMap).
 */
import type { AddProtocolAction } from "maplibre-gl";
import { PMTiles, SharedPromiseCache } from "pmtiles";
import pinned from "./maps.json";
import { mapFileUrl } from "./mapPacks";

const cache = new SharedPromiseCache();
const archives = new Map<string, PMTiles>();

function archive(url: string): PMTiles {
  let a = archives.get(url);
  if (!a) {
    a = new PMTiles(url, cache);
    archives.set(url, a);
  }
  return a;
}

/** What MapLibre is told of a tile that is not in the pack: as the pmtiles
 * protocol does, no data at all (the type has no place for that). */
const NO_TILE = { data: null } as unknown as Awaited<ReturnType<AddProtocolAction>>;

export const mapTile: AddProtocolAction = async (params, abort) => {
  const m = /^sjmap:\/\/([\w-]+)\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
  if (!m) throw new Error(`Not a map tile address: ${params.url}`);
  const [z, x, y] = [Number(m[2]), Number(m[3]), Number(m[4])];
  const pack = pinned.packs.find((p) => p.id === m[1]);
  if (!pack) throw new Error(`No map pack called ${m[1]}`);
  const part = (pack.files as { file: string; minzoom: number; maxzoom: number; xmin?: number; xmax?: number }[]).find(
    (f) => z >= f.minzoom && z <= f.maxzoom && (f.xmin === undefined || (x >= f.xmin && x <= (f.xmax ?? Infinity))),
  );
  // Nothing here: the map draws around it.
  if (!part) return NO_TILE;
  const tile = await archive(mapFileUrl(pack.id, pack.version, part.file)).getZxy(z, x, y, abort.signal);
  return tile ? { data: new Uint8Array(tile.data), cacheControl: tile.cacheControl, expires: tile.expires } : NO_TILE;
};
