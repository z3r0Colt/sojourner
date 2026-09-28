import { describe, expect, it, vi } from "vitest";
import { landOnRow } from "./landOnRow";

/** A list whose row `index` sits `rowAt(scrollTop)` px below the list's top,
 * as it would once the rows above it are drawn at their real heights. */
function fakeList(index: number, rowAt: (scrollTop: number) => number | null, maxScroll = 10_000) {
  const list = document.createElement("div");
  let top = 0;
  Object.defineProperty(list, "scrollTop", {
    get: () => top,
    set: (v: number) => (top = Math.max(0, Math.min(maxScroll, v))),
  });
  list.getBoundingClientRect = () => ({ top: 100 }) as DOMRect;
  const row = document.createElement("div");
  row.dataset.index = String(index);
  row.getBoundingClientRect = () => ({ top: 100 + (rowAt(top) ?? 0) }) as DOMRect;
  list.appendChild(row);
  return { list, row, get scrollTop() { return top; }, set scrollTop(v: number) { list.scrollTop = v; } };
}

/** Frames run by hand, one `tick()` each. */
function frames() {
  let queue: FrameRequestCallback[] = [];
  let t = 0;
  return {
    raf: (cb: FrameRequestCallback) => (queue.push(cb), queue.length),
    cancelRaf: () => (queue = []),
    now: () => t,
    tick() {
      t += 16;
      const q = queue;
      queue = [];
      q.forEach((cb) => cb(t));
    },
    get pending() {
      return queue.length;
    },
  };
}

describe("landOnRow", () => {
  it("brings the row back to the top when the rows above it turn out shorter than guessed", () => {
    // Aimed at 1500px from guesses; the rows above really total 1232px.
    let real = 1232;
    const f = fakeList(10, (s) => real - s);
    f.scrollTop = 1500;
    const clock = frames();
    landOnRow(f.list, 10, vi.fn(), clock);
    clock.tick();
    expect(f.scrollTop).toBe(1232);
    // More rows are measured a frame later: it follows again.
    real = 1180;
    clock.tick();
    expect(f.scrollTop).toBe(1180);
    for (let i = 0; i < 5; i++) clock.tick();
    expect(clock.pending).toBe(0);
  });

  it("aims again while the row is not drawn", () => {
    const f = fakeList(3, () => 0);
    f.list.innerHTML = "";
    const aim = vi.fn();
    const clock = frames();
    landOnRow(f.list, 3, aim, clock);
    clock.tick();
    clock.tick();
    expect(aim).toHaveBeenCalledTimes(2);
  });

  it("settles on a row near the end that cannot reach the top", () => {
    const f = fakeList(40, (s) => 900 - s, 700);
    const clock = frames();
    landOnRow(f.list, 40, vi.fn(), clock);
    for (let i = 0; i < 8; i++) clock.tick();
    expect(f.scrollTop).toBe(700);
    expect(clock.pending).toBe(0);
  });

  it("lets go as soon as the reader scrolls", () => {
    const f = fakeList(10, (s) => 1232 - s);
    const clock = frames();
    landOnRow(f.list, 10, vi.fn(), clock);
    f.list.dispatchEvent(new Event("wheel"));
    f.scrollTop = 300;
    clock.tick();
    expect(f.scrollTop).toBe(300);
    expect(clock.pending).toBe(0);
  });
});
