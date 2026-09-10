import { useMemo, useState } from "react";
import {
  usePrayerListPeople,
  useCreatePrayerListPerson,
  useUpdatePrayerListPerson,
  useSetPrayerListPersonActive,
  useMarkPrayerListPersonPrayed,
  useDeletePrayerListPerson,
} from "../../api/queries";
import { PrayerListPersonModal } from "./PrayerListPersonModal";
import type { PrayerListPerson } from "../../api/types";

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

export function PrayerListView() {
  const { data: people } = usePrayerListPeople();
  const createPerson = useCreatePrayerListPerson();
  const updatePerson = useUpdatePrayerListPerson();
  const setActive = useSetPrayerListPersonActive();
  const markPrayed = useMarkPrayerListPersonPrayed();
  const deletePerson = useDeletePrayerListPerson();

  const [editing, setEditing] = useState<PrayerListPerson | null | "new">(null);
  const [showArchived, setShowArchived] = useState(false);

  const groups = useMemo(() => {
    const visible = (people ?? []).filter((p) => p.active || showArchived);
    const byCategory = new Map<string, PrayerListPerson[]>();
    for (const p of visible) {
      const key = p.category?.trim() || "Uncategorized";
      if (!byCategory.has(key)) byCategory.set(key, []);
      byCategory.get(key)!.push(p);
    }
    return [...byCategory.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [people, showArchived]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-xs text-gray-500">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show answered / archived
        </label>
        <button onClick={() => setEditing("new")} className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">
          + Add Person
        </button>
      </div>

      {groups.length === 0 && <p className="text-gray-400">No one on your prayer list yet.</p>}
      <div className="space-y-5">
        {groups.map(([category, list]) => (
          <div key={category}>
            <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">{category}</h2>
            <ul className="space-y-2">
              {list.map((p) => (
                <li
                  key={p.id}
                  className={`rounded border border-gray-200 px-3 py-2 dark:border-gray-800 ${!p.active ? "opacity-50" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{p.name}</div>
                      {p.notes && <p className="mt-0.5 whitespace-pre-wrap text-xs text-gray-500">{p.notes}</p>}
                      <div className="mt-1 text-xs text-gray-400">Last prayed for: {timeAgo(p.last_prayed_at)}</div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                      {p.active && (
                        <button onClick={() => markPrayed.mutate(p.id)} className="text-blue-600 hover:underline dark:text-blue-400">
                          🙏 Prayed today
                        </button>
                      )}
                      <div className="flex gap-2 text-gray-400">
                        <button onClick={() => setEditing(p)} className="hover:underline">
                          Edit
                        </button>
                        <button
                          onClick={() => setActive.mutate({ id: p.id, active: !p.active })}
                          className="hover:underline"
                        >
                          {p.active ? "Mark answered" : "Restore"}
                        </button>
                        <button onClick={() => deletePerson.mutate(p.id)} className="hover:underline">
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {editing && (
        <PrayerListPersonModal
          existing={editing === "new" ? null : editing}
          onSave={(input) => {
            if (editing === "new") {
              createPerson.mutate(input);
            } else {
              updatePerson.mutate({ id: editing.id, ...input });
            }
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
