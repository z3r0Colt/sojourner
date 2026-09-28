import type { InterlinearWord, MorphologyWord } from "../../api/types";

/**
 * The interlinear laid out under the English: each KJV phrase with the Greek
 * or Hebrew word it translates hanging beneath it, in the manner of the Blue
 * Letter Bible's reverse interlinear, and the words no phrase translates --
 * the Greek article before a name, the Hebrew object marker, a καί the KJV
 * left out -- gathered at the end of the verse as "Not matched" (named for
 * what is known of them: mostly untranslated, but now and then a word the
 * KJV folded into a phrase this cannot find it in).
 *
 * The two texts meet only by Strong's number. The KJV phrases carry the
 * numbers of the KJV-with-Strong's (the TR and the Leningrad Codex as Strong
 * himself numbered them), the original words the numbers of the tagged text,
 * and the two mostly agree: some 96 in 100 of the phrases find their number
 * among their verse's words. The rest are nearly all a handful of
 * disagreements over whole families of words. Strong gave the forms of εἰμί,
 * of the personal pronouns and of οὗτος numbers of their own (G2258 ἦν, G3450
 * μου, G5124 τοῦτο), where the tagged text files every form under its
 * lexical number (G1510, G3165, G3778); he numbered compounds the tagged text
 * writes as two words (G3363 ἵνα μή); and a few Hebrew verbs he filed under
 * the stem the tagged text does not (H3212 went, which it files under H1980
 * halak). `STRONGS_EQUIVALENTS` reads Strong's number as the tagged text's,
 * but only where the verse has no word under Strong's own number: a
 * disagreement the table lists is not every verse's.
 *
 * Where a number stands on several phrases and several words, which phrase
 * translates which word is only a matter of order. The English and the
 * original keep much the same order in a verse, so the phrases are taken to
 * translate the words in turn: John 1:1's "God" translates θεόν and its
 * second "God" θεός. Where the counts differ, see `pairInOrder`.
 */

/**
 * Strong's numbers of the KJV phrases that the tagged text files under other
 * numbers, as that text's numbers. Each entry is the words the phrase stands
 * for -- one, or two for a compound Strong numbered as one (G3363 "lest" is
 * ἵνα and μή) -- and each word the numbers it may be filed under, the first
 * one the verse has being taken. The personal pronouns are both: the tagged
 * text files μου, ἡμῶν and the like under G3165 but ἐμοῦ and ἐμοί under
 * G1473.
 *
 * Drawn from the whole Bible: every KJV number that missed its verse's words
 * more than a few times, paired with the number that stood unclaimed in the
 * same verses nearly every time.
 */
