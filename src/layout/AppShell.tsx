import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Compass, Keyboard, Search } from "lucide-react";
import { useBooks, useBookmarks, useCreateBookmark, useDeleteBookmark, useTranslations } from "../api/queries";
import { useUiStore } from "../state/uiStore";
import { STUDY_KINDS, findPane, resolveBiblePane, useReaderTranslationId, useWorkspaceStore } from "../state/workspaceStore";
import { GoToCommandPalette } from "../features/navigation/GoToCommandPalette";
import { SearchOverlay } from "../features/search/SearchOverlay";
import { TtsPlayerBar } from "../features/tts/TtsPlayerBar";
import { Sidebar } from "./Sidebar";
import { ShortcutsModal } from "./ShortcutsModal";
import { RefPreviewHost } from "../components/RefPreview";
import { SendToSermonHost } from "../features/sermons/SendToSermonHost";
import { IllustrationCaptureHost } from "../features/sermons/IllustrationCaptureHost";
import { PreachingMode } from "../features/sermons/PreachingMode";
import { GatherRound } from "../features/family/GatherRound";
import { RunLogHost } from "../features/sermons/Rehearsal";
import { Workspace } from "../workspace/Workspace";
import { LayoutPicker } from "../workspace/LayoutPicker";
import { WorkspaceDialogs, WorkspacesMenu, useSavedWorkspaces } from "../workspace/WorkspacesMenu";
import { openContent, openNewTab, openPassage } from "../workspace/openContent";
import { Button, IconButton } from "../components/ui/Button";
import { Kbd } from "../components/ui/Page";
import { toast } from "../components/ui/toast";
import { stepChapter } from "../features/reading/chapterStep";
import { resetZoom, zoomActionFor, zoomText } from "../features/reading/zoom";
import { isTypingTarget } from "../lib/keyboard";
import { installCloseHandshake } from "../lib/appClose";
import { splashReady } from "../lib/splash";
import { useNoteRefsBackfill } from "../features/notes/useNoteRefsBackfill";
import { useLandingPageOnLaunch } from "../features/today/landing";
import { useBackupReminder } from "../features/settings/backupReminder";
import { useAutomaticBackup } from "../features/settings/automaticBackup";
import { TourOverlay } from "../features/onboarding/TourOverlay";
import { useFirstRunTour, useTourDone } from "../features/onboarding/firstRun";

