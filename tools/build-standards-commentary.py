"""Builds Westminster Standards commentary from the catechism EPUBs.

The commentary panel in the Confessions view shows, beside a chapter of the
Confession or a question of either Catechism, what the old expositors wrote
on it (reference/westminster_commentary/, imported into content.db; see
import::reference::westminster_commentary). This tool cuts the classic
catechism expositions into that shape: one entry per question, as plain text
with blank lines between paragraphs.

    Fisher, The Assembly's Shorter Catechism Explained (1753)   WSC, per question
    Henry, A Scripture Catechism (1703)                          WSC, per question
    Flavel, An Exposition of the Assembly's Catechism (1692)     WSC; he takes some questions together
    Whyte, A Commentary on the Shorter Catechism (1883)          WSC, Questions 1-31 only
    Ridgley, A Body of Divinity (1731-33)                        WLC, per question or group of questions
    Beattie, The Presbyterian Standards (1896)                   WSC, WLC and WCF: each chapter names the
                                                                 questions and the Confession chapter it covers

An entry that covers several questions lists them all ("chapters": [45, 46,
47, 48]) and the importer files it under each. The question and answer each
book prints at the head of its exposition are left out: the panel sits under
the Catechism's own text.

The EPUBs were made from public-domain sources (Project Gutenberg, Blue
Letter Bible, covenanter.org, bpc.org, a Monergism PDF with no restrictive
notice) by the scripts kept beside them. Vincent and Boston, from Monergism
ebooks whose notice forbids reproduction, are not used; Vincent is already
in the app from a public-domain text (vincent.json).

Usage (from the repo root):
    python tools/build-standards-commentary.py [<folder of EPUBs>]
Defaults to "Westminster Catechism EPUBs" on the desktop. Writes the JSON
files and adds their sources to reference/westminster_commentary/manifest.json;
then rebuild content.db (npm run build:content).
"""

import html
import json
import os
import re
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "reference", "westminster_commentary")
DEFAULT_SRC = os.path.join(os.path.expanduser("~"), "OneDrive", "Desktop", "Westminster Catechism EPUBs")

ROMAN = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100}


def roman(s):
    s = s.upper().strip(". ")
    total = 0
    for i, ch in enumerate(s):
        v = ROMAN[ch]
        total += -v if i + 1 < len(s) and ROMAN[s[i + 1]] > v else v
    return total


def spine(path):
    """The book's XHTML files in reading order, as (name, markup)."""
    z = zipfile.ZipFile(path)
    opf_name = next(n for n in z.namelist() if n.endswith(".opf"))
    opf = z.read(opf_name).decode("utf-8")
    base = os.path.dirname(opf_name)
    items = {}
    for m in re.finditer(r"<item\b[^>]*>", opf):
        tag = m.group(0)
        i = re.search(r'\bid="([^"]+)"', tag)
        h = re.search(r'\bhref="([^"]+)"', tag)
        if i and h:
            items[i.group(1)] = h.group(1)
    out = []
    for idref in re.findall(r'<itemref\b[^>]*idref="([^"]+)"', opf):
        href = items.get(idref)
        if not href:
            continue
        name = f"{base}/{href}" if base else href
        out.append((href, z.read(name).decode("utf-8")))
    return out


def body(markup):
    m = re.search(r"<body[^>]*>(.*)</body>", markup, re.S)
    return m.group(1) if m else markup


def text(fragment):
    """Markup to the panel's plain text: a paragraph per block, line breaks kept."""
    s = re.sub(r"<span[^>]*pageno[^>]*>\s*</span>", "", fragment)
    # A line break in the markup is the source's wrapping (Gutenberg's text
    # is wrapped at 70 columns); only <br/> is a line the author set.
    s = re.sub(r"\s*\n\s*", " ", s)
    s = re.sub(r"<br\s*/?>", "\n", s)
    s = re.sub(r"</(p|h\d|li|div|blockquote|tr)>", "\n\n", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s)
    paras = []
    for block in re.split(r"\n\s*\n", s):
        lines = [re.sub(r"[ \t\r\f\v]+", " ", l).strip() for l in block.split("\n")]
        # Prose wrapped in the source joins up; a verse's own lines stay.
        joined = "\n".join(l for l in lines if l)
        if joined:
            paras.append(joined)
    return "\n\n".join(paras)


