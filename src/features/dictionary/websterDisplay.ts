/**
 * Webster's 1828 dictionary as the Dictionary page and the word card show
 * it.
 *
 * An entry comes as Webster printed it (reference/webster1828/SOURCES.md):
 * one `<p>` per printed paragraph, the first the heading line -- the
 * headword in bold with its accent marks, then the part of speech and the
 * etymology in brackets -- and after it the numbered senses, each followed
 * by the quotations that show it, a quotation ending in its Scripture
 * citation. Only `<p>`, `<b>`, `<i>` and `<a class="scripref">` occur, and
 * no `<p>` carries attributes, which is what lets the helpers here read the
 * markup with patterns rather than a parser.
 *
 * The word card has room for a line or two of an entry, not the entry, and
 * the line or two it shows has to be the right one. Webster's first sense is
 * usually the one a modern reader already knows, and the sense the King
 * James Version means is often further down: LET's fifth, "to retard; to
 * hinder", is the one 2 Thessalonians 2:7 needs. Webster cites the chapter
 * for it, though, and the card knows which chapter is being read, so where
 * one of his senses cites that chapter the card shows that sense beside the
 * first, and says why.
 */

/** Which of the page's two works is showing: the Bible dictionaries
 *  (Easton's and Smith's, one article per headword) or Webster's 1828
 *  dictionary of English. */
export type DictionaryWork = "bible" | "webster";

/**
 * The work a Dictionary pane shows. What the pane itself says comes first:
 * the switch writes `work` into its params, so a pane opened on Webster
 * stays on Webster through a restart. A pane that says nothing but was
 * opened on something -- a Bible-dictionary headword from the Factbook, a
 * Webster entry from the word card -- shows the work that something belongs
 * to. Only a bare Dictionary pane falls back to the work the reader chose
 * last (a setting, like the page's choice of Easton's or Smith's), and while
 * that setting is still loading there is no telling yet: null, so the page
 * does not show one work for a moment and then the other.
 */
export function dictionaryWorkShown(
  params: { slug: string | null; work?: DictionaryWork; webster?: number | null },
  remembered: DictionaryWork | undefined,
): DictionaryWork | null {
  if (params.work === "bible" || params.work === "webster") return params.work;
  if (params.slug) return "bible";
  if (params.webster != null) return "webster";
  return remembered ?? null;
}

/** Webster's part-of-speech labels written out, for a tooltip. Webster's
 *  abbreviations stay on the page -- they are his -- but "v.t." is not
 *  self-explanatory to everyone. */
const PART_OF_SPEECH: Record<string, string> = {
  "n.": "noun",
  "a.": "adjective",
  "v.t.": "verb transitive",
  "v.i.": "verb intransitive",
  "v.": "verb",
  "adv.": "adverb",
  "pp.": "participle passive",
  "ppr.": "participle present",
  "part.": "participle",
  "pret.": "preterit (past tense)",
  "prep.": "preposition",
  "pron.": "pronoun",
  "conj.": "conjunction",
  "con.": "conjunction",
  "exclam.": "exclamation",
  "n.plu.": "noun plural",
  "plu.": "plural",
};

/** "verb transitive" for "v.t.", or null for a label not in the list. */
export function partOfSpeechName(pos: string | null | undefined): string | null {
  return pos ? (PART_OF_SPEECH[pos] ?? null) : null;
}

/** The inner HTML of each `<p>` of an entry, in order. */
export function websterParagraphs(html: string): string[] {
  return [...html.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => m[1]);
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };

/** A paragraph's words without its markup. */
export function paragraphText(fragment: string): string {
  return fragment
    .replace(/<[^>]*>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, name: string) => ENTITIES[name])
    .replace(/\s+/g, " ")
    .trim();
}

/** "1. To go before; to precede." -- a numbered sense rather than a
 *  quotation or a further note under one. */
function isNumbered(fragment: string): boolean {
  return /^\d{1,2}\.\s/.test(paragraphText(fragment));
}

/** The `data-osis` of every Scripture link in a fragment. */
function citations(fragment: string): string[] {
  return [...fragment.matchAll(/data-osis="([^"]+)"/g)].map((m) => m[1]);
}

