// Plays a psalm tune, and writes it out as a MIDI file.
//
// The tune is a melody line, so there is nothing to stream and nothing to
// fetch: the notes are already in hand and Web Audio synthesises them here.
// A chapel reed-organ tone is close enough to what a psalm tune is sung
// against, and is a few harmonically-related oscillators rather than a
// sampled instrument -- which keeps the app as offline as the rest of it.

import type { PsalmTune, TuneNote } from "../../api/types";

/** A note placed on the timeline, with the line and syllable it belongs to so
 *  the words can be highlighted as they are sung. */
export interface ScheduledNote {
  midi: number;
  start: number;
  duration: number;
  line: number;
  syllable: number;
  /** Which time through -- the stanza being sung, when singing straight
   *  through the psalm. */
  pass: number;
}

const SECONDS_PER_MINUTE = 60;

export interface ScheduleOptions {
  /** Semitones to raise or lower the whole tune, so it sits where the people
   *  singing it can reach. */
  transpose?: number;
  /** How many times through -- one pass per stanza when singing the psalm
   *  straight through. */
  passes?: number;
  /** A breath between lines, as a congregation takes one. */
  gapBeats?: number;
  /** A longer pause between stanzas than between lines. */
  stanzaGapBeats?: number;
}

/** Lays a tune out in time: one pass per stanza, at the given tempo. */
export function schedule(tune: PsalmTune, tempo: number, options: ScheduleOptions = {}): ScheduledNote[] {
  const { transpose = 0, passes = 1, gapBeats = 1, stanzaGapBeats = 2 } = options;
  const beat = SECONDS_PER_MINUTE / tempo;
  const notes: ScheduledNote[] = [];
  let at = 0;

  for (let pass = 0; pass < Math.max(passes, 1); pass++) {
    tune.lines.forEach((line, lineIndex) => {
      line.forEach((syllable, syllableIndex) => {
        syllable.forEach((note) => {
          notes.push({
            midi: note.midi + transpose,
            start: at,
            duration: note.beats * beat,
            line: lineIndex,
            syllable: syllableIndex,
            pass,
          });
          at += note.beats * beat;
        });
      });
      if (lineIndex < tune.lines.length - 1) at += gapBeats * beat;
    });
    if (pass < passes - 1) at += stanzaGapBeats * beat;
  }

  return notes;
}

export function tuneDuration(notes: ScheduledNote[]): number {
  return notes.reduce((end, n) => Math.max(end, n.start + n.duration), 0);
}

function frequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Drives playback of one tune. Owns its AudioContext, and stops cleanly. */
export class TunePlayer {
  private context: AudioContext | null = null;
  private stopAt = 0;
  private startedAt = 0;
  private timer: number | null = null;
  private onNote: ((note: ScheduledNote | null) => void) | null = null;
  private onEnd: (() => void) | null = null;

  /** Sounds one note as a small stack of harmonics, shaped so it speaks and
   *  stops like a pipe rather than clicking on and off. */
  private voice(context: AudioContext, note: ScheduledNote, at: number) {
    const gain = context.createGain();
    gain.connect(context.destination);

    const attack = 0.03;
    const release = 0.12;
    const held = Math.max(note.duration - release, 0.05);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.18, at + attack);
    gain.gain.setValueAtTime(0.18, at + held);
    gain.gain.exponentialRampToValueAtTime(0.0005, at + held + release);

