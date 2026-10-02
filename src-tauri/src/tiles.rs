//! Map tiles from the installed map packs, served to the Atlas.
//!
//! The `sjtiles` URI scheme answers `<scheme>://localhost/<pack id>/<z>/<x>/<y>`
//! (on Windows, `http://sjtiles.localhost/...`) with the tile from that
//! pack's `tiles.db`, or 404 where the pack has none -- which the map takes
//! as "nothing here" and draws around. Nothing is fetched from anywhere: the
//! tiles are a file the reader installed (see [`crate::pack`]).
//!
//! One read-only connection per pack, kept open; [`TileStore::forget`] closes
//! it before the pack's files are replaced or removed (Windows will not
//! rename a file SQLite holds open).

use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Default)]
pub struct TileStore {
    open: Mutex<HashMap<String, Connection>>,
}

impl TileStore {
    /// The tile at z/x/y (XYZ, rows counted from the top), and its format.
    pub fn tile(&self, maps_dir: &PathBuf, pack: &str, z: u32, x: u32, y: u32) -> anyhow::Result<Option<(Vec<u8>, String)>> {
        let mut open = self.open.lock().map_err(|_| anyhow::anyhow!("tile store poisoned"))?;
        if !open.contains_key(pack) {
            let dir = crate::paths::safe_child(maps_dir, pack).ok_or_else(|| anyhow::anyhow!("bad pack id"))?;
            let db = dir.join(crate::pack::TILES_DB);
            if !db.is_file() {
                return Ok(None);
            }
            let conn = Connection::open_with_flags(&db, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX)?;
            open.insert(pack.to_string(), conn);
        }
        let conn = &open[pack];
        let data: Option<Vec<u8>> = conn
            .query_row("SELECT data FROM tiles WHERE z = ?1 AND x = ?2 AND y = ?3", params![z, x, y], |r| r.get(0))
            .optional()?;
        let format: String = conn
            .query_row("SELECT value FROM metadata WHERE name = 'format'", [], |r| r.get(0))
            .optional()?
            .unwrap_or_else(|| "png".into());
        Ok(data.map(|d| (d, format)))
    }

    /// Closes a pack's connection, before its files change.
    pub fn forget(&self, pack: &str) {
        if let Ok(mut open) = self.open.lock() {
            open.remove(pack);
        }
    }
}

/// "terrain/9/302/208.png" or "terrain/9/302/208" -> ("terrain", 9, 302, 208).
pub fn parse_path(path: &str) -> Option<(String, u32, u32, u32)> {
    let mut parts = path.trim_start_matches('/').split('/');
    let pack = parts.next()?.to_string();
    let z = parts.next()?.parse().ok()?;
    let x = parts.next()?.parse().ok()?;
    let y = parts.next()?.split('.').next()?.parse().ok()?;
    if parts.next().is_some() || pack.is_empty() {
        return None;
    }
    Some((pack, z, x, y))
}

pub fn content_type(format: &str) -> &'static str {
    match format {
        "webp" => "image/webp",
        "jpg" | "jpeg" => "image/jpeg",
        _ => "image/png",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_tile_path() {
        assert_eq!(parse_path("/terrain/9/302/208.png"), Some(("terrain".into(), 9, 302, 208)));
        assert_eq!(parse_path("imagery/3/4/2"), Some(("imagery".into(), 3, 4, 2)));
        assert_eq!(parse_path("/terrain/9/302"), None);
        assert_eq!(parse_path("/terrain/9/302/208/1"), None);
        assert_eq!(parse_path("/../9/1/1"), Some(("..".into(), 9, 1, 1)));
    }

    #[test]
    fn serves_tiles_from_a_pack() {
        let dir = std::env::temp_dir().join(format!("sjtiles-test-{}", std::process::id()));
        let pack = dir.join("terrain");
        std::fs::create_dir_all(&pack).unwrap();
        let conn = Connection::open(pack.join(crate::pack::TILES_DB)).unwrap();
        conn.execute_batch(
            "CREATE TABLE tiles (z INTEGER, x INTEGER, y INTEGER, data BLOB, PRIMARY KEY (z, x, y));
             CREATE TABLE metadata (name TEXT PRIMARY KEY, value TEXT);
             INSERT INTO metadata VALUES ('format', 'webp');
             INSERT INTO tiles VALUES (1, 0, 1, x'0102');",
        )
        .unwrap();
        drop(conn);
        let store = TileStore::default();
        assert_eq!(store.tile(&dir, "terrain", 1, 0, 1).unwrap(), Some((vec![1, 2], "webp".into())));
        assert_eq!(store.tile(&dir, "terrain", 1, 1, 1).unwrap(), None);
        assert_eq!(store.tile(&dir, "imagery", 1, 0, 1).unwrap(), None);
        // A pack id cannot reach outside the maps folder.
        assert!(store.tile(&dir, "..", 1, 0, 1).is_err());
        store.forget("terrain");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
