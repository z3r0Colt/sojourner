import { useTtsStore, type TtsSegment, type TtsSourceKind } from "../../state/ttsStore";

export function ReadAloudButton({
  title,
  sourceKind,
  segments,
  className,
  label = "🔊 Read Aloud",
}: {
  title: string;
  sourceKind: TtsSourceKind;
  segments: TtsSegment[];
  className?: string;
  label?: string;
}) {
  const isPlaying = useTtsStore((s) => s.isPlaying);
  const currentTitle = useTtsStore((s) => s.title);
  const start = useTtsStore((s) => s.start);
  const stop = useTtsStore((s) => s.stop);
  const isThisPlaying = isPlaying && currentTitle === title;

  return (
    <button
      className={
        className ??
        "rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
      }
      disabled={segments.length === 0}
      onClick={() => (isThisPlaying ? stop() : start(title, sourceKind, segments))}
      title={segments.length === 0 ? "Nothing here to read" : undefined}
    >
      {isThisPlaying ? "⏹ Stop reading" : label}
    </button>
  );
}
