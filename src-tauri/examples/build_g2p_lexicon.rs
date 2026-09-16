// Builds the pronunciation lexicon the neural voice loads at startup
// (`KOKORO_G2P_LEXICON`), and reports what is left unfixed.
//
// The voice's grapheme-to-phoneme step knows modern English. Handed a word it
// does not know, it strips an ending it recognizes and then spells the leftover
// letters aloud: "restoreth" comes out "restore, T, H", "anointest" comes out
// "anoint, E, S, T". Scripture in the King James is built from those forms, so
// this is not a rare edge -- a psalm hits it several times a chapter.
//
// The fix is to hand the voice the right phonemes for those words. Every one of
// them is a stem the voice *does* know plus an ending whose sound never varies,
// so the entry is built from the voice's own phonemes for the stem with the
// ending's phonemes appended: restore (ɹᵻstˈɔːɹ) + eth (əθ). That is exactly the
// shape of the forms its dictionary already gets right -- "cometh" kˈʌməθ,
// "leadeth" lˈiːdəθ -- so the result sounds of a piece with them.
//
// Usage: npm run build:g2p  (cargo run --release --example build_g2p_lexicon)
// Takes [content.db] [out.tab]; defaults to ../content/content.db and
// resources/kjv-g2p.tab. The output is versioned rather than ignored: it is
// 15 KB, it only changes when the voice crate or the bundled text does, and a
// missing copy fails the build of the app itself.

use rusqlite::Connection;
use std::collections::{BTreeMap, HashMap};
use std::path::PathBuf;
// The one definition of "the voice would spell this out" lives in the app,
// where the pronunciation editor uses it too (src/tts.rs).
use tauri_app_lib::tts::{bare, letter_sounds, letter_spelled, spells_letters};

/// What the ending sounds like, in the voice's own notation. Both are the
/// unstressed forms its dictionary uses for the words it already knows.
const ETH: &str = "əθ";
const EST: &str = "ᵻst";

/// ISBE's respelling as syllables, and which one carries the stress.
///
/// "me-fib'-o-sheth" -> (["me", "fib", "o", "sheth"], 1). The mark follows the
/// stressed syllable, and where it stands between two letters -- "mel-kiz'e-dek"
/// -- it is the syllable break as well. Same reading as `toSpoken` in
/// src/features/tts/pronunciation.ts, which does this for the Windows voices.
fn syllables(respelling: &str) -> (Vec<String>, usize) {
    let mut out: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut stressed = 0usize;
    for c in respelling.trim().chars() {
        match c {
            '-' => {
                if !current.is_empty() {
                    out.push(std::mem::take(&mut current));
                }
            }
            '\'' | '`' => {
                if !current.is_empty() {
                    stressed = out.len();
                    out.push(std::mem::take(&mut current));
                }
            }
            c if c.is_ascii_alphabetic() => current.push(c.to_ascii_lowercase()),
            _ => {}
        }
    }
    if !current.is_empty() {
        out.push(current);
    }
    (out, stressed)
}

/// Whether a respelling is plausibly of *this* word. ISBE articles carry
/// headword lists -- "KING; KINGDOM" -- and the importer gave every word in one
/// the article's first respelling, so the table says KING is said "king'-dum".
/// The same rule as `plausibleRespelling` in src/features/tts/pronunciation.ts.
fn plausible(word: &str, respelling: &str) -> bool {
    const ALIKE: [(char, &str); 13] = [
        ('c', "ks"),
        ('k', "c"),
        ('s', "cz"),
        ('p', "f"),
        ('f', "p"),
        ('q', "k"),
        ('x', "z"),
        ('z', "xs"),
        ('g', "j"),
        ('j', "g"),
        ('w', "hr"),
        ('h', "w"),
        ('y', "i"),
    ];
    let spelled: Vec<char> = word.to_ascii_lowercase().chars().filter(|c| c.is_ascii_alphabetic()).collect();
    let said: Vec<char> = respelling.to_ascii_lowercase().chars().filter(|c| c.is_ascii_alphabetic()).collect();
    if said.is_empty() || spelled.is_empty() {
        return false;
    }
    if said.len() > spelled.len() + 2 || said.len() + 3 < spelled.len() {
        return false;
    }
    let (from, to) = (spelled[0], said[0]);
    let vowel = |c: char| "aeiouy".contains(c);
    from == to
        || (vowel(from) && vowel(to))
        || spelled.get(1) == Some(&to)
        || ALIKE.iter().any(|(f, alike)| *f == from && alike.contains(to))
}

/// The word without its archaic ending, in the spellings English uses: "walketh"
/// -> walk, "restoreth" -> restore, "pitieth" -> pity, "runneth" -> run.
fn stems(word: &str) -> Vec<String> {
    let base = &word[..word.len() - 3];
    let mut out = vec![base.to_string(), format!("{base}e")];
    if let Some(without_i) = base.strip_suffix('i') {
        out.push(format!("{without_i}y"));
    }
    let bytes = base.as_bytes();
    if bytes.len() >= 2 && bytes[bytes.len() - 1] == bytes[bytes.len() - 2] {
        out.push(base[..base.len() - 1].to_string());
    }
    out
}

/// The voice's phonemes for a word, remembered: a stem is asked for once per
/// form built on it.
fn say(word: &str, cache: &mut HashMap<String, String>) -> Option<String> {
    if let Some(hit) = cache.get(word) {
        return Some(hit.clone());
    }
    let said = kokoro_en::g2p_audit(word, false).ok()?.phonemes.trim().to_string();
    cache.insert(word.to_string(), said.clone());
    Some(said)
}

