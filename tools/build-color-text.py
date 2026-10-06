"""Build reference/color_text/kjv_color.json from the Fresh Look Bible color tagging.

Usage:
    python tools/build-color-text.py <path to frbible/data/tagged_verses.jsonl>

Source: github.com/z3r0Colt/frbible, whose tagged_verses.jsonl holds every KJV verse
as segments {t: text, c: category or null}. Its text is the Fresh Look edition's,
which writes counts as numerals ("435" for "four hundred thirty and five", "the 7th
day" for "the seventh day"), so its character positions can't be used on our KJV.
Instead both texts are split into words and lined up with difflib; a colored
segment takes the character span of the KJV words its own words line up with.
Where the edition reworded a number, the whole run of KJV number words takes the
number's color.

Psalm titles (verse 0) are skipped: our KJV doesn't carry them.

Corrections: reference/color_text/corrections/*.tsv change colors in the source
before anything is lined up, in the frbible repo's own format (its
tools/corrections), so a file can move between the two unchanged:
    ref <TAB> term <TAB> occurrence <TAB> from <TAB> to <TAB> note
occurrence is which match of (term, from-color) in the verse, 1-based, or * for
all; "to" may be NONE, for a word that should not be colored at all. Files apply in name order, each against the colors as they stood before
it. A row that matches nothing stops the build.

Who is speaking comes along too: the edition sets every word in the voice of its
speaker (narration, a person speaking, God speaking, speech within speech,
Scripture quoted in a speech, a closing benediction), and the runs that are not
narration are lined up the same way, as "voices".

Output: {"categories": [...], "verses": {"Genesis 1:1": [[start, end, "T2"], ...]},
"voices": {"Genesis 1:3": [[start, end, "god"], ...]}},
offsets into the KJV verse text of bibles/King James Version (1769).xml with its
spaces collapsed and trimmed, as the app stores it (plain ASCII, so the same in
Python, Rust and JavaScript). The importer
(src-tauri/src/import/reference/color_text.rs) checks each span against the
verses table and drops any that don't fit or that cut a word.
"""

import difflib
import json
import re
import sys
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KJV_XML = ROOT / "bibles" / "King James Version (1769).xml"
OUT = ROOT / "reference" / "color_text" / "kjv_color.json"
CORRECTIONS = ROOT / "reference" / "color_text" / "corrections"

# Category -> short code, in the guide's order (God, Angels, People, Nature,
# Places, Time, Number). The app keys colors and the legend off these codes.
CATEGORIES = [
    ("GOD_FATHER", "GF"),
    ("GOD_SON", "GS"),
    ("GOD_SPIRIT", "HS"),
    ("ANGELIC", "AN"),
    ("DEMONIC", "DE"),
    ("PROPER_PERSON", "PN"),
    ("PEOPLE_GROUP", "PG"),
    ("GENERAL_PEOPLE", "GP"),
    ("PRONOUN", "PR"),
    ("ANIMAL", "BE"),
    ("PLANT", "PL"),
    ("PROPER_PLACE", "PP"),
    ("GENERAL_PLACE_1", "L1"),
    ("GENERAL_PLACE_2", "L2"),
    ("SPECIFIC_TIME", "T1"),
    ("GENERAL_TIME", "T2"),
    ("NUMBER", "NU"),
    ("MEASUREMENT", "ME"),
    ("QUANTITY", "QU"),
]
CODE = dict(CATEGORIES)

# A run of digits with thousands commas is one word ("603,550"); otherwise an
# apostrophe splits a word, so "God" colored inside "God's" lines up exactly.
# Hyphens (the edition uses U+2011) stay inside a word and are dropped from its
# key, so the edition's "Tubal-cain" matches the KJV's "Tubalcain".
WORD = re.compile(r"\d+(?:,\d{3})*(?:st|nd|rd|th)?|[A-Za-z]+(?:[-‐‑][A-Za-z]+)*")
HYPHENS = re.compile(r"[-‐‑]")
NUMERAL = re.compile(r"^\d")


def words(text):
    return [(HYPHENS.sub("", m.group()).lower(), m.start(), m.end()) for m in WORD.finditer(text)]


