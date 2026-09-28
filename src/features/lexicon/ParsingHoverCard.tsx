import { useViewportClampedPosition } from "../../lib/useViewportClampedPosition";
import { affixRows, codedAsNote, displayForm, langFor, parsingSentence } from "./parsingDisplay";
import type { ParsedWord } from "./ParsingSection";

/**
 * The small card over an interlinear word the pointer rests on or the
 * keyboard reaches: its whole parsing in a sentence, the prefixes and
 * suffixes written on to it with a line on each, and the code the tagged
 * text gives it, beside the word. The label under the word is the short form; this is the
 * long one, without a click. What each term means is the Strong's card's
 * Parsing section, a click away, which the last line says.
 *
 * It floats just over the word (under it when the word is at the top of the
 * window), and takes no pointer events, so sweeping along a line of words is
 * never caught on the card of the one before.
 */
export function ParsingHoverCard({ id, word, x, y, flipY }: { id: string; word: ParsedWord; x: number; y: number; flipY: number }) {
  const { ref, style } = useViewportClampedPosition<HTMLDivElement>(x, y, { align: "above-center", gap: 6, flipY });
  const { parsing } = word;
  const affixes = affixRows(parsing, word.original_word);
  // The code is beside the word; where it names something the parsing does
  // not, the card says why, as the Strong's card's Parsing section does.
  const codeNote = word.morph_code ? codedAsNote(parsing) : null;
  return (
    <div
      ref={ref}
      id={id}
      role="tooltip"
      style={style}
      className="pointer-events-none z-40 w-72 max-w-[calc(100vw-16px)] rounded-lg border border-line bg-surface px-3 py-2 text-left text-sm shadow-xl"
    >
      <div className="mb-0.5 flex items-baseline gap-2">
        <span className="text-lg leading-tight text-ink" lang={langFor(parsing)} dir="auto">
          {displayForm(word)}
        </span>
        {word.lemma && (
          <span className="min-w-0 truncate text-xs text-ink-3" lang={langFor(parsing)}>
            from {word.lemma}
          </span>
        )}
        {word.morph_code && <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-3">{word.morph_code}</span>}
      </div>
      <p className="leading-snug text-ink">{parsingSentence(parsing)}</p>
      {codeNote && <p className="mt-0.5 text-[11px] leading-snug text-ink-3">{codeNote}</p>}
      {affixes.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 border-t border-line pt-1.5 text-xs leading-snug">
          {affixes.map((a, i) => (
            <li key={i}>
              <span className="font-medium text-ink-2">{a.term}</span>
              {a.detail && <span className="text-ink-2"> · {a.detail}</span>}
              {a.short && <span className="text-ink-3"> {a.short}</span>}
            </li>
          ))}
        </ul>
      )}
      {/* The hint has the line to itself, the code having gone up beside the
          word: sharing it, the hint left a lone "means" on a second line.
          Both are in the third ink, which is legible at this size in every
          theme; the fourth was 3.2:1 on white. */}
      <p className="mt-1.5 text-[11px] leading-snug text-ink-3">Click for the entry and what each term means</p>
    </div>
  );
}
