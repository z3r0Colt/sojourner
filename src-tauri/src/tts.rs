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
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

/// Kokoro's output rate. Fixed by the model, not a choice.
const SAMPLE_RATE: u32 = 24_000;

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

/// Speaks one verse. Called from a blocking task: synthesis is seconds of CPU
/// work and must never run on the UI thread.
pub fn synthesize(app: &AppHandle, text: &str, voice: &str, speed: f32) -> anyhow::Result<Vec<u8>> {
    let engine = engine(app)?;
    let tts = engine
        .lock()
        .map_err(|_| anyhow::anyhow!("the voice engine failed during an earlier verse"))?;
    let (samples, _took) = tauri::async_runtime::block_on(tts.synth(text, Voice::new(voice).with_speed(speed)))
        .with_context(|| format!("could not speak with the voice '{voice}'"))?;
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
