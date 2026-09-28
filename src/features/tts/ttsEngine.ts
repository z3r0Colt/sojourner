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

/** How soon a render is wanted: for the passage being said now, or ahead of
 * time, for the one after it. */
export type RenderUrgency = "now" | "ahead";

interface QueuedRender<T> {
  key: string;
  urgency: RenderUrgency;
  /** Sends the render, with the turn it is sent in. */
  run: (turn: number) => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  promise: Promise<T>;
}

/** A render sent and not yet back. */
interface SentRender {
  key: string;
  /** Let go of: the reader has moved away from it. */
  abandoned: boolean;
}

/**
 * Renders waiting their turn at the voice, one at a time, the passage being
 * said now ahead of any asked for in advance.
 *
 * The voice renders one passage at a time whatever it is asked (it sits behind
 * one lock in src-tauri/src/tts.rs), and every request used to go straight to
 * it. Two things came of that. The passage after the current one, asked for a
 * moment after it, often got the lock first -- the lock is not fair -- so the
 * verse the reader pressed play on waited behind the next one, and the first
 * sound took twice as long as it should. And nothing asked for was ever let
 * go: a jump in the list, or Stop and a new book, waited behind every render
 * the old reading still had queued -- twelve and eighteen seconds of them, in
 * a debug build. Here the order is decided before a request is sent, and a
 * request not sent yet can be dropped.
 *
 * A render already sent cannot be taken back, and it used to be waited out:
 * the voice renders one thing at a time, and a passage that came back silent
 * was rendered again and again (src-tauri/src/tts.rs, `speak_piece`), so a jump
 * could wait twelve seconds for a passage the reader had left. Now letting go
 * of one moves the queue on to a new turn, and the next request goes out at
 * once rather than behind it, carrying that turn. The voice, seeing a later
 * turn arrive, stops the old render at the next place it can -- before its
 * next piece or its next try -- and moves on to the new one. Only the model
 * call already running still has to finish.
 */
export class RenderQueue<T> {
  private queue: QueuedRender<T>[] = [];
  private sent: SentRender[] = [];
  /** The turn requests are sent in. It is kept at or above the clock's
   * milliseconds so that it only ever grows, even over a reload of the page:
   * the voice remembers the latest turn it has seen for as long as the app
   * runs, and a page starting again from nought would have every request
   * taken for an old one. */
  private turn = Date.now();
  /** Renders let go of can pile up behind the voice's lock while it finishes
   * the one under way; each gives up on sight once it gets the lock, but no
   * more than this many are ever out at once. */
  private static readonly MOST_SENT = 4;

  /** Queue `run` under `key`; a key already waiting is moved up if it is now
   * wanted sooner, and its promise handed back. */
  add(key: string, urgency: RenderUrgency, run: (turn: number) => Promise<T>): Promise<T> {
    const waiting = this.queue.find((job) => job.key === key);
    if (waiting) {
      if (urgency === "now") this.promote(key);
      return waiting.promise;
    }
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    this.queue.push({ key, urgency, run, resolve, reject, promise });
    this.pump();
    return promise;
  }

  /** A render asked for ahead that is wanted now after all goes to the
   * front, if it is still waiting. */
  promote(key: string) {
    const waiting = this.queue.find((job) => job.key === key);
    if (waiting) waiting.urgency = "now";
  }

  /** Whether `key` is waiting and not yet sent. */
  isWaiting(key: string): boolean {
    return this.queue.some((job) => job.key === key);
  }

  /** Drop every waiting render whose key is not in `keep`; their promises
   * reject. A render already sent whose key is not in `keep` is let go of,
   * and the turn moves on. Returns the keys dropped or let go of. */
  drop(keep: ReadonlySet<string> = new Set()): string[] {
    const dropped = this.queue.filter((job) => !keep.has(job.key));
    this.queue = this.queue.filter((job) => keep.has(job.key));
    for (const job of dropped) job.reject(new Error("This passage is no longer wanted."));
    const abandoned = this.sent.filter((render) => !render.abandoned && !keep.has(render.key));
    for (const render of abandoned) render.abandoned = true;
    if (abandoned.length > 0) {
      this.turn = Math.max(this.turn + 1, Date.now());
      this.pump();
    }
    return [...dropped.map((job) => job.key), ...abandoned.map((render) => render.key)];
  }

  /** Whether anything sent is still wanted, so the next must wait for it. */
  private get busy(): boolean {
    return this.sent.some((render) => !render.abandoned) || this.sent.length >= RenderQueue.MOST_SENT;
  }

