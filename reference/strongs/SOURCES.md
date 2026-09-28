# Strong's dictionaries

James Strong, *A Concise Dictionary of the Words in the Hebrew Bible* and *A
Concise Dictionary of the Words in the Greek Testament* (1890/1894). Public
domain. Both files came in with the repository's first commit (2026-09-07)
and are unmodified copies of the published files; any correction is made in
the importer (`src-tauri/src/import/reference/strongs.rs`), never here.

| File | What it is | Terms | From |
|---|---|---|---|
| `hebrew.xml` | OSIS XML edition by David Troidl and David Instone-Brewer (last revision 2010-05-24), cleaned against the printed text | Public domain | Open Scriptures, https://github.com/openscriptures/HebrewLexicon (`HebrewStrong.xml`) |
| `greek.xml` | XML edition by Ulrik Petersen (2006) of Michael Grier's 1996 ASCII e-text, with real Greek in place of the e-text's transliteration | Public domain ("Copy Freely") | Open Scriptures, https://github.com/openscriptures/strongs (`greek/StrongsGreekDictionaryXML_1.4`) |

SHA-256: `hebrew.xml` 1f9659ea208f4c498843a0280dacb1448627c33ca77712642d8705793ab66061,
`greek.xml` df928f01b37632f8af9f16289ce58d10b958014cb5dbd1e1ea715a8d311a0625.

## How the files are read

**Hebrew headwords are pointed.** Each entry's `<w>` carries the word twice:
its `lemma` attribute is the pointed form Strong's prints (`פָּנִים`), its text
the same word stripped to consonants (`פנים`) -- and in a few entries the
stripped copy is simply wrong (H223's is `איריה` for `אוּרִיָּה`). The headword
is the `lemma`, byte for byte, marks in the file's own order (dagesh before
the vowel: U+05BC U+05B8, as the file writes them). `POS` is Strong's
pronunciation (`paw-neem'`).

**Hebrew derivation** is `<note type="exegesis">`, Strong's definition
`<note type="explanation">`, the King James renderings
`<note type="translation">`; the numbered senses in `<list>` are the
definition shown. A word the text names is an empty `<w>`: with `src` it is
an entry, written `H6437 (pânâh)`; without, a word with no entry of its own
(H6440's "unused noun"), written as its pointed `lemma` and transliteration.
The editor's correction notes (`<note type="x-typo">`) are not Strong's text
and are left out, including where they sit inside a derivation.

**Greek** entries mark Strong's one run of text as `<strongs_derivation>`,
`<strongs_def>` and `<kjv_def>`. The markup closes the derivation too late in
eight entries (G2048, G2063, G2073, G2316, G2537, G2570, G2983, G3741),
leaving the start of the meaning under Derivation; the importer reads the
derivation clause by clause and returns everything from the first clause that
is a meaning rather than an origin to the front of the definition. It also
closes the derivation too early: inside a bracket, at the bracket's own
semicolon (ἄγγελος, G32: "from ἀγγέλλω (probably derived from 71;" /
"compare 34) (to bring tidings); a messenger"), where the derivation is run on
to the first semicolon after its brackets close; and after the first of two
sources (G2521: "from 2596;" / "and ἧμαι (to sit; ...); to sit down"), where a
definition's first clause that goes on with "and" or "or" and names a number
or a Greek word goes back to the derivation. Five entries never close a
bracket the derivation opens (G123, G1537, G2819, G5177, G5342) and are left as
the file has them. A Greek
word cited in the text (`<greek unicode="ἁδρός"/>`) is written as its
`unicode`. Text after `<kjv_def>` ("Compare 2570.", "Often used in
composition...") is the rest of Strong's run and is kept after the
renderings; the `<see>` elements there are the file's index of the numbers
the text cites, not text.

A derivation's first clause that goes on "probably akin to", "akin to" or "from" and names
a number or a Greek word is a source too (G1156 "probably akin to the base of G1325", G5501
"from an obsolete equivalent χέρης"), and so is "of uncertain derivation" standing alone
(G2359). G4434's file closes the bracket of "(to crouch; akin to G4422 and the alternate
of G4098)" at the end of the derivation and opens the definition with the close; that one
bracket is put back where Strong's closes it, the only change to the file's characters.

Fifteen entries have no `<strongs_def>`: the whole run is in `<strongs_derivation>`. Where
it starts with a source ("from", "adverb from", "of Hebrew origin") and goes on to a
meaning, the two are parted after the source's last number or Greek word and any bracket
after it, at the comma, stop or colon there (G814 "adverb from G813," / "irregularly
(morally)", G1122, G1682, G2289, G2366, G3718, G5184). G2022 ἐπιχέω has nothing after its
source; the file gives its meaning in front of the renderings ("--to pour upon:--pour
in."), and "to pour upon" becomes the definition. The other eight (G302 "a primary
particle, denoting a supposition...", G976 "properly, the inner bark...") are Strong's
whole text for the word and are shown as its definition.

**Forms after the headword.** 69 Greek entries print other forms of the word between the
headword and the derivation, as loose text in the entry (G3588 "including the feminine ἡ,
and the neuter τό in all their inflections", G3756 "also (before a vowel) οὐκ, and (before
an aspirate) οὐχ", G683 "or ἀπώθομαι"). They open the derivation, as Strong's prints them,
or the definition where there is no derivation. Their pronunciations are left out like the
headword's. Two such spots are conversion debris and are not read (G3179 "UP9875: LEXEME
NOT FOUND ...", G3378's pronunciation "may ook" as text), nor are the hundred "Not Used"
numbers (G2717, G3203-G3302). G3779's forms leave a bracket open, as the file does ("or
(before a vowel οὕτως").

**Two tidyings.** A cited word's pronunciation is left out, and the space before it stayed
before the punctuation after it (G4572 "σεαυτῷ , and accusative case σεαυτόν ,"); the
space goes. Eighteen entries print a number Strong's refers to as plain text ("the same as
1547", "(3563 implied)", "from 2596 and 5368"); it is written as the reference it is,
"G1547", like every other. G5516, whose text is the numeral's values ("600, 60 and 6"), is
not touched.

Known inconsistencies in the source, kept as it has them: G3028 λῆμψις and G3336
μετάλημψις are spelled as the modern editions spell them, while their pronunciations
("lape'-sis", "met-al'-ape-sis") are of Strong's λῆψις and μετάληψις; G5516's
transliteration is "chx stigma".
