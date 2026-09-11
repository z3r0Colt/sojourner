import { Square, Volume2 } from "lucide-react";
import { useTtsStore, type TtsSegment, type TtsSourceKind } from "../../state/ttsStore";
import { Button, IconButton } from "../../components/ui/Button";

export function ReadAloudButton({
  title,
  sourceKind,
  segments,
  iconOnly,
  size = "sm",
}: {
  title: string;
  sourceKind: TtsSourceKind;
  segments: TtsSegment[];
  /** Icon-only button for crowded toolbars. */
  iconOnly?: boolean;
  size?: "sm" | "md";
}) {
  const isPlaying = useTtsStore((s) => s.isPlaying);
  const currentTitle = useTtsStore((s) => s.title);
  const start = useTtsStore((s) => s.start);
  const stop = useTtsStore((s) => s.stop);
  const isThisPlaying = isPlaying && currentTitle === title;
  const label = segments.length === 0 ? "Nothing here to read aloud" : isThisPlaying ? "Stop reading" : "Read aloud";

  if (iconOnly) {
    return (
      <IconButton
        icon={isThisPlaying ? Square : Volume2}
        label={label}
        size={size}
        active={isThisPlaying}
        disabled={segments.length === 0}
        onClick={() => (isThisPlaying ? stop() : start(title, sourceKind, segments))}
      />
    );
  }

  return (
    <Button
      size={size}
      variant="ghost"
      icon={isThisPlaying ? Square : Volume2}
      active={isThisPlaying}
      disabled={segments.length === 0}
      title={label}
      onClick={() => (isThisPlaying ? stop() : start(title, sourceKind, segments))}
    >
      {isThisPlaying ? "Stop" : "Read aloud"}
    </Button>
  );
}
