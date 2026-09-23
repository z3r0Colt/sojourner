import { create } from "zustand";
import { useTtsStore } from "./ttsStore";
import { defaultLayoutFor, isLayoutId, treeFromTemplate } from "../workspace/layouts";
import {
  MAX_PANES,
  addToLeaf,
  findLeaf,
  isLayoutNode,
  leafOfPane,
  movePaneTo as treeMovePaneTo,
  normalize,
  paneOrder,
  placeholderLeaf,
  removePane as treeRemovePane,
  reorderTab as treeReorderTab,
  setActiveTab as treeSetActiveTab,
  setRatio as treeSetRatio,
  splitLeaf,
  splitLeafEmpty,
  swapPaneIds,
  type LayoutNode,
  type Side,
} from "../workspace/layoutTree";

export { MAX_PANES };

/**
 * The workspace: up to eight panes arranged by a split tree (see
 * workspace/layoutTree.ts), each showing any content the app has (a Bible
 * chapter, a commentary, cross references, a page).
 *
 * What lives here is per pane -- the passage, translation, selected verse,
 * paragraph and red-letter modes, link group, and history. What is global
 * (theme, text size, show highlights, show note markers) stays in
 * `uiStore`. The rule: if a preference would surprise someone when it
 * changed in another pane, it is per pane.
 *
 *   Global (uiStore)            Per pane (this store)
 *   ------------------------    -------------------------------------
 *   theme                       translation
 *   text size, line spacing     book and chapter
 *   font                        selected verse (activeVerse)
 *   show verse numbers          paragraph mode
 *   show highlights             red letters
 *   show note markers           interlinear (a pane kind)
 *   show morphology             find query (F1.2)
 *   copy format (F1.6)          scroll position (the pane's own element)
 *   zoom shortcuts (F1.7)       link group
 *   focus mode (chrome hidden)  history and future
 *
 * The reading position and the reading log (F3.1) are written only by the
 * focused Bible pane -- see ReadingPane.
 *
 * The whole workspace is persisted to local storage under a version number;
 * `migrateWorkspace` upgrades older shapes instead of dropping them.
 */

export interface Position {
  bookId: number;
  chapter: number;
  verse?: number;
}

export type LinkGroup = "A" | "B" | "C" | null;

export const LINK_GROUPS: readonly Exclude<LinkGroup, null>[] = ["A", "B", "C"];

export function isLinkGroup(v: unknown): v is LinkGroup {
  return v === null || v === "A" || v === "B" || v === "C";
}

export interface BibleParams {
  translationId: number | null;
  bookId: number;
  chapter: number;
  /** Navigation target: the verse scrolled into view when the chapter opens. */
  verse?: number;
  /** The verse the reader clicked -- drives linked study panes and bookmarks.
   * Separate from `verse`, which is a scroll target rather than a selection. */
  activeVerse: number | null;
  paragraphMode: boolean;
  redLetterMode: boolean;
  /** Find-in-chapter query; undefined while the pane's find bar is closed. */
  findQuery?: string;
}

/** A pane that follows a passage: the chapter it shows and the verse it is
 * focused on (null when no verse is selected). */
export interface PassageParams {
  bookId: number;
  chapter: number;
  verse: number | null;
}

export interface CommentaryParams extends PassageParams {
  sourceId: number | null;
}

export interface CommentaryBookParams {
  sourceId: number | null;
  bookId: number | null;
  sectionId: number | null;
}

export interface WestminsterParams {
  docCode: string | null;
  sectionId: number | null;
}

export interface LexiconParams {
  id: string | null;
  /** A search to run on open ("Search the lexicon for ‘word’"). */
  query?: string;
}

export interface DictionaryParams {
  slug: string | null;
}

export interface EncyclopediaParams {
  slug: string | null;
}

/** The atlas follows the passage, so it carries the same book/chapter/verse
 * every study pane does, alongside whichever place or journey is selected.
 * `slug` and `journey` are what the reader chose; the passage is what the
 * Bible pane beside it is showing. */
export interface AtlasParams extends PassageParams {
  slug: string | null;
  journey: string | null;
}

export interface ResourceParams {
  id: number;
}

