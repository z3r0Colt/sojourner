use super::crossrefs::{load_book_lookup, parse_ref_range};
use rusqlite::{params, Connection};
use serde::Deserialize;
use std::path::Path;

#[derive(Deserialize)]
struct ProofEntry {
    #[serde(rename = "Id")]
    id: i64,
    #[serde(rename = "References")]
    references: Vec<String>,
}

#[derive(Deserialize)]
struct Metadata {
    #[serde(rename = "Title")]
    title: String,
}

#[derive(Deserialize)]
struct ConfessionFile {
    #[serde(rename = "Metadata")]
    metadata: Metadata,
    #[serde(rename = "Data")]
    data: Vec<ConfessionChapter>,
}
#[derive(Deserialize)]
struct ConfessionChapter {
    #[serde(rename = "Chapter")]
    chapter: String,
    #[serde(rename = "Sections")]
    sections: Vec<ConfessionSection>,
}
#[derive(Deserialize)]
struct ConfessionSection {
    #[serde(rename = "Section")]
    section: Option<String>,
    #[serde(rename = "Content")]
    content: String,
    #[serde(rename = "ContentWithProofs")]
    content_with_proofs: String,
    #[serde(rename = "Proofs")]
    proofs: Vec<ProofEntry>,
}

#[derive(Deserialize)]
struct CatechismFile {
    #[serde(rename = "Metadata")]
    metadata: Metadata,
    #[serde(rename = "Data")]
    data: Vec<CatechismItem>,
}
#[derive(Deserialize)]
struct CatechismItem {
    #[serde(rename = "Number")]
    number: i64,
    #[serde(rename = "Question")]
    question: String,
    #[serde(rename = "Answer")]
    answer: String,
    #[serde(rename = "AnswerWithProofs")]
    answer_with_proofs: Option<String>,
    #[serde(rename = "Proofs", default)]
    proofs: Vec<ProofEntry>,
}

struct ParsedSection {
    heading: String,
    prompt: Option<String>,
    body: String,
    body_with_proofs: String,
    proofs: Vec<(i64, Vec<String>)>,
}

fn import_document(
    conn: &mut Connection,
    code: &str,
    title: &str,
    sections: Vec<ParsedSection>,
    book_lookup: &std::collections::HashMap<String, i64>,
) -> anyhow::Result<usize> {
    let tx = conn.transaction()?;
    let doc_id: i64 = {
        tx.execute(
            "INSERT INTO westminster_documents (code, title) VALUES (?1,?2)
             ON CONFLICT(code) DO UPDATE SET title = excluded.title",
            params![code, title],
        )?;
        tx.query_row("SELECT id FROM westminster_documents WHERE code = ?1", params![code], |r| r.get(0))?
    };
    tx.execute("DELETE FROM westminster_sections WHERE document_id = ?1", params![doc_id])?;

    let mut count = 0usize;
    {
        let mut section_stmt = tx.prepare(
            "INSERT INTO westminster_sections (document_id, sort_order, heading, prompt, body, body_with_proofs)
             VALUES (?1,?2,?3,?4,?5,?6)",
        )?;
        let mut proof_stmt = tx.prepare(
            "INSERT INTO westminster_proofs (section_id, marker, sort_order, book_id, chapter, verse_start, verse_end)
             VALUES (?1,?2,?3,?4,?5,?6,?7)",
        )?;

        for (idx, s) in sections.iter().enumerate() {
            section_stmt.execute(params![doc_id, idx as i64, s.heading, s.prompt, s.body, s.body_with_proofs])?;
            let section_id = tx.last_insert_rowid();
            let mut sort_order = 0i64;
            for (marker, refs) in &s.proofs {
                for r in refs {
                    if let Some((book, chapter, vs, ve)) = parse_ref_range(r) {
                        if let Some(&book_id) = book_lookup.get(book) {
                            proof_stmt.execute(params![section_id, marker, sort_order, book_id, chapter, vs, ve])?;
                            sort_order += 1;
                        }
                    }
                }
            }
            count += 1;
        }
    }
    tx.commit()?;
    Ok(count)
}

fn parse_confession(dir: &Path) -> anyhow::Result<(String, Vec<ParsedSection>)> {
    let text = std::fs::read_to_string(dir.join("confession.json"))?;
    let confession: ConfessionFile = serde_json::from_str(&text)?;
    let sections = confession
        .data
        .into_iter()
        .flat_map(|ch| {
            let chapter_num = ch.chapter.clone();
            ch.sections.into_iter().map(move |s| ParsedSection {
                heading: format!(
                    "Chapter {}{}",
                    chapter_num,
                    s.section.map(|n| format!(", {n}")).unwrap_or_default()
                ),
                prompt: None,
                body: s.content,
                body_with_proofs: s.content_with_proofs,
                proofs: s.proofs.into_iter().map(|p| (p.id, p.references)).collect(),
            })
        })
        .collect();
    Ok((confession.metadata.title, sections))
}

fn parse_catechism(dir: &Path, file: &str) -> anyhow::Result<(String, Vec<ParsedSection>)> {
    let text = std::fs::read_to_string(dir.join(file))?;
    let catechism: CatechismFile = serde_json::from_str(&text)?;
    let sections = catechism
        .data
        .into_iter()
        .map(|item| {
            let body_with_proofs = item.answer_with_proofs.unwrap_or_else(|| item.answer.clone());
            ParsedSection {
                heading: format!("Question {}", item.number),
                prompt: Some(item.question),
                body: item.answer,
                body_with_proofs,
                proofs: item.proofs.into_iter().map(|p| (p.id, p.references)).collect(),
            }
        })
        .collect();
    Ok((catechism.metadata.title, sections))
}

/// Parses all three documents before writing anything, so a bug in one (as
/// happened once with the Shorter Catechism's leaner schema) can't leave the
/// database with only some documents committed under an import that then
/// reports failure but never gets retried (the caller skips re-running this
/// importer once its tables are non-empty).
pub fn import(conn: &mut Connection, dir: &Path) -> anyhow::Result<usize> {
    let book_lookup = load_book_lookup(conn)?;

    let confession = parse_confession(dir)?;
    let larger = parse_catechism(dir, "larger_catechism.json")?;
    let shorter = parse_catechism(dir, "shorter_catechism.json")?;

    let mut total = 0usize;
    total += import_document(conn, "wcf", &confession.0, confession.1, &book_lookup)?;
    total += import_document(conn, "wlc", &larger.0, larger.1, &book_lookup)?;
    total += import_document(conn, "wsc", &shorter.0, shorter.1, &book_lookup)?;
    Ok(total)
}
