import { useCallback, useEffect, useRef, useState } from "react";
import { useSermon, useUpdateSermon } from "../../api/queries";
import { useNoteRefExtractor } from "../../lib/noteLinks";
import { registerCloseFlush } from "../../lib/appClose";
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
  /** Write anything pending at once (pane close, sermon switch, blur, an
   * export); resolves once that write, or one already under way, lands. */
  flush: () => Promise<void>;
  savedAt: Date | null;
  isSaving: boolean;
  /** True when the last save failed and the edit is still only on screen. */
  isUnsaved: boolean;
  /** Every passage block in the manuscript, for the shared passage query. */
  passageRefs: PassageRef[];
}

export function useSermonDraft(sermonId: number): SermonDraftHandle {
  const { data: sermon, isLoading } = useSermon(sermonId);
  const update = useUpdateSermon();
  const extractRefs = useNoteRefExtractor();

  const [draft, setDraft] = useState<SermonDraft | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [isUnsaved, setIsUnsaved] = useState(false);
  const draftRef = useRef<SermonDraft | null>(null);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  /** The write under way, so a flush can wait for one it did not start. */
  const inFlightRef = useRef<Promise<void> | null>(null);
  const timerRef = useRef<number | null>(null);
  const loadedIdRef = useRef<number | null>(null);
  const seenUpdatedAtRef = useRef<string | null>(null);
  const saveRef = useRef<() => void | Promise<void>>(() => {});

  // The server copy seeds the draft, and seeds it again whenever the stored
  // sermon has moved on -- another pane saved it, a series was deleted out
  // from under it, an event was logged -- so a pane never writes back a
  // sermon that no longer exists as it remembers it. What is being typed
  // still wins: a dirty draft, or one with a save in flight, is left alone,
  // and `updated_at` keeps an unchanged refetch from touching the editor.
  useEffect(() => {
    if (!sermon) return;
    const sameSermon = loadedIdRef.current === sermon.id;
    if (sameSermon && (dirtyRef.current || savingRef.current)) return;
    if (sameSermon && seenUpdatedAtRef.current === sermon.updated_at) return;
    loadedIdRef.current = sermon.id;
    seenUpdatedAtRef.current = sermon.updated_at;
    const next = draftOf(sermon);
    draftRef.current = next;
    setDraft(next);
  }, [sermon]);

  // Returns a promise so the close handshake can wait for the write to land
  // rather than merely starting it -- see `lib/appClose.ts`. Nothing that
  // only wants to start a save has to await it.
  const save = useCallback(async (): Promise<void> => {
    const current = draftRef.current;
    if (!current || !dirtyRef.current || loadedIdRef.current == null) {
      // Nothing new to write -- but an export reading the saved sermon back
      // still has to wait for the write already on its way.
      await inFlightRef.current;
      return;
    }
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
    savingRef.current = true;
    // `mutateAsync` rather than `mutate` for the promise alone; the callbacks
    // are unchanged. It rejects on failure, which `onError` has already dealt
    // with, so the rejection is swallowed here rather than left unhandled.
    const write = update.mutateAsync(
      { sermonId: loadedIdRef.current, input },
      {
        onSuccess: (saved) => {
          // The sermon we just wrote is the one to adopt next, so our own
          // write never comes back as a change to be re-seeded.
          seenUpdatedAtRef.current = saved.updated_at;
          setSavedAt(new Date());
          setIsUnsaved(false);
        },
        // A failed save must not swallow the edit: it stays dirty, so the
        // next keystroke or flush writes it again, and the footer says so.
        onError: () => {
          dirtyRef.current = true;
          setIsUnsaved(true);
        },
        onSettled: () => {
          savingRef.current = false;
        },
      },
    ).then(
      () => {},
      () => {},
    );
    inFlightRef.current = write;
    await write;
    if (inFlightRef.current === write) inFlightRef.current = null;
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

  const flush = useCallback(async () => {
    await saveRef.current();
  }, []);

  // Flushing on the way out, in every direction: the pane closing or the
  // sermon changing (the cleanup), the window losing focus, and the app
  // being closed.
  //
  // `beforeunload` is kept for the unload paths Rust does not mediate (a
  // reload, say), but it is no longer what makes the promise at the top of
  // this file true: it starts a save and returns, and the webview can be gone
  // before the write lands. `registerCloseFlush` is the one the window
  // actually waits on.
  useEffect(() => {
    const onBlur = () => void saveRef.current();
    const onBeforeUnload = () => void saveRef.current();
    window.addEventListener("blur", onBlur);
    window.addEventListener("beforeunload", onBeforeUnload);
    const unregister = registerCloseFlush(() => saveRef.current());
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("beforeunload", onBeforeUnload);
      unregister();
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
    isUnsaved,
    passageRefs,
  };
}
