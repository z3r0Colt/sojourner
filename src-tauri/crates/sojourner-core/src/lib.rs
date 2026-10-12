//! Everything in Sojourner that does not need a window: the SQLite schema and
//! migrations, the queries, the models, and the pure text helpers. The
//! desktop app (`tauri-app`) depends on this crate, and so will the web build.

pub mod citations;
pub mod color_text;
pub mod db;
pub mod error;
pub mod import;
pub mod library;
pub mod models;
pub mod morph;
pub mod paths;
pub mod plain;
pub mod refparse;
pub mod text;