/** A paragraph that is nothing but citations ("1 Cor. 8. Col. 3."). */
function citationsOnly(fragment: string): boolean {
  return citations(fragment).length > 0 && paragraphText(fragment.replace(/<a\b[^>]*>[\s\S]*?<\/a>/g, "")).replace(/[.,;:\s]/g, "") === "";
}

/** Escapes a label for use inside a pattern. */
function escapeForPattern(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The grammatical labels among the abbreviations of a heading: where one
 *  stands, the words after it are the word's forms ("pret. and pp. had",
 *  "plu. men"), not its sense. */
const GRAMMAR_LABEL = /^(?:pret|preterit|pp|ppr|plu|plur|pl|part|pert|comp|superl)$/;

/**
 * The heading line split into its headword and whatever definition it
 * carries. Webster often defines a word on the heading line itself ("LET,
 * n. A retarding; hinderance; obstacle") and numbers only the senses after
 * it, so what follows the headword counts as a sense -- once what Webster
 * prints before a definition is past, and if a definition is what comes
 * next. In order, that is:
 *
 * - the part of speech, printed "v.t.", "v. t." or in italics ("<i>v</i>.
 *   <i>t</i>.", "<i>v. t. sers.</i>" -- italics that hold only lower-case
 *   labels are labels, whatever they say: "<i>comparative</i> deg.");
 * - a pronunciation, respelt in lower case with its stop ("hous.", "a'bl.",
 *   "ther'fore.", "iz.") or given as a rule ("s as z.");
 * - the word's forms, grammatical labels with the forms after them
 *   ("pret. and pp. had.", "plu. men.");
 * - and the etymology, in brackets, sometimes two ("[L. casa; Heb. to put
 *   on, to cover.]").
 *
 * After the forms, what follows is more grammar until a bracket closes it:
 * HAVE's "pret. and pp. had. Present, I have, thou hast" and LET's "pret.
 * and pp. let. Letted is obsolete. [To let out...]" have no definition on
 * the line, where BESPREAD's "pret. and pp. bespread. [be and spread.] To
 * spread over" has one. What is left counts as a definition unless it is
 * still grammar ("or auxiliary; pret. Did", "substantive, ppr.being") or a
 * lone word -- a respelling Webster printed without a stop ("bild") or the
 * label "Obs." -- though one capitalised word can be the whole definition
 * ("ABOUND'ING, n. Increase."). A definition may begin in lower case: more
 * than a thousand do ("ABLAC'TATE, v.t. to wean from the breast").
 *
 * A headword printed in several bold pieces ("ABAS'SI, or ABAS'SIS") is read
 * as one. `printed` is the rest of the line as printed, etymology and all:
 * all there is to show of an entry that is only a cross-reference
 * ("ABAISANCE, [See Obeisance.]").
 */
