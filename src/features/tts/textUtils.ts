export interface TtsWordToken {
  text: string;
  start: number; // char offset into the owning segment's text
  end: number;
}

/** Splits text into whitespace-delimited word tokens with their char offsets. */
export function tokenizeWords(text: string): TtsWordToken[] {
  const tokens: TtsWordToken[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return tokens;
}

/** Finds the index of the word token whose [start,end) range contains charIndex. */
export function findWordIndexAtChar(tokens: TtsWordToken[], charIndex: number): number {
  for (let i = 0; i < tokens.length; i++) {
    if (charIndex < tokens[i].end) return i;
  }
  return tokens.length > 0 ? tokens.length - 1 : -1;
}

/** Splits a large blob of plain text (e.g. a resource's extracted_text) into
 * readable paragraph-sized segments for TTS, dropping empty lines. */
export function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0);
}
