import { useCallback, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { Link2, Mic, PanelRight } from "lucide-react";
import { usePassagesIn } from "../../api/queries";
import { useReaderTranslationId, useWorkspaceStore } from "../../state/workspaceStore";
import { useUiStore } from "../../state/uiStore";
import { usePane, usePaneParams } from "../../workspace/PaneContext";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";
import { IconButton } from "../../components/ui/Button";
import { Popover } from "../../components/ui/Popover";
import { cx } from "../../components/ui/classes";
import { RichTextEditor, type RichTextEditorHandle } from "../notes/RichTextEditor";
import { SermonEditorProvider } from "./editor/context";
import { SermonHeader } from "./SermonHeader";
import { SermonSidePanel, type SidePanelTab } from "./SermonSidePanel";
import { rateLabel, useSermonWordCount, useSpeakingRateInfo } from "./sermonStats";
import { useSermonTemplates } from "./sermonTemplates";
import { useSendToSermonRequest } from "./sendToSermon";
import { openSourceRef } from "./sourceIdentity";
import { useSermonDraft } from "./sermonDraft";
import { passageAtCursor } from "./cursorPassage";
import { refKey } from "../../lib/passage";
import type { PassageRef } from "../../api/types";

/** "Saved 10:42" -- short and local, the way a word processor says it. */
function savedLabel(at: Date | null, saving: boolean): string {
  if (saving) return "Saving…";
  if (!at) return "";
  return `Saved ${at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

/** One sermon's manuscript (SB1.1). The document autosaves, and with the
 * pane in a link group it *leads* that group: the passage under the cursor
 * is published so the Bible, commentary, and cross references beside it turn
 * to the text being written about. It never follows -- a verse clicked in
 * the Bible must not scroll the manuscript out from under the writer. */
export function SermonPane() {
  const [params] = usePaneParams("sermon");
  const { id: paneId, width: paneWidth } = usePane();
  const { sermon, draft, isLoading, patch, savedAt, isSaving, passageRefs } = useSermonDraft(params.id);
  const readerTranslationId = useReaderTranslationId();
  const publishPassage = useWorkspaceStore((s) => s.publishPassage);
  const linkGroup = useWorkspaceStore((s) => s.panes.find((p) => p.id === paneId)?.linkGroup ?? null);
  const followsCursor = useUiStore((s) => s.sermonFollowsCursor);
  const setFollowsCursor = useUiStore((s) => s.setSermonFollowsCursor);
  const editorRef = useRef<RichTextEditorHandle>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastPublishedRef = useRef<string | null>(null);
  const [panelTab, setPanelTab] = useState<SidePanelTab>("outline");
  const [activeSection, setActiveSection] = useState<number | null>(null);
  const rate = useSpeakingRateInfo();
  const [sermonTemplates] = useSermonTemplates();
  // Above 720 px the panel sits beside the manuscript; below, it is a
  // popover behind a header button, so a narrow column keeps its text.
  const panelBeside = paneWidth >= 720;

  const translationId = draft?.translationId ?? readerTranslationId;
  // One query for every passage block in the document, whatever their number
  // (see the context's own comment): the node views read the map.
  const { byKey, isLoading: passagesLoading } = usePassagesIn(translationId, passageRefs);
  const words = useSermonWordCount(draft?.body ?? "", translationId, rate);
  // Past the target, the footer turns amber -- the one number a preacher
  // most needs to see going the wrong way.
  const overTarget = draft?.targetMinutes != null && words.minutes > draft.targetMinutes;

  // Material sent from a study pane lands at the cursor (SB1.4).
  useSendToSermonRequest(params.id, (item) => {
    const handle = editorRef.current;
    if (!handle) return;
    if (item.kind === "passage" && item.passage) {
      handle.insertPassage(item.passage);
      return;
    }
    handle.insertSource({
      kind: item.kind === "passage" ? "resource" : item.kind,
      ref_id: item.refId,
      label: item.label,
      excerpt: item.excerpt,
    });
  });

  const openSource = useCallback(
    (kind: string, refId: string | null, event?: React.MouseEvent) => openSourceRef(kind, refId, event, paneId),
    [paneId],
  );

  /** Leading the group: publish only on a cursor move, only when the
   * passage differs from the last one published, and never in response to
   * an incoming passage -- the pane does not follow, so there is no loop. */
  const onSelectionChange = useCallback(
    (editor: Editor) => {
      // Which section the cursor is in, for the Outline panel's mark: the
      // number of headings at or before it.
      let headings = 0;
      const cursor = editor.state.selection.from;
      let sectionIndex = 0;
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name !== "heading") return true;
        headings += 1;
        if (pos <= cursor) sectionIndex = headings;
        return false;
      });
      setActiveSection(sectionIndex);

      if (!followsCursor || linkGroup == null) return;
      const ref: PassageRef | null = passageAtCursor(editor);
      const key = ref ? refKey(ref) : null;
      if (key === lastPublishedRef.current) return;
      lastPublishedRef.current = key;
      if (!ref) return;
      publishPassage(paneId, {
        bookId: ref.book_id,
        chapter: ref.chapter,
        verse: ref.verse_start,
      });
    },
    [followsCursor, linkGroup, paneId, publishPassage],
  );

  if (isLoading && !draft) return <LoadingState className="py-10" />;
  if (!sermon || !draft) {
    return (
      <div className="p-6">
        <EmptyState
          icon={Mic}
          title="This sermon is no longer here"
          description="It may have been deleted. The Trash keeps a deleted sermon for thirty days."
        />
      </div>
    );
  }

  /** Scrolls the manuscript to a heading, by its index among all headings. */
  function goToSection(index: number) {
    const root = scrollRef.current?.querySelector(".ProseMirror");
    const heading = root?.querySelectorAll("h2, h3")[index];
    heading?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  // Words and minutes (SB1.7): passage blocks count at their rendered
  // length, since the preacher reads them aloud, but their captions do not.
  const panel = (
    <SermonSidePanel
      body={draft.body}
      tab={panelTab}
      onTabChange={setPanelTab}
      activeSectionIndex={activeSection}
      onGoToSection={goToSection}
      rate={rate}
      paneId={paneId}
    />
  );

  return (
    <SermonEditorProvider value={{ translationId, passages: byKey, passagesLoading, openSource }}>
      <div className="flex h-full min-h-0 flex-col">
        {!panelBeside && (
          <div className="flex shrink-0 items-center justify-end border-b border-line px-2 py-1">
            <Popover
              width="w-72"
              trigger={({ toggle, open }) => (
                <IconButton icon={PanelRight} label="Outline and sources" size="sm" active={open} onClick={toggle} />
              )}
            >
              <div className="-m-2 h-[60vh]">{panel}</div>
            </Popover>
          </div>
        )}
        <div className="flex min-h-0 flex-1">
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-6 py-5">
            <SermonHeader key={sermon.id} draft={draft} patch={patch} paneWidth={paneWidth} />
            <RichTextEditor
              ref={editorRef}
              mode="document"
              content={draft.body}
              onChange={(body) => patch({ body })}
              onSelectionChange={onSelectionChange}
              templates={sermonTemplates}
              templatesLabel="Sermon templates"
              placeholder="Write the sermon…"
              className="border-0 bg-transparent focus-within:border-0"
            />
          </div>
        </div>
        {panelBeside && (
          <aside className="w-64 shrink-0 border-l border-line bg-surface-2/40" aria-label="Outline and sources">
            {panel}
          </aside>
        )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-1.5 text-xs text-ink-3">
          <button
            type="button"
            onClick={() => setFollowsCursor(!followsCursor)}
            aria-pressed={followsCursor}
            title="Turn the linked Bible and commentary panes to the passage under the cursor"
            className={cx(
              "inline-flex items-center gap-1.5 rounded px-1.5 py-0.5",
              followsCursor ? "text-accent" : "text-ink-3 hover:text-ink",
            )}
          >
            <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
            Follow the cursor
          </button>
          {linkGroup == null && followsCursor && (
            <span className="text-ink-4">Put this pane in a link group to lead it.</span>
          )}
          <span
            className={cx("tabular-nums", overTarget && "font-medium text-warn")}
            title={
              draft.targetMinutes
                ? `Target ${draft.targetMinutes} min · ${words.written.toLocaleString()} written and ${words.passages.toLocaleString()} in passage blocks, ${rateLabel(rate)}`
                : `${words.written.toLocaleString()} written and ${words.passages.toLocaleString()} in passage blocks, ${rateLabel(rate)}`
            }
          >
            {words.total.toLocaleString()} words · about {words.minutes} min {rateLabel(rate)}
            {draft.targetMinutes ? ` of ${draft.targetMinutes}` : ""}
          </span>
          <span className="ml-auto tabular-nums" aria-live="polite">
            {savedLabel(savedAt, isSaving)}
          </span>
        </div>
      </div>
    </SermonEditorProvider>
  );
}
