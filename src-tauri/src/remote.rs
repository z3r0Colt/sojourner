//! Sojourner in a browser on another device on the same network.
//!
//! When the reader turns it on (Settings → Other devices), the app listens on
//! a port of this computer and serves the same page the window shows. The
//! page, finding no Tauri around it, sends each command here as
//! `POST /api/<command>` with its arguments as JSON, and this module hands it
//! to the main window's own command handler (`Webview::on_message`) exactly as
//! the window's IPC would. So every command works from a browser without a
//! second list of them to keep in step -- except the ones in `DESKTOP_ONLY`,
//! which touch files on this computer, run its dialogs, or change this very
//! setting, and are refused.
//!
//! The library's files (an EPUB, a PDF, a recording) come from `/files/`,
//! under the same scope the window's asset protocol allows, and the Atlas's
//! tiles from `/sjtiles/`.
//!
//! Getting in: the link the desktop shows carries a key (`?key=...`). The
//! first visit with it sets a cookie, and every request after is checked
//! against it; anyone on the network without the link sees only a page
//! asking for it. A new key turns every old link away.
//!
//! The setting lives in `remote.json` in the app data folder rather than in
//! user.db's settings, which the page can read -- and so could a browser.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr, UdpSocket};
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::ipc::{CallbackFn, InvokeBody, InvokeResponse, InvokeResponseBody};
use tauri::webview::InvokeRequest;
use tauri::{AppHandle, Manager};
use tiny_http::{Header, Method, Request, Response, Server, StatusCode};

pub const DEFAULT_PORT: u16 = 8765;
const CONFIG_FILE: &str = "remote.json";
const COOKIE: &str = "sj_key";
/// Long enough for the slowest command (a full-text search, a voice
/// synthesis); a command that never answers must not hold a thread forever.
const COMMAND_TIMEOUT: Duration = Duration::from_secs(300);

/// Commands a browser may not run. Everything else the window can do, a
/// browser on the network can do too.
const DESKTOP_ONLY: &[&str] = &[
    // The window's own close handshake.
    "ready_to_close",
    // File dialogs open on this computer's screen, and their tokens name its
    // files.
    "pick_save_path",
    "pick_open_path",
    "pick_folder",
    // Adding and removing what is installed, and files read from or written
    // to this computer.
    "remove_translation",
    "remove_commentary_source",
    "scan_library",
    "add_file",
    "install_pack",
    "remove_pack",
    "add_resource",
    "bulk_import_resources",
    "reextract_resource",
    "delete_resource",
    "create_backup",
    "list_backups",
    "export_database",
    "stage_import",
    "stage_restore",
    "quick_check",
    "get_backup_sync_folder",
    "set_backup_sync_folder",
    "get_logs_dir",
    "export_sermon",
    "export_sermon_slides",
    "export_sermon_podium",
    "export_note",
    "export_chapter_note",
    "export_prayer_entry",
    "check_for_update",
    // This setting itself, and the key that lets a browser in.
    "remote_status",
    "remote_set_enabled",
    "remote_new_key",
];

#[derive(Serialize, Deserialize, Clone, Default)]
struct Config {
    enabled: bool,
    key: String,
    #[serde(default)]
    port: Option<u16>,
}

struct Running {
    server: Arc<Server>,
    port: u16,
}

/// The server, when it is running, and why it is not when it failed to start.
#[derive(Default)]
pub struct RemoteState {
    running: Mutex<Option<Running>>,
    error: Mutex<Option<String>>,
    /// The key the running server checks, kept here rather than read from
    /// `remote.json` on every request: a map asks for dozens of tiles at once,
    /// and a read caught halfway through a new key being written would turn a
    /// device with the right link away.
    key: Mutex<String>,
    guard: Mutex<Lockout>,
}

/// Wrong keys a device may try before it is made to wait.
const TRIES: u32 = 5;
const LOCKOUT: Duration = Duration::from_secs(60);

