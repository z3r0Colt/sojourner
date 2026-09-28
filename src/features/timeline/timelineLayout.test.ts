import { describe, expect, it } from "vitest";
import type { TimelineEvent } from "../../api/types";
import {
  durationLabel,
  fitLabel,
  importance,
  inReach,
  labelPlacement,
  packBands,
  packBandsWithSelection,
  packRows,
  PIN_TEXT_X,
  spanLabel,
  ticks,
  viewShare,
  yearLabel,
} from "./timelineLayout";

const event = (id: number, start: number, end: number, more: Partial<TimelineEvent> = {}): TimelineEvent => ({
  id,
  title: `e${id}`,
  start_year: start,
  end_year: end,
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

const churchEvent = (id: number, start: number, end: number, more: Partial<TimelineEvent> = {}) =>
  event(id, start, end, { source: "church", kind: "event", ...more });

/** Two placed events collide when they share a row and their taken spans
 * (from where the mark or label begins to where either ends) overlap. */
type Taken = { row: number; xFrom: number; xLabel: number };
const collide = (a: Taken, b: Taken) => a.row === b.row && a.xFrom < b.xLabel && b.xFrom < a.xLabel;

describe("years", () => {
  it("reads astronomical years as BC and AD", () => {
    expect(yearLabel(-587)).toBe("588 BC");
    expect(yearLabel(-586.5)).toBe("588 BC"); // halfway through 588 BC
    expect(yearLabel(0)).toBe("1 BC");
    expect(yearLabel(1)).toBe("AD 1");
    expect(yearLabel(30.25)).toBe("AD 30");
  });

  it("spans", () => {
    expect(spanLabel(-1014, -974)).toBe("1015–975 BC");
    expect(spanLabel(-3, 30)).toBe("4 BC–AD 30");
    expect(spanLabel(-587, -587)).toBe("588 BC");
    expect(spanLabel(46, 49)).toBe("AD 46–49");
  });

  it("durations", () => {
    expect(durationLabel(0, 40)).toBe("40 years");
    expect(durationLabel(0, 8 / 365.25)).toBe("8 days");
    expect(durationLabel(0, 3 / 12 + 10 / 365.25)).toBe("3 months");
    expect(durationLabel(0, 0)).toBeNull();
  });

  it("ticks fall on round historical years either side of the era", () => {
    const t = ticks(-700, 100, 800);
    expect(t.map(([, l]) => l)).toContain("600 BC");
    expect(t.map(([, l]) => l)).toContain("AD 100");
    const at600 = t.find(([, l]) => l === "600 BC")![0];
    expect(at600).toBe(-599);
  });
});

/** A placement's side and box, without the flags that are false. */
const where = (at: ReturnType<typeof labelPlacement>) =>
  at && { ...(at.inside && { inside: true }), ...(at.before && { before: true }), ...(at.pinned && { pinned: true }), x: at.x, room: at.room, start: at.start, end: at.end };

describe("labels", () => {
  it("go inside a bar with room, else after it", () => {
    expect(where(labelPlacement(100, 300, 50, 1000))).toEqual({ inside: true, x: 108, room: 50, start: 100, end: 300 });
    expect(where(labelPlacement(100, 130, 50, 1000))).toEqual({ x: 134, room: 50, start: 100, end: 184 });
    // A dot is six pixels wide.
    expect(where(labelPlacement(100, 100, 50, 1000))).toEqual({ x: 110, room: 50, start: 100, end: 160 });
  });

  it("name a bar running in from off the left at the left edge of the view", () => {
    // Luther's life from before the view to a quarter of the way across it.
    const at = labelPlacement(-120, 235, 80, 1000)!;
    expect(at.inside).toBe(true);
    expect(at.x).toBe(8);
    expect(at.start).toBe(-120);
    // Only what shows of the bar counts: most of this one is off the left.
    expect(where(labelPlacement(-500, 60, 80, 1000))).toEqual({ x: 64, room: 80, start: -500, end: 144 });
  });

  it("go before the mark where after it would run off the right edge", () => {
    // Karl Barth's life ending at the right edge of "AD 30–present".
    expect(where(labelPlacement(950, 985, 70, 1000))).toEqual({ before: true, x: 876, room: 70, start: 876, end: 985 });
    // A bar running on past the edge, with too little of it in view.
    expect(where(labelPlacement(960, 1400, 70, 1000))).toEqual({ before: true, x: 886, room: 70, start: 886, end: 1400 });
    // Without a width there is no right edge to run off.
    expect(labelPlacement(950, 985, 70)!.x).toBe(989);
  });

  it("are cut short where there is most room when they fit whole nowhere", () => {
    // Calvin's Institutes in a 317px pane: 250px of title, the mark two
    // thirds of the way across. Before the mark has the most room.
    expect(where(labelPlacement(210, 216, 250, 317))).toEqual({ before: true, x: 0, room: 206, start: 0, end: 216 });
    // Near the left edge, after it has.
    expect(where(labelPlacement(30, 40, 990, 1000))).toEqual({ x: 44, room: 956, start: 30, end: 1000 });
    // A life across the whole of a narrow view: inside what shows of it.
    expect(where(labelPlacement(-400, 900, 400, 300))).toEqual({ inside: true, x: 8, room: 284, start: -400, end: 900 });
    // Too little room anywhere for a name: the mark alone.
    expect(where(labelPlacement(20, 26, 250, 60))).toEqual({ x: 30, room: 0, start: 20, end: 30 });
  });

  it("never leave the tail of a name whose mark is off the left edge", () => {
    // "Reformed Dogmatics", its mark 40px off the left edge: its label would
    // have run into the view as "rmed Dogmatics". It is pinned whole instead.
    expect(where(labelPlacement(-46, -40, 120, 1000))).toEqual({ pinned: true, x: PIN_TEXT_X, room: 120, start: 0, end: PIN_TEXT_X + 120 });
    // Once none of it would have shown, it is gone.
    expect(labelPlacement(-200, -190, 120, 1000)).toBeNull();
    // And where it cannot be pinned whole -- wider than a narrow view -- so is it.
    expect(labelPlacement(-46, -40, 300, 200)).toBeNull();
    // A mark past the right edge shows nothing.
    expect(labelPlacement(1005, 1011, 10, 1000)).toBeNull();
  });

  it("hold the row from a label before the mark to the end of the bar", () => {
    const x = (y: number) => y;
    // Two events near the right edge whose labels go before their marks: the
    // second's label would run over the first's mark, so it takes a row of its own.
    const { placed } = packRows([event(1, 960, 960), event(2, 980, 980)], x, () => 40, 5, 1000);
    const at = (id: number) => placed.find((p) => p.event.id === id)!;
    expect(at(1).xFrom).toBe(960 - 4 - 40 - 4);
    expect(at(1).xLabel).toBe(966 + 8);
    expect(at(2).row).not.toBe(at(1).row);
    expect(collide(at(1), at(2))).toBe(false);
  });

  it("hold the row for as much of a title as is shown", () => {
    const x = (y: number) => y;
    // In a 317px view, a 250px title cut to fit before its mark takes the
    // row from the left edge, and a mark after it has the rest of the row.
    const { placed } = packRows([event(1, 210, 210), event(2, 250, 250)], x, (e) => (e.id === 1 ? 250 : 30), 5, 317);
    const at = (id: number) => placed.find((p) => p.event.id === id)!;
    expect(at(1).label).toMatchObject({ before: true, room: 206 });
    expect(at(1).xFrom).toBe(-4);
    expect(at(2).row).toBe(at(1).row);
    expect(collide(at(1), at(2))).toBe(false);
  });
});

describe("a title cut short", () => {
  // Every character four pixels wide.
  const measure = (s: string) => s.length * 4;

  it("is whole where it fits", () => {
    expect(fitLabel("Synod of Dort", 100, measure)).toBe("Synod of Dort");
  });

  it("ends at a word, with an ellipsis", () => {
    const title = "Calvin's Institutes of the Christian religion";
    expect(fitLabel(title, 120, measure)).toBe("Calvin's Institutes of the…");
    expect(fitLabel(title, 90, measure)).toBe("Calvin's Institutes…");
    // Punctuation the cut would leave hanging goes with the words after it.
    expect(fitLabel("Luther, Martin, reformer", 36, measure)).toBe("Luther…");
    expect(fitLabel("Council of Trent – first session", 76, measure)).toBe("Council of Trent…");
  });

  it("cuts a word too long for the room, four letters at least, else shows nothing", () => {
    expect(fitLabel("Constantinople falls", 44, measure)).toBe("Constantin…");
    expect(fitLabel("Constantinople falls", 20, measure)).toBe("Cons…");
    expect(fitLabel("Constantinople falls", 16, measure)).toBe("");
  });

  it("keeps the names a title goes on to, which tell neighbours apart", () => {
    // Three rows of "Lifetime of…" would read the same.
    expect(fitLabel("Lifetime of Methuselah", 80, measure)).toBe("Lifetime… Methuselah");
    expect(fitLabel("Lifetime of Methuselah", 60, measure)).toBe("…Methuselah");
    expect(fitLabel("Lifetime of Cainan", 64, measure)).toBe("Lifetime… Cainan");
    // The first name, not the last: both of these end in Rome.
    expect(fitLabel("Martyrdom of Paul in Rome", 92, measure)).toBe("Martyrdom… Paul in Rome");
    expect(fitLabel("Martyrdom of Peter in Rome", 64, measure)).toBe("…Peter in Rome");
    expect(fitLabel("Abraham goes to Egypt", 80, measure)).toBe("Abraham goes… Egypt");
    // A title that opens with a name keeps its beginning and its end.
    expect(fitLabel("Charles Haddon Spurgeon", 72, measure)).toBe("Charles… Spurgeon");
    expect(fitLabel("Calvin's Institutes of the Christian Religion", 120, measure)).toBe("Calvin's Institutes… Religion");
    // Where not even the name fits, the beginning is cut as before.
    expect(fitLabel("Lifetime of Methuselah", 40, measure)).toBe("Lifetime…");
    // A name too short to say much is no better than the beginning.
    expect(fitLabel("Death of Og", 36, measure)).toBe("Death of…");
  });

  it("does not cut to a word that names nothing", () => {
    // "The…" says nothing of which era it is; "The Re…" says a little.
    expect(fitLabel("The Reformation", 28, measure)).toBe("The Re…");
    expect(fitLabel("The Reformation", 16, measure)).toBe("");
  });
});

describe("rows", () => {
  it("puts overlapping events on separate rows and reuses a free one", () => {
    const x = (y: number) => y;
    const { placed } = packRows([event(1, 0, 50), event(2, 10, 20), event(3, 100, 110)], x, () => 20, 5, 1000);
    const row = (id: number) => placed.find((p) => p.event.id === id)!.row;
    expect(row(1)).toBe(0);
    expect(row(2)).toBe(1);
    expect(row(3)).toBe(0);
  });

  it("places the more important first when room runs out", () => {
    const x = (y: number) => y;
    const { placed } = packRows([event(1, 0, 50), event(2, 1, 5), event(3, 2, 50)], x, () => 10, 1, 1000, (e) => (e.id === 3 ? 1 : 0));
    expect(placed.map((p) => p.event.id)).toEqual([3]);
  });

  it("leaves out what does not fit and says how many", () => {
    const x = (y: number) => y;
    const { placed, hidden, rows } = packRows([event(1, 0, 50), event(2, 1, 50), event(3, 2, 50)], x, () => 10, 2, 1000);
    expect(placed).toHaveLength(2);
    expect(hidden).toBe(1);
    expect(rows).toBe(2);
  });

  it("packs only what shows in the view, and says how many rows it took", () => {
    const x = (y: number) => y;
    const label = (w: number) => () => w;
    expect(inReach(event(1, 500, 510), x, 1000, label(10))).toBe(true);
    // A mark off the left edge is not in reach, even where its name is
    // pinned there.
    expect(inReach(event(1, -150, -120), x, 1000, label(200))).toBe(false);
    expect(inReach(event(1, -150, -120), x, 1000, label(10))).toBe(false);
    expect(inReach(event(1, -900, -800), x, 1000, label(10))).toBe(false);
    // A bar running in from the left is.
    expect(inReach(event(1, -150, 20), x, 1000, label(10))).toBe(true);
    // Past the right edge nothing of it shows, its label least of all.
    expect(inReach(event(1, 995, 1000), x, 1000, label(10))).toBe(true);
    expect(inReach(event(1, 1005, 1010), x, 1000, label(10))).toBe(false);
    expect(inReach(event(1, 1300, 1310), x, 1000, label(10))).toBe(false);
    const { placed, hidden, rows } = packRows([event(1, -900, -800), event(2, 1300, 1310), event(3, 1001, 1001)], x, () => 10, 5, 1000);
    expect(placed).toHaveLength(0);
    expect(hidden).toBe(0);
    expect(rows).toBe(0);
  });

  it("pins names whose marks are off the left edge only into room the rows have", () => {
    const x = (y: number) => y;
    // Row 0: an event at the left edge and one further along; row 1, under
    // that one, one it overlaps. Two marks just off the left, whose labels
    // would have run into the view.
    const inView = [event(1, 10, 10), event(2, 300, 300), event(5, 320, 320)];
    const offLeft = [event(3, -60, -60), event(4, -40, -40)];
    const rank = (e: TimelineEvent) => (e.id === 2 ? 2 : e.id === 5 ? 1 : 0);
    const { placed, hidden, rows } = packRows([...inView, ...offLeft], x, () => 100, 5, 1000, rank);
    const at = (id: number) => placed.find((p) => p.event.id === id);
    expect(rows).toBe(2);
    expect([at(1)?.row, at(2)?.row, at(5)?.row]).toEqual([0, 0, 1]);
    // The nearer of the two off the left is pinned into the room row 1 has
    // at the left edge; the other finds none and is simply not shown -- no
    // row is opened for it, and it is not counted among those left out.
    expect(at(4)?.label.pinned).toBe(true);
    expect(at(4)?.row).toBe(1);
    expect(at(3)).toBeUndefined();
    expect(hidden).toBe(0);
    // Nothing in view: nothing is pinned, and no rows are taken.
    expect(packRows(offLeft, x, () => 100, 5, 1000)).toEqual({ placed: [], hidden: 0, rows: 0 });
  });

  it("asks each event's priority once, not at every comparison", () => {
    const x = (y: number) => y;
    const events = Array.from({ length: 200 }, (_, i) => event(i + 1, (i * 37) % 900, ((i * 37) % 900) + 20));
    let asked = 0;
    packRows(events, x, () => 10, 40, 1000, (e) => {
      asked++;
      return e.id % 7;
    });
    expect(asked).toBe(events.length);
  });
});

describe("church history's band", () => {
  const x = (y: number) => y;
  const width = 1000;

  it("never shares a row with the Bible's, even where they overlap in time", () => {
    const bible = [event(1, 0, 60), event(2, 10, 20), event(3, 30, 40)];
    const church = [churchEvent(10, 0, 5), churchEvent(11, 30, 100, { kind: "life" }), churchEvent(12, 200, 200)];
    const { bible: b, church: c } = packBands(bible, church, x, () => 20, 10, width);
    expect(b.placed).toHaveLength(3);
    expect(c.placed).toHaveLength(3);
    // The church band's rows sit below the Bible's: in canvas rows, row + b.rows.
    const canvasRows = [...b.placed.map((p) => ({ ...p, band: "bible" })), ...c.placed.map((p) => ({ ...p, row: p.row + b.rows, band: "church" }))];
    for (const p of canvasRows) {
      for (const q of canvasRows) {
        if (p !== q && p.row === q.row) expect(p.band).toBe(q.band);
        if (p !== q) expect(collide(p, q)).toBe(false);
      }
    }
    expect(Math.min(...c.placed.map((p) => p.row + b.rows))).toBeGreaterThanOrEqual(b.rows);
  });

  it("shares the rows evenly where both span the same years, and the Bible keeps the odd one", () => {
    // Everything overlaps everything, so each event needs a row of its own.
    const bible = Array.from({ length: 10 }, (_, i) => event(i + 1, i, 100));
    const church = Array.from({ length: 10 }, (_, i) => churchEvent(i + 101, i, 100));
    const even = packBands(bible, church, x, () => 20, 6, width);
    expect(even.church.rows).toBe(3);
    expect(even.bible.rows).toBe(3);
    expect(even.bible.hidden).toBe(7);
    expect(even.church.hidden).toBe(7);
    const odd = packBands(bible, church, x, () => 20, 7, width);
    expect(odd.church.rows).toBe(3);
    expect(odd.bible.rows).toBe(4);
  });

  it("gives a sliver of church history at the right edge a row, not a quarter of them", () => {
    // The Bible's events across the whole view, the first century's crowded
    // into its last few pixels, as at the end of the "Bible" jump: 95% of the
    // view against 4%.
    const bible = Array.from({ length: 40 }, (_, i) => event(i + 1, i, 950));
    const church = Array.from({ length: 20 }, (_, i) => churchEvent(i + 101, 950 + i, 990));
    expect(viewShare(bible, x, () => 20, width)).toBeCloseTo(0.95);
    expect(viewShare(church, x, () => 20, width)).toBeCloseTo(0.04);
    const { bible: b, church: c } = packBands(bible, church, x, () => 20, 30, width);
    expect(c.rows).toBe(1);
    expect(b.rows).toBe(29);
  });

  it("gives church history more rows as it spans more of the view, and a quarter from a fifth of it", () => {
    const bible = Array.from({ length: 40 }, (_, i) => event(i + 1, i, 1000));
    const churchFrom = (start: number) => Array.from({ length: 40 }, (_, i) => churchEvent(i + 101, start + i / 10, 1000));
    // A tenth of the view: an eighth of the rows, where an even split by span would give it a twelfth.
    expect(packBands(bible, churchFrom(900), x, () => 20, 32, width).church.rows).toBe(4);
    // A fifth: a quarter.
    expect(packBands(bible, churchFrom(800), x, () => 20, 32, width).church.rows).toBe(8);
  });

  it("gives church history three quarters of a view that is mostly its years", () => {
    const bible = Array.from({ length: 20 }, (_, i) => event(i + 1, i, 40));
    const church = Array.from({ length: 20 }, (_, i) => churchEvent(i + 101, i, 1000));
    const { bible: b, church: c } = packBands(bible, church, x, () => 20, 8, width);
    expect(c.rows).toBe(6);
    expect(b.rows).toBe(2);
  });

  it("gives a council just past the right edge no row, and the Bible all of them", () => {
    const bible = Array.from({ length: 10 }, (_, i) => event(i + 1, i, 900));
    const { bible: b, church: c } = packBands(bible, [churchEvent(101, 1010, 1010, { kind: "council" })], x, () => 20, 6, width);
    expect(c).toEqual({ placed: [], hidden: 0, rows: 0 });
    expect(b.rows).toBe(6);
  });

  it("hands the Bible's unused rows to church history", () => {
    const bible = [event(1, 0, 100)];
    const church = Array.from({ length: 10 }, (_, i) => churchEvent(i + 101, i, 100));
    const { bible: b, church: c } = packBands(bible, church, x, () => 20, 6, width);
    expect(b.rows).toBe(1);
    expect(c.rows).toBe(5);
    expect(c.hidden).toBe(5);
  });

  it("hands church history's unused rows to the Bible", () => {
    const bible = Array.from({ length: 10 }, (_, i) => event(i + 1, i, 100));
    const church = [churchEvent(101, 0, 100)];
    const { bible: b, church: c } = packBands(bible, church, x, () => 20, 6, width);
    expect(c.rows).toBe(1);
    expect(b.rows).toBe(5);
  });

  it("gives every row to whichever history the view holds alone", () => {
    const bible = Array.from({ length: 10 }, (_, i) => event(i + 1, -3000 + i, -2900));
    const church = Array.from({ length: 10 }, (_, i) => churchEvent(i + 101, i, 100));
    // The Bible's are thousands of pixels off to the left: church history has all six.
    const churchOnly = packBands(bible, church, x, () => 20, 6, width);
    expect(churchOnly.bible.rows).toBe(0);
    expect(churchOnly.church.rows).toBe(6);
    // And the other way about.
    const bibleOnly = packBands(bible, church, (y) => y + 3000, () => 20, 6, width);
    expect(bibleOnly.church.rows).toBe(0);
    expect(bibleOnly.bible.rows).toBe(6);
  });

  it("with a single row, the Bible has it where both are in view", () => {
    const { bible: b, church: c } = packBands([event(1, 0, 100)], [churchEvent(2, 0, 100)], x, () => 20, 1, width);
    expect(b.rows).toBe(1);
    expect(c.rows).toBe(0);
    expect(c.hidden).toBe(1);
  });

  it("leaves a selected event in the row it was clicked in, and its neighbours in theirs", () => {
    // A crowded band: each event overlaps the next, so they stack.
    const church = Array.from({ length: 8 }, (_, i) => churchEvent(i + 1, i * 10, i * 10 + 30, { kind: "life" }));
    const rank = (e: TimelineEvent) => e.end_year - e.start_year + (e.id % 3);
    const rows = (b: ReturnType<typeof packBands>) => new Map(b.church.placed.map((p) => [p.event.id, p.row]));
    const before = rows(packBands([], church, x, () => 20, 10, width, rank));
    const clicked = church[5];
    expect(before.get(clicked.id)).toBeGreaterThan(0);
    expect(rows(packBandsWithSelection([], church, x, () => 20, 10, width, rank, clicked))).toEqual(before);
  });

  it("puts a selected event that would be left out first, so it shows", () => {
    const church = Array.from({ length: 6 }, (_, i) => churchEvent(i + 1, i, 100));
    const last = church[5];
    const plain = packBands([], church, x, () => 20, 3, width);
    expect(plain.church.placed.some((p) => p.event === last)).toBe(false);
    const picked = packBandsWithSelection([], church, x, () => 20, 3, width, () => 0, last);
    expect(picked.church.placed.find((p) => p.event === last)?.row).toBe(0);
    expect(picked.church.hidden).toBe(3);
    // One off the screen is not forced in.
    const away = churchEvent(99, 5000, 5000);
    expect(packBandsWithSelection([], church, x, () => 20, 3, width, () => 0, away)).toEqual(plain);
  });

  it("puts the confessions the app carries and the councils before a long life", () => {
    const life = churchEvent(1, 354, 430, { kind: "life" });
    const council = churchEvent(2, 787, 787, { kind: "council" });
    const creed = churchEvent(3, 325, 325, { kind: "council", confession: "nicene" });
    const writing = churchEvent(4, 413, 426, { kind: "writing" });
    expect(importance(creed, false)).toBeGreaterThan(importance(life, false));
    expect(importance(council, false)).toBeGreaterThan(importance(writing, false));
    expect(importance(life, false)).toBeGreaterThan(importance(writing, false));
  });
});
