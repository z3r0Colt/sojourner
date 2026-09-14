import { BookOpen } from "lucide-react";
import { useBooks } from "../../api/queries";
import { LoadingState } from "../../components/ui/EmptyState";
import { Button } from "../../components/ui/Button";
import { ChapterNav } from "../../features/reading/ChapterNav";
import { InterlinearView } from "../../features/reading/InterlinearView";
import { CommentaryPanel } from "../../features/commentary/CommentaryPanel";
import { CrossReferencesPanel } from "../../features/reading/CrossReferencesPanel";
import { EncyclopediaForPassage } from "../../features/encyclopedia/EncyclopediaForPassage";
import { ConfessionForPassagePanel } from "../../features/reading/ConfessionForPassagePanel";
import { MetricalPsalmPanel } from "../../features/reading/MetricalPsalmPanel";
import { MyNotesPane } from "../../features/reading/MyNotesPane";
import { useUiStore } from "../../state/uiStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { usePane, usePaneParams } from "../PaneContext";
import { openContent, openPassage, targetFor } from "../openContent";

/**
 * The study-panel tabs as pane kinds. Each follows the passage its link
 * group publishes and jumps land in the group's Bible pane (see
 * openContent), so a study pane never turns into a second Bible.
 */

export function InterlinearPane() {
  const { id: paneId } = usePane();
  const [params, setParams] = usePaneParams("interlinear");
  const publishPassage = useWorkspaceStore((s) => s.publishPassage);
  const distractionFreeMode = useUiStore((s) => s.distractionFreeMode);
  const { data: books } = useBooks();
  const book = books?.find((b) => b.id === params.bookId);
  if (!books || !book) return <LoadingState className="p-8" />;

  function readAsText() {
    openContent("bible", { bookId: params.bookId, chapter: params.chapter }, { target: paneId });
  }

  return (
    <div className="flex h-full flex-col">
      {!distractionFreeMode && (
        <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line bg-surface px-2">
          <ChapterNav
            books={books}
            position={{ bookId: params.bookId, chapter: params.chapter }}
            translationId={null}
            onNavigate={(p) => {
              setParams({ bookId: p.bookId, chapter: p.chapter, verse: null });
              publishPassage(paneId, { bookId: p.bookId, chapter: p.chapter, verse: null });
            }}
          />
          <div className="min-w-0 flex-1" />
          <Button size="sm" variant="ghost" icon={BookOpen} onClick={readAsText} title="Show this chapter as plain text in this pane">
            Text
          </Button>
        </div>
      )}
      <InterlinearView book={book} chapter={params.chapter} onExit={readAsText} />
    </div>
  );
}

export function CommentaryPane() {
  const [params, setParams] = usePaneParams("commentary");
  const { data: books } = useBooks();
  const book = books?.find((b) => b.id === params.bookId);
  if (!books || !book) return <LoadingState className="p-8" />;
  return (
    <CommentaryPanel
      book={book}
      chapter={params.chapter}
      activeVerse={params.verse}
      sourceId={params.sourceId}
      onSourceChange={(sourceId) => setParams({ sourceId })}
      onJumpToVerse={(c, v) => openPassage({ bookId: book.id, chapter: c, verse: v })}
      onJumpToRef={(osis, c, v, e) => {
        const target = books.find((b) => b.osis_code === osis);
        if (target) openPassage({ bookId: target.id, chapter: c, verse: v }, { target: e ? targetFor(e) : "focused" });
      }}
    />
  );
}

export function CrossRefsPane() {
  const [params] = usePaneParams("crossrefs");
  const { data: books } = useBooks();
  const book = books?.find((b) => b.id === params.bookId);
  if (!book) return <LoadingState className="p-8" />;
  return <CrossReferencesPanel book={book} chapter={params.chapter} activeVerse={params.verse} />;
}

export function EncyclopediaForPassagePane() {
  const [params] = usePaneParams("encyclopedia-for-passage");
  const { data: books } = useBooks();
  const book = books?.find((b) => b.id === params.bookId);
  if (!book) return <LoadingState className="p-8" />;
  return <EncyclopediaForPassage book={book} chapter={params.chapter} activeVerse={params.verse} />;
}

export function ConfessionPane() {
  const [params] = usePaneParams("confession-for-passage");
  const { data: books } = useBooks();
  const book = books?.find((b) => b.id === params.bookId);
  if (!book) return <LoadingState className="p-8" />;
  return <ConfessionForPassagePanel book={book} chapter={params.chapter} activeVerse={params.verse} />;
}

/** "Mine" (F2.4): the linked chapter's notes, chapter notes, highlights,
 * and the notes elsewhere that mention it. */
export function MinePane() {
  const [params] = usePaneParams("mine");
  const { data: books } = useBooks();
  const book = books?.find((b) => b.id === params.bookId);
  if (!book) return <LoadingState className="p-8" />;
  return <MyNotesPane book={book} chapter={params.chapter} activeVerse={params.verse} />;
}

export function MetricalPane() {
  const [params] = usePaneParams("metrical");
  const { data: books } = useBooks();
  const book = books?.find((b) => b.id === params.bookId);
  if (!book) return <LoadingState className="p-8" />;
  if (book.id !== 19) {
    return (
      <div className="flex h-full w-full flex-col">
        <div className="border-b border-line px-3 py-2 text-xs text-ink-3">1650 Scottish Metrical Psalter</div>
        <p className="p-4 text-sm text-ink-3">The Metrical Psalter follows the Psalms. Open a Psalm in the linked Bible pane to see its setting here.</p>
      </div>
    );
  }
  return <MetricalPsalmPanel psalm={params.chapter} />;
}
