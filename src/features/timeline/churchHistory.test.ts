import { describe, expect, it } from "vitest";
import type { Resource, Timeline, TimelineEra, TimelineEvent } from "../../api/types";
import {
  BIBLE_RANGE,
  bibleEraOf,
  bibleOnly,
  churchDateLabel,
  churchEraOf,
  churchFrame,
  churchJumpLabel,
  citationHost,
  citationLine,
  confessionLinkLabel,
  eraAt,
  eraFrame,
  erasByTrack,
  eventDateLabel,
  eventHoverText,
  findLibraryResource,
  isChurchEra,
  isChurchEvent,
  kindLabel,
  libraryBookName,
  lineOf,
  parseEventDate,
  rangeAfterChurchToggle,
  wholeFrame,
  withChurchHistory,
} from "./churchHistory";
import { FULL_RANGE, clampRange, panBy, widestRange } from "./timelineRange";

const bibleEvent = (id: number, start: number, end: number): TimelineEvent => ({
  id,
  title: `bible ${id}`,
  start_year: start,
  end_year: end,
  precision: "year",
  parent_id: null,
  lane: null,
  note: null,
  source: "theographic",
  book_id: 44,
  chapter: 1,
  verse: 1,
  entities: [],
  kind: null,
  circa: false,
  date: null,
  citations: [],
  confession: null,
  resource: null,
  era: null,
});

const churchEvent = (id: number, start: number, end: number, extra: Partial<TimelineEvent> = {}): TimelineEvent => ({
  ...bibleEvent(id, start, end),
  title: `church ${id}`,
  source: "church",
  book_id: null,
  chapter: null,
  verse: null,
  kind: "event",
  citations: [{ work: "Schaff, History of the Christian Church", volume: "I", locator: "§ 36. Christianity in Rome.", quote: "about a.d. 52", url: null }],
  ...extra,
});

const era = (slug: string, start: number, end: number, track: "bible" | "church"): TimelineEra => ({
  slug,
  name: slug,
  start_year: start,
  end_year: end,
  journey_era: null,
  track,
});

const timeline: Timeline = {
  eras: [
    era("life-of-christ", -5, 30.333, "bible"),
    era("apostolic", 30.333, 60, "bible"),
    era("church-apostolic", 30, 100, "church"),
    era("church-ante-nicene", 100, 311, "church"),
    era("church-twentieth", 1914, 2026, "church"),
  ],
  events: [bibleEvent(1, -3, 30), bibleEvent(2, 57, 57.003), churchEvent(3, 52, 52), churchEvent(4, 185, 254, { kind: "life" }), churchEvent(5, 1918, 2018)],
};

describe("which is church history", () => {
  it("knows a church event by its source", () => {
    expect(isChurchEvent(timeline.events[2])).toBe(true);
    expect(isChurchEvent(timeline.events[0])).toBe(false);
    expect(isChurchEvent({ source: "added" })).toBe(false);
  });

  it("knows a church era by its track, or its slug when the track is missing", () => {
    expect(isChurchEra(era("church-apostolic", 30, 100, "church"))).toBe(true);
    expect(isChurchEra(era("apostolic", 30.333, 60, "bible"))).toBe(false);
    expect(isChurchEra({ slug: "church-nicene" })).toBe(true);
    expect(isChurchEra({ slug: "apostolic" })).toBe(false);
  });

  it("groups the eras, the Bible's first", () => {
    const { bible, church } = erasByTrack(timeline.eras);
    expect(bible.map((e) => e.slug)).toEqual(["life-of-christ", "apostolic"]);
    expect(church.map((e) => e.slug)).toEqual(["church-apostolic", "church-ante-nicene", "church-twentieth"]);
  });
});

