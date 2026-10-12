//! The persistent page cache under the HTTP VFS: every page of content.db
//! read over the network is kept in the browser's private files (OPFS), so
//! anything read once is read locally from then on, across reloads.
//!
//! Three files in the OPFS directory `sojourner-cache/<name>/`, read and
//! written synchronously (sync access handles, which only a worker gets):
//!   pages      page slots, `slot * page_size`
//!   index      a header (magic, content version, page size), then one
//!              12-byte record per page written: block, slot, checksum. A
//!              later record for a slot replaces an earlier one.
//!   skeleton   skeleton.bin as last fetched (its SHA-256 is checked)
//! A different content version in the header empties all three: one version
//! is cached at a time. When the slots are full, the oldest is reused.
//!
//! A page is written before its record, and its checksum is checked when
//! read, so a write torn by a crash costs a refetch, never a bad page. If
//! anything about OPFS fails (no OPFS, another tab holds the files, the
//! storage quota), the VFS goes on without the cache.

use std::collections::HashMap;
use wasm_bindgen::{JsCast, JsValue};
use wasm_bindgen_futures::JsFuture;
use web_sys::{
    FileSystemDirectoryHandle, FileSystemFileHandle, FileSystemGetDirectoryOptions, FileSystemGetFileOptions,
    FileSystemReadWriteOptions, FileSystemSyncAccessHandle,
};

const MAGIC: &[u8; 8] = b"SJPCACHE";
const HEADER: usize = 32;
const RECORD: usize = 12;

pub struct PageCache {
    pages: FileSystemSyncAccessHandle,
    index: FileSystemSyncAccessHandle,
    skeleton: FileSystemSyncAccessHandle,
    page_size: usize,
    /// block → (slot, checksum)
    slots: HashMap<u32, (u32, u32)>,
    /// slot → block
    owner: Vec<Option<u32>>,
    max_slots: u32,
    /// Where the next page goes once every slot is used.
    next: u32,
    index_len: f64,
    dirty: bool,
}

fn at(offset: f64) -> FileSystemReadWriteOptions {
    let o = FileSystemReadWriteOptions::new();
    o.set_at(offset);
    o
}

fn js_err(e: JsValue) -> String {
    e.as_string()
        .or_else(|| e.dyn_ref::<js_sys::Error>().map(|e| String::from(e.message())))
        .unwrap_or_else(|| format!("{e:?}"))
}

/// FNV-1a over the page: only to catch a torn write, not tampering.
fn checksum(data: &[u8]) -> u32 {
    let mut h: u32 = 0x811c_9dc5;
    for &b in data {
        h = (h ^ b as u32).wrapping_mul(0x0100_0193);
    }
    h
}

async fn sync_handle(dir: &FileSystemDirectoryHandle, name: &str) -> Result<FileSystemSyncAccessHandle, String> {
    let opts = FileSystemGetFileOptions::new();
    opts.set_create(true);
    let file: FileSystemFileHandle =
        JsFuture::from(dir.get_file_handle_with_options(name, &opts)).await.map_err(js_err)?.unchecked_into();
    Ok(JsFuture::from(file.create_sync_access_handle()).await.map_err(js_err)?.unchecked_into())
}

