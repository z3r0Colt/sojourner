import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { Volume2 } from "lucide-react";
import { useTtsStore, type TtsSegment } from "../../state/ttsStore";
import { IconButton } from "../../components/ui/Button";
import { usePaneOptional } from "../../workspace/PaneContext";
import { ttsEngines } from "../tts/ttsEngine";
import { locatePieces, speechPieceId, spokenEntries, type SpokenEntryRanges } from "./commentarySpeech";

/**
 * "Read aloud from here": reads `segments` from `index`, moving the reading
 * already under way in this pane when it is this one. Unlike a click on a
 * paragraph, which only moves a paused reader's place, this is someone
 * asking to hear it, so a paused player is set going again.
 */
function readAloudFrom(title: string, segments: TtsSegment[], index: number, paneId: string | null) {
  useTtsStore.getState().readFrom(title, "commentary", segments, index, { paneId });
  const after = useTtsStore.getState();
  if (after.isPaused) after.resume();
}

/** The small speaker beside a paragraph: read from this paragraph on, whether
 * or not anything is playing yet. */
export function ReadFromHereButton({ title, segments, index, className }: { title: string; segments: TtsSegment[]; index: number; className?: string }) {
  const paneId = usePaneOptional()?.id ?? null;
  return (
    <IconButton
      icon={Volume2}
      label="Read aloud from here"
      size="sm"
      className={className}
      onClick={(e) => {
        // The paragraph's own click moves the reading too; one move is enough.
        e.stopPropagation();
        readAloudFrom(title, segments, index, paneId);
      }}
    />
  );
}

/** The entry being read: which it is, the pieces the voice was handed for
 * it, and where the first of them is in the reading. */
export interface SpeakingEntry {
  entryId: number;
  pieces: string[];
  first: number;
}

/** The names the passage and the word being read are marked under (CSS
 * Custom Highlight API), and the style sheet that colours them. */
const PIECE_HIGHLIGHT = "commentary-speaking";
const WORD_HIGHLIGHT = "commentary-speaking-word";
const STYLE_ID = "commentary-speaking-style";

/**
 * Marks the piece being read in an entry shown as its HTML -- italics, links
 * and all -- and the word being said, with a voice that says which it is.
 *
 * The entry used to be swapped for the plain pieces while it was read, so the
 * word could be lit: its italic lemmas and its Scripture links went plain and
 * dead for as long as the voice was in it, and the paragraph reflowed as the
 * reading reached it and again as it left. Now each piece is found in the
 * HTML's own text (`locatePieces`) and marked there as a range, which changes
 * nothing on the page but the colour behind the words. A click in the entry
 * still reads from the sentence clicked (`pieceIndexAt`).
 */
export function useSpokenPieces(ref: RefObject<HTMLElement | null>, html: string, speaking: SpeakingEntry | undefined) {
  const [located, setLocated] = useState<SpokenEntryRanges | null>(null);
  const entryId = speaking?.entryId;
  const pieces = speaking?.pieces;
  const first = speaking?.first;
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || entryId == null || !pieces || first == null) {
      setLocated(null);
      return;
    }
    const entry: SpokenEntryRanges = { ...locatePieces(root, pieces), first };
    spokenEntries.set(root, entry);
    setLocated(entry);
    return () => {
      spokenEntries.delete(root);
    };
  }, [ref, html, entryId, pieces, first]);

  const piece = useTtsStore((s) => {
    if (!located || entryId == null || !pieces || !s.isPlaying) return -1;
    const id = s.segments[s.currentSegmentIndex]?.id;
    return pieces.findIndex((_, k) => speechPieceId(entryId, k) === id);
  });
  const wordIndex = useTtsStore((s) => s.currentWordIndex);
  const followsWords = useTtsStore((s) => ttsEngines[s.engineId]?.reportsWordBoundaries !== false);
  const autoScroll = useTtsStore((s) => s.autoScroll);
  const highlightColor = useTtsStore((s) => s.highlightColor);
  const highlightStyle = useTtsStore((s) => s.highlightStyle);

  useEffect(() => {
    if (!located || piece < 0) return;
    ensureHighlightStyle(highlightColor, highlightStyle);
    const registry = typeof CSS !== "undefined" ? CSS.highlights : undefined;
    const range = located.ranges[piece];
    const word = followsWords && wordIndex >= 0 ? located.words[piece]?.[wordIndex] : null;
    if (registry && range) {
      registry.set(PIECE_HIGHLIGHT, new Highlight(range));
      if (word) registry.set(WORD_HIGHLIGHT, new Highlight(word));
      else registry.delete(WORD_HIGHLIGHT);
    }
    if (autoScroll) {
      // As the word spans did: the word being said kept in the middle of the
      // pane, or with no word to go by, the start of the passage.
      const target = (word ?? range)?.startContainer.parentElement;
      target?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    return () => {
      registry?.delete(PIECE_HIGHLIGHT);
      registry?.delete(WORD_HIGHLIGHT);
    };
  }, [located, piece, wordIndex, followsWords, autoScroll, highlightColor, highlightStyle]);
}

/** The colours of the marks, in the reader's highlight colour and style. */
function ensureHighlightStyle(color: string, style: string) {
  let sheet = document.getElementById(STYLE_ID);
  if (!sheet) {
    sheet = document.createElement("style");
    sheet.id = STYLE_ID;
    document.head.appendChild(sheet);
  }
  const css =
    style === "underline"
      ? `::highlight(${PIECE_HIGHLIGHT}) { text-decoration: underline; text-decoration-color: ${color}; text-decoration-thickness: 2px; }
::highlight(${WORD_HIGHLIGHT}) { background-color: ${color}55; }`
      : `::highlight(${PIECE_HIGHLIGHT}) { background-color: ${color}40; }
::highlight(${WORD_HIGHLIGHT}) { background-color: ${color}; color: #1c1917; }`;
  if (sheet.textContent !== css) sheet.textContent = css;
}
