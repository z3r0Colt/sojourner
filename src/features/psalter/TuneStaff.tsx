// Engraves a psalm tune as a melody line with the words under it.
//
// Deliberately plain: a treble staff, note heads, stems, and the stanza's own
// words beneath. A psalm tune is one note to a syllable and has no rhythm
// beyond long and short, so it needs neither beams nor bar lines to be read
// and sung from -- and leaving them out keeps the words legible at the size a
// study pane gives it.

import { useLayoutEffect, useRef, useState } from "react";
import type { PsalmTune } from "../../api/types";
import { breakLine, fitLyrics, spaceLyrics, wordEnds, type NoteReach } from "./fitLyrics";

// Drawn at its own size rather than stretched to the pane: a staff that is
// scaled up to fill the width magnifies every measurement with it, and the
// words end up colliding under notes they no longer sit beneath.
const LINE_GAP = 9; // between staff lines
const STEP = LINE_GAP / 2; // one note's worth of vertical movement
const STAFF_TOP = 24; // room above for ledger lines
const STAFF_HEIGHT = LINE_GAP * 4;
const STAFF_BOTTOM = STAFF_TOP + STAFF_HEIGHT;
const MIDDLE = STAFF_TOP + STAFF_HEIGHT / 2;
const STEM = 22;
// Each line is drawn only as tall as its notes need -- room above for the
// clef and any high note's ledger lines, and the words set just clear of the
// lowest note or stem -- so a whole stanza takes as little height as it can.
const CLEF_TOP = STAFF_TOP - 8;
const LYRIC_CLEAR = 13; // from the lowest mark on the staff to the words' baseline
const LYRIC_LOWEST = STAFF_BOTTOM + 18; // the words never sit closer than this
const LYRIC_DESCENT = 5;
// The gap between one line's staff and the next, in CSS pixels (gap-2).
const LINE_SPACING = 8;
// Between the two lines of a couplet set side by side, in CSS pixels.
const COLUMN_GAP = 32;
const LEFT = 30;
const SYLLABLE = 34; // width of one syllable's worth of staff
const NOTE = 15; // a second note within one syllable sits this far along
// Drawn once at the size above, then shown a little larger -- the staff stays
// vector-crisp and every measurement scales with it.
const SCALE = 1.35;
const LYRIC_SIZE = 11;
/** The size the words under the notes are shown at, in CSS pixels. */
export const STAFF_LYRIC_PX = LYRIC_SIZE * SCALE;
// The least room between two lyrics: between words, and between the
// syllables of one word, where a hyphen stands in the gap.
const WORD_GAP = 7;
const HYPHEN_GAP = 11;
const HYPHEN = 4;
// A carried lyric starts this far before its note's centre.
const CARRY_INSET = 6;
// A staff too wide for its pane is first drawn smaller, but never below this
// share of the size asked for: past that the words stop being easy to read,
// and the line is broken into shorter systems instead (see `breakLine`).
const SHRINK_FLOOR = 0.8;

