import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useBooks } from "../../api/queries";
import { useSetting } from "../../hooks/useSetting";
import { buildRefMatcher, extractRefs } from "../../lib/noteLinks";

export const NOTE_REFS_BACKFILLED_SETTING = "note_refs_backfilled";

/**
 * One-time backfill of `note_refs` (backlinks, F2.2) for notes written
 * before the table existed. Runs once per install, guarded by the setting
 * `note_refs_backfilled`, after the book list has loaded: every live note
 * and chapter note is scanned with the same extractor the editor uses on
 * save, and the ones that mention anything get their rows written. The
 * flag is set only once every write has succeeded, so an interrupted run
 * simply tries again next launch. Mount once, in the shell.
 */
export function useNoteRefsBackfill(): void {
  const { data: books } = useBooks();
  const [done, setDone, { isLoaded }] = useSetting<boolean>(NOTE_REFS_BACKFILLED_SETTING, false);
  const qc = useQueryClient();
  const started = useRef(false);

  useEffect(() => {
    if (!isLoaded || done || started.current || !books || books.length === 0) return;
    started.current = true;
    const matcher = buildRefMatcher(books);
    let cancelled = false;
    (async () => {
      try {
        const [notes, chapterNotes] = await Promise.all([api.listAllNotes(), api.listAllChapterNotes()]);
        let written = 0;
        for (const n of notes) {
          if (cancelled) return;
          const refs = extractRefs(n.body, matcher);
          if (refs.length > 0) {
            await api.setNoteRefs("note", n.id, refs);
            written++;
          }
        }
        for (const n of chapterNotes) {
          if (cancelled) return;
          const refs = extractRefs(n.body, matcher);
          if (refs.length > 0) {
            await api.setNoteRefs("chapter_note", n.id, refs);
            written++;
          }
        }
        if (cancelled) return;
        setDone(true);
        if (written > 0) qc.invalidateQueries({ queryKey: ["backlinks"] });
        console.info(`[backlinks] backfilled references for ${written} of ${notes.length + chapterNotes.length} notes`);
      } catch (e) {
        // Leave the flag unset so the next launch retries.
        started.current = false;
        console.error("[backlinks] backfill failed", e);
      }
    })();
    return () => {
      // A cancelled run (StrictMode's remount, a shell unmount) must not
      // block the next one.
      cancelled = true;
      started.current = false;
    };
  }, [isLoaded, done, books, setDone, qc]);
}
