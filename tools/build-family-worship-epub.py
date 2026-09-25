"""Builds library/Thoughts on Family-Worship.epub: James W. Alexander, Thoughts
on Family-Worship (Philadelphia: Presbyterian Board of Publication, 1847).
Public domain.

No clean transcription of the book is published anywhere this could find
(CCEL and Project Gutenberg do not carry it), so it is made here from the six
scans of the 1847 edition on archive.org. They were printed from the same
stereotype plates, so every copy breaks its lines in the same places, and each
scan's OCR goes wrong in different places: "Ttese" in one copy is "These" in
the other five. So the words are voted on. Each copy's words are aligned to
the University of Toronto copy's, and a word the other copies agree on
replaces that copy's reading.

That copy's DjVu XML gives the page, the paragraph and each line's position,
which is what puts the paragraph breaks back: a page that opens on an
indented line opens a paragraph, and one that does not carries on the one
before. Running heads, page numbers and printer's signature marks are dropped;
words broken at a line end are joined when the joined word is one the book
uses elsewhere; footnotes follow the paragraph that cites them.

The title page, the dedication and the chapter titles are set by hand from the
scan, since OCR of capitals and small capitals is the least reliable of all.

What is left is OCR text, voted: far cleaner than any one scan, not proofread
line by line against the page. `--report` lists the words where the copies
disagreed with no majority, for anyone checking it.

Usage (from the repo root):
    python tools/build-family-worship-epub.py [--report]
Downloads go to .cache/family-worship/ (ignored by git). Then add or keep the
book's row in library/manifest.json and rebuild the pack: npm run build:pack
"""

import difflib
import html
import os
import re
import sys
import urllib.request
import uuid
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, ".cache", "family-worship")
OUT = os.path.join(ROOT, "library", "Thoughts on Family-Worship.epub")

BASE = "thoughtsonfamily00alexuoft"
OTHERS = [
    "thoughtsonfamily00alexrich",
    "thoughtsonfami00alex",
    "thoughtsonfamilywor00alex",
    "thoughtsonfamily00alex",
    "thoughtsonfamily00alex_0",
]

TITLES = [
    "The Nature, Warrant, and History of Family-Worship",
    "The Influence of Family-Worship on Individual Piety",
    "The Influence of Family-Worship on Parents",
    "The Influence of Family-Worship on Children",
    "The Influence of Family-Worship on Domestics",
    "Family-Worship as a Means of Intellectual Improvement",
    "The Influence of Family-Worship on Domestic Harmony and Love",
    "The Influence of Family-Worship on a Household in Affliction",
    "The Influence of Family-Worship on Visiters, Guests, and Neighbours",
    "The Influence of Family-Worship in Perpetuating Sound Doctrine",
    "The Influence of Family-Worship on the Church",
    "The Influence of Family-Worship on the Commonwealth",
    "The Influence of Family-Worship on Posterity",
    "Practical Directions as to the Mode of Conducting Family-Worship",
    "The Reading of Scripture, as a Part of Family-Worship",
    "Psalmody, as a Part of Family-Worship",
    "The Householder Exhorted to the Duty of Family-Worship",
    "Difficulties and Objections. — Conclusion",
]
ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII"]

