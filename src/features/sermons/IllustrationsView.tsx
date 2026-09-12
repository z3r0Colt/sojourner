import { useState } from "react";
import { ExternalLink, Lightbulb, Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  useCreateIllustration,
  useDeleteIllustration,
  useIllustrationTags,
  useIllustrationUses,
  useIllustrations,
  useRestoreIllustration,
  useUpdateIllustration,
} from "../../api/queries";
import { Button, IconButton } from "../../components/ui/Button";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";
import { Modal } from "../../components/ui/Modal";
import { Page } from "../../components/ui/Page";
import { confirmDelete } from "../../components/ui/confirm";
import { toast } from "../../components/ui/toast";
import { cx, inputSmClass, selectSmClass } from "../../components/ui/classes";
import { RichTextEditor } from "../notes/RichTextEditor";
import { NoteBody } from "../notes/NoteBody";
import { usePane } from "../../workspace/PaneContext";
import { canOpenSource, openSourceRef } from "./sourceIdentity";
import { formatPreachDate } from "./sermonFormat";
import type { Illustration, IllustrationKind } from "../../api/types";

/**
 * The illustrations library (SB3.1): stories and quotations kept apart from
 * any one sermon, because a good illustration outlives the sermon it was
 * first used in -- and because the preacher needs to know where it has
 * already been told.
 */
