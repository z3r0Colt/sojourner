//! The worker's entry points (`src/web/worker.ts`): [`start`] once, then
//! [`call`] for every command the page invokes.
//!
//! One connection, as on the desktop: user.db is `main`, on the browser's
//! private file system (OPFS) through the `opfs-sahpool` VFS; content.db is
//! ATTACHed as `content`, read a page at a time over HTTP by `httpvfs`.

use crate::db::{self, DbState};
use crate::httpvfs;
use rusqlite::{Connection, OpenFlags};
use serde::Deserialize;
use serde_json::{json, Value};
use std::cell::RefCell;
use std::sync::Mutex;
use wasm_bindgen::prelude::*;

thread_local! {
    static DB: RefCell<Option<DbState>> = const { RefCell::new(None) };
    /// Kept for the life of the worker: the pool's open file handles, and
    /// what will export and import user.db.
    static OPFS: RefCell<Option<sqlite_wasm_vfs::sahpool::OpfsSAHPoolUtil>> = const { RefCell::new(None) };
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StartConfig {
    /// content.db, as an absolute URL.
    content_url: String,
    /// Its interior b-tree pages, fetched in one request and kept: then a
    /// lookup costs only its leaf pages.
    skeleton: Option<Skeleton>,
    #[serde(default = "default_cache_mb")]
    cache_mb: usize,
    #[serde(default = "default_readahead")]
    readahead_max: usize,
    /// For `app_version`.
    app_version: Option<String>,
}

#[derive(Deserialize)]
struct Skeleton {
    url: String,
    pages: Vec<u64>,
}

fn default_cache_mb() -> usize {
    32
}

fn default_readahead() -> usize {
    8
}

/// The JSON of an error value, as [`call`] rejects with.
fn error_json(message: impl std::fmt::Display) -> String {
    Value::String(message.to_string()).to_string()
}

fn now_ms() -> f64 {
    js_sys::Date::now()
}

/// A panic aborts the module (wasm32 cannot unwind), and the worker then
/// sees only "unreachable". The message is left where it can find it.
fn panic_hook(info: &std::panic::PanicHookInfo) {
    let message = info.to_string();
    web_sys::console::error_1(&JsValue::from_str(&message));
    let _ = js_sys::Reflect::set(&js_sys::global(), &JsValue::from_str("__sojournerPanic"), &JsValue::from_str(&message));
}

/// Opens user.db (running the migrations) and attaches content.db. Resolves
/// with what the page may want to know: whether user.db is stored at all
/// (`persistent`: without OPFS it lives in memory and is gone on reload),
/// the SQLite version, and the time and traffic it took.
#[wasm_bindgen]
pub async fn start(config: String) -> Result<String, String> {
    std::panic::set_hook(Box::new(panic_hook));
    let cfg: StartConfig = serde_json::from_str(&config).map_err(error_json)?;
    if let Some(v) = &cfg.app_version {
        let _ = crate::stand_ins::APP_VERSION.set(v.clone());
    }
    let t0 = now_ms();

    let (persistent, storage_error) = match sqlite_wasm_vfs::sahpool::install::<sqlite_wasm_rs::WasmOsCallback>(
        &sqlite_wasm_vfs::sahpool::OpfsSAHPoolCfg::default(),
        false,
    )
    .await
    {
        Ok(util) => {
            OPFS.with(|o| *o.borrow_mut() = Some(util));
            (true, None)
        }
        Err(e) => (false, Some(format!("{e:?}"))),
    };

    // URI filenames, for the ATTACH below.
    let flags = OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE | OpenFlags::SQLITE_OPEN_URI;
    let mut conn = if persistent {
        Connection::open_with_flags_and_vfs("/user.db", flags, c"opfs-sahpool")
    } else {
        Connection::open_with_flags(":memory:", flags)
    }
    .map_err(error_json)?;
    // The desktop's PERFORMANCE_PRAGMAS, less what OPFS cannot do: no WAL
    // (it needs shared memory) and no mmap.
    conn.execute_batch("PRAGMA synchronous = NORMAL; PRAGMA temp_store = MEMORY;").map_err(error_json)?;
    let t_migrate = now_ms();
    db::prepare_user_db(&mut conn).map_err(|e| error_json(format!("{e:#}")))?;
    let migrate_ms = now_ms() - t_migrate;

    httpvfs::configure(cfg.readahead_max, cfg.cache_mb << 20);
    httpvfs::register().map_err(error_json)?;
    httpvfs::stats_reset();
    let t_content = now_ms();
    httpvfs::open_file("content.db", &cfg.content_url).map_err(error_json)?;
    if let Some(s) = &cfg.skeleton {
        httpvfs::preload("content.db", &s.url, &s.pages).map_err(error_json)?;
    }
    conn.execute("ATTACH DATABASE 'file:content.db?vfs=http&immutable=1' AS content", [])
        .map_err(error_json)?;
    db::forget_missing_translations(&conn);
    let content_ms = now_ms() - t_content;
    let content_http = httpvfs::stats();

    let sqlite: String = conn.query_row("SELECT sqlite_version()", [], |r| r.get(0)).map_err(error_json)?;
    DB.with(|d| *d.borrow_mut() = Some(DbState(Mutex::new(conn))));
    Ok(json!({
        "persistent": persistent,
        "storageError": storage_error,
        "sqlite": sqlite,
        "ms": now_ms() - t0,
        "migrateMs": migrate_ms,
        "contentMs": content_ms,
        "contentHttp": content_http,
    })
    .to_string())
}

/// Runs one command. `args` is the JSON of the page's arguments object.
/// Resolves with the JSON of the answer; rejects with the JSON of the
/// error, which the page throws, as from Tauri.
#[wasm_bindgen]
pub fn call(cmd: &str, args: &str) -> Result<String, String> {
    DB.with(|d| {
        let d = d.borrow();
        let db = d.as_ref().ok_or_else(|| error_json("Sojourner has not started"))?;
        let args: Value = if args.is_empty() { Value::Null } else { serde_json::from_str(args).map_err(error_json)? };
        match crate::dispatch(db, cmd, args) {
            Ok(v) => Ok(v.to_string()),
            Err(e) => Err(e.to_string()),
        }
    })
}

/// The HTTP traffic since the last call with `reset` (requests, bytes, time
/// waiting): what the request-counting harness reads after each command.
#[wasm_bindgen]
pub fn http_stats(reset: bool) -> String {
    let s = httpvfs::stats().to_string();
    if reset {
        httpvfs::stats_reset();
    }
    s
}
