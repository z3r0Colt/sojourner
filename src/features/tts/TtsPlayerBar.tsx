import { useEffect, useState } from "react";
import { Pause, Play, Settings2, SkipBack, SkipForward, X } from "lucide-react";
import { useTtsStore } from "../../state/ttsStore";
import { ttsEngines, type TtsVoice } from "./ttsEngine";
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

  const [voices, setVoices] = useState<TtsVoice[]>([]);
  useEffect(() => {
    ttsEngines[engineId]?.listVoices().then(setVoices);
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

      <label className="mb-1 block text-xs font-medium text-ink-3">Voice</label>
      <select value={voiceId ?? ""} onChange={(e) => setVoiceId(e.target.value || null)} className={cx(selectClass, "mb-3 w-full")}>
        <option value="">System default</option>
        {voices.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name} ({v.lang})
          </option>
        ))}
      </select>

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
      <p className="mt-3 text-xs text-ink-3">Uses the Windows voices installed on this device. No audio leaves the computer.</p>
    </div>
  );
}

export function TtsPlayerBar() {
  const title = useTtsStore((s) => s.title);
  const segments = useTtsStore((s) => s.segments);
  const currentSegmentIndex = useTtsStore((s) => s.currentSegmentIndex);
  const isPlaying = useTtsStore((s) => s.isPlaying);
  const isPaused = useTtsStore((s) => s.isPaused);
  const error = useTtsStore((s) => s.error);
  const rate = useTtsStore((s) => s.rate);
  const pause = useTtsStore((s) => s.pause);
  const resume = useTtsStore((s) => s.resume);
  const stop = useTtsStore((s) => s.stop);
  const next = useTtsStore((s) => s.next);
  const prev = useTtsStore((s) => s.prev);

  if (segments.length === 0) return null;

  const currentLabel = segments[currentSegmentIndex]?.label;
  const playing = isPlaying && !isPaused;

  return (
    <div className="shrink-0 border-t border-line bg-surface px-4 py-2">
      <div className="mx-auto flex max-w-3xl items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-ink">{title}</div>
          <div className="truncate text-xs text-ink-3">
            {currentLabel ? `${currentLabel} · ` : ""}
            {currentSegmentIndex + 1} of {segments.length}
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
