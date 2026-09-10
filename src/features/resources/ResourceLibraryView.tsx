import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { open, confirm } from "@tauri-apps/plugin-dialog";
import { api } from "../../api/client";
import { useResources, useAddResource, useDeleteResource, useBulkImportResources } from "../../api/queries";
import type { Resource, ResourceKind, BulkImportOutcome } from "../../api/types";

const KIND_ICON: Record<ResourceKind, string> = {
  epub: "📘",
  pdf: "📕",
  mobi: "📙",
  video: "🎬",
  audio: "🎧",
};

const UNKNOWN_AUTHOR = "Unknown Author";

export function ResourceLibraryView() {
  const { data: resources } = useResources();
  const addResource = useAddResource();
  const deleteResource = useDeleteResource();
  const bulkImport = useBulkImportResources();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [busy, setBusy] = useState(false);
  const [importReport, setImportReport] = useState<BulkImportOutcome | null>(null);
  const [manageId, setManageId] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggleAuthor(author: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(author)) next.delete(author);
      else next.add(author);
      return next;
    });
  }

  const groups = useMemo(() => {
    const byAuthor = new Map<string, Resource[]>();
    for (const r of resources ?? []) {
      const key = r.author?.trim() || UNKNOWN_AUTHOR;
      if (!byAuthor.has(key)) byAuthor.set(key, []);
      byAuthor.get(key)!.push(r);
    }
    return [...byAuthor.entries()].sort(([a], [b]) => {
      if (a === UNKNOWN_AUTHOR) return 1;
      if (b === UNKNOWN_AUTHOR) return -1;
      return a.localeCompare(b);
    });
  }, [resources]);

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
    const selected = await open({
      multiple: false,
      filters: [{ name: "Resources", extensions: ["epub", "pdf", "mobi", "azw", "azw3", "mp4", "mkv", "webm", "mov", "mp3", "m4a", "wav", "ogg", "flac"] }],
    });
    if (!selected || Array.isArray(selected)) return;
    const fileName = selected.split(/[\\/]/).pop() ?? "Untitled";
    const title = fileName.replace(/\.[^.]+$/, "");
    setBusy(true);
    try {
      await addResource.mutateAsync({ sourcePath: selected, title });
    } finally {
      setBusy(false);
    }
  }

  async function handleImportFolder() {
    const folder = await open({ directory: true });
    if (!folder || Array.isArray(folder)) return;
    setBusy(true);
    try {
      setImportReport(await bulkImport.mutateAsync(folder));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Resources</h1>
        <div className="flex gap-2">
          <button
            disabled={busy}
            onClick={handleImportFolder}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Import Folder…
          </button>
          <button
            disabled={busy}
            onClick={handleAdd}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Add Resource…
          </button>
        </div>
      </div>
      <p className="mb-4 text-sm text-gray-500">
        Add EPUB, PDF, or MOBI books, or video/audio files. Attach them to specific passages or link them to each
        other from the resource page. Text-bearing formats are deep-searched below. "Import Folder…" recursively adds
        every recognized file under a folder at once -- author is taken from each file's immediate parent folder, so
        an <code>Author/Book.epub</code> layout works well.
      </p>

      {importReport && (
        <div className="mb-4 rounded border border-gray-200 p-3 text-sm dark:border-gray-800">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-medium">
              Imported {importReport.imported.length}
              {importReport.skipped_duplicate.length > 0 && `, skipped ${importReport.skipped_duplicate.length} already in the library`}
              {importReport.skipped_unrecognized.length > 0 && `, ${importReport.skipped_unrecognized.length} unrecognized file(s)`}
              {importReport.errors.length > 0 && `, ${importReport.errors.length} error(s)`}
            </span>
            <button onClick={() => setImportReport(null)} className="text-xs text-gray-400 hover:underline">
              Dismiss
            </button>
          </div>
          {importReport.errors.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs text-red-500">
              {importReport.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Deep search resource text…"
        className="mb-4 w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-950"
      />
      {isFetching && <p className="mb-2 text-xs text-gray-400">Searching…</p>}
      {debounced.trim().length > 1 && (
        <ul className="mb-6 space-y-1">
          {deepResults?.map((r) => (
            <li key={r.resource_id}>
              <button
                onClick={() => navigate(`/resources/${r.resource_id}`)}
                className="block w-full rounded border border-gray-200 p-2 text-left text-sm hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800"
              >
                <div className="font-medium">
                  {KIND_ICON[r.kind]} {r.title}
                </div>
                <div
                  className="text-xs text-gray-500"
                  dangerouslySetInnerHTML={{ __html: r.snippet.replace(/\[/g, "<b>").replace(/\]/g, "</b>") }}
                />
              </button>
            </li>
          ))}
          {deepResults?.length === 0 && <p className="text-sm text-gray-400">No matches.</p>}
        </ul>
      )}

      <div className="space-y-5">
        {groups.map(([author, list]) => {
          const isCollapsed = collapsed.has(author);
          return (
          <div key={author}>
            <button
              onClick={() => toggleAuthor(author)}
              className="mb-1.5 flex w-full items-center gap-1.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              aria-expanded={!isCollapsed}
            >
              <span className={`inline-block transition-transform ${isCollapsed ? "-rotate-90" : ""}`}>▾</span>
              {author}
              <span className="font-normal normal-case text-gray-300 dark:text-gray-600">({list.length})</span>
            </button>
            {!isCollapsed && (
            <ul className="space-y-2">
              {list.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between rounded border border-gray-200 px-3 py-2 dark:border-gray-800"
                >
                  <button onClick={() => navigate(`/resources/${r.id}`)} className="flex-1 text-left text-sm hover:underline">
                    {KIND_ICON[r.kind]} {r.title}
                    {!r.has_text && r.kind !== "video" && r.kind !== "audio" && (
                      <span className="ml-2 text-xs text-amber-500">(not indexed for search)</span>
                    )}
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => setManageId(manageId === r.id ? null : r.id)}
                      title="Manage"
                      aria-label="Manage resource"
                      className="rounded px-1.5 py-0.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      ⋮
                    </button>
                    {manageId === r.id && (
                      <div
                        className="absolute right-0 z-10 mt-1 w-32 rounded border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
                        onMouseLeave={() => setManageId(null)}
                      >
                        <button
                          onClick={async () => {
                            setManageId(null);
                            if (await confirm(`Remove ${r.title}?`)) deleteResource.mutate(r.id);
                          }}
                          className="block w-full rounded px-2 py-1 text-left text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            )}
          </div>
          );
        })}
        {resources?.length === 0 && <p className="text-gray-400">No resources added yet.</p>}
      </div>
    </div>
  );
}
