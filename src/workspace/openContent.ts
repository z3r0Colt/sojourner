import {
  MAX_PANES,
  PASSAGE_KINDS,
  currentPassage,
  findPane,
  freeLinkGroup,
  resolveBiblePane,
  useWorkspaceStore,
  type BibleParams,
  type LinkGroup,
  type Pane,
  type PaneContent,
  type PaneKind,
  type ParamsOf,
  type PassageParams,
  type Position,
} from "../state/workspaceStore";
import { PANE_KINDS } from "./paneKinds";
import { DIVIDER_PX, PANE_MIN_PX, type Side } from "./layoutTree";
import { toast } from "../components/ui/toast";

/**
 * The one way to jump anywhere.
 *
 *   openPassage({ bookId, chapter, verse }, { target })   -- a Bible reference
 *   openContent("lexicon", { id: "G26" }, { target })     -- anything else
 *
 * `target` is "focused" (default), "new", or a pane id. Ctrl+click and
 * middle-click on any link mean "new"; `targetFor(event)` reads that.
 *
 * "focused" for a passage resolves to the Bible pane the reader is working
 * in: the focused pane when it is a Bible pane, else a Bible pane in the
 * focused pane's link group (the study pane that was clicked follows it),
 * else the focused pane itself is turned into a Bible pane -- which is what
 * a single Notes page did before panes existed.
 */

export type OpenTarget = "focused" | "new" | (string & {});

export interface OpenOptions {
  target?: OpenTarget;
  /** The pane the action came from. A new pane opens beside it and joins
   * its link group. Defaults to the focused pane. */
  from?: string;
  /** For a new Bible pane: link it to the origin's group so it follows
   * chapter changes ("Compare in a new pane"). A Bible pane opened by a
   * plain jump stays independent, so Romans on the left and Galatians on
   * the right can be read side by side. Study panes always link. */
  link?: boolean;
  /** With target "new": fill this empty slot rather than splitting. */
  intoLeaf?: string;
  /** With target "new": add the pane as a tab beside its origin rather than
   * splitting the origin's slot. */
  asTab?: boolean;
}

/** "new" for Ctrl+click, Cmd+click, or a middle-click; otherwise `fallback`. */
export function targetFor(e: { ctrlKey: boolean; metaKey: boolean; button?: number }, fallback: OpenTarget = "focused"): OpenTarget {
  return e.ctrlKey || e.metaKey || e.button === 1 ? "new" : fallback;
}

const GENESIS: BibleParams = { translationId: null, bookId: 1, chapter: 1, activeVerse: null, paragraphMode: false, redLetterMode: false };

/** The Bible params a pane should start from when it becomes (or spawns) a
 * Bible pane: its own current Bible params, the last Bible content in its
 * history, the nearest Bible pane, or the last chapter read anywhere. */
function bibleTemplate(target: Pane | undefined): BibleParams {
  const s = useWorkspaceStore.getState();
  if (target?.kind === "bible") return target.params;
  const fromHistory = target ? [...target.history].reverse().find((h) => h.kind === "bible") : undefined;
  if (fromHistory?.kind === "bible") return fromHistory.params;
  const nearest = resolveBiblePane(s);
  if (nearest) return nearest.params;
  return { ...GENESIS, translationId: s.lastTranslationId };
}