def merge_runs(segments):
    """The PDF sometimes colors the spaces inside a phrase ("came to pass") with
    stray colors, which splits the phrase into one segment per word. Join a run
    of same-category segments whose gaps are colored whitespace, so the phrase
    stays one term; drop colored segments that hold no word at all."""
    out = []
    for seg in segments:
        # RED, RED_SUPPLIED, STRUCTURE and SUMMARY are typesetting colors
        # (words of Christ, Psalm titles, closing "Thus"), not categories.
        t, c = seg["t"], seg["c"] if seg["c"] in CODE else None
        if seg["c"] is not None and not t.strip():
            c = "GAP"
        if c and c != "GAP" and len(out) >= 2 and out[-1]["c"] == "GAP" and out[-2]["c"] == c:
            gap = out.pop()
            out[-1]["t"] += gap["t"] + t
            continue
        out.append({"t": t, "c": c})
    return [{"t": s["t"], "c": None if s["c"] == "GAP" or not WORD.search(s["t"]) else s["c"]} for s in out]


def seg_term(text):
    """A segment's term as a correction row names it (frbible's seg_term)."""
    return text.strip(" ,.;:?!()\u2019'")


def apply_corrections(verses):
    """Apply CORRECTIONS/*.tsv to {ref: segments}, in place. Returns how many
    words changed."""
    changed, errors = set(), []
    for path in sorted(CORRECTIONS.glob("*.tsv")):
        changes = []
        for n, line in enumerate(open(path, encoding="utf-8"), 1):
            if not line.strip() or line.startswith("#"):
                continue
            ref, term, occ, src, dst = line.rstrip("\n").split("\t")[:5]
            where = f"{path.name}:{n}"
            if dst not in CODE and dst != "NONE":
                errors.append(f"{where} unknown color {dst}")
                continue
            segs = verses.get(ref)
            if segs is None:
                errors.append(f"{where} unknown ref {ref}")
                continue
            if src == "NONE":
                # A word the source left plain: found as a whole word in the
                # uncolored text (which may be one long segment), and split out.
                pattern = re.compile(r"(?<![A-Za-z])" + re.escape(term) + r"(?![A-Za-z])")
                hits = [(i, m.start(), m.end()) for i, seg in enumerate(segs) if seg["c"] not in CODE for m in pattern.finditer(seg["t"])]
            else:
                hits = [(i, None, None) for i, seg in enumerate(segs) if seg["c"] == src and seg_term(seg["t"]) == term]
            if occ != "*":
                hits = hits[int(occ) - 1 : int(occ)]
            if not hits:
                errors.append(f"{where} no {term!r} as {src} in {ref}")
            changes += [(ref, i, a, z, dst) for i, a, z in hits]
        # Splits last, from the end of each verse back, so that earlier
        # segment indexes and offsets stay valid.
        for ref, i, a, z, dst in sorted(changes, key=lambda c: (c[0], c[1], c[2] or 0), reverse=True):
            color = None if dst == "NONE" else dst
            seg = verses[ref][i]
            if a is None:
                seg["c"] = color
            else:
                parts = [{"t": seg["t"][:a], "c": seg["c"]}, {"t": seg["t"][a:z], "c": color}, {"t": seg["t"][z:], "c": seg["c"]}]
                verses[ref][i : i + 1] = [p for p in parts if p["t"]]
            changed.add((ref, i, a))
    if errors:
        sys.exit("correction errors:\n  " + "\n  ".join(errors))
    return len(changed)


def load_kjv():
    root = ET.parse(KJV_XML).getroot()
    verses = {}
    for book in root.iter("BIBLEBOOK"):
        name = book.get("bname")
        if name == "Psalm":
            name = "Psalms"
        for ch in book.iter("CHAPTER"):
            for v in ch.iter("VERS"):
                # Spaces collapsed and trimmed, as the app's importer stores
                # the verse (zefania.rs); Psalm 127:1 opens with a space.
                verses[f"{name} {ch.get('cnumber')}:{v.get('vnumber')}"] = " ".join("".join(v.itertext()).split())
    return verses


