import { beforeEach, describe, expect, it, vi } from "vitest";

// A stand-in voice that says nothing and remembers everything: what it was
// asked to speak (with the callbacks, so a test can end or fail a passage when
// it likes), what it was asked to render ahead of time, and how often it was
// told to be quiet.
const voice = vi.hoisted(() => {
  interface Callbacks {
    onWordBoundary: (charIndex: number, charLength: number) => void;
    onEnd: () => void;
    onError: (message: string) => void;
    onSpeakingStart?: () => void;
  }
  const engine = {
    id: "webspeech",
    label: "Test voice",
    reportsWordBoundaries: true,
    readsRespellings: true,
    spoken: [] as { text: string; callbacks: Callbacks }[],
    prefetched: [] as string[],
    cancels: 0,
    isAvailable: () => true,
    listVoices: async () => [],
    speak(text: string, _opts: unknown, callbacks: Callbacks) {
      engine.spoken.push({ text, callbacks });
    },
    pause() {},
    resume() {},
    cancel() {
      engine.cancels += 1;
    },
    prefetch(text: string) {
      engine.prefetched.push(text);
    },
    reset() {
      engine.spoken = [];
      engine.prefetched = [];
      engine.cancels = 0;
    },
  };
  return engine;
});

vi.mock("../features/tts/ttsEngine", () => ({ ttsEngines: { webspeech: voice } }));
vi.mock("../features/tts/pronunciation", () => ({
  loadPronunciationLexicon: () => Promise.resolve(new Map()),
  buildSpoken: (text: string) => ({ spoken: text, chunks: [], changed: 0 }),
  toSourceIndex: (_chunks: unknown, index: number) => index,
}));

import { nothingToSay, registerQueueEndHandler, speakableFrom, useTtsStore, type TtsSegment } from "./ttsStore";
import { useToastStore } from "../components/ui/toast";

const store = () => useTtsStore.getState();
const said = () => voice.spoken.map((s) => s.text);
const speaking = () => voice.spoken[voice.spoken.length - 1];
/** The passage being spoken plays through to its end. */
function finish() {
  speaking().callbacks.onSpeakingStart?.();
  speaking().callbacks.onEnd();
}

const a: TtsSegment = { id: "a", text: "In the beginning was the Word.", label: "One" };
const b: TtsSegment = { id: "b", text: "And the Word was with God.", label: "Two" };
const c: TtsSegment = { id: "c", text: "And the Word was God.", label: "Three" };
const d: TtsSegment = { id: "d", text: "The same was in the beginning with God.", label: "Four" };
const e: TtsSegment = { id: "e", text: "All things were made by him.", label: "Five" };
const greek: TtsSegment = { id: "greek", text: "Ἐν ἀρχῇ ἦν ὁ λόγος" };
const rule: TtsSegment = { id: "rule", text: "* * *" };

beforeEach(() => {
  store().stop();
  useTtsStore.setState({ usePronunciations: false, autoContinue: true, error: null });
  useToastStore.setState({ toasts: [] });
  voice.reset();
});

