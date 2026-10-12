//! A read-only SQLite VFS that reads a database file over HTTP Range
//! requests: sync XHR (allowed in a worker), blocks of one database page, an
//! LRU block cache, and read-ahead that doubles while reads stay sequential.
//!
//! From the phase 0 spike (docs/pwa-spike). Phase 3 reworks it for the
//! chunked files on R2 and a persistent cache.

use rsqlite_vfs::ffi::*;
use rsqlite_vfs::{
    register_vfs, OsCallback, SQLiteIoMethods, SQLiteVfs, SQLiteVfsFile, VfsError, VfsFile, VfsResult, VfsStore,
};
use serde_json::{json, Value};
use sqlite_wasm_rs::WasmOsCallback;
use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::rc::Rc;
use wasm_bindgen::JsCast;

struct Config {
    readahead_max: usize,
    cache_bytes: usize,
}

#[derive(Default, Clone, Copy)]
struct Stats {
    requests: u64,
    bytes: u64,
    xhr_ms: f64,
    reads: u64,
    hits: u64,
}

thread_local! {
    static CFG: RefCell<Config> = const { RefCell::new(Config { readahead_max: 8, cache_bytes: 32 << 20 }) };
    static STATS: Cell<Stats> = Cell::new(Stats::default());
    static FILES: RefCell<HashMap<String, Rc<HttpFile>>> = RefCell::new(HashMap::new());
}

pub fn configure(readahead_max: usize, cache_bytes: usize) {
    CFG.with(|c| *c.borrow_mut() = Config { readahead_max, cache_bytes });
}

pub fn stats_reset() {
    STATS.with(|s| s.set(Stats::default()));
}

/// The HTTP traffic since the last [`stats_reset`]: what the request
/// counting harness reports per command.
pub fn stats() -> Value {
    let s = STATS.with(|s| s.get());
    json!({ "requests": s.requests, "bytes": s.bytes, "xhr_ms": s.xhr_ms, "reads": s.reads, "hits": s.hits })
}

fn bump(f: impl FnOnce(&mut Stats)) {
    STATS.with(|s| {
        let mut v = s.get();
        f(&mut v);
        s.set(v);
    });
}

fn now_ms() -> f64 {
    js_sys::global()
        .unchecked_into::<web_sys::WorkerGlobalScope>()
        .performance()
        .map(|p| p.now())
        .unwrap_or(0.0)
}

/// One GET with a Range header, synchronously. Returns the body and the
/// Content-Range header.
fn fetch_range(url: &str, start: u64, end_inclusive: u64) -> Result<(Vec<u8>, Option<String>), String> {
    use web_sys::{XmlHttpRequest, XmlHttpRequestResponseType};
    let t = now_ms();
    let xhr = XmlHttpRequest::new().map_err(|e| format!("{e:?}"))?;
    xhr.open_with_async("GET", url, false).map_err(|e| format!("{e:?}"))?;
    xhr.set_request_header("Range", &format!("bytes={start}-{end_inclusive}")).map_err(|e| format!("{e:?}"))?;
    xhr.set_response_type(XmlHttpRequestResponseType::Arraybuffer);
    xhr.send().map_err(|e| format!("send: {e:?}"))?;
    let status = xhr.status().unwrap_or(0);
    if status != 206 {
        return Err(format!("{url}: HTTP {status} for range {start}-{end_inclusive}"));
    }
    let body = js_sys::Uint8Array::new(&xhr.response().map_err(|e| format!("{e:?}"))?).to_vec();
    let cr = xhr.get_response_header("Content-Range").ok().flatten();
    let n = body.len() as u64;
    bump(|s| {
        s.requests += 1;
        s.bytes += n;
        s.xhr_ms += now_ms() - t;
    });
    Ok((body, cr))
}

/// Makes `url` openable by SQLite as `name` through the `http` VFS
/// (`ATTACH 'file:<name>?vfs=http&immutable=1'`). Learns the file's size
/// and page size from a first small request; a block is one page.
pub fn open_file(name: &str, url: &str) -> Result<(), String> {
    if FILES.with(|f| f.borrow().contains_key(name)) {
        return Ok(());
    }
    let (head, cr) = fetch_range(url, 0, 99)?;
    let size: usize = cr
        .as_deref()
        .and_then(|h| h.rsplit('/').next())
        .and_then(|s| s.trim().parse().ok())
        .ok_or_else(|| format!("{url}: no Content-Range total"))?;
    if head.len() < 100 || &head[..16] != b"SQLite format 3\0" {
        return Err(format!("{url}: not an SQLite database"));
    }
    // Bytes 16-17, big-endian; 1 stands for 65536.
    let block = match u16::from_be_bytes([head[16], head[17]]) {
        1 => 65536,
        n => n as usize,
    };
    let file = Rc::new(HttpFile {
        url: url.to_string(),
        size,
        block,
        state: RefCell::new(FileState::default()),
        pinned: RefCell::new(HashMap::new()),
    });
    FILES.with(|f| f.borrow_mut().insert(name.to_string(), file));
    Ok(())
}

