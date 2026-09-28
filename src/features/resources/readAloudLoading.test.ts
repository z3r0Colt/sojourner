import { beforeEach, describe, expect, it, vi } from "vitest";

// A voice that says nothing: these tests are about when a book loads more of
// itself, not about speaking.
const voice = vi.hoisted(() => ({
  id: "webspeech",
  label: "Test voice",
  reportsWordBoundaries: true,
  readsRespellings: true,
  isAvailable: () => true,
  listVoices: async () => [],
  speak() {},
  pause() {},
  resume() {},
  cancel() {},
}));

vi.mock("../tts/ttsEngine", () => ({ ttsEngines: { webspeech: voice } }));
vi.mock("../tts/pronunciation", () => ({
  loadPronunciationLexicon: () => Promise.resolve(new Map()),
  buildSpoken: (text: string) => ({ spoken: text, chunks: [], changed: 0 }),
  toSourceIndex: (_chunks: unknown, index: number) => index,
}));

import { useTtsStore } from "../../state/ttsStore";
import { LOOKAHEAD_PIECES, endLoading, isReadingHere, letGoOfLoading, takeOverLoading, whenMoreWanted } from "./readAloudLoading";

const TITLE = "The Religious Affections";
const PANE = "pane-1";

function passages(count: number) {
  return Array.from({ length: count }, (_, i) => ({ id: `e:0:${i}:0`, text: `Passage ${i + 1}.` }));
}

const ours = (s: ReturnType<typeof useTtsStore.getState>) => s.title === TITLE && s.paneId === PANE && s.segments.length > 0;

/** Whether a promise has settled yet, and with what. */
async function peek<T>(promise: Promise<T>): Promise<{ settled: boolean; value?: T }> {
  const pending = Symbol("pending");
  const value = await Promise.race([promise, new Promise<typeof pending>((resolve) => setTimeout(() => resolve(pending), 0))]);
  return value === pending ? { settled: false } : { settled: true, value: value as T };
}

describe("loading more of a book as the voice needs it", () => {
  beforeEach(() => {
    useTtsStore.getState().stop();
    useTtsStore.setState({ usePronunciations: false });
  });

  it("asks for more at once when the voice is already near the end", async () => {
    useTtsStore.getState().start(TITLE, "resource", passages(5), { paneId: PANE, more: true });
    expect(await peek(whenMoreWanted(ours))).toEqual({ settled: true, value: true });
  });

  it("waits until the voice gets within reach of the end", async () => {
    useTtsStore.getState().start(TITLE, "resource", passages(LOOKAHEAD_PIECES + 20), { paneId: PANE, more: true });
    const wanted = whenMoreWanted(ours);
    expect((await peek(wanted)).settled).toBe(false);
    useTtsStore.getState().seek(25);
    expect(await peek(wanted)).toEqual({ settled: true, value: true });
  });

  it("gives up when the reading is stopped", async () => {
    useTtsStore.getState().start(TITLE, "resource", passages(LOOKAHEAD_PIECES + 20), { paneId: PANE, more: true });
    const wanted = whenMoreWanted(ours);
    useTtsStore.getState().stop();
    expect(await peek(wanted)).toEqual({ settled: true, value: false });
  });

  it("tells a reading its book has closed, so it ends rather than waiting", () => {
    useTtsStore.getState().start(TITLE, "resource", passages(3), { paneId: PANE, more: true });
    endLoading("Another book", PANE);
    expect(useTtsStore.getState().more).toBe(true);
    endLoading(TITLE, PANE);
    expect(useTtsStore.getState().more).toBe(false);
  });

  it("hands a reading's loading to the reader that replaces the one that closed", async () => {
    useTtsStore.getState().start(TITLE, "resource", passages(3), { paneId: PANE, more: true });
    // The old reader closes and the new one opens in the same pass.
    letGoOfLoading(TITLE, PANE);
    expect(takeOverLoading(TITLE, PANE)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(useTtsStore.getState().more).toBe(true);
  });

  it("ends a reading's loading a moment after its reader closes, when no reader takes it over", async () => {
    useTtsStore.getState().start(TITLE, "resource", passages(3), { paneId: PANE, more: true });
    letGoOfLoading(TITLE, PANE);
    expect(useTtsStore.getState().more).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(useTtsStore.getState().more).toBe(false);
    // Nothing is left to take over by then.
    expect(takeOverLoading(TITLE, PANE)).toBe(false);
  });

  it("leaves a reading of another book, or in another pane, to its own reader", async () => {
    useTtsStore.getState().start(TITLE, "resource", passages(3), { paneId: PANE, more: true });
    expect(takeOverLoading("Another book", PANE)).toBe(false);
    expect(takeOverLoading(TITLE, "pane-2")).toBe(false);
    letGoOfLoading(TITLE, "pane-2");
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(useTtsStore.getState().more).toBe(true);
  });

  it("knows a reading under way in this pane", () => {
    useTtsStore.getState().start(TITLE, "resource", passages(3), { paneId: PANE });
    const s = useTtsStore.getState();
    expect(isReadingHere(s, TITLE, PANE)).toBe(true);
    expect(isReadingHere(s, TITLE, "pane-2")).toBe(false);
    s.stop();
    expect(isReadingHere(useTtsStore.getState(), TITLE, PANE)).toBe(false);
  });
});
