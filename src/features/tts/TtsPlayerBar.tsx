import { useEffect, useState } from "react";
import { useTtsStore } from "../../state/ttsStore";
import { ttsEngines, type TtsVoice } from "./ttsEngine";

const HIGHLIGHT_COLORS = ["#fde047", "#86efac", "#93c5fd", "#f9a8d4", "#fdba74"];

function TtsSettingsPopover({ onClose }: { onClose: () => void }) {
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
    <div
      className="absolute bottom-full right-0 mb-2 w-80 rounded-lg border border-gray-200 bg-white p-3 shadow-xl dark:border-gray-700 dark:bg-gray-900"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Read Aloud settings</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" title="Close" aria-label="Close">
          ✕
        </button>
      </div>

      <label className="mb-1 block text-xs font-medium text-gray-500">Engine</label>
      <select
        value={engineId}
        disabled
        className="mb-3 w-full rounded border border-gray-300 bg-gray-50 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
      >
        <option value="webspeech">Windows voices (offline)</option>
      </select>
      <p className="-mt-2 mb-3 text-xs text-gray-400">
        Cloud voices (ElevenLabs, Azure, OpenAI) coming soon — add an API key here once available.
      </p>

      <label className="mb-1 block text-xs font-medium text-gray-500">Voice</label>
      <select
        value={voiceId ?? ""}
        onChange={(e) => setVoiceId(e.target.value || null)}
        className="mb-3 w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-950"
      >
        <option value="">System default</option>
        {voices.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name} ({v.lang})
          </option>
        ))}
      </select>

      <label className="mb-1 flex items-center justify-between text-xs font-medium text-gray-500">
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
        className="mb-3 w-full"
      />

      <label className="mb-1 flex items-center justify-between text-xs font-medium text-gray-500">
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
        className="mb-3 w-full"
      />

      <label className="mb-1 flex items-center justify-between text-xs font-medium text-gray-500">
        <span>Volume</span>
        <span>{Math.round(volume * 100)}%</span>
      </label>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={volume}
        onChange={(e) => setVolume(Number(e.target.value))}
        className="mb-3 w-full"
      />

      <label className="mb-1 block text-xs font-medium text-gray-500">Highlight color</label>
      <div className="mb-3 flex gap-2">
        {HIGHLIGHT_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setHighlightColor(c)}
            className={`h-6 w-6 rounded-full border-2 ${highlightColor === c ? "border-blue-500" : "border-transparent"}`}
            style={{ backgroundColor: c }}
            title={c}
          />
        ))}
      </div>

      <label className="mb-1 block text-xs font-medium text-gray-500">Highlight style</label>
      <div className="mb-3 flex gap-1">
        {(["background", "underline", "bold"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setHighlightStyle(s)}
            className={`flex-1 rounded border px-2 py-1 text-xs capitalize ${
              highlightStyle === s
                ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300"
                : "border-gray-300 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <label className="flex items-center gap-2 text-xs font-medium text-gray-500">
        <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} />
        Auto-scroll to the word being read
      </label>
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
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (segments.length === 0) return null;

  const currentLabel = segments[currentSegmentIndex]?.label;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 py-2 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
      <div className="mx-auto flex max-w-3xl items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{title}</div>
          <div className="truncate text-xs text-gray-400">
            {currentLabel ? `${currentLabel} — ` : ""}
            {currentSegmentIndex + 1} / {segments.length}
            {error && <span className="text-red-500"> — {error}</span>}
          </div>
        </div>

        <button
          onClick={prev}
          disabled={currentSegmentIndex === 0}
          className="rounded px-2 py-1 text-lg hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-800"
          title="Previous"
          aria-label="Previous"
        >
          ⏮
        </button>
        <button
          onClick={() => (isPaused ? resume() : pause())}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
        >
          {isPaused || !isPlaying ? "▶ Play" : "⏸ Pause"}
        </button>
        <button
          onClick={next}
          disabled={currentSegmentIndex >= segments.length - 1}
          className="rounded px-2 py-1 text-lg hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-800"
          title="Next"
          aria-label="Next"
        >
          ⏭
        </button>

        <div className="relative">
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
            title="Voice, speed & highlight settings"
          >
            ⚙ {rate.toFixed(2)}x
          </button>
          {settingsOpen && <TtsSettingsPopover onClose={() => setSettingsOpen(false)} />}
        </div>

        <button
          onClick={stop}
          className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
          title="Stop"
          aria-label="Stop reading aloud"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
