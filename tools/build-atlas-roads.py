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
    through, using the Atlas's own coordinates for those places. Between two
    stations the route follows the Roman roads where they serve: the Romans
    paved the old highways rather than laying new ones (the coast road on the
    Way of the Sea, the Via Nova Traiana on the King's Highway, the road from
    Jerusalem to Neapolis on the ridge). Where no Roman road serves -- across
    Sinai, say -- the route is a straight line between its stations. Either
    way the course is approximate, and marked so.

Usage (from the repo root):
    python tools/build-atlas-roads.py <AWMC roads.geojson>
"""

import heapq
import json
import math
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


# Routing between stations, as the Atlas routes journeys (src/features/atlas/routes.ts):
# road ends this close are one junction, a loose end joins a road this near,
# and going across country counts this much more than its distance.
JOIN_DEGREES = 0.004
LINK_KM = 5
OFF_ROAD = 1.6
OFF_ROAD_KM = 25


def km(a, b):
    r = math.radians
    h = math.sin(r(b[1] - a[1]) / 2) ** 2 + math.cos(r(a[1])) * math.cos(r(b[1])) * math.sin(r(b[0] - a[0]) / 2) ** 2
    return 2 * 6371.0088 * math.asin(min(1, math.sqrt(h)))


class Roads:
    """The Roman roads as a graph, for finding the way between two stations."""

    def __init__(self, lines):
        self.pts, self.edges, keys = [], [], {}

        def node(p):
            k = (round(p[0] / JOIN_DEGREES), round(p[1] / JOIN_DEGREES))
            if k not in keys:
                keys[k] = len(self.pts)
                self.pts.append(p)
                self.edges.append([])
            return keys[k]

        for line in lines:
            prev = None
            for p in line:
                i = node(p)
                if prev is not None and prev != i:
                    d = km(self.pts[prev], self.pts[i])
                    self.edges[prev].append((i, d))
                    self.edges[i].append((prev, d))
                prev = i
        self.cells = {}
        for i, p in enumerate(self.pts):
            self.cells.setdefault((math.floor(p[0] * 10), math.floor(p[1] * 10)), []).append(i)
        # Join loose ends to the nearest road they are not already joined to.
        parent = list(range(len(self.pts)))

        def find(i):
            while parent[i] != i:
                parent[i] = parent[parent[i]]
                i = parent[i]
            return i

        for i, es in enumerate(self.edges):
            for j, _ in es:
                parent[find(i)] = find(j)
        for i in range(len(self.pts)):
            if len(self.edges[i]) > 1:
                continue
            best, best_km = None, LINK_KM
            for j in self.near(self.pts[i], 1):
                if find(j) == find(i):
                    continue
                d = km(self.pts[i], self.pts[j])
                if d < best_km:
                    best, best_km = j, d
            if best is not None:
                self.edges[i].append((best, best_km))
                self.edges[best].append((i, best_km))
                parent[find(i)] = find(best)

    def near(self, p, reach):
        cx, cy = math.floor(p[0] * 10), math.floor(p[1] * 10)
        return [i for dx in range(-reach, reach + 1) for dy in range(-reach, reach + 1) for i in self.cells.get((cx + dx, cy + dy), [])]

    def way(self, a, b):
        """The course from a to b: A* through the roads, free to go across
        country at the OFF_ROAD cost; the straight line when that is best."""
        straight = km(a, b)
        if straight < 3:
            return [a, b], False
        start, goal = -1, -2
        pos = {start: a, goal: b}

        def at(i):
            return pos[i] if i < 0 else self.pts[i]

        reach = math.ceil(OFF_ROAD_KM / 11) + 1
        near_goal = {i for i in self.near(b, reach) if km(self.pts[i], b) <= OFF_ROAD_KM}
        cost, prev = {start: 0.0}, {}
        heap = [(straight, start)]
        ceiling = straight * OFF_ROAD
        while heap:
            est, i = heapq.heappop(heap)
            if i == goal or est > ceiling + 1e-9:
                break
            if est - km(at(i), b) > cost[i] + 1e-9:
                continue
            if i == start:
                out = [(goal, straight, True)] + [(j, km(a, self.pts[j]), True) for j in self.near(a, reach)]
                out = [o for o in out if o[0] == goal or o[1] <= OFF_ROAD_KM]
            else:
                out = [(j, d, False) for j, d in self.edges[i]]
                if i in near_goal:
                    out.append((goal, km(self.pts[i], b), True))
            for j, d, off in out:
                c = cost[i] + d * (OFF_ROAD if off else 1)
                if c < cost.get(j, math.inf):
                    cost[j] = c
                    prev[j] = i
                    heapq.heappush(heap, (c + km(at(j), b), j))
        if goal not in prev or prev[goal] == start:
            return [a, b], False
        path = [goal]
        while path[-1] != start:
            path.append(prev[path[-1]])
        return [at(i) for i in reversed(path)], True


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

    roads = Roads(
        line
        for f in features
        for line in ([f["geometry"]["coordinates"]] if f["geometry"]["type"] == "LineString" else f["geometry"]["coordinates"])
    )
    places = {p["slug"]: p for p in json.load(open(PLACES, encoding="utf-8"))}
    for name, stations in OT_ROUTES:
        points = []
        for s in stations:
            if isinstance(s, list):
                points.append(tuple(s))
                continue
            p = places.get(s)
            if not p or p["lat"] is None:
                sys.exit(f"{name}: no place {s}")
            points.append((round(p["lon"], 4), round(p["lat"], 4)))
        line, by_road = [list(points[0])], 0
        for a, b in zip(points, points[1:]):
            course, on_road = roads.way(a, b)
            by_road += on_road
            line += [list(p) for p in course[1:]]
        print(f"  {name}: {by_road} of {len(points) - 1} stages along Roman roads")
        features.append(
            {"type": "Feature", "geometry": {"type": "LineString", "coordinates": rounded(line)}, "properties": {"kind": "ot", "name": name, "major": 1, "known": 0}}
        )

    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump({"type": "FeatureCollection", "features": features}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"roads.geojson: {roman} Roman road segments, {len(OT_ROUTES)} Old Testament routes, {os.path.getsize(OUT) // 1024} KB")


if __name__ == "__main__":
    main(sys.argv[1])
