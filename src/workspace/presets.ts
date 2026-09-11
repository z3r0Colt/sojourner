import type { CommentarySource } from "../api/types";
import {
  PASSAGE_KINDS,
  isLinkGroup,
  isPaneKind,
  resolveBiblePane,
  useWorkspaceStore,
  type BibleParams,
  type LinkGroup,
  type Pane,
  type PaneContent,
  type PaneKind,
  type ParamsOf,
} from "../state/workspaceStore";
import { PANE_KINDS } from "./paneKinds";
import { completeParams } from "./openContent";
import { ROW_SPLIT_DEFAULT, defaultLayoutFor, isLayoutId, type LayoutId } from "./layouts";

/**
 * Saved and named workspaces (W4).
 *
 * A saved workspace is the layout plus each pane's kind, params, link
 * group, and width -- no ids and no history, so it can be applied any
 * number of times. Presets are the same shape, built in; the reader's own
 * are stored under the setting `workspaces` so they travel with backups.
 *
 * Applying one replaces the panes but keeps each Bible pane's passage when
 * the new workspace has a Bible pane in the same link group, so switching
 * from Devotion to Sermon prep stays in the chapter being read.
 */

export interface SavedPane {
  kind: PaneKind;
  /** Whatever the pane needs; anything left out is completed on apply. */
  params: Record<string, unknown>;
  linkGroup: LinkGroup;
  width: number;
  /** A commentary source by code ("mhc" for Matthew Henry) so a preset can
   * name one without knowing its id on this install. */
  sourceCode?: string;
}

export interface SavedWorkspace {
  name: string;
  layout: LayoutId;
  rowSplit?: number;
  panes: SavedPane[];
  /** Presets only; a saved workspace is described by its panes. */
  description?: string;
}

export const WORKSPACES_SETTING = "workspaces";

const A: LinkGroup = "A";

export const PRESET_WORKSPACES: readonly SavedWorkspace[] = [
  {
    name: "Devotion",
    description: "The Bible alone.",
    layout: "one",
    panes: [{ kind: "bible", params: {}, linkGroup: A, width: 1000 }],
  },
  {
    name: "Sermon prep",
    description: "Bible, Matthew Henry, Confessions, and Mine (your notes on the chapter).",
    layout: "two-by-two",
    panes: [
      { kind: "bible", params: {}, linkGroup: A, width: 1000 },
      { kind: "commentary", params: {}, linkGroup: A, width: 700, sourceCode: "mhc" },
      { kind: "confession-for-passage", params: {}, linkGroup: A, width: 420 },
      { kind: "mine", params: {}, linkGroup: A, width: 420 },
    ],
  },
  {
    name: "Word study",
    description: "Bible, Interlinear, and the Lexicon side by side.",
    layout: "three",
    panes: [
      { kind: "bible", params: {}, linkGroup: A, width: 900 },
      { kind: "interlinear", params: {}, linkGroup: A, width: 900 },
      { kind: "lexicon", params: {}, linkGroup: A, width: 700 },
    ],
  },
];

export function isPresetName(name: string): boolean {
  return PRESET_WORKSPACES.some((p) => p.name === name);
}

/** The current workspace as something that can be saved under a name.
 * Per-session details (scroll target, find query, history) are left out. */
export function captureWorkspace(name: string): SavedWorkspace {
  const s = useWorkspaceStore.getState();
  return {
    name,
    layout: s.layout,
    rowSplit: s.rowSplit,
    panes: s.panes.map((p) => {
      const params: Record<string, unknown> = { ...(p.params as Record<string, unknown>) };
      if (p.kind === "bible") {
        delete params.verse;
        delete params.findQuery;
      }
      return { kind: p.kind, params, linkGroup: p.linkGroup, width: p.width };
    }),
  };
}

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Builds the live panes for a saved workspace and applies it. */
export function applyWorkspace(saved: SavedWorkspace, commentarySources: CommentarySource[] | undefined): void {
  const s = useWorkspaceStore.getState();
  const currentBibles = s.panes.filter((p): p is Extract<Pane, { kind: "bible" }> => p.kind === "bible");
  const fallback = resolveBiblePane(s);

  const panes: Pane[] = [];
  for (const sp of saved.panes.slice(0, 4)) {
    if (!isPaneKind(sp.kind)) continue;
    const kind = sp.kind;
    const partial = { ...(sp.params as Partial<ParamsOf<typeof kind>>) };
    if (kind === "commentary" && sp.sourceCode) {
      const source = commentarySources?.find((c) => c.code === sp.sourceCode);
      if (source) (partial as Partial<ParamsOf<"commentary">>).sourceId = source.id;
    }
    const linkGroup = isLinkGroup(sp.linkGroup) ? sp.linkGroup : A;
    let params = completeParams(kind, partial as never, undefined) as ParamsOf<typeof kind>;
    if (kind === "bible") {
      // Keep the passage being read: the current Bible pane in the same
      // group, else the one the reader is working in.
      const keep = (linkGroup != null ? currentBibles.find((b) => b.linkGroup === linkGroup) : undefined) ?? fallback;
      if (keep) {
        const bp = params as BibleParams;
        params = {
          ...bp,
          translationId: keep.params.translationId ?? bp.translationId,
          bookId: keep.params.bookId,
          chapter: keep.params.chapter,
          verse: undefined,
          activeVerse: keep.params.activeVerse,
        } as ParamsOf<typeof kind>;
      }
    }
    const content = { kind, params } as PaneContent;
    panes.push({
      ...content,
      id: newId(),
      linkGroup,
      width: typeof sp.width === "number" && sp.width > 0 ? sp.width : PANE_KINDS[kind].defaultWidth,
      history: [],
      future: [],
    } as Pane);
  }
  if (panes.length === 0) return;

  const layout = isLayoutId(saved.layout) ? saved.layout : defaultLayoutFor(panes.length);
  s.replaceWorkspace(panes, layout, saved.rowSplit ?? ROW_SPLIT_DEFAULT);

  // Study panes in each group catch up with their Bible pane.
  const after = useWorkspaceStore.getState();
  for (const p of after.panes) {
    if (p.kind === "bible" && p.linkGroup != null && after.panes.some((q) => q.id !== p.id && q.linkGroup === p.linkGroup && PASSAGE_KINDS.has(q.kind))) {
      after.publishPassage(p.id, { bookId: p.params.bookId, chapter: p.params.chapter, verse: p.params.activeVerse });
    }
  }
}

/** Drops anything in the stored list that is not a usable workspace. */
export function sanitizeSavedWorkspaces(raw: unknown): SavedWorkspace[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedWorkspace[] = [];
  for (const w of raw) {
    if (!w || typeof w !== "object") continue;
    const o = w as Record<string, unknown>;
    if (typeof o.name !== "string" || !o.name.trim() || !Array.isArray(o.panes)) continue;
    const panes = (o.panes as unknown[]).filter((p): p is SavedPane => !!p && typeof p === "object" && isPaneKind((p as SavedPane).kind));
    if (panes.length === 0) continue;
    out.push({
      name: o.name,
      layout: isLayoutId(o.layout) ? o.layout : defaultLayoutFor(panes.length),
      rowSplit: typeof o.rowSplit === "number" ? o.rowSplit : undefined,
      panes,
    });
  }
  return out;
}
