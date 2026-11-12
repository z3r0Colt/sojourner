import { useSermonTools } from "../sermons/useSermonTools";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Paperclip, Sparkles } from "lucide-react";
import { useReadingTypography, useUiStore } from "../../state/uiStore";
import { resolveBiblePane, useWorkspaceStore } from "../../state/workspaceStore";
import { useBooks, useBookmarks, useChapter, useHighlights, useNotesForChapter, useCreateHighlight, useDeleteHighlight, useUpdateHighlight, useCreateNote, useUpdateNote, useDeleteNote, useChapterNotes, useCreateChapterNote, useUpdateChapterNote, useDeleteChapterNote, useCreateBookmark, useDeleteBookmark, useCreateMemoryVerse, useResourcePassageLinksForChapter, useSuggestedResourcesForPassage, useSermonsForChapter, useResources, useFootnotesForChapter, useInterlinearForChapter, useMorphologyForChapter, useRedLetterRanges, useColorText, useColorVoices, useTranslations, useTrashToast, useBacklinks } from "../../api/queries";
import { useNoteRefExtractor } from "../../lib/noteLinks";
import { useSetting } from "../../hooks/useSetting";
import { StrongsPopup } from "../lexicon/StrongsPopup";
import { englishLookupWord, isEnglishText, matchOriginalStrongs, matchStrongs, taggedWordForStrongs, wordFromSelection, type WordAtPoint } from "./wordLookup";
import { api } from "../../api/client";
import { VerseRow } from "./VerseRow";
import { SelectionToolbar } from "./SelectionToolbar";
import { noteSelection, restoreSelection, sameSelection, type NotedSelection } from "../tts/keepSelection";
import { HighlightPopup } from "./HighlightPopup";
import { VerseContextMenu } from "./VerseContextMenu";
import { CompareVerseModal } from "./CompareVerseModal";
import { FootnotePopup } from "./FootnotePopup";
import { ColorWordPopup } from "./ColorWordPopup";
import { lineBoxAt } from "../../lib/popupPosition";
import { coloredHtml, colorSpansByVerse as groupColorSpans, sliceSpans, termBase } from "./colorText";
import { ColorTextBar, type Spotlight } from "./ColorTextBar";
import { ColorTextGuide } from "./ColorTextGuide";
import { NoteEditorModal } from "../notes/NoteEditorModal";
import { ParagraphVerses } from "./ParagraphReadingView";
import { ChapterEndCard } from "./ChapterEndCard";
import { FindBar } from "./FindBar";
import { findMatches, findRangesByVerse } from "./findMatches";
import { computeRedLetterSpans } from "./redLetterSpans";
import { ReadingTextSettings, ReadingToolbar, ReadingViewOptions } from "./ReadingToolbar";
import { ChapterNoteItem } from "./ChapterNoteItem";
import { adjacent, spotlightCss } from "./colorTextDom";
import { sendToSermon } from "../sermons/sendToSermon";
import { captureIllustration } from "../sermons/illustrationCapture";
import { captureSermonIdea } from "../sermons/sermonIdeas";
import { crossrefRef } from "../sermons/sourceIdentity";
import { SermonChipsForChapter } from "../sermons/SermonsForChapter";
import { closestWithAttr, verseTextLength, verseTextOffset } from "../../lib/domOffsets";
import { useCopyPassage } from "../../lib/clipboard";
import { registerQueueEndHandler, useTtsReadingHere, useTtsStore } from "../../state/ttsStore";
import { stepChapter } from "./chapterStep";
import { zoomText } from "./zoom";
import { isDialogOpen, isTypingTarget, verseKeyAction } from "../../lib/keyboard";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { LoadingState } from "../../components/ui/EmptyState";
import { toast } from "../../components/ui/toast";
import { confirmTrash } from "../../components/ui/confirm";
import { cx } from "../../components/ui/classes";
import { formatRef, joinVerses, toPassageRef } from "../../lib/passage";
import { usePane, usePaneNavigate, usePaneParams } from "../../workspace/PaneContext";
import { openContent, openPassage, targetFor } from "../../workspace/openContent";
import { useCompact } from "../../hooks/useCompact";
import type { ColorSpan, Note, Footnote } from "../../api/types";

/** How long after a click on the text a second click still makes it a
 * double-click: Windows' default double-click time. A click steers the voice
 * only once this has passed with no second click (see setActiveVerse). */
