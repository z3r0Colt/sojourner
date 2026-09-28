"""Writes Noah Webster's *American Dictionary of the English Language* (1828)
to reference/webster1828/, from the MySQL dump in DataWar/1828-dictionary.

    python tools/build-webster1828.py

The dump is fetched once, at the commit pinned below, into .cache/webster1828/
(ignored by git) and checked against its SHA-256 on every run, so the output is
the same wherever and however often this is run. SOURCES.md in the output
folder says what the source is and what this script does to it; in short:

- Each dump row carries two renderings of an entry. `string` is the dictionary
  as printed: "PREVENT', v.t. [L. proevenio, supra.]", Scripture cited by book
  and chapter ("Ps.119."). `content` is a website's rewrite of it: labels
  spelled out ("verb transitive", "Latin"), every occurrence of the headword
  italicised and re-cased, the punctuation after it often lost ("pret. and pp.
  let. Letted is obsolete" becomes "preterit tense and participle passive let
  Letted is obsolete"), and a verse number guessed for every chapter citation.
  `string` is used wherever it has the text. But `string` stops short in
  hundreds of rows: after the headword (DEAD, DAY), after the heading line
  (DEATH, n. deth.), after the first homograph (RE'PENT, a. Creeping, without
  REPENT', v.i.), or after the first few senses (FATHER). What `content` has
  beyond it is added, with what can be undone of the rewrite undone, and
  marked as `content`'s in the entry.
- The HTML is rebuilt from an allowlist: <p>, <b>, <i>, and <a class="scripref"
  data-osis> for Scripture, the shape ISBE and the commentaries already use.
- A row is split into its homographs (LET v.t., LET v.i., LET n.), identical
  and truncated copies of the same entry (the dump files alternate spellings,
  and some runs of the D pages, more than once) are merged, and a headword
  printed only as a variant of the next ("ADVERT'ENCE, ADVERT'ENCY, n.") is
  joined back to it, or kept as a lookup alias of it (AMONG of AMONGST).
- Scripture citations are linked where the book is unmistakable and the
  chapter and verse exist in the KJV. Webster usually cites the chapter only;
  where the quotation just before the citation is found in exactly one verse
  of that chapter, the link carries that verse too, and otherwise names the
  whole chapter. A citation whose quotation is plainly in another chapter is
  not linked.
"""

import difflib
import hashlib
import html as htmllib
import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPO = "DataWar/1828-dictionary"
COMMIT = "15d8c24a6786245153d196e14898f379dc5ff691"
SQL_PATH = "v2015/SQL/02-database-insert/dictionary_webster1828.sql"
SQL_SHA256 = "ae1821fad9d158db054a321cff07e36bd13f7520d1ebe7a218df881c307c6c2a"
CACHE = ROOT / ".cache" / "webster1828" / f"dictionary_webster1828-{COMMIT}.sql"
OUT = ROOT / "reference" / "webster1828"
KJV = ROOT / "bibles" / "King James Version (1769).xml"

# The app's books table (src-tauri/src/db/schema.rs): OSIS code, chapters.
BOOKS = [
    ("Gen", 50), ("Exod", 40), ("Lev", 27), ("Num", 36), ("Deut", 34), ("Josh", 24), ("Judg", 21),
    ("Ruth", 4), ("1Sam", 31), ("2Sam", 24), ("1Kgs", 22), ("2Kgs", 25), ("1Chr", 29), ("2Chr", 36),
    ("Ezra", 10), ("Neh", 13), ("Esth", 10), ("Job", 42), ("Ps", 150), ("Prov", 31), ("Eccl", 12),
    ("Song", 8), ("Isa", 66), ("Jer", 52), ("Lam", 5), ("Ezek", 48), ("Dan", 12), ("Hos", 14),
    ("Joel", 3), ("Amos", 9), ("Obad", 1), ("Jonah", 4), ("Mic", 7), ("Nah", 3), ("Hab", 3),
    ("Zeph", 3), ("Hag", 2), ("Zech", 14), ("Mal", 4), ("Matt", 28), ("Mark", 16), ("Luke", 24),
    ("John", 21), ("Acts", 28), ("Rom", 16), ("1Cor", 16), ("2Cor", 13), ("Gal", 6), ("Eph", 6),
    ("Phil", 4), ("Col", 4), ("1Thess", 5), ("2Thess", 3), ("1Tim", 6), ("2Tim", 4), ("Titus", 3),
    ("Phlm", 1), ("Heb", 13), ("Jas", 5), ("1Pet", 5), ("2Pet", 3), ("1John", 5), ("2John", 1),
    ("3John", 1), ("Jude", 1), ("Rev", 22),
]
CHAPTERS = dict(BOOKS)


# --------------------------------------------------------------------------
# Fetching and parsing the dump


def fetch() -> bytes:
    if not CACHE.exists():
        url = f"https://raw.githubusercontent.com/{REPO}/{COMMIT}/{SQL_PATH}"
        print(f"downloading {url}", file=sys.stderr)
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        tmp = CACHE.with_suffix(".part")
        with urllib.request.urlopen(url) as resp, open(tmp, "wb") as out:
            while chunk := resp.read(1 << 20):
                out.write(chunk)
        tmp.replace(CACHE)
    raw = CACHE.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if digest != SQL_SHA256:
        sys.exit(f"{CACHE} has SHA-256 {digest}, expected {SQL_SHA256}; delete it and run again")
    return raw


# MySQL string escapes. \% and \_ keep their backslash (they are only escapes
# inside LIKE patterns); an unknown escape stands for the character itself.
SQL_ESCAPES = {"0": "\0", "'": "'", '"': '"', "b": "\b", "n": "\n", "r": "\r", "t": "\t",
               "Z": "\x1a", "\\": "\\", "%": "\\%", "_": "\\_"}
_PLAIN = re.compile(r"[^'\\]+")
_BARE = re.compile(r"[^,)\s]+")
_WS = re.compile(r"\s*")


def parse_inserts(sql: str) -> list[list]:
    """Every tuple of every INSERT ... VALUES statement, read with MySQL's
    quoting rules (backslash escapes and doubled quotes) rather than by
    splitting on commas, which the definitions are full of."""
    rows = []
    pos = 0
    while (start := sql.find("INSERT INTO", pos)) >= 0:
        i = sql.index("VALUES", start) + len("VALUES")
        while True:
            i = _WS.match(sql, i).end()
            if sql[i] != "(":
                raise ValueError(f"expected ( at {i}: {sql[i:i + 60]!r}")
            i += 1
            values = []
            while True:
                i = _WS.match(sql, i).end()
                if sql[i] == "'":
                    i += 1
                    buf = []
                    while True:
                        c = sql[i]
                        if c == "\\":
                            buf.append(SQL_ESCAPES.get(sql[i + 1], sql[i + 1]))
                            i += 2
                        elif c == "'":
                            if sql[i + 1] == "'":
                                buf.append("'")
                                i += 2
                            else:
                                i += 1
                                break
                        else:
                            m = _PLAIN.match(sql, i)
                            buf.append(m.group())
                            i = m.end()
                    values.append("".join(buf))
                else:
                    m = _BARE.match(sql, i)
                    tok = m.group()
                    i = m.end()
                    values.append(None if tok == "NULL" else int(tok) if re.fullmatch(r"-?\d+", tok) else tok)
                i = _WS.match(sql, i).end()
                if sql[i] == ",":
                    i += 1
                    continue
                if sql[i] == ")":
                    i += 1
                    break
                raise ValueError(f"expected , or ) at {i}: {sql[i:i + 60]!r}")
            rows.append(values)
            i = _WS.match(sql, i).end()
            if sql[i] == ",":
                i += 1
                continue
            if sql[i] == ";":
                pos = i + 1
                break
            raise ValueError(f"expected , or ; at {i}: {sql[i:i + 60]!r}")
    return rows


# --------------------------------------------------------------------------
# Inline HTML: rebuilt from an allowlist, never passed through


_ENTITY = re.compile(r"&(nbsp|amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);")


def unescape(text: str) -> str:
    """Only the entities the dump actually uses. A general unescape would
    turn Webster's "&c" (et cetera, printed without a semicolon) into
    nothing worse, but would also read legacy entities like "&para" out of
    ordinary prose."""
    def one(m):
        name = m.group(1)
        if name.startswith("#x"):
            return chr(int(name[2:], 16))
        if name.startswith("#"):
            return chr(int(name[1:]))
        return {"nbsp": " ", "amp": "&", "lt": "<", "gt": ">", "quot": '"', "apos": "'"}[name]
    text = text.replace("Â ", " ").replace(" ", " ")
    return _ENTITY.sub(one, text)


