import { create } from "zustand";
import { ttsEngines } from "../features/tts/ttsEngine";
import { tokenizeWords, findWordIndexAtChar, hasSpeakableText, type TtsWordToken } from "../features/tts/textUtils";
import { buildSpoken, loadPronunciationLexicon, toSourceIndex, type SpokenChunk } from "../features/tts/pronunciation";
import { speakReferences } from "../features/tts/speakReferences";
import { speakNumerals } from "../features/tts/speakNumerals";
import { speakCapitals } from "../features/tts/speakCapitals";
import { toast } from "../components/ui/toast";

export interface TtsSegment {
  id: string | number;
  text: string;
  label?: string;
}

export type TtsSourceKind = "scripture" | "commentary" | "resource" | "other";
export type TtsHighlightStyle = "background" | "underline" | "bold";

/** "Stop after" choices, in minutes; 0 is off. */
export const SLEEP_MINUTE_OPTIONS = [0, 15, 30, 45, 60] as const;
/** The sleep timer fades the voice over its last ten seconds. */
const FADE_MS = 10_000;

interface TtsState {
  // Settings (persisted)
  engineId: string;
  voiceId: string | null;
  rate: number;
  pitch: number;
  volume: number;
  highlightColor: string;
  highlightStyle: TtsHighlightStyle;
  autoScroll: boolean;
  /** When a Scripture chapter finishes, turn the page and keep reading. */
  autoContinue: boolean;
  /** Say biblical names the way ISBE gives them rather than as spelled. */
  usePronunciations: boolean;

  // Playback session (not persisted)
  title: string;
  sourceKind: TtsSourceKind | null;
  /** The pane whose text is being read; null outside any pane. Only one
   * pane reads at a time -- starting another stops the first. */
  paneId: string | null;
  segments: TtsSegment[];
  currentSegmentIndex: number;
  currentWordIndex: number;
  isPlaying: boolean;
  isPaused: boolean;
  /** True between asking for a verse and the first sound of it. The neural
   * voice renders before it can play, and without this the player claims to
   * be reading a verse several seconds before any of it is audible. */
  preparing: boolean;
  error: string | null;
  /** Sleep timer: the chosen length (0 = off) and when it fires. Survives
   * auto-continue's restarts; cleared by Stop. */
  sleepMinutes: number;
  sleepUntil: number | null;
  /** Volume multiplier during the sleep timer's final fade (1 = full).
   * Web Speech fixes an utterance's volume when it starts, so the fade
   * takes effect segment by segment. */
  fadeLevel: number;
  /** True between a chapter finishing and its pane starting the next one. */
  continuing: boolean;
  /** True while the source is still finding more of this reading (a book's
   * later sections loading). Running off the end then waits for them rather
   * than ending the reading. */
  more: boolean;
  /** True when the reading ran out while `more` was set: the next segments
   * to arrive carry straight on. */
  waitingForMore: boolean;

  setEngineId: (id: string) => void;
  setVoiceId: (id: string | null) => void;
  setRate: (n: number) => void;
  setPitch: (n: number) => void;
  setVolume: (n: number) => void;
  setHighlightColor: (c: string) => void;
  setHighlightStyle: (s: TtsHighlightStyle) => void;
  setAutoScroll: (b: boolean) => void;
  setAutoContinue: (b: boolean) => void;
  setUsePronunciations: (b: boolean) => void;
  setSleepMinutes: (minutes: number) => void;

  /** Read `segments` from `startIndex` (an index into this same list). A
   * passage with nothing a voice can say in it is left out, and a list with
   * nothing sayable at all does not start: the reader is told so instead. */
  start: (
    title: string,
    sourceKind: TtsSourceKind,
    segments: TtsSegment[],
    opts?: { startIndex?: number; paneId?: string | null; more?: boolean },
  ) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  next: () => void;
  prev: () => void;
  seek: (segmentIndex: number) => void;
  /** Read `segments` from `index`: a move within the reading when this pane
   * is already reading `title`, a fresh start otherwise. What "Read aloud
   * from here" and a click on a paragraph being read both come down to.
   * `index` is into the caller's own list; the passage it names is found in
   * the reading by id. A reading that has finished starts again. */
  readFrom: (
    title: string,
    sourceKind: TtsSourceKind,
    segments: TtsSegment[],
    index: number,
    opts?: { paneId?: string | null; more?: boolean },
  ) => void;
  /** More of the same reading, found after it started: a book reads the page
   * on screen at once and the sections after it as they load. Ignored unless
   * this pane is still reading `title`. `done` says nothing more is coming.
   * Ids should be unique across the whole reading, appended passages too:
   * the list in the player and `readFrom` find passages by id. */
  appendSegments: (title: string, paneId: string | null, segments: TtsSegment[], opts?: { done?: boolean }) => void;
}