def drop_blocks(fragment, pattern):
    """Removes the <p>/<h*> blocks whose text matches `pattern`."""
    def keep(m):
        return "" if re.search(pattern, re.sub(r"<[^>]+>", "", m.group(0))) else m.group(0)
    return re.sub(r"<(p|h\d)\b[^>]*>.*?</\1>", keep, fragment, flags=re.S)


# ---------------------------------------------------------------------------
# One function per book: each returns [{"chapters": [...], "text": ...}].

def fisher(src):
    out = []
    for name, markup in spine(os.path.join(src, "Fisher - The Assembly's Shorter Catechism Explained.epub")):
        b = body(markup)
        m = re.search(r"<h1>\s*QUESTION\s+(\d+)", b)
        if not m:
            continue
        b = re.sub(r"<h[12]>.*?</h[12]>", "", b, flags=re.S)
        b = re.sub(r'<p class="a">.*?</p>', "", b, count=1, flags=re.S)
        out.append({"chapters": [int(m.group(1))], "text": text(b)})
    return out


def flavel(src):
    out = []
    for name, markup in spine(os.path.join(src, "Flavel - An Exposition of the Assembly's Catechism.epub")):
        b = body(markup)
        qs = [int(n) for n in re.findall(r'<p class="q">\s*Quest\.?\s*(\d+)', b)]
        if not qs:
            continue
        title = re.search(r"<h1>(.*?)</h1>", b, re.S)
        b = re.sub(r"<h1>.*?</h1>", "", b, flags=re.S)
        b = re.sub(r'<p class="[qa]">.*?</p>', "", b, flags=re.S)
        lead = text(title.group(1)) + "\n\n" if title else ""
        out.append({"chapters": qs, "text": lead + text(b)})
    return fill_gaps(out)


def henry(src):
    out = []
    for name, markup in spine(os.path.join(src, "Henry - A Scripture Catechism.epub")):
        b = body(markup)
        b = re.sub(r"<h1>.*?</h1>", "", b, flags=re.S)
        parts = re.split(r"<p>\s*<strong>\s*Question\s+(\d+):\s*</strong>", b)
        for k in range(1, len(parts), 2):
            q = int(parts[k])
            chunk = parts[k + 1]
            chunk = re.sub(r"^.*?</p>", "", chunk, count=1, flags=re.S)  # the question itself
            chunk = re.sub(r"<p>\s*<strong>\s*Answer:\s*</strong>.*?</p>", "", chunk, count=1, flags=re.S)
            # Number the groups of questions as Henry does.
            n = [0]

            def item(_):
                n[0] += 1
                return f"<li><p>{n[0]}. "

            chunk = re.sub(r"<li>\s*<p>", item, chunk)
            out.append({"chapters": [q], "text": text(chunk)})
    return out


def whyte(src):
    out = []
    for name, markup in spine(os.path.join(src, "Whyte - A Commentary on the Shorter Catechism (Questions 1-31).epub")):
        b = body(markup)
        m = re.search(r"<h1>\s*(QUESTIONS?\s[^<]*)</h1>", b)
        if not m:
            continue
        qs = [int(n) for n in re.findall(r"\d+", m.group(1))]  # "QUESTIONS 8 AND 9."
        b = re.sub(r"<h1>.*?</h1>", "", b, flags=re.S)
        b = re.sub(r'<p class="q">.*?</p>', "", b, flags=re.S)
        b = drop_blocks(b, r"^\s*A\.\s")  # the answer, where it has a paragraph of its own
        out.append({"chapters": qs, "text": text(b)})
    return out


# bpc.org transcribed Whyte only as far as Question 31. The rest comes from
# the two archive.org scans of the T. & T. Clark edition (same plates),
# collated word by word with tools/build-collated-epub.py's machinery.
WHYTE_SCANS = ("commentaryonshor00whytuoft", "commentaryonshor10whyt")


def collate_tool():
    import importlib.util
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "build-collated-epub.py")
    s = importlib.util.spec_from_file_location("build_collated_epub", path)
    m = importlib.util.module_from_spec(s)
    s.loader.exec_module(m)
    return m


