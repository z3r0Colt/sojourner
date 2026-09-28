import { describe, expect, it } from "vitest";
import type { TimelineEra, TimelineEvent } from "../../api/types";
import { timelineTracks } from "./timelineTracks";

const event = (id: number, more: Partial<TimelineEvent> = {}): TimelineEvent => ({
  id,
  title: `e${id}`,
  start_year: 0,
  end_year: 0,
  precision: "year",
  parent_id: null,
  lane: null,
  note: null,
  source: "theographic",
  book_id: null,
  chapter: null,
  verse: null,
  entities: [],
  kind: null,
  circa: false,
  date: null,
  citations: [],
  confession: null,
  resource: null,
  era: null,
  ...more,
});

const era = (slug: string, start: number, end: number, track: TimelineEra["track"] = "bible"): TimelineEra => ({
  slug,
  name: slug,
  start_year: start,
  end_year: end,
  journey_era: null,
  track,
});

const ids = (events: TimelineEvent[]) => events.map((e) => e.id);

describe("what the canvas draws where", () => {
  const judahKings = event(1, { title: "The kings of Judah" });
  const israelKings = event(2, { title: "The kings of Israel" });
  const events = [
    judahKings,
    israelKings,
    event(3, { lane: "judah", parent_id: 1 }),
    event(4, { lane: "israel", parent_id: 2 }),
    event(5, { title: "The Exodus" }),
    event(6, { title: "The plagues", parent_id: 5 }),
    event(7, { source: "added" }),
    event(8, { source: "church", kind: "council" }),
    event(9, { source: "church", kind: "life" }),
  ];
  const tracks = timelineTracks({ events, eras: [] });

  it("puts the reigns in their lanes and leaves their containers out", () => {
    expect(ids(tracks.judah)).toEqual([3]);
    expect(ids(tracks.israel)).toEqual([4]);
    expect(ids(tracks.bible)).not.toContain(1);
    expect(ids(tracks.bible)).not.toContain(2);
  });

  it("packs the Bible's other events, Sojourner's additions with them", () => {
    expect(ids(tracks.bible)).toEqual([5, 6, 7]);
  });

  it("puts church history in its own band and nowhere else", () => {
    expect(ids(tracks.church)).toEqual([8, 9]);
    const elsewhere = [...tracks.judah, ...tracks.israel, ...tracks.bible].filter((e) => e.source === "church");
    expect(elsewhere).toHaveLength(0);
  });

  it("keeps a church event out of the lanes even if one were ever given a lane", () => {
    const stray = timelineTracks({ events: [event(10, { source: "church", lane: "judah" })], eras: [] });
    expect(ids(stray.church)).toEqual([10]);
    expect(stray.judah).toHaveLength(0);
  });

  it("knows which events contain others, so they pack first", () => {
    expect([...tracks.parents].sort()).toEqual([1, 2, 5]);
  });

  it("sorts the eras into the two rows, each in date order", () => {
    const t = timelineTracks({
      events: [],
      eras: [
        era("church-nicene", 311, 590, "church"),
        era("patriarchs", -1996, -1706),
        era("church-apostolic", 30, 100, "church"),
        era("primeval", -4003, -1996),
        // A timeline served without the track still sorts by the slug.
        { ...era("church-reformation", 1517, 1648), track: undefined as unknown as TimelineEra["track"] },
      ],
    });
    expect(t.bibleEras.map((e) => e.slug)).toEqual(["primeval", "patriarchs"]);
    expect(t.churchEras.map((e) => e.slug)).toEqual(["church-apostolic", "church-nicene", "church-reformation"]);
  });
});