const STORAGE_KEY = "bsa-tts-prefs";

const stored = (() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
})();

/** True once the reader has picked an engine themselves; their choice then
 * outranks whatever the startup probe below finds. */
let engineChosen = stored.engineId !== undefined;

/** Set when the queue was moved while paused: there is no half-spoken verse to
 * pick up, so Play has to start the new one. */
let speakOnResume = false;

/** Failures since the last sound came out. One bad passage costs itself; a run
 * of them means the voice is not working and reading stops. */
let failures = 0;
const GIVE_UP_AFTER = 3;

/** Passages the voice found nothing to say in, since the last sound. These do
 * not count toward GIVE_UP_AFTER: a stray "iv." or "(p. 23)" left over from a
 * book's page furniture is simply unsayable, and three of them in a row in an
 * old index is no sign the voice is broken. But a voice that says nothing about
 * everything is broken too, and a book of thousands of passages should not be
 * skipped through one silence at a time, so a long enough run still stops. */
let silences = 0;
const GIVE_UP_AFTER_SILENCES = 12;

/** Every passage handed to the engine gets a number, and so does every cancel.
 * A callback from a passage the reader has since moved away from carries an old
 * number and is ignored. Web Speech can report the end of an utterance it was
 * told to drop, and with nothing to tell the two apart, a jump from the list
 * could land and then be carried one passage further by the passage it left. */
let utterance = 0;

/** Bumped by every start and stop, and by everything that settles what the
 * voice does next -- a passage spoken, a hold for more of a book -- so a start
 * still waiting on the pronunciation lexicon speaks only if nothing has
 * replaced it or moved it meanwhile. Before the last of these, a verse clicked
 * while the first lexicon load of the session was still out was said, and
 * then said again from the top when the load came back. */
let startTurn = 0;

/** Set when the reading ran all the way to its end. Play then reads it again
 * from the top: before, it asked the engine to resume a passage that had
 * already finished, and a player showing a Play button did nothing at all. */
let ranToEnd = false;

/** Set when the voice was changed while the reading waited for more of a book.
 * The passage it was on had been said already, so Play goes on to the next one
 * -- or back to waiting, if it has not come yet -- instead of saying the last
 * paragraph over again in the new voice. */
let waitedWhenVoiceChanged = false;

/** Quiet whatever the engine is saying, and disown its callbacks. */
function hush() {
  utterance += 1;
  engine().cancel();
}

/**
 * The segments a voice can say something for, and where to start among them.
 *
 * A caller's list is whatever its source holds: a heading that is all Greek, a
 * row of asterisks between sections, a scrap of Hebrew in a lexicon entry.
 * Handed to the neural voice, each was half a second of silence at best and a
 * failure counted against the reading at worst. `startIndex` refers to the
 * caller's own list, so it moves to the first passage kept at or after it --
 * or, when everything after it was dropped, to the last one kept, and
 * `pastEnd` says so. That last one is *before* the place the reader chose, so
 * a reading with more of its book on the way waits for it rather than going
 * back over text above that place.
 */
export function speakableFrom(
  segments: TtsSegment[],
  startIndex: number,
): { segments: TtsSegment[]; startIndex: number; pastEnd: boolean } {
  const kept: TtsSegment[] = [];
  let start = -1;
  segments.forEach((segment, i) => {
    if (!hasSpeakableText(segment.text)) return;
    if (start < 0 && i >= startIndex) start = kept.length;
    kept.push(segment);
  });
  if (start >= 0) return { segments: kept, startIndex: start, pastEnd: false };
  return { segments: kept, startIndex: Math.max(kept.length - 1, 0), pastEnd: true };
}

