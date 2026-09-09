import { useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  useResource,
  useResources,
  useBooks,
  useResourcePassageLinksForResource,
  useResourceText,
} from "../../api/queries";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useNavigationStore } from "../../state/navigationStore";
import { EpubReader } from "./EpubReader";
import { PdfReader } from "./PdfReader";
import { MobiTextReader } from "./MobiTextReader";
import { MediaPlayer } from "./MediaPlayer";
import { ReadAloudButton } from "../tts/ReadAloudButton";
import { splitIntoParagraphs } from "../tts/textUtils";

export function ResourceReaderView() {
  const { id: idParam } = useParams();
  const id = idParam ? Number(idParam) : null;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: resource } = useResource(id);
  const { data: allResources } = useResources();
  const { data: books } = useBooks();
  const { data: passageLinks } = useResourcePassageLinksForResource(id);
  const { data: resourceText } = useResourceText(resource?.has_text ? id : null);
  const { position, goTo } = useNavigationStore();
  const [showLinkPanel, setShowLinkPanel] = useState(false);
  const [linkToResourceId, setLinkToResourceId] = useState<number | "">("");
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);

  function bookName(bid: number) {
    return books?.find((b) => b.id === bid)?.name ?? `#${bid}`;
  }

  async function linkCurrentPassage() {
    if (!id || !position) return;
    let location: string | undefined;
    if (mediaRef.current) location = String(mediaRef.current.currentTime.toFixed(1));
    await api.createResourcePassageLink({
      resourceId: id,
      bookId: position.bookId,
      chapter: position.chapter,
      verseStart: position.verse,
      verseEnd: position.verse,
      location,
    });
    qc.invalidateQueries({ queryKey: ["resourcePassageLinksForResource", id] });
    qc.invalidateQueries({ queryKey: ["resourcePassageLinks"] });
  }

  async function linkToResource() {
    if (!id || linkToResourceId === "") return;
    await api.createResourceLink(id, Number(linkToResourceId));
    setLinkToResourceId("");
  }

  if (!resource) {
    return <div className="p-8 text-gray-400">Loading…</div>;
  }

  return (
    <div className="flex h-full">
      <div className="min-h-0 flex-1">
        {resource.kind === "epub" && <EpubReader filePath={resource.file_path} />}
        {resource.kind === "pdf" && <PdfReader filePath={resource.file_path} />}
        {resource.kind === "mobi" && <MobiTextReader resourceId={resource.id} />}
        {(resource.kind === "video" || resource.kind === "audio") && (
          <MediaPlayer ref={mediaRef} filePath={resource.file_path} kind={resource.kind} />
        )}
      </div>

      <aside className="flex w-72 shrink-0 flex-col border-l border-gray-200 dark:border-gray-800">
        <div className="border-b border-gray-200 p-3 dark:border-gray-800">
          <h2 className="text-sm font-semibold">{resource.title}</h2>
          {resource.author && <p className="text-xs text-gray-500">{resource.author}</p>}
          <Link to="/resources" className="mt-1 inline-block text-xs text-blue-600 hover:underline dark:text-blue-400">
            ← All resources
          </Link>
          {resource.has_text && (
            <div className="mt-2">
              <ReadAloudButton
                title={resource.title}
                sourceKind="resource"
                segments={splitIntoParagraphs(resourceText ?? "").map((p, i) => ({ id: i, text: p }))}
              />
            </div>
          )}
        </div>

        <div className="border-b border-gray-200 p-3 dark:border-gray-800">
          <button
            onClick={linkCurrentPassage}
            disabled={!position}
            className="w-full rounded bg-blue-600 px-2 py-1.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Link to current passage{position ? ` (${bookName(position.bookId)} ${position.chapter}${position.verse ? `:${position.verse}` : ""})` : ""}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <h3 className="mb-1 text-xs font-semibold uppercase text-gray-400">Linked Passages</h3>
          <ul className="mb-4 space-y-1 text-sm">
            {passageLinks?.map((l) => (
              <li key={l.id}>
                <button
                  className="text-blue-600 hover:underline dark:text-blue-400"
                  onClick={() => {
                    goTo({ bookId: l.book_id, chapter: l.chapter, verse: l.verse_start ?? undefined });
                    navigate("/");
                  }}
                >
                  {bookName(l.book_id)} {l.chapter}
                  {l.verse_start ? `:${l.verse_start}` : ""}
                </button>
                {l.location && <span className="ml-1 text-xs text-gray-400">@{l.location}</span>}
              </li>
            ))}
            {(!passageLinks || passageLinks.length === 0) && <p className="text-xs text-gray-400">No links yet.</p>}
          </ul>

          <button onClick={() => setShowLinkPanel((v) => !v)} className="mb-1 text-xs font-semibold uppercase text-gray-400">
            Linked Resources {showLinkPanel ? "▾" : "▸"}
          </button>
          {showLinkPanel && (
            <div className="mb-2 flex gap-1">
              <select
                value={linkToResourceId}
                onChange={(e) => setLinkToResourceId(e.target.value ? Number(e.target.value) : "")}
                className="flex-1 rounded border border-gray-300 bg-white px-1 py-1 text-xs dark:border-gray-700 dark:bg-gray-900"
              >
                <option value="">Choose a resource…</option>
                {allResources?.filter((r) => r.id !== id).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
              <button onClick={linkToResource} className="rounded bg-blue-600 px-2 text-xs text-white hover:bg-blue-700">
                Link
              </button>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