def whyte_scanned(first):
    """Whyte from Question `first` on, from the scans: [{"chapters", "text"}]."""
    c = collate_tool()
    modern = c.modern_words()
    nothing = re.compile(r"(?!)")  # running heads go by their page numbers
    base_lines = c.load_base(WHYTE_SCANS[0], nothing)
    base_tokens = [w for l in base_lines for w, _, _ in l["words"]]
    copies = [(c.load_copy(WHYTE_SCANS[1], nothing), False, False)]
    lex = c.Lexicon(modern, [base_tokens] + [t for t, _, _ in copies])
    fixed, stats, _ = c.collate(base_tokens, copies, lex)
    paras, _ = c.paragraphs(c.build_lines(base_lines, fixed), lex)
    # A running head whose page number the OCR read as letters ("IOD THE
    # SHORTER CATECHISM WITH A COMMENTARY.") was not known for one.
    paras = [re.sub(r"\s*\S{1,4}\s+THE SHORTER CATECHISM WITH A COMMENTARY\.\s*", " ", p).strip() for p in paras]
    print(f"  whyte scans: {len(base_tokens):,} words collated, {dict(stats)}")
    # A question's heading, "Q. 33. What is justification?" (the OCR reads
    # the stops as "-" too), sometimes run into the paragraph before. Only
    # the next question or two counts, so "[see Q. 44]" in the text does not.
    # The OCR reads figures as letters too ("Q. i oo." is 100, "Q. ioi." 101).
    heading = re.compile(r"\bQ\W{0,2}\s*([0-9ilIoO](?:\s?[0-9ilIoO]){0,2})\s*[.,\-]\s+(?=[A-Z'\"‘“])")

    def number(s):
        s = re.sub(r"\s", "", s).translate(str.maketrans("ilIoO", "11100"))
        return int(s) if s.isdigit() else -1

    out, cur, last = [], None, 0
    for p in paras:
        # The publisher's list of books follows the last answer.
        if last >= 100 and re.search(r"PUBLICATIONS|SELECTIONS FROM|BY THE SAME AUTHOR", p):
            break
        pieces, start = [], 0
        for m in heading.finditer(p):
            n = number(m.group(1))
            if last < n <= last + 3 and n <= 107:
                pieces.append((None, p[start:m.start()]))
                pieces.append((n, ""))
                start = m.start()
                last = n
        pieces.append((None, p[start:]))
        for n, piece in pieces:
            if n is not None:
                cur = {"chapters": [n], "paras": [], "asked": False}
                out.append(cur)
                continue
            piece = piece.strip()
            if not piece or cur is None:
                continue
            if not cur["asked"]:
                # The question itself, and the answer when it shares the
                # paragraph ("Q. 37. What benefits ...? A. The souls of ...").
                cur["asked"] = True
                if heading.match(piece):
                    answer = re.search(r"\?\s*A\W{0,2}\s.*?(?<![A-Z])\.\s+(?=[A-Z])", piece)
                    rest = piece[answer.end():] if answer else ""
                    if rest.strip() and answer:
                        cur["paras"].append(rest.strip())
                    continue
            if len(cur["paras"]) == 0 and re.match(r"^\W{0,2}A\W{0,2}\s", piece):
                continue  # the answer, as a paragraph of its own
            cur["paras"].append(piece)
    # Whyte prints some questions one after another and expounds them
    # together (the commandments: what is required, what forbidden): a
    # heading with nothing under it joins the next one that has something.
    merged, waiting = [], []
    for e in out:
        text_ = "\n\n".join(e["paras"])
        if len(text_.split()) < 30:
            waiting += e["chapters"]
            continue
        merged.append({"chapters": waiting + e["chapters"], "text": text_})
        waiting = []
    # A word broken at a line end whose hyphen the OCR lost ("repara tion",
    # "Cate chism"): both copies are from the same plates, so they often
    # agree on the break. Joined when the whole is a word and a half is not.
    def known(w):
        return lex.known(w)

    def rejoin(m):
        a, b = m.group(1), m.group(2)
        if lex.known(a + b) and (a + b).lower() in lex.modern and not (known(a) and known(b)):
            return a + b
        return m.group(0)

    for e in merged:
        e["text"] = re.sub(r"\b([A-Za-z]+) ([a-z]+)\b", rejoin, e["text"])
    # Any question still unaccounted for is one Whyte takes with the question
    # before it (as he does 79-81 and 91-92; checked against the scans), or
    # one whose heading the OCR misread: either way its text is in that entry.
    merged = fill_gaps(merged)
    return [e for e in merged if max(e["chapters"]) >= first]


def whyte_full(src):
    """bpc.org's careful transcription for 1-31, the collated scans after."""
    typed = whyte(src)
    done = {q for e in typed for q in e["chapters"]}
    scanned = whyte_scanned(max(done) + 1)
    kjv = Kjv()
    for e in scanned:
        e["chapters"] = [q for q in e["chapters"] if q not in done]
        e["text"] = "\n\n".join(repair_proofs(p, kjv) for p in e["text"].split("\n\n"))
    kjv.report()
    return typed + [e for e in scanned if e["chapters"]]