# What the vote cannot mend: two titles set in German black letter and the
# Latin of one sentence, which one or two copies read rightly and the others
# garble each their own way; the divine name of Exodus 15:26; roman numerals
# whose "l" every copy reads as "I"; and a few words where most copies share
# one misreading, each looked up in all six.
CORRECTIONS = [
    (r"\S+(?=, vol\. ii\. p\. 83)", "Denkwürdigkeiten"),
    (r"Paul Sperat?l?us's hymn,.*$", "Paul Speratus's hymn, \"Es ist das Heil uns kommen her.\""),
    (r"\bhahet\b", "habet"),
    (r"\brelegentihus\b", "relegentibus"),
    (r"JEHOVAH-Ropm", "JEHOVAH-Rophi"),
    (r"deviations fc into", "deviations into"),
    (r"\bI(?=[xvil]*\. \d)", "l"),  # "Psalm Ixxxv. 4" is lxxxv
    # The OCR's "w^" for a "w" it could not place, and "tv" for a "w".
    (r"(?<=\w)\^(?=\w)", ""),
    (r"\btv(?=ith)", "w"),
    (r" \^(?= )", ""),
    (r"\bhimselt\b", "himself"),
    (r"\bfiftij\b", "fifty"),
    (r"\*hings\b", "things"),
    (r"\bhegin\b", "begin"),
    (r"\bbewray eth\b", "bewrayeth"),
    (r"\bprayy\b", "pray."),
    (r"\bthft xioh\b", "the rich"),
    (r"\boutI ward\b", "outward"),
    (r"\bk I wliich\b", "which"),
    (r"\bfarmlies\b", "families"),
    (r"\btlie\b", "the"),
    # A note mark set between the halves of a broken word: "spirit- * ual".
    (r"(\w)- ([*†]) (\w+)", r"\1\3\2"),
    # An opening quote read as two apostrophes, and note marks after a
    # closing quote read as "^" or "t".
    (r"(^|\s)'' ?(?=\w)", r'\1"'),
    (r"\"\^", "\"†"),
    (r"\. \"t\b", ".\"†"),
    # Compounds broken at a line's end, whose hyphen the join above cannot
    # tell from a syllable break.
    (r"\botherwiseminded\b", "otherwise-minded"),
    (r"\balabasterbox\b", "alabaster-box"),
    (r"\btimewasting\b", "time-wasting"),
    (r"\boldfashioned\b", "old-fashioned"),
    (r"\bselfdenying\b", "self-denying"),
    (r"\bpocketbibles\b", "pocket-bibles"),
    (r"\bfellowbeings\b", "fellow-beings"),
]

DEDICATION = [
    "To my father and my mother;",
    "by whose hands I was first led to Family-Worship,",
    "and for whose continuance in life and health at a period in which most sons are bereft of this blessing I am bound to give thanks,",
    "this volume,",
    "with humble prayer for every divine favour to rest on them and theirs",
    "is, in love and duty, respectfully inscribed.",
]


def fetch(name, suffix):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f"{name}{suffix}")
    if not os.path.exists(path):
        url = f"https://archive.org/download/{name}/{name}{suffix}"
        print("fetching", url)
        urllib.request.urlretrieve(url, path)
    with open(path, encoding="utf-8", errors="replace") as f:
        return f.read()


# ---------------------------------------------------------------------------
# The base copy, as pages of paragraphs of lines of (word, left edge).


def load_base():
    root = ET.fromstring(fetch(BASE, "_djvu.xml"))
    pages = []
    for obj in root.iter("OBJECT"):
        paras = []
        for para in obj.iter("PARAGRAPH"):
            lines = []
            for line in para.iter("LINE"):
                words = []
                for w in line.iter("WORD"):
                    left = int(w.get("coords", "0").split(",")[0])
                    # The OCR now and then boxes two words as one ("ship
                    # without"); they are voted on one at a time.
                    for k, part in enumerate((w.text or "").split()):
                        words.append([part, left + k])
                # A running head goes before the vote, wherever the OCR put it
                # on the page, so no copy's reading can splice it into the text.
                if words and not is_running_head(words):
                    lines.append(words)
            if lines:
                paras.append(lines)
        drop_head(paras)
        pages.append(paras)
    return pages


def drop_head(paras):
    """Takes the running head off a page however the OCR mangled it
    ("BAMILY-WORSHIP. 56", "(i4 FAMILY-WORSHIP.", "76 FAMILV-AVOKSrtlP."): it is
    one of the page's first two lines, short, and nearly all capitals. A
    chapter's own heading looks the same and stays."""
    for _ in range(2):
        if not paras:
            return
        first = paras[0][0]
        text = line_text(first)
        letters = re.sub(r"[^A-Za-z]", "", text)
        if re.match(r"^\W*(CHAPTER|PREFACE|CONTENTS)\b", text):
            return
        head = len(first) <= 5 and len(letters) >= 6 and sum(c.isupper() for c in letters) >= 0.7 * len(letters)
        if not (head or re.fullmatch(r"[\W\d]*", text)):
            return
        paras[0].pop(0)
        if not paras[0]:
            paras.pop(0)


# ---------------------------------------------------------------------------
# Voting


def norm(w):
    return re.sub(r"[^a-z0-9]", "", w.lower())


