/**
 * The word study's parsing: each form it lists, and each occurrence, in the
 * plain words of the interlinear's label ("Noun · acc fem sg"), with the
 * Strong's card's rows for what every term means a click away.
 *
 * The forms come with their parsing, decoded from the code by morph.rs as
 * the card's is. The occurrences come with only their code, and find their
 * parsing among the forms': within one Strong's number a code always reads
 * the same (the few words read otherwise than their code are read so by the
 * number, which is the study's own), and the article's twenty thousand
 * occurrences would otherwise each carry one of the same few dozen
 * parsings.
 */
import type { MorphParsing, WordOccurrence, WordStudy } from "../../api/types";
import { compactParsingLabel } from "./parsingDisplay";

type Form = WordStudy["forms"][number];

/** Each code the study's forms have, to its parsing. */
export function parsingsByCode(forms: readonly Form[]): Map<string, MorphParsing> {
  const byCode = new Map<string, MorphParsing>();
  for (const f of forms) if (f.parsing && f.morph_code && !byCode.has(f.morph_code)) byCode.set(f.morph_code, f.parsing);
  return byCode;
}

/** One occurrence's parsing, by its code; null for a word with no code or
 *  one the forms do not have. */
export function occurrenceParsing(byCode: ReadonlyMap<string, MorphParsing>, o: Pick<WordOccurrence, "morph_code">): MorphParsing | null {
  return (o.morph_code && byCode.get(o.morph_code)) || null;
}

/**
 * What a form or occurrence is, in a line: the compact label where there is
 * a parsing, else the stored description, else the bare code (an older
 * content database's forms have no parsing), else nothing.
 */
export function parsingLine(parsing: MorphParsing | null | undefined, description: string | null | undefined, code: string | null | undefined): string {
  return compactParsingLabel(parsing) || description?.trim() || code?.trim() || "";
}
