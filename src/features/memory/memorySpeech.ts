import type { TtsSegment } from "../../state/ttsStore";
import { splitForSpeech } from "../tts/textUtils";
import { memoryWords } from "./memoryText";

// ---------------------------------------------------------------------------
// A memory card, as the voice reads it.
//
// A card used to be one segment: the reference and every verse of it joined
// into a single string. A passage card -- Romans 8:28-39, a whole psalm -- was
// then one long render before a note was heard, and when the neural voice
// could not say it (it hands back silence for some lengths of text, and a
// failure costs the segment it happened in) the card had nothing else to
// fall back on: the whole of it went unread, and the reader heard nothing at
// all. One segment per verse, the reference its own short one ahead of them,
// costs a failure one verse and starts the first verse sounding at once.

/** A verse of a card: its number and its words as they are learned. */
export interface CardVerse {
  verse: number;
  text: string;
}

/** Verses `start`..`end` of a loaded chapter, in their memory form
 * (memoryWords: no psalm title, no acrostic letter, no brackets). Missing
 * verses are skipped, as `joinVerses` skips them. */
export function cardVerses(verses: { verse: number; text: string }[] | undefined, start: number, end: number): CardVerse[] {
  if (!verses) return [];
  return verses.filter((v) => v.verse >= start && v.verse <= end).map((v) => ({ verse: v.verse, text: memoryWords(v.text) }));
}

/**
 * The segments a card is read as: its reference, then each verse (a long
 * verse in sentence-sized pieces), each labelled "v. 16" for the player.
 *
 * A card asked the other way round -- "Where is this?" -- is read as its
 * words alone: the reference is never said, and no verse number is put on
 * the player either, since the verse is half the answer.
 */
export function memorySegments({
  key,
  reference,
  verses,
  askWhere,
  verseLabel = (verse) => `v. ${verse}`,
}: {
  /** What the segment ids start with: `memory-12`, `family-memory`. */
  key: string;
  /** "John 3:16-17", said first unless the card is asking for it. */
  reference: string;
  verses: CardVerse[];
  askWhere: boolean;
  /** The player's label for a verse; "v. 16" unless told otherwise. */
  verseLabel?: (verse: number) => string;
}): TtsSegment[] {
  const segments: TtsSegment[] = [];
  for (const v of verses) {
    const pieces = splitForSpeech(v.text);
    pieces.forEach((text, k) =>
      segments.push({
        id: pieces.length > 1 ? `${key}:v${v.verse}.${k + 1}` : `${key}:v${v.verse}`,
        text,
        label: askWhere ? undefined : verseLabel(v.verse),
      }),
    );
  }
  // A reference with no words after it is not worth saying on its own.
  if (segments.length === 0 || askWhere) return segments;
  return [{ id: `${key}:ref`, text: `${reference}.`, label: reference }, ...segments];
}

/**
 * Whether Listen is offered on a practice card yet. Asked for the words --
 * first letters, blanked words, or typed from memory -- hearing them read is
 * the answer, so Listen waits until the answer is showing. Asked where a
 * verse is, hearing it is how the card is practised, and it is there from
 * the start.
 */
export function listenOffered({ askWhere, answerShowing }: { askWhere: boolean; answerShowing: boolean }): boolean {
  return askWhere || answerShowing;
}

/** What a card's segment ids start with, in its own Listen and in "Listen
 * to what's due" alike -- one spelling, so a reading can be told to hold a
 * card's words by its ids (readingGivesAway). */
export function memoryCardKey(cardId: number): string {
  return `memory-${cardId}`;
}

/**
 * Whether a reading under way is saying what a card, its answer still hidden,
 * is asking for: its words, on a card asking for the words; its reference, on
 * a card asking where.
 *
 * Hiding Listen until the answer shows is not enough on its own, because a
 * reading carries on after the card that started it has gone. Reveal a
 * passage, press Listen, grade it, then Backspace: the card comes back with
 * its answer hidden and its own verses still being read over the first
 * letters -- with the one button that could stop them hidden too. "Practice
 * again" did the same, and so did "Listen to what's due" left playing when
 * practice began, which says every due card's reference and words in turn.
 * The card's ids are enough to know it: `key:ref` for the reference, `key:v…`
 * for the words, whichever button began the reading.
 */
export function readingGivesAway(
  segments: readonly TtsSegment[],
  { key, askWhere, answerShowing }: { key: string; askWhere: boolean; answerShowing: boolean },
): boolean {
  if (answerShowing) return false;
  const reference = `${key}:ref`;
  // With the colon, so card 1 is not taken for card 12.
  const ofThisCard = `${key}:`;
  return segments.some((s) => typeof s.id === "string" && (askWhere ? s.id === reference : s.id.startsWith(ofThisCard)));
}

/** The verse of a card a reading's passage is from -- 16 for `memory-12:v16`
 * or `memory-12:v16.2` -- or null for the card's reference or another card's
 * passage. What marks the verse being said on the card. */
export function verseBeingRead(id: string | number | undefined, key: string): number | null {
  if (typeof id !== "string" || !id.startsWith(`${key}:v`)) return null;
  const verse = Number(/^v(\d+)(?:\.\d+)?$/.exec(id.slice(key.length + 1))?.[1]);
  return Number.isInteger(verse) && verse > 0 ? verse : null;
}