const I = ["G3165", "G1473"];
const YOU = ["G4771"];
const THIS = ["G3778"];
const BE = ["G1510"];
export const STRONGS_EQUIVALENTS: Record<string, string[][]> = {
  // εἰμί, "to be": ἦν, ἐστί, ἔσται, εἰσί, ὤν, ἐστέ, εἶ, ἐσμέν, ὦ, εἶναι,
  // ἴσθι, ἤτω, εἴην, ἤμην, ἔστω.
  ...Object.fromEntries(
    ["G2258", "G2076", "G2071", "G1526", "G5607", "G2075", "G1488", "G2070", "G5600", "G1511", "G2468", "G2277", "G1498", "G2252", "G2077"].map((n) => [n, [BE]]),
  ),
  // ἐγώ and ἡμεῖς in each case, ἐμός, ἐμαυτοῦ, ἡμέτερος, κἀγώ.
  ...Object.fromEntries(
    ["G3450", "G2257", "G3427", "G2254", "G2248", "G2249", "G1700", "G1698", "G1691", "G1699", "G1683", "G2251", "G2504"].map((n) => [n, [I]]),
  ),
  // σύ and ὑμεῖς in each case, σεαυτοῦ, σός, ὑμέτερος.
  ...Object.fromEntries(["G4571", "G4671", "G4675", "G5209", "G5210", "G5213", "G5216", "G4572", "G4674", "G5212"].map((n) => [n, [YOU]])),
  // οὗτος in each case.
  ...Object.fromEntries(["G5124", "G5023", "G5026", "G5129", "G5127", "G5130", "G5126", "G5128", "G5025", "G5125"].map((n) => [n, [THIS]])),
  G848: [["G846"]], // αὑτοῦ, "his", which the tagged text reads αὐτοῦ
  G5123: [THIS, BE], // τουτέστι, "that is"
  G3603: [["G3739"], BE], // ὅ ἐστι, "which is"
  G3363: [["G2443"], ["G3361"]], // ἵνα μή, "lest"
  G3362: [["G1437"], ["G3361"]], // ἐὰν μή, "except"
  G1508: [["G1487"], ["G3361"]], // εἰ μή, "but", "save"
  G1536: [["G1487"], ["G5100"]], // εἴ τις, "if any man"
  G3364: [["G3756"], ["G3361"]], // οὐ μή, "not", "never"
  G1490: [["G1487"], ["G3361"], ["G1065"]], // εἰ δὲ μή γε, "or else"
  G3381: [["G3361"], ["G4458"]], // μήπως, "lest by any means"
  G1302: [["G1223"], ["G5101"]], // διὰ τί, "why"
  G2546: [["G2532"], ["G1563"]], // κἀκεῖ, "and there"
  G2547: [["G2532"], ["G1564"]], // κἀκεῖθεν, "and from thence"
  G2548: [["G2532"], ["G1565"]], // κἀκεῖνος, "and he"
  G2579: [["G2532"], ["G1437"]], // κἄν, "and if"
  G1499: [["G1487"]], // εἰ καί, "though"
  G3379: [["G3361"]], // μήποτε, "lest"
  G3765: [["G3756"]], // οὐκέτι, "no more"
  G3391: [["G1520"]], // μία, "one"
  G756: [["G757"]], // ἄρχομαι, "began"
  G3440: [["G3441"]], // μόνον, "only"
  G4412: [["G4413"]], // πρῶτον, "first"
  G2046: [["G4483"]], // ἐρῶ, "I will say"
  G4483: [["G2046"]], // ῥηθέν, "was spoken"
  G3187: [["G3173"]], // μείζων, "greater"
  G680: [["G681"]], // ἅπτομαι, "touch"
  G3415: [["G3403"]], // μνάομαι, "remember"
  G2909: [["G2908"]], // κρείττων, "better"
  G3397: [["G3398"]], // μικρόν, "a little while"
  G5224: [["G5225"]], // τὰ ὑπάρχοντα, "goods"
  G2117: [["G2112"]], // εὐθύς, "immediately"
  G4119: [["G4183"]], // πλείων, "more"
  G1636: [["G1638"]], // ἐλαία, "of olives"
  G5305: [["G5306"]], // ὕστερον, "afterward"
  G2419: [["G2414"]], // Ἱερουσαλήμ, "Jerusalem"
  G4113: [["G4116"]], // πλατεῖα, "street"
  H3212: [["H1980"]], // halak, "went", "go"
  H7125: [["H7122"]], // liqrat, "to meet", "against"
  H3240: [["H5117"]], // nuach (hiphil), "leave", "set"
  H3169: [["H2396"]], // Hezekiah
  H2896: [["H2895"]], // tov, "good"
  H4714: [["H4713"]], // "the Egyptians"
  H2425: [["H2421"]], // chayah, "lived"
  H3415: [["H7489"]], // yara, "displeased"
  H3001: [["H954"]], // yavesh, "confounded"
  H7200: [["H7203"]], // "the seer"
  H8248: [["H4945"]], // "butler"
  H1123: [["H1247"]], // Aramaic bar, "children"
};