export function splitHeading(heading: string, pos: string | null): { headword: string; definition: string | null; printed: string } {
  const lead = /^\s*<b>[^<]*<\/b>(?:(?:\s*(?:,|;|\bor\b|\band\b))*\s*<b>[^<]*<\/b>)*/.exec(heading);
  // "<b>CONSTRICT</b><b>,</b>": the comma is not the headword's.
  const headword = lead ? paragraphText(lead[0]).replace(/[\s,;]+$/, "") : "";
  let rest = lead ? heading.slice(lead[0].length) : heading;
  rest = rest.replace(/^\s*,?\s*/, "");
  // "v.t." is printed "v.t." or "v. t.": let the space in. And not the
  // start of a word: pos "a." is not the "a" of "an abortion".
  const label = pos
    ? new RegExp(`^${pos.split(".").filter(Boolean).map(escapeForPattern).join("\\.\\s*")}\\.?(?![a-z])`)
    : null;
  if (label) rest = rest.replace(label, "").replace(/^\s+/, "");
  const printed = rest.trim();

  let grammar = false;
  let closedByBracket = false;
  for (;;) {
    rest = rest.replace(/^[\s,;:.]+/, "");
    const italic = /^<i>([^<]*)<\/i>/.exec(rest);
    const skip =
      (italic && !/\p{Lu}/u.test(italic[1]) && italic[1].trim().split(/\s+/).length <= 3 ? italic : null) ??
      // An etymology Webster did not close ("ALTAR, n. [L. altare, probably
      // from the same root as altus, high.") runs to the end of the line.
      /^\[[^\]]*(?:\]|$)/.exec(rest) ??
      /^[a-z] as [a-z]\b/.exec(rest) ??
      // A number, not the forms: "SWINE, n. sing. and plu. A hog".
      /^sing\.\s*and\s+plu\./.exec(rest) ??
      /^(?:(?:and|or)\s+(?:[a-z][a-z'-]*|[A-Z])|[a-z][a-z'-]*|Plu|Pret)\.(?![a-z])/.exec(rest);
    if (!skip) break;
    const token = skip[0];
    if (token.startsWith("[")) closedByBracket = grammar;
    // "or pp." after the part of speech is another part of speech ("FEINT,
    // a. or pp. Counterfeit"); "and pp." carries the forms on.
    else if (!token.startsWith("or ") && GRAMMAR_LABEL.test(token.replace(/^and\s+/, "").replace(/\.$/, "").toLowerCase())) {
      grammar = true;
      closedByBracket = false;
    }
    rest = rest.slice(token.length);
  }
  rest = rest.trim();

  // Judged without its brackets, which say where a word comes from or
  // whether it is still in use, not what it means. The word a form is of
  // ends the forms as a bracket does, and stays with the definition: "pp.
  // of hide. Concealed; placed in secrecy", "pret. and pp. of keep."
  const text = paragraphText(rest.replace(/\[[^\]]*(?:\]|$)/g, " "));
  const words = text.split(" ").filter((w) => /\p{L}/u.test(w));
  const stillGrammar =
    (grammar && !closedByBracket && !/^of\b/.test(text)) ||
    /^(?:or|and)\b/.test(text) ||
    (/^\p{Ll}/u.test(text) && /\b(?:pret|pp|ppr|plu)\./.test(text.slice(0, 60)));
  const oneWordDefinition = words.length === 1 && /^\p{Lu}\p{Ll}/u.test(words[0]) && words[0] !== "Obs.";
  return { headword, definition: (words.length >= 2 || oneWordDefinition) && !stillGrammar ? rest : null, printed };
}

/** One sense of an entry: its own paragraph, and what it cites. */
export interface WebsterSense {
  /** The sense as inner HTML ("1. To go before; to precede."). */
  html: string;
  /** The Scripture its paragraph and the quotations under it cite, as
   *  OSIS references ("Ps.119.147", "2Thess.2.1-2Thess.2.17"). */
  cites: string[];
  /** The paragraphs under it, up to the next sense: the quotations that
   *  show it, and any note on it ("[In this sense, the word is
   *  obsolete...]"). */
  under: string[];
  /** True for a definition on the heading line, which occupies no
   *  paragraph of its own. */
  inHeading: boolean;
}

/**
 * An entry's senses in order: the heading line's definition when it has
 * one, then the numbered senses, each with the quotations that follow it up
 * to the next number. An entry with no numbers at all (QUICK, v.i.: the
 * heading, then "To stir; to move.") takes its first paragraph that is more
 * than a citation.
 */
export function websterSenses(html: string, pos: string | null): { headword: string; senses: WebsterSense[]; paragraphs: number } {
  const paragraphs = websterParagraphs(html);
  if (paragraphs.length === 0) return { headword: "", senses: [], paragraphs: 0 };
  const { headword, definition, printed } = splitHeading(paragraphs[0], pos);
  const body = paragraphs.slice(1);
  const senses: WebsterSense[] = [];
  const firstNumbered = body.findIndex(isNumbered);
  if (definition) {
    const under = firstNumbered < 0 ? body : body.slice(0, firstNumbered);
    senses.push({ html: definition, cites: [...citations(paragraphs[0]), ...under.flatMap(citations)], under, inHeading: true });
  }
  if (firstNumbered >= 0) {
    for (let i = firstNumbered; i < body.length; i++) {
      if (!isNumbered(body[i])) continue;
      let end = i + 1;
      while (end < body.length && !isNumbered(body[end])) end++;
      senses.push({ html: body[i], cites: body.slice(i, end).flatMap(citations), under: body.slice(i + 1, end), inHeading: false });
    }
  } else if (!definition) {
    const first = body.findIndex((p) => !citationsOnly(p) && paragraphText(p).length > 0);
    if (first >= 0) senses.push({ html: body[first], cites: body.slice(first).flatMap(citations), under: body.slice(first + 1), inHeading: false });
  }
  if (senses.length === 0 && paragraphText(printed).length > 0) {
    senses.push({ html: printed, cites: citations(printed), under: [], inHeading: true });
  }
  return { headword, senses, paragraphs: paragraphs.length };
}