#[derive(Default)]
struct Attempts {
    failures: u32,
    /// The last wrong cookie: a device holding an old link sends the same
    /// one with every request, and that is one mistake, not dozens.
    last_cookie: Option<String>,
    locked_until: Option<Instant>,
}

/// Wrong keys by device (by address). Five wrong in a row and that device
/// may not try another for a minute -- five a minute is too slow to guess an
/// eight-letter key in any lifetime. A device that has the right key is never
/// held up by this, and the right key clears the count.
#[derive(Default)]
pub struct Lockout {
    by_ip: HashMap<IpAddr, Attempts>,
}

impl Lockout {
    fn locked(&mut self, ip: IpAddr, now: Instant) -> bool {
        let Some(a) = self.by_ip.get_mut(&ip) else { return false };
        match a.locked_until {
            Some(until) if now < until => true,
            Some(_) => {
                // Served its minute: a fresh five.
                *a = Attempts::default();
                false
            }
            None => false,
        }
    }

    /// A wrong key, typed (`cookie` None) or sent as a cookie.
    fn failed(&mut self, ip: IpAddr, cookie: Option<&str>, now: Instant) {
        let a = self.by_ip.entry(ip).or_default();
        if let Some(c) = cookie {
            if a.last_cookie.as_deref() == Some(c) {
                return;
            }
            a.last_cookie = Some(c.to_string());
        }
        a.failures += 1;
        if a.failures >= TRIES {
            a.locked_until = Some(now + LOCKOUT);
        }
    }

    fn succeeded(&mut self, ip: IpAddr) {
        self.by_ip.remove(&ip);
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteStatus {
    enabled: bool,
    running: bool,
    port: u16,
    /// The links to give another device, one per address this computer has
    /// on the network, each carrying the key.
    links: Vec<String>,
    error: Option<String>,
}

fn config_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join(CONFIG_FILE))
}

fn load(app: &AppHandle) -> Config {
    config_path(app)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save(app: &AppHandle, config: &Config) -> anyhow::Result<()> {
    let path = config_path(app).ok_or_else(|| anyhow::anyhow!("no app data folder"))?;
    std::fs::write(path, serde_json::to_string_pretty(config)?)?;
    Ok(())
}

/// Eight characters a person can read off one screen and type on another:
/// no 0/O, 1/l/I.
fn new_key() -> String {
    const ALPHABET: &[u8] = b"abcdefghjkmnpqrstuvwxyz23456789";
    let bytes = uuid::Uuid::new_v4().into_bytes();
    bytes[..8].iter().map(|b| ALPHABET[*b as usize % ALPHABET.len()] as char).collect()
}

/// This computer's address on the network: the one the system would send
/// from to reach the internet. Connecting a UDP socket sends nothing.
fn local_ip() -> Option<std::net::IpAddr> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    socket.local_addr().ok().map(|a| a.ip()).filter(|ip| !ip.is_loopback() && !ip.is_unspecified())
}

fn status(app: &AppHandle) -> RemoteStatus {
    let config = load(app);
    let state = app.state::<RemoteState>();
    let running = state.running.lock().unwrap();
    let port = running.as_ref().map(|r| r.port).or(config.port).unwrap_or(DEFAULT_PORT);
    let mut hosts: Vec<String> = Vec::new();
    // No address means no network for another device to reach this one by,
    // whatever its name; the section then says so.
    if let Some(ip) = local_ip() {
        hosts.push(ip.to_string());
        // The computer's name works on many home networks, and does not
        // change when the router hands out a new address.
        if let Ok(name) = std::env::var("COMPUTERNAME") {
            hosts.push(name.to_lowercase());
        }
    }
    let links = if running.is_some() {
        hosts.iter().map(|h| format!("http://{h}:{port}/?key={}", config.key)).collect()
    } else {
        Vec::new()
    };
    let is_running = running.is_some();
    drop(running);
    let error = state.error.lock().unwrap().clone();
    RemoteStatus { enabled: config.enabled, running: is_running, port, links, error }
}

fn stop(app: &AppHandle) {
    if let Some(r) = app.state::<RemoteState>().running.lock().unwrap().take() {
        r.server.unblock();
    }
}

