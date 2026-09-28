import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Dictionary page's choice of work in a real (jsdom) React tree, the
 * pane, the setting and the two works stood in for: what is tested is that
 * a bare pane mounts neither work until the reader's last choice has
 * loaded -- not the Bible dictionaries for a moment, fetching their index,
 * before Webster -- and that the switch still works meanwhile.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Work = "bible" | "webster";
let params: { slug: string | null; work?: Work; webster?: number | null };
let setting: { value: Work; isLoaded: boolean };
const paramsSet: unknown[] = [];
const remembered: unknown[] = [];
let indexAsked = 0;

vi.mock("../../workspace/PaneContext", () => ({
  usePaneParams: () => [params, (next: unknown) => paramsSet.push(next)],
  usePaneNavigate: () => () => {},
  usePaneOptional: () => null,
}));
vi.mock("../../hooks/useSetting", () => ({
  useSetting: (key: string, fallback: unknown) =>
    key === "dictionary.work"
      ? [setting.isLoaded ? setting.value : fallback, (next: unknown) => remembered.push(next), { isLoaded: setting.isLoaded }]
      : [fallback, () => {}, { isLoaded: true }],
}));
vi.mock("../../api/queries", () => ({
  useDictionaryIndex: () => {
    indexAsked++;
    return { data: [] };
  },
  useDictionaryEntry: () => ({ data: undefined }),
  useIsbeEntryByTerm: () => ({ data: undefined }),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: undefined, isFetching: false }) }));
vi.mock("./WebsterDictionary", async () => {
  const { createElement: h } = await import("react");
  return { WebsterDictionary: ({ entryId }: { entryId: number | null }) => h("div", { "data-testid": "webster" }, `webster ${entryId}`) };
});
vi.mock("../sermons/StudyActions", () => ({ StudyActions: () => null }));
vi.mock("../../hooks/useReferenceParser", () => ({ scanScriptureRefs: () => [], useBookLookup: () => null }));
vi.mock("../../state/uiStore", () => ({ useReadingTypography: () => ({}) }));

const { DictionaryView } = await import("./DictionaryView");

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  params = { slug: null };
  setting = { value: "webster", isLoaded: false };
  paramsSet.length = 0;
  remembered.length = 0;
  indexAsked = 0;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
});

const render = () => act(() => root.render(createElement(DictionaryView)));
const tabs = () => [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
const webster = () => host.querySelector('[data-testid="webster"]');

describe("the Dictionary page's choice of work", () => {
  it("shows neither work in a bare pane until the reader's last choice has loaded", () => {
    render();
    expect(webster()).toBeNull();
    expect(indexAsked).toBe(0);
    expect(tabs().map((t) => t.getAttribute("aria-selected"))).toEqual(["false", "false"]);
    expect(host.querySelector('[role="status"]')).not.toBeNull();

    setting = { value: "webster", isLoaded: true };
    render();
    expect(webster()?.textContent).toBe("webster null");
    expect(indexAsked).toBe(0);
  });

  it("writes the work a bare pane falls back to into the pane, for its tab and route", () => {
    render();
    expect(paramsSet).toEqual([]);
    setting = { value: "webster", isLoaded: true };
    render();
    expect(paramsSet).toEqual([{ work: "webster" }]);
    // Not over what a pane opened on something already says.
    paramsSet.length = 0;
    params = { slug: null, webster: 41 };
    render();
    params = { slug: "melchizedek" };
    render();
    expect(paramsSet).toEqual([]);
  });

  it("lets the reader choose meanwhile", () => {
    render();
    act(() => tabs()[1].click());
    expect(paramsSet).toEqual([{ work: "webster" }]);
    expect(remembered).toEqual(["webster"]);
  });

  it("shows what the pane says without waiting for the setting", () => {
    params = { slug: null, work: "webster", webster: 41 };
    render();
    expect(webster()?.textContent).toBe("webster 41");

    params = { slug: "melchizedek" };
    render();
    expect(webster()).toBeNull();
    expect(indexAsked).toBeGreaterThan(0);
    expect(tabs().map((t) => t.getAttribute("aria-selected"))).toEqual(["true", "false"]);
  });
});
