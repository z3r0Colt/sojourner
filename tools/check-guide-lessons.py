"""Checks the guided study's lessons against what the app ships.

The lessons (src/features/guide/lessons/) name passages, Strong's numbers,
Webster headwords, Factbook people, Atlas places, timeline events,
commentaries and library books, and quote Scripture, the Standards and the
old expositors. This reads the lessons as the course has them and checks
each against content/content.db and the library:

  - every passage is a real verse range in the KJV;
  - every quotation in curly quotes is found, word for word (punctuation and
    case aside), in the KJV, the Standards and confessions, or the Standards
    commentary -- a quotation broken by an ellipsis is checked a part at a
    time;
  - every Strong's number, Webster word, Factbook id, Atlas place or
    journey, encyclopedia article, timeline event and Bible commentary
    exists;
  - every Standards commentary a step opens has something on that question;
  - every library book a step opens is in library/, and the words it opens
    at are in it (the first place they occur is printed, to check it is the
    right sermon).

Usage (from the repo root):
    DUMP_LESSONS=$TEMP/lessons.json npx vitest run src/features/guide/lessons.test
    python tools/check-guide-lessons.py $TEMP/lessons.json
"""

import html
import json
import re
import sqlite3
import sys
import zipfile

DB = "content/content.db"
BOOKS = {
    "A Body of Divinity": "library/Body of Divinity.epub",
    "The Ten Commandments": "library/Ten Commandments.epub",
    "The Lord's Prayer": "library/Lord's Prayer.epub",
}


# The app's own labels, which lessons quote to say what to click.
UI_LABELS = {"In the other Standards", "Add a note", "Or write it here"}


def norm(s):
    s = s.replace("’", "'").replace("‘", "'").lower()
    s = re.sub(r"[^a-z0-9' ]+", " ", s)
    s = s.replace("'", "")
    return re.sub(r"\s+", " ", s).strip()


def epub_text(path):
    """(file, text) per spine item, in reading order."""
    z = zipfile.ZipFile(path)
    opf = [x for x in z.namelist() if x.endswith(".opf")][0]
    o = z.read(opf).decode("utf8")
    hrefs = {}
    for item in re.findall(r"<item\b[^>]*>", o):
        i = re.search(r'\bid="([^"]+)"', item)
        h = re.search(r'\bhref="([^"]+)"', item)
        if i and h:
            hrefs[i.group(1)] = h.group(1)
    base = opf.rsplit("/", 1)[0] + "/" if "/" in opf else ""
    out = []
    for idref in re.findall(r'<itemref[^>]*idref="([^"]+)"', o):
        name = base + hrefs[idref]
        t = z.read(name).decode("utf8", "ignore")
        t = html.unescape(re.sub(r"<[^>]+>", " ", t))
        out.append((name.split("/")[-1], re.sub(r"\s+", " ", t)))
    return out


