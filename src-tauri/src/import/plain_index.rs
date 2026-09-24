//! `verses_plain`: the Greek and Hebrew texts by their bare letters, for
//! searching them without accents or points (see CONTENT_MIGRATION_0023).

use rusqlite::{params, Connection};

pub fn build(conn: &mut Connection) -> anyhow::Result<usize> {
    let rows: Vec<(i64, String)> = conn
        .prepare("SELECT v.id, v.text FROM verses v JOIN translations t ON t.id = v.translation_id WHERE t.script <> 'latin'")?
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<Result<_, _>>()?;
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM verses_plain", [])?;
    {
        let mut insert = tx.prepare("INSERT INTO verses_plain (rowid, text) VALUES (?1, ?2)")?;
        for (id, text) in &rows {
            insert.execute(params![id, crate::plain::plain(text)])?;
        }
    }
    tx.commit()?;
    println!("plain index: {} Greek and Hebrew verses", rows.len());
    Ok(rows.len())
}
