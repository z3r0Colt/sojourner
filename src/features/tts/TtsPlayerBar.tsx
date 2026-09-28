import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ListOrdered, Moon, Pause, Play, Settings2, SkipBack, SkipForward, X } from "lucide-react";
import { SLEEP_MINUTE_OPTIONS, useTtsStore } from "../../state/ttsStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { ttsEngines, type TtsEngine, type TtsVoice } from "./ttsEngine";
import { PronunciationOverrides } from "./PronunciationOverrides";
import { findPassages, fitAtWord, labelParts, passagePreview } from "./jumpList";
import { IconButton, Button } from "../../components/ui/Button";
import { Popover } from "../../components/ui/Popover";
import { selectClass, checkboxClass, inputSmClass, cx } from "../../components/ui/classes";

const HIGHLIGHT_COLORS = ["#fde047", "#86efac", "#93c5fd", "#f9a8d4", "#fdba74"];

function TtsSettings() {
  const engineId = useTtsStore((s) => s.engineId);
  const voiceId = useTtsStore((s) => s.voiceId);
  const rate = useTtsStore((s) => s.rate);
  const pitch = useTtsStore((s) => s.pitch);
  const volume = useTtsStore((s) => s.volume);
  const highlightColor = useTtsStore((s) => s.highlightColor);
  const highlightStyle = useTtsStore((s) => s.highlightStyle);
  const autoScroll = useTtsStore((s) => s.autoScroll);
  const setVoiceId = useTtsStore((s) => s.setVoiceId);
  const setRate = useTtsStore((s) => s.setRate);
  const setPitch = useTtsStore((s) => s.setPitch);
  const setVolume = useTtsStore((s) => s.setVolume);
  const setHighlightColor = useTtsStore((s) => s.setHighlightColor);
  const setHighlightStyle = useTtsStore((s) => s.setHighlightStyle);
  const setAutoScroll = useTtsStore((s) => s.setAutoScroll);
  const autoContinue = useTtsStore((s) => s.autoContinue);
  const setAutoContinue = useTtsStore((s) => s.setAutoContinue);
  const usePronunciations = useTtsStore((s) => s.usePronunciations);
  const setUsePronunciations = useTtsStore((s) => s.setUsePronunciations);
  const sleepMinutes = useTtsStore((s) => s.sleepMinutes);
  const setSleepMinutes = useTtsStore((s) => s.setSleepMinutes);
  const sourceKind = useTtsStore((s) => s.sourceKind);

  const setEngineId = useTtsStore((s) => s.setEngineId);

  // The neural voice only exists in a build whose model was fetched, so each
  // engine is asked whether it is really there before being offered.
  const [availableEngines, setAvailableEngines] = useState<TtsEngine[]>([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      const usable: TtsEngine[] = [];
      for (const candidate of Object.values(ttsEngines)) {
        const ok = candidate.probe ? await candidate.probe() : candidate.isAvailable();
        if (ok) usable.push(candidate);
      }
      if (alive) setAvailableEngines(usable);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const [voices, setVoices] = useState<TtsVoice[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => {
      ttsEngines[engineId]?.listVoices().then((list) => {
        if (alive) setVoices(list);
      });
    };
    load();
    // The list can arrive after this popover is already open, and a voice
    // installed in Windows while the app is running shows up the same way.
    const synth = window.speechSynthesis;
    synth?.addEventListener("voiceschanged", load);
    return () => {
      alive = false;
      synth?.removeEventListener("voiceschanged", load);
    };
  }, [engineId]);

  // Web Speech can't change rate/pitch mid-utterance (setRate/setPitch restart
  // the current segment), so dragging the slider live would restart speech on
  // every pixel of movement. Track a local value for smooth dragging and only
  // commit (and restart) once the drag/keypress is released.
  const [rateLocal, setRateLocal] = useState(rate);
  const [pitchLocal, setPitchLocal] = useState(pitch);
  useEffect(() => setRateLocal(rate), [rate]);
  useEffect(() => setPitchLocal(pitch), [pitch]);

  return (
    <div className="p-1">
      <h3 className="mb-3 text-sm font-semibold text-ink">Read aloud settings</h3>

      {availableEngines.length > 1 && (
        <>
          <label className="mb-1 block text-xs font-medium text-ink-3">Engine</label>
          <select value={engineId} onChange={(e) => setEngineId(e.target.value)} className={cx(selectClass, "mb-3 w-full")}>
            {availableEngines.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </>
      )}

      <label className="mb-1 block text-xs font-medium text-ink-3">Voice</label>
      <select value={voiceId ?? ""} onChange={(e) => setVoiceId(e.target.value || null)} className={cx(selectClass, "mb-1 w-full")}>
        <option value="">{engineId === "webspeech" ? "System default" : "Default voice"}</option>
        {voices.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name} ({v.lang})
          </option>
        ))}
      </select>
      <p className="mb-3 text-xs text-ink-3">
        {ttsEngines[engineId]?.reportsWordBoundaries === false
          ? "This voice follows along a verse at a time -- it returns finished audio, with no way to say which word it is on."
          : "Follows along word by word."}
      </p>

      <label className="mb-1 flex items-center justify-between text-xs font-medium text-ink-3">
        <span>Speed</span>
        <span>{rateLocal.toFixed(2)}x</span>
      </label>
      <input
        type="range"
        min={0.5}
        max={2.5}
        step={0.05}
        value={rateLocal}
        onChange={(e) => setRateLocal(Number(e.target.value))}
        onPointerUp={(e) => setRate(Number(e.currentTarget.value))}
        onKeyUp={(e) => setRate(Number(e.currentTarget.value))}
        className="mb-3 w-full accent-accent"
      />

      <label className="mb-1 flex items-center justify-between text-xs font-medium text-ink-3">
        <span>Pitch</span>
        <span>{pitchLocal.toFixed(1)}</span>
      </label>
      <input
        type="range"
        min={0.5}
        max={1.5}
        step={0.1}
        value={pitchLocal}
        onChange={(e) => setPitchLocal(Number(e.target.value))}
        onPointerUp={(e) => setPitch(Number(e.currentTarget.value))}
        onKeyUp={(e) => setPitch(Number(e.currentTarget.value))}
        className="mb-3 w-full accent-accent"
      />

      <label className="mb-1 flex items-center justify-between text-xs font-medium text-ink-3">
        <span>Volume</span>
        <span>{Math.round(volume * 100)}%</span>
      </label>
      <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="mb-3 w-full accent-accent" />

      <label className="mb-1 block text-xs font-medium text-ink-3">Highlight color</label>
      <div className="mb-3 flex gap-2">
        {HIGHLIGHT_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setHighlightColor(c)}
            className={cx("h-6 w-6 rounded-full border-2", highlightColor === c ? "border-accent" : "border-transparent")}
            style={{ backgroundColor: c }}
            title={c}
            aria-label={`Highlight color ${c}`}
          />
        ))}
      </div>

      <label className="mb-1 block text-xs font-medium text-ink-3">Highlight style</label>
      <div className="mb-3 flex gap-1">
        {(["background", "underline", "bold"] as const).map((s) => (
          <Button key={s} size="sm" active={highlightStyle === s} onClick={() => setHighlightStyle(s)} className="flex-1 capitalize">
            {s}
          </Button>
        ))}
      </div>

      <label className="flex items-center gap-2 text-sm text-ink-2">
        <input type="checkbox" className={checkboxClass} checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} />
        Auto-scroll to the word being read
      </label>

      <label className="mt-3 flex items-start gap-2 text-sm text-ink-2">
        <input type="checkbox" className={cx(checkboxClass, "mt-0.5")} checked={autoContinue} onChange={(e) => setAutoContinue(e.target.checked)} />
        <span>
          Continue into the next chapter
          <span className="block text-xs text-ink-3">Scripture only: when a chapter ends, turn the page and keep reading{sourceKind && sourceKind !== "scripture" ? " (not for what is playing now)" : ""}.</span>
        </span>
      </label>

      <label className="mt-3 flex items-start gap-2 text-sm text-ink-2">
        <input
          type="checkbox"
          className={cx(checkboxClass, "mt-0.5")}
          checked={usePronunciations}
          onChange={(e) => setUsePronunciations(e.target.checked)}
        />
        <span>
          Say biblical names properly
          <span className="block text-xs text-ink-3">
            {ttsEngines[engineId]?.readsRespellings === false
              ? "This voice knows the biblical names already; this applies the corrections you add below. Takes effect at the next verse."
              : "Uses the encyclopedia's pronunciations for names like Mephibosheth. Takes effect at the next verse."}
          </span>
        </span>
      </label>

      {usePronunciations && (
        <div className="mt-3">
          <PronunciationOverrides />
        </div>
      )}

      <label className="mb-1 mt-3 block text-xs font-medium text-ink-3" htmlFor="tts-sleep">
        Stop after
      </label>
      <select id="tts-sleep" value={sleepMinutes} onChange={(e) => setSleepMinutes(Number(e.target.value))} className={cx(selectClass, "w-full")}>
        {SLEEP_MINUTE_OPTIONS.map((m) => (
          <option key={m} value={m}>
            {m === 0 ? "Off" : `${m} minutes`}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-ink-3">The voice fades out over the last ten seconds, then reading stops.</p>

      <p className="mt-3 text-xs text-ink-3">
        {engineId === "webspeech" ? (
          <>
            Uses the Windows voices installed on this device. No audio leaves the computer. For better ones, install a natural
            voice in Windows Settings → Time &amp; language → Speech → Manage voices; it appears in this list on its own.
          </>
        ) : (
          <>The natural voice runs on this device, from the model that shipped with the app. No audio leaves the computer.</>
        )}
      </p>
    </div>
  );
}

/** One canvas for measuring text, made on first use. */
let measuringContext: CanvasRenderingContext2D | null | undefined;

/**
 * A name that gives way when its line is too narrow, cut after a whole word
 * with an ellipsis (`fitAtWord`) and so ending where its text does -- the
 * place after it (", paragraph 12") following straight on, not across the gap
 * a browser's ellipsis left. Refitted when the line changes width, and when
 * `refit` changes: what shares the line ("15 of 137") takes more or less room
 * as the reading goes on.
 *
 * Each fitting starts from the whole name, which the line shrinks to the room
 * there is; that width is what the name is fitted to, before anything is
 * painted.
 */
function FittedName({ name, refit }: { name: string; refit?: unknown }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [fitted, setFitted] = useState<string | null>(null);
  const [lineWidth, setLineWidth] = useState(0);

  useEffect(() => {
    const line = ref.current?.parentElement;
    if (!line || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setLineWidth(line.clientWidth));
    observer.observe(line);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => setFitted(null), [name, refit, lineWidth]);

  useLayoutEffect(() => {
    const span = ref.current;
    if (fitted != null || !span || span.scrollWidth <= span.clientWidth) return;
    if (measuringContext === undefined) measuringContext = document.createElement("canvas").getContext("2d");
    const context = measuringContext;
    if (!context) return;
    context.font = getComputedStyle(span).font;
    // A pixel's grace: the canvas and the page round differently.
    setFitted(fitAtWord(name, span.clientWidth - 1, (text) => context.measureText(text).width));
  });

  return (
    <span ref={ref} className="truncate">
      {fitted ?? name}
    </span>
  );
}

/**
 * A passage's label on one line, cut short in its name and never in its place
 * ("…an angry God, paragraph 11"), with the whole of it on hover.
 */
function PassageLabel({ label, className }: { label: string; className?: string }) {
  const { name, place } = labelParts(label);
  return (
    <span className={cx("flex min-w-0", className)} title={label}>
      <FittedName name={name} refit={place} />
      {place && <span className="shrink-0 whitespace-pre">{place}</span>}
    </span>
  );
}

/**
 * Every passage of the reading, to start from wherever the reader likes.
 *
 * Before this a reading could only be sat through from where it began -- and a
 * library book began at its first word, so the only way to chapter nine was
 * Next, pressed a few thousand times. A whole book is that many rows, so the
 * list is virtualized, and it opens on the passage being read.
 */
function JumpToPassage({ onDone }: { onDone: () => void }) {
  const segments = useTtsStore((s) => s.segments);
  const currentSegmentIndex = useTtsStore((s) => s.currentSegmentIndex);
  const more = useTtsStore((s) => s.more);
  const seek = useTtsStore((s) => s.seek);
  const [query, setQuery] = useState("");
  // Searching a book's worth of passages takes a moment; the box keeps up with
  // the typing and the list catches up behind it.
  const deferredQuery = useDeferredValue(query);
  const matches = useMemo(() => findPassages(segments, deferredQuery), [segments, deferredQuery]);
  const count = matches ? matches.length : segments.length;
  const passageAt = (row: number) => (matches ? matches[row] : row);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rowVirtualizer = useVirtualizer({
    count,
    getScrollElement: () => listRef.current,
    estimateSize: () => 44,
    overscan: 8,
    // Rows are measured from their ref callbacks, during React's commit,
    // where a synchronous re-render is an error (see ReadingPane).
    useFlushSync: false,
  });

  // Opened on the passage being read, so "a little further back" is a short
  // scroll rather than a trip from the top of the book. Only on opening:
  // following the reading as it moves would pull the list out from under a
  // reader who is scrolling it. The focus waits a frame, because the panel is
  // hidden until it has been placed and a hidden box cannot take the focus.
  useEffect(() => {
    rowVirtualizer.scrollToIndex(currentSegmentIndex, { align: "center" });
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const jump = (index: number) => {
    seek(index);
    onDone();
  };

  return (
    <div className="p-1">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">Jump to a passage</h3>
        <span className="text-xs text-ink-3">
          {segments.length} {segments.length === 1 ? "passage" : "passages"}
          {more ? " so far" : ""}
        </span>
      </div>
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          // Enter takes the first passage found, for a reader who typed the
          // words they were after and would rather not reach for the mouse.
          if (e.key !== "Enter") return;
          const first = findPassages(segments, query)?.[0];
          if (first != null) jump(first);
        }}
        placeholder="Find words or a heading"
        aria-label="Find a passage by its words"
        className={cx(inputSmClass, "mb-2 w-full")}
      />
      {count === 0 ? (
        <p className="px-1 py-3 text-center text-xs text-ink-3">Nothing in this reading matches “{deferredQuery.trim()}”.</p>
      ) : (
        <div ref={listRef} role="group" aria-label="Passages in this reading" className="overflow-y-auto overscroll-contain" style={{ maxHeight: "min(22rem, 55vh)" }}>
          <div style={{ position: "relative", height: rowVirtualizer.getTotalSize() }}>
            {rowVirtualizer.getVirtualItems().map((item) => {
              const index = passageAt(item.index);
              const segment = segments[index];
              if (!segment) return null;
              const current = index === currentSegmentIndex;
              return (
                <div
                  key={item.key}
                  ref={rowVirtualizer.measureElement}
                  data-index={item.index}
                  style={{ position: "absolute", top: 0, left: 0, right: 0, transform: `translateY(${item.start}px)` }}
                >
                  <button
                    type="button"
                    aria-current={current ? "true" : undefined}
                    onClick={() => jump(index)}
                    className={cx(
                      "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left",
                      current ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-hover hover:text-ink",
                    )}
                  >
                    <span className={cx("w-10 shrink-0 pt-px text-right text-xs tabular-nums", current ? "text-accent" : "text-ink-4")}>
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      {segment.label && <PassageLabel label={segment.label} className="text-xs font-semibold" />}
                      <span className={cx("block text-xs", segment.label ? "truncate" : "line-clamp-2")}>{passagePreview(segment.text)}</span>
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function TtsPlayerBar() {
  const title = useTtsStore((s) => s.title);
  const segments = useTtsStore((s) => s.segments);
  const currentSegmentIndex = useTtsStore((s) => s.currentSegmentIndex);
  const isPlaying = useTtsStore((s) => s.isPlaying);
  const isPaused = useTtsStore((s) => s.isPaused);
  const preparing = useTtsStore((s) => s.preparing);
  const error = useTtsStore((s) => s.error);
  const rate = useTtsStore((s) => s.rate);
  const pause = useTtsStore((s) => s.pause);
  const resume = useTtsStore((s) => s.resume);
  const stop = useTtsStore((s) => s.stop);
  const next = useTtsStore((s) => s.next);
  const prev = useTtsStore((s) => s.prev);
  const paneId = useTtsStore((s) => s.paneId);
  const sleepUntil = useTtsStore((s) => s.sleepUntil);
  const continuing = useTtsStore((s) => s.continuing);
  const more = useTtsStore((s) => s.more);
  const waitingForMore = useTtsStore((s) => s.waitingForMore);
  // Which pane is reading, when there is more than one to choose from on
  // screen. A maximized pane is the only one showing, and "Pane 2" above it
  // named something the reader could not see.
  const paneLabel = useWorkspaceStore((s) => {
    if (s.panes.length < 2 || paneId == null || s.maximizedPaneId != null) return null;
    const idx = s.panes.findIndex((p) => p.id === paneId);
    return idx >= 0 ? `Pane ${idx + 1}` : null;
  });

  // A verse the store asked for in advance is ready the moment the one before
  // it ends, so "Preparing the voice" would flash by unread between every
  // verse. It is only worth saying when there is really a wait.
  // Nor while paused: a paused player is not waiting on anything.
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    if (!preparing || isPaused) {
      setWaiting(false);
      return;
    }
    const t = window.setTimeout(() => setWaiting(true), 400);
    return () => window.clearTimeout(t);
  }, [preparing, isPaused]);

  // The sleep countdown ticks once a second while a timer is set.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (sleepUntil == null) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [sleepUntil]);

  if (segments.length === 0) return null;

  const currentLabel = segments[currentSegmentIndex]?.label;
  const playing = isPlaying && !isPaused;
  const sleepRemaining = sleepUntil != null ? Math.max(0, Math.round((sleepUntil - now) / 1000)) : null;
  const sleepLabel = sleepRemaining != null ? `${Math.floor(sleepRemaining / 60)}:${String(sleepRemaining % 60).padStart(2, "0")}` : null;

  // The status line in two parts. Where the reading is -- the pane, the
  // passage's label -- can be as long as a sermon's title, and is what gives
  // way when the bar is narrow. How far along it is, or what it is waiting
  // for, is never cut. One truncated line held all of it, with the error at
  // the end: a book's long label pushed "15 of 140" and any error clean out
  // of sight, and a reading stopped by a failure showed a Play button and no
  // reason. The error now has a line of its own.
  const showLabel = !continuing && !(waiting && waitingForMore);
  const where = [paneLabel, showLabel ? currentLabel : null].filter(Boolean).join(" · ");
  const status = continuing
    ? "Continuing into the next chapter…"
    : waiting && waitingForMore
      ? // The reader has caught up with a book still loading its later
        // sections. Not "Preparing the voice": the voice is ready and
        // waiting, and it is the text that is on its way.
        "Finding the next part…"
      : waiting
        ? "Preparing the voice…"
        : `${currentSegmentIndex + 1} of ${segments.length}${more ? " so far" : ""}`;
  const { name: whereName, place: wherePlace } = labelParts(where);

  return (
    <div className="shrink-0 border-t border-line bg-surface px-4 py-2">
      <div className="mx-auto flex max-w-3xl items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-ink" title={title}>
            {title}
          </div>
          <div className="flex min-w-0 items-center text-xs text-ink-3" title={where ? `${where} · ${status}` : status}>
            {where && (
              <>
                <FittedName name={whereName} refit={`${wherePlace}${status}${sleepLabel ?? ""}`} />
                <span className="shrink-0 whitespace-pre">{`${wherePlace} · `}</span>
              </>
            )}
            <span className="shrink-0 whitespace-nowrap">{status}</span>
            {sleepLabel && (
              <span className="ml-2 inline-flex shrink-0 items-center gap-1 text-ink-2" title="Sleep timer: reading stops when this reaches zero">
                <Moon className="h-3 w-3" aria-hidden="true" />
                <span aria-label={`Sleep timer, ${sleepLabel} left`}>{sleepLabel}</span>
              </span>
            )}
          </div>
          {error && (
            <div className="truncate text-xs text-danger" role="status" title={error}>
              {error}
            </div>
          )}
        </div>

        <IconButton icon={SkipBack} label="Previous" onClick={prev} disabled={currentSegmentIndex === 0} />
        <Button variant="primary" icon={playing ? Pause : Play} onClick={() => (playing ? pause() : resume())} className="w-24">
          {playing ? "Pause" : "Play"}
        </Button>
        {/* At the last passage found so far, Next still has somewhere to go
            while more of the book is loading: it waits there for it. */}
        <IconButton icon={SkipForward} label="Next" onClick={next} disabled={waitingForMore || (currentSegmentIndex >= segments.length - 1 && !more)} />

        <Popover
          width="w-96"
          trigger={({ toggle, open }) => (
            <IconButton icon={ListOrdered} label="Jump to a passage" active={open} onClick={toggle} disabled={continuing || segments.length < 2} />
          )}
        >
          {(close) => <JumpToPassage onDone={close} />}
        </Popover>

        <Popover
          width="w-80"
          trigger={({ toggle, open }) => (
            <Button variant="ghost" size="sm" icon={Settings2} active={open} onClick={toggle} title="Voice, speed, and highlight settings">
              {rate.toFixed(2)}x
            </Button>
          )}
        >
          <TtsSettings />
        </Popover>

        <IconButton icon={X} label="Stop reading aloud" onClick={stop} />
      </div>
    </div>
  );
}
