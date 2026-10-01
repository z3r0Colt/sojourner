"""Rebuilds shipped library books from EEBO-TCP transcriptions.

Several books in library/ were EPUBs that archive.org generated from its own
OCR of 17th- and 18th-century prints, and the OCR could not read them: the
long s comes out as f ("Chrift", "fhe"), and whole lines turn to noise
("ib thauke thing that oioft heal thb wound"). The Text Creation Partnership
typed the same books by hand, twice over, from the first editions, and
released them as CC0 (Phase I in 2015, Phase II in 2020). This tool turns
those TEI transcriptions into EPUBs that replace the bad ones under the same
file names, so a reader's tags and links on a book stay attached to it.

What it changes in the text, and only this:

  * The long s becomes s; the line-end hyphens the printer needed are joined.
  * u/v and i/j are regularised word by word ("loue" -> "love", "vnto" ->
    "unto", "Iesus" -> "Jesus"), but only where the printed form is not a word
    and the swapped one is. Every other old spelling ("selfe", "doth",
    "lesse") is left as printed.
  * A letter the keyers could not read (TCP's "•") is filled in when exactly
    the word that results occurs elsewhere in the same book or in a modern
    word list; a "cō" with a contraction stroke becomes "con" or "com" the
    same way. What cannot be settled stays a "•", and a lost word is "[…]".
  * Margin notes (mostly Scripture references) are kept, set small, inline
    where the note is anchored.

"Modern word list" means the words of Webster 1828, the KJV, Matthew Henry
and Calvin's commentaries as content.db has them, so content.db has to exist
(npm run build:content).

Usage (from the repo root):
    python tools/build-tcp-epub.py [<file name> ...] [--check]
With no file names it builds every book in BOOKS. --check prints the text of
a few random paragraphs per book instead of writing anything.
TEI files are cached in .cache/tcp/ (ignored by git). Then rebuild the pack:
npm run build:pack
"""

import html
import json
import os
import random
import re
import sqlite3
import sys
import urllib.request
import uuid
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, ".cache", "tcp")
LIBRARY = os.path.join(ROOT, "library")
CONTENT_DB = os.path.join(ROOT, "content", "content.db")
NS = "{http://www.tei-c.org/ns/1.0}"

# file name in library/ -> TCP id, and optional volume split. The edition
# (place, printer, year) is read from the TEI header.
# A split takes the body divisions from `from` up to (not including) `to`,
# matched against each division's heading; the front matter goes with the
# first volume and the back matter with the last.
BOOKS = {
    "The Rare Jewel of Christian Contentment.epub": {"tcp": "A30598"},
    "Clavis Cantici.epub": {"tcp": "A37032"},
    "A Brief Explication of the First Fifty Psalms.epub": {"tcp": "A35941"},
    "A Brief Explication of the Other Fifty Psalms.epub": {"tcp": "A35945"},
    "A Brief Explication of the Last Fifty Psalms.epub": {"tcp": "A35943"},
    "Truth's Victory Over Error.epub": {"tcp": "A35959"},
    "Christ Crucified Vol 1.epub": {"tcp": "A81890", "to": r"\bXXXIV\b"},
    "Christ Crucified Vol 2.epub": {"tcp": "A81890", "from": r"\bXXXIV\b"},
    "The Soul's Conflict and Victory Over Itself by Faith.epub": {"tcp": "A12198"},
    "The Gospel Mystery of Sanctification.epub": {"tcp": "A52074"},
    "Practical Works of Richard Baxter.epub": {"tcp": "A26892", "title": "A Christian Directory"},
}

# A file grows its children into files of their own past this many characters.
SPLIT_AT = 150_000

# SOME is letters lost in an unknown number ("1+ letters"): shown as "•" but
# never filled in, since no count means no way to check a guess.
EOL, PUNC, STROKE, LOST, SOME = "\ue000", "\ue001", "\ue002", "\ue003", "\ue004"
WORD = re.compile(r"[A-Za-z•" + STROKE + SOME + r"]+")

LABELS = {
    "title_page": "Title page", "dedication": "Dedication", "to_the_reader": "To the reader",
    "author_to_the_reader": "To the reader", "table_of_contents": "Contents", "errata": "Errata",
    "index": "Index", "encomium": "Commendatory verses", "preface": "Preface", "license": "Licence",
    "publishers_advertisement": "Advertisement", "publishers_note": "Publisher's note",
    "imprimatur": "Imprimatur", "poems": "Poems", "introduction": "Introduction", "conclusion": "Conclusion",
    "list_of_heretics": "List of heretics", "affirmation": "Affirmation", "addendum": "Addendum",
    "table": "Table", "epigraph": "Epigraph", "summary": "Summary", "excerpts": "Excerpts", "text": "Text",
}

