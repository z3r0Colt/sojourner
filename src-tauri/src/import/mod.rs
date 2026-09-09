pub mod checksum;
pub mod reference;
pub mod thml;
pub mod zefania;

use rusqlite::Connection;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ImportStatus {
    Added,
    Updated,
    Skipped,
    Failed,
    Unrecognized,
}

#[derive(Debug, Clone)]
pub struct ImportOutcome {
    pub status: ImportStatus,
    pub detail: Option<String>,
}

pub trait BibleImporter: Send + Sync {
    fn format_name(&self) -> &'static str;
    fn detect(&self, sample: &str) -> bool;
    fn import(&self, path: &Path, conn: &mut Connection) -> anyhow::Result<ImportOutcome>;
}

pub trait CommentaryImporter: Send + Sync {
    fn format_name(&self) -> &'static str;
    fn detect(&self, sample: &str) -> bool;
    fn import(&self, path: &Path, conn: &mut Connection) -> anyhow::Result<ImportOutcome>;
}

pub fn bible_importers() -> Vec<Box<dyn BibleImporter>> {
    vec![Box::new(zefania::ZefaniaImporter)]
}

pub fn commentary_importers() -> Vec<Box<dyn CommentaryImporter>> {
    vec![Box::new(thml::ThmlCommentaryImporter)]
}

fn read_sample(path: &Path) -> anyhow::Result<String> {
    use std::io::Read;
    let mut file = std::fs::File::open(path)?;
    let mut buf = vec![0u8; 8192];
    let n = file.read(&mut buf)?;
    buf.truncate(n);
    Ok(String::from_utf8_lossy(&buf).to_string())
}

pub struct ScannedFile {
    pub path: String,
    pub format: String,
    pub status: String,
    pub detail: Option<String>,
}

/// Scans a list of candidate file paths, auto-detects format, dispatches to the
/// matching importer. Adding support for a new schema means adding one new
/// BibleImporter/CommentaryImporter impl to the registries above -- no changes here.
pub fn scan_files(conn: &mut Connection, paths: &[PathBuf]) -> Vec<ScannedFile> {
    let bible_importers = bible_importers();
    let commentary_importers = commentary_importers();
    let mut results = Vec::new();

    for path in paths {
        let sample = match read_sample(path) {
            Ok(s) => s,
            Err(e) => {
                results.push(ScannedFile {
                    path: path.display().to_string(),
                    format: "unknown".into(),
                    status: "Failed".into(),
                    detail: Some(format!("could not read file: {e}")),
                });
                continue;
            }
        };

        let bible_match = bible_importers.iter().find(|imp| imp.detect(&sample));
        let commentary_match = commentary_importers.iter().find(|imp| imp.detect(&sample));

        let (format_name, outcome) = if let Some(importer) = bible_match {
            (importer.format_name(), importer.import(path, conn))
        } else if let Some(importer) = commentary_match {
            (importer.format_name(), importer.import(path, conn))
        } else {
            results.push(ScannedFile {
                path: path.display().to_string(),
                format: "unknown".into(),
                status: "Unrecognized".into(),
                detail: Some("could not detect a known Bible or commentary XML format".into()),
            });
            continue;
        };

        match outcome {
            Ok(o) => results.push(ScannedFile {
                path: path.display().to_string(),
                format: format_name.into(),
                status: format!("{:?}", o.status),
                detail: o.detail,
            }),
            Err(e) => results.push(ScannedFile {
                path: path.display().to_string(),
                format: format_name.into(),
                status: "Failed".into(),
                detail: Some(format!("{e:#}")),
            }),
        }
    }

    results
}

/// Default import folders: BIBLES/ and COMMENTARIES/ (recursively) alongside the app,
/// which is where the app's bundled/self-seeded data lives and where a user can drop
/// new files to have them picked up on the next rescan.
pub fn discover_candidate_files(roots: &[PathBuf]) -> Vec<PathBuf> {
    let mut files = Vec::new();
    for root in roots {
        visit_dir(root, &mut files);
    }
    files
}

fn visit_dir(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            visit_dir(&path, out);
        } else if path.extension().map(|e| e.eq_ignore_ascii_case("xml")).unwrap_or(false) {
            out.push(path);
        }
    }
}

/// Populates an empty content.db connection (see `db::open_content_db`) from
/// the source Bible/commentary/reference directories shipped in this repo.
/// This is the one place that knows how to go from raw Zefania/ThML/reference
/// source files to a finished content.db -- used by the `build_content_db`
/// binary (the supported, ahead-of-time way to produce the file the app
/// ships) and, as a dev-only convenience, by the running app itself when no
/// prebuilt content.db resource is found.
pub fn populate_content_db(
    conn: &mut Connection,
    bibles_dir: &Path,
    commentaries_dir: &Path,
    reference_dir: &Path,
) -> anyhow::Result<Vec<ScannedFile>> {
    let files = discover_candidate_files(&[bibles_dir.to_path_buf(), commentaries_dir.to_path_buf()]);
    let results = scan_files(conn, &files);

    if reference_dir.is_dir() {
        reference::import_all(conn, reference_dir)?;
    }

    Ok(results)
}
