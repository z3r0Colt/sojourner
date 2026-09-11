import { ArrowLeftToLine, ArrowRightToLine, MoreHorizontal, X } from "lucide-react";
import { useBooks, useCommentarySources, useDictionaryIndex, useResources, useTranslations, useWestminsterDocuments } from "../api/queries";
import { useWorkspaceStore, PANE_KIND_LIST, type Pane } from "../state/workspaceStore";
import { IconButton } from "../components/ui/Button";
import { Popover, PopoverItem, PopoverLabel } from "../components/ui/Popover";
import { cx } from "../components/ui/classes";
import { PANE_KINDS, paneTitle, type TitleContext } from "./paneKinds";
import { openContent } from "./openContent";

/** The title of a pane's current content, resolved against the loaded
 * lookup tables (books, translations, sources). */
export function usePaneTitle(pane: Pane): string {
  const { data: books } = useBooks();
  const { data: translations } = useTranslations();
  const { data: commentarySources } = useCommentarySources();
  const { data: resources } = useResources();
  const { data: westminsterDocs } = useWestminsterDocuments();
  const { data: dictionaryIndex } = useDictionaryIndex();
  const ctx: TitleContext = { books, translations, commentarySources, resources, westminsterDocs, dictionaryIndex };
  return paneTitle(pane, ctx);
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
        "flex h-8 shrink-0 items-center gap-1 border-b bg-surface-2/60 pl-2.5 pr-1",
        focused ? "border-accent" : "border-line",
      )}
      style={{ borderBottomWidth: 2 }}
    >
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