    // Fundamental, octave and twelfth -- a plain diapason stop.
    for (const [harmonic, level] of [[1, 1], [2, 0.4], [3, 0.16]] as const) {
      const oscillator = context.createOscillator();
      const mix = context.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.value = frequency(note.midi) * harmonic;
      mix.gain.value = level;
      oscillator.connect(mix).connect(gain);
      oscillator.start(at);
      oscillator.stop(at + held + release + 0.02);
    }
  }

  play(
    notes: ScheduledNote[],
    handlers: { onNote?: (note: ScheduledNote | null) => void; onEnd?: () => void } = {},
  ) {
    this.stop();
    const context = new AudioContext();
    this.context = context;
    this.onNote = handlers.onNote ?? null;
    this.onEnd = handlers.onEnd ?? null;

    // A moment's lead-in so the first note is not clipped by the context
    // still starting up.
    const begin = context.currentTime + 0.12;
    this.startedAt = begin;
    for (const note of notes) this.voice(context, note, begin + note.start);
    this.stopAt = begin + tuneDuration(notes);

    // Follow the tune on a timer rather than one callback per note: the
    // highlight only has to be right to the frame. The cursor only ever moves
    // forward, so following costs nothing per frame.
    let at = -1;
    const follow = () => {
      if (!this.context) return;
      const now = this.context.currentTime;
      if (now >= this.stopAt) {
        this.onNote?.(null);
        this.stop();
        this.onEnd?.();
        return;
      }
      const elapsed = now - this.startedAt;
      while (at + 1 < notes.length && notes[at + 1].start <= elapsed) at++;
      this.onNote?.(at >= 0 ? notes[at] : null);
      this.timer = window.requestAnimationFrame(follow);
    };
    this.timer = window.requestAnimationFrame(follow);
  }

  stop() {
    if (this.timer != null) window.cancelAnimationFrame(this.timer);
    this.timer = null;
    this.context?.close().catch(() => {});
    this.context = null;
  }

  get playing(): boolean {
    return this.context != null;
  }
}

// ------------------------------------------------------------------- midi --

function variableLength(value: number): number[] {
  const bytes = [value & 0x7f];
  let rest = value >> 7;
  while (rest > 0) {
    bytes.unshift((rest & 0x7f) | 0x80);
    rest >>= 7;
  }
  return bytes;
}

function chunk(id: string, body: number[]): number[] {
  const length = body.length;
  return [
    ...[...id].map((c) => c.charCodeAt(0)),
    (length >> 24) & 0xff,
    (length >> 16) & 0xff,
    (length >> 8) & 0xff,
    length & 0xff,
    ...body,
  ];
}

/** Writes the tune as a standard MIDI file (format 0), so it can be opened in
 *  anything that plays one -- which is what a psalter's tune files are for. */
export function toMidiFile(tune: PsalmTune, tempo: number, stanzas = 1, transpose = 0): Uint8Array {
  const ticks = 480; // per crotchet
  const events: number[] = [];

  // Tempo, as microseconds per crotchet.
  const microseconds = Math.round(60_000_000 / tempo);
  events.push(
    0x00, 0xff, 0x51, 0x03,
    (microseconds >> 16) & 0xff, (microseconds >> 8) & 0xff, microseconds & 0xff,
  );
  const name = [...`${tune.name} (${tune.metre})`].map((c) => c.charCodeAt(0) & 0x7f);
  events.push(0x00, 0xff, 0x03, name.length, ...name);
  events.push(0x00, 0xc0, 19); // church organ

  let pending = 0; // ticks owed before the next event
  const flat: TuneNote[] = [];
  for (let pass = 0; pass < stanzas; pass++) {
    tune.lines.forEach((line, index) => {
      for (const syllable of line) flat.push(...syllable);
      if (index < tune.lines.length - 1 || pass < stanzas - 1) flat.push({ midi: 0, beats: 1 }); // breath
    });
  }

  for (const note of flat) {
    const length = Math.round(note.beats * ticks);
    if (note.midi === 0) {
      pending += length;
      continue;
    }
    const midi = Math.min(Math.max(note.midi + transpose, 0), 127);
    events.push(...variableLength(pending), 0x90, midi, 0x50);
    events.push(...variableLength(length), 0x80, midi, 0x40);
    pending = 0;
  }
  events.push(0x00, 0xff, 0x2f, 0x00);

  const header = chunk("MThd", [0, 0, 0, 0, (ticks >> 8) & 0xff, ticks & 0xff]);
  return new Uint8Array([...header, ...chunk("MTrk", events)]);
}