/**
 * What the little words no phrase's number claims are rendered as, for
 * finding them in the phrase beside them.
 *
 * The KJV-with-Strong's the phrases come from gives each phrase one number,
 * its weightiest word's, and folds the little words around it in: "and over
 * all the earth" (Genesis 1:26) is H776, "earth", with nothing for the "over"
 * (עַל) or the "all" (כָּל); "I shall not want" is H2637 without the לֹא; "the
 * Word" is G3056 without the ὁ. Left to their numbers these words were a
 * fifth of the Bible's, and "not translated" was untrue of most of them.
 * Such a word goes under the phrase of the word beside it in the original
 * when that phrase has one of its renderings: the article under "the Word",
 * לֹא under "I shall not want". A word with no renderings here, or with none
 * in the phrase beside it -- the object marker אֵת, an article the KJV has
 * no "the" for -- stays untranslated. (Or in the phrase beside that one in
 * the English, where the KJV carried it over: see `alignVerse`.)
 *
 * The renderings are the KJV's commonest for each word, enough to find it,
 * not all of them.
 */
export const FOLDED_RENDERINGS: Record<string, string[]> = {
  G3588: ["the"],
  G2532: ["and", "also", "even", "both"],
  G1161: ["but", "and", "now", "then", "also", "yet"],
  G1063: ["for"],
  G3756: ["not", "no", "never", "cannot", "nothing", "none"],
  G3361: ["not", "no", "lest", "neither", "nothing", "none"],
  G3739: ["which", "that", "who", "whom", "whose", "what", "whatsoever"],
  G846: ["him", "his", "it", "its", "them", "their", "they", "he", "she", "her", "himself", "themselves", "same", "self"],
  H5921: ["upon", "over", "on", "against", "above", "concerning", "beside", "about", "because", "before"],
  H413: ["unto", "to", "into", "toward", "towards", "against", "at", "upon", "in", "on"],
  H3605: ["all", "every", "whole", "any", "whosoever", "whatsoever", "everything"],
  H834: ["which", "that", "who", "whom", "whose", "what", "where", "whither", "when", "as", "because"],
  H3808: ["not", "no", "never", "neither", "nor", "none", "nothing", "without", "cannot"],
  H3588: ["for", "that", "because", "when", "but", "surely", "if", "though", "yea", "since"],
  H1961: ["be", "was", "were", "is", "are", "been", "came", "come", "become", "became", "being", "had", "have"],
  H1931: ["he", "she", "it", "that", "this", "same", "him", "which", "who"],
  H4480: ["from", "of", "out", "than", "off", "above", "thereof"],
  H5704: ["until", "unto", "till", "even", "while"],
  H2088: ["this", "that", "here", "these", "thus"],
  H859: ["thou", "you", "ye", "thee"],
  H5973: ["with", "by", "against", "among", "beside"],
  H854: ["with", "by", "against", "of", "from", "unto", "to"],
  H518: ["if", "whether", "though", "surely", "not", "but", "when"],
  H589: ["i", "me"],
  H2009: ["behold", "lo", "see"],
  H8033: ["there", "thither", "whither", "thence"],
  H369: ["not", "no", "none", "without", "nothing", "neither"],
  H1571: ["also", "even", "both", "and", "moreover", "yea"],
  H428: ["these", "those", "this"],
  H4100: ["what", "how", "why", "wherefore"],
  H3651: ["so", "thus", "therefore", "right", "well"],
  H408: ["not", "nor", "neither", "no", "nay"],
  H9030: ["me", "my", "i", "mine"],
  H9031: ["thee", "thou", "thy", "thine", "you", "your"],
  H9032: ["thee", "thou", "thy", "thine"],
  H9033: ["him", "his", "it", "its", "therein", "thereof", "thereon"],
  H9034: ["her", "she", "it", "its", "therein", "thereof", "thereon"],
  H9035: ["us", "our", "we"],
  H9036: ["you", "your", "ye"],
  H9038: ["them", "their", "they", "therein"],
  H9039: ["them", "their", "they", "therein"],
  H5978: ["with", "me", "by"],
  H1992: ["they", "them", "these", "those", "their", "same"],
  H4616: ["sake", "for", "that", "because", "intent", "end"],
  H2063: ["this", "these", "that", "thus"],
  H3541: ["thus", "so", "here", "hither", "likewise"],
  H8478: ["under", "instead", "stead", "beneath"],
  H5750: ["yet", "again", "more", "still", "any", "longer", "besides"],
  H6258: ["now", "henceforth"],
  H4310: ["who", "whom", "whose", "what", "which", "would"],
  H4994: ["pray", "now", "beseech"],
  H996: ["between", "among", "betwixt", "within"],
  H5048: ["before", "presence", "against", "over", "sight", "toward"],
  H389: ["surely", "only", "but", "howbeit", "yet", "certainly", "nevertheless"],
  H905: ["alone", "beside", "only", "apart", "besides"],
  H2005: ["behold", "lo", "if"],
  H176: ["or", "if", "whether"],
  H595: ["i", "me"],
  H1768: ["that", "which", "who", "whom", "whose", "because"],
};

