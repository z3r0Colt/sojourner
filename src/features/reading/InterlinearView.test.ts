import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Book, InterlinearWord, MorphologyWord } from "../../api/types";

/**
 * The interlinear in a real (jsdom) React tree, its chapter data stood in
 * for and the Strong's card replaced by a stand-in that records what it was
 * given: what is tested is the view's own wiring -- the parsing under each
 * word, the card's word and parsing, a click inside the card leaving it
 * open, Escape and a change of chapter closing it, the focus going into it
 * from the keyboard and back to the word, and the parsing card on hover.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LOVED: MorphologyWord = {
  id: 102,
  sort_order: 2,
  original_word: "ἠγάπησεν",
  lemma: "ἀγαπάω",
  morph_code: "V-AAI-3S",
  strongs_id: "G25",
  parsing: {
    language: "greek",
    part_of_speech: "verb",
    tense: "aorist",
    voice: "active",
    mood: "indicative",
    person: "3rd",
    number: "singular",
    gender: null,
    case: null,
    state: null,
    stem: null,
    kind: null,
    description: "verb, aorist active indicative, 3rd person singular",
    affixes: [],
  },
};
const THE: MorphologyWord = { ...LOVED, id: 103, sort_order: 3, original_word: "ὁ", lemma: "ὁ", morph_code: "T-NSM", strongs_id: "G3588", parsing: null };
const THE_WORLD: MorphologyWord = { ...THE, id: 105, sort_order: 5, original_word: "τὸν", morph_code: "T-ASM" };
const PHRASES: InterlinearWord[] = [
  { id: 1, sort_order: 0, text: "loved", strongs_id: "G25" },
  { id: 2, sort_order: 1, text: "the world", strongs_id: "G3588" },
];

vi.mock("../../api/queries", () => ({
  // Chapter 5 stands for a verse whose English leaves its articles
  // untranslated: it has no "the world".
  useInterlinearForChapter: (_book: number, chapter: number) => ({ data: { 16: chapter === 5 ? PHRASES.slice(0, 1) : PHRASES }, isLoading: false }),
  useMorphologyForChapter: () => ({ data: { 16: [LOVED, THE, THE_WORLD] }, isLoading: false }),
}));

const cardProps = vi.fn();
vi.mock("../lexicon/StrongsPopup", async () => {
  const { createElement: h } = await import("react");
  return {
    StrongsPopup: (props: { id: string; parsedWord?: MorphologyWord | null; onClose: () => void }) => {
      cardProps(props);
      return h("div", { role: "dialog", "data-card": "" }, h("button", { type: "button", "data-row": "" }, "Aorist"), h("p", null, "to love"));
    },
  };
});

const { InterlinearView } = await import("./InterlinearView");
const { useUiStore } = await import("../../state/uiStore");

const JOHN: Book = { id: 43, osis_code: "John", name: "John", short_name: "Jn", testament: "NT", chapter_count: 21 };

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  cardProps.mockClear();
  if (!useUiStore.getState().showMorphology) useUiStore.getState().toggleShowMorphology();
  useUiStore.getState().setInterlinearLayout("aligned");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(createElement(InterlinearView, { book: JOHN, chapter: 3, onExit: () => {} })));
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.useRealTimers();
});

function buttonWith(text: string): HTMLButtonElement {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.startsWith(text));
  if (!button) throw new Error(`no button for ${text}`);
  return button;
}

const card = () => host.querySelector("[data-card]");
/** The chapter's scroller, the view's outermost element. */
const scroller = () => host.firstElementChild as HTMLElement;

/** Focuses a word as Tab would. jsdom never matches :focus-visible, which
 * is how the view tells the keyboard from a press, so the word is made to
 * report it for as long as it has the focus. */
function focusFromKeyboard(el: HTMLElement) {
  const matches = el.matches.bind(el);
  Object.defineProperty(el, "matches", {
    value: (selector: string) => (selector === ":focus-visible" ? document.activeElement === el : matches(selector)),
  });
  act(() => el.focus());
}

