// The illustrations library (USER_MIGRATION_0015): stories and quotations
// kept apart from any one sermon, because a good illustration outlives the
// sermon it was first used in and the preacher needs to know where it has
// already been. `source_ref` is the same reopenable identity a sermon
// source carries, so an illustration captured from a book can open that
// page again.
use super::NOT_DELETED;
use crate::models::{Illustration, IllustrationFilter, IllustrationInput, IllustrationUse};
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashMap;

pub(super) const SELECT_COLS: &str =
    "id, title, body, source_label, source_ref, kind, created_at, updated_at, deleted_at";

pub(super) fn map_row(r: &rusqlite::Row) -> rusqlite::Result<Illustration> {
    Ok(Illustration {
        id: r.get(0)?,
        title: r.get(1)?,
        body: r.get(2)?,
        source_label: r.get(3)?,
        source_ref: r.get(4)?,
        kind: r.get(5)?,
        created_at: r.get(6)?,
        updated_at: r.get(7)?,
        deleted_at: r.get(8)?,
        tags: Vec::new(),
        use_count: 0,
        last_used_at: None,
    })
}

/// Fills tags and use counts for a whole listing in two queries.
fn hydrate(conn: &Connection, list: &mut [Illustration]) -> anyhow::Result<()> {
    if list.is_empty() {
        return Ok(());
    }
    let index: HashMap<i64, usize> = list.iter().enumerate().map(|(i, s)| (s.id, i)).collect();
    let ids: Vec<String> = list.iter().map(|s| s.id.to_string()).collect();
    let in_list = ids.join(",");

    let mut stmt = conn.prepare(&format!(
        "SELECT illustration_id, tag FROM illustration_tags WHERE illustration_id IN ({in_list}) ORDER BY illustration_id, tag"
    ))?;
    for row in stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))? {
        let (id, tag) = row?;
        if let Some(&i) = index.get(&id) {
            list[i].tags.push(tag);
        }
    }

    let mut stmt = conn.prepare(&format!(
        "SELECT u.illustration_id, COUNT(*), MAX(u.used_at)
         FROM illustration_uses u JOIN sermons s ON s.id = u.sermon_id
         WHERE u.illustration_id IN ({in_list}) AND s.{NOT_DELETED}
         GROUP BY u.illustration_id"
    ))?;
    for row in stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?, r.get::<_, Option<String>>(2)?)))? {
        let (id, count, last) = row?;
        if let Some(&i) = index.get(&id) {
            list[i].use_count = count;
            list[i].last_used_at = last;
        }
    }
    Ok(())
}

