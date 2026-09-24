//! The book library, as a resource pack the reader installs from a file.
//!
//! The shipped books used to be part of the installer: their text inside
//! content.db, their files beside the executable. That was a third of a
//! gigabyte of database and another 145 MB of epub in every download, for a
//! library not every reader wants. So they left, into a pack built once at
//! release time and installed -- or not -- by hand.
//!
//! **Installed from a file, never downloaded.** Settings → About promises
//! this app "makes no network request of its own accord", and nothing here
//! breaks that promise: the reader fetches the pack from the releases page
//! themselves, and this module only ever reads a file they chose. It also
//! means a pack can arrive on a USB stick, which is the case that matters on
//! a study machine with no connection at all.
//!
//! ## What a pack is
//!
//! A zip, which is why the reader can look inside one:
//!
//! ```text
//! pack.json      what it is, and a SHA-256 per member
//! library.db     library_resources + library_fts, prebuilt
//! books/*.epub   the files themselves
//! ```
//!
//! Installing is a file swap, not an import: `library.db` is built at release
//! time with the text already extracted and the search index already written,
//! so installing a quarter-million pages costs a copy rather than the twenty
//! minutes of extraction it took to build. The database is then ATTACHed as
//! `library` (see [`crate::db::attach_library`]) and every query that reads a
//! shipped book resolves against it unqualified.
//!
//! ## What it must never do
//!
//! Damage a library that was already installed. An interrupted install, a
//! truncated download, a zip with a doctored path -- all three end with the
//! previous pack still in place and still attached, because nothing touches
//! the live folder until a complete, verified copy is sitting beside it.

use anyhow::Context;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::{Component, Path, PathBuf};

/// The pack's database, inside the pack folder and inside the zip.
pub const LIBRARY_DB: &str = "library.db";
/// The books, inside the pack folder and inside the zip.
pub const BOOKS_DIR: &str = "books";
/// The manifest, at the root of the zip.
pub const MANIFEST: &str = "pack.json";
/// Where a pack is unpacked before it replaces the installed one.
const STAGING_DIR: &str = ".staging";
/// Where the outgoing pack waits while the new one takes its place.
const RETIRING_DIR: &str = ".retiring";

/// The pack layout this build writes and can read.
///
/// Bumped only for a change that an older build could not make sense of. It
/// is checked before anything is extracted, so an unreadable pack costs the
/// reader a sentence rather than a half-finished install.
pub const PACK_FORMAT: u32 = 1;

/// One member of the pack, and what it should hash to.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackFile {
    pub path: String,
    pub bytes: u64,
    pub sha256: String,
}

/// `pack.json`: what this pack is, and what is in it.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackManifest {
    pub format: u32,
    pub id: String,
    pub name: String,
    pub version: String,
    pub built_at: String,
    /// The library schema version the pack's `library.db` was written at.
    ///
    /// An app that knows fewer migrations than this cannot read the file --
    /// the same fact `db::run_migrations` refuses on, caught here instead so
    /// the refusal names the pack rather than arriving later as a column that
    /// does not exist.
    pub library_schema: usize,
    pub book_count: usize,
    pub bytes: u64,
    pub files: Vec<PackFile>,
}

/// What the page shows in Settings: either no pack, or this one.
#[derive(Debug, Clone, Serialize)]
pub struct PackStatus {
    /// The pack's id: `library` for the Puritan and Reformed shelf, the
    /// shelf's own id for the others.
    pub id: Option<String>,
    pub installed: bool,
    pub name: Option<String>,
    pub version: Option<String>,
    pub built_at: Option<String>,
    pub book_count: Option<usize>,
    pub bytes_on_disk: Option<u64>,
}

impl PackStatus {
    fn none() -> Self {
        PackStatus {
            id: None,
            installed: false,
            name: None,
            version: None,
            built_at: None,
            book_count: None,
            bytes_on_disk: None,
        }
    }
}

/// How far an install has got, for the page's progress bar.
///
/// `bytes_done`/`bytes_total` rather than a percentage because the page can
/// show "412 MB of 690 MB", which on a minute-long extraction tells the
/// reader more than a number that only goes up.
#[derive(Debug, Clone, Serialize)]
pub struct PackProgress {
    pub stage: &'static str,
    pub file: Option<String>,
    pub files_done: usize,
    pub files_total: usize,
    pub bytes_done: u64,
    pub bytes_total: u64,
}

