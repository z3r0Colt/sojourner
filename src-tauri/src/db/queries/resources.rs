use crate::models::{Resource, ResourceLink, ResourcePassageLink, ResourceSearchResult};
use rusqlite::{params, Connection, OptionalExtension};

fn map_resource(r: &rusqlite::Row) -> rusqlite::Result<Resource> {
    let text: Option<String> = r.get(4)?;
    let library_key: Option<String> = r.get(7)?;
    Ok(Resource {
        id: r.get(0)?,
        kind: r.get(1)?,
        title: r.get(2)?,
        author: r.get(3)?,
        // A shipped book carries no text in user.db -- content.db holds it for
        // every install -- but it is every bit as searchable.
        has_text: text.is_some() || library_key.is_some(),
        file_path: r.get(5)?,
        added_at: r.get(6)?,
        bundled: library_key.is_some(),
    })
}
const RESOURCE_COLS: &str = "id, kind, title, author, extracted_text, file_path, added_at, library_key";

pub fn list_all(conn: &Connection) -> anyhow::Result<Vec<Resource>> {
    let mut stmt = conn.prepare(&format!("SELECT {RESOURCE_COLS} FROM resources ORDER BY title COLLATE NOCASE"))?;
    let rows = stmt.query_map([], map_resource)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn get(conn: &Connection, id: i64) -> anyhow::Result<Option<Resource>> {
    Ok(conn
        .query_row(&format!("SELECT {RESOURCE_COLS} FROM resources WHERE id = ?1"), params![id], map_resource)
        .optional()?)
}

/// The words of a resource. A shipped book's text is in content.db rather
/// than in the reader's own file, so the lookup follows `library_key` there.
pub fn get_extracted_text(conn: &Connection, id: i64) -> anyhow::Result<Option<String>> {
    let row: Option<(Option<String>, Option<String>)> = conn
        .query_row(
            "SELECT extracted_text, library_key FROM resources WHERE id = ?1",
            params![id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    match row {
        Some((text, None)) => Ok(text),
        Some((_, Some(key))) => crate::library::extracted_text(conn, &key),
        None => Ok(None),
    }
}

pub fn create(conn: &Connection, kind: &str, title: &str, author: Option<&str>, file_path: &str, extracted_text: Option<&str>) -> anyhow::Result<Resource> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO resources (kind, title, author, file_path, extracted_text, added_at) VALUES (?1,?2,?3,?4,?5,?6)",
        params![kind, title, author, file_path, extracted_text, now],
    )?;
    let id = conn.last_insert_rowid();
    Ok(conn.query_row(&format!("SELECT {RESOURCE_COLS} FROM resources WHERE id = ?1"), params![id], map_resource)?)
}

/// Replaces a resource's extracted text, after a re-extraction.
///
/// `resources_fts` is kept in step by the UPDATE trigger on this table, so a
/// book that was "not searchable" becomes findable the moment this returns.
pub fn set_extracted_text(conn: &Connection, id: i64, extracted_text: Option<&str>) -> anyhow::Result<Resource> {
    conn.execute("UPDATE resources SET extracted_text = ?2 WHERE id = ?1", params![id, extracted_text])?;
    Ok(conn.query_row(&format!("SELECT {RESOURCE_COLS} FROM resources WHERE id = ?1"), params![id], map_resource)?)
}

/// Renames a resource and sets (or clears) its author. The FTS index
/// follows through the UPDATE trigger.
pub fn update_details(conn: &Connection, id: i64, title: &str, author: Option<&str>) -> anyhow::Result<Resource> {
    conn.execute("UPDATE resources SET title = ?2, author = ?3 WHERE id = ?1", params![id, title, author])?;
    Ok(conn.query_row(&format!("SELECT {RESOURCE_COLS} FROM resources WHERE id = ?1"), params![id], map_resource)?)
}

/// Sets one author on several resources at once ("Set author for all" on
/// the group with none).
pub fn set_author_many(conn: &Connection, ids: &[i64], author: Option<&str>) -> anyhow::Result<usize> {
    let tx = conn.unchecked_transaction()?;
    let mut n = 0;
    for id in ids {
        n += tx.execute("UPDATE resources SET author = ?2 WHERE id = ?1", params![id, author])?;
    }
    tx.commit()?;
    Ok(n)
}

pub fn delete(conn: &Connection, id: i64) -> anyhow::Result<()> {
    conn.execute("DELETE FROM resources WHERE id = ?1", params![id])?;
    Ok(())
}

/// Characters of the book shown either side of the word that was found.
const SNIPPET_RADIUS: i64 = 80;
/// The slice asked of SQLite, before it is cut back to whole words.
const SNIPPET_WINDOW: i64 = SNIPPET_RADIUS * 2 + 60;

/// A book the search matched, before it has been quoted.
struct RankedHit {
    resource_id: i64,
    title: String,
    kind: String,
    /// bm25, which is negative: most relevant first.
    rank: f64,
    /// Where this book's text is to be read from when quoting it -- the
    /// shipped copy in content.db, or the reader's own row in user.db.
    shipped: bool,
    /// The row id of that text, which for a shipped book is not the id of
    /// the resource row that names it.
    text_id: i64,
}

/// Cuts a passage of a book around the word that was found, ready for the
/// library page to show.
///
/// This does by hand what `snippet()` would do, because `snippet()` cannot
/// be afforded here -- see the note in `search`. `window` is the slice
/// SQLite returned; `cut_before` and `cut_after` say whether the book
/// carried on past either end of it.
fn quote(window: &str, cut_before: bool, cut_after: bool, terms: &[String]) -> String {
    let mut text = window;
    // A window starts and ends mid-word; drop the halves.
    if cut_before {
        if let Some((at, c)) = text.char_indices().find(|(_, c)| c.is_whitespace()) {
            text = &text[at + c.len_utf8()..];
        }
    }
    if cut_after {
        if let Some(at) = text.rfind(char::is_whitespace) {
            text = &text[..at];
        }
    }
    let mut out = String::with_capacity(text.len() + 16);
    if cut_before {
        out.push('…');
    }
    out.push_str(&mark_terms(text.trim(), terms));
    if cut_after {
        out.push('…');
    }
    out
}

/// A term shorter than this marks only the word itself, not everything
/// beginning with it. Searching "of" does match a book on "offended" -- every
/// term is searched for as a prefix -- but lighting that up in the quote
/// helps nobody, and a page of "[the]" and "[Therefore]" is unreadable.
const PREFIX_MARK_MIN: usize = 4;

/// Wraps the words the search matched in the brackets the library page turns
/// into `<mark>`.
///
/// Matching is anchored to the start of a word and runs to the end of it, so
/// a real prefix search reads properly: "justif" marks "justification". Case
/// is folded the ASCII way, which is what SQLite's own `lower()` does, so
/// this pass and the one that placed the window agree.
fn mark_terms(text: &str, terms: &[String]) -> String {
    let bytes = text.as_bytes();
    let mut out = String::with_capacity(text.len() + 16);
    let mut at = 0;
    while at < bytes.len() {
        let starts_word = !text[..at].chars().next_back().is_some_and(char::is_alphanumeric);
        let matched = starts_word
            .then(|| {
                terms.iter().find(|t| {
                    !t.is_empty()
                        && starts_with_ci(&bytes[at..], t.as_bytes())
                        && (t.len() >= PREFIX_MARK_MIN || word_end(text, at + t.len()) == at + t.len())
                })
            })
            .flatten();
        match matched {
            Some(term) => {
                let end = word_end(text, at + term.len());
                out.push(super::search::MARK_START);
                out.push_str(&text[at..end]);
                out.push(super::search::MARK_END);
                at = end;
            }
            None => {
                // Advancing by the character keeps `at` on a boundary; a
                // multi-byte letter can never be mistaken for an ASCII one,
                // since its bytes all have the high bit set.
                let c = text[at..].chars().next().unwrap_or(' ');
                out.push(c);
                at += c.len_utf8();
            }
        }
    }
    out
}

/// Where the word running from `at` ends.
///
/// A word is letters and digits, which is how fts5's own tokenizer sees it:
/// a dash or a curly apostrophe ends one, so "husks—while" is two words and
/// only the first of them is marked.
fn word_end(text: &str, at: usize) -> usize {
    text[at..]
        .char_indices()
        .find(|(_, c)| !c.is_alphanumeric())
        .map_or(text.len(), |(offset, _)| at + offset)
}

fn starts_with_ci(haystack: &[u8], needle: &[u8]) -> bool {
    haystack.len() >= needle.len() && haystack[..needle.len()].eq_ignore_ascii_case(needle)
}

pub fn search(conn: &Connection, query: &str, limit: i64) -> anyhow::Result<Vec<ResourceSearchResult>> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    let match_expr = super::search::build_match_expr(query);
    if match_expr.is_empty() {
        return Ok(vec![]);
    }

    // Ranking and quoting are deliberately two passes.
    //
    // A document in these indexes is a whole book, and the shipped library is
    // a quarter of a gigabyte of them. fts5's `snippet()` walks every
    // instance of every matched term in a document to choose its window, so
    // on a common word it is enormously expensive -- a single book was
    // measured here at up to 24 seconds. Asking for it in the same SELECT as
    // `ORDER BY bm25` runs it on every book that matched, before the ranking
    // has thrown any of them away, and an everyday phrase like "husks of the
    // world" then never returns: that is what used to lock the app up.
    //
    // So the first pass ranks and takes the best few, with no snippet at all,
    // and the second quotes only those, by cutting the text around the word
    // rather than asking fts5 for it.
    //
    // Two indexes hold the library: the reader's own books in user.db, and
    // the shipped ones in content.db (their text is the same on every
    // install, so it is not copied into anybody's own file). Each is asked
    // separately -- bm25() wants its table in the FROM of the query it is
    // called in -- and the two are merged by rank.
    let mut hits: Vec<RankedHit> = Vec::new();
    // A shipped book is excluded here even though user.db still indexes its
    // title: its text lives in content.db, so the second query is the one
    // that can quote it, and without this the same book comes back twice --
    // once with nothing to show for itself.
    let mut own = conn.prepare(
        "SELECT res.id, res.title, res.kind, bm25(resources_fts)
         FROM resources_fts JOIN resources res ON res.id = resources_fts.rowid
         WHERE resources_fts MATCH ?1 AND res.library_key IS NULL
         ORDER BY bm25(resources_fts) LIMIT ?2",
    )?;
    let rows = own.query_map(params![match_expr, limit], |r| {
        let resource_id: i64 = r.get(0)?;
        Ok(RankedHit { resource_id, title: r.get(1)?, kind: r.get(2)?, rank: r.get(3)?, shipped: false, text_id: resource_id })
    })?;
    for row in rows {
        hits.push(row?);
    }

    // Only where the attached content.db is new enough to have one: an older
    // one has no such table, and a reader's own books must still be findable.
    if crate::library::is_available(conn) {
        let mut shipped = conn.prepare(
            "SELECT res.id, res.title, res.kind, bm25(library_fts), lib.id
             FROM library_fts
             JOIN library_resources lib ON lib.id = library_fts.rowid
             JOIN resources res ON res.library_key = lib.file_name
             WHERE library_fts MATCH ?1 ORDER BY bm25(library_fts) LIMIT ?2",
        )?;
        let rows = shipped.query_map(params![match_expr, limit], |r| {
            Ok(RankedHit { resource_id: r.get(0)?, title: r.get(1)?, kind: r.get(2)?, rank: r.get(3)?, shipped: true, text_id: r.get(4)? })
        })?;
        for row in rows {
            hits.push(row?);
        }
    }

    // bm25 is negative, most relevant first.
    hits.sort_by(|a, b| a.rank.partial_cmp(&b.rank).unwrap_or(std::cmp::Ordering::Equal));
    hits.truncate(limit.max(0) as usize);

    // The word to centre each passage on: the longest of the terms, as the
    // most distinctive of them. A term that turns out to be in the book's
    // title rather than its text is not found, and the passage is taken from
    // the opening instead -- which is also what a book with no text at all
    // gets.
    // Punctuation is trimmed off because fts5 tokenizes it away too: a search
    // for `grace,` matches the word "grace", so that is what has to be looked
    // for in the text.
    // The words searched for, as the query language read them: a phrase's
    // words, not its quotation marks; nothing that was excluded.
    let mut terms: Vec<String> = super::query_lang::parse(query, Default::default())
        .mark_words
        .iter()
        .flat_map(|w| w.split_whitespace().map(str::to_string).collect::<Vec<_>>())
        .map(|t| t.trim_matches(|c: char| !c.is_alphanumeric()).to_ascii_lowercase())
        .filter(|t| !t.is_empty())
        .collect();
    terms.sort_by_key(|t| std::cmp::Reverse(t.len()));
    let needle = terms.first().cloned().unwrap_or_default();

    let mut quote_own = conn.prepare(
        "SELECT pos, substr(t, MAX(1, pos - ?3), ?4), length(t)
         FROM (SELECT extracted_text AS t, instr(lower(extracted_text), ?2) AS pos FROM resources WHERE id = ?1)",
    )?;
    let mut quote_shipped = crate::library::is_available(conn)
        .then(|| {
            conn.prepare(
                "SELECT pos, substr(t, MAX(1, pos - ?3), ?4), length(t)
                 FROM (SELECT extracted_text AS t, instr(lower(extracted_text), ?2) AS pos FROM library_resources WHERE id = ?1)",
            )
        })
        .transpose()?;

    let mut out = Vec::with_capacity(hits.len());
    for hit in hits {
        let stmt = if hit.shipped { quote_shipped.as_mut() } else { Some(&mut quote_own) };
        let found = match stmt {
            Some(stmt) => stmt
                .query_row(params![hit.text_id, needle, SNIPPET_RADIUS, SNIPPET_WINDOW], |r| {
                    Ok((r.get::<_, Option<i64>>(0)?, r.get::<_, Option<String>>(1)?, r.get::<_, Option<i64>>(2)?))
                })
                .optional()?,
            None => None,
        };
        let snippet = match found {
            Some((pos, Some(window), Some(total))) => {
                let start = (pos.unwrap_or(0) - SNIPPET_RADIUS).max(1);
                quote(&window, start > 1, start - 1 + SNIPPET_WINDOW < total, &terms)
            }
            // A book with no text of its own: matched on its title, and there
            // is nothing to quote. Not an error.
            _ => String::new(),
        };
        out.push(ResourceSearchResult {
            resource_id: hit.resource_id,
            title: hit.title,
            kind: hit.kind,
            // The snippet is written into the page as HTML, so a book with an
            // angle bracket in it must not arrive as markup.
            snippet: crate::db::queries::search::escape_snippet(&snippet),
        });
    }
    Ok(out)
}

