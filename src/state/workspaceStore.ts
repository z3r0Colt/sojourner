import { create } from "zustand";
import { useTtsStore } from "./ttsStore";

/**
 * The workspace: one to four panes side by side, each showing any content
 * the app has (a Bible chapter, a commentary, cross references, a page).
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
 * The reading position (and the reading log, once F3.1 adds it) is written
 * only by the focused Bible pane -- see ReadingPane.
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
  /** Reserved for find-in-chapter (F1.2). */
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
}

export interface DictionaryParams {
  slug: string | null;
}

export interface ResourceParams {
  id: number;
}

export interface SettingsParams {
  section: string | null;
}

export type EmptyParams = Record<string, never>;

export type PaneContent =
  | { kind: "bible"; params: BibleParams }
  | { kind: "interlinear"; params: PassageParams }
  | { kind: "commentary"; params: CommentaryParams }
  | { kind: "crossrefs"; params: PassageParams }
  | { kind: "confession-for-passage"; params: PassageParams }
  | { kind: "metrical"; params: PassageParams }
  | { kind: "westminster"; params: WestminsterParams }
  | { kind: "lexicon"; params: LexiconParams }
  | { kind: "dictionary"; params: DictionaryParams }
  | { kind: "resource"; params: ResourceParams }
  | { kind: "resources"; params: EmptyParams }
  | { kind: "commentary-book"; params: CommentaryBookParams }
  | { kind: "notes"; params: EmptyParams }
  | { kind: "prayer"; params: EmptyParams }
  | { kind: "memory"; params: EmptyParams }
  | { kind: "plans"; params: EmptyParams }
  | { kind: "harmony"; params: EmptyParams }
  | { kind: "settings"; params: SettingsParams };

export type PaneKind = PaneContent["kind"];
export type ParamsOf<K extends PaneKind> = Extract<PaneContent, { kind: K }>["params"];

export const PANE_KIND_LIST: readonly PaneKind[] = [
  "bible",
  "interlinear",
  "commentary",
  "crossrefs",
  "confession-for-passage",
  "metrical",
  "westminster",
  "lexicon",
  "dictionary",
  "resource",
  "resources",
  "commentary-book",
  "notes",
  "prayer",
  "memory",
  "plans",
  "harmony",
  "settings",
];

/** Kinds that follow the passage published by a linked pane. */
export const PASSAGE_KINDS: ReadonlySet<PaneKind> = new Set<PaneKind>([
  "bible",
  "interlinear",
  "commentary",
  "crossrefs",
  "confession-for-passage",
  "metrical",
]);

/** Kinds the study panel used to hold: what Ctrl+B adds or focuses. */
export const STUDY_KINDS: ReadonlySet<PaneKind> = new Set<PaneKind>(["commentary", "crossrefs", "confession-for-passage", "metrical"]);

export function isPaneKind(v: unknown): v is PaneKind {
  return typeof v === "string" && (PANE_KIND_LIST as readonly string[]).includes(v);
}

interface PaneMeta {
  id: string;
  linkGroup: LinkGroup;
  /** Flex weight, not pixels: 1000 for a full reading column, 420 for a
   * study pane. Resolution-independent, so the layout survives a monitor
   * change. */
  width: number;
  history: PaneContent[];
  future: PaneContent[];
}

export type Pane = PaneContent & PaneMeta;

export const MAX_PANES = 4;
const HISTORY_CAP = 50;
const STORAGE_KEY = "bsa-workspace";
export const WORKSPACE_VERSION = 1;

interface PersistedWorkspace {
  version: number;
  panes: Pane[];
  focusedPaneId: string;
  lastTranslationId: number | null;
}

interface WorkspaceState {
  panes: Pane[];
  focusedPaneId: string;
  /** F11: the one pane shown while chrome is hidden. */
  maximizedPaneId: string | null;
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
  focusPane: (id: string) => void;
  /** Adds a pane after `after` (or the focused pane) and returns its id.
   * Returns null when the workspace is full. */
  addPane: (content: PaneContent, opts: { width: number; after?: string; linkGroup?: LinkGroup; focus?: boolean }) => string | null;
  closePane: (id: string) => void;
  movePane: (id: string, direction: -1 | 1) => void;
  /** Shifts weight from the pane on the left of a divider to the one on its right (negative moves it back). */
  resizeBetween: (leftId: string, rightId: string, deltaWeight: number) => void;
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
  switch (data.version) {
    case WORKSPACE_VERSION:
      break;
    default:
      return null;
  }
  if (!Array.isArray(data.panes)) return null;
  const panes: Pane[] = [];
  for (const p of data.panes) {
    if (!isContent(p) || typeof (p as Pane).id !== "string") continue;
    const meta = p as Pane;
    const group = meta.linkGroup === "A" || meta.linkGroup === "B" || meta.linkGroup === "C" ? meta.linkGroup : null;
    panes.push({
      ...(contentOf(meta) as PaneContent),
      id: meta.id,
      linkGroup: group,
      width: typeof meta.width === "number" && meta.width > 0 ? meta.width : 1000,
      history: Array.isArray(meta.history) ? meta.history.filter(isContent).slice(-HISTORY_CAP) : [],
      future: Array.isArray(meta.future) ? meta.future.filter(isContent).slice(0, HISTORY_CAP) : [],
    } as Pane);
  }
  if (panes.length === 0) return null;
  const focusedPaneId = panes.some((p) => p.id === data.focusedPaneId) ? (data.focusedPaneId as string) : panes[0].id;
  const lastTranslationId = typeof data.lastTranslationId === "number" ? data.lastTranslationId : null;
  return { version: WORKSPACE_VERSION, panes: panes.slice(0, MAX_PANES), focusedPaneId, lastTranslationId };
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

function defaultWorkspace(): { panes: Pane[]; focusedPaneId: string } {
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
    width: 1000,
    history: [],
    future: [],
  };
  const panes: Pane[] = [bible];
  if (prefs.commentaryPanelOpen === true) {
    panes.push({
      id: newId(),
      kind: "commentary",
      params: { bookId: 1, chapter: 1, verse: null, sourceId: null },
      linkGroup: "A",
      width: typeof prefs.commentaryPanelWidth === "number" ? prefs.commentaryPanelWidth : 420,
      history: [],
      future: [],
    });
  }
  return { panes, focusedPaneId: bible.id };
}

