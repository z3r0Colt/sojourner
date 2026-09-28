# Morphology

## Parsing glossary (`src/features/lexicon/parsingGlossary.json`)

Written for Sojourner, 2026-09-27: a plain-English entry (name, one-line gloss, two to four
sentences) for every value `src-tauri/src/morph.rs` can give a word's parsing, 148 in all,
plus Hebrew readings of the two names the languages share (perfect, imperfect). Nothing in
it is copied from a source; the sources below were used to settle what each value is and to
check the explanations.

**The list of terms** was checked against STEPBible's two code tables, which spell out every
Greek and Hebrew/Aramaic code TAGNT and TAHOT use with a parsing, a meaning and an example.
They were read, not copied into the repository:

| File | From |
|---|---|
| `Morphology codes/TEGMC - Translators Expansion of Greek Morphhology Codes - STEPBible.org CC BY.txt` | https://github.com/STEPBible/STEPBible-Data at commit `b99716b0cddb648ddb95cc786a197180f2f97d48` (2026-09-18) |
| `Morphology codes/TEHMC - Translators Expansion of Hebrew Morphology Codes - STEPBible.org CC BY.txt` | same |

Data created by www.STEPBible.org based on work at Tyndale House Cambridge,
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). TEHMC's notes on the Hebrew stems
and conjugations informed those entries: that its "Conjunction+Imperfect" keeps the
imperfect's own sense rather than the sequential's, that the hothpaal (which it files as
reflexive) is normally passive in sense, and that the nithpael is passive (TEHMC itself
excepts, possibly, Proverbs 27:15's "she is like", so the entry says passive or reflexive). The rarer stems
that TAHOT folds into the main ones (polel, pilpel, palel and the like) keep the names of the
Open Scriptures Hebrew Bible morphology codes that `morph.rs` follows
(https://hb.openscriptures.org/parsing/HebrewMorphologyCodes.html, CC BY 4.0); what their
entries say rests on Gesenius § 55.

**The explanations** follow the standard grammars, and were written to avoid the familiar
overclaims: that the aorist means "once for all", that the present imperative means "keep on
doing it", that `ei` with the indicative means "since", that the piel is simply "intensive",
or that the vav of the wayyiqtol mechanically "converts" the time of its verb.

- Greek: D. B. Wallace, *Greek Grammar Beyond the Basics* (Zondervan, 1996) — aspect, the
  aorist and present imperative, the article, conditions, the genitive, `ou` and `mē`, the
  middle and the "theological passive", perfects with present force, the time of the
  participle, the third-person imperative; F. Blass and A. Debrunner, *A Greek Grammar of
  the New Testament*, tr. R. W. Funk (Chicago, 1961) — `mē` with participles and in
  questions, the passive with no agent named.
- Hebrew: *Gesenius' Hebrew Grammar*, ed. E. Kautzsch, tr. A. E. Cowley (2nd English ed.,
  Oxford, 1910) — the stems (§§ 39–55), the rarer stem patterns (§ 55), the dual, the
  construct state, numerals, paragogic `-ah` and `-n`; B. K. Waltke and M. O'Connor, *An
  Introduction to Biblical Hebrew Syntax* (Eisenbrauns, 1990) — the piel as factitive and
  resultative rather than intensive, the qal passive, the hishtaphel, the conjugations and
  the sequential forms; P. Joüon and T. Muraoka, *A Grammar of Biblical Hebrew* (2nd ed.,
  Gregorian & Biblical Press, 2006) — `lo` and `al` as a tendency rather than a rule, the
  independent pronoun in a clause without a verb.
- Aramaic: F. Rosenthal, *A Grammar of Biblical Aramaic* (Harrassowitz, 1961) — the peal,
  peil, pael, haphel and shaphel stems and the determined state.

Each of the 50 verses cited as an example (English numbering) was checked in TAHOT or TAGNT
(`hebrew-tahot/`, `greek-tagnt/` here): the word is there, tagged as the entry says, so a
reader who opens the verse sees the same parsing. TAHOT folds the rarer Hebrew stems (polel,
hithpolel, pilpel, hithpalpel, pealal, the qal passive and the like) into the main ones —
Job 37:14's hitbonen is tagged hithpael, Genesis 2:23's luqqachah pual, Psalm 38:10's
secharchar piel — so those entries give a word as their example, or name the stem the
verse is tagged with, and the piel, pual and hithpael entries say what they take in.

**Checked against the tagging, 2026-09-27.** A grammar review read each entry beside the
words it is actually shown on, and 51 entries were corrected where the wording did not fit
what TAGNT and TAHOT tag that way. The counts behind the corrections were taken from the
files here: every indicative of ἀποκρίνομαι ("he answered") is middle deponent (`V-ADI`),
only its participle passive deponent; ἀπόλλυμι ("perish", John 3:16) and εὐαγγελίζομαι are
tagged middle, never deponent; the plain passive also covers intransitive forms such as
στραφείς ("turning") and ἐφάνη ("he appeared"); οἶδα is 246 of the 1,558 perfects and its past
ᾔδει (with its plurals) 33 of the 86 pluperfects; ἐμοῦ after a preposition is 104 of the 220 possessives (`S-1SGSN`);
only ἀμήν and μάννα carry `-HEB`, and ἀββά is a title (`N-VSM-T`), not `-ARAM`; δύο is 127 of
the 481 `A-NUI`. In TAHOT, hinneh and hen are interjections (`Tj`, with na, hoy, amen, Selah
and af), the demonstrative particle (`Tm`) is zeh, zot and elleh, and "that"/"those" are hu
and hem with the article (`Td/Pp`, 497 times); the extra -ah (`Sh`) sits on 304 imperatives
and 97 first-person wayyiqtols and never on a cohortative; the extra -n (`Sn`) is commonest in
Deuteronomy (58 of 309); the title tag (`Nt`, `Npt`) also covers Passover, the Urim and
Thummim and psalm headings; ein is tagged a noun, never a negative; and the only nithpaels
and tiphils are three apiece (Deuteronomy 21:8, Ezekiel 23:48, Proverbs 27:15; Hosea 11:3,
Jeremiah 12:5, 22:15).

**Words TAHOT's codes misname, 2026-09-27.** TAHOT gives the code of a number (`Ac`,
"Adjective, Numerical" in TEHMC) to some twenty words that are not numbers, about 2,600 words
in all: עוֹד "still" (490), אַחַר "after" (714), בֵּין "between" (407), מְאֹד "very" (300), נֶגֶד
"before" (151), מַעַל "above" (139), יֵשׁ "there is" (138), בְּעַד "behind, for" (104), טֶרֶם "not
yet" (56) and a few rarer ones. It gives כִּי ("for, that, because, when", 4,483 words), פֶּן
("lest") and לְמַעַן ("so that, for the sake of") the code of a conditional particle (`Tc`),
which is right for אִם, "if". `RETAGGED` in `src-tauri/src/morph.rs` reads each of these by
its Strong's number, as the lexicon classes it (Strong's, whose Hebrew definitions follow
BDB: "adv", "prep", "conj"), and only where its code is the one above: `decode_word`, used by
the interlinear, the word study and the grammar search. Of the 6,310 words coded `Ac`, 3,733
are numbers. The glossary's "kind:existence" entry is for יֵשׁ, which no code names so; its
examples, Genesis 28:16 and Job 14:7, are coded `HAcbsa` in TAHOT.

