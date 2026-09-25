"""Builds tools/dort-rejections.json -- the Rejection of Errors of the Canons
of Dort in Thomas Scott's translation (The Articles of the Synod of Dort,
1818) -- from the Internet Archive's OCR of two printings of it:

    python tools/extract-dort-rejections.py <1856 djvu.txt> <1831 djvu.txt> <words.txt>

(words.txt: any English word list, one word to a line -- e.g. dwyl's
english-words words_alpha.txt -- used only to decide which scan misread.)

  https://archive.org/details/thearticlesofthe00scotuoft   (1856)
  https://archive.org/details/articlesofsynodo00syno       (1831)

The English that Schaff prints (the Reformed Dutch Church's) leaves the
rejections out, and no clean transcription of Scott is to be had. So the 1856
scan is read, stripped of its running heads and Scott's own footnotes (his
comparisons with the Church of England's Articles, set at the foot of each
page), and each word the 1856 OCR got wrong is taken from the 1831 scan where
that one has a real word in the same place. What is left is proofread by
hand, and those fixes are CORRECTIONS below -- add to them rather than
editing the JSON.

tools/extract-schaff-confessions.py reads the JSON into canons_of_dort.json.
"""

import difflib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "tools" / "dort-rejections.json"

# (head index as in extract-schaff-confessions.HEADS, start heading, end marker)
SECTIONS = [
    (0, r"REJECTION\s+OF\s+ERRORS\s+BY\s+WHICH\s+THE\s+BELGIC", r"[“\"'‘*]*\s*That\s+we\s+thus\s+think\s+and\s+judge"),
    # The 1856 scan reads the next chapter's heading "CHARTERS IIT way."
    (1, r"REJECTION\s+OF\s+ERRORS\s+ON\s+THE\s+SECOND\s+CHAPTER", r"\n\s*CHA[A-Z]*\s+I[IlT1]{2}"),
    (2, r"REJECTION\s+OF\s+ERRORS\s+ON\s+THE\s+THIRD\s+AND\s+FOURTH", r"\n\s*CHAPTER\s+V\b"),
    # "[RlI]": the 1831 scan reads this one "lEJECTION".
    (3, r"[RlI]EJECTION\s+OF\s+ERRORS\s+ON\s+THE\s+FIFTH\s+CHAPTER", r"\n\s*CONCLUSION"),
]

# "SYNOD OF DORT. 195" / "196 ARTICLES OF THE" (1856); "94 ARTICLES OF THE
# SYNOD OF DORT." / "ARTICLES OP THE SYNOD OF DORT. 121" (1831).
RUNNING_HEAD = re.compile(
    r"^\s*(\d+\s+)?(ARTICLES\s+O[FP]\s*THE\s*)?(SYNOD\s+O[FP]\s+DORT\.?)?(\s+\d+)?\s*$", re.I
)

