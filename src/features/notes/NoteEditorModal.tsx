import { useState } from "react";
import { Trash2 } from "lucide-react";
import { RichTextEditor } from "./RichTextEditor";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { confirmDelete } from "../../components/ui/confirm";

export function NoteEditorModal({
  title,
  initialBody = "",
  onSave,
  onClose,
  onDelete,
}: {
  title: string;
  initialBody?: string;
  onSave: (body: string) => void;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const [body, setBody] = useState(initialBody);
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
                if (await confirmDelete("this note")) onDelete();
              }}
            >
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => onSave(body)}>
            Save note
          </Button>
        </>
      }
    >
      <RichTextEditor content={body} onChange={setBody} autoFocus placeholder="Write your note…" />
      <p className="mt-2 text-xs text-ink-3">
        A reference like "John 3:16" becomes a link automatically. Use the link button to point at a resource or web page.
      </p>
    </Modal>
  );
}
