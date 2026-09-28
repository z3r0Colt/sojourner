import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Book, InterlinearWord, MorphologyWord } from "../../api/types";

/**
 * The interlinear in a real (jsdom) React tree, its chapter data stood in
 * for and the Strong's card replaced by a stand-in that records what it was
 * given: what is tested is the view's own wiring -- the table's rows and
 * what is in them, the card's word and parsing, a click inside the card
 * leaving it open, Escape and a change of chapter closing it, the focus
 * going into it from the keyboard and back to the row, and the parsing card
 * on hover.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LOVED: MorphologyWord = {
  id: 102,
  sort_order: 2,
  original_word: "ἠγάπησεν",
  lemma: "ἀγαπάω",
  morph_code: "V-AAI-3S",
  strongs_id: "G25",
  headword: "ἀγαπάω",
  headword_transliteration: "agapáō",
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
const THE: MorphologyWord = {
  ...LOVED,
  id: 103,
  sort_order: 3,
  original_word: "ὁ",
  lemma: "ὁ",
  headword: "ὁ",
  headword_transliteration: "ho",
  morph_code: "T-NSM",
  strongs_id: "G3588",
  parsing: null,
};
const THE_WORLD: MorphologyWord = {
  ...THE,
  id: 105,
  sort_order: 5,
  original_word: "τὸν",
  morph_code: "T-ASM",
  parsing: {
    ...LOVED.parsing!,
    part_of_speech: "article",
    tense: null,
    voice: null,
    mood: null,
    person: null,
    case: "accusative",
    gender: "masculine",
    description: "article, accusative masculine singular",
  },
};
const WORLD: MorphologyWord = {
  ...THE,
  id: 106,
  sort_order: 6,
  original_word: "κόσμον",
  lemma: "κόσμος",
  headword: "κόσμος",
  headword_transliteration: "kósmos",
  morph_code: "N-ASM",
  strongs_id: "G2889",
};
/** פְּנֵ֣י of Genesis 1:2, with its munah: TAHOT's lemma for it spells
 * another word, and its Strong's entry has the headword. */
const FACE: MorphologyWord = {
  id: 201,
  sort_order: 0,
  original_word: "פְּנֵ֣י",
  lemma: "פָּנֶה",
  morph_code: "HNcmpc",
  strongs_id: "H6440",
  headword: "פָּנִים",
  headword_transliteration: "pânîym",
  parsing: null,
};
const PHRASES: InterlinearWord[] = [
  { id: 1, sort_order: 0, text: "loved", strongs_id: "G25" },
  { id: 2, sort_order: 1, text: "the world", strongs_id: "G2889" },
];