# ---------------------------------------------------------------------------
# Whyte's proof texts
#
# Under each answer Whyte prints the Assembly's proof texts in full, the KJV
# quoted verse by verse: "k 1 Kings xxi. 4: And Ahab came into his house...
# Esth. v. 13: Yet all this..." The app has no proof texts of its own for the
# Shorter Catechism, so these are worth keeping, but the OCR damaged them: the
# footnote letter tying each to its clause of the answer comes through as a
# stray "R", "8", "0" or "h"; the 1 of "1 Cor." and of verse 1 as "i"; and
# words of the quotations ("a he" for "a lie"). The KJV text in content.db
# settles all of it: a reference is read the way whose verses match the
# quotation, and a word of the quotation is corrected only where it is lined
# up against the KJV's word and is a near miss of it. Whyte's own elisions
# ("For this... Thou shalt not covet") are left as he printed them.

BOOKS = {
    "Gen": 1, "Ex": 2, "Exod": 2, "Lev": 3, "Num": 4, "Deut": 5, "Josh": 6, "Judg": 7, "Ruth": 8,
    "Sam": (9, 10), "Kings": (11, 12), "Chron": (13, 14), "Ezra": 15, "Neh": 16, "Esth": 17, "Job": 18,
    "Ps": 19, "Psa": 19, "Prov": 20, "Eccles": 21, "Eccl": 21, "Song": 22, "Isa": 23, "Jer": 24, "Lam": 25,
    "Ezek": 26, "Dan": 27, "Hos": 28, "Joel": 29, "Amos": 30, "Obad": 31, "Jonah": 32, "Mic": 33, "Nah": 34,
    "Hab": 35, "Zeph": 36, "Hag": 37, "Zech": 38, "Mal": 39, "Matt": 40, "Mark": 41, "Luke": 42,
    "John": (43, 62, 63, 64), "Acts": 44, "Rom": 45, "Cor": (46, 47), "Gal": 48, "Eph": 49, "Phil": 50,
    "Col": 51, "Thess": (52, 53), "Tim": (54, 55), "Tit": 56, "Titus": 56, "Philem": 57, "Heb": 58,
    "Jas": 59, "James": 59, "Pet": (60, 61), "Jude": 65, "Rev": 66,
}
BOOK_RE = "|".join(sorted(BOOKS, key=len, reverse=True))
WHOLE_NAMES = {"Ruth", "Kings", "Ezra", "Job", "Joel", "Amos", "Jonah", "Mark", "Luke", "John", "Acts", "James", "Jude", "Titus", "Song"}
# A reference: [mark] [book number] Book. chapter. verse(s)[:]  -- or "Ver. 21:"
REF = re.compile(
    r"(?:(?<=\s)|^)(?:(?P<mark>[^\s\w]?\w)\s+)?(?:(?P<num>[123iIl]{1,3})\s+)?"
    r"(?P<book>" + BOOK_RE + r")[.,]?\s+(?P<ch>[ivxlcIVXLC]+)[.,]\s*(?P<vs>(?:[\dilI]+|n\b)(?:\s?[-–,]\s?[\dilI]+)*)(?P<colon>:?)"
    r"|(?:(?<=\s)|^)(?P<ver>Ver)\.\s*(?P<vs2>(?:[\dilI]+|n\b)(?:\s?[-–,]\s?[\dilI]+)*)(?P<colon2>:?)"
)
PROOF_PARA = re.compile(r"^\W{0,2}(?:\w\s+)?(?:[123iIl]{1,3}\s+)?(?:" + BOOK_RE + r")[.,]?\s+[ivxlcIVXLC]+[.,]")


def figures(s):
    """OCR'd verse or book number to digits: "i" -> 1, "ii" -> 11, "l" -> 1."""
    # A verse "n" is 11, its two figures run together ("Matt. iii. n:").
    s = re.sub(r"^n\b", "11", s)
    return re.sub(r"[ilI]", "1", s)


