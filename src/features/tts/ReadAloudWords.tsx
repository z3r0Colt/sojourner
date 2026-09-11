import { useEffect, useRef } from "react";
import { useTtsStore } from "../../state/ttsStore";
import { tokenizeWords } from "./textUtils";

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
  const activeRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (active && autoScroll && activeRef.current) {
      activeRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
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

  return <span className={className}>{parts}</span>;
}