  private pump() {
    if (this.busy || this.queue.length === 0) return;
    const urgent = this.queue.findIndex((job) => job.urgency === "now");
    const [job] = this.queue.splice(urgent >= 0 ? urgent : 0, 1);
    const render: SentRender = { key: job.key, abandoned: false };
    this.sent.push(render);
    let started: Promise<T>;
    try {
      started = job.run(this.turn);
    } catch (err) {
      started = Promise.reject(err);
    }
    started.then(job.resolve, job.reject).finally(() => {
      this.sent = this.sent.filter((other) => other !== render);
      this.pump();
    });
  }
}

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

  /** Requests for the voice, in the order they should be sent. */
  private queue = new RenderQueue<ArrayBuffer>();

  private render(text: string, voiceId: string | null, urgency: RenderUrgency): Promise<ArrayBuffer> {
    const voice = voiceId ?? DEFAULT_KOKORO_VOICE;
    const key = this.key(text, voiceId);
    const existing = this.rendered.get(key);
    if (existing) {
      // Asked for ahead and still waiting its turn: it is wanted now.
      if (urgency === "now") this.queue.promote(key);
      return existing;
    }

    const pending = this.queue.add(key, urgency, (turn) =>
      invoke<ArrayBuffer>("kokoro_synthesize", {
        text,
        voice,
        // Speed is applied on playback rather than baked into the audio, so
        // moving the slider does not mean waiting for the verse to render again.
        speed: 1,
        // So the voice can stop a render the reader has since left (RenderQueue).
        turn,
      }),
    );
    // A failure must not be remembered, or the same verse would never be
    // retried for the rest of the session.
    pending.catch(() => {
      if (this.rendered.get(key) === pending) this.rendered.delete(key);
    });
    this.rendered.set(key, pending);
    // Only the passage playing and the one after it are worth holding, a few
    // pieces each (see `splitForQuickStart`); a whole passage is about a
    // megabyte.
    while (this.rendered.size > 12) {
      const oldest = this.rendered.keys().next().value;
      if (oldest === undefined) break;
      this.rendered.delete(oldest);
    }
    return pending;
  }

  /** Let go of renders not yet sent that are not in `keep`: what the reader
   * has moved away from should not stand between them and what they moved
   * to. Forgotten at once, so asking for one again renders it afresh. */
  private dropWaiting(keep: ReadonlySet<string> = new Set()) {
    for (const key of this.queue.drop(keep)) this.rendered.delete(key);
  }

  prefetch(text: string, opts: SpeakOptions): void {
    // In the pieces `speak` will ask for, so it finds them ready.
    for (const piece of splitForQuickStart(text)) void this.render(piece, opts.voiceId, "ahead").catch(() => undefined);
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
    // silence under a player that says it is reading. So a verse is read in
    // pieces (`splitForQuickStart`): the first sentence is short enough to
    // arrive quickly, and the rest of the verse renders while it plays. Breaks
    // fall where the punctuation already puts them, never inside a clause. A
    // verse asked for ahead was asked for in the same pieces, and is found
    // ready -- or, if still waiting its turn, is moved up and read the quick
    // way all the same.
    const pieces = splitForQuickStart(text);
    // Whatever else was waiting for the voice was for a passage the reader has
    // left; the passage after this one is asked for again as this one starts.
    this.dropWaiting(new Set(pieces.map((piece) => this.key(piece, opts.voiceId))));
    // All asked for at once, in order: the second piece renders while the
    // first plays, and both go before anything asked for ahead.
    const renders = pieces.map((piece) => this.render(piece, opts.voiceId, "now"));

    void (async () => {
      try {
        for (let i = 0; i < pieces.length; i++) {
          const buffer = await renders[i];
          if (generation !== this.generation) return;
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
    this.dropWaiting();
  }
}

/** Verses shorter than this render quickly enough that splitting one would
 * buy a fraction of a second and cost a seam. */
const WHOLE_VERSE_CHARS = 70;
/** A first piece shorter than this is a fragment -- "Selah.", "And he said." --
 * and the wait moves on to the next break instead. */
const MIN_FIRST_PIECE_CHARS = 25;
/** The pieces after the first are gathered up to about this length. A render
 * under way cannot be stopped (src-tauri/src/tts.rs renders a piece in one
 * call of the model), so this is the most a reader who jumps elsewhere has to
 * wait out -- where a whole paragraph, rendered as one, was seconds of it. */
const REST_PIECE_CHARS = 200;

/**
 * A passage cut into the pieces it is rendered in: the first sentence on its
 * own, and the rest in pieces of whole sentences up to `REST_PIECE_CHARS` long
 * -- or the whole passage when it is short enough that nothing is gained.
 *
 * The first piece is short so that it arrives quickly, and the rest renders
 * while it plays. The rest is cut small so that the render under way, when
 * the reader moves on, is soon over. The cuts are made the same way whether a
 * passage is wanted now or asked for ahead, so a passage asked for ahead is
 * found ready, piece for piece.
 *
 * Only sentence punctuation is a break: Kokoro shapes each piece as a complete
 * utterance, so cutting inside a clause would put a full stop in the middle of
 * one. A semicolon or colon is where the King James pauses too, and the old
 * printers' full stop and dash, "is this.—“There is nothing…”", is a break
 * like a full stop and a space: without it, that sentence and the one it
 * introduced were one first piece of 391 characters, and the reader who had
 * just pressed play sat through its render. A stretch with no break within
 * the limit runs on to the next one.
 */
export function splitForQuickStart(text: string): string[] {
  if (text.length <= WHOLE_VERSE_CHARS) return [text];
  const breaks: number[] = [];
  for (const match of text.matchAll(/[.;:!?]["'’”)\]]*(?:\s+|[—–]+\s*(?=["'“‘(]?[A-Z]))/g)) {
    const end = match.index + match[0].length;
    if (end < text.length) breaks.push(end);
  }
  const first = breaks.find((end) => end >= MIN_FIRST_PIECE_CHARS);
  if (first == null) return [text];
  const pieces = [text.slice(0, first).trimEnd()];
  let start = first;
  let cut = first;
  for (const end of breaks) {
    if (end <= first) continue;
    // Past the limit with a break in hand: the piece ends at that break.
    if (end - start > REST_PIECE_CHARS && cut > start) {
      pieces.push(text.slice(start, cut).trimEnd());
      start = cut;
    }
    cut = end;
  }
  // The last break may leave too long a piece before the end; cut there too.
  if (text.length - start > REST_PIECE_CHARS && cut > start) {
    pieces.push(text.slice(start, cut).trimEnd());
    start = cut;
  }
  pieces.push(text.slice(start));
  return pieces;
}

export const kokoroEngine = new KokoroEngine();

/** Registry of available engines, keyed by id. Cloud engines get added here later. */
export const ttsEngines: Record<string, TtsEngine> = {
  webspeech: webSpeechEngine,
  kokoro: kokoroEngine,
};