describe("the toggle", () => {
  it("hands back the very timeline when church history is on", () => {
    expect(withChurchHistory(timeline, true)).toBe(timeline);
  });

  it("leaves out church events and eras when it is off", () => {
    const off = withChurchHistory(timeline, false);
    expect(off.events.map((e) => e.id)).toEqual([1, 2]);
    expect(off.eras.map((e) => e.slug)).toEqual(["life-of-christ", "apostolic"]);
    expect(timeline.events).toHaveLength(5); // not filtered in place
  });

  it("does not copy a timeline that has no church history to leave out", () => {
    const bible = bibleOnly(timeline);
    expect(bibleOnly(bible)).toBe(bible);
  });

  it("draws the line to today with church history, and to a little after Acts without it", () => {
    expect(lineOf(bibleOnly(timeline))).toEqual({ start: -4100, end: 120 });
    expect(lineOf(timeline)).toEqual({ start: -4100, end: Math.min(2036, FULL_RANGE.end) });
  });

  const bibleLine = lineOf(bibleOnly(timeline));

  it("narrows the whole line to the widest the Bible allows when switched off", () => {
    // "All", or any drag from the opening view: Creation to today.
    const whole = clampRange(wholeFrame(timeline, 2026), lineOf(timeline));
    const after = rangeAfterChurchToggle(whole, false, bibleLine);
    expect(after).toEqual(widestRange(bibleLine));
    // Where the canvas would hold it: the first drag does not snap it away.
    expect(panBy(after, 1, bibleLine)).toEqual(after);
  });

  it("keeps the reader's zoom on the early church, sliding back until Acts is in view", () => {
    const after = rangeAfterChurchToggle({ start: 0, end: 300 }, false, bibleLine);
    expect(after.start).toBeCloseTo(-30);
    expect(after.end).toBeCloseTo(270);
    const reformation = rangeAfterChurchToggle({ start: 1500, end: 1700 }, false, bibleLine);
    expect(reformation.end - reformation.start).toBeCloseTo(200);
    expect(reformation.start).toBeLessThan(bibleLine.end);
  });

  it("leaves a view within the Bible's years, and any view when switched on", () => {
    const acts = { start: 20, end: 70 };
    expect(rangeAfterChurchToggle(acts, false, bibleLine)).toBe(acts);
    const reformation = { start: 1500, end: 1700 };
    expect(rangeAfterChurchToggle(reformation, true, bibleLine)).toBe(reformation);
  });
});

describe("eras by year", () => {
  it("names the Bible's era where the two tracks overlap", () => {
    expect(eraAt(timeline.eras, 45)?.slug).toBe("apostolic");
  });

  it("names the church's past the Bible's last era", () => {
    expect(eraAt(timeline.eras, 80)?.slug).toBe("church-apostolic");
    expect(eraAt(timeline.eras, 250)?.slug).toBe("church-ante-nicene");
    expect(eraAt(timeline.eras, 700)).toBeUndefined();
  });

  it("keeps a Bible event to the Bible's eras", () => {
    expect(bibleEraOf(bibleEvent(9, 57, 57.003), timeline.eras)?.slug).toBe("apostolic");
    // After the Bible's last era: in none, not in Schaff's apostolic age.
    expect(bibleEraOf(bibleEvent(9, 61, 61.003), timeline.eras)).toBeUndefined();
  });

  it("names a church event's era as the data files it, never from its years", () => {
    const eras = [...timeline.eras, era("church-late-medieval", 1294, 1517, "church"), era("church-reformation", 1517, 1648, "church"), era("church-puritan", 1648, 1790, "church")];
    // Born in the late Middle Ages, filed with the Reformation.
    const luther = { ...churchEvent(10, 1483.858, 1546, { kind: "life", date: "1483-11-10" }), era: "church-reformation" };
    expect(churchEraOf(luther, eras)?.slug).toBe("church-reformation");
    // A boundary year goes to the age it closes.
    const westphalia = { ...churchEvent(11, 1648, 1648), era: "church-reformation" };
    expect(churchEraOf(westphalia, eras)?.slug).toBe("church-reformation");
    // Served without its era, it is named in none rather than guessed.
    expect(churchEraOf(churchEvent(10, 1483.858, 1546, { kind: "life" }), eras)).toBeUndefined();
    expect(churchEraOf({ ...luther, era: null }, eras)).toBeUndefined();
    // Only a church event, and only a church era.
    expect(churchEraOf({ ...bibleEvent(12, 57, 57.003), era: "apostolic" }, eras)).toBeUndefined();
    expect(churchEraOf({ ...churchEvent(13, 52, 52), era: "apostolic" }, eras)).toBeUndefined();
  });
});

