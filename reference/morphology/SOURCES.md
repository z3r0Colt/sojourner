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
