"""Rebuilds shipped library books that exist only as OCR, by collating editions.

For some books no transcription exists, and the EPUB that shipped was one
archive.org scan's OCR, which for an 18th-century print is poor: the long s
read as f ("Chrift", "finners"), and a word or two on every line damaged.
Robert Traill's Works is the case this was written for.

No one scan can be trusted, but the scans go wrong in different places, and
the same text survives in more than one edition. So one scan is the base --
it gives the lines, the paragraphs and the pages -- and every other copy is
aligned to it word by word (anchored on runs of words both share, then
difflib between anchors). For each base word the copies vote, and a reading
that is a word beats one that is not:

  * The long s: a copy whose OCR keeps "ſ" settles it outright. Otherwise an
    "f" may stand for s, and the reading that is a word wins ("finners" ->
    "sinners"); where both are words ("fin", "sin") the copies' votes and
    then how common each is in modern texts decide.
  * Damage: a base word that is not a word, against a copy that reads a word
    there, takes the copy's reading. Short runs too ("be* lierersy" ->
    "believers").
  * Specks: what the base has and no copy has, and is not a word, goes
    (marks at the page edge, letters showing through from the facing page).

Running heads, page numbers, signature marks and catchwords are dropped by
position. Line-end hyphens are joined when the joined word is a word.
Section titles are set by hand per volume (OCR of capitals is the least
reliable of all) and found in order in the collated text.

What is left is OCR text, collated: far cleaner than any one scan, not
proofread against the page. The spelling of the base edition is kept,
except the long s.

"Modern texts" are Webster 1828, the KJV, and Matthew Henry's and Calvin's
commentaries as content.db has them (npm run build:content first).

Usage (from the repo root):
    python tools/build-collated-epub.py [<file name> ...] [--check]
--check prints sample paragraphs and the section titles found, and writes
nothing. Scans are cached in .cache/collate/ (ignored by git). Then rebuild
the pack: npm run build:pack
"""

import bisect
import difflib
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
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, ".cache", "collate")
LIBRARY = os.path.join(ROOT, "library")
CONTENT_DB = os.path.join(ROOT, "content", "content.db")

TRAILL_1796 = "bim_eighteenth-century_the-works-of-the-late-re_traill-robert_1796_"
TRAILL_IMPRINT = "Paisley: Printed by William Paton, for William Brownlie, 1796"


# A section is found one of two ways. A pattern starting "@" is a heading in
# capitals, looked for in the base and in every copy and placed in the base
# through the alignment (one copy's OCR seldom reads every heading). Any
# other pattern is matched against the start of the collated paragraphs
# (a section's opening words, which survive collation better than its title).
# Tolerates the OCR's spacing and its 8 for S and 0 for O ("8 E R M 0 N").
SERMON = r"@\b[S8]\s?E\s?R\s?M\s?[O0]\s?N\s?S?\b"


def sermons(n, text):
    """n numbered sermons."""
    return [(SERMON, f"Sermon {roman(i)}. {text}") for i in range(1, n + 1)]


