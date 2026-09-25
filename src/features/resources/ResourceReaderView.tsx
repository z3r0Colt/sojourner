import { useEffect, useRef, useState, type RefObject } from "react";
import { ArrowLeft, ChevronDown, Info, Link2, ListTree, Paperclip } from "lucide-react";
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
import { EpubReader, type EpubController, type EpubTocItem } from "./EpubReader";
import { PdfReader } from "./PdfReader";
import { useResourcePosition } from "./resourcePosition";
import { MobiTextReader } from "./MobiTextReader";
import { MediaPlayer } from "./MediaPlayer";
import { ReadAloudButton } from "../tts/ReadAloudButton";
import { splitIntoParagraphs } from "../tts/textUtils";
import { Button, IconButton } from "../../components/ui/Button";
import { Popover } from "../../components/ui/Popover";
import { LoadingState } from "../../components/ui/EmptyState";
import { toast } from "../../components/ui/toast";
import { StudyActions } from "../sermons/StudyActions";
import { resourceRef } from "../sermons/sourceIdentity";
import { cx, selectSmClass } from "../../components/ui/classes";
import { SidePanel } from "../../components/ui/SidePanel";
import type { Resource } from "../../api/types";

/** Below this pane width the reader's sidebar folds into a header menu. */
const SIDEBAR_FOLD_WIDTH = 480;

/** An EPUB's table of contents as the sidebar shows it (F3.4). */
interface Contents {
  items: EpubTocItem[];
  /** The section on screen, matched by href without its fragment. */
  currentHref: string | null;
  onOpen: (href: string) => void;
}

export function ResourceReaderView() {
  const [params] = usePaneParams("resource");
  const { width } = usePane();
  const id = params.id || null;
  const navigate = usePaneNavigate();
  const { data: resource } = useResource(id);
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);
  // Remembered position (F3.4): the reader opens only once it is known,
  // so an EPUB restores its CFI on first display rather than jumping.
  const { pos, savePos, isLoaded: posLoaded } = useResourcePosition(id);
  const [toc, setToc] = useState<EpubTocItem[]>([]);
  const [currentHref, setCurrentHref] = useState<string | null>(null);
  /** What the reader has selected in the book, for "Send to sermon". */
  const [selection, setSelection] = useState<{ text: string; location: string | null } | null>(null);
  const epubRef = useRef<EpubController | null>(null);
  useEffect(() => {
    setToc([]);
    setCurrentHref(null);
  }, [id]);

  if (!resource) {
    return <LoadingState className="p-8" />;
  }

  const folded = width > 0 && width < SIDEBAR_FOLD_WIDTH;
  const reader = (
    <div
      className="min-h-0 min-w-0 flex-1"
      // A text or PDF reader renders in this document, so its selection is
      // read here; an EPUB reports its own (see EpubReader's onSelect).
      onMouseUp={() => {
        if (resource.kind === "epub") return;
        const text = (window.getSelection()?.toString() ?? "").replace(/\s+/g, " ").trim();
        setSelection(text ? { text, location: null } : null);
      }}
    >
      {resource.kind === "epub" && posLoaded && (
        <EpubReader
          // A new place to find in the same book opens it afresh there.
          key={`${resource.id}:${params.find?.text ?? ""}:${params.find?.occurrence ?? ""}`}
          filePath={resource.file_path}
          initialCfi={pos.cfi}
          onLocation={(loc) => {
            setCurrentHref(loc.href);
            savePos({ cfi: loc.cfi });
          }}
          onToc={setToc}
          onSelect={(text, cfi) => setSelection(text ? { text, location: cfi } : null)}
          controllerRef={epubRef}
          find={params.find ?? null}
        />
      )}
      {resource.kind === "pdf" && posLoaded && <PdfReader key={resource.id} filePath={resource.file_path} initialPage={pos.page} onPageChange={(page) => savePos({ page })} />}
      {(resource.kind === "epub" || resource.kind === "pdf") && !posLoaded && <LoadingState className="p-8" label="Opening…" />}
      {resource.kind === "mobi" && <MobiTextReader resourceId={resource.id} />}
      {(resource.kind === "video" || resource.kind === "audio") && <MediaPlayer ref={mediaRef} filePath={resource.file_path} kind={resource.kind} />}
    </div>
  );
  const contents: Contents | undefined = toc.length > 0 ? { items: toc, currentHref, onOpen: (href) => epubRef.current?.display(href) } : undefined;

  if (folded) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line bg-surface-2/60 pl-1 pr-1">
          <IconButton icon={ArrowLeft} label="All resources" size="sm" onClick={(e) => navigate("/resources", e)} />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink" title={resource.title}>
            {resource.title}
          </span>
          {contents && (
            <Popover width="w-72" trigger={({ toggle, open }) => <IconButton icon={ListTree} label="Contents" size="sm" active={open} onClick={toggle} />}>
              <div className="-m-2 max-h-[70vh] overflow-y-auto p-3">
                <ContentsList contents={contents} />
              </div>
            </Popover>
          )}
          <Popover width="w-72" trigger={({ toggle, open }) => <IconButton icon={Info} label="Details, read aloud, and links" size="sm" active={open} onClick={toggle} />}>
            <div className="-m-2 max-h-[70vh] overflow-y-auto">
              <ReaderSidebar resource={resource} mediaRef={mediaRef} folded selection={selection} />
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
      <SidePanel id="reader-sidebar" label="Contents and details" side="right" defaultWidth={288} autoCollapse={false} className="flex flex-col">
        <ReaderSidebar resource={resource} mediaRef={mediaRef} contents={contents} selection={selection} />
      </SidePanel>
    </div>
  );
}