impl PageCache {
    /// Opens (or starts) the cache for `name` at content version `version`,
    /// holding at most `max_bytes` of pages.
    pub async fn open(name: &str, version: &str, page_size: usize, max_bytes: usize) -> Result<PageCache, String> {
        let navigator = js_sys::global().unchecked_into::<web_sys::WorkerGlobalScope>().navigator();
        let root: FileSystemDirectoryHandle =
            JsFuture::from(navigator.storage().get_directory()).await.map_err(js_err)?.unchecked_into();
        let mkdir = FileSystemGetDirectoryOptions::new();
        mkdir.set_create(true);
        let mut dir = root;
        for part in ["sojourner-cache", name] {
            dir = JsFuture::from(dir.get_directory_handle_with_options(part, &mkdir)).await.map_err(js_err)?.unchecked_into();
        }
        let pages = sync_handle(&dir, "pages").await?;
        let index = sync_handle(&dir, "index").await?;
        let skeleton = match sync_handle(&dir, "skeleton").await {
            Ok(s) => s,
            Err(e) => {
                pages.close();
                index.close();
                return Err(e);
            }
        };
        let max_slots = (max_bytes / page_size).max(1) as u32;
        let mut cache = PageCache {
            pages,
            index,
            skeleton,
            page_size,
            slots: HashMap::new(),
            owner: Vec::new(),
            max_slots,
            next: 0,
            index_len: 0.0,
            dirty: false,
        };
        cache.load(version)?;
        Ok(cache)
    }

    fn header(version: &str, page_size: usize) -> [u8; HEADER] {
        let mut h = [0u8; HEADER];
        h[..8].copy_from_slice(MAGIC);
        let v = version.as_bytes();
        h[8..8 + v.len().min(16)].copy_from_slice(&v[..v.len().min(16)]);
        h[24..28].copy_from_slice(&(page_size as u32).to_le_bytes());
        h
    }

    fn load(&mut self, version: &str) -> Result<(), String> {
        let want = Self::header(version, self.page_size);
        let len = self.index.get_size().map_err(js_err)? as usize;
        let mut buf = vec![0u8; len];
        if len > 0 {
            self.index.read_with_u8_array_and_options(&mut buf, &at(0.0)).map_err(js_err)?;
        }
        if len < HEADER || buf[..HEADER] != want {
            return self.reset(&want);
        }
        let records = (len - HEADER) / RECORD;
        let mut seq: Vec<(u32, u32)> = Vec::new();
        for r in buf[HEADER..HEADER + records * RECORD].chunks_exact(RECORD) {
            let block = u32::from_le_bytes(r[0..4].try_into().unwrap());
            let slot = u32::from_le_bytes(r[4..8].try_into().unwrap());
            let sum = u32::from_le_bytes(r[8..12].try_into().unwrap());
            if slot >= self.max_slots {
                continue; // from a run with a bigger limit
            }
            if self.owner.len() <= slot as usize {
                self.owner.resize(slot as usize + 1, None);
            }
            if let Some(old) = self.owner[slot as usize].replace(block) {
                self.slots.remove(&old);
            }
            if let Some((old_slot, _)) = self.slots.insert(block, (slot, sum)) {
                if old_slot != slot {
                    self.owner[old_slot as usize] = None;
                }
            }
            seq.push((block, slot));
        }
        self.next = seq.last().map_or(0, |&(_, s)| (s + 1) % self.max_slots);
        self.index_len = (HEADER + records * RECORD) as f64;
        // Rewrite the index once it is mostly superseded records.
        if records > 2 * self.slots.len() + 1024 {
            self.compact(&want)?;
        }
        Ok(())
    }

    fn reset(&mut self, header: &[u8; HEADER]) -> Result<(), String> {
        self.slots.clear();
        self.owner.clear();
        self.next = 0;
        for h in [&self.pages, &self.skeleton, &self.index] {
            h.truncate_with_f64(0.0).map_err(js_err)?;
        }
        self.index.write_with_u8_array_and_options(header, &at(0.0)).map_err(js_err)?;
        self.index_len = HEADER as f64;
        self.index.flush().map_err(js_err)?;
        Ok(())
    }

    fn compact(&mut self, header: &[u8; HEADER]) -> Result<(), String> {
        // Oldest first, so the slot to reuse next is still the oldest.
        let n = self.owner.len() as u32;
        let order = (0..n).map(|i| (self.next + i) % n.max(1));
        let mut out = header.to_vec();
        for slot in order {
            if let Some(block) = self.owner.get(slot as usize).copied().flatten() {
                let (_, sum) = self.slots[&block];
                out.extend_from_slice(&block.to_le_bytes());
                out.extend_from_slice(&slot.to_le_bytes());
                out.extend_from_slice(&sum.to_le_bytes());
            }
        }
        self.index.truncate_with_f64(0.0).map_err(js_err)?;
        self.index.write_with_u8_array_and_options(&out, &at(0.0)).map_err(js_err)?;
        self.index.flush().map_err(js_err)?;
        self.index_len = out.len() as f64;
        Ok(())
    }