/** One sermon's manuscript. The pane holds only the id; the document itself
 * lives in user.db and is loaded and autosaved by the pane. */
export interface SermonParams {
  id: number;
}

export interface SettingsParams {
  section: string | null;
}

export type EmptyParams = Record<string, never>;

export interface SearchParams {
  query: string;
}

export interface WordStudyParams {
  /** A Strong's number, "G3056". */
  id: string | null;
}

export type PaneContent =
  | { kind: "bible"; params: BibleParams }
  | { kind: "interlinear"; params: PassageParams }
  | { kind: "commentary"; params: CommentaryParams }
  | { kind: "crossrefs"; params: PassageParams }
  | { kind: "confession-for-passage"; params: PassageParams }
  | { kind: "encyclopedia-for-passage"; params: PassageParams }
  | { kind: "metrical"; params: PassageParams }
  | { kind: "tunes"; params: Record<string, never> }
  | { kind: "mine"; params: PassageParams }
  | { kind: "westminster"; params: WestminsterParams }
  | { kind: "lexicon"; params: LexiconParams }
  | { kind: "dictionary"; params: DictionaryParams }
  | { kind: "encyclopedia"; params: EncyclopediaParams }
  | { kind: "atlas"; params: AtlasParams }
  | { kind: "resource"; params: ResourceParams }
  | { kind: "resources"; params: EmptyParams }
  | { kind: "commentary-book"; params: CommentaryBookParams }
  | { kind: "today"; params: EmptyParams }
  | { kind: "notes"; params: EmptyParams }
  | { kind: "highlights"; params: EmptyParams }
  | { kind: "prayer"; params: EmptyParams }
  | { kind: "memory"; params: EmptyParams }
  | { kind: "plans"; params: EmptyParams }
  | { kind: "harmony"; params: EmptyParams }
  | { kind: "sermons"; params: EmptyParams }
  | { kind: "sermon"; params: SermonParams }
  | { kind: "illustrations"; params: EmptyParams }
  | { kind: "search"; params: SearchParams }
  | { kind: "wordstudy"; params: WordStudyParams }
  | { kind: "settings"; params: SettingsParams };

export type PaneKind = PaneContent["kind"];
export type ParamsOf<K extends PaneKind> = Extract<PaneContent, { kind: K }>["params"];

export const PANE_KIND_LIST: readonly PaneKind[] = [
  "bible",
  "interlinear",
  "commentary",
  "crossrefs",
  "confession-for-passage",
  "encyclopedia-for-passage",
  "metrical",
  "tunes",
  "mine",
  "westminster",
  "lexicon",
  "dictionary",
  "encyclopedia",
  "atlas",
  "resource",
  "resources",
  "commentary-book",
  "today",
  "notes",
  "highlights",
  "prayer",
  "memory",
  "plans",
  "harmony",
  "sermons",
  "sermon",
  "illustrations",
  "search",
  "wordstudy",
  "settings",
];

/** Kinds that follow the passage published by a linked pane. */
export const PASSAGE_KINDS: ReadonlySet<PaneKind> = new Set<PaneKind>([
  "bible",
  "interlinear",
  "commentary",
  "crossrefs",
  "confession-for-passage",
  "encyclopedia-for-passage",
  "metrical",
  "mine",
  "atlas",
]);

/** Kinds that lead a link group without following it. A sermon pane
 * publishes the passage under the writer's cursor, so the Bible and
 * commentary beside it turn to the text being written about -- but it never
 * follows, because the manuscript must not scroll out from under the writer
 * when a verse is clicked (Q4). */
export const LEADING_KINDS: ReadonlySet<PaneKind> = new Set<PaneKind>(["sermon"]);

/** Kinds the study panel used to hold (plus "Mine", F2.4): what Ctrl+B adds or focuses. */
export const STUDY_KINDS: ReadonlySet<PaneKind> = new Set<PaneKind>(["commentary", "crossrefs", "confession-for-passage", "metrical", "mine"]);

export function isPaneKind(v: unknown): v is PaneKind {
  return typeof v === "string" && (PANE_KIND_LIST as readonly string[]).includes(v);
}

