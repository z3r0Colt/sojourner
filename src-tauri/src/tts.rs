//! The offline neural voice.
//!
//! Read aloud's other engine is whatever Windows installed, which on a plain
//! machine means the 2013-era David and Zira. This one is Kokoro, an 82M
//! parameter model with Apache-2.0 weights, run locally through ONNX. The
//! model and its voices ship inside the installer (`npm run fetch:voices`
//! puts them in `models/`, `tauri.conf.json` bundles that folder), so nothing
//! is downloaded and nothing is spoken over the network.
//!
//! What it cannot do is tell us where each word falls in the audio: it hands
//! back samples and nothing else. The read-along highlight therefore follows
//! the verse rather than the word when this engine is speaking -- the trade
//! made knowingly for the voice.

use anyhow::Context;
use kokoro_en::{KokoroTts, Voice};
use once_cell::sync::OnceCell;
use std::collections::BTreeSet;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

/// Kokoro's output rate. Fixed by the model, not a choice.
const SAMPLE_RATE: u32 = 24_000;

/// The file name of the pronunciation lexicon that ships beside the model.
const LEXICON_FILE: &str = "kjv-g2p.tab";

/// Points the voice at the pronunciations built by `build_g2p_lexicon`.
///
/// Its grapheme-to-phoneme step knows modern English; handed "restoreth" it
/// says "restore, T, H", spelling out the letters it could not place. The
/// King James is built from those forms, so the lexicon carries the right
/// phonemes for every one of them found in Scripture.
///
/// The crate reads this path once, from the environment, the first time it
/// phonemizes anything -- which is why this is called from `run` before the
/// builder starts, while the process is still the one thread that main began
/// on. Setting an environment variable later, with the runtime's threads up,
/// is the unsound case the `unsafe` here is marking.
pub fn point_voice_at_lexicon() {
    let Ok(exe) = std::env::current_exe() else { return };
    let Some(dir) = exe.parent() else { return };
    // Tauri resolves resources next to the executable on Windows -- the same
    // folder the model and content.db are copied into for `tauri dev`.
    let lexicon = dir.join(LEXICON_FILE);
    if !lexicon.is_file() {
        return;
    }
    unsafe { std::env::set_var("KOKORO_G2P_LEXICON", &lexicon) };
}

fn model_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path().resource_dir().ok().map(|d| d.join("models").join("kokoro"))
}

/// Whether the voice was bundled into this build. A developer who has not run
/// `npm run fetch:voices` gets an app that works without it rather than one
/// that fails at launch, so this is checked before the engine is offered.
pub fn is_available(app: &AppHandle) -> bool {
    model_dir(app).map(|d| d.join("model.onnx").is_file()).unwrap_or(false)
}

/// The voices found beside the model, by file name: `af_heart`, `bm_george`.
pub fn list_voices(app: &AppHandle) -> Vec<String> {
    let Some(dir) = model_dir(app).map(|d| d.join("voices")) else {
        return Vec::new();
    };
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut names: Vec<String> = entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            if path.extension()? != "bin" {
                return None;
            }
            Some(path.file_stem()?.to_string_lossy().into_owned())
        })
        .collect();
    names.sort();
    names
}

// ---------------------------------------------------------------------------
// What the voice can and cannot read.
//
// Kokoro looks each word up in a dictionary, and for a word it cannot find it
// falls back to reading the letters out: "restoreth" comes back as "restore, T,
// H" and "kub" as "K, U, B". Nothing in the crate says so -- the only sign is
// in the phonemes -- so this is how the rest of the app finds out, both when
// building the pronunciation lexicon (examples/build_g2p_lexicon.rs) and when
// telling a reader that the spelling they just typed will not be read as a
// word.

/// Stress marks carry no letters; comparing without them is what lets a
/// spelled-out "T" (tˈiː) be recognized wherever it falls in a word.
pub fn bare(phonemes: &str) -> String {
    phonemes.chars().filter(|c| *c != 'ˈ' && *c != 'ˌ').collect()
}

/// The voice's phonemes for each letter of the alphabet, said as a letter.
pub fn letter_sounds() -> BTreeSet<String> {
    ('a'..='z')
        .filter_map(|c| kokoro_en::g2p_audit(&c.to_string(), false).ok())
        .map(|a| bare(&a.phonemes))
        .collect()
}

