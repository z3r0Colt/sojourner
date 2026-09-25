import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Bookmark, BookmarkCheck, Columns2, Languages, Maximize2, MoreHorizontal, Paperclip, Printer, SlidersHorizontal, Sparkles, Square, StickyNote, TextSearch, Type, Volume2 } from "lucide-react";
import { THEME_OPTIONS, useReadingTypography, useUiStore } from "../../state/uiStore";
import { resolveBiblePane, useWorkspaceStore } from "../../state/workspaceStore";
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
  useSermonsForChapter,
  useResources,
  useFootnotesForChapter,
  useInterlinearForChapter,
  useMorphologyForChapter,
  useRedLetterRanges,
  useTranslations,
  useTrashToast,
  useBacklinks,
} from "../../api/queries";
import { useNoteRefExtractor } from "../../lib/noteLinks";
import { useSetting } from "../../hooks/useSetting";
import { StrongsPopup } from "../lexicon/StrongsPopup";
import { matchOriginalStrongs, matchStrongs, wordFromSelection, type WordAtPoint } from "./wordLookup";
import { api } from "../../api/client";
import { VerseRow } from "./VerseRow";
import { SelectionToolbar } from "./SelectionToolbar";
import { HighlightPopup } from "./HighlightPopup";
import { VerseContextMenu } from "./VerseContextMenu";
import { CompareVerseModal } from "./CompareVerseModal";
import { FootnotePopup } from "./FootnotePopup";
import { NoteEditorModal } from "../notes/NoteEditorModal";
import { NoteBody } from "../notes/NoteBody";
import { RichTextEditor } from "../notes/RichTextEditor";
import { ParagraphVerses } from "./ParagraphReadingView";
import { ChapterNav } from "./ChapterNav";
import { ChapterEndCard } from "./ChapterEndCard";
import { BookmarksMenu } from "./BookmarksMenu";
import { FindBar } from "./FindBar";
import { findMatches, findRangesByVerse } from "./findMatches";
import { computeRedLetterSpans } from "./redLetterSpans";
import { groupTranslations } from "./translationGroups";
import { sendToSermon } from "../sermons/sendToSermon";
import { captureIllustration } from "../sermons/illustrationCapture";
import { crossrefRef } from "../sermons/sourceIdentity";
import { SermonChipsForChapter } from "../sermons/SermonsForChapter";
import { closestWithAttr, textOffsetWithin } from "../../lib/domOffsets";
import { useCopyPassage } from "../../lib/clipboard";
import { ReadAloudButton } from "../tts/ReadAloudButton";
import { registerQueueEndHandler, useTtsReadingHere, useTtsStore } from "../../state/ttsStore";
import { stepChapter } from "./chapterStep";
import { zoomText } from "./zoom";
import { isDialogOpen, isTypingTarget, verseKeyAction } from "../../lib/keyboard";
import { Button, IconButton } from "../../components/ui/Button";
import { Popover, PopoverItem, PopoverLabel } from "../../components/ui/Popover";
import { Modal } from "../../components/ui/Modal";
import { LoadingState } from "../../components/ui/EmptyState";
import { toast } from "../../components/ui/toast";
import { confirmTrash } from "../../components/ui/confirm";
import { checkboxClass, cx, selectSmClass } from "../../components/ui/classes";
import { formatRef, joinVerses, toPassageRef } from "../../lib/passage";
import { usePane, usePaneNavigate, usePaneParams } from "../../workspace/PaneContext";
import { openContent, openPassage, targetFor } from "../../workspace/openContent";
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

/** The Bible chapter view, living in a pane. Everything about *what* is
 * shown (translation, chapter, selected verse, paragraph and red-letter
 * modes) is the pane's; everything about *how* it is shown (text size,
 * font, theme, highlights, note markers) is global. */