fn start(app: &AppHandle) {
    stop(app);
    let state = app.state::<RemoteState>();
    let mut config = load(app);
    if config.key.is_empty() {
        config.key = new_key();
        let _ = save(app, &config);
    }
    *state.key.lock().unwrap() = config.key.clone();
    let port = config.port.unwrap_or(DEFAULT_PORT);
    // Turned off and straight back on, the server just stopped may not have
    // let go of the port yet: give it a moment rather than fail.
    let mut bound = Server::http(SocketAddr::from(([0, 0, 0, 0], port)));
    for _ in 0..20 {
        if bound.is_ok() {
            break;
        }
        std::thread::sleep(Duration::from_millis(100));
        bound = Server::http(SocketAddr::from(([0, 0, 0, 0], port)));
    }
    match bound {
        Ok(server) => {
            let server = Arc::new(server);
            *state.running.lock().unwrap() = Some(Running { server: server.clone(), port });
            *state.error.lock().unwrap() = None;
            let app = app.clone();
            std::thread::spawn(move || serve(app, server));
        }
        Err(e) => {
            *state.error.lock().unwrap() = Some(format!("Couldn’t listen on port {port}: {e}"));
        }
    }
}

/// At launch: start again if the reader left it on.
pub fn start_if_enabled(app: &AppHandle) {
    if load(app).enabled {
        start(app);
    }
}

#[tauri::command]
pub fn remote_status(app: AppHandle) -> RemoteStatus {
    status(&app)
}

#[tauri::command]
pub fn remote_set_enabled(app: AppHandle, enabled: bool) -> Result<RemoteStatus, String> {
    let mut config = load(&app);
    config.enabled = enabled;
    if config.key.is_empty() {
        config.key = new_key();
    }
    save(&app, &config).map_err(|e| e.to_string())?;
    if enabled {
        start(&app);
    } else {
        stop(&app);
        *app.state::<RemoteState>().error.lock().unwrap() = None;
    }
    Ok(status(&app))
}

/// A new key: every link given out before stops working.
#[tauri::command]
pub fn remote_new_key(app: AppHandle) -> Result<RemoteStatus, String> {
    let mut config = load(&app);
    config.key = new_key();
    save(&app, &config).map_err(|e| e.to_string())?;
    *app.state::<RemoteState>().key.lock().unwrap() = config.key;
    Ok(status(&app))
}

