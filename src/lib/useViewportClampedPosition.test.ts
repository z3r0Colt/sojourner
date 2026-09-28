import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PopupAlign } from "./popupPosition";
import { readerIsScrolling, useViewportClampedPosition } from "./useViewportClampedPosition";

/**
 * The hook in a real (jsdom) React tree. jsdom lays nothing out, so the
 * popup's size and the panes' boxes are stood in for, as are the clock and
 * ResizeObserver; what is tested is the wiring -- that a popup is placed
 * again when it grows, and which scrolling closes it.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The clock only ever runs forwards, as a real one does: what the reader did
// in one test is long past by the next.
let now = 0;
let startedAt = 0;
function clock(ms: number) {
  now = startedAt + ms;
}

let popupSize = { width: 300, height: 200 };
let resizeCallbacks: (() => void)[] = [];
let observed: Element[] = [];

class FakeResizeObserver {
  private readonly callback: () => void;
  constructor(callback: () => void) {
    this.callback = callback;
  }
  observe(target: Element) {
    observed.push(target);
    resizeCallbacks.push(this.callback);
  }
  disconnect() {
    resizeCallbacks = resizeCallbacks.filter((c) => c !== this.callback);
  }
}

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) };
}

/** The window is jsdom's 1024 x 768. Under a 100 px strip of chrome, the
 * reading pane fills the left half and another pane the right; each is a
 * scroller with a 15 px scrollbar down its right side. A verse sits in the
 * reading pane, a word in the other. */
let boxes: Map<Element, DOMRect>;
let pane: HTMLDivElement;
let verse: HTMLSpanElement;
let otherPane: HTMLDivElement;
let word: HTMLSpanElement;
let host: HTMLDivElement;
let root: Root;

function makeScroller(el: HTMLElement, box: DOMRect) {
  boxes.set(el, box);
  const sizes = { scrollHeight: 5000, clientHeight: box.height, scrollWidth: box.width - 15, clientWidth: box.width - 15, clientLeft: 0, clientTop: 0 };
  for (const [name, value] of Object.entries(sizes)) Object.defineProperty(el, name, { value, configurable: true });
  Object.defineProperty(el, "scrollTop", { value: 0, writable: true, configurable: true });
}

beforeEach(() => {
  now += 100_000;
  startedAt = now;
  popupSize = { width: 300, height: 200 };
  resizeCallbacks = [];
  observed = [];
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  boxes = new Map();
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    // The popup (and its content) where its style puts it, so that it sits
    // over its own point as a real one does, and no taller than its cap.
    const popup = this.closest<HTMLElement>("[data-popup]");
    if (popup) {
      const cap = parseFloat(popup.style.maxHeight);
      const height = Number.isNaN(cap) ? popupSize.height : Math.min(popupSize.height, cap);
      return rect(parseFloat(popup.style.left) || 0, parseFloat(popup.style.top) || 0, popupSize.width, height);
    }
    return boxes.get(this) ?? rect(0, 0, 0, 0);
  });
  // Its content is as tall as it is whatever its cap: what it scrolls when
  // it is held short.
  const scrollHeight = Object.getOwnPropertyDescriptor(Element.prototype, "scrollHeight")!;
  vi.spyOn(Element.prototype, "scrollHeight", "get").mockImplementation(function (this: Element) {
    return this.hasAttribute("data-popup") ? popupSize.height : scrollHeight.get!.call(this);
  });
  pane = document.createElement("div");
  verse = document.createElement("span");
  otherPane = document.createElement("div");
  word = document.createElement("span");
  host = document.createElement("div");
  pane.append(verse);
  otherPane.append(word);
  document.body.append(pane, otherPane, host);
  makeScroller(pane, rect(0, 100, 512, 668));
  makeScroller(otherPane, rect(512, 100, 512, 668));
  boxes.set(verse, rect(20, 280, 400, 30));
  boxes.set(word, rect(600, 280, 60, 30));
  // Nothing held over from the test before.
  window.dispatchEvent(new MouseEvent("pointercancel"));
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

interface PopupProps {
  x: number;
  y: number;
  align?: PopupAlign;
  onDismiss?: () => void;
  closeOnEscape?: boolean;
  closeOnPressOutside?: boolean;
  note?: string;
}

function Popup({ x, y, align, onDismiss, closeOnEscape, closeOnPressOutside, note }: PopupProps) {
  const { ref, style, capped, scrolled } = useViewportClampedPosition<HTMLDivElement>(x, y, { align, onDismiss, closeOnEscape, closeOnPressOutside });
  return createElement(
    "div",
    { ref, style, "data-popup": "", "data-capped": String(capped), "data-scrolled": String(scrolled) },
    createElement("button", { "data-inner": "" }, note),
  );
}

