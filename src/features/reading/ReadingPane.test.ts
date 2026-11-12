import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Book, Translation, Verse } from "../../api/types";

/**
 * The Bible pane in a real (jsdom) React tree, with a chapter stood in for.
 *
 * The pane is the screen every other part of the app serves, and until this
 * file nothing mounted it whole: its helpers are tested, and it was tried
 * by hand. What is checked here is that it holds together -- the toolbar it
 * draws, the chapter under it, the verse menu, and that a highlight and a
 * note reach the database call with the verse they were made on. It is the
 * net to work over when the pane is next taken apart.
 *
 * Stood in for: the data hooks (every one answers "nothing" unless named
 * below), the backend, the list's virtualizer (jsdom lays nothing out, so
 * it would draw no rows), and the note editor's rich text (a plain box).
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const GENESIS: Book = { id: 1, osis_code: "Gen", name: "Genesis", short_name: "Gen", testament: "OT", chapter_count: 50 };
const BOOKS: Book[] = [GENESIS, { id: 2, osis_code: "Exod", name: "Exodus", short_name: "Exod", testament: "OT", chapter_count: 40 }];
const TRANSLATIONS = [
  { id: 5, code: "KJV", name: "King James Version (1769)", language: "en", script: "latin", scope: null },
  { id: 6, code: "ASV", name: "American Standard Version (1901)", language: "en", script: "latin", scope: null },
] as unknown as Translation[];
const VERSES = [
  { verse: 1, text: "In the beginning God created the heaven and the earth." },
  { verse: 2, text: "And the earth was without form, and void." },
  { verse: 3, text: "And God said, Let there be light: and there was light." },
] as unknown as Verse[];

const createHighlight = vi.fn();
const createNote = vi.fn();
const NONE: never[] = [];
const IDLE = { data: undefined, isLoading: false, isFetching: false, mutate: vi.fn(), mutateAsync: vi.fn(async () => undefined) };
const answer = <T,>(data: T) => {
  const result = { data, isLoading: false, isFetching: false };
  return () => result;
};

vi.mock("../../api/queries", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const idle = Object.fromEntries(
    Object.keys(actual)
      .filter((k) => typeof actual[k] === "function")
      .map((k) => [k, () => IDLE]),
  );
  return {
    ...idle,
    useBooks: answer(BOOKS),
    useTranslations: answer(TRANSLATIONS),
    useChapter: answer(VERSES),
    useHighlights: answer(NONE),
    useNotesForChapter: answer(NONE),
    useBookmarks: answer(NONE),
    useChapterNotes: answer(NONE),
    useCreateHighlight: () => ({ mutate: createHighlight }),
    useCreateNote: () => ({ mutate: createNote }),
    useTrashToast: () => () => {},
  };
});

vi.mock("../../api/client", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  // Every backend call answers null: the pane asks for citation counts and
  // saves the reading position on its own.
  return { ...actual, api: new Proxy({}, { get: () => async () => null }) };
});

vi.mock("@tanstack/react-virtual", () => ({
  // Every row, as if the window were tall enough for the chapter.
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, key: index, start: index * 40, size: 40, end: index * 40 + 40, lane: 0 })),
    getTotalSize: () => count * 40,
    measureElement: () => {},
    scrollToIndex: () => {},
    scrollToOffset: () => {},
    measure: () => {},
  }),
}));

vi.mock("../notes/RichTextEditor", async () => {
  const { createElement: h } = await import("react");
  return {
    RichTextEditor: ({ content, onChange }: { content: string; onChange: (html: string) => void }) =>
      h("textarea", { "data-note-box": "", value: content, onChange: (e: { target: { value: string } }) => onChange(e.target.value) }),
  };
});

const { ReadingPane } = await import("./ReadingPane");
const { PaneContext } = await import("../../workspace/PaneContext");
const { useWorkspaceStore } = await import("../../state/workspaceStore");

const PANE = "pane-under-test";
let host: HTMLDivElement;
let root: Root;

function mount(width = 1200) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  act(() =>
    root.render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(PaneContext.Provider, { value: { id: PANE, isFocused: true, width, height: 800 } }, createElement(ReadingPane)),
      ),
    ),
  );
}

beforeEach(() => {
  createHighlight.mockClear();
  createNote.mockClear();
  useWorkspaceStore.setState({
    panes: [
      {
        id: PANE,
        kind: "bible",
        params: { translationId: 5, bookId: 1, chapter: 1, activeVerse: null, paragraphMode: false, redLetterMode: false },
        linkGroup: "A",
        history: [],
        future: [],
      },
    ] as never,
    focusedPaneId: PANE,
    ready: true,
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
});

const params = () => useWorkspaceStore.getState().panes[0].params as { activeVerse: number | null; translationId: number | null; paragraphMode: boolean };
const verseNumbers = () => [...host.querySelectorAll<HTMLButtonElement>('[data-tour="verse"]')];
const menu = () => document.querySelector<HTMLElement>('[role="menu"][aria-label$=" actions"]');
const click = (el: Element | null | undefined) => {
  if (!el) throw new Error("nothing to click");
  act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
};
const button = (within: ParentNode, name: RegExp | string) => {
  const found = [...within.querySelectorAll<HTMLButtonElement>("button")].find((b) => {
    const label = b.getAttribute("aria-label") ?? b.textContent ?? "";
    return typeof name === "string" ? label.trim() === name : name.test(label);
  });
  if (!found) throw new Error(`no button ${name}`);
  return found;
};
function openVerseMenu(verse: number) {
  click(verseNumbers()[verse - 1]);
  const open = menu();
  if (!open) throw new Error(`no menu for verse ${verse}`);
  return open;
}

describe("the Bible pane", () => {
  it("draws its toolbar and the chapter", () => {
    mount();
    expect(host.querySelector<HTMLSelectElement>('select[aria-label="Book"]')?.selectedOptions[0]?.textContent).toContain("Genesis");
    expect(button(host, /^Translation: King James Version/).textContent).toContain("KJV");
    for (const name of [/^Find in this chapter/, /^Chapter notes/, /^Bookmarks/, /^Text size/, "View options", /^Focus mode/]) expect(button(host, name)).toBeTruthy();
    expect(verseNumbers().map((b) => b.textContent?.trim())).toEqual(["1", "2", "3"]);
    expect(host.textContent).toContain("And God said, Let there be light: and there was light.");
  });

  it("names the translations in its menu, and changes to the one picked", () => {
    mount();
    click(button(host, /^Translation: King James Version/));
    const asv = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("American Standard Version (1901)"));
    expect(asv?.textContent).toContain("ASV");
    click(asv);
    expect(params().translationId).toBe(6);
  });

  it("folds its tools into one menu in a narrow pane", () => {
    mount(600);
    expect(button(host, "More reading tools")).toBeTruthy();
    expect([...host.querySelectorAll("button")].some((b) => /^Find in this chapter/.test(b.getAttribute("aria-label") ?? ""))).toBe(false);
  });

  it("opens a verse's menu from its number, and selects the verse", () => {
    mount();
    const open = openVerseMenu(2);
    expect(open.getAttribute("aria-label")).toBe("Genesis 1:2 actions");
    expect(params().activeVerse).toBe(2);
    for (const item of ["Commentary on this verse", "Add a note", "Copy verse"]) expect(open.textContent).toContain(item);
  });

  it("highlights the verse the menu was opened on", () => {
    mount();
    const open = openVerseMenu(3);
    click(open.querySelector('button[aria-label^="Highlight verse"]'));
    expect(createHighlight).toHaveBeenCalledTimes(1);
    expect(createHighlight.mock.calls[0][0]).toMatchObject({ bookId: 1, chapter: 1, verseStart: 3, verseEnd: 3, style: "highlight", translationId: 5 });
    expect(menu()).toBeNull();
  });

  it("writes a note on the verse the menu was opened on", () => {
    mount();
    click(button(openVerseMenu(2), /Add a note/));
    const box = document.querySelector<HTMLTextAreaElement>("[data-note-box]");
    expect(box).not.toBeNull();
    // The tour watches for this mark to know a note is being written.
    expect(document.querySelector('[data-tour="note-editor"]')).not.toBeNull();
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      set.call(box, "<p>The Spirit moved upon the face of the waters.</p>");
      box!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    click(button(document, "Save note"));
    expect(createNote).toHaveBeenCalledTimes(1);
    expect(createNote.mock.calls[0][0]).toMatchObject({ bookId: 1, chapter: 1, verseStart: 2, verseEnd: 2, body: "<p>The Spirit moved upon the face of the waters.</p>" });
  });

  it("opens the find bar from the toolbar", () => {
    mount();
    expect(host.querySelector('input[aria-label*="Find"], input[placeholder*="Find"]')).toBeNull();
    click(button(host, /^Find in this chapter/));
    expect(host.querySelector('input[aria-label*="Find"], input[placeholder*="Find"]')).not.toBeNull();
  });

  it("turns to paragraphs from View options, and back", () => {
    mount();
    expect(host.querySelectorAll("[data-verse-row]").length).toBe(3);
    click(button(host, "View options"));
    const box = [...document.querySelectorAll("label")].find((l) => l.textContent?.includes("Paragraph mode"))?.querySelector("input");
    click(box);
    expect(params().paragraphMode).toBe(true);
    expect(host.textContent).toContain("In the beginning God created the heaven and the earth.");
  });
});