interface PaneMeta {
  id: string;
  linkGroup: LinkGroup;
  history: PaneContent[];
  future: PaneContent[];
}

export type Pane = PaneContent & PaneMeta;

const HISTORY_CAP = 50;
const STORAGE_KEY = "bsa-workspace";
/** Bump when the stored shape changes and add a case to `migrateWorkspace`.
 *   1  panes, focusedPaneId, lastTranslationId
 *   2  + layout, rowSplit (W3)
 *   3  tree replaces layout and rowSplit; pane widths dropped; up to eight panes */
export const WORKSPACE_VERSION = 3;

interface PersistedWorkspace {
  version: number;
  panes: Pane[];
  focusedPaneId: string;
  lastTranslationId: number | null;
  tree: LayoutNode;
}

export interface AddPaneOptions {
  /** The pane the new one opens beside (default: the focused pane). */
  after?: string;
  /** Which side of that pane the new one goes on (default: right). */
  side?: Side;
  /** Join that pane's tab group instead of splitting. */
  asTab?: boolean;
  /** Fill this (empty) leaf instead of splitting anything. */
  intoLeaf?: string;
  /** The share of the split the existing pane keeps (default: half). */
  ratio?: number;
  linkGroup?: LinkGroup;
  focus?: boolean;
}

interface WorkspaceState {
  panes: Pane[];
  focusedPaneId: string;
  /** The one pane shown alone: a double-clicked header, or F11 with chrome hidden. */
  maximizedPaneId: string | null;
  /** How the panes are arranged (see workspace/layoutTree.ts). */
  tree: LayoutNode;
  /** Pane ids in reading order, derived from the tree on every change so
   * selectors never allocate. "Pane 3" and Ctrl+3 mean `order[2]`. */
  order: string[];
  /** The translation most recently chosen in any Bible pane -- the default
   * for new Bible panes and for previews outside any pane. */
  lastTranslationId: number | null;
  /** True when the workspace came back from local storage rather than
   * being freshly created (the shell then skips the reading-position
   * bootstrap). Not persisted. */
  restored: boolean;
  /** Set once the shell has finished bootstrapping; Bible panes do not
   * write the reading position before then. Not persisted. */
  ready: boolean;

  setReady: () => void;
  /** Focuses a pane and, if it is a tab, brings it to the front. */
  focusPane: (id: string) => void;
  /** Adds a pane beside `after` (or the focused pane) and returns its id.
   * Returns null when the workspace is full. */
  addPane: (content: PaneContent, opts?: AddPaneOptions) => string | null;
  closePane: (id: string) => void;
  /** Exchange two panes' places. */
  swapPanes: (aId: string, bId: string) => void;
  /** Moves a pane onto a side of another leaf (a new split) or into it as a tab. */
  movePaneTo: (paneId: string, targetLeafId: string, target: Side | "center", index?: number) => void;
  /** Splits a pane's slot with an empty placeholder that offers to add content. */
  splitPane: (paneId: string, side: Side) => void;
  /** Removes an empty placeholder leaf. */
  closeLeaf: (leafId: string) => void;
  setActiveTab: (leafId: string, paneId: string) => void;
  reorderTab: (leafId: string, paneId: string, toIndex: number) => void;
  setRatio: (branchId: string, ratio: number) => void;
  /** Rearranges the existing panes: the builder gets their ids in reading order. */
  applyArrangement: (build: (paneIds: string[]) => LayoutNode) => void;
  /** Replace every pane and the arrangement at once (W4: switching workspaces).
   * History is cleared and the first pane is focused. */
  replaceWorkspace: (panes: Pane[], tree: LayoutNode) => void;
  setLinkGroup: (id: string, group: LinkGroup) => void;
  setMaximized: (id: string | null) => void;
  /** Patch a pane's params without touching history (selection, view modes). */
  setPaneParams: <K extends PaneKind>(id: string, kind: K, patch: Partial<ParamsOf<K>>) => void;
  /** Replace a pane's content, pushing the old content onto its history. */
  setPaneContent: (id: string, content: PaneContent, opts?: { pushHistory?: boolean }) => void;
  goBack: (id: string) => void;
  goForward: (id: string) => void;
  setLastTranslation: (id: number) => void;
  /** A pane announces the passage it is on; every other pane in its link
   * group that accepts passages follows. */
  publishPassage: (fromId: string, passage: PassageParams) => void;
}

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** The panes array in the tree's reading order. */
function reorderPanes(panes: Pane[], tree: LayoutNode): Pane[] {
  const order = paneOrder(tree);
  return [...panes].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

/** Drops a leaf and collapses its parent to the sibling; the root leaf stays. */
function removeLeafNode(tree: LayoutNode, leafId: string): LayoutNode {
  if (tree.type === "leaf") return tree;
  if (tree.children[0].id === leafId) return tree.children[1];
  if (tree.children[1].id === leafId) return tree.children[0];
  const a = removeLeafNode(tree.children[0], leafId);
  const b = removeLeafNode(tree.children[1], leafId);
  if (a === tree.children[0] && b === tree.children[1]) return tree;
  return { ...tree, children: [a, b] };
}

function shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.is(a[k], b[k]));
}