fn fts_query(raw: &str) -> String {
    raw.split_whitespace()
        .map(|w| format!("\"{}\"*", w.replace('"', "")))
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn list(conn: &Connection, filter: &IllustrationFilter) -> anyhow::Result<Vec<Illustration>> {
    let mut wheres = vec![format!("i.{NOT_DELETED}")];
    let mut args: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(kind) = &filter.kind {
        wheres.push(format!("i.kind = ?{}", args.len() + 1));
        args.push(Box::new(kind.clone()));
    }
    if let Some(tag) = &filter.tag {
        wheres.push(format!(
            "EXISTS (SELECT 1 FROM illustration_tags t WHERE t.illustration_id = i.id AND t.tag = ?{})",
            args.len() + 1
        ));
        args.push(Box::new(tag.clone()));
    }
    if let Some(query) = filter.query.as_deref().map(str::trim).filter(|q| !q.is_empty()) {
        wheres.push(format!(
            "i.id IN (SELECT rowid FROM illustrations_fts WHERE illustrations_fts MATCH ?{})",
            args.len() + 1
        ));
        args.push(Box::new(fts_query(query)));
    }

    let order = match filter.sort.as_deref() {
        Some("most_used") => {
            "(SELECT COUNT(*) FROM illustration_uses u WHERE u.illustration_id = i.id) DESC, i.updated_at DESC"
        }
        _ => "i.updated_at DESC",
    };
    let sql = format!(
        "SELECT {SELECT_COLS} FROM illustrations i WHERE {} ORDER BY {order}",
        wheres.join(" AND ")
    );
    let mut stmt = conn.prepare(&sql)?;
    let refs: Vec<&dyn rusqlite::ToSql> = args.iter().map(|a| a.as_ref()).collect();
    let mut list: Vec<Illustration> = stmt
        .query_map(refs.as_slice(), |r| map_row(r))?
        .collect::<Result<Vec<_>, _>>()?;
    hydrate(conn, &mut list)?;
    Ok(list)
}

pub fn get(conn: &Connection, id: i64) -> anyhow::Result<Option<Illustration>> {
    let row = conn
        .query_row(&format!("SELECT {SELECT_COLS} FROM illustrations WHERE id = ?1"), params![id], map_row)
        .optional()?;
    let Some(row) = row else { return Ok(None) };
    let mut one = [row];
    hydrate(conn, &mut one)?;
    let [row] = one;
    Ok(Some(row))
}

pub fn create(conn: &Connection, input: &IllustrationInput) -> anyhow::Result<Illustration> {
    let now = chrono::Utc::now().to_rfc3339();
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "INSERT INTO illustrations (title, body, source_label, source_ref, kind, created_at, updated_at)
         VALUES (?1,?2,?3,?4,COALESCE(?5,'illustration'),?6,?6)",
        params![
            input.title.clone().unwrap_or_else(|| "Untitled".into()),
            input.body.clone().unwrap_or_default(),
            input.source_label,
            input.source_ref,
            input.kind,
            now
        ],
    )?;
    let id = tx.last_insert_rowid();
    if let Some(tags) = &input.tags {
        set_tags(&tx, id, tags)?;
    }
    tx.commit()?;
    Ok(get(conn, id)?.expect("the illustration just inserted"))
}

pub fn update(conn: &Connection, id: i64, input: &IllustrationInput) -> anyhow::Result<Illustration> {
    let now = chrono::Utc::now().to_rfc3339();
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "UPDATE illustrations SET title = COALESCE(?2, title), body = COALESCE(?3, body),
           source_label = ?4, source_ref = ?5, kind = COALESCE(?6, kind), updated_at = ?7
         WHERE id = ?1",
        params![id, input.title, input.body, input.source_label, input.source_ref, input.kind, now],
    )?;
    if let Some(tags) = &input.tags {
        set_tags(&tx, id, tags)?;
    }
    tx.commit()?;
    Ok(get(conn, id)?.ok_or_else(|| anyhow::anyhow!("illustration {id} not found"))?)
}

pub fn set_tags(conn: &Connection, id: i64, tags: &[String]) -> anyhow::Result<()> {
    conn.execute("DELETE FROM illustration_tags WHERE illustration_id = ?1", params![id])?;
    let mut stmt = conn.prepare("INSERT OR IGNORE INTO illustration_tags (illustration_id, tag) VALUES (?1, ?2)")?;
    for tag in tags {
        let tag = tag.trim();
        if !tag.is_empty() {
            stmt.execute(params![id, tag])?;
        }
    }
    Ok(())
}

/// Soft delete -- the illustration moves to the Trash.
pub fn delete(conn: &Connection, id: i64) -> anyhow::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE illustrations SET deleted_at = ?1 WHERE id = ?2 AND deleted_at IS NULL",
        params![now, id],
    )?;
    Ok(())
}

pub fn list_all_tags(conn: &Connection) -> anyhow::Result<Vec<String>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT DISTINCT t.tag FROM illustration_tags t JOIN illustrations i ON i.id = t.illustration_id
         WHERE i.{NOT_DELETED} ORDER BY t.tag"
    ))?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// Records that a sermon used an illustration. Inserting the same pair twice
