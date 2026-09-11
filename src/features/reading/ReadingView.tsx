import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useNavigate } from "react-router-dom";
import {
  Columns2,
  Languages,
  Link2,
  Maximize2,
  MessageSquareText,
  Minimize2,
  Music,
  Paperclip,
  Printer,
  ScrollText,
  SlidersHorizontal,
  Sparkles,
  StickyNote,
  Type,
  X,
} from "lucide-react";
import { useNavigationStore } from "../../state/navigationStore";
import { useReadingTypography, useUiStore, type StudyTab } from "../../state/uiStore";
import {
  useBooks,
  useBookmarks,
  useChapter,
  useHighlights,
  useNotesForChapter,
  useCreateHighlight,
  useDeleteHighlight,
  useUpdateHighlight,
  useCreateNote,
  useUpdateNote,
  useDeleteNote,
  useChapterNotes,
  useCreateChapterNote,
  useUpdateChapterNote,
  useDeleteChapterNote,
  useCreateBookmark,
  useDeleteBookmark,
  useCreateMemoryVerse,
  useResourcePassageLinksForChapter,
  useSuggestedResourcesForPassage,
  useResources,
  useFootnotesForChapter,
  useRedLetterRanges,
  useTranslations,
  useTrashToast,
} from "../../api/queries";
import { api } from "../../api/client";
import { VerseRow } from "./VerseRow";
import { SelectionToolbar } from "./SelectionToolbar";
import { HighlightPopup } from "./HighlightPopup";
import { CommentaryPanel } from "../commentary/CommentaryPanel";
import { CrossReferencesPanel } from "./CrossReferencesPanel";
import { ConfessionForPassagePanel } from "./ConfessionForPassagePanel";
import { MetricalPsalmPanel } from "./MetricalPsalmPanel";
import { VerseContextMenu } from "./VerseContextMenu";
import { CompareVerseModal } from "./CompareVerseModal";
import { FootnotePopup } from "./FootnotePopup";
import { NoteEditorModal } from "../notes/NoteEditorModal";
import { NoteBody } from "../notes/NoteBody";
import { RichTextEditor } from "../notes/RichTextEditor";
import { ParallelReadingView } from "./ParallelReadingView";
import { InterlinearView } from "./InterlinearView";
import { ParagraphVerses } from "./ParagraphReadingView";
import { ChapterNav } from "./ChapterNav";
import { BookmarksMenu } from "./BookmarksMenu";
import { computeRedLetterSpans } from "./redLetterSpans";
import { DockPanel } from "../../components/DockPanel";
import { closestWithAttr, textOffsetWithin } from "../../lib/domOffsets";
import { copyWithReference } from "../../lib/clipboard";
import { ReadAloudButton } from "../tts/ReadAloudButton";
import { useTtsStore } from "../../state/ttsStore";
import { Button, IconButton } from "../../components/ui/Button";
import { Popover, PopoverItem } from "../../components/ui/Popover";
import { Modal } from "../../components/ui/Modal";
import { Tabs } from "../../components/ui/Tabs";
import { LoadingState } from "../../components/ui/EmptyState";
import { toast } from "../../components/ui/toast";
import { confirmTrash } from "../../components/ui/confirm";
import { checkboxClass, cx, selectSmClass } from "../../components/ui/classes";
import { formatRef, joinVerses, toPassageRef } from "../../lib/passage";
import type { Note, Footnote } from "../../api/types";

interface PendingSelection {
  verseStart: number;
  verseEnd: number;
  /** Character offsets apply only to a single-verse selection; a span
   * across verses highlights those verses whole. */
  charStart: number | null;
  charEnd: number | null;
  x: number;
  y: number;
}

interface ActiveHighlight {
  id: number;
  verseStart: number;
  verseEnd: number;
  x: number;
  y: number;
}

interface NoteTarget {
  verseStart: number;
  verseEnd: number;
  highlightId?: number;
  existing?: Note;
}

const STUDY_TABS: { key: StudyTab; label: string; icon: typeof MessageSquareText; title: string; psalmsOnly?: boolean }[] = [
  { key: "commentary", label: "Commentary", icon: MessageSquareText, title: "Commentary on this chapter" },
  { key: "crossrefs", label: "Cross refs", icon: Link2, title: "Cross references for the selected verse" },
  { key: "confession", label: "Confessions", icon: ScrollText, title: "Where the Westminster Confession and Catechisms cite the selected verse" },
  { key: "metrical", label: "Metrical", icon: Music, title: "The 1650 Scottish Metrical Psalter", psalmsOnly: true },
];

