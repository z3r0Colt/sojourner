import { useState } from "react";
import { Trash2 } from "lucide-react";
import { RichTextEditor } from "./RichTextEditor";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { confirmTrash } from "../../components/ui/confirm";
import { useNoteRefExtractor } from "../../lib/noteLinks";
import type { NoteRefInput } from "../../api/types";

export function NoteEditorModal({
  title,
  initialBody = "",
  onSave,
  onClose,
  onDelete,
}: {
  title: string;
  initialBody?: string;
  /** `refs` are the Scripture references found in the body (backlinks); send them with the save. */
  onSave: (body: string, refs: NoteRefInput[]) => void;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const [body, setBody] = useState(initialBody);
  const extractRefs = useNoteRefExtractor();
  const dirty = body !== initialBody;

  return (
    <Modal
      title={title}
      onClose={onClose}
      dirty={dirty}
      footer={
        <>
          {onDelete && (
            <Button
              variant="danger-ghost"
              icon={Trash2}
              className="mr-auto"
              onClick={async () => {
                if (await confirmTrash("this note")) onDelete();
              }}
            >
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => onSave(body, extractRefs(body))}>
            Save note
          </Button>
        </>
      }
    >
      <RichTextEditor content={body} onChange={setBody} autoFocus placeholder="Write your note…" />
      <p className="mt-2 text-xs text-ink-3">
        A reference like "John 3:16" becomes a link automatically, and the verse it names will list this note under "Mentioned in". Use the link button to point at a resource or web page.
      </p>
    </Modal>
  );
}
