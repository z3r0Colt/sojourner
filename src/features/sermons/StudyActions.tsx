import { Mic } from "lucide-react";
import { IconButton } from "../../components/ui/Button";
import { PopoverItem } from "../../components/ui/Popover";
import { usePaneOptional } from "../../workspace/PaneContext";
import { sendToSermon, type SermonItem } from "./sendToSermon";

/**
 * "Send to sermon", in the two shapes the study panes need: a small icon
 * button beside a commentary entry or a confession section, and a menu row
 * in the verse menu. The item is built lazily, so a list of a hundred
 * entries costs nothing until one is actually sent.
 */

export function SendToSermonButton({
  item,
  label = "Send to sermon",
  className,
  size = "sm",
}: {
  item: () => SermonItem | null;
  label?: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const pane = usePaneOptional();
  return (
    <IconButton
      icon={Mic}
      label={label}
      size={size}
      className={className}
      onClick={(e) => {
        e.stopPropagation();
        const built = item();
        if (built) sendToSermon(built, { from: pane?.id });
      }}
    />
  );
}

export function SendToSermonMenuItem({ item, onDone }: { item: () => SermonItem | null; onDone?: () => void }) {
  const pane = usePaneOptional();
  return (
    <PopoverItem
      onClick={() => {
        const built = item();
        if (built) sendToSermon(built, { from: pane?.id });
        onDone?.();
      }}
    >
      <Mic className="h-4 w-4 text-ink-3" aria-hidden="true" /> Send to sermon
    </PopoverItem>
  );
}
