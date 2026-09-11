import { useEffect, useState } from "react";
import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, ArrowRight, Compass, Keyboard, Search, X } from "lucide-react";
import { useBooks, useBookmarks, useCreateBookmark, useDeleteBookmark, useTranslations } from "../api/queries";
import { api } from "../api/client";
import { useNavigationStore } from "../state/navigationStore";
import { useUiStore } from "../state/uiStore";
import { GoToCommandPalette } from "../features/navigation/GoToCommandPalette";
import { SearchOverlay } from "../features/search/SearchOverlay";
import { TtsPlayerBar } from "../features/tts/TtsPlayerBar";
import { Sidebar } from "./Sidebar";
import { ShortcutsModal } from "./ShortcutsModal";
import { Button, IconButton } from "../components/ui/Button";
import { Kbd } from "../components/ui/Page";
import { toast } from "../components/ui/toast";
import { stepChapter } from "../features/reading/chapterStep";

const TUTORIAL_BANNER_DISMISSED_KEY = "bsa-tutorial-banner-dismissed";

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function AppShell() {
  const distractionFreeMode = useUiStore((s) => s.distractionFreeMode);
  const toggleDistractionFreeMode = useUiStore((s) => s.toggleDistractionFreeMode);
  const toggleCommentaryPanel = useUiStore((s) => s.toggleCommentaryPanel);
  const { data: books } = useBooks();
  const { data: translations } = useTranslations();
  const { data: bookmarks } = useBookmarks();
  const createBookmark = useCreateBookmark();
  const deleteBookmark = useDeleteBookmark();
  const navigate = useNavigate();
  const location = useLocation();
  const { primaryTranslationId, position, activeVerse, setPrimaryTranslation, goTo, goBack, goForward, history, future } =
    useNavigationStore();

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

  // Bootstrap: pick a default translation and restore the last reading position.
  useEffect(() => {
    if (!translations || translations.length === 0 || !books || books.length === 0) return;
    if (primaryTranslationId == null) {
      const preferred = translations.find((t) => t.code === "KJV") ?? translations[0];
      setPrimaryTranslation(preferred.id);
    }
    if (position == null) {
      api.getReadingPosition().then((pos) => {
        if (pos && pos.book_id != null && pos.chapter != null) {
          goTo({ bookId: pos.book_id, chapter: pos.chapter, verse: pos.verse ?? undefined }, { pushHistory: false });
        } else {
          goTo({ bookId: 1, chapter: 1 }, { pushHistory: false });
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translations, books]);

  function toggleBookmarkHere() {
    if (!position || !books) return;
    const verse = location.pathname === "/" ? (activeVerse ?? undefined) : undefined;
    const existing = bookmarks?.find(
      (b) => b.book_id === position.bookId && b.chapter === position.chapter && (b.verse ?? null) === (verse ?? null),
    );
    const bookName = books.find((b) => b.id === position.bookId)?.name ?? "";
    const label = `${bookName} ${position.chapter}${verse ? `:${verse}` : ""}`;
    if (existing) {
      deleteBookmark.mutate(existing.id, { onSuccess: () => toast.info(`Bookmark removed: ${label}`) });
    } else {
      createBookmark.mutate(
        { bookId: position.bookId, chapter: position.chapter, verse },
        { onSuccess: () => toast.success(`Bookmarked ${label}`) },
      );
    }
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (ctrl && key === "k") {
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
        toggleCommentaryPanel();
      } else if (ctrl && key === "d" && !isTypingTarget(e.target)) {
        e.preventDefault();
        toggleBookmarkHere();
      } else if (ctrl && (key === "[" || key === "]") && !isTypingTarget(e.target)) {
        e.preventDefault();
        if (!books || !position) return;
        const next = stepChapter(books, position, key === "]" ? 1 : -1);
        if (next) {
          goTo(next);
          if (location.pathname !== "/") navigate("/");
        }
      } else if (e.key === "F11") {
        e.preventDefault();
        if (location.pathname !== "/") navigate("/");
        toggleDistractionFreeMode();
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
            <IconButton icon={ArrowLeft} label="Back (Alt+Left)" onClick={goBack} disabled={history.length === 0} />
            <IconButton icon={ArrowRight} label="Forward (Alt+Right)" onClick={goForward} disabled={future.length === 0} />
            <div className="min-w-0 flex-1" />
            <Button variant="ghost" icon={Compass} onClick={() => setPaletteOpen(true)} title="Jump to a reference, Strong's number, or term (Ctrl+K)">
              Go to
              <Kbd>Ctrl K</Kbd>
            </Button>
            <Button variant="ghost" icon={Search} onClick={() => setSearchOpen(true)} title="Search Scripture, commentary, notes, prayers, resources, and confessions (Ctrl+F)">
              Search
              <Kbd>Ctrl F</Kbd>
            </Button>
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

        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>

        <TtsPlayerBar />
      </div>

      {paletteOpen && books && (
        <GoToCommandPalette
          books={books}
          translationId={primaryTranslationId}
          translationLabel={translations?.find((t) => t.id === primaryTranslationId)?.name}
          onClose={() => setPaletteOpen(false)}
          onNavigate={(p) => {
            goTo(p);
            navigate("/");
            setPaletteOpen(false);
          }}
        />
      )}
      {searchOpen && (
        <SearchOverlay
          onClose={() => setSearchOpen(false)}
          onJumpToVerse={(bookId, chapter, verse) => {
            goTo({ bookId, chapter, verse: verse ?? undefined });
            navigate("/");
            setSearchOpen(false);
          }}
        />
      )}
      {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}
    </div>
  );
}
