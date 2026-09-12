import { Lightbulb, Mic } from "lucide-react";
import { IconButton } from "../../components/ui/Button";
import { PopoverItem } from "../../components/ui/Popover";
import { usePaneOptional } from "../../workspace/PaneContext";
import { sendToSermon, type SermonItem } from "./sendToSermon";
import { captureIllustration } from "./illustrationCapture";
import { htmlToText } from "./excerpt";

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

/** "Save as illustration": the same item, kept in the library instead of
 * dropped in a manuscript. A quotation from a book or a confession is
 * saved as a quotation; anything else as an illustration. */
export function SaveAsIllustrationButton({
  item,
  label = "Save as illustration",
  className,
  size = "sm",
}: {
  item: () => SermonItem | null;
  label?: string;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <IconButton
      icon={Lightbulb}
      label={label}
      size={size}
      className={className}
      onClick={(e) => {
        e.stopPropagation();
        const built = item();
        if (!built) return;
        captureIllustration({
          title: built.label.slice(0, 80),
          body: excerptToHtml(built.excerpt),
          sourceLabel: built.label || null,
          sourceRef: built.refId,
          kind: built.kind === "commentary" || built.kind === "confession" || built.kind === "resource" ? "quote" : "illustration",
        });
      }}
    />
  );
}

/** Both study actions together, from one item builder. */
export function StudyActions({ item, what, size = "sm" }: { item: () => SermonItem | null; what: string; size?: "sm" | "md" }) {
  return (
    <>
      <SendToSermonButton item={item} label={`Send ${what} to the sermon`} size={size} />
      <SaveAsIllustrationButton item={item} label={`Save ${what} as an illustration`} size={size} />
    </>
  );
}

/** The library stores prose as editor HTML, so a plain-text excerpt becomes
 * paragraphs rather than one run with the line breaks lost. */
function excerptToHtml(excerpt: string | null): string {
  if (!excerpt) return "";
  const escape = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const text = excerpt.includes("<") ? htmlToText(excerpt) : excerpt;
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escape(p.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");
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
