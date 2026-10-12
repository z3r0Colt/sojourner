// The sermon idea inbox (USER_MIGRATION_0022): a line caught while reading,
// praying, or driving, kept until it finds its sermon. Filing an idea is
// only a pointer to the sermon it went into; the words themselves are copied
// into that manuscript, so editing one never changes the other.
//
// A small list the reader works down, so deleting is final rather than a
// trip to the Trash.
use super::NOT_DELETED;
use crate::models::{SermonIdea, SermonIdeaInput};
use rusqlite::{params, Connection, OptionalExtension};

/// The idea's sermon is only reported while that sermon is live: one in the
/// Trash leaves the idea back in the inbox, and restoring it files it again.
fn select_sql() -> String {
    format!(
        "SELECT i.id, i.body, i.book_id, i.chapter, i.verse_start, i.verse_end, i.source_label,
                s.id, s.title, CASE WHEN s.id IS NULL THEN NULL ELSE i.filed_at END, i.created_at, i.updated_at
         FROM sermon_ideas i
         LEFT JOIN sermons s ON s.id = i.sermon_id AND s.{NOT_DELETED}"
    )
}

fn map_row(r: &rusqlite::Row) -> rusqlite::Result<SermonIdea> {
    Ok(SermonIdea {
        id: r.get(0)?,
        body: r.get(1)?,
        book_id: r.get(2)?,
        chapter: r.get(3)?,
        verse_start: r.get(4)?,
        verse_end: r.get(5)?,
        source_label: r.get(6)?,
        sermon_id: r.get(7)?,
        sermon_title: r.get(8)?,
        filed_at: r.get(9)?,
        created_at: r.get(10)?,
        updated_at: r.get(11)?,
    })
}