/// What an install did, once it is done.
#[derive(Debug, Clone, Serialize)]
pub struct InstallOutcome {
    pub name: String,
    pub version: String,
    pub book_count: usize,
    pub bytes: u64,
    pub replaced: bool,
}

fn manifest_path(pack_dir: &Path) -> PathBuf {
    pack_dir.join(MANIFEST)
}

/// The installed pack's manifest, or `None` when no pack is installed.
pub fn read_installed_manifest(pack_dir: &Path) -> Option<PackManifest> {
    let text = std::fs::read_to_string(manifest_path(pack_dir)).ok()?;
    serde_json::from_str(&text).ok()
}

/// Whether a pack is installed and usable: both its manifest and its database
/// have to be there.
///
/// A folder holding one without the other is a half-finished install that an
/// earlier version of this module could leave behind; treating it as "not
/// installed" is what lets the next install clean it up rather than trip
/// over it.
pub fn is_installed(pack_dir: &Path) -> bool {
    pack_dir.join(LIBRARY_DB).is_file() && manifest_path(pack_dir).is_file()
}

/// What Settings shows about the installed pack.
pub fn status(pack_dir: &Path) -> PackStatus {
    if !is_installed(pack_dir) {
        return PackStatus::none();
    }
    let Some(manifest) = read_installed_manifest(pack_dir) else {
        return PackStatus::none();
    };
    PackStatus {
        id: Some(manifest.id.clone()),
        installed: true,
        name: Some(manifest.name),
        version: Some(manifest.version),
        built_at: Some(manifest.built_at),
        book_count: Some(manifest.book_count),
        // The installed members only. A `.staging` folder left by an install
        // that failed is not part of what the reader has, and counting it
        // would put a number in front of them that removing the pack would
        // not free.
        bytes_on_disk: Some(
            [MANIFEST, LIBRARY_DB, BOOKS_DIR]
                .iter()
                .map(|name| {
                    let path = pack_dir.join(name);
                    if path.is_dir() {
                        dir_size(&path)
                    } else {
                        std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0)
                    }
                })
                .sum(),
        ),
    }
}

fn dir_size(dir: &Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(dir) else { return 0 };
    entries
        .flatten()
        .map(|e| match e.metadata() {
            Ok(m) if m.is_dir() => dir_size(&e.path()),
            Ok(m) => m.len(),
            Err(_) => 0,
        })
        .sum()
}

/// Rejects any member path that is not a plain relative name.
///
/// A zip carries whatever path its writer put in it, including `..` segments
/// and absolute roots, and joining one of those onto the pack folder writes
/// wherever the archive says -- the "zip slip" that every extractor has to
/// answer for itself. Answered by refusing the name rather than normalising
/// it: a pack this build wrote has no such member, so a pack that does is
/// not one to repair.
fn safe_member_path(pack_dir: &Path, name: &str) -> anyhow::Result<PathBuf> {
    let rel = Path::new(name);
    for component in rel.components() {
        match component {
            Component::Normal(_) => {}
            _ => anyhow::bail!("this pack contains an unsafe file path ({name}) and was not installed"),
        }
    }
    Ok(pack_dir.join(rel))
}

fn hex(digest: impl AsRef<[u8]>) -> String {
    digest.as_ref().iter().map(|b| format!("{b:02x}")).collect()
}

/// Reads `pack.json` out of the zip and checks this build can install it.
///
/// Done before a single byte is extracted: the two ways a pack can be
/// unreadable -- a format from the future, a database schema from the future
/// -- are both knowable up front, and both deserve to be said plainly rather
/// than discovered as a broken install.
fn read_and_check_manifest(archive: &mut zip::ZipArchive<std::fs::File>) -> anyhow::Result<PackManifest> {
    let mut entry = archive
        .by_name(MANIFEST)
        .with_context(|| format!("this file is not a Sojourner resource pack (no {MANIFEST} inside)"))?;
    let mut text = String::new();
    entry.read_to_string(&mut text).context("could not read the pack's manifest")?;
    drop(entry);

    let manifest: PackManifest = serde_json::from_str(&text).context("the pack's manifest is not readable")?;
    anyhow::ensure!(
        manifest.format <= PACK_FORMAT,
        "this pack was built for a newer version of Sojourner (pack format {}, this build reads {PACK_FORMAT}) -- update the app first",
        manifest.format
    );
    let known = crate::db::schema::LIBRARY_MIGRATIONS.len();
    anyhow::ensure!(
        manifest.library_schema <= known,
        "this pack's library was written by a newer version of Sojourner (schema {}, this build knows {known}) -- update the app first",
        manifest.library_schema
    );
    Ok(manifest)
}