def lower(w):
    return re.search(r"[a-z]", w) is not None


def admissible(reading, base):
    # A word in lower case is never outvoted by a token with none: that is
    # another copy's damaged running head, page number or signature mark
    # ("F AMIL Y-WORSHIP. 130", "J 10") aligned against the text.
    return lower(reading) or not lower(base)


def vote(pages, report):
    # Each slot is a base word, [text, left], with the line it sits on.
    slots = [(w, id(line)) for page in pages for para in page for line in para for w in line]
    base_words = [w[0] for w, _ in slots]
    ballots = [Counter([w]) for w in base_words]
    # Where copies divide the words differently ("abetter" against "a
    # better"), the vote is over the span, not word by word.
    spans = {}
    everything = Counter(base_words)
    for name in OTHERS:
        # Each copy's heads and bare page numbers go too, as the base's did.
        other = [
            w
            for line in fetch(name, "_djvu.txt").splitlines()
            if not is_running_head(line.strip()) and not re.fullmatch(r"[\W\d]*", line)
            for w in line.split()
        ]
        everything.update(other)
        sm = difflib.SequenceMatcher(None, [norm(w) for w in base_words], [norm(w) for w in other], autojunk=False)
        for tag, i1, i2, j1, j2 in sm.get_opcodes():
            if tag == "equal" or (tag == "replace" and i2 - i1 == j2 - j1):
                for k in range(i2 - i1):
                    if admissible(other[j1 + k], base_words[i1 + k]):
                        ballots[i1 + k][other[j1 + k]] += 1
            elif tag == "replace" and i2 - i1 <= 3 and j2 - j1 <= 3:
                reading = other[j1:j2]
                if sum(not lower(w) for w in reading) <= sum(not lower(w) for w in base_words[i1:i2]):
                    spans.setdefault((i1, i2), Counter())[tuple(reading)] += 1
        print(f"  aligned {name}")

    changed = 0
    ties = []
    for (slot, _), ballot, word in zip(slots, ballots, base_words):
        # The most votes; a tie goes to the reading found more often across
        # all six copies, which is the real word far more often than not.
        best = max(ballot, key=lambda w: (ballot[w], everything[w], w == word))
        top = ballot.most_common(2)
        if len(top) > 1 and top[0][1] == top[1][1]:
            ties.append((word, best, dict(ballot)))
        if best != word:
            slot[0] = best
            changed += 1
    respaced = 0
    for (i1, i2), ballot in spans.items():
        reading, n = ballot.most_common(1)[0]
        # Three of the five other copies agree, and the span is on one line.
        if n >= 3 and len({slots[i][1] for i in range(i1, i2)}) == 1:
            slots[i1][0][0] = " ".join(reading)
            for i in range(i1 + 1, i2):
                slots[i][0][0] = ""
            respaced += 1
    print(f"  {changed} words and {respaced} spans corrected by the other copies; {len(ties)} ties")
    if report:
        for word, best, ballot in ties:
            print(f"    {word} -> {best}  {ballot}")


# ---------------------------------------------------------------------------
# Structure


HEAD = re.compile(r"^[\W\d]*(FA[MN]\S*|\S?[VW]O[RK]S\S*|PREFACE|CONTENTS)[\W\d]*$", re.I)


def line_text(line):
    return " ".join(w[0] for w in line if w[0])


def is_running_head(line):
    # "10 FAMILY-WORSHIP." or "PREFACE. 3": the running head with its page
    # number. A bare "PREFACE." is the preface's own title, and stays.
    t = line if isinstance(line, str) else line_text(line)
    squeezed = t.replace(" ", "")
    if len(t) >= 40 or not HEAD.match(squeezed) or len(re.findall(r"[a-z]", t)) > 2:
        return False
    return bool(re.search(r"\d", t)) or squeezed.upper().startswith("FAM")


def is_junk(line):
    t = line_text(line).strip()
    # Signature marks and stray specks: short, and no lower-case word in them.
    return len(t) <= 6 and not re.search(r"[a-z]{2}", t)


FOOTNOTE = re.compile(r"^\W?[*†‡§|•■]\s*\S")
# A note whose mark the OCR lost: a reference such as "Heb. xiii. 15." set
# among the last lines of a page.
BARE_NOTE = re.compile(r"^\W{0,2}(?:\d )?[A-Z][a-z]{1,6}\.? [ivxlcIVXLC]+\. \d")