CSS = """body { font-family: Georgia, serif; line-height: 1.5; margin: 0 1em; }
h1 { font-size: 1.3em; text-align: center; margin: 2em 0 1em; font-weight: normal; letter-spacing: 0.04em; }
h2 { font-size: 1.15em; text-align: center; margin: 1.5em 0 0.8em; font-weight: normal; }
h3, h4 { font-size: 1em; text-align: center; margin: 1.2em 0 0.6em; font-weight: normal; font-style: italic; }
p { margin: 0; text-indent: 1.5em; }
.argument p, .epigraph p { font-style: italic; text-indent: 0; margin: 0 1.5em 0.8em; }
blockquote { margin: 0.6em 1.5em; }
blockquote p { text-indent: 0; }
.note { font-size: 0.78em; color: #666; }
.title p, .closer p, .opener p { text-align: center; text-indent: 0; }
.title { margin-top: 2em; }
ul { list-style: none; padding-left: 1.5em; margin: 0.3em 0; }
.lg { margin: 0.6em 1.5em; }
.lg p { text-indent: 0; }
.source { font-size: 0.85em; color: #555; text-indent: 0; margin-top: 2em; }
"""


def fetch(tcp_id):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, tcp_id + ".xml")
    if not os.path.exists(path):
        url = f"https://raw.githubusercontent.com/textcreationpartnership/{tcp_id}/master/{tcp_id}.xml"
        print("  fetching", url)
        with urllib.request.urlopen(url) as r, open(path, "wb") as f:
            f.write(r.read())
    return ET.parse(path).getroot()


def modern_words():
    if not os.path.exists(CONTENT_DB):
        sys.exit("content/content.db is missing: run npm run build:content first")
    con = sqlite3.connect(CONTENT_DB)
    words = set()
    for (w,) in con.execute("SELECT word FROM webster_entries"):
        if w:
            words.add(w.lower())
    queries = [
        "SELECT v.text FROM verses v JOIN translations t ON t.id = v.translation_id WHERE t.code = 'KJV'",
        "SELECT e.plain_text FROM commentary_entries e JOIN commentary_sections s ON s.id = e.section_id "
        "JOIN commentary_sources c ON c.id = s.commentary_source_id WHERE c.code IN ('mhc', 'calcom')",
    ]
    for q in queries:
        for (text,) in con.execute(q):
            words.update(w.lower() for w in re.findall(r"[A-Za-z]+", text or ""))
    return words


# ---------------------------------------------------------------------------
# TEI -> HTML, with markers left in for the word pass

def text_of(s):
    return re.sub(r"\s+", " ", (s or "").replace("ſ", "s"))


def gap(e):
    extent = e.get("extent", "")
    m = re.match(r"(\d+) letters?$", extent)
    if m and int(m.group(1)) <= 3:
        return "•" * int(m.group(1))
    if extent == "1+ letters":
        return SOME
    return LOST


def inline(e):
    """Everything inside e, as HTML, without e's own tag or tail."""
    out = [html.escape(text_of(e.text), quote=False)]
    for c in e:
        out.append(element(c))
        out.append(html.escape(text_of(c.tail), quote=False))
    return "".join(out)


def element(e):
    tag = e.tag[len(NS):] if e.tag.startswith(NS) else e.tag
    if tag == "g":
        ref = e.get("ref", "")
        if ref in ("char:EOLhyphen", "char:EOLunhyphen"):
            return EOL
        if ref == "char:punc":
            return PUNC
        if ref == "char:cmbAbbrStroke":
            return STROKE
        if ref == "char:abque":
            return "que"
        return html.escape((e.text or "").replace("Ʋ", "V"), quote=False)
    if tag == "gap":
        return gap(e)
    if tag in ("pb", "milestone", "lb", "figure", "desc"):
        return " " if tag == "lb" else ""
    if tag == "note":
        return f' <span class="note">[{inline_flat(e)}]</span> '
    if tag == "hi":
        if e.get("rend") == "sup":
            return f"<sup>{inline(e)}</sup>"
        return f"<em>{inline(e)}</em>"
    if tag == "expan":
        return "".join(html.escape(text_of(x.text), quote=False) for x in e.iter(NS + "ex")) or inline(e)
    if tag in ("p", "head", "list", "lg", "argument", "epigraph", "opener", "closer", "div", "floatingText", "trailer"):
        # Block inside a run of text (a list in a paragraph, say): keep the words.
        return " " + inline_flat(e) + " "
    if tag == "q":
        return f"“{inline(e)}”" if not has_blocks(e) else " " + inline_flat(e) + " "
    if tag == "label":
        return f"<strong>{inline(e)}</strong> "
    # seg, bibl, date, term, abbr, salute, signed, dateline, l, item ... keep the text
    return inline(e)