    pub fn contains(&self, block: u64) -> bool {
        self.slots.contains_key(&(block as u32))
    }

    /// The page, if it is cached and whole.
    pub fn get(&mut self, block: u64) -> Option<Vec<u8>> {
        let (slot, sum) = *self.slots.get(&(block as u32))?;
        let mut buf = vec![0u8; self.page_size];
        let ok = self
            .pages
            .read_with_u8_array_and_options(&mut buf, &at(slot as f64 * self.page_size as f64))
            .is_ok_and(|n| n as usize == self.page_size);
        if ok && checksum(&buf) == sum {
            return Some(buf);
        }
        self.slots.remove(&(block as u32));
        self.owner[slot as usize] = None;
        None
    }

    /// Keeps a page. Errors (the storage quota, mostly) mean the cache
    /// should not be used any more.
    pub fn put(&mut self, block: u64, data: &[u8]) -> Result<(), String> {
        if data.len() != self.page_size || self.contains(block) {
            return Ok(());
        }
        let block = block as u32;
        let slot = if (self.owner.len() as u32) < self.max_slots {
            self.owner.push(None);
            self.owner.len() as u32 - 1
        } else {
            let s = self.next;
            self.next = (s + 1) % self.max_slots;
            s
        };
        if let Some(old) = self.owner[slot as usize].take() {
            self.slots.remove(&old);
        }
        self.pages
            .write_with_u8_array_and_options(data, &at(slot as f64 * self.page_size as f64))
            .map_err(js_err)?;
        let sum = checksum(data);
        let mut rec = [0u8; RECORD];
        rec[0..4].copy_from_slice(&block.to_le_bytes());
        rec[4..8].copy_from_slice(&slot.to_le_bytes());
        rec[8..12].copy_from_slice(&sum.to_le_bytes());
        self.index.write_with_u8_array_and_options(&rec, &at(self.index_len)).map_err(js_err)?;
        self.index_len += RECORD as f64;
        self.owner[slot as usize] = Some(block);
        self.slots.insert(block, (slot, sum));
        self.dirty = true;
        Ok(())
    }

    /// Pages first, then the index that names them.
    pub fn flush(&mut self) -> Result<(), String> {
        if self.dirty {
            self.pages.flush().map_err(js_err)?;
            self.index.flush().map_err(js_err)?;
            self.dirty = false;
        }
        Ok(())
    }

    /// The skeleton as last stored, if it is `len` bytes.
    pub fn skeleton(&self, len: usize) -> Option<Vec<u8>> {
        if self.skeleton.get_size().ok()? as usize != len {
            return None;
        }
        let mut buf = vec![0u8; len];
        let n = self.skeleton.read_with_u8_array_and_options(&mut buf, &at(0.0)).ok()?;
        (n as usize == len).then_some(buf)
    }

    pub fn put_skeleton(&mut self, data: &[u8]) -> Result<(), String> {
        self.skeleton.truncate_with_f64(0.0).map_err(js_err)?;
        self.skeleton.write_with_u8_array_and_options(data, &at(0.0)).map_err(js_err)?;
        self.skeleton.flush().map_err(js_err)
    }

    /// Pages held, and their bytes.
    pub fn usage(&self) -> (usize, usize) {
        (self.slots.len(), self.slots.len() * self.page_size)
    }
}

impl Drop for PageCache {
    fn drop(&mut self) {
        let _ = self.flush();
        self.pages.close();
        self.index.close();
        self.skeleton.close();
    }
}
