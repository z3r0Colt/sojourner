import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useBooks } from "../../api/queries";
import { refKey } from "../../lib/passage";
import { useReaderTranslationId } from "../../state/workspaceStore";
import type { MemoryVerse, PassageRef } from "../../api/types";
import { ReadAloudButton } from "../tts/ReadAloudButton";
import { memoryWords } from "./memoryText";

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

  const segments = useMemo(() => {
    const text = new Map<string, string>();
    groups.forEach(([translationId], i) => {
      for (const p of results[i]?.data ?? []) text.set(`${translationId}|${refKey(p.ref)}`, p.verses.map((v) => memoryWords(v.text)).join(" "));
    });
    return cards.flatMap((c) => {
      const t = c.translation_id ?? readerTranslationId;
      const words = text.get(`${t}|${refKey({ book_id: c.book_id, chapter: c.chapter, verse_start: c.verse_start, verse_end: c.verse_end })}`);
      if (!words) return [];
      const name = books?.find((b) => b.id === c.book_id)?.name ?? "";
      const where = `${name} ${c.chapter}:${c.verse_start}${c.verse_end !== c.verse_start ? `-${c.verse_end}` : ""}`;
      return [{ id: `memory-${c.id}`, text: `${where}. ${words}`, label: where }];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, books, readerTranslationId, results.map((r) => r.dataUpdatedAt).join(",")]);

  return <ReadAloudButton title={title} sourceKind="scripture" segments={segments} />;
}
