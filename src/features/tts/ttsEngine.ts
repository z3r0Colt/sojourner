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
  /** The first sound of this text. An engine that renders before it can play
   * is silent for a moment first, and the player says so until this arrives. */
  onSpeakingStart?: () => void;
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
  /** Whether a name spelled out in syllables -- "me-fib-o-sheth" -- helps this
   * engine. A voice that reads text as it is spelled is helped; one with its
   * own pronunciation dictionary is not, and is handed the name as written. */
  readonly readsRespellings: boolean;
  /** Optional: change speed without re-speaking the current text. Web Speech
   * fixes an utterance's rate when it starts and so leaves this out; an engine
   * playing rendered audio can just play it faster. */
  setRate?(rate: number): void;
  /** Optional: an engine that needs to look for its files before it can say
   * whether it is usable. Resolves to the same answer `isAvailable` gives. */
  probe?(): Promise<boolean>;
  /** Optional: whether this engine would read `text` as words. An engine that
   * spells out what its dictionary does not have can say so before a reader
   * saves a correction it would only mangle. */
  canSay?(text: string): Promise<boolean>;
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
  readonly readsRespellings = true;

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

    utter.onstart = () => callbacks.onSpeakingStart?.();
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
  // Kokoro looks every word up in a dictionary and spells out what it cannot
  // find, so a respelling makes things worse, not better: it says Jacob well
  // enough, and given "ja-kub" instead it reads "kub" as K, U, B. The names it
  // genuinely cannot read are in the lexicon it loads at startup, as phonemes
  // (src-tauri/examples/build_g2p_lexicon.rs).
  readonly readsRespellings = false;

  /**
   * One element for the whole session, rather than one per verse.
   *
   * A verse used to get a freshly made `Audio`, and the moment it was made was
   * the moment the verse before it ended -- so every verse change asked
   * Chromium to tear down one media player and stand up another in the same
   * breath. A `play()` that did not take there was heard as exactly what was
   * reported: a verse going by in silence with the player still saying it was
   * reading. One element, given a new source each time, has none of that.
   */
  private audio: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private available = false;
  /** The speed to give the next piece of audio. `setRate` changes the element
   * that is playing; a verse read in pieces has more of them coming. */
  private rate = 1;
  /** True while the reader has the player paused, so a piece that finishes
   * rendering into a paused player waits instead of starting to talk. */
  private paused = false;
  /** Ends the wait on the piece now playing, however it ends. */
  private endCurrentPiece: (() => void) | null = null;
  /** Watches for audio that was asked to play and then never made a sound. */
  private startGuard: number | null = null;
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

  async canSay(text: string): Promise<boolean> {
    try {
      return await invoke<boolean>("kokoro_can_say", { text });
    } catch {
      // Unanswerable is not the same as unsayable; say nothing rather than
      // warn a reader off a spelling that may be perfectly good.
      return true;
    }
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

  /** How a rendered piece is remembered: the voice, then the exact text. */
  private key(text: string, voiceId: string | null): string {
    return `${voiceId ?? DEFAULT_KOKORO_VOICE}\u0000${text}`;
  }

  private render(text: string, voiceId: string | null): Promise<ArrayBuffer> {
    const voice = voiceId ?? DEFAULT_KOKORO_VOICE;
    const key = this.key(text, voiceId);
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

  /** The session's audio element, made on first use and then kept. */
  private element(): HTMLAudioElement {
    if (!this.audio) this.audio = new Audio();
    return this.audio;
  }

  /** Stops whatever is playing and ends the wait on it. The element itself
   * stays: only its source and handlers are let go. */
  private release() {
    if (this.startGuard != null) {
      window.clearTimeout(this.startGuard);
      this.startGuard = null;
    }
    if (this.audio) {
      this.audio.pause();
      this.audio.onplaying = null;
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio.removeAttribute("src");
      this.audio.load();
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    const end = this.endCurrentPiece;
    this.endCurrentPiece = null;
    end?.();
  }

  /** How long to give audio that was asked to play before trying again. */
  private static readonly SILENCE_BEFORE_RETRY_MS = 6000;

  /** Plays one piece of rendered audio; resolves when it has finished. */
  private playRendered(buffer: ArrayBuffer, opts: SpeakOptions, generation: number, onStart?: () => void): Promise<void> {
    return new Promise((resolve, reject) => {
      // Cancelling stops the element without it ever ending, so `release` is
      // what ends this wait; left to the `ended` event alone, every skipped
      // verse would strand a promise that never settles.
      this.endCurrentPiece = resolve;
      const url = URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
      const audio = this.element();
      if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = url;
      audio.src = url;
      audio.volume = opts.volume;
      audio.playbackRate = this.rate;

      let sounded = false;
      let attempts = 0;
      const stopGuard = () => {
        if (this.startGuard != null) {
          window.clearTimeout(this.startGuard);
          this.startGuard = null;
        }
      };
      const fail = (message: string) => {
        stopGuard();
        // Off first: `release` would otherwise settle this piece as finished
        // and the failure would be swallowed as a verse that simply ended.
        this.endCurrentPiece = null;
        this.release();
        reject(new Error(message));
      };

      audio.onplaying = () => {
        if (generation !== this.generation) return;
        sounded = true;
        stopGuard();
        onStart?.();
      };
      audio.onended = () => {
        if (generation !== this.generation) return;
        stopGuard();
        this.release();
        resolve();
      };
      audio.onerror = () => {
        if (generation !== this.generation) return;
        fail("The voice could not play this verse.");
      };

      // Asking to play, and making sure it really did.
      //
      // `play()` can resolve -- or neither resolve nor reject -- while no sound
      // follows, which is the verse that goes by in silence under a player that
      // says it is reading. So the audio is given a moment to be heard from,
      // and started again if it is not. The buffer is already in hand, so a
      // second attempt costs nothing but the wait.
      const start = () => {
        if (this.paused || generation !== this.generation) return;
        attempts += 1;
        stopGuard();
        this.startGuard = window.setTimeout(() => {
          this.startGuard = null;
          if (sounded || this.paused || generation !== this.generation) return;
          if (attempts <= 2) {
            audio.load();
            start();
          } else {
            fail("The voice would not start.");
          }
        }, KokoroEngine.SILENCE_BEFORE_RETRY_MS);
        void audio.play().catch((err) => {
          if (generation !== this.generation || this.paused) return;
          // A rejected play is not fatal on its own: the guard above tries
          // again, and only gives up when the audio stays silent.
          if (attempts > 2) fail(String(err));
        });
      };

      // Rendering can finish after the reader has hit pause; the piece waits
      // for `resume` rather than talking over a paused player.
      if (this.paused) return;
      start();
    });
  }

  speak(text: string, opts: SpeakOptions, callbacks: SpeakCallbacks): void {
    const generation = ++this.generation;
    this.release();
    this.rate = opts.rate;
    this.paused = false;

    // A verse takes a few seconds to render, which is fine when the store has
    // asked for it in advance -- but the verse a reader has just pressed play
    // on, or jumped to, has had no such warning, and those seconds are dead
    // silence under a player that says it is reading. That verse is read a
    // sentence at a time instead: the first sentence is short enough to arrive
    // quickly, and the rest of the verse renders while it plays. Breaks fall
    // where the punctuation already puts them, never inside a clause.
    const pieces = this.rendered.has(this.key(text, opts.voiceId)) ? [text] : splitForQuickStart(text);

    void (async () => {
      try {
        for (let i = 0; i < pieces.length; i++) {
          const buffer = await this.render(pieces[i], opts.voiceId);
          if (generation !== this.generation) return;
          // The next piece renders while this one plays.
          const next = pieces[i + 1];
          if (next) void this.render(next, opts.voiceId).catch(() => undefined);
          await this.playRendered(buffer, opts, generation, i === 0 ? callbacks.onSpeakingStart : undefined);
          if (generation !== this.generation) return;
        }
        callbacks.onEnd();
      } catch (err) {
        if (generation === this.generation) callbacks.onError(String(err));
      }
    })();
  }

  setRate(rate: number): void {
    this.rate = rate;
    if (this.audio) this.audio.playbackRate = rate;
  }

  pause(): void {
    this.paused = true;
    this.audio?.pause();
  }

  resume(): void {
    this.paused = false;
    void this.audio?.play().catch(() => undefined);
  }

  cancel(): void {
    this.generation += 1;
    this.paused = false;
    this.release();
  }
}

/** Verses shorter than this render quickly enough that splitting one would
 * buy a fraction of a second and cost a seam. */
const WHOLE_VERSE_CHARS = 70;
/** A first piece shorter than this is a fragment -- "Selah.", "And he said." --
 * and the wait moves on to the next break instead. */
const MIN_FIRST_PIECE_CHARS = 25;

/**
 * A verse split into the piece to render first and the rest of it, or the
 * whole verse when there is nothing to gain by splitting.
 *
 * Only sentence punctuation is a break: Kokoro shapes each piece as a complete
 * utterance, so cutting inside a clause would put a full stop in the middle of
 * one. A semicolon or colon is where the King James pauses too.
 */
export function splitForQuickStart(text: string): string[] {
  if (text.length <= WHOLE_VERSE_CHARS) return [text];
  for (const match of text.matchAll(/[.;:!?]["'’”)\]]*\s+/g)) {
    const end = match.index + match[0].length;
    if (end >= text.length) break;
    if (end < MIN_FIRST_PIECE_CHARS) continue;
    return [text.slice(0, end).trimEnd(), text.slice(end)];
  }
  return [text];
}

export const kokoroEngine = new KokoroEngine();

/** Registry of available engines, keyed by id. Cloud engines get added here later. */
export const ttsEngines: Record<string, TtsEngine> = {
  webspeech: webSpeechEngine,
  kokoro: kokoroEngine,
};