def align(kjv_text, segments):
    """Return ([start, end, code], ...) spans in kjv_text, and how many colored
    segments couldn't be placed."""
    flb = []  # (word, group index or None)
    groups = []  # code per colored segment
    for seg in merge_runs(segments):
        g = None
        if seg["c"]:
            g = len(groups)
            groups.append(CODE[seg["c"]])
        for w, _, _ in words(seg["t"]):
            flb.append((w, g))
    kjv = words(kjv_text)

    # Each group collects the KJV word indexes it lines up with.
    hits = [[] for _ in groups]
    sm = difflib.SequenceMatcher(None, [w for w, _ in flb], [w for w, _, _ in kjv], autojunk=False)
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == "equal":
            for k in range(i2 - i1):
                g = flb[i1 + k][1]
                if g is not None:
                    hits[g].append(j1 + k)
        elif op == "replace":
            block = flb[i1:i2]
            gs = {g for _, g in block if g is not None}
            if len(gs) == 1 and any(NUMERAL.match(w) for w, _ in block):
                # A reworded number: the whole KJV run is that number.
                g = gs.pop()
                hits[g].extend(range(j1, j2))
            elif i2 - i1 == j2 - j1:
                # Same length: a spelling difference, word for word.
                for k in range(i2 - i1):
                    g = block[k][1]
                    if g is not None:
                        hits[g].append(j1 + k)

    spans = []
    missed = 0
    for g, code in enumerate(groups):
        idx = sorted(set(hits[g]))
        # A segment is one term, so its KJV words must be next to each other.
        if not idx or idx[-1] - idx[0] != len(idx) - 1:
            missed += 1
            continue
        spans.append([kjv[idx[0]][1], kjv[idx[-1]][2], code])
    spans.sort()
    return spans, missed


# The edition's voices (by font), as the app names them. The font names that
# leaked into the data for a few words (Light, MdIt, ...) are narration.
VOICES = {"divine": "god", "speech": "speech", "speech2": "inner", "speech3": "inner", "quote": "quote", "emphasis": "benediction"}


def voice_spans(kjv_text, segments):
    """[start, end, voice] runs of KJV text in a voice other than narration."""
    flb = [(w, VOICES.get(seg.get("v"))) for seg in segments for w, _, _ in words(seg["t"])]
    kjv = words(kjv_text)
    voice = [None] * len(kjv)
    known = [False] * len(kjv)
    sm = difflib.SequenceMatcher(None, [w for w, _ in flb], [w for w, _, _ in kjv], autojunk=False)
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == "equal" or (op == "replace" and i2 - i1 == j2 - j1):
            for k in range(j2 - j1):
                voice[j1 + k] = flb[i1 + k][1]
                known[j1 + k] = True
        elif op == "replace":
            # A reworded stretch (a number) speaks with its own most common voice.
            vs = Counter(v for _, v in flb[i1:i2])
            for j in range(j1, j2):
                voice[j] = vs.most_common(1)[0][0]
                known[j] = True
    # KJV words the edition lacks take the voice around them: the one on both
    # sides, else the one before.
    for j in range(len(kjv)):
        if known[j]:
            continue
        before = next((voice[i] for i in range(j - 1, -1, -1) if known[i]), None)
        after = next((voice[i] for i in range(j + 1, len(kjv)) if known[i]), None)
        voice[j] = before if before == after or after is None else (before if before is not None else after)
    spans = []
    for j, v in enumerate(voice):
        if v is None:
            continue
        if spans and spans[-1][2] == v and voice[j - 1] == v:
            spans[-1][1] = kjv[j][2]
        else:
            spans.append([kjv[j][1], kjv[j][2], v])
    return spans


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    kjv = load_kjv()
    source = {}
    books = {}
    for line in open(sys.argv[1], encoding="utf-8"):
        d = json.loads(line)
        if d["verse"] == 0:
            continue
        source[d["ref"]] = d["segments"]
        books[d["ref"]] = d["book"]
    print(f"corrections applied: {apply_corrections(source)} words")
    out = {}
    voices = {}
    missed = Counter()
    total = placed = 0
    for ref, segments in source.items():
        if ref not in kjv:
            print("not in KJV:", ref)
            continue
        spans, miss = align(kjv[ref], segments)
        total += len(spans) + miss
        placed += len(spans)
        if miss:
            missed[books[ref]] += miss
        if spans:
            out[ref] = spans
        vs = voice_spans(kjv[ref], segments)
        if vs:
            voices[ref] = vs
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"categories": [{"category": c, "code": k} for c, k in CATEGORIES], "verses": out, "voices": voices}, f, separators=(",", ":"))
    print(f"placed {placed} of {total} colored terms ({placed / total:.2%}) in {len(out)} verses")
    print(f"voices: {sum(len(v) for v in voices.values())} runs in {len(voices)} verses")
    for book, n in missed.most_common(10):
        print(f"  missed {n} in {book}")


if __name__ == "__main__":
    main()