describe("frames", () => {
  it("fits an era with a twentieth either side", () => {
    expect(eraFrame({ start_year: 100, end_year: 300 })).toEqual({ start: 90, end: 310 });
  });

  it("frames AD 30 to the present", () => {
    const f = churchFrame(timeline, 2026)!;
    const pad = (2026 - 30) * 0.02;
    expect(f.start).toBeCloseTo(30 - pad);
    expect(f.end).toBeCloseTo(2026 + pad);
    expect(churchJumpLabel(timeline)).toBe("AD 30–present");
  });

  it("reaches this year when the content was built in an earlier one", () => {
    expect(churchFrame(timeline, 2031)!.end).toBeGreaterThan(2031);
  });

  it("has no church frame without church history", () => {
    expect(churchFrame(bibleOnly(timeline), 2026)).toBeNull();
    expect(churchJumpLabel(bibleOnly(timeline))).toBeNull();
  });

  it("runs the whole line from before Creation to the present, or to Acts without church history", () => {
    const whole = wholeFrame(timeline, 2026);
    expect(whole.start).toBe(BIBLE_RANGE.start);
    expect(whole.end).toBeGreaterThan(2026);
    expect(wholeFrame(bibleOnly(timeline), 2026)).toEqual(BIBLE_RANGE);
  });
});

describe("dates", () => {
  const at = (start: number, end: number, extra: Partial<TimelineEvent> = {}) => churchDateLabel({ start_year: start, end_year: end, date: null, circa: false, ...extra });

  it("reads the month or day a source prints", () => {
    expect(parseEventDate("1483-11-10")).toEqual({ year: 1483, month: 11, day: 10 });
    expect(parseEventDate("0064-07")).toEqual({ year: 64, month: 7, day: null });
    expect(parseEventDate(null)).toBeNull();
    expect(parseEventDate("1483")).toBeNull();
    expect(parseEventDate("1483-13-01")).toBeNull();
  });

  it("a year, and an approximate one", () => {
    expect(at(52, 52)).toBe("AD 52");
    expect(at(190, 190, { circa: true })).toBe("c. AD 190");
  });

  it("a month and a day", () => {
    expect(at(64, 64, { date: "0064-07" })).toBe("July AD 64");
    expect(at(70, 70, { date: "0070-08-10" })).toBe("10 August AD 70");
    // A day placed part-way through its year still reads as that year.
    expect(at(70.6, 70.603, { date: "0070-08-10" })).toBe("10 August AD 70");
  });

  it("spans, with or without a start date", () => {
    expect(at(255, 256)).toBe("AD 255–256");
    expect(at(66, 70, { date: "0066-05" })).toBe("May AD 66 – 70");
    expect(at(1545, 1563, { date: "1545-12-13" })).toBe("13 December AD 1545 – 1563");
    expect(at(1100, 1150, { circa: true })).toBe("c. AD 1100–1150");
  });

  it("a life as born–died", () => {
    expect(at(185, 254)).toBe("AD 185–254");
    expect(at(1483, 1546, { date: "1483-11-10" })).toBe("10 November AD 1483 – 1546");
    expect(at(296, 373, { circa: true })).toBe("c. AD 296–373");
  });

  it("reads BC as the Bible's years do", () => {
    expect(at(-3, -3)).toBe("4 BC");
    expect(at(-3, 30)).toBe("4 BC–AD 30");
    expect(at(-3, 30, { date: "-0003-03" })).toBe("March 4 BC – AD 30");
  });

  it("dates any event by its own kind of date", () => {
    expect(eventDateLabel(bibleEvent(1, -1014, -974))).toBe("1015–975 BC");
    expect(eventDateLabel(churchEvent(2, 1509, 1564, { date: "1509-07-10" }))).toBe("10 July AD 1509 – 1564");
  });
});

