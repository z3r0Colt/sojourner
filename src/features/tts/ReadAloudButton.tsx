import { Square, Volume2 } from "lucide-react";
import { useTtsStore, type TtsSegment, type TtsSourceKind } from "../../state/ttsStore";
import { Button, IconButton } from "../../components/ui/Button";
import { usePaneOptional } from "../../workspace/PaneContext";

export function ReadAloudButton({
  title,
  sourceKind,
  segments = [],
  startIndex,
  more,
  onStart,
  iconOnly,
  size = "sm",
  sameTitleForMany,
}: {
  title: string;
  sourceKind: TtsSourceKind;
  /** What to read. May be left out when `onStart` gathers it on the click. */
  segments?: TtsSegment[];
  /** Where in `segments` to begin -- the page or passage on screen, say --
   * rather than at the top of a book the reader is halfway through. */
  startIndex?: number;
  /** The source is still finding more of this reading and will hand it over
   * with `appendSegments`; the reading waits for it rather than ending. */
  more?: boolean;
  /** Used instead of starting `segments`, for a reader that works out what to
   * read only when asked (an EPUB collecting the page on screen). It should
   * start the reading under this same `title`, so the button can tell the
   * reading is its own and offer to stop it. */
  onStart?: () => void;
  /** Icon-only button for crowded toolbars. */
  iconOnly?: boolean;
  size?: "sm" | "md";
  /** The title is shared by other readings than this one -- "Memory: Where
   * is this?" names every card asked that way, and cannot say which without
   * giving the answer away -- so a reading under it is this button's only
   * if it holds this button's passages. */
  sameTitleForMany?: boolean;
}) {
  const paneId = usePaneOptional()?.id ?? null;
  const isPlaying = useTtsStore((s) => s.isPlaying);
  const currentTitle = useTtsStore((s) => s.title);
  const currentPaneId = useTtsStore((s) => s.paneId);
  const start = useTtsStore((s) => s.start);
  const stop = useTtsStore((s) => s.stop);
  const holdsOurs = useTtsStore((s) => {
    if (!sameTitleForMany) return true;
    const ids = new Set(segments.map((segment) => segment.id));
    return s.segments.some((segment) => ids.has(segment.id));
  });
  const isThisPlaying = isPlaying && currentTitle === title && currentPaneId === paneId && holdsOurs;
  // A button that gathers its passages on the click has none to show until
  // then, and is not "empty" for it.
  const empty = !onStart && segments.length === 0;
  const label = empty ? "Nothing here to read aloud" : isThisPlaying ? "Stop reading" : "Read aloud";
  const onClick = () => {
    if (isThisPlaying) stop();
    else if (onStart) onStart();
    else start(title, sourceKind, segments, { paneId, startIndex, more });
  };

  if (iconOnly) {
    return (
      <IconButton
        icon={isThisPlaying ? Square : Volume2}
        label={label}
        size={size}
        active={isThisPlaying}
        disabled={empty}
        onClick={onClick}
      />
    );
  }

  return (
    <Button
      size={size}
      variant="ghost"
      icon={isThisPlaying ? Square : Volume2}
      active={isThisPlaying}
      disabled={empty}
      title={label}
      onClick={onClick}
    >
      {isThisPlaying ? "Stop" : "Read aloud"}
    </Button>
  );
}