def inline_flat(e):
    return inline(e)


BLOCKS = {"p", "head", "list", "lg", "argument", "epigraph", "opener", "closer", "div", "q",
          "floatingText", "trailer", "signed", "salute", "dateline", "item", "l", "byline",
          "docTitle", "titlePart", "docImprint", "docAuthor", "byline", "postscript", "bibl"}


def has_blocks(e):
    return any((c.tag[len(NS):] if c.tag.startswith(NS) else c.tag) in ("p", "lg", "list", "q", "head") for c in e)


def block(e, level):
    """A block-level TEI element as HTML. `level` is the heading level for heads."""
    tag = e.tag[len(NS):]
    if tag == "div":
        return "\n".join(block(c, level + 1) for c in e if isinstance(c.tag, str)) + tail_text(e)
    if tag == "head":
        h = min(level, 4)
        return f"<h{h}>{inline(e).strip()}</h{h}>" + tail_text(e)
    if tag == "p":
        return f"<p>{inline(e).strip()}</p>" + tail_text(e)
    if tag in ("argument", "epigraph", "opener", "closer", "lg", "trailer", "postscript"):
        cls = "lg" if tag == "lg" else tag
        return f'<div class="{cls}">' + kids(e, level) + "</div>" + tail_text(e)
    if tag == "q":
        return "<blockquote>" + kids(e, level) + "</blockquote>" + tail_text(e)
    if tag == "list":
        items = []
        for c in e:
            if c.tag == NS + "item":
                items.append(f"<li>{inline(c).strip()}</li>")
            elif c.tag == NS + "head":
                items.append(f"<li><strong>{inline(c).strip()}</strong></li>")
            elif c.tag == NS + "label":
                items.append(f"<li><strong>{inline(c).strip()}</strong></li>")
        return "<ul>" + "".join(items) + "</ul>" + tail_text(e)
    if tag in ("l", "item", "signed", "salute", "dateline", "byline", "bibl", "trailer"):
        return f"<p>{inline(e).strip()}</p>" + tail_text(e)
    if tag in ("pb", "milestone", "figure"):
        return tail_text(e)
    if tag == "note":
        return f'<p class="note">[{inline(e).strip()}]</p>' + tail_text(e)
    if tag == "floatingText":
        return kids(e, level)
    if tag in ("body", "front", "back"):
        return kids(e, level)
    # Anything else at block level: its words, in a paragraph.
    return f"<p>{inline(e).strip()}</p>" + tail_text(e)


def kids(e, level):
    parts = []
    lead = text_of(e.text).strip()
    if lead:
        parts.append(f"<p>{html.escape(lead, quote=False)}</p>")
    for c in e:
        if isinstance(c.tag, str):
            parts.append(block(c, level))
    return "\n".join(p for p in parts if p)


def tail_text(e):
    t = text_of(e.tail).strip()
    return f"<p>{html.escape(t, quote=False)}</p>" if t else ""


def head_label(div):
    h = div.find(NS + "head")
    if h is None:
        return None
    # The heading without its margin notes.
    copy = ET.fromstring(ET.tostring(h))
    for n in copy.iter():
        for c in list(n):
            if c.tag in (NS + "note", NS + "gap"):
                tail = c.tail
                n.remove(c)
    s = re.sub(r"\s+", " ", "".join(copy.itertext())).replace("ſ", "s").strip()
    return s or None


# ---------------------------------------------------------------------------
# The word pass

