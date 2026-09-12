import {
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
    case "resource":
    case "sermon":
      return { id: 0, ...partial } as unknown as ParamsOf<K>;
    case "commentary-book":
      return { sourceId: null, bookId: null, sectionId: null, ...partial } as unknown as ParamsOf<K>;
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

function openInNewPane(content: PaneContent, opts: OpenOptions) {
  const store = useWorkspaceStore.getState();
  const origin = findPane(store.panes, opts.from ?? store.focusedPaneId);
  const linkGroup = groupForNewPane(content, origin, opts);
  const id = store.addPane(content, { width: PANE_KINDS[content.kind].defaultWidth, after: origin?.id, linkGroup });
  if (!id) return;
  const passage = passageOf(content);
  if (passage && content.kind !== "bible") useWorkspaceStore.getState().publishPassage(id, passage);
}

export function openContent<K extends PaneKind>(kind: K, params: Partial<ParamsOf<K>>, opts: OpenOptions = {}): void {
  const target = opts.target ?? "focused";
  const store = useWorkspaceStore.getState();

  if (target === "new") {
    if (store.panes.length >= 4) {
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
