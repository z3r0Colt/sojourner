import { create } from "zustand";
import { ttsEngines } from "../features/tts/ttsEngine";
import { tokenizeWords, findWordIndexAtChar, type TtsWordToken } from "../features/tts/textUtils";
import { buildSpoken, loadPronunciationLexicon, toSourceIndex, type SpokenChunk } from "../features/tts/pronunciation";
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

  start: (title: string, sourceKind: TtsSourceKind, segments: TtsSegment[], opts?: { startIndex?: number; paneId?: string | null }) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  next: () => void;
  prev: () => void;
  seek: (segmentIndex: number) => void;
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
/** How the text handed to the engine lines up with the text on screen; null
 * when nothing was rewritten and the two are the same string. */
let currentChunks: SpokenChunk[] | null = null;

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
  const handler = cur.paneId != null ? queueEndHandlers.get(cur.paneId) : undefined;
  if (cur.autoContinue && cur.sourceKind === "scripture" && handler && handler()) {
    set({ isPlaying: false, isPaused: false, preparing: false, currentWordIndex: -1, continuing: true });
    return;
  }
  set({ isPlaying: false, isPaused: false, preparing: false, currentWordIndex: -1 });
}

function speakCurrentSegment(get: () => TtsState, set: (partial: Partial<TtsState>) => void) {
  speakOnResume = false;
  const s = get();
  const segment = s.segments[s.currentSegmentIndex];
  if (!segment) {
    set({ isPlaying: false, isPaused: false, preparing: false });
    return;
  }
  // The tokens stay those of the displayed verse. What the engine is given may
  // be a rewritten one -- "me-fib-o-sheth" for Mephibosheth -- so the boundary
  // events it reports are mapped back before they move the highlight.
  currentTokens = tokenizeWords(segment.text);
  // A voice with its own pronunciation dictionary is handed the names as they
  // are written -- rewriting them is how "Jacob" became "ja-kub" and then
  // K, U, B -- and only the reader's own corrections are applied to it.
  const rendered = s.usePronunciations
    ? buildSpoken(segment.text, { correctionsOnly: !engine().readsRespellings })
    : null;
  currentChunks = rendered && rendered.changed > 0 ? rendered.chunks : null;
  set({ currentWordIndex: -1, isPlaying: true, isPaused: false, preparing: true, error: null });

  const current = engine();
  const opts = { voiceId: s.voiceId, rate: s.rate, pitch: s.pitch, volume: s.volume * s.fadeLevel };

  current.speak(
    rendered ? rendered.spoken : segment.text,
    opts,
    {
      onSpeakingStart: () => {
        failures = 0;
        set({ preparing: false });
      },
      onWordBoundary: (charIndex) => {
        const sourceIndex = currentChunks ? toSourceIndex(currentChunks, charIndex) : charIndex;
        const idx = findWordIndexAtChar(currentTokens, sourceIndex);
        set({ currentWordIndex: idx });
      },
      onEnd: () => {
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
        // A passage the voice cannot speak should cost that passage, not the
        // reading. Before this, one failure part-way through a commentary left
        // a player that had simply gone quiet, with no way on but to start
        // again -- and the reader had no idea which passage had done it.
        const cur = get();
        failures += 1;
        if (failures < GIVE_UP_AFTER && cur.isPlaying && !cur.isPaused && cur.currentSegmentIndex + 1 < cur.segments.length) {
          const skipped = cur.segments[cur.currentSegmentIndex]?.label;
          set({ currentSegmentIndex: cur.currentSegmentIndex + 1 });
          speakCurrentSegment(get, set);
          // After the next one has started, which clears the error as it goes.
          set({ error: `Could not read ${skipped ?? "one passage"}` });
          return;
        }
        set({ isPlaying: false, isPaused: false, preparing: false, error: message });
      },
    },
  );

  // Start the next verse rendering while this one plays. An engine that has to
  // synthesize a whole verse before it can play a note of it would otherwise
  // leave a few seconds of silence at every verse break; the neural voice
  // renders in well under the time a verse takes to say, so given this head
  // start it is ready by the time it is wanted.
  const next = s.segments[s.currentSegmentIndex + 1];
  if (next && current.prefetch) {
    // The same text the next verse will be spoken from, or the render waiting
    // for it would be of a different string and thrown away unused.
    const nextRendered = s.usePronunciations ? buildSpoken(next.text, { correctionsOnly: !current.readsRespellings }) : null;
    current.prefetch(nextRendered ? nextRendered.spoken : next.text, opts);
  }
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

  setEngineId: (engineId) => {
    engineChosen = true;
    engine().cancel();
    // Voice ids belong to the engine that issued them, so carrying one across
    // a switch would name a voice the new engine has never heard of.
    persist({ engineId, voiceId: null });
    set({ engineId, voiceId: null, isPlaying: false, isPaused: false });
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
    const s = get();
    if (s.isPlaying) speakCurrentSegment(get, set);
  },
  setPitch: (pitch) => {
    persist({ pitch });
    set({ pitch });
    const s = get();
    if (s.isPlaying) speakCurrentSegment(get, set);
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
    const startIndex = opts?.startIndex ?? 0;
    failures = 0;
    engine().cancel();
    set({
      title,
      sourceKind,
      paneId: opts?.paneId ?? null,
      segments,
      currentSegmentIndex: Math.min(startIndex, Math.max(segments.length - 1, 0)),
      currentWordIndex: -1,
      error: null,
      continuing: false,
    });
    if (get().usePronunciations) {
      // One query, once a session. The first chapter waits a few milliseconds
      // for it rather than mispronouncing its way through verse one. If Stop
      // lands first the queue is empty by then and nothing is spoken.
      void loadPronunciationLexicon().then(() => speakCurrentSegment(get, set));
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
      speakCurrentSegment(get, set);
      return;
    }
    engine().resume();
    set({ isPaused: false });
  },
  stop: () => {
    engine().cancel();
    stopSleepTicker();
    speakOnResume = false;
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
    });
  },
  next: () => {
    const s = get();
    if (s.currentSegmentIndex + 1 < s.segments.length) {
      set({ currentSegmentIndex: s.currentSegmentIndex + 1 });
      speakCurrentSegment(get, set);
    } else {
      s.stop();
    }
  },
  prev: () => {
    const s = get();
    if (s.currentSegmentIndex > 0) {
      set({ currentSegmentIndex: s.currentSegmentIndex - 1 });
      speakCurrentSegment(get, set);
    }
  },
  seek: (segmentIndex) => {
    const s = get();
    if (segmentIndex < 0 || segmentIndex >= s.segments.length) return;
    // Choosing a verse while the reading is paused moves the place without
    // breaking the pause -- the reader is reading, not listening, and a
    // sentence of speech out of a paused player would be a fright.
    if (s.isPaused) {
      engine().cancel();
      speakOnResume = true;
      set({ currentSegmentIndex: segmentIndex, currentWordIndex: -1, preparing: false });
      return;
    }
    set({ currentSegmentIndex: segmentIndex });
    speakCurrentSegment(get, set);
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