/// Whether `group` is nothing but letters read out, e.g. "tiːeɪtʃ" = T, H.
pub fn spells_letters(group: &str, letters: &BTreeSet<String>, least: usize) -> bool {
    fn walk(rest: &str, letters: &BTreeSet<String>, depth: usize, least: usize) -> bool {
        if rest.is_empty() {
            return depth >= least;
        }
        letters.iter().any(|letter| match rest.strip_prefix(letter.as_str()) {
            Some(tail) => walk(tail, letters, depth + 1, least),
            None => false,
        })
    }
    walk(group, letters, 0, least)
}

/// Whether the voice would spell part of this text out letter by letter.
///
/// One group that is two letters run together ("T H", "K U B") is the
/// giveaway, as are two separate groups that are each a letter. One group that
/// sounds like a single letter is not enough on its own: "bee" really is said
/// bˈiː, and so is the letter B.
pub fn letter_spelled(phonemes: &str, letters: &BTreeSet<String>) -> bool {
    let groups: Vec<String> = phonemes.split_whitespace().map(bare).collect();
    if groups.iter().any(|g| spells_letters(g, letters, 2)) {
        return true;
    }
    groups.iter().filter(|g| spells_letters(g, letters, 1)).count() >= 2
}

static LETTERS: OnceCell<BTreeSet<String>> = OnceCell::new();

/// Whether the voice would spell `text` out instead of reading it as words.
/// Phonemizing is pure text work -- the model is not loaded for this.
pub fn spells_out(text: &str) -> bool {
    let Ok(said) = kokoro_en::g2p_audit(text, false) else {
        return false;
    };
    letter_spelled(&said.phonemes, LETTERS.get_or_init(letter_sounds))
}

/// Loading the model reads 156 MB and builds an inference session, so it
/// happens once and is kept. The mutex is not for speed -- only one verse is
/// ever being spoken -- but to hand out the engine from a `static` safely.
static ENGINE: OnceCell<Mutex<KokoroTts>> = OnceCell::new();

fn engine(app: &AppHandle) -> anyhow::Result<&'static Mutex<KokoroTts>> {
    ENGINE.get_or_try_init(|| {
        let dir = model_dir(app).context("the app has no resource directory")?;
        let model = dir.join("model.onnx");
        let voices = dir.join("voices");
        anyhow::ensure!(
            model.is_file(),
            "the neural voice is not installed in this build (expected {})",
            model.display()
        );
        let tts = tauri::async_runtime::block_on(KokoroTts::new(
            model.to_string_lossy().as_ref(),
            voices.to_string_lossy().as_ref(),
        ))
        .context("could not load the neural voice model")?;
        Ok(Mutex::new(tts))
    })
}

// ---------------------------------------------------------------------------
// Keeping the model inside its limit.
//
// Kokoro reads 510 phoneme characters at a time. The crate splits a longer line
// for us -- and then hands the model a chunk of exactly that length, which is
// one token more than the voice pack has entries for. The inference call
// indexes past the end of the pack and panics:
//
//     index out of bounds: the len is 510 but the index is 510
//
// So a long passage did not read slowly or badly. It stopped read-aloud where
// it stood, and the reader saw a player that had simply gone quiet. It took a
// paragraph of commentary, or one of the long verses -- Esther 8:9 is 528
// characters and sits right on the line.
//
// The text is therefore cut here, before it reaches that path, into pieces
// whose phonemes are comfortably inside the budget, and their audio is joined
// back into one stretch of speech. Breaks land between sentences wherever the
// text allows, so what the reader hears is unchanged.

/// Phoneme characters per call. The model's limit is 510 and the pack overruns
/// at 509 (the tokenizer adds one either side); this leaves room to spare.
const PHONEME_BUDGET: usize = 480;

/// How long this text is in the units the model counts. Phonemizing is pure
/// text work -- fast, and no model is loaded for it.
fn phoneme_len(text: &str) -> usize {
    kokoro_en::g2p(text, false)
        .map(|phonemes| phonemes.chars().count())
        .unwrap_or_else(|_| text.chars().count())
}

/// One sentence, cut at word boundaries if the model cannot take it whole.
/// Only reached by a sentence longer than the budget on its own.
fn fit_sentence(sentence: &str) -> Vec<String> {
    if phoneme_len(sentence) <= PHONEME_BUDGET {
        return vec![sentence.trim().to_string()];
    }
    let mut out = Vec::new();
    let mut current = String::new();
    for word in sentence.split_whitespace() {
        let candidate = if current.is_empty() { word.to_string() } else { format!("{current} {word}") };
        if !current.is_empty() && phoneme_len(&candidate) > PHONEME_BUDGET {
            out.push(std::mem::take(&mut current));
            current = word.to_string();
        } else {
            current = candidate;
        }
    }
    if !current.is_empty() {
        out.push(current);
    }
    out
}

