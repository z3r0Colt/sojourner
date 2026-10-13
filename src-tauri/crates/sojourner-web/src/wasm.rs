//! The worker's entry points (`src/web/worker.ts`): [`start`] once, then
//! [`call`] for every command the page invokes.
//!
//! One connection, as on the desktop: user.db is `main`, on the browser's
//! private file system (OPFS) through the `opfs-sahpool` VFS; content.db is
//! ATTACHed as `content`, read a page at a time over HTTP by `httpvfs`,
//! each page kept in OPFS by `pagecache` once fetched.

use crate::db::{self, DbState};
use crate::httpvfs;
use crate::pagecache::PageCache;
use crate::shelves;
use rusqlite::{Connection, OpenFlags};
use serde::Deserialize;
use serde_json::{json, Value};
use std::cell::RefCell;
use std::sync::Mutex;
use wasm_bindgen::prelude::*;

thread_local! {
    static DB: RefCell<Option<DbState>> = const { RefCell::new(None) };
    /// Blocks of content.db the last command wanted before it read them
    /// (`prefetch_hook`), for the worker to fetch at once.
    static WANTED: RefCell<Vec<u64>> = const { RefCell::new(Vec::new()) };
    static PREFETCH: std::cell::Cell<bool> = const { std::cell::Cell::new(true) };
    /// Each table's root page in content.db (None: not there).
    static ROOTS: RefCell<std::collections::HashMap<String, Option<u64>>> = RefCell::new(std::collections::HashMap::new());
    /// Kept for the life of the worker: the pool's open file handles, and
    /// what will export and import user.db.
    static OPFS: RefCell<Option<sqlite_wasm_vfs::sahpool::OpfsSAHPoolUtil>> = const { RefCell::new(None) };
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StartConfig {
    /// Where content.db's pieces are, as an absolute URL ending in `/`.
    content_base: String,
    /// The manifest.json found there.
    manifest: httpvfs::Manifest,
    /// Pages kept in memory.
    #[serde(default = "default_cache_mb")]
    cache_mb: usize,
    #[serde(default = "default_readahead")]
    readahead_max: usize,
    /// Pages kept in the browser's files, so each is fetched once; 0 for none.
    #[serde(default = "default_disk_cache_mb")]
    disk_cache_mb: usize,
    /// For `app_version`.
    app_version: Option<String>,
}

/// Shelf books a resource search quotes from (core's `MAX_SHELF_QUOTES`).
const SHELF_QUOTES: usize = 3;

fn default_disk_cache_mb() -> usize {
    512
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

    // Built for another version of the app: its queries would fail one at a
    // time ("no such table") rather than say why.
    let schema = db::schema::CONTENT_MIGRATIONS.len() as i64;
    if cfg.manifest.schema != schema {
        return Err(error_json(format!(
            "The books at {} are schema {}, and this version of Sojourner needs {schema}. Reload the page to update it.",
            cfg.content_base, cfg.manifest.schema
        )));
    }
    // A search quotes a shelf book by reading all of it: a few are enough.
    db::queries::resources::MAX_SHELF_QUOTES.store(SHELF_QUOTES, std::sync::atomic::Ordering::Relaxed);
    httpvfs::configure(cfg.readahead_max, cfg.cache_mb << 20);
    httpvfs::register().map_err(error_json)?;
    httpvfs::stats_reset();
    let t_content = now_ms();
    let (disk, cache_error) = if cfg.disk_cache_mb == 0 {
        (None, None)
    } else {
        match PageCache::open("content", &cfg.manifest.version, cfg.manifest.page_size as usize, cfg.disk_cache_mb << 20).await {
            Ok(c) => (Some(c), None),
            Err(e) => (None, Some(e)),
        }
    };
    httpvfs::open_file("content.db", &cfg.content_base, &cfg.manifest, disk).map_err(error_json)?;
    httpvfs::preload("content.db", &cfg.content_base, &cfg.manifest.skeleton).map_err(error_json)?;
    conn.execute("ATTACH DATABASE 'file:content.db?vfs=http&immutable=1' AS content", [])
        .map_err(error_json)?;
    db::forget_missing_translations(&conn);
    httpvfs::flush();
    db::prefetch::install(prefetch_hook);
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
        "contentVersion": cfg.manifest.version,
        "pageCache": httpvfs::disk_usage("content.db").map(|(pages, bytes)| json!({ "pages": pages, "bytes": bytes })),
        "pageCacheError": cache_error,
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
        WANTED.with(|w| w.borrow_mut().clear());
        let reply = crate::dispatch(db, cmd, args);
        // The pages this command fetched, kept for next time.
        httpvfs::flush();
        // It stopped (or would answer without them) to have pages fetched first.
        if WANTED.with(|w| !w.borrow().is_empty()) {
            return Err(FETCH_FIRST.to_string());
        }
        match reply {
            Ok(v) => Ok(v.to_string()),
            Err(e) => Err(e.to_string()),
        }
    })
}