export function AppShell() {
  const distractionFreeMode = useUiStore((s) => s.distractionFreeMode);
  const setDistractionFreeMode = useUiStore((s) => s.setDistractionFreeMode);
  const booksQuery = useBooks();
  const translationsQuery = useTranslations();
  const books = booksQuery.data;
  const translations = translationsQuery.data;
  const { data: bookmarks } = useBookmarks();
  const createBookmark = useCreateBookmark();
  const deleteBookmark = useDeleteBookmark();
  const readerTranslationId = useReaderTranslationId();
  const [savedWorkspaces] = useSavedWorkspaces();
  const focusedPane = useWorkspaceStore((s) => findPane(s.panes, s.focusedPaneId));
  const canGoBack = (focusedPane?.history.length ?? 0) > 0;
  const canGoForward = (focusedPane?.future.length ?? 0) > 0;
  useNoteRefsBackfill();
  useLandingPageOnLaunch();
  useAutomaticBackup();
  useBackupReminder();
  useFirstRunTour();
  const [, setTourDone] = useTourDone();

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

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

  // The handler is rebuilt on every render (it closes over
  // `distractionFreeMode` and `books`), but the listener must not be: this is
  // the app's hottest component, and attaching and detaching a window
  // `keydown` on every render of it is work for nothing. Held in a ref and
  // read through one stable listener instead -- the same shape
  // `sermonDraft.ts` uses for its save.
  const onKeyDownRef = useRef<(e: KeyboardEvent) => void>(() => {});
  onKeyDownRef.current = function onKeyDown(e: KeyboardEvent) {
    // A view that has already answered a chord (a book zooming on Ctrl+=)
    // keeps it; the shell's global meaning applies only where nothing did.
    if (e.defaultPrevented) return;
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
    } else if (ctrl && !e.altKey && e.key >= "1" && e.key <= "8" && !isTypingTarget(e.target)) {
      const s = useWorkspaceStore.getState();
      const pane = s.panes[Number(e.key) - 1];
      if (pane) {
        e.preventDefault();
        s.focusPane(pane.id);
      }
    } else if (ctrl && !e.altKey && !e.shiftKey && key === "t" && !isTypingTarget(e.target)) {
      // A copy of the focused pane as a new tab beside it.
      e.preventDefault();
      openNewTab(useWorkspaceStore.getState().focusedPaneId);
    } else if (ctrl && !e.altKey && e.key === "\\" && !isTypingTarget(e.target)) {
      // Ctrl+\ splits the focused pane to the right, Ctrl+Shift+\ downward,
      // each leaving an empty slot that offers to add content.
      e.preventDefault();
      const s = useWorkspaceStore.getState();
      s.splitPane(s.focusedPaneId, e.shiftKey ? "bottom" : "right");
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
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => onKeyDownRef.current(e);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Closing the window is a handshake now, so that a manuscript's last save
  // finishes before the webview goes -- see `lib/appClose.ts`.
  useEffect(() => installCloseHandshake(), []);

  // The splash screen comes down once the database has answered with the two
  // things the shell cannot draw without. An error counts as an answer: what
  // the app has to say about a library that would not open is worth more than
  // a loading bar that never fills. The splash keeps its own minimum showing
  // time either way -- see index.html and public/splash.js.
  const shellLoaded = !booksQuery.isPending && !translationsQuery.isPending;
  useEffect(() => {
    if (shellLoaded) splashReady();
  }, [shellLoaded]);

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-ink">
      {!distractionFreeMode && <Sidebar />}

      <div className="flex min-w-0 flex-1 flex-col">
        {!distractionFreeMode && (
          <header className="flex h-11 shrink-0 items-center gap-1 border-b border-line bg-surface px-2">
            <IconButton icon={ArrowLeft} label="Back (Alt+Left)" onClick={goBack} disabled={!canGoBack} />
            <IconButton icon={ArrowRight} label="Forward (Alt+Right)" onClick={goForward} disabled={!canGoForward} />
            <div className="min-w-0 flex-1" />
            <Button variant="ghost" icon={Compass} onClick={() => setPaletteOpen(true)} title="Jump to a reference, Strong's number, or term (Ctrl+K)" data-tour="goto">
              Go to
              <Kbd>Ctrl K</Kbd>
            </Button>
            <Button variant="ghost" icon={Search} onClick={() => setSearchOpen(true)} title="Search Scripture, commentary, notes, prayers, resources, and confessions (Ctrl+F)" data-tour="search">
              Search
              <Kbd>Ctrl F</Kbd>
            </Button>
            <WorkspacesMenu />
            <LayoutPicker />
            <IconButton icon={Keyboard} label="Keyboard shortcuts (Ctrl+/)" onClick={() => setShortcutsOpen(true)} data-tour="shortcuts" />
          </header>
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
          shell={{ openSearch: () => setSearchOpen(true), openShortcuts: () => setShortcutsOpen(true), bookmarkHere: toggleBookmarkHere }}
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
          onJumpToVerse={(bookId, chapter, verse, newPane) => {
            openPassage({ bookId, chapter, verse: verse ?? undefined }, newPane ? { target: "new" } : {});
            setSearchOpen(false);
          }}
        />
      )}
      {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}
      <WorkspaceDialogs />
      <SendToSermonHost />
      <IllustrationCaptureHost />
      <PreachingMode />
      <GatherRound />
      <RunLogHost />
      <RefPreviewHost />
      <TourOverlay onFinish={() => setTourDone(true)} />
    </div>
  );
}
