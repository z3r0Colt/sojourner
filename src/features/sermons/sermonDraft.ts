import { useCallback, useEffect, useRef, useState } from "react";
import { useSermon, useUpdateSermon } from "../../api/queries";
import { useNoteRefExtractor } from "../../lib/noteLinks";
import { derivePassages, passageBlocks, sourceBlocks } from "./editor/documentModel";
import type { PassageRef, Sermon, SermonInput, SermonStatus } from "../../api/types";

/**
 * The sermon a pane is editing, and the autosave behind it.
 *
 * Autosave must never lose a keystroke, so the pending edit lives in a ref
 * (not state) and is flushed on every way a sermon can leave the screen:
 * the pane closing, the sermon changing, the window losing focus, and the
 * app unloading. The 800 ms debounce only decides how often a quiet typist
 * hits the database.
 *
 * The passages, citations, and mentions are re-derived from the document on
 * every save rather than tracked as the writer types, so the tables can
 * never drift from the text.
 */

const SAVE_DEBOUNCE_MS = 800;

export interface SermonDraft {
  title: string;
  bigIdea: string;
  body: string;
  status: SermonStatus;
  preachDate: string | null;
  seriesId: number | null;
  seriesOrder: number | null;
  venue: string | null;
  preacher: string | null;
  translationId: number | null;
  targetMinutes: number | null;
  reflection: string | null;
  tags: string[];
  /** The sermon's own text (role `text`), typed in the header. */
  textRefs: PassageRef[];
}

function draftOf(sermon: Sermon): SermonDraft {
  return {
    title: sermon.title,
    bigIdea: sermon.big_idea ?? "",
    body: sermon.body,
    status: sermon.status,
    preachDate: sermon.preach_date,
    seriesId: sermon.series_id,
    seriesOrder: sermon.series_order,
    venue: sermon.venue,
    preacher: sermon.preacher,
    translationId: sermon.translation_id,
    targetMinutes: sermon.target_minutes,
    reflection: sermon.reflection,
    tags: sermon.tags,
    textRefs: sermon.passages
      .filter((p) => p.role === "text")
      .map((p) => ({
        book_id: p.book_id,
        chapter: p.chapter,
        verse_start: p.verse_start ?? 1,
        verse_end: p.verse_end ?? p.verse_start ?? 1,
      })),
  };
}

export interface SermonDraftHandle {
  sermon: Sermon | null;
  draft: SermonDraft | null;
  isLoading: boolean;
  /** Merge a change and schedule a save. */
  patch: (fields: Partial<SermonDraft>) => void;
  /** Write anything pending at once (pane close, sermon switch, blur). */
  flush: () => void;
  savedAt: Date | null;
  isSaving: boolean;
  /** Every passage block in the manuscript, for the shared passage query. */
  passageRefs: PassageRef[];
}

export function useSermonDraft(sermonId: number): SermonDraftHandle {
  const { data: sermon, isLoading } = useSermon(sermonId);
  const update = useUpdateSermon();
  const extractRefs = useNoteRefExtractor();

  const [draft, setDraft] = useState<SermonDraft | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const draftRef = useRef<SermonDraft | null>(null);
  const dirtyRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const loadedIdRef = useRef<number | null>(null);
  const saveRef = useRef<() => void>(() => {});

  // The server copy seeds the draft once per sermon. A later refetch (a
  // logged event, an invalidation from the Sermons page) must not overwrite
  // what is being typed, so it is only adopted when nothing is pending.
  useEffect(() => {
    if (!sermon) return;
    if (loadedIdRef.current === sermon.id && dirtyRef.current) return;
    if (loadedIdRef.current === sermon.id && draftRef.current) return;
    loadedIdRef.current = sermon.id;
    const next = draftOf(sermon);
    draftRef.current = next;
    setDraft(next);
  }, [sermon]);

  const save = useCallback(() => {
    const current = draftRef.current;
    if (!current || !dirtyRef.current || loadedIdRef.current == null) return;
    dirtyRef.current = false;
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // References typed in prose are mentions, exactly as a note's are; the
    // blocks and the header's text passages take priority over them.
    const mentioned: PassageRef[] = extractRefs(current.body).map((r) => ({
      book_id: r.book_id,
      chapter: r.chapter,
      verse_start: r.verse_start ?? 1,
      verse_end: r.verse_end ?? r.verse_start ?? 1,
    }));
    const input: SermonInput = {
      title: current.title.trim() || "Untitled sermon",
      big_idea: current.bigIdea.trim() || null,
      body: current.body,
      status: current.status,
      preach_date: current.preachDate,
      series_id: current.seriesId,
      series_order: current.seriesOrder,
      venue: current.venue,
      preacher: current.preacher,
      translation_id: current.translationId,
      target_minutes: current.targetMinutes,
      reflection: current.reflection,
      tags: current.tags,
      passages: derivePassages(current.body, current.textRefs, mentioned),
      sources: sourceBlocks(current.body),
    };
    update.mutate(
      { sermonId: loadedIdRef.current, input },
      { onSuccess: () => setSavedAt(new Date()) },
    );
  }, [extractRefs, update]);

  saveRef.current = save;

  const patch = useCallback((fields: Partial<SermonDraft>) => {
    const current = draftRef.current;
    if (!current) return;
    const next = { ...current, ...fields };
    draftRef.current = next;
    dirtyRef.current = true;
    setDraft(next);
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      saveRef.current();
    }, SAVE_DEBOUNCE_MS);
  }, []);

  const flush = useCallback(() => saveRef.current(), []);

  // Flushing on the way out, in every direction: the pane closing or the
  // sermon changing (the cleanup), the window losing focus, and the app
  // being closed.
  useEffect(() => {
    const onBlur = () => saveRef.current();
    const onBeforeUnload = () => saveRef.current();
    window.addEventListener("blur", onBlur);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);

  useEffect(() => {
    return () => {
      saveRef.current();
    };
  }, [sermonId]);

  const passageRefs = draft ? passageBlocks(draft.body) : [];

  return {
    sermon: sermon ?? null,
    draft,
    isLoading,
    patch,
    flush,
    savedAt,
    isSaving: update.isPending,
    passageRefs,
  };
}