/** The chapter a double-clicked word was read in: an OSIS book code
 *  ("2Thess") and a chapter. */
export interface ReadingPlace {
  book: string;
  chapter: number;
}

/** Whether an OSIS reference ("Ps.119.147", "2Thess.2.1-2Thess.2.17",
 *  "Acts.7.9-Acts.7.10") falls in `place`'s chapter. Webster cites by
 *  chapter, so the chapter is what is compared, not the verse. */
export function citesChapter(osis: string, place: ReadingPlace): boolean {
  const m = /^([1-3]?[A-Za-z]+)\.(\d+)\.\d+(?:-(?:([1-3]?[A-Za-z]+)\.)?(\d+)\.\d+)?$/.exec(osis);
  if (!m || m[1] !== place.book) return false;
  const from = Number(m[2]);
  const to = m[4] != null && (m[3] == null || m[3] === m[1]) ? Number(m[4]) : from;
  return place.chapter >= from && place.chapter <= to;
}

/** What the word card shows of a lookup before "More". */
export interface WebsterPreview {
  /** Which of the lookup's entries it shows. */
  entryIndex: number;
  /** The headword as printed, accent marks and all ("PREVENT'"). */
  headword: string;
  /** Each sense shown, whether Webster cites the chapter being read for
   *  it, and, where the citation is not on the sense's own line, the
   *  quotation under it that carries it -- so the card says why, rather
   *  than flagging "1. ... as quick flesh. Lev. 13." for a reader of 2
   *  Timothy 4, whose verse is the quotation after it. */
  senses: { html: string; citesHere: boolean; quote: string | null }[];
  /** Whether "More" would show anything further: another sense, a
   *  quotation, or another entry under the word. */
  more: boolean;
}

/**
 * The fullest of `entries`, by index -- of those filed under `key`, when
 * that is given and any are. Homographs are not in order of importance
 * (QUICK's first is the verb "to stir" [not in use], its adjective "alive;
 * living" the third), and the entry Webster wrote most under is the one a
 * reader most likely wants.
 */
export function fullestIndex(entries: readonly { html: string; key?: string }[], key?: string): number {
  const within = key != null && entries.some((e) => e.key === key);
  let best = -1;
  entries.forEach((e, i) => {
    if (within && e.key !== key) return;
    if (best < 0 || e.html.length > entries[best].html.length) best = i;
  });
  return best;
}

/**
 * The entry and the senses the card shows for a word. The entry is the one
 * that cites the chapter being read, if one does; otherwise the fullest
 * under `prefer` -- the key the lookup matched -- so a word that is also
 * another's form is shown by its own entries first, as the lookup orders
 * them: SAW's, not SEE's, though SEE says more. Of that entry, its first
 * sense, and then either the sense that cites the chapter being read or its
 * second: `count` in all. A sense cited for the chapter in a quotation
 * under it brings that quotation along.
 */
export function websterPreview(
  entries: readonly { html: string; pos: string | null; key?: string }[],
  place: ReadingPlace | null,
  { count = 2, prefer }: { count?: number; prefer?: string } = {},
): WebsterPreview | null {
  if (entries.length === 0) return null;
  const read = entries.map((e) => websterSenses(e.html, e.pos));
  const citing = (s: WebsterSense) => !!place && s.cites.some((c) => citesChapter(c, place));
  let entryIndex = place ? read.findIndex((r) => r.senses.some(citing)) : -1;
  if (entryIndex < 0) entryIndex = fullestIndex(entries, prefer);
  const { headword, senses, paragraphs } = read[entryIndex];
  const cited = senses.findIndex(citing);
  const chosen: number[] = [];
  for (let i = 0; i < senses.length && chosen.length < count; i++) {
    const room = count - chosen.length;
    // Keep the last place for the cited sense when it is further down.
    if (cited > i && room === 1) {
      chosen.push(cited);
      break;
    }
    chosen.push(i);
  }
  const here = (fragment: string) => !!place && citations(fragment).some((c) => citesChapter(c, place));
  const shown = chosen.map((i) => {
    const sense = senses[i];
    const citesHere = citing(sense);
    const quote = citesHere && !here(sense.html) ? (sense.under.find(here) ?? null) : null;
    return { html: sense.html, citesHere, quote };
  });
  const shownParagraphs = chosen.filter((i) => !senses[i].inHeading).length + shown.filter((s) => s.quote != null).length;
  return {
    entryIndex,
    headword,
    senses: shown,
    more: entries.length > 1 || paragraphs - 1 > shownParagraphs,
  };
}

