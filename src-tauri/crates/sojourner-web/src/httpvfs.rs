//! A read-only SQLite VFS that reads a database over HTTP Range requests:
//! the pieces `npm run build:content:web` cuts content.db into, as its
//! manifest.json lists them. A block is one database page. Sync XHR (allowed
//! in a worker); in front of the network, three layers:
//!   - the skeleton (every interior b-tree page), loaded at start and kept;
//!   - an LRU of pages in memory (`cache_mb`);
//!   - the persistent page cache in OPFS (`pagecache`), where every page
//!     fetched is kept, so a page is read over the network once.
//! On a miss, a page in one of the manifest's hot segments brings its whole
//! segment (a small table read whole, a slice of an FTS docsize table);
//! otherwise read-ahead doubles while SQLite reads forward.
//!
//! Ahead of all of these, the offline copy: pieces the reader downloaded
//! with "Make available offline" (`src/web/offline.ts`), each SHA-256
//! checked before it is handed over ([`offline_add`]), are read from the
//! browser's files and never fetched or cached again.

use crate::pagecache::PageCache;
use rsqlite_vfs::ffi::*;
use rsqlite_vfs::{
    register_vfs, OsCallback, SQLiteIoMethods, SQLiteVfs, SQLiteVfsFile, VfsError, VfsFile, VfsResult, VfsStore,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlite_wasm_rs::WasmOsCallback;
use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::rc::Rc;
use wasm_bindgen::JsCast;

/// content/web/manifest.json, as `build_web_content` writes it.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub format: u32,
    pub version: String,
    pub schema: i64,
    pub size: u64,
    pub page_size: u64,
    pub chunk_size: u64,
    pub chunks: Vec<Chunk>,
    pub skeleton: SkeletonInfo,
    /// Page runs `[first, last]` (SQLite's numbering, from 1).
    #[serde(default)]
    pub hot: Vec<(u64, u64)>,
}

#[derive(Deserialize)]
pub struct Chunk {
    pub file: String,
    pub size: u64,
}

#[derive(Deserialize)]
pub struct SkeletonInfo {
    pub file: String,
    pub sha256: String,
    pub pages: Vec<u64>,
}

struct Config {
    readahead_max: u64,
    cache_bytes: usize,
}

#[derive(Default, Clone, Copy)]
struct Stats {
    requests: u64,
    bytes: u64,
    xhr_ms: f64,
    reads: u64,
    hits: u64,
    disk_hits: u64,
    offline_hits: u64,
}

thread_local! {
    static CFG: RefCell<Config> = const { RefCell::new(Config { readahead_max: 8, cache_bytes: 32 << 20 }) };
    static STATS: Cell<Stats> = Cell::new(Stats::default());
    static FILES: RefCell<HashMap<String, Rc<HttpFile>>> = RefCell::new(HashMap::new());
    /// The page runs fetched since the last reset, as SQLite numbers them,
    /// and whether each was a hot segment: for the harness.
    static LOG: RefCell<Vec<(u64, u64, bool)>> = const { RefCell::new(Vec::new()) };
    /// content.db's downloaded pieces, by index: open for reading, each
    /// checked against the manifest's SHA-256 before it got here.
    static OFFLINE: RefCell<HashMap<usize, web_sys::FileSystemSyncAccessHandle>> = RefCell::new(HashMap::new());
}

/// Reads content.db's piece `index` from the offline copy from now on.
/// Takes the open handle (the download's own, or one opened at start).
pub fn offline_add(index: usize, handle: web_sys::FileSystemSyncAccessHandle) {
    if let Some(old) = OFFLINE.with(|o| o.borrow_mut().insert(index, handle)) {
        old.close();
    }
}

/// Lets go of the offline copy (closing its files, so they can be deleted).
pub fn offline_clear() {
    for (_, h) in OFFLINE.with(|o| std::mem::take(&mut *o.borrow_mut())) {
        h.close();
    }
}

/// Bytes `offset..offset + buf.len()` of the downloaded piece `index`, if
/// it is there; an error if it reads short.
fn offline_read(index: usize, offset: u64, buf: &mut [u8]) -> Option<Result<(), String>> {
    OFFLINE.with(|o| {
        let o = o.borrow();
        let h = o.get(&index)?;
        Some(match h.read_with_u8_array_and_options(buf, &crate::pagecache::at(offset as f64)) {
            Ok(n) if n as usize == buf.len() => Ok(()),
            Ok(n) => Err(format!("the offline copy of piece {index} is short: {n} bytes at {offset}")),
            Err(e) => Err(crate::pagecache::js_err(e)),
        })
    })
}

pub fn configure(readahead_max: usize, cache_bytes: usize) {
    CFG.with(|c| *c.borrow_mut() = Config { readahead_max: readahead_max as u64, cache_bytes });
}

