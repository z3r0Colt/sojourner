import { useMemo, useState } from "react";
import { useBooks } from "../../api/queries";
import { buildBookLookup, parseReference } from "../../hooks/useReferenceParser";
import type { PrayerEntry } from "../../api/types";

const FIELDS: { key: "adoration" | "confession" | "thanksgiving" | "supplication"; label: string; hint: string }[] = [
  { key: "adoration", label: "Adoration", hint: "Praise God for who he is." },
  { key: "confession", label: "Confession", hint: "Confess sin honestly before God." },
  { key: "thanksgiving", label: "Thanksgiving", hint: "Give thanks for his gifts and grace." },
  { key: "supplication", label: "Supplication", hint: "Bring requests for yourself and others." },
];

export function PrayerEntryEditorModal({
  existing,
  onSave,
  onClose,
}: {
  existing?: PrayerEntry | null;
  onSave: (input: {
    entryDate: string;
    adoration?: string;
    confession?: string;
    thanksgiving?: string;
    supplication?: string;
    bookId?: number;
    chapter?: number;
    verseStart?: number;
    verseEnd?: number;
  }) => void;
  onClose: () => void;
}) {
  const { data: books } = useBooks();
  const lookup = useMemo(() => buildBookLookup(books ?? []), [books]);
  const [entryDate, setEntryDate] = useState(existing?.entry_date ?? new Date().toISOString().slice(0, 10));
  const [values, setValues] = useState({
    adoration: existing?.adoration ?? "",
    confession: existing?.confession ?? "",
    thanksgiving: existing?.thanksgiving ?? "",
    supplication: existing?.supplication ?? "",
  });
  const existingPassage =
    existing?.book_id != null
      ? `${books?.find((b) => b.id === existing.book_id)?.name ?? ""} ${existing.chapter}${existing.verse_start ? `:${existing.verse_start}` : ""}${
          existing.verse_end && existing.verse_end !== existing.verse_start ? `-${existing.verse_end}` : ""
        }`
      : "";
  const [passageInput, setPassageInput] = useState(existingPassage);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-lg bg-white shadow-xl dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 p-3 dark:border-gray-800">
          <h3 className="text-sm font-semibold">{existing ? "Edit Prayer Entry" : "New Prayer Entry"}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" title="Close" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-sm">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-500">Date</span>
            <input
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-950"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-500">Passage (optional)</span>
            <input
              value={passageInput}
              onChange={(e) => setPassageInput(e.target.value)}
              placeholder="e.g. Psalm 51:1-12"
              className="w-full rounded border border-gray-300 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-950"
            />
          </label>
          {FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-500">{f.label}</span>
              <span className="mb-1 block text-xs text-gray-400">{f.hint}</span>
              <textarea
                value={values[f.key]}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                rows={3}
                className="w-full rounded border border-gray-300 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-950"
              />
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 p-3 dark:border-gray-800">
          <button onClick={onClose} className="rounded px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
            Cancel
          </button>
          <button
            onClick={() => {
              const parsed = passageInput.trim() ? parseReference(passageInput, lookup) : null;
              onSave({
                entryDate,
                adoration: values.adoration || undefined,
                confession: values.confession || undefined,
                thanksgiving: values.thanksgiving || undefined,
                supplication: values.supplication || undefined,
                bookId: parsed?.book.id,
                chapter: parsed?.chapter,
                verseStart: parsed?.verse,
                verseEnd: parsed?.verseEnd ?? parsed?.verse,
              });
            }}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
