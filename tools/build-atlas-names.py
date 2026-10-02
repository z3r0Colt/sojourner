"""Names for the Atlas's places, without "Aphek 1" and "Aphek 2".

OpenBible.info's Bible Geocoding data numbers places that share a name
("Aphek 1" to "Aphek 4"). Some of those are different sites; some are the
same site, split because different verses or sources were identified
separately (Arad 1 and Arad 2 are both Tel Arad). This writes
reference/atlas/names.json, read by the content importer:

    { slug: { "name": "Aphek", "qualifier": "in Sharon" } }      a distinct site
    { slug: { "name": "Arad", "same_as": "arad-1" } }              one site, merged

A place whose name has no number is left out (its name stands).

Same site: same base name, a kind of place in common, within 2 km. One of them (the
most-cited) keeps the place; the others' verses join it, and their slugs
still lead to it (notes and sermons link by slug).

Qualifiers, for a name that is still shared by distinct sites, in order:
  1. OVERRIDES below, written by hand;
  2. OpenBible's own comment when it says where ("in Sharon");
  3. the Logos Factbook name OpenBible links to ("Aphek (of Asher)");
  4. direction and distance from a landmark ("south of Hebron").
Every qualifier in a group must differ, or the build stops.

Usage (from the repo root):
    python tools/build-atlas-names.py <path to OpenBible ancient.jsonl>
(the file is data/ancient.jsonl in github.com/openbibleinfo/Bible-Geocoding-Data)
"""

import ast
import collections
import json
import math
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(__file__), "..")
PLACES = os.path.join(ROOT, "reference", "atlas", "places.json")
OUT = os.path.join(ROOT, "reference", "atlas", "names.json")

# Written by hand where the sources say nothing useful, or say it badly.
OVERRIDES = {
    "ai-1": "near Bethel", "ai-2": "in Ammon",
    "ain-1": "on the northern border", "ain-2": "in Judah",
    "arabia-1": "the peninsula", "arabia-2": "Petraea",
    "babylon-1": "on the Euphrates", "babylon-3": "for Rome",
    "bethel-2": "in Judah",
    "calneh-1": "in Shinar", "calneh-2": "in Syria",
    "cush-1": "south of Egypt", "cush-2": "of Eden",
    "debir-1": "in the hill country of Judah", "debir-2": "on Judah’s border", "debir-3": "in Gad",
    "dibon-2": "in Judah",
    "ebenezer-1": "near Aphek", "ebenezer-2": "the stone",
    "eden-1": "the garden", "eden-2": "on the Euphrates",
    "eder-1": "the tower, near Bethlehem", "eder-2": "in the Negeb",
    "edrei-1": "in Bashan",
    "ephraim-1": "the town", "ephraim-3": "the forest",
    "ephron-1": "on Judah’s border", "ephron-2": "near Bethel",
    "etam-1": "the rock",
    "gath-1": "of the Philistines", "gath-2": "near Samaria",
    "geba-1": "in Benjamin", "geba-2": "or Gibeon",
    "gebal-1": "Byblos", "gebal-2": "in Edom",
    "gihon-1": "the river of Eden", "gihon-2": "the spring at Jerusalem",
    "goiim-1": "of Tidal", "goiim-2": "in Galilee",
    "ham-1": "east of the Jordan", "ham-2": "Egypt",
    "harod-1": "the spring",
    "hazazon-tamar-1": "in the Arabah", "hazazon-tamar-2": "En-gedi",
    "hazor-3": "Kerioth-hezron", "hazor-5": "in Arabia",
    "holon-2": "in Moab",
    "horonaim-1": "in Moab", "horonaim-2": "near Beth-horon",
    "jericho-1": "of the Old Testament", "jericho-2": "of the Gospels",
    "kanah-1": "the brook",
    "kir-1": "in Mesopotamia",
    "libnah-1": "in the Shephelah", "libnah-2": "a camp in the wilderness",
    "luz-1": "Bethel", "luz-2": "in the land of the Hittites",
    "meribah-1": "at Kadesh", "meribah-2": "at Rephidim",
    "migron-1": "near Gibeah", "migron-2": "near Michmash",
    "mizpah-3": "in Benjamin", "mizpah-4": "Galeed", "mizpeh-1": "in Benjamin",
    "moab-1": "the land", "moab-2": "the plains",
    "moreh-1": "at Shechem", "moreh-2": "the hill",
    "mount-hor-1": "on the border of Edom", "mount-hor-2": "in the north",
    "mount-seir-2": "in Judah",
    "naamah-1": "in Judah", "naamah-2": "home of Zophar",
    "nebo-2": "in Judah",
    "ramah-5": "in Gilead", "ramoth-3": "in Gilead",
    "red-sea-1": "Gulf of Suez", "red-sea-2": "Gulf of Aqaba",
    "rehob-1": "in the north",
    "riblah-1": "in Hamath", "riblah-2": "on the eastern border",
    "rimmon-1": "the rock", "rimmon-2": "in Simeon", "rimmon-3": "in Zebulun",
    "river-2": "the Euphrates", "river-3": "in Edom",
    "sharon-1": "the plain", "sharon-2": "east of the Jordan",
    "sheba-1": "the kingdom", "sheba-2": "in Simeon",
    "south-1": "the Negeb", "south-2": "Sheba", "south-3": "Egypt",
    "succoth-2": "in Egypt",
    "tabor-2": "in Zebulun", "tabor-3": "the oak",
    "samaria-1": "the city",
    "timnah-1": "in Judah", "timnah-3": "of Judah and Tamar",
    "zanoah-1": "in the Shephelah", "zanoah-2": "in the hill country",
    "zaphon-1": "in Gad", "zaphon-2": "the mountain",
    "zeredah-1": "in Ephraim", "zeredah-2": "in the Jordan valley",
    "ziph-2": "in the Negeb",
}