/// What [`call`] rejects with when the command wants pages fetched first:
/// the worker fetches [`fetch_plan`]'s ranges at once, hands each to
/// [`prefetch_put`], and calls again. Not JSON, so no error is mistaken for it.
const FETCH_FIRST: &str = "\u{1}fetch-first";

/// `db::prefetch`'s hook: the rows a read-only query is about to read, one
/// page each. If any of their pages aren't here, stop the command, so they
/// can be fetched together rather than one after another.
fn prefetch_hook(conn: &Connection, table: &str, ids: &[i64]) -> anyhow::Result<()> {
    if !PREFETCH.get() {
        return Ok(());
    }
    let root = match ROOTS.with(|r| r.borrow().get(table).copied()) {
        Some(root) => root,
        None => {
            let root: Option<i64> = conn
                .query_row("SELECT rootpage FROM content.sqlite_schema WHERE type = 'table' AND name = ?1", [table], |r| r.get(0))
                .ok();
            let root = root.filter(|&r| r > 0).map(|r| r as u64);
            ROOTS.with(|r| r.borrow_mut().insert(table.to_string(), root));
            root
        }
    };
    let Some(root) = root else { return Ok(()) };
    let missing = httpvfs::missing_pages("content.db", root, ids);
    if missing.is_empty() {
        return Ok(());
    }
    WANTED.with(|w| w.borrow_mut().extend(missing));
    anyhow::bail!("{FETCH_FIRST}")
}

/// The requests that bring the pages the last command wanted, as JSON
/// `[[url, firstByte, lastByte, firstBlock], ...]`.
#[wasm_bindgen]
pub fn fetch_plan() -> String {
    let wanted = WANTED.with(|w| std::mem::take(&mut *w.borrow_mut()));
    json!(httpvfs::ranges_for("content.db", &wanted)).to_string()
}

/// Pages fetched by the worker for [`fetch_plan`], from block `first`.
#[wasm_bindgen]
pub fn prefetch_put(first: f64, bytes: &[u8]) {
    httpvfs::put_pages("content.db", first as u64, bytes);
}