/// A number that changes whenever anything is written to the database, by
/// anyone: SQLite's count of the rows this connection has changed, and there
/// is one connection, which the window and every browser share. A page polls
/// it while other devices may be writing, and reloads what it shows when it
/// moves (see src/lib/liveSync.ts).
#[tauri::command]
pub fn data_version(db: tauri::State<crate::db::DbState>) -> Result<i64, String> {
    let conn = db.conn();
    conn.query_row("SELECT total_changes()", [], |r| r.get(0)).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Serving

fn serve(app: AppHandle, server: Arc<Server>) {
    for request in server.incoming_requests() {
        let app = app.clone();
        // A request per thread: one slow search must not hold up the tiles of
        // a map, and a household is a handful of devices.
        std::thread::spawn(move || handle(&app, request));
    }
}

fn header(name: &str, value: &str) -> Header {
    Header::from_bytes(name.as_bytes(), value.as_bytes()).expect("valid header")
}

fn text(status: u16, body: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    Response::from_string(body).with_status_code(status).with_header(header("Content-Type", "text/plain; charset=utf-8"))
}

fn cookie_key(request: &Request) -> Option<String> {
    let cookies = request.headers().iter().find(|h| h.field.equiv("Cookie"))?.value.as_str().to_string();
    cookies.split(';').find_map(|c| c.trim().strip_prefix(&format!("{COOKIE}=")).map(str::to_string))
}

fn query_param(query: &str, name: &str) -> Option<String> {
    query.split('&').find_map(|pair| {
        let (k, v) = pair.split_once('=')?;
        (k == name).then(|| percent_decode(v))
    })
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                let hex = |b: u8| (b as char).to_digit(16);
                match (hex(bytes[i + 1]), hex(bytes[i + 2])) {
                    (Some(h), Some(l)) => {
                        out.push((h * 16 + l) as u8);
                        i += 3;
                        continue;
                    }
                    _ => out.push(b'%'),
                }
            }
            b => out.push(b),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn handle(app: &AppHandle, mut request: Request) {
    let url = request.url().to_string();
    let (path, query) = url.split_once('?').unwrap_or((&url, ""));
    let path = path.to_string();
    let state = app.state::<RemoteState>();
    let key = state.key.lock().unwrap().clone();
    let ip = request.remote_addr().map(|a| a.ip()).unwrap_or(IpAddr::from([0, 0, 0, 0]));
    let cookie = cookie_key(&request);
    let has_key = !key.is_empty() && cookie.as_deref() == Some(key.as_str());
    let now = Instant::now();

    // The link: set the cookie and go to the page without the key in the
    // address bar, where it would be bookmarked or shown to the room.
    if let Some(given) = query_param(query, "key") {
        let mut guard = state.guard.lock().unwrap();
        if guard.locked(ip, now) {
            drop(guard);
            let _ = request.respond(join_page(Join::Wait));
            return;
        }
        // Typed on a phone, the key may come back with a capital letter.
        if !key.is_empty() && given.trim().to_lowercase() == key {
            guard.succeeded(ip);
            drop(guard);
            let _ = request.respond(
                Response::empty(StatusCode(303))
                    .with_header(header("Location", &path))
                    .with_header(header("Set-Cookie", &format!("{COOKIE}={key}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Strict"))),
            );
        } else {
            guard.failed(ip, None, now);
            let wait = guard.locked(ip, now);
            drop(guard);
            let _ = request.respond(join_page(if wait { Join::Wait } else { Join::Wrong }));
        }
        return;
    }

    if !has_key {
        // A wrong key in a cookie is a guess like a typed one (a device
        // without one at all is just arriving, and is shown the key page).
        let wait = {
            let mut guard = state.guard.lock().unwrap();
            if let Some(c) = cookie.as_deref() {
                if !guard.locked(ip, now) {
                    guard.failed(ip, Some(c), now);
                }
            }
            guard.locked(ip, now)
        };
        let _ = if *request.method() == Method::Get && !path.starts_with("/api/") {
            request.respond(join_page(if wait { Join::Wait } else { Join::Ask }))
        } else if wait {
            request.respond(text(429, "Too many wrong keys from this device. Wait a minute."))
        } else {
            request.respond(text(401, "This device has not been given the link."))
        };
        return;
    }

    if let Some(cmd) = path.strip_prefix("/api/") {
        if *request.method() != Method::Post {
            let _ = request.respond(text(405, "POST only"));
            return;
        }
        let mut body = Vec::new();
        if request.as_reader().read_to_end(&mut body).is_err() {
            let _ = request.respond(text(400, "unreadable body"));
            return;
        }
        let _ = request.respond(command(app, &percent_decode(cmd), body));
        return;
    }
    if let Some(rest) = path.strip_prefix("/files/") {
        serve_file(app, request, PathBuf::from(percent_decode(rest)));
        return;
    }
    if let Some(rest) = path.strip_prefix("/sjtiles") {
        let _ = request.respond(tile(app, &percent_decode(rest)));
        return;
    }
    // Never the built copy in dev: it is whatever the last release build left
    // in dist/, not the code being worked on.
    #[cfg(debug_assertions)]
    {
        let _ = request.respond(from_dev_server(&url).unwrap_or_else(|| text(502, "The Vite dev server isn’t answering on localhost:1420.")));
    }
    #[cfg(not(debug_assertions))]
    let _ = request.respond(asset(app, &path));
}

/// `tauri dev`: the page and its modules come from Vite on this computer,
/// which listens only to this computer, so they are fetched from it here
/// and the link works from a phone exactly as an installed copy's does.
/// (Vite's live reload cannot reach a phone; reload the page instead.)
#[cfg(debug_assertions)]
fn from_dev_server(url: &str) -> Option<Response<std::io::Cursor<Vec<u8>>>> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(30)))
        .http_status_as_error(false)
        .build()
        .into();
    // `localhost`, as Vite listens: on this machine that is the IPv6 loopback,
    // which 127.0.0.1 never reaches. Vite answers a page only to a request
    // that accepts HTML.
    let mut response = agent
        .get(&format!("http://localhost:1420{url}"))
        .header("Accept", if url == "/" || url.starts_with("/?") { "text/html" } else { "*/*" })
        .call()
        .ok()?;
    let status = response.status().as_u16();
    let kind = response
        .headers()
        .get("Content-Type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_string();
    let body = response.body_mut().with_config().limit(256 * 1024 * 1024).read_to_vec().ok()?;
    Some(Response::from_data(body).with_status_code(status).with_header(header("Content-Type", &kind)))
}