function contentOf(p: Pane): PaneContent {
  return { kind: p.kind, params: p.params } as PaneContent;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isContent(v: unknown): v is PaneContent {
  return isPlainObject(v) && isPaneKind(v.kind) && isPlainObject(v.params);
}

/** Upgrades a stored workspace to the current version, or returns null when
 * it cannot be trusted (unknown shape, no panes). Append a case here each
 * time `WORKSPACE_VERSION` moves. */
export function migrateWorkspace(raw: unknown): PersistedWorkspace | null {
  if (!isPlainObject(raw) || typeof raw.version !== "number") return null;
  let data = raw;
  // Version upgrades run in order; each case rewrites `data` to the next shape.
  if (data.version === 1) {
    // W3 added the layout template and the row split; a version-1
    // workspace gets the layout its pane count always implied.
    data = { ...data, version: 2, layout: defaultLayoutFor(Array.isArray(data.panes) ? data.panes.length : 1), rowSplit: 0.5 };
  }
  if (data.version === 2) {
    // The template and row split become a tree of the same shape, with
    // the column widths the old flex weights gave.
    const rawPanes = Array.isArray(data.panes) ? data.panes : [];
    const templatePanes = rawPanes
      .filter((p): p is Record<string, unknown> => isPlainObject(p) && typeof p.id === "string")
      .map((p) => ({ id: p.id as string, width: typeof p.width === "number" && p.width > 0 ? p.width : undefined }));
    const layout = isLayoutId(data.layout) ? data.layout : defaultLayoutFor(templatePanes.length);
    const rowSplit = typeof data.rowSplit === "number" && Number.isFinite(data.rowSplit) ? data.rowSplit : 0.5;
    data = { ...data, version: 3, tree: treeFromTemplate(layout, templatePanes, rowSplit) };
  }
  if (data.version !== WORKSPACE_VERSION) return null;
  if (!Array.isArray(data.panes)) return null;
  const panes: Pane[] = [];
  for (const p of data.panes) {
    if (!isContent(p) || typeof (p as Pane).id !== "string") continue;
    const meta = p as Pane;
    const group = isLinkGroup(meta.linkGroup) ? meta.linkGroup : null;
    panes.push({
      ...(contentOf(meta) as PaneContent),
      id: meta.id,
      linkGroup: group,
      history: Array.isArray(meta.history) ? meta.history.filter(isContent).slice(-HISTORY_CAP) : [],
      future: Array.isArray(meta.future) ? meta.future.filter(isContent).slice(0, HISTORY_CAP) : [],
    } as Pane);
  }
  if (panes.length === 0) return null;
  const kept = panes.slice(0, MAX_PANES);
  const focusedPaneId = kept.some((p) => p.id === data.focusedPaneId) ? (data.focusedPaneId as string) : kept[0].id;
  const lastTranslationId = typeof data.lastTranslationId === "number" ? data.lastTranslationId : null;
  const tree = normalize(isLayoutNode(data.tree) ? data.tree : null, kept.map((p) => p.id));
  return { version: WORKSPACE_VERSION, panes: kept, focusedPaneId, lastTranslationId, tree };
}

function loadWorkspace(): PersistedWorkspace | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? migrateWorkspace(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** The pre-workspace UI preferences, used once to seed the first workspace
 * so an upgrade keeps the reader's paragraph mode, red letters, and study
 * panel. */
function legacyUiPrefs(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem("bsa-ui-prefs");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function defaultWorkspace(): { panes: Pane[]; focusedPaneId: string; tree: LayoutNode } {
  const prefs = legacyUiPrefs();
  const bible: Pane = {
    id: newId(),
    kind: "bible",
    params: {
      translationId: null,
      bookId: 1,
      chapter: 1,
      activeVerse: null,
      paragraphMode: prefs.paragraphMode === true,
      redLetterMode: prefs.redLetterMode === true,
    },
    linkGroup: "A",
    history: [],
    future: [],
  };
  const panes: Pane[] = [bible];
  const widths = [1000];
  if (prefs.commentaryPanelOpen === true) {
    panes.push({
      id: newId(),
      kind: "commentary",
      params: { bookId: 1, chapter: 1, verse: null, sourceId: null },
      linkGroup: "A",
      history: [],
      future: [],
    });
    widths.push(typeof prefs.commentaryPanelWidth === "number" ? prefs.commentaryPanelWidth : 420);
  }
  const tree = treeFromTemplate(
    defaultLayoutFor(panes.length),
    panes.map((p, i) => ({ id: p.id, width: widths[i] })),
  );
  return { panes, focusedPaneId: bible.id, tree };
}

const initial = (() => {
  const stored = loadWorkspace();
  if (stored) {
    return { panes: stored.panes, focusedPaneId: stored.focusedPaneId, lastTranslationId: stored.lastTranslationId, tree: stored.tree, restored: true };
  }
  const fresh = defaultWorkspace();
  return { ...fresh, lastTranslationId: null, restored: false };
})();

/** The two fields that change together whenever the tree does. */
function withTree(tree: LayoutNode): { tree: LayoutNode; order: string[] } {
  return { tree, order: paneOrder(tree) };
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  panes: initial.panes,
  focusedPaneId: initial.focusedPaneId,
  maximizedPaneId: null,
  ...withTree(initial.tree),
  lastTranslationId: initial.lastTranslationId,
  restored: initial.restored,
  ready: false,

  setReady: () => set({ ready: true }),

  focusPane: (id) => {
    const { focusedPaneId, panes, tree } = get();
    if (!panes.some((p) => p.id === id)) return;
    const home = leafOfPane(tree, id);
    const next = home && home.activeId !== id ? treeSetActiveTab(tree, home.id, id) : tree;
    if (focusedPaneId === id && next === tree) return;
    set({ focusedPaneId: id, ...(next === tree ? {} : withTree(next)) });
  },

  addPane: (content, opts = {}) => {
    const { panes, focusedPaneId, tree } = get();
    if (panes.length >= MAX_PANES) return null;
    // `null` is a real value here (an unlinked pane); only an omitted group defaults to A.
    const linkGroup = opts.linkGroup === undefined ? "A" : opts.linkGroup;
    const pane = { ...content, id: newId(), linkGroup, history: [], future: [] } as Pane;
    const originId = opts.after ?? focusedPaneId;
    const originLeaf = leafOfPane(tree, originId);
    const placeholder = opts.intoLeaf ? findLeaf(tree, opts.intoLeaf) : placeholderLeaf(tree);
    let next: LayoutNode;
    if (placeholder && placeholder.paneIds.length === 0) {
      // An empty slot is waiting for content: it takes the pane, whatever
      // the caller thought about splitting.
      next = addToLeaf(tree, placeholder.id, pane.id);
    } else if (originLeaf && opts.asTab) {
      next = addToLeaf(tree, originLeaf.id, pane.id);
    } else if (originLeaf) {
      next = splitLeaf(tree, originLeaf.id, opts.side ?? "right", pane.id, opts.ratio ?? 0.5);
    } else {
      next = normalize(tree, [...panes.map((p) => p.id), pane.id]);
    }
    // Panes keep reading order in the array too, so anything that lists
    // them (the palette, Ctrl+N) agrees with what is on screen.
    const ordered = paneOrder(next);
    const all = [...panes, pane].sort((a, b) => ordered.indexOf(a.id) - ordered.indexOf(b.id));
    set({ panes: all, focusedPaneId: opts.focus === false ? focusedPaneId : pane.id, ...withTree(next) });
    return pane.id;
  },

  closePane: (id) => {
    const { panes, focusedPaneId, maximizedPaneId, tree } = get();
    if (panes.length <= 1) return;
    const idx = panes.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const next = panes.filter((p) => p.id !== id);
    const nextTree = treeRemovePane(tree, id);
    let focused = focusedPaneId;
    if (focusedPaneId === id) {
      // The tab that took the closed one's place, else the neighbour in
      // reading order.
      const home = leafOfPane(tree, id);
      const sibling = home ? findLeaf(nextTree, home.id)?.activeId : null;
      const order = paneOrder(tree).filter((p) => p !== id);
      const wasAt = paneOrder(tree).indexOf(id);
      focused = sibling ?? order[Math.min(Math.max(wasAt, 0), order.length - 1)] ?? next[0].id;
    }
    if (useTtsStore.getState().paneId === id) useTtsStore.getState().stop();
    set({
      panes: next,
      focusedPaneId: focused,
      maximizedPaneId: maximizedPaneId === id ? null : maximizedPaneId,
      ...withTree(nextTree),
    });
  },

  swapPanes: (aId, bId) => {
    const { tree } = get();
    const next = swapPaneIds(tree, aId, bId);
    if (next !== tree) set({ ...withTree(next), panes: reorderPanes(get().panes, next) });
  },

  movePaneTo: (paneId, targetLeafId, target, index) => {
    const { tree } = get();
    const next = treeMovePaneTo(tree, paneId, targetLeafId, target, index);
    if (next === tree) return;
    set({ ...withTree(next), panes: reorderPanes(get().panes, next), maximizedPaneId: null });
  },

  splitPane: (paneId, side) => {
    const { tree } = get();
    const home = leafOfPane(tree, paneId);
    if (!home || placeholderLeaf(tree)) return;
    set({ ...withTree(splitLeafEmpty(tree, home.id, side)), maximizedPaneId: null });
  },

  closeLeaf: (leafId) => {
    const { tree } = get();
    const target = findLeaf(tree, leafId);
    if (!target || target.paneIds.length > 0 || tree.type === "leaf") return;
    set(withTree(removeLeafNode(tree, leafId)));
  },

  setActiveTab: (leafId, paneId) => {
    const { tree } = get();
    const next = treeSetActiveTab(tree, leafId, paneId);
    set({ focusedPaneId: paneId, ...(next === tree ? {} : withTree(next)) });
  },

  reorderTab: (leafId, paneId, toIndex) => {
    const { tree } = get();
    const next = treeReorderTab(tree, leafId, paneId, toIndex);
    if (next !== tree) set({ ...withTree(next), panes: reorderPanes(get().panes, next) });
  },

  setRatio: (branchId, ratio) => {
    const { tree } = get();
    const next = treeSetRatio(tree, branchId, ratio);
    if (next !== tree) set({ tree: next });
  },

  applyArrangement: (build) => {
    const { panes, order } = get();
    const next = normalize(build(order), panes.map((p) => p.id));
    set({ ...withTree(next), panes: reorderPanes(panes, next), maximizedPaneId: null });
  },

  replaceWorkspace: (panes, tree) => {
    if (panes.length === 0) return;
    useTtsStore.getState().stop();
    const kept = panes.slice(0, MAX_PANES);
    const next = normalize(tree, kept.map((p) => p.id));
    set({
      panes: reorderPanes(kept, next),
      focusedPaneId: kept[0].id,
      maximizedPaneId: null,
      ...withTree(next),
    });
  },

  setLinkGroup: (id, group) => {
    const { panes } = get();
    const pane = panes.find((p) => p.id === id);
    if (!pane || pane.linkGroup === group) return;
    set({ panes: panes.map((p) => (p.id === id ? { ...p, linkGroup: group } : p)) });
    // A pane that joins a group catches up with the group's passage at
    // once, rather than waiting for the next verse click: the group's
    // Bible pane republishes where it is.
    if (group == null || !PASSAGE_KINDS.has(pane.kind)) return;
    const leader = get().panes.find((p) => p.id !== id && p.kind === "bible" && p.linkGroup === group);
    if (leader && leader.kind === "bible") {
      get().publishPassage(leader.id, { bookId: leader.params.bookId, chapter: leader.params.chapter, verse: leader.params.activeVerse });
    }
  },

  setMaximized: (id) => set({ maximizedPaneId: id }),

  setPaneParams: (id, kind, patch) => {
    set((s) => {
      const pane = s.panes.find((p) => p.id === id);
      if (!pane || pane.kind !== kind) return {};
      const params = { ...pane.params, ...patch } as Record<string, unknown>;
      if (shallowEqual(params, pane.params as Record<string, unknown>)) return {};
      return { panes: s.panes.map((p) => (p.id === id ? ({ ...p, params } as Pane) : p)) };
    });
  },

  setPaneContent: (id, content, opts) => {
    const pushHistory = opts?.pushHistory ?? true;
    set((s) => {
      const pane = s.panes.find((p) => p.id === id);
      if (!pane) return {};
      const history = pushHistory ? [...pane.history, contentOf(pane)].slice(-HISTORY_CAP) : pane.history;
      const future = pushHistory ? [] : pane.future;
      const next = { ...pane, ...content, history, future } as Pane;
      return { panes: s.panes.map((p) => (p.id === id ? next : p)) };
    });
  },

  goBack: (id) => {
    set((s) => {
      const pane = s.panes.find((p) => p.id === id);
      if (!pane || pane.history.length === 0) return {};
      const prev = pane.history[pane.history.length - 1];
      const next = { ...pane, ...prev, history: pane.history.slice(0, -1), future: [contentOf(pane), ...pane.future].slice(0, HISTORY_CAP) } as Pane;
      return { panes: s.panes.map((p) => (p.id === id ? next : p)) };
    });
  },

  goForward: (id) => {
    set((s) => {
      const pane = s.panes.find((p) => p.id === id);
      if (!pane || pane.future.length === 0) return {};
      const target = pane.future[0];
      const next = { ...pane, ...target, future: pane.future.slice(1), history: [...pane.history, contentOf(pane)].slice(-HISTORY_CAP) } as Pane;
      return { panes: s.panes.map((p) => (p.id === id ? next : p)) };
    });
  },

  setLastTranslation: (lastTranslationId) => {
    if (get().lastTranslationId !== lastTranslationId) set({ lastTranslationId });
  },

  publishPassage: (fromId, passage) => {
    const { panes } = get();
    const from = panes.find((p) => p.id === fromId);
    if (!from || from.linkGroup == null) return;
    let changed = false;
    const next = panes.map((p) => {
      if (p.id === fromId || p.linkGroup !== from.linkGroup || !PASSAGE_KINDS.has(p.kind)) return p;
      if (p.kind === "bible") {
        // The verse is both selected (`activeVerse`, the highlight) and made
        // the scroll target (`verse`): a follower whose rows are virtualized
        // would otherwise highlight a row that is not even mounted, and the
        // reader would see nothing move.
        const target = passage.verse ?? undefined;
        const sameChapter = p.params.bookId === passage.bookId && p.params.chapter === passage.chapter;
        if (sameChapter) {
          if (p.params.activeVerse === passage.verse && p.params.verse === target) return p;
          changed = true;
          return { ...p, params: { ...p.params, activeVerse: passage.verse, verse: target } } as Pane;
        }
        // A linked Bible pane follows chapter changes but keeps its own
        // translation and view modes; the move goes on its history like any
        // other navigation so Back restores it.
        changed = true;
        const params: BibleParams = { ...p.params, bookId: passage.bookId, chapter: passage.chapter, verse: target, activeVerse: passage.verse };
        return { ...p, params, history: [...p.history, contentOf(p)].slice(-HISTORY_CAP), future: [] } as Pane;
      }
      const cur = p.params as PassageParams;
      if (cur.bookId === passage.bookId && cur.chapter === passage.chapter && cur.verse === passage.verse) return p;
      changed = true;
      return { ...p, params: { ...p.params, bookId: passage.bookId, chapter: passage.chapter, verse: passage.verse } } as Pane;
    });
    if (changed) set({ panes: next });
  },
}));

// ---------------------------------------------------------------------------
// Persistence: every change is written (debounced) under a version number.

let persistTimer: number | null = null;
useWorkspaceStore.subscribe((s) => {
  if (persistTimer != null) window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    const data: PersistedWorkspace = {
      version: WORKSPACE_VERSION,
      panes: s.panes,
      focusedPaneId: s.focusedPaneId,
      lastTranslationId: s.lastTranslationId,
      tree: s.tree,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // ignore storage failures (quota, private mode)
    }
  }, 150);
});