vi.mock("../../api/queries", () => ({
  // Chapter 5 stands for a verse whose English leaves a word of weight
  // untranslated, and its articles with it: it has no "the world".
  // Genesis stands for a Hebrew chapter of one phrase and its word.
  useInterlinearForChapter: (book: number, chapter: number) => ({
    data: { 16: book === 1 ? [{ id: 9, sort_order: 0, text: "upon the face", strongs_id: "H6440" }] : chapter === 5 ? PHRASES.slice(0, 1) : PHRASES },
    isLoading: false,
  }),
  useMorphologyForChapter: (book: number) => ({ data: { 16: book === 1 ? [FACE] : [LOVED, THE, THE_WORLD, WORLD] }, isLoading: false }),
  useTranslations: () => ({ data: [{ id: 5, code: "KJV" }] }),
  useChapter: (translationId: number | null) => ({ data: translationId === 5 ? [{ verse: 16, text: "For God so loved the world, that he gave" }] : undefined }),
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
const GENESIS: Book = { id: 1, osis_code: "Gen", name: "Genesis", short_name: "Gen", testament: "OT", chapter_count: 50 };

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  cardProps.mockClear();
  if (!useUiStore.getState().showMorphology) useUiStore.getState().toggleShowMorphology();
  useUiStore.getState().setInterlinearLayout("table");
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

const rows = () => [...host.querySelectorAll<HTMLElement>("[data-table-row]")];

/** The table's row with a word, as a button. */
function rowWith(word: string): HTMLButtonElement {
  const row = rows().find((r) => [...r.querySelectorAll("[data-original]")].some((o) => o.textContent === word));
  if (!row || !(row instanceof HTMLButtonElement)) throw new Error(`no row for ${word}`);
  return row;
}

/** A word in the table, as the text has it. */
function wordSpan(word: string): HTMLElement {
  const span = [...host.querySelectorAll<HTMLElement>("[data-original]")].find((o) => o.textContent === word);
  if (!span) throw new Error(`no word ${word}`);
  return span;
}

/** Each row as it reads: its four cells' text, joined with " | ". */
const rowCells = () =>
  rows().map((r) =>
    [...r.querySelectorAll(":scope > span")]
      .flatMap((c) => (c.classList.contains("contents") ? [...c.children] : [c]))
      .map((c) => c.textContent)
      .join(" | "),
  );

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
  it("sets out a row for each phrase: the English, the number, the words with the head's root in letters, and the parsing, or the code where there is none", () => {
    expect(rowCells()).toEqual([
      "loved | G25 | ἠγάπησενἀγαπάω agapáō | Verb · aor act ind · 3rd sg",
      // The articles folded into "the world" in its row, in their places:
      // κόσμον's number first and theirs after it, κόσμον's root and code.
      "the world | G2889 G3588 | ὁτὸνκόσμονκόσμος kósmos | N-ASM",
    ]);
    expect(rowCells().join(" ")).not.toContain("V-AAI-3S");
    // The head in the text's ink, the little words muted.
    expect(rows()[1].querySelector("[data-head]")?.textContent).toBe("κόσμον");
    expect(wordSpan("ὁ").className).toContain("text-ink-3");
    expect(wordSpan("κόσμον").className).not.toContain("text-ink-3");
  });

  it("shows a word's root as its Strong's headword, not the tagged text's lemma, and every mark of the word as the text has it", () => {
    act(() => root.render(createElement(InterlinearView, { book: GENESIS, chapter: 1, onExit: () => {} })));
    expect(rowCells()).toEqual(["upon the face | H6440 | פְּנֵ֣יפָּנִים pânîym | HNcmpc"]);
    expect(host.textContent).not.toContain("פָּנֶה");
  });

  it("takes the Hebrew's cantillation off at the reader's asking, and only the cantillation", () => {
    act(() => root.render(createElement(InterlinearView, { book: GENESIS, chapter: 1, onExit: () => {} })));
    const toggle = host.querySelector<HTMLButtonElement>('[role="switch"]')!;
    expect(toggle.textContent).toBe("Cantillation");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    act(() => toggle.click());
    try {
      expect(toggle.getAttribute("aria-checked")).toBe("false");
      // The munah goes; the dagesh, the shewa and the tsere stay.
      expect(host.querySelector("[data-original]")!.textContent).toBe("פְּנֵי");
      expect(host.querySelector("[data-root]")!.textContent).toBe("פָּנִים");
    } finally {
      act(() => toggle.click());
    }
    expect(host.querySelector("[data-original]")!.textContent).toBe("פְּנֵ֣י");
  });

  it("offers the cantillation switch for Hebrew only", () => {
    expect(host.querySelector('[role="switch"]')).toBeNull();
  });

  it("heads each verse with the verse in the KJV", () => {
    const heading = host.querySelector('[data-verse-row="16"]')!;
    expect(heading.textContent).toBe("16For God so loved the world, that he gave");
    expect(heading.getAttribute("title")).toBe("For God so loved the world, that he gave");
  });

  it("gives the card the Greek word clicked, for its parsing", () => {
    act(() => rowWith("ἠγάπησεν").click());
    expect(card()).not.toBeNull();
    expect(cardProps).toHaveBeenLastCalledWith(expect.objectContaining({ id: "G25", parsedWord: LOVED }));
  });

  it("gives the card the row's head word, or the word pressed: an article folded into the phrase, or its number", () => {
    act(() => buttonWith("the world").click());
    expect(cardProps).toHaveBeenLastCalledWith(expect.objectContaining({ id: "G2889", parsedWord: WORLD }));
    act(() => wordSpan("ὁ").click());
    expect(cardProps).toHaveBeenLastCalledWith(expect.objectContaining({ id: "G3588", parsedWord: THE }));
    act(() => wordSpan("τὸν").click());
    expect(cardProps).toHaveBeenLastCalledWith(expect.objectContaining({ id: "G3588", parsedWord: THE_WORLD }));
    // The article's number after the head's: the first word under it.
    act(() => host.querySelector<HTMLElement>("[data-other-number]")!.click());
    expect(cardProps).toHaveBeenLastCalledWith(expect.objectContaining({ id: "G3588", parsedWord: THE }));
    // Each press opened one card, the word's, and not the row's after it.
    expect(cardProps.mock.calls.filter(([props]) => props.id === "G2889").length).toBe(cardProps.mock.calls.filter(([props]) => props.parsedWord === WORLD).length);
  });

  it("shows the parsing card over the word the pointer rests on, the head's anywhere else on the row", () => {
    vi.useFakeTimers();
    const row = rowWith("κόσμον");
    act(() => {
      wordSpan("τὸν").dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: document.body }));
    });
    act(() => vi.advanceTimersByTime(300));
    expect(document.querySelector('[role="tooltip"]')?.textContent).toContain("T-ASM");
    expect(row.getAttribute("aria-describedby")).toBe(document.querySelector('[role="tooltip"]')!.id);
    act(() => {
      row.querySelector("span")!.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: wordSpan("τὸν") }));
    });
    act(() => vi.advanceTimersByTime(300));
    // κόσμον has only its code, and no parsing card: the article's is gone.
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });

  it("moves the keyboard's parsing card along the row's words with the arrow keys, and opens the card of the word it is on", () => {
    const row = rowWith("κόσμον");
    focusFromKeyboard(row);
    // The head, κόσμον, has no parsing: no card until the arrows reach one.
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    act(() => {
      row.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    });
    expect(document.querySelector('[role="tooltip"]')?.textContent).toContain("T-ASM");
    const marked = () => [...row.querySelectorAll("[data-keyboard]")].map((w) => w.textContent);
    const inRow = [...row.querySelectorAll("[data-original]")].map((w) => w.textContent);
    // The word the arrows are on is marked in the row, the one before κόσμον.
    expect(marked()).toEqual([inRow[inRow.indexOf("κόσμον") - 1]]);
    act(() => {
      row.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    });
    // ὁ has no parsing, and no card; the row still marks it.
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    expect(marked()).toEqual(["ὁ"]);
    // Enter: a click with no pointer behind it.
    act(() => row.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 })));
    expect(cardProps).toHaveBeenLastCalledWith(expect.objectContaining({ id: "G3588", parsedWord: THE }));
  });

  it("keeps the card open for a click inside it, and closes it for a click in the chapter", () => {
    act(() => rowWith("ἠγάπησεν").click());
    act(() => card()!.querySelector<HTMLButtonElement>("[data-row]")!.click());
    expect(card()).not.toBeNull();
    act(() => card()!.querySelector("p")!.click());
    expect(card()).not.toBeNull();
    act(() => host.querySelector("h1")!.click());
    expect(card()).toBeNull();
  });

  it("shows the whole parsing and the code on a word the pointer rests on, and hides it when the pointer leaves", () => {
    vi.useFakeTimers();
    const loved = rowWith("ἠγάπησεν");
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
    const loved = rowWith("ἠγάπησεν");
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
    const loved = rowWith("ἠγάπησεν");
    // Below the foot of the window when it takes the focus, which is before
    // the browser scrolls it into view.
    // The card is set over the row's word, not the middle of the row.
    let top = 2000;
    loved.querySelector<HTMLElement>("[data-original]")!.getBoundingClientRect = () => new DOMRect(100, top, 80, 40);
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
    const loved = rowWith("ἠγάπησεν");
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
    const loved = rowWith("ἠγάπησεν");
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

    // A click on the card's text leaves the focus on nothing; Escape still
    // takes it back to the word.
    act(() => loved.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 })));
    act(() => (document.activeElement as HTMLElement | null)?.blur());
    expect(document.activeElement).toBe(document.body);
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(card()).toBeNull();
    expect(document.activeElement).toBe(loved);
  });

  it("shares the table's width among its columns by what the chapter's rows want", () => {
    const table = host.querySelector<HTMLElement>("[data-interlinear-table]")!;
    expect(table.style.getPropertyValue("--interlinear-columns")).toMatch(/^minmax\(6rem,\d+fr\) fit-content\(4\.75rem\) minmax\(6rem,\d+fr\) minmax\(6rem,\d+fr\)$/);
  });

  it("leaves Escape to a dialog opened over the card: the first closes the dialog, the second the card", async () => {
    const { Modal } = await import("../../components/ui/Modal");
    const loved = rowWith("ἠγάπησεν");
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
    const loved = rowWith("ἠγάπησεν");
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
    act(() => rowWith("ἠγάπησεν").click());
    expect(card()).not.toBeNull();
    act(() => root.render(createElement(InterlinearView, { book: JOHN, chapter: 4, onExit: () => {} })));
    expect(card()).toBeNull();

    act(() => rowWith("ἠγάπησεν").click());
    act(() => root.render(createElement(InterlinearView, { book: GENESIS, chapter: 4, onExit: () => {} })));
    expect(card()).toBeNull();
  });

  it("hides the parsing card when the word is clicked", () => {
    vi.useFakeTimers();
    const loved = rowWith("ἠγάπησεν");
    act(() => {
      loved.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: document.body }));
    });
    act(() => vi.advanceTimersByTime(300));
    expect(document.querySelector('[role="tooltip"]')).not.toBeNull();
    act(() => loved.click());
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });

  it("sets the phrases in the English's order by default, a row to each, with no arrows", () => {
    const words = (r: HTMLElement) => [...r.querySelectorAll("[data-original]")].map((o) => o.textContent).join(" ");
    expect(rows().map(words)).toEqual(["ἠγάπησεν", "ὁ τὸν κόσμον"]);
    expect(host.querySelector('[role="radio"][aria-checked="true"]')?.getAttribute("aria-label")).toBe("Table");
    expect(host.textContent).not.toContain("↑");
  });

  it("puts a word of weight no phrase translates at the foot with its articles, with a dash for the English, still to be clicked", () => {
    act(() => root.render(createElement(InterlinearView, { book: JOHN, chapter: 5, onExit: () => {} })));
    expect(rowCells()).toEqual([
      "loved | G25 | ἠγάπησενἀγαπάω agapáō | Verb · aor act ind · 3rd sg",
      "— | G2889 G3588 | ὁτὸνκόσμονκόσμος kósmos | N-ASM",
    ]);
    act(() => rowWith("κόσμον").click());
    expect(cardProps).toHaveBeenLastCalledWith(expect.objectContaining({ id: "G2889", parsedWord: WORLD }));
    act(() => wordSpan("ὁ").click());
    expect(cardProps).toHaveBeenLastCalledWith(expect.objectContaining({ id: "G3588", parsedWord: THE }));
  });

  it("switches to the words in their own order, and to the English alone, and remembers the choice", () => {
    const radio = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find((b) => b.getAttribute("aria-label") === label)!;
    act(() => radio("In Greek order").click());
    expect(useUiStore.getState().interlinearLayout).toBe("original");
    expect(JSON.parse(localStorage.getItem("bsa-ui-prefs")!).interlinearLayout).toBe("original");
    // ὁ before τὸν now, the phrase on the first of the two.
    expect(rowCells().map((r) => r.split(" | ").slice(0, 3).join(" | "))).toEqual([
      "loved | G25 | ἠγάπησενἀγαπάω agapáō",
      "the world | G3588 | ὁho",
      "↑the world | G3588 | τὸνὁ ho",
      "↑the world | G2889 | κόσμονκόσμος kósmos",
    ]);
    // A screen reader hears the phrase where the eye sees the arrow.
    expect(rows()[2].querySelector(".sr-only")?.textContent).toBe("the world");

    act(() => radio("English only").click());
    expect(useUiStore.getState().showMorphology).toBe(false);
    expect(host.textContent).not.toContain("ἠγάπησεν");
    expect(rows()).toEqual([]);
    expect(buttonWith("loved")).toBeTruthy();

    act(() => radio("Table").click());
    expect(useUiStore.getState().showMorphology).toBe(true);
    expect(useUiStore.getState().interlinearLayout).toBe("table");
    expect(rows().length).toBe(2);
  });

  it("reads a stored choice of the old layout, each word under its English, as the table", async () => {
    localStorage.setItem("bsa-ui-prefs", JSON.stringify({ interlinearLayout: "aligned" }));
    vi.resetModules();
    expect((await import("../../state/uiStore")).useUiStore.getState().interlinearLayout).toBe("table");
    localStorage.setItem("bsa-ui-prefs", JSON.stringify({ interlinearLayout: "original" }));
    vi.resetModules();
    expect((await import("../../state/uiStore")).useUiStore.getState().interlinearLayout).toBe("original");
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
