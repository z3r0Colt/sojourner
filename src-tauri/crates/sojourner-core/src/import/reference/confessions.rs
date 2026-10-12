// Imports the ecumenical creeds and the Three Forms of Unity into the same
// westminster_documents/sections tables the Westminster Standards use --
// WestminsterView.tsx is already generic over "any document in that table",
// so these need no frontend changes to show up alongside WCF/WLC/WSC.
//
// Source text: all public domain, from Philip Schaff's Creeds of Christendom
// (1877) -- the received English of the Apostles', Nicene and Athanasian
// creeds and his translation of the Chalcedonian Definition (vol. II); the
// Heidelberg Catechism in the Tercentenary translation, and the Belgic
// Confession and Canons of Dort in the English of the Reformed (Dutch)
// Church in America (vol. III) -- with the Canons' Rejection of Errors, which
// that English omits, from Thomas Scott's translation (1818). See
// tools/extract-schaff-confessions.py. None of these include inline
// Scripture proof-text markers, so body_with_proofs is identical to body and
// proofs is empty for all of them -- unlike the Westminster Standards' JSON.
use super::crossrefs::load_book_lookup;
use super::westminster::{import_document, ParsedSection};
use rusqlite::Connection;
use serde::Deserialize;
use std::path::Path;

#[derive(Deserialize)]
struct FlatCreed {
    title: String,
    paragraphs: Vec<String>,
}

#[derive(Deserialize)]
struct ArticleUnit {
    heading: String,
    paragraphs: Vec<String>,
}

/// One of the catechism's parts; its title ("Part II: Of Man's Redemption")
/// is in the JSON for anyone reading it, but no heading carries it.
#[derive(Deserialize)]
struct HeidelbergPart {
    lords_days: Vec<HeidelbergLordsDay>,
}
#[derive(Deserialize)]
struct HeidelbergLordsDay {
    title: String,
    qas: Vec<HeidelbergQa>,
}
#[derive(Deserialize)]
struct HeidelbergQa {
    number: i64,
    q: String,
    a_paragraphs: Vec<String>,
}

fn units_to_sections(units: Vec<ArticleUnit>) -> Vec<ParsedSection> {
    units
        .into_iter()
        .map(|u| {
            let body = u.paragraphs.join("\n\n");
            ParsedSection {
                heading: u.heading,
                prompt: None,
                body: body.clone(),
                body_with_proofs: body,
                proofs: vec![],
            }
        })
        .collect()
}

fn parse_flat_creed(dir: &Path, file: &str) -> anyhow::Result<(String, Vec<ParsedSection>)> {
    let text = std::fs::read_to_string(dir.join(file))?;
    let creed: FlatCreed = serde_json::from_str(&text)?;
    let body = creed.paragraphs.join("\n\n");
    let section = ParsedSection {
        heading: creed.title.clone(),
        prompt: None,
        body: body.clone(),
        body_with_proofs: body,
        proofs: vec![],
    };
    Ok((creed.title, vec![section]))
}

fn parse_article_doc(dir: &Path, file: &str, title: &str) -> anyhow::Result<(String, Vec<ParsedSection>)> {
    let text = std::fs::read_to_string(dir.join(file))?;
    let units: Vec<ArticleUnit> = serde_json::from_str(&text)?;
    Ok((title.to_string(), units_to_sections(units)))
}

fn parse_heidelberg(dir: &Path) -> anyhow::Result<(String, Vec<ParsedSection>)> {
    let text = std::fs::read_to_string(dir.join("heidelberg.json"))?;
    let parts: Vec<HeidelbergPart> = serde_json::from_str(&text)?;
    let mut sections = Vec::new();
    for part in parts {
        for ld in part.lords_days {
            for qa in ld.qas {
                let body = qa.a_paragraphs.join("\n\n");
                // Cited as "Q&A 21"; the Lord's Day is where it is preached.
                sections.push(ParsedSection {
                    heading: format!("Q&A {} \u{b7} {}", qa.number, ld.title),
                    prompt: Some(qa.q),
                    body: body.clone(),
                    body_with_proofs: body,
                    proofs: vec![],
                });
            }
        }
    }
    Ok(("Heidelberg Catechism".to_string(), sections))
}

/// Parses everything before writing anything, matching westminster::import's
/// approach: a bug in one document's parser can't leave the database with
/// some documents committed under an import the caller won't retry.
pub fn import(conn: &mut Connection, dir: &Path) -> anyhow::Result<usize> {
    let book_lookup = load_book_lookup(conn)?;

    let apostles = parse_flat_creed(dir, "apostles.json")?;
    let nicene = parse_flat_creed(dir, "nicene.json")?;
    let athanasian = parse_flat_creed(dir, "athanasian.json")?;
    let chalcedon = parse_flat_creed(dir, "chalcedon.json")?;
    let belgic = parse_article_doc(dir, "belgic.json", "Belgic Confession")?;
    let canons = parse_article_doc(dir, "canons_of_dort.json", "Canons of Dort")?;
    let heidelberg = parse_heidelberg(dir)?;

    let mut total = 0usize;
    total += import_document(conn, "apostles", &apostles.0, apostles.1, &book_lookup)?;
    total += import_document(conn, "nicene", &nicene.0, nicene.1, &book_lookup)?;
    total += import_document(conn, "athanasian", &athanasian.0, athanasian.1, &book_lookup)?;
    total += import_document(conn, "chalcedon", &chalcedon.0, chalcedon.1, &book_lookup)?;
    total += import_document(conn, "belgic", &belgic.0, belgic.1, &book_lookup)?;
    total += import_document(conn, "heidelberg", &heidelberg.0, heidelberg.1, &book_lookup)?;
    total += import_document(conn, "dort", &canons.0, canons.1, &book_lookup)?;
    Ok(total)
}