pub fn stats_reset() {
    STATS.with(|s| s.set(Stats::default()));
    LOG.with(|l| l.borrow_mut().clear());
}

/// The traffic since the last [`stats_reset`]: what the request-counting
/// harness reports per command. `diskHits`: pages read from the
/// persistent cache instead of the network; `offlineHits`: reads served by
/// the offline copy.
pub fn stats() -> Value {
    let s = STATS.with(|s| s.get());
    json!({
        "requests": s.requests, "bytes": s.bytes, "xhr_ms": s.xhr_ms,
        "reads": s.reads, "hits": s.hits, "diskHits": s.disk_hits, "offlineHits": s.offline_hits,
        "log": LOG.with(|l| l.borrow().iter().take(500).map(|&(a, b, hot)| json!([a, b, hot])).collect::<Vec<_>>()),
    })
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

/// One GET of bytes `start..=end` of `url`, synchronously, expecting
/// exactly that many back.
fn fetch_range(url: &str, start: u64, end: u64) -> Result<Vec<u8>, String> {
    use web_sys::{XmlHttpRequest, XmlHttpRequestResponseType};
    let t = now_ms();
    let xhr = XmlHttpRequest::new().map_err(|e| format!("{e:?}"))?;
    xhr.open_with_async("GET", url, false).map_err(|e| format!("{e:?}"))?;
    xhr.set_request_header("Range", &format!("bytes={start}-{end}")).map_err(|e| format!("{e:?}"))?;
    xhr.set_response_type(XmlHttpRequestResponseType::Arraybuffer);
    // A network failure throws here; it is reported as unreachable rather
    // than as whatever the browser's message says.
    if xhr.send().is_err() {
        return Err(format!("Couldn't reach {}: are you online?", host(url)));
    }
    let status = xhr.status().unwrap_or(0);
    let want = (end - start + 1) as usize;
    let body = match status {
        206 => js_sys::Uint8Array::new(&xhr.response().map_err(|e| format!("{e:?}"))?).to_vec(),
        // A server that ignored the Range sent the whole file.
        200 if start == 0 => {
            let mut all = js_sys::Uint8Array::new(&xhr.response().map_err(|e| format!("{e:?}"))?).to_vec();
            all.truncate(want);
            all
        }
        0 => return Err(format!("Couldn't reach {}: are you online?", host(url))),
        _ => return Err(format!("{url}: HTTP {status} for bytes {start}-{end}")),
    };
    if body.len() != want {
        return Err(format!("{url}: {} bytes for bytes {start}-{end}", body.len()));
    }
    bump(|s| {
        s.requests += 1;
        s.bytes += want as u64;
        s.xhr_ms += now_ms() - t;
    });
    Ok(body)
}

fn host(url: &str) -> &str {
    url.split("://").nth(1).and_then(|r| r.split('/').next()).unwrap_or(url)
}

/// Makes the database `manifest` describes, at `base` (a URL ending in
/// `/`), openable by SQLite as `name` through the `http` VFS
/// (`ATTACH 'file:<name>?vfs=http&immutable=1'`), with `disk` as its
/// persistent cache.
pub fn open_file(name: &str, base: &str, manifest: &Manifest, disk: Option<PageCache>) -> Result<(), String> {
    if manifest.format != 1 {
        return Err(format!("{base}manifest.json: format {} is not one this app reads", manifest.format));
    }
    let ps = manifest.page_size;
    if ps == 0 || manifest.chunk_size % ps != 0 {
        return Err(format!("{base}manifest.json: pieces of {} bytes don't hold whole pages of {ps}", manifest.chunk_size));
    }
    let total: u64 = manifest.chunks.iter().map(|c| c.size).sum();
    if total != manifest.size {
        return Err(format!("{base}manifest.json: the pieces add up to {total} bytes, not {}", manifest.size));
    }
    let file = Rc::new(HttpFile {
        urls: manifest.chunks.iter().map(|c| format!("{base}{}", c.file)).collect(),
        size: manifest.size,
        block: ps,
        chunk_blocks: manifest.chunk_size / ps,
        hot: manifest.hot.iter().map(|&(a, b)| (a - 1, b - 1)).collect(),
        state: RefCell::new(FileState::default()),
        pinned: RefCell::new(HashMap::new()),
        disk: RefCell::new(disk),
        offline: name == "content.db",
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
    /// One per piece.
    urls: Vec<String>,
    size: u64,
    /// The database's page size.
    block: u64,
    /// Pages per piece.
    chunk_blocks: u64,
    /// Hot segments, as block runs (from 0), sorted.
    hot: Vec<(u64, u64)>,
    state: RefCell<FileState>,
    /// Blocks loaded from the skeleton file; never evicted.
    pinned: RefCell<HashMap<u64, Vec<u8>>>,
    disk: RefCell<Option<PageCache>>,
    /// Whether this is the file the offline copy is of (content.db).
    offline: bool,
}

impl HttpFile {
    fn hot_segment(&self, b: u64) -> Option<(u64, u64)> {
        let i = self.hot.partition_point(|&(first, _)| first <= b);
        let (first, last) = *self.hot.get(i.checked_sub(1)?)?;
        (b <= last).then_some((first, last))
    }

    fn on_disk(&self, b: u64) -> bool {
        self.disk.borrow().as_ref().is_some_and(|d| d.contains(b))
    }

    /// Whether block `b` can be had without the network.
    fn local(&self, st: &FileState, b: u64) -> bool {
        st.blocks.contains_key(&b)
            || self.pinned.borrow().contains_key(&b)
            || self.on_disk(b)
            || (self.offline && OFFLINE.with(|o| o.borrow().contains_key(&((b / self.chunk_blocks) as usize))))
    }

    fn insert(st: &mut FileState, b: u64, data: Vec<u8>) {
        st.tick += 1;
        st.cached += data.len();
        if let Some((old, _)) = st.blocks.insert(b, (data, st.tick)) {
            st.cached -= old.len();
        }
    }

    /// Brings blocks `first..=last` into memory.
    fn ensure(&self, first: u64, last: u64) -> Result<(), String> {
        let (ra_max, cap) = CFG.with(|c| {
            let c = c.borrow();
            (c.readahead_max, c.cache_bytes)
        });
        let max_block = (self.size - 1) / self.block;
        let mut st = self.state.borrow_mut();
        let mut b = first;
        while b <= last {
            if st.blocks.contains_key(&b) {
                b += 1;
                continue;
            }
            if let Some(v) = self.pinned.borrow().get(&b) {
                Self::insert(&mut st, b, v.clone());
                b += 1;
                continue;
            }
            // The offline copy: the run of blocks the read wants, up to the
            // end of the piece.
            if self.offline {
                let chunk = (b / self.chunk_blocks) as usize;
                let chunk_last = (chunk as u64 + 1) * self.chunk_blocks - 1;
                let mut e = b;
                while e < last && e < chunk_last && !st.blocks.contains_key(&(e + 1)) {
                    e += 1;
                }
                let end = ((e + 1) * self.block).min(self.size);
                let mut buf = vec![0u8; (end - b * self.block) as usize];
                if let Some(read) = offline_read(chunk, (b % self.chunk_blocks) * self.block, &mut buf) {
                    read?;
                    bump(|s| s.offline_hits += 1);
                    for (i, page) in buf.chunks(self.block as usize).enumerate() {
                        Self::insert(&mut st, b + i as u64, page.to_vec());
                    }
                    b = e + 1;
                    continue;
                }
            }
            let from_disk = self.disk.borrow_mut().as_mut().and_then(|d| d.get(b));
            if let Some(v) = from_disk {
                bump(|s| s.disk_hits += 1);
                Self::insert(&mut st, b, v);
                b += 1;
                continue;
            }

            // To the network: the whole hot segment, or the run of missing
            // blocks the read wants plus any read-ahead; never past the end
            // of the piece, nor over a block already at hand.
            let chunk_last = (b / self.chunk_blocks + 1) * self.chunk_blocks - 1;
            let hot = self.hot_segment(b);
            let (lo, hi) = if let Some((first, last)) = hot {
                let mut lo = first.max(b - b % self.chunk_blocks);
                while lo < b && self.local(&st, lo) {
                    lo += 1;
                }
                let mut hi = last.min(chunk_last).min(max_block);
                while hi > b && self.local(&st, hi) {
                    hi -= 1;
                }
                (lo, hi)
            } else {
                let mut e = b;
                while e < last && e < chunk_last && !self.local(&st, e + 1) {
                    e += 1;
                }
                // Read-ahead only while SQLite walks forward block by block.
                let sequential = st.last_block.is_some_and(|lb| b == lb + 1);
                st.run = if sequential { (st.run * 2).clamp(1, ra_max) } else { 0 };
                let mut fe = e;
                while fe < (e + st.run).min(max_block).min(chunk_last) && !self.local(&st, fe + 1) {
                    fe += 1;
                }
                (b, fe)
            };
            let chunk = (lo / self.chunk_blocks) as usize;
            let offset = (lo % self.chunk_blocks) * self.block;
            let end = ((hi + 1) * self.block).min(self.size) - 1 - chunk as u64 * self.chunk_blocks * self.block;
            let body = fetch_range(&self.urls[chunk], offset, end)?;
            LOG.with(|l| l.borrow_mut().push((lo + 1, hi + 1, hot.is_some())));
            let pinned = self.pinned.borrow();
            let mut disk = self.disk.borrow_mut();
            for (i, page) in body.chunks(self.block as usize).enumerate() {
                let n = lo + i as u64;
                if let Some(d) = disk.as_mut().filter(|_| !pinned.contains_key(&n)) {
                    if let Err(e) = d.put(n, page) {
                        web_sys::console::warn_1(&format!("Sojourner's page cache is off: {e}").into());
                        *disk = None;
                    }
                }
                if !st.blocks.contains_key(&n) {
                    Self::insert(&mut st, n, page.to_vec());
                }
            }
            b = hi.max(b) + 1;
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
        let size = self.size as usize;
        if offset >= size {
            buf.fill(0);
            return Ok(false);
        }
        let bs = self.block as usize;
        let end = (offset + buf.len()).min(size);
        let (first, last) = ((offset / bs) as u64, ((end - 1) / bs) as u64);
        let in_memory = {
            let st = self.state.borrow();
            let pinned = self.pinned.borrow();
            (first..=last).all(|b| st.blocks.contains_key(&b) || pinned.contains_key(&b))
        };
        if in_memory {
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
        Ok(self.size as usize)
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

/// Loads the skeleton (the pages the manifest lists, concatenated, in
/// order) and pins them in `name`'s memory for good: every interior b-tree
/// page, so a lookup costs only its leaf pages. From the persistent cache
/// when it holds this version's, else in one request (then kept there).
pub fn preload(name: &str, base: &str, skeleton: &SkeletonInfo) -> Result<(), String> {
    let file = FILES.with(|m| m.borrow().get(name).cloned()).ok_or("not open")?;
    let ps = file.block as usize;
    let len = skeleton.pages.len() * ps;
    if len == 0 {
        return Ok(());
    }
    let stored = file.disk.borrow().as_ref().and_then(|d| d.skeleton(len));
    let stored = stored.or_else(|| if file.offline { skeleton_offline(&file, &skeleton.pages) } else { None });
    let body = match stored.filter(|b| hex(&Sha256::digest(b)) == skeleton.sha256) {
        Some(b) => b,
        None => {
            let url = format!("{base}{}", skeleton.file);
            let body = fetch_range(&url, 0, len as u64 - 1)?;
            if hex(&Sha256::digest(&body)) != skeleton.sha256 {
                return Err(format!("{url} is not the file the manifest describes"));
            }
            if let Some(d) = file.disk.borrow_mut().as_mut() {
                let _ = d.put_skeleton(&body);
            }
            body
        }
    };
    let mut pinned = file.pinned.borrow_mut();
    for (i, chunk) in body.chunks(ps).enumerate() {
        // SQLite pages are numbered from 1; blocks from 0.
        pinned.insert(skeleton.pages[i] - 1, chunk.to_vec());
    }
    Ok(())
}

/// The skeleton assembled from the offline copy, if it holds every page.
fn skeleton_offline(file: &HttpFile, pages: &[u64]) -> Option<Vec<u8>> {
    let ps = file.block as usize;
    let mut body = vec![0u8; pages.len() * ps];
    for (i, &p) in pages.iter().enumerate() {
        let b = p - 1;
        let piece = (b / file.chunk_blocks) as usize;
        offline_read(piece, (b % file.chunk_blocks) * file.block, &mut body[i * ps..(i + 1) * ps])?.ok()?;
    }
    Some(body)
}

/// Empties `name`'s persistent page cache, keeping its skeleton: once the
/// offline copy is whole, the pages it holds are kept twice.
pub fn disk_clear(name: &str) {
    FILES.with(|m| {
        if let Some(f) = m.borrow().get(name) {
            let mut disk = f.disk.borrow_mut();
            if let Some(Err(e)) = disk.as_mut().map(|d| d.clear()) {
                web_sys::console::warn_1(&format!("Sojourner's page cache is off: {e}").into());
                *disk = None;
            }
        }
    });
}

/// Makes the pages fetched so far durable: after every command.
pub fn flush() {
    FILES.with(|m| {
        for f in m.borrow().values() {
            let mut disk = f.disk.borrow_mut();
            if let Some(Err(e)) = disk.as_mut().map(|d| d.flush()) {
                web_sys::console::warn_1(&format!("Sojourner's page cache is off: {e}").into());
                *disk = None;
            }
        }
    });
}

/// Pages and bytes in `name`'s persistent cache (None without one).
pub fn disk_usage(name: &str) -> Option<(usize, usize)> {
    FILES.with(|m| m.borrow().get(name).and_then(|f| f.disk.borrow().as_ref().map(|d| d.usage())))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
