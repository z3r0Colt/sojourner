import { useMemo } from "react";
import { ArrowLeftToLine, ArrowRightToLine, Check, Columns2, GripVertical, Maximize2, Minimize2, MoreHorizontal, PanelRight, Rows2, X } from "lucide-react";
import { useAtlasPlaces, useBooks, useCommentarySources, useDictionaryIndex, useIsbeIndex, useResources, useSermons, useTranslations, useWestminsterDocuments } from "../api/queries";
import { useWorkspaceStore, LEADING_KINDS, LINK_GROUPS, MAX_PANES, PANE_KIND_LIST, PASSAGE_KINDS, type LinkGroup, type Pane } from "../state/workspaceStore";
import { IconButton } from "../components/ui/Button";
import { Popover, PopoverItem, PopoverLabel } from "../components/ui/Popover";
import { cx } from "../components/ui/classes";
import { PANE_KINDS, paneTitle, type TitleContext } from "./paneKinds";
import { openContent } from "./openContent";
import { placeholderLeaf } from "./layoutTree";
import { useDragHandle } from "./paneDrag";

export function linkGroupClass(group: LinkGroup): string {
  return cx("link-group", group === "A" ? "link-group-a" : group === "B" ? "link-group-b" : group === "C" ? "link-group-c" : "link-group-none");
}

export function linkGroupLabel(group: LinkGroup): string {
  return group ? `Group ${group}` : "Unlinked";
}

/** The small colored letter in a pane header. Clicking it opens the group
 * menu; choosing a group moves the pane so it follows (and leads) that
 * group's passage, and "Unlinked" makes it stand on its own. */
