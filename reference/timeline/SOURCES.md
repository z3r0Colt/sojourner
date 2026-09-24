# Timeline sources

**events.json, chapter_years.json** — derived by `tools/extract-timeline.mjs` from the
[Theographic Bible Metadata](https://github.com/robertrouse/theographic-bible-metadata)
(`json/events.json`, `people.json`, `places.json`, `verses.json`) at commit
`cfb1c485d4da6fb63a69cb3b7f5b0752792f46bc`, © Robert Rouse,
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). These derived files are
shared under the same licence.

What was changed: dates converted to astronomical decimal years (1 BC = 0); durations
turned into end years; verse records turned into book/chapter/verse numbers; people and
places reduced to a name, a key and up to forty of their verses, for the importer to
resolve against the Factbook. Nothing re-dated.

Theographic's chronology is its own: Ussher's years for the early ages (Creation 4004 BC,
the Flood 2348 BC), later reckonings for the kings (Zedekiah from 597 BC) and the life of
Christ (born 4 BC, crucified AD 30). Its verse years and its event dates occasionally
disagree by a year or two (2 Kings 25:8 is 588 BC, the reign of Zedekiah 597–586 BC); both
are shown as given.

**Written for Sojourner** (the app arranging, not the source asserting):

- `eras.json` — eleven eras, each bounded by two of Theographic's events, so the bounds are
  the source's dates.
- `additions.json` — fifteen events Theographic lacks, each dated by Theographic's year for
  the first of its verses that the source dates.
- `overrides.json` — one event left out (Theographic dates Jair's judgeship to 1991 BC, before
  Abraham), and names mapped by hand to Factbook entries where spelling or ambiguity defeats
  the automatic match.
