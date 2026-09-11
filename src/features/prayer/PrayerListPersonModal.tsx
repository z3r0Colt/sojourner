import { useState } from "react";
import type { PrayerListPerson } from "../../api/types";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { cx, inputClass, textareaClass } from "../../components/ui/classes";

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
  const dirty = name !== (existing?.name ?? "") || category !== (existing?.category ?? "") || notes !== (existing?.notes ?? "");

  return (
    <Modal
      title={existing ? "Edit prayer list entry" : "Add to prayer list"}
      onClose={onClose}
      dirty={dirty}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!name.trim()}
            onClick={() => onSave({ name: name.trim(), category: category.trim() || undefined, notes: notes.trim() || undefined })}
          >
            Save
          </Button>
        </>
      }
    >
      <form
        className="space-y-3 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSave({ name: name.trim(), category: category.trim() || undefined, notes: notes.trim() || undefined });
        }}
      >
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-3">Name</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mom, or a missionary family" className={cx(inputClass, "w-full")} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-3">Category (optional)</span>
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Family, Church, Missionaries" className={cx(inputClass, "w-full")} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-3">What to pray for (optional)</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} className={cx(textareaClass, "w-full")} />
        </label>
      </form>
    </Modal>
  );
}
