// Engraves a psalm tune as a melody line with the words under it.
//
// Deliberately plain: a treble staff, note heads, stems, and the stanza's own
// words beneath. A psalm tune is one note to a syllable and has no rhythm
// beyond long and short, so it needs neither beams nor bar lines to be read
// and sung from -- and leaving them out keeps the words legible at the size a
// study pane gives it.

import type { PsalmTune } from "../../api/types";

// Drawn at its own size rather than stretched to the pane: a staff that is
// scaled up to fill the width magnifies every measurement with it, and the
// words end up colliding under notes they no longer sit beneath.
const LINE_GAP = 9; // between staff lines
const STEP = LINE_GAP / 2; // one note's worth of vertical movement
const STAFF_TOP = 24; // room above for ledger lines
const STAFF_HEIGHT = LINE_GAP * 4;
const LYRIC_BASELINE = STAFF_TOP + STAFF_HEIGHT + 30;
const HEIGHT = LYRIC_BASELINE + 8;
const LEFT = 30;
const SYLLABLE = 34; // width of one syllable's worth of staff
const NOTE = 15; // a second note within one syllable sits this far along
// Drawn once at the size above, then shown a little larger -- the staff stays
// vector-crisp and every measurement scales with it.
const SCALE = 1.35;

// The seven letters, their diatonic step, and the semitone each sits on.
const LETTERS = [
  { name: "C", step: 0, pitch: 0 },
  { name: "D", step: 1, pitch: 2 },
  { name: "E", step: 2, pitch: 4 },
  { name: "F", step: 3, pitch: 5 },
  { name: "G", step: 4, pitch: 7 },
  { name: "A", step: 5, pitch: 9 },
  { name: "B", step: 6, pitch: 11 },
];

// The order the signs are written in, and where each sits on a treble staff
// -- diatonic steps above the bottom line (E4). These positions are fixed by
// convention, not derived: the first flat is always B on the middle line.
const SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"];
const SHARP_STEPS = [8, 5, 9, 6, 3, 7, 4];
const FLAT_ORDER = ["B", "E", "A", "D", "G", "C", "F"];
const FLAT_STEPS = [4, 7, 3, 6, 2, 5, 1];
const FIFTHS: Record<string, number> = {
  "C#": 7, "F#": 6, B: 5, E: 4, A: 3, D: 2, G: 1, C: 0,
  F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7,
};

/** The key's own accidentals, as letter -> semitone offset. These belong at
 *  the head of the staff, not against every note that uses them. */
