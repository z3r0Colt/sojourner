import {
  ArrowLeftToLine,
  ArrowRightToLine,
  Columns2,
  LayoutGrid,
  Link2,
  Maximize2,
  Minimize2,
  MessageSquareText,
  Replace,
  SquareDashed,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  LINK_GROUPS,
  MAX_PANES,
  STUDY_KINDS,
  findPane,
  useWorkspaceStore,
  type LinkGroup,
  type Pane,
} from "../../state/workspaceStore";
import { useUiStore } from "../../state/uiStore";
import { PANE_KINDS, paneTitle, type TitleContext } from "../../workspace/paneKinds";
import { openContent } from "../../workspace/openContent";
import { LAYOUTS } from "../../workspace/layouts";

/**
 * The command registry behind the Go to palette. Type `>` to list every
 * command; otherwise commands whose name matches the typed text are offered
 * after the references and terms.
 *
 * Created in W2 with the pane commands; layouts (W3) and workspaces (W4)
 * add theirs, and F3.2 adds the rest of the app's actions. Commands are
 * built fresh for each palette render from the workspace state, so the
 * list always names the panes that exist and the pane that is focused.
 */

export interface Command {
  id: string;
  /** Section shown as the row's hint: "Panes", "Layout", "Workspaces". */
  group: string;
  label: string;
  icon: LucideIcon;
  /** Keyboard shortcut shown beside the label, as Kbd labels. */
  keys?: string[];
  /** Extra words the search should match ("split", "column"). */
  keywords?: string;
  run: () => void;
}

export interface CommandContext {
  titles: TitleContext;
}

const PANES = "Panes";

function linkGroupName(g: LinkGroup): string {
  return g ? `Group ${g}` : "Unlinked";
}