/// One command through the main window's own handler.
fn command(app: &AppHandle, cmd: &str, body: Vec<u8>) -> Response<std::io::Cursor<Vec<u8>>> {
    if cmd.starts_with("plugin:") || DESKTOP_ONLY.contains(&cmd) {
        return text(403, "That can only be done on the computer Sojourner runs on.");
    }
    let Some(window) = app.get_webview_window("main") else {
        return text(503, "Sojourner’s window is not open.");
    };
    let webview: tauri::Webview = window.as_ref().clone();
    let Ok(url) = webview.url() else {
        return text(503, "Sojourner’s window is not ready.");
    };
    let args: serde_json::Value = if body.is_empty() {
        serde_json::json!({})
    } else {
        match serde_json::from_slice(&body) {
            Ok(v) => v,
            Err(e) => return text(400, &format!("bad arguments: {e}")),
        }
    };
    let (tx, rx) = mpsc::channel::<InvokeResponse>();
    let request = InvokeRequest {
        cmd: cmd.to_string(),
        callback: CallbackFn(0),
        error: CallbackFn(1),
        url,
        body: InvokeBody::Json(args),
        headers: Default::default(),
        invoke_key: app.invoke_key().to_string(),
    };
    webview.on_message(
        request,
        Box::new(move |_webview, _cmd, response, _callback, _error| {
            let _ = tx.send(response);
        }),
    );
    match rx.recv_timeout(COMMAND_TIMEOUT) {
        Ok(InvokeResponse::Ok(InvokeResponseBody::Json(json))) => {
            Response::from_string(json).with_header(header("Content-Type", "application/json"))
        }
        Ok(InvokeResponse::Ok(InvokeResponseBody::Raw(bytes))) => {
            Response::from_data(bytes).with_header(header("Content-Type", "application/octet-stream"))
        }
        Ok(InvokeResponse::Err(e)) => Response::from_string(e.0.to_string())
            .with_status_code(400)
            .with_header(header("Content-Type", "application/json")),
        Err(_) => text(504, "The command took too long."),
    }
}

/// The page and its scripts, as built into the app.
#[cfg_attr(debug_assertions, allow(dead_code))]
fn asset(app: &AppHandle, path: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    let resolver = app.asset_resolver();
    let wanted = if path == "/" { "/index.html" } else { path };
    let found = resolver.get(wanted.to_string()).or_else(|| resolver.get("/index.html".to_string()));
    let Some(asset) = found else {
        return text(404, "not found");
    };
    let mut response = Response::from_data(asset.bytes).with_header(header("Content-Type", &asset.mime_type));
    if wanted.starts_with("/assets/") {
        // Vite names these by their content, so they never change.
        response = response.with_header(header("Cache-Control", "max-age=31536000, immutable"));
    } else {
        response = response.with_header(header("Cache-Control", "no-cache"));
    }
    response
}

