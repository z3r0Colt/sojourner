import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useNavigationStore } from "../../state/navigationStore";
import { useUiStore } from "../../state/uiStore";
import {
  useBooks,
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
  useResourcePassageLinksForChapter,
  useResources,
  useFootnotesForChapter,
  useRedLetterRanges,
} from "../../api/queries";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { VerseRow } from "./VerseRow";
import { SelectionToolbar } from "./SelectionToolbar";
import { HighlightPopup } from "./HighlightPopup";
import { CommentaryPanel } from "../commentary/CommentaryPanel";
import { CrossReferencesPanel } from "./CrossReferencesPanel";
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
import { computeRedLetterSpans } from "./redLetterSpans";
import { closestWithAttr, textOffsetWithin } from "../../lib/domOffsets";
import { copyWithReference } from "../../lib/clipboard";
import { ReadAloudButton } from "../tts/ReadAloudButton";
import { useTtsStore } from "../../state/ttsStore";
import type { Note, Footnote } from "../../api/types";

interface PendingSelection {
  verseNum: number;
  charStart: number;
  charEnd: number;
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

export function ReadingView() {
  const { data: books } = useBooks();
  const { primaryTranslationId, parallelTranslationIds, position, goTo, interlinearMode } = useNavigationStore();
  const {
    fontSize,
    showVerseNumbers,
    commentaryPanelOpen,
    toggleCommentaryPanel,
    showHighlights,
    showNoteSymbols,
    rightPanelTab,
    setRightPanelTab,
    redLetterMode,
    toggleRedLetterMode,
    paragraphMode,
    toggleParagraphMode,
    distractionFreeMode,
    toggleDistractionFreeMode,
  } = useUiStore();
  const book = books?.find((b) => b.id === position?.bookId) ?? null;
  const chapter = position?.chapter ?? null;

  const { data: verses } = useChapter(primaryTranslationId, position?.bookId ?? null, chapter);
  const { data: highlights } = useHighlights(position?.bookId ?? null, chapter);
  const { data: notes } = useNotesForChapter(position?.bookId ?? null, chapter);
  const { data: chapterNotes } = useChapterNotes(position?.bookId ?? null, chapter);
  const { data: resourceLinks } = useResourcePassageLinksForChapter(position?.bookId ?? null, chapter);
  const { data: allResources } = useResources();
  const { data: footnotes } = useFootnotesForChapter(primaryTranslationId, position?.bookId ?? null, chapter);
  const { data: redLetterRanges } = useRedLetterRanges(redLetterMode ? position?.bookId ?? null : null, chapter);
  function isRedLetterVerse(verseNum: number) {
    return !!redLetterRanges?.some((r) => verseNum >= r.verse_start && verseNum <= r.verse_end);
  }
  // Computed once per chapter (not per row) since quote depth carries across
  // verses -- see redLetterSpans.ts.
  const redLetterSpansByVerse = useMemo(
    () => (redLetterMode && verses ? computeRedLetterSpans(verses, isRedLetterVerse) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [redLetterMode, verses, redLetterRanges],
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

  const [activeVerse, setActiveVerse] = useState<number | null>(position?.verse ?? null);
  const [pending, setPending] = useState<PendingSelection | null>(null);
  const [activeHighlight, setActiveHighlight] = useState<ActiveHighlight | null>(null);
  const [noteTarget, setNoteTarget] = useState<NoteTarget | null>(null);
  const [chapterNoteOpen, setChapterNoteOpen] = useState(false);
  const [activeFootnote, setActiveFootnote] = useState<{ footnote: Footnote; x: number; y: number } | null>(null);
  const [verseMenu, setVerseMenu] = useState<{ verseNum: number; x: number; y: number } | null>(null);
  const [compareVerse, setCompareVerse] = useState<number | null>(null);
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
  }, [ttsSourceKind, ttsCurrentSegmentId]);

  useEffect(() => setActiveVerse(position?.verse ?? null), [position?.bookId, position?.chapter, position?.verse]);

  // Scroll the target verse into view once verses are loaded. Rows are
  // virtualized, so the target row may not be mounted yet -- ask the
  // virtualizer to scroll to its index rather than querying the DOM.
  useEffect(() => {
    if (activeVerse == null || !verses) return;
    const index = verses.findIndex((v) => v.verse === activeVerse);
    if (index >= 0) rowVirtualizer.scrollToIndex(index, { align: "center" });
  }, [activeVerse, verses, rowVirtualizer]);

  // Persist reading position (debounced) whenever it changes.
  useEffect(() => {
    if (!position || primaryTranslationId == null) return;
    const t = setTimeout(() => {
      api.setReadingPosition(primaryTranslationId, position.bookId, position.chapter, activeVerse ?? undefined);
    }, 400);
    return () => clearTimeout(t);
  }, [position, primaryTranslationId, activeVerse]);

  function handleMouseUp() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const startVerseEl = closestWithAttr(range.startContainer, "data-verse-text");
    const endVerseEl = closestWithAttr(range.endContainer, "data-verse-text");
    if (!startVerseEl || !endVerseEl || startVerseEl !== endVerseEl) return;
    const verseNum = Number(startVerseEl.getAttribute("data-verse-text"));
    const charStart = textOffsetWithin(startVerseEl, range.startContainer, range.startOffset);
    const charEnd = textOffsetWithin(endVerseEl, range.endContainer, range.endOffset);
    if (charEnd <= charStart) return;
    const rect = range.getBoundingClientRect();
    setPending({ verseNum, charStart, charEnd, x: rect.left + rect.width / 2, y: rect.top });
  }

