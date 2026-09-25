// The two documents family worship leans on, into the same
// westminster_documents/sections tables as the Standards and the creeds, so
// the Confessions page, the search and catechism memory take them as they are.
//
//   catechism_for_young_children.json   Joseph P. Engles's Catechism for Young
//       Children: Being an Introduction to the Shorter Catechism (Presbyterian
//       Board of Publication, Philadelphia, 1840), 145 questions, public domain.
//       Text from catechesis.app, which keeps the 1840 wording ("more than
//       eighteen hundred years", "Because I can think about God and the world
//       to come") where later printings updated it. Checked question by
//       question against reformed.org's copy; the differences are only those
//       updates. Three answers set in capitals as quotations (the Lord's Prayer,
//       Mark 10:14, "the LORD") are given in ordinary case, and question 61's
//       stray "if" is dropped. In the Westminster catechisms' JSON shape, with
//       no proofs.
//   directory_for_family_worship.json   The Directory for Family-Worship
//       approved by the General Assembly of the Church of Scotland, 24 August
//       1647: the Act, the opening paragraph, the fourteen numbered
//       directions, and the closing "drift and scope". Public domain; text
//       from reformedstandards.com, checked against thewestminsterstandard.org
//       and the American Presbyterian Church's copy ("adminished" corrected to
//       "admonished" from the latter).
use super::crossrefs::load_book_lookup;
use super::westminster::{import_document, parse_catechism, ParsedSection};
use rusqlite::Connection;
use serde::Deserialize;
use std::path::Path;

#[derive(Deserialize)]
struct Directory {
    title: String,
    sections: Vec<DirectorySection>,
}

#[derive(Deserialize)]
struct DirectorySection {
    heading: String,
    paragraphs: Vec<String>,
}

fn parse_directory(dir: &Path) -> anyhow::Result<(String, Vec<ParsedSection>)> {
    let text = std::fs::read_to_string(dir.join("directory_for_family_worship.json"))?;
    let directory: Directory = serde_json::from_str(&text)?;
    let sections = directory
        .sections
        .into_iter()
        .map(|s| {
            // The numbered directions are headed by their numeral alone.
            let heading = if s.heading.chars().all(|c| matches!(c, 'I' | 'V' | 'X')) {
                format!("Direction {}", s.heading)
            } else {
                s.heading
            };
            let body = s.paragraphs.join("\n\n");
            ParsedSection { heading, prompt: None, body: body.clone(), body_with_proofs: body, proofs: vec![] }
        })
        .collect();
    Ok((directory.title, sections))
}

/// Parses both before writing either, as the other document importers do.
pub fn import(conn: &mut Connection, dir: &Path) -> anyhow::Result<usize> {
    let book_lookup = load_book_lookup(conn)?;
    let catechism = parse_catechism(dir, "catechism_for_young_children.json")?;
    let directory = parse_directory(dir)?;

    let mut total = 0usize;
    total += import_document(conn, "cyc", &catechism.0, catechism.1, &book_lookup)?;
    total += import_document(conn, "dfw", &directory.0, directory.1, &book_lookup)?;
    Ok(total)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    #[test]
    fn both_documents_import_whole() {
        let dir = std::env::temp_dir().join(format!("sojourner-family-import-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let mut conn = db::open_content_db(&dir.join("content.db")).unwrap();
        let source = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join("reference").join("family_worship");

        import(&mut conn, &source).unwrap();

        let count = |code: &str| -> i64 {
            conn.query_row(
                "SELECT COUNT(*) FROM westminster_sections s JOIN westminster_documents d ON d.id = s.document_id WHERE d.code = ?1",
                [code],
                |r| r.get(0),
            )
            .unwrap()
        };
        assert_eq!(count("cyc"), 145, "every question of the 1840 catechism");
        // The Act, the opening paragraph, fourteen directions, the close.
        assert_eq!(count("dfw"), 17);

        let (prompt, body): (String, String) = conn
            .query_row(
                "SELECT s.prompt, s.body FROM westminster_sections s JOIN westminster_documents d ON d.id = s.document_id
                  WHERE d.code = 'cyc' AND s.heading = 'Question 1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!((prompt.as_str(), body.as_str()), ("Who made you?", "God."));

        let headings: Vec<String> = conn
            .prepare("SELECT s.heading FROM westminster_sections s JOIN westminster_documents d ON d.id = s.document_id WHERE d.code = 'dfw' ORDER BY s.sort_order")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(headings[2], "Direction I");
        assert_eq!(headings[15], "Direction XIV");

        drop(conn);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
