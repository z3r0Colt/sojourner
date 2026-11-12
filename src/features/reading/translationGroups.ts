import type { Translation } from "../../api/types";

export interface TranslationGroup {
  label: string;
  translations: Translation[];
}

/** English translations made after 1901, whatever their source format. */
const MODERN_CODES = new Set(["BSB", "LSV", "ULT", "UST", "WEB", "NASB", "NKJV", "NLT", "ESV", "NIV"]);

/** Greek, Hebrew and Latin: the texts the English ones were made from. */
export function isOriginalLanguage(t: Translation): boolean {
  if (t.script !== "latin") return true;
  const lang = (t.language ?? "").toLowerCase();
  return lang.startsWith("grc") || lang.startsWith("hbo") || lang.startsWith("he") || lang.startsWith("el") || lang === "la" || lang.startsWith("lat");
}

export function translationGroup(t: Translation): "modern" | "historic" | "original" {
  if (isOriginalLanguage(t)) return "original";
  if (MODERN_CODES.has(t.code)) return "modern";
  return "historic";
}

/** The picker's headings, in the order a reader looks for them. Groups with
 * nothing in them are left out. What the reader added themselves goes under
 * a heading of its own, whatever its age or language, so it is easy to find. */
export function groupTranslations(translations: Translation[]): TranslationGroup[] {
  const groups: Record<ReturnType<typeof translationGroup> | "user", Translation[]> = { historic: [], modern: [], original: [], user: [] };
  for (const t of translations) groups[t.user_provided ? "user" : translationGroup(t)].push(t);
  return [
    { label: "Historic English", translations: groups.historic },
    { label: "Modern English", translations: groups.modern },
    { label: "Greek, Hebrew and Latin", translations: groups.original },
    { label: "User provided", translations: groups.user },
  ].filter((g) => g.translations.length > 0);
}

/** A translation as the toolbar's dropdown names it: its code, and which
 * Testament it covers when it lacks the other. */
export function translationOptionLabel(t: Pick<Translation, "code" | "scope">): string {
  const scope = t.scope === "Old Testament" ? " (OT)" : t.scope === "New Testament" ? " (NT)" : t.scope ? " (partial)" : "";
  return `${t.code}${scope}`;
}

/** The narrowest the translation dropdown may be: the name of the
 * translation chosen, in `ch` with one to spare for capitals wider than a
 * digit, and room for the padding and the arrow. The toolbar starts the
 * dropdown there and lets it grow into what the book leaves (see the
 * toolbar). */
export function translationSelectFloor(t: Pick<Translation, "code" | "scope"> | undefined): React.CSSProperties | undefined {
  if (!t) return undefined;
  const width = `calc(${translationOptionLabel(t).length + 1}ch + 1.75rem)`;
  return { minWidth: width, flexBasis: width };
}