fn map_passage_link(r: &rusqlite::Row) -> rusqlite::Result<ResourcePassageLink> {
    Ok(ResourcePassageLink {
        id: r.get(0)?,
        resource_id: r.get(1)?,
        book_id: r.get(2)?,
        chapter: r.get(3)?,
        verse_start: r.get(4)?,
        verse_end: r.get(5)?,
        location: r.get(6)?,
        label: r.get(7)?,
        created_at: r.get(8)?,
    })
}
const LINK_COLS: &str = "id, resource_id, book_id, chapter, verse_start, verse_end, location, label, created_at";

pub fn list_passage_links_for_chapter(conn: &Connection, book_id: i64, chapter: i64) -> anyhow::Result<Vec<ResourcePassageLink>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {LINK_COLS} FROM resource_passage_links WHERE book_id = ?1 AND chapter = ?2 ORDER BY created_at"
    ))?;
    let rows = stmt.query_map(params![book_id, chapter], map_passage_link)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn list_passage_links_for_resource(conn: &Connection, resource_id: i64) -> anyhow::Result<Vec<ResourcePassageLink>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {LINK_COLS} FROM resource_passage_links WHERE resource_id = ?1 ORDER BY created_at"
    ))?;
    let rows = stmt.query_map(params![resource_id], map_passage_link)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