/// Off: commands read their rows one at a time, as before (the worker's
/// last try, when fetching ahead didn't bring them).
#[wasm_bindgen]
pub fn set_prefetch(on: bool) {
    PREFETCH.set(on);
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

// ---- The reader's own data: export and import of user.db ------------------

/// A scratch file in the OPFS pool, for `VACUUM INTO` and for a file being
/// checked. The pool holds 6 files: user.db, its journal and these.
const EXPORT_FILE: &str = "/export.db";
const CHECK_FILE: &str = "/check.db";

fn with_pool<T>(f: impl FnOnce(&sqlite_wasm_vfs::sahpool::OpfsSAHPoolUtil) -> Result<T, String>) -> Result<T, String> {
    OPFS.with(|o| match o.borrow().as_ref() {
        Some(util) => f(util),
        None => Err("Your data isn't kept in this browser's files, so it can't be exported. \
                     Try a current Chrome, Edge, Firefox or Safari."
            .to_string()),
    })
}

/// A consistent copy of user.db (what the desktop's "Export" writes: the
/// same `VACUUM INTO`, so the same file format). The notes, highlights,
/// sermons and the rest; none of the books.
#[wasm_bindgen]
pub fn export_user_db() -> Result<Vec<u8>, String> {
    with_pool(|pool| {
        let _ = pool.delete_db(EXPORT_FILE);
        DB.with(|d| {
            let d = d.borrow();
            let db = d.as_ref().ok_or("Sojourner has not started")?;
            let done = db.conn().execute("VACUUM main INTO ?1", [EXPORT_FILE]).map_err(|e| e.to_string());
            done
        })?;
        let bytes = pool.export_db(EXPORT_FILE).map_err(|e| format!("{e:?}"));
        let _ = pool.delete_db(EXPORT_FILE);
        bytes
    })
    .map_err(error_json)
}

/// Whether `bytes` is one of this app's user databases, as the desktop's
/// `validate_candidate_db` asks (opens as SQLite, has `settings`, not from a
/// newer version), and a quick integrity check. Resolves with its schema
/// version as JSON; rejects with the reason.
fn check_candidate(pool: &sqlite_wasm_vfs::sahpool::OpfsSAHPoolUtil, bytes: &[u8]) -> Result<i64, String> {
    if bytes.len() < 100 || !bytes.starts_with(b"SQLite format 3\0") {
        return Err("That isn't a Sojourner data file (it isn't a SQLite database).".into());
    }
    pool.import_db(CHECK_FILE, bytes).map_err(|e| format!("Couldn't read that file: {e:?}"))?;
    let checked = (|| -> Result<i64, String> {
        let conn = Connection::open_with_flags_and_vfs(CHECK_FILE, OpenFlags::SQLITE_OPEN_READ_ONLY, c"opfs-sahpool")
            .map_err(|e| e.to_string())?;
        conn.query_row("SELECT COUNT(*) FROM settings", [], |_| Ok(()))
            .map_err(|_| "That isn't a Sojourner data file (it has no settings).".to_string())?;
        let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).map_err(|e| e.to_string())?;
        let known = db::schema::USER_MIGRATIONS.len() as i64;
        if version > known {
            return Err(format!(
                "This file was written by a newer version of Sojourner (schema {version}; this one knows {known}). \
                 Reload the page to update, and try again."
            ));
        }
        let issues: Vec<String> = {
            let mut stmt = conn.prepare("PRAGMA quick_check").map_err(|e| e.to_string())?;
            let rows = stmt.query_map([], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
            rows.filter_map(Result::ok).filter(|r| r != "ok").collect()
        };
        if !issues.is_empty() {
            return Err(format!("That file is damaged: {}", issues.join("; ")));
        }
        Ok(version)
    })();
    let _ = pool.delete_db(CHECK_FILE);
    checked
}

/// Checks a file the reader chose, before anything is replaced.
#[wasm_bindgen]
pub fn check_user_db(bytes: &[u8]) -> Result<String, String> {
    with_pool(|pool| check_candidate(pool, bytes)).map(|v| json!({ "schema": v }).to_string()).map_err(error_json)
}

/// Replaces user.db with `bytes` (checked again here). The connection is
/// closed first, so the worker answers nothing afterwards: the page reloads.
/// The page exports the current data before calling this, as the desktop
/// backs it up first.
#[wasm_bindgen]
pub fn import_user_db(bytes: &[u8]) -> Result<(), String> {
    with_pool(|pool| {
        check_candidate(pool, bytes)?;
        // Closing the connection also detaches content.db.
        let old = DB.with(|d| d.borrow_mut().take());
        drop(old);
        // A leftover journal would be replayed onto the new file.
        let _ = pool.delete_db("/user.db-journal");
        // `import_db` will not overwrite. The file checked above is good, and
        // the page has already saved a copy of what is being replaced.
        pool.delete_db("/user.db").map_err(|e| format!("Couldn't replace your data: {e:?}"))?;
        pool.import_db("/user.db", bytes).map_err(|e| format!("Couldn't replace your data: {e:?}"))
    })
    .map_err(error_json)
}

// ---- Offline copies (src/web/offlineCopy.ts) -------------------------------
//
// `file` is the name the database is opened under: content.db, or a shelf's
// (`shelf-<id>.db`, shelves::vfs_name).

/// From now on, reads `file`'s piece `index` from `handle`: a file in the
/// browser's private files the worker has downloaded and checked. Its
/// handle is the VFS's from here on, which closes it.
#[wasm_bindgen]
pub fn offline_add(file: &str, index: usize, handle: web_sys::FileSystemSyncAccessHandle) {
    httpvfs::offline_add(file, index, handle);
}

/// Closes every piece of `file`'s offline copy, so its files can be
/// deleted; it is read over the network again.
#[wasm_bindgen]
pub fn offline_clear(file: &str) {
    httpvfs::offline_clear(file);
}

/// Empties `file`'s persistent page cache: once its offline copy is whole,
/// what it holds is kept twice.
#[wasm_bindgen]
pub fn page_cache_clear(file: &str) {
    httpvfs::disk_clear(file);
}

/// The bytes `file`'s persistent page cache holds (0 without one): what
/// emptying it would give back.
#[wasm_bindgen]
pub fn page_cache_bytes(file: &str) -> f64 {
    httpvfs::disk_usage(file).map_or(0.0, |(_, bytes)| bytes as f64)
}

/// SHA-256, fed a piece at a time as it downloads (Web Crypto has no
/// incremental digest).
#[wasm_bindgen]
pub struct Hasher(sha2::Sha256);

#[wasm_bindgen]
impl Hasher {
    #[wasm_bindgen(constructor)]
    #[allow(clippy::new_without_default)]
    pub fn new() -> Hasher {
        use sha2::Digest;
        Hasher(sha2::Sha256::new())
    }

    pub fn update(&mut self, bytes: &[u8]) {
        use sha2::Digest;
        self.0.update(bytes);
    }

    /// The digest in lowercase hex, as the manifest gives it.
    pub fn finish(self) -> String {
        use sha2::Digest;
        self.0.finalize().iter().map(|b| format!("{b:02x}")).collect()
    }
}

// ---- Library shelves (src/web/shelfWorker.ts) ------------------------------

/// Attaches a library shelf: `base` is the folder it is in on R2 (ending in
/// `/`), `manifest_json` the manifest.json found there (`build_web_content
/// --shelf`). Its database is read over HTTP like content.db, with a page
/// cache of its own (`cache_mb`; 0 for none). Does not touch user.db's
/// rows: call [`shelves_sync`] once every shelf the reader has is attached.
#[wasm_bindgen]
pub async fn shelf_attach(id: String, base: String, manifest_json: String, cache_mb: usize) -> Result<String, String> {
    let manifest: httpvfs::Manifest = serde_json::from_str(&manifest_json).map_err(error_json)?;
    let meta: shelves::ShelfManifest = serde_json::from_str(&manifest_json).map_err(error_json)?;
    if meta.shelf.id != id {
        return Err(error_json(format!("{base}manifest.json is the {} shelf, not {id}", meta.shelf.id)));
    }
    let known = db::schema::LIBRARY_MIGRATIONS.len() as i64;
    if manifest.schema > known {
        return Err(error_json(format!(
            "The {} shelf was made for a newer version of Sojourner (its books are schema {}; this one reads {known}).              Reload the page to update it.",
            meta.shelf.name, manifest.schema
        )));
    }
    if shelves::is_attached(&id) {
        return Ok(json!({ "attached": true }).to_string());
    }
    let name = shelves::vfs_name(&id);
    let (disk, cache_error) = if cache_mb == 0 {
        (None, None)
    } else {
        match PageCache::open(&format!("shelf-{id}"), &manifest.version, manifest.page_size as usize, cache_mb << 20).await {
            Ok(c) => (Some(c), None),
            Err(e) => (None, Some(e)),
        }
    };
    httpvfs::open_file(&name, &base, &manifest, disk).map_err(error_json)?;
    let attached = httpvfs::preload(&name, &base, &manifest.skeleton).and_then(|()| {
        DB.with(|d| {
            let d = d.borrow();
            let db = d.as_ref().ok_or("Sojourner has not started")?;
            let schema = db::pack_schema(&id);
            let done = db
                .conn()
                .execute(&format!("ATTACH DATABASE 'file:{name}?vfs=http&immutable=1' AS {schema}"), [])
                .map(|_| ())
                .map_err(|e| e.to_string());
            done
        })
    });
    if let Err(e) = attached {
        httpvfs::close_file(&name);
        return Err(error_json(e));
    }
    httpvfs::flush();
    let books = meta.shelf.book_count;
    shelves::record(meta);
    Ok(json!({ "attached": true, "books": books, "pageCacheError": cache_error }).to_string())
}

/// Makes user.db's book rows agree with every attached shelf: a row for each
/// book, repointed at `web-shelf:<id>/<file>`. Resolves with what changed.
#[wasm_bindgen]
pub fn shelves_sync() -> Result<String, String> {
    DB.with(|d| {
        let d = d.borrow();
        let db = d.as_ref().ok_or_else(|| error_json("Sojourner has not started"))?;
        let o = shelves::sync(&db.conn()).map_err(|e| error_json(format!("{e:#}")))?;
        Ok(json!({ "added": o.added, "adopted": o.adopted, "repointed": o.repointed, "retired": o.retired, "dropped": o.dropped })
            .to_string())
    })
}

/// Detaches a shelf and retires its books' rows (what the reader wrote on
/// them stays). Resolves with how many rows it retired.
#[wasm_bindgen]
pub fn shelf_remove(id: &str) -> Result<String, String> {
    DB.with(|d| {
        let d = d.borrow();
        let db = d.as_ref().ok_or_else(|| error_json("Sojourner has not started"))?;
        let retired = shelves::remove(&db.conn(), id).map_err(|e| error_json(format!("{e:#}")))?;
        httpvfs::close_file(&shelves::vfs_name(id));
        Ok(json!({ "retired": retired }).to_string())
    })
}
