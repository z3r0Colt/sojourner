//! The translations an imported Bible can be recognised as, by its title or
//! file name, and which of them are in copyright.
//!
//! A reader may import their own copy of a modern translation through "Add
//! file". The app never ships one (see `refuse_licensed_translations`), but
//! what a reader holds a licence for is their arrangement to make, so such a
//! translation is let in and marked 'licensed' rather than refused -- and the
//! mark depends on recognising it, which is what this table is for.

/// One translation: its code, the phrases that name it (lowercase, apostrophes
/// dropped, everything else not a letter or digit read as a space, matched as
/// whole words), and whether its text is in copyright.
pub struct KnownTranslation {
    pub code: &'static str,
    pub names: &'static [&'static str],
    pub licensed: bool,
}

const fn t(code: &'static str, names: &'static [&'static str], licensed: bool) -> KnownTranslation {
    KnownTranslation { code, names, licensed }
}

/// Checked in order and the first match wins, so a name that contains
/// another comes before it: "new king james" before "king james", "new
/// revised standard" before "revised standard", "new jerusalem" before
/// "jerusalem bible", and every modern translation before the public-domain
/// ones (an NLT file that mentions its publisher, Tyndale House, is not
/// Tyndale's Bible).
pub const KNOWN_TRANSLATIONS: &[KnownTranslation] = &[
    // In copyright.
    t("NKJV", &["new king james"], true),
    t("NASB", &["new american standard"], true),
    t("LSB", &["legacy standard"], true),
    t("NRSV", &["new revised standard"], true),
    t("RSV", &["revised standard"], true),
    t("ESV", &["english standard"], true),
    t("HCSB", &["holman christian standard"], true),
    t("CSB", &["christian standard"], true),
    t("NIRV", &["new international readers"], true),
    t("TNIV", &["todays new international"], true),
    t("NIV", &["new international"], true),
    t("NLT", &["new living"], true),
    t("TLB", &["living bible"], true),
    t("NET", &["new english translation", "net bible"], true),
    t("NEB", &["new english bible"], true),
    t("REB", &["revised english bible"], true),
    t("CEV", &["contemporary english"], true),
    t("GNT", &["good news", "todays english version"], true),
    t("CEB", &["common english bible"], true),
    t("MEV", &["modern english version"], true),
    t("LEB", &["lexham english"], true),
    t("ISV", &["international standard version"], true),
    t("GW", &["gods word"], true),
    t("NOG", &["names of god"], true),
    t("NCV", &["new century version"], true),
    t("ICB", &["international childrens bible"], true),
    t("ERV", &["easy to read"], true),
    t("EXB", &["expanded bible"], true),
    t("AMP", &["amplified"], true),
    t("MSG", &["the message"], true),
    t("TPT", &["passion translation"], true),
    t("VOICE", &["the voice"], true),
    t("PHILLIPS", &["phillips"], true),
    t("NABRE", &["new american bible"], true),
    t("NJB", &["new jerusalem"], true),
    t("JB", &["jerusalem bible"], true),
    t("CJB", &["complete jewish"], true),
    t("OJB", &["orthodox jewish"], true),
    t("OSB", &["orthodox study bible"], true),
    t("TLV", &["tree of life"], true),
    t("EHV", &["evangelical heritage"], true),
    t("NTE", &["new testament for everyone"], true),
    t("NLV", &["new life version"], true),
    t("NWT", &["new world translation"], true),
    t("KNOX", &["knox"], true),
    t("MLV", &["modern literal version"], true),
    t("NMB", &["new matthew bible"], true),
    t("WE", &["worldwide english"], true),
    // Public domain (or openly licensed, as the LSV is).
    t("KJV", &["king james", "authorized version", "authorised version"], false),
    t("ASV", &["american standard"], false),
    t("YLT", &["youngs literal", "young literal"], false),
    t("DBY", &["darby"], false),
    t("WBS", &["webster"], false),
    t("WEB", &["world english"], false),
    t("DRA", &["douay", "rheims"], false),
    t("GNV", &["geneva"], false),
    t("TYN", &["tyndale"], false),
    t("WYC", &["wycliffe", "wyclif"], false),
    t("BSB", &["berean standard"], false),
    t("LSV", &["literal standard"], false),
];

/// " young s literal " → " youngs literal ": lowercase, apostrophes gone,
/// every other run of non-alphanumerics one space, padded so a phrase can be
/// matched as whole words with `contains(" phrase ")`.
fn normalize(s: &str) -> String {
    let mut out = String::from(" ");
    for c in s.chars().filter(|c| *c != '\'' && *c != '’') {
        if c.is_alphanumeric() {
            out.extend(c.to_lowercase());
        } else if !out.ends_with(' ') {
            out.push(' ');
        }
    }
    if !out.ends_with(' ') {
        out.push(' ');
    }
    out
}

/// The translation a title or file name names: by one of its phrases first,
/// then by its code standing alone as a word ("ESV.xml", "Holy Bible (NIV)").
/// Codes of two letters are not looked for on their own -- "we" and "gw" are
/// too likely to be something else.
pub fn recognise(text: &str) -> Option<&'static KnownTranslation> {
    let hay = normalize(text);
    KNOWN_TRANSLATIONS
        .iter()
        .find(|k| k.names.iter().any(|name| hay.contains(&format!(" {name} "))))
        .or_else(|| {
            KNOWN_TRANSLATIONS
                .iter()
                .filter(|k| k.code.len() >= 3)
                .find(|k| hay.contains(&format!(" {} ", k.code.to_lowercase())))
        })
}