#[allow(clippy::too_many_arguments)]
pub fn create_passage_link(
    conn: &Connection,
    resource_id: i64,
    book_id: i64,
    chapter: i64,
    verse_start: Option<i64>,
    verse_end: Option<i64>,
    location: Option<&str>,
    label: Option<&str>,
) -> anyhow::Result<ResourcePassageLink> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO resource_passage_links (resource_id, book_id, chapter, verse_start, verse_end, location, label, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        params![resource_id, book_id, chapter, verse_start, verse_end, location, label, now],
    )?;
    let id = conn.last_insert_rowid();
    Ok(conn.query_row(&format!("SELECT {LINK_COLS} FROM resource_passage_links WHERE id = ?1"), params![id], map_passage_link)?)
}

pub fn delete_passage_link(conn: &Connection, id: i64) -> anyhow::Result<()> {
    conn.execute("DELETE FROM resource_passage_links WHERE id = ?1", params![id])?;
    Ok(())
}

fn map_resource_link(r: &rusqlite::Row) -> rusqlite::Result<ResourceLink> {
    Ok(ResourceLink {
        id: r.get(0)?,
        from_resource_id: r.get(1)?,
        to_resource_id: r.get(2)?,
        from_location: r.get(3)?,
        label: r.get(4)?,
        created_at: r.get(5)?,
    })
}
const RLINK_COLS: &str = "id, from_resource_id, to_resource_id, from_location, label, created_at";

