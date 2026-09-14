// Pluggable text-to-speech engine. `WebSpeechEngine` (below) uses the OS's
// installed voices via the browser's Web Speech API -- free, offline, works
// immediately. Cloud engines (ElevenLabs/Azure/OpenAI etc) can be added later
// as additional classes implementing the same `TtsEngine` interface; the rest
// of the app (ttsStore, ReadAloudWords, TtsPlayerBar) only depends on this
// interface, not on Web Speech specifics.

import { invoke } from "@tauri-apps/api/core";

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
  /** Whether this engine reports which word it is saying. Engines that return
   * finished audio cannot, and the highlight follows the verse instead. */
  readonly reportsWordBoundaries: boolean;
  /** Optional: change speed without re-speaking the current text. Web Speech
   * fixes an utterance's rate when it starts and so leaves this out; an engine
   * playing rendered audio can just play it faster. */
  setRate?(rate: number): void;
  /** Optional: an engine that needs to look for its files before it can say
   * whether it is usable. Resolves to the same answer `isAvailable` gives. */
  probe?(): Promise<boolean>;
  /** Optional: start rendering text that is about to be needed. An engine that
   * synthesizes a whole verse before it can play a note of it would otherwise
   * leave a silence at every verse break. */
  prefetch?(text: string, opts: SpeakOptions): void;
}

/** True once the browser has actually produced a voice list. */
let voicesReady = false;
let voicesReadyPromise: Promise<void> | null = null;

/**
 * Chromium loads voices asynchronously, and on a cold start this can take
 * several seconds -- longer than any fixed wait worth making a reader sit
 * through.
 *
 * Nothing is latched until there is really a list: an earlier version gave up
 * after a second and marked the voices "ready" while empty, and because that
 * flag is a module-level latch, every later call short-circuited on it. The
 * voice picker then stayed empty for the rest of the session, which looks
 * exactly like a machine with no voices installed.
 */
function waitForVoices(): Promise<void> {
  if (voicesReady) return Promise.resolve();
  if (voicesReadyPromise) return voicesReadyPromise;
  voicesReadyPromise = new Promise((resolve) => {
    const synth = window.speechSynthesis;
    if (!synth) {
      resolve();
      return;
    }
    let poll = 0;
    let giveUp = 0;
    const stop = () => {
      synth.removeEventListener("voiceschanged", onChange);
      window.clearInterval(poll);
      window.clearTimeout(giveUp);
    };
    const check = () => {
      if (synth.getVoices().length === 0) return;
      voicesReady = true;
      stop();
      resolve();
    };
    // Polling as well as listening: Chromium does not reliably fire
    // voiceschanged when the list was already populated a tick earlier.
    const onChange = () => check();
    synth.addEventListener("voiceschanged", onChange);
    poll = window.setInterval(check, 250);
    giveUp = window.setTimeout(() => {
      stop();
      // Left unlatched on purpose, so opening the picker again tries afresh
      // rather than inheriting this attempt's empty answer.
      voicesReadyPromise = null;
      resolve();
    }, 10_000);
    check();
  });
  return voicesReadyPromise;
}

export class WebSpeechEngine implements TtsEngine {
  readonly id = "webspeech";
  readonly label = "Windows voices (offline)";
  readonly reportsWordBoundaries = true;

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

/** Used when no voice has been chosen: a clear, unhurried American reading. */
const DEFAULT_KOKORO_VOICE = "af_heart";

/** `af_heart` -> "Heart (American, female)". Kokoro names its voices by a
 * language letter, a gender letter, then the name. */
function describeKokoroVoice(id: string): string {
  const [prefix, ...rest] = id.split("_");
  const name = rest.join(" ") || id;
  const pretty = name.charAt(0).toUpperCase() + name.slice(1);
  const accent = prefix.startsWith("a") ? "American" : prefix.startsWith("b") ? "British" : "";
  const gender = prefix.endsWith("f") ? "female" : prefix.endsWith("m") ? "male" : "";
  const detail = [accent, gender].filter(Boolean).join(", ");
  return detail ? `${pretty} (${detail})` : pretty;
}

/**
 * Kokoro, run locally. The model is bundled in the installer and synthesis
 * happens in Rust, which hands back a finished WAV for a whole verse.
 *
 * That shape is why this engine cannot report word boundaries: there is no
 * stream of events to listen to, only audio. Playback is an `<audio>` element
 * over a blob, which at least means speed changes are free.
 */
export class KokoroEngine implements TtsEngine {
  readonly id = "kokoro";
  readonly label = "Natural voice (offline)";
  readonly reportsWordBoundaries = false;

