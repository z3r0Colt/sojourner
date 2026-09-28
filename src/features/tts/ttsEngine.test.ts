import { describe, expect, it } from "vitest";
import { RenderQueue, splitForQuickStart } from "./ttsEngine";

describe("splitForQuickStart", () => {
  it("leaves a short verse whole", () => {
    const verse = "Jesus wept.";
    expect(splitForQuickStart(verse)).toEqual([verse]);
  });

  it("gives the first sentence of a long verse its own piece", () => {
    const verse = "The LORD is my shepherd; I shall not want. He maketh me to lie down in green pastures: he leadeth me beside the still waters.";
    const pieces = splitForQuickStart(verse);
    expect(pieces).toHaveLength(2);
    expect(pieces[0]).toBe("The LORD is my shepherd;");
    expect(pieces.join(" ")).toBe(verse);
  });

  it("never cuts inside a clause", () => {
    // No sentence punctuation at all, so there is nowhere to break: the verse
    // is rendered whole rather than sliced mid-phrase.
    const verse =
      "And God said Let there be a firmament in the midst of the waters and let it divide the waters from the waters which is a very long verse indeed";
    expect(splitForQuickStart(verse)).toEqual([verse]);
  });

  it("cuts the rest of a long passage into pieces of whole sentences, so a render under way is soon over", () => {
    // Sinners in the Hands: 400 characters, which rendered as one call of the
    // model after its first sentence -- seconds a reader who jumped elsewhere
    // had to wait out.
    const passage =
      "As he that walks in slippery places is every moment liable to fall. He cannot foresee one moment whether he shall stand or fall the next; and when he does fall, he falls at once without warning. Which is also expressed in Psalm 73, verses 18 and 19: Surely thou didst set them in slippery places; thou castedst them down into destruction. How are they brought into desolation as in a moment!";
    const pieces = splitForQuickStart(passage);
    expect(pieces[0]).toBe("As he that walks in slippery places is every moment liable to fall.");
    expect(pieces.length).toBeGreaterThan(2);
    for (const piece of pieces.slice(1)) expect(piece.length).toBeLessThanOrEqual(200);
    expect(pieces.join(" ")).toBe(passage);
    // Every piece ends where a sentence or a clause does.
    for (const piece of pieces.slice(0, -1)) expect(piece).toMatch(/[.;:!?]$/);
  });

  it("breaks at a full stop and a dash, as the old printers set one sentence before the next", () => {
    const passage =
      "The observation from the words that I would now insist upon is this.—“There is nothing that keeps wicked men at any one moment out of hell, but the mere pleasure of God.” By the mere pleasure of God, I mean his sovereign pleasure.";
    const pieces = splitForQuickStart(passage);
    expect(pieces[0]).toBe("The observation from the words that I would now insist upon is this.—");
    expect(pieces[1].startsWith("“There is nothing")).toBe(true);
    expect(pieces.join("")).toBe(passage);
    // A dash inside a sentence is no break.
    expect(splitForQuickStart("He is our God—the God of our fathers—and we will praise him forever and ever, world without end.")).toHaveLength(1);
  });

  it("keeps the quotation mark with the sentence it closes", () => {
    const verse =
      'And he said unto them, "Follow me, and I will make you fishers of men." And they straightway left their nets, and followed him, and went their way.';
    const pieces = splitForQuickStart(verse);
    expect(pieces[0].endsWith('men."')).toBe(true);
    expect(pieces.join(" ")).toBe(verse);
  });
});

