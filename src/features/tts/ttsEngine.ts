// Pluggable text-to-speech engine. `WebSpeechEngine` (below) uses the OS's
// installed voices via the browser's Web Speech API -- free, offline, works
// immediately. Cloud engines (ElevenLabs/Azure/OpenAI etc) can be added later
// as additional classes implementing the same `TtsEngine` interface; the rest
// of the app (ttsStore, ReadAloudWords, TtsPlayerBar) only depends on this
// interface, not on Web Speech specifics.

export interface TtsVoice {
  id: string; // voiceURI for web speech; provider voice id for cloud engines
  name: string;
  lang: string;
}

export interface SpeakOptions {
  voiceId: string | null;
  rate: number; // 0.5 - 2 (1 = normal)
  pitch: number; // 0 - 2 (1 = normal)
  volume: number; // 0 - 1
}

export interface SpeakCallbacks {
  /** charIndex/charLength are offsets into the exact `text` passed to speak(). */
  onWordBoundary: (charIndex: number, charLength: number) => void;
  onEnd: () => void;
  onError: (message: string) => void;
}

export interface TtsEngine {
  readonly id: string;
  readonly label: string;
  /** Whether this engine is currently usable (e.g. cloud engines need an API key). */
  isAvailable(): boolean;
  listVoices(): Promise<TtsVoice[]>;
  speak(text: string, opts: SpeakOptions, callbacks: SpeakCallbacks): void;
  pause(): void;
  resume(): void;
  cancel(): void;
}

/** True as long as at least one attempt to load voices has resolved (Chromium loads them async). */
let voicesReady = false;
let voicesReadyPromise: Promise<void> | null = null;

function waitForVoices(): Promise<void> {
  if (voicesReady) return Promise.resolve();
  if (voicesReadyPromise) return voicesReadyPromise;
  voicesReadyPromise = new Promise((resolve) => {
    const synth = window.speechSynthesis;
    if (!synth) {
      resolve();
      return;
    }
    const existing = synth.getVoices();
    if (existing.length > 0) {
      voicesReady = true;
      resolve();
      return;
    }
    const onChange = () => {
      voicesReady = true;
      synth.removeEventListener("voiceschanged", onChange);
      resolve();
    };
    synth.addEventListener("voiceschanged", onChange);
    // Some engines never fire voiceschanged if voices are already loaded synchronously
    // by the time we get here on a later tick; fall back after a short timeout.
    setTimeout(() => {
      if (!voicesReady) {
        voicesReady = true;
        resolve();
      }
    }, 1000);
  });
  return voicesReadyPromise;
}

export class WebSpeechEngine implements TtsEngine {
  readonly id = "webspeech";
  readonly label = "Windows voices (offline)";

  isAvailable(): boolean {
    return typeof window !== "undefined" && !!window.speechSynthesis;
  }

  async listVoices(): Promise<TtsVoice[]> {
    if (!this.isAvailable()) return [];
    await waitForVoices();
    return window.speechSynthesis
      .getVoices()
      .filter((v) => v.lang.toLowerCase().startsWith("en"))
      .map((v) => ({ id: v.voiceURI, name: v.name, lang: v.lang }));
  }

  speak(text: string, opts: SpeakOptions, callbacks: SpeakCallbacks): void {
    if (!this.isAvailable()) {
      callbacks.onError("Speech synthesis is not available in this environment.");
      return;
    }
    const synth = window.speechSynthesis;
    // Chromium sometimes leaves stale queued utterances around; make sure we
    // start clean before queuing a new one.
    synth.cancel();

    const utter = new SpeechSynthesisUtterance(text);
    const voices = synth.getVoices();
    const voice = opts.voiceId ? voices.find((v) => v.voiceURI === opts.voiceId) : undefined;
    if (voice) utter.voice = voice;
    utter.rate = opts.rate;
    utter.pitch = opts.pitch;
    utter.volume = opts.volume;

    utter.onboundary = (e) => {
      if (e.name === "word" || e.name === undefined) {
        callbacks.onWordBoundary(e.charIndex, e.charLength ?? 0);
      }
    };
    utter.onend = () => callbacks.onEnd();
    utter.onerror = (e) => {
      // "interrupted"/"canceled" happen on normal stop/skip -- not real errors.
      if (e.error === "interrupted" || e.error === "canceled") return;
      callbacks.onError(e.error ?? "Speech synthesis error");
    };

    synth.speak(utter);
  }

  pause(): void {
    window.speechSynthesis?.pause();
  }

  resume(): void {
    window.speechSynthesis?.resume();
  }

  cancel(): void {
    window.speechSynthesis?.cancel();
  }
}

export const webSpeechEngine = new WebSpeechEngine();

/** Registry of available engines, keyed by id. Cloud engines get added here later. */
export const ttsEngines: Record<string, TtsEngine> = {
  webspeech: webSpeechEngine,
};