// Lyrics are measured as they will be drawn, so neighbours can be kept
// apart: long words on short notes ("thou brought'st down") would otherwise
// run together. A canvas measures text without laying anything out.
let measurer: CanvasRenderingContext2D | null | undefined;
function measure(text: string, family: string): number {
  if (measurer === undefined) {
    try {
      measurer = /jsdom/i.test(navigator.userAgent) ? null : document.createElement("canvas").getContext("2d");
    } catch {
      measurer = null;
    }
  }
  if (!measurer) return text.length * LYRIC_SIZE * 0.55;
  measurer.font = `${LYRIC_SIZE}px ${family}`;
  return measurer.measureText(text).width;
}

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
  texts,
  sounding,
  lyricPx = STAFF_LYRIC_PX,
  fit,
}: {
  tune: PsalmTune;
  /** The stanza's lines, already divided into syllables -- empty when the
   *  psalm could not be divided, in which case the tune shows on its own. */
  words: string[][];
  /** The lines' own text, which says where one word ends and the next
   *  begins; without it every syllable is spaced as a word of its own. */
  texts?: string[];
  sounding: { line: number; syllable: number } | null;
  /** How large the words under the notes are shown, in CSS pixels; the
   *  whole staff scales with them. */
  lyricPx?: number;
  /** Room to fit the whole staff into, in CSS pixels: it is drawn as large
   *  as fits, up to `lyricPx`, and never with its words smaller than
   *  `minLyricPx` (the usual size unless given) -- below that it scrolls. */
  fit?: { width: number; height: number; minLyricPx?: number };
}) {
  const key = keySignature(tune.key);
  // The clef, then the key signature, then the notes.
  const staffStart = LEFT + key.signs.length * 6 + 6;

  // The font the lyrics are drawn in, read from the page so the widths
  // measured are the widths drawn -- and read again once the page's fonts
  // have loaded.
  const host = useRef<HTMLDivElement>(null);
  const [family, setFamily] = useState("sans-serif");
  // The width the staff has to be set in, so a line too wide for a narrow
  // pane is drawn smaller or broken rather than run off the side. Unknown
  // (0) until measured, and never measured in tests, where a line is drawn
  // whole at the size asked for.
  const [across, setAcross] = useState(0);
  const fitted = fit != null;
  useLayoutEffect(() => {
    const el = host.current;
    if (!el || fitted || typeof ResizeObserver === "undefined") return;
    const read = () => setAcross(el.clientWidth);
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [fitted]);
  useLayoutEffect(() => {
    let live = true;
    const read = () => {
      if (live && host.current) setFamily(getComputedStyle(host.current).fontFamily || "sans-serif");
    };
    read();
    document.fonts?.ready.then(read);
    return () => {
      live = false;
    };
  }, []);

  const lines = tune.lines.map((line, lineIndex) => {
    // Wider spacing where a syllable carries more than one note, so a
    // melisma reads as the two notes it is.
    const slots = line.map((syllable) => SYLLABLE + (syllable.length - 1) * NOTE);
    // Every syllable of the line is shown: any beyond the tune's notes
    // (a feminine ending, "ap-point-ed") is carried onto the last note,
    // and the staff runs on far enough to hold it.
    const syllables = words[lineIndex] ?? [];
    const lyrics = fitLyrics(syllables, line.length);
    const text = texts?.[lineIndex];
    const ends = text ? wordEnds(syllables, text) : syllables.map(() => true);
    // A hyphen after a note whose syllable runs on into the next note's
    // ("dwell-ing-" already carries its own).
    const hyphenAfter = line.map(
      (_, i) => i < line.length - 1 && i < syllables.length - 1 && !ends[i] && !syllables[i].endsWith("-"),
    );
    const spaced = lyrics.under.map((lyric, i) => {
      if (!lyric) return null;
      const width = measure(lyric, family);
      const carries = lyrics.carried > 0 && i === line.length - 1;
      return { width, left: carries ? CARRY_INSET : width / 2 };
    });
    // Each note moved along as far as its words need, so no two lyrics
    // touch: a gap between words, and room for a hyphen inside one.
    const offsets = spaceLyrics(
      slots,
      spaced,
      hyphenAfter.map((h) => (h ? HYPHEN_GAP : WORD_GAP)),
    );
    const xs = offsets.map((o) => staffStart + o);
    const centre = (i: number) => xs[i] + SYLLABLE / 2;
    const edges = spaced.map((l, i) => (l ? { from: centre(i) - l.left, to: centre(i) - l.left + l.width } : null));
    const lyricEnd = Math.max(0, ...edges.map((e) => (e ? e.to : 0)));
    const notesEnd = xs.length ? xs[xs.length - 1] + slots[slots.length - 1] : staffStart;
    // How far each note reaches, for breaking the line where a pane is too
    // narrow for it: from where a system starting at the note would begin to
    // the end of its slot, its word and any hyphen after it.
    const reach: NoteReach[] = line.map((_, i) => {
      const edge = edges[i];
      return {
        from: Math.min(xs[i] - staffStart, edge ? edge.from - 2 : Infinity),
        to: Math.max(xs[i] + slots[i] + 10, edge ? edge.to + (hyphenAfter[i] ? HYPHEN_GAP / 2 + HYPHEN / 2 + 4 : 6) : 0),
      };
    });
    const breakable = line.map((_, i) => i >= syllables.length - 1 || ends[i]);
    const shift = Math.min(0, reach[0]?.from ?? 0);
    const width = Math.max(notesEnd + 10, lyricEnd + 6, ...reach.map((r) => r.to)) - shift;
    // How far the line's notes and stems reach above and below the staff.
    const heads = line.flat().map((note) => STAFF_BOTTOM - place(note.midi, key.alter).steps * STEP);
    const top = Math.min(CLEF_TOP, ...heads.map((cy) => (cy < MIDDLE ? cy - 6 : cy - STEM - 2)));
    const baseline = Math.max(LYRIC_LOWEST, ...heads.map((cy) => (cy < MIDDLE ? cy + STEM : cy + 6) + LYRIC_CLEAR));
    const height = baseline + LYRIC_DESCENT - top;
    return { line, lineIndex, lyrics, xs, centre, edges, hyphenAfter, reach, breakable, shift, width, top, baseline, height };
  });
  type Line = (typeof lines)[number];
  /** A run of a line's notes drawn as one staff: the whole line, or one
   *  system of a line broken to fit. `shift` is where it begins along the
   *  line; `width` how far it runs. */
  type System = { line: Line; from: number; to: number; shift: number; width: number };
  const whole = (l: Line): System => ({ line: l, from: 0, to: l.line.length, shift: l.shift, width: l.width });

  // As large as asked, or as large as fits the room given -- but never below
  // the least size allowed, where a staff too big for its room scrolls
  // instead. Given room enough across, a stanza is set a couplet to a row,
  // as the printed book sets its lines, when that lets it be drawn larger.
  let scale = lyricPx / LYRIC_SIZE;
  let rows = lines.map((l) => [l]);
  const room = fit ? fit.width : across;
  if (fit && lines.length) {
    const floor = Math.min(scale, (fit.minLyricPx ?? STAFF_LYRIC_PX) / LYRIC_SIZE);
    const fitting = (layout: (typeof lines)[]) => {
      const across = Math.min(
        ...layout.map((row) => (fit.width - COLUMN_GAP * (row.length - 1)) / row.reduce((sum, l) => sum + l.width, 0)),
      );
      const tall = layout.reduce((sum, row) => sum + Math.max(...row.map((l) => l.height)), 0);
      const down = (fit.height - LINE_SPACING * (layout.length - 1)) / tall;
      return Math.min(scale, across, down);
    };
    const single = fitting(rows);
    if (lines.length >= 2 && lines.length % 2 === 0) {
      const paired = lines.filter((_, i) => i % 2 === 0).map((l, i) => [l, lines[2 * i + 1]]);
      if (fitting(paired) > single) rows = paired;
    }
    scale = Math.max(floor, fitting(rows));
  } else if (room > 0 && lines.length) {
    // Set in a pane: drawn at the size asked for where it fits, a little
    // smaller where that is all it takes, and broken into systems past that.
    const widest = Math.max(...lines.map((l) => l.width));
    if (widest * scale > room) scale = Math.max(scale * SHRINK_FLOOR, room / widest);
  }

  // Where even that leaves a line wider than the room, it is broken into
  // systems -- a system to a row, so a couplet set side by side goes back to
  // a line to a row first.
  const roomInUnits = room > 0 ? room / scale : Infinity;
  const rowFits = (row: Line[]) => row.reduce((sum, l) => sum + l.width, 0) * scale + COLUMN_GAP * (row.length - 1) <= room + 0.5;
  const systems: System[][] =
    room <= 0 || rows.every(rowFits)
      ? rows.map((row) => row.map(whole))
      : lines.flatMap((l) => {
          if (l.width <= roomInUnits) return [[whole(l)]];
          const starts = breakLine(l.reach, roomInUnits, l.breakable);
          return starts.map((from, k) => {
            const to = starts[k + 1] ?? l.line.length;
            const shift = from === 0 ? l.shift : l.reach[from].from;
            const end = Math.max(...l.reach.slice(from, to).map((r) => r.to));
            return [{ line: l, from, to, shift, width: end - shift }];
          });
        });

  const draw = ({ line: shown, from, to, shift, width }: System) => {
    const { line, lineIndex, lyrics, xs, centre, edges, hyphenAfter, top, baseline, height } = shown;
    const broken = from > 0 || to < line.length;
    return (
      <svg
        key={`${lineIndex}-${from}`}
        viewBox={`0 ${top} ${width} ${height}`}
        // Rounded down, so a row set to fill its room exactly is never a
        // pixel over it (and shows a scrollbar for nothing).
        width={Math.floor(width * scale)}
        height={Math.round(height * scale)}
        className="shrink-0 overflow-visible"
        role="img"
        aria-label={`${tune.name}, line ${lineIndex + 1}${broken ? `, notes ${from + 1} to ${to}` : ""}`}
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

        {/* A system after the first begins with its own clef and key, and
            its notes are moved left to follow them. */}
        <g transform={shift ? `translate(${-shift} 0)` : undefined}>
          {line.map((syllable, syllableIndex) => {
            if (syllableIndex < from || syllableIndex >= to) return null;
            const x = xs[syllableIndex];
            const lit = sounding?.line === lineIndex && sounding?.syllable === syllableIndex;
            const lyric = lyrics.under[syllableIndex];
            const carries = lyrics.carried > 0 && syllableIndex === line.length - 1;
            const edge = edges[syllableIndex];
            // The hyphen goes between the two syllables, or -- where the
            // system ends inside the word -- just after the first.
            const next = syllableIndex + 1 < to ? edges[syllableIndex + 1] : null;
            const hyphenAt = edge ? (next ? (edge.to + next.from) / 2 : edge.to + HYPHEN_GAP / 2) : 0;

            return (
              <g key={syllableIndex} className={lit ? "fill-accent stroke-accent" : "fill-ink stroke-ink"}>
                {syllable.map((note, noteIndex) => {
                  const { steps, accidental } = place(note.midi, key.alter);
                  const cx = x + noteIndex * NOTE + SYLLABLE / 2;
                  const cy = STAFF_TOP + STAFF_HEIGHT - steps * STEP;
                  const hollow = note.beats >= 2;
                  const down = cy < MIDDLE;
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
                        y2={down ? cy + STEM : cy - STEM}
                        strokeWidth={0.9}
                      />
                    </g>
                  );
                })}
                {lyric && edge && (
                  // A last note carrying more than one syllable starts its
                  // words under the note and runs on to the right, clear of
                  // the syllable before.
                  <text
                    x={carries ? edge.from : centre(syllableIndex)}
                    y={baseline}
                    fontSize={LYRIC_SIZE}
                    textAnchor={carries ? "start" : "middle"}
                    stroke="none"
                    className={lit ? "fill-accent" : "fill-ink-2"}
                    data-carried={carries ? lyrics.carried : undefined}
                  >
                    {carries && <title>{`${lyrics.carried + 1} syllables sung to this note`}</title>}
                    {lyric}
                  </text>
                )}
                {/* The syllables of one word are joined by a hyphen in the
                    gap between them, as a hymnal sets them. */}
                {hyphenAfter[syllableIndex] && edge && (
                  <line
                    x1={hyphenAt - HYPHEN / 2}
                    x2={hyphenAt + HYPHEN / 2}
                    y1={baseline - 3.5}
                    y2={baseline - 3.5}
                    strokeWidth={0.8}
                    className="stroke-ink-3"
                    data-hyphen=""
                  />
                )}
              </g>
            );
          })}
        </g>
      </svg>
    );
  };

  // The staff is centred in its pane, its lines aligned on the left among
  // themselves as a page sets them. Only a staff zoomed past the pane is
  // wider than its room, and that scrolls here rather than the page. The
  // scrollbar is offered only then: offered always, one shown for the moment
  // before the room was measured could stay behind under a staff that fits.
  const tooWide =
    room > 0 &&
    systems.some((row) => row.reduce((sum, s) => sum + Math.floor(s.width * scale), 0) + COLUMN_GAP * (row.length - 1) > room);
  return (
    <div ref={host} className={tooWide ? "overflow-x-auto" : "overflow-x-hidden"}>
      <div className="mx-auto flex w-fit flex-col items-start gap-2">
        {systems.map((row) =>
          row.length === 1 ? (
            draw(row[0])
          ) : (
            <div key={`${row[0].line.lineIndex}-pair`} className="flex items-end" style={{ gap: COLUMN_GAP }}>
              {row.map(draw)}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