/**
 * An entry's HTML with each paragraph marked for what it is, for the
 * page to set apart: `wb-head` the heading line, `wb-sense` a numbered
 * sense, `wb-quote` a paragraph that cites Scripture -- a quotation and its
 * citation, or a citation on a line of its own. Other paragraphs (a
 * quotation Webster gives no citation for, a note) are left as they are:
 * nothing in the markup tells a quotation from a sentence of definition.
 */
export function markWebsterParagraphs(html: string): string {
  let index = 0;
  return html.replace(/<p>([\s\S]*?)<\/p>/g, (_, inner: string) => {
    const kind = index++ === 0 ? "wb-head" : isNumbered(inner) ? "wb-sense" : citations(inner).length > 0 ? "wb-quote" : null;
    return kind ? `<p class="${kind}">${inner}</p>` : `<p>${inner}</p>`;
  });
}

/**
 * The runs of `text` a line may not break inside, as [start, end) offsets:
 * its words, a hyphen staying with the part before it ("CRAW-", "FISH,").
 * A headword's accent mark is no place to break ("TRANSUBSTANTIA'TION").
 */
export function unbreakableRuns(text: string): [number, number][] {
  const runs: [number, number][] = [];
  for (const word of text.matchAll(/\S+/g)) {
    let start = word.index;
    for (const part of word[0].matchAll(/[^-]*-+|[^-]+$/g)) {
      const end = word.index + part.index + part[0].length;
      runs.push([start, end]);
      start = end;
    }
  }
  return runs;
}

/**
 * How much to scale a line that must not break inside a word, so that its
 * widest run (see unbreakableRuns; `widths` at the line's own size) fits a
 * column `available` wide: 1 where it fits already, and never below `least`
 * -- a word too long even then is broken after all, rather than set too
 * small to read.
 */
export function fitScale(widths: number[], available: number, least = 0.5): number {
  const widest = Math.max(0, ...widths);
  if (widest <= available || available <= 0) return 1;
  return Math.max(least, available / widest);
}

/**
 * The entry Enter opens from the Dictionary page's search box. A reader who
 * types a headword and presses Enter means that headword, so it is the
 * fullest entry under the word as typed (the lookup's `query`) when Webster
 * has one -- "lent" opens LENT, the fast, not LEND, though the lookup puts
 * the verb first for a reader of "lent unto the LORD" -- and otherwise the
 * fullest under the key the lookup matched: "prevented" is not a headword
 * of its own on every page, "knoweth" never is.
 */
export function websterEnterTarget(
  lookup: { query: string; matched: string; entries: readonly { id: number; key: string; html: string }[] } | null | undefined,
): number | null {
  if (!lookup || lookup.entries.length === 0) return null;
  const typed = lookup.entries.some((e) => e.key === lookup.query);
  return lookup.entries[fullestIndex(lookup.entries, typed ? lookup.query : lookup.matched)].id;
}

/** How many rows the browse list asks for at a time. */
export const BROWSE_PAGE = 200;

/**
 * A page of the A-Z list: the rows to show, and where the next page starts,
 * or null where there is none.
 *
 * The browse command lists the entries from its prefix on, `limit` at a
 * time, in dictionary order, homographs in Webster's order -- so a page can
 * stop partway through a word: LET the verb transitive and intransitive at
 * the foot of one page, LET the noun and the suffix due at the head of the
 * next. The next page cannot start after LET without losing those, nor at
 * LET without repeating the first two; so a full page gives up the word it
 * stops in, and the next page starts at that word and shows it whole. (A
 * word with more entries than a page would leave nothing to show; none has
 * more than ten, and a page that is all one word is shown as it is and the
 * list goes on after it.)
 *
 * The list runs on from where it starts into the letters after it, so the
 * rows are only those under `letter`, and a page that ran on past them, or
 * came back short of `limit`, is the last of the letter.
 */
