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

**Church history (church_history.json)** — 296 events from the apostolic age to the present,
written for Sojourner. Every date is taken from a source, and every event quotes that
source's own words for it (`source.quote`, verbatim, at most 300 characters, the source's
spelling and misprints kept). A life quotes both its birth and death years, the second in
`second_source` where one passage does not give both. The sources, in order of preference,
as the EPUBs in the app's library carry them (CCEL texts):

- Philip Schaff, *History of the Christian Church*, 8 vols. (Scribner's; CCEL's text is
  corrected against the 1910 edition). The main source through the Reformation: 195
  events are dated from it.
- Schaff, *The Creeds of Christendom*, vol. I, *The History of Creeds* (6th ed., revised by
  David S. Schaff, 1919): creeds, confessions and the churches that made them.
- *Nicene and Post-Nicene Fathers*, Second Series (Christian Literature Co., 1890–1900):
  the editors' prolegomena to vols. I, IV, V and XII where Schaff gives no firm year, and
  the heading of Athanasius's thirty-ninth Festal Letter.
- *The New Schaff-Herzog Encyclopedia of Religious Knowledge*, ed. Samuel Macauley Jackson,
  12 vols. and index (Funk & Wagnalls, 1908–14), cited by volume and article. Vols. I, II
  and IX are quoted from the library's EPUBs. CCEL holds vols. III–VIII and X–XII only as
  page images (ccel.org/ccel/schaff/encyc03 … encyc12), so those 43 quotes were transcribed
  from the page image named in `file`. Each was checked against the archive.org OCR of the
  same printing: its words and every number in it had to be found together there.
- After 1910, for events these works do not reach: two independent references that agree
  on the date (`source` and `second_source`). Where the event is a document or a body, one
  of them is its own issuer (the EKD for Barmen, the Holy See for Vatican II). The others
  are museums, archives and libraries: the US Holocaust Memorial Museum, the Library of
  Congress, the Israel Antiquities Authority, and college, seminary and church archives.
  Events after 1914 are limited to well-documented ones of broad significance to
  Protestant and world Christianity. The six events after 1914 are the only ones dated
  from web sources. Nothing earlier uses a web source other than CCEL's page images of
  Schaff-Herzog.

What the timeline keeps is the church's history as the app's own library tells it:
councils, creeds and confessions; the Reformers, the Puritans and the theologians whose
books the library carries; persecutions and turning points of the whole church; the
founding moments of Protestant missions (Carey and the first missionary societies); and
milestones in the history of the Bible's text and translation. Popular modern
evangelists, ecumenical and parachurch bodies, and the internal milestones of other
movements are left out, however well documented. Fourteen events were removed on that
rule before 0.3.4 shipped (among them Billy Graham, D. L. Moody, Karl Barth, Dietrich
Bonhoeffer, the World Council of Churches, the Lausanne Congress, the Salvation Army and
Wesley's Aldersgate experience); their ids (264, 274, 282, 285, 287, 290, 296, 297, 299,
300, 302, 306, 307 and 309) are retired, not reused.

Dates are the source's and are not corrected to later scholarship. They are Julian (Old
Style) where the source reckons so, and `date` holds the month or day only when the source
prints one. The build holds a `date` to the calendar of its year: Old Style through 1752,
when Britain and its colonies changed calendars (so 29 February 1700 is a day), and New
Style from 1753 (so 29 February 1800 and 1900 are not). Where two passages of a source disagree (Schaff dates 1 Clement "about 95" in
vol. I and after 98 in vol. II), one reading is used. `circa` marks a year the source gives
as approximate or disputed. A writing the source dates "between X and Y" runs from X to Y.
Events the sources do not date, such as Patrick's mission, the founding of the Jesuits and
the Imitation of Christ, are left out rather than dated from memory.

`confession` links an event to a creed or confession the app ships. The Apostles' Creed is
linked to Rufinus's commentary (about 390), the earliest Latin text of the Roman creed it
grew from. The Athanasian Creed is linked to the Synod of Aix (802), which required priests
to learn it. `resource` links an event to the library book it concerns. The ten eras are
the app's arrangement. The first six follow the periods of Schaff's History (AD 30–100,
100–311, 311–590, 590–1049, 1049–1294, 1294–1517). The last four run 1517–1648, 1648–1792,
1792–1914, and 1914 to the present.
Their slugs begin `church-` (`church-apostolic`, `church-nicene` …) so that none collides
with a Bible era in `eras.json`, which has an `apostolic` of its own. Each event's `era` is
where the file files it, and the app shows that era rather than working one out from the
years. A life goes with the age of its work, so Luther (b. 1483) is filed under the
Reformation, and an event on a boundary year goes with the age it closes, so the Peace of
Westphalia (1648) is filed under the Reformation too.

Each event has a permanent `id`. The app stores a church event under row 100000 + `id`,
and a reader's saved timeline pane remembers an event by that number. A new event
therefore takes the next unused id, wherever it falls in the file. An id is never
renumbered or reused, even when an event is removed.

The build (`import::reference::church_history`) refuses an era slug without the prefix. It
checks every event before importing any:

- a unique id and key;
- its kind and precision;
- a `date` that agrees with both, and that is a day of its year's calendar;
- an `era` it begins in, or for a life, an era it lived through part of;
- an end no later than the present;
- a source with a quote of at most 300 characters;
- a `confession` the app ships and a `resource` the library carries.

The import replaces church history's rows on every build, so an edit to this file reaches
the next `--update` build as well as a clean one.