/** Fills in whatever a request left out so the pane has complete params. */
export function completeParams<K extends PaneKind>(kind: K, partial: Partial<ParamsOf<K>>, target: Pane | undefined): ParamsOf<K> {
  const s = useWorkspaceStore.getState();
  switch (kind) {
    case "bible": {
      const p = partial as Partial<BibleParams>;
      const base = bibleTemplate(target);
      const verse = p.verse;
      return {
        ...base,
        ...p,
        translationId: p.translationId ?? base.translationId ?? s.lastTranslationId,
        verse,
        activeVerse: p.activeVerse !== undefined ? p.activeVerse : verse ?? (p.bookId != null || p.chapter != null ? null : base.activeVerse),
      } as ParamsOf<K>;
    }
    case "interlinear":
    case "crossrefs":
    case "confession-for-passage":
    case "encyclopedia-for-passage":
    case "factbook-for-passage":
    case "citations":
    case "timeline-for-passage":
    case "metrical":
    case "mine":
    case "commentary": {
      const passage: PassageParams = currentPassage(s) ?? { bookId: 1, chapter: 1, verse: null };
      const sourceId = target?.kind === "commentary" ? target.params.sourceId : null;
      const base = kind === "commentary" ? { ...passage, sourceId } : passage;
      return { ...base, ...partial } as unknown as ParamsOf<K>;
    }
    case "westminster":
      return { docCode: null, sectionId: null, ...partial } as unknown as ParamsOf<K>;
    case "lexicon":
      return { id: null, ...partial } as unknown as ParamsOf<K>;
    case "dictionary":
      return { slug: null, ...partial } as unknown as ParamsOf<K>;
    case "encyclopedia":
      return { slug: null, ...partial } as unknown as ParamsOf<K>;
    case "atlas": {
      // The atlas follows the passage, so it opens on whatever is being read
      // rather than on an empty map.
      const passage: PassageParams = currentPassage(s) ?? { bookId: 1, chapter: 1, verse: null };
      return { ...passage, slug: null, journey: null, ...partial } as unknown as ParamsOf<K>;
    }
    case "resource":
    case "sermon":
      return { id: 0, ...partial } as unknown as ParamsOf<K>;
    case "commentary-book":
      return { sourceId: null, bookId: null, sectionId: null, ...partial } as unknown as ParamsOf<K>;
    case "search":
      return { query: "", ...partial } as unknown as ParamsOf<K>;
    case "wordstudy":
    case "factbook":
      return { id: null, ...partial } as unknown as ParamsOf<K>;
    case "timeline":
      return { eventId: null, year: null, ...partial } as unknown as ParamsOf<K>;
    case "settings":
      return { section: null, ...partial } as unknown as ParamsOf<K>;
    default:
      return {} as ParamsOf<K>;
  }
}

function sameContent(a: PaneContent, b: PaneContent): boolean {
  if (a.kind !== b.kind) return false;
  const pa = a.params as Record<string, unknown>;
  const pb = b.params as Record<string, unknown>;
  const keys = new Set([...Object.keys(pa), ...Object.keys(pb)]);
  for (const k of keys) if (!Object.is(pa[k], pb[k])) return false;
  return true;
}

function passageOf(content: PaneContent): PassageParams | null {
  if (!PASSAGE_KINDS.has(content.kind)) return null;
  if (content.kind === "bible") return { bookId: content.params.bookId, chapter: content.params.chapter, verse: content.params.activeVerse };
  const p = content.params as PassageParams;
  return { bookId: p.bookId, chapter: p.chapter, verse: p.verse };
}

function applyToPane(paneId: string, content: PaneContent) {
  const store = useWorkspaceStore.getState();
  const pane = findPane(store.panes, paneId);
  if (!pane) return;
  if (!sameContent(pane, content)) store.setPaneContent(paneId, content);
  store.focusPane(paneId);
  const passage = passageOf(content);
  if (passage) useWorkspaceStore.getState().publishPassage(paneId, passage);
}

/** The group a new pane joins: the origin's, so it follows the pane it was
 * opened from. A plain Bible pane stays unlinked. When the origin is itself
 * unlinked and the new pane follows passages, both are put in a free group
 * (else A) so the new pane follows its origin rather than group A. */
function groupForNewPane(content: PaneContent, origin: Pane | undefined, opts: OpenOptions): LinkGroup {
  if (content.kind === "bible" && !opts.link) return null;
  if (!origin) return "A";
  if (origin.linkGroup != null) return origin.linkGroup;
  if (!PASSAGE_KINDS.has(origin.kind) || !PASSAGE_KINDS.has(content.kind)) return "A";
  const free = freeLinkGroup(useWorkspaceStore.getState().panes);
  if (!free) return "A";
  useWorkspaceStore.getState().setLinkGroup(origin.id, free);
  return free;
}

/** Where a new pane goes beside its origin: to the right, or below when
 * the origin is already too narrow to halve; as a tab when there is no
 * room either way. Measured from the DOM, so outside the app (tests) it
 * is simply "right". */
function placementBeside(originId: string | undefined): { side: Side; asTab: boolean } {
  if (!originId || typeof document === "undefined") return { side: "right", asTab: false };
  const el = document.querySelector<HTMLElement>(`[data-pane-id="${originId}"]`);
  if (!el) return { side: "right", asTab: false };
  const { width, height } = el.getBoundingClientRect();
  if (width >= PANE_MIN_PX * 2 + DIVIDER_PX) return { side: "right", asTab: false };
  if (height >= PANE_MIN_PX * 2 + DIVIDER_PX) return { side: "bottom", asTab: false };
  return { side: "right", asTab: true };
}

/** The share of a split the origin keeps: the two kinds' relative weights,
 * so a study pane opened beside the Bible takes about a third. */
