"""Turns the Atlas's map packs into PMTiles for the web version.

A desktop map pack (packs/Sojourner-Terrain-1.0.0.sjpack, packs/Sojourner-
Imagery-1.0.0.sjpack) is a zip of pack.json and a tiles.db. In a browser the
tiles are read straight off R2 with HTTP Range requests, which is what a
PMTiles file is for: one file, an index at the front, a tile is one or two
small reads. Nothing is installed; the map reads what it is showing.

`wrangler` uploads at most 300 MiB an object, so a pack bigger than that is
cut into several PMTiles files, each of its own zoom levels (and, where one
zoom level alone is too big, its own half of the columns). The page reads a
pack's tiles through one handler that knows which file holds which tiles
(src/web/mapTiles.ts); each file is an ordinary PMTiles archive.

Writes, per pack, into content/web-maps/<id>/<version>/:

    <id>.pmtiles or <id>.<n>.pmtiles   the tiles (zoom, column, row of
                    tiles.db, in tile-id order)
    map.json        what the pack's pack.json said about the layer (format,
                    encoding, zoom range, attribution, tile count), and each
                    file: its size, zoom range and, if split, columns

Upload them with `npm run upload:web-maps`. Needs `pip install pmtiles`.

Usage (from the repo root):
    python tools/build-web-maps.py [packs/Sojourner-Terrain-1.0.0.sjpack ...]
With no arguments it converts the newest terrain and imagery packs in packs/.
"""

import glob
import json
import os
import sqlite3
import sys
import zipfile

from pmtiles.tile import Compression, TileType, tileid_to_zxy, zxy_to_tileid
from pmtiles.writer import write

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "content", "web-maps")

TILE_TYPES = {"png": TileType.PNG, "webp": TileType.WEBP, "jpg": TileType.JPEG, "jpeg": TileType.JPEG}

# What a file may hold of tile data, with room for the directory: wrangler's
# limit is 300 MiB (314,572,800 bytes) for the whole file.
PART_BYTES = 270_000_000


def newest(pattern):
    found = sorted(glob.glob(os.path.join(ROOT, "packs", pattern)))
    if not found:
        sys.exit(f"no pack matches packs/{pattern}")
    return found[-1]


