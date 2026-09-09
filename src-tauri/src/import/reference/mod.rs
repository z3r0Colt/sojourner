pub mod confessions;
pub mod crossrefs;
pub mod dictionary;
pub mod footnotes;
pub mod interlinear;
pub mod morphology;
pub mod strongs;
pub mod westminster;
pub mod westminster_commentary;

use rusqlite::Connection;
use std::path::Path;

pub struct ReferenceImportReport {
    pub strongs_entries: usize,
    pub dictionary_entries: usize,
    pub interlinear_words: usize,
    pub cross_references: usize,
    pub westminster_sections: usize,
    pub morphology_words: usize,
    pub footnotes: usize,
    pub westminster_commentary_entries: usize,
    pub confession_sections: usize,
}

fn table_count(conn: &Connection, table: &str) -> i64 {
    conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0))
        .unwrap_or(0)
}

/// confessions::import shares westminster_documents/sections with the
/// Westminster Standards, so it can't be gated on that table being empty --
/// gate on one of its own document codes existing instead.
fn document_exists(conn: &Connection, code: &str) -> bool {
    conn.query_row(
        "SELECT 1 FROM westminster_documents WHERE code = ?1",
        [code],
        |_| Ok(()),
    )
    .is_ok()
}

/// One-time import of bundled reference data (Strong's lexicon, Bible dictionary,
/// interlinear text, cross-references, Westminster Standards). Unlike Bible/commentary
/// import, this data isn't user-extensible via drop-in files -- it ships with the app
/// under `reference/`. Each piece is imported independently and only if its table is
/// currently empty, so a partial failure (or a targeted re-import after fixing a bug
/// in one importer) doesn't require redoing the others.
pub fn import_all(conn: &mut Connection, reference_dir: &Path) -> anyhow::Result<ReferenceImportReport> {
    let strongs_entries = if table_count(conn, "strongs_entries") == 0 {
        let strongs_dir = reference_dir.join("strongs");
        strongs::import(conn, &strongs_dir.join("hebrew.xml"), &strongs_dir.join("greek.xml"))
            .map_err(|e| anyhow::anyhow!("strongs import failed: {e:#}"))?
    } else {
        0
    };

    let dictionary_entries = if table_count(conn, "dictionary_entries") == 0 {
        dictionary::import(conn, &reference_dir.join("dictionary"))
            .map_err(|e| anyhow::anyhow!("dictionary import failed: {e:#}"))?
    } else {
        0
    };

    let interlinear_words = if table_count(conn, "interlinear_words") == 0 {
        interlinear::import(conn, &reference_dir.join("interlinear"))
            .map_err(|e| anyhow::anyhow!("interlinear import failed: {e:#}"))?
    } else {
        0
    };

    let cross_references = if table_count(conn, "cross_references") == 0 {
        crossrefs::import(conn, &reference_dir.join("crossrefs").join("cross_references.txt"))
            .map_err(|e| anyhow::anyhow!("cross-references import failed: {e:#}"))?
    } else {
        0
    };

    let westminster_sections = if table_count(conn, "westminster_sections") == 0 {
        westminster::import(conn, &reference_dir.join("westminster"))
            .map_err(|e| anyhow::anyhow!("westminster import failed: {e:#}"))?
    } else {
        0
    };

    let morphology_words = if table_count(conn, "morphology_words") == 0 {
        morphology::import(conn, &reference_dir.join("morphology"))
            .map_err(|e| anyhow::anyhow!("morphology import failed: {e:#}"))?
    } else {
        0
    };

    let footnotes = if table_count(conn, "footnotes") == 0 {
        let asv = footnotes::import(conn, &reference_dir.join("footnotes").join("asv"), "ASV")
            .map_err(|e| anyhow::anyhow!("ASV footnotes import failed: {e:#}"))?;
        let kjv = footnotes::import_osis(conn, &reference_dir.join("footnotes").join("kjv").join("kjv.osis.xml"), "KJV")
            .map_err(|e| anyhow::anyhow!("KJV footnotes import failed: {e:#}"))?;
        asv + kjv
    } else {
        0
    };

    let westminster_commentary_entries = if table_count(conn, "westminster_commentary_entries") == 0 {
        westminster_commentary::import(conn, &reference_dir.join("westminster_commentary"))
            .map_err(|e| anyhow::anyhow!("westminster commentary import failed: {e:#}"))?
    } else {
        0
    };

    let confession_sections = if !document_exists(conn, "belgic") {
        confessions::import(conn, &reference_dir.join("confessions"))
            .map_err(|e| anyhow::anyhow!("confessions import failed: {e:#}"))?
    } else {
        0
    };

    Ok(ReferenceImportReport {
        strongs_entries,
        dictionary_entries,
        interlinear_words,
        cross_references,
        westminster_sections,
        morphology_words,
        footnotes,
        westminster_commentary_entries,
        confession_sections,
    })
}
