import { useState } from "react";
import { ArrowDownToLine, FilePlus2, GripVertical, NotebookPen, Pencil, Trash2, Undo2 } from "lucide-react";
import {
  useBooks,
  useCreateSermon,
  useCreateSermonIdea,
  useDeleteSermonIdea,
  useFileSermonIdea,
  useSermonIdeas,
} from "../../api/queries";
import { confirmDelete } from "../../components/ui/confirm";
import { toast } from "../../components/ui/toast";
import { cx, inputSmClass } from "../../components/ui/classes";
import { openContent } from "../../workspace/openContent";
import { nextSunday } from "./sermonFormat";
import { IDEA_MIME, captureSermonIdea, ideaHtml, ideaRef, ideaRefLabel, useIdeaCapture } from "./sermonIdeas";
import type { SermonIdea } from "../../api/types";

/**
 * The idea inbox, in two places: beside a manuscript (the side panel's Ideas
 * tab), where an idea drags into the text or goes in at the cursor and is
 * filed into that sermon; and on the Sermons page, where one can start a
 * sermon of its own.
 */
export function IdeasPanel({
  sermonId,
  onInsert,
  paneId,
  compact,
}: {
  /** The sermon beside it, when there is one. */
  sermonId?: number;
  /** Puts the idea's markup at the manuscript's cursor. */
  onInsert?: (html: string) => void;
  paneId?: string;
  /** The side panel's narrow column. */
  compact?: boolean;
}) {
  const { data: ideas } = useSermonIdeas();
  const { data: books } = useBooks();
  const createIdea = useCreateSermonIdea();
  const file = useFileSermonIdea();
  const [quick, setQuick] = useState("");

  const inbox = (ideas ?? []).filter((i) => i.sermon_id == null);
  const filedHere = sermonId == null ? [] : (ideas ?? []).filter((i) => i.sermon_id === sermonId);

  function addQuick() {
    const body = quick.trim();
    // A held Enter repeats before the first write lands.
    if (!body || createIdea.isPending) return;
    createIdea.mutate({ body }, { onSuccess: () => setQuick("") });
  }

  function insert(idea: SermonIdea) {
    if (!onInsert || sermonId == null) return;
    onInsert(ideaHtml(idea));
    file.mutate({ ideaId: idea.id, sermonId });
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        <input
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addQuick()}
          placeholder="Catch an idea…"
          aria-label="New idea"
          className={cx(inputSmClass, "min-w-0 flex-1")}
        />
        <button
          type="button"
          onClick={() => captureSermonIdea({ body: quick }, () => setQuick(""))}
          title="Write it out, with a passage (Ctrl+Alt+I)"
          aria-label="Write it out, with a passage"
          className="shrink-0 rounded px-1.5 text-ink-3 hover:bg-hover hover:text-ink"
        >
          <NotebookPen className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {inbox.length === 0 ? (
        <p className="px-1 text-xs text-ink-3">
          Nothing waiting. Ctrl+Alt+I catches an idea from anywhere, and a selection in the Bible can start one.
          {onInsert ? " Drag one into the manuscript, or put it at the cursor, and it is filed here." : ""}
        </p>
      ) : (
        <ul className={cx(compact ? "space-y-1" : "grid gap-2 sm:grid-cols-2")}>
          {inbox.map((idea) => (
            <IdeaRow
              key={idea.id}
              idea={idea}
              refLabel={ideaRefLabel(books, idea)}
              sermonId={sermonId}
              onInsert={onInsert ? () => insert(idea) : undefined}
              paneId={paneId}
            />
          ))}
        </ul>
      )}

      {filedHere.length > 0 && (
        <>
          <p className="px-1 pt-2 text-xs font-semibold uppercase tracking-wide text-ink-4">Filed in this sermon</p>
          <ul className="space-y-1">
            {filedHere.map((idea) => (
              <li key={idea.id} className="flex items-start gap-1 rounded-md px-2 py-1 text-ink-3">
                <span className="line-clamp-2 min-w-0 flex-1 text-xs">{idea.body}</span>
                <button
                  type="button"
                  onClick={() => file.mutate({ ideaId: idea.id, sermonId: null })}
                  title="Back to the inbox (what is in the manuscript stays)"
                  aria-label="Back to the inbox"
                  className="shrink-0 rounded p-0.5 text-ink-4 hover:bg-hover hover:text-ink"
                >
                  <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function IdeaRow({
  idea,
  refLabel,
  sermonId,
  onInsert,
  paneId,
}: {
  idea: SermonIdea;
  refLabel: string;
  sermonId?: number;
  onInsert?: () => void;
  paneId?: string;
}) {
  const edit = useIdeaCapture((s) => s.edit);
  const remove = useDeleteSermonIdea();
  const file = useFileSermonIdea();
  const createSermon = useCreateSermon();
  const draggable = sermonId != null;

  async function del() {
    if (!(await confirmDelete("this idea", "It is not in the Trash afterwards; it is gone."))) return;
    remove.mutate(idea.id);
  }

  /** A sermon of its own: the idea is its first paragraph, its passage is
   * the sermon's text, and it is filed there. */
  function startSermon() {
    const ref = ideaRef(idea);
    const firstLine = idea.body.split("\n")[0].trim();
    createSermon.mutate(
      {
        title: firstLine.length > 60 ? `${firstLine.slice(0, 57).trimEnd()}…` : firstLine,
        preach_date: nextSunday(),
        body: ideaHtml({ ...idea, book_id: null, chapter: null }),
        passages: ref ? [{ role: "text", ...ref }] : [],
      },
      {
        onSuccess: (sermon) => {
          file.mutate({ ideaId: idea.id, sermonId: sermon.id });
          openContent("sermon", { id: sermon.id }, { from: paneId });
          toast.success("Sermon started");
        },
      },
    );
  }

  return (
    <li
      draggable={draggable}
      onDragStart={(e) => {
        // The manuscript takes the drop as ordinary pasted markup, so the
        // idea lands exactly where the caret shows it would; the id rides
        // along for SermonPane, which files the idea when the drop lands.
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.setData("text/html", ideaHtml(idea));
        e.dataTransfer.setData("text/plain", idea.body);
        e.dataTransfer.setData(IDEA_MIME, String(idea.id));
      }}
      className="group flex items-start gap-1 rounded-md border border-line bg-surface px-2 py-1.5"
    >
      {draggable && (
        <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-grab text-ink-4 opacity-0 group-hover:opacity-100" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-4 whitespace-pre-line text-sm text-ink-2">{idea.body}</p>
        {refLabel && <p className="mt-0.5 text-xs text-accent">{refLabel}</p>}
      </div>
      <div className="flex shrink-0 flex-col gap-0.5 opacity-60 group-focus-within:opacity-100 group-hover:opacity-100">
        {onInsert ? (
          <IdeaAction icon={ArrowDownToLine} label="Put it in the manuscript at the cursor" onClick={onInsert} />
        ) : (
          <IdeaAction icon={FilePlus2} label="Start a sermon from this idea" onClick={startSermon} />
        )}
        <IdeaAction icon={Pencil} label="Edit the idea" onClick={() => edit(idea)} />
        <IdeaAction icon={Trash2} label="Delete the idea" onClick={() => void del()} danger />
      </div>
    </li>
  );
}

function IdeaAction({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: typeof Pencil;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cx("rounded p-0.5 text-ink-4 hover:bg-hover", danger ? "hover:text-danger" : "hover:text-ink")}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}