# Well-known places a qualifier can be measured from, by slug and the name
# a reader knows them by.
LANDMARKS = {
    "jerusalem": "Jerusalem", "bethlehem-1": "Bethlehem", "hebron": "Hebron", "beersheba-1": "Beersheba",
    "jericho-1": "Jericho", "bethel-1": "Bethel", "shechem": "Shechem", "samaria-1": "Samaria", "megiddo": "Megiddo",
    "nazareth": "Nazareth", "capernaum": "Capernaum", "tyre": "Tyre", "sidon": "Sidon", "damascus": "Damascus",
    "gaza": "Gaza", "ashdod": "Ashdod", "joppa": "Joppa", "dan": "Dan", "rabbah-1": "Rabbah", "heshbon": "Heshbon",
    "shiloh": "Shiloh", "lachish": "Lachish", "hazor-1": "Hazor", "beth-shan": "Beth-shan", "mahanaim": "Mahanaim",
    "kadesh-barnea": "Kadesh-barnea", "gibeon": "Gibeon",
}


def km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a["lat"], a["lon"], b["lat"], b["lon"]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def direction(frm, to):
    dy = to["lat"] - frm["lat"]
    dx = (to["lon"] - frm["lon"]) * math.cos(math.radians(frm["lat"]))
    ang = (math.degrees(math.atan2(dx, dy)) + 360) % 360
    return ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"][int((ang + 22.5) // 45) % 8]


def clean(s):
    return re.sub(r"<[^>]+>", "", s or "").strip()


def from_comment(comment):
    m = re.match(r"^(in|near|on|east of|west of|north of|south of|beyond) [^;,.(]+", clean(comment), re.I)
    return m.group(0).strip() if m else None


def from_factbook(name, base):
    m = re.search(r"\(([^)]+)\)$", name or "")
    t = m.group(1) if m else None
    if not t:
        m = re.match(rf"^{re.escape(base)} ((?:of|on|in|near|beyond) .+)$", name or "")
        t = m.group(1) if m else None
    if not t or re.search(r"\d|\b(Jos|Nu|Sa|Ki|Ch)\b", t) or t.lower() in ("town", "village", "biblical place", "deity", "place", "region", "garden"):
        return None
    t = t[0].lower() + t[1:]
    return t if re.match(r"^(of|on|in|near|beyond|north|south|east|west|above|below) ", t) else None