fn main() -> anyhow::Result<()> {
    let mut args = std::env::args().skip(1);
    // Relative to the crate, not to wherever cargo was invoked: `npm run
    // build:g2p` runs this from the repository root.
    let crate_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let db_path = args.next().map(PathBuf::from).unwrap_or_else(|| crate_dir.join("../content/content.db"));
    let out_path = args.next().map(PathBuf::from).unwrap_or_else(|| crate_dir.join("resources/kjv-g2p.tab"));

    let conn = Connection::open(&db_path)?;
    let mut stmt = conn.prepare("SELECT text FROM verses")?;
    let mut counts: BTreeMap<String, usize> = BTreeMap::new();
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let text: String = row.get(0)?;
        for word in text.split(|c: char| !c.is_ascii_alphabetic()) {
            if word.len() > 1 {
                *counts.entry(word.to_ascii_lowercase()).or_default() += 1;
            }
        }
    }
    println!("{} distinct words in {}", counts.len(), db_path.display());

    let letters = letter_sounds();
    let mut phonemes_of: HashMap<String, String> = HashMap::new();

    let mut entries: BTreeMap<String, String> = BTreeMap::new();
    let mut unfixed: Vec<(usize, String, String)> = Vec::new();
    let mut broken = 0usize;

    // Only the archaic inflections are looked at. Phonemizing the whole of
    // Scripture's vocabulary takes the better part of an hour and turns up
    // nothing this can repair: a name the voice cannot read is the ISBE
    // pronunciation table's job, not this one.
    for (word, uses) in counts.iter().filter(|(w, _)| w.len() > 4 && (w.ends_with("eth") || w.ends_with("est"))) {
        let Some(said) = say(word, &mut phonemes_of) else { continue };
        if !letter_spelled(&said, &letters) {
            continue;
        }
        broken += 1;

        let ending = if word.ends_with("eth") { ETH } else { EST };
        let fixed = Some(ending).and_then(|ending| {
            stems(word).into_iter().find_map(|stem| {
                // The stem has to be a word in Scripture's own vocabulary and one
                // the voice can already say, or we would be inventing a reading.
                if !counts.contains_key(&stem) {
                    return None;
                }
                let stem_said = say(&stem, &mut phonemes_of)?;
                if stem_said.split_whitespace().count() != 1 || letter_spelled(&stem_said, &letters) {
                    return None;
                }
                Some(format!("{stem_said}{ending}"))
            })
        });

        match fixed {
            Some(ipa) => {
                entries.insert(word.clone(), ipa);
            }
            None => unfixed.push((*uses, word.clone(), said)),
        }
    }

    let verbs = entries.len();

    // Names, from ISBE's respellings.
    //
    // A name is only worth an entry when the voice cannot read it: it says
    // Jacob, David and Egypt perfectly well, and handing it ISBE's "ja'-kub"
    // instead gets "kub" spelled out as K, U, B. So the test is the voice's
    // own reading of the name, and the respelling is consulted only for the
    // ones it fails -- Mephibosheth, Zerubbabel, Ahasuerus.
    //
    // The entry is built from the voice's phonemes for each syllable of the
    // respelling, with ISBE's stress put back where its mark was. A syllable
    // the voice cannot read either ("kub", had it got this far) disqualifies
    // the name rather than producing a reading nobody has checked.
    let mut names = 0usize;
    let mut name_unfixed: Vec<(usize, String, String)> = Vec::new();
    let mut stmt = conn.prepare("SELECT word, respelling FROM pronunciations")?;
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let word: String = row.get(0)?;
        let respelling: String = row.get(1)?;
        let lower = word.to_ascii_lowercase();
        let Some(uses) = counts.get(&lower).copied() else { continue };
        let Some(said) = say(&lower, &mut phonemes_of) else { continue };
        if !letter_spelled(&said, &letters) || entries.contains_key(&lower) {
            continue;
        }
        if !plausible(&word, &respelling) {
            name_unfixed.push((uses, lower, said));
            continue;
        }
        let (parts, stressed) = syllables(&respelling);
        if parts.is_empty() {
            continue;
        }
        let spoken = parts.join(" ");
        let Some(groups) = say(&spoken, &mut phonemes_of) else { continue };
        let groups: Vec<&str> = groups.split_whitespace().collect();
        if groups.len() != parts.len() || groups.iter().any(|g| spells_letters(&bare(g), &letters, 2)) {
            name_unfixed.push((uses, lower, said));
            continue;
        }
        let ipa: String = groups
            .iter()
            .enumerate()
            .map(|(i, g)| {
                let bare = bare(g);
                if i == stressed { format!("ˈ{bare}") } else { bare }
            })
            .collect();
        entries.insert(lower, ipa);
        names += 1;
    }

    let mut file = String::from(
        "# Pronunciations for the offline neural voice (KOKORO_G2P_LEXICON).\n\
         # Generated by `npm run build:g2p`; do not edit by hand.\n\
         # Archaic verb forms and biblical names the voice would otherwise spell\n\
         # out letter by letter. Format: word<TAB>IPA\n",
    );
    for (word, ipa) in &entries {
        file.push_str(word);
        file.push('\t');
        file.push_str(ipa);
        file.push('\n');
    }
    std::fs::write(&out_path, file)?;

    println!("{broken} archaic forms the voice spells out; {verbs} of them fixed");
    println!("{names} names fixed from ISBE's respellings");
    println!("wrote {} entries to {}", entries.len(), out_path.display());

    unfixed.extend(name_unfixed);
    unfixed.sort_by(|a, b| b.0.cmp(&a.0));
    println!("\nstill spelled out, most used first:");
    for (uses, word, said) in unfixed.iter().take(40) {
        println!("  {uses:>6}  {word:<20} {said}");
    }
    println!("  ... {} more", unfixed.len().saturating_sub(40));
    Ok(())
}