class Words:
    def __init__(self, modern, book_text):
        self.modern = modern
        found = re.findall(r"[A-Za-z]+", book_text)
        self.book = Counter(w.lower() for w in found)
        # Each word's usual capitalisation in the book ("Christ", not "christ").
        forms = Counter(found)
        self.case = {}
        for w, n in forms.most_common():
            self.case.setdefault(w.lower(), w)
        self.fixed = Counter()

    def known(self, w):
        lw = w.lower()
        return lw in self.modern or self.book[lw] >= 3

    def best(self, candidates):
        """The candidate the book itself uses most, else one modern English knows."""
        scored = [(self.book[c.lower()], c.lower() in self.modern, c) for c in candidates]
        scored = [s for s in scored if s[0] > 0 or s[1]]
        if not scored:
            return None
        scored.sort(key=lambda s: (s[0], s[1]), reverse=True)
        return scored[0][2]

    def regularise(self, w):
        """u/v and i/j as a modern reader expects them, only when that makes a word."""
        lw = w.lower()
        # "ion" is the tail of a word cut by a lost letter, not "Jon".
        if lw in self.modern or lw == "ion" or len(w) < 3 or not re.search(r"[uvijUVIJ]", w):
            return w
        if "vv" in w or "VV" in w:
            double = w.replace("vv", "w").replace("VV", "W")
            if double.lower() in self.modern:
                self.fixed[(w, double)] += 1
                return double
        options = {w}
        for _ in range(3):
            more = set()
            for o in options:
                for i, ch in enumerate(o):
                    # Never the last letter: printers did not end a word on
                    # either, so a final one is an abbreviation ("Nov") or a
                    # word cut at an apostrophe ("resolv'd").
                    swap = {"u": "v", "v": "u", "U": "V", "V": "U"}.get(ch) if i < len(o) - 1 else None
                    if ch in "Ii" and i == 0:
                        swap = "J" if ch == "I" else "j"
                    if swap:
                        more.add(o[:i] + swap + o[i + 1:])
            options |= more
        good = [o for o in options if o != w and o.lower() in self.modern]
        if not good:
            return w
        # Fewest changes wins; then the commoner word in modern texts is moot, take the first.
        good.sort(key=lambda o: sum(a != b for a, b in zip(o, w)))
        self.fixed[(w, good[0])] += 1
        return good[0]

    def word(self, w):
        if SOME in w:
            return w.replace(SOME, "•")
        if STROKE in w:
            i = w.index(STROKE)
            nxt = w[i + 1:i + 2].lower()
            first = "m" if nxt in ("b", "p", "m") else "n"
            choice = self.best([w.replace(STROKE, first, 1), w.replace(STROKE, "mn".replace(first, ""), 1)])
            w = choice or w.replace(STROKE, first, 1)
            if STROKE in w:
                return self.word(w)
        if "•" in w:
            if w.count("•") <= 2 and len(w) > 2:
                cands = [w]
                for _ in range(w.count("•")):
                    cands = [c.replace("•", l, 1) for c in cands for l in "abcdefghijklmnopqrstuvwxyz"]
                choice = self.best(cands)
                if choice:
                    # Keep the capital if the word began with one.
                    return choice
            return w
        return self.regularise(w)


def fix_text(s, words):
    """Join line-end hyphens, settle the markers, regularise each word."""
    s = s.replace(" ", " ")

    def join(m):
        a, b = m.group(1), m.group(2)
        whole = a + b
        if words.known(whole) or not (words.known(a) and words.known(b)):
            return whole
        return a + "-" + b

    s = re.sub(r"([A-Za-z•" + STROKE + r"]+)\s*" + EOL + r"\s*((?:<[^>]+>)*[A-Za-z•" + STROKE + r"]+)",
               lambda m: join(m) if "<" not in m.group(2) else m.group(1) + m.group(2), s)
    s = re.sub(r"\s*" + EOL + r"\s*", "", s)

    def punc(m):
        a, b = m.group(1), m.group(2)
        if b[:1].islower() and words.known(a + b) and not words.known(b):
            return a + b
        return a + ", " + b

    s = re.sub(r"([A-Za-z]+)\s*" + PUNC + r"\s*([A-Za-z]+)", punc, s)
    s = s.replace(PUNC, ",")
    # A gap inside a word ("con<gap/>ion") is letters, not a word: mark it as
    # unread letters so the word stays whole and may yet be filled in.
    s = re.sub(r"(?<=[A-Za-z])" + LOST + r"(?=[A-Za-z])", SOME, s)
    s = s.replace(LOST, "[…]")

    # Word by word, outside tags only.
    parts = re.split(r"(<[^>]+>)", s)
    for i in range(0, len(parts), 2):
        parts[i] = WORD.sub(lambda m: words.word(m.group(0)), parts[i])
    s = "".join(parts)
    # A decorated initial is followed by a capital: "BLessed" -> "Blessed".
    s = re.sub(r"(<p>(?:<[^>]+>)*[“\"]?)([A-Z])([A-Z]+)([a-z])",
               lambda m: m.group(1) + m.group(2) + m.group(3).lower() + m.group(4), s)
    s = re.sub(r" +([,.;:?!)\]])", r"\1", s)
    s = re.sub(r"\( +", "(", s)
    s = re.sub(r"  +", " ", s)
    # A paragraph that was only a missing or duplicate page's marker.
    s = re.sub(r"<p>\s*</p>\n?", "", s)
    return s


