import { useCallback, useRef } from "react";
import type { Editor } from "@tiptap/react";
import { Link2, Mic } from "lucide-react";
import { usePassagesIn } from "../../api/queries";
import { useReaderTranslationId, useWorkspaceStore } from "../../state/workspaceStore";
import { useUiStore } from "../../state/uiStore";
import { usePane, usePaneParams } from "../../workspace/PaneContext";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";
import { cx } from "../../components/ui/classes";
import { RichTextEditor, type RichTextEditorHandle } from "../notes/RichTextEditor";
import { SermonEditorProvider } from "./editor/context";
import { SermonHeader } from "./SermonHeader";
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
  const lastPublishedRef = useRef<string | null>(null);

  const translationId = draft?.translationId ?? readerTranslationId;
  // One query for every passage block in the document, whatever their number
  // (see the context's own comment): the node views read the map.
  const { byKey, isLoading: passagesLoading } = usePassagesIn(translationId, passageRefs);

  /** Leading the group: publish only on a cursor move, only when the
   * passage differs from the last one published, and never in response to
   * an incoming passage -- the pane does not follow, so there is no loop. */
  const onSelectionChange = useCallback(
    (editor: Editor) => {
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

  return (
    <SermonEditorProvider value={{ translationId, passages: byKey, passagesLoading }}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-6 py-5">
            <SermonHeader key={sermon.id} draft={draft} patch={patch} paneWidth={paneWidth} />
            <RichTextEditor
              ref={editorRef}
              mode="document"
              content={draft.body}
              onChange={(body) => patch({ body })}
              onSelectionChange={onSelectionChange}
              offerTemplates={false}
              placeholder="Write the sermon…"
              className="border-0 bg-transparent focus-within:border-0"
            />
          </div>
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
          <span className="ml-auto tabular-nums" aria-live="polite">
            {savedLabel(savedAt, isSaving)}
          </span>
        </div>
      </div>
    </SermonEditorProvider>
  );
}