class Kjv:
    def __init__(self):
        import sqlite3
        con = sqlite3.connect(os.path.join(ROOT, "content", "content.db"))
        tid = con.execute("SELECT id FROM translations WHERE code = 'KJV'").fetchone()[0]
        self.verses = {(b, c, v): t for b, c, v, t in con.execute(
            "SELECT book_id, chapter, verse, text FROM verses WHERE translation_id = ?", (tid,))}
        self.changes = []

    def text(self, book, ch, vs):
        out = []
        for part in re.split(r"\s?,\s?", vs):
            ends = [int(x) for x in re.split(r"\s?[-–]\s?", part) if x.isdigit()]
            if not ends:
                continue
            for v in range(ends[0], ends[-1] + 1):
                if (book, ch, v) in self.verses:
                    out.append(self.verses[(book, ch, v)])
        return " ".join(out)

    def report(self):
        print(f"  whyte proof texts: {len(self.changes)} repairs")
        for c in self.changes:
            print("    ", c)


def norm_words(s):
    return [re.sub(r"[^a-z0-9]", "", w.lower()) for w in s.split()]


def similarity(a, b):
    import difflib
    return difflib.SequenceMatcher(None, norm_words(a), norm_words(b), autojunk=False).ratio()


def quoted_from(quote, verse_text):
    """Is the quotation taken from these verses? Most of its own words found
    there in order -- however much of the verse Whyte left out."""
    import difflib
    q = [w for w in norm_words(quote) if w]
    if len(q) < 3:
        return False
    sm = difflib.SequenceMatcher(None, q, norm_words(verse_text), autojunk=False)
    found = sum(size for _, _, size in sm.get_matching_blocks())
    return found / len(q) >= 0.75


def repair_proofs(para, kjv):
    """One paragraph: if it is a run of proof texts, its references and
    quotations set right against the KJV; otherwise unchanged."""
    if not PROOF_PARA.match(para):
        return para
    import difflib
    refs = list(REF.finditer(para))
    out, pos, book, ch = [], 0, None, None
    pieces = []  # (reference text, book, chapter, verses, quotation)
    for k, m in enumerate(refs):
        nxt = refs[k + 1].start() if k + 1 < len(refs) else len(para)
        before = para[pos:m.start()]
        quote = para[m.end():nxt]
        if m.group("ver"):
            vs = figures(m.group("vs2"))
            label = f"Ver. {vs}{m.group('colon2')}"
            cands = [(book, ch)] if book else []
            mark = ""
        else:
            name = m.group("book")
            # Chapters are in small Roman numerals; a capital I among them is
            # the OCR's l ("Ivii" is lvii, 57).
            chap_text = m.group("ch")
            if re.search(r"[a-z]", chap_text):
                chap_text = chap_text.replace("I", "l")
            chap = roman(chap_text)
            vs = figures(m.group("vs"))
            ids = BOOKS[name] if isinstance(BOOKS[name], tuple) else (BOOKS[name],)
            num = m.group("num")
            mark = m.group("mark") or ""
            cands = []
            if len(ids) > 1:
                # Which book of the name: the number given, or (John) none.
                n = int(figures(num)) if num and figures(num).isdigit() and len(num) <= 3 else None
                if name == "John":
                    cands = [(ids[n], chap)] if n in (1, 2, 3) else [(43, chap)]
                    if n is None and mark and figures(mark).isdigit():
                        cands.append((ids[int(figures(mark))], chap))  # "1 John" read with the 1 as a mark
                else:
                    if n is None and mark and figures(mark) in ("1", "2"):
                        n, mark = int(figures(mark)), ""
                    if n in (1, 2):
                        cands = [(ids[n - 1], chap)]
                    else:
                        cands = [(i, chap) for i in ids]
            else:
                cands = [(ids[0], chap)]
                if num:  # a "number" before an unnumbered book is a mark
                    mark = num
        # Pick the reading whose verses best match the quotation.
        best = max(cands, key=lambda bc: similarity(quote, kjv.text(bc[0], bc[1], vs)) if quote.strip() else 0, default=None)
        if best is None:
            pieces.append((before, m.group(0), quote))
            pos = nxt
            continue
        book, ch = best
        if not m.group("ver"):
            numbered = {9: "1", 10: "2", 11: "1", 12: "2", 13: "1", 14: "2", 46: "1", 47: "2", 52: "1", 53: "2",
                        54: "1", 55: "2", 60: "1", 61: "2", 62: "1", 63: "2", 64: "3"}
            # "Rom." is abbreviated and takes its stop (which the OCR sometimes
            # drops: "Cor x."); "Job", "Luke" are whole names and take none.
            stop = "" if name in WHOLE_NAMES else "."
            label = (numbered[book] + " " if book in numbered else "") + f"{m.group('book')}{stop} {chap_text.lower()}. {vs}{m.group('colon')}"
        # A footnote mark stands where a quotation or reference has just
        # ended. A single letter there is a mark, unless it is a word ("a",
        # "I", "O") carrying on a sentence.
        preceding = para[:m.start()]
        ended = not preceding.strip() or re.search(r"[.:;,?!'\"’”\d]\s*$", preceding)
        lead = "" if (not mark or ended or mark not in ("a", "A", "I", "O")) else mark + " "
        kjv_text = kjv.text(book, ch, vs)
        fixed_quote = quote
        if quote.strip() and kjv_text and quoted_from(quote, kjv_text):
            fixed_quote = correct_quote(quote, kjv_text, kjv, label)
        if m.group(0).strip() != (lead + label).strip():
            kjv.changes.append(f"{m.group(0).strip()!r} -> {(lead + label).strip()!r}")
        pieces.append((before, lead + label, fixed_quote))
        pos = nxt
    rebuilt = para[:refs[0].start()] if refs else para
    for before, label, quote in pieces:
        rebuilt += label + quote
    return re.sub(r"\s+", " ", rebuilt).strip()