def body_lines(pages):
    """Every body line in order, as (text, starts_paragraph, is_footnote),
    with running heads, page numbers and signatures gone."""
    out = []
    for page in pages:
        lines = [(line, pi, li) for pi, para in enumerate(page) for li, line in enumerate(para)]
        if not lines:
            continue
        # The head, and its page number when the OCR set it on a line of its
        # own, can be either of the first two lines.
        for _ in range(2):
            if lines and (is_running_head(lines[0][0]) or re.fullmatch(r"[\W\d]*", line_text(lines[0][0]))):
                lines = lines[1:]
        while lines and is_junk(lines[-1][0]):
            lines = lines[:-1]
        if not lines:
            continue
        margin = min(min(w[1] for w in line) for line, _, _ in lines)
        in_note = False
        for n, (line, pi, li) in enumerate(lines):
            text = line_text(line)
            indent = min(w[1] for w in line) - margin
            if FOOTNOTE.match(text) and n > 0 and li == 0:
                in_note = True
            elif not in_note and n > 0 and n >= len(lines) - 3 and li == 0 and BARE_NOTE.match(text):
                in_note = True
            if in_note:
                out.append((text, FOOTNOTE.match(text) is not None, True))
                continue
            # A paragraph's first line is indented about an em; the XML's own
            # paragraphs agree, except across a page, where only the indent
            # can tell a new paragraph from the old one carried over.
            starts = indent > 40 if n == 0 else (li == 0 and indent > 40)
            # Never a new paragraph on a word's second half, or on a line
            # that begins in lower case.
            carried = next((t for t, _, is_note in reversed(out) if not is_note), "")
            if starts and (carried.rstrip().endswith("-") or re.match(r"^\W*[a-z]", text)):
                starts = False
            out.append((text, starts, False))
    return out


def vocabulary(lines):
    words = Counter()
    for text, _, _ in lines:
        for w in text.split()[1:-1]:
            words[re.sub(r"^\W+|\W+$", "", w).lower()] += 1
    return words


def join_lines(texts, vocab):
    """Joins lines into one paragraph, mending words broken at a line end."""
    out = ""
    for text in texts:
        text = re.sub(r"\s+", " ", text).strip()
        if not out:
            out = text
            continue
        last = out.rsplit(" ", 1)[-1]
        first = text.split(" ", 1)[0]
        stem = re.sub(r"^\W+", "", last)
        rest = re.sub(r"\W+$", "", first)
        if stem.endswith("-") and len(stem) > 1:
            joined = (stem[:-1] + rest).lower()
            hyphened = (stem + rest).lower()
            before, after = stem[:-1].lower(), rest.lower()
            # Keep the hyphen of a compound: "fellow-" / "beings" is two words
            # the book uses, and "fellowbeings" is not one of its words.
            compound = vocab[joined] == 0 and len(before) > 2 and len(after) > 2 and vocab[before] > 0 and vocab[after] > 0
            if vocab[hyphened] > vocab[joined] or compound:
                out = out + text
            else:
                out = out[:-1] + text
        elif stem and rest and stem[-1].isalpha() and rest[0].islower() and vocab[(stem + rest).lower()] > 0 and (vocab[stem.lower()] == 0 or vocab[rest.lower()] == 0):
            # The hyphen itself lost by the OCR: "convic" / "tion".
            out = out + text
        else:
            out = out + " " + text
    return out