describe("speakableFrom", () => {
  it("leaves out what no voice can say, keeping the rest in order", () => {
    const out = speakableFrom([a, greek, b, rule, c], 0);
    expect(out.segments.map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(out.startIndex).toBe(0);
  });

  it("moves the start to the first passage kept at or after it", () => {
    expect(speakableFrom([a, greek, rule, b], 1).startIndex).toBe(1);
    expect(speakableFrom([a, greek, rule, b], 3).startIndex).toBe(1);
    expect(speakableFrom([greek, a], 0).startIndex).toBe(0);
  });

  it("falls back to the last passage kept when nothing after the start was, and says so", () => {
    expect(speakableFrom([a, b, greek], 2)).toMatchObject({ startIndex: 1, pastEnd: true });
    expect(speakableFrom([a, greek, b], 1)).toMatchObject({ startIndex: 1, pastEnd: false });
  });

  it("keeps nothing when there is nothing to say", () => {
    expect(speakableFrom([greek, rule], 0)).toEqual({ segments: [], startIndex: 0, pastEnd: true });
  });
});

describe("nothingToSay", () => {
  it("knows the neural voice's silence from a real failure", () => {
    expect(nothingToSay("the voice returned silence for this passage")).toBe(true);
    expect(nothingToSay("the voice task did not finish: task 86 panicked")).toBe(false);
  });
});

describe("start", () => {
  it("leaves out passages with nothing to say and starts where it was asked", () => {
    store().start("John 1", "resource", [a, greek, rule, b], { startIndex: 1 });
    expect(store().segments.map((s) => s.id)).toEqual(["a", "b"]);
    expect(store().currentSegmentIndex).toBe(1);
    expect(said()).toEqual([b.text]);
  });

  it("does not start when there is nothing to say, and tells the reader", () => {
    store().start("Greek", "resource", [greek, rule]);
    expect(said()).toEqual([]);
    expect(store().segments).toEqual([]);
    expect(store().isPlaying).toBe(false);
    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual(["There is nothing here the voice can read aloud."]);
  });

  it("leaves another pane's reading alone when it finds nothing to say", () => {
    store().start("John 1", "scripture", [a, b], { paneId: "left" });
    store().start("Greek", "resource", [greek], { paneId: "right" });
    expect(store().title).toBe("John 1");
    expect(store().isPlaying).toBe(true);
  });

  it("lets go of a chapter that ended waiting to continue into one with nothing to say", () => {
    const unregister = registerQueueEndHandler("left", () => true);
    store().start("John 1", "scripture", [a], { paneId: "left" });
    finish();
    expect(store().continuing).toBe(true);
    store().start("John 2", "scripture", [greek], { paneId: "left" });
    expect(store().continuing).toBe(false);
    expect(store().segments).toEqual([]);
    unregister();
  });

  it("says nothing for a start replaced while the pronunciations were loading", async () => {
    useTtsStore.setState({ usePronunciations: true });
    store().start("First", "resource", [a]);
    store().start("Second", "resource", [b]);
    await Promise.resolve();
    await Promise.resolve();
    expect(said()).toEqual([b.text]);
  });

  it("does not say a passage twice when the reader moves on while the pronunciations load", async () => {
    useTtsStore.setState({ usePronunciations: true });
    store().start("John 1", "resource", [a, b, c]);
    store().seek(2);
    await Promise.resolve();
    await Promise.resolve();
    expect(said()).toEqual([c.text]);
  });

  it("lets go of this pane's own reading when it finds nothing to say", () => {
    store().start("John 1", "resource", [a, b], { paneId: "left" });
    store().start("Greek", "resource", [greek], { paneId: "left" });
    expect(store().segments).toEqual([]);
    expect(store().title).toBe("");
    expect(said()).toEqual([a.text]);
  });

  it("leaves another pane's chapter alone while it turns the page", () => {
    const unregister = registerQueueEndHandler("left", () => true);
    store().start("John 1", "scripture", [a], { paneId: "left" });
    store().setSleepMinutes(30);
    finish();
    expect(store().continuing).toBe(true);
    store().start("Greek", "resource", [greek], { paneId: "right" });
    expect(store().continuing).toBe(true);
    expect(store().title).toBe("John 1");
    expect(store().sleepMinutes).toBe(30);
    unregister();
  });

  it("waits for more of a book when nothing from the chosen place on can be said", () => {
    store().start("Book", "resource", [a, b, greek], { startIndex: 2, more: true });
    expect(said()).toEqual([]);
    expect(store().isPlaying).toBe(true);
    expect(store().waitingForMore).toBe(true);
    store().appendSegments("Book", null, [c]);
    expect(said()).toEqual([c.text]);
    expect(store().currentSegmentIndex).toBe(2);
  });

  it("with nothing more to come, falls back to the last passage that can be said", () => {
    store().start("John 1", "resource", [a, b, greek], { startIndex: 2 });
    expect(said()).toEqual([b.text]);
    expect(store().waitingForMore).toBe(false);
  });
});

describe("readFrom", () => {
  it("moves within the reading, finding the passage by id in the caller's own list", () => {
    const callers = [a, greek, b, c];
    store().start("John 1", "resource", callers);
    const kept = store().segments;
    store().readFrom("John 1", "resource", callers, 3);
    expect(store().segments).toBe(kept); // moved within, not started again
    expect(store().currentSegmentIndex).toBe(2);
    expect(speaking().text).toBe(c.text);
  });

  it("finds its place in a reading that has grown past the caller's list", () => {
    store().start("Book", "resource", [a, b], { more: true });
    store().appendSegments("Book", null, [c, d]);
    store().readFrom("Book", "resource", [a, b], 1);
    expect(store().segments.map((s) => s.id)).toEqual(["a", "b", "c", "d"]);
    expect(store().currentSegmentIndex).toBe(1);
    expect(store().more).toBe(true);
  });

  it("starts afresh for a different reading", () => {
    store().start("John 1", "resource", [a, b]);
    store().readFrom("John 2", "resource", [c, d], 1);
    expect(store().title).toBe("John 2");
    expect(speaking().text).toBe(d.text);
  });

  it("starts a reading that has finished again, rather than moving within it", () => {
    store().start("John 1", "resource", [a, b]);
    finish();
    finish();
    expect(store().isPlaying).toBe(false);
    const revised = { ...b, text: "And the Word was with God, freshly loaded." };
    store().readFrom("John 1", "resource", [a, revised], 1);
    expect(store().isPlaying).toBe(true);
    expect(speaking().text).toBe(revised.text);
  });

  it("keeps a paused reading paused, for the caller to set going", () => {
    store().start("John 1", "resource", [a, b, c]);
    store().pause();
    store().readFrom("John 1", "resource", [a, b, c], 2);
    expect(store().isPaused).toBe(true);
    expect(store().currentSegmentIndex).toBe(2);
    expect(said()).toEqual([a.text]);
    store().resume();
    expect(speaking().text).toBe(c.text);
  });

  it("goes on past the caller's list when nothing after the chosen place can be said", () => {
    store().start("Book", "resource", [a, b], { more: true });
    store().appendSegments("Book", null, [c]);
    store().readFrom("Book", "resource", [a, b, greek], 2, { more: true });
    expect(store().currentSegmentIndex).toBe(2);
    expect(speaking().text).toBe(c.text);
  });

  it("waits for more of the book when the reading holds nothing after the chosen place", () => {
    store().start("Book", "resource", [a, b], { more: true });
    store().readFrom("Book", "resource", [a, b, greek], 2, { more: true });
    expect(said()).toEqual([a.text]);
    expect(store().currentSegmentIndex).toBe(1);
    expect(store().waitingForMore).toBe(true);
    store().appendSegments("Book", null, [c]);
    expect(speaking().text).toBe(c.text);
  });
});

describe("asking for the next passage ahead", () => {
  it("asks at once when reading straight on, and a moment into a passage the reader moved to", () => {
    vi.useFakeTimers();
    try {
      store().start("Book", "resource", [a, b, c, d, e]);
      expect(voice.prefetched).toEqual([b.text]);
      // A jump: the passage after it is not asked for yet -- a reader who has
      // just moved often moves again, and that render would be in the way.
      store().seek(2);
      speaking().callbacks.onSpeakingStart?.();
      vi.advanceTimersByTime(2499);
      expect(voice.prefetched).toEqual([b.text]);
      vi.advanceTimersByTime(1);
      expect(voice.prefetched).toEqual([b.text, d.text]);
      // Reading straight on from there asks at once.
      speaking().callbacks.onEnd();
      expect(speaking().text).toBe(d.text);
      expect(voice.prefetched).toEqual([b.text, d.text, e.text]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("never asks ahead for a passage the reader has already moved on from", () => {
    vi.useFakeTimers();
    try {
      store().start("Book", "resource", [a, b, c, d, e]);
      store().seek(1);
      speaking().callbacks.onSpeakingStart?.();
      vi.advanceTimersByTime(1000);
      store().next();
      speaking().callbacks.onSpeakingStart?.();
      vi.advanceTimersByTime(2500);
      // Only what came after where the reader stopped: d, not c.
      expect(voice.prefetched).toEqual([b.text, d.text]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("appendSegments", () => {
  it("adds to the reading without interrupting it, and asks for the next passage ahead of time", () => {
    store().start("Book", "resource", [a], { more: true });
    expect(voice.prefetched).toEqual([]);
    store().appendSegments("Book", null, [b]);
    expect(store().segments.map((s) => s.id)).toEqual(["a", "b"]);
    expect(said()).toEqual([a.text]);
    expect(voice.prefetched).toEqual([b.text]);
    finish();
    expect(speaking().text).toBe(b.text);
  });

  it("does not ask ahead again when the passage playing already had one after it", () => {
    store().start("Book", "resource", [a, b], { more: true });
    expect(voice.prefetched).toEqual([b.text]);
    store().appendSegments("Book", null, [c]);
    expect(voice.prefetched).toEqual([b.text]);
  });

  it("carries straight on when the reading was waiting for it", () => {
    store().start("Book", "resource", [a], { more: true });
    finish();
    expect(store().waitingForMore).toBe(true);
    expect(store().isPlaying).toBe(true);
    store().appendSegments("Book", null, [b]);
    expect(store().waitingForMore).toBe(false);
    expect(store().currentSegmentIndex).toBe(1);
    expect(speaking().text).toBe(b.text);
  });

  it("waits paused, and speaks the new passage when Play is pressed", () => {
    store().start("Book", "resource", [a], { more: true });
    finish();
    store().pause();
    store().appendSegments("Book", null, [b]);
    expect(said()).toEqual([a.text]);
    store().resume();
    expect(speaking().text).toBe(b.text);
    expect(store().isPaused).toBe(false);
  });

  it("ends the reading when nothing more is coming", () => {
    store().start("Book", "resource", [a], { more: true });
    finish();
    store().appendSegments("Book", null, [], { done: true });
    expect(store().isPlaying).toBe(false);
    expect(store().waitingForMore).toBe(false);
    expect(store().more).toBe(false);
    expect(store().segments.map((s) => s.id)).toEqual(["a"]);
  });

  it("leaves out passages with nothing to say", () => {
    store().start("Book", "resource", [a], { more: true });
    store().appendSegments("Book", null, [greek, rule, b]);
    expect(store().segments.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("treats a batch with nothing to say as nothing, still waiting for more", () => {
    store().start("Book", "resource", [a], { more: true });
    finish();
    store().appendSegments("Book", null, [greek]);
    expect(store().waitingForMore).toBe(true);
    expect(store().isPlaying).toBe(true);
  });

  it("ignores passages meant for another reading", () => {
    store().start("Book", "resource", [a], { more: true });
    store().appendSegments("Another book", null, [b]);
    store().appendSegments("Book", "some-pane", [b]);
    expect(store().segments.map((s) => s.id)).toEqual(["a"]);
  });
});

describe("next", () => {
  it("waits at the last passage while more is coming, rather than stopping", () => {
    store().start("Book", "resource", [a, b], { more: true });
    store().next();
    expect(speaking().text).toBe(b.text);
    store().next();
    expect(store().segments.map((s) => s.id)).toEqual(["a", "b"]);
    expect(store().waitingForMore).toBe(true);
    expect(store().isPlaying).toBe(true);
    store().appendSegments("Book", null, [c]);
    expect(speaking().text).toBe(c.text);
  });

  it("stops at the end when nothing more is coming", () => {
    store().start("John 1", "resource", [a]);
    store().next();
    expect(store().segments).toEqual([]);
  });

  it("disowns the passage it left to wait for more", () => {
    store().start("Book", "resource", [a], { more: true });
    const left = speaking();
    store().next();
    expect(store().waitingForMore).toBe(true);
    left.callbacks.onError("boom");
    left.callbacks.onEnd();
    expect(store().waitingForMore).toBe(true);
    expect(store().isPlaying).toBe(true);
    expect(store().error).toBeNull();
    store().appendSegments("Book", null, [b]);
    expect(said()).toEqual([a.text, b.text]);
  });
});

describe("prev", () => {
  it("while waiting for more goes back a passage, and waits again at the end", () => {
    store().start("Book", "resource", [a, b], { more: true });
    finish();
    finish();
    expect(store().waitingForMore).toBe(true);
    store().prev();
    expect(store().waitingForMore).toBe(false);
    expect(speaking().text).toBe(a.text);
    finish();
    finish();
    expect(store().waitingForMore).toBe(true);
    store().appendSegments("Book", null, [c]);
    expect(said()).toEqual([a.text, b.text, a.text, b.text, c.text]);
  });
});

describe("seek", () => {
  it("while paused moves the place without a word, and Play starts there", () => {
    store().start("John 1", "resource", [a, b, c]);
    store().pause();
    store().seek(2);
    expect(said()).toEqual([a.text]);
    expect(store().currentSegmentIndex).toBe(2);
    expect(store().isPaused).toBe(true);
    store().resume();
    expect(speaking().text).toBe(c.text);
  });

  it("is not undone by the next section of a book arriving", () => {
    store().start("Book", "resource", [a], { more: true });
    finish();
    store().pause();
    store().seek(0);
    expect(store().waitingForMore).toBe(false);
    store().appendSegments("Book", null, [b]);
    expect(store().currentSegmentIndex).toBe(0);
    store().resume();
    expect(speaking().text).toBe(a.text);
  });

  it("ignores the end of a passage the reader has moved away from", () => {
    store().start("John 1", "resource", [a, b, c]);
    const left = speaking();
    store().seek(2);
    left.callbacks.onEnd();
    expect(store().currentSegmentIndex).toBe(2);
    expect(said()).toEqual([a.text, c.text]);
  });
});

describe("when a passage fails", () => {
  it("does not count a passage with nothing to say toward giving up", () => {
    store().start("John 1", "resource", [a, b, c, d, e]);
    for (let i = 0; i < 3; i++) speaking().callbacks.onError("the voice returned silence for this passage");
    expect(store().isPlaying).toBe(true);
    expect(store().currentSegmentIndex).toBe(3);
    expect(store().error).toBe("Could not read Three");
  });

  it("gives up after a run of real failures", () => {
    store().start("John 1", "resource", [a, b, c, d]);
    speaking().callbacks.onError("boom");
    speaking().callbacks.onError("boom");
    expect(store().currentSegmentIndex).toBe(2);
    expect(store().isPlaying).toBe(true);
    speaking().callbacks.onError("boom");
    expect(store().isPlaying).toBe(false);
    expect(store().error).toBe("boom");
    // Play tries the passage that failed again.
    store().resume();
    expect(speaking().text).toBe(c.text);
  });

  it("waits for more of a book when its last passage so far fails", () => {
    store().start("Book", "resource", [a], { more: true });
    speaking().callbacks.onError("boom");
    expect(store().waitingForMore).toBe(true);
    expect(store().isPlaying).toBe(true);
    store().appendSegments("Book", null, [b]);
    expect(speaking().text).toBe(b.text);
  });

  it("ends quietly on a last passage with nothing to say", () => {
    store().start("John 1", "resource", [a]);
    speaking().callbacks.onError("the voice returned silence for this passage");
    expect(store().isPlaying).toBe(false);
    expect(store().error).toBe("Could not read One");
  });

  it("still gives up after a long enough run of silences", () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ id: i, text: `Passage number ${i + 1}.` }));
    store().start("Index", "resource", many);
    for (let i = 0; i < 11; i++) speaking().callbacks.onError("the voice returned silence for this passage");
    expect(store().isPlaying).toBe(true);
    expect(store().currentSegmentIndex).toBe(11);
    speaking().callbacks.onError("the voice returned silence for this passage");
    expect(store().isPlaying).toBe(false);
    expect(store().currentSegmentIndex).toBe(11);
  });

  it("carries a chapter on into the next when its last verse fails", () => {
    const unregister = registerQueueEndHandler("p", () => true);
    store().start("John 1", "scripture", [a], { paneId: "p" });
    speaking().callbacks.onError("boom");
    expect(store().continuing).toBe(true);
    expect(store().error).toBe("Could not read One");
    unregister();
  });

  it("ends on a real failure at the last passage, and Play tries that passage again", () => {
    store().start("John 1", "resource", [a, b]);
    finish();
    speaking().callbacks.onError("boom");
    expect(store().isPlaying).toBe(false);
    expect(store().error).toBe("boom");
    store().resume();
    expect(store().currentSegmentIndex).toBe(1);
    expect(speaking().text).toBe(b.text);
  });
});

describe("changing the voice", () => {
  it("then Play tries the passage it was on again", () => {
    store().start("John 1", "resource", [a, b]);
    store().setEngineId("webspeech");
    expect(store().isPlaying).toBe(false);
    store().resume();
    expect(said()).toEqual([a.text, a.text]);
  });

  it("while waiting for more does not say the last passage over again on Play", () => {
    store().start("Book", "resource", [a, b], { more: true });
    finish();
    finish();
    store().setEngineId("webspeech");
    expect(store().isPlaying).toBe(false);
    store().resume();
    expect(said()).toEqual([a.text, b.text]);
    expect(store().isPlaying).toBe(true);
    expect(store().waitingForMore).toBe(true);
    store().appendSegments("Book", null, [c]);
    expect(said()).toEqual([a.text, b.text, c.text]);
  });

  it("while waiting for more goes on to a section that arrived before Play", () => {
    store().start("Book", "resource", [a], { more: true });
    finish();
    store().setEngineId("webspeech");
    store().appendSegments("Book", null, [b]);
    expect(said()).toEqual([a.text]);
    store().resume();
    expect(said()).toEqual([a.text, b.text]);
  });
});

describe("Play", () => {
  it("reads a finished reading again from the top", () => {
    store().start("John 1", "resource", [a, b]);
    finish();
    finish();
    expect(store().isPlaying).toBe(false);
    store().resume();
    expect(store().currentSegmentIndex).toBe(0);
    expect(speaking().text).toBe(a.text);
  });
});

describe("changing the speed", () => {
  it("does not say again a passage already said while waiting for more", () => {
    store().start("Book", "resource", [a], { more: true });
    finish();
    store().setRate(1.25);
    expect(said()).toEqual([a.text]);
    expect(store().waitingForMore).toBe(true);
  });

  it("while paused waits for Play to say the passage again", () => {
    store().start("John 1", "resource", [a, b]);
    store().pause();
    store().setRate(1.5);
    expect(said()).toEqual([a.text]);
    store().resume();
    expect(said()).toEqual([a.text, a.text]);
    store().setRate(1);
  });
});