## How TAHOT and TAGNT are read (2026-09-28)

The words are shown exactly as the two files write them; what follows is where reading them
takes more than splitting a column. Code: `src-tauri/src/import/reference/editions.rs`
(`tahot_words`) and `morphology.rs` (`edition_row`, `edition_verse`, `GreekImport::resolve`).

**TAHOT, the marks after a word.** A row writes the marks that follow its word after a
backslash: `עַל\־`, `אֱלֹהִ֤ים\׀`, `הָ/אָֽרֶץ\׃\ \ס`. The maqaf (42,509 words) and the paseq
(2,273, which with a munah or mahpakh makes the disjunctive legarmeh) are the word's as the
text writes it and are kept; so is the rest of a word written across one (Genesis 14:17
`כְּדָרְ\־לָעֹ֔מֶר`, Chedorlaomer). The verse's end (׃), the paragraph marks (פ, ס) and the
inverted nun (׆) are the verse's: the WLC text has them, the word does not.

**TAHOT, a Qere of two words.** Where the scribes' reading is two words for one written word,
the row holds both, parted by `//` (Genesis 30:11 `בָּ֣א//גָ֑ד`, "a troop cometh", Deuteronomy
33:2, Judges 20:13), `/ /` (Ruth 3:5 `תֹּאמְרִ֥י/ /אֵלַ֖/י`, 1 Chronicles 27:12, Nehemiah 2:13,
2 Kings 19:31 and eleven more) or a maqaf (Exodus 4:2 `מַה/־/זֶּ֣ה`). Each word with a root
braced of its own is a word of its own, with its own number, lemma (the row's matching
braced entry) and parsing (the parsing column parts the words with `//`, the language letter
written on the first alone). One name written in two parts under one number (Numbers 7:59,
Pedahzur) stays one word, and so does one written word with two roots (Isaiah 9:6 אֲבִי/עַ֖ד,
`אַחֲרֵי/כֵן`, twelve rows), under its first. The WLC text reads `//` as a space.

