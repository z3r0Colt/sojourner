"""Builds the Atlas's satellite imagery pack (packs/Sojourner-Imagery-<version>.sjpack).

Two sources, both free to redistribute:

  * The whole biblical world, zoom 0-8: NASA's Blue Marble Next Generation
    (July 2004, with topography and bathymetry), about 500 m a pixel. Public
    domain (NASA Earth Observatory).
  * The Bible lands, zoom 9 and deeper: a cloud-free mosaic made here from
    Copernicus Sentinel-2 scenes, mostly of summer 2024 -- for each area the
    clearest whole scene, read straight from the open archive's
    cloud-optimised GeoTIFFs (earth-search.aws.element84.com; sentinel-cogs
    on AWS), the "visual" true-colour product. The Holy Land goes to zoom 14,
    Sentinel-2's own 10 m; the lands of Paul's journeys, Syria, Sinai and the
    delta to zoom 12; the Nile valley, Mesopotamia and Italy to zoom 11 (see
    REGIONS). "Contains modified Copernicus Sentinel data 2024" is the credit
    the Copernicus licence asks for.

Elsewhere past zoom 8, and over open sea, the map shows the level above
enlarged.

The detail tiles are built into detail.db in the cache, so a build that is
stopped (it takes hours) picks up where it left off; delete detail.db and
scenes.json to start over.

Tiles are JPEG in a tiles.db, in a resource pack of kind "map" (see
src-tauri/src/pack.rs), installed from Settings, Packs.

Needs: pip install rasterio pillow numpy. Downloads are cached.

Usage (from the repo root):
    python tools/build-imagery-pack.py [--version 1.0.0] [--cache <folder>]
"""

import argparse
import collections
import concurrent.futures
import datetime
import hashlib
import io
import json
import math
import os
import sqlite3
import sys
import threading
import urllib.request

import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling
from rasterio.transform import from_bounds
from rasterio.vrt import WarpedVRT
from rasterio.windows import Window

ROOT = os.path.join(os.path.dirname(__file__), "..")
BLUE_MARBLE = "https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73751/world.topo.bathy.200407.3x21600x21600.{tile}.jpg"
# Blue Marble tiles are 90 degrees square at 240 pixels a degree: B1 is
# 90W-0, C1 is 0-90E, both 0-90N.
BM_TILES = {"B1": (-90.0, 0.0, 0.0, 90.0), "C1": (0.0, 0.0, 90.0, 90.0)}
WORLD = (-20.0, 0.0, 80.0, 58.0)
WORLD_MAXZOOM = 8
# Where the Sentinel-2 mosaic goes, and how deep: (name, bbox, deepest zoom).
# z14 is Sentinel-2's own 10 m; z12 is about 31 m a pixel, z11 about 62 m.
REGIONS = [
    ("the Holy Land, Lebanon and Transjordan", (33.8, 29.3, 37.0, 34.0), 14),
    ("Syria, Sinai and the Nile delta", (29.0, 27.5, 40.0, 37.5), 12),
    ("Asia Minor, Greece and Cyprus", (19.5, 34.5, 36.0, 42.0), 12),
    ("the Nile to Thebes", (30.0, 24.5, 34.0, 31.5), 11),
    ("Mesopotamia and Elam", (38.0, 29.5, 49.0, 37.5), 11),
    ("Italy, Sicily and Malta", (12.0, 35.5, 17.0, 42.5), 11),
]
DETAIL_MINZOOM = 9
MAXZOOM = max(z for *_, z in REGIONS)
WORKERS = 12
STAC = "https://earth-search.aws.element84.com/v1/search"
SEASON = "2024-05-15T00:00:00Z/2024-09-30T23:59:59Z"
FALLBACK_SEASON = "2023-04-01T00:00:00Z/2024-10-31T23:59:59Z"
JPEG_QUALITY = 82

ATTRIBUTION = (
    "Imagery: NASA Blue Marble Next Generation (public domain); the Bible lands from Copernicus Sentinel-2 "
    "(contains modified Copernicus Sentinel data 2024)."
)

