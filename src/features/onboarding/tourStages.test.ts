import { describe, expect, it } from "vitest";
import { advance, beginTour, skipStage, stageNumber, type TourSight } from "./tourStages";

const sight = (s: Partial<TourSight> = {}): TourSight => ({ menuOpen: false, commentaries: "", noteOpen: false, ...s });

describe("the tour", () => {
  it("asks for a verse, then a commentary, then a note, and then is done", () => {
    let p = beginTour(sight());
    expect(p.stage).toBe("verse");
    p = advance(p, sight({ menuOpen: true }));
    expect(p.stage).toBe("commentary");
    p = advance(p, sight({ commentaries: "c1:1:1:3" }));
    expect(p.stage).toBe("note");
    p = advance(p, sight({ commentaries: "c1:1:1:3", menuOpen: true }));
    expect(p.stage).toBe("note");
    p = advance(p, sight({ commentaries: "c1:1:1:3", noteOpen: true }));
    expect(p.stage).toBe("writing");
    p = advance(p, sight({ commentaries: "c1:1:1:3" }));
    expect(p.stage).toBe("done");
    expect(advance(p, sight()).stage).toBe("done");
  });

  it("goes back to asking for a verse when the menu is closed with nothing chosen", () => {
    let p = advance(beginTour(sight()), sight({ menuOpen: true }));
    p = advance(p, sight());
    expect(p.stage).toBe("verse");
  });

  it("counts a commentary already open only once it turns to a verse", () => {
    // A new install that came to study starts with Matthew Henry open.
    const open = sight({ commentaries: "c1:1:1:" });
    let p = beginTour(open);
    expect(advance(p, open).stage).toBe("verse");
    // It turns to the verse they pick: pointed out, and waits to be passed.
    p = advance(p, sight({ commentaries: "c1:1:1:3", menuOpen: true }));
    expect(p.stage).toBe("followed");
    expect(stageNumber(p.stage)).toBe(2);
    expect(advance(p, sight({ commentaries: "c1:1:1:5" })).stage).toBe("followed");
    p = skipStage(p);
    expect(p.stage).toBe("note");
  });

  it("does not count a commentary being closed", () => {
    const p = beginTour(sight({ commentaries: "c1:1:1:" }));
    expect(advance(p, sight({ commentaries: "" })).stage).toBe("verse");
  });

  it("takes a commentary opened any other way, and a note begun early", () => {
    expect(advance(beginTour(sight()), sight({ commentaries: "c9:1:1:" })).stage).toBe("note");
    expect(advance(beginTour(sight()), sight({ noteOpen: true })).stage).toBe("writing");
  });

  it("stands aside while the note is written, however long that takes", () => {
    let p = advance(beginTour(sight()), sight({ noteOpen: true }));
    for (let i = 0; i < 5; i++) p = advance(p, sight({ noteOpen: true }));
    expect(p.stage).toBe("writing");
  });

  it("lets any step be passed over", () => {
    let p = beginTour(sight());
    p = skipStage(p);
    expect(p.stage).toBe("note");
    p = skipStage(p);
    expect(p.stage).toBe("done");
  });

  it("is three steps", () => {
    expect([stageNumber("verse"), stageNumber("commentary"), stageNumber("note")]).toEqual([1, 2, 3]);
  });
});
