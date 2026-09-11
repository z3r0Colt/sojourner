import { useMemo } from "react";
import { ArrowLeftToLine, ArrowRightToLine, Check, MoreHorizontal, X } from "lucide-react";
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

/** One row above a pane's content: its title, a menu (change content, move,
 * close), and a close button. The focused pane carries a thin accent rule
 * underneath. Shown only when the workspace has more than one pane, so a
 * single pane looks exactly as the page did before panes existed. */
export function PaneHeader({ pane, focused, index, count }: { pane: Pane; focused: boolean; index: number; count: number }) {
  const title = usePaneTitle(pane);
  const closePane = useWorkspaceStore((s) => s.closePane);
  const movePane = useWorkspaceStore((s) => s.movePane);
  const Icon = PANE_KINDS[pane.kind].icon;

  return (
    <div
      className={cx(
        "flex h-8 shrink-0 items-center gap-1 border-b bg-surface-2/60 pl-1.5 pr-1",
        focused ? "border-accent" : "border-line",
      )}
      style={{ borderBottomWidth: 2 }}
    >
      <LinkGroupToggle pane={pane} />
      <Icon className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden="true" />
      <span className={cx("min-w-0 flex-1 truncate text-xs font-medium", focused ? "text-ink" : "text-ink-2")} title={title}>
        {title}
      </span>
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
              <ArrowLeftToLine className="h-4 w-4 text-ink-3" aria-hidden="true" /> Move left
            </PopoverItem>
            <PopoverItem
              onClick={() => {
                movePane(pane.id, 1);
                close();
              }}
              className={cx(index === count - 1 && "opacity-45")}
            >
              <ArrowRightToLine className="h-4 w-4 text-ink-3" aria-hidden="true" /> Move right
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
