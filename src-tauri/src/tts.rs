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

use crate::crash_log;
use anyhow::Context;
use kokoro_en::{KokoroTts, Voice};
use once_cell::sync::{Lazy, OnceCell};
use regex::Regex;
use std::collections::{BTreeSet, HashMap};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
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
    ('a'..='z').filter_map(|c| phonemes(&c.to_string())).map(|said| bare(&said)).collect()
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

/// The longest respelling `spells_out` will phonemize to check.
///
/// This used to be `MAX_REQUEST_CHARS`, the size of a passage, and that was a
/// way round everything `fit_to_model` does to keep the phonemizer's input
/// small. Its normalizer does not only panic on a book: on some text a good
/// deal shorter it simply works, and works. A run of digits is the plainest
/// case -- in a release build 400 of them phonemize in a tenth of a second,
/// 1,350 in a third of a second, and 1,450 had not finished after half a
/// minute. (A piece `fit_to_model` makes is at most `PIECE_CHARS`, well short
/// of that.) A panic is caught; a stall is not, and it holds the blocking
/// thread for as long as it lasts. A respelling is a word or two, so this is
/// room for a short phrase and nowhere near where the phonemizer struggles.
const MAX_RESPELLING_CHARS: usize = 100;

/// Whether the voice would spell `text` out instead of reading it as words.
/// Phonemizing is pure text work -- the model is not loaded for this.
///
/// What arrives here is a respelling typed into the pronunciation editor, a
/// word or two. Anything much longer is not one, and is answered "no" rather
/// than phonemized to find out.
pub fn spells_out(text: &str) -> bool {
    if text.chars().count() > MAX_RESPELLING_CHARS {
        return false;
    }
    let Some(said) = phonemes(text) else {
        return false;
    };
    letter_spelled(&said, LETTERS.get_or_init(letter_sounds))
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
// Phonemizing without letting it take the voice down.
//
// Everything the voice says goes through the crate's grapheme-to-phoneme step
// first, and that step can panic. Its text normalizer runs a dozen patterns
// through `fancy_regex`, whose `replace_all` unwraps the search it makes -- and
// that search gives up after a million backtracks. A pattern that finds nothing
// in a million characters has made a million, so any text that long panics:
//
//     called `Result::unwrap()` on an `Err` value: RuntimeError(BacktrackLimitExceeded)
//
// That is what a reader got for pressing play on a library book. A book's text
// is flattened for search, so most of them arrive as one paragraph -- one of
// Edwards's volumes is a single paragraph of eight million characters -- and
// read-aloud handed the whole of it over as one passage. The panic came back
// as "the voice task did not finish", and the book could not be read at all.
//
// Text is now cut small long before it is phonemized (see `fit_to_model`), so
// nothing near that size reaches the crate. But one bad piece must never again
// cost the reader more than that piece, so every call into the phonemizer goes
// through `phonemes`, which catches a panic and hands back nothing: the piece
// is skipped and the rest of the passage is still read.

/// The phonemes for `text`, or `None` if the phonemizer failed on it, by error
/// or by panic. Callers keep what they hand it small; this is the guard for
/// whatever slips through anyway.
fn phonemes(text: &str) -> Option<String> {
    match crash_log::catch_recoverable(|| kokoro_en::g2p(text, false)) {
        Ok(Ok(said)) => Some(said),
        Ok(Err(e)) => {
            eprintln!("[voice] could not phonemize {} characters: {e}", text.chars().count());
            None
        }
        Err(panic) => {
            eprintln!(
                "[voice] the phonemizer panicked on {} characters, which are skipped: {}",
                text.chars().count(),
                panic_message(panic.as_ref())
            );
            None
        }
    }
}

/// What a caught panic said, for the log line written in its place.
fn panic_message(payload: &(dyn std::any::Any + Send)) -> String {
    payload
        .downcast_ref::<&str>()
        .map(|s| s.to_string())
        .or_else(|| payload.downcast_ref::<String>().cloned())
        .unwrap_or_else(|| "(no message)".to_string())
}

// ---------------------------------------------------------------------------
// Text as the voice should get it.
//
// The front end cleans text before sending it (`cleanForSpeech` in
// src/features/tts/textUtils.ts) and these are the same rules. They are
// repeated here because this is the engine that pays when something gets past,
// and what it pays is out of all proportion to the character:
//
// - A rule of long dashes comes back from the phonemizer as the dashes and
//   nothing else. The model renders that as half a second of silence, which
//   `speak_piece` cannot tell from the model's own silent-buffer fault; it asks
//   three more times, and then fails the passage.
// - A zero-width space or a soft hyphen, invisible on the page, splits a word
//   in two for the phonemizer, and both halves are read -- or spelled -- as
//   words of their own.
// - A line of Greek or Hebrew has no phonemes at all, and goes the way of the
//   dashes.
//
// So the text is cleaned first, and a piece with nothing left to say is never
// handed to the model (see `fit_piece`).

/// The most text one request may carry. The front end sends a sentence or two
/// at a time -- 400 characters at most -- so this is generous. What it stops is
/// a chapter or a book arriving as a single request, which would hold the
/// voice, and every passage queued behind it, for minutes.
const MAX_REQUEST_CHARS: usize = 5_000;

/// Rules, blanks and leaders: two or more long dashes, three or more hyphens,
/// underscores or asterisks (spaced or not: "* * *"), four or more dots, and
/// more than one ellipsis character. A single dash is punctuation and stays, as
/// does an ellipsis of three dots -- the voice pauses on it, as a reader would.
static RULES: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"[‒–—―]{2,}|[-‐‑_]{3,}|(?:\*\s*){3,}|(?:\.\s?){4,}|…{2,}").expect("rules pattern"));

