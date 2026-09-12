import { useEffect, useMemo, useState } from "react";
import { Check, HandHeart, Pencil, Plus, Printer, RotateCcw, Trash2, Users } from "lucide-react";
import {
  usePrayerListPeople,
  useCreatePrayerListPerson,
  useUpdatePrayerListPerson,
  useSetPrayerListPersonActive,
  useMarkPrayerListPersonPrayed,
  useMarkPrayerListPersonAnswered,
  useDeletePrayerListPerson,
} from "../../api/queries";
import { useSetting } from "../../hooks/useSetting";
import { PrayerListPersonModal } from "./PrayerListPersonModal";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { confirmDelete } from "../../components/ui/confirm";
import { toast } from "../../components/ui/toast";
import { cardClass, checkboxClass, cx, inputSmClass, selectSmClass } from "../../components/ui/classes";
import type { PrayerListPerson } from "../../api/types";
import { daysUnprayed, timeAgo } from "./prayerListTime";

/** Setting: days without a prayer before a person gets the nudge marker. */
export const PRAYER_NUDGE_DAYS_SETTING = "prayer_nudge_days";
export const DEFAULT_PRAYER_NUDGE_DAYS = 14;

type SortMode = "category" | "longest";

function categoryOf(p: PrayerListPerson): string {
  return p.category?.trim() || "Uncategorized";
}