/** Whether an engine's failure means it found nothing to say in the passage,
 * rather than that it could not work. The neural voice says so in these words
 * (src-tauri/src/tts.rs, `speak_piece`) when every attempt came back silent. */
export function nothingToSay(message: string): boolean {
  return /returned silence/i.test(message);
}

function persist(partial: Record<string, unknown>) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const existing = raw ? JSON.parse(raw) : {};
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...existing, ...partial }));
  } catch {
    // ignore storage failures
  }
}

let currentTokens: TtsWordToken[] = [];
/** How a place in the text handed to the engine maps to the text on screen;
 * null when nothing was rewritten and the two are the same string. */
let currentToSource: ((spokenIndex: number) => number) | null = null;

function engine() {
  return ttsEngines[useTtsStore.getState().engineId] ?? ttsEngines.webspeech;
}

// ---------------------------------------------------------------------------
// Auto-continue (F1.9). A Bible pane registers a handler while mounted; when
// the chapter it is reading runs out, the store calls the handler for the
// pane that was being read (never another pane). The handler turns the page
// and returns true; the pane then restarts playback with the next chapter's
// verses once they load. Keyed by pane id so two Bible panes never both
// react.

type QueueEndHandler = () => boolean;
const queueEndHandlers = new Map<string, QueueEndHandler>();

export function registerQueueEndHandler(paneId: string, handler: QueueEndHandler): () => void {
  queueEndHandlers.set(paneId, handler);
  return () => {
    if (queueEndHandlers.get(paneId) === handler) queueEndHandlers.delete(paneId);
  };
}

/** The last segment has finished (judged by the segment index, not the
 * `end` event alone, which Web Speech sometimes drops). */
function finishQueue(get: () => TtsState, set: (partial: Partial<TtsState>) => void) {
  const cur = get();
  if (cur.more) {
    // The reader is ahead of the loading: hold here, still "reading", and let
    // the next segments to arrive pick it up.
    set({ preparing: true, currentWordIndex: -1, waitingForMore: true });
    return;
  }
  const handler = cur.paneId != null ? queueEndHandlers.get(cur.paneId) : undefined;
  if (cur.autoContinue && cur.sourceKind === "scripture" && handler && handler()) {
    set({ isPlaying: false, isPaused: false, preparing: false, currentWordIndex: -1, continuing: true });
    return;
  }
  ranToEnd = true;
  set({ isPlaying: false, isPaused: false, preparing: false, currentWordIndex: -1, waitingForMore: false });
}

/** Hold the reading at passage `index`, the last there is so far, until more
 * of the book arrives: still "reading", saying nothing, and the next segments
 * to be appended carry straight on from it. */
function holdForMore(set: (partial: Partial<TtsState>) => void, index: number) {
  hush();
  startTurn += 1;
  speakOnResume = false;
  waitedWhenVoiceChanged = false;
  set({ currentSegmentIndex: index, isPlaying: true, isPaused: false, preparing: true, currentWordIndex: -1, waitingForMore: true });
}

/** What the engine is given for a passage: the text as written, with its
 * headings in capitals in a title's case ("OF AN ANGRY GOD", whose "AN" the
 * neural voice spelled, is "of an Angry God"; the length is kept, so no map
 * back is needed), its Scripture references in words ("John viii. 23" is "John 8, verse 23"), its
 * other Roman numerals as numbers ("SERMON II." is "SERMON 2.", which the
 * neural voice otherwise says as "Sermon Roman") and, when asked for, the
 * names respelled. The prefetch and the speaking must agree to the letter, or
 * the render waiting for a passage is of a different string and thrown away. */
export function spokenFor(
  s: Pick<TtsState, "usePronunciations">,
  text: string,
): { spoken: string; toSource: ((spokenIndex: number) => number) | null } {
  const refs = speakReferences(speakCapitals(text));
  const numerals = speakNumerals(refs.spoken);
  if (!s.usePronunciations) return { spoken: numerals.spoken, toSource: mapThrough([numerals.chunks, refs.chunks]) };
  // A voice with its own pronunciation dictionary is handed the names as they
  // are written -- rewriting them is how "Jacob" became "ja-kub" and then
  // K, U, B -- and only the reader's own corrections are applied to it.
  const rendered = buildSpoken(numerals.spoken, { correctionsOnly: !engine().readsRespellings });
  return {
    spoken: rendered.spoken,
    toSource: mapThrough([rendered.changed > 0 ? rendered.chunks : null, numerals.chunks, refs.chunks]),
  };
}