# ---------------------------------------------------------------------------
# Files and the EPUB

def divisions(root):
    """(part, div) for every top-level division of front, body and back, with
    single wrapper divisions (a body that is one big 'text' div) unwrapped."""
    text = root.find(NS + "text")
    out = []
    for part in ("front", "body", "back"):
        p = text.find(NS + part)
        if p is None:
            continue
        for d in p:
            if d.tag == NS + "div":
                out.append((part, d))
    return out


def label_for(div):
    t = div.get("type") or ""
    if t == "Psalm" and div.get("n"):
        head = head_label(div) or ""
        rest = re.sub(r"^PSAL\w*\.?\s*[IVXLC .]+\.?\s*", "", head).strip()
        return f"Psalm {div.get('n')}" + (f". {rest}" if rest else "")
    head = head_label(div)
    if head:
        head = head if len(head) <= 90 else head[:87].rsplit(" ", 1)[0] + "…"
        return head
    if t == "book" and div.get("n"):
        return f"Book {div.get('n')}"  # a book whose title page was lost
    return LABELS.get(t, t.replace("_", " ").capitalize() or "Section")


def plan(div, depth, files, toc):
    """Turn a division into one file, or into an opening file and its children."""
    child_divs = [c for c in div if c.tag == NS + "div"]
    size = len("".join(div.itertext()))
    label = label_for(div)
    entry = {"label": label, "file": None, "children": []}
    toc.append(entry)
    if child_divs and (size > SPLIT_AT or div.get("type") == "text") and depth < 4:
        lead = [c for c in div if c.tag != NS + "div"]
        # Material before the first child (heading, argument) gets a file of its own.
        first_child = div.index(child_divs[0]) if hasattr(div, "index") else 0
        opening = [c for c in list(div)[:list(div).index(child_divs[0])]]
        trailing = [c for c in list(div)[list(div).index(child_divs[0]):] if c.tag != NS + "div"]
        if any("".join(c.itertext()).strip() for c in opening):
            files.append({"label": label, "elems": opening, "level": depth + 1})
            entry["file"] = len(files) - 1
        for c in child_divs:
            plan(c, depth + 1, files, entry["children"])
        if trailing and any("".join(c.itertext()).strip() for c in trailing):
            files.append({"label": label + " (end)", "elems": trailing, "level": depth + 1})
        if entry["file"] is None:
            entry["file"] = entry["children"][0]["file"] if entry["children"] else None
    else:
        files.append({"label": label, "elems": [div], "level": depth})
        entry["file"] = len(files) - 1


def xhtml(title, body):
    return f"""<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
<head><meta charset="utf-8"/><title>{html.escape(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
{body}
</body>
</html>
"""


def render(elems, level):
    out = []
    for e in elems:
        if e.tag == NS + "div":
            if e.get("type") == "title_page":
                out.append('<div class="title">' + "\n".join(
                    f"<p>{inline(c).strip()}</p>" for c in e.iter() if c.tag in (NS + "p", NS + "titlePart", NS + "docImprint", NS + "byline") and inline(c).strip()
                ) + "</div>")
            else:
                out.append("\n".join(block(c, level) for c in e if isinstance(c.tag, str)))
        else:
            out.append(block(e, level))
    return "\n".join(out)


def nav_list(entries, names):
    items = []
    for en in entries:
        if en["file"] is None:
            continue
        sub = nav_list(en["children"], names) if en["children"] else ""
        items.append(f'<li><a href="{names[en["file"]]}">{html.escape(en["label"])}</a>{sub}</li>')
    return "<ol>" + "".join(items) + "</ol>" if items else ""


def manifest_entry(file_name):
    with open(os.path.join(LIBRARY, "manifest.json"), encoding="utf-8") as f:
        for row in json.load(f):
            if row["file_name"] == file_name:
                return row
    sys.exit(f"{file_name} is not in library/manifest.json")


def imprint(root):
    """Place, printer and year of the printed edition, from the TEI header."""
    stmt = root.find(f".//{NS}sourceDesc//{NS}publicationStmt")

    def get(tag):
        e = stmt.find(NS + tag)
        return re.sub(r"\s+", " ", " ".join(e.itertext())).strip(" ,.:;") if e is not None else ""

    year = re.findall(r"1[5-8]\d\d", get("date"))
    place = get("pubPlace").strip("[] ")
    printer = re.sub(r"\s*\.\.\.$", "", get("publisher")).strip(" ,.")
    return {"date": year[-1] if year else "", "imprint": f"{place}: {printer}"}


