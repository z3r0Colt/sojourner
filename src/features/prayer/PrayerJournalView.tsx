import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { save } from "@tauri-apps/plugin-dialog";
import { BookHeart, Download, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "../../api/client";
import {
  usePrayerEntries,
  useBooks,
  useCreatePrayerEntry,
  useUpdatePrayerEntry,
  useDeletePrayerEntry,
  useAllPrayerEntryTags,
  useAllPrayerEntryTagsByEntry,
  useAddPrayerEntryTag,
  useRemovePrayerEntryTag,
  useTrashToast,
} from "../../api/queries";
import { openPassage, targetFor } from "../../workspace/openContent";
import { PrayerEntryEditorModal } from "./PrayerEntryEditorModal";
import { TagRow, TagFilterBar } from "../../components/TagRow";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { confirmTrash } from "../../components/ui/confirm";
import { toast } from "../../components/ui/toast";
import { cardClass, cx, inputClass } from "../../components/ui/classes";
import { formatChapterRef } from "../../lib/passage";
import type { PrayerEntry } from "../../api/types";

const SECTIONS: { key: "adoration" | "confession" | "thanksgiving" | "supplication"; label: string }[] = [
  { key: "adoration", label: "Adoration" },
  { key: "confession", label: "Confession" },
  { key: "thanksgiving", label: "Thanksgiving" },
  { key: "supplication", label: "Supplication" },
];

function formatDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "long", day: "numeric" });
}

export function PrayerJournalView() {
  const { data: entries } = usePrayerEntries();
  const { data: books } = useBooks();
  const createEntry = useCreatePrayerEntry();
  const updateEntry = useUpdatePrayerEntry();
  const deleteEntry = useDeletePrayerEntry();
  const trashToast = useTrashToast();

  const [editing, setEditing] = useState<PrayerEntry | null | "new">(null);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);
  const { data: searchResults } = useQuery({
    queryKey: ["prayerEntrySearch", debounced],
    queryFn: () => api.searchPrayerEntries(debounced, 50),
    enabled: debounced.trim().length > 1,
  });

  const { data: tagPairs } = useAllPrayerEntryTagsByEntry();
  const { data: allTags } = useAllPrayerEntryTags();
  const addTag = useAddPrayerEntryTag();
  const removeTag = useRemovePrayerEntryTag();
  const tagsById = useMemo(() => {
    const m = new Map<number, string[]>();
    for (const [id, tag] of tagPairs ?? []) m.set(id, [...(m.get(id) ?? []), tag]);
    return m;
  }, [tagPairs]);

  const baseList = debounced.trim().length > 1 ? searchResults : entries;
  const list = activeTag ? baseList?.filter((e) => (tagsById.get(e.id) ?? []).includes(activeTag)) : baseList;

  async function exportEntry(entry: PrayerEntry) {
    const destPath = await save({
      defaultPath: `prayer-${entry.entry_date}.md`,
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (!destPath) return;
    await api.exportPrayerEntry(entry.id, destPath);
    toast.success("Prayer entry exported");
  }

  const hasAny = (entries?.length ?? 0) > 0;

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        {hasAny && (
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your prayer journal…" className={cx(inputClass, "min-w-0 flex-1")} />
        )}
        <Button variant="primary" icon={Plus} onClick={() => setEditing("new")} className={cx(!hasAny && "ml-auto")}>
          New entry
        </Button>
      </div>
      <TagFilterBar tags={allTags ?? []} activeTag={activeTag} onSelect={setActiveTag} />

      {!hasAny && (
        <EmptyState
          icon={BookHeart}
          title="Your prayer journal is empty"
          description="Write in the ACTS pattern (Adoration, Confession, Thanksgiving, Supplication) or free-form, and attach a passage to keep a promise beside each prayer."
          action={
            <Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>
              Write the first entry
            </Button>
          }
        />
      )}
      {hasAny && list && list.length === 0 && <EmptyState compact title="No entries match your search or tag filter" />}

      <ul className="space-y-3">
        {list?.map((e) => (
          <li key={e.id} className={cardClass}>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold text-ink">{formatDate(e.entry_date)}</span>
              {e.book_id != null && (
                <button
                  type="button"
                  onClick={(ev) => openPassage({ bookId: e.book_id!, chapter: e.chapter!, verse: e.verse_start ?? undefined }, { target: targetFor(ev) })}
                  className="text-xs text-accent hover:underline"
                >
                  {formatChapterRef(books, e.book_id, e.chapter!, e.verse_start)}
                </button>
              )}
            </div>
            <div className="space-y-2">
              {e.mode === "free"
                ? e.free_text && <p className="whitespace-pre-wrap text-sm text-ink-2">{e.free_text}</p>
                : SECTIONS.filter((s) => e[s.key]).map((s) => (
                    <div key={s.key}>
                      <div className="text-xs font-semibold uppercase tracking-wide text-ink-3">{s.label}</div>
                      <p className="whitespace-pre-wrap text-sm text-ink-2">{e[s.key]}</p>
                    </div>
                  ))}
            </div>
            <TagRow
              tags={tagsById.get(e.id) ?? []}
              onAdd={(tag) => addTag.mutate({ prayerEntryId: e.id, tag })}
              onRemove={(tag) => removeTag.mutate({ prayerEntryId: e.id, tag })}
              onFilter={setActiveTag}
              hint="e.g. conviction, comfort, duty"
            />
            <div className="mt-2 flex justify-end gap-1">
              <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(e)}>
                Edit
              </Button>
              <Button size="sm" variant="ghost" icon={Download} onClick={() => exportEntry(e)}>
                Export
              </Button>
              <Button
                size="sm"
                variant="danger-ghost"
                icon={Trash2}
                onClick={async () => {
                  if (await confirmTrash(`the entry from ${formatDate(e.entry_date)}`)) {
                    deleteEntry.mutate(e.id, { onSuccess: () => trashToast("prayer_entry", e.id) });
                  }
                }}
              >
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {editing && (
        <PrayerEntryEditorModal
          existing={editing === "new" ? null : editing}
          onSave={(input) => {
            if (editing === "new") {
              createEntry.mutate(input, { onSuccess: () => toast.success("Entry saved") });
            } else {
              updateEntry.mutate({ id: editing.id, ...input }, { onSuccess: () => toast.success("Entry saved") });
            }
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