/// Characters that take up no room on the page and mean nothing said aloud:
/// zero-width spaces and joiners, direction marks, the word joiner, a
/// byte-order mark, a soft hyphen, and control characters that are not
/// whitespace.
fn is_invisible(c: char) -> bool {
    matches!(
        c,
        '\u{00AD}'
            | '\u{200B}'..='\u{200F}'
            | '\u{202A}'..='\u{202E}'
            | '\u{2060}'..='\u{2064}'
            | '\u{2066}'..='\u{2069}'
            | '\u{FEFF}'
    ) || (c.is_control() && !c.is_whitespace())
}

/// The text with what cannot be said taken out and its spacing made plain.
pub fn clean_for_speech(text: &str) -> String {
    let visible: String = text.chars().filter(|c| !is_invisible(*c)).collect();
    RULES.replace_all(&visible, " ").split_whitespace().collect::<Vec<_>>().join(" ")
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
//
// The first way of cutting it had two faults of its own. It measured by adding
// a word at a time and phonemizing the whole growing piece again after each
// one, which is quadratic: a 2,000-character paragraph took most of a minute in
// a debug build, and a book would never have finished. And it cut only at
// spaces, so a run with no space in it -- a web address, a name run together
// in a transliteration -- stayed one "word" however many phonemes it came to (a
// spelled-out letter is four of them), and went on to panic the model exactly
// as before.
//
// Now the cutting is done by characters, which costs next to nothing: pieces of
// whole sentences up to `PIECE_CHARS`, or failing that cut at a clause, then at
// a space, and in a run with no space at all at the limit itself. Each piece is
// phonemized once. One that comes out over the budget anyway -- figures read
// out in words, an abbreviation spelled letter by letter -- is cut again in
// proportion to how far over it came, and the parts are measured in turn. So
// almost all text is phonemized exactly once, and never more than a few
// hundred characters of it at a time.

/// Phoneme characters per call. The model's limit is 510 and the pack overruns
/// at 509 (the tokenizer adds one either side); this leaves room to spare.
const PHONEME_BUDGET: usize = 480;

/// Characters gathered into a piece before it is measured. English comes out of
/// the phonemizer at about a phoneme a character (Esther 8:9 is 528 characters
/// and 541 phonemes), so a piece this long is usually a little over 400
/// phonemes: inside the budget, with room for words that say longer than they
/// look. It is also the length of the pieces the front end sends
/// (`SPEECH_PIECE_CHARS`), so one of those is usually measured once and spoken
/// whole.
const PIECE_CHARS: usize = 400;

/// What a piece that came out over the budget is re-cut to aim at: well under
/// it, because a cut made by counting characters can only be proportional.
const PHONEME_AIM: usize = 420;

/// How long this text is in the units the model counts, as the tests check
/// it. Text the phonemizer cannot take at all counts as its length in
/// characters.
#[cfg(test)]
fn phoneme_len(text: &str) -> usize {
    phonemes(text).map(|said| said.chars().count()).unwrap_or_else(|| text.chars().count())
}

/// How many phoneme characters the model would be handed for this piece, or
/// `Some(0)` when none of them is a sound -- nothing but punctuation, which is
/// what dashes, and Greek and Hebrew, come back as. `None` when the phonemizer
/// failed on it.
fn spoken_len(text: &str) -> Option<usize> {
    let said = phonemes(text)?;
    if !said.chars().any(char::is_alphabetic) {
        return Some(0);
    }
    Some(said.chars().count())
}

/// How good a place a space is to end a piece: after a sentence, after a
/// clause, or merely between two words. Ordered, so the best is the greatest.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum Break {
    Word,
    Clause,
    Sentence,
}

/// Abbreviations whose full stop does not end a sentence -- the front end's
/// list, so both halves of read-aloud agree on where a sentence ends.
const ABBREVIATIONS: &[&str] = &[
    "mr", "mrs", "ms", "dr", "st", "sr", "jr", "rev", "revd", "prof", "mt", "ver", "vs", "viz", "cf", "ch", "chap", "vol",
    "vols", "ed", "eds", "p", "pp", "nos", "v", "vv", "ib", "ibid", "sect", "sec", "fig", "e.g", "i.e", "etc", "al", "ps",
    "gen", "ex", "exod", "lev", "num", "deut", "josh", "judg", "sam", "kgs", "chron", "neh", "esth", "prov", "eccl",
    "eccles", "isa", "jer", "lam", "ezek", "dan", "hos", "obad", "mic", "nah", "hab", "zeph", "hag", "zech", "mal", "matt",
    "mk", "lk", "jn", "rom", "cor", "gal", "eph", "phil", "col", "thess", "tim", "tit", "philem", "heb", "jas", "pet",
    "jude",
];

/// Whether the full stop at `dot` in `window` ends a sentence, given the space
/// at `space` after it. Not after a known abbreviation or a single letter
/// ("J. Calvin"), and not when the next word starts with a small letter or a
/// digit ("ch. 4").
fn stop_ends_sentence(window: &[(usize, char)], dot: usize, space: usize) -> bool {
    let word_start = window[..dot]
        .iter()
        .rposition(|&(_, c)| !(c.is_ascii_alphabetic() || c == '.'))
        .map_or(0, |i| i + 1);
    let word: String = window[word_start..dot].iter().map(|&(_, c)| c.to_ascii_lowercase()).collect();
    if word.chars().count() == 1 || ABBREVIATIONS.contains(&word.as_str()) {
        return false;
    }
    let next = window[space..].iter().map(|&(_, c)| c).find(|c| !c.is_whitespace());
    !next.is_some_and(|c| c.is_lowercase() || c.is_ascii_digit())
}

