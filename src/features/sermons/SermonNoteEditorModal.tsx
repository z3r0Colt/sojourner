import { useMemo, useState } from "react";
import { useBooks } from "../../api/queries";
import { useAddSermonNotePassage, useDeleteSermonNotePassage } from "../../api/queries";
import { buildBookLookup, parseReference } from "../../hooks/useReferenceParser";
import type { SermonNote } from "../../api/types";

export function SermonNoteEditorModal({
  existing,
  onSave,
  onClose,
}: {
  existing?: SermonNote | null;
  onSave: (input: {
    date: string;
    preacher?: string;
    title?: string;
    passageText?: string;
    outline?: string;
    application?: string;
  }) => void;
  onClose: () => void;
}) {
  const { data: books } = useBooks();
  const lookup = useMemo(() => buildBookLookup(books ?? []), [books]);
  const addPassage = useAddSermonNotePassage();
  const deletePassage = useDeleteSermonNotePassage();

  const [date, setDate] = useState(existing?.date ?? new Date().toISOString().slice(0, 10));
  const [preacher, setPreacher] = useState(existing?.preacher ?? "");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [passageText, setPassageText] = useState(existing?.passage_text ?? "");
  const [outline, setOutline] = useState(existing?.outline ?? "");
  const [application, setApplication] = useState(existing?.application ?? "");
  const [passageInput, setPassageInput] = useState("");

  function bookName(id: number) {
    return books?.find((b) => b.id === id)?.name ?? `#${id}`;
  }

  function addPassageRef() {
    if (!existing || !passageInput.trim()) return;
    const parsed = parseReference(passageInput, lookup);
    if (!parsed) return;
    addPassage.mutate({
      sermonNoteId: existing.id,
      bookId: parsed.book.id,
      chapter: parsed.chapter,
      verseStart: parsed.verse,
      verseEnd: parsed.verseEnd ?? parsed.verse,
    });
    setPassageInput("");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-lg bg-white shadow-xl dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 p-3 dark:border-gray-800">
          <h3 className="text-sm font-semibold">{existing ? "Edit Sermon Note" : "New Sermon Note"}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" title="Close" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-sm">
          <div className="flex gap-3">
            <label className="flex-1">
              <span className="mb-1 block text-xs font-semibold text-gray-500">Date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-950"
              />
            </label>
            <label className="flex-1">
              <span className="mb-1 block text-xs font-semibold text-gray-500">Preacher</span>
              <input
                value={preacher}
                onChange={(e) => setPreacher(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-950"
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-500">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-950"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-500">Text (Scripture reference)</span>
            <input
              value={passageText}
              onChange={(e) => setPassageText(e.target.value)}
              placeholder="e.g. John 3:16-21"
              className="w-full rounded border border-gray-300 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-950"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-500">Outline</span>
            <textarea
              value={outline}
              onChange={(e) => setOutline(e.target.value)}
              rows={4}
              className="w-full rounded border border-gray-300 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-950"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-500">Application</span>
            <textarea
              value={application}
              onChange={(e) => setApplication(e.target.value)}
              rows={3}
              className="w-full rounded border border-gray-300 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-950"
            />
          </label>

          {existing && (
            <div>
              <span className="mb-1 block text-xs font-semibold text-gray-500">Linked passages</span>
              <div className="mb-2 flex flex-wrap gap-1">
                {existing.passages.map((p) => (
                  <span
                    key={p.id}
                    className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs dark:bg-gray-800"
                  >
                    {bookName(p.book_id)} {p.chapter}
                    {p.verse_start ? `:${p.verse_start}` : ""}
                    {p.verse_end && p.verse_end !== p.verse_start ? `-${p.verse_end}` : ""}
                    <button
                      onClick={() => deletePassage.mutate(p.id)}
                      className="text-gray-400 hover:text-gray-600"
                      title="Remove"
                      aria-label={`Remove passage ${bookName(p.book_id)} ${p.chapter}`}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={passageInput}
                  onChange={(e) => setPassageInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addPassageRef()}
                  placeholder="Link another passage…"
                  className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-950"
                />
                <button
                  onClick={addPassageRef}
                  className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Link
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 p-3 dark:border-gray-800">
          <button onClick={onClose} className="rounded px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
            Cancel
          </button>
          <button
            onClick={() =>
              onSave({
                date,
                preacher: preacher || undefined,
                title: title || undefined,
                passageText: passageText || undefined,
                outline: outline || undefined,
                application: application || undefined,
              })
            }
            className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
