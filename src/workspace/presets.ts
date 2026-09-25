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
import { defaultLayoutFor, isLayoutId, treeFromTemplate, type LayoutId } from "./layouts";
import { isLayoutNode, normalize, type LayoutNode } from "./layoutTree";

/**
 * Saved and named workspaces (W4).
 *
 * A saved workspace is the arrangement plus each pane's kind, params and
 * link group -- no ids and no history, so it can be applied any number of
 * times. The arrangement is a split tree whose leaves name panes by their
 * index in `panes` (as strings), since a saved pane has no id until it is
 * applied. Presets are the same shape, built in; the reader's own are
 * stored under the setting `workspaces` so they travel with backups.
 * Workspaces saved before trees existed carry `layout` and `rowSplit`
 * instead and are converted on the way in.
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
  /** The old flex weight; only read to size a converted old workspace. */
  width?: number;
  /** A commentary source by code ("mhc" for Matthew Henry) so a preset can
   * name one without knowing its id on this install. */
  sourceCode?: string;
}

export interface SavedWorkspace {
  name: string;
  /** Leaves hold pane indexes as strings. */
  tree?: LayoutNode;
  /** Pre-tree shape, converted on apply. */
  layout?: LayoutId;
  rowSplit?: number;
  panes: SavedPane[];
  /** Presets only; a saved workspace is described by its panes. */
  description?: string;
}

export const WORKSPACES_SETTING = "workspaces";

const A: LinkGroup = "A";

/** Index-named leaves for a template over `n` panes with these weights. */
function indexTree(layout: LayoutId, widths: number[]): LayoutNode {
  return treeFromTemplate(
    layout,
    widths.map((width, i) => ({ id: String(i), width })),
  );
}

export const PRESET_WORKSPACES: readonly SavedWorkspace[] = [
  {
    name: "Devotion",
    description: "The Bible alone.",
    tree: indexTree("one", [1000]),
    panes: [{ kind: "bible", params: {}, linkGroup: A }],
  },
  {
    name: "Sermon prep",
    description: "Bible, Matthew Henry, the manuscript, and Mine -- all in group A, so the sermon leads the study panes.",
    tree: indexTree("two-by-two", [1000, 700, 700, 420]),
    panes: [
      { kind: "bible", params: {}, linkGroup: A },
      { kind: "commentary", params: {}, linkGroup: A, sourceCode: "mhc" },
      // The sermon pane leads this group: the passage under the writer's
      // cursor turns the Bible and the commentary (SB1.1, Q9). Confessions
      // stay one click away on the Add pane strip.
      { kind: "sermons", params: {}, linkGroup: A },
      { kind: "mine", params: {}, linkGroup: A },
    ],
  },
  {
    name: "Word study",
    description: "Bible, Interlinear, and the Lexicon side by side.",
    tree: indexTree("three", [900, 900, 700]),
    panes: [
      { kind: "bible", params: {}, linkGroup: A },
      { kind: "interlinear", params: {}, linkGroup: A },
      { kind: "lexicon", params: {}, linkGroup: A },
    ],
  },
  {
    name: "Family worship",
    description: "The family worship page alone: begin, or gather round.",
    tree: indexTree("one", [1000]),
    panes: [{ kind: "family", params: {}, linkGroup: A }],
  },
];

export function isPresetName(name: string): boolean {
  return PRESET_WORKSPACES.some((p) => p.name === name);
}

/** Rewrites every pane id in a tree's leaves. Ids the map has nothing for
 * are dropped; `normalize` then tidies whatever that leaves behind. */
export function mapPaneIds(tree: LayoutNode, map: (id: string) => string | null): LayoutNode {
  if (tree.type === "leaf") {
    const paneIds = tree.paneIds.map(map).filter((id): id is string => id != null);
    const active = tree.activeId != null ? map(tree.activeId) : null;
    return { ...tree, paneIds, activeId: active != null && paneIds.includes(active) ? active : (paneIds[0] ?? null) };
  }
  return { ...tree, children: [mapPaneIds(tree.children[0], map), mapPaneIds(tree.children[1], map)] };
}

/** The current workspace as something that can be saved under a name.
 * Per-session details (scroll target, find query, history) are left out. */
export function captureWorkspace(name: string): SavedWorkspace {
  const s = useWorkspaceStore.getState();
  const index = new Map(s.panes.map((p, i) => [p.id, String(i)]));
  return {
    name,
    tree: mapPaneIds(s.tree, (id) => index.get(id) ?? null),
    panes: s.panes.map((p) => {
      const params: Record<string, unknown> = { ...(p.params as Record<string, unknown>) };
      if (p.kind === "bible") {
        delete params.verse;
        delete params.findQuery;
      }
      return { kind: p.kind, params, linkGroup: p.linkGroup };
    }),
  };
}

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** The arrangement a saved workspace describes, over index-named leaves:
 * its own tree, or the template it was saved with before trees. */
export function savedTree(saved: SavedWorkspace): LayoutNode {
  if (saved.tree && isLayoutNode(saved.tree)) return saved.tree;
  const layout = isLayoutId(saved.layout) ? saved.layout : defaultLayoutFor(saved.panes.length);
  return treeFromTemplate(
    layout,
    saved.panes.map((p, i) => ({ id: String(i), width: typeof p.width === "number" && p.width > 0 ? p.width : PANE_KINDS[p.kind]?.defaultWidth })),
    typeof saved.rowSplit === "number" ? saved.rowSplit : 0.5,
  );
}

/** Builds the live panes for a saved workspace and applies it. */
export function applyWorkspace(saved: SavedWorkspace, commentarySources: CommentarySource[] | undefined): void {
  const s = useWorkspaceStore.getState();
  const currentBibles = s.panes.filter((p): p is Extract<Pane, { kind: "bible" }> => p.kind === "bible");
  const fallback = resolveBiblePane(s);

  const panes: Pane[] = [];
  // Indexes refer to the saved list as written, skipped entries included,
  // so the tree's leaves still point at the right panes.
  const idByIndex = new Map<string, string>();
  saved.panes.forEach((sp, i) => {
    if (!isPaneKind(sp.kind) || panes.length >= 8) return;
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
    const id = newId();
    idByIndex.set(String(i), id);
    panes.push({ ...content, id, linkGroup, history: [], future: [] } as Pane);
  });
  if (panes.length === 0) return;

  const tree = normalize(
    mapPaneIds(savedTree(saved), (index) => idByIndex.get(index) ?? null),
    panes.map((p) => p.id),
  );
  s.replaceWorkspace(panes, tree);

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
    const entry: SavedWorkspace = { name: o.name, panes };
    if (isLayoutNode(o.tree)) entry.tree = o.tree;
    if (isLayoutId(o.layout)) entry.layout = o.layout;
    if (typeof o.rowSplit === "number") entry.rowSplit = o.rowSplit;
    out.push(entry);
  }
  return out;
}
