import { useMemo } from "react";
import { ArrowLeftToLine, ArrowRightToLine, Check, Maximize2, Minimize2, MoreHorizontal, X } from "lucide-react";
import { useBooks, useCommentarySources, useDictionaryIndex, useResources, useTranslations, useWestminsterDocuments } from "../api/queries";
import { useWorkspaceStore, LINK_GROUPS, PANE_KIND_LIST, PASSAGE_KINDS, type LinkGroup, type Pane } from "../state/workspaceStore";
import { IconButton } from "../components/ui/Button";
import { Popover, PopoverItem, PopoverLabel } from "../components/ui/Popover";
import { cx } from "../components/ui/classes";
import { PANE_KINDS, paneTitle, type TitleContext } from "./paneKinds";
import { openContent } from "./openContent";

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
            {follows ? "Panes in one group follow each other's passage. An unlinked pane stays where it is." : "This pane shows no passage; its group only decides where links opened from it go."}
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
  return useMemo(
    () => ({ books, translations, commentarySources, resources, westminsterDocs, dictionaryIndex }),
    [books, translations, commentarySources, resources, westminsterDocs, dictionaryIndex],
  );
}

/** The title of a pane's current content. */
export function usePaneTitle(pane: Pane): string {
  return paneTitle(pane, useTitleContext());
}

/** The drag payload type for swapping panes by dragging a header. */
export const PANE_DRAG_TYPE = "application/x-sojourner-pane";

/** Tabs for the panes sharing one slot (a narrow window, or more panes than
 * the layout has slots). Clicking a tab focuses that pane, which makes it
 * the one shown. */
function SlotTabs({ panes, activeId }: { panes: Pane[]; activeId: string }) {
  const focusPane = useWorkspaceStore((s) => s.focusPane);
  const ctx = useTitleContext();
  return (
    <div role="tablist" aria-label="Panes in this column" className="flex min-w-0 flex-1 items-stretch self-stretch overflow-hidden">
      {panes.map((p) => {
        const active = p.id === activeId;
        const TabIcon = PANE_KINDS[p.kind].icon;
        const title = paneTitle(p, ctx);
        return (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={active}
            title={title}
            onClick={() => focusPane(p.id)}
            className={cx(
              "-mb-0.5 flex min-w-0 max-w-48 items-center gap-1.5 border-b-2 px-2 text-xs font-medium",
              active ? "border-accent text-ink" : "border-transparent text-ink-3 hover:text-ink",
            )}
          >
            <TabIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{title}</span>
          </button>
        );
      })}
    </div>
  );
}

/** One row above a pane's content: the link-group letter, its title (or
 * the tabs of the panes sharing its slot), a menu (change content, move,
 * close), and a close button. The focused pane carries a thin accent rule
 * underneath. Shown only when the workspace has more than one pane, so a
 * single pane looks exactly as the page did before panes existed.
 * Double-click maximizes the pane (again restores it); dragging the header
 * onto another pane swaps the two. */
export function PaneHeader({ pane, focused, tabs, maximized }: { pane: Pane; focused: boolean; tabs?: Pane[]; maximized?: boolean }) {
  const title = usePaneTitle(pane);
  const closePane = useWorkspaceStore((s) => s.closePane);
  const movePane = useWorkspaceStore((s) => s.movePane);
  const setMaximized = useWorkspaceStore((s) => s.setMaximized);
  const index = useWorkspaceStore((s) => s.panes.findIndex((p) => p.id === pane.id));
  const count = useWorkspaceStore((s) => s.panes.length);
  const Icon = PANE_KINDS[pane.kind].icon;

  function toggleMaximized() {
    setMaximized(maximized ? null : pane.id);
  }

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(PANE_DRAG_TYPE, pane.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDoubleClick={(e) => {
        // Buttons in the header keep their own double-clicks.
        if ((e.target as HTMLElement).closest("button")) return;
        if (count > 1) toggleMaximized();
      }}
      title={maximized ? "Double-click to restore all panes" : "Double-click to maximize · drag onto another pane to swap"}
      className={cx(
        "flex h-8 shrink-0 cursor-grab items-center gap-1 border-b bg-surface-2/60 pl-1.5 pr-1 active:cursor-grabbing",
        focused ? "border-accent" : "border-line",
      )}
      style={{ borderBottomWidth: 2 }}
    >
      <LinkGroupToggle pane={pane} />
      {tabs && tabs.length > 1 ? (
        <SlotTabs panes={tabs} activeId={pane.id} />
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
        width="w-60"
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
                movePane(pane.id, -1);
                close();
              }}
              className={cx(index === 0 && "opacity-45")}
            >
              <ArrowLeftToLine className="h-4 w-4 text-ink-3" aria-hidden="true" /> Swap with previous pane
            </PopoverItem>
            <PopoverItem
              onClick={() => {
                movePane(pane.id, 1);
                close();
              }}
              className={cx(index === count - 1 && "opacity-45")}
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