function groupByCategory(list: PrayerListPerson[]): [string, PrayerListPerson[]][] {
  const byCategory = new Map<string, PrayerListPerson[]>();
  for (const p of list) {
    const key = categoryOf(p);
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(p);
  }
  return [...byCategory.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/** The amber "14 days" marker (F2.5) for someone not prayed for in a while. */
function NudgeMarker({ person, threshold }: { person: PrayerListPerson; threshold: number }) {
  const days = daysUnprayed(person);
  if (!person.active || days < threshold) return null;
  const label = person.last_prayed_at ? `${days} days` : "never prayed for";
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn"
      title={person.last_prayed_at ? `Not prayed for in ${days} days` : `Added ${days} days ago and not prayed for yet`}
    >
      {label}
    </span>
  );
}

export function PrayerListView() {
  const { data: people } = usePrayerListPeople();
  const createPerson = useCreatePrayerListPerson();
  const updatePerson = useUpdatePrayerListPerson();
  const setActive = useSetPrayerListPersonActive();
  const markPrayed = useMarkPrayerListPersonPrayed();
  const markAnswered = useMarkPrayerListPersonAnswered();
  const deletePerson = useDeletePrayerListPerson();
  const [nudgeDays, setNudgeDays] = useSetting<number>(PRAYER_NUDGE_DAYS_SETTING, DEFAULT_PRAYER_NUDGE_DAYS);
  const threshold = Number.isFinite(nudgeDays) && nudgeDays > 0 ? nudgeDays : DEFAULT_PRAYER_NUDGE_DAYS;

  const [editing, setEditing] = useState<PrayerListPerson | null | "new">(null);
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState<SortMode>("category");
  const [answering, setAnswering] = useState<number | null>(null);
  const [answerDraft, setAnswerDraft] = useState("");
  const [nudgeDraft, setNudgeDraft] = useState(String(threshold));
  useEffect(() => setNudgeDraft(String(threshold)), [threshold]);
  const [printing, setPrinting] = useState(false);

  const visible = useMemo(() => (people ?? []).filter((p) => p.active || showArchived), [people, showArchived]);
  const groups = useMemo(() => groupByCategory(visible), [visible]);
  // "Longest since prayed": one flat list, the most neglected first;
  // archived people (when shown) sink to the bottom.
  const longest = useMemo(
    () => [...visible].sort((a, b) => Number(b.active) - Number(a.active) || daysUnprayed(b) - daysUnprayed(a) || a.name.localeCompare(b.name)),
    [visible],
  );
  const overdue = useMemo(() => (people ?? []).filter((p) => p.active && daysUnprayed(p) >= threshold).length, [people, threshold]);
  const printGroups = useMemo(() => groupByCategory((people ?? []).filter((p) => p.active)), [people]);

  // Printing (F2.5): the paper copy is mounted only for the print pass, so a
  // Bible pane printing its chapter never picks the list up as well.
  useEffect(() => {
    if (!printing) return;
    const id = requestAnimationFrame(() => {
      window.print();
      setPrinting(false);
    });
    return () => cancelAnimationFrame(id);
  }, [printing]);

  function commitNudgeDays() {
    const n = Math.round(Number(nudgeDraft));
    if (!Number.isFinite(n) || n < 1 || n > 365) {
      setNudgeDraft(String(threshold));
      return;
    }
    if (n === threshold) return;
    setNudgeDays(n);
    toast.success(`Nudge after ${n} day${n === 1 ? "" : "s"} without prayer`);
  }

  function confirmAnswered() {
    if (answering == null) return;
    markAnswered.mutate({ id: answering, answerNote: answerDraft.trim() || undefined }, { onSuccess: () => toast.success("Marked as answered") });
    setAnswering(null);
    setAnswerDraft("");
  }

  const hasAny = (people?.length ?? 0) > 0;

  function renderPerson(p: PrayerListPerson, showCategory: boolean) {
    return (
      <li key={p.id} className={cx(cardClass, !p.active && "opacity-70")}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-ink">{p.name}</span>
              {showCategory && p.category?.trim() && <span className="text-xs text-ink-4">{p.category}</span>}
              <NudgeMarker person={p} threshold={threshold} />
            </div>
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
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {hasAny ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-2 text-sm text-ink-2">
              <input type="checkbox" className={checkboxClass} checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Show answered and archived
            </label>
            <select value={sort} onChange={(e) => setSort(e.target.value as SortMode)} className={selectSmClass} aria-label="Sort prayer list">
              <option value="category">By category</option>
              <option value="longest">Longest since prayed</option>
            </select>
            <label className="flex items-center gap-1.5 text-sm text-ink-2" title="People not prayed for in this many days get a marker">
              Nudge after
              <input
                type="number"
                min={1}
                max={365}
                value={nudgeDraft}
                onChange={(e) => setNudgeDraft(e.target.value)}
                onBlur={commitNudgeDays}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitNudgeDays();
                  }
                }}
                aria-label="Days without prayer before a person is marked"
                className={cx(inputSmClass, "w-16 text-right")}
              />
              days
            </label>
          </div>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          {hasAny && (
            <Button icon={Printer} onClick={() => setPrinting(true)} title="Print the active list grouped by category, with a box to tick beside each name">
              Print
            </Button>
          )}
          <Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>
            Add person
          </Button>
        </div>
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
      {hasAny && visible.length === 0 && <EmptyState compact title="Everyone is answered or archived" description="Tick “Show answered and archived” to see them." />}
      {hasAny && overdue > 0 && (
        <p className="mb-3 text-xs text-ink-3">
          {overdue} {overdue === 1 ? "person has" : "people have"} not been prayed for in {threshold} days.
          {sort !== "longest" && (
            <>
              {" "}
              <button type="button" className="text-accent hover:underline" onClick={() => setSort("longest")}>
                Show them first
              </button>
            </>
          )}
        </p>
      )}

      {sort === "longest" ? (
        <ul className="space-y-2">{longest.map((p) => renderPerson(p, true))}</ul>
      ) : (
        <div className="space-y-6">
          {groups.map(([category, list]) => (
            <section key={category}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">{category}</h2>
              <ul className="space-y-2">{list.map((p) => renderPerson(p, false))}</ul>
            </section>
          ))}
        </div>
      )}

      {printing && (
        <div className="print-root print-only" aria-hidden="true">
          <div style={{ fontFamily: "Georgia, serif", padding: "0.5in", color: "#000" }}>
            <h1 style={{ fontSize: "20pt", margin: "0 0 4pt" }}>Prayer list</h1>
            <p style={{ fontSize: "10pt", margin: "0 0 16pt", color: "#444" }}>{new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</p>
            {printGroups.map(([category, list]) => (
              <section key={category} style={{ marginBottom: "14pt", breakInside: "avoid" }}>
                <h2 style={{ fontSize: "11pt", letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 6pt", borderBottom: "1px solid #999", paddingBottom: "2pt" }}>{category}</h2>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11pt" }}>
                  <tbody>
                    {list.map((p) => (
                      <tr key={p.id} style={{ verticalAlign: "top" }}>
                        <td style={{ width: "18pt", padding: "4pt 6pt 4pt 0" }}>
                          <span style={{ display: "inline-block", width: "11pt", height: "11pt", border: "1px solid #000", borderRadius: "2pt" }} />
                        </td>
                        <td style={{ padding: "4pt 8pt 4pt 0" }}>
                          <div style={{ fontWeight: 600 }}>{p.name}</div>
                          {p.notes && <div style={{ fontSize: "10pt", whiteSpace: "pre-wrap" }}>{p.notes}</div>}
                        </td>
                        <td style={{ padding: "4pt 0", fontSize: "9pt", color: "#555", whiteSpace: "nowrap", textAlign: "right" }}>Last prayed {timeAgo(p.last_prayed_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
        </div>
      )}

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
