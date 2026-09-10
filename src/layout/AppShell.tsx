import { useEffect, useState } from "react";
import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { useBooks, useTranslations } from "../api/queries";
import { api } from "../api/client";
import { useNavigationStore } from "../state/navigationStore";
import { ChapterNav } from "../features/reading/ChapterNav";
import { GoToCommandPalette } from "../features/navigation/GoToCommandPalette";
import { SearchOverlay } from "../features/search/SearchOverlay";
import { TtsPlayerBar } from "../features/tts/TtsPlayerBar";
import { useTtsStore } from "../state/ttsStore";
import { useUiStore } from "../state/uiStore";

const NAV_LINKS: { to: string; label: string; end?: boolean }[] = [
  { to: "/", label: "Bible", end: true },
  { to: "/lexicon", label: "Lexicon" },
  { to: "/dictionary", label: "Dictionary" },
  { to: "/westminster", label: "Confessions" },
  { to: "/resources", label: "Resources" },
  { to: "/notes", label: "Notes" },
  { to: "/sermons", label: "Sermons" },
  { to: "/prayer", label: "Prayer" },
  { to: "/memory", label: "Memory" },
  { to: "/plans", label: "Plans" },
  { to: "/harmony", label: "Harmony" },
  { to: "/library", label: "Library" },
];

export function AppShell() {
  const isReading = useTtsStore((s) => s.segments.length > 0);
  const distractionFreeMode = useUiStore((s) => s.distractionFreeMode);
  const { data: books } = useBooks();
  const { data: translations } = useTranslations();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    primaryTranslationId,
    parallelTranslationIds,
    position,
    setPrimaryTranslation,
    toggleParallelTranslation,
    interlinearMode,
    toggleInterlinearMode,
    goTo,
    goBack,
    goForward,
    history,
    future,
  } = useNavigationStore();

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

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

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSearchOpen(true);
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
  }, [goBack, goForward]);

  return (
    <div className="flex h-screen flex-col bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      {!distractionFreeMode && (
      <header className="border-b border-gray-200 dark:border-gray-800">
        {/* Row 1: brand, history, chapter nav, translation controls -- always present, never wraps. */}
        <div className="flex items-center gap-3 px-3 py-2">
          <Link to="/" className="text-sm font-semibold tracking-tight shrink-0">
            Sojourner's Study Companion
          </Link>

          <button
            onClick={goBack}
            disabled={history.length === 0}
            className="rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-800"
            title="Back (Alt+Left)"
          >
            ←
          </button>
          <button
            onClick={goForward}
            disabled={future.length === 0}
            className="rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-800"
            title="Forward (Alt+Right)"
          >
            →
          </button>

          {books && position && location.pathname === "/" && (
            <ChapterNav books={books} position={position} translationId={primaryTranslationId} onNavigate={(p) => goTo(p)} />
          )}

          <div className="min-w-0 flex-1" />

          {translations && (
            <div className="flex shrink-0 items-center gap-1 text-sm">
              <select
                className="rounded border border-gray-300 bg-white px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
                value={primaryTranslationId ?? ""}
                onChange={(e) => setPrimaryTranslation(Number(e.target.value))}
              >
                {translations.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code}
                  </option>
                ))}
              </select>
              <details className="relative">
                <summary className="cursor-pointer list-none rounded border border-gray-300 px-2 py-1 text-gray-600 dark:border-gray-700 dark:text-gray-300">
                  Parallel
                </summary>
                <div className="absolute right-0 z-20 mt-1 w-48 rounded border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-900">
                  {translations.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 py-0.5 text-xs">
                      <input
                        type="checkbox"
                        checked={parallelTranslationIds.includes(t.id)}
                        onChange={() => toggleParallelTranslation(t.id)}
                      />
                      {t.name}
                    </label>
                  ))}
                </div>
              </details>
              <button
                onClick={toggleInterlinearMode}
                className={`rounded border px-2 py-1 ${
                  interlinearMode
                    ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300"
                    : "border-gray-300 text-gray-600 dark:border-gray-700 dark:text-gray-300"
                }`}
                title="Interlinear (Hebrew/Greek with Strong's numbers)"
              >
                Interlinear
              </button>
            </div>
          )}
        </div>

        {/* Row 2: section links + search/go-to -- fixed, always visible, never depends on row 1's width. */}
        <div className="flex items-center gap-1 overflow-x-auto border-t border-gray-100 px-3 py-1.5 dark:border-gray-900">
          {NAV_LINKS.map((link) => {
            const isActive = link.end
              ? location.pathname === link.to
              : location.pathname.startsWith(link.to);
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`shrink-0 rounded px-2 py-1 text-sm ${
                  isActive
                    ? "bg-blue-50 font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                    : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          <div className="flex-1" />
          <button
            onClick={() => setSearchOpen(true)}
            className="shrink-0 rounded border border-gray-300 px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            title="Search (Ctrl+F)"
          >
            Search
          </button>
          <button
            onClick={() => setPaletteOpen(true)}
            className="shrink-0 rounded border border-gray-300 px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            title="Go to (Ctrl+K)"
          >
            Go to…
          </button>
        </div>
      </header>
      )}

      <main className={`min-h-0 flex-1 ${isReading ? "pb-14" : ""}`}>
        <Outlet />
      </main>

      <TtsPlayerBar />

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
    </div>
  );
}