def main(ancient_path):
    source = {}
    with open(ancient_path, encoding="utf-8") as f:
        for line in f:
            d = json.loads(line)
            source[d["url_slug"]] = d
    places = json.load(open(PLACES, encoding="utf-8"))
    landmarks = {LANDMARKS[p["slug"]]: p for p in places if p["slug"] in LANDMARKS and p["lat"] is not None}
    missing = set(LANDMARKS.values()) - set(landmarks)
    if missing:
        sys.exit(f"landmarks not found: {missing}")

    groups = collections.defaultdict(list)
    for p in places:
        m = re.match(r"^(.*) (\d+)$", p["name"])
        if m:
            groups[m.group(1)].append(p)

    out = {}
    report = []
    for base, members in sorted(groups.items()):
        # Same site: within 2 km and the same kind of place.
        sites = []
        for p in sorted(members, key=lambda p: -len(p["verses"])):
            for site in sites:
                a = site[0]
                if set(p["kinds"]) & set(a["kinds"]) - {"special"} and p["lat"] is not None and a["lat"] is not None and km(a, p) < 2:
                    site.append(p)
                    break
            else:
                sites.append([p])
        for site in sites:
            for other in site[1:]:
                out[other["slug"]] = {"name": base, "same_as": site[0]["slug"]}
        if len(sites) == 1:
            out[sites[0][0]["slug"]] = {"name": base}
            report.append(f"{base}: one site ({', '.join(p['slug'] for p in sites[0])})")
            continue

        quals = {}
        for site in sites:
            keep = site[0]
            q, why = OVERRIDES.get(keep["slug"]), "override"
            for p in site:
                if q:
                    break
                d = source.get(p["slug"], {})
                ld = d.get("linked_data") or {}
                if isinstance(ld, str):
                    ld = ast.literal_eval(ld)
                fb = next((v.get("name") for v in ld.values() if isinstance(v, dict) and v.get("name")), None)
                q, why = from_comment(d.get("comment")), "comment"
                if not q:
                    q, why = from_factbook(fb, base), "factbook"
            if not q and keep["lat"] is not None and any(
                o[0] is not keep and o[0]["lat"] is not None and km(o[0], keep) < 2 for o in sites
            ):
                # A town and the land around it, at one spot: Cabul, Goshen, Samaria.
                q, why = {"settlement": "the town", "region": "the land", "mountain": "the hill", "water": "the water"}.get(keep["category"]), "same spot"
            if not q and keep["lat"] is not None:
                near = min(landmarks.values(), key=lambda l: km(keep, l))
                dist = km(keep, near)
                name = next(n for n, l in landmarks.items() if l is near)
                q, why = (f"near {name}" if dist < 12 else f"{direction(near, keep)} of {name}"), f"landmark {dist:.0f} km"
            quals[keep["slug"]] = (q, why)
        texts = [q for q, _ in quals.values()]
        dupes = {t for t in texts if texts.count(t) > 1 or not t}
        for site in sites:
            keep = site[0]
            q, why = quals[keep["slug"]]
            out[keep["slug"]] = {"name": base, "qualifier": q}
            flag = "  <-- CLASH" if q in dupes else ""
            first = keep["verses"][0]["readable"] if keep["verses"] else ""
            report.append(f"{base} {q!r:34} [{why}] {keep['slug']} = {keep['modern_name']} ({first}){flag}")
    print("\n".join(report))
    clashes = [r for r in report if "CLASH" in r]
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(dict(sorted(out.items())), f, ensure_ascii=False, indent=1)
    print(f"\n{len(out)} names, {sum(1 for v in out.values() if 'same_as' in v)} merged, {len(clashes)} clashes")
    if clashes:
        sys.exit(1)


if __name__ == "__main__":
    main(sys.argv[1])