/// Unpacks every member into `staging`, verifying each one's SHA-256 as it is
/// written.
///
/// Hashed on the way through rather than in a second pass over the extracted
/// files: it is the same bytes either way, and this way a truncated pack is
/// caught without reading 700 MB twice.
fn extract_verified(
    archive: &mut zip::ZipArchive<std::fs::File>,
    manifest: &PackManifest,
    staging: &Path,
    on_progress: &mut dyn FnMut(PackProgress),
) -> anyhow::Result<()> {
    let files_total = manifest.files.len();
    let bytes_total = manifest.bytes;
    let mut bytes_done = 0u64;

    for (index, wanted) in manifest.files.iter().enumerate() {
        on_progress(PackProgress {
            stage: "extracting",
            file: Some(wanted.path.clone()),
            files_done: index,
            files_total,
            bytes_done,
            bytes_total,
        });

        let dest = safe_member_path(staging, &wanted.path)?;
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let mut entry = archive
            .by_name(&wanted.path)
            .with_context(|| format!("the pack is missing a file its manifest lists ({})", wanted.path))?;
        let mut out = std::fs::File::create(&dest)
            .with_context(|| format!("could not write {}", dest.display()))?;

        // 1 MiB: big enough that a 400 MB database is not five hundred
        // thousand syscalls, small enough to stay off the stack and out of
        // the way on a machine with little memory to spare.
        let mut buffer = vec![0u8; 1024 * 1024];
        let mut hasher = Sha256::new();
        let mut written = 0u64;
        loop {
            let read = entry.read(&mut buffer)?;
            if read == 0 {
                break;
            }
            hasher.update(&buffer[..read]);
            std::io::Write::write_all(&mut out, &buffer[..read])?;
            written += read as u64;
            bytes_done += read as u64;
        }
        out.sync_all()?;

        let got = hex(hasher.finalize());
        anyhow::ensure!(
            got == wanted.sha256,
            "{} did not survive the download intact -- fetch the pack again",
            wanted.path
        );
        anyhow::ensure!(
            written == wanted.bytes,
            "{} is {written} bytes, but the pack says {} -- fetch the pack again",
            wanted.path,
            wanted.bytes
        );
    }

    on_progress(PackProgress {
        stage: "extracting",
        file: None,
        files_done: files_total,
        files_total,
        bytes_done,
        bytes_total,
    });
    Ok(())
}

