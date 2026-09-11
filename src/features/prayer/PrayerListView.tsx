import { useMemo, useState } from "react";
import { Check, HandHeart, Pencil, Plus, RotateCcw, Trash2, Users } from "lucide-react";
import {
  usePrayerListPeople,
  useCreatePrayerListPerson,
  useUpdatePrayerListPerson,
  useSetPrayerListPersonActive,
  useMarkPrayerListPersonPrayed,
  useMarkPrayerListPersonAnswered,
  useDeletePrayerListPerson,
} from "../../api/queries";
import { PrayerListPersonModal } from "./PrayerListPersonModal";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { confirmDelete } from "../../components/ui/confirm";
import { toast } from "../../components/ui/toast";
import { cardClass, checkboxClass, cx, inputSmClass } from "../../components/ui/classes";
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
  const markAnswered = useMarkPrayerListPersonAnswered();
  const deletePerson = useDeletePrayerListPerson();

  const [editing, setEditing] = useState<PrayerListPerson | null | "new">(null);
  const [showArchived, setShowArchived] = useState(false);
  const [answering, setAnswering] = useState<number | null>(null);
  const [answerDraft, setAnswerDraft] = useState("");

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

  function confirmAnswered() {
    if (answering == null) return;
    markAnswered.mutate({ id: answering, answerNote: answerDraft.trim() || undefined }, { onSuccess: () => toast.success("Marked as answered") });
    setAnswering(null);
    setAnswerDraft("");
  }

  const hasAny = (people?.length ?? 0) > 0;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        {hasAny ? (
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" className={checkboxClass} checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Show answered and archived
          </label>
        ) : (
          <span />
        )}
        <Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>
          Add person
        </Button>
      </div>

      {!hasAny && (
        <EmptyState
          icon={Users}
          title="No one on your prayer list yet"
          description="Keep people and requests here, separate from journal entries. Tap “Prayed today” to log it, and “Answered” to archive it with a note of how God answered."
          action={
            <Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>
              Add the first person
            </Button>
          }
        />
      )}
      {hasAny && groups.length === 0 && <EmptyState compact title="Everyone is answered or archived" description="Tick “Show answered and archived” to see them." />}

      <div className="space-y-6">
        {groups.map(([category, list]) => (
          <section key={category}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">{category}</h2>
            <ul className="space-y-2">
              {list.map((p) => (
                <li key={p.id} className={cx(cardClass, !p.active && "opacity-70")}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-ink">{p.name}</div>
                      {p.notes && <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink-2">{p.notes}</p>}
                      {p.active && <div className="mt-1 text-xs text-ink-3">Last prayed for {timeAgo(p.last_prayed_at)}</div>}
                      {!p.active && p.answered_at && (
                        <div className="mt-1 text-xs text-green-700 dark:text-green-400">
                          Answered {timeAgo(p.answered_at)}
                          {p.answer_note && <p className="mt-0.5 italic">{p.answer_note}</p>}
                        </div>
                      )}
                      {!p.active && !p.answered_at && <div className="mt-1 text-xs text-ink-3">Archived</div>}
                    </div>
                    {p.active && (
                      <Button size="sm" variant="secondary" icon={HandHeart} onClick={() => markPrayed.mutate(p.id, { onSuccess: () => toast.success(`Logged a prayer for ${p.name}`) })}>
                        Prayed today
                      </Button>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap justify-end gap-1">
                    <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(p)}>
                      Edit
                    </Button>
                    {p.active ? (
                      <Button size="sm" variant="ghost" icon={Check} onClick={() => setAnswering(p.id)}>
                        Answered
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => setActive.mutate({ id: p.id, active: true })}>
                        Restore
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="danger-ghost"
                      icon={Trash2}
                      onClick={async () => {
                        if (await confirmDelete(p.name, "This removes them from your prayer list along with any answer note.")) {
                          deletePerson.mutate(p.id, { onSuccess: () => toast.info(`Removed ${p.name}`) });
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                  {answering === p.id && (
                    <div className="mt-2 flex items-center gap-2 border-t border-line pt-2">
                      <input
                        autoFocus
                        value={answerDraft}
                        onChange={(e) => setAnswerDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") confirmAnswered();
                          if (e.key === "Escape") setAnswering(null);
                        }}
                        placeholder="How did God answer? (optional)"
                        className={cx(inputSmClass, "min-w-0 flex-1")}
                      />
                      <Button size="sm" variant="primary" onClick={confirmAnswered}>
                        Mark answered
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setAnswering(null);
                          setAnswerDraft("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {editing && (
        <PrayerListPersonModal
          existing={editing === "new" ? null : editing}
          onSave={(input) => {
            if (editing === "new") {
              createPerson.mutate(input, { onSuccess: () => toast.success(`Added ${input.name}`) });
            } else {
              updatePerson.mutate({ id: editing.id, ...input }, { onSuccess: () => toast.success("Saved") });
            }
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