function ratioBeside(origin: Pane | undefined, kind: PaneKind): number {
  const a = origin ? PANE_KINDS[origin.kind].defaultWidth : 1000;
  const b = PANE_KINDS[kind].defaultWidth;
  return a / (a + b);
}

function openInNewPane(content: PaneContent, opts: OpenOptions) {
  const store = useWorkspaceStore.getState();
  const origin = findPane(store.panes, opts.from ?? store.focusedPaneId);
  const linkGroup = groupForNewPane(content, origin, opts);
  const placement = opts.intoLeaf
    ? { side: "right" as Side, asTab: false }
    : opts.asTab
      ? { side: "right" as Side, asTab: true }
      : placementBeside(origin?.id);
  const id = store.addPane(content, { after: origin?.id, linkGroup, intoLeaf: opts.intoLeaf, ...placement, ratio: ratioBeside(origin, content.kind) });
  if (!id) return;
  const passage = passageOf(content);
  if (passage && content.kind !== "bible") useWorkspaceStore.getState().publishPassage(id, passage);
}

/** Whether opening `kind` in this pane would replace work in progress -- a
 * sermon manuscript -- with something else. Opening that same sermon again
 * is not a replacement. */
export function keepsItsPlace(pane: Pane, kind: PaneKind, params: Partial<ParamsOf<PaneKind>>): boolean {
  if (pane.kind !== "sermon") return false;
  return !(kind === "sermon" && (params as { id?: number }).id === pane.params.id);
}

export function openContent<K extends PaneKind>(kind: K, params: Partial<ParamsOf<K>>, opts: OpenOptions = {}): void {
  const target = opts.target ?? "focused";
  const store = useWorkspaceStore.getState();

  if (target === "new") {
    if (store.panes.length >= MAX_PANES) {
      // The workspace is full: fall back to the focused pane rather than drop the jump.
      openContent(kind, params, { ...opts, target: "focused" });
      return;
    }
    const origin = findPane(store.panes, opts.from ?? store.focusedPaneId);
    const content = { kind, params: completeParams(kind, params, origin) } as PaneContent;
    openInNewPane(content, opts);
    return;
  }

  let paneId: string;
  if (target === "focused") {
    if (kind === "bible") {
      // A passage lands in the Bible pane the reader is working in; a focused
      // study pane follows it through the link group rather than turning
      // into a second Bible.
      paneId = resolveBiblePane(store)?.id ?? store.focusedPaneId;
    } else {
      paneId = store.focusedPaneId;
      // A sermon being written is not a page to navigate away from: a jump
      // from the sidebar, a link or the command bar opens beside it as a
      // tab, and the manuscript stays one click away rather than vanishing
      // from the screen. (Its own links -- back to the list -- name the
      // pane, and still replace it.)
      const focused = findPane(store.panes, paneId);
      if (focused && keepsItsPlace(focused, kind, params) && store.panes.length < MAX_PANES) {
        openContent(kind, params, { ...opts, target: "new", from: focused.id, asTab: true });
        return;
      }
    }
  } else {
    paneId = target;
  }
  const pane = findPane(store.panes, paneId);
  if (!pane) return;
  const content = { kind, params: completeParams(kind, params, pane) } as PaneContent;
  applyToPane(paneId, content);
}

/** Jump to a Bible reference. `verse` scrolls into view and becomes the
 * selected verse, as the old `goTo` did. */
export function openPassage(pos: Position, opts: OpenOptions = {}): void {
  openContent("bible", { bookId: pos.bookId, chapter: pos.chapter, verse: pos.verse, activeVerse: pos.verse ?? null }, opts);
}

/** A new tab beside `fromId`, in the same slot: `kind` opened fresh, or a
 * copy of the pane itself when no kind is given (Ctrl+T), which keeps its
 * link group so the copy follows the same passage until it is moved on.
 * Tabs count toward the workspace's panes, so a full workspace says so
 * rather than quietly replacing what is on screen. */
export function openNewTab(fromId: string, kind?: PaneKind): void {
  const store = useWorkspaceStore.getState();
  const origin = findPane(store.panes, fromId);
  if (!origin) return;
  if (store.panes.length >= MAX_PANES) {
    toast.info(`The workspace holds ${MAX_PANES} panes and tabs. Close one to open another tab.`);
    return;
  }
  if (!kind) {
    store.addPane({ kind: origin.kind, params: origin.params } as PaneContent, { after: origin.id, linkGroup: origin.linkGroup, asTab: true });
    return;
  }
  openContent(kind, {}, { target: "new", from: origin.id, asTab: true });
}
