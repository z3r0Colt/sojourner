import { useRef, useState, type RefObject } from "react";
import { ArrowLeft, ChevronDown, Info, Link2, Paperclip } from "lucide-react";
import {
  useResource,
  useResources,
  useBooks,
  useResourcePassageLinksForResource,
  useResourceText,
} from "../../api/queries";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { resolveBiblePane, useWorkspaceStore } from "../../state/workspaceStore";
import { usePane, usePaneNavigate, usePaneParams } from "../../workspace/PaneContext";
import { openPassage, targetFor } from "../../workspace/openContent";
import { EpubReader } from "./EpubReader";
import { PdfReader } from "./PdfReader";
import { MobiTextReader } from "./MobiTextReader";
import { MediaPlayer } from "./MediaPlayer";
import { ReadAloudButton } from "../tts/ReadAloudButton";
import { splitIntoParagraphs } from "../tts/textUtils";
import { Button, IconButton } from "../../components/ui/Button";
import { Popover } from "../../components/ui/Popover";
import { LoadingState } from "../../components/ui/EmptyState";
import { toast } from "../../components/ui/toast";
import { cx, selectSmClass } from "../../components/ui/classes";
import type { Resource } from "../../api/types";

/** Below this pane width the reader's sidebar folds into a header menu. */
const SIDEBAR_FOLD_WIDTH = 480;

export function ResourceReaderView() {
  const [params] = usePaneParams("resource");
  const { width } = usePane();
  const id = params.id || null;
  const navigate = usePaneNavigate();
  const { data: resource } = useResource(id);
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);

  if (!resource) {
    return <LoadingState className="p-8" />;
  }

  const folded = width > 0 && width < SIDEBAR_FOLD_WIDTH;
  const reader = (
    <div className="min-h-0 min-w-0 flex-1">
      {resource.kind === "epub" && <EpubReader filePath={resource.file_path} />}
      {resource.kind === "pdf" && <PdfReader filePath={resource.file_path} />}
      {resource.kind === "mobi" && <MobiTextReader resourceId={resource.id} />}
      {(resource.kind === "video" || resource.kind === "audio") && <MediaPlayer ref={mediaRef} filePath={resource.file_path} kind={resource.kind} />}
    </div>
  );

  if (folded) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line bg-surface-2/60 pl-1 pr-1">
          <IconButton icon={ArrowLeft} label="All resources" size="sm" onClick={(e) => navigate("/resources", e)} />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink" title={resource.title}>
            {resource.title}
          </span>
          <Popover width="w-72" trigger={({ toggle, open }) => <IconButton icon={Info} label="Details, read aloud, and links" size="sm" active={open} onClick={toggle} />}>
            <div className="-m-2 max-h-[70vh] overflow-y-auto">
              <ReaderSidebar resource={resource} mediaRef={mediaRef} folded />
            </div>
          </Popover>
        </div>
        {reader}
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {reader}
      <aside className="flex w-72 shrink-0 flex-col border-l border-line bg-surface-2/60">
        <ReaderSidebar resource={resource} mediaRef={mediaRef} />
      </aside>
    </div>
  );
}

/** The reader's sidebar: title, read aloud, passage linking, and links to
 * other resources. In a narrow pane the same content sits in a menu. */
function ReaderSidebar({ resource, mediaRef, folded }: { resource: Resource; mediaRef: RefObject<HTMLVideoElement | HTMLAudioElement | null>; folded?: boolean }) {
  const id = resource.id;
  const navigate = usePaneNavigate();
  const qc = useQueryClient();
  const { data: allResources } = useResources();
  const { data: books } = useBooks();
  const { data: passageLinks } = useResourcePassageLinksForResource(id);
  const { data: resourceText } = useResourceText(resource.has_text ? id : null);
  // The passage to link to is whatever the Bible pane beside this one is on.
  const bible = useWorkspaceStore((s) => resolveBiblePane(s));
  const position = bible ? { bookId: bible.params.bookId, chapter: bible.params.chapter, verse: bible.params.activeVerse ?? undefined } : null;
  const [showLinkPanel, setShowLinkPanel] = useState(false);
  const [linkToResourceId, setLinkToResourceId] = useState<number | "">("");

  function bookName(bid: number) {
    return books?.find((b) => b.id === bid)?.name ?? `#${bid}`;
  }

  async function linkCurrentPassage() {
    if (!position) return;
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
    toast.success(`Linked to ${bookName(position.bookId)} ${position.chapter}`);
  }

  async function linkToResource() {
    if (linkToResourceId === "") return;
    await api.createResourceLink(id, Number(linkToResourceId));
    setLinkToResourceId("");
    toast.success("Resources linked");
  }

  const currentPassage = position ? `${bookName(position.bookId)} ${position.chapter}${position.verse ? `:${position.verse}` : ""}` : null;

  return (
    <>
      <div className="border-b border-line p-3">
        {!folded && (
          <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={(e) => navigate("/resources", e)} className="-ml-2 mb-2">
            All resources
          </Button>
        )}
        <h2 className="text-sm font-semibold text-ink">{resource.title}</h2>
        {resource.author && <p className="text-xs text-ink-3">{resource.author}</p>}
        {resource.has_text && (
          <div className="mt-2">
            <ReadAloudButton title={resource.title} sourceKind="resource" segments={splitIntoParagraphs(resourceText ?? "").map((p, i) => ({ id: i, text: p }))} />
          </div>
        )}
      </div>

      <div className="border-b border-line p-3">
        <Button variant="primary" size="sm" icon={Paperclip} disabled={!position} onClick={linkCurrentPassage} className="w-full" title={currentPassage ? `Attach to ${currentPassage}` : undefined}>
          Link to {currentPassage ?? "current passage"}
        </Button>
        <p className="mt-1.5 text-xs text-ink-3">Linked resources appear under the chapter title while reading that passage.</p>
      </div>

      <div className={cx("p-3", !folded && "min-h-0 flex-1 overflow-y-auto")}>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">Linked passages</h3>
        <ul className="mb-4 space-y-1 text-sm">
          {passageLinks?.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                className="text-accent hover:underline"
                onClick={(e) => openPassage({ bookId: l.book_id, chapter: l.chapter, verse: l.verse_start ?? undefined }, { target: targetFor(e) })}
              >
                {bookName(l.book_id)} {l.chapter}
                {l.verse_start ? `:${l.verse_start}` : ""}
              </button>
              {l.location && <span className="ml-1 text-xs text-ink-3">at {l.location}s</span>}
            </li>
          ))}
          {(!passageLinks || passageLinks.length === 0) && <li className="text-xs text-ink-3">None yet.</li>}
        </ul>

        <button
          type="button"
          onClick={() => setShowLinkPanel((v) => !v)}
          className="mb-1.5 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-ink-3 hover:text-ink"
          aria-expanded={showLinkPanel}
        >
          <ChevronDown className={cx("h-3.5 w-3.5 transition-transform", !showLinkPanel && "-rotate-90")} aria-hidden="true" />
          Link to another resource
        </button>
        {showLinkPanel && (
          <div className="flex gap-1">
            <select value={linkToResourceId} onChange={(e) => setLinkToResourceId(e.target.value ? Number(e.target.value) : "")} className={cx(selectSmClass, "min-w-0 flex-1")}>
              <option value="">Choose a resource…</option>
              {allResources
                ?.filter((r) => r.id !== id)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
            </select>
            <Button size="sm" icon={Link2} onClick={linkToResource} disabled={linkToResourceId === ""}>
              Link
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
