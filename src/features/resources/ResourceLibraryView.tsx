import { useEffect, useMemo, useState } from "react";
import { usePaneNavigate } from "../../workspace/PaneContext";
import { useQuery } from "@tanstack/react-query";
import { Book, ChevronDown, FileText, Film, FolderOpen, Headphones, HelpCircle, Library, MoreVertical, Plus, RefreshCw, Trash2, type LucideIcon } from "lucide-react";
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
} from "../../api/queries";
import { TagRow, TagFilterBar } from "../../components/TagRow";
import { Page } from "../../components/ui/Page";
import { Button, IconButton } from "../../components/ui/Button";
import { Popover, PopoverItem } from "../../components/ui/Popover";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";
import { confirmDelete } from "../../components/ui/confirm";
import { toast } from "../../components/ui/toast";
import { cardClass, cx, inputClass } from "../../components/ui/classes";
import type { Resource, ResourceKind, BulkImportOutcome } from "../../api/types";

const KIND_ICON: Record<ResourceKind, LucideIcon> = {
  epub: Book,
  pdf: FileText,
  mobi: Book,
  video: Film,
  audio: Headphones,
};

const UNKNOWN_AUTHOR = "Unknown author";

function KindIcon({ kind }: { kind: ResourceKind }) {
  const Icon = KIND_ICON[kind];
  return <Icon className="h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />;
}

