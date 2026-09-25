pub mod atlas;
pub mod confessions;
pub mod crossrefs;
pub mod dictionary;
pub mod doctrine_topics;
pub mod editions;
pub mod factbook;
pub mod family_worship;
pub mod timeline;
pub mod library_catalog;
pub mod footnotes;
pub mod harmony;
pub mod interlinear;
pub mod isbe;
pub mod lexicons;
pub mod morphology;
pub mod psalter;
pub mod reading_plans;
pub mod red_letter;
pub mod strongs;
pub mod thayers;
pub mod treasury;
pub mod westminster;
pub mod westminster_commentary;
pub mod word_study;

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
    pub doctrine_topics: usize,
    pub metrical_psalm_verses: usize,
    pub treasury_entries: usize,
    pub reading_plan_readings: usize,
    pub harmony_readings: usize,
    pub red_letter_ranges: usize,
    pub thayers_entries: usize,
    pub isbe_entries: usize,
    pub atlas_places: usize,
    pub atlas_journeys: usize,
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

/// treasury::import shares commentary_sources/sections/entries with the ThML
/// commentaries (Barnes/Calvin/Matthew Henry/JFB, imported separately via
/// scan_files before this function ever runs), so it can't be gated on that
/// table being empty either -- gate on its own source code existing instead.
fn commentary_source_exists(conn: &Connection, code: &str) -> bool {
    conn.query_row("SELECT 1 FROM commentary_sources WHERE code = ?1", [code], |_| Ok(()))
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

    // Asked per translation, not of the table: the USFM translations (BSB,
    // ULT...) bring their own footnotes in before this runs, and an empty-table
    // check then skipped the ASV's and the KJV's on every clean build.
    let has_footnotes = |conn: &Connection, code: &str| {
        conn.query_row(
            "SELECT 1 FROM footnotes f JOIN translations t ON t.id = f.translation_id WHERE t.code = ?1 LIMIT 1",
            [code],
            |_| Ok(()),
        )
        .is_ok()
    };
    let mut footnotes = 0;
    if !has_footnotes(conn, "ASV") {
        footnotes += footnotes::import(conn, &reference_dir.join("footnotes").join("asv"), "ASV")
            .map_err(|e| anyhow::anyhow!("ASV footnotes import failed: {e:#}"))?;
    }
    if !has_footnotes(conn, "KJV") {
        footnotes += footnotes::import_osis(conn, &reference_dir.join("footnotes").join("kjv").join("kjv.osis.xml"), "KJV")
            .map_err(|e| anyhow::anyhow!("KJV footnotes import failed: {e:#}"))?;
    }

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

    // Beside the confessions in the same tables, so gated on its own code.
    if !document_exists(conn, "cyc") {
        family_worship::import(conn, &reference_dir.join("family_worship"))
            .map_err(|e| anyhow::anyhow!("family worship import failed: {e:#}"))?;
    }

    let doctrine_topics = if table_count(conn, "doctrine_topics") == 0 {
        doctrine_topics::import(conn).map_err(|e| anyhow::anyhow!("doctrine topics import failed: {e:#}"))?
    } else {
        0
    };

    let metrical_psalm_verses = if table_count(conn, "metrical_psalms") == 0 {
        psalter::import(conn, &reference_dir.join("psalter"))
            .map_err(|e| anyhow::anyhow!("metrical psalter import failed: {e:#}"))?
    } else {
        0
    };

    let treasury_entries = if !commentary_source_exists(conn, "treasury") {
        treasury::import(conn, &reference_dir.join("treasury_of_david"))
            .map_err(|e| anyhow::anyhow!("treasury of david import failed: {e:#}"))?
    } else {
        0
    };

    // Not gated on the table being empty: reading_plans::import inserts by
    // `code` and skips what is already there, so a content.db built before a
    // plan existed picks it up without disturbing the plans already imported
    // or the progress recorded against them.
    let reading_plan_readings = reading_plans::import(conn, &reference_dir.join("reading_plans"))
        .map_err(|e| anyhow::anyhow!("reading plans import failed: {e:#}"))?;

    // Gated on `harmonies`, not `harmony_sections`: a content.db built before
    // the app carried more than one harmony has sections already but no
    // harmonies, and needs the import to run again (it clears the old rows
    // itself).
    let harmony_readings = if table_count(conn, "harmonies") == 0 {
        harmony::import(conn, &reference_dir.join("harmony"))
            .map_err(|e| anyhow::anyhow!("gospel harmony import failed: {e:#}"))?
    } else {
        0
    };

    let red_letter_ranges = if table_count(conn, "red_letter_ranges") == 0 {
        red_letter::import(conn, &reference_dir.join("red_letter"))
            .map_err(|e| anyhow::anyhow!("red letter import failed: {e:#}"))?
    } else {
        0
    };

    let thayers_entries = if table_count(conn, "thayers_entries") == 0 {
        thayers::import(conn, &reference_dir.join("thayers").join("thayers.xml"))
            .map_err(|e| anyhow::anyhow!("thayers import failed: {e:#}"))?
    } else {
        0
    };

    let isbe_entries = if table_count(conn, "isbe_entries") == 0 {
        isbe::import(conn, &reference_dir.join("isbe"))
            .map_err(|e| anyhow::anyhow!("encyclopedia import failed: {e:#}"))?
    } else {
        0
    };

    // Places and journeys import together: a journey's legs are resolved
    // against the gazetteer, so there is no state in which one is useful
    // without the other.
    let (atlas_places, atlas_journeys) = if table_count(conn, "atlas_places") == 0 {
        atlas::import(conn, &reference_dir.join("atlas"))
            .map_err(|e| anyhow::anyhow!("atlas import failed: {e:#}"))?
    } else {
        (0, 0)
    };

    // The Greek and Hebrew editions, read from the tagged texts above.
    let has_wlc: bool = conn
        .query_row("SELECT 1 FROM translations WHERE code = 'WLC'", [], |_| Ok(()))
        .is_ok();
    if !has_wlc {
        editions::import(conn, &reference_dir.join("morphology")).map_err(|e| anyhow::anyhow!("editions import failed: {e:#}"))?;
    }

    if table_count(conn, "lexicon_entries") == 0 {
        lexicons::import(conn, reference_dir).map_err(|e| anyhow::anyhow!("lexicons import failed: {e:#}"))?;
    }

    // After the encyclopedia, dictionary and atlas, which it links to.
    if table_count(conn, "factbook_entities") == 0 {
        factbook::import(conn, &reference_dir.join("factbook")).map_err(|e| anyhow::anyhow!("factbook import failed: {e:#}"))?;
    }

    // After the Factbook, whose people and places it links to.
    if table_count(conn, "timeline_events") == 0 {
        timeline::import(conn, &reference_dir.join("timeline")).map_err(|e| anyhow::anyhow!("timeline import failed: {e:#}"))?;
    }

    // The shelf lists live beside reference/, in the repo's library folder.
    if table_count(conn, "library_catalog") == 0 {
        let library_dir = reference_dir.parent().map(|p| p.join("library")).unwrap_or_default();
        library_catalog::import(conn, &library_dir).map_err(|e| anyhow::anyhow!("library catalog import failed: {e:#}"))?;
    }

    // After the morphology and the interlinear, which it reads.
    if table_count(conn, "morph_codes") == 0 {
        word_study::import(conn).map_err(|e| anyhow::anyhow!("word study tables failed: {e:#}"))?;
    }

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
        doctrine_topics,
        metrical_psalm_verses,
        treasury_entries,
        reading_plan_readings,
        harmony_readings,
        red_letter_ranges,
        thayers_entries,
        isbe_entries,
        atlas_places,
        atlas_journeys,
    })
}
