import { useState } from "react";
import { Plus, Tag, X } from "lucide-react";
import { cx } from "./ui/classes";

/** Doctrine/topic/use tags for a single item (a note, prayer entry, or
 * resource): shown as pills, each removable, with a small "add tag" button
 * that turns into an input on demand -- so a long list isn't dotted with
 * empty inputs. Clicking a pill invokes `onFilter` so the same click can
 * drive a list-wide tag filter. `hint` is shown as the input's tooltip. */
export function TagRow({
  tags,
  onAdd,
  onRemove,
  onFilter,
  hint,
}: {
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
  onFilter: (tag: string) => void;
  hint?: string;
}) {
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);

  function commit() {
    const t = draft.trim();
    if (t) onAdd(t);
    setDraft("");
    setAdding(false);
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      {tags.map((t) => (
        <span key={t} className="inline-flex items-center gap-0.5 rounded-full border border-line bg-surface-2 pl-2 text-xs text-ink-2">
          <button type="button" onClick={() => onFilter(t)} className="py-0.5 hover:text-accent" title={`Show everything tagged ${t}`}>
            #{t}
          </button>
          <button
            type="button"
            onClick={() => onRemove(t)}
            aria-label={`Remove tag ${t}`}
            className="rounded-r-full px-1.5 py-0.5 text-ink-4 hover:bg-hover hover:text-ink"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </span>
      ))}
      {adding ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft("");
              setAdding(false);
            }
          }}
          placeholder="tag name"
          title={hint}
          aria-label="New tag"
          className="h-6 w-36 rounded-full border border-accent bg-surface px-2 text-xs text-ink placeholder:text-ink-4"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          title={hint ? `Add a tag (${hint})` : "Add a tag"}
          className="inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs text-ink-4 hover:bg-hover hover:text-ink-2"
        >
          {tags.length === 0 ? <Tag className="h-3 w-3" aria-hidden="true" /> : <Plus className="h-3 w-3" aria-hidden="true" />}
          {tags.length === 0 ? "Add tag" : ""}
        </button>
      )}
    </div>
  );
}

/** Tag-pill filter bar: click a tag to filter a list to it, click again (or
 * Clear) to unfilter. Used above a list, distinct from the per-item TagRow
 * above (which edits one item's tags) -- this one only ever reads. */
export function TagFilterBar({
  tags,
  activeTag,
  onSelect,
  label = "Tags",
}: {
  tags: string[];
  activeTag: string | null;
  onSelect: (tag: string | null) => void;
  label?: string;
}) {
  if (tags.length === 0) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5 text-xs">
      <span className="mr-1 text-ink-3">{label}</span>
      {tags.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onSelect(activeTag === t ? null : t)}
          aria-pressed={activeTag === t}
          className={cx(
            "rounded-full border px-2.5 py-0.5",
            activeTag === t ? "border-accent bg-accent text-white" : "border-line bg-surface-2 text-ink-2 hover:bg-hover",
          )}
        >
          #{t}
        </button>
      ))}
      {activeTag && (
        <button type="button" onClick={() => onSelect(null)} className="text-ink-3 hover:underline">
          Clear
        </button>
      )}
    </div>
  );
}
