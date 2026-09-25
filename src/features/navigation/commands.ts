import {
  AlignJustify,
  ArrowLeftToLine,
  ArrowRightToLine,
  Bookmark,
  BookOpen,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Rows2,
  Database,
  Eye,
  EyeOff,
  GraduationCap,
  HardDrive,
  HeartHandshake,
  HouseHeart,
  Highlighter,
  Info,
  Keyboard,
  Layers,
  LayoutGrid,
  Library,
  Link2,
  Maximize2,
  Minimize2,
  MessageSquareText,
  Palette,
  Pilcrow,
  Replace,
  Save,
  Search,
  Settings,
  SquareDashed,
  StickyNote,
  Type,
  X,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
  Lightbulb,
  Mic,
  Presentation,
  Timer,
  CopyPlus,
} from "lucide-react";
import type { QueryClient } from "@tanstack/react-query";
import type { CommentarySource, ReadingPlan, ReadingPlanProgress, Sermon } from "../../api/types";
import { api } from "../../api/client";
import { toast } from "../../components/ui/toast";
import { PRESET_WORKSPACES, applyWorkspace, type SavedWorkspace } from "../../workspace/presets";
import { useWorkspaceDialog } from "../../workspace/WorkspacesMenu";
import { beginFamilyWorship } from "../family/sessionStore";
import {
  LINK_GROUPS,
  MAX_PANES,
  STUDY_KINDS,
  findPane,
  resolveBiblePane,
  useWorkspaceStore,
  type LinkGroup,
  type Pane,
} from "../../state/workspaceStore";
import { READING_FONT_OPTIONS, THEME_OPTIONS, useUiStore, type LineSpacing } from "../../state/uiStore";
import { PANE_KINDS, paneTitle, type TitleContext } from "../../workspace/paneKinds";
import { openContent, openNewTab, openPassage } from "../../workspace/openContent";
import { LAYOUTS, arrangementFor, detectTemplate } from "../../workspace/layouts";
import { leafOfPane, placeholderLeaf } from "../../workspace/layoutTree";
import { stepChapter } from "../reading/chapterStep";
import { resetZoom, zoomText } from "../reading/zoom";
import { requestNewPrayerEntry } from "../prayer/prayerActions";
import { startRun } from "../sermons/preachingSession";
import { nextSunday } from "../sermons/sermonFormat";
import { localToday } from "../plans/planSchedule";

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
  /** The reader's saved workspaces (W4); presets are always offered. */
  savedWorkspaces?: SavedWorkspace[];
  commentarySources?: CommentarySource[];
  /** Overlays only the shell can open (F3.2): search, the shortcuts
   * sheet, and the Ctrl+D bookmark toggle it owns. */
  shell?: {
    openSearch: () => void;
    openShortcuts: () => void;
    bookmarkHere: () => void;
  };
  /** Reading plans, for "Start reading plan: …" (F3.2). */
  plans?: ReadingPlan[];
  planProgress?: ReadingPlanProgress[];
  /** For commands that write through the API directly (back up, start a plan). */
  queryClient?: QueryClient;
  /** The ten most recently edited sermons, for "Open sermon: …" (SB5.5). */
  sermons?: Sermon[];
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
      const prev = s.panes[idx - 1];
      out.push({
        id: "swap-left",
        group: PANES,
        label: "Swap this pane with the previous one",
        icon: ArrowLeftToLine,
        keywords: "move left neighbor",
        run: () => useWorkspaceStore.getState().swapPanes(focused.id, prev.id),
      });
    }
    if (idx >= 0 && idx < s.panes.length - 1) {
      const next = s.panes[idx + 1];
      out.push({
        id: "swap-right",
        group: PANES,
        label: "Swap this pane with the next one",
        icon: ArrowRightToLine,
        keywords: "move right neighbor",
        run: () => useWorkspaceStore.getState().swapPanes(focused.id, next.id),
      });
    }

    if (!full && !placeholderLeaf(s.tree)) {
      out.push({
        id: "split-right",
        group: PANES,
        label: "Split this pane to the right",
        icon: Columns2,
        keys: ["Ctrl", "\\"],
        keywords: "split column side empty slot",
        run: () => useWorkspaceStore.getState().splitPane(focused.id, "right"),
      });
      out.push({
        id: "split-down",
        group: PANES,
        label: "Split this pane downward",
        icon: Rows2,
        keys: ["Ctrl", "Shift", "\\"],
        keywords: "split row stack below empty slot",
        run: () => useWorkspaceStore.getState().splitPane(focused.id, "bottom"),
      });
    }
    out.push({
      id: "new-tab",
      group: PANES,
      label: "New tab: a copy of this pane",
      icon: CopyPlus,
      keys: ["Ctrl", "T"],
      keywords: "tab duplicate copy open another",
      run: () => openNewTab(focused.id),
    });
    const home = leafOfPane(s.tree, focused.id);
    if (home && home.paneIds.length > 1) {
      out.push({
        id: "tab-out",
        group: PANES,
        label: "Move this tab to its own pane",
        icon: Columns2,
        keywords: "tab group split out",
        run: () => useWorkspaceStore.getState().movePaneTo(focused.id, home.id, "right"),
      });
      const at = home.paneIds.indexOf(focused.id);
      const nextTab = home.paneIds[(at + 1) % home.paneIds.length];
      const prevTab = home.paneIds[(at - 1 + home.paneIds.length) % home.paneIds.length];
      out.push({
        id: "tab-next",
        group: PANES,
        label: "Next tab in this pane",
        icon: ArrowRightToLine,
        keywords: "tab switch",
        run: () => useWorkspaceStore.getState().focusPane(nextTab),
      });
      out.push({
        id: "tab-prev",
        group: PANES,
        label: "Previous tab in this pane",
        icon: ArrowLeftToLine,
        keywords: "tab switch",
        run: () => useWorkspaceStore.getState().focusPane(prevTab),
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

/** Quick arrangements (W3): a template applied to the panes that exist. */
export function layoutCommands(): Command[] {
  const s = useWorkspaceStore.getState();
  const current = detectTemplate(s.tree);
  return LAYOUTS.filter((l) => l.id !== current).map<Command>((l) => ({
    id: `layout-${l.id}`,
    group: "Layout",
    label: `Layout: ${l.label}`,
    icon: LayoutGrid,
    keywords: `${l.slots} panes columns grid split arrange ${l.description}`,
    run: () => useWorkspaceStore.getState().applyArrangement((ids) => arrangementFor(l.id, ids)),
  }));
}

/** Presets, saved workspaces, and "Save workspace as…" (W4). */
export function workspaceCommands(ctx: CommandContext): Command[] {
  const group = "Workspaces";
  const all = [...PRESET_WORKSPACES, ...(ctx.savedWorkspaces ?? [])];
  const out = all.map<Command>((w) => ({
    id: `workspace-${w.name}`,
    group,
    label: `Workspace: ${w.name}`,
    icon: Layers,
    keywords: `preset switch ${w.description ?? ""} ${w.panes.map((p) => p.kind).join(" ")}`,
    run: () => {
      applyWorkspace(w, ctx.commentarySources);
      toast.info(`Workspace: ${w.name}`);
    },
  }));
  out.push({
    id: "workspace-save-as",
    group,
    label: "Save workspace as…",
    icon: Save,
    keywords: "name store remember panes layout",
    run: () => useWorkspaceDialog.getState().openSaveAs(),
  });
  return out;
}

// ---------------------------------------------------------------------------
// App actions (F3.2): everything that is not about panes.

const THEMES = THEME_OPTIONS;
const FONTS = READING_FONT_OPTIONS;

const SPACINGS: { value: LineSpacing; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "normal", label: "Normal" },
  { value: "relaxed", label: "Relaxed" },
];

const SETTINGS_SECTIONS: { key: string; label: string; icon: LucideIcon }[] = [
  { key: "preferences", label: "Reading", icon: BookOpen },
  { key: "library", label: "Library", icon: Library },
  { key: "backups", label: "Data & backups", icon: Database },
  { key: "tutorial", label: "Tutorial", icon: GraduationCap },
  { key: "about", label: "About", icon: Info },
];

/** Chapter steps, bookmark, search, shortcuts: the shell's own keys. */
export function navigationCommands(ctx: CommandContext): Command[] {
  const group = "Navigate";
  const out: Command[] = [];
  const s = useWorkspaceStore.getState();
  const bible = resolveBiblePane(s);
  const books = ctx.titles.books;
  if (bible && books) {
    const here = { bookId: bible.params.bookId, chapter: bible.params.chapter };
    const next = stepChapter(books, here, 1);
    const prev = stepChapter(books, here, -1);
    const name = (p: { bookId: number; chapter: number }) => `${books.find((b) => b.id === p.bookId)?.name ?? ""} ${p.chapter}`;
    if (next) {
      out.push({
        id: "next-chapter",
        group,
        label: `Next chapter: ${name(next)}`,
        icon: ChevronRight,
        keys: ["Ctrl", "]"],
        keywords: "forward turn page",
        run: () => openPassage(next, { target: bible.id }),
      });
    }
    if (prev) {
      out.push({
        id: "prev-chapter",
        group,
        label: `Previous chapter: ${name(prev)}`,
        icon: ChevronLeft,
        keys: ["Ctrl", "["],
        keywords: "back turn page",
        run: () => openPassage(prev, { target: bible.id }),
      });
    }
  }
  if (ctx.shell) {
    const shell = ctx.shell;
    if (bible) {
      out.push({
        id: "bookmark-here",
        group,
        label: bible.params.activeVerse ? "Bookmark the selected verse" : "Bookmark this chapter",
        icon: Bookmark,
        keys: ["Ctrl", "D"],
        keywords: "save place mark",
        run: shell.bookmarkHere,
      });
    }
    out.push({
      id: "search",
      group,
      label: "Search everything",
      icon: Search,
      keys: ["Ctrl", "F"],
      keywords: "find scripture commentary notes prayers resources confessions",
      run: shell.openSearch,
    });
    out.push({
      id: "shortcuts",
      group,
      label: "Keyboard shortcuts",
      icon: Keyboard,
      keys: ["Ctrl", "/"],
      keywords: "keys help cheat sheet",
      run: shell.openShortcuts,
    });
  }
  return out;
}

/** Paragraph mode and red letters on the Bible pane being read; the global
 * view switches; text size, font, and spacing; theme. */
export function viewCommands(): Command[] {
  const group = "View";
  const out: Command[] = [];
  const ws = useWorkspaceStore.getState();
  const ui = useUiStore.getState();
  const bible = resolveBiblePane(ws);

  if (bible) {
    const { paragraphMode, redLetterMode } = bible.params;
    out.push({
      id: "toggle-paragraph",
      group,
      label: paragraphMode ? "Paragraph mode: off (one verse per line)" : "Paragraph mode: on (flowing prose)",
      icon: Pilcrow,
      keywords: "toggle paragraph mode verse per line prose",
      run: () => {
        useWorkspaceStore.getState().setPaneParams(bible.id, "bible", { paragraphMode: !paragraphMode });
        toast.info(paragraphMode ? "One verse per line" : "Paragraph mode");
      },
    });
    out.push({
      id: "toggle-red-letters",
      group,
      label: redLetterMode ? "Words of Jesus in red: off" : "Words of Jesus in red: on",
      icon: Type,
      keywords: "toggle red letters christ words jesus",
      run: () => {
        useWorkspaceStore.getState().setPaneParams(bible.id, "bible", { redLetterMode: !redLetterMode });
        toast.info(redLetterMode ? "Red letters off" : "Words of Jesus in red");
      },
    });
  }

  const toggles: { id: string; on: boolean; onLabel: string; offLabel: string; icon: LucideIcon; keywords: string; run: () => void }[] = [
    { id: "verse-numbers", on: ui.showVerseNumbers, onLabel: "Hide verse numbers", offLabel: "Show verse numbers", icon: AlignJustify, keywords: "toggle numbers", run: ui.toggleVerseNumbers },
    { id: "show-highlights", on: ui.showHighlights, onLabel: "Hide highlights", offLabel: "Show highlights", icon: Highlighter, keywords: "toggle colors marks", run: ui.toggleShowHighlights },
    { id: "note-markers", on: ui.showNoteSymbols, onLabel: "Hide note markers", offLabel: "Show note markers", icon: StickyNote, keywords: "toggle notes icons symbols", run: ui.toggleShowNoteSymbols },
  ];
  for (const t of toggles) {
    out.push({
      id: `toggle-${t.id}`,
      group,
      label: t.on ? t.onLabel : t.offLabel,
      icon: t.on ? EyeOff : Eye,
      keywords: t.keywords,
      run: () => {
        t.run();
        toast.info(t.on ? t.onLabel.replace(/^Hide/, "Hid") : t.offLabel.replace(/^Show/, "Showing"));
      },
    });
  }

  out.push(
    { id: "zoom-in", group, label: "Larger text", icon: ZoomIn, keys: ["Ctrl", "="], keywords: "zoom font size bigger increase", run: () => zoomText(1) },
    { id: "zoom-out", group, label: "Smaller text", icon: ZoomOut, keys: ["Ctrl", "-"], keywords: "zoom font size decrease", run: () => zoomText(-1) },
    { id: "zoom-reset", group, label: "Reset text size", icon: Type, keys: ["Ctrl", "0"], keywords: "zoom font default 18", run: resetZoom },
  );

  for (const f of FONTS) {
    if (f.value === ui.readingFont) continue;
    out.push({
      id: `font-${f.value}`,
      group,
      label: `Font: ${f.label}`,
      icon: Type,
      keywords: "typeface reading",
      run: () => {
        useUiStore.getState().setReadingFont(f.value);
        toast.info(`Font: ${f.label}`);
      },
    });
  }
  for (const sp of SPACINGS) {
    if (sp.value === ui.lineSpacing) continue;
    out.push({
      id: `spacing-${sp.value}`,
      group,
      label: `Line spacing: ${sp.label}`,
      icon: AlignJustify,
      keywords: "leading lines",
      run: () => {
        useUiStore.getState().setLineSpacing(sp.value);
        toast.info(`Line spacing: ${sp.label.toLowerCase()}`);
      },
    });
  }
  for (const t of THEMES) {
    if (t.value === ui.theme) continue;
    out.push({
      id: `theme-${t.value}`,
      group: "Theme",
      label: `Theme: ${t.label}`,
      icon: Palette,
      keywords: `appearance colors light dark mode ${t.value.startsWith("contrast") ? "accessibility high contrast" : ""}`,
      run: () => {
        useUiStore.getState().setTheme(t.value);
        toast.info(`Theme: ${t.label}`);
      },
    });
  }
  out.push({
    id: "toggle-reduce-motion",
    group,
    label: ui.reduceMotion ? "Reduce motion: off (allow transitions)" : "Reduce motion: on (no transitions)",
    icon: ui.reduceMotion ? Eye : EyeOff,
    keywords: "accessibility animation transitions motion",
    run: () => {
      useUiStore.getState().setReduceMotion(!ui.reduceMotion);
      toast.info(ui.reduceMotion ? "Motion restored" : "Reduced motion");
    },
  });
  return out;
}

/** Plans, prayer, backups, and the Settings sections. */
export function appCommands(ctx: CommandContext): Command[] {
  const out: Command[] = [];
  const qc = ctx.queryClient;

  const inProgress = new Set((ctx.planProgress ?? []).map((p) => p.plan_code));
  for (const plan of ctx.plans ?? []) {
    if (inProgress.has(plan.code)) continue;
    out.push({
      id: `start-plan-${plan.code}`,
      group: "Plans",
      label: `Start reading plan: ${plan.title}`,
      icon: CalendarCheck,
      keywords: `begin schedule ${plan.length_days} days`,
      run: async () => {
        try {
          await api.startReadingPlan(plan.code, localToday());
          qc?.invalidateQueries({ queryKey: ["readingPlanProgress"] });
          toast.success(`Started ${plan.title}`);
          openContent("plans", {});
        } catch (e) {
          toast.error(`Could not start the plan: ${String(e)}`);
        }
      },
    });
  }

  // Sermons (SB5.5). "New sermon" writes the row first and opens it, the
  // same path the Sermons page takes, so nothing is ever left unsaved.
  out.push({
    id: "new-sermon",
    group: "Sermons",
    label: "New sermon",
    icon: Mic,
    keywords: "preach manuscript write sunday",
    run: async () => {
      try {
        const sermon = await api.createSermon({ title: "Untitled sermon", preach_date: nextSunday() });
        qc?.invalidateQueries({ queryKey: ["sermons"] });
        openContent("sermon", { id: sermon.id });
        toast.success("Sermon created");
      } catch (e) {
        toast.error(`Could not create the sermon: ${String(e)}`);
      }
    },
  });

  for (const sermon of (ctx.sermons ?? []).slice(0, 10)) {
    out.push({
      id: `open-sermon-${sermon.id}`,
      group: "Sermons",
      label: `Open sermon: ${sermon.title}`,
      icon: Mic,
      keywords: `manuscript ${sermon.big_idea ?? ""} ${sermon.series_title ?? ""} ${sermon.preach_date ?? ""}`,
      run: () => openContent("sermon", { id: sermon.id }),
    });
  }

  const focusedSermon = (() => {
    const state = useWorkspaceStore.getState();
    const pane = findPane(state.panes, state.focusedPaneId);
    if (pane?.kind === "sermon") return pane.params.id;
    return state.panes.find((p) => p.kind === "sermon")?.params.id ?? (ctx.sermons ?? [])[0]?.id ?? null;
  })();

  if (focusedSermon != null) {
    out.push({
      id: "preach-sermon",
      group: "Sermons",
      label: "Preach this sermon",
      icon: Presentation,
      keywords: "pulpit full screen present clock",
      run: () => startRun(focusedSermon, { kind: "preaching", fullScreen: true }),
    });
    out.push({
      id: "rehearse-sermon",
      group: "Sermons",
      label: "Rehearse this sermon",
      icon: Timer,
      keywords: "practice clock time run through",
      run: () => {
        openContent("sermon", { id: focusedSermon });
        startRun(focusedSermon, { kind: "rehearsal", fullScreen: false });
      },
    });
  }

  out.push({
    id: "open-sermons",
    group: "Sermons",
    label: "Open Sermons",
    icon: Mic,
    keywords: "list page every sermon series",
    run: () => openContent("sermons", {}),
  });

  out.push({
    id: "open-illustrations",
    group: "Sermons",
    label: "Open Illustrations",
    icon: Lightbulb,
    keywords: "library stories quotations",
    run: () => openContent("illustrations", {}),
  });

  out.push({
    id: "new-prayer-entry",
    group: "Prayer",
    label: "New prayer entry",
    icon: HeartHandshake,
    keywords: "journal write pray acts",
    run: () => {
      openContent("prayer", {});
      requestNewPrayerEntry();
    },
  });

  out.push({
    id: "begin-family-worship",
    group: "Family worship",
    label: "Begin family worship",
    icon: HouseHeart,
    keywords: "household children catechism psalm sing gather",
    run: () => {
      openContent("family", {});
      beginFamilyWorship(false);
    },
  });

  out.push({
    id: "gather-round",
    group: "Family worship",
    label: "Gather round (family worship, full screen)",
    icon: Maximize2,
    keywords: "family worship large television tv table",
    run: () => beginFamilyWorship(true),
  });

  out.push({
    id: "backup-now",
    group: "Data",
    label: "Back up now",
    icon: HardDrive,
    keywords: "save copy database export",
    run: async () => {
      try {
        await api.createBackup();
        qc?.invalidateQueries({ queryKey: ["backups"] });
        toast.success("Backup created");
      } catch (e) {
        toast.error(`Backup failed: ${String(e)}`);
      }
    },
  });

  for (const s of SETTINGS_SECTIONS) {
    out.push({
      id: `settings-${s.key}`,
      group: "Settings",
      label: `Open Settings → ${s.label}`,
      icon: s.key === "preferences" ? Settings : s.icon,
      keywords: `preferences options ${s.key}`,
      run: () => openContent("settings", { section: s.key }),
    });
  }
  return out;
}

/** Every command the palette can offer right now. */
export function allCommands(ctx: CommandContext): Command[] {
  return [...navigationCommands(ctx), ...paneCommands(ctx), ...layoutCommands(), ...workspaceCommands(ctx), ...viewCommands(), ...appCommands(ctx)];
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
