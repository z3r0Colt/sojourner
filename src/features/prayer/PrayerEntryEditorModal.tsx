import { useMemo, useState } from "react";
import { useBooks } from "../../api/queries";
import { buildBookLookup, parseReference } from "../../hooks/useReferenceParser";
import type { PrayerEntry, PrayerEntryMode } from "../../api/types";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { Tabs } from "../../components/ui/Tabs";
import { cx, inputClass, textareaClass } from "../../components/ui/classes";

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
    mode: PrayerEntryMode;
    adoration?: string;
    confession?: string;
    thanksgiving?: string;
    supplication?: string;
    freeText?: string;
    bookId?: number;
    chapter?: number;
    verseStart?: number;
    verseEnd?: number;
  }) => void;
  onClose: () => void;
}) {
  const { data: books } = useBooks();
  const lookup = useMemo(() => buildBookLookup(books ?? []), [books]);
  const initial = useMemo(
    () => ({
      entryDate: existing?.entry_date ?? new Date().toISOString().slice(0, 10),
      mode: (existing?.mode ?? "acts") as PrayerEntryMode,
      adoration: existing?.adoration ?? "",
      confession: existing?.confession ?? "",
      thanksgiving: existing?.thanksgiving ?? "",
      supplication: existing?.supplication ?? "",
      freeText: existing?.free_text ?? "",
      passage:
        existing?.book_id != null
          ? `${books?.find((b) => b.id === existing.book_id)?.name ?? ""} ${existing.chapter}${existing.verse_start ? `:${existing.verse_start}` : ""}${
              existing.verse_end && existing.verse_end !== existing.verse_start ? `-${existing.verse_end}` : ""
            }`
          : "",
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [existing?.id, books],
  );
  const [entryDate, setEntryDate] = useState(initial.entryDate);
  const [mode, setMode] = useState<PrayerEntryMode>(initial.mode);
  const [values, setValues] = useState({
    adoration: initial.adoration,
    confession: initial.confession,
    thanksgiving: initial.thanksgiving,
    supplication: initial.supplication,
  });
  const [freeText, setFreeText] = useState(initial.freeText);
  const [passageInput, setPassageInput] = useState(initial.passage);

  const dirty =
    entryDate !== initial.entryDate ||
    mode !== initial.mode ||
    values.adoration !== initial.adoration ||
    values.confession !== initial.confession ||
    values.thanksgiving !== initial.thanksgiving ||
    values.supplication !== initial.supplication ||
    freeText !== initial.freeText ||
    passageInput !== initial.passage;

  const parsedPassage = passageInput.trim() ? parseReference(passageInput, lookup) : null;
  const passageInvalid = passageInput.trim() !== "" && !parsedPassage;

  return (
    <Modal
      title={existing ? "Edit prayer entry" : "New prayer entry"}
      onClose={onClose}
      dirty={dirty}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() =>
              onSave({
                entryDate,
                mode,
                adoration: mode === "acts" ? values.adoration || undefined : undefined,
                confession: mode === "acts" ? values.confession || undefined : undefined,
                thanksgiving: mode === "acts" ? values.thanksgiving || undefined : undefined,
                supplication: mode === "acts" ? values.supplication || undefined : undefined,
                freeText: mode === "free" ? freeText || undefined : undefined,
                bookId: parsedPassage?.book.id,
                chapter: parsedPassage?.chapter,
                verseStart: parsedPassage?.verse,
                verseEnd: parsedPassage?.verseEnd ?? parsedPassage?.verse,
              })
            }
          >
            Save entry
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-3">Date</span>
            <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className={cx(inputClass, "w-full")} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-3">Passage (optional)</span>
            <input
              value={passageInput}
              onChange={(e) => setPassageInput(e.target.value)}
              placeholder="e.g. Psalm 51:1-12"
              className={cx(inputClass, "w-full", passageInvalid && "border-danger")}
            />
            {passageInvalid && <span className="mt-1 block text-xs text-danger">Couldn't read that reference.</span>}
          </label>
        </div>
        <Tabs
          size="sm"
          items={[
            { key: "acts" as const, label: "ACTS", title: "Adoration, Confession, Thanksgiving, Supplication" },
            { key: "free" as const, label: "Free writing" },
          ]}
          value={mode}
          onChange={setMode}
        />
        {mode === "acts" ? (
          FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="mb-0.5 block text-xs font-medium text-ink-3">
                {f.label} <span className="font-normal text-ink-4">· {f.hint}</span>
              </span>
              <textarea
                value={values[f.key]}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                rows={3}
                className={cx(textareaClass, "w-full")}
              />
            </label>
          ))
        ) : (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-3">Prayer</span>
            <textarea
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              rows={12}
              placeholder="Write your prayer however you like."
              className={cx(textareaClass, "w-full")}
            />
          </label>
        )}
      </div>
    </Modal>
  );
}
