/**
 * A Strong's entry's definition and derivation as a card or page shows them.
 *
 * Strong's prints each entry as one run: where the word comes from, then
 * what it means, then the King James renderings -- "θεός, of uncertain
 * affinity; a deity, especially (with 3588) the supreme Divinity;
 * figuratively, a magistrate; by Hebraism, very:--X exceeding, God". The
 * Greek file the app imports (reference/strongs/greek.xml) splits that run
 * into a derivation and a definition, and for eight entries closes the
 * derivation too late, carrying the start of the meaning into it: θεός's
 * definition was left as "figuratively, a magistrate; by Hebraism, very",
 * the tail of the sentence, and "a deity, especially the supreme Divinity"
 * sat under Derivation. The card showed that tail as what θεός means.
 *
 * So the derivation is read clause by clause (Strong's separates them with
 * semicolons; a semicolon inside brackets is not a break), and from the
 * first clause after the first that says nothing of where the word comes
 * from, the rest goes back to the front of the definition, which then reads
 * as Strong's wrote it. A derivation clause names a source ("from G1909",
 * "of Hebrew origin", "probably from..."), a form ("a prolonged form of a
 * primary verb", "feminine of..."), or how the forms are used ("which occurs
 * only as an alternate in certain tenses", "used only before G3303"); the
 * meaning does not ("a deity", "lonesome", "the eve", "to take", "properly,
 * right"). Checked against every Greek entry: it moves the eight that are
 * split in the wrong place (G2048, G2063, G2073, G2316, G2537, G2570, G2983,
 * G3741) and leaves the nineteen whose derivations rightly run to several
 * clauses as they are.
 *
 * The Hebrew entries come from another file, whose definition is BDB's
 * numbered senses and whose derivation is its own field: they are shown as
 * they are.
 *
 * An entry with no definition at all -- G302, ἄν, whose whole text is "a
 * primary particle, denoting a supposition, wish, possibility or
 * uncertainty" -- shows that text as its definition, not under Derivation
 * beneath an empty line.
 */
import type { StrongsEntry } from "../../api/types";

/** A clause that says where a word comes from or what form it is, not what
 *  it means (see above). */
const DERIVATION_CLAUSE =
  /^(?:\(|of\b|from\b|and\b|or\b|which\b|occurs\b|used\b|denoting\b|including\b|compare\b|probably\b|perhaps\b|apparently\b|possibly\b|akin\b|contracted\b|corresponding\b|feminine\b|masculine\b|neuter\b|plural\b|adverb\b|an? (?:primary|prolonged|reduplicated|strengthened|contracted|form|variation|derivative|compound|root|primitive|adverb|particle|\(middle voice\))\b|the (?:first|second|third|same)\b)/i;

/** The clauses of a derivation: split at each semicolon outside brackets,
 *  trimmed, the empty ones dropped. The file's brackets do not always
 *  balance; a semicolon after an unclosed one is inside it. */
export function derivationClauses(derivation: string): string[] {
  const clauses: string[] = [];
  let current = "";
  let depth = 0;
  for (const ch of derivation) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === ";" && depth <= 0) {
      clauses.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  clauses.push(current);
  return clauses.map((c) => c.trim()).filter(Boolean);
}

export interface StrongsText {
  /** What the word means, as Strong's wrote it. */
  definition: string;
  /** Where it comes from, or null when there is nothing left to say. */
  derivation: string | null;
}

/** The entry's definition and derivation, with a meaning the source file
 *  left in the derivation put back at the front of the definition. */
export function strongsText(entry: Pick<StrongsEntry, "language" | "definition" | "derivation">): StrongsText {
  const definition = (entry.definition ?? "").trim();
  const derivation = entry.derivation?.trim() || null;
  if (!derivation) return { definition, derivation };
  if (entry.language === "greek") {
    const clauses = derivationClauses(derivation);
    const meaningAt = clauses.findIndex((c, i) => i > 0 && !DERIVATION_CLAUSE.test(c));
    if (meaningAt > 0) {
      const meaning = clauses.slice(meaningAt).join("; ").replace(/;$/, "");
      return {
        definition: definition ? `${meaning}; ${definition}` : meaning,
        derivation: `${clauses.slice(0, meaningAt).join("; ")};`,
      };
    }
  }
  if (!definition) return { definition: derivation, derivation: null };
  return { definition, derivation };
}
