# Psalter sources

**scottish_metrical_1650.raw.json** — John Brown of Haddington's edition of *The Psalms
of David in Metre* (the 1650 Scottish Metrical Psalter), from the archive.org item
[scotishpsalter](https://archive.org/details/scotishpsalter), OCR extracted into verses.
Public domain.

**scottish_metrical_1650.ocr.txt** — a plainly set edition of the same psalter from the
same archive.org item, OCR text with its printed lines intact. Public domain.

**scottish_metrical_1650.json** — built from the two by `tools/build-psalter.mjs`
(`npm run build:psalter`). The printed edition gives the words and the couplet breaks.
The Brown text is used to mend misread words and to put a displaced stanza back. The
break inside each couplet is found by counting syllables. What was changed:

- Page furniture was dropped: running headers, page numbers, the five book headings,
  Psalm 119's part headings, Brown's prose arguments and footnotes, and the publisher's
  closing note.
- Misread verse numbers were read back as the verses they are ("0 Lord", "101 never",
  "1101 err'd").
- Misread letters were mended. Some rules cover the usual confusions ("shaU", "I'U",
  "Hke", "sHding"). A setting's words were also checked against the Brown text of the same
  setting. The rest are fixed by a short list of corrections in the build (`CORRECTIONS`),
  each checked against both scans and the Authorised Version. A name the scan lower-cased
  ("judah's") takes its capital back.
- Nothing was modernised. The book's own spellings stay ("chuse", "shew", "commandements",
  "rememberance", "settelest", "timeously"), and so do its elisions ("heav'n", "en'mies").
- Psalm 6's second version (Common Metre) is sung from the printed edition alone, as the
  Brown text has only the first. Psalm 69:4's second quatrain, which both scans print
  twice running, is kept once (`REPEATED`).
- The break inside a couplet is found by counting syllables. Where two divisions fill the
  metre equally well, the build prefers the reading the book itself uses most. A few
  couplets still divide better in the wrong place, and for those the book's own break is
  given (`BOOK_BREAKS`).

The build was checked against the Free Church of Scotland's plain-text Scottish Psalter
([PlainText.zip](https://freechurch.org/wp-content/uploads/2025/10/PlainText.zip)), with
the 1650 printing (EEBO-TCP A76561) settling doubtful readings. The Free Church text
breaks every line as the 1650 book does, and marks the syllables the book sounds that
modern speech does not: è for a sounded -ed, a diaeresis for a vowel pair sounded apart
("salvätion"), and an underline for syllables sung to one note. The build now breaks
every couplet as that text does. The prices it puts on a word's other lengths
(`PRICE` in `tools/psalter-syllables.mjs`) come from how often the text marks each
one. The Free Church text is used only as a check and is not copied into the build.

`npm run build:psalter -- --report <path>` writes a JSON report for each setting. It lists
the stanza count, any line off its metre and why, any word the checker does not know, and
the words the metre took at other than their usual length. In the current build every
line comes to its metre except 92. Ninety-one of those are the book's own feminine
endings: a rhyming line one unstressed syllable long ("to be my King appointed", "his
mercy faileth never"), sung with the extra syllable on the last note. These mostly come
in rhyming pairs ("never" / "ever"), and a pair is sung that way even where squeezing
two syllables of some earlier word onto one note would have made the line come out
even. Five are the unrhymed lines that end on "tabernacle(s)" (Ps 27:6, 76:2, 78:28,
78:67, 132:7), which the Free Church text marks "taber<u>nacle</u>": na-cle sung to the
last note, not "tab'r" squeezed inside the word. The 92nd is Psalm 29:2, "And in the
beauty of holiness", which both scans set in nine syllables.

Ps 89:47 reads "that thou / hast made all men in vain?" as the 1650 printing and the Free
Church text do, though both scans print "has" (`PRINTED_FIXES`). A second-person verb the
lexicon lacks is divided on the verb it comes from, so its stem stays whole: gird-edst,
caus-edst, cast-edst, set-tlest.

**syllables.json** — the psalter's own lexicon: every word of the built text, divided
into the syllables it is sung in ("a-gainst", "be-fore", "tab-er-na-cles"). Where a
word is also said with a different count, that count follows it ("pray-er/1").
`tools/psalter-syllables.mjs` counts and divides the words for the build from this file.
`tools/psalter-lexicon.mjs` makes it from two dictionaries, fetched into
`.cache/psalter-lexicon/`:

- the [Moby Hyphenation List](https://www.gutenberg.org/ebooks/3204) by Grady Ward,
  public domain by the author's grant, for the divisions;
- the [CMU Pronouncing Dictionary](https://github.com/cmusphinx/cmudict), © Carnegie
  Mellon University, BSD licence, for the counts of words Moby lacks and for the other
  counts a word is said in. Only syllable counts are taken from it.

Rebuild the lexicon after the text changes: run `npm run build:psalter`, then
`node tools/psalter-lexicon.mjs`, then `npm run build:psalter` again. A word the lexicon
lacks is divided by rule and listed in the build report under `countedByRule`.

**tunes.json** — see `tools/fetch-psalm-tunes.mjs`: melodies from the Open Hymnal
Project's public-domain ABC scores, and from `tunes-src/`.