def main():
    lessons = json.load(open(sys.argv[1], encoding="utf-8"))
    c = sqlite3.connect(DB)
    kjv = c.execute("SELECT id FROM translations WHERE code='KJV'").fetchone()[0]
    last_verse = {}
    for b, ch, v in c.execute("SELECT book_id, chapter, MAX(verse) FROM verses WHERE translation_id=? GROUP BY book_id, chapter", (kjv,)):
        last_verse[(b, ch)] = v
    corpus = " | ".join(
        [norm(t) for (t,) in c.execute("SELECT text FROM verses WHERE translation_id=? ORDER BY book_id, chapter, verse", (kjv,))]
    )
    # Verses run on into each other inside a corpus, so a quotation spanning two verses is found.
    corpus = corpus.replace(" | ", " ")
    standards = " ".join(norm(f"{p or ''} {b}") for p, b in c.execute("SELECT prompt, body FROM westminster_sections"))
    commentary = " ".join(norm(b) for (b,) in c.execute("SELECT body FROM westminster_commentary_entries"))
    watson = " ".join(norm(t) for path in BOOKS.values() for _, t in epub_text(path))
    everything = corpus + " # " + standards + " # " + commentary + " # " + watson

    problems = []
    notes = []

    def bad(lesson, msg):
        problems.append(f"{lesson}: {msg}")

    def check_passage(lesson, p, where):
        last = last_verse.get((p["book"], p["chapter"]))
        if last is None:
            return bad(lesson, f"{where}: no chapter {p['book']} {p['chapter']}")
        for v in (p.get("verse"), p.get("to")):
            if v is not None and not 1 <= v <= last:
                bad(lesson, f"{where}: {p['book']} {p['chapter']}:{v} past the chapter's {last} verses")

    def check_quotes(lesson, text, where):
        for q in re.findall(r"“(.+?)”", text):
            if q.strip() in UI_LABELS:
                continue
            for part in re.split(r"…|\.\.\.", q):
                n = norm(part)
                if len(n.split()) < 3:
                    continue
                if n not in everything:
                    bad(lesson, f"{where}: quotation not found: “{part.strip()}”")

    def walk_passages(lesson, obj, where):
        if isinstance(obj, dict):
            if {"book", "chapter"} <= obj.keys() and isinstance(obj.get("book"), int):
                check_passage(lesson, obj, where)
            for k, v in obj.items():
                walk_passages(lesson, v, f"{where}.{k}")
        elif isinstance(obj, list):
            for i, v in enumerate(obj):
                walk_passages(lesson, v, f"{where}[{i}]")

    def exists(sql, *args):
        return c.execute(sql, args).fetchone() is not None

    book_text = {}
    for l in lessons:
        lid = l["id"]
        walk_passages(lid, l["workspace"], "workspace")
        check_quotes(lid, l["intro"], "intro")
        for s in l["steps"]:
            where = s["id"]
            walk_passages(lid, s, where)
            check_quotes(lid, s["text"], where)
            if s.get("tip"):
                check_quotes(lid, s["tip"], where)
            chk = s.get("check") or {}
            for q in chk.get("questions", []) if chk.get("type") == "quiz" else []:
                for t in [q["q"], q.get("why", ""), *q["choices"]]:
                    check_quotes(lid, t, f"{where} quiz")
            o = s.get("open") or {}
            pane = o.get("pane")
            if pane == "westminster":
                if not exists("SELECT 1 FROM westminster_sections WHERE id=?", o["sectionId"]):
                    bad(lid, f"{where}: no section {o['sectionId']}")
                if o.get("commentary") and not exists(
                    "SELECT 1 FROM westminster_commentary_entries e JOIN westminster_commentary_sources s ON s.id=e.source_id WHERE s.code=? AND e.chapter=?",
                    o["commentary"],
                    o["n"],
                ):
                    bad(lid, f"{where}: {o['commentary']} has nothing on {o['doc']} {o['n']}")
            elif pane in ("wordstudy", "lexicon"):
                if not exists("SELECT 1 FROM strongs_entries WHERE id=?", o["strongs"]):
                    bad(lid, f"{where}: no Strong's {o['strongs']}")
            elif pane == "webster":
                w = o["word"].lower()
                if not exists("SELECT 1 FROM webster_entries WHERE key=?", w) and not exists("SELECT 1 FROM webster_aliases WHERE alias=?", w):
                    bad(lid, f"{where}: no Webster entry for {w}")
            elif pane == "factbook":
                if not exists("SELECT 1 FROM factbook_entities WHERE id=?", o["id"]):
                    bad(lid, f"{where}: no Factbook {o['id']}")
            elif pane == "atlas":
                if o.get("slug") and not exists("SELECT 1 FROM atlas_places WHERE slug=?", o["slug"]):
                    bad(lid, f"{where}: no Atlas place {o['slug']}")
                if o.get("journey") and not exists("SELECT 1 FROM atlas_journeys WHERE slug=?", o["journey"]):
                    bad(lid, f"{where}: no Atlas journey {o['journey']}")
            elif pane == "encyclopedia":
                if not exists("SELECT 1 FROM isbe_entries WHERE slug=?", o["slug"]):
                    bad(lid, f"{where}: no encyclopedia article {o['slug']}")
            elif pane == "timeline":
                if not exists("SELECT 1 FROM timeline_events WHERE id=?", o["eventId"]):
                    bad(lid, f"{where}: no timeline event {o['eventId']}")
            elif pane == "commentary" and o.get("source"):
                if not exists("SELECT 1 FROM commentary_sources WHERE code=?", o["source"]):
                    bad(lid, f"{where}: no Bible commentary {o['source']}")
            elif pane == "psalter":
                if not 1 <= o["psalm"] <= 150:
                    bad(lid, f"{where}: no Psalm {o['psalm']}")
            elif pane == "book":
                path = BOOKS.get(o["title"])
                if not path:
                    bad(lid, f"{where}: unknown book {o['title']}")
                    continue
                f = o["fallback"]
                if not exists(
                    "SELECT 1 FROM westminster_commentary_entries e JOIN westminster_commentary_sources s ON s.id=e.source_id WHERE s.code=? AND e.chapter=?",
                    f["commentary"],
                    f["n"],
                ):
                    bad(lid, f"{where}: fallback {f['commentary']} has nothing on Q{f['n']}")
                if o.get("find"):
                    parts = book_text.setdefault(path, epub_text(path))
                    hits = [name for name, t in parts if o["find"] in t]
                    if not hits:
                        bad(lid, f"{where}: “{o['find']}” not in {o['title']}")
                    else:
                        notes.append(f"{lid}: {o['title']} opens at {hits[0]} ({len(hits)} section(s) have the words)")

    for n in notes:
        print(n)
    print()
    for p in problems:
        print("PROBLEM", p)
    print(f"{len(lessons)} lessons, {len(problems)} problem(s)")
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