  function commitHighlight(style: "highlight" | "underline", color: string) {
    if (!pending || !position) return;
    createHighlight.mutate({
      bookId: position.bookId,
      chapter: position.chapter,
      verseStart: pending.verseNum,
      verseEnd: pending.verseNum,
      charStart: pending.charStart,
      charEnd: pending.charEnd,
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

  function handlePrint() {
    window.print();
  }

  useEffect(() => {
    if (!distractionFreeMode) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") toggleDistractionFreeMode();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [distractionFreeMode, toggleDistractionFreeMode]);

  const activeHighlightNote = activeHighlight
    ? notes?.find((n) => n.highlight_id === activeHighlight.id)
    : undefined;

  if (!book || !chapter) {
    return <div className="p-8 text-gray-400">Loading…</div>;
  }

  if (interlinearMode) {
    return <InterlinearView book={book} chapter={chapter} />;
  }

  if (parallelTranslationIds.length > 0) {
    return (
      <ParallelReadingView
        book={book}
        chapter={chapter}
        primaryTranslationId={primaryTranslationId}
        parallelTranslationIds={parallelTranslationIds}
      />
    );
  }


  return (
    <div className="flex h-full">
      <div
        ref={containerRef}
        onMouseUp={handleMouseUp}
        className="min-h-0 flex-1 overflow-y-auto px-6 py-4"
      >
        {!distractionFreeMode && (
          <div className="mb-3 flex items-center gap-3">
            <h1 className="text-xl font-semibold">
              {book.name} {chapter}
            </h1>
            <button
              onClick={() => setChapterNoteOpen(true)}
              className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              Chapter Notes{chapterNotes && chapterNotes.length > 0 ? ` (${chapterNotes.length})` : ""}
            </button>
            <ReadAloudButton
              title={`${book.name} ${chapter}`}
              sourceKind="scripture"
              segments={(verses ?? []).map((v) => ({ id: v.verse, text: v.text, label: `Verse ${v.verse}` }))}
            />
            {resourceLinks?.map((l) => (
              <button
                key={l.id}
                onClick={() => navigate(`/resources/${l.resource_id}`)}
                className="rounded border border-purple-300 px-2 py-0.5 text-xs text-purple-600 hover:bg-purple-50 dark:border-purple-800 dark:text-purple-400 dark:hover:bg-purple-950/40"
              >
                📎 {l.label ?? allResources?.find((r) => r.id === l.resource_id)?.title ?? `Resource #${l.resource_id}`}
              </button>
            ))}
            <div className="flex-1" />
            <button
              onClick={toggleRedLetterMode}
              title="Red-letter (words of Jesus)"
              className={`rounded border px-2 py-0.5 text-xs ${redLetterMode ? "border-red-300 bg-red-50 text-red-600 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400" : "border-gray-300 text-gray-500 dark:border-gray-700"}`}
            >
              Red Letter
            </button>
            <button
              onClick={toggleParagraphMode}
              title="Paragraph mode"
              className={`rounded border px-2 py-0.5 text-xs ${paragraphMode ? "border-blue-300 bg-blue-50 text-blue-600 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-400" : "border-gray-300 text-gray-500 dark:border-gray-700"}`}
            >
              Paragraph
            </button>
            <button
              onClick={handlePrint}
              title="Print this chapter"
              className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              Print
            </button>
            <button
              onClick={toggleDistractionFreeMode}
              title="Distraction-free mode"
              className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              Focus
            </button>
          </div>
        )}
        {paragraphMode ? (
          <div id="print-chapter">
            <ParagraphVerses
              verses={verses ?? []}
              highlights={highlights ?? []}
              notes={notes ?? []}
              footnotesByVerse={footnotes}
              activeVerse={activeVerse}
              showVerseNumbers={showVerseNumbers}
              showHighlights={showHighlights}
              showNoteSymbols={showNoteSymbols}
              fontSize={fontSize}
              redLetterSpansByVerse={redLetterSpansByVerse}
              onSelectVerse={setActiveVerse}
              onHighlightClick={(id, x, y) => {
                const h = highlights?.find((hl) => hl.id === id);
                if (h) setActiveHighlight({ id, verseStart: h.verse_start, verseEnd: h.verse_end, x, y });
              }}
              onNoteSymbolClick={(note) =>
                setNoteTarget({ verseStart: note.verse_start, verseEnd: note.verse_end, highlightId: note.highlight_id ?? undefined, existing: note })
              }
              onFootnoteClick={(footnote, x, y) => setActiveFootnote({ footnote, x, y })}
              onContextMenu={(verseNum, x, y) => setVerseMenu({ verseNum, x, y })}
            />
          </div>
        ) : (
          <div id="print-chapter" style={{ position: "relative", height: rowVirtualizer.getTotalSize() }}>
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
                    highlights={highlights ?? []}
                    notes={notes ?? []}
                    footnotes={footnotes?.[v.verse]}
                    isActive={activeVerse === v.verse}
                    ttsActive={ttsSourceKind === "scripture" && ttsCurrentSegmentId === v.verse}
                    showVerseNumbers={showVerseNumbers}
                    showHighlights={showHighlights}
                    showNoteSymbols={showNoteSymbols}
                    fontSize={fontSize}
                    redLetterSpans={redLetterSpansByVerse?.get(v.verse)}
                    onSelectVerse={setActiveVerse}
                    onHighlightClick={(id, x, y) => {
                      const h = highlights?.find((hl) => hl.id === id);
                      if (h) setActiveHighlight({ id, verseStart: h.verse_start, verseEnd: h.verse_end, x, y });
                    }}
                    onNoteSymbolClick={(note) =>
                      setNoteTarget({ verseStart: note.verse_start, verseEnd: note.verse_end, highlightId: note.highlight_id ?? undefined, existing: note })
                    }
                    onFootnoteClick={(footnote, x, y) => setActiveFootnote({ footnote, x, y })}
                    onContextMenu={(verseNum, x, y) => setVerseMenu({ verseNum, x, y })}
                  />
                </div>
              );
            })}
          </div>
        )}
        <div className="h-24" />
      </div>

      {!distractionFreeMode && commentaryPanelOpen ? (
        <div style={{ width: 420 }} className="flex shrink-0 flex-col border-l border-gray-200 dark:border-gray-800">
          <div className="flex border-b border-gray-200 text-xs dark:border-gray-800">
            <button
              onClick={() => setRightPanelTab("commentary")}
              className={`flex-1 py-1.5 ${rightPanelTab === "commentary" ? "border-b-2 border-blue-500 font-medium text-blue-600 dark:text-blue-400" : "text-gray-500"}`}
            >
              Commentary
            </button>
            <button
              onClick={() => setRightPanelTab("crossrefs")}
              className={`flex-1 py-1.5 ${rightPanelTab === "crossrefs" ? "border-b-2 border-blue-500 font-medium text-blue-600 dark:text-blue-400" : "text-gray-500"}`}
            >
              Cross References
            </button>
            {book.id === 19 && (
              <button
                onClick={() => setRightPanelTab("metrical")}
                className={`flex-1 py-1.5 ${rightPanelTab === "metrical" ? "border-b-2 border-blue-500 font-medium text-blue-600 dark:text-blue-400" : "text-gray-500"}`}
              >
                Metrical
              </button>
            )}
          </div>
          <div className="min-h-0 flex-1">
            {rightPanelTab === "commentary" && (
              <CommentaryPanel
                book={book}
                chapter={chapter}
                activeVerse={activeVerse}
                onJumpToVerse={(c, v) => goTo({ bookId: book.id, chapter: c, verse: v })}
                onJumpToRef={jumpToRef}
                onClose={toggleCommentaryPanel}
              />
            )}
            {rightPanelTab === "crossrefs" && (
              <CrossReferencesPanel book={book} chapter={chapter} activeVerse={activeVerse} onClose={toggleCommentaryPanel} />
            )}
            {rightPanelTab === "metrical" && book.id === 19 && (
              <MetricalPsalmPanel psalm={chapter} onClose={toggleCommentaryPanel} />
            )}
          </div>
        </div>
      ) : distractionFreeMode ? null : (
        <button
          onClick={toggleCommentaryPanel}
          className="shrink-0 border-l border-gray-200 px-1 text-xs text-gray-400 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900"
        >
          ‹ Study
        </button>
      )}

      {distractionFreeMode && (
        <button
          onClick={toggleDistractionFreeMode}
          title="Exit distraction-free mode (Esc)"
          className="fixed right-4 top-4 z-40 rounded border border-gray-300 bg-white/90 px-2 py-1 text-xs text-gray-500 shadow hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900/90 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          ✕ Exit Focus
        </button>
      )}

      {pending && (
        <SelectionToolbar
          x={pending.x}
          y={pending.y}
          onPickColor={(c) => commitHighlight("highlight", c)}
          onUnderline={(c) => commitHighlight("underline", c)}
          onAddNote={() => {
            setNoteTarget({ verseStart: pending.verseNum, verseEnd: pending.verseNum });
            setPending(null);
          }}
          onCopy={() => {
            const v = verses?.find((v) => v.verse === pending.verseNum);
            if (v) {
              const selected = v.text.slice(pending.charStart, pending.charEnd);
              copyWithReference(selected, `${book.name} ${chapter}:${v.verse}`);
            }
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
          onCompare={() => setCompareVerse(verseMenu.verseNum)}
          onCopy={() => {
            const v = verses?.find((v) => v.verse === verseMenu.verseNum);
            if (v) copyWithReference(v.text, `${book.name} ${chapter}:${v.verse}`);
          }}
          onClose={() => setVerseMenu(null)}
        />
      )}

      {compareVerse != null && (
        <CompareVerseModal book={book} chapter={chapter} verse={compareVerse} onClose={() => setCompareVerse(null)} />
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
            deleteHighlight.mutate(activeHighlight.id);
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
              updateNote.mutate({ id: noteTarget.existing.id, body });
            } else {
              createNote.mutate({
                bookId: position.bookId,
                chapter: position.chapter,
                verseStart: noteTarget.verseStart,
                verseEnd: noteTarget.verseEnd,
                body,
                highlightId: noteTarget.highlightId,
              });
            }
            setNoteTarget(null);
          }}
          onDelete={
            noteTarget.existing
              ? () => {
                  deleteNote.mutate(noteTarget.existing!.id);
                  setNoteTarget(null);
                }
              : undefined
          }
          onClose={() => setNoteTarget(null)}
        />
      )}

      {chapterNoteOpen && position && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setChapterNoteOpen(false)}>
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-4 shadow-xl dark:bg-gray-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Chapter Notes — {book.name} {chapter}
              </h3>
              <button onClick={() => setChapterNoteOpen(false)} className="text-gray-400 hover:text-gray-600" title="Close" aria-label="Close">
                ✕
              </button>
            </div>
            <div className="space-y-3">
              {chapterNotes?.map((n) => (
                <ChapterNoteItem
                  key={n.id}
                  body={n.body}
                  onSave={(body) => updateChapterNote.mutate({ id: n.id, body })}
                  onDelete={() => deleteChapterNote.mutate(n.id)}
                />
              ))}
              <ChapterNoteItem
                body=""
                placeholder="Add a note for this whole chapter…"
                onSave={(body) => {
                  if (body.trim()) createChapterNote.mutate({ bookId: position.bookId, chapter: position.chapter, body });
                }}
                clearAfterSave
              />
            </div>
          </div>
        </div>
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
      <div className="rounded border border-gray-200 p-2 dark:border-gray-800">
        <NoteBody body={body} className="block whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300" />
        <div className="mt-1 flex justify-end gap-2 text-xs">
          {onDelete && (
            <button onClick={onDelete} className="text-red-500 hover:underline">
              Delete
            </button>
          )}
          <button onClick={() => setEditing(true)} className="text-blue-600 hover:underline dark:text-blue-400">
            Edit
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded border border-gray-200 p-2 dark:border-gray-800">
      <RichTextEditor content={value} onChange={setValue} placeholder={placeholder} autoFocus={!isNew} />
      <div className="mt-1 flex justify-end gap-2 text-xs">
        {!isNew && (
          <button onClick={() => setEditing(false)} className="text-gray-500 hover:underline">
            Cancel
          </button>
        )}
        {onDelete && (
          <button onClick={onDelete} className="text-red-500 hover:underline">
            Delete
          </button>
        )}
        <button
          onClick={() => {
            onSave(value);
            if (clearAfterSave) setValue("");
            if (!isNew) setEditing(false);
          }}
          className="text-blue-600 hover:underline dark:text-blue-400"
        >
          Save
        </button>
      </div>
    </div>
  );
}
