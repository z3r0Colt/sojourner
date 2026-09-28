import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useBooks } from "../../api/queries";
import { refKey } from "../../lib/passage";
import { useReaderTranslationId } from "../../state/workspaceStore";
import type { MemoryVerse, PassageRef, Verse } from "../../api/types";
import { ReadAloudButton } from "../tts/ReadAloudButton";
import { cardVerses, memoryCardKey, memorySegments } from "./memorySpeech";

/**
 * Reads cards aloud, one after another: each reference, then its words, in
 * the card's own translation. For practice away from the screen -- the
 * drive to work, a walk, a child who cannot read yet -- with the offline
 * voice the app already carries.
 */
export function ListenToCards({ cards, title }: { cards: MemoryVerse[]; title: string }) {
  const { data: books } = useBooks();
  const readerTranslationId = useReaderTranslationId();

  // One fetch per translation the cards are in.
  const groups = useMemo(() => {
    const m = new Map<number, PassageRef[]>();
    for (const c of cards) {
      const t = c.translation_id ?? readerTranslationId;
      if (t == null) continue;
      const refs = m.get(t) ?? [];
      refs.push({ book_id: c.book_id, chapter: c.chapter, verse_start: c.verse_start, verse_end: c.verse_end });
      m.set(t, refs);
    }
    return [...m.entries()];
  }, [cards, readerTranslationId]);

  const results = useQueries({
    queries: groups.map(([translationId, refs]) => ({
      queryKey: ["passages", translationId, refs.map(refKey).join(",")],
      queryFn: () => api.getPassages(translationId, refs),
      staleTime: 5 * 60_000,
    })),
  });

  // Each card as its reference and then its verses, one segment a verse (a
  // long one in sentence-sized pieces): a list of cards read as one string
  // apiece was a long render before each, and a card the voice could not
  // say went by unread entire. Each verse is labelled with its full
  // reference, since the player is showing a run of different passages.
  const segments = useMemo(() => {
    const loaded = new Map<string, Verse[]>();
    groups.forEach(([translationId], i) => {
      for (const p of results[i]?.data ?? []) loaded.set(`${translationId}|${refKey(p.ref)}`, p.verses);
    });
    return cards.flatMap((c) => {
      const t = c.translation_id ?? readerTranslationId;
      const verses = loaded.get(`${t}|${refKey({ book_id: c.book_id, chapter: c.chapter, verse_start: c.verse_start, verse_end: c.verse_end })}`);
      if (!verses) return [];
      const name = books?.find((b) => b.id === c.book_id)?.name ?? "";
      const where = `${name} ${c.chapter}:${c.verse_start}${c.verse_end !== c.verse_start ? `-${c.verse_end}` : ""}`;
      return memorySegments({
        // The card's own key, as its practice card uses: a card that comes up
        // in practice while this is still reading it can tell (readingGivesAway).
        key: memoryCardKey(c.id),
        reference: where,
        verses: cardVerses(verses, c.verse_start, c.verse_end),
        askWhere: false,
        verseLabel: (verse) => `${name} ${c.chapter}:${verse}`,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, books, readerTranslationId, results.map((r) => r.dataUpdatedAt).join(",")]);

  return <ReadAloudButton title={title} sourceKind="scripture" segments={segments} />;
}