# Proofreading fixes to what the vote leaves, applied in order, each checked
# against the Latin of the Canons that Schaff prints (Creeds III, pp. 550ff.)
# -- which settles a misread reference ("Rom. viii. 90") as surely as a word.
CORRECTIONS: list[tuple[str, str]] = [
    # First head
    ("(pre aliis)", "(præ aliis)"),
    ("Acts xii. 48. And,", "Acts xiii. 48. And,"),
    ("and. to judge", "and to judge"),
    ("accused of falsehood,” God hath called", "accused of falsehood, “God hath called"),
    ("in Christ J esus, before the world began oo 2: Vin. 1:9.", "in Christ Jesus, before the world began.” 2 Tim. i. 9."),
    ("(‘ngerit)", "(ingerit)"),
    ("(“ngerit)", "(ingerit)"),
    ("“If itis of grace", "“If it is of grace"),
    ("glorifies.” Rom. viii. 90.", "glorifies.” Rom. viii. 30."),
    ("(ponere mcertam certitudinem,)", "(ponere incertam certitudinem,)"),
    ("reward of eternal life. For by this pernicious", "reward of eternal life.” For by this pernicious"),
    ("sayings: Election is not of works, but of him that calleth. Rom. ix. 11.", "sayings: “Election is not of works, but of him that calleth.” Rom. ix. 11."),
    # Second head
    ("obtained - (émpetration?) by the death", "obtained (impetrationi) by the death"),
    ("JEHovAH", "JEHOVAH"),
    ("Isa.liii. 10.", "Isa. liii. 10."),
    ("“believe the church.^*", "“believe the church.”"),
    ("(pre al/is)", "(præ aliis)"),
    ("died” (Rom. viii. 32, 54)", "died” (Rom. viii. 33, 34)"),
    ("who declared, I lay down my life for my sheep.“John x. 15. And,” This is my command", "who declared, “I lay down my life for my sheep.” John x. 15. And, “This is my command"),
    ("for his friends.“John xv. 12, 18.", "for his friends.” John xv. 12, 13."),
    # Third and fourth heads
    ("all have sinned.” . And ver. 16", "all have sinned.” And ver. 16"),
    ("separated from it” For", "separated from it.” For"),
    ("(Eph. ii. 14,) “Ye were dead", "(Eph. ii. 1, 5,) “Ye were dead"),
    ("Ps. li. 19. 1 Chron. xxix. 14. Matt. v. 6.", "Ps. li. 19. Matt. v. 6."),
    ("animal, (ux) can", "animal, (ψυχικόν) can"),
    ("faithand repentance", "faith and repentance"),
    ("(Psa. exlvii. 19, 20,)", "(Psa. cxlvii. 19, 20,)"),
    ("(Acts xvi. 16.) “God permitted", "(Acts xiv. 16.) “God permitted"),
    ("the Spirit suffered them not. |", "the Spirit suffered them not.”"),
    ("conversion of mar there", "conversion of man there"),
    ("Jer. xxxi. 83. “TI will put", "Jer. xxxi. 33. “I will put"),
    ("“TI will pour", "“I will pour"),
    ("praying—* Convert thou me, and I shall be converted.“Jer. xxxi. 18, 19.", "praying, “Convert thou me, and I shall be converted.” Jer. xxxi. 18."),
    ("(natural, 4vxixóv)", "(natural, ψυχικόν)"),
    ("temporal ones.”’ For", "temporal ones.” For"),
    ("“TI will give", "“I will give"),
    ("heart of flesh,” &e.", "heart of flesh,” &c."),
    ("(ipso actw)", "(ipso actu)"),
    # Fifth head
    ("“The election have obtained; the rest were hardened.” (éxwes$zsav). Also, Rem. viii. 32.", "“The election have obtained; the rest were hardened” (ἐπωρώθησαν). Also, Rom. viii. 32."),
    ("our Lord Jesus Christ.” Cort Ser", "our Lord Jesus Christ.” 1 Cor. i. 8."),
    ("Rom. v. 8,9.", "Rom. v. 8, 9."),
    ("the apostle John , affirming", "the apostle John, affirming"),
    ("(1 Johniii. 2, 3,)", "(1 John iii. 2, 3,)"),
    ("Luke viii. 13, &.,)", "Luke viii. 13, &c.,)"),
    ("“[ have prayed", "“I have prayed"),
    ("out of my Father's hand.” |", "out of my Father's hand.”"),
    ("by the Spirit which he hath given", "by the Spirit which he hath given us.”"),
    ("more often regenerated.” t For", "more often regenerated.” For"),
    ("ver. Po HOY Father, keep them through thy name; “and ver. I5 (1 pray not", "ver. 11, “Holy Father, keep them through thy name;” and ver. 15, “I pray not"),
]

# Where the vote carries on past an error's end into one of Scott's footnotes
# (set too close above the page foot for the three-blank-line rule): the text
# is cut after this, which is where the Latin stops.
CUT_AFTER = {
    (2, 6): "I shall be converted.” Jer. xxxi. 18.",
    (2, 7): "heart of flesh,” &c.",
    (2, 8): "godliness.” 2 Pet. i. 3.",
}


def body_lines(text: str) -> list[str]:
    """The page text with running heads and footnotes removed: a footnote
    block follows three or more blank lines and runs to the next running
    head."""
    out = []
    blank = 0
    in_note = False
    for line in text.split("\n"):
        if line.strip() and RUNNING_HEAD.match(line) and re.search(r"[A-Za-z]", line):
            in_note = False
            blank = 0
            continue
        if not line.strip():
            blank += 1
            if not in_note:
                out.append("")
            continue
        if blank >= 3 and out:
            in_note = True
        blank = 0
        if in_note:
            continue
        if len(line.strip()) <= 3 and not re.match(r"^\d+\.$", line.strip()):
            continue  # a printer's signature mark ("17", "Ir?")
        out.append(line.rstrip())
    return out


def paragraphs(lines: list[str]) -> list[str]:
    paras, cur = [], []
    for line in lines + [""]:
        if not line.strip():
            if cur:
                paras.append(join_lines(cur))
                cur = []
            continue
        cur.append(line.strip())
    return paras


def join_lines(lines: list[str]) -> str:
    text = ""
    for line in lines:
        if text.endswith("-") and not text.endswith(" -"):
            text = text[:-1] + line  # a word broken at the line's end
        else:
            text = f"{text} {line}" if text else line
    return re.sub(r"\s+", " ", text)


def section(text: str, start: str, end: str) -> str:
    # Case-insensitive, for the 1831 scan's lower-case headings -- which then
    # also finds the table of contents, whose lines run out in "- - - 201".
    m = next((m for m in re.finditer(start, text, re.I) if " - - " not in text[m.end() : m.end() + 200]), None)
    if not m:
        raise SystemExit(f"not found: {start}")
    rest = text[m.end():]
    e = re.search(end, rest)
    return rest[: e.start()] if e else rest


