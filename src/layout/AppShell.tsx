import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Compass, Keyboard, Search, X } from "lucide-react";
import { useBooks, useBookmarks, useCreateBookmark, useDeleteBookmark, useTranslations } from "../api/queries";
import { useUiStore } from "../state/uiStore";
import { STUDY_KINDS, findPane, resolveBiblePane, useReaderTranslationId, useWorkspaceStore } from "../state/workspaceStore";
import { GoToCommandPalette } from "../features/navigation/GoToCommandPalette";
import { SearchOverlay } from "../features/search/SearchOverlay";
import { TtsPlayerBar } from "../features/tts/TtsPlayerBar";
import { Sidebar } from "./Sidebar";
import { ShortcutsModal } from "./ShortcutsModal";
import { RefPreviewHost } from "../components/RefPreview";
import { Workspace } from "../workspace/Workspace";
import { LayoutPicker } from "../workspace/LayoutPicker";
import { WorkspaceDialogs, WorkspacesMenu, useSavedWorkspaces } from "../workspace/WorkspacesMenu";
import { openContent, openPassage } from "../workspace/openContent";
import { Button, IconButton } from "../components/ui/Button";
import { Kbd } from "../components/ui/Page";
import { toast } from "../components/ui/toast";
import { stepChapter } from "../features/reading/chapterStep";
import { resetZoom, zoomActionFor, zoomText } from "../features/reading/zoom";
import { isTypingTarget } from "../lib/keyboard";
import { useNoteRefsBackfill } from "../features/notes/useNoteRefsBackfill";

const TUTORIAL_BANNER_DISMISSED_KEY = "bsa-tutorial-banner-dismissed";

