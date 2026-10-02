"""Builds the Atlas's terrain pack (packs/Sojourner-Terrain-<version>.sjpack).

Elevation for the biblical world as map tiles, which the Atlas shades into
hills, valleys and the Jordan rift (MapLibre's hillshade over a raster-dem
source). The tiles are the open Terrain Tiles on AWS (Terrarium encoding:
height = R*256 + G + B/256 - 32768 metres), built from SRTM and GMTED2010
(U.S. Geological Survey), ETOPO1 (NOAA) and, for Europe, EU-DEM
(Copernicus); the credit those sources require is in the pack's manifest and
shown on the map.

Detail where the Bible's events are thickest, less elsewhere:

    z0-5   the whole biblical world, Spain to Persia
    z6-7   the Mediterranean to the Persian Gulf
    z8     Italy to Mesopotamia
    z9     Greece, Asia Minor, Egypt, Mesopotamia
    z10    Egypt's delta, Sinai, the Levant, Cyprus
    z11    the Holy Land, Lebanon and Transjordan

Each tile is re-encoded as lossless WebP (every height exactly as it was; a
third smaller). Downloads are cached in a folder of their own, so a run that
is stopped picks up where it left off.

The pack is a Sojourner resource pack of kind "map" (see src-tauri/src/pack.rs):
a zip of pack.json and tiles.db, installed from Settings, Packs.

Usage (from the repo root):
    python tools/build-terrain-pack.py [--version 1.0.0] [--cache <folder>]
"""

import argparse
import concurrent.futures
import datetime
import hashlib
import io
import json
import math
import os
import sqlite3
import sys
import time
import urllib.request
import zipfile

from PIL import Image

SOURCE = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
ROOT = os.path.join(os.path.dirname(__file__), "..")

# (zoom, west, south, east, north)
COVERAGE = [
    *[(z, -20, 0, 80, 58) for z in range(0, 6)],
    (6, 5, 15, 60, 48),
    (7, 5, 15, 60, 48),
    (8, 10, 20, 55, 45),
    (9, 15, 25, 52, 43),
    (10, 28, 26, 40, 38),
    (11, 33.8, 29.3, 37.0, 34.0),
]

ATTRIBUTION = (
    "Terrain: SRTM and GMTED2010 courtesy of the U.S. Geological Survey; ETOPO1, U.S. National Oceanic and Atmospheric "
    "Administration; EU-DEM produced using Copernicus data and information funded by the European Union. Terrain Tiles on AWS."
)


def tile_range(z, west, south, east, north):
    n = 2**z

    def x_of(lon):
        return int((lon + 180) / 360 * n)

    def y_of(lat):
        r = math.radians(lat)
        return int((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * n)

    x0, x1 = max(0, x_of(west)), min(n - 1, x_of(east))
    y0, y1 = max(0, y_of(north)), min(n - 1, y_of(south))
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            yield z, x, y


def fetch(cache, z, x, y):
    path = os.path.join(cache, str(z), str(x), f"{y}.png")
    if os.path.isfile(path) and os.path.getsize(path) > 0:
        return z, x, y, path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for attempt in range(5):
        try:
            with urllib.request.urlopen(SOURCE.format(z=z, x=x, y=y), timeout=60) as r:
                data = r.read()
            with open(path + ".part", "wb") as f:
                f.write(data)
            os.replace(path + ".part", path)
            return z, x, y, path
        except Exception as e:  # noqa: BLE001 -- retried, then reported
            if attempt == 4:
                raise RuntimeError(f"{z}/{x}/{y}: {e}")
            time.sleep(2 * (attempt + 1))


def webp(path):
    im = Image.open(path).convert("RGB")
    out = io.BytesIO()
    im.save(out, "WEBP", lossless=True, quality=100, method=5)
    return out.getvalue()


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", default="1.0.0")
    ap.add_argument("--cache", default=os.path.join(os.environ.get("TEMP", "/tmp"), "sojourner-terrain-cache"))
    args = ap.parse_args()

    tiles = sorted({t for spec in COVERAGE for t in tile_range(*spec)})
    print(f"{len(tiles)} tiles to fetch or find in {args.cache}")

    work = os.path.join(args.cache, "build")
    os.makedirs(work, exist_ok=True)
    db_path = os.path.join(work, "tiles.db")
    if os.path.exists(db_path):
        os.remove(db_path)
    db = sqlite3.connect(db_path)
    db.executescript(
        """
        PRAGMA page_size = 4096;
        CREATE TABLE tiles (z INTEGER NOT NULL, x INTEGER NOT NULL, y INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (z, x, y)) WITHOUT ROWID;
        CREATE TABLE metadata (name TEXT PRIMARY KEY, value TEXT);
        """
    )

    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
        fetched = list(pool.map(lambda t: fetch(args.cache, *t), tiles))
    raw_bytes = sum(os.path.getsize(path) for *_, path in fetched)
    print(f"fetched; re-encoding on {os.cpu_count()} cores", flush=True)
    done = 0
    # Re-encoding is the slow part: a process per core.
    with concurrent.futures.ProcessPoolExecutor() as pool:
        for (z, x, y, _), data in zip(fetched, pool.map(webp, [path for *_, path in fetched], chunksize=16)):
            db.execute("INSERT INTO tiles VALUES (?, ?, ?, ?)", (z, x, y, data))
            done += 1
            if done % 500 == 0:
                print(f"  {done}/{len(tiles)}", flush=True)
                db.commit()
    meta = {
        "name": "Terrain",
        "format": "webp",
        "encoding": "terrarium",
        "minzoom": "0",
        "maxzoom": str(max(z for z, *_ in COVERAGE)),
        "attribution": ATTRIBUTION,
    }
    db.executemany("INSERT INTO metadata VALUES (?, ?)", meta.items())
    db.commit()
    db.execute("VACUUM")
    db.close()

    size = os.path.getsize(db_path)
    print(f"tiles.db: {len(tiles)} tiles, {size / 1e6:.0f} MB (the PNGs were {raw_bytes / 1e6:.0f} MB)")

    manifest = {
        "format": 1,
        "kind": "map",
        "id": "terrain",
        "name": "Terrain",
        "version": args.version,
        "built_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "library_schema": 0,
        "book_count": 0,
        "bytes": size,
        "files": [{"path": "tiles.db", "bytes": size, "sha256": sha256(db_path)}],
        "map": {
            "layer": "terrain",
            "format": "webp",
            "encoding": "terrarium",
            "minzoom": 0,
            "maxzoom": int(meta["maxzoom"]),
            "attribution": ATTRIBUTION,
            "tile_count": len(tiles),
        },
    }
    out = os.path.join(ROOT, "packs", f"Sojourner-Terrain-{args.version}.sjpack")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    # Stored, not deflated: the tiles inside are already compressed.
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_STORED, allowZip64=True) as z:
        z.writestr("pack.json", json.dumps(manifest, indent=2))
        z.write(db_path, "tiles.db")
    print(f"wrote {out} ({os.path.getsize(out) / 1e6:.0f} MB)")


if __name__ == "__main__":
    sys.exit(main())
