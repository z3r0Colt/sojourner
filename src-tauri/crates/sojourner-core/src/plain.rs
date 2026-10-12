//! Greek and Hebrew by their bare letters.
//!
//! A reader types λογος, not λόγος; בראשית, not בְּרֵאשִׁית. Everything that
//! compares an original-language word to what was typed -- lemma search,
//! lexicon headwords, the unpointed search index -- compares these forms:
//! decomposed, combining marks (accents, breathings, vowel points,
//! cantillation) removed, lower-cased, and final sigma folded into sigma.

use unicode_normalization::UnicodeNormalization;

/// True for the marks stripped: Greek diacritics (combining, U+0300-036F),
/// Hebrew points and cantillation (U+0591-05C7, keeping the letters and
/// maqaf/sof pasuq punctuation), and the Greek koronis and apostrophe forms.
fn is_mark(c: char) -> bool {
    matches!(c as u32,
        0x0300..=0x036F | 0x0591..=0x05BD | 0x05BF | 0x05C1 | 0x05C2 | 0x05C4 | 0x05C5 | 0x05C7 | 0x1FBD | 0x1FBF..=0x1FC1 | 0x1FCD..=0x1FCF | 0x1FDD..=0x1FDF | 0x1FED..=0x1FEF | 0x1FFD | 0x1FFE)
}

/// The bare letters of `s`.
pub fn plain(s: &str) -> String {
    s.nfd()
        .filter(|c| !is_mark(*c))
        .flat_map(char::to_lowercase)
        .map(|c| if c == 'ς' { 'σ' } else { c })
        .collect()
}

/// `plain`, keeping only letters and digits: a word as a search matches it.
pub fn plain_word(s: &str) -> String {
    plain(s).chars().filter(|c| c.is_alphanumeric()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn greek_and_hebrew_lose_their_marks() {
        assert_eq!(plain("λόγος"), "λογοσ");
        assert_eq!(plain("Λόγος"), plain("λογος"));
        assert_eq!(plain("ἀγάπη"), "αγαπη");
        assert_eq!(plain("בְּרֵאשִׁ֖ית"), "בראשית");
        assert_eq!(plain_word("λόγος,"), "λογοσ");
    }
}
