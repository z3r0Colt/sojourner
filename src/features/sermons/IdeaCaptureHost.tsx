import { useState } from "react";
import { useBooks, useCreateSermonIdea, useUpdateSermonIdea } from "../../api/queries";
import { parseReference, useBookLookup } from "../../hooks/useReferenceParser";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { toast } from "../../components/ui/toast";
import { cx, inputSmClass, textareaClass } from "../../components/ui/classes";
import { ideaInput, ideaRefLabel, useIdeaCapture, type IdeaDraft } from "./sermonIdeas";
import type { PassageRef, SermonIdea } from "../../api/types";

/** Shows the sermon idea modal wherever the capture came from. Mounted once
 * in the shell, like the illustration capture. */
export function IdeaCaptureHost() {
  const open = useIdeaCapture((s) => s.open);
  const close = useIdeaCapture((s) => s.close);
  if (!open) return null;
  return (
    <IdeaModal key={open.editing?.id ?? "new"} draft={open.draft} editing={open.editing} onSaved={open.onSaved} onClose={close} />
  );
}

/** The words, and a passage to go with them if there is one. Nothing else:
 * an idea is caught in the time it takes to type it. */
function IdeaModal({
  draft,
  editing,
  onSaved,
  onClose,
}: {
  draft: IdeaDraft;
  editing: SermonIdea | null;
  onSaved?: () => void;
  onClose: () => void;
}) {
  const { data: books } = useBooks();
  const bookLookup = useBookLookup();
  const create = useCreateSermonIdea();
  const update = useUpdateSermonIdea();
  const [body, setBody] = useState(draft.body);
  // The captured passage stands as it came until the box is edited, so it
  // never depends on the book names having loaded to be read back.
  const [refEdit, setRefEdit] = useState<string | null>(null);
  const refText =
    refEdit ??
    (draft.ref
      ? ideaRefLabel(books, {
          book_id: draft.ref.book_id,
          chapter: draft.ref.chapter,
          verse_start: draft.ref.verse_end >= 999 ? null : draft.ref.verse_start,
          verse_end: draft.ref.verse_end >= 999 ? null : draft.ref.verse_end,
        })
      : "");

  const parsed = refEdit?.trim() ? parseReference(refEdit.trim(), bookLookup) : null;
  const refError = refEdit != null && refEdit.trim() !== "" && !parsed;
  const ref: PassageRef | null =
    refEdit == null
      ? draft.ref
      : parsed
        ? {
            book_id: parsed.book.id,
            chapter: parsed.chapter,
            verse_start: parsed.verse ?? 1,
            verse_end: parsed.verse == null ? 999 : Math.max(parsed.verse, parsed.verseEnd ?? parsed.verse),
          }
        : null;
  const valid = body.trim().length > 0 && !refError;
  const dirty = body !== draft.body || refEdit != null;

  function save() {
    // Enter and Ctrl+Enter save as well as the button, so a held key must
    // not write the idea twice.
    if (!valid || create.isPending || update.isPending) return;
    const input = ideaInput(body, ref, draft.sourceLabel);
    const done = (message: string) => {
      toast.success(message);
      onSaved?.();
      onClose();
    };
    if (editing) update.mutate({ ideaId: editing.id, input }, { onSuccess: () => done("Idea saved") });
    else create.mutate(input, { onSuccess: () => done("Idea kept for later") });
  }

  return (
    <Modal
      title={editing ? "Edit the idea" : "A sermon idea"}
      onClose={onClose}
      dirty={dirty}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!valid || create.isPending || update.isPending} onClick={save}>
            {editing ? "Save" : "Keep it"}
          </Button>
        </>
      }
    >
      <label className="block">
        <span className="sr-only">The idea</span>
        <textarea
          autoFocus
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              save();
            }
          }}
          rows={5}
          placeholder="Grace comes before the command: “I am the LORD your God, who brought you out…”, then the Ten Words."
          className={cx(textareaClass, "w-full")}
        />
      </label>
      <label className="mt-3 block">
        <span className="mb-1 block text-xs font-medium text-ink-3">Passage (optional)</span>
        <input
          value={refText}
          onChange={(e) => setRefEdit(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="Exodus 20:1-3"
          aria-invalid={refError}
          className={cx(inputSmClass, "w-full")}
        />
      </label>
      {refError && <p className="pt-1 text-xs text-danger">That doesn't look like a reference.</p>}
      <p className="pt-2 text-xs text-ink-3">
        It waits in the Ideas tab beside every sermon, and on the Sermons page. Ctrl+Enter keeps it.
      </p>
    </Modal>
  );
}