OCR_CONFUSIONS = (("li", "h"), ("rn", "m"), ("cl", "d"), ("vv", "w"), ("ii", "u"), ("in", "m"), ("h", "b"))


def ocr_misreadings(word):
    """What OCR makes of `word` by the confusions it is known for, one at a
    time: "lie" -> "he", "modern" -> "modem"."""
    out = set()
    for right, wrong in OCR_CONFUSIONS:
        for i in [m.start() for m in re.finditer(re.escape(right), word)]:
            out.add(word[:i] + wrong + word[i + len(right):])
    return out


def near_miss(wa, wb):
    """Is OCR's `wa` a misreading of the KJV's `wb`?"""
    import difflib
    return (
        difflib.SequenceMatcher(None, wa, wb).ratio() >= 0.5
        or (wa in ("1", "l") and wb == "i")
        or wa in ocr_misreadings(wb)  # "he" for "lie"
    )


def correct_quote(quote, kjv_text, kjv, label):
    """Words of the quotation the OCR misread, put right from the KJV.

    Two words that make one of the KJV's ("righteous ness") are a word broken
    at a line end, and are joined -- unless the KJV has them as two. A word
    lined up against the KJV's and a near miss of it is that word misread.
    Where Whyte quotes only part of a verse the two do not line up word for
    word; there only the near misses at each end of the stretch that differs
    are corrected, and nothing else is touched.
    """
    import difflib
    q = quote.split()
    k = kjv_text.split()
    k_norm = norm_words(kjv_text)
    k_words = set(k_norm)
    k_pairs = set(zip(k_norm, k_norm[1:]))
    a = 0
    while a < len(q) - 1:
        wa, wb = norm_words(q[a])[0], norm_words(q[a + 1])[0]
        if wa and wb and q[a + 1][:1].islower() and (wa + wb) in k_words and (wa, wb) not in k_pairs:
            kjv.changes.append(f"{label} {q[a] + ' ' + q[a + 1]!r} -> {q[a] + q[a + 1]!r}")
            q[a:a + 2] = [q[a] + q[a + 1]]
            continue
        a += 1

    def fix(i, j, strict=False):
        wa, wb = norm_words(q[i])[0], norm_words(k[j])[0]
        if not wb or wa == wb:
            return False
        if strict:
            # Beside an elision only a plain misreading: one letter wrong in a
            # word of the same length ("shall" for "shalt"), or a confusion
            # OCR is known for. Not "To-day" against "To day", which is how
            # Whyte's Bible printed it.
            one_letter = len(wa) == len(wb) and sum(x != y for x, y in zip(wa, wb)) == 1
            if not (one_letter or wa in ocr_misreadings(wb)):
                return False
        elif not near_miss(wa, wb):
            return False
        # Keep Whyte's punctuation around the word; take the KJV's letters.
        pre, core, suf = re.match(r"^(\W*)(.*?)(\W*)$", q[i]).groups()
        core_k = re.match(r"^\W*(.*?)\W*$", k[j]).group(1)
        kjv.changes.append(f"{label} {q[i]!r} -> {pre + core_k + suf!r}")
        q[i] = pre + core_k + suf
        return True

    sm = difflib.SequenceMatcher(None, norm_words(" ".join(q)), k_norm, autojunk=False)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            # A speck read as a quote mark on a word the KJV prints bare
            # ("forgive 'every one").
            for i, j in zip(range(i1, i2), range(j1, j2)):
                if q[i][:1] in "'‘’" and k[j][:1] not in "'‘’" and len(q[i]) > 1:
                    kjv.changes.append(f"{label} {q[i]!r} -> {q[i][1:]!r}")
                    q[i] = q[i][1:]
            continue
        if tag != "replace":
            continue
        if i2 - i1 == j2 - j1:
            for i, j in zip(range(i1, i2), range(j1, j2)):
                fix(i, j)
        else:
            i, j = i1, j1
            while i < i2 and j < j2 and fix(i, j, strict=True):
                i, j = i + 1, j + 1
            i, j = i2 - 1, j2 - 1
            while i >= i1 and j >= j1 and fix(i, j, strict=True):
                i, j = i - 1, j - 1
    lead = quote[: len(quote) - len(quote.lstrip())]
    return lead + " ".join(q) + (" " if quote.endswith(" ") else "")


