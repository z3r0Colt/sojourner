use crate::error::AppResult;
use tauri::ipc::Response;
use tauri::AppHandle;

#[tauri::command]
pub fn kokoro_available(app: AppHandle) -> bool {
    crate::tts::is_available(&app)
}

#[tauri::command]
pub fn kokoro_voices(app: AppHandle) -> Vec<String> {
    crate::tts::list_voices(&app)
}

/// Whether the voice would read this as words rather than spelling it out.
///
/// The pronunciation editor asks before saving a correction: a respelling like
/// "ya-kov" is no help if the voice answers "K, O, V", and the reader can only
/// find that out by hearing it. No model is loaded -- this is the text step.
///
/// Async, and off the main thread: the first call phonemizes the alphabet to
/// learn what a spelled-out letter sounds like, and a synchronous command
/// doing that would hold up the window while the reader is typing.
#[tauri::command]
pub async fn kokoro_can_say(text: String) -> bool {
    tauri::async_runtime::spawn_blocking(move || !crate::tts::spells_out(&text))
        .await
        .unwrap_or(true)
}

/// One verse of audio, as WAV bytes.
///
/// Returned as a raw `Response` rather than a `Vec<u8>`: a verse is around a
/// megabyte of samples, and going through JSON would turn every byte into a
/// number in a giant array on the way across.
///
/// The work runs on a blocking thread. Synthesis is seconds of CPU, and on the
/// async runtime's own threads it would stall everything else the app is doing.
#[tauri::command]
pub async fn kokoro_synthesize(app: AppHandle, text: String, voice: String, speed: f32) -> AppResult<Response> {
    let bytes = tauri::async_runtime::spawn_blocking(move || crate::tts::synthesize(&app, &text, &voice, speed))
        .await
        .map_err(|e| anyhow::anyhow!("the voice task did not finish: {e}"))??;
    Ok(Response::new(bytes))
}