def roman(n):
    out = ""
    for v, s in ((10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")):
        while n >= v:
            out, n = out + s, n - v
    return out


# Each book: the base scan (DjVu XML, so lines and positions are known), the
# other copies (plain OCR text) as (name, longs, headings), and the sections
# in order. "longs": an f in that copy's OCR may be a long s (the 1810 edition
# was printed without one). "headings": its headings may place sections --
# not so for a copy that holds other volumes too, whose headings would land
# on chance alignments.
BOOKS = {
    "Works, Vol. 1.epub": {
        "base": TRAILL_1796 + "1",
        "copies": [("worksoflatereverend01trai", True, True)],
        "imprint": TRAILL_IMPRINT,
        "sections": [
            (r"LIFE\s+and\s+CHARA", "An Account of the Life and Character of the Author"),
            (r"some\s+\w+\s+s\w{2,3}ce,?\s+preached", "The Preface"),
        ] + sermons(13, "The Throne of Grace (Heb. iv. 16)") + [
            # A sermon of its own, so its heading is found as the others' are.
            (SERMON, "By What Means May Ministers Best Win Souls? (1 Tim. iv. 16)"),
            (r"@V\s?I\s?N\s?D\s?I\s?C\s?A\s?T\s?I\s?O\s?N", "A Vindication of the Protestant Doctrine concerning Justification"),
        ],
    },
    "Works, Vol. 2.epub": {
        "base": TRAILL_1796 + "2",
        "copies": [("worksoflatereverend02trai", True, True), ("worksoflaterever02trai", True, True)],
        "imprint": TRAILL_IMPRINT,
        "sections": [(r"PRE\s?S?F?\s?A\s?C\s?E|THREE\s+things\s+are", "The Preface")] + sermons(16, "The Lord's Prayer in John xvii. 24"),
    },
    "Works, Vol. 3.epub": {
        "base": TRAILL_1796 + "3",
        "copies": [("worksoflaterever03trai", True, True), ("workslaterevere00traigoog", False, False), ("workslaterevere01traigoog", False, False)],
        "imprint": TRAILL_IMPRINT,
        "sections": [(r"RECOMMEND|subjects\s+treated\s+upon", "The Recommendation")] + sermons(21, "The Stedfast Adherence to the Profession of our Faith (Heb. x. 20-24)"),
        # The 1775 volume ends with his father's letters from exile and an
        # advice about duties, which the 1796 volume does not have. They come
        # from that one copy: corrected for the long s, but not collated.
        "appendix_note": "The letters and the advice at the end are from the 1775 Glasgow printing (archive.org/details/worksoflaterever03trai), which alone has them: corrected for the long s, but not collated.",
        "appendix": {
            "copy": "worksoflaterever03trai",
            "sections": [
                (r"^To\s+the\s+READER", "To the Reader (the Letters)"),
                (r"dear\s+and\s+beloved\s+Wife", "A Letter from Mr. Robert Traill to His Wife"),
                (r"FATHER\s+TO\s+HIS\s+CHILDREN", "A Letter from a Father to His Children"),
                (r"ADVICE\s+ABOUT", "An Excellent Advice about Some Duties"),
            ],
        },
    },
    # TCP typed the first three of Ames's five books (A69129, the 1639
    # edition); its fourth and fifth are collated from three scans of the
    # 1639 and 1643 editions, starting at the fourth book's title.
    "Conscience with the Power and Cases Thereof.epub": {
        "tcp_prefix": "A69129",
        "base": "bim_early-english-books-1641-1700_conscience-with-the-pow_ames-william_1643",
        "base_from": r"F\s?O\s?V\s?R\s?T\s?H",
        "copies": [
            ("bim_early-english-books-1475-1640_conscience-with-the-powe_ames-william_1639", True, True),
            ("conscpo00ames", True, True),
        ],
        "imprint": "Books 1-3: Leyden and London, 1639; books 4-5: London, 1643",
        # "The Fourth Booke. 61", "Of Conscience." and the like.
        "head": r"\bBoo[kh]\w?\b|Conscience\W{0,3}$|^\W*\d{1,3}\W*$",
        "sections": [
            (r"@F\s?O\s?V\s?R\s?T\s?H", "The Fourth Book: Of the Duty of Man towards God"),
            (r"@F\s?I\s?F\s?T\s+B\s?O\s?O\s?K", "The Fifth Book: Of the Duty of Man towards His Neighbour"),
        ],
    },
}


def fetch(name, suffix):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name + suffix)
    if not os.path.exists(path):
        url = f"https://archive.org/download/{name}/{name}{suffix}"
        print("  fetching", url)
        urllib.request.urlretrieve(url, path)
    return path


def modern_words():
    if not os.path.exists(CONTENT_DB):
        sys.exit("content/content.db is missing: run npm run build:content first")
    con = sqlite3.connect(CONTENT_DB)
    freq = Counter()
    for (w,) in con.execute("SELECT word FROM webster_entries"):
        if w:
            freq[w.lower()] += 1
    queries = [
        "SELECT v.text FROM verses v JOIN translations t ON t.id = v.translation_id WHERE t.code = 'KJV'",
        "SELECT e.plain_text FROM commentary_entries e JOIN commentary_sections s ON s.id = e.section_id "
        "JOIN commentary_sources c ON c.id = s.commentary_source_id WHERE c.code IN ('mhc', 'calcom')",
    ]
    for q in queries:
        for (text,) in con.execute(q):
            freq.update(w.lower() for w in re.findall(r"[A-Za-z]+", text or ""))
    return freq


# ---------------------------------------------------------------------------
# Tokens

PUNCT_OK = set(".,;:?!()[]'\"“”‘’-—*&")


def split_token(t):
    """(prefix, core, suffix): the core is the letters (and inner apostrophes
    and hyphens), the rest is punctuation."""
    m = re.match(r"^([^A-Za-zſ0-9]*)(.*?)([^A-Za-zſ0-9]*)$", t)
    return m.group(1), m.group(2), m.group(3)


def key(core):
    """What two copies' readings are compared on: case, the long s and its f
    misreading, and inner punctuation all fall away."""
    return re.sub(r"[^a-z0-9]", "", core.lower().replace("ſ", "s").replace("f", "s"))


def clean_punct(p):
    return "".join(c for c in p if c in PUNCT_OK)


# ---------------------------------------------------------------------------
# The base: pages of lines, from the DjVu XML

def is_junk_line(text):
    letters = re.sub(r"[^A-Za-zſ]", "", text)
    if not re.search(r"[A-Za-zſ]{3}", text):
        return True
    return len(letters) < 0.5 * len(text.replace(" ", ""))


# A running head: "Serm. II. the Throne of Grace. 27", "28 Sermons concerning
# Serm. II.", "The Preface. vii". Matched anywhere in a short line near the top.
HEAD = re.compile(r"\bSer[mn]\w*\b|Sermons\s+concern|Throne\s+of\s+Gr|Lord.s\s+Prayer|Stedfa|Adheren|\bPreface\b|Vindication|Protestant\s+doctrine|Justification\.|By\s+what\s+means|Recommendation", re.I)
# A signature mark at the foot: "Vol. I. D 2", with the catchword after it.
SIGNATURE = re.compile(r"^\W{0,3}V\w{0,2}[lt]\W{1,3}[IVXl1]+\b")
# A sermon's own title, which a running head must not be mistaken for.
SERMON_TITLE = re.compile(r"^\W{0,3}S\s?E\s?R\s?M\s?O\s?N\b")


def is_title(text):
    """A section's title in capitals ("A VINDICATION OF THE PROTESTANT
    DOCTRINE"), which a running head never is: those are in lower case, or
    carry the page number."""
    letters = re.sub(r"[^A-Za-zſ]", "", text)
    return len(letters) >= 6 and not re.search(r"\d", text) and sum(c.isupper() for c in letters) >= 0.8 * len(letters)


def load_base(name, head=HEAD, start=None):
    """The base scan's lines, from the first one matching `start` if given."""
    root = ET.parse(fetch(name, "_djvu.xml")).getroot()
    lines = []  # (page, words, left, right, para_start_by_xml)
    for pn, obj in enumerate(root.iter("OBJECT")):
        width = int(obj.get("width") or 1)
        height = int(obj.get("height") or 1)
        page = []
        for para in obj.iter("PARAGRAPH"):
            first = True
            for line in para.iter("LINE"):
                ws, tops, bottoms = [], [], []
                for w in line.iter("WORD"):
                    # coords are left, bottom, right, top
                    c = [int(x) for x in (w.get("coords") or "0,0,0,0").split(",")]
                    for part in (w.text or "").split():
                        ws.append((part, c[0], c[2]))
                    tops.append(c[3])
                    bottoms.append(c[1])
                if ws:
                    page.append({"page": pn, "words": ws, "left": ws[0][1], "right": ws[-1][2], "xml_para": first,
                                 "width": width, "top": median(tops), "bottom": median(bottoms)})
                    first = False
        text_of_line = lambda l: " ".join(w for w, _, _ in l["words"])
        page = [l for l in page if not is_junk_line(text_of_line(l))]
        # The XML does not always list a page's lines top to bottom, so place
        # decides. The running head is the topmost line ("Serm. II. the Throne
        # of Grace. 27"); a sermon's own title at the top of a page stays.
        page.sort(key=lambda l: l["top"])
        if page:
            t = text_of_line(page[0])
            if len(page[0]["words"]) <= 12 and (head.search(t) or re.search(r"\d", t)) and not SERMON_TITLE.match(t) and not is_title(t):
                page = page[1:]
        # Signature mark and catchword: short lines in the last stretch of the page.
        if page:
            last = page[-1]["bottom"]
            line_h = max(1, median([l["bottom"] - l["top"] for l in page]))
            page = [l for l in page if not (l["bottom"] > last - 1.5 * line_h and
                                            (len(l["words"]) <= 3 or SIGNATURE.match(text_of_line(l))))]
        lines.extend(page)
    if start:
        first = next((k for k, l in enumerate(lines) if re.search(start, " ".join(w for w, _, _ in l["words"]))), None)
        if first is None:
            sys.exit(f"{name}: no line matches {start}")
        lines = lines[first:]
    return lines


def load_copy(name, head=HEAD):
    with open(fetch(name, "_djvu.txt"), encoding="utf-8", errors="replace") as f:
        text = f.read()
    out = []
    for line in text.splitlines():
        s = line.strip()
        if not s or is_junk_line(s):
            continue
        if len(s.split()) <= 12 and head.search(s) and not SERMON_TITLE.match(s) and not is_title(s):
            continue
        out.extend(s.split())
    return out


# ---------------------------------------------------------------------------
# Alignment: anchors where a run of four words is unique to both, then
# difflib between anchors.

def anchors(a, b, n=4):
    def grams(seq):
        pos = defaultdict(list)
        for i in range(len(seq) - n + 1):
            g = tuple(seq[i:i + n])
            if all(g):
                pos[g].append(i)
        return {g: p[0] for g, p in pos.items() if len(p) == 1}
    ga, gb = grams(a), grams(b)
    pairs = sorted((ga[g], gb[g]) for g in ga.keys() & gb.keys())
    # Longest chain increasing in both.
    tails, prev, idx = [], [None] * len(pairs), []
    for k, (_, j) in enumerate(pairs):
        p = bisect.bisect_left(tails, j)
        if p == len(tails):
            tails.append(j)
            idx.append(k)
        else:
            tails[p] = j
            idx[p] = k
        prev[k] = idx[p - 1] if p > 0 else None
    chain = []
    k = idx[-1] if idx else None
    while k is not None:
        chain.append(pairs[k])
        k = prev[k]
    return chain[::-1]


def align(a, b):
    """Yields (tag, i1, i2, j1, j2) over the whole of a and b."""
    chain = anchors(a, b)
    ia = ja = 0
    for (i, j) in chain + [(len(a), len(b))]:
        if i < ia or j < ja:
            continue
        sm = difflib.SequenceMatcher(None, a[ia:i], b[ja:j], autojunk=False)
        for tag, i1, i2, j1, j2 in sm.get_opcodes():
            yield tag, ia + i1, ia + i2, ja + j1, ja + j2
        if i < len(a):
            yield "equal", i, i + 4, j, j + 4
        ia, ja = i + 4, j + 4


# ---------------------------------------------------------------------------
# Voting

class Lexicon:
    def __init__(self, modern, sources):
        self.modern = modern
        # Words of the book itself: found the same in two copies or more,
        # three times or more (names, and the book's own spellings).
        seen = Counter()
        where = defaultdict(set)
        for n, toks in enumerate(sources):
            for t in toks:
                c = split_token(t)[1].replace("ſ", "s").lower()
                if c.isalpha():
                    seen[c] += 1
                    where[c].add(n)
        self.book = {w for w, k in seen.items() if k >= 3 and len(where[w]) >= 2}

    def known(self, w):
        lw = w.lower()
        return lw in self.modern or lw in self.book

    def freq(self, w):
        return self.modern.get(w.lower(), 0)


def readings(core, longs):
    """The words a core could be: ſ is s; an f may be s where the copy's
    print had a long s."""
    core = core.replace("ſ", "s")
    if not longs or "f" not in core.lower():
        return {core}
    spots = [i for i, ch in enumerate(core) if ch in "fF"][:5]
    out = set()
    for mask in range(1 << len(spots)):
        w = list(core)
        for b, i in enumerate(spots):
            if mask >> b & 1:
                w[i] = "s" if core[i] == "f" else "S"
        out.add("".join(w))
    return out


def shape(word, like):
    """`word` in the capitalisation of `like`."""
    if like.isupper() and len(like) > 1:
        return word.upper()
    if like[:1].isupper():
        return word[:1].upper() + word[1:]
    return word.lower() if like.islower() else word


def find_headings(tokens, patterns):
    """{pattern: [token index]} for each "@" pattern in the tokens' text."""
    text, starts = "", []
    for t in tokens:
        starts.append(len(text))
        text += t + " "
    out = {}
    for p in patterns:
        out[p] = [bisect.bisect_right(starts, m.start()) - 1 for m in re.finditer(p[1:], text)]
    return out


def collate(base_tokens, copies, lex, patterns=()):
    """base_tokens: list of str. copies: [(tokens, longs, headings)].
    Returns the corrected tokens ('' for a dropped one), counts of what
    changed, and for each "@" pattern the base indices where it begins a
    section."""
    n = len(base_tokens)
    votes = [[] for _ in range(n)]       # (reading_set) per copy
    matched = [False] * n
    spans = defaultdict(list)            # (i1, i2) -> [copy tokens]
    heads = find_headings(base_tokens, patterns)
    bkeys = [key(split_token(t)[1]) for t in base_tokens]
    for toks, longs, use_headings in copies:
        ckeys = [key(split_token(t)[1]) for t in toks]
        ops = list(align(bkeys, ckeys))
        # A copy's heading is placed by the words after it that align exactly
        # (the text under the heading), since the heading itself seldom does.
        exact = {}
        for tag, i1, i2, j1, j2 in ops:
            if tag == "equal":
                for k in range(j2 - j1):
                    exact[j1 + k] = i1 + k
        if use_headings:
            for p, js in find_headings(toks, patterns).items():
                for j in js:
                    k = next((k for k in range(1, 40) if j + k in exact), None)
                    if k is not None:
                        heads[p].append(exact[j + k])
        for tag, i1, i2, j1, j2 in ops:
            if tag == "equal" or (tag == "replace" and i2 - i1 == j2 - j1):
                for k in range(i2 - i1):
                    votes[i1 + k].append(readings(split_token(toks[j1 + k])[1], longs))
                    matched[i1 + k] = True
            elif tag == "replace" and i2 - i1 <= 40 and j2 - j1 <= 40:
                spans[(i1, i2)].append(toks[j1:j2])
                for k in range(i1, i2):
                    matched[k] = True
    out = list(base_tokens)
    stats = Counter()
    for i, t in enumerate(base_tokens):
        pre, core, suf = split_token(t)
        pre, suf = clean_punct(pre), clean_punct(suf)
        if not core:
            out[i] = (pre + suf) if matched[i] and (pre + suf).strip("*") else ""
            continue
        if core.isdigit():
            out[i] = pre + core + suf if matched[i] else ""
            if not matched[i]:
                stats["dropped"] += 1
            continue
        mine = readings(core, True)
        # The base's OCR keeps the long s, so an f in it that makes a word is
        # an f ("if", not "is") -- unless the s-word is far the commoner, as
        # when the OCR read ſ as f after all ("fin" for "sin", "foul" for
        # "soul").
        plain = core.replace("ſ", "s")
        if lex.known(plain):
            floor = 20 * max(lex.freq(plain), 1)
            mine = {r for r in mine if r == plain or lex.freq(r) > floor}
        tally = Counter()
        for r in mine:
            tally[r.lower()] += 1
        for rs in votes[i]:
            for r in {x.lower() for x in rs}:
                tally[r] += 1
        best = max(tally, key=lambda r: (lex.known(r), tally[r], lex.freq(r), r == core.replace("ſ", "s").lower()))
        # Not a word, and no copy has anything there: a speck, or a line of
        # the OCR's noise.
        if not lex.known(best) and not matched[i]:
            out[i] = ""
            stats["dropped"] += 1
            continue
        word = shape(best, core)
        if word.lower() != core.replace("ſ", "s").lower():
            stats["long s" if word.lower() in {r.lower() for r in mine} else "corrected"] += 1
        out[i] = pre + word + suf
    # Runs the copies read differently: take a copy's reading when it is
    # words and the base's is not. A short run must be all words in the copy;
    # a longer one (a line the base's OCR lost to noise) mostly words, against
    # a base that is mostly not.
    for (i1, i2), readings_ in spans.items():
        base_cores = [split_token(out[k])[1] for k in range(i1, i2)]
        base_cores = [c for c in base_cores if c]
        base_ratio = sum(lex.known(c) for c in base_cores) / max(len(base_cores), 1)
        if base_ratio == 1 or (i2 - i1 > 3 and base_ratio >= 0.6):
            continue
        best_alt = None
        for alt in readings_:
            cores = [split_token(t)[1].replace("ſ", "s") for t in alt]
            fixed = []
            for c in cores:
                opts = [r for r in readings(c, True) if lex.known(r)]
                fixed.append(max(opts, key=lex.freq) if opts else None)
            ratio = sum(1 for f in fixed if f) / max(len(fixed), 1)
            # Each word of the copy with its own punctuation, its core the
            # reading that is a word (or as the copy has it).
            words_ = []
            for f, t in zip(fixed, alt):
                pre_, core_, suf_ = split_token(t)
                words_.append(clean_punct(pre_) + shape(f or core_.replace("ſ", "s"), core_) + clean_punct(suf_))
            if len(alt) <= 3 and fixed and all(fixed):
                best_alt = (2, words_)
            elif len(alt) > 3 and ratio >= 0.85 and (best_alt is None or ratio > best_alt[0]):
                best_alt = (ratio, words_)
        if best_alt and best_alt[1]:
            out[i1] = " ".join(best_alt[1])
            for k in range(i1 + 1, i2):
                out[k] = ""
            stats["runs"] += 1
    # Headings, from the base and every copy: one per cluster, at its first
    # word. (A heading line left at the end of the section before is trimmed
    # in sectioned().)
    found = {}
    for p, idx in heads.items():
        clusters = []
        for i in sorted(idx):
            if clusters and i - clusters[-1][-1] < 150:
                clusters[-1].append(i)
            else:
                clusters.append([i])
        found[p] = [c[0] for c in clusters]
    return out, stats, found


# ---------------------------------------------------------------------------
# Paragraphs and sections

def build_lines(base_lines, fixed):
    """Puts the corrected tokens back on their lines, each line's left and
    right edges now measured from the words that stayed (a speck in the
    gutter no longer counts as where the line begins)."""
    out = []
    k = 0
    for l in base_lines:
        ws, lefts, rights = [], [], []
        first = k
        for _, left, right in l["words"]:
            if fixed[k]:
                ws.append(fixed[k])
                lefts.append(left)
                rights.append(right)
            k += 1
        text = " ".join(ws).strip()
        if text:
            out.append(dict(l, text=text, left=lefts[0], right=rights[-1], tokens=range(first, k)))
    return out


def median(xs):
    xs = sorted(xs)
    return xs[len(xs) // 2] if xs else 0


def join_words(a, b, lex):
    """a ends a line, b begins the next: one word, or two?"""
    pa, ca, sa = split_token(a)
    pb, cb, sb = split_token(b)
    if sa.endswith("-") and ca and cb:
        joined = ca + cb
        if lex.known(joined) or not (lex.known(ca) and lex.known(cb)):
            return pa + joined + sb
        return pa + ca + "-" + cb + sb
    return None


def paragraphs(lines, lex, headings=None):
    """A paragraph starts on an indented line, and after a short centred one
    (a heading, a text cited under it). Indents are measured against the
    lines around, since a scanned page is rarely square. A heading found by
    collate() always starts one. Returns the paragraphs, and for each heading
    pattern the paragraphs it begins."""
    paras = []
    cur = []
    headings = headings or {}
    begins = {p: set() for p in headings}
    pending = sorted((i, p) for p, idx in headings.items() for i in idx)
    for n, l in enumerate(lines):
        if pending and pending[0][0] < l["tokens"].stop:
            if cur:
                paras.append(cur)
                cur = []
            while pending and pending[0][0] < l["tokens"].stop:
                begins[pending.pop(0)[1]].add(len(paras))
            cur.append(l["text"])
            continue
        text = l["text"]
        near = [m for m in lines[max(0, n - 5):n + 6] if m["page"] == l["page"] and m is not l]
        margin = median([m["left"] for m in near]) if near else l["left"]
        edge = median([m["right"] for m in near]) if near else l["right"]
        em = 0.02 * l["width"]
        indented = l["left"] - margin > em
        prev = lines[n - 1] if n else None
        after_short = prev is not None and prev["page"] == l["page"] and edge - prev["right"] > 6 * em and re.search(r"[.?!:”\"]\W{0,2}$", prev["text"])
        starts = n == 0 or ((indented or after_short) and re.match(r"^\W{0,3}([A-Z0-9]|ſ)", text))
        if starts and cur:
            paras.append(cur)
            cur = []
        cur.append(text)
    if cur:
        paras.append(cur)
    out = []
    for p in paras:
        s = p[0]
        for nxt in p[1:]:
            a = s.rsplit(" ", 1)
            b = nxt.split(" ", 1)
            j = join_words(a[-1], b[0], lex)
            if j is not None:
                s = (a[0] + " " if len(a) > 1 else "") + j + (" " + b[1] if len(b) > 1 else "")
            else:
                s = s + " " + nxt
        s = re.sub(r"\s+([,.;:?!])", r"\1", s)
        s = re.sub(r"\s+", " ", s).strip()
        out.append(s)
    return out, begins


def sectioned(paras, sections, begins):
    """Splits the paragraphs at each section, in order: an "@" heading where
    collate() placed it, anything else at the first paragraph whose opening
    matches."""
    marks = []
    start = 0
    for pattern, label in sections:
        hit = None
        if pattern.startswith("@"):
            hit = next((i for i in sorted(begins.get(pattern, ())) if i >= start), None)
        else:
            for i in range(start, len(paras)):
                if re.search(pattern, paras[i][:200]):
                    hit = i
                    break
        if hit is None:
            # Its text stays in the section before; better than no book.
            print(f"  section not found, left in the one before: {label}")
            continue
        marks.append((hit, label, pattern))
        start = hit + 1
    out = []
    if marks[0][0] > 0:
        out.append(("Title page", paras[:marks[0][0]]))
    for k, (i, label, pattern) in enumerate(marks):
        end = marks[k + 1][0] if k + 1 < len(marks) else len(paras)
        body = paras[i:end]
        # The heading itself, as the OCR left it, gives way to the label --
        # whether it opens this section or was left closing the one before.
        heading = pattern.startswith("@")
        while body and len(body[0]) < 60 and (not heading or SERMON_TITLE.match(body[0]) or re.fullmatch(r"[A-Z\W\d]+", body[0])):
            body = body[1:]
            if not heading:
                break
        if marks[k + 1:] and marks[k + 1][2].startswith("@"):
            while body and len(body[-1]) < 40 and (SERMON_TITLE.match(body[-1]) or re.fullmatch(r"[A-Z\W\d]+", body[-1])):
                body = body[:-1]
        out.append((label, body))
    return out


def best_reading(core, lex):
    """One copy's word with nothing to vote against it: the long s settled as
    for the base (an f-word that is a word stays, unless the s-word is far
    the commoner)."""
    plain = core.replace("ſ", "s")
    options = readings(core, True)
    if lex.known(plain):
        floor = 20 * max(lex.freq(plain), 1)
        options = {r for r in options if r == plain or lex.freq(r) > floor}
    known = [r for r in options if lex.known(r)]
    return shape(max(known, key=lex.freq), core) if known else plain


def appendix(spec, lex):
    """Sections found only in one copy, from its first section's start to
    the end, as (label, paragraphs)."""
    with open(fetch(spec["copy"], "_djvu.txt"), encoding="utf-8", errors="replace") as f:
        lines = [l.strip() for l in f.read().split("\n")]
    first = next(i for i, l in enumerate(lines) if re.search(spec["sections"][0][0], l))
    # Paragraphs are runs of lines between blank ones, joined again where a
    # page break cut one off mid-sentence.
    paras, cur = [], []
    for l in lines[first:] + [""]:
        words_here = l.split()
        # Running head with its page number ("to his Wife, 325"), signature
        # mark ("U u 2"), catchword or speck: short, with a digit or no word.
        short = len(words_here) <= 5 and (re.search(r"\d", l) or not re.search(r"[a-z]{3}", l)) and not is_title(l)
        if not l or (short and not re.search(spec["sections"][0][0], l)):
            if cur and not l:
                paras.append(cur)
                cur = []
            continue
        cur.append(l)
    merged = []
    for p in paras:
        if merged and not re.search(r"[.?!:”\"]\W{0,2}$", merged[-1][-1]) and re.match(r"^\W{0,2}[a-z]", p[0]):
            merged[-1].extend(p)
        else:
            merged.append(p)
    texts = []
    for p in merged:
        s = ""
        for l in p:
            if s:
                a, b = s.rsplit(" ", 1) if " " in s else ("", s), l.split(" ", 1)
                j = join_words(a[1], b[0], lex)
                s = ((a[0] + " ") if a[0] else "") + j + (" " + b[1] if len(b) > 1 else "") if j is not None else s + " " + l
            else:
                s = l
        words_ = []
        for t in s.split():
            pre, core, suf = split_token(t)
            words_.append(clean_punct(pre) + (best_reading(core, lex) if core and not core.isdigit() else core) + clean_punct(suf))
        texts.append(re.sub(r"\s+([,.;:?!])", r"\1", " ".join(w for w in words_ if w)))
    out = []
    marks = []
    start = 0
    for pattern, label in spec["sections"]:
        hit = next((i for i in range(start, len(texts)) if re.search(pattern, texts[i][:200])), None)
        if hit is None:
            print(f"  appendix section not found, left in the one before: {label}")
            continue
        marks.append((hit, label))
        start = hit + 1
    for k, (i, label) in enumerate(marks):
        end = marks[k + 1][0] if k + 1 < len(marks) else len(texts)
        body = texts[i:end]
        # The next section's title, in capitals, closes this one: it goes.
        while body and len(body[-1]) < 120 and not re.search(r"[a-z]{4}", re.sub(r"\b(?:to|his|of|from|the|late|and|about|some)\b", "", body[-1], flags=re.I)):
            body = body[:-1]
        out.append((label, body))
    return out


# ---------------------------------------------------------------------------
# EPUB

CSS = """body { font-family: Georgia, serif; line-height: 1.5; margin: 0 1em; }
h1 { font-size: 1.3em; text-align: center; margin: 2em 0 1em; font-weight: normal; letter-spacing: 0.04em; }
p { margin: 0; text-indent: 1.5em; }
p.short { text-align: center; text-indent: 0; }
.source { font-size: 0.85em; color: #555; text-indent: 0; margin-top: 2em; }
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


def manifest_entry(file_name):
    with open(os.path.join(LIBRARY, "manifest.json"), encoding="utf-8") as f:
        for row in json.load(f):
            if row["file_name"] == file_name:
                return row
    sys.exit(f"{file_name} is not in library/manifest.json")


def write_epub(file_name, spec, sections, copies):
    row = manifest_entry(file_name)
    names, contents, labels = [], [], []
    for n, (label, paras) in enumerate(sections):
        if isinstance(paras, dict):
            # Already XHTML (a part TCP transcribed).
            body = [paras["html"]]
        else:
            body = [f"<h1>{html.escape(label)}</h1>"]
            for p in paras:
                cls = ' class="short"' if len(p) < 60 and not re.search(r"[.?!:;,]$", p) else ""
                body.append(f"<p{cls}>{html.escape(p, quote=False)}</p>")
        names.append(f"part{n:03d}.xhtml")
        contents.append(xhtml(label, "\n".join(body)))
        labels.append(label)
    witnesses = ", ".join(f"archive.org/details/{c[0]}" for c in copies)
    note = ""
    if "tcp_prefix" in spec:
        note += (f'<p class="source">The front matter and the first three books are from the Text Creation Partnership '
                 f'transcription {spec["tcp_prefix"]} (EEBO-TCP, CC0), typed by hand from the 1639 edition; long s, line-end hyphens '
                 f"and u/v, i/j regularised for reading. A “•” marks a letter the transcribers could not read; “[…]” a lost word. "
                 f"TCP did not transcribe the rest.</p>")
    note += (f'<p class="source">{"The rest" if "tcp_prefix" in spec else "This edition"}: {html.escape(spec["imprint"])}. '
             f'The text was made from the OCR of the scan at '
             f'archive.org/details/{spec["base"]}, collated word by word with {html.escape(witnesses)}: '
             f"where the copies differ, a reading that is a word was preferred, and the long s is printed s. "
             f"It is far cleaner than any one scan, but it is OCR text, not proofread against the page.</p>")
    if "appendix_note" in spec:
        note += f'<p class="source">{html.escape(spec["appendix_note"])}</p>'
    names.append("source.xhtml")
    contents.append(xhtml("About this text", f"<h1>About this text</h1>{note}"))
    labels.append("About this text")
    nav_items = "".join(f'<li><a href="{n}">{html.escape(l)}</a></li>' for n, l in zip(names, labels))
    nav = xhtml("Contents", f'<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>{nav_items}</ol></nav>')
    book_id = "urn:uuid:" + str(uuid.uuid5(uuid.NAMESPACE_URL, f"collated:{spec['base']}"))
    manifest = "\n".join(f'<item id="f{i}" href="{n}" media-type="application/xhtml+xml"/>' for i, n in enumerate(names))
    spine = "\n".join(f'<itemref idref="f{i}"/>' for i in range(len(names)))
    opf = f"""<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="en">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">{book_id}</dc:identifier>
<dc:title>{html.escape(row["title"])}</dc:title>
<dc:creator>{html.escape(row["author"])}</dc:creator>
<dc:language>en</dc:language>
<dc:publisher>{html.escape(spec["imprint"])}</dc:publisher>
<dc:source>https://archive.org/details/{spec["base"]}</dc:source>
<dc:rights>Public domain</dc:rights>
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
        z.writestr("OEBPS/style.css", CSS + spec.get("extra_css", ""), compress_type=zipfile.ZIP_DEFLATED)
        for n, c in zip(names, contents):
            z.writestr("OEBPS/" + n, c, compress_type=zipfile.ZIP_DEFLATED)
    with zipfile.ZipFile(out) as z:
        for n in names + ["nav.xhtml", "content.opf"]:
            ET.fromstring(z.read("OEBPS/" + n))
    print("  wrote", out)


def build(file_name, spec, modern, check):
    print(file_name)
    head = re.compile(spec["head"], re.I) if "head" in spec else HEAD
    base_lines = load_base(spec["base"], head, spec.get("base_from"))
    base_tokens = [w for l in base_lines for w, _, _ in l["words"]]
    copies = [(load_copy(name, head), longs, headings) for name, longs, headings in spec["copies"]]
    lex = Lexicon(modern, [base_tokens] + [c for c, _, _ in copies])
    patterns = sorted({p for p, _ in spec["sections"] if p.startswith("@")})
    fixed, stats, headings = collate(base_tokens, copies, lex, patterns)
    lines = build_lines(base_lines, fixed)
    paras, begins = paragraphs(lines, lex, headings)
    for p in patterns:
        expected = sum(1 for q, _ in spec["sections"] if q == p)
        print(f"  {p[1:]}: {len(begins[p])} found, {expected} expected")
    words = [split_token(w)[1] for p in paras for w in p.split()]
    unknown = sum(1 for w in words if w and w.isalpha() and not lex.known(w))
    print(f"  {len(base_tokens):,} base words -> {len(words):,}; {dict(stats)}; {unknown:,} still not words ({unknown / max(len(words), 1):.1%})")
    if check:
        rnd = random.Random(3)
        for p in rnd.sample([p for p in paras if len(p) > 300], 3):
            print("   >", p[:400])
    sections = sectioned(paras, spec["sections"], begins)
    if sections and sections[0][0] == "Title page" and "base_from" in spec:
        sections = sections[1:]  # what precedes the first section is the TCP part's
    if "appendix" in spec:
        sections += appendix(spec["appendix"], lex)
    if "tcp_prefix" in spec:
        tcp = tcp_tool()
        files, _, bodies, _, _ = tcp.chapters(file_name, {"tcp": spec["tcp_prefix"]}, modern)
        sections = [(f["label"], {"html": b}) for f, b in zip(files, bodies)] + sections
        spec = dict(spec, extra_css=tcp.CSS)
    if check:
        for label, ps in sections:
            first = ps["html"][:70] if isinstance(ps, dict) else (ps[0][:70] if ps else "")
            print(f"   [{label}] {first}")
        return
    write_epub(file_name, spec, sections, spec["copies"])


def tcp_tool():
    """tools/build-tcp-epub.py, for a book TCP transcribed only in part."""
    import importlib.util
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "build-tcp-epub.py")
    s = importlib.util.spec_from_file_location("build_tcp_epub", path)
    m = importlib.util.module_from_spec(s)
    s.loader.exec_module(m)
    return m


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    check = "--check" in sys.argv
    todo = args or list(BOOKS)
    for name in todo:
        if name not in BOOKS:
            sys.exit(f"not a collated book: {name}")
    modern = modern_words()
    for name in todo:
        build(name, BOOKS[name], modern, check)


if __name__ == "__main__":
    main()