describe("kinds", () => {
  it("names each kind, and none for a Bible event", () => {
    expect(kindLabel("council")).toBe("Council");
    expect(kindLabel("life")).toBe("Life");
    expect(kindLabel("writing")).toBe("Writing");
    expect(kindLabel("mission")).toBe("Mission");
    expect(kindLabel("event")).toBe("Event");
    expect(kindLabel(null)).toBeNull();
  });

  it("says on hover what a church mark stands for, and its date as the source gives it", () => {
    expect(eventHoverText(churchEvent(1, 1618, 1619, { title: "Synod of Dort", kind: "council", date: "1618-11-13" }))).toBe(
      "Synod of Dort · Council · 13 November AD 1618 – 1619",
    );
    expect(eventHoverText(churchEvent(2, 170, 170, { title: "Tatian's Diatessaron", kind: "writing", circa: true }))).toBe("Tatian's Diatessaron · Writing · c. AD 170");
    expect(eventHoverText(churchEvent(3, 64, 64, { title: "The fire of Rome" }))).toBe("The fire of Rome · AD 64");
    expect(eventHoverText(bibleEvent(4, -1014, -974))).toBe("bible 4 · 1015–975 BC");
  });
});

describe("citations", () => {
  it("writes a citation down as work, volume and place", () => {
    expect(citationLine({ work: "Schaff, History of the Christian Church", volume: "II", locator: "§ 187. Origen." })).toBe(
      "Schaff, History of the Christian Church, vol. II, § 187. Origen",
    );
    expect(citationLine({ work: "Lausanne Movement", volume: null, locator: "Lausanne I: The International Congress on World Evangelization" })).toBe(
      "Lausanne Movement, Lausanne I: The International Congress on World Evangelization",
    );
    expect(citationLine({ work: "World Council of Churches", volume: null, locator: null })).toBe("World Council of Churches");
  });

  it("names the site a web citation links to", () => {
    expect(citationHost("https://encyclopedia.ushmm.org/content/en/article/dietrich-bonhoeffer")).toBe("encyclopedia.ushmm.org");
    expect(citationHost("https://www.vatican.va/content/paul-vi/en.html")).toBe("vatican.va");
    expect(citationHost(null)).toBeNull();
    expect(citationHost("schaff-hcc-1.txt")).toBeNull();
    expect(citationHost("javascript:alert(1)")).toBeNull();
  });
});

describe("links", () => {
  it("reads a confession's title as a link", () => {
    expect(confessionLinkLabel("Westminster Confession of Faith")).toBe("Read the Westminster Confession of Faith");
    expect(confessionLinkLabel("Apostles’ Creed")).toBe("Read the Apostles’ Creed");
    expect(confessionLinkLabel("The Directory for Family-Worship")).toBe("Read the Directory for Family-Worship");
  });

  it("finds a library book by its file name in the pack", () => {
    const book = (id: number, key: string | null): Resource => ({
      id,
      kind: "epub",
      title: `book ${id}`,
      author: null,
      file_path: "",
      has_text: true,
      added_at: "",
      bundled: key != null,
      library_key: key,
    });
    const resources = [book(1, null), book(2, "The Apostolic Fathers.epub"), book(3, "Institutes of the Christian Religion.epub")];
    const installed = [{ installed: false }, { installed: true }];
    expect(findLibraryResource(resources, "Institutes of the Christian Religion.epub", installed)?.id).toBe(3);
    expect(findLibraryResource(resources, "The Works of Flavius Josephus.epub", installed)).toBeNull();
    expect(findLibraryResource(undefined, "The Apostolic Fathers.epub", installed)).toBeNull();
    expect(findLibraryResource(resources, null, installed)).toBeNull();
  });

  it("offers no library book when no pack is installed, whatever rows survive from a bundled build", () => {
    const survivor: Resource = {
      id: 2,
      kind: "epub",
      title: "The Apostolic Fathers",
      author: null,
      file_path: "",
      has_text: true,
      added_at: "",
      bundled: true,
      library_key: "The Apostolic Fathers.epub",
    };
    expect(findLibraryResource([survivor], "The Apostolic Fathers.epub", [{ installed: false }])).toBeNull();
    expect(findLibraryResource([survivor], "The Apostolic Fathers.epub", [])).toBeNull();
    // Not known yet: never offered on a guess.
    expect(findLibraryResource([survivor], "The Apostolic Fathers.epub", undefined)).toBeNull();
  });

  it("names a book from its file", () => {
    expect(libraryBookName("The Works of Flavius Josephus.epub")).toBe("The Works of Flavius Josephus");
  });
});