describe("InterlinearView", () => {
  it("shows a Greek word's parsing in words under it, and its code only where it has no parsing", () => {
    const loved = buttonWith("ἠγάπησεν");
    // Each joining mark is held to the piece before it by a no-break space.
    expect(loved.textContent).toBe("ἠγάπησενVerb\u00a0· aorist active indicative\u00a0· 3rd sg");
    expect(loved.textContent).not.toContain("V-AAI-3S");
    expect(buttonWith("ὁ").textContent).toBe("ὁT-NSM");
  });

  it("gives the card the Greek word clicked, for its parsing", () => {
    act(() => buttonWith("ἠγάπησεν").click());
    expect(card()).not.toBeNull();
    expect(cardProps).toHaveBeenLastCalledWith(expect.objectContaining({ id: "G25", parsedWord: LOVED }));
  });

  it("gives the card the Greek word an English phrase translates, not an article folded into it", () => {
    act(() => buttonWith("loved").click());
    expect(cardProps).toHaveBeenLastCalledWith(expect.objectContaining({ id: "G25", parsedWord: LOVED }));
    // G3588 stands on two words; "the world" is τὸν, nearer its place, and
    // ὁ beside it is folded in.
    act(() => buttonWith("the world").click());
    expect(cardProps).toHaveBeenLastCalledWith(expect.objectContaining({ id: "G3588", parsedWord: THE_WORLD }));
  });

  it("keeps the card open for a click inside it, and closes it for a click in the chapter", () => {
    act(() => buttonWith("ἠγάπησεν").click());
    act(() => card()!.querySelector<HTMLButtonElement>("[data-row]")!.click());
    expect(card()).not.toBeNull();
    act(() => card()!.querySelector("p")!.click());
    expect(card()).not.toBeNull();
    act(() => host.querySelector("h1")!.click());
    expect(card()).toBeNull();
  });

  it("shows the whole parsing and the code on a word the pointer rests on, and hides it when the pointer leaves", () => {
    vi.useFakeTimers();
    const loved = buttonWith("ἠγάπησεν");
    act(() => {
      loved.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: document.body }));
    });
    // Not at once: the pointer may only be passing.
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    act(() => vi.advanceTimersByTime(300));
    const tooltip = document.querySelector<HTMLElement>('[role="tooltip"]')!;
    expect(tooltip.textContent).toContain("Verb, aorist active indicative, 3rd person singular");
    expect(tooltip.textContent).toContain("V-AAI-3S");
    expect(tooltip.textContent).toContain("from ἀγαπάω");
    expect(loved.getAttribute("aria-describedby")).toBe(tooltip.id);
    act(() => {
      loved.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }));
    });
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    expect(loved.hasAttribute("aria-describedby")).toBe(false);
  });

  it("shows the parsing card at once for a word reached with the keyboard, but not for one pressed", () => {
    const loved = buttonWith("ἠγάπησεν");
    // A press focuses the word too, a moment before its click opens the
    // Strong's card.
    act(() => loved.focus());
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    act(() => loved.blur());

    focusFromKeyboard(loved);
    const tooltip = document.querySelector<HTMLElement>('[role="tooltip"]');
    expect(tooltip?.textContent).toContain("Verb, aorist active indicative, 3rd person singular");
    expect(loved.getAttribute("aria-describedby")).toBe(tooltip!.id);
    act(() => loved.blur());
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });

  it("keeps a keyboard card over its word as the browser scrolls the word into view", () => {
    const loved = buttonWith("ἠγάπησεν");
    // Below the foot of the window when it takes the focus, which is before
    // the browser scrolls it into view.
    let top = 2000;
    loved.getBoundingClientRect = () => new DOMRect(100, top, 80, 40);
    focusFromKeyboard(loved);
    expect(document.querySelector('[role="tooltip"]')).not.toBeNull();
    top = 300;
    act(() => {
      scroller().dispatchEvent(new Event("scroll"));
    });
    const tooltip = document.querySelector<HTMLElement>('[role="tooltip"]');
    expect(tooltip).not.toBeNull();
    // Measured again where the word now is: `gap` (6px) above its top.
    expect(tooltip!.style.top).toBe("294px");
  });

  it("hides a keyboard card when the reader scrolls, and a pointer card whenever the chapter scrolls", () => {
    const loved = buttonWith("ἠγάπησεν");
    focusFromKeyboard(loved);
    expect(document.querySelector('[role="tooltip"]')).not.toBeNull();
    act(() => {
      loved.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: 100 }));
      scroller().dispatchEvent(new Event("scroll"));
    });
    expect(document.querySelector('[role="tooltip"]')).toBeNull();

    act(() => loved.blur());
    vi.useFakeTimers();
    act(() => {
      loved.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: document.body }));
    });
    act(() => vi.advanceTimersByTime(300));
    expect(document.querySelector('[role="tooltip"]')).not.toBeNull();
    act(() => {
      scroller().dispatchEvent(new Event("scroll"));
    });
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });

  it("closes the card on Escape, from the word or from inside the card", () => {
    const loved = buttonWith("ἠγάπησεν");
    act(() => loved.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 })));
    expect(card()).not.toBeNull();
    act(() => {
      loved.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(card()).toBeNull();

    act(() => loved.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 })));
    const row = card()!.querySelector<HTMLButtonElement>("[data-row]")!;
    act(() => row.focus());
    act(() => {
      row.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(card()).toBeNull();
    // The focus goes back to the word, not to the top of the window.
    expect(document.activeElement).toBe(loved);
  });

  it("leaves Escape to a dialog opened over the card: the first closes the dialog, the second the card", async () => {
    const { Modal } = await import("../../components/ui/Modal");
    const loved = buttonWith("ἠγάπησεν");
    act(() => loved.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 })));
    expect(card()).not.toBeNull();
    // The Go to palette, opened over the card with Ctrl K: a Modal in the
    // shell, outside the pane.
    const shell = document.createElement("div");
    document.body.append(shell);
    const shellRoot = createRoot(shell);
    const closePalette = vi.fn(() => act(() => shellRoot.render(null)));
    act(() => shellRoot.render(createElement(Modal, { onClose: closePalette, children: createElement("input", { "aria-label": "Go to" }) })));
    const input = shell.querySelector("input")!;
    act(() => input.focus());

    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(closePalette).toHaveBeenCalledTimes(1);
    expect(shell.querySelector('[aria-modal="true"]')).toBeNull();
    expect(card()).not.toBeNull();

    act(() => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(card()).toBeNull();
    act(() => shellRoot.unmount());
  });

  it("gives the card the focus when it is opened from the keyboard, and not when it is clicked", () => {
    const loved = buttonWith("ἠγάπησεν");
    act(() => loved.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 })));
    expect(card()!.contains(document.activeElement)).toBe(false);
    act(() => host.querySelector("h1")!.click());

    // Enter or Space on a button is a click with no pointer behind it.
    act(() => loved.focus());
    act(() => loved.click());
    expect(document.activeElement).toBe(card());
    // Closed from inside, the focus goes back to the word.
    act(() => (cardProps.mock.lastCall![0] as { onClose: () => void }).onClose());
    expect(card()).toBeNull();
    expect(document.activeElement).toBe(loved);
  });

  it("closes the card when the chapter or the book changes", () => {
    act(() => buttonWith("ἠγάπησεν").click());
    expect(card()).not.toBeNull();
    act(() => root.render(createElement(InterlinearView, { book: JOHN, chapter: 4, onExit: () => {} })));
    expect(card()).toBeNull();

    act(() => buttonWith("ἠγάπησεν").click());
    const GENESIS: Book = { id: 1, osis_code: "Gen", name: "Genesis", short_name: "Gen", testament: "OT", chapter_count: 50 };
    act(() => root.render(createElement(InterlinearView, { book: GENESIS, chapter: 4, onExit: () => {} })));
    expect(card()).toBeNull();
  });

  it("hides the parsing card when the word is clicked", () => {
    vi.useFakeTimers();
    const loved = buttonWith("ἠγάπησεν");
    act(() => {
      loved.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: document.body }));
    });
    act(() => vi.advanceTimersByTime(300));
    expect(document.querySelector('[role="tooltip"]')).not.toBeNull();
    act(() => loved.click());
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });

  it("hangs each Greek word under the English phrase that translates it, by default", () => {
    const cards = [...host.querySelectorAll("[data-phrase-card]")];
    expect(cards.map((c) => [...c.querySelectorAll("button")].map((b) => b.textContent?.split(/[A-Z]/u)[0]))).toEqual([
      ["loved", "ἠγάπησεν"],
      ["the world", "ὁ", "τὸν"],
    ]);
    expect(host.querySelector('[role="radio"][aria-checked="true"]')?.getAttribute("aria-label")).toBe("Under each English word");
  });

  it("sets the words no phrase translates apart, still to be clicked", () => {
    act(() => root.render(createElement(InterlinearView, { book: JOHN, chapter: 5, onExit: () => {} })));
    const apart = host.querySelector("[data-untranslated]")!;
    expect(apart.textContent).toContain("Not matched");
    const words = [...apart.querySelectorAll("button")];
    expect(words.map((b) => b.textContent)).toEqual(["ὁT-NSM", "τὸνT-ASM"]);
    act(() => words[0].click());
    expect(cardProps).toHaveBeenLastCalledWith(expect.objectContaining({ id: "G3588", parsedWord: THE }));
  });

  it("switches to the words in their own order, and to the English alone, and remembers the choice", () => {
    const radio = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find((b) => b.getAttribute("aria-label") === label)!;
    act(() => radio("In Greek order").click());
    expect(useUiStore.getState().interlinearLayout).toBe("original");
    expect(host.querySelector("[data-phrase-card]")).toBeNull();
    expect(JSON.parse(localStorage.getItem("bsa-ui-prefs")!).interlinearLayout).toBe("original");
    expect(buttonWith("ἠγάπησεν")).toBeTruthy();

    act(() => radio("English only").click());
    expect(useUiStore.getState().showMorphology).toBe(false);
    expect(host.textContent).not.toContain("ἠγάπησεν");
    expect(buttonWith("loved")).toBeTruthy();

    act(() => radio("Under each English word").click());
    expect(useUiStore.getState().showMorphology).toBe(true);
    expect(useUiStore.getState().interlinearLayout).toBe("aligned");
    expect(host.querySelectorAll("[data-phrase-card]").length).toBe(2);
  });

  it("scrolls to the verse a linked pane set it at, once for each place", () => {
    const scrollTo = vi.fn();
    const had = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo");
    Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: scrollTo });
    try {
      const render = (verse: number | null) => act(() => root.render(createElement(InterlinearView, { book: JOHN, chapter: 3, verse, onExit: () => {} })));
      render(16);
      expect(scrollTo).toHaveBeenCalledTimes(1);
      expect(scrollTo.mock.contexts[0]).toBe(scroller());
      // The same place again -- the chapter redrawn, the grammar lines
      // turned off -- leaves the reader where they have scrolled to.
      render(16);
      act(() => useUiStore.getState().toggleShowMorphology());
      expect(scrollTo).toHaveBeenCalledTimes(1);
      // Sent to the chapter and then to the verse again, it goes back.
      render(null);
      render(16);
      expect(scrollTo).toHaveBeenCalledTimes(2);
      // A verse the chapter does not have is left alone.
      render(40);
      expect(scrollTo).toHaveBeenCalledTimes(2);
    } finally {
      if (had) Object.defineProperty(HTMLElement.prototype, "scrollTo", had);
      else delete (HTMLElement.prototype as { scrollTo?: unknown }).scrollTo;
    }
  });
});