**TAHOT, "written but not read".** Fourteen Qere rows have no Hebrew: the Ketiv's word is not
read (Judges 16:25, Ruth 3:12, 1 Samuel 9:1 ...). As the WLC reads the Qere throughout, such a
row has no word.

**TAHOT's own numbers.** A preposition's pronoun suffix is braced with a number of TAHOT's
own above Strong's (H9030-H9039, 6,079 words: לָנוּ, בּוֹ); Strong's numbered none of them. The
number is kept -- the interlinear finds the "us" such a word is folded into by it -- and the
table shows no Strong's number for it.

**TAGNT, the TR's spelling.** TAGNT prints the Nestle-Aland's spelling and gives another
edition's in its spelling-variants column ("TR: ἀνελήφθη ; ", "Tyn+WH: Δαυεὶδ ; +TR: Δαβὶδ ;
"). Each edition is read in its own spelling -- 1,168 words of the TR, among them every
λήμψεσθε (TR λήψεσθε) and Δαυίδ (TR Δαβίδ) -- with the printed word's punctuation, as TAGNT
prints one punctuation for all.

**TAGNT, a reading of several words.** A reading in the variants column can be several words
where the printed text has one ("ὁμοιώσω αὐτὸν", Matthew 7:24, "I will liken him"; "ἐν τοῖς
οὐρανοῖς"), tagged `G0846=P-ASM + G3666=V-FAI-1S`. Each word is a row with its own number and
parsing; TAGNT does not always list the tags in the words' order, so each word takes the tag
whose Strong's headword shares most of its first letters with it. The printed word's
punctuation goes on the last. A reading of one word tagged as several (κἀκεῖθεν,
`G2532=CONJ + G1564=ADV`) is one word with the whole code, as a printed κἀγώ is.

**TAGNT, word order.** An edition that has a word elsewhere is marked with how far: "TR»2",
two places later, "TR«3", three earlier ("moved »2", TAGNT's own notes). Each edition's words
are in its own order: 1,410 words of the TR stood in the Nestle-Aland's (Matthew 7:24 read
"ᾠκοδόμησεν αὐτοῦ τὴν οἰκίαν" for Scrivener's "ᾠκοδόμησε τὴν οἰκίαν αὐτοῦ"). A mark counts
the printed words a word passes; two words moved to the same place keep the order in which
the later-starting one stands first (Luke 3:16, "ὁ Ἰωάννης ἅπασι λέγων"). A word moved onto
the word the edition writes it into is that word's already, and has no place of its own: καί
onto κἀκείνοις (Matthew 20:4), μεγάλα onto μεγαλαυχεῖ (James 3:5), κατά onto καταμόνας, 32
such in the TR, the written word beginning with the moved one (all but its last letter) or
ending with it; and the spelled-out numbers onto the TR's letter numerals, χ̅ξ̅ς᾽ (Revelation
13:18) and ρμδ (7:4), which printed 666 and 144 twice.

**TAGNT, the word's own Strong's entry.** TAGNT files every oblique and plural form of "I"
under G3165, μέ, "me" (ἡμῶν, ἡμῖν, ἡμᾶς, ἡμεῖς, μου, μοι: 1,963 words), and words merged or
compounded from two under their first part (κἀγώ under ἐγώ, μήποτε under μή, σεαυτοῦ under
σύ, κἀκεῖνος under καί). Where the entry's headword is neither the word nor TAGNT's own
dictionary form of it, and TAGNT's column of classic Strong's numbers has one whose headword
is (ἡμῶν G2257, μου G3450, κἀγώ G2504, μήποτε G3379), that is the word's entry, and the number
the KJV's phrase above it carries. A merged word with no such number takes Strong's entry
spelled as it is (κἀκεῖθεν, G2547); a word with no number in the dictionary takes the first
classic number TAGNT gives (κατωτέρω, Matthew 2:16, G2736, whose entry prints it). The σύ
forms keep σύ, their own lexeme. Left untagged: γενήματά (Luke 12:18), which TAGNT numbers
G6013, a number TBESG maps to nothing (Strong's G1081 is γέννημα, with two nus), and the TR's
letter numerals ρμδ and ιβ, which Strong's did not number.