/// Opens the staged database and satisfies itself that it is one.
///
/// The checksums say the bytes arrived as the builder wrote them. This says
/// the builder wrote something usable -- a library schema this build knows,
/// with books in it. Both are worth asking: a pack built from an empty
/// `library/` folder would pass every checksum and install a library of
/// nothing.
fn check_staged_db(staging: &Path, manifest: &PackManifest) -> anyhow::Result<()> {
    let db_path = staging.join(LIBRARY_DB);
    anyhow::ensure!(db_path.is_file(), "the pack has no {LIBRARY_DB} in it");

    let conn = rusqlite::Connection::open_with_flags(&db_path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
        .context("the pack's library database could not be opened")?;
    let version: i64 = conn
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .context("the pack's library database could not be read")?;
    anyhow::ensure!(
        version as usize == manifest.library_schema,
        "the pack's library database is at schema {version}, but its manifest says {}",
        manifest.library_schema
    );
    let books: i64 = conn
        .query_row("SELECT COUNT(*) FROM library_resources", [], |r| r.get(0))
        .context("the pack's library database has no books table")?;
    anyhow::ensure!(books > 0, "the pack's library is empty");
    Ok(())
}

/// A verified pack sitting in `.staging/`, waiting to be [`commit`]ted.
///
/// The split between [`stage`] and [`commit`] is about the database lock, not
/// about tidiness. Staging reads and hashes several hundred megabytes and can
/// take a minute; the app's single connection is behind a mutex, so holding
/// it for that minute would freeze every other query behind the progress bar
/// the reader is watching. Staging therefore takes no lock at all, and only
/// the three renames that follow do.
pub struct StagedPack {
    manifest: PackManifest,
    replaced: bool,
}

impl StagedPack {
    pub fn manifest(&self) -> &PackManifest {
        &self.manifest
    }
}

/// The manifest of a pack file, read and checked without extracting
/// anything -- what an install asks first, to know which shelf's folder the
/// pack belongs in.
pub fn peek_manifest(archive_path: &Path) -> anyhow::Result<PackManifest> {
    let file = std::fs::File::open(archive_path).with_context(|| format!("could not open {}", archive_path.display()))?;
    let mut archive = zip::ZipArchive::new(file).context("this file is not a readable resource pack")?;
    read_and_check_manifest(&mut archive)
}

/// Unpacks and verifies `archive_path` into `pack_dir/.staging/`, touching
/// nothing the app is currently reading.
///
/// Everything slow and everything fallible happens here: a failure at any
/// point leaves the installed pack exactly as it was, and takes the staging
/// folder with it rather than leaving debris for someone to wonder about.
pub fn stage(
    archive_path: &Path,
    pack_dir: &Path,
    on_progress: &mut dyn FnMut(PackProgress),
) -> anyhow::Result<StagedPack> {
    let file = std::fs::File::open(archive_path)
        .with_context(|| format!("could not open {}", archive_path.display()))?;
    let mut archive = zip::ZipArchive::new(file).context("this file is not a readable resource pack")?;

    on_progress(PackProgress {
        stage: "checking",
        file: None,
        files_done: 0,
        files_total: 0,
        bytes_done: 0,
        bytes_total: 0,
    });
    let manifest = read_and_check_manifest(&mut archive)?;

    std::fs::create_dir_all(pack_dir)?;
    let staging = pack_dir.join(STAGING_DIR);
    let retiring = pack_dir.join(RETIRING_DIR);
    // A previous attempt that died mid-extraction, or a previous swap that
    // died mid-rename. Neither is wanted; both are safe to drop, because
    // nothing is ever read out of these two folders.
    let _ = std::fs::remove_dir_all(&staging);
    let _ = std::fs::remove_dir_all(&retiring);
    std::fs::create_dir_all(&staging)?;

    let extracted = extract_verified(&mut archive, &manifest, &staging, on_progress)
        .and_then(|()| check_staged_db(&staging, &manifest))
        // The manifest is written out rather than extracted: it cannot list
        // its own checksum, so it is not one of the members `extract_verified`
        // walks. Writing the parsed copy also means the installed folder can
        // only ever hold a manifest this build could read.
        .and_then(|()| {
            let text = serde_json::to_string_pretty(&manifest)?;
            std::fs::write(manifest_path(&staging), text)?;
            Ok(())
        });
    if let Err(e) = extracted {
        let _ = std::fs::remove_dir_all(&staging);
        return Err(e);
    }

    let replaced = is_installed(pack_dir);
    Ok(StagedPack { manifest, replaced })
}

/// Puts a [`stage`]d pack in place, calling `detach` immediately before the
/// swap and `attach` immediately after.
///
/// `detach` is not optional politeness: Windows will not rename a file SQLite
/// still holds open, so an attached library.db would fail the swap outright.
/// They are closures rather than a `&Connection` so the caller can hold the
/// database lock across exactly this call and no longer.
pub fn commit(
    pack_dir: &Path,
    staged: StagedPack,
    on_progress: &mut dyn FnMut(PackProgress),
    detach: &mut dyn FnMut() -> anyhow::Result<()>,
    attach: &mut dyn FnMut() -> anyhow::Result<()>,
) -> anyhow::Result<InstallOutcome> {
    let StagedPack { manifest, replaced } = staged;
    let staging = pack_dir.join(STAGING_DIR);
    let retiring = pack_dir.join(RETIRING_DIR);

    on_progress(PackProgress {
        stage: "installing",
        file: None,
        files_done: manifest.files.len(),
        files_total: manifest.files.len(),
        bytes_done: manifest.bytes,
        bytes_total: manifest.bytes,
    });

    // Nothing below may leave the staged copy behind: it is most of a
    // gigabyte, and a reader who saw an install fail should not be quietly
    // paying for it in their app-data folder until the next attempt.
    if let Err(e) = detach() {
        let _ = std::fs::remove_dir_all(&staging);
        return Err(e);
    }
    let swap = swap_in(pack_dir, &staging, &retiring);
    // Whatever happened, the connection gets its library back: on success the
    // new one, on failure the old one, which `swap_in` has put back. An error
    // from `attach` matters less than the one that caused it, so the original
    // wins.
    let attached = attach();
    match swap {
        Ok(()) => attached?,
        Err(e) => {
            let _ = attached;
            let _ = std::fs::remove_dir_all(&staging);
            return Err(e);
        }
    }

    let _ = std::fs::remove_dir_all(&retiring);
    Ok(InstallOutcome {
        name: manifest.name,
        version: manifest.version,
        book_count: manifest.book_count,
        bytes: manifest.bytes,
        replaced,
    })
}

/// [`stage`] then [`commit`], for callers with no lock to worry about (the
/// tests, and anything driving an install outside the running app).
pub fn install(
    archive_path: &Path,
    pack_dir: &Path,
    on_progress: &mut dyn FnMut(PackProgress),
    detach: &mut dyn FnMut() -> anyhow::Result<()>,
    attach: &mut dyn FnMut() -> anyhow::Result<()>,
) -> anyhow::Result<InstallOutcome> {
    let staged = stage(archive_path, pack_dir, on_progress)?;
    commit(pack_dir, staged, on_progress, detach, attach)
}

/// Moves the staged pack into place: the installed files step aside into
/// `.retiring`, the staged ones take their name, and on any failure the old
/// ones are put back.
///
/// Renames within one folder, which on every filesystem this app runs on are
/// atomic and instant -- the alternative, copying 700 MB into place, would
/// need twice the disk and would leave a half-written library if it failed.
fn swap_in(pack_dir: &Path, staging: &Path, retiring: &Path) -> anyhow::Result<()> {
    let members = [MANIFEST, LIBRARY_DB, BOOKS_DIR];

    // The outgoing database's write-ahead log and shared-memory file, which a
    // clean DETACH removes for itself. This is for the copy that a crash left
    // behind: it belongs to the database about to be renamed away, and left
    // here it would pair with the *new* library.db, which is corruption
    // rather than an error. Nothing is lost by deleting them -- a pack is
    // read-only content, so a WAL holds nothing the reader wrote.
    for sidecar in [format!("{LIBRARY_DB}-wal"), format!("{LIBRARY_DB}-shm")] {
        let _ = std::fs::remove_file(pack_dir.join(sidecar));
    }

    std::fs::create_dir_all(retiring)?;
    let mut moved_aside = Vec::new();
    for name in members {
        let live = pack_dir.join(name);
        if live.exists() {
            std::fs::rename(&live, retiring.join(name))
                .with_context(|| format!("could not move the installed {name} aside"))?;
            moved_aside.push(name);
        }
    }

    for name in members {
        let staged = staging.join(name);
        if !staged.exists() {
            continue;
        }
        if let Err(e) = std::fs::rename(&staged, pack_dir.join(name)) {
            // Put back what was moved aside, so a failed install leaves the
            // reader with the library they had rather than none at all.
            for name in &moved_aside {
                let _ = std::fs::rename(retiring.join(name), pack_dir.join(name));
            }
            return Err(anyhow::Error::from(e).context(format!("could not put the new {name} in place")));
        }
    }

    let _ = std::fs::remove_dir_all(staging);
    Ok(())
}

/// Removes the installed pack, calling `detach` first so the database file
/// can go.
///
/// The reader's own rows are not touched here. `library::sync`, run by the
/// caller afterwards, is what retires them -- and retiring keeps the row,
/// its tags and its passage links, so reinstalling the pack later finds them
/// all again.
pub fn remove(pack_dir: &Path, detach: &mut dyn FnMut() -> anyhow::Result<()>) -> anyhow::Result<()> {
    anyhow::ensure!(is_installed(pack_dir), "no resource pack is installed");
    detach()?;
    let wal = format!("{LIBRARY_DB}-wal");
    let shm = format!("{LIBRARY_DB}-shm");
    for name in [MANIFEST, LIBRARY_DB, BOOKS_DIR, STAGING_DIR, RETIRING_DIR, wal.as_str(), shm.as_str()] {
        let path = pack_dir.join(name);
        let result = if path.is_dir() {
            std::fs::remove_dir_all(&path)
        } else if path.exists() {
            std::fs::remove_file(&path)
        } else {
            Ok(())
        };
        result.with_context(|| format!("could not remove {}", path.display()))?;
    }
    // And the folder itself, if nothing else put anything in it. Leaving an
    // empty `library` behind would be harmless but untidy -- a reader looking
    // through their app data should not find a folder for a thing they
    // removed. `remove_dir` only succeeds on an empty directory, which is
    // exactly the condition wanted, so its failure is the answer and not an
    // error.
    let _ = std::fs::remove_dir(pack_dir);
    Ok(())
}

/// Writes a pack: `library.db` and the books, with a manifest that hashes
/// every one of them. Used by the `build_library_pack` binary.
///
/// `book_files` is given explicitly rather than read from a folder so that
/// what the zip carries is exactly what `library.db` has a row for. A folder
/// listing would also sweep up `manifest.json` and anything else that happens
/// to be sitting there.
pub fn write_pack(
    out_path: &Path,
    library_db: &Path,
    book_files: &[PathBuf],
    mut manifest: PackManifest,
) -> anyhow::Result<u64> {
    use std::io::Write;

    if let Some(parent) = out_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut members: Vec<(String, PathBuf)> = vec![(LIBRARY_DB.to_string(), library_db.to_path_buf())];
    let mut books = book_files.to_vec();
    books.sort();
    for book in books {
        let name = book
            .file_name()
            .ok_or_else(|| anyhow::anyhow!("{} has no file name", book.display()))?
            .to_string_lossy()
            .to_string();
        members.push((format!("{BOOKS_DIR}/{name}"), book));
    }

    manifest.files.clear();
    manifest.bytes = 0;
    for (name, path) in &members {
        let bytes = std::fs::metadata(path)?.len();
        let mut file = std::fs::File::open(path)?;
        let mut hasher = Sha256::new();
        let mut buffer = vec![0u8; 1024 * 1024];
        loop {
            let read = file.read(&mut buffer)?;
            if read == 0 {
                break;
            }
            hasher.update(&buffer[..read]);
        }
        manifest.bytes += bytes;
        manifest.files.push(PackFile {
            path: name.clone(),
            bytes,
            sha256: hex(hasher.finalize()),
        });
    }

    let out = std::fs::File::create(out_path)?;
    let mut zip = zip::ZipWriter::new(out);

    // The manifest deflates well and is read before anything else. The
    // database deflates to about a third of its size, which is the whole
    // reason the pack is a zip and not a tar. The books do not: an epub is
    // itself a zip, so deflating one again spends minutes to save nothing,
    // and they go in stored.
    let deflated = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .large_file(true);
    let stored = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Stored)
        .large_file(true);

    zip.start_file(MANIFEST, deflated)?;
    zip.write_all(serde_json::to_string_pretty(&manifest)?.as_bytes())?;

    for (name, path) in &members {
        let options = if name == LIBRARY_DB { deflated } else { stored };
        zip.start_file(name.as_str(), options)?;
        let mut file = std::fs::File::open(path)?;
        let mut buffer = vec![0u8; 1024 * 1024];
        loop {
            let read = file.read(&mut buffer)?;
            if read == 0 {
                break;
            }
            zip.write_all(&buffer[..read])?;
        }
    }

    zip.finish()?;
    Ok(std::fs::metadata(out_path)?.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("sojourner-pack-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// Builds a real pack from a real library.db with one book in it.
    ///
    /// Each pack gets its own source folder, keyed by title, so a test that
    /// builds two of them builds two databases rather than inserting twice
    /// into one.
    fn build_a_pack(dir: &Path, book_title: &str) -> PathBuf {
        let source = dir.join("source").join(book_title);
        let books = source.join(BOOKS_DIR);
        std::fs::create_dir_all(&books).unwrap();
        std::fs::write(books.join("a-book.epub"), b"not really an epub, but it hashes").unwrap();

        let db_path = source.join(LIBRARY_DB);
        {
            let conn = crate::db::open_library_db(&db_path).unwrap();
            conn.execute(
                "INSERT INTO library_resources (file_name, kind, title, author, extracted_text)
                 VALUES ('a-book.epub', 'epub', ?1, 'A. Writer', 'the words inside')",
                [book_title],
            )
            .unwrap();
        }

        let out = dir.join(format!("{book_title}.sjpack"));
        write_pack(
            &out,
            &db_path,
            &[books.join("a-book.epub")],
            PackManifest {
                format: PACK_FORMAT,
                id: "library".into(),
                name: "Test Library".into(),
                version: "1.0.0".into(),
                built_at: "2026-09-17T00:00:00Z".into(),
                library_schema: crate::db::schema::LIBRARY_MIGRATIONS.len(),
                book_count: 1,
                bytes: 0,
                files: Vec::new(),
            },
        )
        .unwrap();
        out
    }

    fn noop() -> anyhow::Result<()> {
        Ok(())
    }

    #[test]
    fn a_pack_installs_and_reports_what_it_holds() {
        let dir = scratch("install");
        let archive = build_a_pack(&dir, "First Edition");
        let pack_dir = dir.join("installed");

        let outcome = install(&archive, &pack_dir, &mut |_| {}, &mut noop, &mut noop).unwrap();
        assert_eq!(outcome.book_count, 1);
        assert!(!outcome.replaced);
        assert!(is_installed(&pack_dir));

        let status = status(&pack_dir);
        assert!(status.installed);
        assert_eq!(status.book_count, Some(1));
        assert!(pack_dir.join(BOOKS_DIR).join("a-book.epub").is_file());
        // The staging and retiring folders are working space, not something
        // a reader should find sitting in their app data afterwards.
        assert!(!pack_dir.join(STAGING_DIR).exists());
        assert!(!pack_dir.join(RETIRING_DIR).exists());
    }

    #[test]
    fn installing_over_a_pack_replaces_it() {
        let dir = scratch("replace");
        let pack_dir = dir.join("installed");
        install(&build_a_pack(&dir, "First Edition"), &pack_dir, &mut |_| {}, &mut noop, &mut noop).unwrap();
        let second = install(&build_a_pack(&dir, "Second Edition"), &pack_dir, &mut |_| {}, &mut noop, &mut noop).unwrap();
        assert!(second.replaced);

        let conn = rusqlite::Connection::open(pack_dir.join(LIBRARY_DB)).unwrap();
        let title: String = conn
            .query_row("SELECT title FROM library_resources", [], |r| r.get(0))
            .unwrap();
        assert_eq!(title, "Second Edition");
    }

    /// The case that must never cost a reader their library: a pack that
    /// fails verification half way through leaves the installed one intact.
    #[test]
    fn a_corrupted_pack_leaves_the_installed_one_alone() {
        let dir = scratch("corrupt");
        let pack_dir = dir.join("installed");
        install(&build_a_pack(&dir, "First Edition"), &pack_dir, &mut |_| {}, &mut noop, &mut noop).unwrap();

        // Rewrite one member's bytes, leaving the manifest's hash of it
        // behind -- exactly what a truncated or edited download looks like.
        let good = build_a_pack(&dir, "Second Edition");
        let broken = dir.join("broken.sjpack");
        {
            let mut source = zip::ZipArchive::new(std::fs::File::open(&good).unwrap()).unwrap();
            let out = std::fs::File::create(&broken).unwrap();
            let mut zip = zip::ZipWriter::new(out);
            let options = zip::write::SimpleFileOptions::default();
            for i in 0..source.len() {
                let mut entry = source.by_index(i).unwrap();
                let name = entry.name().to_string();
                let mut bytes = Vec::new();
                entry.read_to_end(&mut bytes).unwrap();
                if name.starts_with(BOOKS_DIR) {
                    bytes = b"tampered with".to_vec();
                }
                zip.start_file(name.as_str(), options).unwrap();
                std::io::Write::write_all(&mut zip, &bytes).unwrap();
            }
            zip.finish().unwrap();
        }

        let err = install(&broken, &pack_dir, &mut |_| {}, &mut noop, &mut noop).unwrap_err();
        assert!(err.to_string().contains("intact"), "unexpected error: {err}");

        // Still the first pack, still installed, no debris left behind.
        let conn = rusqlite::Connection::open(pack_dir.join(LIBRARY_DB)).unwrap();
        let title: String = conn
            .query_row("SELECT title FROM library_resources", [], |r| r.get(0))
            .unwrap();
        assert_eq!(title, "First Edition");
        assert!(!pack_dir.join(STAGING_DIR).exists());
    }

    #[test]
    fn a_pack_from_a_newer_build_is_refused_before_anything_is_written() {
        let dir = scratch("newer");
        let good = build_a_pack(&dir, "From The Future");
        let future = dir.join("future.sjpack");
        {
            let mut source = zip::ZipArchive::new(std::fs::File::open(&good).unwrap()).unwrap();
            let out = std::fs::File::create(&future).unwrap();
            let mut zip = zip::ZipWriter::new(out);
            let options = zip::write::SimpleFileOptions::default();
            for i in 0..source.len() {
                let mut entry = source.by_index(i).unwrap();
                let name = entry.name().to_string();
                let mut bytes = Vec::new();
                entry.read_to_end(&mut bytes).unwrap();
                if name == MANIFEST {
                    let mut manifest: PackManifest = serde_json::from_slice(&bytes).unwrap();
                    manifest.library_schema = crate::db::schema::LIBRARY_MIGRATIONS.len() + 1;
                    bytes = serde_json::to_vec(&manifest).unwrap();
                }
                zip.start_file(name.as_str(), options).unwrap();
                std::io::Write::write_all(&mut zip, &bytes).unwrap();
            }
            zip.finish().unwrap();
        }

        let pack_dir = dir.join("installed");
        let err = install(&future, &pack_dir, &mut |_| {}, &mut noop, &mut noop).unwrap_err();
        assert!(err.to_string().contains("newer version"), "unexpected error: {err}");
        assert!(!is_installed(&pack_dir));
    }

    #[test]
    fn removing_a_pack_takes_the_whole_folder() {
        let dir = scratch("remove");
        let pack_dir = dir.join("installed");
        install(&build_a_pack(&dir, "First Edition"), &pack_dir, &mut |_| {}, &mut noop, &mut noop).unwrap();

        remove(&pack_dir, &mut noop).unwrap();
        assert!(!is_installed(&pack_dir));
        assert!(!pack_dir.join(BOOKS_DIR).exists());
        assert!(!status(&pack_dir).installed);
        assert!(!pack_dir.exists(), "the empty folder should go too");
        assert!(remove(&pack_dir, &mut noop).is_err());
    }

    #[test]
    fn a_member_path_that_climbs_out_of_the_folder_is_refused() {
        let dir = scratch("slip");
        assert!(safe_member_path(&dir, "books/fine.epub").is_ok());
        for bad in ["../escaped.epub", "books/../../escaped.epub", "/etc/passwd"] {
            assert!(safe_member_path(&dir, bad).is_err(), "{bad} should have been refused");
        }
    }

    /// The release check: every pack in `packs/` for this version installs
    /// through the same path Settings uses, into the layout the app reads
    /// (the Puritan shelf at the root, each other shelf in `shelves/<id>`),
    /// and all of them attach side by side with their citations. Run before
    /// a release: `cargo test --lib real_packs -- --ignored`.
    #[test]
    #[ignore]
    fn real_packs_install_and_attach_side_by_side() {
        let packs = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("packs");
        let version = env!("CARGO_PKG_VERSION");
        let root = scratch("real");
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        let mut installed = 0;
        for entry in std::fs::read_dir(&packs).unwrap().flatten() {
            let path = entry.path();
            let name = path.file_name().unwrap().to_string_lossy().to_string();
            if !name.ends_with(&format!("-{version}.sjpack")) {
                continue;
            }
            let manifest = peek_manifest(&path).unwrap();
            let dir = if manifest.id == "library" { root.clone() } else { root.join("shelves").join(&manifest.id) };
            let outcome = install(&path, &dir, &mut |_| {}, &mut noop, &mut noop).unwrap();
            assert_eq!(outcome.book_count, manifest.book_count, "{name}");
            crate::db::attach_pack(&conn, &manifest.id, &dir.join(LIBRARY_DB)).unwrap();
            let schema = crate::db::pack_schema(&manifest.id);
            let books: i64 = conn.query_row(&format!("SELECT COUNT(*) FROM {schema}.library_resources"), [], |r| r.get(0)).unwrap();
            let citations: i64 = conn.query_row(&format!("SELECT COUNT(*) FROM {schema}.library_citations"), [], |r| r.get(0)).unwrap();
            println!("{name}: {} as {schema}, {books} books, {citations} citations", manifest.name);
            assert_eq!(books as usize, manifest.book_count);
            assert!(citations > 0, "{name} carries no citations");
            installed += 1;
        }
        assert!(installed >= 4, "expected four packs for {version} in {}", packs.display());
        assert_eq!(crate::db::attached_library_schemas(&conn).len(), installed);
        let _ = std::fs::remove_dir_all(&root);
    }

}