const DOUBLE_CLICK_MS = 500;

interface PendingSelection {
  verseStart: number;
  verseEnd: number;
  /** Character offsets apply only to a single-verse selection; a span
   * across verses highlights those verses whole. */
  charStart: number | null;
  charEnd: number | null;
  x: number;
  y: number;
  /** The selection's bottom, which the toolbar drops under when there is no
   * room over its top. */
  flipY: number;
}

interface ActiveHighlight {
  id: number;
  verseStart: number;
  verseEnd: number;
  /** The middle of the top of the highlighted line that was clicked. */
  x: number;
  y: number;
  /** That line's bottom, which the bar drops under when there is no room
   * over it. */
  flipY: number;
}

interface NoteTarget {
  verseStart: number;
  verseEnd: number;
  highlightId?: number;
  existing?: Note;
}

/** Below this pane width the reading toolbar folds its tools into one
 * overflow menu, and below the second the Compare, Interlinear and Color
 * text buttons drop their labels. Measured, not guessed: the full row -- the
 * chapter controls at their floor (see `toolbar`), the translation dropdown
 * and the tools -- is some 740px wide with the tools as icons and 940px with
 * the three labels. At the 520px this once was, a pane between 520 and 740px
 * wide cut off its last four or five tools. */
const TOOLBAR_COMPACT_BELOW_PX = 750;
const TOOLBAR_NARROW_BELOW_PX = 950;
/** From this width the tools on the right have room for their names
 * ("Find", "Notes", "Read aloud"…) beside their icons: seven bare icons
 * told a newcomer nothing. Below it they are the icons alone, as before. */
const TOOLBAR_NAMED_FROM_PX = 1400;

/** The Bible chapter view, living in a pane. Everything about *what* is
 * shown (translation, chapter, selected verse, paragraph and red-letter
 * modes) is the pane's; everything about *how* it is shown (text size,
 * font, theme, highlights, note markers) is global. */
