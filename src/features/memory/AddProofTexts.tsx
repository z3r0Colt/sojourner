import { useState } from "react";
import { BookOpen } from "lucide-react";
import { api } from "../../api/client";
import { useBooks, useSetMemoryVerseDoctrinalLink, useWestminsterDocuments } from "../../api/queries";
import type { CatechismMemory } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { toast } from "../../components/ui/toast";
import { useAddToMemory } from "./useAddToMemory";

/**
 * The Scripture behind the answers: for each question in the catechism
 * deck, its first proof text goes into the Scripture deck, linked back to
 * the question (so practising the verse shows which answer it proves), in
 * a set named for the catechism. Proofs already in the deck are left be.
 */
export function AddProofTexts({ cards }: { cards: CatechismMemory[] }) {
  const { data: books } = useBooks();
  const { data: docs } = useWestminsterDocuments();
  const add = useAddToMemory();
  const link = useSetMemoryVerseDoctrinalLink();
  const [busy, setBusy] = useState(false);
  if (cards.length === 0) return null;

  async function run() {
    setBusy(true);
    let added = 0;
    let none = 0;
    for (const card of cards) {
      const section = await api.getWestminsterSection(card.westminster_section_id);
      const proof = section?.proofs[0];
      if (!section || !proof) {
        none++;
        continue;
      }
      const book = books?.find((b) => b.id === proof.book_id);
      if (!book) continue;
      const doc = docs?.find((d) => d.id === section.document_id);
      const ref = `${book.name} ${proof.chapter}:${proof.verse_start}${proof.verse_end !== proof.verse_start ? `-${proof.verse_end}` : ""}`;
      // A proof is one verse or a few: always a single card, never parts.
      const result = await add(ref, { setName: `${doc?.title ?? "Catechism"}: proofs`, asPassage: false });
      if (result.ok) {
        added++;
        if (result.cardId != null) {
          const q = section.prompt ? `${section.heading}: ${section.prompt}` : section.heading;
          link.mutate({ id: result.cardId, westminsterSectionId: section.id, doctrinalNote: `Proof for ${doc?.title ?? ""} ${q}`.replace(/\s+/g, " ").trim() });
        }
      }
    }
    setBusy(false);
    if (added > 0) toast.success(`Added ${added} proof text${added === 1 ? "" : "s"} to your Scripture deck`);
    else toast.info(none === cards.length ? "These questions have no Scripture proofs." : "Their proof texts are all in your Scripture deck already.");
  }

  return (
    <Button size="sm" variant="ghost" icon={BookOpen} disabled={busy || !books || !docs} onClick={() => void run()} title="Each question's first proof text, into your Scripture deck, linked to the question">
      {busy ? "Adding the proof texts…" : "Learn the proof texts too"}
    </Button>
  );
}
