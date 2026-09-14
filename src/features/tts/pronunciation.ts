// Saying the names properly.
//
// No synthesizer knows what to do with Mephibosheth, and a genealogy read by
// one is unlistenable. ISBE opens nearly every article with the 1915 edition's
// pronunciation respelling, and the importer now collects those into a
// `pronunciations` table (see CONTENT_MIGRATION_0015) -- some seven thousand
// words, which is most of the proper nouns in Scripture.
//
// This module turns a respelling into something a voice says correctly, and
// rewrites a verse on its way to the engine. The rewrite changes the string's
// length, so it also hands back a map from the spoken text to what is on
// screen: without that the read-along highlight would drift a little further
// out of step at every name.

import { api } from "../../api/client";

export const OVERRIDES_KEY = "tts.pronunciationOverrides";

/// Words ISBE has an article for that no voice needs help with. The encyclopedia
/// covers topics as well as names, and "Abomination" or "Redemption" respelled
/// is at best no improvement and at worst a distraction. Extend this by ear.
const SKIP = new Set([
  "ABOMINATION",
  "ADOPTION",
  "ANGEL",
  "APOSTLE",
  "ATONEMENT",
  "BAPTISM",
  "BEHOLD",
  "BLESSING",
  "COVENANT",
  "CREATION",
  "DISCIPLE",
  "FATHER",
  "GENTILE",
  "GLORY",
  "GOSPEL",
  "HEAVEN",
  "HOLY",
  "JESUS",
  "JUDGMENT",
  "KINGDOM",
  "LORD",
  "MERCY",
  "PROPHET",
  "REDEMPTION",
  "REPENTANCE",
  "RESURRECTION",
  "RIGHTEOUSNESS",
  "SABBATH",
  "SACRIFICE",
  "SALVATION",
  "SAVIOUR",
  "SAVIOR",
  "SPIRIT",
  "TEMPLE",
  "THEREFORE",
  "WISDOM",
  "WORSHIP",
]);

/**
 * ISBE's notation into something to hand a voice: "me-fib'-o-sheth" becomes
 * "me-fib-o-sheth". The apostrophe marks the stressed syllable and means
 * nothing to a synthesizer -- left in, it is read as punctuation -- while the
 * syllable hyphens are what carry the pronunciation.
 *
 * Kept small and alone because this is the knob to turn when a voice says
 * something oddly; every other part of the feature can stay put.
 */