// ---------------------------------------------------------------------------
// Selectors and helpers shared by the workspace module and the shell.

export function findPane(panes: Pane[], id: string | null | undefined): Pane | undefined {
  return id ? panes.find((p) => p.id === id) : undefined;
}

/** The Bible pane a passage-level action should act on: the focused pane
 * when it is a Bible pane, else a Bible pane in the focused pane's link
 * group, else the first Bible pane. Null when the workspace has none. */
export function resolveBiblePane(s: Pick<WorkspaceState, "panes" | "focusedPaneId">): Extract<Pane, { kind: "bible" }> | null {
  const bibles = s.panes.filter((p): p is Extract<Pane, { kind: "bible" }> => p.kind === "bible");
  if (bibles.length === 0) return null;
  const focused = findPane(s.panes, s.focusedPaneId);
  if (focused?.kind === "bible") return focused as Extract<Pane, { kind: "bible" }>;
  if (focused?.linkGroup != null) {
    const linked = bibles.find((b) => b.linkGroup === focused.linkGroup);
    if (linked) return linked;
  }
  return bibles[0];
}

/** The first link group no pane uses, or null when A, B, and C are all
 * taken. Used when a study pane is opened from an unlinked Bible pane: the
 * two get a group of their own so the new pane follows the pane it came
 * from, as the roadmap promises, without dragging group A along. */