/// The text in pieces the model can take, whole sentences wherever it can.
pub fn fit_to_model(text: &str) -> Vec<String> {
    if phoneme_len(text) <= PHONEME_BUDGET {
        return vec![text.to_string()];
    }
    let mut out: Vec<String> = Vec::new();
    let mut current = String::new();
    for sentence in kokoro_en::split_sentences(text) {
        for piece in fit_sentence(&sentence) {
            if current.is_empty() {
                current = piece;
            } else if phoneme_len(&format!("{current} {piece}")) <= PHONEME_BUDGET {
                current.push(' ');
                current.push_str(&piece);
            } else {
                out.push(std::mem::take(&mut current));
                current = piece;
            }
        }
    }
    if !current.is_empty() {
        out.push(current);
    }
    out
}

// ---------------------------------------------------------------------------
// Audio that comes back silent.
//
// For some lengths of text the model hands back a buffer of the right duration
// with nothing in it -- every sample zero. It is not random: the same words
// give the same silence every time, another voice says them perfectly, and one
// character more or less is enough to make it speak. The count of tokens is
// what decides it, so it falls wherever it falls: two of the twelve verses in
// Deuteronomy 1 are silent in `af_heart`.
//
// That is what a reader hears as the voice dropping a verse and then carrying
// on as if it had read it -- the player has no way to know, because a silent
// buffer plays for its full length and ends like any other.
//
// So the audio is looked at before it is handed back, and a silent one is asked
// for again with the text nudged by a token: the trailing punctuation off, or a
// full stop on. Neither changes what is said.

/// Whether this audio would be heard as nothing. NaN counts: the model can hand
/// back NaN samples, and the cast into the WAV turns those into zeros anyway.
fn is_silent(samples: &[f32]) -> bool {
    !samples.iter().any(|s| s.is_finite() && s.abs() > 1e-4)
}

/// The same words under a different closing mark, for a second attempt and a
/// third.
///
/// Which mark it is matters as much as how many tokens there are: at one length
/// a semicolon speaks where a full stop is silent, so the ladder changes both.
/// The words themselves are never touched -- only what closes them, which is
/// heard as the pause that ends the passage either way.
fn nudged(text: &str, attempt: usize) -> Option<String> {
    let trimmed = text.trim_end();
    let stripped = trimmed.trim_end_matches(|c: char| ".,;:!?".contains(c)).trim_end();
    if stripped.is_empty() {
        return None;
    }
    // Offered in order, one per attempt, skipping the one already tried.
    ["", ";", ".", ".."]
        .iter()
        .map(|mark| format!("{stripped}{mark}"))
        .filter(|candidate| candidate != trimmed)
        .nth(attempt - 1)
}

/// One piece of text, spoken so that it can actually be heard.
fn speak_piece(tts: &KokoroTts, text: &str, voice: &str, speed: f32) -> anyhow::Result<Vec<f32>> {
    let mut attempt = 0;
    loop {
        let words = if attempt == 0 { text.to_string() } else { nudged(text, attempt).unwrap_or_default() };
        if words.is_empty() {
            anyhow::bail!("the voice returned silence for this passage");
        }
        let (samples, _took) = tauri::async_runtime::block_on(tts.synth(&words, Voice::new(voice).with_speed(speed)))
            .with_context(|| format!("could not speak with the voice '{voice}'"))?;
        if !is_silent(&samples) {
            return Ok(samples);
        }
        attempt += 1;
        if attempt > 3 {
            anyhow::bail!("the voice returned silence for this passage");
        }
    }
}

/// Speaks one verse. Called from a blocking task: synthesis is seconds of CPU
/// work and must never run on the UI thread.
pub fn synthesize(app: &AppHandle, text: &str, voice: &str, speed: f32) -> anyhow::Result<Vec<u8>> {
    let engine = engine(app)?;
    // The old error here said that the voice engine had failed during an
    // earlier verse, which was worth saying and is kept as this note -- but
    // saying it was all this did, and it said it forever. A panic while this
    // guard was held poisoned the mutex, and read-aloud was then dead for the
    // life of the process: every later verse got that same message, including
    // every verse of every chapter the reader opened afterwards.
    //
    // The model behind the guard is loaded weights and nothing else; a verse
    // that panicked partway through synthesis leaves them exactly as they
    // were. So the next verse gets a fresh attempt rather than inheriting the
    // last one's failure, and a bad verse costs one verse.
    let tts = engine.lock().unwrap_or_else(|e| e.into_inner());
    let mut samples: Vec<f32> = Vec::new();
    for piece in fit_to_model(text) {
        samples.append(&mut speak_piece(&tts, &piece, voice, speed)?);
    }
    Ok(wav_bytes(&samples, SAMPLE_RATE))
}