pub fn list_resource_links(conn: &Connection, resource_id: i64) -> anyhow::Result<Vec<ResourceLink>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {RLINK_COLS} FROM resource_links WHERE from_resource_id = ?1 ORDER BY created_at"
    ))?;
    let rows = stmt.query_map(params![resource_id], map_resource_link)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn create_resource_link(
    conn: &Connection,
    from_resource_id: i64,
    to_resource_id: i64,
    from_location: Option<&str>,
    label: Option<&str>,
) -> anyhow::Result<ResourceLink> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO resource_links (from_resource_id, to_resource_id, from_location, label, created_at) VALUES (?1,?2,?3,?4,?5)",
        params![from_resource_id, to_resource_id, from_location, label, now],
    )?;
    let id = conn.last_insert_rowid();
    Ok(conn.query_row(&format!("SELECT {RLINK_COLS} FROM resource_links WHERE id = ?1"), params![id], map_resource_link)?)
}

pub fn delete_resource_link(conn: &Connection, id: i64) -> anyhow::Result<()> {
    conn.execute("DELETE FROM resource_links WHERE id = ?1", params![id])?;
    Ok(())
}

// Topic tagging (justification, sanctification, the covenants, the
// Sabbath, the means of grace, ...), same shape as sermon_note_tags/
// note_tags, so a resource can be filtered/browsed by doctrine the way
// sermon notes already are.