describe("RenderQueue", () => {
  /** A stand-in for the voice: each render waits until it is let go, and the
   * order renders were started in is written down. */
  function voice() {
    const started: string[] = [];
    const turns = new Map<string, number>();
    const finish = new Map<string, () => void>();
    const run = (key: string) => (turn: number) =>
      new Promise<string>((resolve) => {
        started.push(key);
        turns.set(key, turn);
        finish.set(key, () => resolve(key));
      });
    return { started, turns, run, done: (key: string) => finish.get(key)?.() };
  }
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it("sends one render at a time, the passage wanted now before one asked for ahead", async () => {
    const v = voice();
    const q = new RenderQueue<string>();
    const first = q.add("v1", "now", v.run("v1"));
    // Verse 2 was asked for ahead a moment after verse 1 -- and used to win
    // the voice's lock about as often as not.
    void q.add("v2", "ahead", v.run("v2"));
    void q.add("v1-rest", "now", v.run("v1-rest"));
    expect(v.started).toEqual(["v1"]);
    v.done("v1");
    expect(await first).toBe("v1");
    await tick();
    expect(v.started).toEqual(["v1", "v1-rest"]);
    v.done("v1-rest");
    await tick();
    expect(v.started).toEqual(["v1", "v1-rest", "v2"]);
  });

  it("drops what the reader has left, and sends the passage jumped to without waiting for the one under way", async () => {
    const v = voice();
    const q = new RenderQueue<string>();
    void q.add("p1", "now", v.run("p1"));
    const left = q.add("p2", "ahead", v.run("p2"));
    const leftToo = q.add("p3", "ahead", v.run("p3"));
    // The reader jumps to passage 40: the two waiting are dropped, and the
    // one under way is let go of.
    expect(q.drop(new Set(["p40"]))).toEqual(["p2", "p3", "p1"]);
    await expect(left).rejects.toThrow();
    await expect(leftToo).rejects.toThrow();
    void q.add("p40", "now", v.run("p40"));
    // Sent at once, in a later turn, which tells the voice to stop p1 at the
    // next place it can.
    expect(v.started).toEqual(["p1", "p40"]);
    expect(v.turns.get("p40")!).toBeGreaterThan(v.turns.get("p1")!);
    // And one at a time again from there: the passage after it waits.
    void q.add("p41", "ahead", v.run("p41"));
    v.done("p1");
    await tick();
    expect(v.started).toEqual(["p1", "p40"]);
    v.done("p40");
    await tick();
    expect(v.started).toEqual(["p1", "p40", "p41"]);
  });

  it("keeps the render under way when it is still wanted, in the same turn", async () => {
    const v = voice();
    const q = new RenderQueue<string>();
    void q.add("v5", "ahead", v.run("v5"));
    // Verse 5, asked for ahead, is now the verse to read: nothing is let go.
    expect(q.drop(new Set(["v5"]))).toEqual([]);
    void q.add("v6", "ahead", v.run("v6"));
    expect(v.started).toEqual(["v5"]);
    v.done("v5");
    await tick();
    expect(v.started).toEqual(["v5", "v6"]);
    expect(v.turns.get("v6")).toBe(v.turns.get("v5"));
  });

  it("never lets a turn go backwards, even across a reload of the page", () => {
    const v = voice();
    const q = new RenderQueue<string>();
    void q.add("a", "now", v.run("a"));
    // The voice remembers the latest turn for as long as the app runs; a page
    // reloaded starts its turns from the clock, past any it had before.
    expect(v.turns.get("a")!).toBeGreaterThanOrEqual(Date.now() - 1000);
  });

  it("moves a render asked for ahead to the front when it is wanted now, and asks for it once", async () => {
    const v = voice();
    const q = new RenderQueue<string>();
    void q.add("a", "now", v.run("a"));
    void q.add("b", "ahead", v.run("b"));
    const c = q.add("c", "ahead", v.run("c"));
    expect(q.add("c", "now", v.run("c"))).toBe(c);
    expect(q.isWaiting("c")).toBe(true);
    v.done("a");
    await tick();
    expect(v.started).toEqual(["a", "c"]);
    expect(q.isWaiting("c")).toBe(false);
  });

  it("carries on after a render fails", async () => {
    const q = new RenderQueue<string>();
    const failed = q.add("bad", "now", () => Promise.reject(new Error("the voice could not read this passage")));
    const next = q.add("good", "now", () => Promise.resolve("good"));
    await expect(failed).rejects.toThrow("could not read");
    expect(await next).toBe("good");
  });
});