/// What kind of break the space at `space` in `window` would make.
fn break_at(window: &[(usize, char)], space: usize) -> Break {
    // A closing quotation mark or bracket stays with what it closes.
    let mut mark = space;
    while mark > 0 && "\"')]\u{2019}\u{201D}".contains(window[mark - 1].1) {
        mark -= 1;
    }
    let Some(before) = mark.checked_sub(1) else {
        return Break::Word;
    };
    match window[before].1 {
        '!' | '?' | '…' => Break::Sentence,
        '.' if stop_ends_sentence(window, before, space) => Break::Sentence,
        ',' | ';' | ':' | '—' | '–' => Break::Clause,
        _ => Break::Word,
    }
}

/// Where to end the first piece of `text` so that it holds at most `max_chars`
/// characters, as a byte offset -- or `None` when the whole of it fits.
///
/// The best break in reach wins, and the latest of those: so a piece is as many
/// whole sentences as fit, or failing that runs to a clause, or to a word. A
/// break in the first third is passed over for a worse one later on, or pieces
/// would come out a few words long. With no space in reach at all, the cut is
/// made at the limit itself.
///
/// Only the first `max_chars` characters are looked at, so cutting a whole
/// book costs a pass or two over it, not one per piece.
fn cut_point(text: &str, max_chars: usize) -> Option<usize> {
    let max_chars = max_chars.max(1);
    let window: Vec<(usize, char)> = text.char_indices().take(max_chars + 1).collect();
    if window.len() <= max_chars {
        return None;
    }
    let mut best: Option<(Break, usize)> = None;
    for space in (max_chars / 3).max(1)..=max_chars {
        if !window[space].1.is_whitespace() {
            continue;
        }
        let kind = break_at(&window, space);
        if best.is_none_or(|(so_far, _)| kind >= so_far) {
            best = Some((kind, space));
        }
    }
    Some(window[best.map_or(max_chars, |(_, space)| space)].0)
}

/// `text` cut into pieces of at most `max_chars` characters, at the best breaks
/// `cut_point` finds. Nothing is lost but the spaces cut at: the pieces of a run
/// with no spaces in it join back up into the run.
fn char_pieces(text: &str, max_chars: usize) -> Vec<&str> {
    let mut pieces = Vec::new();
    let mut rest = text.trim();
    while let Some(at) = cut_point(rest, max_chars) {
        let (piece, tail) = rest.split_at(at);
        let piece = piece.trim_end();
        if !piece.is_empty() {
            pieces.push(piece);
        }
        rest = tail.trim_start();
    }
    if !rest.is_empty() {
        pieces.push(rest);
    }
    pieces
}

/// What becomes of a text on its way to the model: the pieces to be spoken,
/// and how many the voice failed on and left out.
///
/// Both are needed because a text can come out with no pieces two ways that
/// must not be confused. Text with nothing in it to say -- a rule of dashes, a
/// line of Greek -- is answered with a moment of quiet, and the reading moves
/// on. Text the phonemizer failed on is a passage the reader did not hear, and
/// has to be reported as one: when the two were counted alike, a phonemizer
/// that failed on everything -- set to insist on eSpeak where there is none,
/// say -- turned every passage into a twentieth of a second of silence, and the
/// reading raced to the end of the book as if it had read it all.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Plan {
    pub pieces: Vec<String>,
    pub failed: usize,
}

/// What `synthesize` says when the voice failed on every piece of a passage.
/// Not the silence wording: the front end takes that for a passage with
/// nothing to say, and this is a passage it could not read.
const UNREADABLE: &str = "the voice could not read this passage";

impl Plan {
    /// The pieces to speak -- none, for a passage with nothing to say -- or
    /// an error when there are none because the voice failed on all of them.
    /// A passage that lost some pieces and kept others is read without them.
    fn into_request(self) -> anyhow::Result<Vec<String>> {
        if self.pieces.is_empty() && self.failed > 0 {
            anyhow::bail!(UNREADABLE);
        }
        Ok(self.pieces)
    }
}

/// One piece, measured, and then kept, cut again, or left out.
fn fit_piece(piece: &str, measure: &mut dyn FnMut(&str) -> Option<usize>, plan: &mut Plan) {
    match measure(piece) {
        // The phonemizer failed on it, and `phonemes` has already said so.
        None => plan.failed += 1,
        // Nothing to say: the model would render it as silence, and
        // `speak_piece` would take that for a fault.
        Some(0) => {}
        Some(len) if len <= PHONEME_BUDGET => plan.pieces.push(piece.to_string()),
        Some(len) => {
            let chars = piece.chars().count();
            let aim = chars * PHONEME_AIM / len;
            // Only a single character is too short to cut, and no character
            // says 480 phonemes; this is here so that no input, however
            // strange, can keep the cutting going round for ever.
            if aim == 0 || aim >= chars {
                eprintln!("[voice] skipped {chars} characters that say more than the voice can take at once");
                plan.failed += 1;
                return;
            }
            for part in char_pieces(piece, aim) {
                fit_piece(part, measure, plan);
            }
        }
    }
}

