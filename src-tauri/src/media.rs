//! Recordings for the window's `<audio>` and `<video>` on Linux.
//!
//! WebKitGTK will fetch a file from the asset protocol (an EPUB, a PDF), but
//! its media player refuses one outright: an `asset://` source fails with
//! "not supported" whatever the format, a WAV included, while the same bytes
//! play from a `blob:` URL. Reading a two-hour recording into memory to make
//! one is no answer, so on Linux the page's recordings come over HTTP from
//! this computer instead -- a listener on the loopback address only, on a
//! port the system picks, behind a random key in every path. It serves the
//! files the asset protocol would (the same scope, checked the same way), with
//! byte ranges so a recording can be skipped through, and nothing else.
//!
//! Started on the first recording a page asks for, not at launch, and never
//! on Windows, whose WebView2 plays from the asset protocol directly.

use std::path::PathBuf;
use std::sync::OnceLock;

use tauri::AppHandle;

/// The listener's base URL (`http://127.0.0.1:<port>/<key>`) once started,
/// or `None` where there is none to start, or it could not be.
#[derive(Default)]
pub struct MediaServer(OnceLock<Option<String>>);

/// Where the page should load a recording from: a URL under this base (the
/// file's path, percent-encoded, after one `/`), or the asset protocol when
/// this is `None`.
#[tauri::command]
pub fn media_base_url(app: AppHandle, state: tauri::State<MediaServer>) -> Option<String> {
    state.0.get_or_init(|| start(&app)).clone()
}

#[cfg(not(target_os = "linux"))]
fn start(_app: &AppHandle) -> Option<String> {
    None
}

#[cfg(target_os = "linux")]
fn start(app: &AppHandle) -> Option<String> {
    let server = match tiny_http::Server::http(std::net::SocketAddr::from(([127, 0, 0, 1], 0))) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("media: couldn’t listen on the loopback address: {e}");
            return None;
        }
    };
    let port = server.server_addr().to_ip()?.port();
    let key = uuid::Uuid::new_v4().simple().to_string();
    let base = format!("http://127.0.0.1:{port}/{key}");
    let app = app.clone();
    std::thread::spawn(move || {
        for request in server.incoming_requests() {
            let app = app.clone();
            let prefix = format!("/{key}/");
            // A thread each: the player keeps one request open while it
            // plays and starts another whenever the reader skips ahead.
            std::thread::spawn(move || match file_for(request.url(), &prefix) {
                Some(path) => crate::remote::serve_file(&app, request, path),
                None => {
                    let _ = request.respond(tiny_http::Response::empty(404));
                }
            });
        }
    });
    Some(base)
}

/// The file a request names: its path after `/<key>/`, percent-decoded,
/// ignoring any query. `None` without the key.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
fn file_for(url: &str, prefix: &str) -> Option<PathBuf> {
    let path = url.split('?').next()?;
    let rest = path.strip_prefix(prefix)?;
    Some(PathBuf::from(crate::remote::percent_decode(rest)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_paths_behind_the_key_name_a_file() {
        let prefix = "/abc123/";
        assert_eq!(
            file_for("/abc123/%2Fhome%2Fme%2FSermon%20one.mp3", prefix),
            Some(PathBuf::from("/home/me/Sermon one.mp3"))
        );
        assert_eq!(file_for("/abc123/%2Fhome%2Fme%2Fa.mp3?t=5", prefix), Some(PathBuf::from("/home/me/a.mp3")));
        assert_eq!(file_for("/wrong/%2Fhome%2Fme%2Fa.mp3", prefix), None);
        assert_eq!(file_for("/%2Fhome%2Fme%2Fa.mp3", prefix), None);
        assert_eq!(file_for("/abc123", prefix), None);
    }
}
