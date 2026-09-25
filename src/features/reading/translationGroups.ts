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
 * nothing in them are left out. */
export function groupTranslations(translations: Translation[]): TranslationGroup[] {
  const groups: Record<ReturnType<typeof translationGroup>, Translation[]> = { historic: [], modern: [], original: [] };
  for (const t of translations) groups[translationGroup(t)].push(t);
  return [
    { label: "Historic English", translations: groups.historic },
    { label: "Modern English", translations: groups.modern },
    { label: "Greek, Hebrew and Latin", translations: groups.original },
  ].filter((g) => g.translations.length > 0);
}