function render(props: PopupProps) {
  act(() => root.render(createElement(Popup, props)));
  return host.querySelector<HTMLElement>("[data-popup]")!;
}

/** The reader presses `el` -- a click, the first half of a double-click, the
 * start of a selection -- at (x, y). */
function press(el: Element, x = 0, y = 0) {
  el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: x, clientY: y }));
}

function letGo(el: Element) {
  el.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
}

function turnWheel(el: Element) {
  el.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: 100 }));
}

function pressKey(el: Element, key: string) {
  el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key }));
}

/** The pane moves, and says so, whoever moved it. */
function scroll(el: Element, top: number) {
  el.scrollTop = top;
  act(() => {
    el.dispatchEvent(new Event("scroll"));
  });
}

/** A popup opened from the verse, as a double-click on one of its words
 * opens the Strong's card. */
function openFromVerse(props: PopupProps) {
  press(verse, 100, 290);
  letGo(verse);
  return render(props);
}

describe("placing the popup", () => {
  it("opens below its point when it fits", () => {
    const popup = render({ x: 100, y: 500 });
    expect(popup.style.top).toBe("500px");
    expect(popup.style.maxHeight).toBe("");
  });

  it("moves above its point when content arriving later makes it too tall", () => {
    const popup = render({ x: 100, y: 500 });
    popupSize = { width: 300, height: 400 };
    act(() => resizeCallbacks.forEach((c) => c()));
    // 768 - 8 - 500 = 260 below is too little; it ends the gap above 500.
    expect(popup.style.top).toBe(`${500 - 8 - 400}px`);
  });

  it("is placed again when the component using it re-renders with more to show", () => {
    const popup = render({ x: 100, y: 500 });
    popupSize = { width: 300, height: 400 };
    render({ x: 100, y: 500, note: "the definition has arrived" });
    expect(popup.style.top).toBe("92px");
  });

  it("is held to the roomier side, scrolling inside, when it fits on neither", () => {
    popupSize = { width: 300, height: 700 };
    const popup = render({ x: 100, y: 400 });
    // 360 below, 384 above.
    expect(popup.style.top).toBe("8px");
    expect(popup.style.maxHeight).toBe("384px");
    expect(popup.style.overflowY).toBe("auto");
    expect(popup.style.overscrollBehavior).toBe("contain");
  });

  it("stays capped as it is measured again, rather than flickering between capped and not", () => {
    // Measured with its cap on, a capped popup would seem to fit, lose the
    // cap, measure tall again and be capped again, on every observation.
    popupSize = { width: 300, height: 700 };
    const popup = render({ x: 100, y: 400 });
    for (let round = 0; round < 3; round++) {
      act(() => resizeCallbacks.forEach((c) => c()));
      expect(popup.style.maxHeight).toBe("384px");
    }
    render({ x: 100, y: 400, note: "more" });
    expect(popup.style.maxHeight).toBe("384px");
    expect(popup.style.top).toBe("8px");
  });

  it("is measured with its cap on, so that a card scrolled down keeps its place", () => {
    // Lifting the cap to measure left it nothing to scroll: the browser took
    // it back to its top, at every render.
    popupSize = { width: 300, height: 700 };
    const popup = render({ x: 100, y: 400 });
    const observer = new MutationObserver(() => {});
    observer.observe(popup, { attributes: true, attributeFilter: ["style"], attributeOldValue: true });
    render({ x: 100, y: 400, note: "more" });
    act(() => resizeCallbacks.forEach((c) => c()));
    // Every style the popup had along the way, the one it has now last.
    const styles = [...observer.takeRecords().map((r) => r.oldValue ?? ""), popup.getAttribute("style") ?? ""];
    observer.disconnect();
    expect(styles.filter((style) => !style.includes("max-height: 384px"))).toEqual([]);
  });

  it("says when it is capped, and when it is scrolled down from its top", () => {
    popupSize = { width: 300, height: 700 };
    const popup = render({ x: 100, y: 400 });
    expect(popup.dataset.capped).toBe("true");
    expect(popup.dataset.scrolled).toBe("false");
    scroll(popup, 40);
    expect(popup.dataset.scrolled).toBe("true");
    scroll(popup, 0);
    expect(popup.dataset.scrolled).toBe("false");
    // Scrolled, then let go of its cap: it no longer scrolls at all.
    scroll(popup, 40);
    popupSize = { width: 300, height: 200 };
    act(() => resizeCallbacks.forEach((c) => c()));
    expect(popup.dataset.capped).toBe("false");
    expect(popup.dataset.scrolled).toBe("false");
  });

  it("lets go of its cap once its content shrinks to fit", () => {
    popupSize = { width: 300, height: 700 };
    const popup = render({ x: 100, y: 400 });
    popupSize = { width: 300, height: 200 };
    act(() => resizeCallbacks.forEach((c) => c()));
    expect(popup.style.maxHeight).toBe("");
    expect(popup.style.top).toBe("400px");
  });

  it("keeps clear of the player bar under the workspace, moving when the bar comes up", () => {
    // The workspace runs to the foot of the window until read-aloud starts;
    // then the player bar takes the bottom 70 px and the workspace ends at
    // 698.
    const workspace = document.createElement("main");
    document.body.prepend(workspace);
    boxes.set(workspace, rect(0, 44, 1024, 724));
    const popup = render({ x: 100, y: 500 });
    expect(popup.style.top).toBe("500px");
    expect(observed).toContain(workspace);
    boxes.set(workspace, rect(0, 44, 1024, 654));
    act(() => resizeCallbacks.forEach((c) => c()));
    // 698 - 8 - 500 = 190 below, too little for 200: it ends the gap above
    // its point, where it would have fitted in the window but now covers the
    // bar.
    expect(popup.style.top).toBe(`${500 - 8 - 200}px`);
    // And a card too tall for either side is capped at the bar, not at the
    // window's foot.
    popupSize = { width: 300, height: 900 };
    const tall = render({ x: 100, y: 300 });
    expect(tall.style.top).toBe("300px");
    expect(tall.style.maxHeight).toBe(`${698 - 8 - 300}px`);
  });
});

