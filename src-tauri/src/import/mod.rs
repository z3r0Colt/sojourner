pub mod checksum;
pub mod plain_index;
pub mod reference;
pub mod thml;
pub mod usfm;
pub mod vocab;
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
    let mut results = scan_files(conn, &files);
    // USFM translations are folders, not single files: `bibles/usfm/<CODE>/`
    // with a `source.json` naming the translation (see `usfm`).
    for dir in usfm::discover(&bibles_dir.join("usfm")) {
        let outcome = usfm::import_dir(&dir, conn);
        results.push(match outcome {
            Ok(o) => ScannedFile {
                path: dir.display().to_string(),
                format: "usfm".into(),
                status: format!("{:?}", o.status),
                detail: o.detail,
            },
            Err(e) => ScannedFile {
                path: dir.display().to_string(),
                format: "usfm".into(),
                status: "Failed".into(),
                detail: Some(format!("{e:#}")),
            },
        });
    }
    backfill_license_status(conn)?;
    // Before any of the reference work, so a build that must not ship stops
    // in seconds rather than after the half hour the importers take.
    refuse_licensed_translations(conn)?;

    if reference_dir.is_dir() {
        reference::import_all(conn, reference_dir)?;
    }

    // Rebuilt every time, since it is read from every translation and takes
    // seconds: the search box's word suggestions (see `vocab`).
    vocab::build(conn)?;
    // And the bare-letters index over the Greek and Hebrew texts.
    plain_index::build(conn)?;

    Ok(results)
}

/// Modern translations whose text is in copyright and cannot be
/// redistributed inside an application without a negotiated licence.
///
/// The app once shipped the first three of these. It does not any more: a
/// complete bundled Bible is far past what any of their publishers allow to
/// be quoted without an agreement, and there was no agreement. They were
/// removed from `bibles/`, and [`refuse_licensed_translations`] keeps them
/// out.
///
/// The list stays, and has grown, because a reader may still have their own
/// licensed copy and import it through "Add File…". That is their
/// arrangement to make, not ours to ship -- so such a translation is marked
/// rather than refused, and the Library settings page says so beside it.
pub const LICENSED_CODES: &[&str] = &["NASB", "NKJV", "NLT", "ESV", "NIV"];

/// Marks translations whose text is in copyright, so the UI can show that
/// distinction rather than implying every translation in the list is freely
/// reproducible -- see the CONTENT_MIGRATION_0009 schema comment. Everything
/// the app itself ships is genuine public domain and keeps the column's
/// default.
fn backfill_license_status(conn: &Connection) -> anyhow::Result<()> {
    for code in LICENSED_CODES {
        conn.execute("UPDATE translations SET license_status = 'licensed' WHERE code = ?1", rusqlite::params![code])?;
    }
    Ok(())
}

/// Fails the build if a copyrighted translation has found its way into the
/// source `bibles/` folder.
///
/// This is here because it already happened once, and the cost of not
/// noticing is high and slow to undo: NASB 1995, NKJV 1982 and NLT 1996 were
/// bundled into the installer and committed to a public repository, where
/// the fix is not a delete but a history rewrite. A release build that stops
/// with a name in it is a far cheaper way to find out.
///
/// Only the build path calls this. A reader importing their own copy goes
/// through `scan_files` from the app, is not refused, and is marked by
/// [`backfill_license_status`] instead.
fn refuse_licensed_translations(conn: &Connection) -> anyhow::Result<()> {
    let mut stmt = conn.prepare(
        "SELECT name, source_path FROM translations WHERE license_status = 'licensed' ORDER BY name",
    )?;
    let found: Vec<(String, String)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<Result<_, _>>()?;
    anyhow::ensure!(
        found.is_empty(),
        "these translations are in copyright and must not ship inside the app:\n{}\n\
         Remove them from bibles/ and build again. A reader who holds a licence \
         can import their own copy through \"Add File…\".",
        found
            .iter()
            .map(|(name, path)| format!("  - {name}  ({path})"))
            .collect::<Vec<_>>()
            .join("\n")
    );
    Ok(())
}

/// The id each bundled translation has always had. A reader's memory cards,
/// sermons, reading position and open Bibles keep translation ids in user.db
/// and the workspace, so a rebuilt content.db must give every translation
/// the id it had before -- ids handed out in import order would renumber
/// every translation after one that was added or taken away. Ids of
/// translations no longer shipped are retired, never reused: 9 was
/// Wycliffe, 14 the Open English Bible. A new bundled translation takes the
/// next unused number below 1000.
const TRANSLATION_IDS: &[(&str, i64)] = &[
    ("ASV", 1),
    ("DBY", 2),
    ("DRA", 3),
    ("GNV", 4),
    ("KJV", 5),
    ("TYN", 6),
    ("WBS", 7),
    ("WEB", 8),
    ("YLT", 10),
    ("BSB", 11),
    ("LSV", 12),
    ("LXX", 13),
    ("ULT", 15),
    ("UST", 16),
    ("VUL", 17),
    ("WLC", 18),
    ("TR", 19),
    ("BYZ", 20),
    ("WH", 21),
    ("TREG", 22),
    ("SBLGNT", 23),
];

/// Translations a reader adds themselves are numbered from here up, clear of
/// every bundled one.
const FIRST_READER_TRANSLATION_ID: i64 = 1000;

/// The id a new translations row takes: its bundled id when it has one and
/// that id is free, else the next id from FIRST_READER_TRANSLATION_ID up (a
/// reader's own copy of the KJV, say, beside the bundled one).
pub(crate) fn new_translation_id(conn: &rusqlite::Connection, code: &str) -> anyhow::Result<i64> {
    if let Some(&(_, id)) = TRANSLATION_IDS.iter().find(|(c, _)| *c == code) {
        let taken: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM translations WHERE id = ?1)", [id], |r| r.get(0))?;
        if !taken {
            return Ok(id);
        }
    }
    let max: i64 = conn.query_row("SELECT COALESCE(MAX(id), 0) FROM translations", [], |r| r.get(0))?;
    Ok(max.max(FIRST_READER_TRANSLATION_ID - 1) + 1)
}

#[cfg(test)]
mod translation_id_tests {
    use super::new_translation_id;
    use rusqlite::Connection;

    #[test]
    fn a_bundled_translation_keeps_its_id_and_a_readers_own_is_numbered_apart() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE translations (id INTEGER PRIMARY KEY, code TEXT);").unwrap();
        assert_eq!(new_translation_id(&conn, "YLT").unwrap(), 10);
        conn.execute("INSERT INTO translations (id, code) VALUES (5, 'KJV')", []).unwrap();
        // A reader's own KJV beside the bundled one, and a translation the
        // app never shipped, both go from 1000 up.
        assert_eq!(new_translation_id(&conn, "KJV").unwrap(), 1000);
        conn.execute("INSERT INTO translations (id, code) VALUES (1000, 'KJV')", []).unwrap();
        assert_eq!(new_translation_id(&conn, "NASB").unwrap(), 1001);
        // Retired ids are never handed out again.
        assert_eq!(new_translation_id(&conn, "WYC").unwrap(), 1001);
    }
}
