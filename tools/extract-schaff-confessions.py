"""Writes the public-domain texts of the ecumenical creeds and the Three Forms
of Unity to reference/confessions/*.json, from Philip Schaff's *The Creeds of
Christendom* (1877; vol. II for the creeds, vol. III for the Reformed
standards), using the CCEL epubs the nineteenth-century shelf already ships
in library/.

    python tools/extract-schaff-confessions.py

Which English Schaff prints, and so which the app now carries:

- The Apostles' Creed: the received English form. Schaff's own glosses --
  "only (begotten) Son", "hell [Hades, spirit-world]", "body [flesh]" -- are
  dropped, leaving the text as churches say it.
- The Nicene Creed: "the Received Text of the Protestant Churches" (the Book
  of Common Prayer's). Schaff brackets the Western additions ("[God of God]",
  "[and the Son]"); they are part of that received text, so only the brackets
  go.
- The Athanasian Creed: the Prayer Book's "Old Translation", with the
  revisions Schaff suggests in brackets left out.
- The Heidelberg Catechism: the Tercentenary translation (New York, 1863),
  Q&A 80 with its bracketed later-edition passages as Schaff prints them.
  Schaff gives no Lord's Days; the standard fifty-two are added from
  LORDS_DAYS below.
- The Belgic Confession: the English of the Reformed (Dutch) Church in
  America, as revised at Dort.
- The Canons of Dort: the same church's English -- the positive articles of
  every head and the Conclusion. That English leaves out the Rejection of
  Errors; those come from Thomas Scott's translation of the whole Judgment
  (The Articles of the Synod of Dort, 1818), kept proofread in
  tools/dort-rejections.json -- see tools/extract-dort-rejections.py.

The CCEL text itself carries a few scanning slips ("theii", "tum away");
CORRECTIONS fixes them. Everything is written without Schaff's footnotes.
"""

import json
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
LIBRARY = ROOT / "library"
OUT = ROOT / "reference" / "confessions"
VOL2 = LIBRARY / "The Creeds of Christendom, Volume II The Greek and Latin Creeds.epub"
VOL3 = LIBRARY / "The Creeds of Christendom, Volume III The Evangelical Protestant Creeds.epub"
NS = "{http://www.w3.org/1999/xhtml}"
SOFT_HYPHEN = chr(0xAD)

# Scanning slips in CCEL's text of Schaff, found by checking every word
# against a dictionary and the KJV's vocabulary, then searching for the
# usual confusions that make real words ("tum" for "turn", "ns" for "us").
CORRECTIONS = {
    "theii": "their",
    " tum away": " turn away",
    "Aet. XII.": "Art. XII.",
    "great commandmen;": "great commandment;",
    "Jesns": "Jesus",
    " npon ": " upon ",
    "our sonls": "our souls",
    "tbeir": "their",
    "from Christi ascension": "from Christ's ascension",
    "unto ns for": "unto us for",
    "teach ns that": "teach us that",
}

# Where this text departs from Schaff on purpose. Q. 44 quotes the Apostles'
# Creed ("abgestiegen zu der Hölle"), which Schaff alone renders "Hades"
# (his footnote: "In the Apostles' Creed, Hell has the meaning of Hades");
# the creed as the app prints it, and as churches say it, reads "hell".
EDITORIAL = {
    "He descended into Hades?": "He descended into hell?",
}

# The fifty-two Lord's Days, as (first question, last question).
LORDS_DAYS = [
    (1, 2), (3, 5), (6, 8), (9, 11), (12, 15), (16, 19), (20, 23), (24, 25), (26, 26), (27, 28),
    (29, 30), (31, 32), (33, 34), (35, 36), (37, 39), (40, 44), (45, 45), (46, 49), (50, 52), (53, 53),
    (54, 56), (57, 58), (59, 61), (62, 64), (65, 68), (69, 71), (72, 74), (75, 77), (78, 79), (80, 82),
    (83, 85), (86, 87), (88, 91), (92, 95), (96, 98), (99, 100), (101, 102), (103, 103), (104, 104), (105, 107),
    (108, 109), (110, 111), (112, 112), (113, 115), (116, 119), (120, 121), (122, 122), (123, 123), (124, 124), (125, 125),
    (126, 126), (127, 129),
]

HEIDELBERG_PARTS = [
    (1, "Introduction"),
    (3, "Part I: Of Man's Misery"),
    (12, "Part II: Of Man's Redemption"),
    (86, "Part III: Of Thankfulness"),
]

