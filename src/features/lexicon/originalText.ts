/**
 * Greek and Hebrew as the app shows them: exactly as the source has them.
 *
 * Every form of a word the app displays -- the word in the verse, its
 * Strong's headword, the forms of a word study -- is the source's own text,
 * letter for letter: the Hebrew with its vowel points, dagesh, shin and sin
 * dots, maqaf and cantillation, the Greek with its accents, breathings and
 * iota subscripts. None of it is stripped or normalised for display. The
 * bare letters a search compares (`plain.rs` on the Rust side) are for
 * comparing, never for showing.
 *
 * The one mark a reader may take away is the Hebrew cantillation, as the
 * Blue Letter Bible's "Show Cantillation Marks" does: the accents that
 * chant the verse and mark its pauses, which a reader learning the language
 * finds crowding the points. The vowel points always stay. The switch is in
 * the interlinear's bar and holds wherever the app shows a Hebrew word from
 * the text (`useHebrewDisplay`).
 */
import { useCallback } from "react";
import { useUiStore } from "../../state/uiStore";

/**
 * The cantillation marks: the accents (U+0591-05AF), meteg, which is also
 * the silluq that ends a verse (U+05BD), and paseq, the divider that goes
 * with them (U+05C0). Not the vowel points, dagesh, rafe, shin and sin
 * dots, qamats qatan, maqaf, sof pasuq or the textual dots (U+05B0-05BC,
 * 05BE, 05BF, 05C1-05C7): those are how the word is spelt.
 */
const CANTILLATION = /[֑-ֽ֯׀]/gu;

/** The text without its Hebrew cantillation, every letter and vowel point
 *  kept. Greek, and Hebrew with no accents, come back as they were. */
export function withoutCantillation(text: string): string {
  return text.replace(CANTILLATION, "");
}

/** Hebrew as the reader has asked to see it: as the source has it, or with
 *  the cantillation taken off. */
export function hebrewForDisplay(text: string, showCantillation: boolean): string {
  return showCantillation ? text : withoutCantillation(text);
}

/** The marks after a Hebrew word that join it to the next or part it from
 *  it -- maqaf, paseq -- and belong to its place in the verse, not to it. */
const JOINERS = /[־׀\s]+$/u;

/**
 * The root to show after a word -- its Strong's headword -- or null where
 * that is the word as it is shown: "עַל" after עַל־, "כִּי" after כִּ֣י with
 * the cantillation off. Compared as the reader sees both, through the same
 * `display`, so that a word differing from its root only by the accents
 * the reader has taken off does not show twice ("כִּי כִּי"), and without the
 * maqaf or paseq that tie it to the verse.
 */
export function rootToShow(headword: string | null | undefined, form: string, display: (text: string) => string = (t) => t): string | null {
  const root = headword?.trim();
  if (!root) return null;
  return display(root).replace(JOINERS, "") === display(form).replace(JOINERS, "") ? null : root;
}

/** `hebrewForDisplay` with the reader's choice, for a component to show a
 *  Greek or Hebrew word with. */
export function useHebrewDisplay(): (text: string) => string {
  const showCantillation = useUiStore((s) => s.showCantillation);
  return useCallback((text: string) => hebrewForDisplay(text, showCantillation), [showCantillation]);
}