/// only refreshes the date -- an illustration used twice in one manuscript
/// is still one use of it in that sermon.
pub fn record_use(conn: &Connection, illustration_id: i64, sermon_id: i64) -> anyhow::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO illustration_uses (illustration_id, sermon_id, used_at) VALUES (?1,?2,?3)
         ON CONFLICT(illustration_id, sermon_id) DO UPDATE SET used_at = ?3",
        params![illustration_id, sermon_id, now],
    )?;
    Ok(())
}

/// Where an illustration has gone -- with each sermon's series, so the
/// picker can warn that a story has already been told in this series.
pub fn list_uses(conn: &Connection, illustration_id: Option<i64>) -> anyhow::Result<Vec<IllustrationUse>> {
    let mut sql = format!(
        "SELECT u.illustration_id, u.sermon_id, s.title, s.series_id, s.preach_date, u.used_at
         FROM illustration_uses u JOIN sermons s ON s.id = u.sermon_id
         WHERE s.{NOT_DELETED}"
    );
    if illustration_id.is_some() {
        sql.push_str(" AND u.illustration_id = ?1");
    }
    sql.push_str(" ORDER BY u.used_at DESC");
    let mut stmt = conn.prepare(&sql)?;
    let map = |r: &rusqlite::Row| {
        Ok(IllustrationUse {
            illustration_id: r.get(0)?,
            sermon_id: r.get(1)?,
            sermon_title: r.get(2)?,
            series_id: r.get(3)?,
            preach_date: r.get(4)?,
            used_at: r.get(5)?,
        })
    };
    let rows = match illustration_id {
        Some(id) => stmt.query_map(params![id], map)?.collect::<Result<Vec<_>, _>>()?,
        None => stmt.query_map([], map)?.collect::<Result<Vec<_>, _>>()?,
    };
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::queries::sermons;
    use crate::db::{open, open_content_db};
    use crate::models::SermonInput;

    /// The library hides a deleted illustration everywhere, counts uses only
    /// from live sermons, and finds one by a word in its body.
    #[test]
    fn library_hides_deleted_and_counts_live_uses() {
        let dir = std::env::temp_dir().join(format!("sojourner-illustrations-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let content_db_path = dir.join("content.db");
        open_content_db(&content_db_path).unwrap();
        let conn = open(&dir, &content_db_path).unwrap();

        let illus = create(
            &conn,
            &IllustrationInput {
                title: Some("The lighthouse keeper".into()),
                body: Some("A keeper who burned the oil for his neighbours".into()),
                source_label: Some("Spurgeon, Lectures".into()),
                source_ref: Some("resource:3:120".into()),
                tags: Some(vec!["providence".into()]),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(illus.tags, vec!["providence".to_string()]);
        assert_eq!(list(&conn, &IllustrationFilter { query: Some("neighbours".into()), ..Default::default() }).unwrap().len(), 1);

        let sermon = sermons::create(&conn, &SermonInput { title: Some("Providence".into()), ..Default::default() }).unwrap();
        record_use(&conn, illus.id, sermon.id).unwrap();
        record_use(&conn, illus.id, sermon.id).unwrap();
        assert_eq!(get(&conn, illus.id).unwrap().unwrap().use_count, 1, "one use per sermon");
        assert_eq!(list_uses(&conn, Some(illus.id)).unwrap().len(), 1);

        // A sermon in the Trash stops counting as a use.
        sermons::delete(&conn, sermon.id).unwrap();
        assert_eq!(get(&conn, illus.id).unwrap().unwrap().use_count, 0);

        delete(&conn, illus.id).unwrap();
        assert!(list(&conn, &IllustrationFilter::default()).unwrap().is_empty());
        assert!(list_all_tags(&conn).unwrap().is_empty());
        assert!(get(&conn, illus.id).unwrap().is_some(), "still reachable by id for the Trash");

        drop(conn);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