/** The rewrites mapped back in turn, last made first: from what the engine
 * says, through the names, the numerals and the references, to the text on
 * screen. */
function mapThrough(layers: (SpokenChunk[] | null)[]): ((spokenIndex: number) => number) | null {
  const maps = layers.filter((layer): layer is SpokenChunk[] => layer != null);
  if (maps.length === 0) return null;
  return (spokenIndex) => maps.reduce((index, chunks) => toSourceIndex(chunks, index), spokenIndex);
}

function speakOptions(s: TtsState) {
  return { voiceId: s.voiceId, rate: s.rate, pitch: s.pitch, volume: s.volume * s.fadeLevel };
}

/**
 * Start the passage after the current one rendering while this one plays. An
 * engine that has to synthesize a whole passage before it can play a note of it
 * would otherwise leave a few seconds of silence at every break; the neural
 * voice renders in well under the time a passage takes to say, so given this
 * head start it is ready by the time it is wanted. Called as each passage
 * starts, and again when a book's next section arrives while its last passage
 * so far is playing -- the one moment there was no "next" to ask for.
 */
function prefetchNext(s: TtsState) {
  const current = engine();
  const next = s.segments[s.currentSegmentIndex + 1];
  if (!next || !current.prefetch) return;
  current.prefetch(spokenFor(s, next.text).spoken, speakOptions(s));
}

/** Web Speech fixes rate and pitch when an utterance starts, so a change is
 * heard by saying the current passage again. Not out loud while paused -- it is
 * said again when Play is pressed -- and not while waiting for more of a book,
 * when the current passage has already been said and saying it again would be
 * the reader hearing a paragraph twice for moving a slider. */
function sayAgainForNewSettings(get: () => TtsState, set: (partial: Partial<TtsState>) => void) {
  const s = get();
  if (!s.isPlaying || s.waitingForMore) return;
  if (s.isPaused) {
    hush();
    speakOnResume = true;
    return;
  }
  speakCurrentSegment(get, set);
}

/**
 * How long a passage the reader moved to themselves -- a jump from the list, a
 * click on a paragraph, Next -- is heard before the one after it is asked for.
 *
 * A reader who has just moved often moves again, and the voice renders one
 * thing at a time: the passage after the one they jumped to, asked for at
 * once, was what the next jump found under way and had to wait out (see
 * `RenderQueue`). Reading straight on, the next passage is asked for at once,
 * as before; a passage takes far longer to say than this, so the head start
 * is still there when it is wanted.
 */
const PREFETCH_AFTER_A_MOVE_MS = 2500;

