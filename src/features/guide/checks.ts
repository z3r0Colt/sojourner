import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useHighlights, useNotesForChapter } from "../../api/queries";
import { overlaps, sectionId, type Check } from "./course";

/**
 * Whether a step's work is to be found in the student's own content: a
 * highlight, a note, memory cards, a prayer. `null` for a check the Guide
 * itself records (an answer, a quiz, a pane opened) or a step with none.
 *
 * The queries share their keys with the rest of the app, so a highlight
 * made in the Bible pane, or a card added on the Memory page, ticks the step
 * as soon as that page's own lists refresh.
 */
export function useLiveCheck(check: Check | undefined, startedAt: string | undefined): boolean | null {
  const type = check?.type;
  const highlightAt = check?.type === "highlight" ? check.passage : null;
  const noteAt = check?.type === "note" ? check.passage : null;

  const highlights = useHighlights(highlightAt?.book ?? null, highlightAt?.chapter ?? null);
  const notes = useNotesForChapter(noteAt?.book ?? null, noteAt?.chapter ?? null);
  const noteTags = useQuery({ queryKey: ["allNoteTagsByNote"], queryFn: api.listAllNoteTagsByNote, enabled: type === "note" });
  const catechismCards = useQuery({ queryKey: ["catechismMemory"], queryFn: api.listCatechismMemory, enabled: type === "memory" });
  const verseCards = useQuery({ queryKey: ["memoryVerses"], queryFn: api.listMemoryVerses, enabled: type === "memory" });
  const prayers = useQuery({ queryKey: ["prayerEntries"], queryFn: api.listPrayerEntries, enabled: type === "prayer" });
  const prayerTags = useQuery({
    queryKey: ["allPrayerEntryTagsByEntry"],
    queryFn: api.listAllPrayerEntryTagsByEntry,
    enabled: type === "prayer",
  });

  const since = startedAt ? Date.parse(startedAt) : Infinity;
  const newSinceStart = (createdAt: string) => Date.parse(createdAt) >= since;

  switch (check?.type) {
    case "highlight":
      return (highlights.data ?? []).some((h) => overlaps(check.passage, h.book_id, h.chapter, h.verse_start, h.verse_end));
    case "note": {
      const tagged = new Set((noteTags.data ?? []).filter(([, tag]) => tag === check.tag).map(([id]) => id));
      return (notes.data ?? []).some(
        (n) => !n.deleted_at && overlaps(check.passage, n.book_id, n.chapter, n.verse_start, n.verse_end) && (tagged.has(n.id) || newSinceStart(n.created_at)),
      );
    }
    case "memory": {
      const v = check.verse;
      const learning = new Set((catechismCards.data ?? []).map((c) => c.westminster_section_id));
      const hasQuestion = (check.questions ?? []).every((q) => learning.has(sectionId("wsc", q)));
      const hasVerse = v == null || (verseCards.data ?? []).some((c) => overlaps(v, c.book_id, c.chapter, c.verse_start, c.verse_end));
      return hasQuestion && hasVerse;
    }
    case "prayer": {
      const tagged = new Set((prayerTags.data ?? []).filter(([, tag]) => tag === check.tag).map(([id]) => id));
      return (prayers.data ?? []).some((p) => !p.deleted_at && (tagged.has(p.id) || newSinceStart(p.created_at)));
    }
    default:
      return null;
  }
}
