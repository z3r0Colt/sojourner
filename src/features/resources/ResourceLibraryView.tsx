import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { open, confirm } from "@tauri-apps/plugin-dialog";
import { api } from "../../api/client";
import { useResources, useAddResource, useDeleteResource } from "../../api/queries";
import type { ResourceKind } from "../../api/types";

const KIND_ICON: Record<ResourceKind, string> = {
  epub: "📘",
  pdf: "📕",
  mobi: "📙",
  video: "🎬",
  audio: "🎧",
};

export function ResourceLibraryView() {
  const { data: resources } = useResources();
  const addResource = useAddResource();
  const deleteResource = useDeleteResource();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [busy, setBusy] = useState(false);

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

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Resources</h1>
        <button
          disabled={busy}
          onClick={handleAdd}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Add Resource…
        </button>
      </div>
      <p className="mb-4 text-sm text-gray-500">
        Add EPUB, PDF, or MOBI books, or video/audio files. Attach them to specific passages or link them to each
        other from the resource page. Text-bearing formats are deep-searched below.
      </p>

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

      <ul className="space-y-2">
        {resources?.map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between rounded border border-gray-200 px-3 py-2 dark:border-gray-800"
          >
            <button onClick={() => navigate(`/resources/${r.id}`)} className="flex-1 text-left text-sm hover:underline">
              {KIND_ICON[r.kind]} {r.title}
              {r.author && <span className="ml-2 text-gray-400">— {r.author}</span>}
              {!r.has_text && r.kind !== "video" && r.kind !== "audio" && (
                <span className="ml-2 text-xs text-amber-500">(not indexed for search)</span>
              )}
            </button>
            <button
              onClick={async () => {
                if (await confirm(`Remove ${r.title}?`)) deleteResource.mutate(r.id);
              }}
              className="text-xs text-red-500 hover:underline"
            >
              Remove
            </button>
          </li>
        ))}
        {resources?.length === 0 && <p className="text-gray-400">No resources added yet.</p>}
      </ul>
    </div>
  );
}