def tidy(p, note=False):
    p = re.sub(r"(\w)- (\w)", lambda m: m.group(1) + "-" + m.group(2), p)  # "Family- Worship"
    p = re.sub(r'(^|\s)" (?=\w)', r'\1"', p)  # an opening quote set off by a space
    p = re.sub(r'(?<=[\w.,;:!?]) "(?=\s|$)', '"', p)  # and a closing one
    # The dagger, double dagger and section marks come through as letters or
    # slashes; where they start a note's second or third reference, restore
    # them as the dagger they most often are.
    marks = r"(?:t|f|J|\\|\|\||\|)"
    if note:
        p = re.sub(r"(?<=[.;]) " + marks + r" (?=[A-Z0-9])", " † ", p)
        p = re.sub(r"^" + marks + r" (?=[A-Z0-9])", "† ", p)
    else:
        # A note mark after a word: "offered.*" and "him.\"t" read as letters.
        p = re.sub(r'(?<=[.,;:!?]")(?:t|f)(?=\s|$)', "†", p)
        p = re.sub(r"(?<=[a-z][.,;:!?])(?:t|f)(?=\s|$)", "†", p)
    p = re.sub(r" ([;:,.?!])", r"\1", p)  # "God ;" -> "God;"
    p = re.sub(r"\s+", " ", p)
    p = p.replace("--", "—")
    for wrong, right in CORRECTIONS:
        p = re.sub(wrong, right, p)
    return p.strip()


def paragraphs(lines, vocab):
    """Paragraphs (and footnotes, which follow the paragraph they sit under)."""
    paras = []
    notes_pending = []
    cur = []
    note = []

    def flush():
        nonlocal cur
        if cur:
            paras.append(("p", tidy(join_lines(cur, vocab))))
            cur = []
        for n in notes_pending:
            paras.append(("note", n))
        notes_pending.clear()

    for text, starts, is_note in lines:
        if is_note:
            if starts and note:
                notes_pending.append(tidy(join_lines(note, vocab), True))
                note = []
            note.append(text)
            continue
        if note:
            notes_pending.append(tidy(join_lines(note, vocab), True))
            note = []
        if starts:
            flush()
        cur.append(text)
    if note:
        notes_pending.append(tidy(join_lines(note, vocab), True))
    flush()
    return paras


def split_book(lines):
    """Preface and the eighteen chapters, each a list of lines."""
    texts = [t for t, _, _ in lines]

    def find(pattern, start=0):
        for i in range(start, len(texts)):
            if re.match(pattern, texts[i]):
                return i
        raise SystemExit(f"not found: {pattern}")

    preface = find(r"^PREFACE\.?$")
    contents = find(r"^CONTENTS", preface + 1)
    first = find(r"^CHAPTER\s+I\.?\s*$", contents + 30)
    starts = [first]
    for n in range(2, 19):
        starts.append(find(r"^CHAPTER\s+[IVXLl1]+\.?\s*$", starts[-1] + 5))
    # "THE END", in whatever shape the OCR left it; the book stops there.
    end = next((i for i in range(len(texts) - 1, starts[-1], -1) if re.match(r"^\W*THE\s*E\S{0,2}D\W*$", texts[i]) or re.fullmatch(r"\W*THE\W*", texts[i])), len(texts))
    sections = [("Preface", lines[preface + 1 : contents])]
    for n, s in enumerate(starts):
        stop = starts[n + 1] if n + 1 < len(starts) else end
        body = lines[s + 1 : stop]
        # The chapter's title in capitals comes first: skip to the first line
        # with lower case in it, which is where the text begins.
        k = 0
        while k < len(body) and not re.search(r"[a-z]{3}", body[k][0]):
            k += 1
        first_line = (body[k][0], True, False)
        sections.append((f"Chapter {ROMAN[n]}", [first_line] + body[k + 1 :]))
    return sections


# ---------------------------------------------------------------------------
# EPUB


CSS = """body { font-family: Georgia, serif; line-height: 1.5; margin: 0 1em; }
h1 { font-size: 1.3em; text-align: center; margin: 2em 0 0.3em; font-weight: normal; letter-spacing: 0.05em; }
h2 { font-size: 1.15em; text-align: center; margin: 0 0 1.5em; font-weight: normal; font-style: italic; }
p { margin: 0; text-indent: 1.5em; }
p.first { text-indent: 0; }
p.note { font-size: 0.85em; text-indent: 0; margin: 0.4em 0 0.8em 1.5em; color: #444; }
.title { text-align: center; margin-top: 3em; }
.title p { text-indent: 0; }
.dedication { text-align: center; margin-top: 3em; font-variant: small-caps; }
.dedication p { text-indent: 0; }
"""


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