/**
 * The words that mark another rather than being rendered themselves: the
 * Greek article and the Hebrew object marker אֵת. The KJV numbers a phrase
 * for one now and then -- Genesis 1:1's "and" is H853, for the וְאֵת written
 * with "and" on it -- and the verse's other אֵת, beside nothing with "and"
 * in it, is no more that phrase's than it is translated. A marker over is
 * not translated unless it is beside its phrase.
 */
const MARKERS = new Set(["G3588", "H853"]);

/** A Greek or Hebrew word under an English phrase. */
export interface AlignedWord {
  word: MorphologyWord;
  /** The word is not the phrase's by its number but a little word folded
   * into its English (see `FOLDED_RENDERINGS`): the article of "the Word". */
  folded: boolean;
  /** The word stands under another phrase too, which it is shown under in
   * full: the phrase is part of that one's translation of it. "should" and
   * "perish" in John 3:16 are both ἀπόληται, and it hangs under "perish"
   * with its parsing, under "should" only as the word. */
  echo: boolean;
}

export interface AlignedPhrase {
  phrase: InterlinearWord;
  /** In the original's order. Empty for a word the KJV supplied (in italics,
   * with no Strong's number) or one whose number the verse's words lack. */
  words: AlignedWord[];
}

export interface VerseAlignment {
  phrases: AlignedPhrase[];
  /** The words no phrase's number claims, in the original's order. */
  untranslated: MorphologyWord[];
}

/** One word a phrase stands for: the phrase, and the number of the tagged
 * text it is looked for under. */
interface Claim {
  phrase: number;
  number: string;
}

/**
 * Each English phrase with the Greek or Hebrew words it translates, and the
 * verse's words no phrase translates.
 *
 * A phrase claims a word for its Strong's number (or, where the verse has no
 * word under it, for each number `STRONGS_EQUIVALENTS` reads it as). The
 * phrases claiming one number and the words under it are paired in their
 * order (`pairInOrder`), as many phrases as words taking one each.
 *
 * Then the words left: the little words no phrase's number claims, and the
 * words over when a number stands on more words than phrases. Each goes with
 * the phrase beside it in the original that has it in its English -- one of
 * its renderings (`FOLDED_RENDERINGS`), or, for a word over, a word of the
 * phrase whose number it has. Genesis 1:2 has two עַל and one "upon" H5921;
 * the first עַל is beside פְּנֵי, "was upon the face", and goes there, and
 * "upon" keeps the second. A word over that is beside no such phrase goes
 * with the phrase whose number it has after all, so that a phrase whose
 * number the verse has several times shows every one ("Verily verily" is
 * ἀμὴν ἀμὴν) -- unless it is a marker (`MARKERS`) -- and a little word
 * beside none is not translated.
 */
