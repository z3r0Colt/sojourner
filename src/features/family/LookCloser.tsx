import { useMemo, useState } from "react";
import type { ColorSpan, Passage } from "../../api/types";
import { buildTokens } from "../reading/verseTokens";
import { SegmentText } from "../reading/VerseRow";
import { PRONOUN_TERMS } from "../reading/colorText";

/** The questions color text answers, for a family reading: each with the
 * codes that answer it. Pronouns and the small words of place, time and
 * amount are left out -- a child names Abraham and the ram, not "him" and
 * "there". */
const QUESTIONS: { ask: string; codes: string[] }[] = [
  { ask: "Who is in this reading?", codes: ["GF", "GS", "HS", "AN", "DE", "PN", "PG", "GP"] },
  { ask: "What animals and plants are in it?", codes: ["BE", "PL"] },
  { ask: "Where does it happen?", codes: ["PP", "L1"] },
  { ask: "When does it happen?", codes: ["T1"] },
  { ask: "How many? Find the numbers.", codes: ["NU", "ME"] },
];

/** A verse's text with color text's colors, for family worship's reading. */
export function ColoredText({ text, verse, spans }: { text: string; verse: number; spans: ColorSpan[] }) {
  return (
    <>
      {buildTokens(text, [], verse, [], [], [], spans).map((t, i) => (t.kind === "text" ? <SegmentText key={i} segment={t.segment} /> : null))}
    </>
  );
}

/** "Look closer": Who? What? Where? When? How many?, asked of tonight's
 * reading, each answer kept back until the family has had a go. */
export function LookCloser({ readings }: { readings: { passage: Passage; spans: ColorSpan[] }[] }) {
  const [shown, setShown] = useState<Set<number>>(new Set());
  const answers = useMemo(() => {
    return QUESTIONS.map((q) => {
      const words = new Map<string, { word: string; code: string }>();
      readings.forEach(({ passage: p, spans }) => {
        for (const s of spans) {
          if (!q.codes.includes(s.code) || PRONOUN_TERMS.has(s.term)) continue;
          const v = p.verses.find((x) => x.verse === s.verse);
          if (!v) continue;
          const word = v.text.slice(s.start, s.end);
          // One of each, the KJV's term deciding what counts as the same.
          if (!words.has(s.term)) words.set(s.term, { word, code: s.code });
        }
      });
      return Array.from(words.values());
    });
  }, [readings]);
  if (answers.every((a) => a.length === 0)) return null;
  return (
    <section className="mt-[1em] rounded-lg border border-line bg-surface-2 p-[0.8em]">
      <h3 className="mb-[0.3em] text-[0.75em] font-semibold uppercase tracking-wide text-ink-3">Look closer</h3>
      <ol className="space-y-[0.4em] text-[0.95em] text-ink-2">
        {QUESTIONS.map((q, i) =>
          answers[i].length === 0 ? null : (
            <li key={q.ask}>
              <span className="text-ink">{q.ask}</span>{" "}
              {shown.has(i) ? (
                <span className="mt-[0.2em] flex flex-wrap gap-x-[0.6em] gap-y-[0.1em]">
                  {answers[i].map((a) => (
                    <span key={a.word + a.code} className="ct font-medium" style={{ ["--ct-c" as string]: `var(--ct-${a.code})` }}>
                      {a.word}
                    </span>
                  ))}
                </span>
              ) : (
                <button
                  type="button"
                  className="text-[0.8em] text-accent hover:underline"
                  onClick={() => setShown((s) => new Set(s).add(i))}
                >
                  Show ({answers[i].length})
                </button>
              )}
            </li>
          ),
        )}
      </ol>
    </section>
  );
}
