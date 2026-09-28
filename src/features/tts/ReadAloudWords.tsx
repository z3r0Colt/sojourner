import { useEffect, useRef } from "react";
import { useTtsStore, type TtsHighlightStyle } from "../../state/ttsStore";
import { tokenizeWords } from "./textUtils";
import { ttsEngines } from "./ttsEngine";

/**
 * Renders `text` as plain content, UNLESS this exact segment is the one
 * currently being read aloud ( `active`), in which case it renders the text
 * as word spans with the currently-spoken word highlighted. Fully
 * React-controlled (no imperative DOM surgery), so it's safe to drop into
 * any existing rendering path without fighting React's reconciliation.
 */
export function ReadAloudWords({ text, active, className }: { text: string; active: boolean; className?: string }) {
  const currentWordIndex = useTtsStore((s) => s.currentWordIndex);
  const highlightColor = useTtsStore((s) => s.highlightColor);
  const highlightStyle = useTtsStore((s) => s.highlightStyle);
  const autoScroll = useTtsStore((s) => s.autoScroll);
  // The neural voice hands back finished audio and never says which word it
  // is on, so there is no word to light up. Left at that, a commentary
  // paragraph or a memory verse being read looked exactly like one that was
  // not: the passage itself is marked instead, softly.
  const followsWords = useTtsStore((s) => ttsEngines[s.engineId]?.reportsWordBoundaries !== false);
  const activeRef = useRef<HTMLSpanElement | null>(null);
  const containerRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!active || !autoScroll) return;
    // A voice that reports word boundaries gets followed word by word. The
    // neural voice reports none -- it returns finished audio and nothing else
    // -- so there is no word to scroll to and the verse itself is the target.
    // Without this fallback the page simply stops following along.
    const target = activeRef.current ?? containerRef.current;
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [active, currentWordIndex, autoScroll]);

  if (!active) return <>{text}</>;

  const tokens = tokenizeWords(text);
  const style: React.CSSProperties =
    highlightStyle === "background"
      ? { backgroundColor: highlightColor, borderRadius: 2, padding: "0 1px" }
      : highlightStyle === "underline"
        ? { textDecoration: "underline", textDecorationColor: highlightColor, textDecorationThickness: 2 }
        : { fontWeight: 700, backgroundColor: `${highlightColor}55` };

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  tokens.forEach((tok, i) => {
    if (tok.start > cursor) parts.push(text.slice(cursor, tok.start));
    const isActive = i === currentWordIndex;
    parts.push(
      <span key={i} ref={isActive ? activeRef : undefined} style={isActive ? style : undefined}>
        {tok.text}
      </span>,
    );
    cursor = tok.end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));

  const passageStyle: React.CSSProperties | undefined = followsWords ? undefined : passageMarkStyle(highlightColor, highlightStyle);

  return (
    <span ref={containerRef} className={className} style={passageStyle}>
      {parts}
    </span>
  );
}

/** How a passage being read is marked when there is no word to mark: a soft
 * wash of the reader's highlight colour, or an underline if that is their
 * style. Shared with the other places a passage is marked (a memory card's
 * verse, a commentary entry). */
export function passageMarkStyle(highlightColor: string, highlightStyle: TtsHighlightStyle): React.CSSProperties {
  return highlightStyle === "underline"
    ? { textDecoration: "underline", textDecorationColor: highlightColor, textDecorationThickness: 2 }
    : { backgroundColor: `${highlightColor}40`, borderRadius: 2, boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" };
}