def section_html(heading, subtitle, paras):
    out = [f"<h1>{html.escape(heading)}</h1>"]
    if subtitle:
        out.append(f"<h2>{html.escape(subtitle)}</h2>")
    first = True
    for kind, text in paras:
        if kind == "note":
            out.append(f'<p class="note">{html.escape(text)}</p>')
        else:
            out.append(f'<p{" class=\"first\"" if first else ""}>{html.escape(text)}</p>')
            first = False
    return "\n".join(out)


def write_epub(sections):
    book_id = "urn:uuid:" + str(uuid.uuid5(uuid.NAMESPACE_URL, "https://archive.org/details/" + BASE))
    files = []
    title_page = """<div class="title">
<p style="font-size:1.6em;letter-spacing:0.08em">THOUGHTS</p>
<p>ON</p>
<p style="font-size:1.6em;letter-spacing:0.08em">FAMILY-WORSHIP.</p>
<p style="margin-top:2em">BY</p>
<p style="font-size:1.2em">JAMES W. ALEXANDER,</p>
<p style="font-size:0.85em">PASTOR OF THE DUANE STREET PRESBYTERIAN CHURCH, NEW-YORK.</p>
<p style="margin-top:3em">PHILADELPHIA:</p>
<p>PRESBYTERIAN BOARD OF PUBLICATION.</p>
<p>1847.</p>
</div>"""
    files.append(("title.xhtml", "Title page", xhtml("Thoughts on Family-Worship", title_page)))
    ded = '<div class="dedication">' + "\n".join(f"<p>{html.escape(l)}</p>" for l in DEDICATION) + "</div>"
    files.append(("dedication.xhtml", "Dedication", xhtml("Dedication", ded)))
    for n, (name, paras) in enumerate(sections):
        if n == 0:
            files.append(("preface.xhtml", "Preface", xhtml("Preface", section_html("PREFACE.", None, paras))))
        else:
            label = f"Chapter {ROMAN[n - 1]}. {TITLES[n - 1]}"
            files.append((f"chapter{n:02d}.xhtml", label, xhtml(label, section_html(f"CHAPTER {ROMAN[n - 1]}.", TITLES[n - 1], paras))))

    nav_items = "\n".join(f'<li><a href="{f}">{html.escape(label)}</a></li>' for f, label, _ in files)
    nav = xhtml("Contents", f'<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>\n{nav_items}\n</ol></nav>')
    manifest = "\n".join(f'<item id="f{i}" href="{f}" media-type="application/xhtml+xml"/>' for i, (f, _, _) in enumerate(files))
    spine = "\n".join(f'<itemref idref="f{i}"/>' for i in range(len(files)))
    opf = f"""<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="en">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">{book_id}</dc:identifier>
<dc:title>Thoughts on Family-Worship</dc:title>
<dc:creator>James W. Alexander</dc:creator>
<dc:language>en</dc:language>
<dc:date>1847</dc:date>
<dc:publisher>Presbyterian Board of Publication, Philadelphia</dc:publisher>
<dc:source>https://archive.org/details/{BASE}</dc:source>
<dc:rights>Public domain</dc:rights>
<dc:description>Text made from six scans of the 1847 edition on archive.org by voting their OCR word by word; not proofread line by line.</dc:description>
<meta property="dcterms:modified">2026-09-24T00:00:00Z</meta>
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
    with zipfile.ZipFile(OUT, "w") as z:
        z.writestr(zipfile.ZipInfo("mimetype"), "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        z.writestr("META-INF/container.xml", container, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr("OEBPS/content.opf", opf, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr("OEBPS/nav.xhtml", nav, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr("OEBPS/style.css", CSS, compress_type=zipfile.ZIP_DEFLATED)
        for f, _, content in files:
            z.writestr("OEBPS/" + f, content, compress_type=zipfile.ZIP_DEFLATED)
    print("wrote", OUT)


def main():
    report = "--report" in sys.argv
    pages = load_base()
    print(f"{len(pages)} pages")
    vote(pages, report)
    lines = body_lines(pages)
    vocab = vocabulary(lines)
    sections = [(name, paragraphs(ls, vocab)) for name, ls in split_book(lines)]
    for name, paras in sections:
        print(f"  {name}: {sum(1 for k, _ in paras if k == 'p')} paragraphs, {sum(1 for k, _ in paras if k == 'note')} notes")
    write_epub(sections)


if __name__ == "__main__":
    main()