/// Every idea, newest first; the inbox is the ones with no `sermon_id`.
pub fn list(conn: &Connection) -> anyhow::Result<Vec<SermonIdea>> {
    let mut stmt = conn.prepare(&format!("{} ORDER BY i.created_at DESC, i.id DESC", select_sql()))?;
    let rows = stmt.query_map([], map_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn get(conn: &Connection, id: i64) -> anyhow::Result<Option<SermonIdea>> {
    Ok(conn.query_row(&format!("{} WHERE i.id = ?1", select_sql()), params![id], map_row).optional()?)
}

/// A reference is kept only when it is whole enough to open: a book and a
/// chapter at least. Verses are a start with an end at or after it, or none
/// at all (the whole chapter) -- never an end alone, which one reader would
/// take for the chapter and another for verses 1 to that end.
fn reference(input: &SermonIdeaInput) -> (Option<i64>, Option<i64>, Option<i64>, Option<i64>) {
    match (input.book_id, input.chapter) {
        (Some(book), Some(chapter)) => {
            let (start, end) = match (input.verse_start, input.verse_end) {
                (Some(start), end) => (Some(start), Some(end.unwrap_or(start).max(start))),
                (None, _) => (None, None),
            };
            (Some(book), Some(chapter), start, end)
        }
        _ => (None, None, None, None),
    }
}

pub fn create(conn: &Connection, input: &SermonIdeaInput) -> anyhow::Result<SermonIdea> {
    let body = input.body.trim();
    anyhow::ensure!(!body.is_empty(), "an idea needs some words");
    let now = chrono::Utc::now().to_rfc3339();
    let (book, chapter, start, end) = reference(input);
    conn.execute(
        "INSERT INTO sermon_ideas (body, book_id, chapter, verse_start, verse_end, source_label, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?7)",
        params![body, book, chapter, start, end, input.source_label, now],
    )?;
    let id = conn.last_insert_rowid();
    Ok(get(conn, id)?.expect("the idea just inserted"))
}

pub fn update(conn: &Connection, id: i64, input: &SermonIdeaInput) -> anyhow::Result<SermonIdea> {
    let body = input.body.trim();
    anyhow::ensure!(!body.is_empty(), "an idea needs some words");
    let now = chrono::Utc::now().to_rfc3339();
    let (book, chapter, start, end) = reference(input);
    conn.execute(
        "UPDATE sermon_ideas SET body = ?2, book_id = ?3, chapter = ?4, verse_start = ?5, verse_end = ?6,
           source_label = ?7, updated_at = ?8
         WHERE id = ?1",
        params![id, body, book, chapter, start, end, input.source_label, now],
    )?;
    get(conn, id)?.ok_or_else(|| anyhow::anyhow!("idea {id} not found"))
}

/// Files the idea into a sermon, or with `None` puts it back in the inbox.
pub fn file(conn: &Connection, id: i64, sermon_id: Option<i64>) -> anyhow::Result<SermonIdea> {
    let filed_at = sermon_id.map(|_| chrono::Utc::now().to_rfc3339());
    conn.execute(
        "UPDATE sermon_ideas SET sermon_id = ?2, filed_at = ?3 WHERE id = ?1",
        params![id, sermon_id, filed_at],
    )?;
    get(conn, id)?.ok_or_else(|| anyhow::anyhow!("idea {id} not found"))
}

pub fn delete(conn: &Connection, id: i64) -> anyhow::Result<()> {
    conn.execute("DELETE FROM sermon_ideas WHERE id = ?1", params![id])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::queries::sermons;
    use crate::db::{open, open_content_db};
    use crate::models::SermonInput;

    /// An idea is filed into a sermon, goes back to the inbox while that
    /// sermon is in the Trash, and comes back filed when it is restored; a
    /// half reference is dropped rather than stored.
    #[test]
    fn ideas_file_into_live_sermons_only() {
        let dir = std::env::temp_dir().join(format!("sojourner-ideas-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let content_db_path = dir.join("content.db");
        open_content_db(&content_db_path).unwrap();
        let conn = open(&dir, &content_db_path).unwrap();

        assert!(create(&conn, &SermonIdeaInput { body: "   ".into(), ..Default::default() }).is_err());

        let idea = create(
            &conn,
            &SermonIdeaInput {
                body: " Grace precedes the command ".into(),
                book_id: Some(2),
                chapter: Some(20),
                verse_start: Some(2),
                verse_end: Some(1),
                source_label: None,
            },
        )
        .unwrap();
        assert_eq!(idea.body, "Grace precedes the command");
        assert_eq!((idea.verse_start, idea.verse_end), (Some(2), Some(2)), "an end before the start is the start");
        assert!(idea.sermon_id.is_none());

        let end_only = update(
            &conn,
            idea.id,
            &SermonIdeaInput { body: "Grace first".into(), book_id: Some(2), chapter: Some(20), verse_end: Some(5), ..Default::default() },
        )
        .unwrap();
        assert_eq!((end_only.verse_start, end_only.verse_end), (None, None), "an end with no start is the whole chapter");

        let half = update(&conn, idea.id, &SermonIdeaInput { body: "Grace first".into(), book_id: Some(2), ..Default::default() }).unwrap();
        assert_eq!((half.book_id, half.chapter, half.verse_start), (None, None, None), "a book with no chapter is no reference");

        let sermon = sermons::create(&conn, &SermonInput { title: Some("The Ten Words".into()), ..Default::default() }).unwrap();
        let filed = file(&conn, idea.id, Some(sermon.id)).unwrap();
        assert_eq!(filed.sermon_id, Some(sermon.id));
        assert_eq!(filed.sermon_title.as_deref(), Some("The Ten Words"));
        assert!(filed.filed_at.is_some());

        sermons::delete(&conn, sermon.id).unwrap();
        let back = get(&conn, idea.id).unwrap().unwrap();
        assert!(back.sermon_id.is_none() && back.filed_at.is_none(), "a trashed sermon lets its ideas go");

        conn.execute("UPDATE sermons SET deleted_at = NULL WHERE id = ?1", params![sermon.id]).unwrap();
        assert_eq!(get(&conn, idea.id).unwrap().unwrap().sermon_id, Some(sermon.id), "restoring files it again");

        assert_eq!(file(&conn, idea.id, None).unwrap().sermon_id, None);
        delete(&conn, idea.id).unwrap();
        assert!(list(&conn).unwrap().is_empty());

        drop(conn);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
