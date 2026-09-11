import { create } from "zustand";
import { ttsEngines } from "../features/tts/ttsEngine";
import { tokenizeWords, findWordIndexAtChar, type TtsWordToken } from "../features/tts/textUtils";
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

  setVoiceId: (id: string | null) => void;
  setRate: (n: number) => void;
  setPitch: (n: number) => void;
  setVolume: (n: number) => void;
  setHighlightColor: (c: string) => void;
  setHighlightStyle: (s: TtsHighlightStyle) => void;
  setAutoScroll: (b: boolean) => void;
  setAutoContinue: (b: boolean) => void;
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
    set({ isPlaying: false, isPaused: false, currentWordIndex: -1, continuing: true });
    return;
  }
  set({ isPlaying: false, isPaused: false, currentWordIndex: -1 });
}

function speakCurrentSegment(get: () => TtsState, set: (partial: Partial<TtsState>) => void) {
  const s = get();
  const segment = s.segments[s.currentSegmentIndex];
  if (!segment) {
    set({ isPlaying: false, isPaused: false });
    return;
  }
  currentTokens = tokenizeWords(segment.text);
  set({ currentWordIndex: -1, isPlaying: true, isPaused: false, error: null });

  engine().speak(
    segment.text,
    { voiceId: s.voiceId, rate: s.rate, pitch: s.pitch, volume: s.volume * s.fadeLevel },
    {
      onWordBoundary: (charIndex) => {
        const idx = findWordIndexAtChar(currentTokens, charIndex);
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
        set({ isPlaying: false, isPaused: false, error: message });
      },
    },
  );
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

  title: "",
  sourceKind: null,
  paneId: null,
  segments: [],
  currentSegmentIndex: 0,
  currentWordIndex: -1,
  isPlaying: false,
  isPaused: false,
  error: null,
  sleepMinutes: 0,
  sleepUntil: null,
  fadeLevel: 1,
  continuing: false,

  setVoiceId: (voiceId) => {
    persist({ voiceId });
    set({ voiceId });
  },
  setRate: (rate) => {
    persist({ rate });
    set({ rate });
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
    speakCurrentSegment(get, set);
  },
  pause: () => {
    engine().pause();
    set({ isPaused: true });
  },
  resume: () => {
    engine().resume();
    set({ isPaused: false });
  },
  stop: () => {
    engine().cancel();
    stopSleepTicker();
    set({
      isPlaying: false,
      isPaused: false,
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
    set({ currentSegmentIndex: segmentIndex });
    speakCurrentSegment(get, set);
  },
}));