const initial = (() => {
  const stored = loadWorkspace();
  if (stored) return { panes: stored.panes, focusedPaneId: stored.focusedPaneId, lastTranslationId: stored.lastTranslationId, restored: true };
  const fresh = defaultWorkspace();
  return { ...fresh, lastTranslationId: null, restored: false };
})();

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  panes: initial.panes,
  focusedPaneId: initial.focusedPaneId,
  maximizedPaneId: null,
  lastTranslationId: initial.lastTranslationId,
  restored: initial.restored,
  ready: false,

  setReady: () => set({ ready: true }),

  focusPane: (id) => {
    if (get().focusedPaneId === id || !get().panes.some((p) => p.id === id)) return;
    set({ focusedPaneId: id });
  },

  addPane: (content, opts) => {
    const { panes, focusedPaneId } = get();
    if (panes.length >= MAX_PANES) return null;
    const afterId = opts.after ?? focusedPaneId;
    const idx = panes.findIndex((p) => p.id === afterId);
    const pane = { ...content, id: newId(), linkGroup: opts.linkGroup ?? "A", width: opts.width, history: [], future: [] } as Pane;
    const next = [...panes];
    next.splice(idx >= 0 ? idx + 1 : next.length, 0, pane);
    set({ panes: next, focusedPaneId: opts.focus === false ? focusedPaneId : pane.id });
    return pane.id;
  },

  closePane: (id) => {
    const { panes, focusedPaneId, maximizedPaneId } = get();
    if (panes.length <= 1) return;
    const idx = panes.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const next = panes.filter((p) => p.id !== id);
    const focused = focusedPaneId === id ? next[Math.min(idx, next.length - 1)].id : focusedPaneId;
    if (useTtsStore.getState().paneId === id) useTtsStore.getState().stop();
    set({ panes: next, focusedPaneId: focused, maximizedPaneId: maximizedPaneId === id ? null : maximizedPaneId });
  },

  movePane: (id, direction) => {
    const { panes } = get();
    const idx = panes.findIndex((p) => p.id === id);
    const to = idx + direction;
    if (idx < 0 || to < 0 || to >= panes.length) return;
    const next = [...panes];
    [next[idx], next[to]] = [next[to], next[idx]];
    set({ panes: next });
  },

  resizeBetween: (leftId, rightId, deltaWeight) => {
    const MIN = 120;
    set((s) => {
      const left = s.panes.find((p) => p.id === leftId);
      const right = s.panes.find((p) => p.id === rightId);
      if (!left || !right) return {};
      const delta = Math.max(MIN - left.width, Math.min(right.width - MIN, deltaWeight));
      if (delta === 0) return {};
      return {
        panes: s.panes.map((p) => (p.id === leftId ? { ...p, width: p.width + delta } : p.id === rightId ? { ...p, width: p.width - delta } : p)),
      };
    });
  },

  setLinkGroup: (id, group) => set((s) => ({ panes: s.panes.map((p) => (p.id === id ? { ...p, linkGroup: group } : p)) })),

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
        const sameChapter = p.params.bookId === passage.bookId && p.params.chapter === passage.chapter;
        if (sameChapter) {
          if (p.params.activeVerse === passage.verse) return p;
          changed = true;
          return { ...p, params: { ...p.params, activeVerse: passage.verse } } as Pane;
        }
        // A linked Bible pane follows chapter changes but keeps its own
        // translation and view modes; the move goes on its history like any
        // other navigation so Back restores it.
        changed = true;
        const params: BibleParams = { ...p.params, bookId: passage.bookId, chapter: passage.chapter, verse: undefined, activeVerse: passage.verse };
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

/** Recently read chapters across the focused pane's history, newest first,
 * deduplicated -- what the Go to palette lists with nothing typed. */
export function recentPositions(s: Pick<WorkspaceState, "panes" | "focusedPaneId">, limit = 6): Position[] {
  const pane = findPane(s.panes, s.focusedPaneId) ?? s.panes[0];
  if (!pane) return [];
  const seen = new Set<string>();
  const out: Position[] = [];
  for (let i = pane.history.length - 1; i >= 0 && out.length < limit; i--) {
    const h = pane.history[i];
    if (h.kind !== "bible") continue;
    const key = `${h.params.bookId}:${h.params.chapter}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ bookId: h.params.bookId, chapter: h.params.chapter });
  }
  return out;
}
