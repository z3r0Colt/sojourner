import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Copy, Lightbulb, Mic, NotebookPen, StickyNote, Underline, Volume2, X } from "lucide-react";
import { useViewportClampedPosition } from "../../lib/useViewportClampedPosition";
import { HIGHLIGHT_COLORS, UNDERLINE_COLOR, highlightColorLabel, useHighlightLabels } from "./highlightColors";
import { IconButton } from "../../components/ui/Button";

/** Floats above a text selection: pick a highlight color, underline, add a
 * note, copy with the reference, or have the chapter read aloud from the
 * verse the selection starts in. Each color button is named by the reader's
 * label for it ("Promise (yellow)"). */
export function SelectionToolbar({
  x,
  y,
  flipY,
  onPickColor,
  onUnderline,
  onAddNote,
  onCopy,
  onSendToSermon,
  onSaveAsIllustration,
  onSaveAsIdea,
  onReadAloudFromHere,
  onClose,
}: {
  /** The middle of the selection's top edge, which the toolbar sits over. */
  x: number;
  y: number;
  /** The bottom of the selection: with no room over it, the toolbar drops
   * under it here rather than onto the words just selected. */
  flipY?: number;
  onPickColor: (color: string) => void;
  onUnderline: (color: string) => void;
  onAddNote: () => void;
  onCopy?: () => void;
  /** Drops the selected verses into the open sermon as a live passage block. */
  onSendToSermon?: () => void;
  /** Keeps the selected words in the illustrations library. */
  onSaveAsIllustration?: () => void;
  /** Starts a sermon idea from the selected verses. */
  onSaveAsIdea?: () => void;
  /** Reads the chapter aloud from the verse the selection starts in. */
  onReadAloudFromHere?: () => void;
  onClose: () => void;
}) {
  // Closes when the reader scrolls the text, rather than floating on over
  // whatever words scroll in under it; read-aloud following along leaves it
  // be, so "Read aloud from here" can be pressed while a reading plays. The
  // selection itself is left alone, still marked in the text; selecting
  // again brings the toolbar back. Escape closes it too, the same way.
  const at = useFollowSelection(x, y, flipY, onClose);
  const { ref, style } = useViewportClampedPosition<HTMLDivElement>(at.x, at.y, { align: "above-center", flipY: at.flipY, onDismiss: onClose, closeOnEscape: true });
  const [labels] = useHighlightLabels();

  // The toolbar acts on the selection, so it goes when the selection does:
  // a click elsewhere in the text, or the words being redrawn under it. Left
  // up, its buttons would highlight or copy words no longer shown selected.
  // Its own buttons keep the selection (they take no focus on press).
  const close = useRef(onClose);
  useLayoutEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    function onSelectionChange() {
      if (!hasSelection(document.getSelection())) close.current();
    }
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, []);

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Selection actions"
      className="z-40 flex items-center gap-1 rounded-lg border border-line bg-surface p-1.5 shadow-xl"
      style={style}
      onMouseDown={(e) => e.preventDefault()}
    >
      {HIGHLIGHT_COLORS.map((c) => {
        const name = `Highlight: ${highlightColorLabel(c, labels)}`;
        return (
          <button
            key={c.color}
            type="button"
            className="h-6 w-6 rounded-full border border-black/10 transition-transform hover:scale-110"
            style={{ backgroundColor: c.color }}
            title={name}
            aria-label={name}
            onClick={() => onPickColor(c.color)}
          />
        );
      })}
      <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
      <IconButton icon={Underline} label="Underline" size="sm" onClick={() => onUnderline(UNDERLINE_COLOR)} />
      <IconButton icon={StickyNote} label="Add note" size="sm" onClick={onAddNote} />
      {onCopy && <IconButton icon={Copy} label="Copy (in the format chosen in Settings)" size="sm" onClick={onCopy} />}
      {onReadAloudFromHere && <IconButton icon={Volume2} label="Read aloud from here" size="sm" onClick={onReadAloudFromHere} />}
      {onSendToSermon && <IconButton icon={Mic} label="Send to sermon" size="sm" onClick={onSendToSermon} />}
      {onSaveAsIllustration && <IconButton icon={Lightbulb} label="Save as illustration" size="sm" onClick={onSaveAsIllustration} />}
      {onSaveAsIdea && <IconButton icon={NotebookPen} label="Catch a sermon idea on these verses (Ctrl+Alt+I)" size="sm" onClick={onSaveAsIdea} />}
      <IconButton icon={X} label="Close" size="sm" onClick={onClose} />
    </div>
  );
}

/** Where the toolbar sits, kept over the selection as the text moves under it.
 *
 * Read-aloud scrolls the pane to follow the voice, and the toolbar is left up
 * through that (see above) -- but it stayed where it had opened on screen, and
 * as the words it belonged to rose away, it came to sit over the verse being
 * read. So on any scroll of the text holding the selection it moves by as much
 * as the selection has, and once the selection has gone out of the pane's
 * view it closes, as it would for the reader's own scrolling; the words stay
 * selected, and selecting again brings it back. The move is measured from the
 * selection's box when the toolbar opened, so a place the pane chose (over
 * the verse text of a selection dragged past its end) is kept. */
function useFollowSelection(x: number, y: number, flipY: number | undefined, onClose: () => void) {
  const [shift, setShift] = useState({ dx: 0, dy: 0 });
  const close = useRef(onClose);
  useLayoutEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    setShift({ dx: 0, dy: 0 });
    const selection = document.getSelection();
    if (!hasSelection(selection)) return;
    const range = selection!.getRangeAt(0);
    // (A range with no box to measure -- jsdom's -- leaves the toolbar put.)
    if (typeof range.getBoundingClientRect !== "function") return;
    const opened = range.getBoundingClientRect();
    let frame: number | null = null;
    function follow(e: Event) {
      const scroller = e.target;
      if (!(scroller instanceof Element) || !scroller.contains(range.commonAncestorContainer)) return;
      if (frame != null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        const current = document.getSelection();
        if (!hasSelection(current)) return;
        const now = current!.getRangeAt(0).getBoundingClientRect();
        const box = scroller.getBoundingClientRect();
        if (now.bottom < box.top || now.top > box.bottom) {
          close.current();
          return;
        }
        const dx = now.left - opened.left;
        const dy = now.top - opened.top;
        setShift((prev) => (prev.dx === dx && prev.dy === dy ? prev : { dx, dy }));
      });
    }
    window.addEventListener("scroll", follow, true);
    return () => {
      window.removeEventListener("scroll", follow, true);
      if (frame != null) cancelAnimationFrame(frame);
    };
  }, [x, y, flipY]);
  return { x: x + shift.dx, y: y + shift.dy, flipY: flipY == null ? undefined : flipY + shift.dy };
}

/** Whether there are words selected: something to highlight or copy. */
function hasSelection(selection: Pick<Selection, "rangeCount" | "isCollapsed"> | null): boolean {
  return !!selection && selection.rangeCount > 0 && !selection.isCollapsed;
}
