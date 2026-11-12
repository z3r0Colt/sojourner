import { useState } from "react";
import { NoteBody } from "../notes/NoteBody";
import { RichTextEditor } from "../notes/RichTextEditor";
import { Button } from "../../components/ui/Button";
import { cx } from "../../components/ui/classes";

/** One note on a whole chapter, in the Bible pane's Chapter notes dialog:
 * shown, and edited in place. With no `onDelete` it is the empty box a new
 * note is written in. */
export function ChapterNoteItem({
  body,
  placeholder,
  onSave,
  onDelete,
  clearAfterSave,
}: {
  body: string;
  placeholder?: string;
  onSave: (body: string) => void;
  onDelete?: () => void;
  clearAfterSave?: boolean;
}) {
  const isNew = !onDelete;
  const [editing, setEditing] = useState(isNew);
  const [value, setValue] = useState(body);

  if (!editing) {
    return (
      <div className="rounded-lg border border-line p-3">
        <NoteBody body={body} className="block whitespace-pre-wrap text-sm text-ink-2" />
        <div className="mt-2 flex justify-end gap-1">
          {onDelete && (
            <Button size="sm" variant="danger-ghost" onClick={onDelete}>
              Delete
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cx("rounded-lg p-3", isNew ? "border border-dashed border-line-2" : "border border-line")}>
      <RichTextEditor content={value} onChange={setValue} placeholder={placeholder} autoFocus={!isNew} />
      <div className="mt-2 flex justify-end gap-1">
        {!isNew && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        )}
        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            onSave(value);
            if (clearAfterSave) setValue("");
            if (!isNew) setEditing(false);
          }}
        >
          {isNew ? "Add note" : "Save"}
        </Button>
      </div>
    </div>
  );
}