#[derive(Default)]
struct FileState {
    blocks: HashMap<u64, (Vec<u8>, u64)>,
    tick: u64,
    cached: usize,
    last_block: Option<u64>,
    run: u64,
}

pub struct HttpFile {
    url: String,
    size: usize,
    /// The database's page size.
    block: usize,
    state: RefCell<FileState>,
    /// Blocks loaded from the skeleton file; never evicted or reset.
    pinned: RefCell<HashMap<u64, Vec<u8>>>,
}

impl HttpFile {
    fn ensure(&self, first: u64, last: u64) -> Result<(), String> {
        let bs = self.block as u64;
        let (ra_max, cap) = CFG.with(|c| {
            let c = c.borrow();
            (c.readahead_max as u64, c.cache_bytes)
        });
        let max_block = (self.size as u64 - 1) / bs;
        let mut st = self.state.borrow_mut();
        let pinned = self.pinned.borrow();
        for b in first..=last {
            if let Some(v) = pinned.get(&b) {
                if !st.blocks.contains_key(&b) {
                    st.cached += v.len();
                    st.blocks.insert(b, (v.clone(), 0));
                }
            }
        }
        drop(pinned);
        let mut b = first;
        while b <= last {
            if st.blocks.contains_key(&b) {
                b += 1;
                continue;
            }
            let mut e = b;
            while e < last && !st.blocks.contains_key(&(e + 1)) {
                e += 1;
            }
            // Read-ahead only while SQLite walks forward block by block.
            let sequential = st.last_block.is_some_and(|lb| b == lb + 1);
            st.run = if sequential { (st.run * 2).clamp(1, ra_max) } else { 0 };
            let mut fe = e;
            while fe < (e + st.run).min(max_block) && !st.blocks.contains_key(&(fe + 1)) {
                fe += 1;
            }
            let start = b * bs;
            let end = ((fe + 1) * bs).min(self.size as u64) - 1;
            let (body, _) = fetch_range(&self.url, start, end)?;
            for (i, chunk) in body.chunks(bs as usize).enumerate() {
                st.tick += 1;
                let tick = st.tick;
                st.cached += chunk.len();
                st.blocks.insert(b + i as u64, (chunk.to_vec(), tick));
            }
            b = e + 1;
        }
        // Evict the least recently used tenth when over budget.
        if st.cached > cap {
            let mut ages: Vec<(u64, u64)> = st.blocks.iter().map(|(k, (_, t))| (*t, *k)).collect();
            ages.sort_unstable();
            let drop_n = (ages.len() / 10).max(1);
            for (_, k) in ages.into_iter().take(drop_n) {
                if k >= first && k <= last {
                    continue;
                }
                if let Some((v, _)) = st.blocks.remove(&k) {
                    st.cached -= v.len();
                }
            }
        }
        Ok(())
    }
}

impl VfsFile for HttpFile {
    fn read(&self, buf: &mut [u8], offset: usize) -> VfsResult<bool> {
        bump(|s| s.reads += 1);
        if offset >= self.size {
            buf.fill(0);
            return Ok(false);
        }
        let bs = self.block;
        let end = (offset + buf.len()).min(self.size);
        let (first, last) = ((offset / bs) as u64, ((end - 1) / bs) as u64);
        let all_cached = {
            let st = self.state.borrow();
            let pinned = self.pinned.borrow();
            (first..=last).all(|b| st.blocks.contains_key(&b) || pinned.contains_key(&b))
        };
        if all_cached {
            bump(|s| s.hits += 1);
        }
        self.ensure(first, last).map_err(|e| VfsError::new(SQLITE_IOERR_READ, e))?;
        let mut st = self.state.borrow_mut();
        st.tick += 1;
        let tick = st.tick;
        let mut pos = offset;
        while pos < end {
            let b = (pos / bs) as u64;
            let entry = st.blocks.get_mut(&b).ok_or_else(|| VfsError::new(SQLITE_IOERR_READ, "evicted".into()))?;
            entry.1 = tick;
            let within = pos % bs;
            let n = (entry.0.len() - within).min(end - pos);
            buf[pos - offset..pos - offset + n].copy_from_slice(&entry.0[within..within + n]);
            pos += n;
        }
        st.last_block = Some(last);
        if end < offset + buf.len() {
            buf[end - offset..].fill(0);
            return Ok(false);
        }
        Ok(true)
    }

