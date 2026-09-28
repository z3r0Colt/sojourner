# Webster 1828

Noah Webster, *An American Dictionary of the English Language* (1828). The text is in the
public domain.

**Source.** `v2015/SQL/02-database-insert/dictionary_webster1828.sql` in
[DataWar/1828-dictionary](https://github.com/DataWar/1828-dictionary) at commit
`15d8c24a6786245153d196e14898f379dc5ff691` (SHA-256 of the file
`ae1821fad9d158db054a321cff07e36bd13f7520d1ebe7a218df881c307c6c2a`), a MySQL dump of 62,977
rows. Its README says only that "the 1828 dictionary came from Gutenberg and cleansed"; it
names no Project Gutenberg etext, and none is named here.

**Licence.** The repository is © 2021 DataWar, under the MIT licence. Its notice asks to be
included with all copies or substantial portions, so `LICENSE-DataWar.txt` in this folder is
the repository's `LICENSE` at the pinned commit, copied unchanged (SHA-256
`7333a3c915266685a40b76ebc06afc2116a9071f2f0d5f18b00c2b1596daf741`). It goes wherever this
data goes, and the app's list of sources and licences should name it. Webster's text is in
the public domain whatever the dump's licence.

Each row carries the entry twice, in columns the dump calls `string` and `content`. `string`
is the dictionary as printed. `content` is a website's rendering of the same entry. The
repository does not say which site. The rows whose `content` is that site's search page
("No results found … visit our Facebook page", 560 of them; "Did you mean one of these
words?", 1,444) and its verse links (`<a class='bible' target='42001001'>`) show that it
was scraped rather than taken from Gutenberg, and DataWar's MIT licence cannot speak for that
site's own additions. None of them is kept. What is taken from `content` is Webster's text in
the site's wording: its spelled-out labels and "Latin" are put back to Webster's
abbreviations, and its notes, its verse numbers and its link markup are dropped (see below).
What stays of the site's is mechanical: book names spelled out ("Genesis 43" for "Gen. 43"),
its line breaks, and the case it gave some words.

`tools/build-webster1828.py` writes the JSON files in this folder. It downloads the dump at
that commit into `.cache/webster1828/` (ignored by git), refuses a file with any other hash,
and writes the same output on every run. This file and `LICENSE-DataWar.txt` are kept by
hand.

## Files

`a.json` … `z.json`: the entries by the first letter of their key, sorted by key and then in
the dictionary's own order, one JSON object per line. No key starts with anything but a
letter.

```json
{"word":"Prevent","key":"prevent","pos":"v.t.","html":"<p><b>PREVENT'</b>, v.t. [L. proevenio, supra.]</p><p>1. To go before; to precede.</p><p>I prevented the dawning of the morning, and cried. <a class=\"scripref\" data-osis=\"Ps.119.147\">Ps.119</a>.</p>…","text":"PREVENT, v.t. [L. proevenio, supra.]\n1. To go before; to precede.\n…"}
```

- `word`: the headword with a capital first letter and Webster's accent marks removed.
- `key`: the same in lower case, for lookup. Homographs share a key and are separate
  entries (LET v.t., LET v.i., LET n., and LET the suffix). The build checks that every key
  is the first headword of the entry's own heading.
- `pos`: Webster's abbreviation (`n.`, `a.`, `v.t.`, `v.i.`, `adv.`, `pp.`, `ppr.`,
  `pret.`, `n.plu.` …), or `null` where the heading prints none. A noun printed with its
  plural ("MAN, n. plu. men.") is `n.`.
- `html`: the entry. The first paragraph is the heading line as printed, headword in bold
  with its accent marks (`PREVENT'`), then part of speech and etymology. There is one `<p>`
  per printed paragraph (a sense, or a quotation under it). Only `<p>`, `<b>`, `<i>` and
  `<a class="scripref" data-osis>` occur. The build refuses to write anything else, or
  unbalanced markup.