/** An EPUB's chapters, indented by depth, with the one on screen marked. */
function ContentsList({ contents }: { contents: Contents }) {
  const current = contents.currentHref?.split("#")[0] ?? null;
  return (
    <nav aria-label="Contents">
      <ul className="space-y-0.5 text-sm">
        {contents.items.map((item, i) => {
          const active = current != null && item.href.split("#")[0] === current;
          return (
            <li key={`${item.id}-${i}`}>
              <button
                type="button"
                onClick={() => contents.onOpen(item.href)}
                aria-current={active ? "location" : undefined}
                title={item.label}
                style={{ paddingLeft: `${0.5 + item.depth * 0.75}rem` }}
                className={cx(
                  "block w-full truncate rounded-md py-1 pr-2 text-left",
                  active ? "bg-accent-soft font-medium text-accent" : "text-ink-2 hover:bg-hover hover:text-ink",
                )}
              >
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** The reader's sidebar: title, read aloud, contents (EPUB), passage
 * linking, and links to other resources. In a narrow pane the same
 * content sits in a menu. */
function ReaderSidebar({
  resource,
  mediaRef,
  folded,
  contents,
  selection,
}: {
  resource: Resource;
  mediaRef: RefObject<HTMLVideoElement | HTMLAudioElement | null>;
  folded?: boolean;
  contents?: Contents;
  selection?: { text: string; location: string | null } | null;
}) {
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
        <div className="flex items-start gap-1">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-ink">{resource.title}</h2>
            {resource.author && <p className="text-xs text-ink-3">{resource.author}</p>}
          </div>
          <StudyActions
            what={selection?.text ? "the selection" : "this book"}
            item={() => ({
              kind: "resource",
              refId: resourceRef(resource.id, selection?.location ?? null),
              label: [resource.title, resource.author].filter(Boolean).join(", "),
              excerpt: selection?.text ?? null,
            })}
          />
        </div>
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
        {contents && (
          <details open className="group mb-4">
            <summary className="mb-1.5 flex cursor-pointer list-none items-center gap-1 text-xs font-semibold uppercase tracking-wide text-ink-3 hover:text-ink">
              <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-0 -rotate-90" aria-hidden="true" />
              Contents
              <span className="font-normal normal-case text-ink-4">· {contents.items.length}</span>
            </summary>
            <ContentsList contents={contents} />
          </details>
        )}
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
