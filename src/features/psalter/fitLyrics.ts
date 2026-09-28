// Sets a line's syllables under a tune line's notes.
//
// A psalm tune is one note to a syllable, and the psalter's lines are
// divided to match -- but not always exactly. The 1650 book rhymes a few
// stanzas on a feminine ending ("to be my King ap-point-ed", "had been my
// friend or bro-ther"): the line is a syllable longer than the metre, and
// the extra syllable is sung on the line's last note. A line whose words
// the build could not bring to the metre can be longer still. Either way
// every word must still be shown: the syllables beyond the last note are
// carried onto it, joined with a tie ("point‿ed;") the way a hymnal marks
// two syllables sung to one note.

/** The tie drawn between syllables sung to one note. */
export const TIE = "‿";

export interface FittedLyrics {
  /** What sits under each note -- `undefined` for a note the line has no
   *  syllable for. */
  under: (string | undefined)[];
  /** How many syllables were carried onto the last note beyond its own. */
  carried: number;
}

export function fitLyrics(syllables: string[], notes: number): FittedLyrics {
  if (notes <= 0) return { under: [], carried: syllables.length };
  const under: (string | undefined)[] = Array.from({ length: notes }, (_, i) => syllables[i]);
  if (syllables.length <= notes) return { under, carried: 0 };
  under[notes - 1] = syllables.slice(notes - 1).join(TIE);
  return { under, carried: syllables.length - notes };
}

/** Whether each syllable ends a word of the line's text, so the staff can
 *  join the syllables of one word with a hyphen and leave a gap between
 *  words. "th'up-lift-er" runs two words together on a note; that note ends
 *  neither. Where the syllables do not spell the text (a line the build
 *  could not divide), every syllable is taken to end a word. */
export function wordEnds(syllables: string[], text: string): boolean[] {
  const ends: boolean[] = [];
  let at = 0;
  for (const syllable of syllables) {
    for (const letter of syllable) {
      while (text[at] === " ") at++;
      if (text[at] !== letter) return syllables.map(() => true);
      at++;
    }
    ends.push(at >= text.length || text[at] === " " || syllable.endsWith("-"));
  }
  return ends;
}

/** A lyric to be spaced: its width, and how it hangs off its note. */
export interface SpacedLyric {
  width: number;
  /** How far the lyric starts left of its note's centre: half its width
   *  when centred under it, less for a carried lyric, which starts just
   *  before its note and runs on to the right. */
  left?: number;
}

/**
 * Where each note of a line goes, so no lyric runs into the next: every note
 * keeps at least its own `slots` width from the one before, and a note whose
 * lyric would come closer than `gaps[i]` to the lyric before it is moved
 * along -- the notes after it with it. Returns each note's offset from the
 * first. A note with no lyric keeps its slot, and the next lyric still keeps
 * clear of the last one there was.
 */
export function spaceLyrics(slots: number[], lyrics: (SpacedLyric | null)[], gaps: number[]): number[] {
  const at: number[] = [];
  let x = 0;
  let clearOf = -Infinity; // the right edge of the last lyric, plus its gap
  for (let i = 0; i < slots.length; i++) {
    if (i > 0) x += slots[i - 1];
    const lyric = lyrics[i];
    if (lyric) {
      const left = lyric.left ?? lyric.width / 2;
      if (x - left < clearOf) x = clearOf + left;
      clearOf = x - left + lyric.width + (gaps[i] ?? 0);
    }
    at.push(x);
  }
  return at;
}

/** How far one note of a line reaches, in the line's own units. */
export interface NoteReach {
  /** Where a system beginning at this note must start: the note itself, or
   *  its word where that hangs further left. */
  from: number;
  /** The furthest right the note, its word, or the hyphen after it goes,
   *  with the margin the staff keeps there. */
  to: number;
}

/**
 * Where to break a line too wide for its room into systems -- shorter
 * staves, each with its own clef and key, as a printed page breaks a line of
 * music -- so a narrow pane shows the whole line without its words shrinking
 * past reading. Returns the index of the note each system begins at: `[0]`
 * when the line fits as it is.
 *
 * The notes stay where `spaceLyrics` put them, so a break only moves a
 * system's notes and words left together, and no two lyrics can meet.
 * Among the ways of breaking, the fewest systems wins; then breaks between
 * words over breaks inside one (`wordEnd`, where the second part still
 * begins after a hyphen); then systems of even length, so a line of eight
 * is broken four and four rather than seven and one. A single note wider
 * than the room is a system of its own, and scrolls.
 */
export function breakLine(reach: NoteReach[], room: number, wordEnd: boolean[]): number[] {
  const n = reach.length;
  if (n === 0) return [0];
  const width = (a: number, b: number) => {
    let to = -Infinity;
    for (let i = a; i < b; i++) to = Math.max(to, reach[i].to);
    return to - reach[a].from;
  };
  if (width(0, n) <= room) return [0];
  // best[i]: the cheapest way to set the first i notes, compared in order:
  // systems, breaks inside a word, then unevenness (the squared room each
  // system leaves over).
  type Cost = [number, number, number];
  const best: (Cost | null)[] = [[0, 0, 0]];
  const from: number[] = [0];
  const less = (x: Cost, y: Cost) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  for (let i = 1; i <= n; i++) {
    best[i] = null;
    for (let j = i - 1; j >= 0; j--) {
      const w = width(j, i);
      if (w > room && i - j > 1) break;
      const before = best[j]!;
      const cost: Cost = [
        before[0] + 1,
        before[1] + (i < n && !wordEnd[i - 1] ? 1 : 0),
        before[2] + Math.max(0, room - w) ** 2,
      ];
      if (!best[i] || less(cost, best[i]!) < 0) {
        best[i] = cost;
        from[i] = j;
      }
    }
  }
  const starts: number[] = [];
  for (let i = n; i > 0; i = from[i]) starts.unshift(from[i]);
  return starts;
}