export function ResourceLibraryView() {
  const { data: resources } = useResources();
  const addResource = useAddResource();
  const deleteResource = useDeleteResource();
  const reextractResource = useReextractResource();
  const bulkImport = useBulkImportResources();
  const navigate = usePaneNavigate();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [busy, setBusy] = useState(false);
  const [importReport, setImportReport] = useState<BulkImportOutcome | null>(null);
  // Tracks which author groups are *expanded* (empty set = everything
  // collapsed, the default) rather than which are collapsed -- so a
  // brand-new library, or one with many authors, opens as a scannable list
  // of names instead of every book's full entry at once.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [reextracting, setReextracting] = useState<number | null>(null);

  const { data: tagPairs } = useAllResourceTagsByResource();
  const { data: allTags } = useAllResourceTags();
  const addTag = useAddResourceTag();
  const removeTag = useRemoveResourceTag();
  const tagsById = useMemo(() => {
    const m = new Map<number, string[]>();
    for (const [id, tag] of tagPairs ?? []) m.set(id, [...(m.get(id) ?? []), tag]);
    return m;
  }, [tagPairs]);

  function toggleAuthor(author: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(author)) next.delete(author);
      else next.add(author);
      return next;
    });
  }

  const groups = useMemo(() => {
    const filtered = activeTag ? (resources ?? []).filter((r) => (tagsById.get(r.id) ?? []).includes(activeTag)) : resources ?? [];
    const byAuthor = new Map<string, Resource[]>();
    for (const r of filtered) {
      const key = r.author?.trim() || UNKNOWN_AUTHOR;
      if (!byAuthor.has(key)) byAuthor.set(key, []);
      byAuthor.get(key)!.push(r);
    }
    return [...byAuthor.entries()].sort(([a], [b]) => {
      if (a === UNKNOWN_AUTHOR) return 1;
      if (b === UNKNOWN_AUTHOR) return -1;
      return a.localeCompare(b);
    });
  }, [resources, activeTag, tagsById]);

  const allExpanded = groups.length > 0 && groups.every(([author]) => expanded.has(author));
  function toggleAllAuthors() {
    setExpanded(allExpanded ? new Set() : new Set(groups.map(([author]) => author)));
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
    // The title still comes from the file name, which is what `display_path`
    // is for: it is shown and read, never handed back to a command.
    const fileName = picked.display_path.split(/[\\/]/).pop() ?? "Untitled";
    const title = fileName.replace(/\.[^.]+$/, "");
    setBusy(true);
    try {
      await addResource.mutateAsync({ token: picked.token, title });
      toast.success(`Added “${title}”`);
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

  const hasAny = (resources?.length ?? 0) > 0;
  const searching = debounced.trim().length > 1;

  return (
    <Page
      title="Resources"
      lead={hasAny ? `${resources?.length} books and media files, grouped by author` : undefined}
      actions={
        <>
          <Popover
            width="w-80"
            trigger={({ toggle, open: isOpen }) => <IconButton icon={HelpCircle} label="About resources" active={isOpen} onClick={toggle} />}
          >
            <div className="space-y-2 p-1 text-sm text-ink-2">
              <p>Add EPUB, PDF, or MOBI books, or video and audio files. Text formats are indexed so you can search inside them.</p>
              <p>Open a resource to attach it to a passage. Linked resources then appear under that chapter's title while reading.</p>
              <p>
                “Import folder” adds every recognized file under a folder at once. The author is taken from each file's parent folder, so an{" "}
                <code className="rounded bg-surface-2 px-1">Author/Book.epub</code> layout works well.
              </p>
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
                  dangerouslySetInnerHTML={{ __html: r.snippet.replace(/\[/g, "<mark class='rounded bg-accent-soft px-0.5 text-accent'>").replace(/\]/g, "</mark>") }}
                />
              </button>
            </li>
          ))}
          {deepResults?.length === 0 && <EmptyState compact title="No matches inside your books" />}
        </ul>
      )}

      <TagFilterBar tags={allTags ?? []} activeTag={activeTag} onSelect={setActiveTag} label="Topics" />

      {groups.length > 1 && (
        <div className="mb-2 flex justify-end">
          <Button size="sm" variant="ghost" onClick={toggleAllAuthors}>
            {allExpanded ? "Collapse all" : "Expand all"}
          </Button>
        </div>
      )}

      <div className="space-y-4">
        {groups.map(([author, list]) => {
          const isCollapsed = !expanded.has(author);
          return (
            <section key={author}>
              <button
                type="button"
                onClick={() => toggleAuthor(author)}
                className="mb-1.5 flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left text-sm font-semibold text-ink-2 hover:bg-hover"
                aria-expanded={!isCollapsed}
              >
                <ChevronDown className={cx("h-4 w-4 text-ink-3 transition-transform", isCollapsed && "-rotate-90")} aria-hidden="true" />
                {author}
                <span className="font-normal text-ink-3">({list.length})</span>
              </button>
              {!isCollapsed && (
                <ul className="space-y-2 pl-1">
                  {list.map((r) => (
                    <li key={r.id} className={cardClass}>
                      <div className="flex items-center gap-2">
                        <KindIcon kind={r.kind} />
                        <button type="button" onClick={(e) => navigate(`/resources/${r.id}`, e)} className="min-w-0 flex-1 truncate text-left text-sm font-medium text-ink hover:text-accent hover:underline">
                          {r.title}
                        </button>
                        {!r.has_text && r.kind !== "video" && r.kind !== "audio" && (
                          r.bundled ? (
                            <span className="shrink-0 text-xs text-amber-700 dark:text-amber-400" title="No text could be extracted, so search can't look inside it">
                              not searchable
                            </span>
                          ) : (
                            // Text is read once, when a file is added, so a book
                            // that failed then would stay unsearchable for good
                            // without a way to ask again.
                            <button
                              type="button"
                              disabled={reextracting === r.id}
                              onClick={() => retryExtract(r.id, r.title)}
                              title="No text could be extracted, so search can't look inside it. Try reading it again."
                              className="shrink-0 rounded px-1 text-xs text-amber-700 hover:underline disabled:no-underline disabled:opacity-60 dark:text-amber-400"
                            >
                              {reextracting === r.id ? (
                                "reading…"
                              ) : (
                                <span className="inline-flex items-center gap-1">
                                  <RefreshCw className="h-3 w-3" aria-hidden="true" /> not searchable
                                </span>
                              )}
                            </button>
                          )
                        )}
                        {r.bundled ? (
                          <span
                            className="shrink-0 rounded-full border border-line px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wide text-ink-4"
                            title="Ships with the app. Read it, search it, tag it — it just can't be removed."
                          >
                            Shipped
                          </span>
                        ) : (
                          <Popover
                            width="w-44"
                            trigger={({ toggle, open: isOpen }) => <IconButton icon={MoreVertical} label="More" size="sm" active={isOpen} onClick={toggle} />}
                          >
                            {(close) => (
                              <PopoverItem
                                danger
                                onClick={async () => {
                                  close();
                                  if (await confirmDelete(`“${r.title}”`, "The file itself stays where it is; only the library entry, its links, and tags are removed.")) {
                                    deleteResource.mutate(r.id, { onSuccess: () => toast.info(`Removed “${r.title}”`) });
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4" aria-hidden="true" /> Remove from library
                              </PopoverItem>
                            )}
                          </Popover>
                        )}
                      </div>
                      <TagRow
                        tags={tagsById.get(r.id) ?? []}
                        onAdd={(tag) => addTag.mutate({ resourceId: r.id, tag })}
                        onRemove={(tag) => removeTag.mutate({ resourceId: r.id, tag })}
                        onFilter={setActiveTag}
                        hint="e.g. justification, sanctification, the Sabbath"
                      />
                    </li>
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
            description="Add EPUB, PDF, or MOBI books, or audio and video files. Books are indexed so you can search inside them, and any resource can be linked to the passage it speaks to."
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
        {hasAny && groups.length === 0 && <EmptyState compact title="No resources carry that topic tag" />}
      </div>
    </Page>
  );
}