function LinkGroupToggle({ pane }: { pane: Pane }) {
  const setLinkGroup = useWorkspaceStore((s) => s.setLinkGroup);
  const follows = PASSAGE_KINDS.has(pane.kind);
  const leads = LEADING_KINDS.has(pane.kind);
  const choices: LinkGroup[] = [...LINK_GROUPS, null];
  return (
    <Popover
      width="w-56"
      align="left"
      trigger={({ toggle, open }) => (
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Link group: ${linkGroupLabel(pane.linkGroup)}. Change link group`}
          title={`${linkGroupLabel(pane.linkGroup)} · click to change`}
          className={cx("mr-0.5 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded px-1 text-[11px] font-semibold leading-none", linkGroupClass(pane.linkGroup), open && "ring-1 ring-accent")}
        >
          {pane.linkGroup ?? "–"}
        </button>
      )}
    >
      {(close) => (
        <>
          <PopoverLabel>Link group</PopoverLabel>
          {choices.map((g) => (
            <PopoverItem
              key={g ?? "none"}
              onClick={() => {
                setLinkGroup(pane.id, g);
                close();
              }}
            >
              <span className={cx("inline-flex h-5 w-5 items-center justify-center rounded text-[11px] font-semibold", linkGroupClass(g))} aria-hidden="true">
                {g ?? "–"}
              </span>
              <span className="flex-1">{linkGroupLabel(g)}</span>
              {g === pane.linkGroup && <Check className="h-4 w-4 text-accent" aria-hidden="true" />}
            </PopoverItem>
          ))}
          <p className="px-2 pb-1 pt-1.5 text-xs text-ink-3">
            {leads
              ? "A sermon leads its group without following it: the passage under your cursor turns the panes beside it, and a verse clicked there never moves the manuscript."
              : follows
                ? "Panes in one group follow each other's passage. An unlinked pane stays where it is."
                : "This pane shows no passage; its group only decides where links opened from it go."}
          </p>
        </>
      )}
    </Popover>
  );
}

/** The lookup tables pane titles are resolved against (books, translations,
 * sources), for anything that names panes outside a pane. */
export function useTitleContext(): TitleContext {
  const { data: books } = useBooks();
  const { data: translations } = useTranslations();
  const { data: commentarySources } = useCommentarySources();
  const { data: resources } = useResources();
  const { data: westminsterDocs } = useWestminsterDocuments();
  const { data: dictionaryIndex } = useDictionaryIndex();
  const { data: isbeIndex } = useIsbeIndex();
  const { data: atlasPlaces } = useAtlasPlaces();
  // A sermon pane's title is the sermon's own, so it follows a rename.
  const { data: sermons } = useSermons();
  return useMemo(
    () => ({ books, translations, commentarySources, resources, westminsterDocs, dictionaryIndex, isbeIndex, atlasPlaces, sermons }),
    [books, translations, commentarySources, resources, westminsterDocs, dictionaryIndex, isbeIndex, atlasPlaces, sermons],
  );
}

/** The title of a pane's current content. */
export function usePaneTitle(pane: Pane): string {
  return paneTitle(pane, useTitleContext());
}

/** The grip at the left of a header: press and move to drag the pane onto
 * another pane's edge (a new split) or middle (a tab there). */
function Grip({ pane, title }: { pane: Pane; title: string }) {
  const handle = useDragHandle(pane.id, title, pane.kind);
  return (
    <button
      type="button"
      {...handle}
      aria-label="Drag to move this pane"
      title="Drag onto another pane's edge to split, or its middle to add as a tab"
      className="-ml-0.5 mr-0.5 flex h-6 w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded text-ink-4 hover:bg-hover hover:text-ink-2 active:cursor-grabbing"
    >
      <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}

/** One tab in a leaf that holds several panes. The tab is its own drag
 * handle, so it can be pulled out to another pane or reordered; a plain
 * click selects it. */
function Tab({ pane, active, title, onSelect, onClose }: { pane: Pane; active: boolean; title: string; onSelect: () => void; onClose: () => void }) {
  const handle = useDragHandle(pane.id, title, pane.kind, onSelect);
  const TabIcon = PANE_KINDS[pane.kind].icon;
  return (
    <div
      role="tab"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      title={title}
      data-tab-pane-id={pane.id}
      {...handle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cx(
        "group/tab -mb-0.5 mt-1 flex h-7 min-w-0 max-w-52 shrink cursor-default touch-none select-none items-center gap-1.5 rounded-t-md border px-2 text-xs font-medium",
        active ? "border-line border-b-surface border-t-2 border-t-accent bg-surface text-ink" : "border-transparent text-ink-3 hover:bg-hover hover:text-ink",
      )}
    >
      <TabIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{title}</span>
      <button
        type="button"
        aria-label={`Close ${title}`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className={cx("-mr-1 ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded text-ink-4 hover:bg-line hover:text-ink", !active && "opacity-0 group-hover/tab:opacity-100 focus:opacity-100")}
      >
        <X className="h-3 w-3" aria-hidden="true" />
      </button>
    </div>
  );
}

/** Tabs for the panes sharing one leaf. Clicking a tab focuses that pane,
 * which makes it the one shown; Left and Right move between them. */
function SlotTabs({ panes, activeId, leafId }: { panes: Pane[]; activeId: string; leafId: string }) {
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  const closePane = useWorkspaceStore((s) => s.closePane);
  const ctx = useTitleContext();
  return (
    <div
      role="tablist"
      aria-label="Panes in this slot"
      data-tab-strip=""
      className="flex min-w-0 flex-1 items-end self-stretch overflow-hidden"
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        const at = panes.findIndex((p) => p.id === activeId);
        const next = panes[(at + (e.key === "ArrowRight" ? 1 : -1) + panes.length) % panes.length];
        if (!next) return;
        e.preventDefault();
        setActiveTab(leafId, next.id);
        (e.currentTarget.querySelector(`[data-tab-pane-id="${next.id}"]`) as HTMLElement | null)?.focus();
      }}
    >
      {panes.map((p) => (
        <Tab key={p.id} pane={p} active={p.id === activeId} title={paneTitle(p, ctx)} onSelect={() => setActiveTab(leafId, p.id)} onClose={() => closePane(p.id)} />
      ))}
    </div>
  );
}

/** One row above a pane's content: the grip, the link-group letter, its
 * title (or the tabs of the panes sharing its leaf), a menu (change
 * content, split, move, close), and a close button. The focused pane
 * carries a thin accent rule underneath. Shown only when the workspace has
 * more than one pane, so a single pane looks exactly as the page did
 * before panes existed. Double-click maximizes the pane (again restores it). */
export function PaneHeader({ pane, focused, tabs, leafId, maximized }: { pane: Pane; focused: boolean; tabs?: Pane[]; leafId?: string; maximized?: boolean }) {
  const title = usePaneTitle(pane);
  const closePane = useWorkspaceStore((s) => s.closePane);
  const swapPanes = useWorkspaceStore((s) => s.swapPanes);
  const splitPane = useWorkspaceStore((s) => s.splitPane);
  const movePaneTo = useWorkspaceStore((s) => s.movePaneTo);
  const setMaximized = useWorkspaceStore((s) => s.setMaximized);
  const index = useWorkspaceStore((s) => s.panes.findIndex((p) => p.id === pane.id));
  const count = useWorkspaceStore((s) => s.panes.length);
  const prevId = useWorkspaceStore((s) => s.panes[index - 1]?.id);
  const nextId = useWorkspaceStore((s) => s.panes[index + 1]?.id);
  const canSplit = useWorkspaceStore((s) => s.panes.length < MAX_PANES && !placeholderLeaf(s.tree));
  const Icon = PANE_KINDS[pane.kind].icon;
  const inTabs = !!tabs && tabs.length > 1;

  function toggleMaximized() {
    setMaximized(maximized ? null : pane.id);
  }

  return (
    <div
      onDoubleClick={(e) => {
        // Buttons and tabs in the header keep their own double-clicks.
        if ((e.target as HTMLElement).closest("button, [role=tab]")) return;
        if (count > 1) toggleMaximized();
      }}
      title={maximized ? "Double-click to restore all panes" : "Double-click to maximize"}
      className={cx("flex h-8 shrink-0 items-center gap-1 border-b bg-surface-2/60 pl-1 pr-1", focused ? "border-accent" : "border-line")}
      style={{ borderBottomWidth: 2 }}
    >
      {!maximized && <Grip pane={pane} title={title} />}
      <LinkGroupToggle pane={pane} />
      {inTabs && leafId ? (
        <SlotTabs panes={tabs} activeId={pane.id} leafId={leafId} />
      ) : (
        <>
          <Icon className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden="true" />
          <span className={cx("min-w-0 flex-1 truncate text-xs font-medium", focused ? "text-ink" : "text-ink-2")} title={title}>
            {title}
          </span>
        </>
      )}
      {count > 1 && (
        <IconButton
          icon={maximized ? Minimize2 : Maximize2}
          label={maximized ? "Restore all panes" : "Maximize this pane"}
          size="sm"
          active={maximized}
          onClick={toggleMaximized}
        />
      )}
      <Popover
        width="w-64"
        trigger={({ toggle, open }) => <IconButton icon={MoreHorizontal} label="Pane menu" size="sm" active={open} onClick={toggle} />}
      >
        {(close) => (
          <>
            <PopoverLabel>Show instead</PopoverLabel>
            <div className="max-h-64 overflow-y-auto">
              {PANE_KIND_LIST.filter((k) => PANE_KINDS[k].listed && k !== pane.kind).map((k) => {
                const meta = PANE_KINDS[k];
                const KindIcon = meta.icon;
                return (
                  <PopoverItem
                    key={k}
                    onClick={() => {
                      openContent(k, {}, { target: pane.id });
                      close();
                    }}
                  >
                    <KindIcon className="h-4 w-4 text-ink-3" aria-hidden="true" />
                    {meta.label}
                  </PopoverItem>
                );
              })}
            </div>
            <div className="my-1 h-px bg-line" aria-hidden="true" />
            <PopoverItem
              onClick={() => {
                splitPane(pane.id, "right");
                close();
              }}
              className={cx(!canSplit && "opacity-45")}
            >
              <Columns2 className="h-4 w-4 text-ink-3" aria-hidden="true" /> Split right
            </PopoverItem>
            <PopoverItem
              onClick={() => {
                splitPane(pane.id, "bottom");
                close();
              }}
              className={cx(!canSplit && "opacity-45")}
            >
              <Rows2 className="h-4 w-4 text-ink-3" aria-hidden="true" /> Split down
            </PopoverItem>
            {inTabs && leafId && (
              <PopoverItem
                onClick={() => {
                  movePaneTo(pane.id, leafId, "right");
                  close();
                }}
              >
                <PanelRight className="h-4 w-4 text-ink-3" aria-hidden="true" /> Move this tab to its own pane
              </PopoverItem>
            )}
            <PopoverItem
              onClick={() => {
                if (prevId) swapPanes(pane.id, prevId);
                close();
              }}
              className={cx(!prevId && "opacity-45")}
            >
              <ArrowLeftToLine className="h-4 w-4 text-ink-3" aria-hidden="true" /> Swap with previous pane
            </PopoverItem>
            <PopoverItem
              onClick={() => {
                if (nextId) swapPanes(pane.id, nextId);
                close();
              }}
              className={cx(!nextId && "opacity-45")}
            >
              <ArrowRightToLine className="h-4 w-4 text-ink-3" aria-hidden="true" /> Swap with next pane
            </PopoverItem>
            <PopoverItem
              onClick={() => {
                toggleMaximized();
                close();
              }}
            >
              {maximized ? <Minimize2 className="h-4 w-4 text-ink-3" aria-hidden="true" /> : <Maximize2 className="h-4 w-4 text-ink-3" aria-hidden="true" />}
              {maximized ? "Restore all panes" : "Maximize"}
            </PopoverItem>
            <PopoverItem
              onClick={() => {
                closePane(pane.id);
                close();
              }}
            >
              <X className="h-4 w-4 text-ink-3" aria-hidden="true" /> Close pane
            </PopoverItem>
          </>
        )}
      </Popover>
      <IconButton icon={X} label="Close pane" size="sm" onClick={() => closePane(pane.id)} />
    </div>
  );
}