def ridgley(src):
    """The four volumes in order, cut at each "Quest. XIV., XV." heading."""
    whole = ""
    for v in range(1, 5):
        for name, markup in spine(os.path.join(src, f"Ridgley - A Body of Divinity, Vol. {v} (of 4).epub")):
            whole += body(markup)
    parts = re.split(r'<h2[^>]*>\s*(Quest\.?\s[^<]*)</h2>', whole)
    out = []
    for k in range(1, len(parts), 2):
        # "XCIC" is the printer's slip for XCIX (99).
        heading = parts[k].replace("XCIC", "XCIX")
        qs = [roman(r) for r in re.findall(r"\b([IVXLC]+)\b", heading)]
        if not qs:
            continue
        chunk = parts[k + 1]
        # A part title after the last question of a part ("THE WORK OF
        # CREATION.") belongs to what follows, and the next heading starts it.
        chunk = re.split(r"<h2[^>]*>", chunk)[0]
        chunk = drop_blocks(chunk, r"^\s*(Quest\.?\s|Answ\.)")
        out.append({"chapters": qs, "text": text(chunk)})
    return fill_gaps(out)  # he takes 155 with 154


def beattie(src):
    """{document: entries}: each chapter under every Standard it names."""
    path = os.path.join(src, "Beattie - The Presbyterian Standards.epub")
    docs = {"wsc": [], "wlc": [], "wcf": []}
    labels = {"SHORTER CATECHISM": "wsc", "LARGER CATECHISM": "wlc", "CONFESSION OF FAITH": "wcf"}
    for name, markup in spine(path):
        b = body(markup)
        refs = re.search(r'<p class="text"[^>]*>\s*((?:SHORTER|LARGER|CONFESSION)[^<]*)</p>', b)
        if not refs:
            continue
        h1 = re.search(r"<h1>(.*?)</h1>", b, re.S)
        h2 = re.search(r"<h2>(.*?)</h2>", b, re.S)
        lead = f"{headline(text(h1.group(1)))}. {headline(text(h2.group(1)))}" if h1 and h2 else ""
        b = re.sub(r"<h[12]>.*?</h[12]>", "", b, flags=re.S)
        b = b.replace(refs.group(0), "")
        # bpc.org's transcription has OCR slips in these lines ("73-76 LAND 153").
        ref_line = re.sub(r"\b[LF]AND\b", "AND", text(refs.group(1)))
        body_text = (lead + "\n\n" if lead else "") + ref_line + "\n\n" + text(b)
        for part in refs.group(1).split(";"):
            label = next((l for l in labels if part.strip().upper().startswith(l)), None)
            if not label:
                continue
            # "1—3", "44, 46, AND 55", "XIV., XV", "VI. — VII", "XXI., 3, 4"
            # (Confession sections after a chapter, not chapters), "----"
            # for none. The catechisms are numbered in figures, the
            # Confession's chapters in Roman numerals.
            nums = part.split(",", 1)[1] if "," in part else ""
            nums = re.sub(r"[–—]", "-", nums)
            numeral = r"[IVXLC]+" if labels[label] == "wcf" else r"\d+"
            chapters = []
            for a, b in re.findall(rf"\b({numeral})\b(?:\.?\s*-+\s*({numeral})\b)?", nums):
                conv = roman if labels[label] == "wcf" else int
                lo = conv(a)
                hi = conv(b) if b else lo
                chapters.extend(range(lo, hi + 1))
            if chapters:
                docs[labels[label]].append({"chapters": sorted(set(chapters)), "text": body_text})
    return docs


