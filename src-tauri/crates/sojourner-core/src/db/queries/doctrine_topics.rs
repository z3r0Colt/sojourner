use crate::models::DoctrineTopic;
use rusqlite::{params, Connection};

const SELECT: &str = "SELECT dt.id, dt.name, dt.category, dt.westminster_section_id, wd.code, ws.heading
     FROM doctrine_topics dt
     JOIN westminster_sections ws ON ws.id = dt.westminster_section_id
     JOIN westminster_documents wd ON wd.id = ws.document_id";

fn map_row(r: &rusqlite::Row) -> rusqlite::Result<DoctrineTopic> {
    Ok(DoctrineTopic {
        id: r.get(0)?,
        name: r.get(1)?,
        category: r.get(2)?,
        westminster_section_id: r.get(3)?,
        document_code: r.get(4)?,
        heading: r.get(5)?,
    })
}

pub fn list_all(conn: &Connection) -> anyhow::Result<Vec<DoctrineTopic>> {
    let mut stmt = conn.prepare(&format!("{SELECT} ORDER BY dt.sort_order"))?;
    let rows = stmt.query_map([], map_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn get(conn: &Connection, id: i64) -> anyhow::Result<Option<DoctrineTopic>> {
    use rusqlite::OptionalExtension;
    Ok(conn.query_row(&format!("{SELECT} WHERE dt.id = ?1"), params![id], map_row).optional()?)
}