#[cfg(test)]
mod tests {
    use super::recognise;

    fn code(text: &str) -> Option<&'static str> {
        recognise(text).map(|k| k.code)
    }

    #[test]
    fn a_name_that_contains_another_is_told_apart_from_it() {
        assert_eq!(code("New King James Version"), Some("NKJV"));
        assert_eq!(code("King James Version (1769)"), Some("KJV"));
        assert_eq!(code("New American Standard Bible (1995)"), Some("NASB"));
        assert_eq!(code("American Standard Version (1901)"), Some("ASV"));
        assert_eq!(code("New Revised Standard Version"), Some("NRSV"));
        assert_eq!(code("Revised Standard Version Catholic Edition"), Some("RSV"));
        assert_eq!(code("New International Reader's Version"), Some("NIRV"));
        assert_eq!(code("New International Version 2011"), Some("NIV"));
        assert_eq!(code("Holman Christian Standard Bible"), Some("HCSB"));
        assert_eq!(code("Christian Standard Bible"), Some("CSB"));
        assert_eq!(code("The New Jerusalem Bible"), Some("NJB"));
        assert_eq!(code("The Jerusalem Bible"), Some("JB"));
        assert_eq!(code("New English Translation"), Some("NET"));
        assert_eq!(code("The New English Bible"), Some("NEB"));
        assert_eq!(code("New Living Translation (Tyndale House)"), Some("NLT"));
        assert_eq!(code("The Living Bible"), Some("TLB"));
        assert_eq!(code("World English Bible"), Some("WEB"));
        assert_eq!(code("Worldwide English New Testament"), Some("WE"));
    }

    #[test]
    fn apostrophes_and_punctuation_do_not_hide_a_name() {
        assert_eq!(code("GOD'S WORD Translation"), Some("GW"));
        assert_eq!(code("Young’s Literal Translation"), Some("YLT"));
        assert_eq!(code("Easy-to-Read Version"), Some("ERV"));
        assert_eq!(code("English_Standard_Version"), Some("ESV"));
    }

    #[test]
    fn a_code_on_its_own_is_recognised_but_not_inside_a_word() {
        assert_eq!(code("ESV"), Some("ESV"));
        assert_eq!(code("Holy Bible (NIV)"), Some("NIV"));
        assert_eq!(code("Nesvik family Bible"), None);
        assert_eq!(code("A Bible we made"), None, "two-letter codes are not looked for alone");
    }

    #[test]
    fn a_name_nobody_knows_is_not_guessed() {
        assert_eq!(code("My Grandfather's Bible"), None);
    }
}