export function toSpoken(respelling: string): string {
  const spoken = respelling
    // Where the stress mark stands between two letters the edition has left
    // the syllable break to it alone -- "mel-kiz'e-dek" -- and simply dropping
    // it would weld the syllables together into "kize".
    .replace(/(?<=[a-z])['`](?=[a-z])/g, "-")
    .replace(/['`]/g, "")
    .trim();
  return /[a-z]/.test(spoken) ? spoken : "";
}

let lexicon: Map<string, string> | null = null;
let loading: Promise<Map<string, string>> | null = null;
/** Corrections handed straight to us by the editor, so a rebuild right after
 * an edit uses what was just saved rather than racing the write to disk. */
let knownOverrides: Map<string, string> | null = null;

async function readOverrides(): Promise<Map<string, string>> {
  try {
    const raw = await api.getSetting(OVERRIDES_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, string>;
    return new Map(Object.entries(parsed).map(([word, spoken]) => [word.toUpperCase(), spoken]));
  } catch {
    return new Map();
  }
}

/**
 * Reads the whole table once per session. It is a few thousand short rows, and
 * read-aloud looks up a word per spoken token -- far too hot a path to go back
 * to the database for.
 */
export function loadPronunciationLexicon(): Promise<Map<string, string>> {
  if (!loading) {
    loading = Promise.all([api.listPronunciations(), knownOverrides ? Promise.resolve(knownOverrides) : readOverrides()])
      .then(([rows, stored]) => {
        const map = new Map<string, string>();
        for (const row of rows) {
          const spoken = toSpoken(row.respelling);
          if (spoken) map.set(row.word, spoken);
        }
        // A correction the reader made themselves always wins: ISBE is a
        // century old and its ear was not ours.
        for (const [word, spoken] of stored) map.set(word, spoken);
        lexicon = map;
        return map;
      })
      .catch(() => {
        lexicon = new Map();
        return lexicon;
      });
  }
  return loading;
}

/**
 * Puts the reader's corrections in force after they have edited them. The new
 * set is passed in rather than read back, so an edit takes effect immediately
 * instead of racing its own write to disk. The map is rebuilt from scratch
 * because that is the only way a *removed* correction reliably falls back to
 * what ISBE said.
 */
export async function applyOverrides(next: Record<string, string>): Promise<void> {
  knownOverrides = new Map(Object.entries(next).map(([word, spoken]) => [word.toUpperCase(), spoken]));
  lexicon = null;
  loading = null;
  await loadPronunciationLexicon();
}

/** What the lexicon says for a word, for the settings UI to show. */
export function lookupSpoken(word: string): string | null {
  return lexicon?.get(word.toUpperCase()) ?? null;
}

/**
 * A stretch of the spoken string and the source text it stands for. A literal
 * chunk was copied through unchanged, so offsets inside it line up one for
 * one; a substituted chunk is a whole word replaced, and any offset within it
 * belongs to that word.
 */
export interface SpokenChunk {
  spokenStart: number;
  spokenEnd: number;
  srcStart: number;
  srcEnd: number;
  literal: boolean;
}

export interface SpokenText {
  spoken: string;
  chunks: SpokenChunk[];
  /** How many words were rewritten; 0 means `spoken` is the original text. */
  changed: number;
}

/**
 * Splits a token into the word itself and whatever punctuation surrounds it,
 * so "(Mephibosheth's," can be looked up as MEPHIBOSHETH and put back together
 * with its brackets and possessive intact.
 */
function splitToken(token: string): { lead: string; core: string; suffix: string; trail: string } {
  const lead = /^[^A-Za-z]*/.exec(token)![0];
  let rest = token.slice(lead.length);
  const trail = /[^A-Za-z]*$/.exec(rest)![0];
  rest = rest.slice(0, rest.length - trail.length);
  const possessive = /['’]s$/i.exec(rest);
  const suffix = possessive ? possessive[0] : "";
  const core = suffix ? rest.slice(0, rest.length - suffix.length) : rest;
  return { lead, core, suffix, trail };
}

/** The rewritten token, or null to leave it alone. */
function replacementFor(token: string, lex: Map<string, string>): string | null {
  const { lead, core, suffix, trail } = splitToken(token);
  // Only proper nouns. Scripture capitalizes its names everywhere they appear,
  // and a lowercase word that happens to share an article's headword is being
  // used as an ordinary English word.
  if (core.length < 4 || !/^[A-Z]/.test(core)) return null;
  const key = core.toUpperCase();
  if (SKIP.has(key)) return null;
  const spoken = lex.get(key);
  if (!spoken) return null;
  return `${lead}${spoken}${suffix}${trail}`;
}

/**
 * Rewrites a verse for the engine, with a map back to the displayed text.
 * Before the lexicon has loaded, and when nothing in the verse needs help,
 * the text is passed through untouched.
 */
export function buildSpoken(text: string): SpokenText {
  const lex = lexicon;
  const whole: SpokenChunk[] = [
    { spokenStart: 0, spokenEnd: text.length, srcStart: 0, srcEnd: text.length, literal: true },
  ];
  if (!lex || lex.size === 0) return { spoken: text, chunks: whole, changed: 0 };

  const chunks: SpokenChunk[] = [];
  let spoken = "";
  let cursor = 0;
  let changed = 0;

  const push = (srcStart: number, srcEnd: number, out: string, literal: boolean) => {
    if (out.length === 0 && srcStart === srcEnd) return;
    chunks.push({ spokenStart: spoken.length, spokenEnd: spoken.length + out.length, srcStart, srcEnd, literal });
    spoken += out;
  };

  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const replacement = replacementFor(m[0], lex);
    if (replacement == null) continue;
    push(cursor, m.index, text.slice(cursor, m.index), true);
    push(m.index, m.index + m[0].length, replacement, false);
    cursor = m.index + m[0].length;
    changed += 1;
  }
  if (changed === 0) return { spoken: text, chunks: whole, changed: 0 };
  push(cursor, text.length, text.slice(cursor), true);
  return { spoken, chunks, changed };
}

/**
 * Where an offset in the spoken string falls in the displayed text. This is
 * what keeps the highlight on the right word once a name has been rewritten
 * into a longer or shorter one.
 */
export function toSourceIndex(chunks: SpokenChunk[], spokenIndex: number): number {
  for (const chunk of chunks) {
    if (spokenIndex < chunk.spokenEnd) {
      return chunk.literal ? chunk.srcStart + (spokenIndex - chunk.spokenStart) : chunk.srcStart;
    }
  }
  const last = chunks[chunks.length - 1];
  return last ? last.srcEnd : 0;
}