export function alignVerse(phrases: InterlinearWord[], words: MorphologyWord[]): VerseAlignment {
  const inVerse = new Set(words.map((w) => w.strongs_id).filter((n): n is string => !!n));
  const claims: Claim[] = [];
  phrases.forEach((p, i) => {
    for (const number of claimedNumbers(p.strongs_id, inVerse)) claims.push({ phrase: i, number });
  });

  const under: AlignedWord[][] = phrases.map(() => []);
  /** The phrase each word hangs under in full. */
  const owner = new Map<number, number>();
  /** Each word over, and the phrase whose number it has. */
  const over = new Map<number, number>();
  for (const number of new Set(claims.map((c) => c.number))) {
    const byPhrase = claims.filter((c) => c.number === number).map((c) => c.phrase);
    const wordsAt = words.flatMap((w, j) => (w.strongs_id === number ? [j] : []));
    for (const { phrase, word, kind } of pairInOrder(byPhrase, phrases.length, wordsAt, words.length)) {
      if (kind === "over") {
        over.set(word, phrase);
        continue;
      }
      under[phrase].push({ word: words[word], echo: kind === "echo", folded: false });
      if (kind === "pair") owner.set(word, phrase);
    }
  }

  // The words left, each with the phrase beside it that has it in its
  // English. Round again while any is placed, for a run of them: "and over
  // all the earth" takes כָּל from הָאָרֶץ beside it, and then a וְעַל from כָּל.
  const english = phrases.map((p) => new Set(englishWords(p.text)));
  const renderings = words.map((w, j) => {
    const own = (w.strongs_id && FOLDED_RENDERINGS[w.strongs_id]) || [];
    const phrase = over.get(j);
    return phrase === undefined ? own : [...own, ...[...english[phrase]].filter((e) => !COMMON.has(e))];
  });
  //
  // Failing that, the phrase beside that phrase in the English, for where the
  // KJV has moved the little word across a phrase boundary: Psalm 23:4's לֹא
  // stands beside אִירָא, "I will fear", but its "no" went into the next
  // phrase, "no evil". Only when no word can be placed the nearer way, and
  // never a marker: an article's "the" is in too many phrases for a phrase
  // once removed to say anything. A marker looks only ahead, to the word it
  // marks: Matthew 5:3's τῷ is the "the" of τῷ πνεύματι, never mind that
  // "are the poor" before it has one too.
  const has = (j: number, phrase: number) =>
    phrase >= 0 && phrase < phrases.length && renderings[j].some((r) => english[phrase].has(r));
  const place = (j: number, phrase: number) => {
    under[phrase].push({ word: words[j], echo: false, folded: true });
    owner.set(j, phrase);
  };
  const placeBeside = (reach: boolean) => {
    let placed = false;
    words.forEach((w, j) => {
      if (owner.has(j) || renderings[j].length === 0) return;
      const marker = MARKERS.has(w.strongs_id!);
      if (reach && marker) return;
      for (const k of marker ? [j + 1] : [j + 1, j - 1]) {
        const phrase = owner.get(k);
        if (phrase === undefined) continue;
        const candidates = reach ? [phrase + 1, phrase - 1].filter((q) => phrases[q]?.strongs_id) : [phrase];
        const found = candidates.find((q) => has(j, q));
        if (found === undefined) continue;
        place(j, found);
        placed = true;
        return;
      }
    });
    return placed;
  };
  while (placeBeside(false) || placeBeside(true));
  for (const [j, phrase] of over) {
    if (owner.has(j) || MARKERS.has(words[j].strongs_id!)) continue;
    under[phrase].push({ word: words[j], echo: false, folded: false });
    owner.set(j, phrase);
  }

  const order = new Map(words.map((w, j) => [w, j]));
  return {
    phrases: phrases.map((phrase, i) => ({
      phrase,
      words: under[i].sort((a, b) => order.get(a.word)! - order.get(b.word)!),
    })),
    untranslated: words.filter((_, j) => !owner.has(j)),
  };
}

/** The English words too common to find a word over by: Psalm 23:6's second
 * יָמִים, "days", is not "of the LORD" beside it for the "the" it shares with
 * "all the days". */
const COMMON = new Set(["the", "a", "an", "of", "and", "to", "in", "unto", "that", "for", "is", "was", "be"]);

function englishWords(text: string): string[] {
  return text.toLowerCase().match(/[a-z]+/g) ?? [];
}

/** The numbers of the tagged text a phrase's Strong's number claims a word
 * under: its own, if the verse has a word under it, or else the numbers the
 * table reads it as, each that the verse has. */
