pub mod atlas;
pub mod bookmarks;
pub mod catechism_memory;
pub mod commentary;
pub mod concordance;
pub mod crossrefs;
pub mod doctrine_topics;
pub mod factbook;
pub mod harmony;
pub mod highlights;
pub mod illustrations;
pub mod lexicons;
pub mod notes;
pub mod prayer_journal;
pub mod prayer_list;
pub mod reading_log;
pub mod reading_position;
pub mod psalter;
pub mod query_lang;
pub mod reading_plans;
pub mod red_letter;
pub mod reference;
pub mod resources;
pub mod scripture_memory;
pub mod search;
pub mod sermons;
pub mod settings;
pub mod stats;
pub mod trash;
pub mod verses;
pub mod versification;
pub mod westminster;
pub mod word_study;

/// The soft-delete filter every list, search, and count over `notes`,
/// `chapter_notes`, `prayer_entries`, `sermons`, or `illustrations` must
/// include (see USER_MIGRATION_0011 and 0015). Prefix with a table alias in
/// joins: `format!("n.{NOT_DELETED}")`.
pub const NOT_DELETED: &str = "deleted_at IS NULL";