/// The text, cleaned, in pieces the model can take: whole sentences wherever
/// it can, every piece inside the budget, and none with nothing to say.
///
/// Each piece is phonemized once. Text that says the same thing more than once
/// -- a refrain, or a test's paragraph repeated to the length of a book --
/// phonemizes each distinct piece only the first time it comes up.
pub fn fit_to_model(text: &str) -> Plan {
    let mut measured: HashMap<String, Option<usize>> = HashMap::new();
    let mut measure = |piece: &str| -> Option<usize> {
        if let Some(known) = measured.get(piece) {
            return *known;
        }
        let len = spoken_len(piece);
        measured.insert(piece.to_string(), len);
        len
    };
    plan_pieces(&clean_for_speech(text), &mut measure)
}

/// The cutting itself, with the measuring handed in -- so a test can count
/// what gets measured, and how much of it, without the phonemizer.
fn plan_pieces(clean: &str, measure: &mut dyn FnMut(&str) -> Option<usize>) -> Plan {
    let mut plan = Plan::default();
    for piece in char_pieces(clean, PIECE_CHARS) {
        fit_piece(piece, measure, &mut plan);
    }
    plan
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

/// What `speak_piece` says when every attempt came back silent. The front end
/// knows this failure by its wording (`nothingToSay` in src/state/ttsStore.ts)
/// and treats it as a passage with nothing in it rather than a voice that has
/// broken, so the words matter.
const SILENCE: &str = "the voice returned silence for this passage";

/// One piece of text, spoken so that it can actually be heard.
///
/// The model call is made under `catch_recoverable`. The model is the other
/// place in the crate that panics -- the pack overrun described above is one
/// way, and there may be others no test has found -- and a panic there is the
/// end of this piece, not of the passage it belongs to.
///
/// `overtaken` is asked before every attempt after the first: a passage the
/// reader has moved away from is not worth three more renders of silence.
fn speak_piece(tts: &KokoroTts, text: &str, voice: &str, speed: f32, overtaken: &dyn Fn() -> bool) -> anyhow::Result<Vec<f32>> {
    let key = silence_key(text, voice, speed);
    let known = SILENT_PIECES.lock().unwrap_or_else(|e| e.into_inner()).get(&key).copied();
    for (tried, attempt) in attempt_order(known).into_iter().enumerate() {
        if tried > 0 && overtaken() {
            anyhow::bail!(OVERTAKEN);
        }
        let words = if attempt == 0 { text.to_string() } else { nudged(text, attempt).unwrap_or_default() };
        if words.is_empty() {
            break;
        }
        let rendered = crash_log::catch_recoverable(|| {
            tauri::async_runtime::block_on(tts.synth(&words, Voice::new(voice).with_speed(speed)))
        });
        let (samples, _took) = match rendered {
            Ok(result) => result.with_context(|| format!("could not speak with the voice '{voice}'"))?,
            Err(panic) => anyhow::bail!("the voice stopped partway through this passage ({})", panic_message(panic.as_ref())),
        };
        if !is_silent(&samples) {
            if attempt != 0 {
                remember_silence(key, Some(attempt));
            }
            return Ok(samples);
        }
    }
    // Every attempt was silent -- or, for a piece met before, nothing brought
    // it to speak then either, and no render was spent finding that out again.
    if known.is_none() {
        remember_silence(key, None);
    }
    anyhow::bail!(SILENCE)
}

// Silences already met.
//
// A silence is the same every time for the same words in the same voice, so a
// piece that was silent once is silent again -- and a reader goes back over a
// passage often: a jump back, Previous, a chapter heard twice. Each time it
// cost a render of silence before the nudge that speaks, and the retest found
// those inside a jump's wait (a piece rendered twice, eleven seconds in a
// debug build). So the nudge that spoke is remembered and asked for first the
// next time, and a piece nothing could bring to speak is not asked again.

/// What was learned of a silent piece: the attempt that spoke (see `nudged`),
/// or `None` when none did. Pieces that spoke the first time are not kept.
static SILENT_PIECES: Lazy<Mutex<HashMap<String, Option<usize>>>> = Lazy::new(|| Mutex::new(HashMap::new()));

/// The most silences kept; past it the memory starts again. Each is one
/// sentence, and a few hundred is days of listening.
const MOST_SILENCES_KEPT: usize = 512;

fn silence_key(text: &str, voice: &str, speed: f32) -> String {
    format!("{voice}\u{0}{}\u{0}{text}", speed.to_bits())
}

fn remember_silence(key: String, spoke_at: Option<usize>) {
    let mut kept = SILENT_PIECES.lock().unwrap_or_else(|e| e.into_inner());
    if kept.len() >= MOST_SILENCES_KEPT {
        kept.clear();
    }
    kept.insert(key, spoke_at);
}

/// The attempts to make for a piece, in order: as printed and then each nudge
/// -- or, for a piece met before, the nudge that spoke first (the others after
/// it, should it not speak this time), and none at all for one that never did.
fn attempt_order(known: Option<Option<usize>>) -> Vec<usize> {
    match known {
        None => vec![0, 1, 2, 3],
        Some(None) => Vec::new(),
        Some(Some(spoke)) => std::iter::once(spoke).chain((0..=3).filter(|a| *a != spoke)).collect(),
    }
}

/// Every piece, spoken one after another into one stretch of audio.
///
/// A piece that cannot be said is left out and the rest are still read: a
/// reader who pressed play on a page of commentary hears the page with one
/// sentence missing, rather than nothing and an error. Only when not one piece
/// could be said is the passage a failure -- and then a real failure is the one
/// reported over a silence, since it says more about what went wrong.
///
/// A request overtaken by a newer one (see `LATEST_TURN`) stops before its
/// next piece, and its audio is not wanted: it is an error, not a passage
/// with pieces missing.
///
/// Takes the speaking as a function so the choosing can be tested without a
/// model loaded.
fn speak_all(
    pieces: &[String],
    overtaken: &dyn Fn() -> bool,
    mut speak: impl FnMut(&str) -> anyhow::Result<Vec<f32>>,
) -> anyhow::Result<Vec<f32>> {
    let mut samples: Vec<f32> = Vec::new();
    let mut spoken = 0;
    let mut failure: Option<anyhow::Error> = None;
    for piece in pieces {
        if overtaken() {
            anyhow::bail!(OVERTAKEN);
        }
        match speak(piece) {
            Ok(mut audio) => {
                samples.append(&mut audio);
                spoken += 1;
            }
            Err(e) if e.to_string() == OVERTAKEN => return Err(e),
            Err(e) => {
                eprintln!("[voice] skipped {} characters it could not say: {e:#}", piece.chars().count());
                if failure.as_ref().is_none_or(|kept| kept.to_string() == SILENCE) {
                    failure = Some(e);
                }
            }
        }
    }
    if spoken == 0 {
        return Err(failure.unwrap_or_else(|| anyhow::anyhow!(SILENCE)));
    }
    Ok(samples)
}

/// What a request with nothing in it to say gets back: a twentieth of a second
/// of quiet. It plays, it ends, and the reading moves on. An error would have
/// counted against the passage as a failure, and asking the model would have
/// cost a render to produce the same silence -- and then three more, as
/// `speak_piece` tried to get words out of it.
fn nothing_to_say() -> Vec<f32> {
    vec![0.0; SAMPLE_RATE as usize / 20]
}

/// The request as the model will be handed it: refused if it is too long to
/// be one, and otherwise cleaned and cut to pieces -- none at all when there is
/// nothing in it to say, and an error when the voice failed on every piece.
/// Text work only, done before the engine is loaded or locked.
fn plan_request(text: &str) -> anyhow::Result<Vec<String>> {
    let length = text.chars().count();
    anyhow::ensure!(
        length <= MAX_REQUEST_CHARS,
        "this passage is too long for the voice to read in one go ({length} characters, where it takes up to {MAX_REQUEST_CHARS})"
    );
    fit_to_model(text).into_request()
}

// ---------------------------------------------------------------------------
// Requests the reader has moved away from.
//
// The voice renders one request at a time (the engine sits behind one lock),
// and a render cannot be stopped once the model is running. A reader who
// jumped to another passage, or pressed Stop and started another book, waited
// for whatever was already rendering -- often the passage after the one they
// left, asked for ahead of time -- and when that came back silent it was asked
// for again, and again: twelve and fifteen seconds of waiting in a debug build.
//
// So each request carries the reading's turn, a number the front end moves on
// whenever it lets go of a render already sent (src/features/tts/ttsEngine.ts,
// `RenderQueue`), and sends the next request at once rather than behind it. A
// request that finds a later turn has arrived stops at the next place it can:
// before it takes the engine, between pieces, and before a silent piece's
// retries. The model call under way still runs to its end.

/// The latest turn any request has carried.
static LATEST_TURN: AtomicU64 = AtomicU64::new(0);

/// What an overtaken request fails with. The front end has already let go of
/// it, and never shows this.
const OVERTAKEN: &str = "a later passage was asked for";

/// Notes that a request of `turn` has arrived; later requests overtake the
/// earlier ones.
fn arrive(turn: Option<u64>) {
    if let Some(turn) = turn {
        LATEST_TURN.fetch_max(turn, Ordering::SeqCst);
    }
}

/// Whether a request of `turn` has been overtaken. A request with no turn
/// never is.
fn overtaken(turn: Option<u64>) -> bool {
    turn.is_some_and(|turn| turn < LATEST_TURN.load(Ordering::SeqCst))
}

/// Speaks one passage. Called from a blocking task: synthesis is seconds of CPU
/// work and must never run on the UI thread. `turn` is the reading's turn when
/// the request was sent (see `LATEST_TURN`).
pub fn synthesize(app: &AppHandle, text: &str, voice: &str, speed: f32, turn: Option<u64>) -> anyhow::Result<Vec<u8>> {
    arrive(turn);
    let pieces = plan_request(text)?;
    // Nothing to say -- a failure to say it has already been returned above.
    if pieces.is_empty() {
        return Ok(wav_bytes(&nothing_to_say(), SAMPLE_RATE));
    }
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
    // last one's failure, and a bad verse costs one verse. (A panic in the
    // model is now caught inside `speak_piece`, while the guard is still held,
    // so this should no longer happen -- but a poisoned lock is still no
    // reason to stop reading.)
    let tts = engine.lock().unwrap_or_else(|e| e.into_inner());
    let stale = || overtaken(turn);
    // Overtaken while it waited for the engine: the render that held it was
    // this request's reason to wait, and the next one's too.
    if stale() {
        anyhow::bail!(OVERTAKEN);
    }
    let samples = speak_all(&pieces, &stale, |piece| speak_piece(&tts, piece, voice, speed, &stale))?;
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

    /// The longest verse in the King James.
    const ESTHER_8_9: &str = "Then were the king's scribes called at that time in the third month, that is, the month Sivan, on the three and twentieth day thereof; and it was written according to all that Mordecai commanded unto the Jews, and to the lieutenants, and the deputies and rulers of the provinces which are from India unto Ethiopia, an hundred twenty and seven provinces, unto every province according to the writing thereof, and unto every people after their language, and to the Jews according to their writing, and according to their language.";

    /// The words of `text`, spaced plainly, for checking that none were lost.
    fn words(text: &str) -> String {
        text.split_whitespace().collect::<Vec<_>>().join(" ")
    }

    /// Every piece inside the budget, measured as the model will count it.
    ///
    /// Each distinct piece is measured once: a debug build phonemizes at about
    /// a third of a millisecond a character, and the long tests below are one
    /// paragraph repeated, so their pieces repeat too.
    fn assert_within_budget(pieces: &[String]) {
        let distinct: BTreeSet<&String> = pieces.iter().collect();
        for piece in distinct {
            let len = phoneme_len(piece);
            assert!(len <= PHONEME_BUDGET, "piece of {len} phonemes is over the budget: {piece:?}");
        }
    }

    /// The longest verse in the King James, and a paragraph well past anything
    /// Scripture holds. Every piece has to be inside the budget: one that is
    /// not panics inside the model rather than failing, and read-aloud stops.
    #[test]
    fn long_text_is_cut_to_pieces_the_model_can_take() {
        let paragraph = ESTHER_8_9.repeat(4);

        for text in [ESTHER_8_9, paragraph.as_str()] {
            let pieces = fit_to_model(text).pieces;
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
        assert_eq!(fit_to_model("Jesus wept.").pieces, vec!["Jesus wept.".to_string()]);
    }

    /// A piece met silent before starts at the nudge that spoke, and one that
    /// never spoke is not asked again.
    #[test]
    fn a_silence_met_before_is_not_rendered_again() {
        assert_eq!(attempt_order(None), vec![0, 1, 2, 3]);
        assert_eq!(attempt_order(Some(Some(2))), vec![2, 0, 1, 3]);
        assert!(attempt_order(Some(None)).is_empty());
        assert_ne!(silence_key("Selah.", "af_heart", 1.0), silence_key("Selah.", "af_heart", 1.1));
        assert_ne!(silence_key("Selah.", "af_heart", 1.0), silence_key("Selah.", "am_adam", 1.0));
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

    /// The editor's check phonemizes a respelling, not a passage. Past
    /// `MAX_RESPELLING_CHARS` it answers "no" without phonemizing anything --
    /// seen here in text the voice would spell out if it looked, but is not
    /// asked to. What it guards against is not seen here: a run of digits a
    /// little longer than a page of them that stalls the phonemizer outright.
    #[test]
    fn a_respelling_the_length_of_a_passage_is_not_phonemized_to_check_it() {
        let short = "ya-kov ".repeat(14);
        let long = "ya-kov ".repeat(15);
        assert!(short.chars().count() <= MAX_RESPELLING_CHARS && long.chars().count() > MAX_RESPELLING_CHARS);
        assert!(spells_out(&short), "short enough to check, and spelled out");
        assert!(!spells_out(&long), "too long to be a respelling, so not checked");
        // The digits that stall the phonemizer are answered at once.
        assert!(!spells_out(&"1234567890".repeat(150)));
    }

    /// A library book as read-aloud used to get it: flattened for search into
    /// one paragraph, here a quarter of a million characters of it. It has to
    /// be cut without the re-measuring that made the first cutter quadratic --
    /// that one would not have finished this -- with every piece inside the
    /// budget and not a word lost.
    #[test]
    fn a_book_with_no_paragraph_breaks_is_cut_to_pieces_the_model_can_take() {
        let prose = format!(
            "{ESTHER_8_9} And Mr. Edwards observes (see ch. 4, p. 112) that the saints \"are not their own.\" Is it so? It is so! "
        );
        let book = prose.repeat(250_000 / prose.len() + 1);
        assert!(book.len() > 250_000 && !book.contains('\n'));

        let started = std::time::Instant::now();
        let pieces = fit_to_model(&book).pieces;
        eprintln!("{} characters cut into {} pieces in {:?}", book.len(), pieces.len(), started.elapsed());

        assert!(pieces.len() > 500);
        assert!(pieces.iter().all(|piece| piece.chars().count() <= PIECE_CHARS));
        assert_within_budget(&pieces);
        assert_eq!(words(&pieces.join(" ")), words(&book));
    }

    /// The cutting measures the text about once, however long it is. Counted
    /// with a stand-in for the phonemizer that says a digit as eight phonemes,
    /// the way figures come out read in words -- so some pieces do come out
    /// over the budget and have to be cut and measured again.
    #[test]
    fn cutting_a_book_measures_it_about_once() {
        fn said_with_figures_long(piece: &str) -> usize {
            piece.chars().map(|c| if c.is_ascii_digit() { 8 } else { 1 }).sum()
        }
        let book = clean_for_speech(&format!("{ESTHER_8_9} In 1611 and 1612 and 1613 the work went on. ").repeat(200));
        let length = book.chars().count();

        let mut measured_chars = 0;
        let mut calls = 0;
        let pieces = plan_pieces(&book, &mut |piece: &str| {
            calls += 1;
            measured_chars += piece.chars().count();
            Some(said_with_figures_long(piece))
        })
        .pieces;

        assert!(measured_chars <= 2 * length, "measured {measured_chars} characters of a {length}-character text");
        assert!(calls < 2 * pieces.len(), "{calls} measurements for {} pieces", pieces.len());
        assert!(pieces.iter().all(|piece| said_with_figures_long(piece) <= PHONEME_BUDGET));
        assert_eq!(words(&pieces.join(" ")), words(&book));
    }

    /// A run with no space in it -- Isaiah's Maher-shalal-hash-baz run together,
    /// over and over, to 2,000 characters -- is read letter by letter, at four
    /// phonemes a letter. Cut only at spaces it stayed one "word" and panicked
    /// the model; now it is cut by characters until each part fits.
    #[test]
    fn a_run_with_no_spaces_is_cut_until_each_part_fits() {
        let run: String = "Mahershalalhashbaz".repeat(112).chars().take(2_000).collect();
        let pieces = fit_to_model(&run).pieces;
        assert!(pieces.len() > 5, "{} pieces", pieces.len());
        assert_within_budget(&pieces);
        assert_eq!(pieces.concat(), run, "the parts join back up into the run");
    }

    /// Where pieces end, at a small scale: after as many whole sentences as
    /// fit, then at a clause, then between words, and inside a word only when
    /// there is no space to cut at.
    #[test]
    fn pieces_end_after_sentences_then_clauses_then_words() {
        assert_eq!(
            char_pieces("Jesus wept. Then said the Jews, Behold how he loved him!", 30),
            vec!["Jesus wept.", "Then said the Jews,", "Behold how he loved him!"]
        );
        // A closing quotation mark stays with the sentence it closes.
        assert_eq!(
            char_pieces("He said, \"Follow me.\" And they left their nets.", 25),
            vec!["He said, \"Follow me.\"", "And they left their nets."]
        );
        // "Mr." is not the end of a sentence, so the one before it is.
        assert_eq!(char_pieces("It is so. He came to Mr. Edwards.", 26)[0], "It is so.");
        // No space anywhere: cut at the limit, by characters, not bytes.
        assert_eq!(char_pieces("abcdefghij", 4), vec!["abcd", "efgh", "ij"]);
        assert_eq!(char_pieces("ἀρχῇἀρχῇἀρχῇ", 5).concat(), "ἀρχῇἀρχῇἀρχῇ");
        assert!(char_pieces("ἀρχῇἀρχῇἀρχῇ", 5).iter().all(|piece| piece.chars().count() <= 5));
        // Short enough already: left as it is.
        assert_eq!(char_pieces("  Jesus wept.  ", 400), vec!["Jesus wept."]);
        assert!(char_pieces("   ", 400).is_empty());
    }

    /// What the voice cannot say is cleaned out, and a piece with nothing left
    /// to say is never handed to the model: rendered, it came back as half a
    /// second of silence, which was asked for three more times and then failed
    /// the passage.
    #[test]
    fn what_cannot_be_said_is_cleaned_away_or_left_out() {
        // Invisible characters go, and a word with one inside is whole again.
        assert_eq!(clean_for_speech("be\u{00AD}hold\u{200B} the\u{FEFF} Lamb\u{200D}"), "behold the Lamb");
        // Rules, blanks and leaders become a space; a dash and an ellipsis stay.
        assert_eq!(clean_for_speech("Contents ........ 5"), "Contents 5");
        assert_eq!(clean_for_speech("end ——— begin"), "end begin");
        assert_eq!(clean_for_speech("end --- begin ___ * * * again"), "end begin again");
        assert_eq!(clean_for_speech("Jesus wept — and... then"), "Jesus wept — and... then");
        assert_eq!(clean_for_speech("  line\n\n  two\t"), "line two");

        for nothing in [
            "Ἐν ἀρχῇ ἦν ὁ λόγος, καὶ ὁ λόγος ἦν πρὸς τὸν θεόν.",
            "בְּרֵאשִׁית בָּרָא אֱלֹהִים",
            "——————",
            "— — —",
            "\u{200B}\u{200D}\u{FEFF}",
            "* * * * *",
            ". . . . . .",
            "",
        ] {
            // Nothing to say, and nothing failed: this is not a passage the
            // voice could not read.
            assert_eq!(fit_to_model(nothing), Plan::default(), "{nothing:?} should have nothing to say");
            assert!(plan_request(nothing).unwrap().is_empty());
        }
        // Such a request is answered with a moment of quiet, not an error.
        assert_eq!(wav_bytes(&nothing_to_say(), SAMPLE_RATE).len(), 44 + 2 * 1_200);

        // Greek inside English stays in the piece, and the English is read.
        assert_eq!(fit_to_model("The Word (λόγος) was God.").pieces, vec!["The Word (λόγος) was God.".to_string()]);
    }

    /// The panic a reader actually hit, reproduced: a million characters with
    /// no line break is more than the phonemizer's normalizer can search, and
    /// the crate unwraps the error. The cutting never hands the phonemizer
    /// anything near that size, and the guard catches it if anything does.
    #[test]
    fn the_phonemizer_panic_on_a_whole_book_is_never_reached_and_caught_if_it_is() {
        let book = "and the Word was with God, ".repeat(1_100_000 / 27 + 1);
        assert!(book.chars().count() > 1_000_000);

        // kokoro-en 0.1.5 panics here. If an upgrade stops it doing so, this
        // says the workaround is no longer what stands between a reader and
        // that panic -- not that anything is broken.
        let raw = std::panic::catch_unwind(|| kokoro_en::g2p(&book, false));
        assert!(!matches!(raw, Ok(Ok(_))), "the crate's own g2p was expected to fail on a million characters");

        assert_eq!(phonemes(&book), None, "the guard hands back nothing rather than panicking");

        let plan = fit_to_model(&book);
        assert_eq!(plan.failed, 0);
        assert_within_budget(&plan.pieces);
        assert_eq!(words(&plan.pieces.join(" ")), words(&book));
    }

    /// A passage the phonemizer failed on is not a passage with nothing to
    /// say. Both come out with no pieces; only the second may be answered with
    /// a moment of quiet. The first is an error, and in words the front end
    /// does not take for a silence -- or a phonemizer failing on everything
    /// would have the reading race through a book in twentieths of a second.
    #[test]
    fn a_passage_the_phonemizer_failed_on_is_an_error_not_a_silence() {
        let failed = plan_pieces(ESTHER_8_9, &mut |_: &str| None);
        assert!(failed.pieces.is_empty() && failed.failed > 0, "{failed:?}");
        let refused = failed.into_request().unwrap_err().to_string();
        assert_eq!(refused, UNREADABLE);
        assert!(!refused.contains("returned silence"), "the front end would take this for nothing to say");

        // Too many phonemes in too few characters to cut is a failure too.
        let unsayable = plan_pieces("x", &mut |_: &str| Some(10 * PHONEME_BUDGET));
        assert_eq!(unsayable, Plan { pieces: Vec::new(), failed: 1 });
        assert!(unsayable.into_request().is_err());

        // Nothing to say, and nothing failed: quiet, not an error.
        let quiet = plan_pieces(ESTHER_8_9, &mut |_: &str| Some(0));
        assert_eq!(quiet, Plan::default());
        assert!(quiet.into_request().unwrap().is_empty());

        // Some failed and some did not: the rest are read. Esther 8:9 is two
        // pieces; the first fails here, and the second is still spoken.
        let mut first = true;
        let partial = plan_pieces(ESTHER_8_9, &mut |piece: &str| {
            let fails = std::mem::replace(&mut first, false);
            if fails { None } else { Some(piece.chars().count()) }
        });
        assert_eq!(partial.failed, 1);
        assert_eq!(partial.into_request().unwrap(), vec![char_pieces(ESTHER_8_9, PIECE_CHARS)[1].to_string()]);
    }

    /// A chapter sent as one request is refused before any work is done on it,
    /// instead of holding the voice for minutes.
    #[test]
    fn a_request_the_size_of_a_chapter_is_refused() {
        let chapter = "In the beginning God created the heaven and the earth. ".repeat(100);
        let refused = plan_request(&chapter).unwrap_err().to_string();
        assert!(refused.contains("too long"), "{refused}");
        assert_eq!(plan_request(ESTHER_8_9).unwrap().len(), 2);
    }

    /// One piece the voice cannot say costs that piece, and the rest are read.
    /// Only when none can be said is the passage a failure -- and then a real
    /// failure is reported over a silence.
    #[test]
    fn a_piece_that_cannot_be_said_costs_that_piece_and_no_more() {
        let pieces: Vec<String> = ["one", "two", "three"].iter().map(|s| s.to_string()).collect();

        let heard = speak_all(&pieces, &|| false, |piece| -> anyhow::Result<Vec<f32>> {
            if piece == "two" {
                anyhow::bail!("the voice stopped partway through this passage (index out of bounds)");
            }
            Ok(vec![0.5; piece.len()])
        })
        .unwrap();
        assert_eq!(heard.len(), "one".len() + "three".len());

        let failed = speak_all(&pieces, &|| false, |piece| -> anyhow::Result<Vec<f32>> {
            if piece == "two" {
                anyhow::bail!("could not speak with the voice 'af_nobody'");
            }
            anyhow::bail!(SILENCE)
        })
        .unwrap_err();
        assert_eq!(failed.to_string(), "could not speak with the voice 'af_nobody'");

        let silent = speak_all(&pieces, &|| false, |_| -> anyhow::Result<Vec<f32>> { anyhow::bail!(SILENCE) }).unwrap_err();
        assert_eq!(silent.to_string(), SILENCE, "the front end knows a silence by these words");
    }

    /// A request overtaken by a later one stops before its next piece, and
    /// says so, rather than hand back a passage with pieces missing.
    #[test]
    fn an_overtaken_request_stops_before_its_next_piece() {
        let pieces: Vec<String> = ["one", "two", "three"].iter().map(|s| s.to_string()).collect();
        let moved_on = std::cell::Cell::new(false);
        let mut said = Vec::new();
        let stopped = speak_all(&pieces, &|| moved_on.get(), |piece| -> anyhow::Result<Vec<f32>> {
            said.push(piece.to_string());
            moved_on.set(true);
            Ok(vec![0.5])
        })
        .unwrap_err();
        assert_eq!(stopped.to_string(), OVERTAKEN);
        assert_eq!(said, ["one"]);

        // A piece whose retries were cut short ends the passage too; it is not
        // passed over as a piece that could not be said.
        let cut = speak_all(&pieces, &|| false, |piece| -> anyhow::Result<Vec<f32>> {
            if piece == "two" {
                anyhow::bail!(OVERTAKEN);
            }
            Ok(vec![0.5])
        })
        .unwrap_err();
        assert_eq!(cut.to_string(), OVERTAKEN);
    }

    /// A later turn overtakes an earlier one, however the requests arrive; a
    /// request with no turn is never overtaken.
    #[test]
    fn a_later_turn_overtakes_an_earlier_one() {
        let base = LATEST_TURN.load(Ordering::SeqCst) + 1_000;
        arrive(Some(base));
        assert!(!overtaken(Some(base)));
        arrive(Some(base + 1));
        assert!(overtaken(Some(base)));
        assert!(!overtaken(Some(base + 1)));
        // The earlier request arriving late does not bring its turn back.
        arrive(Some(base));
        assert!(overtaken(Some(base)));
        assert!(!overtaken(None));
    }
}
