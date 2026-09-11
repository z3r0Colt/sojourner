import { RotateCcw, Trash2 } from "lucide-react";
import { useBooks, usePurgeTrashItem, useRestoreTrashItem, useTrash } from "../../../api/queries";
import { Button } from "../../../components/ui/Button";
import { EmptyState, LoadingState } from "../../../components/ui/EmptyState";
import { confirmDialog } from "../../../components/ui/confirm";
import { toast } from "../../../components/ui/toast";
import { cx } from "../../../components/ui/classes";
import { NoteBody } from "../../notes/NoteBody";
import { formatChapterRef, formatRef, toPassageRef } from "../../../lib/passage";
import type { TrashKind } from "../../../api/types";

export const TRASH_RETENTION_DAYS = 30;

/** "today", "yesterday", "3 days ago", plus how long the item has left. */
function deletedAgo(iso: string): { ago: string; daysLeft: number } {
  const elapsed = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
  const ago = elapsed === 0 ? "today" : elapsed === 1 ? "yesterday" : `${elapsed} days ago`;
  return { ago, daysLeft: Math.max(0, TRASH_RETENTION_DAYS - elapsed) };
}

function formatEntryDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

interface TrashRow {
  kind: TrashKind;
  id: number;
  title: string;
  deletedAt: string;
  body: React.ReactNode;
}

/** Settings → Data & backups → Trash: everything soft-deleted, newest
 * first, with Restore and Delete permanently. Items purge themselves after
 * thirty days (the startup sweep); the footer says so. */
export function TrashSection() {
  const { data: trash, isLoading } = useTrash();
  const { data: books } = useBooks();
  const restore = useRestoreTrashItem();
  const purge = usePurgeTrashItem();

  const rows: TrashRow[] = [
    ...(trash?.notes ?? []).map<TrashRow>((n) => ({
      kind: "note",
      id: n.id,
      title: `Note on ${formatRef(books, toPassageRef(n.book_id, n.chapter, n.verse_start, n.verse_end))}`,
      deletedAt: n.deleted_at ?? n.updated_at,
      body: <NoteBody body={n.body} className="block text-sm text-ink-2" />,
    })),
    ...(trash?.chapter_notes ?? []).map<TrashRow>((n) => ({
      kind: "chapter_note",
      id: n.id,
      title: `Chapter note on ${formatChapterRef(books, n.book_id, n.chapter)}`,
      deletedAt: n.deleted_at ?? n.updated_at,
      body: <NoteBody body={n.body} className="block text-sm text-ink-2" />,
    })),
    ...(trash?.prayer_entries ?? []).map<TrashRow>((e) => {
      const text = e.mode === "free" ? e.free_text : [e.adoration, e.confession, e.thanksgiving, e.supplication].filter(Boolean).join(" · ");
      return {
        kind: "prayer_entry",
        id: e.id,
        title: `Prayer entry from ${formatEntryDate(e.entry_date)}`,
        deletedAt: e.deleted_at ?? e.updated_at,
        body: text ? <p className="whitespace-pre-wrap text-sm text-ink-2">{text}</p> : null,
      };
    }),
  ].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));

  const label: Record<TrashKind, string> = { note: "Note", chapter_note: "Chapter note", prayer_entry: "Prayer entry" };

  function handleRestore(row: TrashRow) {
    restore.mutate({ kind: row.kind, id: row.id }, { onSuccess: () => toast.success(`${label[row.kind]} restored`) });
  }

  async function handlePurge(row: TrashRow) {
    const ok = await confirmDialog({
      title: `Delete this ${label[row.kind].toLowerCase()} permanently?`,
      message: `${row.title} is removed for good. This can't be undone.`,
      confirmLabel: "Delete permanently",
      danger: true,
    });
    if (!ok) return;
    purge.mutate({ kind: row.kind, id: row.id }, { onSuccess: () => toast.info(`${label[row.kind]} deleted permanently`) });
  }

  return (
    <section aria-labelledby="trash-heading">
      <h3 id="trash-heading" className="mb-2 mt-8 text-xs font-semibold uppercase tracking-wide text-ink-3">
        Trash
      </h3>
      {isLoading && <LoadingState className="py-2" />}
      {!isLoading && rows.length === 0 && (
        <EmptyState compact icon={Trash2} title="The Trash is empty" description="Deleted notes, chapter notes, and prayer entries wait here for thirty days." />
      )}
      {rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((row) => {
            const { ago, daysLeft } = deletedAgo(row.deletedAt);
            return (
              <li key={`${row.kind}-${row.id}`} className="rounded-lg border border-line bg-surface p-3">
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className="text-sm font-medium text-ink">{row.title}</span>
                  <span className={cx("text-xs", daysLeft <= 3 ? "text-danger" : "text-ink-3")}>
                    Deleted {ago} · {daysLeft === 0 ? "purges at next launch" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}
                  </span>
                </div>
                {row.body && <div className="max-h-24 overflow-hidden">{row.body}</div>}
                <div className="mt-2 flex justify-end gap-1">
                  <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => handleRestore(row)} disabled={restore.isPending}>
                    Restore
                  </Button>
                  <Button size="sm" variant="danger-ghost" icon={Trash2} onClick={() => handlePurge(row)} disabled={purge.isPending}>
                    Delete permanently
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-xs text-ink-3">Items in the Trash are deleted permanently after {TRASH_RETENTION_DAYS} days. Restore brings one back exactly as it was, tags and all.</p>
    </section>
  );
}

/** A quiet "Trash (n)" link for the Notes and Prayer pages; renders
 * nothing while the relevant part of the Trash is empty. */
export function TrashLink({ kinds, onOpen }: { kinds: TrashKind[]; onOpen: (e: React.MouseEvent) => void }) {
  const { data: trash } = useTrash();
  const count =
    (kinds.includes("note") ? (trash?.notes.length ?? 0) : 0) +
    (kinds.includes("chapter_note") ? (trash?.chapter_notes.length ?? 0) : 0) +
    (kinds.includes("prayer_entry") ? (trash?.prayer_entries.length ?? 0) : 0);
  if (count === 0) return null;
  return (
    <Button size="sm" variant="ghost" icon={Trash2} onClick={onOpen} title={`${count} deleted item${count === 1 ? "" : "s"} waiting in the Trash (Settings → Data & backups)`}>
      Trash ({count})
    </Button>
  );
}
