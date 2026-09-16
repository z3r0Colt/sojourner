import { useEffect, useState } from "react";
import { Moon, Pause, Play, Settings2, SkipBack, SkipForward, X } from "lucide-react";
import { SLEEP_MINUTE_OPTIONS, useTtsStore } from "../../state/ttsStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { ttsEngines, type TtsEngine, type TtsVoice } from "./ttsEngine";
import { PronunciationOverrides } from "./PronunciationOverrides";
import { IconButton, Button } from "../../components/ui/Button";
import { Popover } from "../../components/ui/Popover";
import { selectClass, checkboxClass, cx } from "../../components/ui/classes";

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
  const paneLabel = useWorkspaceStore((s) => {
    if (s.panes.length < 2 || paneId == null) return null;
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

  return (
    <div className="shrink-0 border-t border-line bg-surface px-4 py-2">
      <div className="mx-auto flex max-w-3xl items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-ink">{title}</div>
          <div className="truncate text-xs text-ink-3">
            {paneLabel ? `${paneLabel} · ` : ""}
            {continuing ? (
              "Continuing into the next chapter…"
            ) : waiting ? (
              <>
                {currentLabel ? `${currentLabel} · ` : ""}
                Preparing the voice…
              </>
            ) : (
              <>
                {currentLabel ? `${currentLabel} · ` : ""}
                {currentSegmentIndex + 1} of {segments.length}
              </>
            )}
            {sleepLabel && (
              <span className="ml-2 inline-flex items-center gap-1 text-ink-2" title="Sleep timer: reading stops when this reaches zero">
                <Moon className="h-3 w-3" aria-hidden="true" />
                <span aria-label={`Sleep timer, ${sleepLabel} left`}>{sleepLabel}</span>
              </span>
            )}
            {error && <span className="text-danger"> · {error}</span>}
          </div>
        </div>

        <IconButton icon={SkipBack} label="Previous" onClick={prev} disabled={currentSegmentIndex === 0} />
        <Button variant="primary" icon={playing ? Pause : Play} onClick={() => (playing ? pause() : resume())} className="w-24">
          {playing ? "Pause" : "Play"}
        </Button>
        <IconButton icon={SkipForward} label="Next" onClick={next} disabled={currentSegmentIndex >= segments.length - 1} />

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