SMALL_WORDS = {"a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "into", "nor", "of", "on", "or", "the", "to", "unto", "with"}


def read_chapter(epub: Path, name: str) -> ET.Element:
    with zipfile.ZipFile(epub) as z:
        src = z.read(f"OEBPS/{name}").decode("utf-8")
    src = re.sub(r"<!DOCTYPE[^>]*>", "", src)
    return ET.fromstring(src)


def clean(text: str) -> str:
    # Soft hyphens (U+00AD) mark where the scan broke a word: "counte-nance".
    text = re.sub(r"\s+", " ", text.replace(SOFT_HYPHEN, "")).strip()
    for wrong, right in {**CORRECTIONS, **EDITORIAL}.items():
        text = text.replace(wrong, right)
    return text


def text_of(el: ET.Element) -> str:
    """An element's text without its footnote markers (<sup class="Note">)."""
    parts = []

    def walk(e: ET.Element):
        if e.tag == NS + "sup" and e.get("class") == "Note":
            if e.tail:
                parts.append(e.tail)
            return
        if e.text:
            parts.append(e.text)
        for child in e:
            walk(child)
        if e is not el and e.tail:
            parts.append(e.tail)

    walk(el)
    return clean("".join(parts))


def english_cells(root: ET.Element):
    """The right-hand (English) cell of every two-column row, in order, as
    (style, text): Schaff sets the original on the left."""
    for tr in root.iter(NS + "tr"):
        tds = [c for c in tr if c.tag == NS + "td"]
        if len(tds) == 2:
            yield tds[1].get("style") or "", text_of(tds[1])
        elif len(tds) == 1:
            yield "single " + (tds[0].get("style") or ""), text_of(tds[0])


def paragraphs_from_cells(cells):
    """Joins cells split by a page break: an indented cell starts a
    paragraph, an unindented one continues the last."""
    paras = []
    for style, text in cells:
        if not text:
            continue
        if "text-indent" in style or not paras:
            paras.append(text)
        elif paras[-1].endswith("-") and not paras[-1].endswith(" -"):
            paras[-1] = paras[-1][:-1] + text
        else:
            paras[-1] = f"{paras[-1]} {text}"
    return paras


def title_case(heading: str) -> str:
    words = heading.strip().rstrip(".").lower().split()
    out = []
    for i, w in enumerate(words):
        if i > 0 and w in SMALL_WORDS:
            out.append(w)
        else:
            out.append(w[:1].upper() + w[1:])
    return " ".join(out)


def roman(n: str) -> int:
    values = {"I": 1, "V": 5, "X": 10, "L": 50}
    total = 0
    for i, c in enumerate(n):
        v = values[c]
        total += -v if i + 1 < len(n) and values[n[i + 1]] > v else v
    return total


# --- the creeds --------------------------------------------------------------

def unbracket(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("[", "").replace("]", "")).strip()


def drop_brackets(text: str) -> str:
    return re.sub(r"\s+([,.;:])", r"\1", re.sub(r"\s*\[[^\]]*\]", "", text)).strip()


def apostles():
    root = read_chapter(VOL2, "creeds2.iv.i.i.i.html")
    body = text_of(root)
    m = re.search(r"\(a\) RECEIVED FORM\.\s*(I believe in God.*?Amen\.)", body)
    text = drop_brackets(m.group(1)).replace("only (begotten) Son", "only Son")
    # One paragraph to each Person, as the creed is printed and said.
    i = text.index("And in Jesus Christ")
    j = text.index("I believe in the Holy Ghost")
    return {"title": "Apostles’ Creed", "paragraphs": [text[:i].strip(), text[i:j].strip(), text[j:].strip()]}


def nicene():
    root = read_chapter(VOL2, "creeds2.iv.i.ii.ii.html")
    cells = [t for _, t in english_cells(root)]
    start = next(i for i, t in enumerate(cells) if t.startswith("I believe in one God"))
    paras = []
    for t in cells[start:]:
        if not t:
            continue
        if t.startswith("And ") or not paras:
            paras.append(t)
        else:
            paras[-1] += " " + t
        if t.rstrip().endswith("Amen."):
            break
    # Schaff brackets two different things here: the Western additions to
    # the creed of 381 ("[God of God,]", "[and the Son]"), which the
    # received text says, and his own gloss "substance [essence]", which it
    # does not.
    paras = [unbracket(p.replace(" [essence]", "")).replace("before all worlds God of God", "before all worlds, God of God") for p in paras]
    return {"title": "Nicene Creed", "paragraphs": paras}


def athanasian():
    root = read_chapter(VOL2, "creeds2.iv.i.iv.html")
    paras = []
    for _, t in english_cells(root):
        m = re.match(r"(\d+)\. (.*)", t)
        if m:
            paras.append(drop_brackets(m.group(2)))
    assert len(paras) == 44, len(paras)
    return {"title": "Athanasian Creed", "paragraphs": paras}


# --- the Heidelberg Catechism ------------------------------------------------

def heidelberg():
    root = read_chapter(VOL3, "creeds3.iv.vi.html")
    cells = list(english_cells(root))
    qas = {}
    n = None
    state = None
    buf = []

    def flush():
        if n is not None and state == "a":
            qas[n]["a"] = paragraphs_from_cells(buf)

    for style, text in cells:
        m = re.match(r"\(?Question\s*(\d+)\.$", text)
        if m:
            flush()
            n, state, buf = int(m.group(1)), "q", []
            qas[n] = {"q": "", "a": []}
            continue
        if n is None:
            continue
        if text == "Answer.":
            state, buf = "a", []
            continue
        if "center" in style:
            # A part heading ("THE SECOND PART."), a subject line ("OF GOD
            # THE SON."), or a rule: the answer before it has ended.
            flush()
            state = None
            continue
        if state == "q":
            qas[n]["q"] = f"{qas[n]['q']} {text}".strip()
        elif state == "a":
            buf.append((style, text))
    flush()

    assert sorted(qas) == list(range(1, 130)), f"questions found: {len(qas)}"
    # Q. 80 is set in parentheses in Schaff: it came into the second edition.
    a80 = qas[80]["a"]
    a80[-1] = re.sub(r"\)\s*$", "", a80[-1])

    parts = []
    for i, (first, last) in enumerate(LORDS_DAYS, start=1):
        title = next(t for q, t in reversed(HEIDELBERG_PARTS) if q <= first)
        if not parts or parts[-1]["title"] != title:
            parts.append({"title": title, "lords_days": []})
        parts[-1]["lords_days"].append({
            "title": f"Lord’s Day {i}",
            "qas": [{"number": q, "q": qas[q]["q"], "a_paragraphs": qas[q]["a"]} for q in range(first, last + 1)],
        })
    return parts


# --- the Belgic Confession ---------------------------------------------------

def belgic():
    root = read_chapter(VOL3, "creeds3.iv.viii.html")
    articles = []
    current = None
    pending_title = False
    body = []

    def flush():
        if current is not None:
            current["paragraphs"] = paragraphs_from_cells(body)

    for style, text in english_cells(root):
        m = re.match(r"Art\. ([IVXL]+)\.$", text)
        if m:
            flush()
            current = {"number": roman(m.group(1)), "title": "", "paragraphs": []}
            articles.append(current)
            body, pending_title = [], True
            continue
        if current is None:
            continue
        if pending_title and "center" in style:
            current["title"] = title_case(text)
            pending_title = False
            continue
        if style.startswith("single"):
            continue  # "Even so, come Lord Jesus." -- the colophon, not Art. XXXVII
        body.append((style, text))
    flush()
    assert [a["number"] for a in articles] == list(range(1, 38)), [a["number"] for a in articles]
    return [
        {"level": "h3", "heading": f"Article {a['number']}: {a['title']}", "paragraphs": a["paragraphs"]}
        for a in articles
    ]


# --- the Canons of Dort -----------------------------------------------------

HEADS = ["First", "Second", "Third and Fourth", "Fifth"]


def dort(rejections):
    root = read_chapter(VOL3, "creeds3.iv.xvi.html")
    body = root.find(f".//{NS}div[@class='book-content']")
    ps = [p for p in body.iter(NS + "p")]
    start = next(i for i, p in enumerate(ps) if text_of(p) == "FIRST HEAD OF DOCTRINE.")
    units = []
    head = -1
    head_title = None
    conclusion = None
    for p in ps[start:]:
        t = text_of(p)
        style = p.get("style") or ""
        if not t:
            continue
        if "center" in style:
            if t.endswith("HEAD OF DOCTRINE.") or t.endswith("HEADS OF DOCTRINE."):
                head += 1
                head_title = None
            elif re.sub(r"\s+", "", t).lower() == "conclusion.":
                conclusion = {"heading": "Conclusion", "paragraphs": []}
            else:
                head_title = t.rstrip(".")
            continue
        if conclusion is not None:
            if t.startswith("Here follow the names"):
                break  # Schaff's note on the signatories, not the Canons
            conclusion["paragraphs"].append(t)
            continue
        m = re.match(r"Art\s*\.\s*([IVXL]+)\.\s*(.*)", t)
        if m:
            units.append({
                "head": head,
                "heading": f"{HEADS[head]} Head of Doctrine: {head_title} — Article {roman(m.group(1))}",
                "paragraphs": [m.group(2)],
            })
        else:
            units[-1]["paragraphs"].append(t)

    by_head = [[u for u in units if u["head"] == h] for h in range(4)]
    counts = [len(h) for h in by_head]
    assert counts == [18, 9, 17, 15], counts
    out = []
    for h, articles in enumerate(by_head):
        out.extend({"heading": u["heading"], "paragraphs": u["paragraphs"]} for u in articles)
        for r in rejections[str(h)]:
            # "The orthodox doctrine having been explained, the Synod
            # rejects the errors of those, -- 1. Who teach..."
            lead = [rejections[f"{h}-preamble"]] if r["number"] == 1 else []
            out.append({
                "heading": f"{HEADS[h]} Head of Doctrine: Rejection of Errors — {r['number']}",
                "paragraphs": lead + r["paragraphs"],
            })
    out.append(conclusion)
    return out


def load_rejections():
    path = ROOT / "tools" / "dort-rejections.json"
    if not path.exists():
        sys.exit(f"{path} is missing: it holds the proofread Rejection of Errors (see the header)")
    return json.loads(path.read_text(encoding="utf-8"))


def write(name, data):
    (OUT / name).write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def main():
    write("apostles.json", apostles())
    write("nicene.json", nicene())
    write("athanasian.json", athanasian())
    write("heidelberg.json", heidelberg())
    write("belgic.json", belgic())
    write("canons_of_dort.json", dort(load_rejections()))
    print("wrote apostles, nicene, athanasian, heidelberg, belgic, canons_of_dort")


if __name__ == "__main__":
    main()