def select(root, spec):
    """The divisions this volume takes, per the split in BOOKS."""
    all_divs = divisions(root)
    if "from" not in spec and "to" not in spec:
        return all_divs
    body = [i for i, (part, _) in enumerate(all_divs) if part == "body"]
    start = body[0]
    end = body[-1] + 1
    for i in body:
        lab = label_for(all_divs[i][1]) or ""
        if "from" in spec and re.search(spec["from"], lab) and start == body[0]:
            start = i
        if "to" in spec and re.search(spec["to"], lab):
            end = i
            break
    if "from" in spec:
        return all_divs[start:end] + [d for d in all_divs[end:] if d[0] == "back"]
    return [d for d in all_divs if d[0] == "front"] + all_divs[start:end]


# ---------------------------------------------------------------------------
# Filling gaps from the edition that shipped before
#
# The EPUB each of these books replaced was OCR of a later printing: no use as
# a text, but it was printed from a whole copy. Aligned to the transcription,
# it can say what a "•" or a "[…]" was -- and is believed only where its word
# fits the letters the transcribers could read ("lo•" against "look").

WITNESS_REV = "06ece9a"  # the last commit with the OCR editions in library/
WITNESS_FILES = {"Practical Works of Richard Baxter.epub": None}  # CCEL page images: no text


def witness_words(file_name):
    if file_name in WITNESS_FILES and WITNESS_FILES[file_name] is None:
        return []
    import subprocess
    import io
    data = subprocess.run(["git", "show", f"{WITNESS_REV}:library/{file_name}"], cwd=ROOT, capture_output=True, check=True).stdout
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        opf_name = next(n for n in z.namelist() if n.endswith(".opf"))
        opf = z.read(opf_name).decode("utf-8", "replace")
        base = os.path.dirname(opf_name)
        hrefs = dict(re.findall(r'<item[^>]*id="([^"]+)"[^>]*href="([^"]+)"', opf))
        hrefs.update({i: h for h, i in re.findall(r'<item[^>]*href="([^"]+)"[^>]*id="([^"]+)"', opf)})
        order = re.findall(r'<itemref[^>]*idref="([^"]+)"', opf)
        text = []
        for i in order:
            h = hrefs.get(i)
            if not h:
                continue
            path = (base + "/" + h) if base else h
            if path in z.namelist():
                text.append(re.sub(r"<[^>]+>", " ", z.read(path).decode("utf-8", "replace")))
    return html.unescape(" ".join(text)).split()


def gap_key(w):
    """Spelling-blind form for aligning 1650 with 1850: case, long s and its f
    misreading, u/v and i/j, doubled letters and a final e all fall away."""
    w = re.sub(r"[^a-z]", "", w.lower().replace("ſ", "s").replace("f", "s").replace("v", "u").replace("j", "i"))
    w = re.sub(r"(.)\1+", r"\1", w)
    return w[:-1] if len(w) > 3 and w.endswith("e") else w


def anchors(a, b, n=4):
    import bisect

    def grams(seq):
        pos = {}
        for i in range(len(seq) - n + 1):
            g = tuple(seq[i:i + n])
            if all(g):
                pos.setdefault(g, []).append(i)
        return {g: p[0] for g, p in pos.items() if len(p) == 1}

    ga, gb = grams(a), grams(b)
    pairs = sorted((ga[g], gb[g]) for g in ga.keys() & gb.keys())
    tails, idx, prev = [], [], [None] * len(pairs)
    for k, (_, j) in enumerate(pairs):
        p = bisect.bisect_left(tails, j)
        if p == len(tails):
            tails.append(j)
            idx.append(k)
        else:
            tails[p] = j
            idx[p] = k
        prev[k] = idx[p - 1] if p > 0 else None
    chain, k = [], (idx[-1] if idx else None)
    while k is not None:
        chain.append(pairs[k])
        k = prev[k]
    return chain[::-1]


def align(a, b):
    import difflib
    ia = ja = 0
    for (i, j) in anchors(a, b) + [(len(a), len(b))]:
        if i < ia or j < ja:
            continue
        sm = difflib.SequenceMatcher(None, a[ia:i], b[ja:j], autojunk=False)
        for tag, i1, i2, j1, j2 in sm.get_opcodes():
            yield tag, ia + i1, ia + i2, ja + j1, ja + j2
        if i < len(a):
            yield "equal", i, i + 4, j, j + 4
        ia, ja = i + 4, j + 4