describe("closing when the reader scrolls", () => {
  it("closes once the reader scrolls the pane under it, but not in the moment after it opened", () => {
    const onDismiss = vi.fn();
    openFromVerse({ x: 100, y: 300, onDismiss });
    clock(50);
    turnWheel(verse);
    scroll(pane, 40); // the double-click's nudge...
    clock(150);
    scroll(pane, 80); // ...still moving
    expect(onDismiss).not.toHaveBeenCalled();
    clock(400);
    turnWheel(verse);
    scroll(pane, 83); // the page settling
    expect(onDismiss).not.toHaveBeenCalled();
    scroll(pane, 120); // the reader scrolling
    expect(onDismiss).toHaveBeenCalledTimes(1);
    scroll(pane, 160);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("closes at the first notch of a wheel that jumps rather than glides", () => {
    const onDismiss = vi.fn();
    openFromVerse({ x: 100, y: 300, onDismiss });
    clock(1000);
    turnWheel(verse);
    scroll(pane, 100);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("stays open while the app scrolls the pane itself, as read-aloud following along does", () => {
    const onDismiss = vi.fn();
    openFromVerse({ x: 100, y: 300, onDismiss });
    for (let line = 1; line <= 5; line++) {
      clock(line * 2000);
      scroll(pane, line * 30);
    }
    expect(onDismiss).not.toHaveBeenCalled();
    // The reader takes over: measured from where read-aloud left the text.
    clock(12_000);
    turnWheel(verse);
    scroll(pane, 190);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("stays open when the reader presses a button on it just as the app scrolls", () => {
    // "Read aloud from here" pressed while a reading is already moving the
    // text: the press is not a reach to scroll.
    const onDismiss = vi.fn();
    const popup = openFromVerse({ x: 100, y: 300, onDismiss });
    clock(1000);
    press(popup.querySelector("[data-inner]")!, 150, 310);
    scroll(pane, 30);
    letGo(popup.querySelector("[data-inner]")!);
    scroll(pane, 60);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("does not take a wheel turned over another pane as the reader scrolling this one", () => {
    const onDismiss = vi.fn();
    openFromVerse({ x: 100, y: 300, onDismiss });
    clock(1000);
    turnWheel(word);
    scroll(pane, 30);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("counts a scrolling key, but not one typed into a text field", () => {
    const onDismiss = vi.fn();
    const field = document.createElement("input");
    pane.append(field);
    openFromVerse({ x: 100, y: 300, onDismiss });
    clock(1000);
    pressKey(field, " ");
    scroll(pane, 50);
    expect(onDismiss).not.toHaveBeenCalled();
    // PageDown with nothing in particular focused scrolls the pane the
    // reader was last in.
    pressKey(document.body, "PageDown");
    scroll(pane, 600);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("counts dragging the scrollbar for as long as it is held, and a press on the text not at all", () => {
    const onDismiss = vi.fn();
    openFromVerse({ x: 100, y: 300, onDismiss });
    clock(1000);
    press(pane, 300, 400); // on the text
    scroll(pane, 30);
    letGo(pane);
    expect(onDismiss).not.toHaveBeenCalled();
    press(pane, 505, 400); // on the scrollbar, left of the pane's right edge at 512
    clock(4000);
    scroll(pane, 200);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    letGo(pane);
  });

  it("stays open while its own content scrolls", () => {
    const onDismiss = vi.fn();
    const popup = openFromVerse({ x: 100, y: 300, onDismiss });
    clock(1000);
    turnWheel(popup);
    scroll(popup, 0);
    scroll(popup, 200);
    turnWheel(popup.querySelector("[data-inner]")!);
    scroll(popup.querySelector("[data-inner]")!, 0);
    scroll(popup.querySelector("[data-inner]")!, 150);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("stays open while the reader scrolls some other pane", () => {
    const onDismiss = vi.fn();
    openFromVerse({ x: 100, y: 300, onDismiss });
    clock(1000);
    turnWheel(word);
    scroll(otherPane, 0);
    scroll(otherPane, 400);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("closes when the pane it was opened from scrolls, even with its point outside that pane", () => {
    // A toolbar over a selection whose first line has scrolled up under the
    // chrome (y = 60) or out of the window altogether (y = -300) floats at
    // the top of the window, yet belongs to the reading pane.
    for (const y of [60, -300]) {
      const onDismiss = vi.fn();
      openFromVerse({ x: 200, y, align: "above-center", onDismiss });
      clock(now - startedAt + 1000);
      turnWheel(verse);
      scroll(pane, pane.scrollTop + 60);
      expect(onDismiss).toHaveBeenCalledTimes(1);
      act(() => root.render(null));
    }
  });

  it("belongs to the pane it was opened from, not to a pane stacked above whose box its point lies in", () => {
    // Panes split one above the other: the popup's point is in the upper
    // pane, but it was opened from a verse at the top of the lower one.
    makeScroller(otherPane, rect(0, 100, 1024, 300));
    makeScroller(pane, rect(0, 400, 1024, 368));
    boxes.set(verse, rect(20, 405, 400, 30));
    boxes.set(word, rect(20, 300, 60, 30));
    const onDismiss = vi.fn();
    openFromVerse({ x: 200, y: 380, align: "above-center", onDismiss });
    clock(1000);
    turnWheel(word);
    scroll(otherPane, 200);
    expect(onDismiss).not.toHaveBeenCalled();
    turnWheel(verse);
    scroll(pane, 50);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("belongs to the scroller its point lies in when it was not opened by a press", () => {
    const onDismiss = vi.fn();
    render({ x: 100, y: 300, onDismiss });
    clock(1000);
    turnWheel(word);
    scroll(otherPane, 400);
    expect(onDismiss).not.toHaveBeenCalled();
    turnWheel(verse);
    scroll(pane, 50);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe("readerIsScrolling", () => {
  it("is true for a moment after a wheel is turned, and only for the scrollers under it", () => {
    turnWheel(verse);
    expect(readerIsScrolling(pane)).toBe(true);
    expect(readerIsScrolling(document)).toBe(true);
    expect(readerIsScrolling(otherPane)).toBe(false);
    clock(900);
    expect(readerIsScrolling(pane)).toBe(false);
  });
});

describe("closing on Escape and on a press elsewhere", () => {
  it("closes on Escape when asked to, and keeps the key from what lies under it", () => {
    const onDismiss = vi.fn();
    const underneath = vi.fn();
    document.addEventListener("keydown", underneath);
    openFromVerse({ x: 100, y: 300, onDismiss, closeOnEscape: true });
    pressKey(verse, "Enter");
    expect(onDismiss).not.toHaveBeenCalled();
    pressKey(verse, "Escape");
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(underneath).toHaveBeenCalledTimes(1); // the Enter only
    document.removeEventListener("keydown", underneath);
  });

  it("leaves Escape to a modal open over it", () => {
    const onDismiss = vi.fn();
    openFromVerse({ x: 100, y: 300, onDismiss, closeOnEscape: true });
    const modal = document.createElement("div");
    modal.setAttribute("aria-modal", "true");
    document.body.append(modal);
    pressKey(modal, "Escape");
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("closes on a press outside it when asked to, but not on a press inside it", () => {
    const onDismiss = vi.fn();
    const popup = openFromVerse({ x: 100, y: 300, onDismiss, closeOnPressOutside: true });
    press(popup.querySelector("[data-inner]")!);
    expect(onDismiss).not.toHaveBeenCalled();
    press(word);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("does neither unless asked", () => {
    const onDismiss = vi.fn();
    openFromVerse({ x: 100, y: 300, onDismiss });
    pressKey(verse, "Escape");
    press(word);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