export function freeLinkGroup(panes: Pane[]): Exclude<LinkGroup, null> | null {
  return LINK_GROUPS.find((g) => !panes.some((p) => p.linkGroup === g)) ?? null;
}

/** The passage the focused pane is on (for seeding new study panes). */
export function currentPassage(s: Pick<WorkspaceState, "panes" | "focusedPaneId">): PassageParams | null {
  const focused = findPane(s.panes, s.focusedPaneId);
  if (focused && PASSAGE_KINDS.has(focused.kind)) {
    if (focused.kind === "bible") return { bookId: focused.params.bookId, chapter: focused.params.chapter, verse: focused.params.activeVerse };
    const p = focused.params as PassageParams;
    return { bookId: p.bookId, chapter: p.chapter, verse: p.verse };
  }
  const bible = resolveBiblePane(s);
  return bible ? { bookId: bible.params.bookId, chapter: bible.params.chapter, verse: bible.params.activeVerse } : null;
}

export function useFocusedPane(): Pane | undefined {
  return useWorkspaceStore((s) => findPane(s.panes, s.focusedPaneId));
}

/** The translation previews and passage lookups outside any pane should
 * use: the resolved Bible pane's, else the last one chosen anywhere. */
export function useReaderTranslationId(): number | null {
  return useWorkspaceStore((s) => resolveBiblePane(s)?.params.translationId ?? s.lastTranslationId);
}

/** Recently read chapters from a pane's history, newest first,
 * deduplicated -- what the Go to palette lists with nothing typed. Pure,
 * so callers memoize on the (stable) history array; a store selector must
 * never return a fresh array. */
export function recentPositions(history: PaneContent[] | undefined, limit = 6): Position[] {
  if (!history) return [];
  const seen = new Set<string>();
  const out: Position[] = [];
  for (let i = history.length - 1; i >= 0 && out.length < limit; i--) {
    const h = history[i];
    if (h.kind !== "bible") continue;
    const key = `${h.params.bookId}:${h.params.chapter}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ bookId: h.params.bookId, chapter: h.params.chapter });
  }
  return out;
}
