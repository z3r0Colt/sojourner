// Diagnostic tool: compares every bundled translation's chapter/verse counts
// against KJV to surface versification divergences (a translation with a
// different chapter count for a book, or a different verse count for a
// chapter that both have). This is how the versification_map data in
// db/schema.rs content migration was derived and verified -- rerun it after
// adding a new translation to check whether it introduces a new divergence
// that needs a mapping entry.
//
// Usage: cargo run --example versification_audit -- [path/to/content.db]
// Defaults to ../content/content.db (the standard build_content_db output).

use rusqlite::Connection;
use std::collections::BTreeMap;
use std::path::PathBuf;

fn main() -> anyhow::Result<()> {
    let db_path = std::env::args()
        .nth(1)
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("../content/content.db"));
    let conn = Connection::open(&db_path)?;

    let kjv_id: i64 = conn.query_row("SELECT id FROM translations WHERE code = 'KJV'", [], |r| r.get(0))?;

    let mut kjv_profile: BTreeMap<(i64, i64), i64> = BTreeMap::new();
    let mut kjv_chapters: BTreeMap<i64, i64> = BTreeMap::new();
    {
        let mut stmt = conn.prepare(
            "SELECT book_id, chapter, COUNT(*) FROM verses WHERE translation_id = ?1 GROUP BY book_id, chapter",
        )?;
        let rows = stmt.query_map([kjv_id], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?, r.get::<_, i64>(2)?)))?;
        for row in rows {
            let (book, chapter, count) = row?;
            kjv_profile.insert((book, chapter), count);
            let max_chapter = kjv_chapters.entry(book).or_insert(0);
            if chapter > *max_chapter {
                *max_chapter = chapter;
            }
        }
    }

    let mut trans_stmt = conn.prepare("SELECT id, code, name FROM translations WHERE id != ?1 ORDER BY name")?;
    let translations: Vec<(i64, String, String)> = trans_stmt
        .query_map([kjv_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
        .collect::<Result<_, _>>()?;

    for (t_id, code, name) in translations {
        println!("=== {name} ({code}) vs KJV ===");
        let mut chapters: BTreeMap<i64, i64> = BTreeMap::new();
        {
            let mut stmt = conn.prepare("SELECT book_id, MAX(chapter) FROM verses WHERE translation_id = ?1 GROUP BY book_id")?;
            let rows = stmt.query_map([t_id], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?)))?;
            for row in rows {
                let (book, max_chapter) = row?;
                chapters.insert(book, max_chapter);
            }
        }
        for (book, &kjv_max) in &kjv_chapters {
            let this_max = chapters.get(book).copied().unwrap_or(0);
            if this_max != kjv_max {
                let book_name: String = conn.query_row("SELECT name FROM books WHERE id = ?1", [book], |r| r.get(0))?;
                println!("  chapter-count divergence: {book_name} has {this_max} chapters (KJV has {kjv_max})");
            }
        }

        let mut vstmt = conn.prepare(
            "SELECT book_id, chapter, COUNT(*) FROM verses WHERE translation_id = ?1 GROUP BY book_id, chapter",
        )?;
        let rows = vstmt.query_map([t_id], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?, r.get::<_, i64>(2)?)))?;
        for row in rows {
            let (book, chapter, count) = row?;
            if let Some(&kjv_count) = kjv_profile.get(&(book, chapter)) {
                if kjv_count != count {
                    let book_name: String = conn.query_row("SELECT name FROM books WHERE id = ?1", [book], |r| r.get(0))?;
                    println!("  verse-count divergence: {book_name} {chapter} has {count} verses (KJV has {kjv_count})");
                }
            }
        }
    }

    Ok(())
}