/// Wraps the samples as 16-bit PCM WAV, which is what an `<audio>` element
/// will take directly from a blob.
fn wav_bytes(samples: &[f32], sample_rate: u32) -> Vec<u8> {
    let data_len = (samples.len() * 2) as u32;
    let mut out = Vec::with_capacity(44 + data_len as usize);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&(36 + data_len).to_le_bytes());
    out.extend_from_slice(b"WAVE");
    out.extend_from_slice(b"fmt ");
    out.extend_from_slice(&16u32.to_le_bytes()); // PCM header length
    out.extend_from_slice(&1u16.to_le_bytes()); // uncompressed
    out.extend_from_slice(&1u16.to_le_bytes()); // mono
    out.extend_from_slice(&sample_rate.to_le_bytes());
    out.extend_from_slice(&(sample_rate * 2).to_le_bytes()); // bytes per second
    out.extend_from_slice(&2u16.to_le_bytes()); // bytes per sample frame
    out.extend_from_slice(&16u16.to_le_bytes()); // bits per sample
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data_len.to_le_bytes());
    for sample in samples {
        let clamped = sample.clamp(-1.0, 1.0);
        out.extend_from_slice(&((clamped * i16::MAX as f32) as i16).to_le_bytes());
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The longest verse in the King James, and a paragraph well past anything
    /// Scripture holds. Every piece has to be inside the budget: one that is
    /// not panics inside the model rather than failing, and read-aloud stops.
    #[test]
    fn long_text_is_cut_to_pieces_the_model_can_take() {
        let esther = "Then were the king's scribes called at that time in the third month, that is, the month Sivan, on the three and twentieth day thereof; and it was written according to all that Mordecai commanded unto the Jews, and to the lieutenants, and the deputies and rulers of the provinces which are from India unto Ethiopia, an hundred twenty and seven provinces, unto every province according to the writing thereof, and unto every people after their language, and to the Jews according to their writing, and according to their language.";
        let paragraph = esther.repeat(4);

        for text in [esther, paragraph.as_str()] {
            let pieces = fit_to_model(text);
            assert!(!pieces.is_empty());
            for piece in &pieces {
                assert!(
                    phoneme_len(piece) <= PHONEME_BUDGET,
                    "piece of {} phonemes is over the budget: {piece:?}",
                    phoneme_len(piece)
                );
            }
            // Nothing may be dropped on the way through.
            let rejoined: String = pieces.join(" ").split_whitespace().collect::<Vec<_>>().join(" ");
            let original: String = text.split_whitespace().collect::<Vec<_>>().join(" ");
            assert_eq!(rejoined, original);
        }
    }

    /// A verse the model can take whole is left alone.
    #[test]
    fn a_short_verse_is_one_piece() {
        assert_eq!(fit_to_model("Jesus wept."), vec!["Jesus wept.".to_string()]);
    }

    /// Silence the model sometimes hands back, and the nudges that get around it.
    #[test]
    fn silence_is_recognized_and_nudged() {
        assert!(is_silent(&[0.0; 1000]));
        assert!(is_silent(&[f32::NAN; 100]), "NaN samples become zeros in the WAV");
        assert!(!is_silent(&[0.0, 0.0, 0.3, 0.0]));

        // Taking the punctuation off, then putting different punctuation on:
        // either is a token's difference, and neither changes the words.
        assert_eq!(nudged("alone:", 1).as_deref(), Some("alone"));
        assert_eq!(nudged("alone:", 2).as_deref(), Some("alone;"));
        assert_eq!(nudged("alone:", 3).as_deref(), Some("alone."));
        // A mark already in the text is not offered back as a "different" one.
        assert_eq!(nudged("alone.", 2).as_deref(), Some("alone;"));
        assert_eq!(nudged("alone.", 3).as_deref(), Some("alone.."));
        assert_eq!(nudged("alone", 1).as_deref(), Some("alone;"));
        assert_eq!(nudged("...", 1), None);
    }

    /// What the pronunciation editor warns on.
    #[test]
    fn spelled_out_words_are_recognized() {
        assert!(spells_out("ya-kov"), "the voice spells 'kov' out");
        assert!(!spells_out("ya-cove"), "'cove' is a word it can read");
        assert!(!spells_out("Jacob"));
    }
}
