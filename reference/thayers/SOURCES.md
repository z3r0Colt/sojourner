# Thayer's Greek-English Lexicon

Joseph Henry Thayer, *A Greek-English Lexicon of the New Testament, being Grimm's Wilke's
Clavis Novi Testamenti* (1889). Public domain.

| File | What it is | Terms | From |
|---|---|---|---|
| `thayers.xml` | 5,522 entries keyed by Strong's number, converted once (2026-09-10) from the theWord Bible-software module of Thayer's compiled by Rob Sauers, a plain transcription of the 1889 text | Public domain | theWord module, converted by a one-off script (commit 41857fd): every HTML entity decoded to Unicode, nine malformed tag nestings repaired |

SHA-256: `thayers.xml` 16aebf06f0fb3e2c9e2811e9bdf1e33cde838d68f87ec0e99c400226c3ef4323.

The file is not changed here; anything corrected is corrected in the importer
(`src-tauri/src/import/reference/thayers.rs`).

## How the file is read

**Hebrew in the module's own font.** The module wrote its Hebrew in a legacy 8-bit Hebrew
font: the bytes are Windows-1255, and in the file they are the Latin-1 letters those bytes
would be (`àÅì` for אֵל, `éÀäåÈä` for יְהוָה, `àÇäÂøÉï` for אַהֲרֹן). They sit mostly in bare
`<span>` elements (3,640 words in 1,643 entries) and in 35 places outside them. The
conversion's commit message says these spans were dropped; they were not, and the importer
dropped them instead, so the Septuagint's Hebrew was missing all through the lexicon (G2316
read "the Sept. for ,  and ; a god"). The importer now reads each such run back into Hebrew:
inside a bare span every run of those letters is decoded, C0-D3 to the points U+05B0-05C3,
E0-FA to the letters U+05D0-05EA (G4460's `ÄÎé` is the suffix ִ־י it discusses); outside
one, only a run of two or more that starts with a letter (E0-FA), so that a Latin word's
accented letter (Acker, für) is left alone. The Hebrew is marked for the Hebrew font. The
Hebrew is the module's own pointing: G2316's אֶלֹהִים has a segol under its aleph, not the
hateph segol of אֱלֹהִים.

**The other bare spans** hold 176 runs of real English and Greek (G12's "both as the
common receptacle of the dead, and especially as the abode of demons", G1056's "Γαλιλαία
τῶν ἐθνῶν", G2106's "(Compare: συνευδοκέω.)"); they are read like any other text.

**One number used twice.** The file labels a copy of its article on ἅπτω (G681's own, line
682) `G68` as well as ἀγρός's (lines 69-70). The copy replaced ἀγρός's article, so every
ἀγρός ("field") showed Thayer's on ἅπτω. A number met a second time is read as the entry's
own headword's number where Strong's has that word under a number no other entry claims;
ἅπτω's (G681) is claimed, so the copy is left out and ἀγρός keeps its article. G680,
ἅπτομαι, has no article of its own: Thayer's treats the middle under ἅπτω.