def tokens(text: str) -> list[str]:
    return text.split()


def normalize_quotes(text: str) -> str:
    """Scott's double quotation marks, which the OCR reads as any of “ ” « »
    ‘‘ ’’ '' " and -- for an opening one -- "*" or "‘": each run of them
    becomes one mark, and the marks are paired open-close in order."""
    Q = "\x00"
    text = re.sub(r"(?<=[.;,:?!)\"”’])[\*T\}\+†‡§|]+(?=\s|$)", "", text)  # footnote sigils after a stop
    text = re.sub(r"[“”«»\"]|‘‘|’’|''", Q, text)
    text = re.sub(r"(?:(?<=\s)|^)(?:\*+|‘)\s*(?=[A-Za-z\x00\[])", Q, text)  # "*" or "‘" read for an opening quote
    text = re.sub(r"\x00(\s*\x00)+", Q, text)
    out, opening = [], True
    for ch in text:
        if ch == Q:
            out.append("“" if opening else "”")
            opening = not opening
        else:
            out.append(ch)
    text = "".join(out)
    text = re.sub(r"“\s+", "“", text)
    text = re.sub(r"\s+”", "”", text)
    text = re.sub(r"”(?=[A-Za-z0-9])", "” ", text)
    text = re.sub(r"(?<=[A-Za-z,;:])“", " “", text)
    # The old printer's space before a colon, semicolon, question or
    # exclamation mark.
    text = re.sub(r"\s+([;:?!])", r"\1", text)
    text = re.sub(r"\(\s+", "(", text)
    return text


def vote(primary: str, witness: str, words: set[str]) -> str:
    """Takes a word from the witness where the primary's word isn't one and
    the witness's, in the same aligned place, is."""
    a, b = tokens(primary), tokens(witness)
    sm = difflib.SequenceMatcher(a=[w.lower() for w in a], b=[w.lower() for w in b], autojunk=False)
    out = []
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == "replace" and (i2 - i1) == (j2 - j1):
            for x, y in zip(a[i1:i2], b[j1:j2]):
                bare_x = re.sub(r"[^A-Za-z]", "", x).lower()
                bare_y = re.sub(r"[^A-Za-z]", "", y).lower()
                if bare_x and bare_x not in words and bare_y in words:
                    out.append(re.sub(r"[A-Za-z]+", lambda _m, y=re.sub(r"[^A-Za-z]", "", y): y, x, count=1))
                else:
                    out.append(x)
        else:
            out.extend(a[i1:i2])
    return " ".join(out)


def split_articles(text: str) -> tuple[str, list[str]]:
    """The preamble ("The orthodox doctrine ... rejects the errors of
    those,") and the numbered errors, each "N. Who teach ...". The number is
    whatever the OCR made of it ("l." for "1.", "9." for "5."): the errors
    are numbered in order instead."""
    parts = re.split(r"(?:(?<=^)|(?<=\s))[1-9lI]\s?\.\s+(?=Who\b)", text)
    # The heading's second line ("CHURCHES HAVE FOR SOME TIME BEEN
    # DISTURBED.") runs into the preamble.
    preamble = re.sub(r"^[A-Z ,.\-]+(?=The orthodox)", "", parts[0].strip())
    return preamble, [p.strip() for p in parts[1:]]


def finish(text: str) -> str:
    text = normalize_quotes(text)
    # A word broken at a line's end whose hyphen the OCR kept apart ("ob-
    # tained", "him- self").
    text = re.sub(r"(?<=[a-z])- (?=[a-z])", "", text)
    for wrong, right in CORRECTIONS:
        text = text.replace(wrong, right)
    return text


def main():
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    t56 = Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace")
    t31 = Path(sys.argv[2]).read_text(encoding="utf-8", errors="replace")
    words = set(Path(sys.argv[3]).read_text(encoding="utf-8").split())
    out = {}
    for head, start, end in SECTIONS:
        a = " ".join(paragraphs(body_lines(section(t56, start, end))))
        b = " ".join(paragraphs(body_lines(section(t31, start, end))))
        preamble, items = split_articles(vote(a, b, words))
        # Quotation marks are paired within each error, so one the OCR lost
        # can't turn every mark after it inside out.
        errors = []
        for n, t in enumerate(items, start=1):
            t = finish(t)
            cut = CUT_AFTER.get((head, n))
            if cut:
                if cut not in t:
                    raise SystemExit(f"head {head} error {n}: cut point not found: {cut}")
                t = t[: t.index(cut) + len(cut)]
            errors.append({"number": n, "paragraphs": [t]})
        out[str(head)] = errors
        out[f"{head}-preamble"] = finish(preamble)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("wrote", OUT, {k: len(v) for k, v in out.items() if not k.endswith("preamble")})


if __name__ == "__main__":
    main()
