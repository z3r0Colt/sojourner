import { useEffect, useMemo, useState } from "react";
import { snippetHtml } from "../../lib/snippet";
import { usePaneNavigate } from "../../workspace/PaneContext";
import { useQuery } from "@tanstack/react-query";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Book, ChevronDown, FileText, Film, FolderOpen, Headphones, HelpCircle, Library, MoreVertical, Pencil, Play, Plus, RefreshCw, Trash2, Users, type LucideIcon } from "lucide-react";
import { api } from "../../api/client";
import {
  useResources,
  useAddResource,
  useDeleteResource,
  useReextractResource,
  useBulkImportResources,
  useAllResourceTags,
  useAllResourceTagsByResource,
  useAddResourceTag,
  useRemoveResourceTag,
  usePackStatus,
  useUpdateResource,
  useSetAuthorForResources,
} from "../../api/queries";
import { useUiStore, type ResourceGroupBy, type ResourceKindTab } from "../../state/uiStore";
import { PaneLink } from "../../workspace/PaneLink";
import { TagRow, TagFilterBar } from "../../components/TagRow";
import { Page } from "../../components/ui/Page";
import { Button, IconButton } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { Popover, PopoverItem } from "../../components/ui/Popover";
import { Tabs } from "../../components/ui/Tabs";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";
import { confirmDelete } from "../../components/ui/confirm";
import { toast } from "../../components/ui/toast";
import { cardClass, cx, inputClass } from "../../components/ui/classes";
import type { Resource, ResourceKind, BulkImportOutcome } from "../../api/types";
import { fileExtension, filterByKind, formatDuration, groupResources, kindSummary, kindTabOf, knownAuthors, type ResourceGroup } from "./resourceGrouping";

const KIND_ICON: Record<ResourceKind, LucideIcon> = {
  epub: Book,
  pdf: FileText,
  mobi: Book,
  video: Film,
  audio: Headphones,
};

function KindIcon({ kind }: { kind: ResourceKind }) {
  const Icon = KIND_ICON[kind];
  return <Icon className="h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />;
}

const GROUP_BY_OPTIONS: { value: ResourceGroupBy; label: string }[] = [
  { value: "author", label: "Author" },
  { value: "recent", label: "Recently added" },
  { value: "topic", label: "Topic" },
];

/** Lengths of audio and video files, read from the file's header when a
 * row first asks and kept for the session. */
const durations = new Map<string, number>();
function useMediaDuration(filePath: string, enabled: boolean): number | null {
  const [value, setValue] = useState<number | null>(durations.get(filePath) ?? null);
  useEffect(() => {
    if (!enabled || durations.has(filePath)) return;
    let cancelled = false;
    const el = document.createElement("audio");
    el.preload = "metadata";
    el.src = convertFileSrc(filePath);
    el.addEventListener("loadedmetadata", () => {
      if (cancelled || !Number.isFinite(el.duration)) return;
      durations.set(filePath, el.duration);
      setValue(el.duration);
    });
    el.addEventListener("error", () => {});
    return () => {
      cancelled = true;
      el.removeAttribute("src");
      el.load();
    };
  }, [filePath, enabled]);
  return value;
}