def fill_gaps(bodies, file_name, words):
    """Fills "•" and "[…]" in the finished chapters, from the old edition
    where it fits and otherwise from the book's own commonest fitting word."""
    old = witness_words(file_name)
    # Every word outside tags, as (chapter, part index, match start, match end, text).
    TOKEN = re.compile(r"\[…\]|[A-Za-z•]+")
    split = [re.split(r"(<[^>]+>)", b) for b in bodies]
    toks = []
    for c, parts in enumerate(split):
        for p in range(0, len(parts), 2):
            for m in TOKEN.finditer(parts[p]):
                toks.append((c, p, m.start(), m.end(), m.group(0)))
    keys = [gap_key(t[4]) if "•" not in t[4] and t[4] != "[…]" else "" for t in toks]
    seen = {}
    if old:
        okeys = [gap_key(w) for w in old]
        for tag, i1, i2, j1, j2 in align(keys, okeys):
            if tag in ("equal", "replace") and i2 - i1 == j2 - j1:
                for k in range(i2 - i1):
                    seen[i1 + k] = re.sub(r"^\W+|\W+$", "", old[j1 + k])

    def fits(word, candidate):
        pattern = "".join("(.{1,4})" if ch == "•" else re.escape(ch) for ch in word)
        m = re.fullmatch(pattern, candidate.replace("ſ", "s"), re.I)
        if not m:
            return None
        it = iter(m.groups())
        return "".join(next(it) if ch == "•" else ch for ch in word)

    vocab = [w for w, n in words.book.items() if n >= 3]
    edits = {}
    stats = Counter()
    for k, (c, p, s, e, w) in enumerate(toks):
        if w == "[…]":
            o = seen.get(k)
            if o and o.isalpha() and words.known(o):
                edits[k] = o
                stats["lost word"] += 1
            continue
        if "•" not in w:
            continue
        readable = sum(ch.isalpha() for ch in w)
        if readable < 1:
            continue
        o = seen.get(k)
        filled = fits(w, o) if o else None
        if filled and words.known(filled):
            edits[k] = filled
            stats["from the old edition"] += 1
            continue
        # The book's own words that fit, if one is far the commonest.
        pattern = re.compile("".join(".{1,4}" if ch == "•" else re.escape(ch.lower()) for ch in w))
        options = sorted(((words.book[v], v) for v in vocab if pattern.fullmatch(v)), reverse=True)
        # Guessing from the book alone needs more to go on: "•e" could be a
        # dozen words, and the commonest of them is not evidence.
        if readable >= 3 and options and (len(options) == 1 or options[0][0] >= 4 * options[1][0]) and options[0][0] >= 5:
            edits[k] = fits(w, words.case.get(options[0][1], options[0][1]))
            stats["from the book"] += 1
    # Apply right to left within each text part, so offsets stay good.
    by_part = {}
    for k, new in edits.items():
        c, p, s, e, _ = toks[k]
        by_part.setdefault((c, p), []).append((s, e, new))
    for (c, p), changes in by_part.items():
        text = split[c][p]
        for s, e, new in sorted(changes, reverse=True):
            text = text[:s] + new + text[e:]
        split[c][p] = text
    for parts in split:
        for p in range(0, len(parts), 2):
            parts[p] = re.sub(r"(?<=\S)  +(?=\S)", " ", parts[p])
    return ["".join(parts) for parts in split], stats


def chapters(file_name, spec, modern):
    """The book's files as XHTML bodies: (files, toc, bodies, words, spec
    with the imprint filled in). build-collated-epub.py uses this for a book
    whose first part TCP has and whose rest it has not."""
    root = fetch(spec["tcp"])
    spec = dict(spec, **imprint(root))
    chosen = select(root, spec)

    files, toc = [], []
    for _, d in chosen:
        plan(d, 1, files, toc)

    raw = [render(f["elems"], f["level"]) for f in files]
    words = Words(modern, re.sub(r"<[^>]+>", " ", " ".join(raw)).replace(EOL, "").replace(STROKE, ""))
    bodies = [fix_text(r, words) for r in raw]
    # The contents' labels get the same u/v, i/j as the text ("DVTY" -> "DUTY").
    relabel = lambda s: re.sub(r"[A-Za-z]+", lambda m: words.regularise(m.group(0)), s)
    for f in files:
        f["label"] = relabel(f["label"])

    def walk(entries):
        for en in entries:
            en["label"] = relabel(en["label"])
            walk(en["children"])

    walk(toc)
    bodies, filled = fill_gaps(bodies, file_name, words)
    if filled:
        print(f"  gaps filled: {dict(filled)}")
    return files, toc, bodies, words, spec