- `text`: the same as plain text, a line per paragraph, for search.
- `aliases` (only when there are any): other lookup keys for the entry. They are other
  spellings printed with the headword that the dump also files this text under ("ABAS'SI, or
  ABAS'SIS" gives `abassis`); a spelling printed as a fragment and written out in full
  ("OP'TIC, 'TICAL" gives `optical`, "COMPETENCE, PETENCY" `competency`); and headwords whose
  own rows hold nothing but the headword and whose text is this entry's (AMONG under
  AMONGST, below).
- `from` (only where it applies): `"content"` when the whole entry comes from the dump's
  `content` rendering; `"string+content"` when `string` has the heading and some of the
  entry and `content` the rest.
- `content_paras` (with `"string+content"` only): which paragraphs of `html` come from
  `content`, counting the heading line as 0.

A Scripture link's `data-osis` is always a verse (`Ps.119.147`) or a range within one book
(`Acts.7.9-Acts.7.10`). A citation of a whole chapter is the range of all its verses
(`Job.40.1-Job.40.24`). Those are the forms `parseOsis` in the reader and
`crossrefs::parse_ref_range` in the importers already read; opened, a chapter link lands on
its first verse.

`_index.json`: the source, the file hash, the entry and link counts, and the file list.

## What was changed

**Which text.** `string` is used wherever it has the text. It is the dictionary as printed
("PREVENT', v.t. [L. proevenio, supra.]", Scripture cited by book and chapter, "Ps.119.").
`content` rewrites it: it spells out the labels ("verb transitive", "Latin"), italicises and
re-cases every occurrence of the headword ("Let him go" becomes "*let* him go"), drops the
stop after an italicised headword ("pp. let. Letted is obsolete" becomes "participle
passive *let* Letted is obsolete"), and guesses a verse for every chapter citation, some of
them wrongly (LET's "2Thess. 2", Webster's citation for *let* meaning *hinder*, becomes
2 Thessalonians 2:3, where the verse is 2:7).

But `string` stops short in 966 rows, and there the rest is taken from `content`:

- 80 rows hold only the headword in `string` (DEAD, DAY, DAWN, CHAMBER), and 72 more
  homographs inside longer rows stop after the headword (B'ARK, BEAT). These 152 entries are
  `content`'s (`"from": "content"`).
- 817 homographs are missing from `string` altogether: it stops after the first one or two.
  RE'PENT, a. (creeping) is there, and REPENT', v.i., is not. ACT, n., SIN, v.i., 'ART, n.,
  AB'JECT, a. and n., ADDICT', v.t., BEAR, v.i., BOD'Y, v.t., DEAL, v.i., and three of
  AN'GEL's four homographs are among them. These entries are `content`'s too.
- In 243 entries `string` stops after the heading line or after some of the senses, and 975
  paragraphs come from `content` (`"string+content"`, listed in `content_paras`). DEATH
  (`string` has only "DEATH, n. deth."), BI'BLE, DEBT, DECE'IVE, DECLA'RE, DEAF, DEARTH and
  DE'ACON had no definition; F'ATHER lacked senses 5 to 12, among them "9. The appellation
  of the first person in the adorable Trinity"; SPIR'IT lacked "HOLY SPIRIT, the third
  person in the Trinity".
- A `content` paragraph counts as already in `string` when one of the next few `string`
  paragraphs holds six tenths of its words (all of them, if it has three or fewer; common
  words and book names left out), when any other one holds three quarters, when the few
  around that point hold six tenths together (the two renderings break lines differently),
  when the same words stand in `string` in the same order across its line breaks, or when a
  `string` copy of the entry in another row holds them. A paragraph of two words or fewer
  that `string` has every word of ("To sit down,", "[Not in use.]") goes with the
  paragraph it leads into or follows. Each paragraph taken is put after the one `content`
  has before it. The build ends by looking, row by row, for what `content` has under the
  row's own headword and no entry under that key holds: 50 paragraphs in 44 rows (2,746 in
  784 before these fixes), nearly all of them headwords filed under their own key
  (AG'LET-BABY, COD-FISH, BU'GLE-HORN) or text the two renderings divide differently.

In what is taken, what can be undone of the rewrite is undone. The labels go back to
Webster's abbreviations, "Latin" to "L.", "etc." to "&c." The headword loses its italics
and gets its capital back at the start of a sentence. The stop the site dropped after an
italicised headword is put back: a full stop before a capital letter or at the end of a
paragraph, a comma before a small letter, which is what `string` has in nine cases out of
ten where both renderings have the passage. The site's single quotation marks go back to
double ones, and the comma it lost after a headword in a heading is restored. A phrase it
set in bold capitals ("HOLY SPIRIT", "SLOOP OF WAR") is a paragraph of the entry, not a new
headword. Its verse numbers come out of the citation text, which keeps the site's
spelled-out book name ("Genesis 43"), and its "First occurrence in the Bible(KJV)" notes are
dropped. What cannot be undone stays: a proper noun the site lower-cased with the headword
("lucifer"), and the site's occasional wrong label (both of REPENT's verbs are "verb
intransitive" there).

**Markup.** The HTML is rebuilt rather than cleaned: text is unescaped and escaped again,
only bold and italic survive from the source, and the `<DD>` indents become plain
paragraphs. A number standing alone between paragraphs of `string` is a page number of the
printed text (45 of them, in the B and E pages: "in honor of the heroic / 36 / achievements
of princes"). It is dropped and the broken sentence joined up.

**Headings.**

- A row is split into its homographs wherever a paragraph opens with an upper-case bold
  headword followed by a comma, a part of speech, or nothing. A headword printed in several
  bold pieces ("DAUB'RY or DAUB'ERY", "BO'GLE, or BOG'GLE", "BRE'ATHING-PLACE") is read as
  one heading.
- Spellings in a heading are separated by commas, semicolons, and "or" and "and" standing as
  words of their own. OR'DER, HON'OR, VI'AND, TRANSGRESS'OR and ACT'OR are each one word, and
  AND and OR are headwords themselves (the conjunctions, the suffix -or, and *or*, gold, in
  heraldry).
- Four rows print the heading line differently, and are read by their own word: CHAMPAIN
  (the whole line in bold), DICTIONARY and IL (the headword in small letters), and
  SELF-AFFA'IRS. Two garbled headings are mended by name: "BAROM,'ETER" is BAROM'ETER and
  "DESCRIPTIV,E" DESCRIPTIVE.
- A second spelling printed as the part that changes is written out against the first:
  "OP'TIC,'TICAL" is OPTICAL, "OMNIP'OTENCE,'OTENCY" OMNIPOTENCY, "SALTPE'TER,'TRE"
  SALTPETRE, "COMPETENCE,PETENCY" COMPETENCY. The heading stays as printed. The full form
  becomes an alias.

**Entries.**

- The dump files an entry under each of its spellings, and in parts of D a row runs on into
  the entries after it. Copies of the same homograph (same headword and part of speech)
  whose text is identical, or is contained in the other's, are merged into the fuller one:
  1,273 of them.
- 1,876 rows hold the headword and nothing more in `string`. `content` tells them apart:
  - 80 have their definition in `content` (above).
  - 434 are a spelling Webster prints before the entry that follows ("ADVERT'ENCE,
    ADVERT'ENCY, n."). They are joined back to it, headword first, as printed, when the two
    differ by one of Webster's paired endings: -ic/-ical, -ence/-ency, -ance/-ancy,
    -man/-sman, -in/-ine, -ate/-ated, -pped/-pt. Seven more are printed so inside one row
    (DECLI'VOUS before DECLIV'ITOUS).
  - 120 are kept as an alias of the entry their `content` runs on to, where the dump has
    that entry's text and the two are spellings of one word: the second adds -s, -st, -e,
    -a, -um, -us, -o, -la, -ment, -te, -n, -ten or -den (AMONG and AMONGST, AMID' and
    AMIDST', AY and AYE, BETI'ME and BETI'MES, BRONZ and BRONZE, FORGOT' and FORGOT'TEN), -y
    after -ar or -or (AL'VEOLAR, AL'VEOLARY), -on after a consonant (TRIS'PAST, TRISPAS'TON),
    -en to a noun (HAND'MAID, HAND'MAIDEN; HEIGHT is not the verb HEIGHTEN); or they differ
    only by a final -e and -y (ANEM'ONE, ANEM'ONY); or the other spelling's entry is far
    off in the alphabet (PAN'DIT and PUN'DIT); or `content` prints the headword before a
    heading that `string` has under the other spelling ("THEREABOUT', THEREABOUTS'").
    Endings that make another word are not joined: AGGROUP' is not AGGROUP'ED, nor
    HARMON'IC HARMON'ICS, nor PROCEE'D PROCEE'DS.
  - 1,015 are left out. Their `content` runs straight on into the next entry, which the dump
    has, and nothing marks the headword as a spelling of it: AFFECT'OR, whose definition
    the dump has lost, then AFFECT'UOUS. Some are spellings Webster printed beside the next
    entry that these rules do not reach (ASK'ANCE and ASK'ANT, OR'ICHALCH and
    ORICHAL'CUM); their text is under that entry. 13 of the keys have other homographs.
    TO'WARD, BACK'WARD and HO'MEWARD, among them, are kept as aliases of the -wards
    entries beside them.
  - 41 have `content` that runs on into a definition the dump has nowhere else. 28 are
    filed under the headword it runs on to (BA'ILER, then BA'ILIFF, which has no row of its
    own; E'VEN, then "EVE, n. e'vn. The decline of the sun", EVE's row having only Adam's
    wife, with `even` as an alias). 13 are kept under the headword itself, where the next
    heading is its pronunciation ("BUILD, / BILD, v.t. bild; pret. built"; "ISLE, / ILE, n.
    ile.") or a spelling of it the dump files far off with other text (F'AKIR, F'AQUIR).
    Where the next headword's own row has different text (BAF'TAS, then BAG), both are
    left out: 20 rows. One more (FEATH'ER) runs on into headwords only. A further 29
    homographs that `string` lacks come from these chains (three of BAIT's six, from
    BAIRN's `content`).
  - 165 have nothing in `content` either: 119 hold the site's "Did you mean" page, 31 its
    "No results found", 15 the headword again. 56 of these headwords are in the output
    anyway, from a neighbouring row's `content` (CHAMPAIGN as an alias of CHAMPAIN,
    LOATHE).
- 218 headings with nothing after them close a row that runs on into the next entry
  (DEATH'LIKE at the end of the row before it). They are dropped; the entry is in its own
  row.
- 100 sets of entries under different headwords carry the same text as the dump has them.
  Most are spellings Webster prints together (NICH and NICHE, NAUTIC and NAUTICAL) or
  plants and animals under two names. A few are the dump's errors (ARMIP'OTENT carries
  ARMIS'ONOUS's definition).

**Corrections.** Slips in the dump's text are put right by hand, each where it would
otherwise be read. `SOURCE_TYPOS` mends the dump itself before anything reads it: a "/"
typed for the full stop beside it at the end of Milton's line in SPARE, v.t. ("did'st not
spare/"), and in WHETHER's citation "Matthew 21/", which is linked (to verse 31) once it has
its stop. `CORRECTIONS` mends entries once built: a clause said twice in CHARITY ("inclines
men to think favorably of their fellow men, and to do them good", the word card's entry for
1 Corinthians 13), CANE and EXTREME, n.; QUEEN-DOW'AGER's "The window of a king" (widow);
PREVE'NIENT's "hence,preventive"; OBSTUPEFAC'TIVE's "See Sti[efactove/]" (Stupefactive,
every letter a key away); SHILLING's "12 1/2/ cents"; SHRANK's "pret. or shrink" (of); and
111 places in 109 entries where "form" is typed for "from" (`FORM_FOR_FROM`): JUSTIFY's "to
pardon and clear form guilt", "so called form his tarred clothes" (TAR), "to travel form place
to place" (JOURNEY, v.i.), and in etymologies, "[L. tepidus, form tepeo, to be warm.]" (TEPID)
and "[form pot.]" (POTTER), found by reading every "form" after a word that takes "from",
before a pronoun, article, number or proper name, and inside an etymology's brackets ("[Gr.
form.]", the Greek word's meaning, is left alone). The build stops if any of them no longer
matches exactly once. About 1,560 more places lack the space after a comma between two words
("censure,abuse"); they are left as the dump has them, as are a few misread figures ("31 l/2
gallons").

## What the dump lacks

Some of Webster's entries are not in the dump at all, and others are only a headword. For a
dictionary of the King James Version's English that is worth knowing:

- No row, and no heading in either rendering: PESTILENCE, CANDLESTICK, WOE, THRESHOLD,
  VEXATION, CIRCUMCISION. The text of CIRCUMCISION ("The act of cutting off the prepuce")
  is filed under CIRCUMCISER.
- A row with the headword only, its `content` running on into the next entries: TONGUE
  (then TONGUE-GRAFTING), THREAD (THREAD'BARE), THUMB, FEATHER, HEIGHT (HEIGHTEN), VINEYARD
  (VIN'NEWED), GROUP, PROCEED (PROCEE'DER), and TIE the verb (TIED, TIER).
- The build prints how many of the KJV's words a lookup finds as a key or an alias once a
  plain ending is taken off (-s, -es, -ed, -eth, -est, -ing, -ies/-ied as -y): 8,486 of its
  9,021 lower-case word types, 689,850 of 696,327 occurrences (before these fixes, 8,435
  and 685,663). The commonest not found are irregular forms (saith, dwelt, begat, known,
  shew), British spellings Webster wrote the American way (neighbour, honour and labour are
  neighbor, honor and labor here), and the gaps above (tongue, vineyard, height,
  pestilence, candlestick, woe, circumcision). Filling the gaps would take a second public
  domain source.
- Two of the KJV's commonest words land on another word. EVEN, the adjective and adverb
  ("even so"; 1,297 times in the KJV), has no entry: `even` is only an alias of EVE, the
  evening (above), which is the KJV's *even* only in "at even". RANK, the noun and the
  adjective ("rank and good", Gen 41:5), has none either; the one RANK is "the old pret. of
  ring. [Nearly obsolete.]". The app's lookup (`db::queries::webster`, `MISSING`) shows what
  it finds for them with a note saying what is missing, rather than as the word's meaning.
- Verbs whose participles are here but not the verb, so that the key is only a noun or
  adjective of another sense: HASTE (the noun only; no HASTED either), SOW (the hog; SOWED,
  SOWING and SOWN are here), TILL (a vetch; TILLED, TILLING), WATER, SWALLOW (the bird),
  SMOOTH (the adjective), DROP, SORROW. The lookup shows a KJV form of these (*soweth*,
  *tilleth*, *swalloweth*) by the participles, not by the noun. LOATHE is a noun here, "One
  that lothes"; the verb is under LOTHE.
- With the app's lookup (the endings above, the King James irregulars, the prefixed ones such
  as *overthrew* and *foretold*, *-en* and *-men*, Webster's spellings of *defence*,
  *counsellor*, *musick*, *fulfil*, *skilful*, and compounds joined after an ending comes
  off), 163 of the KJV's 9,020 lower-case word types find nothing, 902 of 694,671
  occurrences: nearly all the gaps above and headwords the dump never had (FORASMUCH,
  THRESHING-FLOOR, BESTOW, ASTROLOGER, HOUSETOP, CHILDLESS, MISERABLE, NAUGHTY).

## Scripture

Citations become `<a class="scripref" data-osis="…">`, the shape ISBE and the commentaries
use. The visible text stays as Webster printed it. 5,937 are linked:

- 3,533 cite the chapter, and the verse was found from the quotation;
- 2,175 cite the chapter and link to the whole chapter;
- 224 give their own verse;
- 5 give a verse the quotation is not in: 4 link to the whole chapter (ESTABLISH's "Ps.119.8",
  where 8 is a sense number and the text is 119:38; EVERLASTING's "Matt.18.25.", Webster's
  two chapters read as chapter and verse), and 1 to the verse of that chapter that the
  quotation is from (BLOOD's "Rom. 5.3" is 5:9).

The rules:

- The book must be named unmistakably: in full ("Philippians 1") or by an abbreviation
  nothing else uses ("Ps.", "Matt.", "Mat.", "Cant.", "Is." with its full stop). "1 Sam.",
  "2Kings", "I Cor." and "l Thess." (an OCR "l" for "1") need their number. A bare "Sam.
  26" is not linked. Misprints and doubtful abbreviations ("Isiah.", "Duet.", "Jos.", "Ez."
  for Ezra or Ezekiel) are linked only when the quotation before them is found in that
  chapter, or when they give a verse and only one book has it ("Ez.xxiii.35" can only be
  Ezekiel). The Apocrypha ("Ecclus.", "1 Macc.") is not linked.
- The chapter and verse must exist in the King James Version the app ships
  (`bibles/King James Version (1769).xml`). "Joel 10" and "1 Cor. 25" are not linked. A
  single-chapter book's number is its verse ("Jude 16" is Jude 1:16).
- Roman chapters, which some pages use ("Ps. xxii. 24", "Rom. v", "Is.xxxviii, 17"), are
  read when they stand apart from the name: "family of Levi" is not Leviticus 1, nor "See
  Mall." Malachi 50. A capital Roman numeral after an unabbreviated name is linked only if
  the quotation is in that chapter, since "James I." is a king. Webster's Roman "l" (50)
  often reaches the dump as "1", and an OCR "1" as "l": a chapter printed either way is
  read as 50 in a book that long if the quotation is in chapter 50 and not in chapter 1
  (EMBALM's "Gen.1" is Genesis 50:2; 11 of these), and as 1 otherwise.
- The citation must end the sentence ("Ps. 23 seems to signify" is prose), unless it gives
  chapter and verse with a colon. "Jer. 9 and 23." and "Lev. 18:23, 20:12." link each number
  to the same book.
- Webster usually cites the chapter alone. The script looks for the quotation just before
  the citation (or on the line above, when the citation stands on a line of its own) among
  that chapter's verses. It compares their words, leaving out common words and taking
  endings off (-s, -es, -ed, -eth, -est, -ing), so that "Thorns choke them" meets "choked
  them". If one verse holds at least three quarters of the quotation's words, and a quarter
  more of them than any other verse, the link names that verse. Verses that tie are told
  apart by the words exactly as quoted ("I subscribed the evidence and sealed it" is Jer
  32:10, not 32:44, "subscribe evidences, and seal them"). A two-word quotation counts only
  if both words are in one verse and no other. A quotation split across two verses links
  both (`Acts.7.9-Acts.7.10`). The verse is the script's finding, not Webster's. Thirty
  links drawn at random from these were checked by hand against the KJV, and all were right;
  so were about a hundred, the weakest among them, checked before the ending rule was added.
- Where Webster gives a verse and the quotation before it has three words or more, the verse
  is checked too. Only a verse that shares at most one of the quotation's words (itself or
  one either side) is doubted: Webster's own definition before a quotation ("as carnal
  ordinances. Heb. 9:10") shares fewer words than a quotation would.
- A citation is not linked when its quotation is plainly from another chapter (69 of
  them): it has three words or more that tell verses apart, one verse of the Bible holds
  nine tenths of them and a quarter more than any other, that verse has four words or more
  in a row as the quotation has them, and no verse of the chapter cited holds six tenths.
  So ADORN's "A bride adorneth herself with jewels. Isa. 6" (Isaiah 61:10), "When I saw her
  I wondered with great admiration. Luke 18" (Revelation 17:6), "The judges shall make
  diligent inquisition. Judges 19" (Deuteronomy 19:18). The label would name a chapter the
  link does not open, and the dump cannot say which is Webster's. A quotation of two words
  cannot be told this way: "The city shall be accursed. John 6." (Joshua 6:17) is linked to
  John 6.
- 144 candidates were not linked, listed by reason in the build's report: 69 quotations
  plainly from another chapter, 38 chapters or verses that do not exist, 13 misprinted or
  ambiguous abbreviations whose quotation was not found, 8 books without their number, 5
  capital Roman numerals after a full name, 4 not at the end of a sentence, 3 Apocrypha, 2
  kings, 1 not a Roman numeral, and 1 lone "l" in Isaiah whose quotation is in neither
  chapter 1 nor 50.