  private audio: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private available = false;
  /** Bumped by every new utterance and by cancel, so audio that finishes
   * rendering after the reader has moved on is thrown away instead of played
   * over whatever is being said now. */
  private generation = 0;

  isAvailable(): boolean {
    return this.available;
  }

  async probe(): Promise<boolean> {
    try {
      this.available = await invoke<boolean>("kokoro_available");
    } catch {
      this.available = false;
    }
    return this.available;
  }

  async listVoices(): Promise<TtsVoice[]> {
    try {
      const ids = await invoke<string[]>("kokoro_voices");
      return ids.map((id) => ({ id, name: describeKokoroVoice(id), lang: id.startsWith("b") ? "en-GB" : "en-US" }));
    } catch {
      return [];
    }
  }

  /**
   * Verses already rendered or on their way, keyed by voice and text.
   *
   * A verse takes a few seconds to synthesize, which is comfortably less than
   * it takes to say -- but only if the work starts before it is needed.
   * Rendering on demand would put that few seconds of silence into every verse
   * break. The store calls `prefetch` for the next verse as the current one
   * starts, and by the time it is wanted it is usually already here.
   */
  private rendered = new Map<string, Promise<ArrayBuffer>>();

  private render(text: string, voiceId: string | null): Promise<ArrayBuffer> {
    const voice = voiceId ?? DEFAULT_KOKORO_VOICE;
    const key = `${voice} ${text}`;
    const existing = this.rendered.get(key);
    if (existing) return existing;

    const pending = invoke<ArrayBuffer>("kokoro_synthesize", {
      text,
      voice,
      // Speed is applied on playback rather than baked into the audio, so
      // moving the slider does not mean waiting for the verse to render again.
      speed: 1,
    });
    // A failure must not be remembered, or the same verse would never be
    // retried for the rest of the session.
    pending.catch(() => this.rendered.delete(key));
    this.rendered.set(key, pending);
    // Only the verse playing and the one after it are worth holding; each is
    // about a megabyte.
    while (this.rendered.size > 3) {
      const oldest = this.rendered.keys().next().value;
      if (oldest === undefined) break;
      this.rendered.delete(oldest);
    }
    return pending;
  }

  prefetch(text: string, opts: SpeakOptions): void {
    void this.render(text, opts.voiceId).catch(() => undefined);
  }

  private release() {
    if (this.audio) {
      this.audio.pause();
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio = null;
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  speak(text: string, opts: SpeakOptions, callbacks: SpeakCallbacks): void {
    const generation = ++this.generation;
    this.release();

    this.render(text, opts.voiceId)
      .then((buffer) => {
        if (generation !== this.generation) return; // superseded while rendering
        const url = URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
        const audio = new Audio(url);
        audio.volume = opts.volume;
        audio.playbackRate = opts.rate;
        audio.onended = () => {
          if (generation !== this.generation) return;
          this.release();
          callbacks.onEnd();
        };
        audio.onerror = () => {
          if (generation !== this.generation) return;
          this.release();
          callbacks.onError("The voice could not play this verse.");
        };
        this.audio = audio;
        this.objectUrl = url;
        void audio.play().catch((err) => {
          if (generation === this.generation) callbacks.onError(String(err));
        });
      })
      .catch((err) => {
        if (generation === this.generation) callbacks.onError(String(err));
      });
  }

  setRate(rate: number): void {
    if (this.audio) this.audio.playbackRate = rate;
  }

  pause(): void {
    this.audio?.pause();
  }

  resume(): void {
    void this.audio?.play().catch(() => undefined);
  }

  cancel(): void {
    this.generation += 1;
    this.release();
  }
}

export const kokoroEngine = new KokoroEngine();

/** Registry of available engines, keyed by id. Cloud engines get added here later. */
export const ttsEngines: Record<string, TtsEngine> = {
  webspeech: webSpeechEngine,
  kokoro: kokoroEngine,
};