/** Title and author of one resource, edited in place. */
function EditDetailsModal({ resource, authors, onClose }: { resource: Resource; authors: string[]; onClose: () => void }) {
  const update = useUpdateResource();
  const [title, setTitle] = useState(resource.title);
  const [author, setAuthor] = useState(resource.author ?? "");
  const dirty = title !== resource.title || author !== (resource.author ?? "");
  const canSave = title.trim().length > 0 && dirty;
  const media = resource.kind === "audio" || resource.kind === "video";

  function save() {
    if (!canSave) return;
    update.mutate(
      { id: resource.id, title: title.trim(), author: author.trim() || null },
      {
        onSuccess: () => {
          toast.success("Details saved");
          onClose();
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
      },
    );
  }

  return (
    <Modal
      title="Edit details"
      onClose={onClose}
      dirty={dirty}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={!canSave}>
            Save
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="space-y-3"
      >
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-3">Title</span>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className={cx(inputClass, "w-full")} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-3">{media ? "Speaker" : "Author"}</span>
          <input value={author} onChange={(e) => setAuthor(e.target.value)} list="resource-authors" placeholder={media ? "Who is speaking" : "Who wrote it"} className={cx(inputClass, "w-full")} />
          <datalist id="resource-authors">
            {authors.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </label>
        <p className="text-xs text-ink-4">
          {resource.bundled ? "This book ships with the app; your edit is kept across upgrades." : "The file on disk is not renamed; only how the library lists it."}
        </p>
      </form>
    </Modal>
  );
}

/** One author for every resource that has none. */
function SetAuthorModal({ items, authors, onClose }: { items: Resource[]; authors: string[]; onClose: () => void }) {
  const setAuthor = useSetAuthorForResources();
  const [author, setAuthorText] = useState("");
  const canSave = author.trim().length > 0;
  function save() {
    if (!canSave) return;
    setAuthor.mutate(
      { ids: items.map((r) => r.id), author: author.trim() },
      {
        onSuccess: (n) => {
          toast.success(`Set the author on ${n} ${n === 1 ? "item" : "items"}`);
          onClose();
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
      },
    );
  }
  return (
    <Modal
      title={`Set the author for ${items.length} ${items.length === 1 ? "item" : "items"}`}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={!canSave}>
            Set author
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="space-y-3"
      >
        <input autoFocus value={author} onChange={(e) => setAuthorText(e.target.value)} list="resource-authors-all" placeholder="Author or speaker" className={cx(inputClass, "w-full")} aria-label="Author" />
        <datalist id="resource-authors-all">
          {authors.map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>
        <ul className="max-h-40 space-y-0.5 overflow-y-auto text-xs text-ink-3">
          {items.map((r) => (
            <li key={r.id} className="truncate">
              {r.title}
            </li>
          ))}
        </ul>
        <p className="text-xs text-ink-4">Every item listed gets this author. Edit any one of them afterwards to change it alone.</p>
      </form>
    </Modal>
  );
}

export function ResourceLibraryView() {
  const { data: resources } = useResources();
  const addResource = useAddResource();
  const deleteResource = useDeleteResource();
  const reextractResource = useReextractResource();
  const bulkImport = useBulkImportResources();
  const navigate = usePaneNavigate();
  const kindTab = useUiStore((s) => s.resourcesKindTab);
  const setKindTab = useUiStore((s) => s.setResourcesKindTab);
  const groupBy = useUiStore((s) => s.resourcesGroupBy);
  const setGroupBy = useUiStore((s) => s.setResourcesGroupBy);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [busy, setBusy] = useState(false);
  const [importReport, setImportReport] = useState<BulkImportOutcome | null>(null);
  // Tracks which groups are *expanded* (empty set = everything collapsed,
  // the default) rather than which are collapsed -- so a brand-new
  // library, or one with many authors, opens as a scannable list of names
  // instead of every book's full entry at once.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [reextracting, setReextracting] = useState<number | null>(null);
  const [editing, setEditing] = useState<Resource | null>(null);
  const [assigning, setAssigning] = useState<Resource[] | null>(null);

  const { data: packStatus } = usePackStatus();
  const { data: tagPairs } = useAllResourceTagsByResource();
  const { data: allTags } = useAllResourceTags();
  const addTag = useAddResourceTag();
  const removeTag = useRemoveResourceTag();
  const tagsById = useMemo(() => {
    const m = new Map<number, string[]>();
    for (const [id, tag] of tagPairs ?? []) m.set(id, [...(m.get(id) ?? []), tag]);
    return m;
  }, [tagPairs]);

  function toggleGroup(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const all = useMemo(() => resources ?? [], [resources]);
  const counts = useMemo(() => {
    const c = { all: all.length, books: 0, audio: 0, video: 0 };
    for (const r of all) c[kindTabOf(r.kind)] += 1;
    return c;
  }, [all]);
  const authors = useMemo(() => knownAuthors(all), [all]);

  const groups: ResourceGroup[] = useMemo(() => {
    const byKind = filterByKind(all, kindTab);
    const filtered = activeTag ? byKind.filter((r) => (tagsById.get(r.id) ?? []).includes(activeTag)) : byKind;
    return groupResources(filtered, groupBy, tagsById);
  }, [all, kindTab, activeTag, tagsById, groupBy]);

  const headed = groups.filter((g) => g.label);
  const allExpanded = headed.length > 0 && headed.every((g) => expanded.has(g.key));
  function toggleAllGroups() {
    setExpanded(allExpanded ? new Set() : new Set(headed.map((g) => g.key)));
  }

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const { data: deepResults, isFetching } = useQuery({
    queryKey: ["resourceDeepSearch", debounced],
    queryFn: () => api.searchResources(debounced, 100),
    enabled: debounced.trim().length > 1,
  });

  async function handleAdd() {
    const picked = await api.pickOpenPath("resource");
    if (!picked) return;
    // The title from the file name is the fallback; the file's own
    // metadata, read when it is added, wins when it says anything.
    const fileName = picked.display_path.split(/[\\/]/).pop() ?? "Untitled";
    const title = fileName.replace(/\.[^.]+$/, "");
    setBusy(true);
    try {
      const added = await addResource.mutateAsync({ token: picked.token, title });
      toast.success(`Added “${added.title}”${added.author ? ` by ${added.author}` : ""}`);
    } finally {
      setBusy(false);
    }
  }

  /** Ask for a resource's text again, and say plainly how it went. */
  async function retryExtract(id: number, title: string) {
    setReextracting(id);
    try {
      const updated = await reextractResource.mutateAsync(id);
      if (updated.has_text) toast.success(`“${title}” is searchable now`);
      else toast.info(`Still no text in “${title}” — it may be page images rather than words`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setReextracting(null);
    }
  }

  async function handleImportFolder() {
    const picked = await api.pickFolder();
    if (!picked) return;
    setBusy(true);
    try {
      setImportReport(await bulkImport.mutateAsync(picked.token));
    } finally {
      setBusy(false);
    }
  }

  const hasAny = all.length > 0;
  const searching = debounced.trim().length > 1;
  const packInstalled = packStatus?.installed ?? true;
  // Books this reader has rows for -- tags, notes, bookmarks and all -- whose
  // files are in a pack that is not installed. On an upgrade from a build that
  // bundled the library this is every one of them, which is exactly the case
  // that must not look like several hundred broken books.
  const awaitingPack = packInstalled ? 0 : all.filter((r) => r.bundled).length;
  const personLabel = kindTab === "audio" || kindTab === "video" ? "speaker" : "author";

  return (
    <Page
      title="Resources"
      lead={hasAny ? `${counts.books} ${counts.books === 1 ? "book" : "books"}, ${counts.audio} audio, ${counts.video} video` : undefined}
      actions={
        <>
          <Popover
            width="w-80"
            trigger={({ toggle, open: isOpen }) => <IconButton icon={HelpCircle} label="About resources" active={isOpen} onClick={toggle} />}
          >
            <div className="space-y-2 p-1 text-sm text-ink-2">
              <p>Add EPUB, PDF, or MOBI books, or video and audio files. Text formats are indexed so you can search inside them.</p>
              <p>The title and author are read from the file when it is added, and can be edited from the ⋮ menu on any item.</p>
              <p>
                “Import folder” adds every recognized file under a folder at once. The author is taken from each file's parent folder, so an{" "}
                <code className="rounded bg-surface-2 px-1">Author/Book.epub</code> layout works well.
              </p>
              <p>Open a resource to attach it to a passage. Linked resources then appear under that chapter's title while reading.</p>
            </div>
          </Popover>
          <Button icon={FolderOpen} disabled={busy} onClick={handleImportFolder}>
            Import folder
          </Button>
          <Button variant="primary" icon={Plus} disabled={busy} onClick={handleAdd}>
            Add resource
          </Button>
        </>
      }
    >
      {importReport && (
        <div className="mb-4 rounded-lg border border-line bg-surface-2 p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-ink">
              Imported {importReport.imported.length}
              {importReport.skipped_duplicate.length > 0 && `, skipped ${importReport.skipped_duplicate.length} already in the library`}
              {importReport.skipped_unrecognized.length > 0 && `, ${importReport.skipped_unrecognized.length} unrecognized file(s)`}
              {importReport.errors.length > 0 && `, ${importReport.errors.length} error(s)`}
            </span>
            <Button size="sm" variant="ghost" onClick={() => setImportReport(null)}>
              Dismiss
            </Button>
          </div>
          {importReport.errors.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs text-danger">
              {importReport.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {awaitingPack > 0 && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <p className="text-ink">
            {awaitingPack} {awaitingPack === 1 ? "book is" : "books are"} part of the book library, which isn't installed on this
            computer. They can't be opened or searched until it is — everything you've written about them is kept meanwhile.
          </p>
          <p className="mt-1 text-ink-3">
            The library is a separate download.{" "}
            <PaneLink to="/settings?section=books" className="text-accent hover:underline">
              Install it from Settings → Book library
            </PaneLink>
            .
          </p>
        </div>
      )}

      {hasAny && (
        <Tabs<ResourceKindTab>
          className="mb-3"
          items={[
            { key: "all", label: "All", count: counts.all },
            { key: "books", label: "Books", icon: Book, count: counts.books },
            { key: "audio", label: "Audio", icon: Headphones, count: counts.audio },
            { key: "video", label: "Video", icon: Film, count: counts.video },
          ]}
          value={kindTab}
          onChange={setKindTab}
        />
      )}

      {hasAny && (
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search inside your books…" className={cx(inputClass, "mb-4 w-full")} />
      )}
      {isFetching && <LoadingState className="mb-2 py-0" label="Searching…" />}
      {searching && (
        <ul className="mb-6 space-y-1">
          {deepResults?.map((r) => (
            <li key={r.resource_id}>
              <button type="button" onClick={(e) => navigate(`/resources/${r.resource_id}`, e)} className={cx(cardClass, "block w-full text-left hover:bg-hover/40")}>
                <div className="flex items-center gap-2 font-medium text-ink">
                  <KindIcon kind={r.kind} />
                  {r.title}
                </div>
                <div
                  className="mt-0.5 text-sm text-ink-2"
                  dangerouslySetInnerHTML={{ __html: snippetHtml(r.snippet) }}
                />
              </button>
            </li>
          ))}
          {deepResults?.length === 0 && <EmptyState compact title="No matches inside your books" />}
        </ul>
      )}

      <TagFilterBar tags={allTags ?? []} activeTag={activeTag} onSelect={setActiveTag} label="Topics" />

      {hasAny && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-ink-3">Group by</span>
          <div role="radiogroup" aria-label="Group by" className="flex overflow-hidden rounded-md border border-line">
            {GROUP_BY_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={groupBy === o.value}
                onClick={() => setGroupBy(o.value)}
                className={cx("px-2.5 py-1 text-xs font-medium", groupBy === o.value ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-hover hover:text-ink")}
              >
                {o.value === "author" && personLabel === "speaker" ? "Speaker" : o.label}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          {headed.length > 1 && (
            <Button size="sm" variant="ghost" onClick={toggleAllGroups}>
              {allExpanded ? "Collapse all" : "Expand all"}
            </Button>
          )}
        </div>
      )}

      <div className="space-y-4">
        {groups.map((group) => {
          const isCollapsed = group.label ? !expanded.has(group.key) : false;
          return (
            <section key={group.key}>
              {group.label && (
                <div className="mb-1.5 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                    className={cx("flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-1 text-left text-sm font-semibold hover:bg-hover", group.fallback ? "text-ink-3" : "text-ink-2")}
                    aria-expanded={!isCollapsed}
                  >
                    <ChevronDown className={cx("h-4 w-4 shrink-0 text-ink-3 transition-transform", isCollapsed && "-rotate-90")} aria-hidden="true" />
                    <span className="truncate">{group.label}</span>
                    <span className="shrink-0 font-normal text-ink-3">({kindTab === "all" && groupBy === "author" ? kindSummary(group.items) : group.items.length})</span>
                  </button>
                  {group.fallback && groupBy === "author" && (
                    <Button size="sm" variant="ghost" icon={Users} onClick={() => setAssigning(group.items)} title="Give every item in this group one author">
                      Set {personLabel} for all…
                    </Button>
                  )}
                </div>
              )}
              {group.fallback && groupBy === "author" && !isCollapsed && (
                <p className="mb-2 pl-1 text-xs text-ink-4">Nothing in the file said who wrote it. Use “Edit details” on an item, or set one {personLabel} for the whole group.</p>
              )}
              {!isCollapsed && (
                <ul className="space-y-2 pl-1">
                  {group.items.map((r) => (
                    <ResourceRow
                      key={`${group.key}-${r.id}`}
                      r={r}
                      packInstalled={packInstalled}
                      reextracting={reextracting === r.id}
                      tags={tagsById.get(r.id) ?? []}
                      showAuthor={groupBy !== "author"}
                      onOpen={(e) => navigate(`/resources/${r.id}`, e)}
                      onEdit={() => setEditing(r)}
                      onRetry={() => retryExtract(r.id, r.title)}
                      onRemove={async () => {
                        if (await confirmDelete(`“${r.title}”`, "The file itself stays where it is; only the library entry, its links, and tags are removed.")) {
                          deleteResource.mutate(r.id, { onSuccess: () => toast.info(`Removed “${r.title}”`) });
                        }
                      }}
                      onAddTag={(tag) => addTag.mutate({ resourceId: r.id, tag })}
                      onRemoveTag={(tag) => removeTag.mutate({ resourceId: r.id, tag })}
                      onFilterTag={setActiveTag}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
        {!hasAny && (
          <EmptyState
            icon={Library}
            title="Your library is empty"
            description={
              <>
                Add EPUB, PDF, or MOBI books, or audio and video files. Books are indexed so you can search inside them, and any
                resource can be linked to the passage it speaks to.
                {!packStatus?.installed && (
                  <>
                    {" "}
                    Several hundred Puritan and Reformed works are available as a separate download —{" "}
                    <PaneLink to="/settings?section=books" className="text-accent hover:underline">
                      install the book library
                    </PaneLink>
                    .
                  </>
                )}
              </>
            }
            action={
              <div className="flex gap-2">
                <Button icon={FolderOpen} onClick={handleImportFolder}>
                  Import a folder
                </Button>
                <Button variant="primary" icon={Plus} onClick={handleAdd}>
                  Add a file
                </Button>
              </div>
            }
          />
        )}
        {hasAny && groups.length === 0 && <EmptyState compact title={activeTag ? "No resources carry that topic tag" : `Nothing under ${kindTab} yet`} />}
      </div>

      {editing && <EditDetailsModal resource={editing} authors={authors} onClose={() => setEditing(null)} />}
      {assigning && <SetAuthorModal items={assigning} authors={authors} onClose={() => setAssigning(null)} />}
    </Page>
  );
}

function ResourceRow({
  r,
  packInstalled,
  reextracting,
  tags,
  showAuthor,
  onOpen,
  onEdit,
  onRetry,
  onRemove,
  onAddTag,
  onRemoveTag,
  onFilterTag,
}: {
  r: Resource;
  packInstalled: boolean;
  reextracting: boolean;
  tags: string[];
  showAuthor: boolean;
  onOpen: (e: React.MouseEvent) => void;
  onEdit: () => void;
  onRetry: () => void;
  onRemove: () => void;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onFilterTag: (tag: string) => void;
}) {
  const media = r.kind === "audio" || r.kind === "video";
  const duration = useMediaDuration(r.file_path, media);
  return (
    <li className={cardClass}>
      <div className="flex items-center gap-2">
        <KindIcon kind={r.kind} />
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 truncate text-left text-sm font-medium text-ink hover:text-accent hover:underline">
          {r.title}
          {showAuthor && r.author && <span className="ml-1.5 font-normal text-ink-3">· {r.author}</span>}
        </button>
        {media && (
          <span className="shrink-0 text-xs tabular-nums text-ink-3" title="Length and file type">
            {duration != null ? `${formatDuration(duration)} · ` : ""}
            {fileExtension(r.file_path)}
          </span>
        )}
        {media && <IconButton icon={Play} label={`Play ${r.title}`} size="sm" onClick={(e) => onOpen(e)} />}
        {!r.has_text &&
          !media &&
          (r.bundled ? (
            <span className="shrink-0 text-xs text-amber-700 dark:text-amber-400" title="No text could be extracted, so search can't look inside it">
              not searchable
            </span>
          ) : (
            // Text is read once, when a file is added, so a book that
            // failed then would stay unsearchable for good without a way
            // to ask again.
            <button
              type="button"
              disabled={reextracting}
              onClick={onRetry}
              title="No text could be extracted, so search can't look inside it. Try reading it again."
              className="shrink-0 rounded px-1 text-xs text-amber-700 hover:underline disabled:no-underline disabled:opacity-60 dark:text-amber-400"
            >
              {reextracting ? (
                "reading…"
              ) : (
                <span className="inline-flex items-center gap-1">
                  <RefreshCw className="h-3 w-3" aria-hidden="true" /> not searchable
                </span>
              )}
            </button>
          ))}
        {r.bundled &&
          (packInstalled ? (
            <span
              className="shrink-0 rounded-full border border-line px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wide text-ink-4"
              title="Part of the book library. Read it, search it, tag it — it just can't be removed on its own."
            >
              Library
            </span>
          ) : (
            // The book itself is not on this machine, but everything the
            // reader attached to it is.
            <span
              className="shrink-0 rounded-full border border-amber-500/40 px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wide text-amber-700 dark:text-amber-400"
              title="This book is in the book library pack, which isn't installed. Your notes, tags and bookmarks on it are kept."
            >
              Not installed
            </span>
          ))}
        <Popover
          width="w-48"
          trigger={({ toggle, open: isOpen }) => <IconButton icon={MoreVertical} label="More" size="sm" active={isOpen} onClick={toggle} />}
        >
          {(close) => (
            <>
              <PopoverItem
                onClick={() => {
                  close();
                  onEdit();
                }}
              >
                <Pencil className="h-4 w-4" aria-hidden="true" /> Edit details…
              </PopoverItem>
              {!r.bundled && (
                <PopoverItem
                  danger
                  onClick={() => {
                    close();
                    void onRemove();
                  }}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" /> Remove from library
                </PopoverItem>
              )}
            </>
          )}
        </Popover>
      </div>
      <TagRow tags={tags} onAdd={onAddTag} onRemove={onRemoveTag} onFilter={onFilterTag} hint="e.g. justification, sanctification, the Sabbath" />
    </li>
  );
}
