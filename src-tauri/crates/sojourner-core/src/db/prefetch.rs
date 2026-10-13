//! Says which rows a query is about to read, before it reads them.
//!
//! On the desktop this does nothing: no hook is installed, and no query is
//! run. In the browser (the `sojourner-web` crate) content.db is read over
//! HTTP a page at a time, and a search that reads its page of results row by
//! row waits for one request per row in turn. There the hook finds the page
//! each row is on and, if some aren't at hand yet, fails the command so the
//! worker can fetch them all at once and run it again.
//!
//! Only read-only queries call it: a command it stops is simply run again.

use rusqlite::Connection;
use std::sync::OnceLock;

/// `(conn, table, rowids)`: the rows of `table` (in content.db) about to be read.
pub type Hook = fn(&Connection, &str, &[i64]) -> anyhow::Result<()>;

static HOOK: OnceLock<Hook> = OnceLock::new();

pub fn install(hook: Hook) {
    let _ = HOOK.set(hook);
}

/// The rows `ids` of `table` are about to be read.
pub fn rows(conn: &Connection, table: &str, ids: &[i64]) -> anyhow::Result<()> {
    match HOOK.get() {
        Some(hook) if !ids.is_empty() => hook(conn, table, ids),
        _ => Ok(()),
    }
}

/// The rows of `table` whose ids `sql` selects (one column) are about to
/// be read. `sql` is run only when a hook is installed.
pub fn rows_from(conn: &Connection, table: &str, sql: &str) -> anyhow::Result<()> {
    if HOOK.get().is_none() {
        return Ok(());
    }
    let ids: Vec<i64> = conn.prepare(sql)?.query_map([], |r| r.get(0))?.collect::<Result<_, _>>()?;
    rows(conn, table, &ids)
}

/// The best `limit` matches of `fts` in the external-content index
/// `fts_table` are about to be read from `table`. The ranking query is run
/// only when a hook is installed.
pub fn ranked(conn: &Connection, fts_table: &str, table: &str, fts: &str, limit: i64) -> anyhow::Result<()> {
    if HOOK.get().is_none() || fts.is_empty() {
        return Ok(());
    }
    let sql = format!("SELECT rowid FROM {fts_table} WHERE {fts_table} MATCH ?1 ORDER BY bm25({fts_table}), rowid LIMIT ?2");
    let ids: Vec<i64> = conn.prepare(&sql)?.query_map(rusqlite::params![fts, limit], |r| r.get(0))?.collect::<Result<_, _>>()?;
    rows(conn, table, &ids)
}
