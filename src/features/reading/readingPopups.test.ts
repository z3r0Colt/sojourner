import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FootnotePopup } from "./FootnotePopup";
import { HighlightPopup } from "./HighlightPopup";
import { SelectionToolbar } from "./SelectionToolbar";

/**
 * The reading pane's small popups in a real (jsdom) React tree: the note on a
 * footnote marker, the bar on a highlight and the toolbar over a selection.
 * What is tested is when each goes away -- Escape, a press elsewhere, the
 * selection it acts on being cleared -- and what the note says. Placement is
 * the position hook's, tested with it.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("./highlightColors", async (importOriginal) => {
  const original = await importOriginal<typeof import("./highlightColors")>();
  return { ...original, useHighlightLabels: () => [{}, () => {}] };
});

let host: HTMLDivElement;
let text: HTMLParagraphElement;
let root: Root;

beforeEach(() => {
  text = document.createElement("p");
  text.textContent = "Likewise the Spirit also helpeth our infirmities";
  host = document.createElement("div");
  document.body.append(text, host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  document.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
});

function render(element: React.ReactElement) {
  act(() => root.render(element));
}

function pressKey(key: string) {
  act(() => {
    text.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key }));
  });
}

function pressOn(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  });
}

function selectWords() {
  const range = document.createRange();
  range.setStart(text.firstChild!, 13);
  range.setEnd(text.firstChild!, 32);
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  act(() => {
    document.dispatchEvent(new Event("selectionchange"));
  });
}

function clearSelection() {
  document.getSelection()!.removeAllRanges();
  act(() => {
    document.dispatchEvent(new Event("selectionchange"));
  });
}

describe("the note on a footnote marker", () => {
  it("reads without the separator or the stray spaces its source left", () => {
    render(createElement(FootnotePopup, { marker: "a", text: ": Heb. seeding seed", x: 100, y: 200, anchorTop: 180, onClose: () => {} }));
    expect(host.textContent).toContain("Heb. seeding seed");
    expect(host.textContent).not.toContain(":");
  });

  it("closes on Escape and on a press elsewhere, but not on a press on itself", () => {
    const onClose = vi.fn();
    render(createElement(FootnotePopup, { marker: "a", text: "Greek flesh of sin .", x: 100, y: 200, onClose }));
    expect(host.textContent).toContain("Greek flesh of sin.");
    pressOn(host.querySelector("p")!);
    expect(onClose).not.toHaveBeenCalled();
    pressKey("Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
    pressOn(text);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("the bar on a highlight", () => {
  it("closes on Escape and on a press on another verse", () => {
    const onClose = vi.fn();
    const noop = () => {};
    render(
      createElement(HighlightPopup, { x: 300, y: 200, flipY: 224, onPickColor: noop, onUnderline: noop, onNote: noop, onRemove: noop, onClose }),
    );
    pressOn(host.querySelector("button")!);
    expect(onClose).not.toHaveBeenCalled();
    pressKey("Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
    pressOn(text);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("the toolbar over a selection", () => {
  function renderToolbar(onClose: () => void) {
    const noop = () => {};
    render(createElement(SelectionToolbar, { x: 300, y: 200, flipY: 224, onPickColor: noop, onUnderline: noop, onAddNote: noop, onClose }));
  }

  it("stays while the words are selected, and goes once they no longer are", () => {
    const onClose = vi.fn();
    selectWords();
    renderToolbar(onClose);
    selectWords();
    expect(onClose).not.toHaveBeenCalled();
    clearSelection();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    selectWords();
    renderToolbar(onClose);
    pressKey("Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  // Read-aloud scrolls the pane to follow the voice and leaves the toolbar
  // up; it used to stay where it had opened, over the verse being read. It
  // goes with the words it belongs to, and closes once they are out of view.
  describe("as the app scrolls the text under it", () => {
    let box: { top: number; bottom: number; left: number; right: number };
    let pane: HTMLDivElement;
    beforeEach(() => {
      box = { top: 224, bottom: 248, left: 250, right: 350 };
      const measure = () => ({ ...box, x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top, toJSON: () => ({}) });
      Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: measure });
      pane = document.createElement("div");
      pane.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 100, width: 800, height: 500 });
      pane.append(text);
      document.body.prepend(pane);
      vi.stubGlobal("requestAnimationFrame", (run: FrameRequestCallback) => {
        run(0);
        return 1;
      });
    });
    afterEach(() => {
      delete (Range.prototype as { getBoundingClientRect?: unknown }).getBoundingClientRect;
      vi.unstubAllGlobals();
    });

    function scrollPaneBy(dy: number) {
      box = { ...box, top: box.top - dy, bottom: box.bottom - dy };
      act(() => {
        pane.dispatchEvent(new Event("scroll"));
      });
    }
    const toolbarTop = () => parseFloat((host.querySelector("[role=toolbar]") as HTMLElement).style.top);

    it("moves with the selection", () => {
      const onClose = vi.fn();
      selectWords();
      renderToolbar(onClose);
      const before = toolbarTop();
      expect(Number.isFinite(before)).toBe(true);
      scrollPaneBy(60);
      expect(toolbarTop()).toBe(before - 60);
      expect(onClose).not.toHaveBeenCalled();
    });

    it("closes once the selection has left the pane's view", () => {
      const onClose = vi.fn();
      selectWords();
      renderToolbar(onClose);
      scrollPaneBy(200);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("pays no mind to a scroll of something else", () => {
      const onClose = vi.fn();
      selectWords();
      renderToolbar(onClose);
      const before = toolbarTop();
      const other = document.createElement("div");
      document.body.append(other);
      box = { ...box, top: box.top - 200, bottom: box.bottom - 200 };
      act(() => {
        other.dispatchEvent(new Event("scroll"));
      });
      expect(toolbarTop()).toBe(before);
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