export function ReadingPane() {
  const { id: paneId, isFocused, width: paneWidth } = usePane();
  const queryClient = useQueryClient();
  // The toolbar's widths, which ReadingToolbar draws to.
  const compact = paneWidth > 0 && paneWidth < TOOLBAR_COMPACT_BELOW_PX;
  const narrow = paneWidth > 0 && paneWidth < TOOLBAR_NARROW_BELOW_PX;
  const named = paneWidth >= TOOLBAR_NAMED_FROM_PX;
  // A preacher's tools, for a preacher (useSermonTools).
  const sermonTools = useSermonTools();
  const [params, setParams] = usePaneParams("bible");
  const { translationId, bookId, chapter, verse: scrollTarget, activeVerse, paragraphMode, redLetterMode, colorTextMode, colorHidden, voiceMode, findQuery } = params;
  const paneNavigate = usePaneNavigate();
  const ready = useWorkspaceStore((s) => s.ready);
  const setLastTranslation = useWorkspaceStore((s) => s.setLastTranslation);
  const publishPassage = useWorkspaceStore((s) => s.publishPassage);

  const { data: books } = useBooks();
  const {
    showVerseNumbers,
    showHighlights,
    showNoteSymbols,
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
  // Color text: the chapter's colored words, less the families turned off.
  const { data: colorSpans } = useColorText(colorTextMode ? translationId : null, bookId, chapter);
  const colorSpansByVerse = useMemo(() => (colorTextMode ? groupColorSpans(colorSpans, colorHidden) : null), [colorTextMode, colorSpans, colorHidden]);
  // Who is speaking: runs of text in a voice other than narration, by verse.
  const { data: voiceSpans } = useColorVoices(voiceMode ? translationId : null, bookId, chapter);
  const voiceSpansByVerse = useMemo(() => {
    if (!voiceMode || !voiceSpans) return null;
    const m = new Map<number, ColorSpan[]>();
    for (const s of voiceSpans) m.set(s.verse, [...(m.get(s.verse) ?? []), s]);
    return m;
  }, [voiceMode, voiceSpans]);
  const colorTextMarks = useUiStore((s) => s.colorTextMarks);
  const [colorGuideOpen, setColorGuideOpen] = useState(false);
  // One term picked from "In this chapter", ringed wherever it stands.
  const [spotlight, setSpotlight] = useState<Spotlight | null>(null);
  // The spotlight's rule reaches this pane's text only, not a second Bible
  // pane's or a sermon passage's.
  const spotlightScope = useId();
  useEffect(() => setSpotlight(null), [bookId, chapter, translationId, colorTextMode]);
  function toggleColorFamily(family: string) {
    const hidden = new Set(colorHidden ?? []);
    if (hidden.has(family)) hidden.delete(family);
    else hidden.add(family);
    setParams({ colorHidden: Array.from(hidden) });
  }
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
  const [activeFootnote, setActiveFootnote] = useState<{ footnote: Footnote; x: number; y: number; anchorTop: number } | null>(null);
  // A colored word's card, opened by a single click on it -- after a pause,
  // so the first click of a double-click (a word lookup) never opens it.
  const [colorWord, setColorWord] = useState<{ code: string; term: string; word: string; verse: number; x: number; y: number; anchorTop: number } | null>(null);
  const colorClickTimer = useRef<number | null>(null);
  function cancelColorClick() {
    if (colorClickTimer.current != null) window.clearTimeout(colorClickTimer.current);
    colorClickTimer.current = null;
  }
  function handleColorClick(e: React.MouseEvent) {
    if (!colorTextMode || e.detail !== 1) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-ct-code]");
    if (!el) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    const code = el.dataset.ctCode!;
    const term = el.dataset.ctTerm!;
    // The whole colored word, though a highlight edge may split it in two.
    const parts = Array.from(el.closest("[data-verse-text]")?.querySelectorAll<HTMLElement>(".ct") ?? []);
    let at = parts.indexOf(el);
    let word = el.textContent ?? "";
    for (let i = at - 1; i >= 0 && parts[i].dataset.ctTerm === term && adjacent(parts[i], parts[i + 1]); i--) word = (parts[i].textContent ?? "") + word;
    for (at = at + 1; at < parts.length && parts[at].dataset.ctTerm === term && adjacent(parts[at - 1], parts[at]); at++) word += parts[at].textContent ?? "";
    const line = lineBoxAt(el.getClientRects(), e.clientY) ?? el.getBoundingClientRect();
    cancelColorClick();
    colorClickTimer.current = window.setTimeout(() => {
      colorClickTimer.current = null;
      const verse = Number(el.closest("[data-verse-text]")?.getAttribute("data-verse-text") ?? 0);
      setColorWord({ code, term, word: word.trim(), verse, x: line.left, y: line.bottom + 4, anchorTop: line.top });
    }, 250);
  }
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
  const [wordLookup, setWordLookup] = useState<(WordAtPoint & { x: number; y: number; anchorTop: number }) | null>(null);
  // An English text is matched through the KJV-tagged interlinear; a Greek
  // or Hebrew one through the tagged words of the text itself. Either way
  // the tagged words are fetched, for the parsing of the one Greek or
  // Hebrew word the lookup settles on, when it settles on one.
  const lookupEnglish = !!wordLookup && !originalText;
  const lookupOriginal = !!wordLookup && originalText;
  const { data: interlinear, isLoading: interlinearLoading } = useInterlinearForChapter(lookupEnglish ? bookId : null, lookupEnglish ? chapter : null);
  const { data: morphology, isLoading: morphologyLoading } = useMorphologyForChapter(wordLookup ? bookId : null, wordLookup ? chapter : null);
  const [kjvHintDismissed, setKjvHintDismissed] = useSetting<boolean>("word_lookup_kjv_hint_dismissed", false);
  const verseWords = wordLookup && morphology ? (morphology[wordLookup.verse] ?? []) : null;
  const originalMatch = lookupOriginal && verseWords ? matchOriginalStrongs(wordLookup.word, wordLookup.occurrence, verseWords) : null;
  const wordStrongs = !wordLookup
    ? null
    : lookupOriginal
      ? (originalMatch?.strongsId ?? null)
      : interlinear
        ? matchStrongs(wordLookup.word, wordLookup.occurrence, interlinear[wordLookup.verse] ?? [])
        : null;
  const wordParsed = lookupOriginal ? (originalMatch?.word ?? null) : verseWords ? taggedWordForStrongs(wordStrongs, verseWords) : null;
  // A proper name: who the verse means by it, from the Factbook.
  const looksLikeName = !!wordLookup && /^\p{Lu}/u.test(wordLookup.word.trim().replace(/^[^\p{L}]+/u, ""));
  const { data: factbookHit } = useQuery({
    queryKey: ["factbookForWord", bookId, chapter, wordLookup?.verse, wordLookup?.word, wordStrongs],
    queryFn: () => api.getFactbookForWord(bookId, chapter, wordLookup!.verse, wordLookup!.word, wordStrongs),
    enabled: !!wordLookup && (looksLikeName || originalText),
  });
  const translationCode = translations?.find((t) => t.id === translationId)?.code;
  const showKjvHint = lookupEnglish && !!interlinear && !wordStrongs && translationCode !== "KJV" && !kjvHintDismissed;
  // A word of an English text is looked up in Webster 1828 as well, with
  // the chapter it was read in (see WebsterWordSection). Not the Vulgate's
  // Latin, which is in the Latin alphabet but not English.
  const websterWord = wordLookup && isEnglishText(currentTranslation) ? englishLookupWord(wordLookup.word) : null;
  const englishWord = useMemo(
    () => (websterWord ? { word: websterWord, place: book ? { book: book.osis_code, chapter } : null } : null),
    [websterWord, book, chapter],
  );

  // Escape closes the word card -- unless a dialog is open over it (the Go
  // to palette, opened with Ctrl K while the card was up), which is the top
  // layer and has the key to itself. Both listen on the window as it
  // captures, and the card, opened first, heard it first: one Escape closed
  // the palette and the card under it. The interlinear card makes the same
  // test (`modalAboveCard` there).
  useEffect(() => {
    if (!wordLookup) return;
    function onMouseDown() {
      setWordLookup(null);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        const modal = document.querySelector('[aria-modal="true"]');
        if (modal && !(containerRef.current && modal.contains(containerRef.current))) return;
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
  // A card still waiting out its double-click delay is dropped too, or it
  // would open over the next chapter, or with color text off.
  useEffect(() => {
    setWordLookup(null);
    setColorWord(null);
    cancelColorClick();
  }, [bookId, chapter, translationId]);
  useEffect(() => {
    if (!colorTextMode) {
      setColorWord(null);
      cancelColorClick();
    }
  }, [colorTextMode]);
  useEffect(() => cancelColorClick, []);

  function handleDoubleClick() {
    // A double-click is a word lookup, never a move of the voice (see
    // setActiveVerse), nor a colored word's card.
    cancelSteer();
    cancelColorClick();
    setColorWord(null);
    const at = wordFromSelection(window.getSelection());
    if (!at) return;
    const rect = window.getSelection()!.getRangeAt(0).getBoundingClientRect();
    window.getSelection()?.removeAllRanges();
    // Only the word card: not also the highlight bar the first click of the
    // double-click opened on a highlighted word, or a note or menu left up.
    setPending(null);
    setActiveHighlight(null);
    setActiveFootnote(null);
    setVerseMenu(null);
    setWordLookup({ ...at, x: rect.left, y: rect.bottom + 4, anchorTop: rect.top });
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
  //
  // Not re-rendered synchronously: a row is measured from its ref callback,
  // in the middle of React's commit, and a new height above the scroll
  // position made the virtualizer call flushSync from there -- React's
  // "flushSync was called from inside a lifecycle method", in bursts, each
  // time the verse being read aloud changed and was re-drawn and scrolled to.
  const rowVirtualizer = useVirtualizer({
    count: verses?.length ?? 0,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 56,
    overscan: 8,
    useFlushSync: false,
  });
  // A term picked in "In this chapter": bring its first place into view.
  useEffect(() => {
    if (!spotlight || !colorSpans || !verses) return;
    const first = colorSpans.find((s) => s.code === spotlight.code && termBase(s.term) === spotlight.term);
    const index = first ? verses.findIndex((v) => v.verse === first.verse) : -1;
    if (index < 0) return;
    if (paragraphMode) containerRef.current?.querySelector(`[data-verse-row="${first!.verse}"]`)?.scrollIntoView({ block: "center" });
    else rowVirtualizer.scrollToIndex(index, { align: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotlight]);

  // Choosing a verse while this pane is reading aloud moves the reader to
  // it, so the voice can be steered by pointing at the text rather than by
  // tapping Next as many times as it takes.
  //
  // But not every press on a verse is pointing the voice at it. A click on
  // the text may be the first half of a double-click, which is a word lookup;
  // so a click steers only once it is plain that no second click is coming,
  // and not if it ended a selection being made. Opening the verse menu --
  // right-click, or the verse number -- selects the verse but leaves the
  // voice be: the menu has its own "Read aloud from here".
  const steerTimer = useRef<number | null>(null);
  function cancelSteer() {
    if (steerTimer.current != null) window.clearTimeout(steerTimer.current);
    steerTimer.current = null;
  }
  useEffect(() => cancelSteer, []);
  function steerReadingTo(v: number) {
    const tts = useTtsStore.getState();
    if (tts.sourceKind !== "scripture" || tts.paneId !== paneId || tts.segments.length === 0) return;
    const index = tts.segments.findIndex((segment) => segment.id === v);
    if (index >= 0 && index !== tts.currentSegmentIndex) tts.seek(index);
  }
  const setActiveVerse = (v: number | null, steer: "now" | "after-click" | "no" = "now") => {
    setParams({ activeVerse: v });
    cancelSteer();
    if (v == null || steer === "no") return;
    if (steer === "now") {
      steerReadingTo(v);
      return;
    }
    // The click that ends a drag across words is the end of a selection, not
    // a choice of verse, and it never steers -- whatever becomes of the
    // selection in the half-second the timer waits. A highlight colour picked
    // that quickly takes the selection away, and the voice then jumped to the
    // verse just highlighted.
    if (selectionInText()) return;
    steerTimer.current = window.setTimeout(() => {
      steerTimer.current = null;
      if (selectionInText()) return;
      steerReadingTo(v);
    }, DOUBLE_CLICK_MS);
  };
  /** Words are selected in this pane's text. */
  function selectionInText(): boolean {
    const selection = window.getSelection();
    return !!selection && !selection.isCollapsed && !!containerRef.current?.contains(selection.anchorNode);
  }

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
  const phone = useCompact();
  const ttsCurrentSegmentId = useTtsStore((s) => (ttsHere ? (s.segments[s.currentSegmentIndex]?.id ?? null) : null));
  useEffect(() => {
    if (ttsHere && typeof ttsCurrentSegmentId === "number") {
      setParams({ activeVerse: ttsCurrentSegmentId });
    }
  }, [ttsHere, ttsCurrentSegmentId, setParams]);

  // Read-aloud draws the verse being read a word to a span, so as the voice
  // moves on, the verse it leaves and the verse it enters are drawn afresh --
  // and words the reader had selected in either went with the old text, while
  // the selection toolbar stayed up over nothing selected (Chromium does not
  // count that as a change of selection). The selection is noted, as verse
  // and characters, whenever it changes, and put back once the verses are
  // redrawn. Where it cannot be -- the verse scrolled out of the list -- the
  // toolbar goes with it.
  const notedSelection = useRef<NotedSelection | null>(null);
  useEffect(() => {
    const onChange = () => {
      const container = containerRef.current;
      notedSelection.current = container ? noteSelection(container, window.getSelection(), "data-verse-text") : null;
    };
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, []);
  useLayoutEffect(() => {
    const noted = notedSelection.current;
    const container = containerRef.current;
    const selection = window.getSelection();
    // No ranges at all is a selection cleared on purpose (a toolbar button, a
    // highlight made), not one lost to a redraw, which leaves a collapsed one.
    if (!noted || !container || !selection || selection.rangeCount === 0) return;
    if (sameSelection(noteSelection(container, selection, "data-verse-text"), noted)) return;
    if (!restoreSelection(container, noted, selection, "data-verse-text")) {
      notedSelection.current = null;
      setPending(null);
    }
  }, [ttsHere, ttsCurrentSegmentId]);

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
    const container = containerRef.current;
    // A drag begun in the verse text is a selection of it wherever it ends.
    // Let go past the last line, on a "cited" badge, or below the verses
    // drawn -- easy near the foot of the pane, where the pane scrolls under
    // the pointer as it goes -- and it used to bring no toolbar at all. Its
    // ends are taken back to the verse text it covers: the start of the
    // first verse, the end of the last.
    const anchorVerseEl = closestWithAttr(sel.anchorNode, "data-verse-text");
    if (!container || !anchorVerseEl || !container.contains(anchorVerseEl)) return;
    const covered = Array.from(container.querySelectorAll<HTMLElement>("[data-verse-text]")).filter((el) => range.intersectsNode(el));
    if (covered.length === 0) return;
    const inStart = closestWithAttr(range.startContainer, "data-verse-text");
    const inEnd = closestWithAttr(range.endContainer, "data-verse-text");
    const startVerseEl = inStart ?? covered[0];
    const endVerseEl = inEnd ?? covered[covered.length - 1];
    const verseA = Number(startVerseEl.getAttribute("data-verse-text"));
    const verseB = Number(endVerseEl.getAttribute("data-verse-text"));
    const clamped = document.createRange();
    if (inStart) clamped.setStart(range.startContainer, range.startOffset);
    else clamped.setStart(startVerseEl, 0);
    if (inEnd) clamped.setEnd(range.endContainer, range.endOffset);
    else clamped.setEnd(endVerseEl, endVerseEl.childNodes.length);
    const rect = clamped.getBoundingClientRect();
    if (verseA === verseB) {
      // Characters of the verse's own words, as a highlight is kept and
      // drawn: a footnote marker before the selection is not counted.
      const charStart = inStart ? verseTextOffset(startVerseEl, range.startContainer, range.startOffset) : 0;
      const charEnd = inEnd ? verseTextOffset(endVerseEl, range.endContainer, range.endOffset) : verseTextLength(endVerseEl);
      if (charEnd <= charStart) return;
      setPending({ verseStart: verseA, verseEnd: verseA, charStart, charEnd, x: rect.left + rect.width / 2, y: rect.top, flipY: rect.bottom });
    } else {
      // A selection spanning verses highlights those verses whole.
      setPending({
        verseStart: Math.min(verseA, verseB),
        verseEnd: Math.max(verseA, verseB),
        charStart: null,
        charEnd: null,
        x: rect.left + rect.width / 2,
        y: rect.top,
        flipY: rect.bottom,
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

  /** Brings up the commentary linked to this pane at the verse, or opens
   * one beside it. (On a phone, which shows one pane at a time, a linked
   * commentary otherwise follows the verse out of sight.) */
  function openCommentary(verse: number) {
    setActiveVerse(verse, "no");
    const s = useWorkspaceStore.getState();
    // Now, not from this pane's effect: showing the commentary unmounts this
    // pane before its effects run.
    s.publishPassage(paneId, { bookId, chapter, verse });
    const me = s.panes.find((p) => p.id === paneId);
    const existing = s.panes.find((p) => p.kind === "commentary" && p.linkGroup != null && p.linkGroup === me?.linkGroup);
    if (existing) s.focusPane(existing.id);
    else openContent("commentary", { bookId, chapter, verse }, { target: "new", from: paneId });
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

  const textSettings = <ReadingTextSettings />;
  const viewOptions = <ReadingViewOptions paragraphMode={paragraphMode} redLetterMode={redLetterMode} colorTextMode={colorTextMode} voiceMode={voiceMode} setParams={setParams} setPrinting={setPrinting} />;

  const readAloudSegments = (verses ?? []).map((v) => ({ id: v.verse, text: v.text, label: `Verse ${v.verse}` }));
  const chapterBookmark = bookmarks?.find((b) => b.book_id === book.id && b.chapter === chapter && b.verse == null);
  const verseBookmark = activeVerse != null ? bookmarks?.find((b) => b.book_id === book.id && b.chapter === chapter && b.verse === activeVerse) : undefined;
  function toggleBookmark(verse: number | undefined, existing: { id: number } | undefined) {
    const label = `${book!.name} ${chapter}${verse ? `:${verse}` : ""}`;
    if (existing) deleteBookmark.mutate(existing.id, { onSuccess: () => toast.info(`Bookmark removed: ${label}`) });
    else createBookmark.mutate({ bookId: book!.id, chapter, verse }, { onSuccess: () => toast.success(`Bookmarked ${label}`) });
  }

  // The toolbar is drawn by ReadingToolbar, from this pane's state.
  const toolbar = !distractionFreeMode && books && (
    <ReadingToolbar
      paneId={paneId}
      params={params}
      setParams={setParams}
      books={books}
      book={book}
      translations={translations}
      currentTranslation={currentTranslation}
      compact={compact}
      narrow={narrow}
      named={named}
      phone={phone}
      findOpen={findOpen}
      openFind={openFind}
      openInterlinear={openInterlinear}
      enterFocusMode={enterFocusMode}
      chapterNoteCount={chapterNoteCount}
      setChapterNoteOpen={setChapterNoteOpen}
      setColorGuideOpen={setColorGuideOpen}
      setTextModalOpen={setTextModalOpen}
      setViewModalOpen={setViewModalOpen}
      setPrinting={setPrinting}
      ttsHere={ttsHere}
      readAloudSegments={readAloudSegments}
      chapterBookmark={chapterBookmark}
      verseBookmark={verseBookmark}
      toggleBookmark={toggleBookmark}
    />
  );

  const rowProps = {
    highlights: highlights ?? [],
    notes: notes ?? [],
    showVerseNumbers,
    showHighlights,
    showNoteSymbols,
    onSelectVerse: (verseNum: number) => setActiveVerse(verseNum, "after-click"),
    onHighlightClick: (id: number, x: number, y: number, flipY: number) => {
      const h = highlights?.find((hl) => hl.id === id);
      if (h) setActiveHighlight({ id, verseStart: h.verse_start, verseEnd: h.verse_end, x, y, flipY });
    },
    onNoteSymbolClick: (note: Note) =>
      setNoteTarget({ verseStart: note.verse_start, verseEnd: note.verse_end, highlightId: note.highlight_id ?? undefined, existing: note }),
    onFootnoteClick: (footnote: Footnote, x: number, y: number, anchorTop: number) => setActiveFootnote({ footnote, x, y, anchorTop }),
    citationCounts,
    onCitationsClick: (verseNum: number) => {
      setActiveVerse(verseNum, "no");
      // Into the citations pane already open, if there is one, else beside this.
      const open = useWorkspaceStore.getState().panes.find((p) => p.kind === "citations");
      openContent("citations", { bookId, chapter, verse: verseNum }, { target: open?.id ?? "new", from: paneId });
    },
    onContextMenu: (verseNum: number, x: number, y: number) => {
      setActiveVerse(verseNum, "no");
      setVerseMenu({ verseNum, x, y });
    },
  };

  // The whole chapter at once rather than virtualized: paragraph mode on
  // screen, and the paper copy while printing.
  const staticVerses =
    !paragraphMode && !printing ? null : paragraphMode ? (
      <ParagraphVerses
        verses={verses ?? []}
        footnotesByVerse={footnotes}
        activeVerse={activeVerse}
        redLetterSpansByVerse={redLetterSpansByVerse}
        findRangesByVerse={findByVerse}
        colorSpansByVerse={colorSpansByVerse}
        voiceSpansByVerse={voiceSpansByVerse}
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
          colorSpans={colorSpansByVerse?.get(v.verse)}
          voiceSpans={voiceSpansByVerse?.get(v.verse)}
          hasBacklinks={backlinkVerses.has(v.verse)}
          {...rowProps}
        />
      ))
    );

  return (
    <div className="flex h-full flex-col">
      {toolbar}
      {(colorTextMode || voiceMode) && book && (
        <ColorTextBar
          colorOn={!!colorTextMode}
          voiceOn={!!voiceMode}
          spans={colorSpans}
          verses={verses}
          hidden={colorHidden ?? []}
          onToggleFamily={toggleColorFamily}
          spotlight={spotlight}
          onSpotlight={setSpotlight}
          bookId={book.id}
          chapter={chapter}
          onHelp={() => setColorGuideOpen(true)}
          compact={narrow}
        />
      )}
      {colorGuideOpen && <ColorTextGuide onClose={() => setColorGuideOpen(false)} />}
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
        <div
          ref={containerRef}
          onMouseUp={handleMouseUp}
          // As the click goes down, not up: a highlight's own click (its
          // popup) stops it on the way up, and a colored word inside a
          // highlight opens its card as well.
          onClickCapture={handleColorClick}
          onDoubleClick={handleDoubleClick}
          className={cx("min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-6", colorTextMode && colorTextMarks && "ct-marks")}
          data-ct-scope={spotlightScope}
        >
          {spotlight && <style>{spotlightCss(spotlight, spotlightScope)}</style>}
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

            {paragraphMode ? (
              <div
                className={cx("reading-font text-ink", originalText && "text-original")}
                dir={currentTranslation?.direction ?? "ltr"}
                style={typography}
              >
                {staticVerses}
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
                        colorSpans={colorSpansByVerse?.get(v.verse)}
                        voiceSpans={voiceSpansByVerse?.get(v.verse)}
                        hasBacklinks={backlinkVerses.has(v.verse)}
                        {...rowProps}
                      />
                    </div>
                  );
                })}
              </div>
            )}
            {verses && verses.length > 0 && books && (
              <ChapterEndCard books={books} position={{ bookId, chapter }} onNavigate={(p, e) => openPassage(p, { target: targetFor(e, paneId), from: paneId })} />
            )}
            {(!verses || verses.length === 0) && <div className="h-24" />}
          </div>
        </div>
      </div>

      {printing && createPortal(
        // On <body>, out of the pane: a pane is `relative overflow-hidden`,
        // which crops an absolutely positioned print root to one page (and
        // in WebKitGTK to the pane's own narrow column as well).
        <div
          className={cx("print-root print-only reading-font", originalText && "text-original")}
          dir={currentTranslation?.direction ?? "ltr"}
          style={typography}
          aria-hidden="true"
        >
          <h1 className="reading-font mb-3 text-2xl font-semibold">
            {book.name} {chapter}
          </h1>
          {staticVerses}
        </div>,
        document.body,
      )}

      {pending && (
        <SelectionToolbar
          x={pending.x}
          y={pending.y}
          flipY={pending.flipY}
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
            // With color text on, a paste into a document keeps the colors.
            let html: string | undefined;
            if (colorSpansByVerse) {
              html =
                pending.charStart != null && pending.charEnd != null
                  ? coloredHtml(text, sliceSpans(colorSpansByVerse.get(pending.verseStart), pending.charStart, pending.charEnd))
                  : (verses ?? [])
                      .filter((v) => v.verse >= pending.verseStart && v.verse <= pending.verseEnd)
                      .map((v) => coloredHtml(v.text, colorSpansByVerse.get(v.verse)).trim())
                      .join(" ");
            }
            copyPassage(text, ref, translationCode, html);
            toast.success(`Copied ${ref}`);
            window.getSelection()?.removeAllRanges();
            setPending(null);
          }}
          onSendToSermon={!sermonTools ? undefined : () => {
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
          onSaveAsIllustration={!sermonTools ? undefined : () => {
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
          onSaveAsIdea={() => {
            // The verses go on as the idea's passage; the words are the
            // reader's to write.
            captureSermonIdea({ ref: toPassageRef(book.id, chapter, pending.verseStart, pending.verseEnd) });
            window.getSelection()?.removeAllRanges();
            setPending(null);
          }}
          onReadAloudFromHere={
            readAloudSegments.length > 0
              ? () => {
                  // From the verse the selection starts in: a move within the
                  // reading when this pane is already reading the chapter, a
                  // start otherwise. Asked for in so many words, so a paused
                  // player is set going again rather than only moved.
                  const index = Math.max(0, readAloudSegments.findIndex((s) => s.id === pending.verseStart));
                  useTtsStore.getState().readFrom(`${book.name} ${chapter}`, "scripture", readAloudSegments, index, { paneId });
                  const tts = useTtsStore.getState();
                  if (tts.isPaused) tts.resume();
                  window.getSelection()?.removeAllRanges();
                  setPending(null);
                }
              : undefined
          }
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
          onOpenCommentary={() => openCommentary(verseMenu.verseNum)}
          onSendToSermon={!sermonTools ? undefined : () =>
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
            const text = verseText(verseMenu.verseNum);
            copyPassage(text, ref, translationCode, colorSpansByVerse ? coloredHtml(text, colorSpansByVerse.get(verseMenu.verseNum)) : undefined);
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
          loading={morphologyLoading || (lookupEnglish && interlinearLoading)}
          factbook={factbookHit ?? null}
          parsedWord={wordParsed}
          englishWord={englishWord}
          x={wordLookup.x}
          y={wordLookup.y}
          anchorTop={wordLookup.anchorTop}
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

      {colorWord && (
        <ColorWordPopup
          {...colorWord}
          bookId={bookId}
          chapter={chapter}
          translationId={translationId}
          onOpen={(r, e) => {
            setColorWord(null);
            openPassage({ bookId: r.book_id, chapter: r.chapter, verse: r.verse_start }, { target: targetFor(e, paneId), from: paneId });
          }}
          onClose={() => setColorWord(null)}
        />
      )}

      {activeFootnote && (
        <FootnotePopup
          marker={activeFootnote.footnote.marker}
          text={activeFootnote.footnote.text}
          x={activeFootnote.x}
          y={activeFootnote.y}
          anchorTop={activeFootnote.anchorTop}
          onClose={() => setActiveFootnote(null)}
        />
      )}

      {activeHighlight && (
        <HighlightPopup
          x={activeHighlight.x}
          y={activeHighlight.y}
          flipY={activeHighlight.flipY}
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
