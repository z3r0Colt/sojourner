/**
 * A Strong's entry's definition and derivation as a card or page shows them.
 *
 * Strong's prints each entry as one run: the forms of the word, where it
 * comes from, then what it means, then the King James renderings -- "θεός,
 * of uncertain affinity; a deity, especially (with 3588) the supreme
 * Divinity; figuratively, a magistrate; by Hebraism, very:--X exceeding,
 * God". The Greek file (reference/strongs/greek.xml) marks that run up as a
 * derivation and a definition and puts the line between them in the wrong
 * place in some two hundred entries; the importer puts it back where
 * Strong's has it (`split_greek` and `split_run_on` in
 * src-tauri/src/import/reference/strongs.rs), and the fields are shown as
 * they come. This card once made the same split again, clause by clause;
 * with the forms Strong's prints first now opening the derivation ("including
 * the feminine ἡ, and the neuter τό in all their inflections; the definite
 * article"), a second split would move the derivation's own first clause
 * into the definition.
 *
 * An entry with no definition at all -- G302, ἄν, whose whole text is "a
 * primary particle, denoting a supposition, wish, possibility or
 * uncertainty" -- shows that text as its definition, not under Derivation
 * beneath an empty line.
 */
import type { StrongsEntry } from "../../api/types";

export interface StrongsText {
  /** What the word means, as Strong's wrote it. */
  definition: string;
  /** Where it comes from, or null when there is nothing left to say. */
  derivation: string | null;
}

/** The entry's definition and derivation, as the importer stored them. */
export function strongsText(entry: Pick<StrongsEntry, "language" | "definition" | "derivation">): StrongsText {
  const definition = (entry.definition ?? "").trim();
  const derivation = entry.derivation?.trim() || null;
  if (derivation && !definition) return { definition: derivation, derivation: null };
  return { definition, derivation };
}