function speakCurrentSegment(get: () => TtsState, set: (partial: Partial<TtsState>) => void, reached: "in-turn" | "moved" = "in-turn") {
  speakOnResume = false;
  ranToEnd = false;
  waitedWhenVoiceChanged = false;
  startTurn += 1;
  const turn = ++utterance;
  const s = get();
  const segment = s.segments[s.currentSegmentIndex];
  if (!segment) {
    set({ isPlaying: false, isPaused: false, preparing: false, waitingForMore: false });
    return;
  }
  // The tokens stay those of the displayed verse. What the engine is given may
  // be a rewritten one -- "me-fib-o-sheth" for Mephibosheth -- so the boundary
  // events it reports are mapped back before they move the highlight.
  currentTokens = tokenizeWords(segment.text);
  const { spoken, toSource } = spokenFor(s, segment.text);
  currentToSource = toSource;
  set({ currentWordIndex: -1, isPlaying: true, isPaused: false, preparing: true, error: null, waitingForMore: false });

  // Each callback first checks that this is still the passage being read. See
  // `utterance`: one the reader has moved away from has no say any more.
  const stale = () => turn !== utterance;
  engine().speak(spoken, speakOptions(s), {
    onSpeakingStart: () => {
      if (stale()) return;
      failures = 0;
      silences = 0;
      set({ preparing: false });
      if (reached === "moved") {
        window.setTimeout(() => {
          if (!stale()) prefetchNext(get());
        }, PREFETCH_AFTER_A_MOVE_MS);
      }
    },
    onWordBoundary: (charIndex) => {
      if (stale()) return;
      const sourceIndex = currentToSource ? currentToSource(charIndex) : charIndex;
      const idx = findWordIndexAtChar(currentTokens, sourceIndex);
      set({ currentWordIndex: idx });
    },
    onEnd: () => {
      if (stale()) return;
      const cur = get();
      if (!cur.isPlaying) return; // stopped/cancelled externally
      if (cur.currentSegmentIndex + 1 < cur.segments.length) {
        set({ currentSegmentIndex: cur.currentSegmentIndex + 1 });
        speakCurrentSegment(get, set);
      } else {
        finishQueue(get, set);
      }
    },
    onError: (message) => {
      if (stale()) return;
      // A passage the voice cannot speak should cost that passage, not the
      // reading. Before this, one failure part-way through a commentary left
      // a player that had simply gone quiet, with no way on but to start
      // again -- and the reader had no idea which passage had done it.
      const cur = get();
      const unsayable = nothingToSay(message);
      if (unsayable) silences += 1;
      else failures += 1;
      const carryOn = failures < GIVE_UP_AFTER && silences < GIVE_UP_AFTER_SILENCES && cur.isPlaying && !cur.isPaused;
      const note = `Could not read ${cur.segments[cur.currentSegmentIndex]?.label ?? "one passage"}`;
      if (carryOn && cur.currentSegmentIndex + 1 < cur.segments.length) {
        set({ currentSegmentIndex: cur.currentSegmentIndex + 1 });
        speakCurrentSegment(get, set);
        // After the next one has started, which clears the error as it goes --
        // unless that one failed on the spot and has said why itself.
        if (get().isPlaying) set({ error: note });
        return;
      }
      // The last passage there is. It is passed over like any other, and the
      // reading goes wherever its end would have taken it: waiting for more
      // of a book, or on into the next chapter. Before, a bad last verse
      // ended a whole evening's listening at the chapter break, when a bad
      // verse anywhere else in the chapter cost only itself.
      if (carryOn) {
        finishQueue(get, set);
        const after = get();
        if (after.waitingForMore || after.continuing || unsayable) {
          // Waiting, continuing, or -- a last line with nothing in it to
          // say -- ended just as its end would have ended it.
          set({ error: note });
          return;
        }
        // Simply ended, on a real failure: say what went wrong, and let Play
        // try that passage again rather than read everything from the top.
        ranToEnd = false;
        set({ error: message });
        return;
      }
      set({ isPlaying: false, isPaused: false, preparing: false, error: message });
    },
  });

  if (reached === "in-turn") prefetchNext(s);
}

// ---------------------------------------------------------------------------
// Sleep timer. One interval while a timer is set: fades the voice over the
// last ten seconds (applied at each segment boundary) and then stops.

let sleepTicker: number | null = null;

function stopSleepTicker() {
  if (sleepTicker != null) window.clearInterval(sleepTicker);
  sleepTicker = null;
}

function tickSleep() {
  const s = useTtsStore.getState();
  if (s.sleepUntil == null) {
    stopSleepTicker();
    return;
  }
  const remaining = s.sleepUntil - Date.now();
  if (remaining <= 0) {
    s.stop();
    toast.info("Read aloud stopped by the sleep timer");
    return;
  }
  const level = remaining <= FADE_MS ? Math.max(0.05, remaining / FADE_MS) : 1;
  if (level !== s.fadeLevel) useTtsStore.setState({ fadeLevel: level });
}

function startSleepTicker() {
  stopSleepTicker();
  sleepTicker = window.setInterval(tickSleep, 1000);
}

/** Whether the read-aloud player is reading `sourceKind` text in pane
 * `paneId` (null for text outside any pane). */
export function useTtsReadingHere(paneId: string | null, sourceKind: TtsSourceKind): boolean {
  return useTtsStore((s) => s.sourceKind === sourceKind && s.paneId === paneId);
}