os.environ.setdefault("AWS_NO_SIGN_REQUEST", "YES")
os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
os.environ.setdefault("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".tif")
os.environ.setdefault("GDAL_HTTP_MULTIRANGE", "YES")
os.environ.setdefault("GDAL_HTTP_MERGE_CONSECUTIVE_RANGES", "YES")
os.environ.setdefault("VSI_CACHE", "TRUE")
# One download cache for all threads, big enough to hold the blocks of the
# scenes in use (a block of a scene is 1-3 MB; neighbouring tiles share them).
os.environ.setdefault("CPL_VSIL_CURL_CACHE_SIZE", str(512 << 20))
os.environ.setdefault("GDAL_CACHEMAX", "512")


def tile_bounds_3857(z, x, y):
    n = 2**z
    size = 2 * math.pi * 6378137 / n
    west = -math.pi * 6378137 + x * size
    north = math.pi * 6378137 - y * size
    return west, north - size, west + size, north


def tiles_in(z, west, south, east, north):
    n = 2**z

    def tx(lon):
        return int((lon + 180) / 360 * n)

    def ty(lat):
        r = math.radians(lat)
        return int((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * n)

    return [(z, x, y) for x in range(max(0, tx(west)), min(n - 1, tx(east)) + 1) for y in range(max(0, ty(north)), min(n - 1, ty(south)) + 1)]


def jpeg(arr):
    out = io.BytesIO()
    Image.fromarray(arr.astype(np.uint8), "RGB").save(out, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
    return out.getvalue()


def download(url, path):
    if os.path.isfile(path) and os.path.getsize(path) > 0:
        return path
    print(f"downloading {url}", flush=True)
    urllib.request.urlretrieve(url, path + ".part")
    os.replace(path + ".part", path)
    return path


def warp_tile(src, z, x, y):
    """The tile z/x/y, warped out of `src` onto its own 256-pixel grid in Web
    Mercator; zero where `src` has nothing."""
    w, s, e, n = tile_bounds_3857(z, x, y)
    with WarpedVRT(src, crs="EPSG:3857", transform=from_bounds(w, s, e, n, 256, 256), width=256, height=256,
                   resampling=Resampling.bilinear, nodata=0) as vrt:
        return vrt.read(indexes=[1, 2, 3])


# --- Blue Marble -------------------------------------------------------------


def world_raster(cache):
    """The Blue Marble over the WORLD extent as one tiled GeoTIFF with overviews."""
    out = os.path.join(cache, "bluemarble-world.tif")
    if os.path.isfile(out):
        return out
    west, south, east, north = WORLD
    ppd = 240
    width, height = int((east - west) * ppd), int((north - south) * ppd)
    profile = dict(driver="GTiff", width=width, height=height, count=3, dtype="uint8", crs="EPSG:4326",
                   transform=from_bounds(west, south, east, north, width, height), tiled=True, blockxsize=512,
                   blockysize=512, compress="deflate", predictor=2, BIGTIFF="YES")
    with rasterio.open(out + ".part", "w", **profile) as dst:
        for name, (bw, bs, be, bn) in BM_TILES.items():
            path = download(BLUE_MARBLE.format(tile=name), os.path.join(cache, f"bm-{name}.jpg"))
            ow, oe = max(bw, west), min(be, east)
            if ow >= oe:
                continue
            with rasterio.open(path) as src:
                col0 = int((ow - bw) * ppd)
                cols = int((oe - ow) * ppd)
                row0 = int((bn - north) * ppd)
                rows = int((north - max(bs, south)) * ppd)
                step = 1024
                for r in range(0, rows, step):
                    h = min(step, rows - r)
                    data = src.read(window=Window(col0, row0 + r, cols, h))
                    dst.write(data, window=Window(int((ow - west) * ppd), r, cols, h))
                print(f"  {name} placed", flush=True)
        dst.build_overviews([2, 4, 8, 16, 32, 64, 128], Resampling.average)
    os.replace(out + ".part", out)
    return out


def world_tiles(raster):
    tiles = [t for z in range(0, WORLD_MAXZOOM + 1) for t in tiles_in(z, *WORLD)]
    print(f"Blue Marble: {len(tiles)} tiles", flush=True)
    out = {}
    with rasterio.open(raster) as src:
        for z, x, y in tiles:
            arr = warp_tile(src, z, x, y)
            out[(z, x, y)] = jpeg(np.transpose(arr, (1, 2, 0)))
    return out


# --- Sentinel-2 ----------------------------------------------------------------


def search(bbox, season, max_cloud):
    body = {
        "collections": ["sentinel-2-c1-l2a"],
        "bbox": list(bbox),
        "datetime": season,
        "query": {"eo:cloud_cover": {"lt": max_cloud}},
        "limit": 100,
    }
    items = []
    url = STAC
    while url:
        req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
        page = json.load(urllib.request.urlopen(req, timeout=120))
        # Only what the build uses: a full record is tens of kilobytes.
        items += [
            {
                "id": it["id"],
                "bbox": it["bbox"],
                "href": it["assets"]["visual"]["href"],
                "properties": {k: it["properties"].get(k) for k in ("eo:cloud_cover", "datetime", "grid:code", "s2:mgrs_tile", "s2:nodata_pixel_percentage")},
            }
            for it in page["features"]
        ]
        nxt = next((l for l in page.get("links", []) if l.get("rel") == "next"), None)
        url, body = (nxt["href"], nxt.get("body", body)) if nxt else (None, None)
    return items


def search_scenes(cache):
    """The scenes to build from, best first within each grid square. The
    search is cached, so a resumed build reads from the same scenes."""
    path = os.path.join(cache, "scenes.json")
    if os.path.isfile(path):
        return json.load(open(path, encoding="utf-8"))
    # The clearest scenes of one dry season first; then, for the squares
    # those leave short (some see no clear pass all summer), nearly clear
    # scenes from two years, which a tile reaches only where it is still empty.
    # A pass can clip a square or miss it entirely (such a scene still reports
    # no cloud), so whole scenes come before partial ones, and empty ones go.
    def nodata(it):
        return it["properties"].get("s2:nodata_pixel_percentage") or 0

    def order(it):
        return (nodata(it) > 10, it["properties"]["eo:cloud_cover"], it["properties"]["datetime"])

    clear, spare, seen = [], [], set()
    for season, max_cloud, into in ((SEASON, 2, clear), (FALLBACK_SEASON, 10, spare)):
        for _, bbox, _ in REGIONS:
            for it in search(bbox, season, max_cloud):
                if it["id"] not in seen and nodata(it) < 95:
                    seen.add(it["id"])
                    into.append(it)
    items = sorted(clear, key=order) + sorted(spare, key=order)
    by_square = {}
    for it in items:
        square = it["properties"].get("grid:code") or it["properties"].get("s2:mgrs_tile") or it["id"].split("_")[1]
        by_square.setdefault(square, []).append(it)
    print(f"Sentinel-2: {len(clear)} clear and {len(spare)} nearly clear scenes over {len(by_square)} grid squares", flush=True)
    # Up to twenty per square: a tile is filled from as many as it takes,
    # and stops at the first that leave it whole.
    scenes = [{"id": it["id"], "bbox": it["bbox"], "href": it["href"]} for its in by_square.values() for it in its[:20]]
    with open(path, "w", encoding="utf-8") as f:
        json.dump(scenes, f)
    return scenes


class SceneIndex:
    """Scenes by one-degree cell, in their order, so a tile looks only at the
    scenes near it."""

    def __init__(self, scenes):
        self.scenes = scenes
        self.cells = {}
        for i, sc in enumerate(scenes):
            w, s, e, n = sc["bbox"]
            for cx in range(math.floor(w), math.floor(e) + 1):
                for cy in range(math.floor(s), math.floor(n) + 1):
                    self.cells.setdefault((cx, cy), []).append(i)

    def near(self, w, s, e, n):
        found = set()
        for cx in range(math.floor(w), math.floor(e) + 1):
            for cy in range(math.floor(s), math.floor(n) + 1):
                found.update(self.cells.get((cx, cy), ()))
        return [self.scenes[i] for i in sorted(found)]


def overview_for(z):
    """The coarsest of a scene's levels (10 m, then 20, 40, 80, 160) still as
    fine as a tile at zoom z: about 31 m a pixel at z12 in these latitudes."""
    level = 12 - z
    return None if level < 0 else min(level, 3)


_local = threading.local()


def open_scene(href, level):
    """A scene opened once a thread and kept while it is in use: neighbouring
    tiles read the same scenes, and opening one costs a round trip."""
    cache = getattr(_local, "open", None)
    if cache is None:
        cache = _local.open = collections.OrderedDict()
    key = (href, level)
    if key in cache:
        cache.move_to_end(key)
        return cache[key]
    src = rasterio.open(href) if level is None else rasterio.open(href, overview_level=level)
    cache[key] = src
    if len(cache) > 16:
        cache.popitem(last=False)[1].close()
    return src


def lonlat_bounds(z, x, y):
    w, s, e, n = tile_bounds_3857(z, x, y)

    def lat(m):
        return math.degrees(2 * math.atan(math.exp(m / 6378137)) - math.pi / 2)

    return w / 6378137 * 180 / math.pi, lat(s), e / 6378137 * 180 / math.pi, lat(n)


def detail_tile(z, x, y, index):
    """The tile warped from the scenes over it, best first, and how much of
    it they cover."""
    lon_w, lat_s, lon_e, lat_n = lonlat_bounds(z, x, y)
    rgb = np.zeros((3, 256, 256), dtype=np.uint8)
    filled = np.zeros((256, 256), dtype=bool)
    level = overview_for(z)
    for sc in index.near(lon_w, lat_s, lon_e, lat_n):
        sw, ss, se, sn = sc["bbox"]
        if se < lon_w or sw > lon_e or sn < lat_s or ss > lat_n:
            continue
        try:
            arr = warp_tile(open_scene(sc["href"], level), z, x, y)
        except Exception as ex:  # noqa: BLE001 -- one scene failing should not end the build
            print(f"  {z}/{x}/{y}: {sc['id']}: {ex}", flush=True)
            continue
        valid = arr.max(axis=0) > 0
        take = valid & ~filled
        rgb[:, take] = arr[:, take]
        filled |= valid
        if filled.all():
            break
    return np.transpose(rgb, (1, 2, 0)), filled.mean()


def wanted_tiles():
    """Every detail tile, by zoom: each region's levels from z9 to its deepest."""
    wanted = {}
    for _, bbox, maxzoom in REGIONS:
        for z in range(DETAIL_MINZOOM, maxzoom + 1):
            wanted.setdefault(z, set()).update(tiles_in(z, *bbox))
    return wanted


def build_detail(db, index, world):
    """Writes the detail tiles into `db`, deepest zoom first. A tile whose four
    children were built is made from them, halved; any other (a region's
    deepest level, or the edge of a deeper region) is warped from the scenes.
    A tile with no imagery at all (open sea) is stored empty and left out of
    the pack, and the map shows the level above it enlarged. Tiles already in
    `db` are kept, so a stopped build picks up where it left off."""
    wanted = wanted_tiles()
    done = set(db.execute("SELECT z, x, y FROM detail"))
    print(f"Sentinel-2: {sum(len(t) for t in wanted.values())} tiles over z{DETAIL_MINZOOM}-{MAXZOOM}, {len(done)} already built", flush=True)

    def child_image(z, x, y):
        row = db.execute("SELECT data FROM detail WHERE z = ? AND x = ? AND y = ?", (z, x, y)).fetchone()
        if row and row[0]:
            return Image.open(io.BytesIO(row[0])).convert("RGB"), True
        base = parent_world(z, x, y, world)
        return (Image.open(io.BytesIO(base)).convert("RGB") if base else None), False

    def from_children(z, x, y):
        canvas = Image.new("RGB", (512, 512))
        any_imagery = False
        for dx in (0, 1):
            for dy in (0, 1):
                img, imagery = child_image(z + 1, 2 * x + dx, 2 * y + dy)
                any_imagery |= imagery
                if img is not None:
                    canvas.paste(img, (dx * 256, dy * 256))
        return jpeg(np.asarray(canvas.resize((256, 256), Image.LANCZOS))) if any_imagery else None

    def warped(group):
        out = []
        for t in group:
            img, cov = detail_tile(*t, index)
            out.append((t, blend_onto(parent_world(*t, world), img) if cov > 0 else None, cov))
        return out

    for z in sorted(wanted, reverse=True):
        below = wanted.get(z + 1, set())
        todo = [t for t in wanted[z] if t not in done]
        halve = sorted(t for t in todo if all((z + 1, 2 * t[1] + dx, 2 * t[2] + dy) in below for dx in (0, 1) for dy in (0, 1)))
        warp = set(todo) - set(halve)
        # Neighbours go to the same thread, eight by eight, so the blocks of a
        # scene it has read serve the next tile too.
        groups = {}
        for t in sorted(warp):
            groups.setdefault((t[1] // 8, t[2] // 8), []).append(t)
        print(f"  z{z}: {len(warp)} to warp, {len(halve)} from the level below", flush=True)
        coverage = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
            for results in pool.map(warped, groups.values()):
                for t, data, cov in results:
                    db.execute("INSERT INTO detail VALUES (?, ?, ?, ?)", (*t, data))
                    coverage.append(cov)
                    if len(coverage) % 1000 == 0:
                        db.commit()
                        print(f"    {len(coverage)}/{len(warp)}, mean coverage {np.mean(coverage):.3f}", flush=True)
        db.commit()
        if coverage:
            print(f"    mean coverage {np.mean(coverage):.3f}", flush=True)
        for t in halve:
            db.execute("INSERT INTO detail VALUES (?, ?, ?, ?)", (*t, from_children(*t)))
        db.commit()


def blend_onto(world_jpeg, detail):
    """A detail tile with empty (black) parts filled from the world tile
    beneath it, so a mosaic's edge shows the Blue Marble, not black."""
    if detail.max(axis=2).min() > 0:
        return jpeg(detail)
    base = np.asarray(Image.open(io.BytesIO(world_jpeg)).convert("RGB")) if world_jpeg else np.zeros_like(detail)
    mask = detail.max(axis=2) == 0
    out = detail.copy()
    out[mask] = base[mask]
    return jpeg(out)


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def parent_world(z, x, y, world):
    """The Blue Marble tile at zoom 8 that holds z/x/y, cut and enlarged."""
    shift = z - WORLD_MAXZOOM
    px, py = x >> shift, y >> shift
    data = world.get((WORLD_MAXZOOM, px, py))
    if data is None:
        return None
    img = Image.open(io.BytesIO(data)).convert("RGB")
    k = 2**shift
    size = 256 // k
    ox, oy = (x - (px << shift)) * size, (y - (py << shift)) * size
    crop = img.crop((ox, oy, ox + size, oy + size)).resize((256, 256), Image.BILINEAR)
    out = io.BytesIO()
    crop.save(out, "JPEG", quality=JPEG_QUALITY)
    return out.getvalue()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", default="1.0.0")
    ap.add_argument("--cache", default=os.path.join(os.environ.get("TEMP", "/tmp"), "sojourner-imagery-cache"))
    args = ap.parse_args()
    os.makedirs(args.cache, exist_ok=True)

    world = world_tiles(world_raster(args.cache))
    index = SceneIndex(search_scenes(args.cache))

    # The detail tiles are built into a database of their own in the cache,
    # which a stopped build resumes from; the pack's tiles.db is made from it.
    work = sqlite3.connect(os.path.join(args.cache, "detail.db"))
    work.execute("CREATE TABLE IF NOT EXISTS detail (z INTEGER NOT NULL, x INTEGER NOT NULL, y INTEGER NOT NULL, data BLOB, PRIMARY KEY (z, x, y)) WITHOUT ROWID")
    build_detail(work, index, world)

    db_path = os.path.join(args.cache, "tiles.db")
    if os.path.exists(db_path):
        os.remove(db_path)
    db = sqlite3.connect(db_path)
    db.executescript(
        "CREATE TABLE tiles (z INTEGER NOT NULL, x INTEGER NOT NULL, y INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (z, x, y)) WITHOUT ROWID;"
        "CREATE TABLE metadata (name TEXT PRIMARY KEY, value TEXT);"
    )
    db.executemany("INSERT INTO tiles VALUES (?, ?, ?, ?)", [(z, x, y, d) for (z, x, y), d in world.items()])
    wanted = wanted_tiles()
    detail = 0
    for z, x, y, data in work.execute("SELECT z, x, y, data FROM detail WHERE data IS NOT NULL"):
        if (z, x, y) in wanted.get(z, ()):
            db.execute("INSERT OR REPLACE INTO tiles VALUES (?, ?, ?, ?)", (z, x, y, data))
            detail += 1
    work.close()
    meta = {"name": "Satellite imagery", "format": "jpg", "minzoom": "0", "maxzoom": str(MAXZOOM), "attribution": ATTRIBUTION}
    db.executemany("INSERT INTO metadata VALUES (?, ?)", meta.items())
    db.commit()
    db.execute("VACUUM")
    db.close()
    count = len(world) + detail
    size = os.path.getsize(db_path)
    print(f"tiles.db: {count} tiles, {size / 1e6:.0f} MB", flush=True)

    manifest = {
        "format": 1,
        "kind": "map",
        "id": "imagery",
        "name": "Satellite imagery",
        "version": args.version,
        "built_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "library_schema": 0,
        "book_count": 0,
        "bytes": size,
        "files": [{"path": "tiles.db", "bytes": size, "sha256": sha256(db_path)}],
        "map": {"layer": "imagery", "format": "jpg", "encoding": None, "minzoom": 0, "maxzoom": MAXZOOM, "attribution": ATTRIBUTION, "tile_count": count},
    }
    out = os.path.join(ROOT, "packs", f"Sojourner-Imagery-{args.version}.sjpack")
    with __import__("zipfile").ZipFile(out, "w", compression=0, allowZip64=True) as z:
        z.writestr("pack.json", json.dumps(manifest, indent=2))
        z.write(db_path, "tiles.db")
    print(f"wrote {out} ({os.path.getsize(out) / 1e6:.0f} MB)", flush=True)


if __name__ == "__main__":
    sys.exit(main())
