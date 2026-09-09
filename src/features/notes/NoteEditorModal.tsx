import { useState } from "react";
import { RichTextEditor } from "./RichTextEditor";

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">{title}</h3>
        <RichTextEditor content={body} onChange={setBody} autoFocus placeholder="Write your note…" />
        <p className="mt-1 text-xs text-gray-400">
          Type a reference like "John 3:16" and it becomes clickable automatically. Use the 🔗 button to link to a
          resource or web page.
        </p>
        <div className="mt-3 flex justify-between">
          <div>
            {onDelete && (
              <button
                onClick={onDelete}
                className="rounded px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
              >
                Delete
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={() => onSave(body)}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