def plan_parts(conn):
    """Groups the zoom levels into files of at most PART_BYTES of tiles. A
    zoom level too big for one file is cut at a column into as many as it
    takes. Each part: (minzoom, maxzoom, xmin, xmax); xmin/xmax None for all."""
    sizes = dict(conn.execute("SELECT z, SUM(LENGTH(data)) FROM tiles GROUP BY z ORDER BY z"))
    parts, run, run_bytes = [], [], 0

    def flush():
        nonlocal run, run_bytes
        if run:
            parts.append((run[0], run[-1], None, None))
        run, run_bytes = [], 0

    for z in sorted(sizes):
        if sizes[z] > PART_BYTES:
            flush()
            count = -(-sizes[z] // PART_BYTES)
            # Columns cut where the running size of the level crosses each share.
            share = sizes[z] / count
            cuts, seen, edge = [], 0, share
            xs = conn.execute("SELECT x, SUM(LENGTH(data)) FROM tiles WHERE z = ? GROUP BY x ORDER BY x", (z,)).fetchall()
            first = xs[0][0]
            for x, b in xs:
                seen += b
                if seen >= edge and len(cuts) < count - 1:
                    cuts.append(x)
                    edge += share
            lows = [first] + [c + 1 for c in cuts]
            highs = cuts + [xs[-1][0]]
            parts.extend((z, z, lo, hi) for lo, hi in zip(lows, highs))
        elif run_bytes + sizes[z] > PART_BYTES:
            flush()
            run, run_bytes = [z], sizes[z]
        else:
            run.append(z)
            run_bytes += sizes[z]
    flush()
    return parts


def convert(pack_path):
    with zipfile.ZipFile(pack_path) as z:
        manifest = json.loads(z.read("pack.json"))
        if manifest.get("kind") != "map" or not manifest.get("map"):
            sys.exit(f"{pack_path} is not a map pack")
        pack_id, version, info = manifest["id"], manifest["version"], manifest["map"]
        out_dir = os.path.join(OUT, pack_id, version)
        os.makedirs(out_dir, exist_ok=True)
        tiles_db = os.path.join(out_dir, "tiles.db.tmp")
        print(f"{pack_id} {version}: unpacking tiles.db")
        with z.open("tiles.db") as src, open(tiles_db, "wb") as dst:
            while chunk := src.read(1 << 20):
                dst.write(chunk)

    files = []
    try:
        conn = sqlite3.connect(tiles_db)
        parts = plan_parts(conn)
        print(f"  {len(parts)} file(s): " + ", ".join(f"z{a}-{b}" + (f" x{xa}-{xb}" if xa is not None else "") for a, b, xa, xb in parts))
        for n, (zmin, zmax, xmin, xmax) in enumerate(parts):
            name = f"{pack_id}.pmtiles" if len(parts) == 1 else f"{pack_id}.{n}.pmtiles"
            # The tiles are XYZ already (rows counted from the top), as the
            # app's own tile server reads them -- no TMS flip.
            where, args = "z BETWEEN ? AND ?", [zmin, zmax]
            if xmin is not None:
                where += " AND x BETWEEN ? AND ?"
                args += [xmin, xmax]
            ids = sorted(zxy_to_tileid(z, x, y) for z, x, y in conn.execute(f"SELECT z, x, y FROM tiles WHERE {where}", args))
            print(f"  {name}: {len(ids):,} tiles")
            out_path = os.path.join(out_dir, name)
            with write(out_path) as writer:
                for i, tile_id in enumerate(ids):
                    z, x, y = tileid_to_zxy(tile_id)
                    (data,) = conn.execute("SELECT data FROM tiles WHERE z = ? AND x = ? AND y = ?", (z, x, y)).fetchone()
                    writer.write_tile(tile_id, data)
                    if i and i % 20000 == 0:
                        print(f"    {i:,} written")
                header = {
                    "tile_type": TILE_TYPES[info["format"]],
                    "tile_compression": Compression.NONE,
                    "min_zoom": zmin,
                    "max_zoom": zmax,
                    "min_lon_e7": int(-180 * 1e7),
                    "min_lat_e7": int(-85.05112878 * 1e7),
                    "max_lon_e7": int(180 * 1e7),
                    "max_lat_e7": int(85.05112878 * 1e7),
                    "center_zoom": zmin,
                    "center_lon_e7": int(35 * 1e7),
                    "center_lat_e7": int(31 * 1e7),
                }
                writer.finalize(header, {"name": manifest["name"], "attribution": info["attribution"], "version": version})
            size = os.path.getsize(out_path)
            if size >= 300 * 1024 * 1024:
                sys.exit(f"{name} is {size} bytes: over wrangler's 300 MiB; lower PART_BYTES")
            files.append({"file": name, "bytes": size, "minzoom": zmin, "maxzoom": zmax, **({"xmin": xmin, "xmax": xmax} if xmin is not None else {})})
        conn.close()
    finally:
        os.remove(tiles_db)

    with open(os.path.join(out_dir, "map.json"), "w", encoding="utf-8") as f:
        json.dump(
            {
                "id": pack_id,
                "name": manifest["name"],
                "version": version,
                "files": files,
                "bytes": sum(f["bytes"] for f in files),
                "map": info,
            },
            f,
            indent=2,
        )
    print(f"  wrote {len(files)} file(s) to {out_dir} ({sum(f['bytes'] for f in files) / 1e6:.0f} MB)")


if __name__ == "__main__":
    packs = sys.argv[1:] or [newest("Sojourner-Terrain-*.sjpack"), newest("Sojourner-Imagery-*.sjpack")]
    for p in packs:
        convert(p)
