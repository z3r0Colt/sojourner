"""Builds the Atlas's base map from Natural Earth.

Natural Earth (naturalearthdata.com) is public domain. This clips its 10m
layers to the biblical world, from Spain (Tarshish) to Persia and from the
Black Sea to Ethiopia, simplifies them a little, and writes small GeoJSON
files the Atlas loads (public/atlas/), each feature keeping only what the
map draws:

    land.geojson       land polygons
    lakes.geojson      lakes, with names
    rivers.geojson     rivers, with names and a rank (lower draws sooner)
    borders.geojson    modern country borders (lines)
    provinces.geojson  modern province borders (lines)
    countries.geojson  modern country names (points)
    towns.geojson      modern towns and cities (points), with population rank
    marine.geojson     names of seas and gulfs (points)
    features.geojson   deserts, ranges, plains and the like (points)

Usage (from the repo root):
    python tools/build-atlas-basemap.py <folder of unzipped ne_10m_* shapefiles>
"""

import json
import os
import sys

import shapefile  # pyshp
from shapely.geometry import box, mapping, shape

BBOX = (-20.0, 0.0, 80.0, 58.0)  # lon/lat: west, south, east, north
CLIP = box(*BBOX)
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "atlas")
DECIMALS = 4  # about 10 m


def records(src, name):
    r = shapefile.Reader(os.path.join(src, name, name + ".shp"), encoding="utf-8", encodingErrors="replace")
    fields = [f[0] for f in r.fields[1:]]
    for sr in r.iterShapeRecords():
        if sr.shape.shapeType == shapefile.NULL:
            continue
        yield shape(sr.shape.__geo_interface__), dict(zip(fields, sr.record))


def rounded(geom):
    def r(c):
        if isinstance(c, (list, tuple)) and c and isinstance(c[0], (int, float)):
            return [round(c[0], DECIMALS), round(c[1], DECIMALS)]
        return [r(x) for x in c]

    g = mapping(geom)
    return {"type": g["type"], "coordinates": r(g["coordinates"])}


def clipped(geom, tolerance):
    if not geom.intersects(CLIP):
        return None
    g = geom.intersection(CLIP)
    if tolerance:
        g = g.simplify(tolerance, preserve_topology=True)
    return None if g.is_empty else g


def write(name, features):
    path = os.path.join(OUT, name)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump({"type": "FeatureCollection", "features": features}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{name}: {len(features)} features, {os.path.getsize(path) // 1024} KB")


def feature(geom, props):
    return {"type": "Feature", "geometry": rounded(geom), "properties": props}


def point(lon, lat, props):
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lon, DECIMALS), round(lat, DECIMALS)]}, "properties": props}


def inside(lon, lat):
    return BBOX[0] <= lon <= BBOX[2] and BBOX[1] <= lat <= BBOX[3]


def main(src):
    os.makedirs(OUT, exist_ok=True)

    land = [feature(g, {}) for g0, _ in records(src, "ne_10m_land") if (g := clipped(g0, 0.002))]
    write("land.geojson", land)

    lakes = [
        feature(g, {"name": p.get("name") or ""})
        for g0, p in records(src, "ne_10m_lakes")
        if (g := clipped(g0, 0.002))
    ]
    write("lakes.geojson", lakes)

    rivers = []
    for layer in ("ne_10m_rivers_lake_centerlines", "ne_10m_rivers_europe"):
        for g0, p in records(src, layer):
            if p.get("featurecla", "").startswith("Lake Centerline"):
                continue
            if (g := clipped(g0, 0.002)):
                rivers.append(feature(g, {"name": p.get("name") or "", "rank": int(p.get("scalerank") or 10)}))
    write("rivers.geojson", rivers)

    borders = [
        feature(g, {"rank": int(p.get("scalerank") or 10)})
        for g0, p in records(src, "ne_10m_admin_0_boundary_lines_land")
        if (g := clipped(g0, 0.001))
    ]
    write("borders.geojson", borders)

    provinces = [
        feature(g, {"rank": int(p.get("scalerank") or 10)})
        for g0, p in records(src, "ne_10m_admin_1_states_provinces_lines")
        if (g := clipped(g0, 0.002))
    ]
    write("provinces.geojson", provinces)

    countries = []
    for g, p in records(src, "ne_10m_admin_0_countries"):
        lon, lat = p.get("LABEL_X"), p.get("LABEL_Y")
        if lon is None or not inside(lon, lat):
            continue
        countries.append(point(lon, lat, {"name": p.get("NAME_EN") or p.get("NAME"), "rank": int(p.get("LABELRANK") or 6)}))
    write("countries.geojson", countries)

    towns = []
    for g, p in records(src, "ne_10m_populated_places"):
        lon, lat = g.x, g.y
        if not inside(lon, lat):
            continue
        towns.append(
            point(
                lon,
                lat,
                {
                    "name": p.get("NAME_EN") or p.get("NAME"),
                    "rank": int(p.get("SCALERANK") or 10),
                    "capital": 1 if "capital" in (p.get("FEATURECLA") or "").lower() else 0,
                    "pop": int(p.get("POP_MAX") or 0),
                },
            )
        )
    write("towns.geojson", towns)

    marine = []
    for g, p in records(src, "ne_10m_geography_marine_polys"):
        if not g.intersects(CLIP) or not p.get("name"):
            continue
        c = g.intersection(CLIP).representative_point()
        marine.append(point(c.x, c.y, {"name": p["name"], "rank": int(p.get("scalerank") or 6)}))
    write("marine.geojson", marine)

    features = []
    for g, p in records(src, "ne_10m_geography_regions_polys"):
        if not g.intersects(CLIP) or not p.get("NAME"):
            continue
        kind = (p.get("FEATURECLA") or "").lower()
        if kind not in ("desert", "range/mtn", "plain", "plateau", "basin", "lowland", "valley", "peninsula", "delta", "depression"):
            continue
        c = g.intersection(CLIP).representative_point()
        features.append(point(c.x, c.y, {"name": p["NAME"], "kind": kind, "rank": int(p.get("SCALERANK") or 6)}))
    write("features.geojson", features)


if __name__ == "__main__":
    main(sys.argv[1])