def esc(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


_TOKEN = re.compile(r"<[^>]*>|[^<]+|<")
KEEP = {"b": "b", "strong": "b", "i": "i", "em": "i"}


def clean_inline(fragment: str) -> str:
    """A fragment reduced to escaped text and balanced <b>/<i>. Every other
    tag is dropped and its text kept."""
    out = []
    stack = []
    for tok in _TOKEN.findall(fragment):
        if tok.startswith("<") and len(tok) > 1:
            m = re.match(r"<\s*(/?)\s*([a-zA-Z0-9]+)", tok)
            if not m:
                continue
            closing, name = m.group(1) == "/", KEEP.get(m.group(2).lower())
            if not name:
                continue
            if not closing:
                if name in stack:
                    continue
                stack.append(name)
                out.append(f"<{name}>")
            elif name in stack:
                while stack:
                    top = stack.pop()
                    out.append(f"</{top}>")
                    if top == name:
                        break
        else:
            out.append(esc(unescape(tok)))
    while stack:
        out.append(f"</{stack.pop()}>")
    s = re.sub(r"\s+", " ", "".join(out))
    # Empty or whitespace-only emphasis, and spaces pushed inside a tag.
    for _ in range(2):
        s = re.sub(r"<(b|i)>(\s*)</\1>", r"\2", s)
    s = re.sub(r"<(b|i)> ", r" <\1>", s)
    s = re.sub(r" </(b|i)>", r"</\1> ", s)
    return re.sub(r"\s+", " ", s).strip()


def plain(fragment: str) -> str:
    return htmllib.unescape(re.sub(r"<[^>]*>", "", fragment))


def letters(fragment: str) -> int:
    return len(re.findall(r"[A-Za-z]", plain(fragment)))


# --------------------------------------------------------------------------
# Rows into paragraphs, paragraphs into homographs

# Read from the plain text of the heading line, so "<i>adv</i>." and "adv."
# are the same. "v.t" is sometimes printed without its last full stop.
POS_RE = re.compile(
    r"^\s*[,.]?\s*("
    r"v\.\s?t\.?|v\.\s?i\.?|n\.\s?plu\.|n\.\s?pl\.|n\.|a\.|adv\.|ppr\.|pp\.|pret\.|prep\.|conj\.|con\.|"
    r"interj\.|exclam\.|pron\.|part\.|adj\.|plu\.|pl\.|v\.)"
    r"(?![a-z])",
)


def part_of_speech(rest: str):
    text = plain(rest)
    m = POS_RE.match(text)
    if not m:
        return None
    pos = re.sub(r"\s+", "", m.group(1))
    pos = pos if pos.endswith(".") else pos + "."
    if pos in ("n.plu.", "n.pl.") and re.match(r"\s*[A-Za-z][a-z'`-]*\s*(?:[.;,]|$)", text[m.end():]):
        # "MAN, n. plu. men.": a noun, and its plural.
        return "n."
    return pos
HEAD_RE = re.compile(r"^<b>(.*?)</b>(.*)$", re.S)
STRESS = re.compile(r"['`’]")


def string_paras(s: str) -> list[str]:
    """`string` is the printed layout: an unclosed <p> per paragraph, <DD>s
    for the indent of a sense or a quotation."""
    paras = []
    page_break = False
    for chunk in re.split(r"<p\b[^>]*>", s or "", flags=re.I):
        chunk = clean_inline(chunk)
        if re.fullmatch(r"\s*\d+\s*", plain(chunk)):
            # A number standing alone, from the page of the printed text the
            # dump was made from ("in honor of the heroic / 36 / achievements
            # of princes" under BARD): dropped, and the sentence it broke is
            # joined up again.
            page_break = True
            continue
        if letters(chunk) or re.search(r"\d", chunk):
            if page_break and paras and re.match(r"[a-z]", plain(chunk)) and not re.search(r"[.?!:;]\s*$", plain(paras[-1])):
                paras[-1] = paras[-1] + " " + chunk
            else:
                paras.append(chunk)
        page_break = False
    return paras


def is_upper_head(bold: str) -> bool:
    # "DAUB'RY or DAUB'ERY", "ACCESSARY, See ACCESSORY": the connector between
    # two spellings is not part of either. It must stand as a word of its own:
    # the OR of OR'DER and HON'OR, and a bold that is only "AND," or "OR,",
    # are the headword.
    words = re.sub(r"(?<=\s)(?:or|OR|and|AND|See|see)\s.*?(?=[A-Z]{2}|$)", " ", plain(bold))
    lets = re.findall(r"[A-Za-z]", words)
    return bool(lets) and sum(c.isupper() for c in lets) >= 0.8 * len(lets)


def own_bold_heading(bold: str, rest: str, row_word: str):
    """A first paragraph whose bold is not an upper-case headword but opens
    with the row's own word: the whole heading line set in bold ("<b>CHAMPAIN,
    n.  A flat open country.</b>"), or the headword in lower case
    ("<b>dictionary</b>, n."). The headword is split off, in capitals, and the
    rest of the bold joins the rest of the line."""
    m = re.match(r"[A-Za-z][A-Za-z'`\-]*", bold)
    if not m or lookup_key(m.group()).replace("-", "") != (row_word or "").replace("-", ""):
        return None
    return m.group().upper(), bold[m.end():] + rest


def split_heading(para: str, first: bool, row_word: str = None):
    """(bold, rest) if the paragraph opens a homograph: an upper-case headword
    in bold followed by a comma, a part of speech, or nothing. "<b>A</b> has
    in English, three sounds" is a paragraph of A, not a new entry."""
    m = HEAD_RE.match(para)
    if not m:
        return None
    bold, rest = m.group(1), m.group(2)
    if not is_upper_head(bold):
        own = own_bold_heading(bold, rest, row_word) if first else None
        if not own:
            return None
        bold, rest = own
    bold, rest = absorb_bold(bold, rest)
    if first:
        return bold, rest
    if re.match(r"(?:THE|AN?) [A-Z]", plain(bold)):
        # Capitals for emphasis inside a definition ("<b>THE BOOK</b>, by
        # way of eminence" under BIBLE), not a headword.
        return None
    b = plain(bold).rstrip()
    if b.endswith((",", ".", "'", "`")) or "," in b or " or " in b.lower():
        return bold, rest
    if not rest.strip() or re.match(r"^\s*[,.;]", rest) or part_of_speech(rest):
        return bold, rest
    return None


NEXT_BOLD = re.compile(r"^(\s*(?:,\s*or\b|,|or\b|-)?\s*)<b>([^<]*)</b>")


def absorb_bold(bold: str, rest: str):
    """A heading printed in more than one bold: another spelling ("<b>NEAPED
    </b>, <b>BENEAPED,</b> a.", "<b>DAUB'RY</b> or <b>DAUB'ERY</b>"), or the
    rest of a compound ("<b>BRE'ATHING</b>-<b>PLACE</b>")."""
    while (m := NEXT_BOLD.match(rest)) and is_upper_head(m.group(2)):
        sep = m.group(1).strip()
        head = bold.rstrip()
        if sep == "-":
            bold = head + "-" + m.group(2).lstrip()
        elif sep.endswith("or"):
            bold = head.rstrip(",") + " or " + m.group(2).lstrip()
        elif sep == ",":
            bold = head.rstrip(",") + ", " + m.group(2).lstrip()
        else:
            bold = head + " " + m.group(2).lstrip()
        rest = rest[m.end():]
    return bold, rest


# Two headings the dump garbled into what looks like a word and a fragment.
HEAD_FIXES = {"BAROM,'ETER": "BAROM'ETER", "DESCRIPTIV,E": "DESCRIPTIVE"}

# Slips of the keyboard in the dump's text, put right in every column they
# appear in before anything else reads it. Each must still be there to fix,
# so a new dump that has mended one is noticed rather than silently passed.
SOURCE_TYPOS = [
    # SPARE, v.t. 1: Milton's line ends in a slash for its full stop.
    ("Thou thy Father's thunder did'st not spare/", "Thou thy Father's thunder did'st not spare."),
    # WHETHER, 1: the same slip ("/" is the key beside "."), in a citation,
    # which it kept from being linked: with its stop it is Matthew 21, and
    # the quotation finds its verse (31).
    ("did the will of his father? Matthew 21/", "did the will of his father? Matthew 21."),
]


def fix_source_typos(rows):
    seen = {bad: 0 for bad, _ in SOURCE_TYPOS}
    for row in rows:
        for i, value in enumerate(row):
            if not isinstance(value, str):
                continue
            for bad, good in SOURCE_TYPOS:
                if bad in value:
                    seen[bad] += 1
                    value = value.replace(bad, good)
            row[i] = value
    missing = [bad for bad, n in seen.items() if n == 0]
    if missing:
        sys.exit(f"source typos no longer in the dump: {missing}")
    return rows
FORM_SEP = re.compile(r"(\s*[,;]\s*|\s+(?:or|OR|and|AND)\s+)")


def expand_fragment(first: str, frag: str):
    """A second spelling printed as the part that changes ("OP'TIC, 'TICAL",
    "COMPETENCE,PETENCY", "SALTPE'TER, 'TRE") written out in full against
    the first (OPTICAL, COMPETENCY, SALTPETRE), or None when it is not such a
    fragment. Both still carry their accent marks."""
    f, fr = STRESS.sub("", first), STRESS.sub("", frag)
    if len(fr) < 2:
        return None
    if not frag.startswith(("'", "`")) and fr[:1] == f[:1]:
        return None  # a spelling in full ("NICH,NICHE")
    # The fragment's opening letters found again in the first form
    # (COMPE[TENCE] + TENCY), the longest overlap winning.
    for k in range(len(fr), 1, -1):
        p = f.find(fr[:k], 1)
        if p >= 1:
            return f[:p] + fr
    if frag.startswith(("'", "`")) and len(fr) >= 3:
        # "SALTPE'TER, 'TRE": the fragment replaces what follows the stress.
        stress = [i for i, c in enumerate(first) if c in "'`"]
        if stress:
            head = STRESS.sub("", first[: stress[-1]])
            if fr[0] == f[len(head): len(head) + 1]:
                return head + fr
    if frag.startswith(("'", "`")) and fr in ("IC", "AL"):
        return f + fr  # "OL'IGIST, 'IC": OLIGISTIC
    return None


def parse_heading(bold: str, rest: str):
    """The printed headword(s), the part of speech, and the rest of the line.
    "See X" printed inside the bold ("ACCESSARY, See ACCESSORY.") is moved
    out of it."""
    bold, rest = absorb_bold(bold, rest)
    see = re.search(r"\b[Ss]ee\b", bold)
    if see:
        rest = " " + bold[see.start():] + rest
        bold = bold[:see.start()]
    bold = plain(bold)
    for bad, good in HEAD_FIXES.items():
        bold = bold.replace(bad, good)
    printed = bold.strip()
    tail = ""
    while printed and printed[-1] in ",.;: ":
        tail = printed[-1] + tail
        printed = printed[:-1]
    printed = printed.strip()
    tail = tail.strip()
    rest = rest.strip()
    if tail and not re.match(r"^[,.;]", rest):
        rest = tail[0] + " " + rest if rest else tail[0]
    rest = rest.strip()
    pos = part_of_speech(rest)
    # Spellings are separated by a comma or semicolon, or by "or"/"and" as a
    # word of its own. The accent marks stay on until the split is made
    # ("OR'DER", "HON'OR" and "VI'AND" are one word each), and a bold that is
    # only "AND" or "OR" is itself the headword.
    forms = []
    fragments = {}
    first_printed = None
    pieces = FORM_SEP.split(printed)
    for i in range(0, len(pieces), 2):
        sep = pieces[i - 1] if i else ""
        part = pieces[i].strip()
        joined = re.match(r"(?:or|OR|and|AND)\s+", part)
        if joined and forms:
            part = part[joined.end():]
        full = None
        if forms and not joined and (part.startswith(("'", "`")) or sep == ","):
            full = expand_fragment(first_printed, part)
        form = STRESS.sub("", full or part).strip(" .")
        form = re.sub(r"\s+", " ", form)
        if not re.search(r"[A-Za-z]", form):
            continue
        if not forms:
            first_printed = part
        if full:
            fragments[lookup_key(form)] = lookup_key(part)
        forms.append(form)
    return printed, forms, pos, rest, fragments


def display(form: str) -> str:
    return form[:1].upper() + form[1:].lower()


def lookup_key(form: str) -> str:
    return re.sub(r"\s+", " ", STRESS.sub("", form)).strip(" .-").lower()


class Section:
    """One homograph as printed: its heading line and its paragraphs."""

    def __init__(self, row_id, index, printed, forms, pos, rest, body, own, source="string"):
        self.row_id = row_id
        self.index = index
        self.printed = printed
        self.forms = forms
        self.pos = pos
        self.rest = rest
        self.body = body
        self.own = own
        self.source = source
        self.prefix = []  # (printed, forms) of variant headwords joined to this one
        self.fragments = {}  # a spelling written out in full: its key -> the printed fragment's
        self.from_content = set()  # indexes into body of paragraphs only `content` has
        self.aliases = set()  # further lookup keys, from headwords whose own rows are empty

    def add_prefix(self, printed, forms, first=False):
        """Joins a variant headword on in front, once."""
        have = {lookup_key(f) for f in self.all_forms()}
        if lookup_key(forms[0]) not in have:
            if first:
                self.prefix.insert(0, (printed, forms))
            else:
                self.prefix.append((printed, forms))

    def take(self, other):
        """Becomes a fuller copy of the same homograph."""
        self.rest, self.body, self.printed, self.forms = other.rest, other.body, other.printed, other.forms
        self.source, self.from_content, self.fragments = other.source, set(other.from_content), dict(other.fragments)
        self.prefix = self.prefix or other.prefix
        self.aliases |= other.aliases

    def is_stub(self) -> bool:
        rest = POS_RE.sub("", plain(self.rest), count=1)
        return not self.body and letters(rest) < 3

    def key(self) -> str:
        return lookup_key(self.all_forms()[0])

    def all_forms(self):
        forms = []
        for _, f in self.prefix:
            forms.extend(f)
        return forms + self.forms

    def heading_html(self) -> str:
        printed = ", ".join([p for p, _ in self.prefix] + [self.printed])
        rest = self.rest
        if rest and self.source == "content" and self.pos and not re.match(r"^[,.;:]", rest):
            # The site dropped the comma after the headword ("CYCOPEDE noun").
            rest = ", " + rest
        elif rest and not re.match(r"^[,.;:\[]", plain(rest)):
            rest = " " + rest
        elif rest.startswith("["):
            rest = " " + rest
        return f"<p><b>{esc(printed)}</b>{rest}</p>"

    def text_key(self) -> str:
        return re.sub(r"\s+", " ", plain(self.rest + " " + " ".join(self.body))).strip()


def sections_from_paras(row_id, paras, row_word, source="string"):
    sections = []
    for para in paras:
        head = split_heading(para, first=not sections, row_word=row_word)
        if head:
            printed, forms, pos, rest, fragments = parse_heading(*head)
            if forms:
                own = lookup_key(forms[0]).replace("-", "") == (row_word or "").replace("-", "")
                own = own or any(lookup_key(f).replace("-", "") == (row_word or "").replace("-", "") for f in forms)
                own = own or any(k.replace("-", "") == (row_word or "").replace("-", "") for k in fragments.values())
                sec = Section(row_id, len(sections), printed, forms, pos, rest, [], own, source)
                sec.fragments = fragments
                sections.append(sec)
                continue
        if sections:
            sections[-1].body.append(para)
    return sections


# --------------------------------------------------------------------------
# The `content` rendering, for rows whose `string` stops short

LABELS = [
    ("verb transitive preterit tense", "v.t. pret."), ("verb intransitive preterit tense", "v.i. pret."),
    ("participle present tense", "ppr."), ("participle passive", "pp."), ("verb transitive", "v.t."),
    ("verb intransitive", "v.i."), ("preterit tense", "pret."), ("noun plural", "n. plu."), ("noun", "n."),
    ("adjective", "a."), ("adverb", "adv."), ("preposition", "prep."), ("pronoun", "pron."),
    ("conjunction", "conj."), ("exclamation", "exclam."), ("obsolete", "Obs."), ("plural", "plu."),
]
LABEL_MAP = dict(LABELS)


def content_usable(row) -> bool:
    heading = row[5] or ""
    return bool(row[6]) and not heading.startswith("Did you mean") and "No results found" not in heading


def content_paras(content: str, forms: list[str]) -> list[str]:
    """Undoes what can be undone of the site's rewrite: labels back to
    Webster's abbreviations, "Latin" back to "L.", "etc." back to "&c.", its
    single quotation marks back to double, the headword's italics removed and
    its case restored at the start of a sentence, and the stop the site
    dropped after an italicised headword put back (a full stop before a
    capital or at the end of a paragraph, a comma before a small letter,
    which is what the dump's `string` has in nine cases out of ten). Its
    verse guesses are dropped from the citation text (the chapter is kept,
    and linked like any other)."""
    heads = {lookup_key(f) for f in forms}
    s = re.sub(r"</?div[^>]*>", "", content)
    s = s.replace("&nbsp;", " ")
    for bad, good in HEAD_FIXES.items():
        first, second = bad.split(",")
        s = re.sub(re.escape(first) + r"(</b>)?,\s*" + re.escape(second), lambda m: good + (m.group(1) or ""), s)

    def label(m):
        inner = m.group(1).strip()
        if inner in LABEL_MAP:
            return LABEL_MAP[inner]
        if lookup_key(inner) in heads:
            return "\x01" + inner + "\x02"
        return m.group(0)

    s = re.sub(r"<i>(.*?)</i>", label, s)
    s = re.sub(r"\b(n|a|v\.t|v\.i|pp|ppr|adv|pret|prep|pron|conj|plu|Obs)\.\.(?!\.)", r"\1.", s)
    s = re.sub(r",\s*,", ",", s)
    s = re.sub(r"\x02 (?=\s*</p>)", "\x02.", s)
    s = re.sub(r"\x02  (?=[a-z])", "\x02, ", s)
    s = re.sub(r"\x02  (?=[^\s<])", "\x02. ", s)
    s = re.sub(r"\bLatin\s*(?=[,.;:\]])", "L.", s)
    s = re.sub(r"\bLatin  ", "L. ", s)
    s = re.sub(r"\bLatin\.\.", "L.", s)
    s = re.sub(r"\betc\.", "&amp;c.", s)
    s = re.sub(r"(?<=[\s,])_ c\.", "&amp;c.", s)
    s = re.sub(r"<b>(\d+\.)</b>", r"\1", s)
    s = re.sub(r"<a class='bible'[^>]*>([1-3]?\s?[A-Za-z ]+?)\s(\d+):\d+</a>", r"\1 \2", s)
    s = re.sub(r"<a\b[^>]*>(.*?)</a>", r"\1", s)
    # Quotation marks: the site printed Webster's double quotes as single
    # ones ("'He came'", "may write; ' that is"). An apostrophe inside a
    # word, or after one ("fathers' house"), is left alone.
    s = re.sub(r"(?<=[\s(\[])'(?=[A-Za-z])", '"', s)
    s = re.sub(r"(?<=[,.;:?!]) ?'(?=[\s<]|$)", '"', s)
    # A headword set partly in bold ("<b>AMONG</b>ST'", "<b>TO'WARD</b>LINESS")
    # is one word; one run on into lower case ("<b>DAY</b>s of grace",
    # "<b>CHAMBER</b>-council") is the site's re-casing of an ordinary word.
    s = re.sub(r"<b>([A-Z][A-Z'`-]*)</b>(['`]?[A-Z][A-Z'`-]*|['`](?=[\s,]))", r"<b>\1\2</b>", s)
    # Further spellings printed after the bold one ("<b>SPLINT</b>,
    # SPLINTER, noun") belong to the heading.
    s = re.sub(r"<b>([^<]+)</b>((?:\s*,\s*(?:or\s+)?['`]?[A-Z][A-Z'`\-]*[A-Z]'?)+)(?=\s*,|\s+or\s+<b>)", r"<b>\1\2</b>", s)
    s = re.sub(r"<b>([A-Z][A-Z'`]+)</b>(?=[a-z]|-[a-z])", lambda m: display(m.group(1)), s)
    # A headword occurrence the site re-cased: "<b>PREVENT</b> us" inside a
    # paragraph was "Prevent us"; "\x01let\x02 him go" opening a sentence
    # was "Let him go".
    def recase_bold(m):
        return m.group(1) + display(m.group(2))
    s = re.sub(r"((?:[.!?:;]|</p>\s*<p>|^)\s*|[a-z,]\s)<b>([A-Z][A-Z'`-]+)</b>(?=\s[a-z])", recase_bold, s)
    def recase_italic(m):
        word = m.group(2)
        return m.group(1) + word[:1].upper() + word[1:]
    s = re.sub(r"((?:[.!?]\s+|<p>\s*))\x01(.*?)\x02", recase_italic, s)
    s = s.replace("\x01", "").replace("\x02", "")
    paras = []
    for chunk in re.split(r"</?p\b[^>]*>", s, flags=re.I):
        chunk = clean_inline(chunk)
        # The site's own note, not Webster's: "First occurrence in the
        # Bible(KJV): Exodus 28:19".
        if plain(chunk).startswith("First occurrence in the Bible"):
            continue
        if not (letters(chunk) or re.search(r"\d", chunk)):
            continue
        # A headword the site printed without bold, on a line of its own or
        # before its part of speech ("CHAMPAIGN, ", "AN'CHOVY, n. A small
        # fish", "AX'IFORM a."): bold again, so that it opens a homograph.
        head = re.match(r"(['`]?[A-Z][A-Z'`\-]*[A-Z]'?)(?=\s*,?\s*$|\s*,?\s*(?:n|a|v\.t|v\.i|adv|pp|ppr|prep|pret|pron|conj|exclam)\.)", chunk)
        if head and paras:
            chunk = f"<b>{head.group(1)}</b>{chunk[head.end():]}"
        # A phrase the site set in bold capitals ("<b>HOLY SPIRIT</b>, the
        # third person in the Trinity" under SPIRIT, "<b>SLOOP OF WAR</b>"):
        # a paragraph of the entry, as `string` has it, not a new headword.
        phrase = re.match(r"<b>([A-Z'` ]+)</b>", chunk)
        if phrase and paras and not re.search(r"\b(?:OR|AND)\b", phrase.group(1)):
            parts = {lookup_key(x) for x in phrase.group(1).split()}
            if len(phrase.group(1).split()) > 1 and parts & heads and lookup_key(phrase.group(1)) not in heads:
                chunk = phrase.group(1) + chunk[phrase.end():]
        # A part of speech on a line of its own, its headword lost (", noun
        # / 1. Soldiers collectively" after SOLDIERSHIP, where SOLDIERY
        # belongs): what follows is another entry's, and is not used.
        if paras and re.fullmatch(r"\s*,?\s*(?:n|a|v\.t|v\.i|adv|pp|ppr|prep|pret|pron|conj|exclam)\.\s*", plain(chunk)) \
                and not re.fullmatch(r"<b>[^<]*</b>", paras[-1]):
            break
        # A line the site broke in two: "It began to dawn towards the first
        # day of the" / "week."
        if paras and re.match(r"[a-z]", plain(chunk)) and not re.search(r"[.?!:;,\])]\s*$", plain(paras[-1])):
            paras[-1] = paras[-1] + " " + chunk
            continue
        # A heading whose part of speech the site put on the next line
        # ("<b>EASE</b>" / ", v.t. To free from pain").
        if paras and re.match(r"\s*,", plain(chunk)) and re.fullmatch(r"<b>[^<]*</b>", paras[-1]):
            paras[-1] = paras[-1] + chunk.strip()
            continue
        paras.append(chunk)
    return paras


# The spellings Webster prints side by side under one definition
# ("ECONOM'IC, ECONOM'ICAL, a.", "EL'EGANCE, EL'EGANCY, n.", "HERD'MAN,
# HERDS'MAN, n."). A headword-only row is joined to the next entry only when
# the two differ in one of these ways: the dump also leaves headwords whose
# own definitions are simply missing (AFFECT'OR, then AFFECT'UOUS), and
# looser likeness joins words that are not variants at all (SCIATIC and
# SCIATICA, HOMER and HOMERIC).
VARIANT_SUFFIXES = [("ic", "ical"), ("ence", "ency"), ("ance", "ancy"), ("man", "sman"), ("in", "ine"),
                    ("ate", "ated"), ("pped", "pt")]


def is_variant(a: str, b: str) -> bool:
    return any(a.endswith(x) and b == a[: len(a) - len(x)] + y for x, y in VARIANT_SUFFIXES)


# A paragraph of `content` that opens with a headword and nothing of a
# definition yet: "ADVERT'ENCY, <i>noun</i>", "'ARM, <i>noun</i>",
# "<b>AMONG</b>ST', <i>preposition</i>", "AX'IFORM <i>adjective</i>",
# "CHAMPAIGN, ".
VARIANT_HEAD = re.compile(
    r"^(?:<b>)?['`]?([A-Z][A-Z'`\-]*[A-Z]'?)(?:</b>)?([A-Z'`\-]*)\s*"
    r"(?:,|\.|$|(?=(?:<i>)?\s*(?:noun|verb|adjective|adverb|participle|preterit|preposition|pronoun|conjunction"
    r"|exclamation|interjection)\b))"
)


def content_chain(content: str, own: str):
    """For a headword-only row whose `content` goes straight on to another
    headword ("ADVERT'ENCE, / ADVERT'ENCY, noun A direction of the mind",
    "HER'ETOG, HEREUNTO / adverb To this."), that headword as printed;
    otherwise None. The same headword again ("CHAMBER, / CHAMBER, / 1. An
    apartment...", "ANCHO'VY, / AN'CHOVY, noun") is the entry itself."""
    paras = [p for p in re.split(r"</?p\b[^>]*>", re.sub(r"</?div[^>]*>", "", content)) if p.strip()]
    if not paras:
        return None
    first = re.match(r"^<b>([^<]*)</b>", paras[0].strip())
    if first:
        for part in FORM_SEP.split(first.group(1))[2::2]:
            part = part.strip(" ,.'")
            if re.fullmatch(r"[A-Z][A-Z'`\- ]*", part) and lookup_key(part) != lookup_key(own):
                return part
    for para in paras[1:]:
        m = VARIANT_HEAD.match(para.strip())
        if not m:
            return None
        form = m.group(1) + m.group(2)
        if lookup_key(form) != lookup_key(own):
            return form
    return None


# --------------------------------------------------------------------------
# Scripture

STOP = set("""a an and are as at be but by did do doth for from had hast hath have he her him his i if in into is
it its let me my no not o of on or our out shall she so than that the thee their them then there they thine this
thou thy to unto up upon us was we were what when which who whom will with ye yet you your all also even one""".split())


def load_kjv():
    root = ET.parse(KJV).getroot()
    verses = {}
    for bnum, book in enumerate(root.findall("BIBLEBOOK")):
        osis = BOOKS[int(book.get("bnumber")) - 1][0]
        for ch in book.findall("CHAPTER"):
            c = int(ch.get("cnumber"))
            for v in ch.findall("VERS"):
                verses[(osis, c, int(v.get("vnumber")))] = "".join(v.itertext())
    counts = Counter()
    for (osis, c, v) in verses:
        counts[(osis, c)] = max(counts[(osis, c)], v)
    return verses, counts


def stem(w: str) -> str:
    """A word with its inflection taken off, so that "choked" meets "choke",
    "dawning" "dawn", "loveth" "love" and "hands" "hand"."""
    for suffix in ("ing", "eth", "est", "ed", "es", "s"):
        if w.endswith(suffix) and len(w) - len(suffix) >= 3 and not w.endswith("ss"):
            w = w[: -len(suffix)]
            break
    return w[:-1] if len(w) > 3 and w.endswith("e") else w


def exact_words(text: str) -> set[str]:
    """The same, with nothing taken off."""
    return {w for w in re.findall(r"[a-z]+", text.lower()) if w not in STOP and len(w) >= 2}


def words(text: str) -> set[str]:
    """The words of a quotation or a verse that can tell one verse from
    another: common words left out, the rest stemmed."""
    out = set()
    for w in re.findall(r"[a-z]+", text.lower()):
        if w in STOP or len(w) < 2:
            continue
        out.add(stem(w))
    return out


# Books named in full or by an abbreviation nothing else in the dictionary
# uses. Keys are lower case with the full stop removed.
STRONG = {
    "gen": "Gen", "genesis": "Gen", "ex": "Exod", "exod": "Exod", "exodus": "Exod", "lev": "Lev",
    "levit": "Lev", "leviticus": "Lev", "num": "Num", "numb": "Num", "numbers": "Num", "deut": "Deut",
    "deuteronomy": "Deut", "josh": "Josh", "joshua": "Josh", "judg": "Judg", "judges": "Judg",
    "ruth": "Ruth", "ezra": "Ezra", "neh": "Neh", "nehemiah": "Neh", "esth": "Esth", "esther": "Esth",
    "job": "Job", "ps": "Ps", "psal": "Ps", "psalm": "Ps", "psalms": "Ps", "prov": "Prov",
    "proverbs": "Prov", "eccl": "Eccl", "eccles": "Eccl", "ecc": "Eccl", "ecclesiastes": "Eccl",
    "cant": "Song", "canticles": "Song", "isa": "Isa", "isaiah": "Isa", "jer": "Jer", "jerem": "Jer",
    "jeremiah": "Jer", "lam": "Lam", "lamentations": "Lam", "ezek": "Ezek", "ezekiel": "Ezek",
    "dan": "Dan", "daniel": "Dan", "hos": "Hos", "hosea": "Hos", "joel": "Joel", "amos": "Amos",
    "obad": "Obad", "obadiah": "Obad", "jonah": "Jonah", "mic": "Mic", "micah": "Mic", "nah": "Nah",
    "nahum": "Nah", "hab": "Hab", "habakkuk": "Hab", "zeph": "Zeph", "zephaniah": "Zeph", "hag": "Hag",
    "haggai": "Hag", "zech": "Zech", "zechariah": "Zech", "mal": "Mal", "malachi": "Mal",
    "matt": "Matt", "mat": "Matt", "math": "Matt", "matthew": "Matt", "mark": "Mark", "luke": "Luke",
    "john": "John", "acts": "Acts", "act": "Acts", "rom": "Rom", "romans": "Rom", "gal": "Gal",
    "galatians": "Gal", "eph": "Eph", "ephes": "Eph", "ephesians": "Eph", "phil": "Phil",
    "philip": "Phil", "philippians": "Phil", "col": "Col", "colossians": "Col", "tit": "Titus",
    "titus": "Titus", "philem": "Phlm", "philemon": "Phlm", "heb": "Heb", "hebrews": "Heb",
    "jam": "Jas", "james": "Jas", "jas": "Jas", "jude": "Jude", "rev": "Rev", "revelation": "Rev",
    "revelations": "Rev",
}
# "Is." is Isaiah only with its full stop; "Is 40" could be anything.
STRONG_DOTTED = {"is": "Isa"}
# Books that need their number: "1 Sam.", "2Kings", "I Cor.", "l Thess." (an
# OCR "l" for "1").
NUMBERED = {
    "sam": ("1Sam", "2Sam"), "samuel": ("1Sam", "2Sam"), "kings": ("1Kgs", "2Kgs"),
    "kgs": ("1Kgs", "2Kgs"), "chron": ("1Chr", "2Chr"), "chronicles": ("1Chr", "2Chr"),
    "chr": ("1Chr", "2Chr"), "ch": ("1Chr", "2Chr"), "cor": ("1Cor", "2Cor"),
    "corinthians": ("1Cor", "2Cor"), "thess": ("1Thess", "2Thess"), "thes": ("1Thess", "2Thess"),
    "thessalonians": ("1Thess", "2Thess"), "tim": ("1Tim", "2Tim"), "timothy": ("1Tim", "2Tim"),
    "pet": ("1Pet", "2Pet"), "peter": ("1Pet", "2Pet"), "john": ("1John", "2John", "3John"),
}
# Misprints and ambiguous abbreviations: linked only when the quotation
# before them is found in the chapter they would name (and, where there is
# more than one candidate book, in only one of them).
WEAK = {
    "duet": ("Deut",), "dest": ("Deut",), "isiah": ("Isa",), "hosca": ("Hos",), "hahum": ("Nah",),
    "exek": ("Ezek",), "provers": ("Prov",), "pov": ("Prov",), "pro": ("Prov",), "mich": ("Mic",),
    "lex": ("Lev",), "ibum": ("Num",), "jost": ("Josh",), "jos": ("Josh",), "ez": ("Ezra", "Ezek"),
    "jud": ("Judg", "Jude"), "jon": ("Jonah", "John"), "ga": ("Gal",), "hebrew": ("Heb",),
    "is": ("Isa",), "luk": ("Luke",), "joh": ("John",), "psa": ("Ps",), "deu": ("Deut",),
}
WEAK_NUMBERED = {"bor": ("1Cor", "2Cor"), "chon": ("1Chr", "2Chr")}
APOCRYPHA = {"macc", "esdras", "esd", "ecclus", "wisd", "tobit", "tob", "judith", "baruch", "sirach"}
SINGLE_CHAPTER = {osis for osis, n in BOOKS if n == 1}

# "Ps.119", "Gen. 31:49", "Phil.1.1", "2 Tim. 2:24-26", "Acts, 28:14 - 28:30",
# and, in some of the A pages, Roman chapters: "Ps. xxii. 24", "Rom. v".
CITE = re.compile(
    r"(?<![A-Za-z0-9])"
    r"(?:(?P<num>[123]|III|II|I|l)\s?\.?\s?)?"
    r"(?P<book>[A-Z][a-z]+)"
    r"(?P<dot>\.)?\s?,?\s?"
    r"(?:"
    r"(?P<ch>\d{1,3})(?:(?P<colon>:\s?|\.)(?P<v>\d{1,3})(?:\s?-\s?(?:(?P<ch2>\d{1,3}):)?(?P<v2>\d{1,3}))?)?(?![\dA-Za-z])"
    # A Roman chapter, ending the sentence or followed by its verse. Its "l"
    # is sometimes a "1" ("Ps. 1xxxviii"), its first letter sometimes a
    # capital ("Ps. Xcii").
    # It must be set off from the name ("Levi" is not Leviticus 1, nor "See
    # Mall." Malachi 50), and may have a comma before its verse
    # ("Is.xxxviii, 17").
    r"|(?<=[.,\s])(?=[IVXLCivxlc1])(?P<rch>(?:[IVXLC]|1(?=[ivxlc]))?[ivxlc]{0,7})(?<![\s.,])(?=\.|\s*$|\s*<|\s\d|,\s?\d)"
    r"(?:[.,]?\s?(?P<rv>\d{1,3})(?![\d]))?"
    r")"
)
CONTINUE = re.compile(r"(?P<sep>\s?(?:,\s?and|and|,|;)\s)(?P<ch>\d{1,3})(?::\s?(?P<v>\d{1,3}))?(?![\d:.]?\d)")
AFTER_OK = re.compile(r"^(?:\s*$|\s*<|[.,;:)\]]|\s+(?:and|,)\s)")
ROMAN = {"i": 1, "v": 5, "x": 10, "l": 50, "c": 100}


def roman(s: str):
    """A lower-case Roman numeral's value, or None unless it is spelled the
    canonical way ("iiii" and "vx" are not chapter numbers)."""
    total = 0
    for a, b in zip(s, s[1:] + " "):
        n = ROMAN[a]
        total += -n if b != " " and ROMAN[b] > n else n
    n, out = total, ""
    for value, sym in ((100, "c"), (90, "xc"), (50, "l"), (40, "xl"), (10, "x"), (9, "ix"), (5, "v"), (4, "iv"), (1, "i")):
        while n >= value:
            out += sym
            n -= value
    return total if out == s else None


class Scripture:
    def __init__(self):
        self.verses, self.counts = load_kjv()
        self.index = defaultdict(list)
        self.verse_words = {}
        self.by_word = defaultdict(list)
        for (osis, c, v), text in self.verses.items():
            ws = words(text)
            self.index[(osis, c)].append((v, ws))
            self.verse_words[(osis, c, v)] = ws
            for w in ws:
                self.by_word[w].append((osis, c, v))
        self.linked = Counter()
        self.rejected = Counter()
        self.info = Counter()
        self.samples = defaultdict(list)

    def note(self, kind, sample, reject=True):
        (self.rejected if reject else self.linked)[kind] += 1
        if len(self.samples[kind]) < SAMPLES:
            self.samples[kind].append(sample)

    def remark(self, kind, sample):
        """Counted apart from the links: how some of them were read."""
        self.info[kind] += 1
        if len(self.samples[kind]) < SAMPLES:
            self.samples[kind].append(sample)

    def candidates(self, num, book, dotted):
        """(books, weak) for a citation's book name, or (None, reason)."""
        b = book.lower()
        n = {"l": "1", "I": "1", "II": "2", "III": "3"}.get(num, num) if num else None
        if b in APOCRYPHA:
            return None, "apocrypha"
        if n:
            if b in NUMBERED:
                fam = NUMBERED[b]
                i = int(n) - 1
                return ((fam[i],), False) if i < len(fam) else (None, "bad number")
            if b in WEAK_NUMBERED:
                fam = WEAK_NUMBERED[b]
                i = int(n) - 1
                return ((fam[i],), True) if i < len(fam) else (None, "bad number")
            # "2. Eccles 7": a sense number before a book that has none. The
            # scan moves on a character and finds "Eccles 7" by itself.
            return None, None
        if b in NUMBERED and b != "john":
            return None, "book needs its number"
        if b in STRONG:
            return (STRONG[b],), False
        if b in STRONG_DOTTED and dotted:
            return (STRONG_DOTTED[b],), False
        if b in WEAK:
            return WEAK[b], True
        return None, None

    def plausible(self, osis, ch, v, v2, ch2=None):
        if ch < 1 or ch > CHAPTERS[osis]:
            return False
        count = self.counts.get((osis, ch), 0)
        if v is not None and not (1 <= v <= count):
            return False
        if v2 is not None:
            if v is None:
                return False
            if ch2 is None or ch2 == ch:
                return v < v2 <= count
            return ch < ch2 <= CHAPTERS[osis] and 1 <= v2 <= self.counts.get((osis, ch2), 0)
        return True

    def resolve_verse(self, osis, ch, quote):
        """The verse (or pair of verses) of this chapter the quotation comes
        from, if exactly one fits it well."""
        q = words(quote)
        if len(q) < 2:
            return None
        scored = sorted(((len(q & ws) / len(q), v) for v, ws in self.index[(osis, ch)]), reverse=True)
        if not scored:
            return None
        best = scored[0]
        second = scored[1][0] if len(scored) > 1 else 0.0
        if len(q) == 2 and best[0] == 1.0 and second <= 0.5:
            # Two words ("My meat is to do the will of him that sent me"):
            # both in one verse, and no other verse with both.
            return (best[1], None)
        if len(q) > 2 and best[0] >= 0.75 and best[0] - second >= 0.25:
            return (best[1], None)
        if best[0] >= (1.0 if len(q) == 2 else 0.75):
            # Verses that tie once endings are taken off are told apart by
            # the words exactly as quoted: "I subscribed the evidence and
            # sealed it" is Jer 32:10 ("subscribed the evidence, and sealed
            # it"), not 32:44 ("subscribe evidences, and seal them").
            raw = exact_words(quote)
            close = [v for share, v in scored if best[0] - share < 0.25]
            exact = sorted(((len(raw & exact_words(self.verses[(osis, ch, v)])) / len(raw), v) for v in close), reverse=True)
            if len(exact) > 1 and exact[0][0] >= 0.75 and exact[0][0] - exact[1][0] >= 0.25:
                return (exact[0][1], None)
        if len(q) == 2:
            return None
        verse_words = dict(self.index[(osis, ch)])
        pairs = sorted(
            ((len(q & (verse_words[v] | verse_words.get(v + 1, set()))) / len(q), v)
             for v in verse_words if v + 1 in verse_words),
            reverse=True,
        )
        if pairs and pairs[0][0] >= 0.85 and pairs[0][0] - best[0] >= 0.25:
            second_pair = pairs[1][0] if len(pairs) > 1 else 0.0
            if pairs[0][0] - second_pair >= 0.25:
                return (pairs[0][1], pairs[0][1] + 1)
        return None

    def chapter_best(self, q, osis, ch):
        """The largest share of the quotation's words that one verse of the
        chapter, or two verses side by side, holds."""
        d = dict(self.index[(osis, ch)])
        return max((len(q & (ws | d.get(v + 1, set()))) / len(q) for v, ws in d.items()), default=0.0)

    def elsewhere(self, quote, cited):
        """The one verse of the whole Bible, outside the chapter cited, that
        the quotation is plainly taken from: it holds nine tenths or more of
        the quotation's words, a quarter of them more than any other verse
        does, and four words or more in a row as the quotation has them
        (Webster's own wording, "Angels, good or bad", can share every word
        with a verse and still not be a quotation of it). Or None."""
        q = words(quote)
        hits = Counter()
        for w in q:
            for key in self.by_word.get(w, ()):
                hits[key] += 1
        top = hits.most_common(2)
        if not top:
            return None
        (best, n), second = top[0], (top[1][1] if len(top) > 1 else 0)
        if n / len(q) < 0.9 or (n - second) / len(q) < 0.25 or best[:2] == cited:
            return None
        a = re.findall(r"[a-z]+", quote.lower())
        b = re.findall(r"[a-z]+", self.verses[best].lower())
        run = 0
        prev = [0] * (len(b) + 1)
        for i in range(1, len(a) + 1):
            cur = [0] * (len(b) + 1)
            for j in range(1, len(b) + 1):
                if a[i - 1] == b[j - 1]:
                    cur[j] = prev[j - 1] + 1
                    run = max(run, cur[j])
            prev = cur
        return best if run >= 4 else None

    def osis(self, osis, ch, v=None, v2=None, ch2=None):
        if v is None:
            # A whole chapter, as the range the app's parsers already read:
            # "Job.40.1-Job.40.24". Opened, it lands on the first verse.
            return f"{osis}.{ch}.1-{osis}.{ch}.{self.counts[(osis, ch)]}"
        if v2 is None:
            return f"{osis}.{ch}.{v}"
        return f"{osis}.{ch}.{v}-{osis}.{ch2 or ch}.{v2}"

    def resolve(self, books, weak, ch, v, v2, ch2, quote, label, one_or_l=None, need_quote=False):
        """The data-osis for a citation, or None. Also applies the single-
        chapter rule ("Jude 16" is Jude 1:16), and reads a chapter printed
        "1" (`one_or_l="1"`) or as a lone Roman "l" (`one_or_l="l"`) as 1 or
        50, whichever holds the quotation: Webster's Roman "l" often comes
        through the dump as "1", and an OCR "1" as "l"."""
        q = words(quote)
        # Books in which the chapter (and verse) cited exist at all.
        possible = [o for o in books if v is None or self.plausible(o, ch, v, v2, ch2)]
        found = []
        noted = False
        for osis in books:
            c, vv, vv2 = ch, v, v2
            if osis in SINGLE_CHAPTER and vv is None and c > 1:
                c, vv = 1, c
            if one_or_l:
                if CHAPTERS[osis] < 50:
                    c = 1
                else:
                    h1, h50 = self.resolve_verse(osis, 1, quote), self.resolve_verse(osis, 50, quote)
                    if h50 and not h1:
                        c = 50
                        self.remark('chapter printed "1" or "l", read as 50 (a Roman "l") from the quotation',
                                    f"{label} -> {osis} 50")
                    elif h1 or one_or_l == "1":
                        c = 1
                    else:
                        self.note('lone Roman "l" in a book of fifty chapters or more, quotation in neither 1 nor 50',
                                  label)
                        noted = True
                        continue
            if not self.plausible(osis, c, vv, vv2, ch2):
                continue
            if need_quote and not self.resolve_verse(osis, c, quote):
                continue
            if vv is None:
                hit = self.resolve_verse(osis, c, quote)
                if hit:
                    found.append((osis, c, hit[0], hit[1], None, "found"))
                elif not weak:
                    other = self.elsewhere(quote, (osis, c)) if len(q) >= 3 and self.chapter_best(q, osis, c) < 0.6 else None
                    found.append((osis, c, None, None, None, ("elsewhere", other) if other else "chapter"))
                continue
            if weak and len(possible) > 1:
                # "Ez. 8:5": Ezra or Ezekiel. Only the quotation can tell.
                # ("Ez.xxiii.35" can only be Ezekiel.)
                hit = self.resolve_verse(osis, c, quote)
                if not hit or not (hit[0] <= vv <= (hit[1] or hit[0]) or vv <= hit[0] <= (vv2 or vv)):
                    continue
            if len(q) >= 3:
                # The verse cited against the quotation printed before it:
                # a sense number read as a verse ("Ps.119.8. To set up"),
                # Webster's two chapters read as chapter and verse
                # ("Matt.18.25."), or the dump's garbled figures.
                # Only a verse that shares at most one of the quotation's
                # words is doubted: Webster's definition before a quotation
                # ("as carnal ordinances. Heb. 9:10") dilutes the rest.
                last = vv2 if vv2 is not None and ch2 in (None, c) else vv
                shared = max(len(q & self.verse_words.get((osis, c, x), set())) for x in range(max(1, vv - 1), last + 2))
                if shared <= 1:
                    hit = self.resolve_verse(osis, c, quote)
                    if hit:
                        found.append((osis, c, hit[0], hit[1], None, "corrected"))
                        continue
                    best = self.chapter_best(q, osis, c)
                    other = self.elsewhere(quote, (osis, c)) if best < 0.6 else None
                    if other:
                        found.append((osis, c, vv, vv2, ch2, ("elsewhere", other)))
                        continue
                    if best >= 0.6:
                        found.append((osis, c, None, None, None, "downgraded"))
                        continue
            found.append((osis, c, vv, vv2, ch2, "cited"))
        if len(found) != 1:
            if noted and not found:
                pass
            elif need_quote and not found:
                self.note("capital Roman numeral after an unabbreviated name, quotation not in that chapter", label)
            elif weak and len(found) == 0:
                self.note("misprinted or ambiguous abbreviation, quotation not found", label)
            elif len(found) > 1:
                self.note("ambiguous book", label)
            else:
                self.note("chapter or verse out of range", label)
            return None
        osis, c, vv, vv2, cc2, how = found[0]
        if isinstance(how, tuple):
            o, oc, ov = how[1]
            self.note("quotation not in the chapter cited but plainly in another verse: not linked",
                      f"{label} [{quote.strip()[-60:]}] is {o} {oc}:{ov}")
            return None
        target = self.osis(osis, c, vv, vv2, cc2)
        kinds = {
            "found": "chapter cited, verse found from the quotation",
            "chapter": "chapter cited, linked to the whole chapter",
            "cited": "chapter and verse cited",
            "corrected": "verse cited is not the quotation's; the verse of that chapter that is, linked instead",
            "downgraded": "verse cited is not the quotation's; linked to the whole chapter",
        }
        shown = f"{label} [{quote.strip()[-50:]}] -> {target}" if how in ("corrected", "downgraded") else f"{label} -> {target}"
        self.note(kinds[how], shown, reject=False)
        return target

    def link(self, para: str, carry: str = "") -> str:
        """Wraps the Scripture citations in one paragraph of clean HTML.
        `carry` is the paragraph before, for a citation printed on a line of
        its own under its quotation ("Every moving thing that liveth, shall
        be meat for you." / "Gen.9.")."""
        out = []
        pos = 0
        quote_from = 0
        at = 0
        while (m := CITE.search(para, at)) is not None:
            # A capitalised word and a number that is not a citation ("God.
            # 1 Pet.4") must not swallow the start of the one that is.
            at = m.start() + 1
            seg = para[m.start():m.end()]
            if "<" in seg or ">" in seg or para.rfind("<", 0, m.start()) > para.rfind(">", 0, m.start()):
                continue
            books, why = self.candidates(m.group("num"), m.group("book"), bool(m.group("dot")))
            label = seg.strip()
            context = f"{label}  [{plain(para[max(0, m.start() - 50):m.end() + 12])}]"
            if books is None:
                if why:
                    # A book, but not one to link: the next search starts
                    # after it, so "1 Macc.4" is not tried again as "Macc.4".
                    self.note(why, context)
                    at = m.end()
                continue
            at = m.end()
            weak = why
            one_or_l = None
            need_quote = False
            if m.group("rch"):
                if m.group("rch")[0].isupper() and not m.group("dot"):
                    # "Gen. I." is Genesis 1; "James I." and "James II" are
                    # kings. "Luke I." is linked only if the quotation
                    # before it is found in that chapter.
                    need_quote = True
                ch = roman(m.group("rch").replace("1", "l").lower())
                if ch is None:
                    self.note("not a Roman numeral", context)
                    continue
                if m.group("rch").lower() == "l":
                    one_or_l = "l"
                v = int(m.group("rv")) if m.group("rv") else None
                v2 = ch2 = None
            else:
                ch = int(m.group("ch"))
                v = int(m.group("v")) if m.group("v") else None
                v2 = int(m.group("v2")) if m.group("v2") else None
                ch2 = int(m.group("ch2")) if m.group("ch2") else None
                if ch == 1 and v is None:
                    one_or_l = "1"
            # "Ps. 23 seems to signify" is prose. A chapter-and-verse with a
            # colon ("In Job 15:27 it seems") is a citation wherever it stands.
            if not AFTER_OK.match(para[m.end():]) and not ((m.group("colon") or "").startswith(":") and not weak):
                self.note("not followed by punctuation", context)
                continue
            if re.search(r"(?:King|king|reign of|Pope|Stat\.|statute|Statute)\s*$", para[max(0, m.start() - 12):m.start()]):
                self.note("a king or a statute, not a book", context)
                continue
            quote = plain(para[quote_from:m.start()])
            if quote_from == 0 and not words(quote):
                quote = carry
            quote = re.sub(r"^\s*\d+\.\s*", "", quote)
            target = self.resolve(books, weak, ch, v, v2, ch2, quote, label, one_or_l, need_quote)
            if not target:
                # The next citation's quotation starts after this one, linked
                # or not ("Shut up the words, and seal the book. Daniel 11.
                # Isaiah 8.": the words are not Isaiah's).
                quote_from = m.end()
                continue
            osis = target.split(".")[0]
            out.append(para[pos:m.start()])
            out.append(f'<a class="scripref" data-osis="{target}">{seg}</a>')
            pos = at = quote_from = m.end()
            # "Jer. 9 and 23.", "Lev. 18:23, 20:12." -- more of the same book.
            while True:
                c = CONTINUE.match(para, pos)
                if not c or not AFTER_OK.match(para[c.end():]):
                    break
                cch = int(c.group("ch"))
                cv = int(c.group("v")) if c.group("v") else None
                if v is not None and cv is None:
                    break  # "18:23, 24" -- a verse or a chapter? Left alone.
                sub = self.resolve((osis,), False, cch, cv, None, None, "", f"{label}{c.group(0)}")
                if not sub:
                    break
                out.append(para[pos:c.start("ch")])
                out.append(f'<a class="scripref" data-osis="{sub}">{para[c.start("ch"):c.end()]}</a>')
                pos = at = quote_from = c.end()
        out.append(para[pos:])
        return "".join(out)


# --------------------------------------------------------------------------
# Building the entries


# Endings that make a headword-only row a spelling of the entry its
# `content` runs on to, when the dump has that entry's text: AMONG and
# AMONGST, TOWARD and TOWARDS, BRONZ and BRONZE, AGAL'LOCH and AGALLOCHUM,
# FORGOT and FORGOTTEN. Endings that make another part of speech (-ed, -ly,
# -er, -en: HEIGHT is not HEIGHTEN) are not among them.
ALIAS_TAILS = {"s", "st", "e", "a", "um", "us", "on", "o", "la", "y", "ment", "te", "n", "ten", "den"}


def related(a: str, b: str) -> bool:
    """Whether headword `a` is plausibly another spelling of `b`."""
    if is_variant(a, b) or is_variant(b, a):
        return True
    if b.startswith(a) and b[len(a):] in ALIAS_TAILS:
        tail = b[len(a):]
        if tail == "y":  # AL'VEOLAR, AL'VEOLARY; not TRICK'ER, TRICK'ERY
            return a.endswith(("ar", "or", "graph"))
        if tail == "on":  # TRIS'PAST, TRISPAS'TON; not MANA'TI, MANA'TION
            return a[-1] not in "aeiou"
        return not (tail == "a" and a.endswith("ic")) and not (tail == "n" and a.endswith("a"))
    if b.startswith(a) and b[len(a):] == "al" and a.endswith(("ac", "oid")):
        return True
    # ANAS'TROPHE and ANAS'TROPHY, ANEM'ONE and ANEM'ONY.
    return len(a) > 4 and a[:-1] == b[:-1] and {a[-1], b[-1]} == {"e", "y"}


def containment(ws: set, other: set) -> float:
    return len(ws & other) / len(ws) if ws else 0.0


POS_WORD = re.compile(
    r"\s*,?\s*(?:v\.\s?t\.?|v\.\s?i\.?|n\.\s?plu\.|n\.|a\.|adv\.|ppr\.|pp\.|pret\.|prep\.|conj\.|pron\.|exclam\.)"
    r"\s*([a-z'`]+)"
)


SAMPLES = 8  # examples kept per kind for the report


def build(rows, scripture):
    stats = Counter()
    samples = defaultdict(list)

    def sample(kind, text, n=1):
        stats[kind] += n
        if len(samples[kind]) < SAMPLES:
            samples[kind].append(text)

    rows = sorted(rows, key=lambda r: r[0])
    by_id = {r[0]: r for r in rows}
    ids = [r[0] for r in rows]
    position = {rid: i for i, rid in enumerate(ids)}
    per_row = {}
    for r in rows:
        per_row[r[0]] = sections_from_paras(r[0], string_paras(r[3]), r[1])

    # What `string` has, by key: text found here is not taken again from
    # `content`, where the same words are rendered differently.
    by_key = defaultdict(list)
    for rid in ids:
        for s in per_row[rid]:
            if not s.is_stub():
                by_key[s.key()].append(s)
    word_cache = {}

    def swords(s):
        k = id(s)
        if k not in word_cache:
            word_cache[k] = words(s.text_key())
        return word_cache[k]

    def in_string(key, ws, pos=None, exclude=None):
        """The `string` section filed under this key that holds at least
        half of these words, if any."""
        best = None
        for s in by_key.get(key, []):
            if s is exclude or (pos is not None and s.pos != pos):
                continue
            c = containment(ws, swords(s))
            if c >= 0.5 and (best is None or c > best[0]):
                best = (c, s)
        return best[1] if best else None

    def content_sections(r, forms):
        return sections_from_paras(r[0], content_paras(r[6], forms), r[1], source="content")

    def near(rid, section_rid, span=4):
        return abs(position[rid] - position[section_rid]) <= span

    def beside_plural(rid, stub):
        """A headword in -ward left out for want of text, next to its form
        in -wards (TO'WARD beside TO'WARDS, which Webster prints as one
        entry), is kept as an alias of that. Other endings in -s make other
        words (PROCEED is not PROCEEDS, HARMON'IC not HARMON'ICS)."""
        a = stub.key()
        if not a.endswith("ward"):
            return
        for j in range(max(0, position[rid] - 4), min(len(ids), position[rid] + 5)):
            for s in per_row[ids[j]]:
                if s.key() == a + "s" and not s.is_stub():
                    s.aliases.add(a)
                    sample("of those left out, kept as an alias of the same word in -wards beside it",
                           f"{stub.printed} -> {s.printed}")
                    return

    # A headword printed on its own inside a row, right before another
    # ("DECLI'VOUS, / DECLIV'ITOUS, a. Gradually descending"), is a spelling
    # printed with it: joined to it as the cross-row ones are below.
    for rid in ids:
        secs = per_row[rid]
        own = [s for s in secs if s.own]
        if not secs or all(s.is_stub() for s in own or secs[:1]):
            continue
        out = []
        for i, s in enumerate(secs):
            nxt = secs[i + 1] if i + 1 < len(secs) else None
            if s.is_stub() and nxt is not None and not nxt.is_stub() and nxt.key() != s.key():
                nxt.add_prefix(s.printed, s.forms, first=True)
                sample("headword printed before another in the same row: joined to it", f"{s.printed} + {nxt.printed}")
                continue
            out.append(s)
        per_row[rid] = out

    # Headword-only rows: `string` stops after the headword. `content` tells
    # them apart: a spelling printed before the headword that carries the
    # definition ("ADVERT'ENCE," then "ADVERT'ENCY, n. A direction..."), a
    # headword whose own definition the dump has lost (AFFECT'OR, whose
    # `content` runs on into AFFECT'UOUS), an entry whose definition only
    # `content` kept (DEAD, DAY, CHAMBER), and a heading with nothing behind it
    # in either rendering.
    for r in rows:
        rid = r[0]
        secs = per_row[rid]
        own = [s for s in secs if s.own]
        if secs and not all(s.is_stub() for s in own or secs[:1]):
            continue
        stub = (own or secs[:1] or [None])[0]
        rest_secs = [s for s in secs if not s.is_stub()]
        per_row[rid] = rest_secs
        if stub is None:
            continue
        if not content_usable(r):
            sample("headword only, nothing in either rendering: left out", r[1])
            beside_plural(rid, stub)
            continue
        a = stub.key()
        chained = content_chain(r[6], stub.forms[0])
        if chained:
            b = lookup_key(chained)
            csecs = content_sections(r, stub.forms + [STRESS.sub("", chained)])
            # The headword's own later homographs, if `content` has them
            # ("PATHET'IC, / PATHET'ICAL, a. ... / PATHET'IC, n. Style or
            # manner adapted to awaken the passions"), are kept whatever
            # becomes of the first.
            for c in csecs[1:]:
                if c.key() == a and c is not csecs[0] and not c.is_stub() and not in_string(a, words(c.text_key()), c.pos):
                    c.own = True
                    per_row[rid].append(c)
                    sample("homograph `string` lacks, taken from `content`", f"{c.printed}, {c.pos}")
            between = []
            if csecs and b in [lookup_key(f) for f in csecs[0].forms[1:]]:
                # "HER'ETOG, HEREUNTO / adverb To this."
                chain_secs = [] if csecs[0].is_stub() else [csecs[0]]
                for c in chain_secs:
                    c.printed, c.forms = chained, [STRESS.sub("", chained)]
            else:
                seq = csecs[1:] if csecs and csecs[0].key() == a else csecs
                i = 0
                while i < len(seq) and seq[i].is_stub():
                    between.append(seq[i])  # "CHAMPAIGN," on its way to "CHAMPAIN, n."
                    i += 1
                if i < len(seq):
                    b = seq[i].key()
                chain_secs = [c for c in seq[i:] if c.key() == b and not c.is_stub()]
            between = [x.key() for x in between if x.key() not in (a, b)]
            direct = not between
            # Headwords printed on lines of their own between this one and
            # the definition are spellings of the entry defined, if they
            # look like it (CHAMPAIGN before CHAMPAIN).
            between = [x for x in between if related(x, b) or (x[:5] == b[:5] and abs(len(x) - len(b)) <= 2)]
            # Each homograph `content` gives under that headword, and the
            # `string` copy of it, if the dump has one.
            found = [(c, in_string(b, words(c.text_key()), c.pos)) for c in chain_secs]
            target = next((t for _, t in found if t is not None), None)
            missing = [c for c, t in found if t is None]
            if not chain_secs:
                # Nothing but headwords: the entry the chain ends in, if the
                # rows nearby have it.
                target = next((s for s in by_key.get(b, []) if near(rid, s.row_id)), None)
            if target is not None:
                target.aliases.update(between)
                if is_variant(a, b) and near(rid, target.row_id):
                    target.add_prefix(stub.printed, stub.forms)
                    sample("variant printed before its headword: joined to it", f"{stub.printed} + {target.printed}")
                elif related(a, b) or (direct and not near(rid, target.row_id, 40)) or (b == a + "en" and target.pos == "n."):
                    # A spelling printed with the entry (AMONG with AMONGST,
                    # PAN'DIT with PUN'DIT, HAND'MAID with HAND'MAIDEN, but
                    # not HEIGHT with the verb HEIGHTEN) that the dump files
                    # only under the other spelling.
                    target.aliases.add(a)
                    sample("spelling printed with another entry: kept as an alias of it", f"{stub.printed} -> {target.printed}")
                else:
                    sample("headword whose definition the dump has lost (`content` runs on into the next entry): left out",
                           f"{stub.printed} -> {chained}")
                    beside_plural(rid, stub)
                # What `content` has of that entry beyond its `string` copy.
                for j, c in enumerate(missing):
                    c.own = True
                    # Placed after that entry's own homographs, not before.
                    c.order = (position[target.row_id], 10 ** 6 + j)
                    per_row[rid].append(c)
                    sample("homograph `string` lacks, taken from another row's `content`", f"{c.printed}, {c.pos}")
                continue
            if not chain_secs:
                sample("headword only, `content` has only further headwords: left out", f"{stub.printed} -> {chained}")
                continue
            first = chain_secs[0]
            respelling = POS_WORD.match(plain(first.rest))
            respelled = bool(respelling) and lookup_key(respelling.group(1)) == b
            far = direct and all(not near(rid, s.row_id, 40) for s in by_key.get(b, []))
            if respelled or (b in by_key and far and not related(a, b) and not related(b, a)):
                # "BUILD, / BILD, v.t. bild; pret. built" and "ISLE, / ILE,
                # n. ile. [L. insula.]": the second is Webster's respelling
                # of the first. "BENZOIN', / BEN'JAMIN, n." and "GUN'WALE,
                # / GUN'NEL, n.", whose other spelling the dump files far off
                # with other text, and "CANNONEER, / CANINE, n. A man who
                # manages cannon", the dump's misreading. The definition is
                # the headword's own.
                for c in chain_secs:
                    c.printed, c.forms, c.fragments = stub.printed, stub.forms, stub.fragments
                    c.own = True
                per_row[rid] = rest_secs + chain_secs
                sample("definition only `content` keeps, under a respelled or misread heading: kept under the headword",
                       f"{stub.printed} / {chained}")
                continue
            if b in by_key and not related(a, b) and not related(b, a):
                # The next entry (BAF'TAS, then BAG), whose text in `content`
                # differs from its own row's: neither is certain.
                sample("headword whose definition the dump has lost, `content` running on into a different text of "
                       "the next entry: both left out", f"{stub.printed} -> {chained}")
                continue
            # The definition belongs to the headword `content` runs on to,
            # and the dump has it nowhere else ("BA'ILER, / BA'ILIFF, n.", no
            # row holding BAILIFF; "E'VEN, / EVE, n. e'vn. The decline of the
            # sun", EVE's own row having only Adam's wife): filed under that
            # headword.
            for c in chain_secs:
                c.own = True
                c.aliases.update(between)
                if is_variant(a, b):
                    c.add_prefix(stub.printed, stub.forms)
                elif related(a, b) or related(b, a):
                    c.aliases.add(a)
            per_row[rid] = rest_secs + chain_secs
            sample("definition only `content` keeps, filed under the headword it runs on to", f"{stub.printed} -> {chained}")
            continue
        forms = stub.forms
        keys = {lookup_key(f) for f in forms} | {lookup_key(r[1] or "")}
        fallback = [c for c in content_sections(r, forms) if not c.is_stub()]
        fallback = [c for c in fallback if c.key() in keys or c.own]
        kept, aliased = [], False
        for c in fallback:
            if in_string(c.key(), words(c.text_key()), c.pos):
                continue
            # "THEREABOUT', THEREABOUTS', adv.", whose text `string` has
            # under THEREABOUTS: an alias of that, not a second copy.
            other = next((t for f in c.forms[1:] if (t := in_string(lookup_key(f), words(c.text_key()), c.pos))), None)
            if other is not None:
                other.aliases.add(a)
                aliased = other
                continue
            kept.append(c)
        fallback = kept
        if fallback:
            for c in fallback:
                c.own = True
            sample("headword-only row: definition taken from `content`", r[1])
            per_row[rid] = rest_secs + fallback
        elif aliased:
            sample("spelling printed with another entry: kept as an alias of it", f"{stub.printed} -> {aliased.printed}")
        else:
            sample("headword only, nothing in either rendering: left out", r[1])
            beside_plural(rid, stub)

    # Rows whose `string` stops short: a heading line with no definition
    # (DEATH, n. deth.), the first homograph only (RE'PENT, a. Creeping, and
    # not REPENT', v.i.), or the first few senses (FATHER). What `content`
    # has beyond it, and the dump has nowhere else, is added from there.
    for r in rows:
        rid = r[0]
        secs = per_row[rid]
        if not content_usable(r) or not secs or any(s.source == "content" for s in secs):
            continue
        own_s = [s for s in secs if s.own]
        forms = (own_s or secs)[0].forms
        csecs = [c for c in content_sections(r, forms) if c.own]
        if not csecs:
            continue
        used = set()
        out = list(secs)
        anchor = out.index(own_s[0]) - 1 if own_s else len(out) - 1
        for c in csecs:
            cw = words(" ".join([c.rest] + c.body[:2]))
            same = [s for s in own_s if id(s) not in used and s.key() == c.key()]
            s = next((s for s in same if s.pos == c.pos), None)
            if s is None:
                s = next((s for s in same if containment(cw, swords(s)) >= 0.5), None)
            if s is not None:
                used.add(id(s))
                anchor = out.index(s)
                fill_from_content(s, c, by_key, swords, sample)
                continue
            if c.is_stub() or len(words(c.text_key())) < 2:
                continue
            if in_string(c.key(), words(c.text_key()), c.pos):
                continue
            c.own = True
            anchor += 1
            out.insert(anchor, c)
            sample("homograph `string` lacks, taken from `content`", f"{c.printed}, {c.pos}")
        for i, s in enumerate(out):
            s.index = i
        per_row[rid] = out

    stats["rows whose `content` supplies text their `string` lacks"] = len(
        {rid for rid in ids for s in per_row[rid] if s.source == "content" or s.from_content})

    # Every section, in dictionary order; then identical and truncated copies
    # dropped.
    sections = []
    for rid in ids:
        for s in per_row[rid]:
            if s.is_stub():
                sample("headword-only headings run on into other rows: dropped", s.printed)
                continue
            sections.append(s)
    groups = defaultdict(list)
    for s in sections:
        # By the section's own first headword, so that a copy with a variant
        # joined in front (DECLI'VOUS, DECLIV'ITOUS) and one without
        # (DECLIV'ITOUS) are seen to be the same.
        groups[(lookup_key(s.forms[0]), s.pos)].append(s)
    keep = []
    for (key, pos), group in groups.items():
        kept = []
        for s in group:
            t = s.text_key()
            dup = None
            for k in kept:
                kt = k.text_key()
                if t == kt or kt.startswith(t) or (len(t) > 40 and t in kt):
                    dup = k
                    break
                if t.startswith(kt) or (len(kt) > 40 and kt in t):
                    # The later copy is the fuller one; keep its text in the
                    # earlier one's place.
                    k.take(s)
                    dup = k
                    break
            if dup is None:
                kept.append(s)
            else:
                stats["duplicate or truncated copies merged"] += 1
                dup.forms = dup.forms if len(dup.forms) >= len(s.forms) else s.forms
                dup.aliases |= s.aliases
                dup.prefix = dup.prefix or s.prefix
        keep.extend(kept)
    keep.sort(key=lambda s: getattr(s, "order", None) or (position[s.row_id], s.index))

    # Aliases: the other headwords printed with this one ("ABAS'SI, or
    # ABAS'SIS"), where the dump itself files the same text under them too,
    # or where they were joined on above; a second spelling printed as a
    # fragment and written out ("OP'TIC, 'TICAL" gives `optical`); and
    # headword-only rows kept as spellings of this entry. A heading the dump
    # garbled ("VICE-CH'AMBERLAIN,CHAMBERLAIN") does not make CHAMBERLAIN an
    # alias.
    filed = defaultdict(set)
    for r in rows:
        filed[r[3]].add(lookup_key(r[1] or ""))
    entries = []
    for s in keep:
        forms = s.all_forms()
        key = lookup_key(forms[0])
        here = filed[by_id[s.row_id][3]]
        aliases = []
        for f in forms[1:]:
            k = lookup_key(f)
            if k == key or k in aliases or not re.fullmatch(r"[a-z][a-z' -]*[a-z]", k):
                continue
            if s.prefix or k in here or s.fragments.get(k) in here:
                aliases.append(k)
            else:
                stats["printed spellings not kept as aliases (the dump does not file them)"] += 1
        for k in sorted(s.aliases):
            if k != key and k not in aliases:
                aliases.append(k)
        paras = [s.heading_html()] + [f"<p>{p}</p>" for p in s.body]
        linked = []
        for i, p in enumerate(paras):
            prev = linked[-1] if i > 1 else ""
            carry = plain(prev) if prev and "scripref" not in prev else ""
            linked.append(scripture.link(p, carry))
        html = "".join(linked)
        # Plain text for search, a line per paragraph, the headword without
        # its accent marks so that "ABAS'SI" is found as "abassi".
        text_head = STRESS.sub("", ", ".join([p for p, _ in s.prefix] + [s.printed]))
        text_paras = [text_head + plain(re.sub(r"^<p><b>.*?</b>", "", linked[0]))] + [plain(p) for p in linked[1:]]
        text = "\n".join(re.sub(r"\s+", " ", t).strip() for t in text_paras)
        entry = {"word": display(forms[0]), "key": key, "pos": s.pos, "html": html, "text": text}
        if aliases:
            entry["aliases"] = aliases
        if s.source == "content":
            entry["from"] = "content"
        elif s.from_content:
            entry["from"] = "string+content"
            entry["content_paras"] = sorted(i + 1 for i in s.from_content)
        entries.append(entry)
    return entries, stats, samples


# Book names and their abbreviations, as `words` gives them: left out when
# a paragraph of `content` is looked for in `string`.
BOOK_WORDS = None


def text_words(text: str) -> set[str]:
    global BOOK_WORDS
    if BOOK_WORDS is None:
        names = set(STRONG) | set(NUMBERED) | set(WEAK) | set(STRONG_DOTTED) | {
            "samuel", "kings", "chronicles", "corinthians", "thessalonians", "timothy", "peter", "revelation",
            "lamentations", "song", "solomon", "philippians", "colossians", "galatians", "ephesians", "hebrews"}
        BOOK_WORDS = set().union(*(words(n) for n in names))
    return words(text) - BOOK_WORDS


def norm_text(text: str) -> str:
    """A paragraph's words in order, lower case, book names and figures left
    out: "Absent from one another. Gen. 31:49." and the site's "Absent from
    one another. Genesis 31." are the same."""
    text_words("")  # sets BOOK_WORDS
    return " ".join(t for t in re.findall(r"[a-z]+", plain(text).lower()) if stem(t) not in BOOK_WORDS)


def fill_from_content(s, c, by_key, swords, sample):
    """Adds to a `string` section the paragraphs its `content` counterpart
    has and it lacks, each after the paragraph `content` has before it."""
    if s.is_stub():
        # The headword alone: the whole entry is `content`'s.
        s.rest, s.body, s.pos, s.source = c.rest, list(c.body), c.pos, "content"
        s.from_content = set()
        sample("headword-only homograph inside a row: definition taken from `content`", s.printed)
        return
    # `string`'s paragraphs, its heading line first, and `content`'s,
    # walked side by side. A `content` paragraph is present when one of the
    # next few `string` paragraphs holds six tenths of its words (all of
    # them, if it has three or fewer; common words and book names aside,
    # since the site spells "Gen." out as "Genesis"; the walk moves on to
    # it), when any other one holds three quarters, when the few around the
    # walk's place hold six tenths of them together (the site joins and
    # splits lines differently), or when another `string` copy of the entry
    # holds them.
    # Words found only scattered over the whole section do not count: the
    # senses `string` lacks reuse its vocabulary ("HOLY SPIRIT, the third
    # person in the Trinity" after SPIRIT's twenty-one senses).
    plist = [text_words(s.rest)] + [text_words(p) for p in s.body]
    have = set().union(*plist)
    elsewhere = set()
    for o in by_key.get(s.key(), []):
        if o is not s and o.pos == s.pos:
            elsewhere |= swords(o)
    ws = [text_words(p) for p in c.body]
    flags, anchors = [], []
    last = 0
    texts = [norm_text(s.rest)] + [norm_text(p) for p in s.body]
    joined, starts = "", []
    for x in texts:
        starts.append(len(joined))
        joined += " " + x
    joined += " "
    for p, w in zip(c.body, ws):
        t = norm_text(p)
        # Also across `string`'s line breaks ("And therefore it was imputed
        # to him for" / "righteousness. Rom.4.").
        at = joined.find(f" {t} ") if len(t) >= 8 else -1
        exact = [max(i for i, st in enumerate(starts) if st <= at)] if at >= 0 else []
        if exact:
            # The same words in the same order: present, whatever its length.
            last = max(last, exact[0]) if exact[0] < last + 7 else last
            flags.append(True)
            anchors.append(last)
            continue
        if len(w) <= 2 and not (w - have):
            # Two words or fewer, all in the section already ("To sit
            # down,", "[Not in use.]"): decided by a neighbour, below.
            flags.append(None)
            anchors.append(last)
            continue
        need = 1.0 if len(w) <= 3 else 0.6
        ahead = [i for i in range(last, min(len(plist), last + 7)) if containment(w, plist[i]) >= need]
        if ahead:
            last = ahead[0]
            present = True
        else:
            window = set().union(*plist[max(0, last - 1): last + 4])
            present = (any(containment(w, x) >= max(need, 0.75) for x in plist)
                       or (len(w) >= 5 and containment(w, window) >= 0.6) or containment(w, elsewhere) >= need)
            if not present:
                # A spelling the site changed ("halbert", "halberd").
                present = any(difflib.SequenceMatcher(None, t, x, autojunk=False).ratio() >= 0.85
                              for x in texts[max(0, last - 1): last + 7] if x)
        flags.append(present)
        anchors.append(last)
    # A short paragraph that leads into the next (ends in a comma or colon)
    # goes with it; any other goes with the one before.
    for i in range(len(flags) - 1, -1, -1):
        if flags[i] is None and re.search(r"[,:]\s*$", plain(c.body[i])) and i + 1 < len(flags) and flags[i + 1] is not None:
            flags[i] = flags[i + 1]
    for i in range(len(flags)):
        if flags[i] is None:
            flags[i] = flags[i - 1] if i else True
    after = defaultdict(list)
    for p, present, anchor in zip(c.body, flags, anchors):
        if not present:
            after[anchor - 1].append(p)
    para_words = plist[1:]
    if not after:
        return
    body, added = [], set()
    for p in after[-1]:
        added.add(len(body))
        body.append(p)
    for i, p in enumerate(s.body):
        body.append(p)
        for q in after[i]:
            added.add(len(body))
            body.append(q)
    # `string` cut off in the middle of its last paragraph: the whole of it,
    # from `content`, replaces the stump.
    n = len(s.body)
    if s.body and after.get(n - 1):
        stump = norm_text(s.body[-1])
        full = norm_text(after[n - 1][0])
        if len(stump) >= 8 and full.startswith(stump) and len(full) > len(stump):
            i = n  # the stump's place in `body`, the first added paragraph after it
            while body[i] is not after[n - 1][0]:
                i += 1
            del body[i - 1]
            added = {j - 1 if j >= i else j for j in added}
            sample("last paragraph cut off in `string`: taken whole from `content`", s.printed)
    s.body = body
    s.from_content = added
    sample("paragraphs `string` lacks, taken from `content`", f"{s.printed}, {s.pos}", len(added))


# Slips in the dump's text, put right by hand: (key, part of speech, as the
# dump has it, as Webster printed it). Each must be found exactly once in its
# entry, in the HTML and in the text alike, or the build stops -- so a fix
# cannot go quietly stale, nor change more than it names. A clause the dump
# says twice (CHARITY, the word card's entry for 1 Corinthians 13, among
# them), a letter lost ("window" for "widow"), a space lost after a comma, a
# finger on the next key, and "form" for "from" (FORM_FOR_FROM, below).
CORRECTIONS = [
    ("charity", "n.", "their fellow men to think favorably of their fellow men,", "their fellow men,"),
    ("cane", "n.", "belonging to several species of plants belonging to different", "belonging to different"),
    ("extreme", "n.", "is equal contained by the extremes is equal to", "is equal to"),
    ("queen-dowager", "n.", "The window of a king.", "The widow of a king."),
    ("prevenient", "a.", "hence,preventive", "hence, preventive"),
    # Slips of a finger to the next key, "/" for "." among them (as SPARE's,
    # in SOURCE_TYPOS): the reference Webster gives, "See Stupefactive."
    ("obstupefactive", "a.", "See Sti[efactove/]", "See Stupefactive.]"),
    # A slash left after the fraction: "the Spanish coin of 12 1/2 cents".
    ("shilling", "n.", "coin of 12 1/2/ cents", "coin of 12 1/2 cents"),
    # "r" for "f": SHRANK is the preterit of shrink, as SHRUNK beside it says.
    ("shrank", "pret.", "pret. or ", "pret. of "),
]

# "form" typed for "from", the two letters swapped: JUSTIFY's theological
# sense, "to pardon and clear form guilt", and a hundred and ten more
# places where the sense can only be "from" -- "so called form his tarred
# clothes", "to travel form place to place", "distinct form his physical
# powers", and in etymologies, "[L. tepidus, form tepeo, to be warm.]",
# "[form pot.]". Found by reading every "form" after a word that takes
# "from" (called, named, distinct, separate, free, clear, proceeds,
# obtained, imported...), before a pronoun, article, number or proper
# name, and inside an etymology's brackets; none of the uses of the noun or
# the verb ("of a different form", "these berries form a sauce", "[Gr.
# form.]" for the Greek word's meaning) is here. Each phrase is as the dump
# has it, and its "form" becomes "from".
FORM_FOR_FROM = [
    ("brachial", "a.", "brachium, form the Celtic"),
    ("bring", "v.t.", "to clear form condemnation"),
    ("conics", "n.", "which arise form its sections"),
    ("consecration", "n.", "separating form a common"),
    ("converted", "pp.", "turned form one religion"),
    ("craw-fish", "n.", "contracted form crab"),
    ("crotchet", "n.", "distinguished form the rest"),
    ("dissuasive", "a.", "divert form a measure"),
    ("distill", "v.t.", "spirit form melasses"),
    ("distinguish", "v.t.", "vice form virtue"),
    ("dormant", "a.", "so called form a beam"),
    ("draw", "v.t.", "To draw form or away"),
    ("draw", "v.t.", "a liquid form the body"),
    ("estrange", "v.t.", "estranged ourselves form them"),
    ("hamper", "n.", "contracted form hanaper"),
    ("hellenic", "a.", "or form Hellen."),
    ("hotbed", "n.", "defend it form the cold air"),
    ("inclusive", "a.", "as form Monday to Saturday"),
    ("indefensibility", "n.", "[form indefensible.]"),
    ("insolvent", "a.", "debtor form imprisonment"),
    ("instep", "n.", "reaches form the ham"),
    ("instrumental", "a.", "distinguished form vocal music"),
    ("journey", "n.", "Passage form one place"),
    ("journey", "v.i.", "To travel form place to place"),
    ("justify", "v.t.", "clear form guilt"),
    ("jut-window", "n.", "projects form the line"),
    ("mallow", "n.", "so called form its emollient"),
    ("manufactured", "pp.", "Made form raw materials"),
    ("metastasis", "n.", "a disease form one part"),
    ("milliner", "n.", "Milaner, form Milan"),
    ("minuend", "n.", "the number form which"),
    ("monodon", "n.", "is form sixteen"),
    ("moral", "a.", "distinct form his physical powers"),
    ("moral", "a.", "result form his social relations"),
    ("morality", "n.", "motives form which they proceed"),
    ("morbid", "a.", "morbidus, form morbus"),
    ("morsel", "n.", "bite, form mordeo"),
    ("most", "n.", "resulted form the omission"),
    ("mughouse", "n.", "[form mug.]"),
    ("multitude", "n.", "multitudo, form multus"),
    ("non-observance", "n.", "a license form the king"),
    ("patriot", "n.", "country, form pater"),
    ("pec-cary", "n.", "an orifice form which"),
    ("pedestrian", "a.", "pedestris, form pes"),
    ("pedicle", "n.", "pediculus, form pes"),
    ("pediculous", "a.", "pedicularis, form pediculus"),
    ("pension", "n.", "pensio, form pendo"),
    ("ponent", "a.", "ponens, form pono"),
    ("portico", "n.", "porticus, form porta"),
    ("position", "n.", "positio, form positus"),
    ("potter", "n.", "[form pot.]"),
    ("potting", "n.", "[form pot.]"),
    ("precedaneous", "a.", "[form precede"),
    ("prelatist", "n.", "[form prelate.]"),
    ("primary", "a.", "in distinction form the secondary"),
    ("privacy", "n.", "[form private.]"),
    ("prodition", "n.", "proditio, form prodo"),
    ("proper", "a.", "separate form the petals"),
    ("provision", "n.", "ourselves form enemies"),
    ("purify", "v.t.", "To clear form improprieties"),
    ("purity", "n.", "puritas, form purus"),
    ("purview", "n.", "distinguished form the preamble"),
    ("shield", "v.t.", "to secure form assault"),
    ("sleet", "n.", "passing form the chamber"),
    ("slope", "a.", "inclining form a horizontal"),
    ("smell", "v.t.", "often form a distance"),
    ("soda", "n.", "obtained form the salsola"),
    ("solemn", "a.", "solennis, form soleo"),
    ("solicit", "v.t.", "thee form darkness"),
    ("soothsaying", "n.", "distinguished form prophecy"),
    ("sordid", "a.", "sordidus, form sordes"),
    ("sort", "n.", "This word is form the root"),
    ("sothernwood", "n.", "a different species form the wormwood"),
    ("sound", "a.", "free form error"),
    ("source", "n.", "proceeding form it"),
    ("southern", "a.", "Coming form the south"),
    ("space", "n.", "their distance form each other"),
    ("specially", "adv.", "deliverance form danger"),
    ("specific", "a.", "each species form one another"),
    ("speech", "n.", "as distinct form others"),
    ("spill", "v.t.", "powders form a vessel"),
    ("spine", "n.", "which proceeds form the bark"),
    ("spiracle", "n.", "spiraculum, form spiro"),
    ("squill", "n.", "squill insect form its resemblance"),
    ("subhastation", "n.", "so called form the Roman practice"),
    ("sun", "n.", "which proceeds form its absence"),
    ("superable", "a.", "superabilis, form supero"),
    ("tar", "n.", "so called form his tarred clothes"),
    ("telegraph", "n.", "transmitted form one station"),
    ("tepid", "a.", "tepidus, form tepeo"),
    ("terminator", "n.", "illumination, form its property"),
    ("terrene", "a.", "terrenus, form terra"),
    ("thirstiness", "n.", "[form thirsty.]"),
    ("toothwort", "n.", "Plumbago, form its toothed"),
    ("transfused", "pp.", "Poured form one vessel"),
    ("transition", "n.", "weather form hot to cold"),
    ("transplantation", "n.", "conveyance form one to another"),
    ("trepidation", "n.", "trepidatio, form trepido"),
    ("triality", "n.", "[form three.]"),
    ("trunk", "n.", "severed form its roots"),
    ("tumbler", "n.", "so called form his practice"),
    ("turbinate", "a.", "atop, form turbo"),
    ("turgent", "a.", "turgens, form turgeo"),
    ("twofold", "a.", "growing form the same place"),
    ("wakening", "ppr.", "Rousing form sleep"),
    ("wind", "n.", "Air in motion form any force"),
    ("woodpecker", "n.", "picks insects form the bark"),
    ("woots", "n.", "imported form the East Indies"),
    ("worm", "n.", "named form a winding motion"),
    ("wryneck", "n.", "so called form the singular manner"),
    ("yaws", "n.", "so named form yaw"),
]
CORRECTIONS += [(key, pos, phrase, re.sub(r"\bform\b", "from", phrase, count=1)) for key, pos, phrase in FORM_FOR_FROM]


def correct(entries):
    """Applies CORRECTIONS, refusing any that does not match exactly once."""
    problems = []
    for key, pos, bad, good in CORRECTIONS:
        hits = [e for e in entries if e["key"] == key and e["pos"] == pos and bad in e["text"]]
        if len(hits) != 1 or hits[0]["html"].count(esc(bad)) != 1 or hits[0]["text"].count(bad) != 1:
            problems.append(f"{key} ({pos}): {bad!r} is not in one entry exactly once")
            continue
        e = hits[0]
        e["html"] = e["html"].replace(esc(bad), esc(good))
        e["text"] = e["text"].replace(bad, good)
    if problems:
        sys.exit("corrections failed:\n  " + "\n  ".join(problems))


ALLOWED_TAG = re.compile(r'<(?:p|/p|b|/b|i|/i|/a|a class="scripref" data-osis="([^"]+)")>')
# Book, chapter and verse, or a range within one book: the forms the app's
# parsers (parseOsis in the reader, crossrefs::parse_ref_range in the
# importers) read. A whole chapter is the range of all its verses.
OSIS_FORM = re.compile(r"^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)(?:-\1\.(\d+)\.(\d+))?$")


def validate(entries, scripture):
    """Refuses to write anything the app would have to second-guess: a tag
    outside the allowlist, unbalanced markup, a reference to a verse the KJV
    does not have, or an entry filed under a key that is not the first
    headword of its own heading (the check that catches OR'DER filed under
    "der")."""
    problems = []
    for e in entries:
        where = f"{e['key']} ({e['pos']})"
        if not e["key"] or e["key"] != e["key"].lower() or not e["html"].startswith("<p>"):
            problems.append(f"{where}: bad key or html start")
        head = re.match(r"<p><b>(.*?)</b>", e["html"])
        first = FORM_SEP.split(htmllib.unescape(head.group(1)))[0] if head else ""
        if lookup_key(first) != e["key"]:
            problems.append(f"{where}: key is not the heading's first headword ({first!r})")
        paras = e["html"].count("<p>")
        if any(not 0 < i < paras for i in e.get("content_paras", [])):
            problems.append(f"{where}: content_paras out of range")
        depth = []
        for m in re.finditer(r"<[^>]*>", e["html"]):
            tag = m.group(0)
            ok = ALLOWED_TAG.fullmatch(tag)
            if not ok:
                problems.append(f"{where}: tag {tag}")
                continue
            if ok.group(1):
                o = OSIS_FORM.match(ok.group(1))
                if not o or o.group(1) not in CHAPTERS:
                    problems.append(f"{where}: osis {ok.group(1)}")
                else:
                    book, c = o.group(1), int(o.group(2))
                    if not scripture.plausible(book, c, int(o.group(3)) if o.group(3) else None, None):
                        problems.append(f"{where}: osis {ok.group(1)} out of range")
                    if o.group(4) and not scripture.plausible(book, int(o.group(4)), int(o.group(5)), None):
                        problems.append(f"{where}: osis {ok.group(1)} end out of range")
                    if o.group(4) and (int(o.group(4)), int(o.group(5))) <= (c, int(o.group(3))):
                        problems.append(f"{where}: osis {ok.group(1)} runs backwards")
            name = re.match(r"</?([a-z]+)", tag).group(1)
            if tag.startswith("</"):
                if not depth or depth.pop() != name:
                    problems.append(f"{where}: unbalanced {tag}")
            else:
                depth.append(name)
        if depth:
            problems.append(f"{where}: unclosed {depth}")
        if "&" in re.sub(r"&(amp|lt|gt);", "", e["html"]):
            problems.append(f"{where}: bare &")
    if problems:
        sys.exit("validation failed:\n  " + "\n  ".join(problems[:40]) + f"\n  ({len(problems)} problems)")


def write(entries):
    OUT.mkdir(parents=True, exist_ok=True)
    buckets = defaultdict(list)
    for i, e in enumerate(entries):
        first = e["key"][:1]
        buckets[first if "a" <= first <= "z" else "misc"].append((e["key"], i, e))
    files = []
    for name in sorted(buckets):
        items = [e for _, _, e in sorted(buckets[name], key=lambda t: (t[0], t[1]))]
        lines = ",\n".join(json.dumps(e, ensure_ascii=False, separators=(",", ":")) for e in items)
        path = OUT / f"{name}.json"
        path.write_text("[\n" + lines + "\n]\n", encoding="utf-8", newline="\n")
        files.append(path.name)
    for stale in OUT.glob("*.json"):
        if stale.name not in files and stale.name != "_index.json":
            stale.unlink()
    return files, {name: len(b) for name, b in buckets.items()}


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    raw = fetch()
    rows = parse_inserts(raw.decode("utf-8"))
    if len(rows) != 62977 or any(len(r) != 7 for r in rows):
        sys.exit(f"expected 62977 rows of 7 columns, got {len(rows)}")
    rows = fix_source_typos(rows)
    scripture = Scripture()
    entries, stats, samples = build(rows, scripture)
    correct(entries)
    validate(entries, scripture)
    files, counts = write(entries)
    refs = sum(scripture.linked.values())
    index = {
        "work": "Noah Webster, An American Dictionary of the English Language (1828)",
        "source": f"https://github.com/{REPO}/blob/{COMMIT}/{SQL_PATH}",
        "sql_sha256": SQL_SHA256,
        "total_entries": len(entries),
        "total_refs": refs,
        "files": files,
    }
    (OUT / "_index.json").write_text(json.dumps(index, indent=2) + "\n", encoding="utf-8", newline="\n")
    report(rows, entries, stats, samples, scripture, counts, files)


def report(rows, entries, stats, samples, scripture, counts, files):
    print(f"rows read: {len(rows)}")
    print(f"entries written: {len(entries)}  (distinct keys: {len({e['key'] for e in entries})}, "
          f"with aliases: {sum(1 for e in entries if 'aliases' in e)}, from `content`: "
          f"{sum(1 for e in entries if e.get('from') == 'content')}, partly from `content`: "
          f"{sum(1 for e in entries if e.get('from') == 'string+content')}, no part of speech: "
          f"{sum(1 for e in entries if not e['pos'])})")
    print("pos:", Counter(e["pos"] for e in entries).most_common(20))
    print("\nper file:")
    for name in files:
        stem = name[:-5]
        print(f"  {name:10} {counts[stem]:6} entries  {(OUT / name).stat().st_size / 1024:8.0f} KiB")
    total = sum((OUT / f).stat().st_size for f in files)
    print(f"  total      {len(entries):6} entries  {total / 1024 / 1024:8.1f} MiB")
    print("\nrow handling:")
    for kind, n in stats.most_common():
        print(f"  {n:6}  {kind}")
        for s in samples.get(kind, [])[:5]:
            print(f"            e.g. {s}")
    print(f"\nScripture links: {sum(scripture.linked.values())}")
    for kind, n in scripture.linked.most_common():
        print(f"  {n:6}  {kind}")
        for s in scripture.samples[kind][:6]:
            print(f"            e.g. {s}")
    for kind, n in scripture.info.most_common():
        print(f"  ({n} of them: {kind})")
        for s in scripture.samples[kind][:6]:
            print(f"            e.g. {s}")
    print(f"candidates rejected: {sum(scripture.rejected.values())}")
    for kind, n in scripture.rejected.most_common():
        print(f"  {n:6}  {kind}")
        for s in scripture.samples[kind][:6]:
            print(f"            e.g. {s}")
    content_coverage(rows, entries)
    kjv_coverage(entries, scripture)
    print("\nspot checks:")
    for word in SPOT_CHECKS:
        for e in entries:
            if e["key"] == word or word in e.get("aliases", []):
                print(json.dumps(e, ensure_ascii=False, indent=1))


def content_coverage(rows, entries):
    """What `content` has under a row's own headword that no entry under
    that key holds: a paragraph of four words or more (common words and book
    names aside) of which no paragraph, or pair of paragraphs, of the output
    holds six tenths. It should stay small; what it finds is mostly compound
    headwords `content` prints inside another row (COD-FISH under COD), which
    are entries of their own."""
    held = defaultdict(list)
    for e in entries:
        paras = re.findall(r"<p>(.*?)</p>", e["html"])
        ws = [text_words(p) for p in paras] + [text_words(a + " " + b) for a, b in zip(paras, paras[1:])]
        for k in [e["key"]] + e.get("aliases", []):
            held[k].extend(ws)
    rows_missing, missing, examples = 0, 0, []
    for r in rows:
        if not content_usable(r):
            continue
        secs = sections_from_paras(r[0], string_paras(r[3]), r[1])
        forms = next((s.forms for s in secs if s.own), None) or (secs[0].forms if secs else [(r[1] or "").upper()])
        lost = []
        for c in sections_from_paras(r[0], content_paras(r[6], forms), r[1], source="content"):
            if not c.own:
                continue
            for p in [c.rest] + c.body:
                w = text_words(p)
                if len(w) >= 4 and not any(containment(w, x) >= 0.6 for x in held.get(c.key(), [])):
                    lost.append(p)
        if lost:
            rows_missing += 1
            missing += len(lost)
            if len(examples) < 6:
                examples.append(f"{r[1]}: {plain(lost[0])[:90]}")
    print(f"\n`content` paragraphs under a row's own headword not found in the output: {missing}, in {rows_missing} rows")
    for x in examples:
        print(f"            e.g. {x}")


def kjv_coverage(entries, scripture):
    """How many of the King James Version's words (lower-case ones: names
    aside) a lookup finds, as a key or an alias, once a plain ending is taken
    off; and the commonest it does not. A rebuild can be held against it."""
    keys = set()
    for e in entries:
        keys.add(e["key"])
        keys.update(e.get("aliases", []))
    freq = Counter()
    for text in scripture.verses.values():
        freq.update(re.findall(r"\b[a-z]+\b", text))

    def found(w):
        forms = {w}
        for suffix in ("eth", "est", "ed", "ing", "es", "s", "d", "th", "st"):
            if w.endswith(suffix) and len(w) > len(suffix) + 1:
                base = w[: -len(suffix)]
                forms |= {base, base + "e"}
                if len(base) > 2 and base[-1] == base[-2]:
                    forms.add(base[:-1])
        for suffix in ("ies", "ied", "ieth", "iest"):
            if w.endswith(suffix) and len(w) > len(suffix) + 1:
                forms.add(w[: -len(suffix)] + "y")
        return bool(forms & keys)

    missing = sorted(((n, w) for w, n in freq.items() if not found(w)), reverse=True)
    print(f"\nKJV words found: {len(freq) - len(missing)} of {len(freq)} lower-case word types "
          f"({sum(freq.values()) - sum(n for n, _ in missing)} of {sum(freq.values())} occurrences)")
    print("  commonest not found: " + ", ".join(f"{w} {n}" for n, w in missing[:40]))


SPOT_CHECKS = ["prevent", "conversation", "charity", "let", "quick", "meat", "comprehend", "order", "honor", "and", "or",
               "death", "repent", "among", "build"]


if __name__ == "__main__":
    main()
