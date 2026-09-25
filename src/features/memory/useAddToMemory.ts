import { useCallback } from "react";
import { api } from "../../api/client";
import { useCreateMemoryPassage, useCreateMemoryVerse } from "../../api/queries";
import { parseReference, useBookLookup } from "../../hooks/useReferenceParser";
import { useReaderTranslationId } from "../../state/workspaceStore";
import type { MemoryMode } from "../../api/types";
import { DEFAULT_CHUNK, planItem } from "./memorySets";

export interface AddOptions {
  translationId?: number | null;
  mode?: MemoryMode;
  setName?: string | null;
  askReference?: boolean;
  /** Learn it a part at a time; by default, anything of four verses or more. */
  asPassage?: boolean;
  chunkSize?: number;
}

/** `cardId` is the single card added; a passage adds its parts over time. */
export type AddResult = { ok: true; label: string; passage: boolean; cardId: number | null } | { ok: false; label: string; error: string };

/**
 * Adds a reference to the Scripture deck however it is best learned: a
 * verse or two as one card, a longer stretch (or a whole chapter, "Psalm
 * 23") as a passage learned a part at a time. The one path for the add
 * form, the starter sets, family worship, a sermon series and the
 * catechism's proof texts, so they all behave the same.
 */
export function useAddToMemory() {
  const lookup = useBookLookup();
  const readerTranslationId = useReaderTranslationId();
  const createCard = useCreateMemoryVerse();
  const createPassage = useCreateMemoryPassage();

  return useCallback(
    async (reference: string, opts: AddOptions = {}): Promise<AddResult> => {
      const parsed = parseReference(reference.trim(), lookup);
      if (!parsed) return { ok: false, label: reference, error: "Couldn't read that reference." };
      const translationId = opts.translationId ?? null;
      // The chapter as the card's translation has it: a whole chapter is as
      // many verses as it holds, and a range past its end would be a card
      // with no words to learn.
      const tid = translationId ?? readerTranslationId;
      const verses = tid != null ? await api.getChapter(tid, parsed.book.id, parsed.chapter) : [];
      const last = verses.reduce((m, v) => Math.max(m, v.verse), 0);
      if (tid != null && last === 0) return { ok: false, label: reference, error: `That translation has no ${parsed.book.name} ${parsed.chapter}.` };
      const verseStart = parsed.verse ?? 1;
      const verseEnd = Math.min(parsed.verseEnd ?? parsed.verse ?? last, last || Infinity);
      if (last && verseStart > last) return { ok: false, label: reference, error: `${parsed.book.name} ${parsed.chapter} has ${last} verses.` };
      const label = `${parsed.book.name} ${parsed.chapter}:${verseStart}${verseEnd !== verseStart ? `-${verseEnd}` : ""}`;
      const plan = planItem(parsed.book.id, parsed.chapter, verseStart, verseEnd, opts.asPassage, opts.chunkSize ?? DEFAULT_CHUNK);
      const mode = opts.mode ?? "first-letter";
      try {
        let cardId: number | null = null;
        if (plan.kind === "passage") {
          await createPassage.mutateAsync({
            bookId: plan.bookId,
            chapter: plan.chapter,
            verseStart: plan.verseStart,
            verseEnd: plan.verseEnd,
            translationId,
            chunkSize: opts.chunkSize ?? DEFAULT_CHUNK,
            mode,
            setName: opts.setName ?? null,
          });
        } else {
          const card = await createCard.mutateAsync({
            bookId: plan.bookId,
            chapter: plan.chapter,
            verseStart: plan.verseStart,
            verseEnd: plan.verseEnd,
            translationId: translationId ?? undefined,
            mode,
            setName: opts.setName ?? null,
            askReference: opts.askReference,
          });
          cardId = card.id;
        }
        return { ok: true, label, passage: plan.kind === "passage", cardId };
      } catch (e) {
        return { ok: false, label, error: e instanceof Error ? e.message : String(e) };
      }
    },
    [lookup, readerTranslationId, createCard, createPassage],
  );
}