function keySignature(key: string | null): {
  alter: Record<string, number>;
  signs: { letter: string; steps: number }[];
  sign: "♯" | "♭";
} {
  const match = (key ?? "C").trim().match(/^([A-G][#b]?)\s*(m|min)?/i);
  let fifths = match ? (FIFTHS[match[1]] ?? 0) : 0;
  if (match && /^m/i.test(match[2] ?? "")) fifths -= 3; // relative major
  const alter: Record<string, number> = {};
  const signs: { letter: string; steps: number }[] = [];
  for (let i = 0; i < Math.min(Math.abs(fifths), 7); i++) {
    const letter = (fifths > 0 ? SHARP_ORDER : FLAT_ORDER)[i];
    alter[letter] = fifths > 0 ? 1 : -1;
    signs.push({ letter, steps: (fifths > 0 ? SHARP_STEPS : FLAT_STEPS)[i] });
  }
  return { alter, signs, sign: fifths > 0 ? "♯" : "♭" };
}

/** Where a note sits on the staff, and whether it needs a sign of its own.
 *  A pitch the key signature already accounts for is drawn plain. */
function place(midi: number, alter: Record<string, number>): { steps: number; accidental: string | null } {
  const octave = Math.floor(midi / 12) - 1;
  const pitch = ((midi % 12) + 12) % 12;

  // Prefer the spelling the key gives, so A flat major's 68 is A flat and not
  // G sharp -- it belongs on the A line, with no sign.
  for (const letter of LETTERS) {
    const shifted = ((letter.pitch + (alter[letter.name] ?? 0)) % 12 + 12) % 12;
    if (shifted === pitch) return { steps: stepsFor(octave, letter.step, pitch, letter.pitch), accidental: null };
  }
  // Outside the key: spell it as an alteration of the nearest letter, in the
  // direction the key is already going.
  const flats = Object.values(alter).some((a) => a < 0);
  for (const letter of LETTERS) {
    if (((letter.pitch + (flats ? -1 : 1)) % 12 + 12) % 12 !== pitch) continue;
    // A letter the key alters, now sounding natural, needs a natural sign.
    const natural = (alter[letter.name] ?? 0) !== 0 && letter.pitch === pitch;
    return {
      steps: stepsFor(octave, letter.step, pitch, letter.pitch),
      accidental: natural ? "♮" : flats ? "♭" : "♯",
    };
  }
  return { steps: (octave - 4) * 7 - 2, accidental: null };
}

/** Diatonic distance above the bottom staff line (E4). The pitch/letter pair
 *  is only needed to keep B sharp and C flat in the right octave. */
function stepsFor(octave: number, step: number, pitch: number, letterPitch: number): number {
  let shift = 0;
  if (letterPitch === 11 && pitch === 0) shift = 1; // B sharp sounds as the next C
  if (letterPitch === 0 && pitch === 11) shift = -1; // C flat sounds as the B below
  return (octave - 4 + shift) * 7 + step - 2;
}

export function TuneStaff({
  tune,
  words,
  sounding,
}: {
  tune: PsalmTune;
  /** The stanza's lines, already divided into syllables -- empty when the
   *  psalm could not be divided, in which case the tune shows on its own. */
  words: string[][];
  sounding: { line: number; syllable: number } | null;
}) {
  const key = keySignature(tune.key);
  // The clef, then the key signature, then the notes.
  const staffStart = LEFT + key.signs.length * 6 + 6;

  return (
    <div className="flex flex-col gap-1 overflow-x-auto">
      {tune.lines.map((line, lineIndex) => {
        // Wider spacing where a syllable carries more than one note, so a
        // melisma reads as the two notes it is.
        const widths = line.map((syllable) => SYLLABLE + (syllable.length - 1) * NOTE);
        const width = staffStart + widths.reduce((a, b) => a + b, 0) + 10;
        const lyrics = words[lineIndex] ?? [];

        return (
          <svg
            key={lineIndex}
            viewBox={`0 0 ${width} ${HEIGHT}`}
            width={Math.round(width * SCALE)}
            height={Math.round(HEIGHT * SCALE)}
            className="shrink-0 overflow-visible"
            role="img"
            aria-label={`${tune.name}, line ${lineIndex + 1}`}
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <line
                key={i}
                x1={4}
                x2={width - 4}
                y1={STAFF_TOP + i * LINE_GAP}
                y2={STAFF_TOP + i * LINE_GAP}
                className="stroke-line-2"
                strokeWidth={0.8}
              />
            ))}
            {/* A treble clef drawn as its glyph: the staff is a reading aid
                here, not an engraving, and a glyph keeps it legible small. */}
            <text x={5} y={STAFF_TOP + STAFF_HEIGHT + 2} className="fill-ink-3" fontSize={34}>
              𝄞
            </text>
            {key.signs.map(({ letter, steps }, i) => (
              <text
                key={letter}
                x={LEFT + i * 6}
                y={STAFF_TOP + STAFF_HEIGHT - steps * STEP + 3.5}
                fontSize={11}
                className="fill-ink-3"
              >
                {key.sign}
              </text>
            ))}

            {line.map((syllable, syllableIndex) => {
              const x = staffStart + widths.slice(0, syllableIndex).reduce((a, b) => a + b, 0);
              const lit = sounding?.line === lineIndex && sounding?.syllable === syllableIndex;
              const lyric = lyrics[syllableIndex];

              return (
                <g key={syllableIndex} className={lit ? "fill-accent stroke-accent" : "fill-ink stroke-ink"}>
                  {syllable.map((note, noteIndex) => {
                    const { steps, accidental } = place(note.midi, key.alter);
                    const cx = x + noteIndex * NOTE + SYLLABLE / 2;
                    const cy = STAFF_TOP + STAFF_HEIGHT - steps * STEP;
                    const hollow = note.beats >= 2;
                    const down = cy < STAFF_TOP + STAFF_HEIGHT / 2;
                    // Ledger lines for anything off the staff.
                    const ledgers: number[] = [];
                    for (let y = STAFF_TOP - LINE_GAP; y >= cy - 1; y -= LINE_GAP) ledgers.push(y);
                    for (let y = STAFF_TOP + STAFF_HEIGHT + LINE_GAP; y <= cy + 1; y += LINE_GAP) ledgers.push(y);

                    return (
                      <g key={noteIndex}>
                        {ledgers.map((y) => (
                          <line key={y} x1={cx - 7} x2={cx + 7} y1={y} y2={y} strokeWidth={0.7} />
                        ))}
                        {accidental && (
                          <text x={cx - 13} y={cy + 3.5} fontSize={10} stroke="none">
                            {accidental}
                          </text>
                        )}
                        <ellipse
                          cx={cx}
                          cy={cy}
                          rx={4.6}
                          ry={3.4}
                          transform={`rotate(-20 ${cx} ${cy})`}
                          fill={hollow ? "none" : undefined}
                          strokeWidth={hollow ? 1.2 : 0.7}
                        />
                        {/* Stems turn down above the middle line, as they do
                            on paper, so a high note keeps its stem on staff. */}
                        <line
                          x1={down ? cx - 4.3 : cx + 4.3}
                          x2={down ? cx - 4.3 : cx + 4.3}
                          y1={cy}
                          y2={down ? cy + 22 : cy - 22}
                          strokeWidth={0.9}
                        />
                      </g>
                    );
                  })}
                  {lyric && (
                    <text
                      x={x + SYLLABLE / 2}
                      y={LYRIC_BASELINE}
                      fontSize={11}
                      textAnchor="middle"
                      stroke="none"
                      className={lit ? "fill-accent" : "fill-ink-2"}
                    >
                      {lyric}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        );
      })}
    </div>
  );
}