def build(file_name, spec, modern, check=False):
    row = manifest_entry(file_name)
    title = spec.get("title") or row["title"]
    author = row["author"]
    files, toc, bodies, words, spec = chapters(file_name, spec, modern)

    plain = re.sub(r"<[^>]+>", " ", " ".join(bodies))
    n_words = len(re.findall(r"[A-Za-z]+", plain))
    unread = plain.count("•")
    lost = plain.count("[…]")
    print(f"{file_name}: {len(files)} files, {n_words:,} words, {unread} unread letters, {lost} lost words, "
          f"{sum(words.fixed.values()):,} u/v/i/j regularised")
    if check:
        rnd = random.Random(1)
        paras = [p for p in re.findall(r"<p>(.*?)</p>", " ".join(bodies)) if len(p) > 200]
        for p in rnd.sample(paras, min(3, len(paras))):
            print("   >", re.sub(r"<[^>]+>", "", p)[:400])
        print("   fixes:", ", ".join(f"{a}->{b}" for (a, b), _ in words.fixed.most_common(15)))
        return

    names = [f"part{i:03d}.xhtml" for i in range(len(files))]
    contents = [xhtml(f["label"], b) for f, b in zip(files, bodies)]
    source = (f'<p class="source">This edition: {html.escape(title)}, {html.escape(spec["imprint"])}, {spec["date"]}. '
              f'Text from the Text Creation Partnership transcription {spec["tcp"]} (EEBO-TCP), released under CC0; '
              f"long s, line-end hyphens and u/v, i/j regularised for reading. "
              f"A “•” marks a letter the transcribers could not read; “[…]” a lost word.</p>")
    names.append("source.xhtml")
    contents.append(xhtml("About this text", f"<h1>About this text</h1>{source}"))
    toc.append({"label": "About this text", "file": len(names) - 1, "children": []})

    nav = xhtml("Contents", f'<nav epub:type="toc" id="toc"><h1>Contents</h1>{nav_list(toc, names)}</nav>')
    book_id = "urn:uuid:" + str(uuid.uuid5(uuid.NAMESPACE_URL, f"tcp:{spec['tcp']}:{file_name}"))
    manifest = "\n".join(f'<item id="f{i}" href="{n}" media-type="application/xhtml+xml"/>' for i, n in enumerate(names))
    spine = "\n".join(f'<itemref idref="f{i}"/>' for i in range(len(names)))
    opf = f"""<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="en">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">{book_id}</dc:identifier>
<dc:title>{html.escape(title)}</dc:title>
<dc:creator>{html.escape(author)}</dc:creator>
<dc:language>en</dc:language>
<dc:date>{spec["date"]}</dc:date>
<dc:publisher>{html.escape(spec["imprint"])}</dc:publisher>
<dc:source>https://quod.lib.umich.edu/e/eebo/{spec["tcp"]}.0001.001</dc:source>
<dc:rights>Public domain text; TCP transcription CC0 1.0</dc:rights>
<meta property="dcterms:modified">2026-10-01T00:00:00Z</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="css" href="style.css" media-type="text/css"/>
{manifest}
</manifest>
<spine>
{spine}
</spine>
</package>
"""
    container = """<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
"""
    out = os.path.join(LIBRARY, file_name)
    with zipfile.ZipFile(out, "w") as z:
        z.writestr(zipfile.ZipInfo("mimetype"), "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        z.writestr("META-INF/container.xml", container, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr("OEBPS/content.opf", opf, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr("OEBPS/nav.xhtml", nav, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr("OEBPS/style.css", CSS, compress_type=zipfile.ZIP_DEFLATED)
        for n, c in zip(names, contents):
            z.writestr("OEBPS/" + n, c, compress_type=zipfile.ZIP_DEFLATED)
    # Every chapter must parse as XML, or the reader shows nothing.
    with zipfile.ZipFile(out) as z:
        for n in names + ["nav.xhtml", "content.opf"]:
            ET.fromstring(z.read("OEBPS/" + n))
    print("  wrote", out)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    check = "--check" in sys.argv
    todo = args or list(BOOKS)
    for name in todo:
        if name not in BOOKS:
            sys.exit(f"not a TCP book: {name}")
    modern = modern_words()
    print(f"{len(modern):,} modern words")
    for name in todo:
        build(name, BOOKS[name], modern, check)


if __name__ == "__main__":
    main()
