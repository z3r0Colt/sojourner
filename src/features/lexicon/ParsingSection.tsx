import { useId, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { MorphologyWord, MorphParsing } from "../../api/types";
import { cx, sectionLabelClass } from "../../components/ui/classes";
import { affixRows, codedAsNote, displayForm, langFor, parsingSentence, wordTermRows } from "./parsingDisplay";
import { useHebrewDisplay } from "./originalText";

/** A word occurrence known to have a parsing. */
export type ParsedWord = MorphologyWord & { parsing: MorphParsing };

/** The word the card was opened for, when it is one particular word of the
 *  verse and has a parsing to show. */
export function parsedWordOrNull(word: MorphologyWord | null | undefined): ParsedWord | null {
  return word?.parsing ? (word as ParsedWord) : null;
}

/**
 * The Parsing section of the Strong's card: what this one occurrence of the
 * word is, in the manner of the Blue Letter Bible's parsing -- the word as
 * written in the verse, its whole parsing in a line, then a row for each
 * term with the glossary's name and one-line gloss, and the Hebrew prefixes
 * and suffixes written on to it.
 *
 * Every row opens to the glossary's full explanation, but starts closed. The
 * section sits between the headword and the definition, and the card scrolls
 * inside itself once it is taller than the window; six or seven rows of a
 * line or two each is as much as it can take there without putting the
 * definition out of sight, and a reader who wants to know what the aorist is
 * asks for it.
 */
export function ParsingSection({ word }: { word: ParsedWord }) {
  const { parsing } = word;
  const lang = langFor(parsing);
  const hebrew = useHebrewDisplay();
  // Said only where the code is on show to be read against the parsing.
  const codeNote = word.morph_code ? codedAsNote(parsing) : null;
  return (
    <section aria-label="Parsing" className="mb-2 rounded-md border border-line bg-surface-2 px-2 py-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className={sectionLabelClass}>Parsing</span>
        {word.morph_code && (
          <span className="font-mono text-[11px] text-ink-3" title="The parsing code in the tagged text">
            {word.morph_code}
          </span>
        )}
      </div>
      {codeNote && <p className="mb-1 text-[11px] leading-snug text-ink-3">{codeNote}</p>}
      <p className="mb-1 text-sm leading-snug text-ink">
        <span className="mr-1.5 text-base" lang={lang} dir="auto">
          {hebrew(displayForm(word))}
        </span>
        <span className="text-ink-2">{parsingSentence(parsing)}</span>
      </p>
      <ParsingTerms parsing={parsing} word={word.original_word} />
    </section>
  );
}

/**
 * A parsing's terms, one row each, every row opening to what the glossary
 * says of it: the word's own terms, then its Hebrew prefixes and suffixes
 * under their own heading. The Strong's card's Parsing section is these
 * under the word and its sentence; the word study opens them under a form
 * or an occurrence. Given the word as written, a prefixed preposition says
 * which of the four it is (see `affixRows`); a form grouped from several
 * spellings can be given none, and the row names the kind alone.
 */
export function ParsingTerms({ parsing, word }: { parsing: MorphParsing; word?: string | null }) {
  const terms = wordTermRows(parsing);
  const affixes = affixRows(parsing, word);
  return (
    <>
      {terms.length > 0 && (
        <ul className="space-y-px">
          {terms.map((t) => (
            <TermRow key={t.key} term={t.term} detail={t.detail} short={t.short} explain={t.explain} />
          ))}
        </ul>
      )}
      {affixes.length > 0 && (
        <>
          <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Prefixes and suffixes</div>
          <ul className="space-y-px">
            {affixes.map((a, i) => (
              <TermRow key={i} term={a.term} detail={a.detail} short={a.short} explain={a.explain} />
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/**
 * One term: its name and gloss on a button that opens the full explanation
 * underneath (a disclosure, so Enter and Space work and a screen reader hears
 * whether it is open). A term the glossary has nothing on is a plain row.
 */
function TermRow({ term, detail, short, explain }: { term: string; detail?: string | null; short: string | null; explain: string | null }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const text = (
    <span className="min-w-0">
      <span className="font-medium text-ink">{term}</span>
      {detail && <span className="text-ink-2"> · {detail}</span>}
      {short && <span className="text-ink-3"> {short}</span>}
    </span>
  );
  if (!explain) {
    return <li className="flex items-start gap-1 px-1 py-0.5 pl-5 text-xs leading-snug">{text}</li>;
  }
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-1 rounded px-1 py-0.5 text-left text-xs leading-snug hover:bg-hover"
      >
        <ChevronRight className={cx("mt-px h-3.5 w-3.5 shrink-0 text-ink-3 transition-transform", open && "rotate-90")} aria-hidden="true" />
        {text}
      </button>
      <p id={id} hidden={!open} className="mb-1 ml-5 mr-1 mt-0.5 text-xs leading-relaxed text-ink-2">
        {explain}
      </p>
    </li>
  );
}
