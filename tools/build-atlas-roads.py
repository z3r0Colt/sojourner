"""Builds the Atlas's roads (public/atlas/roads.geojson).

Two kinds of road, both drawn in the Atlas under Layers:

  * Roman roads, from the Ancient World Mapping Center's geodata
    (github.com/AWMC/geodata, Cultural-Data/roads), under the Open Database
    License: clipped to the biblical world and simplified a little, keeping
    each road's name, whether it was a major road, and whether its course is
    known or conjectured. (AWMC does not document its flags; "1" in
    Major_or_M and Known_or_a is what the Via Appia and Via Egnatia carry,
    so 1 is major and known.) The file this writes is a derivative database of
    theirs and is under the same licence (public/atlas/roads-LICENSE.txt).

  * The great routes of the Old Testament that every Bible atlas draws -- the
    Way of the Sea, the King's Highway, the ridge route of the patriarchs, the
    Way of Shur -- set down here as the stations they are traditionally drawn
    through, using the Atlas's own coordinates for those places. Their
    courses between stations are approximate, and marked so.

Usage (from the repo root):
    python tools/build-atlas-roads.py <AWMC roads.geojson>
"""

import json
import os
import sys

from shapely.geometry import box, mapping, shape

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "public", "atlas", "roads.geojson")
PLACES = os.path.join(ROOT, "reference", "atlas", "places.json")
CLIP = box(-20.0, 0.0, 80.0, 58.0)

# Stations by Atlas slug, or [lon, lat] for a point on the road no place
# marks (Pelusium, and El-Arish on the Sinai coast).
OT_ROUTES = [
    ("The Way of the Sea", ["goshen-1", [32.55, 31.04], [33.80, 31.13], "gaza", "ashkelon", "ashdod", "joppa", "aphek-2", "megiddo", "hazor-1", "damascus"]),
    ("The King's Highway", ["damascus", "ashtaroth", "edrei-1", "ramoth-gilead", "rabbah-1", "heshbon", "medeba", "dibon-1", "aroer-1", "kir-2", "bozrah-1", "elath"]),
    ("The Way of the Patriarchs", ["beersheba-1", "hebron", "bethlehem-1", "jerusalem", "bethel-1", "shiloh", "shechem", "dothan"]),
    ("The Way of Shur", ["beersheba-1", "shur", "goshen-1"]),
    ("The Jericho road", ["jerusalem", "jericho-1"]),
]


def rounded(coords):
    if isinstance(coords[0], (int, float)):
        return [round(coords[0], 4), round(coords[1], 4)]
    return [rounded(c) for c in coords]


def main(awmc_path):
    features = []
    awmc = json.load(open(awmc_path, encoding="utf-8"))
    for f in awmc["features"]:
        if not f.get("geometry"):
            continue
        g = shape(f["geometry"])
        if not g.intersects(CLIP):
            continue
        g = g.intersection(CLIP).simplify(0.003, preserve_topology=False)
        if g.is_empty:
            continue
        p = f["properties"]
        name = (p.get("Name") or "").replace("_", " ").strip()
        name = name[:1].upper() + name[1:] if name else ""
        m = mapping(g)
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": m["type"], "coordinates": rounded(m["coordinates"])},
                "properties": {"kind": "roman", "name": name, "major": 1 if str(p.get("Major_or_M")) == "1" else 0, "known": 1 if str(p.get("Known_or_a")) == "1" else 0},
            }
        )
    roman = len(features)

    places = {p["slug"]: p for p in json.load(open(PLACES, encoding="utf-8"))}
    for name, stations in OT_ROUTES:
        line = []
        for s in stations:
            if isinstance(s, list):
                line.append(s)
                continue
            p = places.get(s)
            if not p or p["lat"] is None:
                sys.exit(f"{name}: no place {s}")
            line.append([round(p["lon"], 4), round(p["lat"], 4)])
        features.append(
            {"type": "Feature", "geometry": {"type": "LineString", "coordinates": line}, "properties": {"kind": "ot", "name": name, "major": 1, "known": 0}}
        )

    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump({"type": "FeatureCollection", "features": features}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"roads.geojson: {roman} Roman road segments, {len(OT_ROUTES)} Old Testament routes, {os.path.getsize(OUT) // 1024} KB")


if __name__ == "__main__":
    main(sys.argv[1])