    fn write(&mut self, _buf: &[u8], _offset: usize) -> VfsResult<()> {
        Err(VfsError::new(SQLITE_READONLY, "read-only".into()))
    }

    fn truncate(&mut self, _size: usize) -> VfsResult<()> {
        Err(VfsError::new(SQLITE_READONLY, "read-only".into()))
    }

    fn flush(&mut self) -> VfsResult<()> {
        Ok(())
    }

    fn size(&self) -> VfsResult<usize> {
        Ok(self.size)
    }
}

struct HttpStore;

impl VfsStore<HttpFile, ()> for HttpStore {
    fn add_file(_vfs: *mut sqlite3_vfs, file: &str, _flags: i32) -> VfsResult<()> {
        Err(VfsError::new(SQLITE_CANTOPEN, format!("http vfs cannot create {file}")))
    }

    fn contains_file(_vfs: *mut sqlite3_vfs, file: &str) -> VfsResult<bool> {
        Ok(FILES.with(|f| f.borrow().contains_key(file)))
    }

    fn delete_file(_vfs: *mut sqlite3_vfs, file: &str) -> VfsResult<()> {
        Err(VfsError::new(SQLITE_IOERR_DELETE, format!("http vfs cannot delete {file}")))
    }

    fn with_file<F: Fn(&HttpFile) -> VfsResult<i32>>(vfs_file: &SQLiteVfsFile, f: F) -> VfsResult<i32> {
        let name = unsafe { vfs_file.name() };
        let file = FILES
            .with(|m| m.borrow().get(&*name).cloned())
            .ok_or_else(|| VfsError::new(SQLITE_IOERR, format!("not open: {name}")))?;
        f(&file)
    }

    fn with_file_mut<F: Fn(&mut HttpFile) -> VfsResult<i32>>(_vfs_file: &SQLiteVfsFile, _f: F) -> VfsResult<i32> {
        // xSync on a read-only file is harmless; writes never get here because
        // the database is opened immutable.
        Ok(SQLITE_OK)
    }
}

struct HttpIo;

impl SQLiteIoMethods for HttpIo {
    type File = HttpFile;
    type AppData = ();
    type Store = HttpStore;
    const VERSION: ::core::ffi::c_int = 1;

    unsafe extern "C" fn xDeviceCharacteristics(_file: *mut sqlite3_file) -> ::core::ffi::c_int {
        SQLITE_IOCAP_IMMUTABLE
    }
}

struct HttpVfs;

impl SQLiteVfs<HttpIo> for HttpVfs {
    const VERSION: ::core::ffi::c_int = 1;

    fn sleep(dur: std::time::Duration) {
        WasmOsCallback::sleep(dur)
    }

    fn random(buf: &mut [u8]) {
        WasmOsCallback::random(buf)
    }

    fn epoch_timestamp_in_ms() -> i64 {
        WasmOsCallback::epoch_timestamp_in_ms()
    }
}

pub fn register() -> Result<(), String> {
    if rsqlite_vfs::registered_vfs("http").map_err(|e| e.to_string())?.is_some() {
        return Ok(());
    }
    register_vfs::<HttpIo, HttpVfs>("http", (), false).map_err(|e| e.to_string())?;
    Ok(())
}

/// Loads a skeleton file (the pages listed in `pages`, concatenated, in
/// order) in one request and pins them in `name`'s cache for good: every
/// interior b-tree page, so a lookup costs only its leaf pages.
pub fn preload(name: &str, skeleton_url: &str, pages: &[u64]) -> Result<(), String> {
    let file = FILES.with(|m| m.borrow().get(name).cloned()).ok_or("not open")?;
    let page_size = file.block;
    let (body, _) = fetch_range(skeleton_url, 0, (pages.len() * page_size) as u64 - 1)?;
    if body.len() != pages.len() * page_size {
        return Err(format!("{skeleton_url}: {} bytes for {} pages", body.len(), pages.len()));
    }
    let mut pinned = file.pinned.borrow_mut();
    for (i, chunk) in body.chunks(page_size).enumerate() {
        // SQLite pages are numbered from 1; blocks from 0.
        pinned.insert(pages[i] - 1, chunk.to_vec());
    }
    Ok(())
}