pub fn add_tag(conn: &Connection, resource_id: i64, tag: String) -> anyhow::Result<()> {
    conn.execute("INSERT OR IGNORE INTO resource_tags (resource_id, tag) VALUES (?1, ?2)", params![resource_id, tag.trim()])?;
    Ok(())
}

pub fn remove_tag(conn: &Connection, resource_id: i64, tag: String) -> anyhow::Result<()> {
    conn.execute("DELETE FROM resource_tags WHERE resource_id = ?1 AND tag = ?2", params![resource_id, tag])?;
    Ok(())
}

pub fn list_tags(conn: &Connection, resource_id: i64) -> anyhow::Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT tag FROM resource_tags WHERE resource_id = ?1 ORDER BY tag")?;
    let rows = stmt.query_map(params![resource_id], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn list_all_tags(conn: &Connection) -> anyhow::Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT DISTINCT tag FROM resource_tags ORDER BY tag")?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn list_all_tags_by_resource(conn: &Connection) -> anyhow::Result<Vec<(i64, String)>> {
    let mut stmt = conn.prepare("SELECT resource_id, tag FROM resource_tags ORDER BY resource_id, tag")?;
    let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// Resources whose topic tags plausibly bear on a given doctrine topic --
/// the topic's own name (with its "Of "/"Of the " prefix stripped, same as
/// `suggest_for_passage`'s per-chapter keyword) matched against
/// `resource_tags` by substring. Used inside the Confession/Catechism view
/// so opening a topic surfaces related library material without a
/// separate topic-browsing page.
pub fn suggest_for_topic(conn: &Connection, topic_id: i64) -> anyhow::Result<Vec<Resource>> {
    let name: Option<String> =
        conn.query_row("SELECT name FROM doctrine_topics WHERE id = ?1", params![topic_id], |r| r.get(0)).optional()?;
    let Some(name) = name else { return Ok(vec![]) };
    let keyword = name.strip_prefix("Of the ").or_else(|| name.strip_prefix("Of ")).unwrap_or(&name);

    let cols_r = RESOURCE_COLS.split(", ").map(|c| format!("r.{c}")).collect::<Vec<_>>().join(", ");
    let mut stmt = conn.prepare(&format!(
        "SELECT DISTINCT {cols_r} FROM resources r JOIN resource_tags t ON t.resource_id = r.id
         WHERE t.tag LIKE '%' || ?1 || '%' ORDER BY r.title COLLATE NOCASE"
    ))?;
    let rows = stmt.query_map(params![keyword], map_resource)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// Resources whose topic tags plausibly bear on a passage: WCF chapters the
/// passage's proof texts cite (see `westminster::list_wcf_chapters_cited`)
/// mapped to their doctrine_topics keyword (e.g. WCF 11 -> "Justification"),
/// matched against `resource_tags` by substring -- a resource tagged
/// "justification by faith" still matches the "Justification" keyword. This
/// is a suggestion, not a citation: it surfaces resources that MIGHT bear on
/// the text, same spirit as the manual resource_passage_links a user sets
/// themselves, just automatic instead of hand-linked.
pub fn suggest_for_passage(conn: &Connection, book_id: i64, chapter: i64) -> anyhow::Result<Vec<Resource>> {
    let wcf_chapters = super::westminster::list_wcf_chapters_cited(conn, book_id, chapter)?;
    if wcf_chapters.is_empty() {
        return Ok(vec![]);
    }
    let placeholders = wcf_chapters.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let mut stmt = conn.prepare(&format!("SELECT name FROM doctrine_topics WHERE wcf_chapter IN ({placeholders})"))?;
    let topic_names: Vec<String> = stmt
        .query_map(rusqlite::params_from_iter(wcf_chapters.iter()), |r| r.get(0))?
        .collect::<Result<_, _>>()?;
    if topic_names.is_empty() {
        return Ok(vec![]);
    }

    let cols_r = RESOURCE_COLS.split(", ").map(|c| format!("r.{c}")).collect::<Vec<_>>().join(", ");
    let mut resources = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for name in &topic_names {
        let keyword = name.strip_prefix("Of the ").or_else(|| name.strip_prefix("Of ")).unwrap_or(name);
        let mut stmt = conn.prepare(&format!(
            "SELECT DISTINCT {cols_r} FROM resources r JOIN resource_tags t ON t.resource_id = r.id
             WHERE t.tag LIKE '%' || ?1 || '%' ORDER BY r.title COLLATE NOCASE"
        ))?;
        let rows = stmt.query_map(params![keyword], map_resource)?;
        for row in rows {
            let r = row?;
            if seen.insert(r.id) {
                resources.push(r);
            }
        }
    }
    Ok(resources)
}

pub fn list_by_tag(conn: &Connection, tag: &str) -> anyhow::Result<Vec<Resource>> {
    let cols_r = RESOURCE_COLS.split(", ").map(|c| format!("r.{c}")).collect::<Vec<_>>().join(", ");
    let mut stmt = conn.prepare(&format!(
        "SELECT {cols_r} FROM resources r JOIN resource_tags t ON t.resource_id = r.id
         WHERE t.tag = ?1 ORDER BY r.title COLLATE NOCASE"
    ))?;
    let rows = stmt.query_map(params![tag], map_resource)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    /// The match markers as brackets, so expectations stay readable.
    fn brackets(s: &str) -> String {
        s.replace(super::super::search::MARK_START, "[").replace(super::super::search::MARK_END, "]")
    }

    fn open_test(label: &str) -> (Connection, std::path::PathBuf) {
        let dir = std::env::temp_dir().join(format!("sojourner-resource-search-{label}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let content_db_path = dir.join("content.db");
        db::open_content_db(&content_db_path).unwrap();
        (db::open(&dir, &content_db_path).unwrap(), dir)
    }

    fn terms(words: &[&str]) -> Vec<String> {
        words.iter().map(|w| w.to_string()).collect()
    }

    #[test]
    fn a_quote_is_cut_back_to_whole_words_and_marked() {
        let window = "rtion of the heart that has once tasted the sweetness of Christ will not lon";
        let quoted = quote(window, true, true, &terms(&["sweetness"]));
        assert_eq!(brackets(&quoted), "…of the heart that has once tasted the [sweetness] of Christ will not…");
    }

    #[test]
    fn the_opening_of_a_book_is_not_given_a_leading_ellipsis() {
        let quoted = quote("Grace is the free favour of God", false, true, &terms(&["grace"]));
        assert_eq!(brackets(&quoted), "[Grace] is the free favour of…");
    }

    #[test]
    fn a_term_is_marked_as_a_whole_word_and_never_inside_one() {
        // A term of real length is searched, and marked, as a prefix.
        assert_eq!(brackets(&mark_terms("the husks of the world", &terms(&["husk"]))), "the [husks] of the world");
        assert_eq!(brackets(&mark_terms("the doctrine of justification", &terms(&["justif"]))), "the doctrine of [justification]");
        // ...but never in the middle of a word.
        assert_eq!(brackets(&mark_terms("another the", &terms(&["the"]))), "another [the]");
    }

    #[test]
    fn a_short_term_marks_only_itself_and_does_not_light_up_the_page() {
        // Searching "of the" used to mark "offended", "Therefore", "them"...
        let text = "Therefore the husks of the world offended them";
        assert_eq!(brackets(&mark_terms(text, &terms(&["the", "of"]))), "Therefore [the] husks [of] [the] world offended them");
    }

    #[test]
    fn marking_folds_case_and_leaves_the_book_s_own_spelling_alone() {
        assert_eq!(brackets(&mark_terms("GRACE and Grace", &terms(&["grace"]))), "[GRACE] and [Grace]");
    }

    #[test]
    fn marking_steps_over_letters_that_are_more_than_one_byte() {
        assert_eq!(brackets(&mark_terms("a Sünde word", &terms(&["word"]))), "a Sünde [word]");
    }

    #[test]
    fn a_dash_or_an_apostrophe_ends_the_word_that_is_marked() {
        assert_eq!(brackets(&mark_terms("the husks—while eating", &terms(&["husks"]))), "the [husks]—while eating");
        assert_eq!(brackets(&mark_terms("Saint Paul’s epistles", &terms(&["paul"]))), "Saint [Paul]’s epistles");
    }

    #[test]
    fn an_everyday_phrase_is_answered_from_the_book_s_text() {
        // The regression this guards: asking fts5 for snippet() in the same
        // statement as the ranking made a query of common words take minutes.
        let (conn, dir) = open_test("phrase");
        let body = format!(
            "{}The heart that has once tasted the sweetness of Christ will not long be content with the husks of the world.{}",
            "padding words to push the hit away from the opening. ".repeat(40),
            " And so the chapter ends.".repeat(40),
        );
        create(&conn, "epub", "A Test Book", Some("An Author"), "book.epub", Some(&body)).unwrap();

        let hits = search(&conn, "husks of the world", 10).unwrap();
        assert_eq!(hits.len(), 1, "the book is found");
        let snippet = &hits[0].snippet;
        assert!(brackets(&snippet).contains("[husks]"), "the searched word is marked: {snippet}");
        assert!(snippet.starts_with('…') && snippet.ends_with('…'), "cut from the middle of the book: {snippet}");
        assert!(snippet.contains("sweetness"), "with its surroundings: {snippet}");
        assert!(snippet.chars().count() < 260, "and no more than a passage: {snippet}");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_book_matched_only_by_its_title_still_comes_back() {
        let (conn, dir) = open_test("title");
        create(&conn, "pdf", "Institutes of the Christian Religion", None, "i.pdf", None).unwrap();
        let hits = search(&conn, "Institutes", 10).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].snippet, "", "nothing to quote, which is not an error");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_query_with_punctuation_still_finds_its_word_in_the_text() {
        let (conn, dir) = open_test("punct");
        let body = format!("{}Now grace, mercy and peace be with you.", "opening words. ".repeat(30));
        create(&conn, "epub", "Another Book", None, "b.epub", Some(&body)).unwrap();
        let hits = search(&conn, "grace,", 10).unwrap();
        assert_eq!(hits.len(), 1);
        assert!(brackets(&hits[0].snippet).contains("[grace]"), "got: {}", hits[0].snippet);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