export function ReadingPane() {
  const { id: paneId, isFocused, width: paneWidth } = usePane();
  const queryClient = useQueryClient();
  const compact = paneWidth > 0 && paneWidth < 520;
  const narrow = paneWidth > 0 && paneWidth < 820;
  const [params, setParams] = usePaneParams("bible");
  const { translationId, bookId, chapter, verse: scrollTarget, activeVerse, paragraphMode, redLetterMode, findQuery } = params;
  const paneNavigate = usePaneNavigate();
  const ready = useWorkspaceStore((s) => s.ready);
  const setLastTranslation = useWorkspaceStore((s) => s.setLastTranslation);
  const publishPassage = useWorkspaceStore((s) => s.publishPassage);

  const { data: books } = useBooks();
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
    showHighlights,
    toggleShowHighlights,
    showNoteSymbols,
    toggleShowNoteSymbols,
    distractionFreeMode,
  } = useUiStore();
  const typography = useReadingTypography();
  const book = books?.find((b) => b.id === bookId) ?? null;

  const { data: translations } = useTranslations();
  // Greek and Hebrew texts take their own font, and Hebrew reads right to left.
  const currentTranslation = translations?.find((t) => t.id === translationId);
  const originalText = !!currentTranslation && currentTranslation.script !== "latin";

  // A pane with no translation yet (fresh install), or one whose translation
  // was removed from the library, falls back to the KJV or the first one.
  useEffect(() => {
    if (!translations || translations.length === 0) return;
    if (translationId != null && translations.some((t) => t.id === translationId)) return;
    const preferred = translations.find((t) => t.code === "KJV") ?? translations[0];
    setParams({ translationId: preferred.id });
  }, [translations, translationId, setParams]);

  useEffect(() => {
    if (translationId != null) setLastTranslation(translationId);
  }, [translationId, setLastTranslation]);

  // Linked panes follow this one's chapter and selected verse. Only actual
  // changes publish, never the mount itself (a restored workspace must not
  // have its panes overwrite each other in mount order), and the check is
  // by value so StrictMode's remount does not slip through either.
  const lastPublished = useRef({ bookId, chapter, activeVerse });
  useEffect(() => {
    const last = lastPublished.current;
    if (last.bookId === bookId && last.chapter === chapter && last.activeVerse === activeVerse) return;
    lastPublished.current = { bookId, chapter, activeVerse };
    publishPassage(paneId, { bookId, chapter, verse: activeVerse });
  }, [paneId, bookId, chapter, activeVerse, publishPassage]);

  const { data: verses, isLoading: versesLoading } = useChapter(translationId, bookId, chapter);
  const { data: highlights } = useHighlights(bookId, chapter);
  const { data: notes } = useNotesForChapter(bookId, chapter);
  const { data: chapterNotes } = useChapterNotes(bookId, chapter);
  // Backlinks (F2.2): verses that notes elsewhere mention get a faint dot
  // by their number; the "Mine" pane lists the notes themselves.
  const { data: backlinks } = useBacklinks(bookId, chapter);
  const backlinkVerses = useMemo(() => {
    const set = new Set<number>();
    for (const b of backlinks ?? []) {
      if (b.ref_verse_start == null) continue;
      for (let v = b.ref_verse_start; v <= (b.ref_verse_end ?? b.ref_verse_start); v++) set.add(v);
    }
    return set;
  }, [backlinks]);
  // "Cited in your library": a small count beside each verse the installed
  // shelves (and the reader's own books) cite.
  const { data: citationCountRows } = useQuery({
    queryKey: ["citationCounts", bookId, chapter],
    queryFn: () => api.citationCountsForChapter(bookId, chapter),
    staleTime: 5 * 60_000,
  });
  const citationCounts = useMemo(() => new Map(citationCountRows ?? []), [citationCountRows]);
  const extractNoteRefs = useNoteRefExtractor();
  const { data: resourceLinks } = useResourcePassageLinksForChapter(bookId, chapter);
  const { data: allResources } = useResources();
  const { data: suggestedResources } = useSuggestedResourcesForPassage(bookId, chapter);
  const { data: sermonsHere } = useSermonsForChapter(bookId, chapter);
  const { data: footnotes } = useFootnotesForChapter(translationId, bookId, chapter);
  const { data: redLetterRanges } = useRedLetterRanges(redLetterMode ? bookId : null, chapter);
  const { data: bookmarks } = useBookmarks();
  function isRedLetterVerse(verseNum: number) {
    return !!redLetterRanges?.some((r) => verseNum >= r.verse_start && verseNum <= r.verse_end);
  }
  // WEB is the translation the red-letter ranges were derived from (see
  // red_letter.rs), and it punctuates dialogue with quotes -- so it stands in
  // as a reference for sub-verse span position when the translation actually
  // being read doesn't use quotation marks at all (KJV, ASV, Darby, Geneva,
  // Tyndale, Webster's, YLT, Douay-Rheims). Skipped entirely for
  // WEB itself, since it needs no help locating its own quotes.
  const webTranslationId = translations?.find((t) => t.code === "WEB")?.id ?? null;
  const needsRedLetterReference = redLetterMode && webTranslationId != null && webTranslationId !== translationId;
  const { data: redLetterReferenceVerses } = useChapter(needsRedLetterReference ? webTranslationId : null, bookId, chapter);
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
  const copyPassage = useCopyPassage();
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
  const [textModalOpen, setTextModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Find in chapter (F1.2). The query is a pane param (per pane, persisted
  // with the workspace; undefined while the bar is closed); the whole-word
  // toggle and the current match are this pane's own state.
  const findOpen = findQuery !== undefined;
  const [findWholeWord, setFindWholeWord] = useState(false);
  const [findIndex, setFindIndex] = useState(0);
  const [findFocusToken, setFindFocusToken] = useState(0);

  // Double-click word lookup (F1.4). The chapter's interlinear phrases are
  // fetched only once a word has been asked for, then matched by wording;
  // outside the KJV a miss shows a one-time hint (a setting, so dismissing
  // it survives a reinstall).
  const [wordLookup, setWordLookup] = useState<(WordAtPoint & { x: number; y: number }) | null>(null);
  // An English text is matched through the KJV-tagged interlinear; a Greek
  // or Hebrew one through the tagged words of the text itself.
  const lookupEnglish = !!wordLookup && !originalText;
  const lookupOriginal = !!wordLookup && originalText;
  const { data: interlinear, isLoading: interlinearLoading } = useInterlinearForChapter(lookupEnglish ? bookId : null, lookupEnglish ? chapter : null);
  const { data: morphology, isLoading: morphologyLoading } = useMorphologyForChapter(lookupOriginal ? bookId : null, lookupOriginal ? chapter : null);
  const [kjvHintDismissed, setKjvHintDismissed] = useSetting<boolean>("word_lookup_kjv_hint_dismissed", false);
  const wordStrongs = !wordLookup
    ? null
    : lookupOriginal
      ? morphology
        ? matchOriginalStrongs(wordLookup.word, wordLookup.occurrence, morphology[wordLookup.verse] ?? [])
        : null
      : interlinear
        ? matchStrongs(wordLookup.word, wordLookup.occurrence, interlinear[wordLookup.verse] ?? [])
        : null;
  // A proper name: who the verse means by it, from the Factbook.
  const looksLikeName = !!wordLookup && /^\p{Lu}/u.test(wordLookup.word.trim().replace(/^[^\p{L}]+/u, ""));
  const { data: factbookHit } = useQuery({
    queryKey: ["factbookForWord", bookId, chapter, wordLookup?.verse, wordLookup?.word, wordStrongs],
    queryFn: () => api.getFactbookForWord(bookId, chapter, wordLookup!.verse, wordLookup!.word, wordStrongs),
    enabled: !!wordLookup && (looksLikeName || originalText),
  });
  const translationCode = translations?.find((t) => t.id === translationId)?.code;
  const showKjvHint = lookupEnglish && !!interlinear && !wordStrongs && translationCode !== "KJV" && !kjvHintDismissed;

  useEffect(() => {
    if (!wordLookup) return;
    function onMouseDown() {
      setWordLookup(null);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setWordLookup(null);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [wordLookup]);
  useEffect(() => {
    setWordLookup(null);
  }, [bookId, chapter, translationId]);

  function handleDoubleClick() {
    const at = wordFromSelection(window.getSelection());
    if (!at) return;
    const rect = window.getSelection()!.getRangeAt(0).getBoundingClientRect();
    window.getSelection()?.removeAllRanges();
    setPending(null);
    setWordLookup({ ...at, x: rect.left, y: rect.bottom + 4 });
  }

  /** "Search the lexicon for ‘word’": in the lexicon pane if one is open,
   * else a new pane beside this one (as Interlinear does). */
  function searchLexicon(word: string) {
    const s = useWorkspaceStore.getState();
    const existing = s.panes.find((p) => p.kind === "lexicon");
    if (existing) openContent("lexicon", { id: null, query: word }, { target: existing.id });
    else openContent("lexicon", { id: null, query: word }, { target: "new", from: paneId });
    setWordLookup(null);
  }

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

  const setActiveVerse = (v: number | null) => {
    setParams({ activeVerse: v });
    // Choosing a verse while this pane is reading aloud moves the reader to
    // it, so the voice can be steered by pointing at the text rather than by
    // tapping Next as many times as it takes.
    if (v == null) return;
    const tts = useTtsStore.getState();
    if (tts.sourceKind !== "scripture" || tts.paneId !== paneId || tts.segments.length === 0) return;
    const index = tts.segments.findIndex((segment) => segment.id === v);
    if (index >= 0 && index !== tts.currentSegmentIndex) tts.seek(index);
  };

  const matches = useMemo(() => (findOpen && verses && !printing ? findMatches(verses, findQuery, findWholeWord) : []), [findOpen, verses, findQuery, findWholeWord, printing]);
  const currentFind = matches.length === 0 ? -1 : Math.min(findIndex, matches.length - 1);
  const findByVerse = useMemo(() => findRangesByVerse(matches, currentFind), [matches, currentFind]);

  function openFind() {
    if (!findOpen) setParams({ findQuery: "" });
    else setFindFocusToken((t) => t + 1);
  }
  function closeFind() {
    setParams({ findQuery: undefined });
    setFindIndex(0);
  }
  function stepFind(direction: 1 | -1) {
    if (matches.length === 0) return;
    setFindIndex((currentFind + direction + matches.length) % matches.length);
  }

  // Ctrl+G opens (or refocuses) the find bar of the Bible pane the reader is
  // working in: this pane handles it only when it is that pane, so two
  // Bible panes never both react. Page-scoped, so it lives here rather than
  // in the shell.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== "g") return;
      if (resolveBiblePane(useWorkspaceStore.getState())?.id !== paneId) return;
      e.preventDefault();
      openFind();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  // Keyboard verse navigation (F1.8). Arrows and j/k move the selected
  // verse and keep it in view (linked panes follow through publishPassage),
  // Home and End jump to the chapter's ends, Enter opens the verse menu at
  // the verse number. Only the Bible pane the reader is working in handles
  // it, so two Bible panes never both move; nothing happens while typing,
  // while a dialog, menu, or popup is up, or while a control has focus and
  // Enter would mean "press it".
  function firstVisibleVerse(): number | null {
    const container = containerRef.current;
    if (!container) return null;
    const top = container.getBoundingClientRect().top;
    for (const row of container.querySelectorAll<HTMLElement>("[data-verse-row]")) {
      if (row.getBoundingClientRect().bottom > top + 1) return Number(row.dataset.verseRow);
    }
    return null;
  }
  function revealVerse(v: number) {
    if (!verses) return;
    if (!paragraphMode) {
      const index = verses.findIndex((x) => x.verse === v);
      if (index >= 0) rowVirtualizer.scrollToIndex(index, { align: "auto" });
    }
    containerRef.current?.querySelector(`[data-verse-row="${v}"]`)?.scrollIntoView({ block: "nearest" });
  }
  /** Opens the verse menu beside the verse number (or the row when the
   * numbers are hidden), waiting a few frames for a virtualized row to mount. */
  function openVerseMenuFor(v: number, tries = 0) {
    const row = containerRef.current?.querySelector<HTMLElement>(`[data-verse-row="${v}"]`);
    if (!row) {
      if (tries < 6) window.setTimeout(() => openVerseMenuFor(v, tries + 1), 40);
      return;
    }
    const numberButton = row.querySelector<HTMLElement>("button[aria-label^='Verse ']");
    const rect = (numberButton ?? row).getBoundingClientRect();
    setVerseMenu(paragraphMode ? { verseNum: v, x: rect.left, y: rect.bottom + 2 } : { verseNum: v, x: rect.right + 4, y: rect.top });
  }
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const action = verseKeyAction(e);
      if (!action || isTypingTarget(e.target)) return;
      if (verseMenu || pending || activeHighlight || noteTarget || wordLookup || activeFootnote || isDialogOpen()) return;
      if (action === "open" && document.activeElement && document.activeElement !== document.body && document.activeElement !== containerRef.current) return;
      if (resolveBiblePane(useWorkspaceStore.getState())?.id !== paneId) return;
      if (!verses || verses.length === 0) return;
      e.preventDefault();
      const currentIndex = activeVerse != null ? verses.findIndex((x) => x.verse === activeVerse) : -1;
      let target: number;
      if (action === "first") target = verses[0].verse;
      else if (action === "last") target = verses[verses.length - 1].verse;
      else if (currentIndex < 0) target = firstVisibleVerse() ?? verses[0].verse;
      else if (action === "open") target = verses[currentIndex].verse;
      else target = verses[Math.max(0, Math.min(verses.length - 1, currentIndex + (action === "next" ? 1 : -1)))].verse;
      setActiveVerse(target);
      revealVerse(target);
      if (action === "open") openVerseMenuFor(target);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  // Ctrl+scroll over the text steps the (global) text size, like Ctrl+= and
  // Ctrl+- (F1.7). A native listener, because React registers wheel as
  // passive and the WebView's own page zoom must be prevented. One step per
  // 80 ms so a single flick of the wheel is one step, not five.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let last = 0;
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey || e.deltaY === 0) return;
      e.preventDefault();
      const now = performance.now();
      if (now - last < 80) return;
      last = now;
      zoomText(e.deltaY < 0 ? 1 : -1);
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // The scroll container only exists once the book is known (see the
    // loading return below), so attach again when that changes.
  }, [book]);

  // Bring the current match into view. Rows are virtualized, so first ask
  // the virtualizer for the verse, then (once the row has mounted) nudge the
  // mark itself into view; paragraph mode renders everything, so the mark
  // is there at once.
  useEffect(() => {
    if (currentFind < 0 || !verses) return;
    const match = matches[currentFind];
    if (!paragraphMode) {
      const index = verses.findIndex((v) => v.verse === match.verse);
      if (index >= 0) rowVirtualizer.scrollToIndex(index, { align: "auto" });
    }
    let tries = 0;
    let timer: number | null = null;
    function reveal() {
      const el = containerRef.current?.querySelector("[data-find-current]");
      if (el) {
        el.scrollIntoView({ block: "nearest" });
        return;
      }
      if (tries++ < 8) timer = window.setTimeout(reveal, 40);
    }
    timer = window.setTimeout(reveal, 0);
    return () => {
      if (timer != null) window.clearTimeout(timer);
    };
  }, [currentFind, matches, verses, paragraphMode, rowVirtualizer]);

  const ttsHere = useTtsReadingHere(paneId, "scripture");
  const ttsCurrentSegmentId = useTtsStore((s) => (ttsHere ? (s.segments[s.currentSegmentIndex]?.id ?? null) : null));
  useEffect(() => {
    if (ttsHere && typeof ttsCurrentSegmentId === "number") {
      setParams({ activeVerse: ttsCurrentSegmentId });
    }
  }, [ttsHere, ttsCurrentSegmentId, setParams]);

  // Auto-continue (F1.9). When the chapter this pane is reading aloud runs
  // out and "Continue into the next chapter" is on, the store asks this pane
  // (and only this pane: the handler is keyed by pane id) to turn the page.
  // The page turns without stealing focus from wherever the reader is
  // working; once the next chapter's verses are in, reading resumes with
  // them and the player bar shows the new title. At the end of Revelation
  // the handler declines and reading simply stops.
  const autoRead = useRef<{ bookId: number; chapter: number } | null>(null);
  useEffect(
    () =>
      registerQueueEndHandler(paneId, () => {
        if (!books) return false;
        const next = stepChapter(books, { bookId, chapter }, 1);
        if (!next) return false;
        autoRead.current = next;
        const s = useWorkspaceStore.getState();
        s.setPaneContent(paneId, { kind: "bible", params: { ...params, bookId: next.bookId, chapter: next.chapter, verse: undefined, activeVerse: null } });
        s.publishPassage(paneId, { bookId: next.bookId, chapter: next.chapter, verse: null });
        return true;
      }),
    [paneId, books, bookId, chapter, params],
  );
  useEffect(() => {
    const want = autoRead.current;
    if (!want || want.bookId !== bookId || want.chapter !== chapter || !verses || !book) return;
    autoRead.current = null;
    const tts = useTtsStore.getState();
    if (verses.length === 0) {
      tts.stop();
      return;
    }
    tts.start(
      `${book.name} ${chapter}`,
      "scripture",
      verses.map((v) => ({ id: v.verse, text: v.text, label: `Verse ${v.verse}` })),
      { paneId },
    );
  }, [bookId, chapter, verses, book, paneId]);

  // Turning to another chapter while this pane is reading aloud takes the
  // voice with it, instead of leaving it reading a chapter that is no longer
  // on the screen. Landing on a particular verse -- a cross-reference, a
  // search result -- starts the reading there.
  //
  // Not while paused: a paused player belongs to someone who is reading with
  // their eyes, and turning the page should not start talking at them. And
  // not for auto-continue's own page turn, which the effect above finishes.
  const ttsTitle = useTtsStore((s) => (ttsHere ? s.title : null));
  const ttsRunning = useTtsStore((s) => s.isPlaying && !s.isPaused);
  useEffect(() => {
    if (!ttsHere || !ttsRunning || autoRead.current || !verses || !book) return;
    const here = `${book.name} ${chapter}`;
    if (ttsTitle === here) return;
    const tts = useTtsStore.getState();
    if (tts.continuing) return;
    if (verses.length === 0) {
      tts.stop();
      return;
    }
    const startIndex = scrollTarget != null ? verses.findIndex((v) => v.verse === scrollTarget) : 0;
    tts.start(here, "scripture", verses.map((v) => ({ id: v.verse, text: v.text, label: `Verse ${v.verse}` })), {
      paneId,
      startIndex: Math.max(0, startIndex),
    });
  }, [ttsHere, ttsRunning, ttsTitle, verses, book, chapter, paneId, scrollTarget]);

  // Scroll the target verse into view once verses are loaded. Rows are
  // virtualized, so the target row may not be mounted yet -- ask the
  // virtualizer to scroll to its index rather than querying the DOM.
  // Paragraph mode does not go through the virtualizer, so there the row is
  // found in the DOM instead; it is always mounted.
  useEffect(() => {
    if (scrollTarget == null || !verses) return;
    if (paragraphMode) {
      containerRef.current?.querySelector(`[data-verse-row="${scrollTarget}"]`)?.scrollIntoView({ block: "center" });
      return;
    }
    const index = verses.findIndex((v) => v.verse === scrollTarget);
    if (index >= 0) rowVirtualizer.scrollToIndex(index, { align: "center" });
  }, [scrollTarget, verses, rowVirtualizer, bookId, chapter, paragraphMode]);

  // A new chapter with no verse target starts at the top (the end-of-chapter
  // card and the chapter pickers both land here), not wherever the previous
  // chapter was scrolled to. Not on mount, so a restored pane keeps its place.
  const lastChapter = useRef({ bookId, chapter });
  useEffect(() => {
    const last = lastChapter.current;
    if (last.bookId === bookId && last.chapter === chapter) return;
    lastChapter.current = { bookId, chapter };
    if (scrollTarget == null) containerRef.current?.scrollTo({ top: 0 });
  }, [bookId, chapter, scrollTarget]);

  // Persist the reading position (debounced) whenever it changes -- only
  // from the focused Bible pane, and not before the shell has bootstrapped.
  // The save also logs the chapter for the day (F3.1), so a Today pane
  // open beside the text is told to refresh.
  useEffect(() => {
    if (!isFocused || !ready || translationId == null) return;
    const t = setTimeout(() => {
      api.setReadingPosition(translationId, bookId, chapter, activeVerse ?? undefined).then(() => {
        queryClient.invalidateQueries({ queryKey: ["readingPosition"] });
        queryClient.invalidateQueries({ queryKey: ["readingLog"] });
      });
    }, 400);
    return () => clearTimeout(t);
  }, [isFocused, ready, translationId, bookId, chapter, activeVerse, queryClient]);

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

  function handleMouseUp(e: React.MouseEvent) {
    // A double-click (or triple-click) is a word lookup, not a selection to
    // annotate; the toolbar stays out of its way.
    if (e.detail >= 2) return;
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
    const range = target ?? (pending ? { verseStart: pending.verseStart, verseEnd: pending.verseEnd } : null);
    if (!range) return;
    // Character offsets only apply to a selection within one verse; a
    // whole-verse action from the context menu has none.
    const charStart = target ? undefined : (pending?.charStart ?? undefined);
    const charEnd = target ? undefined : (pending?.charEnd ?? undefined);
    createHighlight.mutate({
      bookId,
      chapter,
      verseStart: range.verseStart,
      verseEnd: range.verseEnd,
      charStart,
      charEnd,
      color,
      style,
      translationId: translationId ?? undefined,
    });
    window.getSelection()?.removeAllRanges();
    setPending(null);
  }

  function verseText(verseNum: number) {
    return verses?.find((v) => v.verse === verseNum)?.text ?? "";
  }

  function openInterlinear() {
    const s = useWorkspaceStore.getState();
    const me = s.panes.find((p) => p.id === paneId);
    const existing = s.panes.find((p) => p.kind === "interlinear" && p.linkGroup != null && p.linkGroup === me?.linkGroup);
    if (existing) s.focusPane(existing.id);
    else openContent("interlinear", { bookId, chapter, verse: activeVerse }, { target: "new", from: paneId });
  }

  function enterFocusMode() {
    useWorkspaceStore.getState().setMaximized(paneId);
    useUiStore.getState().setDistractionFreeMode(true);
  }

  const activeHighlightNote = activeHighlight ? notes?.find((n) => n.highlight_id === activeHighlight.id) : undefined;

  if (!book) {
    return <LoadingState className="p-8" label="Opening your last reading position…" />;
  }

  const verseMenuBookmark =
    verseMenu != null ? bookmarks?.find((b) => b.book_id === book.id && b.chapter === chapter && b.verse === verseMenu.verseNum) : undefined;
  const suggested = suggestedResources?.filter((r) => !resourceLinks?.some((l) => l.resource_id === r.id)) ?? [];
  const shownSuggested = showAllSuggested ? suggested : suggested.slice(0, 3);
  const hiddenSuggested = suggested.length - shownSuggested.length;
  // A sermon preached from this chapter belongs in Related too (SB5.4).
  const hasRelated = (resourceLinks?.length ?? 0) > 0 || suggested.length > 0 || (sermonsHere?.some((s) => s.role === "text") ?? false);
  const chapterNoteCount = chapterNotes?.length ?? 0;

  const textSettings = (
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
          <Button size="sm" active={readingFont === "dyslexic"} onClick={() => setReadingFont("dyslexic")} className="flex-1" title="OpenDyslexic, a font shaped to keep letters from flipping or swapping">
            Dyslexia-friendly
          </Button>
        </div>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-3">Theme</span>
        <select value={theme} onChange={(e) => setTheme(e.target.value as typeof theme)} className={cx(selectSmClass, "w-full")}>
          {THEME_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );

  const viewOptions = (
    <>
      {[
        { label: "Paragraph mode", checked: paragraphMode, onChange: () => setParams({ paragraphMode: !paragraphMode }), hint: "Flowing prose instead of one verse per line" },
        { label: "Verse numbers", checked: showVerseNumbers, onChange: toggleVerseNumbers },
        { label: "Words of Jesus in red", checked: redLetterMode, onChange: () => setParams({ redLetterMode: !redLetterMode }) },
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
    </>
  );

  const compareItems = (close: () => void) =>
    translations
      ?.filter((t) => t.id !== translationId)
      .map((t) => (
        <PopoverItem
          key={t.id}
          onClick={() => {
            openContent("bible", { translationId: t.id, bookId, chapter, activeVerse }, { target: "new", from: paneId, link: true });
            close();
          }}
        >
          <span className="w-12 shrink-0 font-mono text-xs text-ink-3">{t.code}</span>
          <span className="truncate">{t.name}</span>
        </PopoverItem>
      ));

  const readAloudSegments = (verses ?? []).map((v) => ({ id: v.verse, text: v.text, label: `Verse ${v.verse}` }));
  const chapterBookmark = bookmarks?.find((b) => b.book_id === book.id && b.chapter === chapter && b.verse == null);
  const verseBookmark = activeVerse != null ? bookmarks?.find((b) => b.book_id === book.id && b.chapter === chapter && b.verse === activeVerse) : undefined;
  function toggleBookmark(verse: number | undefined, existing: { id: number } | undefined) {
    const label = `${book!.name} ${chapter}${verse ? `:${verse}` : ""}`;
    if (existing) deleteBookmark.mutate(existing.id, { onSuccess: () => toast.info(`Bookmark removed: ${label}`) });
    else createBookmark.mutate({ bookId: book!.id, chapter, verse }, { onSuccess: () => toast.success(`Bookmarked ${label}`) });
  }

  // Everything right of the translation picker folds into one overflow menu
  // below about 520px of pane width; between that and about 820px the two
  // labelled buttons drop their labels so the row still fits.
  const toolbar = !distractionFreeMode && books && (
    <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line bg-surface px-2">
      <ChapterNav books={books} position={{ bookId, chapter }} translationId={translationId} onNavigate={(p) => openPassage(p, { target: paneId })} />
      <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
      {translations && (
        <select aria-label="Translation" className={selectSmClass} value={translationId ?? ""} onChange={(e) => setParams({ translationId: Number(e.target.value) })}>
          {groupTranslations(translations).map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.translations.map((t) => (
                <option key={t.id} value={t.id} title={t.scope ? `${t.name} (${t.scope})` : t.name}>
                  {t.code}
                  {t.scope === "Old Testament" ? " (OT)" : t.scope === "New Testament" ? " (NT)" : t.scope ? " (partial)" : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      )}
      {compact ? (
        <>
          <div className="min-w-0 flex-1" />
          <Popover
            width="w-64"
            trigger={({ toggle, open }) => <IconButton icon={MoreHorizontal} label="More reading tools" active={open} onClick={toggle} />}
          >
            {(close) => (
              <>
                <PopoverItem
                  onClick={() => {
                    openFind();
                    close();
                  }}
                >
                  <TextSearch className="h-4 w-4 text-ink-3" aria-hidden="true" /> Find in this chapter
                </PopoverItem>
                <PopoverItem
                  onClick={() => {
                    openInterlinear();
                    close();
                  }}
                >
                  <Languages className="h-4 w-4 text-ink-3" aria-hidden="true" /> Interlinear in a new pane
                </PopoverItem>
                <PopoverItem
                  onClick={() => {
                    setChapterNoteOpen(true);
                    close();
                  }}
                >
                  <StickyNote className="h-4 w-4 text-ink-3" aria-hidden="true" /> Chapter notes{chapterNoteCount > 0 ? ` (${chapterNoteCount})` : ""}
                </PopoverItem>
                <PopoverItem
                  onClick={() => {
                    if (ttsHere) useTtsStore.getState().stop();
                    else useTtsStore.getState().start(`${book.name} ${chapter}`, "scripture", readAloudSegments, { paneId });
                    close();
                  }}
                >
                  {ttsHere ? <Square className="h-4 w-4 text-ink-3" aria-hidden="true" /> : <Volume2 className="h-4 w-4 text-ink-3" aria-hidden="true" />}
                  {ttsHere ? "Stop reading aloud" : "Read aloud"}
                </PopoverItem>
                <PopoverItem
                  onClick={() => {
                    toggleBookmark(undefined, chapterBookmark);
                    close();
                  }}
                >
                  {chapterBookmark ? <BookmarkCheck className="h-4 w-4 text-accent" aria-hidden="true" /> : <Bookmark className="h-4 w-4 text-ink-3" aria-hidden="true" />}
                  {chapterBookmark ? "Remove bookmark for this chapter" : "Bookmark this chapter"}
                </PopoverItem>
                {activeVerse != null && (
                  <PopoverItem
                    onClick={() => {
                      toggleBookmark(activeVerse, verseBookmark);
                      close();
                    }}
                  >
                    {verseBookmark ? <BookmarkCheck className="h-4 w-4 text-accent" aria-hidden="true" /> : <Bookmark className="h-4 w-4 text-ink-3" aria-hidden="true" />}
                    {verseBookmark ? `Remove bookmark for verse ${activeVerse}` : `Bookmark verse ${activeVerse}`}
                  </PopoverItem>
                )}
                <PopoverItem
                  onClick={() => {
                    setTextModalOpen(true);
                    close();
                  }}
                >
                  <Type className="h-4 w-4 text-ink-3" aria-hidden="true" /> Text, font, and theme…
                </PopoverItem>
                <PopoverItem
                  onClick={() => {
                    setViewModalOpen(true);
                    close();
                  }}
                >
                  <SlidersHorizontal className="h-4 w-4 text-ink-3" aria-hidden="true" /> View options…
                </PopoverItem>
                <PopoverItem
                  onClick={() => {
                    enterFocusMode();
                    close();
                  }}
                >
                  <Maximize2 className="h-4 w-4 text-ink-3" aria-hidden="true" /> Focus mode
                </PopoverItem>
                {translations && translations.length > 1 && (
                  <>
                    <div className="my-1 h-px bg-line" aria-hidden="true" />
                    <PopoverLabel>Compare in a new pane</PopoverLabel>
                    <div className="max-h-40 overflow-y-auto">{compareItems(close)}</div>
                  </>
                )}
              </>
            )}
          </Popover>
        </>
      ) : (
        <>
          {translations && (
            <Popover
              width="w-64"
              align="left"
              trigger={({ toggle, open }) =>
                narrow ? (
                  <IconButton icon={Columns2} label="Compare: open this chapter in another translation beside this one" active={open} onClick={toggle} />
                ) : (
                  <Button size="sm" variant="ghost" icon={Columns2} active={open} onClick={toggle} title="Open this chapter in another translation beside this one">
                    Compare
                  </Button>
                )
              }
            >
              {(close) => (
                <>
                  <PopoverLabel>Compare in a new pane</PopoverLabel>
                  <div className="max-h-64 overflow-y-auto">{compareItems(close)}</div>
                </>
              )}
            </Popover>
          )}
          {narrow ? (
            <IconButton icon={Languages} label="Interlinear: Hebrew/Greek with Strong's numbers, in a pane beside this one" onClick={openInterlinear} />
          ) : (
            <Button size="sm" variant="ghost" icon={Languages} onClick={openInterlinear} title="Interlinear: Hebrew/Greek with Strong's numbers, in a pane beside this one">
              Interlinear
            </Button>
          )}
          <div className="min-w-0 flex-1" />
          <IconButton icon={TextSearch} label="Find in this chapter (Ctrl+G)" active={findOpen} onClick={openFind} />
          <div className="relative">
            <IconButton icon={StickyNote} label={chapterNoteCount > 0 ? `Chapter notes (${chapterNoteCount})` : "Chapter notes"} onClick={() => setChapterNoteOpen(true)} />
            {chapterNoteCount > 0 && (
              <span className="pointer-events-none absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] font-semibold leading-4 text-white">
                {chapterNoteCount}
              </span>
            )}
          </div>
          <ReadAloudButton title={`${book.name} ${chapter}`} sourceKind="scripture" iconOnly size="md" segments={readAloudSegments} />
          <BookmarksMenu bookId={book.id} chapter={chapter} activeVerse={activeVerse} />
          <Popover width="w-72" trigger={({ toggle, open }) => <IconButton icon={Type} label="Text size, spacing, font, and theme" active={open} onClick={toggle} />}>
            {textSettings}
          </Popover>
          <Popover width="w-64" trigger={({ toggle, open }) => <IconButton icon={SlidersHorizontal} label="View options" active={open} onClick={toggle} />}>
            {viewOptions}
          </Popover>
          <IconButton icon={Maximize2} label="Focus mode: just the text (F11)" onClick={enterFocusMode} />
        </>
      )}
    </div>
  );

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
    citationCounts,
    onCitationsClick: (verseNum: number) => {
      setActiveVerse(verseNum);
      // Into the citations pane already open, if there is one, else beside this.
      const open = useWorkspaceStore.getState().panes.find((p) => p.kind === "citations");
      openContent("citations", { bookId, chapter, verse: verseNum }, { target: open?.id ?? "new", from: paneId });
    },
    onContextMenu: (verseNum: number, x: number, y: number) => {
      setActiveVerse(verseNum);
      setVerseMenu({ verseNum, x, y });
    },
  };

  return (
    <div className="flex h-full flex-col">
      {toolbar}
      {findOpen && (
        <FindBar
          query={findQuery}
          onQueryChange={(q) => {
            setParams({ findQuery: q });
            setFindIndex(0);
          }}
          wholeWord={findWholeWord}
          onWholeWordChange={(on) => {
            setFindWholeWord(on);
            setFindIndex(0);
          }}
          count={matches.length}
          current={currentFind}
          onNext={() => stepFind(1)}
          onPrev={() => stepFind(-1)}
          onClose={closeFind}
          focusToken={findFocusToken}
        />
      )}
      <div className="flex min-h-0 flex-1">
        <div ref={containerRef} onMouseUp={handleMouseUp} onDoubleClick={handleDoubleClick} className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
          <div className="mx-auto w-full max-w-[70ch]">
            <h1 className="reading-font mb-1 text-2xl font-semibold text-ink">
              {book.name} {chapter}
            </h1>
            {!distractionFreeMode && hasRelated && (
              <div className="mb-4 flex flex-wrap items-center gap-1.5 text-sm">
                <span className="mr-1 text-xs font-medium uppercase tracking-wide text-ink-3">Related</span>
                {resourceLinks?.map((l) => (
                  <Button key={l.id} size="sm" variant="secondary" icon={Paperclip} onClick={(e) => paneNavigate(`/resources/${l.resource_id}`, e)}>
                    {l.label ?? allResources?.find((r) => r.id === l.resource_id)?.title ?? `Resource #${l.resource_id}`}
                  </Button>
                ))}
                {shownSuggested.map((r) => (
                  <Button key={r.id} size="sm" variant="ghost" icon={Sparkles} onClick={(e) => paneNavigate(`/resources/${r.id}`, e)} title="Suggested by topic tag">
                    {r.title}
                  </Button>
                ))}
                {hiddenSuggested > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => setShowAllSuggested(true)}>
                    +{hiddenSuggested} more
                  </Button>
                )}
                <SermonChipsForChapter bookId={bookId} chapter={chapter} />
              </div>
            )}
            {!hasRelated && <div className="mb-4" />}

            {versesLoading && <LoadingState className="py-4" />}
            {verses && verses.length === 0 && (
              <p className="text-sm text-ink-3">This translation does not include {book.name} {chapter}. Pick another translation in the toolbar.</p>
            )}

            {paragraphMode || printing ? (
              <div
                className={cx("reading-font text-ink", printing && "print-root", originalText && "text-original")}
                dir={currentTranslation?.direction ?? "ltr"}
                style={typography}
              >
                {paragraphMode ? (
                  <ParagraphVerses
                    verses={verses ?? []}
                    footnotesByVerse={footnotes}
                    activeVerse={activeVerse}
                    redLetterSpansByVerse={redLetterSpansByVerse}
                    findRangesByVerse={findByVerse}
                    backlinkVerses={backlinkVerses}
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
                      hasBacklinks={backlinkVerses.has(v.verse)}
                      {...rowProps}
                    />
                  ))
                )}
              </div>
            ) : (
              <div
                className={cx("text-ink", originalText && "text-original")}
                dir={currentTranslation?.direction ?? "ltr"}
                style={{ position: "relative", height: rowVirtualizer.getTotalSize(), ...typography }}
              >
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
                        ttsActive={ttsHere && ttsCurrentSegmentId === v.verse}
                        redLetterSpans={redLetterSpansByVerse?.get(v.verse)}
                        findRanges={findByVerse?.get(v.verse)}
                        hasBacklinks={backlinkVerses.has(v.verse)}
                        {...rowProps}
                      />
                    </div>
                  );
                })}
              </div>
            )}
            {!printing && verses && verses.length > 0 && books && (
              <ChapterEndCard books={books} position={{ bookId, chapter }} onNavigate={(p, e) => openPassage(p, { target: targetFor(e, paneId), from: paneId })} />
            )}
            {(printing || !verses || verses.length === 0) && <div className="h-24" />}
          </div>
        </div>
      </div>

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
            copyPassage(text, ref, translationCode);
            toast.success(`Copied ${ref}`);
            window.getSelection()?.removeAllRanges();
            setPending(null);
          }}
          onSendToSermon={() => {
            sendToSermon(
              {
                kind: "passage",
                refId: null,
                label: formatRef([book], toPassageRef(book.id, chapter, pending.verseStart, pending.verseEnd)),
                excerpt: null,
                passage: toPassageRef(book.id, chapter, pending.verseStart, pending.verseEnd),
              },
              { from: paneId },
            );
            window.getSelection()?.removeAllRanges();
            setPending(null);
          }}
          onSaveAsIllustration={() => {
            const text =
              pending.charStart != null && pending.charEnd != null
                ? verseText(pending.verseStart).slice(pending.charStart, pending.charEnd)
                : joinVerses(verses, pending.verseStart, pending.verseEnd);
            const reference = formatRef([book], toPassageRef(book.id, chapter, pending.verseStart, pending.verseEnd));
            captureIllustration({
              title: reference,
              body: `<p>${text}</p>`,
              sourceLabel: `${reference}${translationCode ? ` (${translationCode})` : ""}`,
              sourceRef: crossrefRef(book.id, chapter, pending.verseStart, pending.verseEnd),
              kind: "quote",
            });
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
          onReadFromHere={
            readAloudSegments.length > 0
              ? () => {
                  const index = readAloudSegments.findIndex((s) => s.id === verseMenu.verseNum);
                  useTtsStore.getState().start(`${book.name} ${chapter}`, "scripture", readAloudSegments, {
                    paneId,
                    startIndex: Math.max(0, index),
                  });
                }
              : undefined
          }
          onSendToSermon={() =>
            sendToSermon(
              {
                kind: "passage",
                refId: null,
                label: `${book.name} ${chapter}:${verseMenu.verseNum}`,
                excerpt: null,
                passage: toPassageRef(book.id, chapter, verseMenu.verseNum),
              },
              { from: paneId },
            )
          }
          onCopy={() => {
            const ref = `${book.name} ${chapter}:${verseMenu.verseNum}`;
            copyPassage(verseText(verseMenu.verseNum), ref, translationCode);
            toast.success(`Copied ${ref}`);
          }}
          onMemorize={() => {
            createMemoryVerse.mutate(
              {
                bookId: book.id,
                chapter,
                verseStart: verseMenu.verseNum,
                verseEnd: verseMenu.verseNum,
                translationId: translationId ?? undefined,
                mode: "first-letter",
              },
              {
                onSuccess: () =>
                  toast.success(`Added ${book.name} ${chapter}:${verseMenu.verseNum} to Scripture memory`, {
                    label: "Open Memory",
                    onClick: () => openContent("memory", {}, { target: "focused" }),
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

      {textModalOpen && (
        <Modal title="Text, font, and theme" onClose={() => setTextModalOpen(false)} size="sm">
          {textSettings}
        </Modal>
      )}
      {viewModalOpen && (
        <Modal title="View options" onClose={() => setViewModalOpen(false)} size="sm" bodyClassName="p-2">
          {viewOptions}
        </Modal>
      )}

      {wordLookup && (
        <StrongsPopup
          id={wordStrongs}
          word={wordLookup.word}
          loading={lookupOriginal ? morphologyLoading : interlinearLoading}
          factbook={factbookHit ?? null}
          x={wordLookup.x}
          y={wordLookup.y}
          onClose={() => setWordLookup(null)}
          onSearchLexicon={searchLexicon}
          hint={
            showKjvHint
              ? {
                  text: "Word lookup follows the KJV's wording, so it matches best there. In other translations some words will not be found.",
                  onDismiss: () => setKjvHintDismissed(true),
                }
              : null
          }
        />
      )}

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

      {noteTarget && (
        <NoteEditorModal
          title={`Note on ${book.name} ${chapter}:${noteTarget.verseStart}${noteTarget.verseEnd !== noteTarget.verseStart ? `-${noteTarget.verseEnd}` : ""}`}
          initialBody={noteTarget.existing?.body}
          onSave={(body, refs) => {
            if (noteTarget.existing) {
              updateNote.mutate({ id: noteTarget.existing.id, body, refs }, { onSuccess: () => toast.success("Note saved") });
            } else {
              createNote.mutate(
                {
                  bookId,
                  chapter,
                  verseStart: noteTarget.verseStart,
                  verseEnd: noteTarget.verseEnd,
                  body,
                  highlightId: noteTarget.highlightId,
                  refs,
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

      {chapterNoteOpen && (
        <Modal title={`Chapter notes · ${book.name} ${chapter}`} onClose={() => setChapterNoteOpen(false)} size="md">
          <div className="space-y-3">
            {chapterNotes?.map((n) => (
              <ChapterNoteItem
                key={n.id}
                body={n.body}
                onSave={(body) => updateChapterNote.mutate({ id: n.id, body, refs: extractNoteRefs(body) }, { onSuccess: () => toast.success("Note saved") })}
                onDelete={async () => {
                  if (await confirmTrash("this chapter note")) deleteChapterNote.mutate(n.id, { onSuccess: () => trashToast("chapter_note", n.id) });
                }}
              />
            ))}
            <ChapterNoteItem
              body=""
              placeholder="Add a note for this whole chapter…"
              onSave={(body) => {
                if (body.trim()) createChapterNote.mutate({ bookId, chapter, body, refs: extractNoteRefs(body) }, { onSuccess: () => toast.success("Note saved") });
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
