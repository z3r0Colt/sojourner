// General key/value preferences that live in user.db so they survive a
// reinstall and travel with backups/exports -- as opposed to window and
// layout preferences, which stay in the frontend's local storage. Values
// are opaque strings; the frontend's `useSetting` stores JSON, and the few
// Rust-side readers (backup_sync_folder) store plain text.
use rusqlite::{params, Connection, OptionalExtension};

pub fn get(conn: &Connection, key: &str) -> anyhow::Result<Option<String>> {
    Ok(conn
        .query_row("SELECT value FROM settings WHERE key = ?1", params![key], |r| r.get(0))
        .optional()?)
}

pub fn set(conn: &Connection, key: &str, value: &str) -> anyhow::Result<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

pub fn delete(conn: &Connection, key: &str) -> anyhow::Result<()> {
    conn.execute("DELETE FROM settings WHERE key = ?1", params![key])?;
    Ok(())
}

/// Every setting whose key starts with `prefix`, as (key, value) pairs in
/// key order -- for per-resource families such as `resource_pos:<id>`.
pub fn list_with_prefix(conn: &Connection, prefix: &str) -> anyhow::Result<Vec<(String, String)>> {
    let mut stmt = conn.prepare("SELECT key, value FROM settings WHERE key LIKE ?1 ESCAPE '\\' ORDER BY key")?;
    let pattern = format!("{}%", prefix.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_"));
    let rows = stmt.query_map(params![pattern], |r| Ok((r.get(0)?, r.get(1)?)))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}
