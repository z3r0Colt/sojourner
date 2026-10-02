"""Builds the Atlas's satellite imagery pack (packs/Sojourner-Imagery-<version>.sjpack).

Two sources, both free to redistribute:

  * The whole biblical world, zoom 0-8: NASA's Blue Marble Next Generation
    (July 2004, with topography and bathymetry), about 500 m a pixel. Public
    domain (NASA Earth Observatory).
  * The Holy Land, zoom 9-12 (about 38 m a pixel): a cloud-free mosaic made
    here from Copernicus Sentinel-2 scenes of summer 2024 -- for each area the
    clearest scene, read straight from the open archive's cloud-optimised
    GeoTIFFs (earth-search.aws.element84.com; sentinel-cogs on AWS), the
    "visual" true-colour product. "Contains modified Copernicus Sentinel
    data 2024" is the credit the Copernicus licence asks for.

Past zoom 8 outside the Holy Land the map shows the Blue Marble enlarged.

Tiles are JPEG in a tiles.db, in a resource pack of kind "map" (see
src-tauri/src/pack.rs), installed from Settings, Packs.

Needs: pip install rasterio pillow numpy. Downloads are cached.

Usage (from the repo root):
    python tools/build-imagery-pack.py [--version 1.0.0] [--cache <folder>]
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
DETAIL = (33.8, 29.3, 37.0, 34.0)  # the Holy Land, Lebanon, Transjordan
DETAIL_ZOOMS = (9, 12)
STAC = "https://earth-search.aws.element84.com/v1/search"
SEASON = "2024-05-15T00:00:00Z/2024-09-30T23:59:59Z"
FALLBACK_SEASON = "2023-04-01T00:00:00Z/2024-10-31T23:59:59Z"
JPEG_QUALITY = 82

ATTRIBUTION = (
    "Imagery: NASA Blue Marble Next Generation (public domain); the Holy Land from Copernicus Sentinel-2 "
    "(contains modified Copernicus Sentinel data 2024)."
)

os.environ.setdefault("AWS_NO_SIGN_REQUEST", "YES")
os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
os.environ.setdefault("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".tif")
os.environ.setdefault("GDAL_HTTP_MULTIRANGE", "YES")
os.environ.setdefault("GDAL_HTTP_MERGE_CONSECUTIVE_RANGES", "YES")
os.environ.setdefault("VSI_CACHE", "TRUE")


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


def search(season, max_cloud):
    body = {
        "collections": ["sentinel-2-c1-l2a"],
        "bbox": list(DETAIL),
        "datetime": season,
        "query": {"eo:cloud_cover": {"lt": max_cloud}},
        "limit": 100,
    }
    items = []
    url = STAC
    while url:
        req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
        page = json.load(urllib.request.urlopen(req, timeout=120))
        items += page["features"]
        nxt = next((l for l in page.get("links", []) if l.get("rel") == "next"), None)
        url, body = (nxt["href"], nxt.get("body", body)) if nxt else (None, None)
    return items


def search_scenes():
    # The clearest scenes of one dry season first; then, for the squares
    # those leave short (some see no clear pass all summer), nearly clear
    # scenes from two years, which a tile reaches only where it is still empty.
    # A pass can clip a square or miss it entirely (such a scene still reports
    # no cloud), so whole scenes come before partial ones, and empty ones go.
    def nodata(it):
        return it["properties"].get("s2:nodata_pixel_percentage") or 0

    def order(it):
        return (nodata(it) > 10, it["properties"]["eo:cloud_cover"], it["properties"]["datetime"])

    clear = [it for it in search(SEASON, 2) if nodata(it) < 95]
    seen = {it["id"] for it in clear}
    spare = [it for it in search(FALLBACK_SEASON, 10) if it["id"] not in seen and nodata(it) < 95]
    items = sorted(clear, key=order) + sorted(spare, key=order)
    by_square = {}
    for it in items:
        square = it["properties"].get("grid:code") or it["properties"].get("s2:mgrs_tile") or it["id"].split("_")[1]
        by_square.setdefault(square, []).append(it)
    print(f"Sentinel-2: {len(clear)} clear and {len(spare)} nearly clear scenes over {len(by_square)} grid squares", flush=True)
    # Up to twenty per square: a tile is filled from as many as it takes,
    # and stops at the first that leave it whole.
    return [it for its in by_square.values() for it in its[:20]]


def scene_bounds(item):
    w, s, e, n = item["bbox"]
    return w, s, e, n


def detail_tile(z, x, y, scenes, opened):
    w, s, e, n = tile_bounds_3857(z, x, y)
    lon_w, lat_s = (w / 6378137) * 180 / math.pi, math.degrees(2 * math.atan(math.exp(s / 6378137)) - math.pi / 2)
    lon_e, lat_n = (e / 6378137) * 180 / math.pi, math.degrees(2 * math.atan(math.exp(n / 6378137)) - math.pi / 2)
    rgb = np.zeros((3, 256, 256), dtype=np.uint8)
    filled = np.zeros((256, 256), dtype=bool)
    for it in scenes:
        sw, ss, se, sn = scene_bounds(it)
        if se < lon_w or sw > lon_e or sn < lat_s or ss > lat_n:
            continue
        href = it["assets"]["visual"]["href"]
        try:
            # The first overview (20 m) is ample for a 38 m tile, and a
            # fraction of the bytes.
            src = opened.setdefault(href, rasterio.open(href, overview_level=0))
            arr = warp_tile(src, z, x, y)
        except Exception as ex:  # noqa: BLE001 -- one scene failing should not end the build
            print(f"  {z}/{x}/{y}: {it['id']}: {ex}", flush=True)
            continue
        valid = arr.max(axis=0) > 0
        take = valid & ~filled
        rgb[:, take] = arr[:, take]
        filled |= valid
        if filled.all():
            break
    return np.transpose(rgb, (1, 2, 0)), filled.mean()


def detail_tiles(scenes):
    zmin, zmax = DETAIL_ZOOMS
    top = tiles_in(zmax, *DETAIL)
    print(f"Sentinel-2: {len(top)} tiles at z{zmax}", flush=True)
    images = {}
    coverage = []

    def work(t):
        opened = {}
        img, cov = detail_tile(*t, scenes, opened)
        for src in opened.values():
            src.close()
        return t, img, cov

    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        for i, (t, img, cov) in enumerate(pool.map(work, top)):
            images[t] = img
            coverage.append(cov)
            if (i + 1) % 200 == 0:
                print(f"  {i + 1}/{len(top)}", flush=True)
    print(f"  mean coverage {np.mean(coverage):.3f}", flush=True)

    # The coarser levels from the finer: each tile is its four children, halved.
    for z in range(zmax - 1, zmin - 1, -1):
        for (cz, cx, cy) in tiles_in(z, *DETAIL):
            canvas = np.zeros((512, 512, 3), dtype=np.uint8)
            for dx in (0, 1):
                for dy in (0, 1):
                    child = images.get((z + 1, 2 * cx + dx, 2 * cy + dy))
                    if child is not None:
                        canvas[dy * 256:(dy + 1) * 256, dx * 256:(dx + 1) * 256] = child
            images[(z, cx, cy)] = np.asarray(Image.fromarray(canvas).resize((256, 256), Image.LANCZOS))
    return images


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
    detail = detail_tiles(search_scenes())

    db_path = os.path.join(args.cache, "tiles.db")
    if os.path.exists(db_path):
        os.remove(db_path)
    db = sqlite3.connect(db_path)
    db.executescript(
        "CREATE TABLE tiles (z INTEGER NOT NULL, x INTEGER NOT NULL, y INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (z, x, y)) WITHOUT ROWID;"
        "CREATE TABLE metadata (name TEXT PRIMARY KEY, value TEXT);"
    )
    db.executemany("INSERT INTO tiles VALUES (?, ?, ?, ?)", [(z, x, y, d) for (z, x, y), d in world.items()])
    db.executemany(
        "INSERT INTO tiles VALUES (?, ?, ?, ?)",
        [(z, x, y, blend_onto(parent_world(z, x, y, world), img)) for (z, x, y), img in detail.items()],
    )
    meta = {"name": "Satellite imagery", "format": "jpg", "minzoom": "0", "maxzoom": str(DETAIL_ZOOMS[1]), "attribution": ATTRIBUTION}
    db.executemany("INSERT INTO metadata VALUES (?, ?)", meta.items())
    db.commit()
    db.execute("VACUUM")
    db.close()
    count = len(world) + len(detail)
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
        "map": {"layer": "imagery", "format": "jpg", "encoding": None, "minzoom": 0, "maxzoom": DETAIL_ZOOMS[1], "attribution": ATTRIBUTION, "tile_count": count},
    }
    out = os.path.join(ROOT, "packs", f"Sojourner-Imagery-{args.version}.sjpack")
    with __import__("zipfile").ZipFile(out, "w", compression=0, allowZip64=True) as z:
        z.writestr("pack.json", json.dumps(manifest, indent=2))
        z.write(db_path, "tiles.db")
    print(f"wrote {out} ({os.path.getsize(out) / 1e6:.0f} MB)", flush=True)


if __name__ == "__main__":
    sys.exit(main())