function claimedNumbers(strongsId: string | null, inVerse: Set<string>): string[] {
  if (!strongsId) return [];
  if (inVerse.has(strongsId)) return [strongsId];
  const parts = STRONGS_EQUIVALENTS[strongsId] ?? [];
  return parts.flatMap((alternatives) => alternatives.find((n) => inVerse.has(n)) ?? []);
}

/** How a word goes with a phrase claiming its number: as its word, as a word
 * over that the phrase may have (see `alignVerse`), or as an echo. */
export type PairKind = "pair" | "over" | "echo";

/**
 * The phrases claiming one number paired with the words under it, by their
 * places in the verse (each given as its index in its own text, with the
 * text's length).
 *
 * Each phrase has one word and each word one phrase, the pairs keeping both
 * texts' order; where the counts differ, the pairing is the one that keeps
 * each pair nearest the same place in the two verses, and:
 *
 * - More words than phrases: each word left over is "over", with the phrase
 *   whose word is nearest it.
 * - More phrases than words: the KJV has spent two phrases on one word, as
 *   it often does with a verb ("should not perish" is "should" G622, "not"
 *   G3361, "perish" G622, for the one ἀπόληται). The word goes under the
 *   phrase nearest its place, and the other phrases show it as an echo.
 */
export function pairInOrder(
  phrases: number[],
  phraseCount: number,
  words: number[],
  wordCount: number,
): { phrase: number; word: number; kind: PairKind }[] {
  if (phrases.length === 0 || words.length === 0) return [];
  const at = (i: number, n: number) => (n <= 1 ? 0 : i / (n - 1));
  const pe = phrases.map((p) => at(p, phraseCount));
  const po = words.map((w) => at(w, wordCount));
  const pairs: { phrase: number; word: number; kind: PairKind }[] = [];
  if (phrases.length <= words.length) {
    const chosen = orderedMatch(pe, po);
    chosen.forEach((j, i) => pairs.push({ phrase: phrases[i], word: words[j], kind: "pair" }));
    words.forEach((word, j) => {
      if (chosen.includes(j)) return;
      const i = nearest(chosen.map((c) => po[c]), po[j]);
      pairs.push({ phrase: phrases[i], word, kind: "over" });
    });
  } else {
    const chosen = orderedMatch(po, pe);
    chosen.forEach((i, j) => pairs.push({ phrase: phrases[i], word: words[j], kind: "pair" }));
    phrases.forEach((phrase, i) => {
      if (chosen.includes(i)) return;
      const j = nearest(chosen.map((c) => pe[c]), pe[i]);
      pairs.push({ phrase, word: words[j], kind: "echo" });
    });
  }
  return pairs;
}

/** For each of `fewer`, the index in `more` it is matched to, increasing,
 * the matches together as near as can be (least total distance). */
function orderedMatch(fewer: number[], more: number[]): number[] {
  const m = fewer.length;
  const n = more.length;
  // cost[i][j]: the least distance matching fewer[0..i) within more[0..j).
  const cost = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(Infinity));
  for (let j = 0; j <= n; j++) cost[0][j] = 0;
  for (let i = 1; i <= m; i++) {
    for (let j = i; j <= n; j++) {
      cost[i][j] = Math.min(cost[i][j - 1], cost[i - 1][j - 1] + Math.abs(fewer[i - 1] - more[j - 1]));
    }
  }
  const match = new Array<number>(m);
  for (let i = m, j = n; i > 0; j--) {
    if (cost[i][j] === cost[i][j - 1] && j > i) continue;
    match[i - 1] = j - 1;
    i--;
  }
  return match;
}

function nearest(places: number[], place: number): number {
  let best = 0;
  places.forEach((p, i) => {
    if (Math.abs(p - place) < Math.abs(places[best] - place)) best = i;
  });
  return best;
}

/**
 * The one Greek or Hebrew word an English phrase translates, for the
 * Strong's card to parse, or null when it translates several or none. An
 * echo is still that word.
 */
export function phraseWord(aligned: AlignedPhrase | undefined): MorphologyWord | null {
  const words = (aligned?.words ?? []).filter((w) => !w.folded);
  return words.length === 1 ? words[0].word : null;
}