export const useTtsStore = create<TtsState>((set, get) => ({
  engineId: stored.engineId ?? "webspeech",
  voiceId: stored.voiceId ?? null,
  rate: stored.rate ?? 1,
  pitch: stored.pitch ?? 1,
  volume: stored.volume ?? 1,
  highlightColor: stored.highlightColor ?? "#fde047",
  highlightStyle: stored.highlightStyle ?? "background",
  autoScroll: stored.autoScroll ?? true,
  autoContinue: stored.autoContinue ?? true,
  usePronunciations: stored.usePronunciations ?? true,

  title: "",
  sourceKind: null,
  paneId: null,
  segments: [],
  currentSegmentIndex: 0,
  currentWordIndex: -1,
  isPlaying: false,
  isPaused: false,
  preparing: false,
  error: null,
  sleepMinutes: 0,
  sleepUntil: null,
  fadeLevel: 1,
  continuing: false,
  more: false,
  waitingForMore: false,

  setEngineId: (engineId) => {
    engineChosen = true;
    waitedWhenVoiceChanged = get().waitingForMore;
    hush();
    // Voice ids belong to the engine that issued them, so carrying one across
    // a switch would name a voice the new engine has never heard of. The
    // reading stays where it was; Play picks it up with the new voice.
    persist({ engineId, voiceId: null });
    set({ engineId, voiceId: null, isPlaying: false, isPaused: false, preparing: false, waitingForMore: false });
  },
  setVoiceId: (voiceId) => {
    persist({ voiceId });
    set({ voiceId });
  },
  setRate: (rate) => {
    persist({ rate });
    set({ rate });
    const current = engine();
    if (current.setRate) {
      // An engine playing rendered audio can just play it faster. Restarting
      // would mean waiting seconds for the verse to be spoken again.
      current.setRate(rate);
      return;
    }
    // Web Speech can't change rate mid-utterance; restart current segment at the new rate.
    sayAgainForNewSettings(get, set);
  },
  setPitch: (pitch) => {
    persist({ pitch });
    set({ pitch });
    sayAgainForNewSettings(get, set);
  },
  setVolume: (volume) => {
    persist({ volume });
    set({ volume });
  },
  setHighlightColor: (highlightColor) => {
    persist({ highlightColor });
    set({ highlightColor });
  },
  setHighlightStyle: (highlightStyle) => {
    persist({ highlightStyle });
    set({ highlightStyle });
  },
  setAutoScroll: (autoScroll) => {
    persist({ autoScroll });
    set({ autoScroll });
  },
  setAutoContinue: (autoContinue) => {
    persist({ autoContinue });
    set({ autoContinue });
  },
  setUsePronunciations: (usePronunciations) => {
    persist({ usePronunciations });
    set({ usePronunciations });
    // Takes effect at the next verse rather than restarting this one: the
    // reader is listening, and a sentence starting over is more jarring than
    // one name said the old way.
    if (usePronunciations) void loadPronunciationLexicon();
  },
  setSleepMinutes: (sleepMinutes) => {
    if (sleepMinutes <= 0) {
      stopSleepTicker();
      set({ sleepMinutes: 0, sleepUntil: null, fadeLevel: 1 });
      return;
    }
    set({ sleepMinutes, sleepUntil: Date.now() + sleepMinutes * 60_000, fadeLevel: 1 });
    startSleepTicker();
  },

  start: (title, sourceKind, segments, opts) => {
    const paneId = opts?.paneId ?? null;
    const more = opts?.more ?? false;
    const speakable = speakableFrom(segments, opts?.startIndex ?? 0);
    if (speakable.segments.length === 0) {
      // Nothing to start. What this pane was reading is let go all the same --
      // the pane has moved on to something the voice cannot read, and carrying
      // on would be reading what is no longer on the screen. That includes a
      // chapter of this pane's that ended waiting for this one to start (its
      // segments are still there), which would otherwise say "Continuing into
      // the next chapter" for ever. Another pane's reading is left alone, even
      // mid-page-turn: stopping it would also have cleared its sleep timer.
      const s = get();
      if (s.segments.length > 0 && s.paneId === paneId) s.stop();
      toast.info("There is nothing here the voice can read aloud.");
      return;
    }
    failures = 0;
    silences = 0;
    ranToEnd = false;
    speakOnResume = false;
    waitedWhenVoiceChanged = false;
    const turn = ++startTurn;
    hush();
    set({
      title,
      sourceKind,
      paneId,
      segments: speakable.segments,
      currentSegmentIndex: speakable.startIndex,
      currentWordIndex: -1,
      error: null,
      continuing: false,
      more,
      waitingForMore: false,
    });
    if (speakable.pastEnd && more) {
      // Nothing from the chosen place on, of what has loaded so far, can be
      // said -- a page ending in a picture or a line of Greek. The last passage
      // that can is above that place, and reading it would be going back over
      // what the reader chose to start after; the reading waits for the next
      // section of the book instead. The names can load while it does.
      holdForMore(set, speakable.startIndex);
      if (get().usePronunciations) void loadPronunciationLexicon();
      return;
    }
    if (get().usePronunciations) {
      // One query, once a session. The first chapter waits a few milliseconds
      // for it rather than mispronouncing its way through verse one. If Stop
      // or another start lands first, this one has been replaced and says
      // nothing; and if the reader has already moved the reading on (a verse
      // clicked, a jump from the list), that move did the speaking.
      void loadPronunciationLexicon().then(() => {
        if (turn === startTurn) speakCurrentSegment(get, set);
      });
    } else {
      speakCurrentSegment(get, set);
    }
  },
  pause: () => {
    engine().pause();
    set({ isPaused: true });
  },
  resume: () => {
    // A seek while paused left the queue on a verse the engine has never been
    // given, so there is nothing to resume: it has to be spoken from the top.
    if (speakOnResume) {
      speakOnResume = false;
      set({ isPaused: false });
      speakCurrentSegment(get, set, "moved");
      return;
    }
    const s = get();
    if (!s.isPlaying && !s.isPaused && s.segments.length > 0 && !s.continuing) {
      // Nothing is half-spoken: the reading came to its end, or stopped on a
      // failure, or the voice was changed under it. Play reads again -- from
      // the top when it had finished, from the passage it stopped on
      // otherwise, which is a second try at the one that failed.
      failures = 0;
      silences = 0;
      if (waitedWhenVoiceChanged) {
        // Except that a reading changed over while it waited for more of a
        // book had already said the passage it is on. It goes on to the next
        // one if that has come meanwhile; back to waiting if it has not; and
        // from the top, like any finished reading, if the book turned out to
        // have nothing more.
        waitedWhenVoiceChanged = false;
        if (s.currentSegmentIndex + 1 < s.segments.length) set({ currentSegmentIndex: s.currentSegmentIndex + 1 });
        else if (s.more) {
          holdForMore(set, s.currentSegmentIndex);
          return;
        } else set({ currentSegmentIndex: 0 });
        speakCurrentSegment(get, set);
        return;
      }
      if (ranToEnd) set({ currentSegmentIndex: 0 });
      speakCurrentSegment(get, set);
      return;
    }
    engine().resume();
    set({ isPaused: false });
  },
  stop: () => {
    hush();
    startTurn += 1;
    stopSleepTicker();
    speakOnResume = false;
    ranToEnd = false;
    waitedWhenVoiceChanged = false;
    set({
      isPlaying: false,
      isPaused: false,
      preparing: false,
      segments: [],
      currentSegmentIndex: 0,
      currentWordIndex: -1,
      title: "",
      sourceKind: null,
      paneId: null,
      sleepMinutes: 0,
      sleepUntil: null,
      fadeLevel: 1,
      continuing: false,
      more: false,
      waitingForMore: false,
    });
  },
  next: () => {
    const s = get();
    if (s.currentSegmentIndex + 1 < s.segments.length) {
      set({ currentSegmentIndex: s.currentSegmentIndex + 1 });
      speakCurrentSegment(get, set, "moved");
    } else if (s.more) {
      // The last passage found so far, with more of the book on its way.
      // Stopping here ended a reading the reader was in the middle of only
      // because the next section had not loaded yet; it waits for it instead,
      // as reaching this point on its own does.
      if (s.waitingForMore) return;
      holdForMore(set, s.currentSegmentIndex);
    } else {
      s.stop();
    }
  },
  prev: () => {
    const s = get();
    if (s.currentSegmentIndex > 0) {
      set({ currentSegmentIndex: s.currentSegmentIndex - 1 });
      speakCurrentSegment(get, set, "moved");
    }
  },
  seek: (segmentIndex) => {
    const s = get();
    if (segmentIndex < 0 || segmentIndex >= s.segments.length) return;
    // Choosing a verse while the reading is paused moves the place without
    // breaking the pause -- the reader is reading, not listening, and a
    // sentence of speech out of a paused player would be a fright. Nor is it
    // waiting for more of the book any longer: the next section to arrive
    // must not snatch the place back from where the reader put it.
    if (s.isPaused) {
      hush();
      speakOnResume = true;
      set({ currentSegmentIndex: segmentIndex, currentWordIndex: -1, preparing: false, waitingForMore: false });
      return;
    }
    set({ currentSegmentIndex: segmentIndex });
    speakCurrentSegment(get, set, "moved");
  },
  readFrom: (title, sourceKind, segments, index, opts) => {
    const s = get();
    const paneId = opts?.paneId ?? null;
    // Only a reading still under way is "the same": one that has finished is
    // started afresh, or a click on its first paragraph would seek within a
    // reading that is over and say nothing.
    const inProgress = s.isPlaying || s.isPaused;
    if (inProgress && s.segments.length > 0 && s.title === title && s.sourceKind === sourceKind && s.paneId === paneId) {
      // The caller's index is into its own list, which may hold passages the
      // store dropped, and the store's list may have grown past the caller's
      // as later sections arrived -- so the place is found by id, not position.
      const wanted = speakableFrom(segments, index);
      const target = wanted.segments[wanted.startIndex];
      const at = target ? s.segments.findIndex((segment) => segment.id === target.id) : -1;
      if (at >= 0) {
        // When nothing in the caller's list from `index` on could be said,
        // `target` is the last passage before it that could -- above the
        // place chosen. The reading goes on from the passage after that one
        // if it holds one (it may have grown past the caller's list), waits
        // for more of the book if that is still coming, and only when there
        // is neither falls back to `target`, as a start would.
        const from = wanted.pastEnd ? at + 1 : at;
        if (from < s.segments.length) s.seek(from);
        else if (s.more) holdForMore(set, at);
        else s.seek(at);
        return;
      }
    }
    s.start(title, sourceKind, segments, { startIndex: index, paneId, more: opts?.more });
  },
  appendSegments: (title, paneId, segments, opts) => {
    const s = get();
    if (s.segments.length === 0 || s.title !== title || s.paneId !== paneId) return;
    const more = !opts?.done;
    const added = segments.filter((segment) => hasSpeakableText(segment.text));
    if (added.length === 0) {
      set({ more });
      // Nothing more is coming and the reading was waiting on it: it is over,
      // and ends the way any reading does at its last passage.
      if (!more && s.waitingForMore) {
        set({ waitingForMore: false });
        finishQueue(get, set);
      }
      return;
    }
    const wasLast = s.currentSegmentIndex === s.segments.length - 1;
    set({ segments: [...s.segments, ...added], more, waitingForMore: false });
    if (s.waitingForMore && s.isPlaying) {
      set({ currentSegmentIndex: s.segments.length });
      if (!s.isPaused) speakCurrentSegment(get, set);
      else {
        speakOnResume = true;
        set({ preparing: false });
      }
      return;
    }
    // The passage playing was the last one there was, so nothing was asked
    // for ahead of it. Ask now, or the neural voice meets the break with the
    // next passage not yet rendered.
    if (s.isPlaying && wasLast) prefetchNext(get());
  },
}));

// A reader who has never chosen an engine should hear the bundled neural voice,
// not the 2013-era Windows one -- the robot is the fallback, not the default.
// Whether the model was bundled is a question for Rust, so the store starts on
// Web Speech (always there) and moves as soon as the answer comes back. This
// runs at import, long before the player bar exists, and a stored choice or one
// made in the meantime is left alone.
if (!engineChosen) {
  const natural = ttsEngines.kokoro;
  void Promise.resolve(natural?.probe?.() ?? false)
    .then((ok) => {
      if (ok && !engineChosen) useTtsStore.setState({ engineId: natural.id });
    })
    .catch(() => undefined);
}