/** Commands that act on the focused pane or add panes. */
export function paneCommands(ctx: CommandContext): Command[] {
  const s = useWorkspaceStore.getState();
  const focused = findPane(s.panes, s.focusedPaneId);
  const idx = s.panes.findIndex((p) => p.id === s.focusedPaneId);
  const full = s.panes.length >= MAX_PANES;
  const listed = Object.values(PANE_KINDS).filter((m) => m.listed);
  const out: Command[] = [];

  // Focus a pane by position, as Ctrl+1 to Ctrl+4 do.
  s.panes.forEach((pane: Pane, i) => {
    out.push({
      id: `focus-pane-${pane.id}`,
      group: PANES,
      label: `Focus pane ${i + 1}: ${paneTitle(pane, ctx.titles)}`,
      icon: PANE_KINDS[pane.kind].icon,
      keys: ["Ctrl", String(i + 1)],
      keywords: "switch go",
      run: () => useWorkspaceStore.getState().focusPane(pane.id),
    });
  });

  out.push({
    id: "study-pane",
    group: PANES,
    label: "Add a study pane, or focus the one that is open",
    icon: MessageSquareText,
    keys: ["Ctrl", "B"],
    keywords: "commentary cross references confessions",
    run: () => {
      const st = useWorkspaceStore.getState();
      const study = st.panes.find((p) => STUDY_KINDS.has(p.kind));
      if (study) st.focusPane(study.id);
      else openContent("commentary", {}, { target: "new" });
    },
  });

  if (!full) {
    for (const meta of listed) {
      out.push({
        id: `open-new-${meta.kind}`,
        group: PANES,
        label: `Open ${meta.label} in a new pane`,
        icon: Columns2,
        keywords: "new pane split beside",
        run: () => openContent(meta.kind, {}, { target: "new" }),
      });
    }
  }

  if (focused) {
    for (const meta of listed) {
      if (meta.kind === focused.kind) continue;
      out.push({
        id: `change-to-${meta.kind}`,
        group: PANES,
        label: `Change this pane to ${meta.label}`,
        icon: Replace,
        keywords: "show instead replace content",
        run: () => openContent(meta.kind, {}, { target: focused.id }),
      });
    }

    for (const g of [...LINK_GROUPS, null] as LinkGroup[]) {
      if (g === focused.linkGroup) continue;
      out.push({
        id: `link-group-${g ?? "none"}`,
        group: PANES,
        label: g ? `Link this pane to group ${g}` : "Unlink this pane",
        icon: Link2,
        keywords: `link group ${linkGroupName(g)} follow`,
        run: () => useWorkspaceStore.getState().setLinkGroup(focused.id, g),
      });
    }

    if (idx > 0) {
      out.push({
        id: "swap-left",
        group: PANES,
        label: "Swap this pane with the one on its left",
        icon: ArrowLeftToLine,
        keywords: "move left neighbor",
        run: () => useWorkspaceStore.getState().movePane(focused.id, -1),
      });
    }
    if (idx >= 0 && idx < s.panes.length - 1) {
      out.push({
        id: "swap-right",
        group: PANES,
        label: "Swap this pane with the one on its right",
        icon: ArrowRightToLine,
        keywords: "move right neighbor",
        run: () => useWorkspaceStore.getState().movePane(focused.id, 1),
      });
    }

    if (s.panes.length > 1) {
      const maximized = s.maximizedPaneId === focused.id;
      out.push({
        id: "maximize",
        group: PANES,
        label: maximized ? "Restore all panes" : "Maximize this pane",
        icon: maximized ? Minimize2 : Maximize2,
        keywords: "maximise restore expand double-click header",
        run: () => useWorkspaceStore.getState().setMaximized(maximized ? null : focused.id),
      });
      out.push({
        id: "close-pane",
        group: PANES,
        label: "Close this pane",
        icon: X,
        run: () => useWorkspaceStore.getState().closePane(focused.id),
      });
    }
  }

  const focusMode = useUiStore.getState().distractionFreeMode;
  out.push({
    id: "focus-mode",
    group: PANES,
    label: focusMode ? "Leave focus mode" : "Focus mode: maximize this pane and hide everything else",
    icon: SquareDashed,
    keys: ["F11"],
    keywords: "distraction free full screen",
    run: () => {
      const st = useWorkspaceStore.getState();
      const ui = useUiStore.getState();
      if (ui.distractionFreeMode) {
        st.setMaximized(null);
        ui.setDistractionFreeMode(false);
      } else {
        st.setMaximized(st.focusedPaneId);
        ui.setDistractionFreeMode(true);
      }
    },
  });

  return out;
}

/** Layout templates (W3). */
export function layoutCommands(): Command[] {
  const s = useWorkspaceStore.getState();
  return LAYOUTS.filter((l) => l.id !== s.layout).map<Command>((l) => ({
    id: `layout-${l.id}`,
    group: "Layout",
    label: `Layout: ${l.label}`,
    icon: LayoutGrid,
    keywords: `${l.slots} panes columns grid split ${l.description}`,
    run: () => useWorkspaceStore.getState().setLayout(l.id),
  }));
}

/** Every command the palette can offer right now. */
export function allCommands(ctx: CommandContext): Command[] {
  return [...paneCommands(ctx), ...layoutCommands()];
}

/** True when the typed text asks for commands only (`>` prefix). */
export function isCommandQuery(query: string): boolean {
  return query.trimStart().startsWith(">");
}

/** The words after the `>` prefix. */
export function commandQueryText(query: string): string {
  return query.trimStart().replace(/^>/, "").trim();
}

/** Commands whose label, group, or keywords contain every typed word.
 * Commands matched by their label alone come first, so "layout two by"
 * offers "Layout: Two by two" before anything that only mentions "by" in
 * its keywords. */
export function filterCommands(commands: Command[], text: string): Command[] {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return commands;
  const byLabel: Command[] = [];
  const byKeywords: Command[] = [];
  for (const c of commands) {
    const label = `${c.label} ${c.group}`.toLowerCase();
    if (words.every((w) => label.includes(w))) {
      byLabel.push(c);
      continue;
    }
    const hay = `${label} ${c.keywords ?? ""}`.toLowerCase();
    if (words.every((w) => hay.includes(w))) byKeywords.push(c);
  }
  return [...byLabel, ...byKeywords];
}