export function ReadingView() {
  const { data: books } = useBooks();
  const {
    primaryTranslationId,
    parallelTranslationIds,
    position,
    goTo,
    interlinearMode,
    toggleInterlinearMode,
    setPrimaryTranslation,
    toggleParallelTranslation,
    clearParallelTranslations,
    activeVerse,
    setActiveVerse,
  } = useNavigationStore();
  const {
    fontSize,
    setFontSize,
    lineSpacing,
    setLineSpacing,
    readingFont,
    setReadingFont,
    theme,
    setTheme,
    showVerseNumbers,
    toggleVerseNumbers,
    commentaryPanelOpen,
    toggleCommentaryPanel,
    setCommentaryPanelOpen,
    commentaryPanelWidth,
    setCommentaryPanelWidth,
    commentaryPanelSide,
    setCommentaryPanelSide,
    showHighlights,
    toggleShowHighlights,
    showNoteSymbols,
    toggleShowNoteSymbols,
    rightPanelTab,
    setRightPanelTab,
    redLetterMode,
    toggleRedLetterMode,
    paragraphMode,
    toggleParagraphMode,
    distractionFreeMode,
    toggleDistractionFreeMode,
  } = useUiStore();
  const typography = useReadingTypography();
  const book = books?.find((b) => b.id === position?.bookId) ?? null;
  const chapter = position?.chapter ?? null;

  const { data: translations } = useTranslations();
  const { data: verses, isLoading: versesLoading } = useChapter(primaryTranslationId, position?.bookId ?? null, chapter);
  const { data: highlights } = useHighlights(position?.bookId ?? null, chapter);
  const { data: notes } = useNotesForChapter(position?.bookId ?? null, chapter);
  const { data: chapterNotes } = useChapterNotes(position?.bookId ?? null, chapter);
  const { data: resourceLinks } = useResourcePassageLinksForChapter(position?.bookId ?? null, chapter);
  const { data: allResources } = useResources();
  const { data: suggestedResources } = useSuggestedResourcesForPassage(position?.bookId ?? null, chapter);
  const { data: footnotes } = useFootnotesForChapter(primaryTranslationId, position?.bookId ?? null, chapter);
  const { data: redLetterRanges } = useRedLetterRanges(redLetterMode ? position?.bookId ?? null : null, chapter);
  const { data: bookmarks } = useBookmarks();
  function isRedLetterVerse(verseNum: number) {
    return !!redLetterRanges?.some((r) => verseNum >= r.verse_start && verseNum <= r.verse_end);
  }
  // WEB is the translation the red-letter ranges were derived from (see
  // red_letter.rs), and it punctuates dialogue with quotes -- so it stands in
  // as a reference for sub-verse span position when the translation actually
  // being read doesn't use quotation marks at all (KJV, ASV, Darby, Geneva,
  // Tyndale, Webster's, Wycliffe, YLT, Douay-Rheims). Skipped entirely for
  // WEB itself, since it needs no help locating its own quotes.
  const webTranslationId = translations?.find((t) => t.code === "WEB")?.id ?? null;
  const needsRedLetterReference = redLetterMode && webTranslationId != null && webTranslationId !== primaryTranslationId;
  const { data: redLetterReferenceVerses } = useChapter(
    needsRedLetterReference ? webTranslationId : null,
    position?.bookId ?? null,
    chapter,
  );
  // Computed once per chapter (not per row) since quote depth carries across
  // verses -- see redLetterSpans.ts.
  const redLetterSpansByVerse = useMemo(
    () =>
      redLetterMode && verses
        ? computeRedLetterSpans(verses, isRedLetterVerse, needsRedLetterReference ? redLetterReferenceVerses : null)
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [redLetterMode, verses, redLetterRanges, needsRedLetterReference, redLetterReferenceVerses],
  );
  const navigate = useNavigate();
  const createHighlight = useCreateHighlight();
  const deleteHighlight = useDeleteHighlight();
  const updateHighlight = useUpdateHighlight();
  const createNote = useCreateNote();
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();
  const createChapterNote = useCreateChapterNote();
  const updateChapterNote = useUpdateChapterNote();
  const deleteChapterNote = useDeleteChapterNote();
  const trashToast = useTrashToast();
  const createBookmark = useCreateBookmark();
  const deleteBookmark = useDeleteBookmark();
  const createMemoryVerse = useCreateMemoryVerse();

  const [pending, setPending] = useState<PendingSelection | null>(null);
  const [activeHighlight, setActiveHighlight] = useState<ActiveHighlight | null>(null);
  const [noteTarget, setNoteTarget] = useState<NoteTarget | null>(null);
  const [chapterNoteOpen, setChapterNoteOpen] = useState(false);
  const [showAllSuggested, setShowAllSuggested] = useState(false);
  const [activeFootnote, setActiveFootnote] = useState<{ footnote: Footnote; x: number; y: number } | null>(null);
  const [verseMenu, setVerseMenu] = useState<{ verseNum: number; x: number; y: number } | null>(null);
  const [compareVerse, setCompareVerse] = useState<number | null>(null);
  const [printing, setPrinting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Virtualized so long chapters (Psalm 119, 176 verses) don't render every
  // verse row -- with highlights, note markers, and footnotes each row can be
  // non-trivial -- at once. Rows vary in height (wrapped text, highlight
  // spans), so sizes are measured after render rather than assumed fixed.
  const rowVirtualizer = useVirtualizer({
    count: verses?.length ?? 0,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 56,
    overscan: 8,
  });

  const ttsSourceKind = useTtsStore((s) => s.sourceKind);
  const ttsCurrentSegmentId = useTtsStore((s) => s.segments[s.currentSegmentIndex]?.id ?? null);
  useEffect(() => {
    if (ttsSourceKind === "scripture" && typeof ttsCurrentSegmentId === "number") {
      setActiveVerse(ttsCurrentSegmentId);
    }
  }, [ttsSourceKind, ttsCurrentSegmentId, setActiveVerse]);

  // Scroll the target verse into view once verses are loaded. Rows are
  // virtualized, so the target row may not be mounted yet -- ask the
  // virtualizer to scroll to its index rather than querying the DOM.
  const scrollTarget = position?.verse ?? null;
  useEffect(() => {
    if (scrollTarget == null || !verses) return;
    const index = verses.findIndex((v) => v.verse === scrollTarget);
    if (index >= 0) rowVirtualizer.scrollToIndex(index, { align: "center" });
  }, [scrollTarget, verses, rowVirtualizer, position?.bookId, position?.chapter]);

  // Persist reading position (debounced) whenever it changes.
  useEffect(() => {
    if (!position || primaryTranslationId == null) return;
    const t = setTimeout(() => {
      api.setReadingPosition(primaryTranslationId, position.bookId, position.chapter, activeVerse ?? undefined);
    }, 400);
    return () => clearTimeout(t);
  }, [position, primaryTranslationId, activeVerse]);

  // Printing: the virtualizer only mounts the rows on screen, so render the
  // whole chapter statically for the print pass, then go back.
  useEffect(() => {
    if (!printing) return;
    const id = requestAnimationFrame(() => {
      window.print();
      setPrinting(false);
    });
    return () => cancelAnimationFrame(id);
  }, [printing]);

  useEffect(() => {
    if (!distractionFreeMode) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") toggleDistractionFreeMode();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [distractionFreeMode, toggleDistractionFreeMode]);

  function handleMouseUp() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const startVerseEl = closestWithAttr(range.startContainer, "data-verse-text");
    const endVerseEl = closestWithAttr(range.endContainer, "data-verse-text");
    if (!startVerseEl || !endVerseEl) return;
    const verseA = Number(startVerseEl.getAttribute("data-verse-text"));
    const verseB = Number(endVerseEl.getAttribute("data-verse-text"));
    const rect = range.getBoundingClientRect();
    if (verseA === verseB) {
      const charStart = textOffsetWithin(startVerseEl, range.startContainer, range.startOffset);
      const charEnd = textOffsetWithin(endVerseEl, range.endContainer, range.endOffset);
      if (charEnd <= charStart) return;
      setPending({ verseStart: verseA, verseEnd: verseA, charStart, charEnd, x: rect.left + rect.width / 2, y: rect.top });
    } else {
      // A selection spanning verses highlights those verses whole.
      setPending({
        verseStart: Math.min(verseA, verseB),
        verseEnd: Math.max(verseA, verseB),
        charStart: null,
        charEnd: null,
        x: rect.left + rect.width / 2,
        y: rect.top,
      });
    }
  }

  function commitHighlight(style: "highlight" | "underline", color: string, target?: { verseStart: number; verseEnd: number }) {
    if (!position) return;
    const range = target ?? (pending ? { verseStart: pending.verseStart, verseEnd: pending.verseEnd } : null);
    if (!range) return;
    // Character offsets only apply to a selection within one verse; a
    // whole-verse action from the context menu has none.
    const charStart = target ? undefined : (pending?.charStart ?? undefined);
    const charEnd = target ? undefined : (pending?.charEnd ?? undefined);
    createHighlight.mutate({
      bookId: position.bookId,
      chapter: position.chapter,
      verseStart: range.verseStart,
      verseEnd: range.verseEnd,
      charStart,
      charEnd,
      color,
      style,
      translationId: primaryTranslationId ?? undefined,
    });
    window.getSelection()?.removeAllRanges();
    setPending(null);
  }

  function jumpToRef(bookOsisCode: string, chapter: number, verse: number) {
    const target = books?.find((b) => b.osis_code === bookOsisCode);
    if (target) goTo({ bookId: target.id, chapter, verse });
  }

  function verseText(verseNum: number) {
    return verses?.find((v) => v.verse === verseNum)?.text ?? "";
  }

  function openPanelTab(tab: StudyTab) {
    setRightPanelTab(tab);
    setCommentaryPanelOpen(true);
  }

  const activeHighlightNote = activeHighlight ? notes?.find((n) => n.highlight_id === activeHighlight.id) : undefined;

  if (!book || !chapter) {
    return <LoadingState className="p-8" label="Opening your last reading position…" />;
  }

  const verseMenuBookmark =
    verseMenu != null ? bookmarks?.find((b) => b.book_id === book.id && b.chapter === chapter && b.verse === verseMenu.verseNum) : undefined;
  const visibleTabs = STUDY_TABS.filter((t) => !t.psalmsOnly || book.id === 19);
  const parallelActive = parallelTranslationIds.length > 0;
  const suggested = suggestedResources?.filter((r) => !resourceLinks?.some((l) => l.resource_id === r.id)) ?? [];
  const shownSuggested = showAllSuggested ? suggested : suggested.slice(0, 3);
  const hiddenSuggested = suggested.length - shownSuggested.length;
  const hasRelated = (resourceLinks?.length ?? 0) > 0 || suggested.length > 0;
  const chapterNoteCount = chapterNotes?.length ?? 0;

  const toolbar = !distractionFreeMode && books && position && (
    <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line bg-surface px-2">
      <ChapterNav books={books} position={position} translationId={primaryTranslationId} onNavigate={(p) => goTo(p)} />
      <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
      {translations && (
        <select
          aria-label="Translation"
          className={selectSmClass}
          value={primaryTranslationId ?? ""}
          onChange={(e) => setPrimaryTranslation(Number(e.target.value))}
        >
          {translations.map((t) => (
            <option key={t.id} value={t.id}>
              {t.code}
            </option>
          ))}
        </select>
      )}
      {translations && (
        <Popover
          width="w-64"
          align="left"
          trigger={({ toggle, open }) => (
            <Button size="sm" variant="ghost" icon={Columns2} active={open || parallelActive} onClick={toggle} title="Read alongside other translations">
              Parallel{parallelActive ? ` (${parallelTranslationIds.length})` : ""}
            </Button>
          )}
        >
          <div className="px-1 pb-1 text-xs text-ink-3">Show the chapter side by side with:</div>
          {translations
            .filter((t) => t.id !== primaryTranslationId)
            .map((t) => (
              <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-hover">
                <input type="checkbox" className={checkboxClass} checked={parallelTranslationIds.includes(t.id)} onChange={() => toggleParallelTranslation(t.id)} />
                <span className="text-ink-2">{t.name}</span>
              </label>
            ))}
          {parallelActive && (
            <PopoverItem onClick={clearParallelTranslations} className="mt-1 border-t border-line pt-2">
              <X className="h-4 w-4" aria-hidden="true" /> Exit parallel view
            </PopoverItem>
          )}
        </Popover>
      )}
      <Button size="sm" variant="ghost" icon={Languages} active={interlinearMode} onClick={toggleInterlinearMode} title="Interlinear: Hebrew/Greek with Strong's numbers">
        Interlinear
      </Button>
      <div className="min-w-0 flex-1" />
      <div className="relative">
        <IconButton icon={StickyNote} label={chapterNoteCount > 0 ? `Chapter notes (${chapterNoteCount})` : "Chapter notes"} onClick={() => setChapterNoteOpen(true)} />
        {chapterNoteCount > 0 && (
          <span className="pointer-events-none absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] font-semibold leading-4 text-white">
            {chapterNoteCount}
          </span>
        )}
      </div>
      <ReadAloudButton
        title={`${book.name} ${chapter}`}
        sourceKind="scripture"
        iconOnly
        size="md"
        segments={(verses ?? []).map((v) => ({ id: v.verse, text: v.text, label: `Verse ${v.verse}` }))}
      />
      <BookmarksMenu bookId={book.id} chapter={chapter} activeVerse={activeVerse} />
      <Popover
        width="w-72"
        trigger={({ toggle, open }) => <IconButton icon={Type} label="Text size, spacing, font, and theme" active={open} onClick={toggle} />}
      >
        <div className="space-y-3 p-1">
          <label className="block">
            <span className="mb-1 flex items-center justify-between text-xs font-medium text-ink-3">
              <span>Text size</span>
              <span>{fontSize}px</span>
            </span>
            <input type="range" min={14} max={30} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} className="w-full accent-accent" />
          </label>
          <div>
            <div className="mb-1 text-xs font-medium text-ink-3">Line spacing</div>
            <div className="flex gap-1">
              {(["compact", "normal", "relaxed"] as const).map((s) => (
                <Button key={s} size="sm" active={lineSpacing === s} onClick={() => setLineSpacing(s)} className="flex-1 capitalize">
                  {s}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-ink-3">Font</div>
            <div className="flex gap-1">
              <Button size="sm" active={readingFont === "serif"} onClick={() => setReadingFont("serif")} className="flex-1 font-serif">
                Serif
              </Button>
              <Button size="sm" active={readingFont === "sans"} onClick={() => setReadingFont("sans")} className="flex-1">
                Sans-serif
              </Button>
            </div>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-3">Theme</span>
            <select value={theme} onChange={(e) => setTheme(e.target.value as typeof theme)} className={cx(selectSmClass, "w-full")}>
              <option value="system">Match Windows</option>
              <option value="light">Light</option>
              <option value="sepia">Sepia</option>
              <option value="dark">Dark</option>
              <option value="oled">True black</option>
            </select>
          </label>
        </div>
      </Popover>
      <Popover
        width="w-64"
        trigger={({ toggle, open }) => <IconButton icon={SlidersHorizontal} label="View options" active={open} onClick={toggle} />}
      >
        {[
          { label: "Paragraph mode", checked: paragraphMode, onChange: toggleParagraphMode, hint: "Flowing prose instead of one verse per line" },
          { label: "Verse numbers", checked: showVerseNumbers, onChange: toggleVerseNumbers },
          { label: "Words of Jesus in red", checked: redLetterMode, onChange: toggleRedLetterMode },
          { label: "Show highlights", checked: showHighlights, onChange: toggleShowHighlights },
          { label: "Show note markers", checked: showNoteSymbols, onChange: toggleShowNoteSymbols },
        ].map((opt) => (
          <label key={opt.label} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-hover">
            <input type="checkbox" className={cx(checkboxClass, "mt-0.5")} checked={opt.checked} onChange={opt.onChange} />
            <span>
              <span className="text-ink-2">{opt.label}</span>
              {opt.hint && <span className="block text-xs text-ink-3">{opt.hint}</span>}
            </span>
          </label>
        ))}
        <div className="my-1 h-px bg-line" aria-hidden="true" />
        <PopoverItem onClick={() => setPrinting(true)}>
          <Printer className="h-4 w-4 text-ink-3" aria-hidden="true" /> Print this chapter
        </PopoverItem>
      </Popover>
      <IconButton icon={Maximize2} label="Focus mode: just the text (F11)" onClick={toggleDistractionFreeMode} />
    </div>
  );

  if (interlinearMode) {
    return (
      <div className="flex h-full flex-col">
        {toolbar}
        <InterlinearView book={book} chapter={chapter} onExit={toggleInterlinearMode} />
      </div>
    );
  }

  if (parallelActive) {
    return (
      <div className="flex h-full flex-col">
        {toolbar}
        <ParallelReadingView
          book={book}
          chapter={chapter}
          primaryTranslationId={primaryTranslationId}
          parallelTranslationIds={parallelTranslationIds}
          onExit={clearParallelTranslations}
        />
      </div>
    );
  }

  const rowProps = {
    highlights: highlights ?? [],
    notes: notes ?? [],
    showVerseNumbers,
    showHighlights,
    showNoteSymbols,
    onSelectVerse: setActiveVerse,
    onHighlightClick: (id: number, x: number, y: number) => {
      const h = highlights?.find((hl) => hl.id === id);
      if (h) setActiveHighlight({ id, verseStart: h.verse_start, verseEnd: h.verse_end, x, y });
    },
    onNoteSymbolClick: (note: Note) =>
      setNoteTarget({ verseStart: note.verse_start, verseEnd: note.verse_end, highlightId: note.highlight_id ?? undefined, existing: note }),
    onFootnoteClick: (footnote: Footnote, x: number, y: number) => setActiveFootnote({ footnote, x, y }),
    onContextMenu: (verseNum: number, x: number, y: number) => {
      setActiveVerse(verseNum);
      setVerseMenu({ verseNum, x, y });
    },
  };

  return (
    <div className="flex h-full flex-col">
      {toolbar}
      <div className="flex min-h-0 flex-1">
        <div ref={containerRef} onMouseUp={handleMouseUp} className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
          <div className="mx-auto w-full max-w-[70ch]">
            <h1 className="reading-font mb-1 text-2xl font-semibold text-ink">
              {book.name} {chapter}
            </h1>
            {!distractionFreeMode && hasRelated && (
              <div className="mb-4 flex flex-wrap items-center gap-1.5 text-sm">
                <span className="mr-1 text-xs font-medium uppercase tracking-wide text-ink-3">Related</span>
                {resourceLinks?.map((l) => (
                  <Button key={l.id} size="sm" variant="secondary" icon={Paperclip} onClick={() => navigate(`/resources/${l.resource_id}`)}>
                    {l.label ?? allResources?.find((r) => r.id === l.resource_id)?.title ?? `Resource #${l.resource_id}`}
                  </Button>
                ))}
                {shownSuggested.map((r) => (
                  <Button key={r.id} size="sm" variant="ghost" icon={Sparkles} onClick={() => navigate(`/resources/${r.id}`)} title="Suggested by topic tag">
                    {r.title}
                  </Button>
                ))}
                {hiddenSuggested > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => setShowAllSuggested(true)}>
                    +{hiddenSuggested} more
                  </Button>
                )}
              </div>
            )}
            {!hasRelated && <div className="mb-4" />}

            {versesLoading && <LoadingState className="py-4" />}
            {verses && verses.length === 0 && (
              <p className="text-sm text-ink-3">This translation does not include {book.name} {chapter}. Pick another translation in the toolbar.</p>
            )}

            {paragraphMode || printing ? (
              <div id="print-chapter" className="reading-font text-ink" style={typography}>
                {paragraphMode ? (
                  <ParagraphVerses
                    verses={verses ?? []}
                    footnotesByVerse={footnotes}
                    activeVerse={activeVerse}
                    redLetterSpansByVerse={redLetterSpansByVerse}
                    {...rowProps}
                  />
                ) : (
                  (verses ?? []).map((v) => (
                    <VerseRow
                      key={v.id}
                      verse={v}
                      footnotes={footnotes?.[v.verse]}
                      isActive={false}
                      redLetterSpans={redLetterSpansByVerse?.get(v.verse)}
                      {...rowProps}
                    />
                  ))
                )}
              </div>
            ) : (
              <div id="print-chapter" className="text-ink" style={{ position: "relative", height: rowVirtualizer.getTotalSize(), ...typography }}>
                {rowVirtualizer.getVirtualItems().map((item) => {
                  const v = verses![item.index];
                  return (
                    <div
                      key={v.id}
                      ref={rowVirtualizer.measureElement}
                      data-index={item.index}
                      style={{ position: "absolute", top: 0, left: 0, right: 0, transform: `translateY(${item.start}px)` }}
                    >
                      <VerseRow
                        verse={v}
                        footnotes={footnotes?.[v.verse]}
                        isActive={activeVerse === v.verse}
                        ttsActive={ttsSourceKind === "scripture" && ttsCurrentSegmentId === v.verse}
                        redLetterSpans={redLetterSpansByVerse?.get(v.verse)}
                        {...rowProps}
                      />
                    </div>
                  );
                })}
              </div>
            )}
            <div className="h-24" />
          </div>
        </div>

        {!distractionFreeMode && (
          <DockPanel
            open={commentaryPanelOpen}
            onToggle={toggleCommentaryPanel}
            width={commentaryPanelWidth}
            onWidthChange={setCommentaryPanelWidth}
            side={commentaryPanelSide}
            onSideChange={setCommentaryPanelSide}
            rail={visibleTabs.map((t) => (
              <IconButton key={t.key} icon={t.icon} label={t.title} active={false} onClick={() => openPanelTab(t.key)} />
            ))}
            header={
              <Tabs
                size="sm"
                stretch
                bare
                hideLabels={commentaryPanelWidth < 460}
                items={visibleTabs.map((t) => ({ key: t.key, label: t.label, icon: t.icon, title: t.title }))}
                value={visibleTabs.some((t) => t.key === rightPanelTab) ? rightPanelTab : "commentary"}
                onChange={setRightPanelTab}
              />
            }
          >
            <div className="min-h-0 flex-1">
              {rightPanelTab === "commentary" && (
                <CommentaryPanel
                  book={book}
                  chapter={chapter}
                  activeVerse={activeVerse}
                  onJumpToVerse={(c, v) => goTo({ bookId: book.id, chapter: c, verse: v })}
                  onJumpToRef={jumpToRef}
                />
              )}
              {rightPanelTab === "crossrefs" && <CrossReferencesPanel book={book} chapter={chapter} activeVerse={activeVerse} />}
              {rightPanelTab === "confession" && <ConfessionForPassagePanel book={book} chapter={chapter} activeVerse={activeVerse} />}
              {rightPanelTab === "metrical" && book.id === 19 && <MetricalPsalmPanel psalm={chapter} />}
            </div>
          </DockPanel>
        )}
      </div>

      {distractionFreeMode && (
        <Button
          variant="secondary"
          size="sm"
          icon={Minimize2}
          onClick={toggleDistractionFreeMode}
          title="Exit focus mode (Esc)"
          className="fixed right-4 top-4 z-40 shadow-lg"
        >
          Exit focus
        </Button>
      )}

      {pending && (
        <SelectionToolbar
          x={pending.x}
          y={pending.y}
          onPickColor={(c) => commitHighlight("highlight", c)}
          onUnderline={(c) => commitHighlight("underline", c)}
          onAddNote={() => {
            setNoteTarget({ verseStart: pending.verseStart, verseEnd: pending.verseEnd });
            setPending(null);
          }}
          onCopy={() => {
            const text =
              pending.charStart != null && pending.charEnd != null
                ? verseText(pending.verseStart).slice(pending.charStart, pending.charEnd)
                : joinVerses(verses, pending.verseStart, pending.verseEnd);
            const ref = formatRef([book], toPassageRef(book.id, chapter, pending.verseStart, pending.verseEnd));
            copyWithReference(text, ref);
            toast.success(`Copied ${ref}`);
            window.getSelection()?.removeAllRanges();
            setPending(null);
          }}
          onClose={() => setPending(null)}
        />
      )}

      {verseMenu && (
        <VerseContextMenu
          x={verseMenu.x}
          y={verseMenu.y}
          verseLabel={`${book.name} ${chapter}:${verseMenu.verseNum}`}
          isBookmarked={!!verseMenuBookmark}
          onHighlight={(color) => commitHighlight("highlight", color, { verseStart: verseMenu.verseNum, verseEnd: verseMenu.verseNum })}
          onUnderline={(color) => commitHighlight("underline", color, { verseStart: verseMenu.verseNum, verseEnd: verseMenu.verseNum })}
          onNote={() => setNoteTarget({ verseStart: verseMenu.verseNum, verseEnd: verseMenu.verseNum })}
          onCompare={() => setCompareVerse(verseMenu.verseNum)}
          onCopy={() => {
            const ref = `${book.name} ${chapter}:${verseMenu.verseNum}`;
            copyWithReference(verseText(verseMenu.verseNum), ref);
            toast.success(`Copied ${ref}`);
          }}
          onMemorize={() => {
            createMemoryVerse.mutate(
              {
                bookId: book.id,
                chapter,
                verseStart: verseMenu.verseNum,
                verseEnd: verseMenu.verseNum,
                translationId: primaryTranslationId ?? undefined,
                mode: "first-letter",
              },
              {
                onSuccess: () =>
                  toast.success(`Added ${book.name} ${chapter}:${verseMenu.verseNum} to Scripture memory`, {
                    label: "Open Memory",
                    onClick: () => navigate("/memory"),
                  }),
              },
            );
          }}
          onBookmark={() => {
            const ref = `${book.name} ${chapter}:${verseMenu.verseNum}`;
            if (verseMenuBookmark) {
              deleteBookmark.mutate(verseMenuBookmark.id, { onSuccess: () => toast.info(`Bookmark removed: ${ref}`) });
            } else {
              createBookmark.mutate({ bookId: book.id, chapter, verse: verseMenu.verseNum }, { onSuccess: () => toast.success(`Bookmarked ${ref}`) });
            }
          }}
          onClose={() => setVerseMenu(null)}
        />
      )}

      {compareVerse != null && <CompareVerseModal book={book} chapter={chapter} verse={compareVerse} onClose={() => setCompareVerse(null)} />}

      {activeFootnote && (
        <FootnotePopup
          marker={activeFootnote.footnote.marker}
          text={activeFootnote.footnote.text}
          x={activeFootnote.x}
          y={activeFootnote.y}
          onClose={() => setActiveFootnote(null)}
        />
      )}

      {activeHighlight && (
        <HighlightPopup
          x={activeHighlight.x}
          y={activeHighlight.y}
          hasNote={!!activeHighlightNote}
          onPickColor={(color) => {
            updateHighlight.mutate({ id: activeHighlight.id, color, style: "highlight" });
            setActiveHighlight(null);
          }}
          onUnderline={(color) => {
            updateHighlight.mutate({ id: activeHighlight.id, color, style: "underline" });
            setActiveHighlight(null);
          }}
          onNote={() => {
            setNoteTarget({
              verseStart: activeHighlight.verseStart,
              verseEnd: activeHighlight.verseEnd,
              highlightId: activeHighlight.id,
              existing: activeHighlightNote,
            });
            setActiveHighlight(null);
          }}
          onRemove={() => {
            const id = activeHighlight.id;
            deleteHighlight.mutate(id, { onSuccess: () => toast.info("Highlight removed") });
            setActiveHighlight(null);
          }}
          onClose={() => setActiveHighlight(null)}
        />
      )}

      {noteTarget && position && (
        <NoteEditorModal
          title={`Note on ${book.name} ${chapter}:${noteTarget.verseStart}${noteTarget.verseEnd !== noteTarget.verseStart ? `-${noteTarget.verseEnd}` : ""}`}
          initialBody={noteTarget.existing?.body}
          onSave={(body) => {
            if (noteTarget.existing) {
              updateNote.mutate({ id: noteTarget.existing.id, body }, { onSuccess: () => toast.success("Note saved") });
            } else {
              createNote.mutate(
                {
                  bookId: position.bookId,
                  chapter: position.chapter,
                  verseStart: noteTarget.verseStart,
                  verseEnd: noteTarget.verseEnd,
                  body,
                  highlightId: noteTarget.highlightId,
                },
                { onSuccess: () => toast.success("Note saved") },
              );
            }
            setNoteTarget(null);
          }}
          onDelete={
            noteTarget.existing
              ? () => {
                  const id = noteTarget.existing!.id;
                  deleteNote.mutate(id, { onSuccess: () => trashToast("note", id) });
                  setNoteTarget(null);
                }
              : undefined
          }
          onClose={() => setNoteTarget(null)}
        />
      )}

      {chapterNoteOpen && position && (
        <Modal title={`Chapter notes · ${book.name} ${chapter}`} onClose={() => setChapterNoteOpen(false)} size="md">
          <div className="space-y-3">
            {chapterNotes?.map((n) => (
              <ChapterNoteItem
                key={n.id}
                body={n.body}
                onSave={(body) => updateChapterNote.mutate({ id: n.id, body }, { onSuccess: () => toast.success("Note saved") })}
                onDelete={async () => {
                  if (await confirmTrash("this chapter note")) deleteChapterNote.mutate(n.id, { onSuccess: () => trashToast("chapter_note", n.id) });
                }}
              />
            ))}
            <ChapterNoteItem
              body=""
              placeholder="Add a note for this whole chapter…"
              onSave={(body) => {
                if (body.trim()) createChapterNote.mutate({ bookId: position.bookId, chapter: position.chapter, body }, { onSuccess: () => toast.success("Note saved") });
              }}
              clearAfterSave
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

function ChapterNoteItem({
  body,
  placeholder,
  onSave,
  onDelete,
  clearAfterSave,
}: {
  body: string;
  placeholder?: string;
  onSave: (body: string) => void;
  onDelete?: () => void;
  clearAfterSave?: boolean;
}) {
  const isNew = !onDelete;
  const [editing, setEditing] = useState(isNew);
  const [value, setValue] = useState(body);

  if (!editing) {
    return (
      <div className="rounded-lg border border-line p-3">
        <NoteBody body={body} className="block whitespace-pre-wrap text-sm text-ink-2" />
        <div className="mt-2 flex justify-end gap-1">
          {onDelete && (
            <Button size="sm" variant="danger-ghost" onClick={onDelete}>
              Delete
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cx("rounded-lg p-3", isNew ? "border border-dashed border-line-2" : "border border-line")}>
      <RichTextEditor content={value} onChange={setValue} placeholder={placeholder} autoFocus={!isNew} />
      <div className="mt-2 flex justify-end gap-1">
        {!isNew && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        )}
        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            onSave(value);
            if (clearAfterSave) setValue("");
            if (!isNew) setEditing(false);
          }}
        >
          {isNew ? "Add note" : "Save"}
        </Button>
      </div>
    </div>
  );
}
