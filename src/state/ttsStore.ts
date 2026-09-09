import { create } from "zustand";
import { ttsEngines } from "../features/tts/ttsEngine";
import { tokenizeWords, findWordIndexAtChar, type TtsWordToken } from "../features/tts/textUtils";

export interface TtsSegment {
  id: string | number;
  text: string;
  label?: string;
}

export type TtsSourceKind = "scripture" | "commentary" | "resource" | "other";
export type TtsHighlightStyle = "background" | "underline" | "bold";

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

  // Playback session (not persisted)
  title: string;
  sourceKind: TtsSourceKind | null;
  segments: TtsSegment[];
  currentSegmentIndex: number;
  currentWordIndex: number;
  isPlaying: boolean;
  isPaused: boolean;
  error: string | null;

  setVoiceId: (id: string | null) => void;
  setRate: (n: number) => void;
  setPitch: (n: number) => void;
  setVolume: (n: number) => void;
  setHighlightColor: (c: string) => void;
  setHighlightStyle: (s: TtsHighlightStyle) => void;
  setAutoScroll: (b: boolean) => void;

  start: (title: string, sourceKind: TtsSourceKind, segments: TtsSegment[], startIndex?: number) => void;
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
    { voiceId: s.voiceId, rate: s.rate, pitch: s.pitch, volume: s.volume },
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
          set({ isPlaying: false, isPaused: false, currentWordIndex: -1 });
        }
      },
      onError: (message) => {
        set({ isPlaying: false, isPaused: false, error: message });
      },
    },
  );
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

  title: "",
  sourceKind: null,
  segments: [],
  currentSegmentIndex: 0,
  currentWordIndex: -1,
  isPlaying: false,
  isPaused: false,
  error: null,

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

  start: (title, sourceKind, segments, startIndex = 0) => {
    engine().cancel();
    set({
      title,
      sourceKind,
      segments,
      currentSegmentIndex: Math.min(startIndex, Math.max(segments.length - 1, 0)),
      currentWordIndex: -1,
      error: null,
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
    set({ isPlaying: false, isPaused: false, segments: [], currentSegmentIndex: 0, currentWordIndex: -1, title: "", sourceKind: null });
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