export function AppShell() {
  const distractionFreeMode = useUiStore((s) => s.distractionFreeMode);
  const setDistractionFreeMode = useUiStore((s) => s.setDistractionFreeMode);
  const { data: books } = useBooks();
  const { data: translations } = useTranslations();
  const { data: bookmarks } = useBookmarks();
  const createBookmark = useCreateBookmark();
  const deleteBookmark = useDeleteBookmark();
  const readerTranslationId = useReaderTranslationId();
  const [savedWorkspaces] = useSavedWorkspaces();
  const focusedPane = useWorkspaceStore((s) => findPane(s.panes, s.focusedPaneId));
  const canGoBack = (focusedPane?.history.length ?? 0) > 0;
  const canGoForward = (focusedPane?.future.length ?? 0) > 0;
  useNoteRefsBackfill();

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [showTutorialBanner, setShowTutorialBanner] = useState(
    () => localStorage.getItem(TUTORIAL_BANNER_DISMISSED_KEY) == null,
  );
  function dismissTutorialBanner() {
    localStorage.setItem(TUTORIAL_BANNER_DISMISSED_KEY, "1");
    setShowTutorialBanner(false);
  }

  function goBack() {
    const s = useWorkspaceStore.getState();
    s.goBack(s.focusedPaneId);
  }
  function goForward() {
    const s = useWorkspaceStore.getState();
    s.goForward(s.focusedPaneId);
  }

  /** Ctrl+D: bookmark the chapter (or selected verse) of the Bible pane the
   * reader is working in. */
  function toggleBookmarkHere() {
    const bible = resolveBiblePane(useWorkspaceStore.getState());
    if (!bible || !books) return;
    const { bookId, chapter, activeVerse } = bible.params;
    const verse = activeVerse ?? undefined;
    const existing = bookmarks?.find((b) => b.book_id === bookId && b.chapter === chapter && (b.verse ?? null) === (verse ?? null));
    const bookName = books.find((b) => b.id === bookId)?.name ?? "";
    const label = `${bookName} ${chapter}${verse ? `:${verse}` : ""}`;
    if (existing) {
      deleteBookmark.mutate(existing.id, { onSuccess: () => toast.info(`Bookmark removed: ${label}`) });
    } else {
      createBookmark.mutate({ bookId, chapter, verse }, { onSuccess: () => toast.success(`Bookmarked ${label}`) });
    }
  }

  /** Ctrl+B: focus a study pane if one is open, otherwise add a commentary pane. */
  function addOrFocusStudyPane() {
    const s = useWorkspaceStore.getState();
    const study = s.panes.find((p) => STUDY_KINDS.has(p.kind));
    if (study) s.focusPane(study.id);
    else openContent("commentary", {}, { target: "new" });
  }

  function enterFocusMode() {
    const s = useWorkspaceStore.getState();
    s.setMaximized(s.focusedPaneId);
    setDistractionFreeMode(true);
  }
  function exitFocusMode() {
    useWorkspaceStore.getState().setMaximized(null);
    setDistractionFreeMode(false);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const zoom = zoomActionFor(e);
      if (zoom) {
        // Text size is global, so this lives in the shell (and must beat the
        // WebView's own page zoom, hence preventDefault).
        e.preventDefault();
        if (zoom === "reset") resetZoom();
        else zoomText(zoom === "in" ? 1 : -1);
      } else if (ctrl && key === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (ctrl && key === "f") {
        e.preventDefault();
        setSearchOpen(true);
      } else if (ctrl && key === "/") {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
      } else if (ctrl && key === "b" && !isTypingTarget(e.target)) {
        e.preventDefault();
        addOrFocusStudyPane();
      } else if (ctrl && key === "d" && !isTypingTarget(e.target)) {
        e.preventDefault();
        toggleBookmarkHere();
      } else if (ctrl && (key === "[" || key === "]") && !isTypingTarget(e.target)) {
        e.preventDefault();
        const bible = resolveBiblePane(useWorkspaceStore.getState());
        if (!books || !bible) return;
        const next = stepChapter(books, { bookId: bible.params.bookId, chapter: bible.params.chapter }, key === "]" ? 1 : -1);
        if (next) openPassage(next, { target: bible.id });
      } else if (ctrl && !e.altKey && e.key >= "1" && e.key <= "4" && !isTypingTarget(e.target)) {
        const s = useWorkspaceStore.getState();
        const pane = s.panes[Number(e.key) - 1];
        if (pane) {
          e.preventDefault();
          s.focusPane(pane.id);
        }
      } else if (e.key === "F11") {
        e.preventDefault();
        if (distractionFreeMode) exitFocusMode();
        else enterFocusMode();
      } else if (e.key === "Escape" && distractionFreeMode) {
        exitFocusMode();
      } else if (e.key === "Escape" && useWorkspaceStore.getState().maximizedPaneId && !isTypingTarget(e.target)) {
        // A pane maximized from its header (double-click) restores on Escape;
        // dialogs and menus stop the key before it gets here.
        useWorkspaceStore.getState().setMaximized(null);
      } else if (e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        goBack();
      } else if (e.altKey && e.key === "ArrowRight") {
        e.preventDefault();
        goForward();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-ink">
      {!distractionFreeMode && <Sidebar />}

      <div className="flex min-w-0 flex-1 flex-col">
        {!distractionFreeMode && (
          <header className="flex h-11 shrink-0 items-center gap-1 border-b border-line bg-surface px-2">
            <IconButton icon={ArrowLeft} label="Back (Alt+Left)" onClick={goBack} disabled={!canGoBack} />
            <IconButton icon={ArrowRight} label="Forward (Alt+Right)" onClick={goForward} disabled={!canGoForward} />
            <div className="min-w-0 flex-1" />
            <Button variant="ghost" icon={Compass} onClick={() => setPaletteOpen(true)} title="Jump to a reference, Strong's number, or term (Ctrl+K)">
              Go to
              <Kbd>Ctrl K</Kbd>
            </Button>
            <Button variant="ghost" icon={Search} onClick={() => setSearchOpen(true)} title="Search Scripture, commentary, notes, prayers, resources, and confessions (Ctrl+F)">
              Search
              <Kbd>Ctrl F</Kbd>
            </Button>
            <WorkspacesMenu />
            <LayoutPicker />
            <IconButton icon={Keyboard} label="Keyboard shortcuts (Ctrl+/)" onClick={() => setShortcutsOpen(true)} />
          </header>
        )}

        {!distractionFreeMode && showTutorialBanner && (
          <div className="flex shrink-0 items-center gap-3 border-b border-line bg-accent-soft px-4 py-1.5 text-sm text-ink-2">
            <span>New here? The Tutorial walks through everything this app can do.</span>
            <Link to="/settings?section=tutorial" className="font-medium text-accent underline underline-offset-2" onClick={dismissTutorialBanner}>
              Take a look
            </Link>
            <div className="flex-1" />
            <IconButton icon={X} label="Dismiss" size="sm" onClick={dismissTutorialBanner} />
          </div>
        )}

        <main className="min-h-0 flex-1">
          <Workspace />
        </main>

        <TtsPlayerBar />
      </div>

      {paletteOpen && books && (
        <GoToCommandPalette
          books={books}
          savedWorkspaces={savedWorkspaces}
          translationId={readerTranslationId}
          translationLabel={translations?.find((t) => t.id === readerTranslationId)?.name}
          onClose={() => setPaletteOpen(false)}
          onNavigate={(p) => {
            openPassage(p);
            setPaletteOpen(false);
          }}
        />
      )}
      {searchOpen && (
        <SearchOverlay
          onClose={() => setSearchOpen(false)}
          onJumpToVerse={(bookId, chapter, verse) => {
            openPassage({ bookId, chapter, verse: verse ?? undefined });
            setSearchOpen(false);
          }}
        />
      )}
      {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}
      <WorkspaceDialogs />
      <RefPreviewHost />
    </div>
  );
}
