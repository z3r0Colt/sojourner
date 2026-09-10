import { useState } from "react";
import type { PrayerListPerson } from "../../api/types";

export function PrayerListPersonModal({
  existing,
  onSave,
  onClose,
}: {
  existing?: PrayerListPerson | null;
  onSave: (input: { name: string; category?: string; notes?: string }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [category, setCategory] = useState(existing?.category ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-lg bg-white shadow-xl dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 p-3 dark:border-gray-800">
          <h3 className="text-sm font-semibold">{existing ? "Edit Prayer List Entry" : "Add to Prayer List"}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" title="Close" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-sm">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-500">Name</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mom, or a missionary family's name"
              className="w-full rounded border border-gray-300 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-950"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-500">Category (optional)</span>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Family, Church, Missionaries, Government"
              className="w-full rounded border border-gray-300 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-950"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-500">Notes (optional)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              placeholder="What to pray for."
              className="w-full rounded border border-gray-300 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-950"
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 p-3 dark:border-gray-800">
          <button onClick={onClose} className="rounded px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
            Cancel
          </button>
          <button
            disabled={!name.trim()}
            onClick={() => onSave({ name: name.trim(), category: category.trim() || undefined, notes: notes.trim() || undefined })}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