export function IllustrationsView() {
  const { id: paneId } = usePane();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<IllustrationKind | "">("");
  const [tag, setTag] = useState("");
  const [sort, setSort] = useState<"newest" | "most_used">("newest");
  const [editing, setEditing] = useState<{ illustration: Illustration | null } | null>(null);

  const { data: illustrations, isLoading } = useIllustrations({
    query: query.trim() || null,
    kind: kind || null,
    tag: tag || null,
    sort,
  });
  const { data: tags } = useIllustrationTags();
  const { data: uses } = useIllustrationUses();
  const remove = useDeleteIllustration();
  const restore = useRestoreIllustration();

  const filtered = illustrations ?? [];
  const empty = !isLoading && filtered.length === 0;
  const searching = query.trim().length > 0 || kind !== "" || tag !== "";

  async function handleDelete(illustration: Illustration) {
    if (!(await confirmDelete(`“${illustration.title}”`, "It goes to the Trash, where it can be restored for thirty days."))) return;
    remove.mutate(illustration.id, {
      onSuccess: () =>
        toast.info("Illustration moved to Trash", {
          label: "Undo",
          onClick: () => restore.mutate(illustration.id, { onSuccess: () => toast.success("Illustration restored") }),
        }),
    });
  }

  return (
    <Page
      title="Illustrations"
      lead="Stories and quotations worth keeping, with where each came from and where it has been used."
      actions={
        <Button variant="primary" icon={Plus} onClick={() => setEditing({ illustration: null })}>
          New illustration
        </Button>
      }
      wide
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-4" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles, text, and sources…"
            aria-label="Search illustrations"
            className={cx(inputSmClass, "w-full pl-7")}
          />
        </div>
        <select value={kind} onChange={(e) => setKind(e.target.value as IllustrationKind | "")} aria-label="Kind" className={selectSmClass}>
          <option value="">Every kind</option>
          <option value="illustration">Illustrations</option>
          <option value="quote">Quotations</option>
        </select>
        <select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Tag" className={selectSmClass}>
          <option value="">Every tag</option>
          {tags?.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as "newest" | "most_used")} aria-label="Sort" className={selectSmClass}>
          <option value="newest">Newest</option>
          <option value="most_used">Most used</option>
        </select>
      </div>

      {isLoading && <LoadingState />}
      {empty && (
        <EmptyState
          icon={Lightbulb}
          title={searching ? "Nothing matches" : "No illustrations yet"}
          description={
            searching
              ? "Try fewer words, or clear the filters."
              : "Select anything you are reading -- a paragraph of a book, a confession, a dictionary entry -- and choose “Save as illustration”. It keeps the source, so the citation writes itself when you use it."
          }
          action={
            searching ? undefined : (
              <Button variant="primary" icon={Plus} onClick={() => setEditing({ illustration: null })}>
                New illustration
              </Button>
            )
          }
        />
      )}

      <ul className="space-y-2">
        {filtered.map((illustration) => {
          const used = (uses ?? []).filter((u) => u.illustration_id === illustration.id);
          return (
            <li key={illustration.id} className="rounded-lg border border-line bg-surface p-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-sm font-medium text-ink">{illustration.title}</span>
                <span className="text-xs uppercase tracking-wide text-ink-4">
                  {illustration.kind === "quote" ? "Quotation" : "Illustration"}
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-0.5">
                  {canOpenSource(illustration.source_ref) && (
                    <IconButton
                      icon={ExternalLink}
                      label={`Open ${illustration.source_label ?? "the source"}`}
                      size="sm"
                      onClick={(e) => openSourceRef("resource", illustration.source_ref, e, paneId)}
                    />
                  )}
                  <IconButton icon={Pencil} label={`Edit “${illustration.title}”`} size="sm" onClick={() => setEditing({ illustration })} />
                  <IconButton
                    icon={Trash2}
                    label={`Delete “${illustration.title}”`}
                    size="sm"
                    className="text-danger hover:bg-danger-soft hover:text-danger"
                    onClick={() => handleDelete(illustration)}
                  />
                </span>
              </div>
              <NoteBody body={illustration.body} className="mt-1 line-clamp-3 block text-sm text-ink-2" />
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
                {illustration.source_label && <span>{illustration.source_label}</span>}
                {illustration.tags.map((t) => (
                  <button key={t} type="button" onClick={() => setTag(t)} className="rounded-full bg-surface-2 px-2 py-0.5 text-ink-2 hover:text-ink">
                    {t}
                  </button>
                ))}
                <span className="ml-auto">
                  {used.length === 0
                    ? "Not used yet"
                    : `Used in ${used.length} ${used.length === 1 ? "sermon" : "sermons"}${
                        used[0]?.preach_date ? ` · last ${formatPreachDate(used[0].preach_date, { month: "short", year: "numeric" })}` : ""
                      }`}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {editing && <IllustrationModal illustration={editing.illustration} onClose={() => setEditing(null)} />}
    </Page>
  );
}

/** New and Edit, in the flat note editor -- an illustration is prose, not a
 * document. */
export function IllustrationModal({
  illustration,
  initial,
  onSaved,
  onClose,
}: {
  illustration: Illustration | null;
  /** What "Save as illustration" has already filled in (SB3.2). */
  initial?: { title?: string; body?: string; sourceLabel?: string | null; sourceRef?: string | null; kind?: IllustrationKind };
  onSaved?: (illustration: Illustration) => void;
  onClose: () => void;
}) {
  const create = useCreateIllustration();
  const update = useUpdateIllustration();
  const [title, setTitle] = useState(illustration?.title ?? initial?.title ?? "");
  const [body, setBody] = useState(illustration?.body ?? initial?.body ?? "");
  const [kind, setKind] = useState<IllustrationKind>(illustration?.kind ?? initial?.kind ?? "illustration");
  const [sourceLabel, setSourceLabel] = useState(illustration?.source_label ?? initial?.sourceLabel ?? "");
  const [tagsText, setTagsText] = useState((illustration?.tags ?? []).join(", "));
  const sourceRef = illustration?.source_ref ?? initial?.sourceRef ?? null;
  const isNew = illustration == null;
  const valid = title.trim().length > 0;

  function save() {
    const input = {
      title: title.trim(),
      body,
      kind,
      source_label: sourceLabel.trim() || null,
      source_ref: sourceRef,
      tags: tagsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    };
    const done = (saved: Illustration) => {
      toast.success(isNew ? "Illustration saved" : "Illustration updated");
      onSaved?.(saved);
      onClose();
    };
    if (isNew) create.mutate(input, { onSuccess: done });
    else update.mutate({ illustrationId: illustration.id, input }, { onSuccess: done });
  }

  return (
    <Modal
      title={isNew ? "New illustration" : `Edit “${illustration.title}”`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!valid || create.isPending || update.isPending} onClick={save}>
            {isNew ? "Save illustration" : "Save"}
          </Button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-xs font-medium text-ink-3">Title</span>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="The lighthouse keeper"
            className={cx(inputSmClass, "w-full")}
          />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-ink-3">Kind</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as IllustrationKind)} className={selectSmClass}>
            <option value="illustration">Illustration</option>
            <option value="quote">Quotation</option>
          </select>
        </label>
      </div>
      <span className="mb-1 block text-xs font-medium text-ink-3">The story, or the words</span>
      <RichTextEditor content={body} onChange={setBody} offerTemplates={false} placeholder="What happened, or what was said…" />
      <label className="mt-3 block">
        <span className="mb-1 block text-xs font-medium text-ink-3">Source</span>
        <input
          value={sourceLabel}
          onChange={(e) => setSourceLabel(e.target.value)}
          placeholder="Spurgeon, Lectures to My Students"
          className={cx(inputSmClass, "w-full")}
        />
      </label>
      <label className="mt-3 block">
        <span className="mb-1 block text-xs font-medium text-ink-3">Tags, separated by commas</span>
        <input value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="providence, courage" className={cx(inputSmClass, "w-full")} />
      </label>
    </Modal>
  );
}