SMALL = {"a", "an", "and", "the", "of", "in", "on", "to", "for", "with", "by", "or", "its", "their"}


def headline(s):
    """ "CHAPTER XVIII" -> "Chapter XVIII", "FAITH AND REPENTANCE" -> "Faith and Repentance"."""
    out = []
    for i, w in enumerate(s.split()):
        if re.fullmatch(r"[IVXLC]+\.?", w):
            out.append(w)
        elif i and w.lower() in SMALL:
            out.append(w.lower())
        else:
            out.append(w[:1].upper() + w[1:].lower())
    return " ".join(out)


def fill_gaps(entries):
    """A question an author passes over, between two he treats, takes the
    entry before it (Flavel folds 46-48 into 45)."""
    covered = {q for e in entries for q in e["chapters"]}
    lo, hi = min(covered), max(covered)
    for q in range(lo, hi + 1):
        if q not in covered:
            prev = max((e for e in entries if min(e["chapters"]) < q), key=lambda e: max(e["chapters"]))
            prev["chapters"].append(q)
    return entries


SOURCES = [
    # code, title, author, document, builder (or (builder, key) for Beattie)
    ("fisher", "The Assembly's Shorter Catechism Explained", "James Fisher and Ebenezer Erskine", "wsc", fisher),
    ("henry", "A Scripture Catechism", "Matthew Henry", "wsc", henry),
    ("flavel", "An Exposition of the Assembly's Catechism", "John Flavel", "wsc", flavel),
    ("whyte", "A Commentary on the Shorter Catechism", "Alexander Whyte", "wsc", lambda src: whyte_full(src)),
    ("beattie-wsc", "The Presbyterian Standards", "Francis R. Beattie", "wsc", ("beattie", "wsc")),
    ("ridgley", "A Body of Divinity", "Thomas Ridgley", "wlc", ridgley),
    ("beattie-wlc", "The Presbyterian Standards", "Francis R. Beattie", "wlc", ("beattie", "wlc")),
    ("beattie-wcf", "The Presbyterian Standards", "Francis R. Beattie", "wcf", ("beattie", "wcf")),
]

EXPECTED = {"wsc": 107, "wlc": 196, "wcf": 33}


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SRC
    beattie_docs = beattie(src)
    manifest_path = os.path.join(OUT, "manifest.json")
    with open(manifest_path, encoding="utf-8") as f:
        manifest = json.load(f)
    for code, title, author, doc, builder in SOURCES:
        entries = beattie_docs[builder[1]] if isinstance(builder, tuple) else builder(src)
        # A question an author prints but does not expound (Fisher on the
        # commandments' texts, Flavel on 8 and 17: a title, if anything) has
        # no entry, and the panel says so.
        entries = [e for e in entries if len(e["text"].strip()) >= 100]
        covered = sorted({q for e in entries for q in e["chapters"]})
        bad = [q for q in covered if not 1 <= q <= EXPECTED[doc]]
        if bad:
            sys.exit(f"{code}: numbers outside {doc} 1-{EXPECTED[doc]}: {bad}")
        empty = [e["chapters"] for e in entries if len(e["text"]) < 200]
        words = sum(len(e["text"].split()) for e in entries)
        missing = sorted(set(range(1, EXPECTED[doc] + 1)) - set(covered))
        print(f"{code}: {len(entries)} entries, {len(covered)}/{EXPECTED[doc]} {doc} covered, {words:,} words"
              + (f"; none for {compress(missing)}" if missing else "") + (f"; short: {empty}" if empty else ""))
        file = f"{code}.json"
        with open(os.path.join(OUT, file), "w", encoding="utf-8", newline="\n") as f:
            json.dump([{"chapters": e["chapters"], "text": e["text"]} for e in entries], f, ensure_ascii=False, indent=1)
            f.write("\n")
        row = {"code": code, "title": title, "author": author, "file": file, "document_code": doc}
        manifest = [m for m in manifest if m["code"] != code] + [row]
    with open(manifest_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
        f.write("\n")


def compress(nums):
    out, start = [], None
    for i, n in enumerate(nums):
        if start is None:
            start = n
        if i + 1 == len(nums) or nums[i + 1] != n + 1:
            out.append(f"{start}" if start == n else f"{start}-{n}")
            start = None
    return ", ".join(out)


if __name__ == "__main__":
    main()