export function browsePage<T extends { key: string }>(
  rows: readonly T[],
  letter: string,
  limit: number,
): { rows: T[]; next: string | null } {
  const l = letter.toLowerCase();
  const under = rows.filter((r) => r.key.toLowerCase().startsWith(l));
  if (under.length < rows.length || rows.length < limit || under.length === 0) return { rows: under, next: null };
  const lastKey = under[under.length - 1].key;
  let end = under.length;
  while (end > 0 && under[end - 1].key === lastKey) end--;
  // A key is letters, hyphens and the odd space, and a space sorts before
  // both a hyphen and a letter: "abase a" comes after every ABASE and
  // before ABASE-MENT and ABASED.
  if (end === 0) return { rows: under, next: `${lastKey} a` };
  return { rows: under.slice(0, end), next: lastKey };
}

/**
 * Whether an entry is itself a form of another word: a participle, preterit
 * or plural by its part of speech ("pp.", "ppr.", "pret.", "plu.",
 * "n.plu."), or by what its heading says it is -- "FEET, n. plu of foot",
 * "IS, v.i. iz. [L. est.] The third person singular of the substantive
 * verb", "ARE. The plural of the substantive verb", and, where Webster
 * prints no part of speech, "WAST, past tense of..." or "'ART, The second
 * person... of the substantive verb am". LENT the fast, ART the arts, SPOKE
 * of a wheel and WILT, to wither, are words of their own -- and so is HAVE,
 * whose "pret. and pp. had" gives its own forms, not another word's.
 */
export function isInflectionEntry(entry: { pos: string | null; html: string }): boolean {
  if (entry.pos && /^(?:pp|ppr|pret|plu|n\.plu|part)\.$/.test(entry.pos)) return true;
  const { printed } = splitHeading(websterParagraphs(entry.html)[0] ?? "", entry.pos);
  const heading = paragraphText(printed.replace(/\[[^\]]*(?:\]|$)/g, " ")).slice(0, 100);
  if (/(?:^|\s)(?:plu|plur|pret|pp|ppr)\.?\s+of\b|\bplural of\b|\b(?:second|third) person\b/i.test(heading)) return true;
  return !entry.pos && /\b(?:pret|preterit|preterite|participle|part\.|pp\.|ppr\.|past tense)/i.test(heading);
}

/**
 * How the other entries a lookup of an entry's own key finds stand to it,
 * for the page to link: its homographs (LET the noun, beside LET the verb);
 * the word it is a form of, when it is a form and the lookup went there
 * first (PREVENT'ED, pp., whose own entry is one line, is PREVENT's
 * participle); and any other word the lookup brought in (SAW, which is also
 * SEE's preterit, brings SEE; LENT the fast brings LEND, which the lookup
 * puts first for the KJV's "lent", but LENT is no form of it). Another word
 * stands for itself by its fullest entry.
 */
export function entryRelations<E extends { id: number; key: string; html: string; pos: string | null }>(
  entry: { id: number; key: string; html: string; pos: string | null },
  lookup: { matched: string; via: "exact" | "alias" | "base"; entries: E[] } | null | undefined,
): { homographs: E[]; formOf: E | null; related: E[] } {
  if (!lookup) return { homographs: [], formOf: null, related: [] };
  const homographs = lookup.entries.filter((e) => e.key === entry.key && e.id !== entry.id);
  const byKey = new Map<string, E[]>();
  for (const e of lookup.entries) {
    if (e.key === entry.key) continue;
    byKey.set(e.key, [...(byKey.get(e.key) ?? []), e]);
  }
  const aForm = isInflectionEntry(entry);
  let formOf: E | null = null;
  const related: E[] = [];
  for (const [key, group] of byKey) {
    const fullest = group[fullestIndex(group)];
    if (aForm && lookup.via === "base" && key === lookup.matched) formOf = fullest;
    else related.push(fullest);
  }
  return { homographs, formOf, related };
}