fn tile(app: &AppHandle, path: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    let found = crate::tiles::parse_path(path).and_then(|(pack, z, x, y)| {
        let maps = crate::paths::maps_dir(app)?;
        app.state::<crate::tiles::TileStore>().tile(&maps, &pack, z, x, y).ok().flatten()
    });
    match found {
        Some((data, format)) => Response::from_data(data)
            .with_header(header("Content-Type", crate::tiles::content_type(&format)))
            .with_header(header("Cache-Control", "max-age=31536000, immutable")),
        None => text(404, "no tile"),
    }
}

fn mime_for(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).as_deref() {
        Some("epub") => "application/epub+zip",
        Some("pdf") => "application/pdf",
        Some("mp3") => "audio/mpeg",
        Some("m4a") => "audio/mp4",
        Some("ogg") | Some("oga") => "audio/ogg",
        Some("wav") => "audio/wav",
        Some("flac") => "audio/flac",
        Some("mp4") | Some("m4v") => "video/mp4",
        Some("webm") => "video/webm",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("html") | Some("htm") | Some("xhtml") => "text/html; charset=utf-8",
        Some("txt") => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

/// A library file, by the path the page would hand the asset protocol, and
/// only within the scope that protocol allows. Byte ranges are honoured so a
/// recording can be skipped through and a PDF read a part at a time.
fn serve_file(app: &AppHandle, request: Request, path: PathBuf) {
    let allowed = path.is_absolute() && app.asset_protocol_scope().is_allowed(&path);
    let file = if allowed { File::open(&path).ok() } else { None };
    let Some(mut file) = file else {
        let _ = request.respond(text(404, "not found"));
        return;
    };
    let len = file.metadata().map(|m| m.len()).unwrap_or(0);
    let kind = mime_for(&path);
    let range = request
        .headers()
        .iter()
        .find(|h| h.field.equiv("Range"))
        .and_then(|h| parse_range(h.value.as_str(), len));
    let base = |status: u16, reader: Box<dyn Read + Send>, size: u64| {
        Response::new(
            StatusCode(status),
            vec![header("Content-Type", kind), header("Accept-Ranges", "bytes")],
            reader,
            Some(size as usize),
            None,
        )
    };
    let response = match range {
        Some((start, end)) if file.seek(SeekFrom::Start(start)).is_ok() => {
            let size = end - start + 1;
            base(206, Box::new(file.take(size)), size).with_header(header("Content-Range", &format!("bytes {start}-{end}/{len}")))
        }
        _ => base(200, Box::new(file), len),
    };
    let _ = request.respond(response);
}

/// "bytes=START-END", "bytes=START-" or "bytes=-SUFFIX", within a file of
/// `len` bytes, as an inclusive range.
fn parse_range(value: &str, len: u64) -> Option<(u64, u64)> {
    if len == 0 {
        return None;
    }
    let spec = value.trim().strip_prefix("bytes=")?.split(',').next()?.trim();
    let (a, b) = spec.split_once('-')?;
    let (start, end) = if a.is_empty() {
        let suffix: u64 = b.parse().ok()?;
        (len.saturating_sub(suffix), len - 1)
    } else {
        let start: u64 = a.parse().ok()?;
        let end = if b.is_empty() { len - 1 } else { b.parse::<u64>().ok()?.min(len - 1) };
        (start, end)
    };
    (start <= end && start < len).then_some((start, end))
}

/// What a device without the link sees.
enum Join {
    Ask,
    Wrong,
    Wait,
}

fn join_page(state: Join) -> Response<std::io::Cursor<Vec<u8>>> {
    let note = match state {
        Join::Ask => "",
        Join::Wrong => "<p class=\"wrong\">That key isn’t right. Check it on the computer and try again.</p>",
        Join::Wait => "<p class=\"wrong\">Too many wrong keys from this device. Wait a minute, then try again.</p>",
    };
    let wrong = !matches!(state, Join::Ask);
    let html = format!(
        r#"<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sojourner</title><style>
body{{font-family:Georgia,serif;background:#12293f;color:#f3efe6;display:flex;min-height:100vh;margin:0;align-items:center;justify-content:center}}
main{{max-width:24rem;padding:1.5rem}}h1{{font-weight:600;margin:0 0 .5rem}}p{{line-height:1.5;color:#d8d2c4}}
form{{display:flex;gap:.5rem;margin-top:1rem}}input{{flex:1;font-size:1.1rem;padding:.5rem;border-radius:.4rem;border:1px solid #567;background:#0d1f30;color:#fff;letter-spacing:.1em}}
button{{font-size:1rem;padding:.5rem 1rem;border-radius:.4rem;border:0;background:#c9a45c;color:#12293f;font-weight:600}}.wrong{{color:#f2b8a0}}
</style></head><body><main><h1>Sojourner</h1>
<p>To open Sojourner here, use the link shown on the computer it runs on, in Settings → Other devices, or type its key.</p>{note}
<form method="get" action="/"><input name="key" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="key" aria-label="Key"><button>Open</button></form>
</main></body></html>"#
    );
    Response::from_string(html)
        .with_status_code(if wrong { 403 } else { 200 })
        .with_header(header("Content-Type", "text/html; charset=utf-8"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ranges() {
        assert_eq!(parse_range("bytes=0-99", 1000), Some((0, 99)));
        assert_eq!(parse_range("bytes=900-", 1000), Some((900, 999)));
        assert_eq!(parse_range("bytes=-100", 1000), Some((900, 999)));
        assert_eq!(parse_range("bytes=0-5000", 1000), Some((0, 999)));
        assert_eq!(parse_range("bytes=2000-", 1000), None);
        assert_eq!(parse_range("items=0-1", 1000), None);
    }

    #[test]
    fn decoding() {
        assert_eq!(percent_decode("C%3A%5CUsers%5Ca%20b.epub"), "C:\\Users\\a b.epub");
        assert_eq!(percent_decode("100%"), "100%");
        assert_eq!(percent_decode("%zz"), "%zz");
    }

    #[test]
    fn keys_are_readable() {
        let k = new_key();
        assert_eq!(k.len(), 8);
        assert!(k.chars().all(|c| !"01loI".contains(c)));
    }

    #[test]
    fn five_wrong_keys_and_a_device_waits_a_minute() {
        let ip = IpAddr::from([192, 168, 0, 50]);
        let other = IpAddr::from([192, 168, 0, 51]);
        let t = Instant::now();
        let mut g = Lockout::default();
        for _ in 0..4 {
            g.failed(ip, None, t);
        }
        assert!(!g.locked(ip, t));
        g.failed(ip, None, t);
        assert!(g.locked(ip, t));
        assert!(!g.locked(other, t), "another device is not held up");
        assert!(g.locked(ip, t + Duration::from_secs(59)));
        assert!(!g.locked(ip, t + Duration::from_secs(61)), "the minute passes");
        g.failed(ip, None, t + Duration::from_secs(61));
        assert!(!g.locked(ip, t + Duration::from_secs(61)), "and it has five again");
    }

    #[test]
    fn an_old_link_on_a_device_counts_once() {
        let ip = IpAddr::from([192, 168, 0, 50]);
        let t = Instant::now();
        let mut g = Lockout::default();
        for _ in 0..50 {
            g.failed(ip, Some("oldkey12"), t);
        }
        assert!(!g.locked(ip, t));
        for guess in ["aaaaaaaa", "bbbbbbbb", "cccccccc", "dddddddd"] {
            g.failed(ip, Some(guess), t);
        }
        assert!(g.locked(ip, t), "but guessing in cookies counts each guess");
    }

    #[test]
    fn the_right_key_clears_the_count() {
        let ip = IpAddr::from([192, 168, 0, 50]);
        let t = Instant::now();
        let mut g = Lockout::default();
        for _ in 0..4 {
            g.failed(ip, None, t);
        }
        g.succeeded(ip);
        g.failed(ip, None, t);
        assert!(!g.locked(ip, t));
    }

    #[test]
    fn the_settings_cannot_be_reached_from_a_browser() {
        for cmd in ["remote_status", "remote_set_enabled", "remote_new_key", "pick_open_path", "export_database"] {
            assert!(DESKTOP_ONLY.contains(&cmd), "{cmd}");
        }
    }
}
